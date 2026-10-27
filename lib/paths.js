// All files this plugin owns live under one directory:
//   $DSH_HOME/dsh-plugins/dsh-session/annotations.json
//   $DSH_HOME/dsh-plugins/dsh-session/metadata-cache.json
//   $DSH_HOME/dsh-plugins/dsh-session/trash/
//
// `$DSH_HOME/storages/` belongs to the DSH storage backend and the home root
// belongs to the platform, so this plugin shares the same `dsh-plugins/<app>/`
// namespace as dsh-mcp. Earlier versions used `session-hub/`, `session-trash/`
// and `session-annotations.json`; migrateLegacy moves them once.

import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const PLUGINS_DIR = 'dsh-plugins';
export const APP_DIR = 'dsh-session';

export function dshHome() {
  const fromEnv = process.env.DSH_HOME;
  return typeof fromEnv === 'string' && fromEnv !== '' ? fromEnv : join(homedir(), '.dsh');
}

export function pluginDir() {
  return join(dshHome(), PLUGINS_DIR, APP_DIR);
}

export function legacyPaths() {
  const home = dshHome();
  return {
    sessionHub: join(home, 'session-hub'),
    trash: join(home, 'session-trash'),
    annotations: join(home, 'session-annotations.json'),
  };
}

function moveIfMissing(source, target) {
  if (existsSync(target) || !existsSync(source)) return null;
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  try {
    renameSync(source, target);
    return source;
  } catch {
    // Cross-device or a locked source: copy first, then remove only after a
    // successful copy so a failure never loses the only copy.
  }
  try {
    cpSync(source, target, { recursive: true, force: false, errorOnExist: false });
    rmSync(source, { recursive: true, force: true });
    return source;
  } catch {
    try { rmSync(target, { recursive: true, force: true }); } catch { /* partial target */ }
    return null;
  }
}

function removeIfEmpty(dir) {
  try {
    if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
  } catch {
    // Cleanup is cosmetic.
  }
}

/** Move earlier plugin data into the shared dsh-plugins directory. */
export function migrateLegacy(log) {
  const target = pluginDir();
  const legacy = legacyPaths();
  const moved = [];

  // Fast path: the whole old session-hub directory becomes the new app folder.
  if (!existsSync(target) && existsSync(legacy.sessionHub)) {
    try {
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      renameSync(legacy.sessionHub, target);
      moved.push(legacy.sessionHub);
    } catch {
      // Fall through to per-entry migration.
    }
  }

  mkdirSync(target, { recursive: true, mode: 0o700 });
  try { chmodSync(target, 0o700); } catch { /* best effort */ }
  try { if (existsSync(join(target, 'trash'))) chmodSync(join(target, 'trash'), 0o700); } catch { /* best effort */ }
  for (const name of ['annotations.json', 'metadata-cache.json', 'trash']) {
    const source = moveIfMissing(join(legacy.sessionHub, name), join(target, name));
    if (source !== null) moved.push(source);
  }
  const oldTrash = moveIfMissing(legacy.trash, join(target, 'trash'));
  if (oldTrash !== null) moved.push(oldTrash);
  const oldAnnotations = moveIfMissing(legacy.annotations, join(target, 'annotations.json'));
  if (oldAnnotations !== null) moved.push(oldAnnotations);

  removeIfEmpty(legacy.sessionHub);
  if (moved.length > 0) log?.(`dsh-session: 已迁移 ${moved.length} 项插件数据到 ${target}`);
  return moved;
}
