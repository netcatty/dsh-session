// dsh-session host: session catalog, annotations, trash, workspace move,
// Agent-preset migration and export routes.

import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createAnnotationStore, setAnnotationsPath } from './annotations.js';
import {
  descendantIds, exportSession, listSessions, listTrash, migrateSessionPreset,
  moveSession, purgeSession, purgeSessionTree, restoreSession, restoreSessionTree, scanDiskSessions, SessionMetaCache, trashSession,
} from './store.js';
import { assertSessionId, readSessionHeader } from './session-files.js';
import { createZip } from './zip.js';
import { migrateLegacy, pluginDir } from './paths.js';
import { readVersion, VERSION } from './version.js';

export const name = 'session-hub';

const API_PREFIX = '/api/session-hub';
const BODY_LIMIT = 256 * 1024;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function statusFor(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'bad-request') return 400;
  if (code === 'body-too-large') return 413;
  if (code === 'session-not-found') return 404;
  if (code === 'annotation-conflict' || code === 'annotations-busy') return 409;
  if (code === 'session-live' || code === 'session-running') return 409;
  if (code === 'session-subagent') return 409;
  if (code === 'workspace-active' || code === 'workspace/session-active') return 409;
  if (code === 'workspace/unknown-session' || code === 'workspace/unknown') return 404;
  if (code.startsWith?.('annotations-')) return 503;
  return 500;
}

