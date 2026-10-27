import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { migrateLegacy, pluginDir } from '../lib/paths.js';

function withHome(fn) {
  const previous = process.env.DSH_HOME;
  const home = mkdtempSync(join(tmpdir(), 'dsh-session-paths-'));
  process.env.DSH_HOME = home;
  try {
    return fn(home);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
}

test('migrates the old session-hub directory into dsh-plugins/dsh-session', () => withHome((home) => {
  const old = join(home, 'session-hub');
  mkdirSync(join(old, 'trash', 'session-a', 'payload'), { recursive: true });
  writeFileSync(join(old, 'annotations.json'), '{"annotations":{}}\n');
  writeFileSync(join(old, 'metadata-cache.json'), '{"version":1,"entries":{}}\n');
  writeFileSync(join(old, 'trash', 'session-a', 'meta.json'), '{"id":"session-a"}\n');

  const moved = migrateLegacy();
  assert.equal(pluginDir(), join(home, 'dsh-plugins', 'dsh-session'));
  assert.match(readFileSync(join(pluginDir(), 'annotations.json'), 'utf8'), /annotations/);
  assert.match(readFileSync(join(pluginDir(), 'metadata-cache.json'), 'utf8'), /entries/);
  assert.equal(existsSync(join(pluginDir(), 'trash', 'session-a', 'meta.json')), true);
  assert.equal(existsSync(old), false);
  assert.ok(moved.length >= 1);
}));

test('migrates separate legacy trash and annotation files', () => withHome((home) => {
  mkdirSync(join(home, 'session-trash', 'session-b', 'payload'), { recursive: true });
  writeFileSync(join(home, 'session-trash', 'session-b', 'meta.json'), '{"id":"session-b"}\n');
  writeFileSync(join(home, 'session-annotations.json'), '{"annotations":{"session-b":{}}}\n');

  migrateLegacy();
  assert.equal(existsSync(join(pluginDir(), 'trash', 'session-b', 'meta.json')), true);
  assert.match(readFileSync(join(pluginDir(), 'annotations.json'), 'utf8'), /session-b/);
  assert.equal(existsSync(join(home, 'session-trash')), false);
  assert.equal(existsSync(join(home, 'session-annotations.json')), false);
}));

test('existing target data wins over legacy data', () => withHome((home) => {
  const old = join(home, 'session-hub');
  mkdirSync(old, { recursive: true });
  writeFileSync(join(old, 'annotations.json'), '{"annotations":{"old":{}}}\n');
  mkdirSync(pluginDir(), { recursive: true });
  writeFileSync(join(pluginDir(), 'annotations.json'), '{"annotations":{"new":{}}}\n');

  migrateLegacy();
  assert.match(readFileSync(join(pluginDir(), 'annotations.json'), 'utf8'), /new/);
  assert.equal(existsSync(join(old, 'annotations.json')), true);
}));
