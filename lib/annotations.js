// Per-session annotations (favorite / review later / priority / tags / note).
//
// Annotations live outside session artifacts: no history rewriting, no
// workspace mutation, no model calls. Writes are serialized in-process and
// cross-process with an advisory lock, then published with an atomic rename.

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { assertSessionId, writeFileAtomic } from './session-files.js';

export const DEFAULT_ANNOTATION = Object.freeze({
  favorite: false,
  reviewLater: false,
  tags: Object.freeze([]),
  note: '',
  priority: null,
  revision: 0,
});
export const ANNOTATION_LIMITS = Object.freeze({ tags: 20, tagLength: 32, noteLength: 2000 });
const FIELDS = new Set(['favorite', 'reviewLater', 'tags', 'note', 'priority']);
const LOCK_WAIT_MS = 3000;
const LOCK_STALE_MS = 10_000;

let filePath = `${homedir()}/.dsh/dsh-plugins/dsh-session/annotations.json`;

const fail = (message, code = 'bad-request') => Object.assign(new Error(message), { code });
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function setAnnotationsPath(path) { filePath = path; }
export function getAnnotationsPath() { return filePath; }

export function normalizeAnnotationPatch(patch) {
  if (!isRecord(patch) || Object.keys(patch).length === 0) throw fail('标记更新不能为空');
  const out = {};
  for (const key of Object.keys(patch)) {
    if (!FIELDS.has(key)) throw fail(`未知的标记字段: ${key}`);
    const value = patch[key];
    if (key === 'favorite' || key === 'reviewLater') {
      if (typeof value !== 'boolean') throw fail('收藏和待回看必须是布尔值');
      out[key] = value;
    } else if (key === 'priority') {
      if (value !== null && (!Number.isInteger(value) || value < 1 || value > 5)) {
        throw fail('优先级必须为 1–5 的整数，或未设置（null）');
      }
      out.priority = value;
    } else if (key === 'note') {
      if (typeof value !== 'string' || value.length > ANNOTATION_LIMITS.noteLength || value.includes('\0')) {
        throw fail('备注最多 2000 字符，不能包含空字符');
      }
      out.note = value;
    } else {
      if (!Array.isArray(value)) throw fail('标签必须是数组');
      const tags = [];
      const seen = new Set();
      for (const item of value) {
        if (typeof item !== 'string') throw fail('标签必须是文本');
        const tag = item.trim();
        if (tag === '') continue;
        if (tag.length > ANNOTATION_LIMITS.tagLength || /[,，\x00-\x1f]/.test(tag)) {
          throw fail('每个标签最多 32 字符，不能包含逗号或控制字符');
        }
        const folded = tag.toLowerCase();
        if (!seen.has(folded)) {
          tags.push(tag);
          seen.add(folded);
        }
      }
      if (tags.length > ANNOTATION_LIMITS.tags) throw fail('每个会话最多 20 个标签');
      out.tags = tags;
    }
  }
  return out;
}

function normalizeEntry(raw, revisionFallback = 1) {
  if (!isRecord(raw)) throw fail('会话标记条目损坏', 'annotations-corrupt');
  const patch = normalizeAnnotationPatch({
    favorite: raw.favorite === true,
    reviewLater: raw.reviewLater === true,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    note: typeof raw.note === 'string' ? raw.note : '',
    priority: raw.priority === undefined ? null : raw.priority,
  });
  const revision = Number.isSafeInteger(raw.revision) && raw.revision > 0 ? raw.revision : revisionFallback;
  const updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0;
  return { ...DEFAULT_ANNOTATION, ...patch, revision, updatedAt };
}

function normalizeState(raw) {
  if (!isRecord(raw)) return { version: 1, sessions: {} };
  // Legacy files may be a bare sessions map or the current versioned shape.
  const source = isRecord(raw.sessions) ? raw.sessions : (raw.version === undefined ? raw : {});
  const sessions = {};
  let fallback = 1;
  for (const [id, entry] of Object.entries(source)) {
    assertSessionId(id);
    sessions[id] = normalizeEntry(entry, fallback);
    fallback += 1;
  }
  return { version: 1, sessions };
}

function readStateSync() {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return normalizeState(parsed);
  } catch (error) {
    if (error?.code === 'ENOENT') return { version: 1, sessions: {} };
    throw fail(`会话标记文件损坏或版本不兼容，已停止写入；请先备份并检查 ${filePath}`, 'annotations-corrupt');
  }
}

async function readState() {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    return normalizeState(parsed);
  } catch (error) {
    if (error?.code === 'ENOENT') return { version: 1, sessions: {} };
    throw fail(`会话标记文件损坏或版本不兼容，已停止写入；请先备份并检查 ${filePath}`, 'annotations-corrupt');
  }
}

