// Filesystem session store: list, trash, restore, move, preset migration and
// Markdown export.
//
// Listing reads only the header frame of every artifact. Title / preview /
// last preset are cached by the persistence revision (or artifact mtime +
// size for orphan directories) so a normal refresh does not inflate 27 MB of
// history just to show one row.

import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  artifactNameForHeader, artifactPathFor, assertSessionDirectory, assertSessionId,
  chooseArtifact, directorySize, encodeFsSessionSegment, encodeProjectSegment,
  parseEvents, publishSessionArtifact, readSessionArtifact, readSessionHeader,
  sessionDirFor, writeFileAtomic,
} from './session-files.js';

const META_CACHE_VERSION = 1;
const META_CACHE_LIMIT = 2000;

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function artifactStat(path) {
  try {
    const stat = statSync(path);
    return { mtimeMs: stat.mtimeMs, size: stat.size, updatedAt: iso(stat.mtimeMs) };
  } catch {
    return undefined;
  }
}

function textBlocks(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

/** Extract the display metadata from a logical event list. */
export function metadataFromEvents(events) {
  let title;
  let preview;
  let lastPreset;
  let hasUserMessage = false;
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    if (event.type === 'session/title' && typeof event.data?.title === 'string' && event.data.title.trim() !== '') {
      title = event.data.title.trim();
    } else if (event.type === 'user/message') {
      hasUserMessage = true;
      if (preview === undefined) {
        const text = textBlocks(event.data?.content).trim();
        if (text !== '') preview = text.slice(0, 120);
      }
    } else if (event.type === 'agent-preset/selected' && typeof event.data?.agentPreset === 'string') {
      lastPreset = event.data.agentPreset;
    }
  }
  return { title, preview, lastPreset, hasUserMessage };
}

/** Read metadata from one complete artifact (cache miss only). */
export function metadataFromArtifact(path) {
  const artifact = readSessionArtifact(path);
  const meta = metadataFromEvents(parseEvents(artifact.content));
  return { ...meta, header: artifact.header };
}

/** Bounded on-disk cache keyed by a persistence revision / artifact stamp. */
export class SessionMetaCache {
  constructor(path) {
    this.path = path;
    this.entries = {};
    this.dirty = false;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      if (parsed?.version === META_CACHE_VERSION && parsed.entries !== null && typeof parsed.entries === 'object') {
        this.entries = parsed.entries;
      }
    } catch {
      // Missing or corrupt cache is not an error: it is rebuilt on demand.
    }
  }

  get(id, token) {
    const entry = this.entries[id];
    if (entry === undefined || entry.token !== token) return undefined;
    return entry.meta;
  }

  set(id, token, meta) {
    const previous = this.entries[id];
    if (previous !== undefined && previous.token === token
      && JSON.stringify(previous.meta) === JSON.stringify(meta)) return;
    this.entries[id] = { token, meta };
    this.dirty = true;
  }

  delete(id) {
    if (this.entries[id] === undefined) return;
    delete this.entries[id];
    this.dirty = true;
  }

  /** Drop every cached header/title entry; the next list rebuilds it. */
  clear() {
    this.entries = {};
    this.dirty = true;
  }

  /** Drop entries whose id was removed from disk or trash. */
  retain(ids) {
    const keep = new Set(ids);
    let changed = false;
    for (const id of Object.keys(this.entries)) {
      if (!keep.has(id)) {
        delete this.entries[id];
        changed = true;
      }
    }
    if (changed) this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    const entries = Object.entries(this.entries)
      .sort((a, b) => (b[1]?.meta?.updatedAt ?? '').localeCompare(a[1]?.meta?.updatedAt ?? ''))
      .slice(0, META_CACHE_LIMIT);
    const body = { version: META_CACHE_VERSION, entries: Object.fromEntries(entries) };
    try {
      writeFileAtomic(this.path, Buffer.from(`${JSON.stringify(body, null, 2)}\n`, 'utf8'), 0o600);
      this.dirty = false;
    } catch {
      // A cache failure must never break session management.
    }
  }
}

