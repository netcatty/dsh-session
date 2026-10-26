import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listSessions, listTrash, purgeSession, restoreSession, trashSession } from '../lib/store.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-session-root-'));
  const trashRoot = mkdtempSync(join(tmpdir(), 'dsh-session-trash-'));
  const dir = join(root, 'project', 'session-abc');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'session.jsonl'), `${JSON.stringify({ id: 'abc', title: 'Hello', cwd: '/w', createdAt: '2026-01-01T00:00:00Z' })}\n{"type":"message"}\n`);
  return { root, trashRoot, dir };
}

test('list sessions reads the header', () => {
  const paths = fixture();
  const sessions = listSessions(paths);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'abc');
  assert.equal(sessions[0].title, 'Hello');
});

test('trash, list, restore round-trip', () => {
  const paths = fixture();
  trashSession('abc', paths);
  assert.equal(existsSync(paths.dir), false);
  const entries = listTrash(paths);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].origin, paths.dir);
  restoreSession('abc', paths);
  assert.equal(existsSync(join(paths.dir, 'session.jsonl')), true);
  assert.equal(listTrash(paths).length, 0);
});

test('purge removes the trash entry permanently', () => {
  const paths = fixture();
  trashSession('abc', paths);
  purgeSession('abc', paths);
  assert.equal(listTrash(paths).length, 0);
});

test('rejects unknown ids and duplicate trash', () => {
  const paths = fixture();
  assert.throws(() => trashSession('nope', paths), /not found/);
  trashSession('abc', paths);
  assert.throws(() => trashSession('abc', paths), /already exists/);
});
