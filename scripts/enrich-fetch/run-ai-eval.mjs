#!/usr/bin/env node
/**
 * AI extraction eval — run prompt variants over saved experiment bodies.
 *
 *   node scripts/enrich-fetch/run-ai-eval.mjs
 *   node scripts/enrich-fetch/run-ai-eval.mjs --variant v1 --max 20
 *   node scripts/enrich-fetch/run-ai-eval.mjs --compare
 *
 * Requires OPENROUTER_API_KEY in env (or .env loaded by shell).
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runOpenRouterExtract } from './lib/aiPrompts.mjs';
import {
  loadCorpusItems,
  aggregateMetrics,
  buildSummaryMarkdown,
} from './lib/aiEvalCorpus.mjs';

import { loadProjectEnv } from '../lib/loadProjectEnv.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');
const EXPERIMENTS_DIR = join(REPO_ROOT, 'data', 'experiments', 'enrich-fetch');

function parseArgs(argv) {
  const opts = {
    variant: 'v2',
    compare: false,
    max: Infinity,
    concurrency: 3,
    corpora: ['2026-05-21T02-02-56', '2026-05-21T03-03-24'],
    outDir: join(EXPERIMENTS_DIR, `ai-eval-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`),
    ids: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--variant') opts.variant = argv[++i] || opts.variant;
    else if (a === '--compare') opts.compare = true;
    else if (a === '--max') opts.max = Number(argv[++i]) || opts.max;
    else if (a === '--concurrency') opts.concurrency = Number(argv[++i]) || opts.concurrency;
    else if (a === '--corpus') opts.corpora = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--out') opts.outDir = argv[++i];
    else if (a === '--ids') {
      opts.ids = new Set(
        (argv[++i] || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
    } else if (a === '--from-results') {
      const p = argv[++i];
      const rows = readFileSync(p, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      opts.ids = new Set(
        rows.filter((r) => r.status === 'empty_response').map((r) => r.id)
      );
    }
  }

  return opts;
}

function aiSettingsFromEnv() {
  return {
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    temperature: 0.2,
    maxOutputTokens: 700,
    timeoutMs: 25_000,
  };
}

async function runVariant(variant, items, settings, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      const item = items[i];
      const outcome = await runOpenRouterExtract(settings, {
        url: item.url,
        title: item.title,
        body: item.snippet,
        sourceKind: item.sourceKind,
        hints: item.hints,
        variant,
      });

      results.push({
        id: item.id,
        url: item.url,
        sourceKind: item.sourceKind,
        snippetLen: item.snippetLen,
        provider: item.provider,
        variant,
        status: outcome.status,
        error: outcome.error,
        data: outcome.data,
      });

      if ((i + 1) % 10 === 0 || i + 1 === items.length) {
        process.stderr.write(`  ${variant}: ${i + 1}/${items.length}\n`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function main() {
  const env = loadProjectEnv(__dir);
  if (!env.loaded) console.error('Warning: .env not found at', env.path);
  const opts = parseArgs(process.argv.slice(2));
  const settings = aiSettingsFromEnv();

  if (!settings.apiKey.trim()) {
    console.error('Set OPENROUTER_API_KEY (or OPENAI_API_KEY) to run AI eval.');
    process.exit(1);
  }

  let corpus = loadCorpusItems(opts.corpora);
  if (opts.ids?.size) {
    corpus = corpus.filter((c) => opts.ids.has(c.id));
    console.error(`Filtered to ${corpus.length} item(s) by --ids / --from-results`);
  }
  if (opts.max < corpus.length) corpus = corpus.slice(0, opts.max);

  console.error(`Corpus: ${corpus.length} items from ${opts.corpora.join(', ')}`);

  const byKind = {};
  for (const c of corpus) {
    byKind[c.sourceKind] = (byKind[c.sourceKind] || 0) + 1;
  }
  console.error('By sourceKind:', byKind);

  mkdirSync(opts.outDir, { recursive: true });

  const variants = opts.compare ? ['v1', 'v2'] : [opts.variant];
  const summaries = [];

  for (const variant of variants) {
    console.error(`Running variant ${variant}…`);
    const results = await runVariant(variant, corpus, settings, opts.concurrency);
    const metrics = aggregateMetrics(results);

    const jsonlPath = join(opts.outDir, `results-${variant}.jsonl`);
    writeFileSync(
      jsonlPath,
      results.map((r) => JSON.stringify(r)).join('\n') + '\n'
    );

    const md = buildSummaryMarkdown({
      variant,
      corpora: opts.corpora,
      metrics,
      outDir: opts.outDir,
    });
    const mdPath = join(opts.outDir, `SUMMARY-${variant}.md`);
    writeFileSync(mdPath, md);

    summaries.push({ variant, metrics, mdPath, jsonlPath });
    console.error(`Wrote ${jsonlPath}`);
    console.error(`Wrote ${mdPath}`);
  }

  if (opts.compare && summaries.length === 2) {
    const [a, b] = summaries;
    const cmp = [
      '# AI eval comparison (v1 vs v2)',
      '',
      `| Metric | v1 | v2 |`,
      `|--------|----|----|`,
      `| ok rate | ${a.metrics.parseOkPct}% | ${b.metrics.parseOkPct}% |`,
      `| summary rate | ${a.metrics.summaryPct}% | ${b.metrics.summaryPct}% |`,
      `| title rate | ${a.metrics.titlePct}% | ${b.metrics.titlePct}% |`,
      `| avg tags | ${a.metrics.avgTags} | ${b.metrics.avgTags} |`,
      '',
    ].join('\n');
    const cmpPath = join(opts.outDir, 'COMPARE.md');
    writeFileSync(cmpPath, cmp);
    console.error(`Wrote ${cmpPath}`);
  }

  for (const { variant, jsonlPath } of summaries) {
    const lines = readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
    const rows = lines.map((l) => JSON.parse(l));
    const apiErrors = rows.filter((r) => r.status === 'api_error');
    const auth401 = apiErrors.filter(
      (r) => typeof r.error === 'string' && r.error.includes('401')
    );
    if (auth401.length === rows.length && rows.length > 0) {
      console.error('');
      console.error(
        `❌ All ${rows.length} item(s) failed with HTTP 401 (OpenRouter: "User not found").`
      );
      console.error(
        '   This is the same .env key categorize uses — fix OPENROUTER_API_KEY in .env (and Settings > AI).'
      );
      console.error(
        '   OpenRouter often returns this for expired/revoked keys: https://openrouter.ai/keys'
      );
      console.error(`   See ${jsonlPath} for details.`);
      process.exit(1);
    }
    if (apiErrors.length === rows.length && rows.length > 0) {
      console.error('');
      console.error(`❌ All ${rows.length} item(s) had api_error (variant ${variant}).`);
      console.error(`   See ${jsonlPath}`);
      process.exit(1);
    }
  }

  console.error('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
