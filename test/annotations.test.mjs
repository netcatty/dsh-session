import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createAnnotationStore, normalizeAnnotationPatch, patchAnnotation, readAnnotations,
  setAnnotationsPath, writeAnnotations,
} from '../lib/annotations.js';

function tempPath() {
  return join(mkdtempSync(join(tmpdir(), 'dsh-session-marks-')), 'annotations.json');
}

test('annotation updates are versioned and conflict-safe', async () => {
  const path = tempPath();
  const store = createAnnotationStore(path);
  const first = await store.update('session-a', { favorite: true });
  assert.equal(first.favorite, true);
  assert.equal(first.revision, 1);
  await assert.rejects(() => store.update('session-a', { note: 'x' }, 0), /其他窗口/);
  const second = await store.update('session-a', { note: 'x' }, 1);
  assert.equal(second.revision, 2);
  assert.equal(second.favorite, true);
  const all = await store.list();
  assert.equal(all['session-a'].note, 'x');
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(raw.version, 1);
});

test('patch validation enforces limits and deduplicates tags', () => {
  assert.deepEqual(normalizeAnnotationPatch({ tags: [' a ', 'A', 'b'] }).tags, ['a', 'b']);
  assert.throws(() => normalizeAnnotationPatch({ tags: ['a,b'] }), /32|逗号/);
  assert.throws(() => normalizeAnnotationPatch({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }), /20/);
  assert.throws(() => normalizeAnnotationPatch({ note: 'x'.repeat(2001) }), /2000/);
  assert.throws(() => normalizeAnnotationPatch({ priority: 6 }), /1–5/);
  assert.throws(() => normalizeAnnotationPatch({ unknown: true }), /未知/);
  assert.deepEqual(normalizeAnnotationPatch({ priority: null }).priority, null);
});

test('batch updates report per-session results', async () => {
  const store = createAnnotationStore(tempPath());
  const result = await store.batchUpdate(['session-a', 'session-b'], { priority: 2 });
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.success, 2);
  assert.equal(result.items.every((item) => item.annotation.priority === 2), true);
  const conflict = await store.batchUpdate(['session-a', 'session-c'], { note: 'n' }, new Map([['session-a', 0]]));
  assert.equal(conflict.summary.failed, 1);
  assert.equal(conflict.summary.success, 1);
});

test('remove and legacy files stay compatible', async () => {
  const path = tempPath();
  const store = createAnnotationStore(path);
  await store.update('session-a', { favorite: true });
  assert.equal(await store.remove('session-a'), true);
  assert.equal(await store.remove('session-a'), false);

  writeFileSync(path, `${JSON.stringify({ version: 1, sessions: { 'session-legacy': { favorite: true, tags: ['old'] } } })}\n`);
  const legacy = readAnnotations();
  assert.equal(legacy['session-legacy'].favorite, true);
  assert.equal(legacy['session-legacy'].revision >= 1, true);
  assert.equal(legacy['session-legacy'].priority, null);

  const updated = patchAnnotation('session-legacy', { priority: 4 });
  assert.equal(updated.priority, 4);
  assert.equal(readAnnotations()['session-legacy'].priority, 4);
});

test('corrupt annotation files refuse to be overwritten', () => {
  const path = tempPath();
  setAnnotationsPath(path);
  writeFileSync(path, '{not json');
  assert.throws(() => readAnnotations(), (error) => error.code === 'annotations-corrupt');
  assert.throws(() => writeAnnotations({ 'session-a': { favorite: true } }), (error) => error.code === 'annotations-corrupt');
});

test('importAll replaces the whole annotation state', async () => {
  const store = createAnnotationStore(tempPath());
  await store.update('session-a', { favorite: true });
  const result = await store.importAll({ 'session-b': { favorite: true, tags: ['导入'] } });
  assert.equal(result.count, 1);
  const all = await store.list();
  assert.equal(all['session-a'], undefined);
  assert.equal(all['session-b'].favorite, true);
  assert.deepEqual(all['session-b'].tags, ['导入']);
  await assert.rejects(() => store.importAll(null), /对象/);
});
