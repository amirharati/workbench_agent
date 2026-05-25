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

const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const envPath = join(__dir, '..', '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function parseArgs(argv) {
  const opts = {
    variant: 'v2',
    compare: false,
    max: Infinity,
    concurrency: 3,
    corpora: ['2026-05-21T02-02-56', '2026-05-21T03-03-24'],
    outDir: join(
      __dir,
      'experiments',
      `ai-eval-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`
    ),
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--variant') opts.variant = argv[++i] || opts.variant;
    else if (a === '--compare') opts.compare = true;
    else if (a === '--max') opts.max = Number(argv[++i]) || opts.max;
    else if (a === '--concurrency') opts.concurrency = Number(argv[++i]) || opts.concurrency;
    else if (a === '--corpus') opts.corpora = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--out') opts.outDir = argv[++i];
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
  loadEnvFile();
  const opts = parseArgs(process.argv.slice(2));
  const settings = aiSettingsFromEnv();

  if (!settings.apiKey.trim()) {
    console.error('Set OPENROUTER_API_KEY (or OPENAI_API_KEY) to run AI eval.');
    process.exit(1);
  }

  let corpus = loadCorpusItems(opts.corpora);
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

  console.error('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
