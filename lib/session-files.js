// DSH session artifact helpers.
//
// Session logs live under <root>/<projectKey(cwd)>/<encodeSegment(id)>/ and
// use a generation filename: session.v<N>.jsonl[.zstd]. The first Zstandard
// frame contains exactly the header line; later frames contain event batches.
// These helpers keep path encoding, generation selection and publication
// identical to the DSH persistence backend.

import {
  closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  readSync, readdirSync, renameSync, rmSync, statSync, writeSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { decompressAllZstdFrames, decompressFirstZstdFrame, encodeZstdFrames, scanZstdFrames } from './compat/zstd-frames.js';

export const ARTIFACT_NAMES = [
  'session.v4.jsonl.zstd',
  'session.v3.jsonl.zstd',
  'session.v2.jsonl.zstd',
  'session.jsonl.zstd',
  'session.jsonl',
];

const HEADER_READ_LIMIT = 4 * 1024 * 1024;

/** Reject anything that is not a single safe session id. */
export function assertSessionId(id) {
  if (typeof id !== 'string' || id.trim() === '' || id === '.' || id === '..'
    || /[\\/\x00-\x1f<>"|?*]/.test(id) || /[. ]$/.test(id)) {
    throw Object.assign(new Error('sessionId 必须是合法的会话标识，不能包含路径或特殊目录名'), { code: 'bad-request' });
  }
  return id;
}

/** Encode one arbitrary string as a single injective path segment. */
export function encodeFsSessionSegment(raw) {
  if (typeof raw !== 'string' || raw.length === 0) throw new Error('cannot encode an empty path segment');
  if (raw === '.') return '~002E';
  if (raw === '..') return '~002E~002E';
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    const ch = String.fromCharCode(code);
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch;
    else out += `~${code.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return out;
}

export function decodeFsSessionSegment(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0) return encoded;
  if (encoded === '~002E') return '.';
  if (encoded === '~002E~002E') return '..';
  return encoded.replace(/~([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Encode a cwd into DSH's project directory key. */
export function encodeProjectSegment(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) throw new Error('cannot encode an empty project path');
  let readable = '';
  let separatorRun = false;
  for (let i = 0; i < cwd.length; i += 1) {
    const code = cwd.charCodeAt(i);
    const ch = String.fromCharCode(code);
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-';
      separatorRun = true;
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch;
      separatorRun = false;
    } else {
      readable += `~${code.toString(16).toUpperCase().padStart(4, '0')}`;
      separatorRun = false;
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`;
}

export function parseSessionGenerationFromFilename(filename) {
  if (typeof filename !== 'string') return undefined;
  const match = filename.match(/^session(?:\.v(\d+))?\.jsonl(?:\.zstd)?$/);
  if (match === null) return undefined;
  return match[1] !== undefined ? Number(match[1]) : 0;
}

export function isZstdArtifact(path) {
  return typeof path === 'string' && path.endsWith('.zstd');
}

/** Canonical artifact filename for one header generation. */
export function artifactNameForHeader(header, zstd = true) {
  const version = Number(header?.version ?? 4);
  const base = version > 0 ? `session.v${version}.jsonl` : 'session.jsonl';
  return zstd ? `${base}.zstd` : base;
}

export function projectDirFor(root, cwd) {
  return join(root, cwd === undefined ? '_no-cwd' : encodeProjectSegment(cwd));
}

export function sessionDirFor(root, cwd, id) {
  assertSessionId(id);
  return join(projectDirFor(root, cwd), encodeFsSessionSegment(id));
}

export function artifactPathFor(root, cwd, id, version = 4, zstd = true) {
  return join(sessionDirFor(root, cwd, id), artifactNameForHeader({ version }, zstd));
}

export function candidateSessionDirs(id) {
  assertSessionId(id);
  const primary = encodeFsSessionSegment(id);
  const candidates = [primary];
  if (id !== primary) candidates.push(id);
  const legacy = `--${id}--`;
  if (!candidates.includes(legacy)) candidates.push(legacy);
  return candidates;
}

/** Resolve a path and verify it is a real session directory under root. */
export function assertSessionDirectory(root, dir, id, { allowMissing = false } = {}) {
  assertSessionId(id);
  if (typeof root !== 'string' || typeof dir !== 'string') throw new Error('无法验证会话目录');
  const base = resolve(root);
  const target = resolve(dir);
  const rel = relative(base, target);
  const parts = rel.split(sep);
  if (isAbsolute(rel) || parts.length !== 2 || parts.some((part) => part === '..' || part === '.' || part === '')
    || !candidateSessionDirs(id).includes(parts[1])) {
    throw new Error('会话目录超出允许范围，已停止文件操作');
  }
  let current = base;
  for (const part of parts) {
    current = join(current, part);
    let info;
    try {
      info = lstatSync(current);
    } catch (error) {
      if (allowMissing && error?.code === 'ENOENT') return target;
      throw error;
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error('会话目录不能是符号链接、junction 或普通文件');
    }
  }
  return target;
}

/** List candidate artifacts in one session directory, newest generation first. */
export function listArtifacts(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const rows = [];
  for (const name of names) {
    const generation = parseSessionGenerationFromFilename(name);
    if (generation === undefined) continue;
    const path = join(dir, name);
    try {
      const stat = statSync(path);
      if (!stat.isFile()) continue;
      rows.push({ path, name, generation, zstd: name.endsWith('.zstd'), size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {
      // vanished between readdir and stat
    }
  }
  rows.sort((a, b) => b.generation - a.generation || Number(b.zstd) - Number(a.zstd));
  return rows;
}

export function chooseArtifact(dir) {
  return listArtifacts(dir)[0];
}

function parseHeaderLine(line) {
  const header = JSON.parse(line);
  if (header === null || typeof header !== 'object' || Array.isArray(header)) throw new Error('会话头不是 JSON 对象');
  assertSessionId(header.id);
  return header;
}

function firstLine(content) {
  const at = content.indexOf('\n');
  if (at < 0) throw new Error('会话工件缺少完整头行');
  return { line: content.slice(0, at), rest: content.slice(at + 1) };
}

/** Read only the header of one artifact, decompressing only its first frame. */
export function readSessionHeader(path) {
  const fd = openSync(path, 'r');
  try {
    let buffer = Buffer.alloc(0);
    while (buffer.length < HEADER_READ_LIMIT) {
      const chunk = Buffer.alloc(64 * 1024);
      const bytes = readSync(fd, chunk, 0, chunk.length, buffer.length);
      if (bytes === 0) break;
      buffer = Buffer.concat([buffer, chunk.subarray(0, bytes)]);
      if (isZstdArtifact(path)) {
        const { frames } = scanZstdFrames(buffer, 1);
        if (frames.length > 0) {
          const decoded = decompressFirstZstdFrame(buffer.subarray(0, frames[0].end));
          return parseHeaderLine(firstLine(decoded.toString('utf8')).line);
        }
      } else if (buffer.includes(10)) {
        return parseHeaderLine(firstLine(buffer.toString('utf8')).line);
      }
    }
    throw new Error('会话头行不完整或超过大小限制');
  } finally {
    closeSync(fd);
  }
}

/** Read a complete artifact. Mutators must never publish a decoded prefix. */
export function readSessionArtifact(path) {
  const bytes = readFileSync(path);
  const zstd = isZstdArtifact(path);
  let content;
  if (zstd) {
    const decoded = decompressAllZstdFrames(bytes);
    if (decoded.torn) throw new Error('会话日志存在截断的 Zstandard 帧，拒绝重写；请先备份并修复');
    content = decoded.content.toString('utf8');
  } else {
    content = bytes.toString('utf8');
  }
  if (content.length > 0 && !content.endsWith('\n')) throw new Error('会话日志存在不完整的尾行，拒绝重写');
  const { line, rest } = firstLine(content);
  return { header: parseHeaderLine(line), content, headerLine: line, rest, path, filename: basename(path), zstd, bytes };
}

/** Encode one artifact, keeping the header alone in the first zstd frame. */
export function encodeSessionArtifact(headerLine, rest, zstd) {
  if (zstd) return encodeZstdFrames(headerLine, rest);
  return Buffer.from(`${headerLine}\n${rest}`, 'utf8');
}

/** Write a file atomically with a temp file + fsync + rename. */
export function writeFileAtomic(path, data, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  const fd = openSync(temp, 'wx', mode);
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    rmSync(temp, { force: true });
    throw error;
  }
  closeSync(fd);
  try {
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
  return path;
}

/** Backup, publish, rollback: never remove a source when its backup failed. */
export function replaceFileAtomic(path, data, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  const backup = `${path}.${randomBytes(6).toString('hex')}.bak`;
  const tempFd = openSync(temp, 'wx', mode);
  try {
    writeSync(tempFd, data);
    fsyncSync(tempFd);
  } catch (error) {
    closeSync(tempFd);
    rmSync(temp, { force: true });
    throw error;
  }
  closeSync(tempFd);
  let hadOriginal = false;
  try {
    if (existsSync(path)) {
      renameSync(path, backup);
      hadOriginal = true;
    }
  } catch (error) {
    rmSync(temp, { force: true });
    throw new Error(`无法备份会话工件，未删除原文件: ${error.message}`, { cause: error });
  }
  try {
    renameSync(temp, path);
  } catch (error) {
    if (hadOriginal) {
      try {
        renameSync(backup, path);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `发布失败且回滚失败；原始会话保留在 ${backup}，新文件保留在 ${temp}`);
      }
    }
    rmSync(temp, { force: true });
    throw new Error(`发布失败，原始会话已恢复: ${error.message}`, { cause: error });
  }
  let retainedBackup;
  if (hadOriginal) {
    try {
      rmSync(backup, { force: true });
    } catch {
      retainedBackup = backup;
    }
  }
  return retainedBackup === undefined ? {} : { backupPath: retainedBackup };
}

/** Publish rewritten content next to an existing artifact. */
export function publishSessionArtifact(path, headerLine, rest, zstd) {
  return replaceFileAtomic(path, encodeSessionArtifact(headerLine, rest, zstd));
}

/** Parse all JSONL events from a content string, skipping malformed lines. */
export function parseEvents(content) {
  const events = [];
  for (const line of content.split('\n')) {
    if (line === '') continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // A read-only projection tolerates an unknown line; mutators do not.
    }
  }
  return events;
}

/** Size of a session directory, tolerating vanished files. */
export function directorySize(dir) {
  let total = 0;
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    const path = join(dir, name);
    try {
      const stat = statSync(path);
      total += stat.isDirectory() ? directorySize(path) : stat.size;
    } catch {
      // ignore
    }
  }
  return total;
}
