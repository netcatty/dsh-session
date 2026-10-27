import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  artifactNameForHeader, assertSessionDirectory, decodeFsSessionSegment, encodeFsSessionSegment,
  encodeProjectSegment, encodeSessionArtifact, parseSessionGenerationFromFilename,
  readSessionArtifact, readSessionHeader, writeFileAtomic,
} from '../lib/session-files.js';

test('session segment encoding is injective and reversible', () => {
  for (const value of ['session-abc', 'a/b', 'a b', '会话:1', '..', '.', '~002E', 'x~']) {
    const encoded = encodeFsSessionSegment(value);
    assert.equal(encoded.includes('/'), false);
    assert.equal(decodeFsSessionSegment(encoded), value);
  }
  assert.equal(encodeFsSessionSegment('.'), '~002E');
  assert.equal(encodeFsSessionSegment('..'), '~002E~002E');
});

test('project keys match the DSH persistence layout', () => {
  assert.equal(encodeProjectSegment('/home/neo/ws'), '--home-neo-ws--');
  assert.equal(encodeProjectSegment('/home/neo/a b'), '--home-neo-a~0020b--');
  assert.equal(encodeProjectSegment('/'), '--root--');
});

test('generation filenames round-trip', () => {
  assert.equal(parseSessionGenerationFromFilename('session.v4.jsonl.zstd'), 4);
  assert.equal(parseSessionGenerationFromFilename('session.v3.jsonl'), 3);
  assert.equal(parseSessionGenerationFromFilename('session.jsonl.zstd'), 0);
  assert.equal(parseSessionGenerationFromFilename('session.lock'), undefined);
  assert.equal(artifactNameForHeader({ version: 4 }, true), 'session.v4.jsonl.zstd');
  assert.equal(artifactNameForHeader({ version: 0 }, false), 'session.jsonl');
});

test('multi-frame zstd artifacts expose a cheap header and the full body', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-session-files-'));
  const path = join(dir, 'session.v4.jsonl.zstd');
  const header = { type: 'session', version: 4, id: 'session-abc', createdAt: 1, isSeeded: false, delegationDepth: 0, cwd: '/w' };
  const events = [
    { type: 'user/message', seq: 0, time: 1, data: { role: 'user', content: [{ type: 'text', text: 'hello' }] } },
    { type: 'tool/result', seq: 1, time: 2, data: { message: { content: [{ type: 'text', text: 'ok' }] } } },
  ];
  const rest = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
  writeFileAtomic(path, encodeSessionArtifact(JSON.stringify(header), rest, true));
  assert.equal(readSessionHeader(path).id, 'session-abc');
  const artifact = readSessionArtifact(path);
  assert.equal(artifact.header.cwd, '/w');
  assert.equal(artifact.rest, rest);
  assert.match(artifact.content, /hello/);
  assert.equal(artifact.zstd, true);
});

test('plain artifacts also work and incomplete tails are rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-session-files-'));
  const path = join(dir, 'session.v4.jsonl');
  const header = JSON.stringify({ type: 'session', version: 4, id: 'session-abc', createdAt: 1, isSeeded: false, delegationDepth: 0 });
  writeFileSync(path, `${header}\n{"type":"user/message"}\n`);
  assert.equal(readSessionArtifact(path).rest, '{"type":"user/message"}\n');
  writeFileSync(path, `${header}\n{"type":"user/message"}`);
  assert.throws(() => readSessionArtifact(path), /尾行/);
});

test('session directory fencing rejects traversal and wrong segments', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-session-root-'));
  const dir = join(root, '--w--', 'session-abc');
  mkdirSync(dir, { recursive: true });
  assert.equal(assertSessionDirectory(root, dir, 'session-abc'), dir);
  assert.throws(() => assertSessionDirectory(root, join(root, '..', 'x', 'session-abc'), 'session-abc'));
  assert.throws(() => assertSessionDirectory(root, dir, 'session-other'));
});
