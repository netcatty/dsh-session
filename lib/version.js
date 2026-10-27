import { readFileSync } from 'node:fs';

/** Read the package version on demand so a live plugin reload or a linked
 * development checkout reflects the package.json currently on disk. */
export function readVersion() {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

export const VERSION = readVersion();
