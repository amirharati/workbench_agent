#!/usr/bin/env node
/**
 * Batch fetch experiment — run providers on many URLs, save JSONL, print analysis.
 *
 *   node scripts/enrich-fetch/run-experiment.mjs urls.txt
 *   node scripts/enrich-fetch/run-experiment.mjs --from-backup ~/path/latest.json --max 2
 *   node scripts/enrich-fetch/run-experiment.mjs --from-backup backup.json --max 24 --tab-profile ./.fetch-browser
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { classifySourceKind, parseFetchedContent } from './lib/parse.mjs';
import { PROVIDERS, diagnoseResult, setProviderRunOptions } from './lib/providers.mjs';
import { setTabBrowserOptions } from './lib/tabBrowser.mjs';
import { persistUrlResults } from './lib/experimentStore.mjs';
import { analyzeResults } from './analyze-experiment.mjs';
import { isRedditHost, redditBlockedResult, resolveFetchUrl } from './lib/urlPolicy.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');
const EXPERIMENTS_DIR = join(REPO_ROOT, 'data', 'experiments', 'enrich-fetch');
const CORE_PROVIDERS = ['local', 'tab', 'jina', 'markdown-new'];

function parseArgs(argv) {
  const opts = {
    providers: [...CORE_PROVIDERS],
    includeSyndication: false,
    noTab: false,
    tabHeaded: false,
    tabProfile: null,
    max: 2,
    outDir: join(EXPERIMENTS_DIR, new Date().toISOString().slice(0, 19).replace(/:/g, '-')),
    urlFile: null,
    backup: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-tab') opts.noTab = true;
    else if (a === '--tab-headed') opts.tabHeaded = true;
    else if (a === '--tab-profile') opts.tabProfile = argv[++i] || null;
    else if (a === '--with-syndication') opts.includeSyndication = true;
    else if (a === '--max' || a === '--limit') opts.max = Number(argv[++i]) || opts.max;
    else if (a === '--out') opts.outDir = argv[++i];
    else if (a === '--from-backup') opts.backup = argv[++i];
    else if (a === '--providers') {
      opts.providers = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (!a.startsWith('-') && !opts.urlFile) {
      opts.urlFile = a;
    }
  }

  if (opts.noTab) {
    opts.providers = opts.providers.filter((p) => p !== 'tab');
  }

  return opts;
}

function loadUrls(opts) {
  if (opts.backup) {
    const picked = join(__dir, 'experiments', '_picked.txt');
    const r = spawnSync(
      process.execPath,
      [join(__dir, 'pick-urls.mjs'), opts.backup, '--max', String(opts.max), '--out', picked],
      { encoding: 'utf8' }
    );
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout);
      process.exit(1);
    }
    opts.urlFile = picked;
  }

  if (!opts.urlFile) {
    opts.urlFile = join(__dir, 'seeds', 'diverse-urls.txt');
  }

  if (!existsSync(opts.urlFile)) {
    console.error(`URL file not found: ${opts.urlFile}`);
    console.error('Export backup from Settings, then: --from-backup path/to/latest.json');
    process.exit(1);
  }

  const urls = readFileSync(opts.urlFile, 'utf8')
    .split('\n')
    .map((l) => l.replace(/\s+#.*$/, '').trim())
    .filter((l) => l && !l.startsWith('#') && /^https?:\/\//i.test(l));

  return opts.max > 0 ? urls.slice(0, opts.max) : urls;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'invalid';
  }
}

const REDDIT_SKIP_PROVIDERS = new Set(['local', 'jina', 'markdown-new']);

async function runOne(rawUrl, providerNames) {
  const { url, resolvedFrom } = await resolveFetchUrl(rawUrl);
  const sourceKind = classifySourceKind(url);
  const ctx = { url };
  const attempts = [];

  for (const name of providerNames) {
    if (name === 'syndication' && sourceKind !== 'x') {
      attempts.push({
        id: 'syndication',
        ok: false,
        errorCode: 'excluded',
        diagnosis: { usable: false, reason: 'excluded', detail: 'not X URL' },
      });
      continue;
    }
    if (isRedditHost(url) && REDDIT_SKIP_PROVIDERS.has(name)) {
      const blocked = redditBlockedResult(name);
      attempts.push({
        ...blocked,
        diagnosis: diagnoseResult(blocked, ctx),
        ms: 0,
        parsed: null,
      });
      continue;
    }
    const fn = PROVIDERS[name];
    if (!fn) continue;
    const t0 = Date.now();
    const result = await fn(url);
    const diagnosis = diagnoseResult(result, ctx);
    let parsed;
    if (result.ok && result.markdown) {
      parsed = parseFetchedContent(result.markdown, sourceKind, result.title);
    }
    attempts.push({
      ...result,
      diagnosis,
      ms: Date.now() - t0,
      parsed: parsed
        ? {
            title: parsed.title,
            snippet: parsed.snippet,
            summary: parsed.summary,
            quotedText: parsed.quotedText,
            quotedAuthor: parsed.quotedAuthor,
          }
        : null,
    });
  }

  return {
    url: rawUrl,
    fetchUrl: url,
    resolvedFrom,
    host: hostOf(url),
    sourceKind,
    attempts,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const urls = loadUrls(opts);
  const providerNames = [...opts.providers];
  if (opts.includeSyndication && !providerNames.includes('syndication')) {
    providerNames.push('syndication');
  }

  setProviderRunOptions({ includeTab: providerNames.includes('tab') });
  setTabBrowserOptions({
    headed: opts.tabHeaded,
    userDataDir: opts.tabProfile,
  });

  mkdirSync(opts.outDir, { recursive: true });

  console.log(`Experiment: ${urls.length} URLs × providers [${providerNames.join(', ')}]`);
  console.log(`Output: ${opts.outDir}\n`);

  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    process.stderr.write(`[${i + 1}/${urls.length}] ${url.slice(0, 70)}…\n`);
    const raw = await runOne(url, providerNames);
    results.push(persistUrlResults(opts.outDir, i, raw));
  }

  const jsonlPath = join(opts.outDir, 'results.jsonl');
  writeFileSync(
    jsonlPath,
    results.map((r) => JSON.stringify(r)).join('\n') + '\n'
  );

  const meta = {
    at: new Date().toISOString(),
    urlCount: urls.length,
    providers: providerNames,
    urlFile: opts.urlFile,
  };
  writeFileSync(join(opts.outDir, 'meta.json'), JSON.stringify(meta, null, 2));

  const report = analyzeResults(results, providerNames);
  writeFileSync(join(opts.outDir, 'ANALYSIS.md'), report);
  console.log('\n' + report);
  console.log(`\nSaved: ${jsonlPath}`);
  console.log(`Full bodies: ${join(opts.outDir, 'bodies')}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
