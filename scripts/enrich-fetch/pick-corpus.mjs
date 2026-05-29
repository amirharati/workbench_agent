#!/usr/bin/env node
/**
 * Build a mixed fetch corpus: random diverse sample + guaranteed problem-platform URLs.
 *
 *   node scripts/enrich-fetch/pick-corpus.mjs path/to/latest.json --total 500 --seed 42
 *   node scripts/enrich-fetch/pick-corpus.mjs path/to/latest.json --total 500 --out data/experiments/enrich-fetch/urls-corpus-500.txt
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

const PLATFORM_QUOTAS = [
  { key: 'reddit.com', host: 'reddit.com', max: 18, tag: 'platform:reddit' },
  { key: 'medium.com', host: 'medium.com', max: 11, tag: 'platform:medium' },
  { key: 'youtube.com', host: 'youtube.com', max: 15, tag: 'platform:youtube' },
  { key: 'linkedin.com', host: 'linkedin.com', max: 6, tag: 'platform:linkedin' },
  { key: 'github.com', host: 'github.com', max: 40, tag: 'platform:github' },
  { key: 't.co', host: 't.co', max: 25, tag: 'platform:tco' },
  { key: 'x-thread', host: 'x.com', max: 50, tag: 'x:thread-hint', filter: isXThreadHint },
  { key: 'x-link', host: 'x.com', max: 40, tag: 'x:link-in-text', filter: isXWithLinkInTitle },
  { key: 'x-single', host: 'x.com', max: 40, tag: 'x:single', filter: isXSingle },
];

const SEED_URLS = [
  { url: 'https://news.ycombinator.com/item?id=38410164', tag: 'seed:hn' },
  { url: 'https://www.bloomberg.com/opinion/articles/2024-01-02/gifted-kids-become-successful-adults', tag: 'seed:bloomberg' },
  { url: 'https://www.reddit.com/r/python/comments/1bpd2w7/what_are_you_working_on/', tag: 'seed:reddit' },
  { url: 'https://medium.com/@nick.p.in/explainable-ai-for-data-scientists-ecaedd8482e3', tag: 'seed:medium' },
];

function parseArgs(argv) {
  const opts = {
    total: 500,
    perHost: 2,
    seed: 42,
    out: join(__dir, 'experiments', 'urls-corpus.txt'),
  };
  let backupPath = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--total') opts.total = Number(argv[++i]) || opts.total;
    else if (a === '--per-host') opts.perHost = Number(argv[++i]) || opts.perHost;
    else if (a === '--seed') opts.seed = Number(argv[++i]) ?? opts.seed;
    else if (a === '--out') opts.out = argv[++i];
    else if (!a.startsWith('-')) backupPath = a;
  }
  if (!backupPath) {
    console.error(
      'Usage: pick-corpus.mjs <backup.json> [--total 500] [--per-host 2] [--seed 42] [--out urls.txt]'
    );
    process.exit(1);
  }
  return { ...opts, backupPath };
}

function makeRng(seed) {
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

function hostKey(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (h === 'x.com' || h === 'twitter.com') return 'x.com';
    if (h === 'youtu.be') return 'youtube.com';
    return h;
  } catch {
    return 'invalid';
  }
}

function isXStatus(url) {
  return /x\.com\/\w+\/status\/\d+/i.test(url || '');
}

function isXThreadHint(item) {
  if (!isXStatus(item.url)) return false;
  const t = item.title || '';
  return /🧵|thread|\(\d+\)|\/\d+\b/i.test(t);
}

function isXWithLinkInTitle(item) {
  if (!isXStatus(item.url)) return false;
  if (isXThreadHint(item)) return false;
  return /https?:\/\/|www\.\w+/i.test(item.title || '');
}

function isXSingle(item) {
  if (!isXStatus(item.url)) return false;
  return !isXThreadHint(item) && !isXWithLinkInTitle(item);
}

function loadItems(backupPath) {
  if (!existsSync(backupPath)) {
    console.error(`Backup file not found: ${backupPath}`);
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

function pickDiverse(items, max, perHost, seed, excludeUrls) {
  const rng = makeRng(seed);
  const byHost = new Map();
  for (const item of items) {
    if (excludeUrls.has(item.url)) continue;
    const hk = hostKey(item.url);
    if (hk === 'invalid') continue;
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
  const used = new Set(excludeUrls);

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
      picked.push({ ...next, tag: 'random' });
      added = true;
    }
    if (!added) break;
  }

  return picked;
}

function pickPlatform(items, quota, rng, excludeUrls) {
  let pool = items.filter((i) => {
    if (excludeUrls.has(i.url)) return false;
    if (quota.filter) return quota.filter(i);
    return hostKey(i.url) === quota.host;
  });
  pool = shuffle(pool, rng);
  return pool.slice(0, quota.max).map((item) => ({
    ...item,
    tag: quota.tag,
  }));
}

const { backupPath, total, perHost, seed, out } = parseArgs(process.argv.slice(2));
const rng = makeRng(seed);
const items = loadItems(backupPath);
const used = new Set();
const picked = [];

for (const seedEntry of SEED_URLS) {
  if (used.has(seedEntry.url)) continue;
  used.add(seedEntry.url);
  picked.push({
    url: seedEntry.url,
    title: seedEntry.tag,
    tag: seedEntry.tag,
  });
}

for (const quota of PLATFORM_QUOTAS) {
  const batch = pickPlatform(items, quota, rng, used);
  for (const item of batch) {
    if (used.has(item.url)) continue;
    used.add(item.url);
    picked.push(item);
  }
}

const randomTarget = Math.max(0, total - picked.length);
const random = pickDiverse(items, randomTarget, perHost, seed + 1, used);
for (const item of random) {
  used.add(item.url);
  picked.push(item);
}

const final = picked.slice(0, total);

mkdirSync(dirname(out), { recursive: true });
const lines = [
  '# Mixed fetch corpus: random + problem platforms',
  `# source: ${backupPath}`,
  `# total: ${final.length}, seed: ${seed}, per-host random: ${perHost}`,
  `# platform quotas: ${PLATFORM_QUOTAS.map((q) => `${q.key}:${q.max}`).join(', ')}`,
  `# X tags: x:single (one tweet), x:thread-hint (🧵/thread in title), x:link-in-text (URL in tweet text → quote/article proxy)`,
  `# Run with syndication for X comparison: npm run fetch-experiment -- --with-syndication --no-tab urls.txt`,
  ...final.map((p) => `${p.url}\t# [${p.tag}] ${(p.title || '').slice(0, 72)}`),
];
writeFileSync(out, lines.join('\n') + '\n');

const byTag = {};
for (const p of final) {
  byTag[p.tag] = (byTag[p.tag] || 0) + 1;
}

console.log(`Corpus: ${final.length} URLs → ${out}`);
console.log('\nBy tag:');
for (const [tag, n] of Object.entries(byTag).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${tag}`);
}

const byHost = {};
for (const p of final) {
  const h = hostKey(p.url);
  byHost[h] = (byHost[h] || 0) + 1;
}
console.log('\nBy host (top 15):');
for (const [h, n] of Object.entries(byHost).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${String(n).padStart(4)}  ${h}`);
}
