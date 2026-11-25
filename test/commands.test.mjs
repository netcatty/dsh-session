import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePageArg, renderSessionList, resolveSessionTarget, sessionLine, shortSessionId,
} from '../lib/commands.js';

const sessions = [
  { id: 'session-11111111-aaaa', title: '修复登录超时', updatedAt: '2026-11-25T06:00:00.000Z' },
  { id: 'session-11111112-bbbb', title: '修复支付回调', updatedAt: '2026-11-24T06:00:00.000Z' },
  { id: 'session-22222222-cccc', title: '(无标题)', updatedAt: '2026-11-23T06:00:00.000Z' },
];

test('shortSessionId 去掉 session- 前缀并截到 8 位', () => {
  assert.equal(shortSessionId('session-7cd3b2f7-2c38-4332'), '7cd3b2f7');
  assert.equal(shortSessionId('plain-id'), 'plain-id');
  assert.equal(shortSessionId(undefined), '');
});

test('sessionLine 拼出短 id、标题与时间', () => {
  const line = sessionLine(sessions[0]);
  assert.match(line, /^11111111 /);
  assert.match(line, /修复登录超时/);
  assert.match(line, /（\d\d-\d\d \d\d:\d\d）/);
});

test('sessionLine 截断超长标题并压成一行', () => {
  const line = sessionLine({ id: 'session-abcdefgh-1', title: '标题\n换行'.padEnd(60, '长') });
  assert.doesNotMatch(line, /\n/);
  assert.match(line, /…/);
});

test('renderSessionList 空列表走 empty 文案', () => {
  assert.equal(renderSessionList('回收站', [], { empty: '回收站是空的。' }), '回收站是空的。');
});

test('renderSessionList 每页 10 条、每条单独一行', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: `session-${String(index).padStart(8, '0')}`,
    title: `会话 ${index}`,
    updatedAt: '2026-11-25T06:00:00.000Z',
  }));
  const first = renderSessionList('可删除会话', rows, { hint: '提示' });
  const firstLines = first.split('\n');
  assert.equal(firstLines[0], '可删除会话（共 12 条，第 1/2 页）：');
  assert.equal(firstLines.length, 12);
  for (const line of firstLines.slice(1, 11)) assert.match(line, /^  \d{8} 会话 /);
  assert.equal(firstLines[11], '提示');

  const second = renderSessionList('可删除会话', rows, { page: 2, hint: '提示' });
  const secondLines = second.split('\n');
  assert.equal(secondLines[0], '可删除会话（共 12 条，第 2/2 页）：');
  assert.equal(secondLines.length, 4);
  assert.match(secondLines[1], /会话 10/);
  assert.match(secondLines[2], /会话 11/);
});

test('renderSessionList 页码越界时钳制到最后一页', () => {
  const rows = Array.from({ length: 3 }, (_, index) => ({ id: `session-${index}`, title: `会话 ${index}` }));
  assert.match(renderSessionList('x', rows, { page: 9 }), /第 1\/1 页/);
  assert.match(renderSessionList('x', rows, { page: 0 }), /第 1\/1 页/);
});

test('parsePageArg 只接受 page <n>', () => {
  assert.equal(parsePageArg('page 2'), 2);
  assert.equal(parsePageArg('  page   3  '), 3);
  assert.equal(parsePageArg('page 0'), 1);
  assert.equal(parsePageArg('abc'), undefined);
  assert.equal(parsePageArg('page x'), undefined);
});

test('resolveSessionTarget 支持完整 id、短 id 前缀与唯一标题', () => {
  assert.equal(resolveSessionTarget('session-22222222-cccc', sessions).record?.id, 'session-22222222-cccc');
  assert.equal(resolveSessionTarget('22222222', sessions).record?.id, 'session-22222222-cccc');
  assert.equal(resolveSessionTarget('支付回调', sessions).record?.id, 'session-11111112-bbbb');
});

test('resolveSessionTarget 前缀歧义时返回候选', () => {
  const resolved = resolveSessionTarget('1111111', sessions);
  assert.equal(resolved.record, undefined);
  assert.equal(resolved.candidates.length, 2);
});

test('resolveSessionTarget 无匹配与空查询分别报错', () => {
  assert.match(resolveSessionTarget('不存在的会话', sessions).error, /没有匹配/);
  assert.match(resolveSessionTarget('   ', sessions).error, /缺少 id 前缀/);
});