/** One session directory on disk, header-only. */
function readDiskSession(dir, project) {
  const artifact = chooseArtifact(dir);
  if (artifact === undefined) return undefined;
  try {
    const header = readSessionHeader(artifact.path);
    return {
      id: header.id,
      dir,
      project,
      artifactPath: artifact.path,
      artifactName: artifact.name,
      header,
      sizeBytes: artifact.size,
      updatedAt: iso(artifact.mtimeMs),
      createdAt: iso(header.createdAt),
      parentSession: header.parentSession,
      origin: header.origin,
      delegationDepth: header.delegationDepth ?? 0,
      isSubagent: header.origin === 'subagent' || Number(header.delegationDepth ?? 0) > 0,
    };
  } catch (error) {
    // Keep an unreadable row visible so the user can delete it.
    const id = basename(dir).replace(/^~/, '');
    return {
      id,
      dir,
      project,
      artifactPath: artifact.path,
      artifactName: artifact.name,
      header: { id, version: 0, createdAt: Date.now() },
      error: error instanceof Error ? error.message : String(error),
      sizeBytes: artifact.size,
      updatedAt: iso(artifact.mtimeMs),
      createdAt: iso(artifact.mtimeMs),
      isSubagent: false,
      unreadable: true,
    };
  }
}

/** Scan every session directory under the sessions root (headers only). */
export function scanDiskSessions({ root }) {
  if (!existsSync(root)) return [];
  const rows = [];
  for (const project of readdirSync(root)) {
    const projectDir = join(root, project);
    let entries;
    try {
      entries = readdirSync(projectDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const row = readDiskSession(join(projectDir, entry.name), project);
      if (row !== undefined) rows.push(row);
    }
  }
  const byId = new Map();
  for (const row of rows) {
    const previous = byId.get(row.id);
    if (previous === undefined || String(row.updatedAt).localeCompare(String(previous.updatedAt)) > 0) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

export function findDiskSession(id, { root }) {
  assertSessionId(id);
  return scanDiskSessions({ root }).find((row) => row.id === id);
}

/** Build one list row from a persistence snapshot, live session and cache. */
function buildRow(snapshot, disk, live, cache, root, persistence) {
  const header = snapshot?.header ?? disk?.header;
  if (header === undefined) return undefined;
  let artifactPath = disk?.artifactPath;
  if (artifactPath === undefined && snapshot !== undefined) {
    try {
      artifactPath = persistence?.locate?.(header)?.path;
    } catch {
      artifactPath = undefined;
    }
    if (typeof artifactPath !== 'string') {
      const cwd = header.cwd;
      artifactPath = artifactPathFor(root, cwd, header.id, header.version, true);
    }
  }
  const artifact = artifactPath === undefined ? undefined : artifactStat(artifactPath);
  const dir = artifactPath === undefined ? (disk?.dir ?? '') : dirname(artifactPath);

  let events;
  if (live !== undefined) {
    try {
      if (typeof live.ownEvents === 'function') events = live.ownEvents();
      else if (Array.isArray(live.events)) events = live.events;
      else if (Array.isArray(live.log)) events = live.log;
    } catch {
      events = undefined;
    }
  }

  const liveToken = live === undefined
    ? undefined
    : `live:${String(live.seq ?? (Array.isArray(events) ? events.length : 0))}:${header.agentPreset ?? ''}`;
  const diskToken = artifact === undefined ? undefined : `file:${artifact.mtimeMs}:${artifact.size}`;
  const token = snapshot?.revision !== undefined
    ? `rev:${String(snapshot.revision)}:${liveToken ?? ''}`
    : (liveToken ?? diskToken ?? `header:${header.createdAt}`);

  let meta = cache.get(header.id, token);
  if (meta === undefined) {
    if (Array.isArray(events)) {
      meta = metadataFromEvents(events);
    } else if (artifactPath !== undefined && artifact !== undefined) {
      try {
        meta = metadataFromArtifact(artifactPath);
      } catch {
        meta = {};
      }
    } else {
      meta = {};
    }
    cache.set(header.id, token, meta);
  }

  const sizeBytes = artifact?.size ?? snapshot?.sizeBytes ?? disk?.sizeBytes;
  const updatedAt = artifact?.updatedAt ?? disk?.updatedAt ?? iso(header.createdAt);
  const createdAt = iso(header.createdAt);
  return {
    id: header.id,
    dir,
    project: disk?.project ?? (header.cwd === undefined ? '_no-cwd' : encodeProjectSegment(header.cwd)),
    artifactPath,
    title: meta.title ?? (typeof header.title === 'string' && header.title !== '' ? header.title : undefined),
    preview: meta.preview,
    cwd: header.cwd,
    origin: header.origin,
    delegationDepth: header.delegationDepth ?? 0,
    parentSession: header.parentSession,
    isSubagent: header.origin === 'subagent' || Number(header.delegationDepth ?? 0) > 0,
    createdAt,
    updatedAt,
    sizeBytes,
    eventCount: snapshot?.eventCount ?? (Array.isArray(events) ? events.length : undefined),
    formatStatus: snapshot?.formatStatus,
    agentPreset: header.agentPreset,
    lastPreset: meta.lastPreset,
    isLive: live !== undefined,
    liveSeq: live?.seq,
    hasUserMessage: meta.hasUserMessage === true,
    error: disk?.error,
    unreadable: disk?.unreadable === true,
    archived: false,
    pinned: false,
  };
}

/**
 * List sessions from DSH persistence plus disk orphans.
 *
 * @param {object} options
 * @param {string} options.root
 * @param {object|undefined} options.persistence DSH sessionPersistence service
 * @param {object|undefined} options.sessions DSH in-memory session store
 * @param {SessionMetaCache} options.cache
 */
export async function listSessions({ root, persistence, sessions, cache }) {
  const diskRows = scanDiskSessions({ root });
  const diskById = new Map(diskRows.map((row) => [row.id, row]));
  let snapshots = [];
  if (persistence !== undefined && typeof persistence.list === 'function') {
    try {
      snapshots = await persistence.list();
    } catch {
      snapshots = [];
    }
  }
  const snapshotById = new Map();
  for (const snapshot of snapshots) {
    const header = snapshot?.header;
    if (header?.id === undefined) continue;
    snapshotById.set(header.id, snapshot);
  }

  const ids = new Set([...snapshotById.keys(), ...diskById.keys()]);
  const rows = [];
  for (const id of ids) {
    const snapshot = snapshotById.get(id);
    const disk = diskById.get(id);
    let live;
    try {
      live = sessions?.get?.(id);
    } catch {
      live = undefined;
    }
    const row = buildRow(snapshot, disk, live, cache, root, persistence);
    if (row !== undefined) rows.push(row);
  }
  cache.retain(rows.map((row) => row.id));
  rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return rows;
}

function descendants(all, id) {
  const result = [];
  const queue = [id];
  const seen = new Set([id]);
  while (queue.length > 0) {
    const current = queue.shift();
    for (const child of all) {
      if (child.parentSession === current && !seen.has(child.id)) {
        seen.add(child.id);
        result.push(child);
        queue.push(child.id);
      }
    }
  }
  return result;
}

export function descendantIds(id, { root }) {
  const all = scanDiskSessions({ root });
  return descendants(all, id).map((row) => row.id);
}

/** Move one session directory into the local trash, children first. */
export function trashSession(id, { root, trashRoot }, options = {}) {
  assertSessionId(id);
  const all = Array.isArray(options.rows) ? options.rows : scanDiskSessions({ root });
  const session = all.find((row) => row.id === id);
  if (session === undefined) throw new Error(`会话 "${id}" 不存在`);
  const targets = [session];
  if (options.includeChildren === true) {
    for (const child of descendants(all, id)) targets.push(child);
  }
  for (const target of targets) {
    assertSessionDirectory(root, target.dir, target.id);
    if (existsSync(join(trashRoot, target.id))) throw new Error(`回收站中已存在条目 "${target.id}"`);
  }
  const moved = [];
  const rollback = [];
  try {
    // Deepest children first, parent last.
    for (const target of [...targets].reverse()) {
      const destination = join(trashRoot, target.id);
      mkdirSync(destination, { recursive: true });
      const payload = join(destination, 'payload');
      renameSync(target.dir, payload);
      rollback.push({ target, destination, payload });
      writeFileSync(join(destination, 'meta.json'), `${JSON.stringify({
        id: target.id,
        origin: target.dir,
        project: target.project,
        parentSession: target.parentSession,
        title: target.title,
        preview: target.preview,
        header: target.header,
        trashedAt: new Date().toISOString(),
        workspaceId: options.workspaceId,
        workspacePath: options.workspacePath,
      }, null, 2)}\n`, { mode: 0o600 });
      moved.push(target.id);
    }
  } catch (error) {
    for (const item of rollback.reverse()) {
      try {
        // Move the payload back BEFORE removing the trash shell. Deleting the
        // destination first would destroy the only copy when meta writing is
        // what failed.
        if (existsSync(item.payload)) {
          mkdirSync(dirname(item.target.dir), { recursive: true });
          renameSync(item.payload, item.target.dir);
        }
        rmSync(item.destination, { recursive: true, force: true });
      } catch {
        // A failed rollback is reported through the original error. Leave the
        // trash payload in place when it cannot be moved back.
      }
    }
    throw error;
  }
  return { id, moved };
}

export function listTrash({ trashRoot }) {
  if (!existsSync(trashRoot)) return [];
  const rows = [];
  for (const id of readdirSync(trashRoot)) {
    const dir = join(trashRoot, id);
    try {
      const info = statSync(dir);
      if (!info.isDirectory()) continue;
    } catch {
      continue;
    }
    const metaPath = join(dir, 'meta.json');
    if (!existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      rows.push({ ...meta, dir, size: directorySize(dir) });
    } catch {
      // Malformed trash entries stay hidden but are never deleted implicitly.
    }
  }
  return rows.sort((a, b) => String(b.trashedAt).localeCompare(String(a.trashedAt)));
}

function inside(root, target) {
  const base = `${root.replace(/\/+$/, '')}/`;
  return target === root || `${target.replace(/\/+$/, '')}/`.startsWith(base);
}

export function restoreSession(id, { root, trashRoot }) {
  assertSessionId(id);
  const dir = join(trashRoot, id);
  if (!inside(trashRoot, dir) || !existsSync(join(dir, 'meta.json'))) throw new Error(`回收站条目 "${id}" 不存在`);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const origin = typeof meta.origin === 'string' && meta.origin !== ''
    ? meta.origin
    : sessionDirFor(root, meta.header?.cwd, id);
  assertSessionDirectory(root, origin, id, { allowMissing: true });
  if (existsSync(origin)) throw new Error(`恢复目标已存在：${origin}`);
  const payload = join(dir, 'payload');
  if (!existsSync(payload)) throw new Error('回收站条目缺少 payload');
  mkdirSync(dirname(origin), { recursive: true });
  renameSync(payload, origin);
  rmSync(dir, { recursive: true, force: true });
  return { id, origin, meta };
}

/** Restore one trashed session and every trashed descendant that was moved
 * with it. Parent-first order keeps the original project directories valid. */
export function restoreSessionTree(id, paths, seen = new Set()) {
  assertSessionId(id);
  if (seen.has(id)) throw new Error(`无法恢复 "${id}"：回收站条目出现循环引用`);
  seen.add(id);
  const result = restoreSession(id, paths);
  const children = [];
  const warnings = [];
  for (const entry of listTrash(paths)) {
    if (entry.parentSession !== id) continue;
    try {
      children.push(restoreSessionTree(entry.id, paths, seen));
    } catch (error) {
      warnings.push({ id: entry.id, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ...result, children, ...(warnings.length > 0 ? { warnings } : {}) };
}

/** Permanently remove one trashed session and every trashed descendant.
 * Children are removed first so a parent purge never leaves orphan rows. */
export function purgeSessionTree(id, paths, seen = new Set()) {
  assertSessionId(id);
  if (seen.has(id)) throw new Error(`无法彻底删除 "${id}"：回收站条目出现循环引用`);
  seen.add(id);
  const purged = [];
  for (const entry of listTrash(paths)) {
    if (entry.parentSession !== id) continue;
    purged.push(...purgeSessionTree(entry.id, paths, seen).purged);
  }
  purgeSession(id, paths);
  return { id, purged: [...purged, id] };
}

export function purgeSession(id, { trashRoot }) {
  assertSessionId(id);
  const dir = join(trashRoot, id);
  if (!inside(trashRoot, dir) || !existsSync(dir)) throw new Error(`回收站条目 "${id}" 不存在`);
  rmSync(dir, { recursive: true, force: true });
  return { id };
}

/**
 * Move one cold session to another workspace directory.
 *
 * DSH indexes a session by the immutable header cwd, so a real move rewrites
 * the header and relocates the whole session directory to the target project
 * key. Live sessions must be switched away from before moving: the writer and
 * in-memory header cannot be safely rebound from a plugin.
 */
export function moveSession(id, targetPath, { root }) {
  assertSessionId(id);
  if (typeof targetPath !== 'string' || targetPath === '') throw new Error('目标工作区路径无效');
  const session = findDiskSession(id, { root });
  if (session === undefined) throw new Error(`会话 "${id}" 不存在`);
  const artifact = readSessionArtifact(session.artifactPath);
  if (artifact.header.cwd === targetPath) {
    return { moved: false, id, cwd: targetPath, artifactPath: session.artifactPath, dir: session.dir };
  }
  const nextHeader = { ...artifact.header, cwd: targetPath };
  const headerLine = JSON.stringify(nextHeader);
  const targetDir = sessionDirFor(root, targetPath, id);
  const targetName = artifactNameForHeader(nextHeader, artifact.zstd);
  const targetPathFile = join(targetDir, targetName);

  if (targetDir === session.dir) {
    // Same project key: rewrite only the header in place.
    const published = publishSessionArtifact(targetPathFile, headerLine, artifact.rest, artifact.zstd);
    if (targetPathFile !== session.artifactPath && existsSync(session.artifactPath)) {
      rmSync(session.artifactPath, { force: true });
    }
    const check = readSessionHeader(targetPathFile);
    if (check.cwd !== targetPath) throw new Error('移动后头校验失败');
    return {
      moved: true, id, from: session.dir, to: targetDir, artifactPath: targetPathFile,
      oldCwd: artifact.header.cwd, cwd: targetPath, backupPath: published.backupPath,
    };
  }

  if (existsSync(targetDir)) throw new Error(`目标目录已存在：${targetDir}`);
  mkdirSync(dirname(targetDir), { recursive: true });
  renameSync(session.dir, targetDir);
  let published = false;
  try {
    const publication = publishSessionArtifact(targetPathFile, headerLine, artifact.rest, artifact.zstd);
    published = true;
    if (targetPathFile !== join(targetDir, basename(session.artifactPath))) {
      const stale = join(targetDir, basename(session.artifactPath));
      if (existsSync(stale)) rmSync(stale, { force: true });
    }
    const check = readSessionHeader(targetPathFile);
    if (check.cwd !== targetPath) throw new Error('移动后头校验失败');
    return {
      moved: true, id, from: session.dir, to: targetDir, artifactPath: targetPathFile,
      oldCwd: artifact.header.cwd, cwd: targetPath, backupPath: publication.backupPath,
    };
  } catch (error) {
    if (!published) {
      try {
        if (existsSync(targetDir)) {
          // Keep .bak files: if publication rollback failed they are the only
          // intact copy of the original artifact.
          for (const name of readdirSync(targetDir)) {
            if (name.endsWith('.tmp')) rmSync(join(targetDir, name), { force: true });
          }
          renameSync(targetDir, session.dir);
        }
      } catch {
        // Preserve the original error; the session directory is still under root.
      }
    } else if (error instanceof Error) {
      error.message = `${error.message}；会话已位于 ${targetDir}`;
    }
    throw error;
  }
}

/** Rewrite the effective Agent preset of one cold session in place. */
export function migrateSessionPreset(id, toPreset, { root }) {
  assertSessionId(id);
  if (typeof toPreset !== 'string' || toPreset.trim() === '') throw new Error('目标预设不能为空');
  const session = findDiskSession(id, { root });
  if (session === undefined) throw new Error(`会话 "${id}" 不存在`);
  const artifact = readSessionArtifact(session.artifactPath);
  const lines = artifact.content.split('\n');
  let header = artifact.header;
  let selectedIndex = -1;
  let oldPreset = header.agentPreset;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === '') continue;
    let event;
    try {
      event = JSON.parse(lines[index]);
    } catch {
      continue;
    }
    if (event?.type === 'agent-preset/selected' && typeof event.data?.agentPreset === 'string') {
      selectedIndex = index;
      oldPreset = event.data.agentPreset;
    }
  }
  if (oldPreset === toPreset) return { id, migrated: false, oldPreset, newPreset: toPreset };
  if (selectedIndex >= 0) {
    const event = JSON.parse(lines[selectedIndex]);
    event.data = { ...event.data, agentPreset: toPreset };
    lines[selectedIndex] = JSON.stringify(event);
  } else {
    header = { ...header, agentPreset: toPreset };
    lines[0] = JSON.stringify(header);
  }
  const rest = lines.slice(1).join('\n');
  const published = publishSessionArtifact(session.artifactPath, lines[0], rest, artifact.zstd);
  const check = readSessionArtifact(session.artifactPath);
  if (check.header.id !== id) throw new Error('预设迁移后头校验失败');
  return {
    id, migrated: true, oldPreset, newPreset: toPreset, artifactPath: session.artifactPath,
    backupPath: published.backupPath,
  };
}

/** Render one session as Markdown. */
export function exportSession(id, { root }, options = {}) {
  const session = findDiskSession(id, { root });
  if (session === undefined) throw new Error(`会话 "${id}" 不存在`);
  const artifact = readSessionArtifact(session.artifactPath);
  const events = parseEvents(artifact.content);
  const meta = metadataFromEvents(events);
  const title = meta.title ?? (typeof artifact.header.title === 'string' ? artifact.header.title : undefined) ?? id;
  const parts = [];
  parts.push(`# ${title}`);
  parts.push('');
  parts.push(`- 会话：${id}`);
  parts.push(`- 工作区：${artifact.header.cwd ?? session.project}`);
  parts.push(`- 创建：${iso(artifact.header.createdAt)}`);
  parts.push(`- 更新时间：${session.updatedAt}`);
  if (artifact.header.agentPreset !== undefined) parts.push(`- 预设：${artifact.header.agentPreset}`);
  if (meta.lastPreset !== undefined) parts.push(`- 最近预设：${meta.lastPreset}`);
  if (options.annotation !== undefined) {
    const mark = options.annotation;
    if (mark.favorite === true) parts.push('- 收藏：是');
    if (mark.reviewLater === true) parts.push('- 待回看：是');
    if (mark.priority !== undefined && mark.priority !== null) parts.push(`- 优先级：${mark.priority}`);
    if (Array.isArray(mark.tags) && mark.tags.length > 0) parts.push(`- 标签：${mark.tags.join(', ')}`);
    if (typeof mark.note === 'string' && mark.note.trim() !== '') parts.push(`- 备注：${mark.note.trim()}`);
  }
  parts.push('');
  const pushText = (label, text) => {
    const trimmed = String(text ?? '').trim();
    if (trimmed === '') return;
    parts.push(`## ${label}`);
    parts.push('');
    parts.push(trimmed);
    parts.push('');
  };
  for (const event of events) {
    if (event.type === 'user/message') {
      pushText('用户', textBlocks(event.data?.content));
    } else if (event.type === 'assistant/message') {
      pushText('助手', textBlocks(event.data?.message?.content));
    } else if (event.type === 'tool/call') {
      const name = event.data?.name ?? '?';
      const args = typeof event.data?.arguments === 'string' ? event.data.arguments : '';
      const summary = args.length > 800 ? `${args.slice(0, 800)}…` : args;
      parts.push(`> 工具调用：\`${name}\`${summary === '' ? '' : `\n>\n> \`\`\`json\n> ${summary.replace(/\n/g, '\n> ')}\n> \`\`\``}`);
      parts.push('');
    } else if (event.type === 'tool/result') {
      const text = textBlocks(event.data?.message?.content);
      if (text.trim() !== '') {
        const summary = text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
        parts.push(`> 工具结果：\n>\n> ${summary.replace(/\n/g, '\n> ')}`);
        parts.push('');
      }
    }
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n');
}
