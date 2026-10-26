// dsh-session host: filesystem session list plus trash/restore/purge routes.

import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { patchAnnotation, readAnnotations, setAnnotationsPath } from './annotations.js';
import { descendantIds, emptySessions, exportSession, listSessions, listTrash, moveSession, purgeSession, restoreSession, trashSession } from './store.js';
import { createZip } from './zip.js';
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

  const isRunning = async (id) => {
    try {
      const activity = await ctx.waterfall?.('workspace/session-activity', { sessionId: id }, () => Promise.resolve([]));
      return Array.isArray(activity) && activity.some((item) => item?.kind === 'turn');
    } catch {
      return false;
    }
  };

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
      if (target?.isSubagent === true) throw new Error('子会话不能单独删除，请删除主会话');
      if (await isRunning(body.id)) throw new Error('会话正在运行，先停止当前回合再删除');
      if (body.includeChildren === true) {
        for (const childId of descendantIds(body.id, paths)) {
          if (await isRunning(childId)) throw new Error(`子会话 ${childId} 仍在运行`);
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
        if (await isRunning(item.id)) continue;
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
    scope.effect(() => webServer.register({
      kind: 'exact',
      path: '/api/session-hub/export-zip',
      handler: async (req, res) => {
        if (!sameOrigin(req)) { res.writeHead(403).end(); return; }
        if (req.method !== 'POST') { res.writeHead(405).end(); return; }
        try {
          let body = '';
          for await (const chunk of req) body += String(chunk);
          const parsed = body === '' ? {} : JSON.parse(body);
          if (!Array.isArray(parsed.ids)) throw new Error('ids must be an array');
          const byId = new Map(listSessions(paths).map((item) => [item.id, item]));
          const used = new Set();
          const files = parsed.ids.map((id) => {
            const item = byId.get(id);
            const raw = (item?.title ?? id).replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || id;
            let name = `${raw}.md`;
            let index = 2;
            while (used.has(name)) { name = `${raw}-${index}.md`; index += 1; }
            used.add(name);
            return { name, data: exportSession(id, paths) };
          });
          const zip = createZip(files);
          res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="sessions.zip"' });
          res.end(zip);
        } catch (error) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      },
    }), 'dsh-session: export-zip');

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
        if (byId.get(id)?.isSubagent === true) { skipped.push({ id, reason: 'subagent' }); continue; }
        if (await isRunning(id)) { skipped.push({ id, reason: 'running' }); continue; }
        try {
          let liveChild;
          for (const child of descendantIds(id, paths)) {
            if (await isRunning(child)) { liveChild = child; break; }
          }
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
    route('/api/session-hub/workspaces', async () => {
      const registry = ctx.get?.('workspaceRegistry');
      const workspaces = (registry?.list?.() ?? []).map((entity) => ({ id: entity.id, path: entity.path, title: entity.title ?? entity.name ?? entity.path }));
      return { workspaces };
    });
    route('/api/session-hub/move-workspace', async (body) => {
      if (typeof body.id !== 'string' || typeof body.workspaceId !== 'string') throw new Error('id and workspaceId are required');
      const registry = ctx.get?.('workspaceRegistry');
      const target = (registry?.list?.() ?? []).find((entity) => entity.id === body.workspaceId);
      if (target === undefined) throw new Error('目标工作区不存在');
      const agents = ctx.get?.('agents');
      if (await isRunning(body.id)) throw new Error('会话仍在运行，先停止再移动');
      const session = listSessions(paths).find((item) => item.id === body.id);
      if (session?.isSubagent === true) throw new Error('子会话不能单独移动');
      return moveSession(body.id, target.path, paths);
    });
    route('/api/session-hub/archive', async (body) => {
      if (typeof body.id !== 'string') throw new Error('id is required');
      const registry = ctx.get?.('workspaceRegistry');
      if (registry === undefined) throw new Error('workspace registry unavailable');
      if (body.archived === true) registry.archiveSession(body.id);
      else registry.unarchiveSession(body.id);
      return { archived: body.archived === true };
    });
    route('/api/session-hub/export', async (body, req) => {
      const url = new URL(req.url ?? '/', 'http://x');
      const id = url.searchParams.get('id') ?? body.id;
      if (typeof id !== 'string') throw new Error('id is required');
      return { markdown: exportSession(id, paths) };
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
