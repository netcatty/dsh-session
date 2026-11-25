import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { apply } from '../lib/index.js';
import { encodeSessionArtifact, writeFileAtomic } from '../lib/session-files.js';

const HEADER = {
  type: 'session', version: 4, createdAt: 1, isSeeded: false, delegationDepth: 0, cwd: 'D:/w',
};

function writeSession(root, project, id, header, events = []) {
  const dir = join(root, project, id);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'session.v4.jsonl.zstd');
  const body = events.length === 0 ? '' : `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
  writeFileAtomic(path, encodeSessionArtifact(JSON.stringify({ ...HEADER, ...header, id }), body, true));
  return { dir, path };
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-commands-root-'));
  const trashRoot = mkdtempSync(join(tmpdir(), 'dsh-commands-trash-'));
  const dataDir = mkdtempSync(join(tmpdir(), 'dsh-commands-data-'));
  const session = writeSession(root, 'D--w', 'session-abc', { cwd: 'D:/w' }, [
    { type: 'session/title', seq: 0, time: 1, data: { title: '命令测试会话' } },
  ]);
  const commands = new Map();
  const ctx = {
    logger: { info() {}, warn() {} },
    get: () => undefined,
    emit: () => {},
    waterfall: async () => [],
    effect: (fn) => fn(),
    inject: (services, callback) => {
      if (!services.includes('commands')) return;
      callback({
        effect: (fn) => fn(),
        commands: {
          register: (definition) => {
            commands.set(definition.name, definition);
            return () => {};
          },
        },
      });
    },
  };
  apply(ctx, {
    root,
    trashRoot,
    dataDir,
    annotationsPath: join(dataDir, 'annotations.json'),
    metaCachePath: join(dataDir, 'cache.json'),
  });
  const run = (name, rawInput, agentId = 'session-current') => commands.get(name).handler({ rawInput, agent: { id: agentId } });
  return { root, trashRoot, dataDir, commands, session, run };
}

test('apply registers the trash, restore and purge commands', () => {
  const { commands } = setup();
  assert.deepEqual([...commands.keys()].sort(), ['session-purge', 'session-restore', 'session-trash']);
});

test('/session-trash without input lists deletable sessions', async () => {
  const { run } = setup();
  const result = await run('session-trash', '');
  assert.equal(result.kind, 'success');
  assert.match(result.text, /命令测试会话/);
  assert.match(result.text, /abc/);
});

test('/session-trash moves a session to trash and /session-restore brings it back', async () => {
  const { run, session, trashRoot } = setup();
  const trashed = await run('session-trash', 'abc');
  assert.equal(trashed.kind, 'success');
  assert.match(trashed.text, /已移入回收站/);
  assert.equal(existsSync(session.dir), false);
  assert.equal(existsSync(join(trashRoot, 'session-abc', 'payload')), true);

  const listed = await run('session-restore', '');
  assert.match(listed.text, /命令测试会话/);

  const restored = await run('session-restore', 'abc');
  assert.equal(restored.kind, 'success');
  assert.match(restored.text, /已还原/);
  assert.equal(existsSync(join(session.dir, 'session.v4.jsonl.zstd')), true);
});

test('/session-purge permanently deletes a trashed session', async () => {
  const { run, trashRoot } = setup();
  await run('session-trash', 'abc');
  const purged = await run('session-purge', 'abc');
  assert.equal(purged.kind, 'success');
  assert.match(purged.text, /不可恢复/);
  assert.equal(existsSync(join(trashRoot, 'session-abc')), false);
});

test('/session-trash cascades to child sessions by default', async () => {
  const { root, run, trashRoot } = setup();
  writeSession(root, 'D--w', 'session-child', {
    cwd: 'D:/w', parentSession: 'session-abc', origin: 'subagent', delegationDepth: 1,
  });
  const result = await run('session-trash', 'abc');
  assert.equal(result.kind, 'success');
  assert.match(result.text, /含子会话/);
  assert.equal(existsSync(join(trashRoot, 'session-abc', 'payload')), true);
  assert.equal(existsSync(join(trashRoot, 'session-child', 'payload')), true);
});

test('/session-trash accepts several targets in one line', async () => {
  const { root, run, trashRoot } = setup();
  writeSession(root, 'D--w', 'session-def', { cwd: 'D:/w' }, [
    { type: 'session/title', seq: 0, time: 1, data: { title: '第二个会话' } },
  ]);
  const result = await run('session-trash', 'abc def');
  assert.equal(result.kind, 'success');
  assert.match(result.text, /已移入回收站 2 个会话/);
  assert.equal(existsSync(join(trashRoot, 'session-abc')), true);
  assert.equal(existsSync(join(trashRoot, 'session-def')), true);
});

test('/session-trash reports one failure without aborting the others', async () => {
  const { run } = setup();
  const result = await run('session-trash', 'abc 不存在');
  assert.equal(result.kind, 'success');
  assert.match(result.text, /已移入回收站 1 个会话/);
  assert.match(result.text, /失败：不存在：没有匹配/);
});

test('/session-purge accepts several targets in one line', async () => {
  const { root, run, trashRoot } = setup();
  writeSession(root, 'D--w', 'session-def', { cwd: 'D:/w' }, []);
  await run('session-trash', 'abc def');
  const result = await run('session-purge', 'abc def');
  assert.equal(result.kind, 'success');
  assert.match(result.text, /已彻底删除 2 个会话/);
  assert.equal(existsSync(join(trashRoot, 'session-abc')), false);
  assert.equal(existsSync(join(trashRoot, 'session-def')), false);
});

test('/session-trash --empty moves only empty sessions to trash', async () => {
  const { root, run, session, trashRoot } = setup();
  writeSession(root, 'D--w', 'session-empty', { cwd: 'D:/w' }, []);
  const result = await run('session-trash', '--empty');
  assert.equal(result.kind, 'success');
  assert.match(result.text, /已把 1 个空会话移入回收站/);
  assert.equal(existsSync(join(trashRoot, 'session-empty')), true);
  assert.equal(existsSync(session.dir), true);
});

test('/session-trash --empty rejects extra targets', async () => {
  const { run } = setup();
  const result = await run('session-trash', '--empty abc');
  assert.equal(result.kind, 'error');
  assert.match(result.text, /不能与其他目标混用/);
});

test('/session-purge --all asks for --yes before emptying the trash', async () => {
  const { run, trashRoot } = setup();
  await run('session-trash', 'abc');
  const preview = await run('session-purge', '--all');
  assert.equal(preview.kind, 'success');
  assert.match(preview.text, /确认执行请用/);
  assert.equal(existsSync(join(trashRoot, 'session-abc')), true);

  const purged = await run('session-purge', '--all --yes');
  assert.equal(purged.kind, 'success');
  assert.match(purged.text, /已彻底删除 1 个会话/);
  assert.equal(existsSync(join(trashRoot, 'session-abc')), false);
});

test('/session-trash children without a target is a usage error', async () => {
  const { run } = setup();
  const result = await run('session-trash', 'children');
  assert.equal(result.kind, 'error');
  assert.match(result.text, /用法/);
});

test('/session-trash refuses the current session and unknown ids', async () => {
  const { run } = setup();
  const current = await run('session-trash', 'session-abc', 'session-abc');
  assert.equal(current.kind, 'error');
  assert.match(current.text, /不能删除当前正在使用的会话/);

  const missing = await run('session-trash', '不存在');
  assert.equal(missing.kind, 'error');
  assert.match(missing.text, /没有匹配/);
});

test('/session-purge rejects a session that is not in the trash', async () => {
  const { run } = setup();
  const result = await run('session-purge', 'abc');
  assert.equal(result.kind, 'error');
  assert.match(result.text, /没有匹配/);
});
