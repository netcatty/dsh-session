// Filesystem session store: list, trash, restore, purge.
// Session logs live under <root>/<project>/session-<id>/; trash moves that
// directory under <trashRoot>/<id>/payload plus a metadata file.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

function inside(root, path) {
  const base = resolve(root);
  const target = resolve(path);
  return target === base || target.startsWith(`${base}/`);
}

function logFile(dir) {
  for (const name of readdirSync(dir)) {
    if (/^session(\.[A-Za-z0-9]+)?\.jsonl(\.zstd)?$/.test(name)) return join(dir, name);
  }
  return undefined;
}

function readHeader(dir) {
  try {
    const file = logFile(dir);
    if (file === undefined) return {};
    const raw = readFileSync(file);
    const text = file.endsWith('.zstd') ? zstdDecompressSync(raw).toString('utf8') : raw.toString('utf8');
    const first = text.split('\n', 1)[0];
    if (first === '') return {};
    return JSON.parse(first);
  } catch {
    return {};
  }
}

export function listSessions({ root }) {
  if (!existsSync(root)) return [];
  const sessions = [];
  for (const project of readdirSync(root)) {
    const projectDir = join(root, project);
    let entries;
    try {
      entries = readdirSync(projectDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.startsWith('session-')) continue;
      const dir = join(projectDir, name);
      let stat;
      try {
        stat = statSync(dir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      const header = readHeader(dir);
      sessions.push({
        id: header.id ?? name.slice('session-'.length),
        dir,
        project,
        title: typeof header.title === 'string' && header.title !== '' ? header.title : undefined,
        cwd: header.cwd ?? header.workspace ?? undefined,
        createdAt: header.createdAt ?? header.created ?? stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }
  return sessions.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function trashSession(id, { root, trashRoot }) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('invalid session id');
  const target = join(trashRoot, id);
  if (existsSync(target)) throw new Error(`trash entry "${id}" already exists`);
  const session = listSessions({ root }).find((item) => item.id === id);
  if (session === undefined) throw new Error(`session "${id}" not found`);
  if (!inside(root, session.dir)) throw new Error('session path escapes the sessions root');
  mkdirSync(dirname(target), { recursive: true });
  mkdirSync(target, { recursive: true });
  renameSync(session.dir, join(target, 'payload'));
  writeFileSync(join(target, 'meta.json'), `${JSON.stringify({ id, origin: session.dir, project: session.project, trashedAt: new Date().toISOString() }, null, 2)}\n`);
  return { id, origin: session.dir };
}

export function listTrash({ trashRoot }) {
  if (!existsSync(trashRoot)) return [];
  const rows = [];
  for (const id of readdirSync(trashRoot)) {
    const dir = join(trashRoot, id);
    const metaPath = join(dir, 'meta.json');
    if (!existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      rows.push({ ...meta, dir, size: dirSize(dir) });
    } catch {
      // ignore malformed trash entries
    }
  }
  return rows.sort((a, b) => String(b.trashedAt).localeCompare(String(a.trashedAt)));
}

function dirSize(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    try {
      const stat = statSync(path);
      total += stat.isDirectory() ? dirSize(path) : stat.size;
    } catch {
      // ignore vanished files
    }
  }
  return total;
}

export function restoreSession(id, { trashRoot }) {
  const dir = join(trashRoot, id);
  if (!inside(trashRoot, dir) || !existsSync(join(dir, 'meta.json'))) throw new Error(`trash entry "${id}" not found`);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const origin = meta.origin;
  if (typeof origin !== 'string' || origin === '') throw new Error('trash entry has no origin');
  if (existsSync(origin)) throw new Error(`restore target already exists: ${origin}`);
  mkdirSync(dirname(origin), { recursive: true });
  renameSync(join(dir, 'payload'), origin);
  rmSync(dir, { recursive: true, force: true });
  return { id, origin };
}

export function purgeSession(id, { trashRoot }) {
  const dir = join(trashRoot, id);
  if (!inside(trashRoot, dir) || !existsSync(dir)) throw new Error(`trash entry "${id}" not found`);
  rmSync(dir, { recursive: true, force: true });
  return { id };
}
