#!/usr/bin/env node
/**
 * Verify OPENROUTER_API_KEY from project .env (CLI path only — not the extension).
 *
 *   npm run check-openrouter-key
 *
 * Compare last 4 chars printed here with Settings > AI key in the dashboard.
 * The extension stores its key in chrome.storage.local, NOT in .env.
 */

import { loadProjectEnvFromImportMeta } from './lib/loadProjectEnv.mjs';

loadProjectEnvFromImportMeta(import.meta.url);

const key = (process.env.OPENROUTER_API_KEY || '').trim();
const base = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');

if (!key) {
  console.error('No OPENROUTER_API_KEY in .env');
  process.exit(1);
}

console.log('CLI (.env) key fingerprint:');
console.log(`  length: ${key.length}`);
console.log(`  prefix: ${key.slice(0, 10)}…`);
console.log(`  last 4: …${key.slice(-4)}`);
console.log(`  base URL: ${base}`);
console.log('');
console.log('If the app works but this fails, copy the key from Settings > AI into .env line 2.');
console.log('(Extension does not read .env.)');
console.log('');

const headers = {
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://workbench-agent.local',
  'X-Title': 'Workbench Agent Key Check',
};

const res = await fetch(`${base}/chat/completions`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    messages: [{ role: 'user', content: 'ok' }],
    max_tokens: 3,
  }),
});

const json = await res.json();
if (res.ok && json.choices?.length) {
  console.log('✅ OpenRouter accepted this .env key (chat/completions).');
  process.exit(0);
}

console.error('❌ OpenRouter rejected this .env key:', res.status, json.error?.message || json);
process.exit(1);
