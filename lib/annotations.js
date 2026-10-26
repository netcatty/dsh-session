// Per-session annotations (favorite / review later / tags / note).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';

let filePath = `${homedir()}/.dsh/session-annotations.json`;

export function setAnnotationsPath(path) { filePath = path; }

export function readAnnotations() {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return parsed?.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {};
  } catch {
    return {};
  }
}

export function writeAnnotations(sessions) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify({ version: 1, sessions }, null, 2)}\n`, { mode: 0o600 });
}

export function patchAnnotation(id, patch) {
  const sessions = readAnnotations();
  sessions[id] = { ...(sessions[id] ?? {}), ...patch };
  writeAnnotations(sessions);
  return sessions[id];
}