async function publish(state) {
  const body = Buffer.from(`${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  writeFileAtomic(filePath, body, 0o600);
}

async function withLock(operation) {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const lockPath = `${filePath}.lock`;
  const token = JSON.stringify({ pid: process.pid, token: randomBytes(12).toString('hex') });
  const deadline = Date.now() + LOCK_WAIT_MS;
  let handle;
  while (handle === undefined) {
    try {
      handle = await open(lockPath, 'wx', 0o600);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const info = statSync(lockPath);
        if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
          rmSync(lockPath, { force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) {
        throw fail(`会话标记正由其他进程写入，请稍后重试；若进程异常退出，请确认无写入后检查锁文件 ${lockPath}`, 'annotations-busy');
      }
      await delay(25);
    }
  }
  let stamped = false;
  try {
    await handle.writeFile(token);
    stamped = true;
    return await operation();
  } finally {
    await handle.close().catch(() => {});
    if (stamped) {
      const current = await readFile(lockPath, 'utf8').catch(() => undefined);
      if (current === token) await rm(lockPath, { force: true }).catch(() => {});
    } else {
      // The token write failed, so this process still owns an empty lock file.
      await rm(lockPath, { force: true }).catch(() => {});
    }
  }
}

export function createAnnotationStore(path = filePath) {
  setAnnotationsPath(path);
  let queue = Promise.resolve();
  const enqueue = (operation) => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  return {
    path: filePath,
    async list() {
      return (await readState()).sessions;
    },
    update(id, patch, expectedRevision) {
      assertSessionId(id);
      const normalized = normalizeAnnotationPatch(patch);
      if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
        throw fail('标记版本号无效');
      }
      return enqueue(() => withLock(async () => {
        const state = await readState();
        const previous = state.sessions[id] ?? DEFAULT_ANNOTATION;
        if (expectedRevision !== undefined && expectedRevision !== previous.revision) {
          throw fail('标记已被其他窗口修改，请载入最新内容后再保存', 'annotation-conflict');
        }
        if (Object.keys(normalized).every((key) => JSON.stringify(previous[key]) === JSON.stringify(normalized[key]))) {
          return { ...previous };
        }
        const next = {
          ...previous,
          ...normalized,
          revision: previous.revision + 1,
          updatedAt: Date.now(),
        };
        await publish({ version: 1, sessions: { ...state.sessions, [id]: next } });
        return next;
      }));
    },
    batchUpdate(ids, patch, expectedRevisions) {
      const normalized = normalizeAnnotationPatch(patch);
      const idList = Array.from(new Set((Array.isArray(ids) ? ids : [])
        .filter((id) => typeof id === 'string' && id.trim() !== '')
        .map((id) => id.trim())));
      if (idList.length === 0) throw fail('sessionIds 必须是非空数组');
      if (idList.length > 200) throw fail('单次批量最多 200 条');
      for (const id of idList) assertSessionId(id);
      return enqueue(() => withLock(async () => {
        const state = await readState();
        const nextSessions = { ...state.sessions };
        const items = [];
        let success = 0;
        let failed = 0;
        let skipped = 0;
        for (const id of idList) {
          try {
            const previous = nextSessions[id] ?? DEFAULT_ANNOTATION;
            const expected = expectedRevisions instanceof Map
              ? expectedRevisions.get(id)
              : (isRecord(expectedRevisions) ? expectedRevisions[id] : undefined);
            if (expected !== undefined && expected !== previous.revision) {
              throw fail('标记已被其他窗口修改，请载入最新内容后再保存', 'annotation-conflict');
            }
            if (Object.keys(normalized).every((key) => JSON.stringify(previous[key]) === JSON.stringify(normalized[key]))) {
              items.push({ sessionId: id, status: 'success', annotation: { ...previous }, unchanged: true });
              success += 1;
              continue;
            }
            const next = {
              ...previous,
              ...normalized,
              revision: previous.revision + 1,
              updatedAt: Date.now(),
            };
            nextSessions[id] = next;
            items.push({ sessionId: id, status: 'success', annotation: next });
            success += 1;
          } catch (error) {
            const code = typeof error?.code === 'string' ? error.code : undefined;
            items.push({ sessionId: id, status: 'failed', code, error: error?.message ?? String(error) });
            failed += 1;
          }
        }
        if (items.some((item) => item.status === 'success' && !item.unchanged)) {
          await publish({ version: 1, sessions: nextSessions });
        }
        return { summary: { total: idList.length, success, failed, skipped }, items };
      }));
    },
    async importAll(sessions) {
      if (!isRecord(sessions)) throw fail('sessions 必须是对象');
      return enqueue(() => withLock(async () => {
        const next = normalizeState({ version: 1, sessions });
        await publish(next);
        return { count: Object.keys(next.sessions).length };
      }));
    },
    remove(id) {
      assertSessionId(id);
      return enqueue(() => withLock(async () => {
        const state = await readState();
        if (state.sessions[id] === undefined) return false;
        const sessions = { ...state.sessions };
        delete sessions[id];
        await publish({ version: 1, sessions });
        return true;
      }));
    },
  };
}

// Synchronous helpers used by tests and by read-only callers.
export function readAnnotations() {
  return readStateSync().sessions;
}

export function writeAnnotations(sessions) {
  // Refuse to replace a corrupt file with a fresh partial state.
  readStateSync();
  const state = normalizeState({ version: 1, sessions });
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  const temp = `${filePath}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, filePath);
  return state.sessions;
}

export function patchAnnotation(id, patch) {
  assertSessionId(id);
  const normalized = normalizeAnnotationPatch(patch);
  const sessions = readAnnotations();
  const previous = sessions[id] ?? DEFAULT_ANNOTATION;
  const next = {
    ...previous,
    ...normalized,
    revision: previous.revision + 1,
    updatedAt: Date.now(),
  };
  writeAnnotations({ ...sessions, [id]: next });
  return next;
}
