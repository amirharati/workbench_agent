#!/usr/bin/env node
/**
 * Pick a diverse URL set from a workbench backup JSON (latest.json or manual export).
 *
 *   node scripts/enrich-fetch/pick-urls.mjs path/to/latest.json
 *   node scripts/enrich-fetch/pick-urls.mjs path/to/latest.json --max 100 --per-host 2
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = { max: 2, perHost: 2, seed: null, hosts: null, out: join(__dir, 'experiments', 'urls-picked.txt') };
  let backupPath = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max') opts.max = Number(argv[++i]) || opts.max;
    else if (a === '--per-host') opts.perHost = Number(argv[++i]) || opts.perHost;
    else if (a === '--seed') opts.seed = Number(argv[++i]) || 0;
    else if (a === '--hosts') opts.hosts = argv[++i].split(',').map(s => s.trim().toLowerCase());
    else if (a === '--out') opts.out = argv[++i];
    else if (!a.startsWith('-')) backupPath = a;
  }
  if (!backupPath) {
    console.error('Usage: pick-urls.mjs <backup.json> [--max 100] [--per-host 2] [--seed 42] [--hosts x.com,youtube.com] [--out urls.txt]');
    process.exit(1);
  }
  return { ...opts, backupPath };
}

function makeRng(seed) {
  if (seed == null) return Math.random;
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadItems(backupPath) {
  if (!existsSync(backupPath)) {
    console.error(`Backup file not found: ${backupPath}`);
    console.error('');
    console.error('Use your real backup path, not the docs placeholder. Options:');
    console.error('  1. Settings → Backup → Download manual backup → use that .json path');
    console.error('  2. Your linked backup folder → latest.json (see Settings → Backup folder)');
    console.error('  3. Skip backup: npm run fetch-experiment -- scripts/enrich-fetch/seeds/diverse-urls.txt');
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(backupPath, 'utf8'));
  const data = raw?.format === 'workbench-backup' ? raw.data : raw;
  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .filter((i) => typeof i?.url === 'string' && /^https?:\/\//i.test(i.url.trim()))
    .map((i) => ({
      url: i.url.trim(),
      title: i.title || '',
      id: i.id,
      platform: i.metadata?.platform,
    }));
}

function hostKey(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'x.com' || h === 'twitter.com') return 'x.com';
    if (h === 'youtu.be') return 'youtube.com';
    return h;
  } catch {
    return 'invalid';
  }
}

function pickDiverse(items, max, perHost, seed, allowedHosts) {
  const rng = makeRng(seed);
  const byHost = new Map();
  for (const item of items) {
    const hk = hostKey(item.url);
    if (hk === 'invalid') continue;
    if (allowedHosts && !allowedHosts.includes(hk)) continue;
    if (!byHost.has(hk)) byHost.set(hk, []);
    byHost.get(hk).push(item);
  }

  for (const [, list] of byHost) {
    const shuffled = shuffle(list, rng);
    list.length = 0;
    list.push(...shuffled);
  }

  const hosts = shuffle([...byHost.keys()], rng);
  const picked = [];
  const used = new Set();

  while (picked.length < max) {
    let added = false;
    for (const hk of hosts) {
      if (picked.length >= max) break;
      const list = byHost.get(hk) || [];
      const count = picked.filter((p) => hostKey(p.url) === hk).length;
      if (count >= perHost) continue;
      const next = list.find((i) => !used.has(i.url));
      if (!next) continue;
      used.add(next.url);
      picked.push(next);
      added = true;
    }
    if (!added) break;
  }

  return picked;
}

const { backupPath, max, perHost, seed, hosts, out } = parseArgs(process.argv.slice(2));
const items = loadItems(backupPath);
const picked = pickDiverse(items, max, perHost, seed, hosts);

mkdirSync(dirname(out), { recursive: true });
const lines = [
  '# Diverse bookmark URLs from backup',
  `# source: ${backupPath}`,
  `# items in backup: ${items.length}, picked: ${picked.length}, per-host: ${perHost}${seed != null ? `, seed: ${seed}` : ', random'}`,
  ...picked.map((p) => `${p.url}\t# ${p.title.slice(0, 80)}`),
];
writeFileSync(out, lines.join('\n') + '\n');

console.log(`Picked ${picked.length} URLs from ${items.length} bookmarks → ${out}`);
for (const p of picked) {
  console.log(`  ${hostKey(p.url).padEnd(28)} ${p.url}`);
}
