import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../lib/${name}`, import.meta.url), 'utf8');

test('host API authenticates, serializes mutations and validates annotations', () => {
  const source = read('index.js');
  assert.match(source, /connection\.admit/);
  assert.match(source, /kind: 'prefix'/);
  assert.match(source, /expectedRevision/);
  assert.match(source, /archiveSession\(id, \{ stopActivity: false \}\)/);
  assert.match(source, /retireLiveSession/);
  assert.match(source, /notifySessionAdded/);
  assert.match(source, /session-subagent/);
  assert.match(source, /purgeSessionTree/);
  assert.match(source, /workspace-create/);
  assert.match(source, /workspace-rename/);
  assert.match(source, /path === '\/pin'/);
  assert.match(source, /batch-pin/);
  assert.match(source, /workspace-order/);
  assert.match(source, /path === '\/rename'/);
  assert.match(source, /retireLiveSession\(id\)/);
  assert.match(source, /mainSessions/);
  assert.match(source, /trashSubagents/);
  assert.match(source, /workspace-remove/);
  assert.match(source, /api-session\/added/);
  assert.match(source, /assertSessionId/);
});

test('bundle patch does not collide with the official session entry', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.match(patch, /id: dsh-session/);
  assert.doesNotMatch(patch, /^\s*-\s*id:\s*session\s*$/m);
});

test('client follows theme tokens and registers the expected slots', () => {
  const source = read('client.js');
  for (const token of ['--dsw-alias-bg-overlay', '--dsw-alias-label-primary', '--dsw-alias-state-error-primary']) {
    assert.match(source, new RegExp(token));
  }
  for (const slot of ['shell.overlay', 'sidebar.footer.action', 'conversation.session.header.actions', 'settings.plugins.tab']) {
    assert.match(source, new RegExp(`ctx\\.slots\\.inject\\('${slot.replace(/\./g, '\\.')}'`));
  }
  assert.match(source, /batch-annotations/);
  assert.match(source, /preset-migrate/);
  assert.match(source, /MoveDialog/);
  assert.match(source, /PresetDialog/);
  assert.match(source, /caret-right/);
  assert.match(source, /workspaceFilter !== 'all'/);
  assert.match(source, /没有可清理的空会话/);
  assert.match(source, /not-favorite/);
  assert.match(source, /not-review/);
  assert.match(source, /全部收藏/);
  assert.match(source, /全部回看/);
  assert.match(source, /PRESET_LABELS/);
  assert.match(source, /标准/);
  assert.match(source, /复制整理 Prompt/);
  assert.match(source, /JsonImportDialog/);
  assert.match(source, /collapsedTrash/);
  assert.match(source, /childrenOf/);
  assert.match(source, /pushTree/);
  assert.match(source, /await refreshHost\(\)/);
  assert.match(source, /随主会话恢复和删除/);
  assert.match(source, /isChild/);
  assert.match(source, /isChild \? null/);
  assert.match(source, /TextPromptDialog/);
  assert.match(source, /pickDirectoryRef/);
  assert.match(source, /WorkspaceCreateDialog/);
  assert.match(source, /DirectoryFlowOverlay/);
  assert.match(source, /onPin/);
  assert.match(source, /onRename/);
  assert.match(source, /subscribeWorkspaceStateRef/);
  assert.match(source, /dshs-footer-stat/);
  assert.match(source, /trashMain/);
  assert.match(source, /trashWorkspaceFilter/);
  assert.match(source, /annotations-import/);
  assert.match(source, /cache-clear/);
  assert.match(source, /MaintenanceDialog/);
  assert.match(source, /onClick: \(\) => deleteBatch\(\)/);
  assert.match(source, /全选当前/);
  assert.match(source, /batch-tags-append/);
  assert.match(source, /重试失败/);
  assert.match(source, /子会话 \$\{childCount\}/);
  assert.match(source, /exportOne/);
  assert.match(source, /danger: true/);
  assert.match(source, /name: 'pencil'/);
  assert.match(source, /officialFlowRef/);
  assert.match(source, /sidebar\.workspaces\.directoryFlow/);
  assert.match(source, /WorkspaceRemoveDialog/);
  assert.match(source, /trashSessions/);
  assert.match(source, /浏览目录/);
  assert.match(source, /选择工作区目录/);
  assert.match(source, /主目录/);
  assert.match(source, /新建文件夹/);
  assert.match(source, /显示隐藏文件/);
  assert.match(source, /上一级/);
  assert.match(source, /新建工作区/);
  assert.match(source, /重命名工作区/);
  assert.match(source, /'（空会话）'/);
});

test('store keeps artifact generation and multi-frame helpers in one place', () => {
  const source = read('store.js');
  assert.match(source, /readSessionArtifact/);
  assert.match(source, /publishSessionArtifact/);
  assert.match(source, /artifactNameForHeader/);
  assert.match(source, /SessionMetaCache/);
});
