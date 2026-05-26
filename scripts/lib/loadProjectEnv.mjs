import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/** Keys that should always come from project .env for CLI (not a stale shell export). */
const FORCE_FROM_DOTENV = new Set([
  'OPENROUTER_API_KEY',
  'OPENROUTER_BASE_URL',
  'OPENROUTER_MODEL',
  'OPENROUTER_EMBEDDING_MODEL',
  'OPENAI_API_KEY',
]);

function applyEnvFile(envPath) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].replace(/^["']|["']$/g, '');
    if (FORCE_FROM_DOTENV.has(key) || !process.env[key]) {
      process.env[key] = value;
    }
  }
}

/**
 * Walk up from startDir to find repo-root .env and load it.
 */
export function loadProjectEnv(startDir) {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const envPath = join(dir, '.env');
    if (existsSync(envPath)) {
      applyEnvFile(envPath);
      return { loaded: true, path: envPath };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { loaded: false, path: null };
}

export function loadProjectEnvFromImportMeta(importMetaUrl) {
  const startDir = dirname(fileURLToPath(importMetaUrl));
  return loadProjectEnv(startDir);
}
