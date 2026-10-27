import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  SessionMetaCache, descendantIds, exportSession, listSessions, listTrash, migrateSessionPreset,
  moveSession, purgeSession, purgeSessionTree, restoreSession, restoreSessionTree, scanDiskSessions, trashSession,
} from '../lib/store.js';
import { encodeSessionArtifact, readSessionArtifact, readSessionHeader, writeFileAtomic } from '../lib/session-files.js';

const HEADER = {
  type: 'session', version: 4, createdAt: 1, isSeeded: false, delegationDepth: 0, cwd: '/w',
};

function writeSession(root, project, id, header, events = []) {
  const dir = join(root, project, id);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'session.v4.jsonl.zstd');
  const body = events.length === 0 ? '' : `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
  writeFileAtomic(path, encodeSessionArtifact(JSON.stringify({ ...HEADER, ...header, id }), body, true));
  return { dir, path, body };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-session-root-'));
  const trashRoot = mkdtempSync(join(tmpdir(), 'dsh-session-trash-'));
  const events = [
    { type: 'user/message', seq: 0, time: 1, data: { role: 'user', content: [{ type: 'text', text: 'Hello world' }] } },
    { type: 'agent-preset/selected', seq: 1, time: 2, data: { agentPreset: 'standard' } },
    { type: 'session/title', seq: 2, time: 3, data: { title: 'A title' } },
    { type: 'assistant/message', seq: 3, time: 4, data: { message: { role: 'assistant', content: [{ type: 'text', text: 'A reply' }] } } },
  ];
  const session = writeSession(root, '--w--', 'session-abc', { cwd: '/w' }, events);
  return { root, trashRoot, events, ...session, cache: new SessionMetaCache(join(trashRoot, 'cache.json')) };
}

test('header-only scan and cached list preserve title/preview', async () => {
  const paths = fixture();
  const scanned = scanDiskSessions(paths);
  assert.equal(scanned.length, 1);
  assert.equal(scanned[0].id, 'session-abc');
  const rows = await listSessions({ root: paths.root, sessions: undefined, persistence: undefined, cache: paths.cache });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'A title');
  assert.equal(rows[0].preview, 'Hello world');
  assert.equal(rows[0].lastPreset, 'standard');
  assert.equal(rows[0].isSubagent, false);
  assert.match(rows[0].updatedAt, /^\d{4}-/);
});

test('trash, list, restore and purge round-trip', async () => {
  const paths = fixture();
  const result = trashSession('session-abc', paths);
  assert.deepEqual(result.moved, ['session-abc']);
  assert.equal(existsSync(paths.dir), false);
  const entries = listTrash(paths);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].origin, paths.dir);
  restoreSession('session-abc', paths);
  assert.equal(existsSync(join(paths.dir, 'session.v4.jsonl.zstd')), true);
  assert.equal(listTrash(paths).length, 0);

  trashSession('session-abc', paths);
  purgeSession('session-abc', paths);
  assert.equal(listTrash(paths).length, 0);
  assert.throws(() => purgeSession('session-abc', paths), /不存在/);
});

test('rejects unknown ids and duplicate trash entries', async () => {
  const paths = fixture();
  assert.throws(() => trashSession('session-nope', paths), /不存在/);
  trashSession('session-abc', paths);
  assert.throws(() => trashSession('session-abc', paths), /不存在/);
});

test('move rewrites the header, relocates the directory and keeps events', () => {
  const paths = fixture();
  const target = '/tmp/target-workspace';
  const result = moveSession('session-abc', target, paths);
  assert.equal(result.moved, true);
  assert.equal(result.oldCwd, '/w');
  assert.equal(existsSync(paths.dir), false);
  assert.equal(existsSync(result.artifactPath), true);
  const header = readSessionHeader(result.artifactPath);
  assert.equal(header.cwd, target);
  const artifact = readSessionArtifact(result.artifactPath);
  assert.match(artifact.content, /Hello world/);
  assert.match(artifact.content, /A reply/);
  assert.equal(result.artifactPath.endsWith('session.v4.jsonl.zstd'), true);
});

test('moving to the same cwd is a no-op', () => {
  const paths = fixture();
  const result = moveSession('session-abc', '/w', paths);
  assert.equal(result.moved, false);
  assert.equal(existsSync(paths.dir), true);
});

test('preset migration rewrites the last selected event', () => {
  const paths = fixture();
  const result = migrateSessionPreset('session-abc', 'ptc', paths);
  assert.equal(result.migrated, true);
  assert.equal(result.oldPreset, 'standard');
  const artifact = readSessionArtifact(paths.path);
  const selected = artifact.content.split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((event) => event.type === 'agent-preset/selected');
  assert.equal(selected.length, 1);
  assert.equal(selected[0].data.agentPreset, 'ptc');
});

test('preset migration falls back to the header when no event exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-session-root-'));
  const trashRoot = mkdtempSync(join(tmpdir(), 'dsh-session-trash-'));
  const session = writeSession(root, '--w--', 'session-no-preset', { cwd: '/w', agentPreset: 'standard' }, []);
  const result = migrateSessionPreset('session-no-preset', 'ptc', { root, trashRoot });
  assert.equal(result.migrated, true);
  assert.equal(readSessionHeader(session.path).agentPreset, 'ptc');
});

test('markdown export includes metadata and messages', () => {
  const paths = fixture();
  const markdown = exportSession('session-abc', paths, { annotation: { favorite: true, priority: 2, tags: ['work'], note: 'n' } });
  assert.match(markdown, /^# A title/m);
  assert.match(markdown, /Hello world/);
  assert.match(markdown, /A reply/);
  assert.match(markdown, /优先级：2/);
  assert.match(markdown, /标签：work/);
});

test('trash with children moves the whole subtree', () => {
  const paths = fixture();
  writeSession(paths.root, '--w--', 'session-child', {
    cwd: '/w', parentSession: 'session-abc', origin: 'subagent', delegationDepth: 1,
  });
  assert.deepEqual(descendantIds('session-abc', paths), ['session-child']);
  const result = trashSession('session-abc', paths, { includeChildren: true });
  assert.equal(result.moved.includes('session-abc'), true);
  assert.equal(result.moved.includes('session-child'), true);
  assert.equal(listTrash(paths).length, 2);
  const restored = restoreSessionTree('session-abc', paths);
  assert.equal(restored.children.length, 1);
  assert.equal(existsSync(join(paths.root, '--w--', 'session-child')), true);
  assert.equal(listTrash(paths).length, 0);
});

test('purging a parent also purges its trashed descendants', () => {
  const paths = fixture();
  writeSession(paths.root, '--w--', 'session-child', {
    cwd: '/w', parentSession: 'session-abc', origin: 'subagent', delegationDepth: 1,
  });
  trashSession('session-abc', paths, { includeChildren: true });
  assert.equal(listTrash(paths).length, 2);
  const result = purgeSessionTree('session-abc', paths);
  assert.deepEqual(result.purged.sort(), ['session-abc', 'session-child']);
  assert.equal(listTrash(paths).length, 0);
  assert.equal(existsSync(join(paths.root, '--w--', 'session-abc')), false);
});
