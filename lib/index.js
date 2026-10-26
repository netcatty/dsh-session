// dsh-session host: filesystem session list plus trash/restore/purge routes.

import { homedir } from 'node:os';
import { join } from 'node:path';
import { listSessions, listTrash, purgeSession, restoreSession, trashSession } from './store.js';
import { VERSION } from './version.js';

export const name = 'session-hub';

export function apply(ctx, config = {}) {
  const root = config.root ?? join(homedir(), '.dsh', 'sessions');
  const trashRoot = config.trashRoot ?? join(homedir(), '.dsh', 'session-trash');
  const paths = { root, trashRoot };

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

    route('/api/session-hub/list', async () => ({ sessions: listSessions(paths) }));
    route('/api/session-hub/trash', async () => ({ entries: listTrash(paths) }));
    route('/api/session-hub/move-to-trash', async (body) => {
      if (typeof body.id !== 'string') throw new Error('id is required');
      const agents = ctx.get?.('agents');
      if (agents?.get?.(body.id) !== undefined) throw new Error('会话仍在运行或已加载，先关闭它再删除');
      return trashSession(body.id, paths);
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