function fail(message, code = 'bad-request') {
  return Object.assign(new Error(message), { code });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function apply(ctx, config = {}) {
  if (config.dataDir === undefined) {
    try { migrateLegacy((message) => ctx.logger?.info?.(message)); } catch { /* migration is best effort */ }
  }
  const dataDir = config.dataDir ?? pluginDir();
  const root = config.root ?? join(homedir(), '.dsh', 'sessions');
  const trashRoot = config.trashRoot ?? join(dataDir, 'trash');
  const annotationsPath = config.annotationsPath ?? join(dataDir, 'annotations.json');
  const metaCachePath = config.metaCachePath ?? join(dataDir, 'metadata-cache.json');

  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  setAnnotationsPath(annotationsPath);
  const annotations = createAnnotationStore(annotationsPath);
  const cache = new SessionMetaCache(metaCachePath);
  const paths = { root, trashRoot, dataDir };

  const get = (serviceName) => {
    try { return ctx.get?.(serviceName); } catch { return undefined; }
  };
  const persistence = () => get('sessionPersistence');
  const sessionsService = () => get('sessions');
  const agentsService = () => get('agents');
  const registry = () => get('workspaceRegistry');
  const presets = () => get('agentPresets');

  /** Push a fresh list summary to the Client session list after a cold
   * Session was restored or re-homed. The Host session controller normally
   * emits this only for live sessions, so a restored artifact would otherwise
   * stay invisible in the native sidebar until a full reload. */
  const notifySessionAdded = async (ids) => {
    const controller = get('sessionController');
    if (controller === undefined || typeof controller.list !== 'function') return;
    try {
      const result = await controller.list({}, new AbortController().signal);
      const items = Array.isArray(result?.items) ? result.items : [];
      for (const id of ids) {
        const summary = items.find((item) => item.sessionId === id);
        if (summary !== undefined) ctx.emit?.('api-session/added', summary);
      }
    } catch { /* best effort; the next full list reload still sees the file */ }
  };

  const flattenRestored = (node) => [node, ...(node.children ?? []).flatMap((child) => flattenRestored(child))];

  const workspaceMemberIds = (entity) => {
    if (entity === null || entity === undefined) return [];
    try {
      const record = entity.record;
      if (record !== null && record !== undefined && Array.isArray(record.sessionIds)) return record.sessionIds;
      const ids = entity.sessionIds;
      return Array.isArray(ids) ? ids : [];
    } catch {
      return [];
    }
  };

  const workspaceMaps = () => {
    const bySession = new Map();
    const byPath = new Map();
    let entities = [];
    try { entities = registry()?.list?.() ?? []; } catch { entities = []; }
    for (const entity of entities) {
      if (typeof entity.path === 'string') byPath.set(entity.path, entity);
      for (const id of workspaceMemberIds(entity)) {
        if (!bySession.has(id)) bySession.set(id, entity);
      }
    }
    return { entities, bySession, byPath };
  };

  const isRunning = async (id) => {
    try {
      if (typeof ctx.waterfall !== 'function') return false;
      const activity = await ctx.waterfall('workspace/session-activity', { sessionId: id }, () => Promise.resolve([]));
      return Array.isArray(activity) && activity.length > 0;
    } catch {
      return false;
    }
  };

  const isLive = (id) => {
    try { if (sessionsService()?.get?.(id) !== undefined) return true; } catch { /* ignore */ }
    try { if (agentsService()?.get?.(id) !== undefined) return true; } catch { /* ignore */ }
    return false;
  };

  const enrich = async (rows) => {
    const { bySession, byPath } = workspaceMaps();
    let archivedIds = [];
    let pinnedIds = [];
    try { archivedIds = registry()?.archivedSessionIds ?? []; } catch { /* registry unavailable */ }
    try { pinnedIds = registry()?.pinnedSessionIds ?? []; } catch { /* registry unavailable */ }
    const archived = new Set(archivedIds);
    const pinned = new Set(pinnedIds);
    const result = [];
    for (const row of rows) {
      const workspace = bySession.get(row.id) ?? byPath.get(row.cwd);
      const live = isLive(row.id);
      result.push({
        ...row,
        isLive: live,
        running: live ? await isRunning(row.id) : false,
        archived: archived.has(row.id),
        pinned: pinned.has(row.id),
        workspaceId: workspace?.id,
        workspaceTitle: workspace?.title,
        workspacePath: workspace?.path,
        projectLabel: workspace?.title ?? (row.cwd ?? row.project),
      });
    }
    return result;
  };

  const listAll = async () => {
    const rows = await listSessions({
      root,
      persistence: persistence(),
      sessions: sessionsService(),
      cache,
    });
    const enriched = await enrich(rows);
    cache.flush();
    return enriched;
  };

  const invalidateSessionCaches = (id) => {
    try { cache.delete(id); } catch { /* local cache */ }
    const reg = registry();
    for (const key of ['headers', 'sessionPaths', 'missingSessionPaths', 'invalidSessionPaths']) {
      try { reg?.[key]?.delete?.(id); } catch { /* private surface */ }
    }
    try { persistence()?.coldLogMemo?.delete?.(id); } catch { /* private surface */ }
  };

  const detachFromWorkspaces = async (ids, { exceptId } = {}) => {
    const reg = registry();
    if (reg === undefined || typeof reg.list !== 'function') return;
    for (const entity of reg.list()) {
      if (entity.id === exceptId) continue;
      for (const id of ids) {
        if (!workspaceMemberIds(entity).includes(id)) continue;
        try { await entity.detachSession(id); } catch { /* best effort */ }
      }
    }
  };

  const unarchiveSessions = async (ids) => {
    const reg = registry();
    if (reg === undefined) return;
    for (const id of ids) {
      try { await reg.unarchiveSession(id); } catch { /* idempotent */ }
    }
  };

  const attachToWorkspace = async (id, workspaceId) => {
    const reg = registry();
    const entity = reg?.get?.(workspaceId);
    if (entity === undefined) return false;
    invalidateSessionCaches(id);
    await entity.attachSession(id);
    return true;
  };

  /** Tear down live agent/session state before relocating or deleting its files. */
  const retireLiveSession = async (id) => {
    const sessions = sessionsService();
    const agents = agentsService();
    const agent = (() => { try { return agents?.get?.(id); } catch { return undefined; } })();
    const session = (() => { try { return sessions?.get?.(id); } catch { return undefined; } })();
    if (agent === undefined && session === undefined) return false;
    if (agent !== undefined) {
      try { agent.cancel?.({ kind: 'disposed' }); } catch { /* already idle */ }
      try {
        if (typeof agent.scope?.dispose === 'function') {
          await Promise.race([agent.scope.dispose(), sleep(3000)]);
        }
      } catch { /* bounded */ }
      try { agents?.store?.delete?.(id); } catch { /* best effort */ }
    }
    let detached = false;
    if (session !== undefined) {
      try { await sessions?.flush?.(session); } catch { /* already flushing */ }
      try {
        const entry = sessions?.store?.get?.(id);
        if (entry !== undefined && typeof entry.detach === 'function') {
          entry.detach();
          await sleep(200);
          detached = true;
        }
      } catch { /* best effort */ }
    }
    if (!detached) {
      try { ctx.emit?.('session/disposed', { id }); } catch { /* no transport */ }
    }
    return true;
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

  /** Reuse DSH's connection authentication when available, fail closed. */
  const authenticate = (req) => {
    const connection = get('connection');
    if (connection !== undefined && typeof connection.admit === 'function') {
      try {
        const admission = connection.admit(req);
        if (!isRecord(admission)) return { ok: false, status: 401, error: '未授权' };
        if ('rejection' in admission) {
          const status = typeof admission.rejection === 'number' ? admission.rejection : 401;
          return { ok: false, status, error: status === 403 ? '禁止访问：请求未通过 DSH 信任检查' : '未授权：需要有效的 DSH 会话凭证' };
        }
        if (admission.peer?.principal?.kind !== 'owner') return { ok: false, status: 403, error: '禁止访问：会话管理需要 owner 权限' };
        return { ok: true };
      } catch {
        return { ok: false, status: 403, error: '认证检查失败' };
      }
    }
    // Older hosts without the connection service: only loopback / same-origin.
    return sameOrigin(req)
      ? { ok: true }
      : { ok: false, status: 403, error: '禁止访问：仅允许同源请求' };
  };

  const readBody = async (req) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > BODY_LIMIT) throw fail('请求体超过 256 KiB', 'body-too-large');
      chunks.push(bytes);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (text.trim() === '') return {};
    let body;
    try { body = JSON.parse(text); } catch { throw fail('请求体不是合法 JSON'); }
    if (!isRecord(body)) throw fail('请求体必须是 JSON 对象');
    return body;
  };

  const json = (res, status, body) => {
    if (res.headersSent) return;
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  const requireId = (body) => {
    const id = typeof body.id === 'string' ? body.id.trim() : (typeof body.sessionId === 'string' ? body.sessionId.trim() : '');
    if (id === '') throw fail('id 必填');
    return assertSessionId(id);
  };

  const requireIds = (body) => {
    const source = body.ids ?? body.sessionIds;
    if (!Array.isArray(source)) throw fail('ids 必须是数组');
    const ids = Array.from(new Set(source.filter((id) => typeof id === 'string' && id.trim() !== '').map((id) => id.trim())));
    if (ids.length === 0) throw fail('ids 不能为空');
    if (ids.length > 200) throw fail('单次批量最多 200 条');
    for (const id of ids) assertSessionId(id);
    return ids;
  };

  const workspaceIdOf = (body) => {
    const id = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : '';
    if (id === '') throw fail('workspaceId 必填');
    return id;
  };

  const targetWorkspace = (workspaceId) => {
    const entity = registry()?.get?.(workspaceId);
    if (entity === undefined) throw fail('目标工作区不存在', 'workspace/unknown');
    return entity;
  };

  const findRow = async (id) => (await listAll()).find((row) => row.id === id);

  const trashOne = async (id, { includeChildren = false, rows: providedRows } = {}) => {
    const rows = providedRows ?? await listAll();
    const row = rows.find((item) => item.id === id);
    if (row === undefined) throw fail(`会话 "${id}" 不存在`, 'session-not-found');
    if (row.isSubagent === true) throw fail('子会话不能单独删除，请删除主会话');
    const childIds = includeChildren ? descendantIds(id, paths) : [];
    const ids = [id, ...childIds];
    for (const target of ids) {
      if (isLive(target)) await retireLiveSession(target);
    }
    const result = trashSession(id, paths, {
      includeChildren,
      rows,
      workspaceId: row.workspaceId,
      workspacePath: row.workspacePath,
    });
    const moved = result.moved ?? [id];
    await detachFromWorkspaces(moved);
    await unarchiveSessions(moved);
    for (const movedId of moved) {
      try { ctx.emit?.('session/disposed', { id: movedId }); } catch { /* no transport */ }
    }
    return result;
  };

  const restoreOne = async (id) => {
    const entry = listTrash(paths).find((item) => item.id === id);
    if (entry?.parentSession !== undefined) {
      throw fail('子会话不能单独恢复，请恢复主会话', 'session-subagent');
    }
    const result = restoreSessionTree(id, paths);
    const row = scanDiskSessions({ root }).find((item) => item.id === id);
    let workspace;
    try {
      if (row?.header?.cwd !== undefined && row.isSubagent !== true) {
        workspace = await registry()?.resolveByPath?.(row.header.cwd);
        if (workspace === undefined) {
          const { byPath } = workspaceMaps();
          workspace = byPath.get(row.header.cwd);
        }
      }
    } catch { workspace = undefined; }
    if (workspace !== undefined && row?.isSubagent !== true) {
      try { await attachToWorkspace(id, workspace.id); } catch { /* next registry reconcile */ }
    }
    try { await notifySessionAdded(flattenRestored(result).map((item) => item.id)); } catch { /* best effort */ }
    return result;
  };

  const purgeOne = async (id) => {
    const result = purgeSessionTree(id, paths);
    for (const purgedId of result.purged ?? [id]) {
      try { await annotations.remove(purgedId); } catch { /* best effort */ }
    }
    return result;
  };

  const pinOne = async (id, pinned) => {
    const reg = registry();
    if (reg === undefined) throw fail('workspaceRegistry 不可用');
    if (pinned === true) await reg.pinSession(id);
    else await reg.unpinSession(id);
    return { pinned: pinned === true };
  };

  const moveOne = async (id, target, { includeChildren = false } = {}) => {
    const row = await findRow(id);
    if (row === undefined) throw fail(`会话 "${id}" 不存在`, 'session-not-found');
    if (row.isSubagent === true) throw fail('子会话不能单独移动，请移动主会话');
    if (row.workspaceId === target.id) return { moved: false, id, cwd: target.path };
    if (row.isLive === true) await retireLiveSession(id);
    const childIds = includeChildren ? descendantIds(id, paths) : [];
    for (const childId of childIds) {
      const child = await findRow(childId);
      if (child?.isLive === true) await retireLiveSession(childId);
    }
    const results = [];
    for (const targetId of [...childIds].reverse()) {
      results.push(moveSession(targetId, target.path, paths));
    }
    results.push(moveSession(id, target.path, paths));
    await detachFromWorkspaces([id, ...childIds]);
    try {
      await attachToWorkspace(id, target.id);
    } catch (error) {
      results.push({ id, warning: `会话已移动，但工作区归属更新失败：${error.message}` });
    }
    invalidateSessionCaches(id);
    try { await notifySessionAdded([id, ...childIds]); } catch { /* best effort */ }
    try { ctx.emit?.('workspace/changed'); } catch { /* no transport */ }
    return { moved: true, id, cwd: target.path, results };
  };

  const archiveOne = async (id, archived) => {
    const reg = registry();
    if (reg === undefined) throw fail('workspaceRegistry 不可用');
    if (archived === true) {
      if (isLive(id) && await isRunning(id)) throw fail('会话仍在运行，先停止当前回合再归档', 'session-running');
      try {
        await reg.archiveSession(id, { stopActivity: false });
      } catch (error) {
        if (String(error?.code ?? '').includes('active') || String(error?.message ?? '').includes('active')) {
          throw fail('会话仍在运行，先停止当前回合再归档', 'workspace-active');
        }
        throw error;
      }
    } else {
      await reg.unarchiveSession(id);
    }
    return { archived: archived === true };
  };

  const livePreset = (id) => {
    const session = (() => { try { return sessionsService()?.get?.(id); } catch { return undefined; } })();
    if (session === undefined) return undefined;
    let events = [];
    try {
      if (typeof session.ownEvents === 'function') events = session.ownEvents();
      else if (Array.isArray(session.events)) events = session.events;
    } catch { events = []; }
    let oldPreset = session.header?.agentPreset;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event?.type === 'agent-preset/selected' && typeof event.data?.agentPreset === 'string') {
        oldPreset = event.data.agentPreset;
        break;
      }
    }
    return { session, oldPreset };
  };

  const migratePresetOne = async (id, toPreset) => {
    if (typeof toPreset !== 'string' || toPreset.trim() === '') throw fail('toPreset 必填');
    const target = toPreset.trim();
    const ap = presets();
    if (ap === undefined || typeof ap.list !== 'function') throw fail('agentPresets 服务不可用');
    const roster = await ap.list();
    const preset = (roster ?? []).find((item) => item?.id === target);
    if (preset === undefined) throw fail(`Agent 预设 "${target}" 不存在`);
    if (preset.broken !== undefined) throw fail(`Agent 预设 "${target}" 不可用：${preset.broken}`);
    const live = livePreset(id);
    if (live !== undefined) {
      if (live.oldPreset === target) return { migrated: false, oldPreset: live.oldPreset, newPreset: target };
      const agent = (() => { try { return agentsService()?.get?.(id); } catch { return undefined; } })();
      if (agent !== undefined && typeof ap.recompose === 'function') {
        try { await ap.recompose(agent.ctx, target); } catch { /* projection updates on append */ }
      }
      live.session.append('agent-preset/selected', { agentPreset: target });
      await sessionsService()?.flush?.(live.session);
      try { ctx.emit?.('agent-preset/selected', id, target); } catch { /* no transport */ }
      return { migrated: true, oldPreset: live.oldPreset, newPreset: target, live: true };
    }
    const result = migrateSessionPreset(id, target, paths);
    invalidateSessionCaches(id);
    try { ctx.emit?.('agent-preset/selected', id, target); } catch { /* no transport */ }
    return result;
  };

  ctx.inject(['webServer'], (scope) => {
    const webServer = scope.webServer;
    if (webServer?.register === undefined) return;
    scope.effect(() => webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (req, res) => {
        const auth = authenticate(req);
        if (auth.ok !== true) return json(res, auth.status ?? 403, { ok: false, error: auth.error ?? 'forbidden' });
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) || '/' : '/';
        const method = req.method ?? 'GET';
        let body = {};
        try {
          if (method === 'POST') body = await readBody(req);
          if (method === 'GET' && path === '/export') {
            const id = url.searchParams.get('id') ?? '';
            if (id === '') throw fail('id 必填');
            const mark = (await annotations.list())[id] ?? {};
            return json(res, 200, { ok: true, markdown: exportSession(id, paths, { annotation: mark }) });
          }
          if (method === 'GET' && path === '/list') {
            return json(res, 200, { ok: true, sessions: await listAll() });
          }
          if (method === 'GET' && path === '/trash') {
            return json(res, 200, { ok: true, entries: listTrash(paths) });
          }
          if (method === 'GET' && path === '/annotations') {
            return json(res, 200, { ok: true, annotations: await annotations.list() });
          }
          if (method === 'GET' && path === '/workspaces') {
            const entities = registry()?.list?.() ?? [];
            const workspaces = [];
            for (const entity of entities) {
              const ids = [...workspaceMemberIds(entity)];
              let status = 'ok';
              try { status = await entity.status?.() ?? 'ok'; } catch { status = 'unknown'; }
              workspaces.push({
                id: entity.id,
                title: entity.title,
                name: entity.title,
                path: entity.path,
                sessionCount: ids.length,
                sessionIds: ids,
                createdAt: entity.createdAt ?? entity.record?.createdAt,
                updatedAt: entity.updatedAt ?? entity.record?.updatedAt,
                status,
              });
            }
            return json(res, 200, { ok: true, workspaces });
          }
          if (method === 'POST' && path === '/workspace-create') {
            const candidate = typeof body.path === 'string' ? body.path.trim() : '';
            if (candidate === '') throw fail('path 必填');
            const reg = registry();
            if (reg === undefined || typeof reg.create !== 'function') throw fail('workspaceRegistry 不可用');
            const title = typeof body.title === 'string' ? body.title.trim() : '';
            if (title.length > 120) throw fail('工作区名称最多 120 字符');
            const entity = await reg.create(candidate, title === '' ? undefined : title);
            return json(res, 200, { ok: true, workspace: { id: entity.id, title: entity.title, path: entity.path } });
          }
          if (method === 'POST' && path === '/workspace-rename') {
            const workspaceId = workspaceIdOf(body);
            const target = targetWorkspace(workspaceId);
            const title = typeof body.title === 'string' ? body.title.trim() : '';
            if (title === '' || title.length > 120) throw fail('工作区名称必须为 1–120 字符');
            await target.setTitle(title);
            return json(res, 200, { ok: true, workspace: { id: target.id, title, path: target.path } });
          }
          if (method === 'POST' && path === '/workspace-order') {
            const workspaceId = workspaceIdOf(body);
            const beforeId = body.beforeId === undefined || body.beforeId === null ? undefined : typeof body.beforeId === 'string' ? body.beforeId : null;
            if (beforeId === null) throw fail('beforeId 必须是字符串');
            const reg = registry();
            if (reg === undefined || typeof reg.insertBefore !== 'function') throw fail('workspaceRegistry 不可用');
            const order = await reg.insertBefore(workspaceId, beforeId);
            return json(res, 200, { ok: true, order });
          }
          if (method === 'POST' && path === '/workspace-remove') {
            const workspaceId = workspaceIdOf(body);
            const reg = registry();
            if (reg === undefined || typeof reg.delete !== 'function') throw fail('workspaceRegistry 不可用');
            const target = targetWorkspace(workspaceId);
            const trashSessions = body.trashSessions === true;
            const trashed = [];
            const skipped = [];
            if (trashSessions) {
              const rows = await listAll();
              const members = rows.filter((row) => row.workspaceId === workspaceId && row.isSubagent !== true);
              for (const row of members) {
                try {
                  const result = await trashOne(row.id, { includeChildren: true, rows });
                  trashed.push(...(result.moved ?? [row.id]));
                } catch (error) {
                  skipped.push({ id: row.id, reason: error?.message ?? String(error) });
                }
              }
            }
            await reg.delete(workspaceId);
            return json(res, 200, {
              ok: true,
              removed: true,
              trashed,
              skipped,
              workspace: { id: workspaceId, title: target.title, path: target.path },
            });
          }
          if (method === 'GET' && path === '/presets') {
            const ap = presets();
            if (ap === undefined || typeof ap.list !== 'function') throw fail('agentPresets 服务不可用');
            const roster = await ap.list();
            return json(res, 200, {
              ok: true,
              presets: (roster ?? []).map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description,
                order: item.order,
                broken: item.broken,
              })),
            });
          }
          if (method === 'GET' && path === '/stats') {
            const rows = await listAll();
            const trash = listTrash(paths);
            const subagents = rows.filter((row) => row.isSubagent === true).length;
            const mainSessions = rows.length - subagents;
            const blank = rows.filter((row) => row.title === undefined && row.preview === undefined).length;
            const marks = await annotations.list();
            const trashSubagents = trash.filter((entry) => entry.parentSession !== undefined).length;
            const trashMain = trash.length - trashSubagents;
            const live = rows.filter((row) => row.isLive === true).length;
            const running = rows.filter((row) => row.running === true).length;
            let archived = 0;
            try { archived = (registry()?.archivedSessionIds ?? []).length; } catch { /* registry unavailable */ }
            let workspaceCount = 0;
            try { workspaceCount = (registry()?.list?.() ?? []).length; } catch { /* registry unavailable */ }
            return json(res, 200, {
              ok: true,
              version: readVersion(),
              root,
              trashRoot,
              dataDir,
              sessions: rows.length,
              mainSessions,
              subagents,
              blank,
              live,
              running,
              archived,
              trash: trash.length,
              trashMain,
              trashSubagents,
              workspaces: workspaceCount,
              annotations: Object.keys(marks).length,
              datasize: rows.reduce((total, row) => total + (Number(row.sizeBytes) || 0), 0),
            });
          }
          if (method === 'POST' && path === '/annotations') {
            const id = requireId(body);
            if (!isRecord(body.patch)) throw fail('patch 必须是对象');
            const annotation = await annotations.update(id, body.patch, body.expectedRevision);
            return json(res, 200, { ok: true, annotation });
          }
          if (method === 'POST' && path === '/annotations-import') {
            if (!isRecord(body.sessions)) throw fail('sessions 必须是对象');
            return json(res, 200, { ok: true, ...(await annotations.importAll(body.sessions)) });
          }
          if (method === 'POST' && path === '/cache-clear') {
            cache.clear();
            cache.flush();
            return json(res, 200, { ok: true, cleared: true });
          }
          if (method === 'POST' && path === '/batch-annotations') {
            const ids = requireIds(body);
            if (!isRecord(body.patch)) throw fail('patch 必须是对象');
            const result = await annotations.batchUpdate(ids, body.patch, body.expectedRevisions);
            return json(res, 200, { ok: true, ...result });
          }
          if (method === 'POST' && path === '/move-to-trash') {
            const id = requireId(body);
            return json(res, 200, { ok: true, ...(await trashOne(id, { includeChildren: body.includeChildren === true })) });
          }
          if (method === 'POST' && path === '/batch-trash') {
            const ids = requireIds(body);
            const rows = await listAll();
            const moved = [];
            const skipped = [];
            const seen = new Set();
            for (const id of ids) {
              if (seen.has(id)) continue;
              seen.add(id);
              try {
                const row = rows.find((item) => item.id === id);
                if (row?.isSubagent === true) { skipped.push({ id, reason: 'subagent' }); continue; }
                const result = await trashOne(id, { includeChildren: true, rows });
                for (const movedId of result.moved ?? [id]) { moved.push(movedId); seen.add(movedId); }
              } catch (error) {
                skipped.push({ id, reason: error?.message ?? String(error) });
              }
            }
            return json(res, 200, { ok: true, moved, skipped });
          }
          if (method === 'POST' && path === '/restore') {
            const id = requireId(body);
            return json(res, 200, { ok: true, ...(await restoreOne(id)) });
          }
          if (method === 'POST' && path === '/batch-restore') {
            const ids = requireIds(body);
            const restored = [];
            const skipped = [];
            const handled = new Set();
            const entries = new Map(listTrash(paths).map((entry) => [entry.id, entry]));
            for (const id of ids) {
              if (handled.has(id)) continue;
              if (entries.get(id)?.parentSession !== undefined) {
                skipped.push({ id, reason: 'subagent' });
                continue;
              }
              try {
                const result = await restoreOne(id);
                restored.push(result);
                handled.add(id);
                for (const child of result.children ?? []) handled.add(child.id);
              } catch (error) {
                skipped.push({ id, reason: error?.message ?? String(error) });
              }
            }
            return json(res, 200, { ok: true, restored, skipped });
          }
          if (method === 'POST' && path === '/purge') {
            const id = requireId(body);
            return json(res, 200, { ok: true, ...(await purgeOne(id)) });
          }
          if (method === 'POST' && path === '/batch-purge') {
            const ids = requireIds(body);
            const purged = [];
            const skipped = [];
            for (const id of ids) {
              try { await purgeOne(id); purged.push(id); }
              catch (error) { skipped.push({ id, reason: error?.message ?? String(error) }); }
            }
            return json(res, 200, { ok: true, purged, skipped });
          }
          if (method === 'POST' && path === '/empty-trash') {
            const entries = listTrash(paths);
            const purged = [];
            for (const entry of entries) {
              try { await purgeOne(entry.id); purged.push(entry.id); }
              catch { /* keep the remaining entries */ }
            }
            return json(res, 200, { ok: true, purged });
          }
          if (method === 'POST' && path === '/cleanup-empty') {
            const rows = await listAll();
            const moved = [];
            const skipped = [];
            for (const row of rows) {
              if (row.isSubagent === true) continue;
              if (row.title !== undefined || row.preview !== undefined) continue;
              if (row.isLive === true) { skipped.push({ id: row.id, reason: 'live' }); continue; }
              try {
                const result = await trashOne(row.id, { includeChildren: true, rows });
                moved.push(...(result.moved ?? [row.id]));
              } catch (error) {
                skipped.push({ id: row.id, reason: error?.message ?? String(error) });
              }
            }
            return json(res, 200, { ok: true, moved, skipped });
          }
          if (method === 'POST' && path === '/move') {
            const id = requireId(body);
            const workspaceId = workspaceIdOf(body);
            const target = targetWorkspace(workspaceId);
            return json(res, 200, { ok: true, ...(await moveOne(id, target, { includeChildren: body.includeChildren === true })) });
          }
          if (method === 'POST' && path === '/batch-move') {
            const ids = requireIds(body);
            const workspaceId = workspaceIdOf(body);
            const target = targetWorkspace(workspaceId);
            const moved = [];
            const skipped = [];
            for (const id of ids) {
              try { moved.push(await moveOne(id, target, { includeChildren: body.includeChildren === true })); }
              catch (error) { skipped.push({ id, reason: error?.message ?? String(error) }); }
            }
            return json(res, 200, { ok: true, moved, skipped });
          }
          if (method === 'POST' && path === '/rename') {
            const id = requireId(body);
            const title = typeof body.title === 'string' ? body.title.trim() : '';
            if (title === '' || title.length > 200) throw fail('会话名称必须为 1–200 字符');
            const ctrl = get('sessionController');
            if (ctrl === undefined || typeof ctrl.rename !== 'function') throw fail('sessionController 不可用');
            const result = await ctrl.rename({ sessionId: id, title });
            invalidateSessionCaches(id);
            try { await notifySessionAdded([id]); } catch { /* best effort */ }
            try { ctx.emit?.('session/changed', { id, title: result.title }); } catch { /* no transport */ }
            return json(res, 200, { ok: true, id, title: result.title, seq: result.seq });
          }
          if (method === 'POST' && path === '/pin') {
            const id = requireId(body);
            if (typeof body.pinned !== 'boolean') throw fail('pinned 必须是布尔值');
            return json(res, 200, { ok: true, ...(await pinOne(id, body.pinned)) });
          }
          if (method === 'POST' && path === '/batch-pin') {
            const ids = requireIds(body);
            if (typeof body.pinned !== 'boolean') throw fail('pinned 必须是布尔值');
            const succeeded = [];
            const failed = [];
            for (const id of ids) {
              try { await pinOne(id, body.pinned); succeeded.push(id); }
              catch (error) { failed.push({ id, reason: error?.message ?? String(error) }); }
            }
            return json(res, 200, { ok: true, pinned: body.pinned, succeeded, failed });
          }
          if (method === 'POST' && path === '/archive') {
            const id = requireId(body);
            if (typeof body.archived !== 'boolean') throw fail('archived 必须是布尔值');
            return json(res, 200, { ok: true, ...(await archiveOne(id, body.archived)) });
          }
          if (method === 'POST' && path === '/batch-archive') {
            const ids = requireIds(body);
            if (typeof body.archived !== 'boolean') throw fail('archived 必须是布尔值');
            const succeeded = [];
            const failed = [];
            for (const id of ids) {
              try { await archiveOne(id, body.archived); succeeded.push(id); }
              catch (error) { failed.push({ id, reason: error?.message ?? String(error) }); }
            }
            return json(res, 200, { ok: true, archived: body.archived, succeeded, failed });
          }
          if (method === 'POST' && path === '/preset-migrate') {
            const id = requireId(body);
            if (typeof body.toPreset !== 'string' || body.toPreset.trim() === '') throw fail('toPreset 必填');
            return json(res, 200, { ok: true, ...(await migratePresetOne(id, body.toPreset)) });
          }
          if (method === 'POST' && path === '/batch-preset') {
            const ids = requireIds(body);
            if (typeof body.toPreset !== 'string' || body.toPreset.trim() === '') throw fail('toPreset 必填');
            const succeeded = [];
            const failed = [];
            for (const id of ids) {
              try { await migratePresetOne(id, body.toPreset); succeeded.push(id); }
              catch (error) { failed.push({ id, reason: error?.message ?? String(error) }); }
            }
            return json(res, 200, { ok: true, succeeded, failed });
          }
          if (method === 'POST' && path === '/export') {
            const id = requireId(body);
            const mark = (await annotations.list())[id] ?? {};
            return json(res, 200, { ok: true, markdown: exportSession(id, paths, { annotation: mark }) });
          }
          if (method === 'POST' && path === '/export-zip') {
            const ids = requireIds(body);
            const marks = await annotations.list();
            const rows = await listAll();
            const byId = new Map(rows.map((row) => [row.id, row]));
            const used = new Set();
            const files = ids.map((id) => {
              const row = byId.get(id);
              const raw = (row?.title ?? id).replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || id;
              let name = `${raw}.md`;
              let index = 2;
              while (used.has(name)) { name = `${raw}-${index}.md`; index += 1; }
              used.add(name);
              return { name, data: exportSession(id, paths, { annotation: marks[id] ?? {} }) };
            });
            const zip = createZip(files);
            res.writeHead(200, {
              'content-type': 'application/zip',
              'content-disposition': 'attachment; filename="sessions.zip"',
            });
            res.end(zip);
            return undefined;
          }
          return json(res, 404, { ok: false, error: `not found: ${method} ${path}` });
        } catch (error) {
          const status = statusFor(error);
          try { ctx.logger?.warn?.(`dsh-session: api ${method} ${path} failed: ${error?.message ?? String(error)}`); } catch { /* logger unavailable */ }
          return json(res, status, {
            ok: false,
            error: error?.message ?? String(error),
            ...(typeof error?.code === 'string' ? { code: error.code } : {}),
          });
        }
      },
    }), 'dsh-session: api');
  });

  ctx.logger?.info?.(`dsh-session ${VERSION}: root=${root} trash=${trashRoot}`);
}

export { descendantIds, listSessions, listTrash, migrateSessionPreset, moveSession, purgeSession, restoreSession, trashSession };
