// Filesystem session store: list, trash, restore, purge.
// Session logs live under <root>/<project>/session-<id>/; trash moves that
// directory under <trashRoot>/<id>/payload plus a metadata file.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';

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

function readLogText(dir) {
  const file = logFile(dir);
  if (file === undefined) return '';
  const raw = readFileSync(file);
  if (!file.endsWith('.zstd')) return raw.toString('utf8');
  // Session logs are concatenated zstd frames; the CLI decodes all frames,
  // while Node's decompressor stops at the first.
  try {
    const result = spawnSync('zstd', ['-dc', file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (result.status === 0 && typeof result.stdout === 'string' && result.stdout !== '') return result.stdout;
  } catch {
    // fall through to the single-frame decoder
  }
  try {
    // Portable fallback: split concatenated frames on the zstd magic and
    // decode each; if a split is wrong the decode throws and we fall back to
    // the single-frame decoder.
    const magic = [0x28, 0xb5, 0x2f, 0xfd];
    const starts = [];
    for (let i = 0; i + 3 < raw.length; i += 1) {
      if (raw[i] === magic[0] && raw[i + 1] === magic[1] && raw[i + 2] === magic[2] && raw[i + 3] === magic[3]) starts.push(i);
    }
    if (starts.length > 1) {
      const parts = [];
      for (let i = 0; i < starts.length; i += 1) {
        const end = i + 1 < starts.length ? starts[i + 1] : raw.length;
        parts.push(zstdDecompressSync(raw.subarray(starts[i], end)).toString('utf8'));
      }
      return parts.join('');
    }
  } catch {
    // fall through to the single-frame decoder
  }
  try {
    return zstdDecompressSync(raw).toString('utf8');
  } catch {
    return '';
  }
}

function readSummary(dir) {
  const header = {};
  let title;
  let preview;
  try {
    const text = readLogText(dir);
    const lines = text.split('\n');
    if (lines[0]) Object.assign(header, JSON.parse(lines[0]));
    for (const line of lines) {
      if (line === '') continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === 'session/title' && typeof event.data?.title === 'string' && event.data.title !== '') title = event.data.title;
      if (preview === undefined && event.type === 'user/message') {
        const block = (event.data?.content ?? []).find((item) => item.type === 'text' && typeof item.text === 'string' && item.text.trim() !== '');
        if (block !== undefined) preview = block.text.trim().slice(0, 120);
      }
    }
  } catch {
    // keep whatever was parsed
  }
  return { header, title, preview };
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
      if (!name.startsWith('session-') && !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(name)) continue;
      const dir = join(projectDir, name);
      let stat;
      try {
        stat = statSync(dir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      const { header, title, preview } = readSummary(dir);
      sessions.push({
        id: header.id ?? name.slice('session-'.length),
        dir,
        project,
        title: title ?? (typeof header.title === 'string' && header.title !== '' ? header.title : undefined),
        preview,
        cwd: header.cwd ?? header.workspace ?? undefined,
        origin: header.origin ?? undefined,
        delegationDepth: header.delegationDepth ?? 0,
        parentSession: header.parentSession ?? undefined,
        isSubagent: header.origin === 'subagent' || Number(header.delegationDepth ?? 0) > 0,
        createdAt: header.createdAt ?? header.created ?? stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }
  return sessions.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function trashSession(id, { root, trashRoot }, options = {}) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('invalid session id');
  if (existsSync(join(trashRoot, id))) throw new Error(`trash entry "${id}" already exists`);
  const all = listSessions({ root });
  const session = all.find((item) => item.id === id);
  if (session === undefined) throw new Error(`session "${id}" not found`);
  const targets = [session];
  if (options.includeChildren === true) {
    const queue = [id];
    const seen = new Set([id]);
    while (queue.length > 0) {
      const current = queue.shift();
      for (const child of all) {
        if (child.parentSession === current && !seen.has(child.id)) {
          seen.add(child.id);
          targets.push(child);
          queue.push(child.id);
        }
      }
    }
  }
  const moved = [];
  for (const item of targets) {
    const target = join(trashRoot, item.id);
    if (existsSync(target)) throw new Error(`trash entry "${item.id}" already exists`);
    if (!inside(root, item.dir)) throw new Error('session path escapes the sessions root');
    mkdirSync(target, { recursive: true });
    renameSync(item.dir, join(target, 'payload'));
    writeFileSync(join(target, 'meta.json'), `${JSON.stringify({ id: item.id, origin: item.dir, project: item.project, parentSession: item.parentSession, title: item.title, preview: item.preview, trashedAt: new Date().toISOString() }, null, 2)}\n`);
    moved.push(item.id);
  }
  return { id, moved };
}

export function moveSession(id, targetPath, { root }) {
  const session = listSessions({ root }).find((item) => item.id === id);
  if (session === undefined) throw new Error(`session "${id}" not found`);
  const projectDir = join(root, `--${targetPath.replace(/^\//, '').replace(/\//g, '-')}--`);
  const targetDir = join(projectDir, basename(session.dir));
  if (targetDir === session.dir) return { moved: false };
  const text = readLogText(session.dir);
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === '') continue;
    try {
      const event = JSON.parse(lines[index]);
      if (event.type === 'session' && typeof event.cwd === 'string') event.cwd = targetPath;
      else if (event.type === 'working-directory/change' && event.data) event.data.cwd = targetPath;
      lines[index] = JSON.stringify(event);
    } catch { /* keep unparsable line */ }
    break;
  }
  mkdirSync(projectDir, { recursive: true });
  renameSync(session.dir, targetDir);
  writeFileSync(join(targetDir, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(lines.join('\n'), 'utf8')));
  return { moved: true, dir: targetDir };
}

export function exportSession(id, { root }) {
  const session = listSessions({ root }).find((item) => item.id === id);
  if (session === undefined) throw new Error(`session "${id}" not found`);
  const text = readLogText(session.dir);
  const lines = [];
  let meta = {};
  let first = true;
  for (const line of text.split('\n')) {
    if (line === '') continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (first) { meta = event; first = false; if (event.type === 'session') continue; }
    const contentText = (data) => (data?.content ?? [])
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text).join('\n');
    if (event.type === 'user/message') lines.push(`## 用户\n\n${contentText(event.data)}\n`);
    else if (event.type === 'assistant/message') lines.push(`## 助手\n\n${contentText(event.data)}\n`);
    else if (event.type === 'tool/call') lines.push(`- 工具调用：\`${event.data?.name ?? '?'}\``);
  }
  const title = session.title ?? id;
  return `# ${title}\n\n- 会话：${id}\n- 工作区：${meta.cwd ?? session.project}\n- 创建：${new Date(Number(meta.createdAt ?? 0) || Date.now()).toISOString()}\n- 更新时间：${session.updatedAt}\n\n${lines.join('\n')}`;
}

export function descendantIds(id, { root }) {
  const all = listSessions({ root });
  const result = [];
  const queue = [id];
  const seen = new Set([id]);
  while (queue.length > 0) {
    const current = queue.shift();
    for (const child of all) {
      if (child.parentSession === current && !seen.has(child.id)) {
        seen.add(child.id);
        result.push(child.id);
        queue.push(child.id);
      }
    }
  }
  return result;
}

export function emptySessions({ root }) {
  return listSessions({ root }).filter((item) => item.title === undefined && item.preview === undefined);
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
