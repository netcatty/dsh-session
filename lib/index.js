// dsh-session host: filesystem session list plus trash/restore/purge routes.

import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { patchAnnotation, readAnnotations, setAnnotationsPath } from './annotations.js';
import { descendantIds, emptySessions, listSessions, listTrash, purgeSession, restoreSession, trashSession } from './store.js';
import { VERSION } from './version.js';

export const name = 'session-hub';

export function apply(ctx, config = {}) {
  const dataDir = config.dataDir ?? join(homedir(), '.dsh', 'session-hub');
  const root = config.root ?? join(homedir(), '.dsh', 'sessions');
  const legacyTrash = join(homedir(), '.dsh', 'session-trash');
  const trashRoot = config.trashRoot ?? join(dataDir, 'trash');
  const annotationsPath = config.annotationsPath ?? join(dataDir, 'annotations.json');
  setAnnotationsPath(annotationsPath);
  if (!existsSync(trashRoot) && existsSync(legacyTrash)) {
    try {
      mkdirSync(dataDir, { recursive: true });
      renameSync(legacyTrash, trashRoot);
    } catch {
      // keep the legacy path if migration is not possible
    }
  }
  const paths = { root, trashRoot };

  const dropArchived = (ids) => {
    const registry = ctx.get?.('workspaceRegistry');
    if (registry?.unarchiveSession === undefined) return;
    for (const id of ids) {
      try { registry.unarchiveSession(id); } catch { /* already gone or not archived */ }
    }
  };

  const sameOrigin = (req) => {
    const host = String(req.headers.host ?? '').split(':')[0];
    const remote = req.socket?.remoteAddress ?? '';
    if (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1') return true;
    try {
      return new URL(String(req.headers.origin ?? '')).hostname === host;
    } catch {
      return false;
    }
  };

  ctx.inject(['webServer'], (scope) => {
    const webServer = scope.webServer;
    if (webServer?.register === undefined) return;
    const json = (res, status, body) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    const readBody = async (req) => {
      let body = '';
      for await (const chunk of req) body += String(chunk);
      return body === '' ? {} : JSON.parse(body);
    };
    const route = (path, handler) => scope.effect(() => webServer.register({
      kind: 'exact',
      path,
      handler: async (req, res) => {
        if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
        try {
          const body = req.method === 'GET' ? {} : await readBody(req);
          json(res, 200, await handler(body, req));
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    }), `dsh-session: ${path}`);

    route('/api/session-hub/list', async () => {
      const registry = ctx.get?.('workspaceRegistry');
      const archived = new Set(registry?.archivedSessionIds ?? []);
      return { sessions: listSessions(paths).map((item) => ({ ...item, archived: archived.has(item.id) })) };
    });
    route('/api/session-hub/trash', async () => ({ entries: listTrash(paths) }));
    route('/api/session-hub/annotations', async (body) => {
      if (body.id === undefined) return { annotations: readAnnotations() };
      if (typeof body.id !== 'string' || typeof body.patch !== 'object' || body.patch === null) throw new Error('id and patch are required');
      const allowed = {};
      for (const key of ['favorite', 'reviewLater', 'tags', 'note']) {
        if (body.patch[key] !== undefined) allowed[key] = body.patch[key];
      }
      return { annotation: patchAnnotation(body.id, allowed) };
    });
    route('/api/session-hub/move-to-trash', async (body) => {
      if (typeof body.id !== 'string') throw new Error('id is required');
      const agents = ctx.get?.('agents');
      const target = listSessions(paths).find((item) => item.id === body.id);
      if (target?.parentSession !== undefined) throw new Error('子会话不能单独删除，请删除主会话');
      if (agents?.get?.(body.id) !== undefined) throw new Error('会话仍在运行或已加载，先关闭它再删除');
      if (body.includeChildren === true) {
        for (const childId of descendantIds(body.id, paths)) {
          if (agents?.get?.(childId) !== undefined) throw new Error(`子会话 ${childId} 仍在运行`);
        }
      }
      const result = trashSession(body.id, paths, { includeChildren: body.includeChildren === true });
      dropArchived(result.moved ?? [result.id]);
      return result;
    });
    route('/api/session-hub/cleanup-empty', async () => {
      const agents = ctx.get?.('agents');
      const moved = [];
      for (const item of emptySessions(paths)) {
        if (item.parentSession !== undefined) continue;
        if (agents?.get?.(item.id) !== undefined) continue;
        try {
          const result = trashSession(item.id, paths);
          dropArchived(result.moved ?? [item.id]);
          moved.push(item.id);
        } catch {
          // skip entries that vanished or are already trashed
        }
      }
      return { moved };
    });
    route('/api/session-hub/empty-trash', async () => {
      const entries = listTrash(paths);
      for (const entry of entries) purgeSession(entry.id, paths);
      return { purged: entries.length };
    });
    route('/api/session-hub/batch-trash', async (body) => {
      if (!Array.isArray(body.ids)) throw new Error('ids must be an array');
      const agents = ctx.get?.('agents');
      const moved = [];
      const skipped = [];
      const byId = new Map(listSessions(paths).map((item) => [item.id, item]));
      for (const id of body.ids) {
        if (typeof id !== 'string') continue;
        if (byId.get(id)?.parentSession !== undefined) { skipped.push({ id, reason: 'subagent' }); continue; }
        if (agents?.get?.(id) !== undefined) { skipped.push({ id, reason: 'running' }); continue; }
        try {
          const liveChild = descendantIds(id, paths).find((child) => agents?.get?.(child) !== undefined);
          if (liveChild !== undefined) { skipped.push({ id, reason: `child ${liveChild} is running` }); continue; }
          const result = trashSession(id, paths, { includeChildren: true });
          dropArchived(result.moved ?? [id]);
          moved.push(id);
        } catch (error) {
          skipped.push({ id, reason: error instanceof Error ? error.message : String(error) });
        }
      }
      return { moved, skipped };
    });
    route('/api/session-hub/batch-restore', async (body) => {
      if (!Array.isArray(body.ids)) throw new Error('ids must be an array');
      const restored = [];
      const skipped = [];
      for (const id of body.ids) {
        try { restored.push(restoreSession(id, paths)); }
        catch (error) { skipped.push({ id, reason: error instanceof Error ? error.message : String(error) }); }
      }
      return { restored, skipped };
    });
    route('/api/session-hub/batch-purge', async (body) => {
      if (!Array.isArray(body.ids)) throw new Error('ids must be an array');
      const purged = [];
      for (const id of body.ids) {
        try { purgeSession(id, paths); purged.push(id); } catch { /* skip */ }
      }
      return { purged };
    });
    route('/api/session-hub/archive', async (body) => {
      if (typeof body.id !== 'string') throw new Error('id is required');
      const registry = ctx.get?.('workspaceRegistry');
      if (registry === undefined) throw new Error('workspace registry unavailable');
      if (body.archived === true) registry.archiveSession(body.id);
      else registry.unarchiveSession(body.id);
      return { archived: body.archived === true };
    });
    route('/api/session-hub/restore', async (body) => {
      if (typeof body.id !== 'string') throw new Error('id is required');
      return restoreSession(body.id, paths);
    });
    route('/api/session-hub/purge', async (body) => {
      if (typeof body.id !== 'string') throw new Error('id is required');
      return purgeSession(body.id, paths);
    });
  });

  ctx.logger?.info?.(`dsh-session ${VERSION}: root=${root} trash=${trashRoot}`);
}
