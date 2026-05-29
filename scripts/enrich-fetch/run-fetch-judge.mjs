#!/usr/bin/env node
/**
 * LLM fetch quality judge — dev-only analysis on experiment bodies.
 *
 *   npm run fetch-judge -- --experiment data/experiments/enrich-fetch/2026-05-28T15-35-48
 *   npm run fetch-judge -- --experiment ... --scope url --max 50
 *   npm run fetch-judge -- --experiment ... --scope attempt --mode edge
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadProjectEnv } from '../lib/loadProjectEnv.mjs';
import { runUrlFetchJudge, runAttemptFetchJudge } from './lib/fetchJudgePrompts.mjs';
import {
  loadExperimentResults,
  buildUrlJudgeCandidates,
  buildJudgeCandidates,
  aggregateUrlJudgeResults,
  aggregateJudgeResults,
  buildUrlJudgeMarkdown,
  buildJudgeMarkdown,
} from './lib/fetchJudge.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');
const EXPERIMENTS_DIR = join(REPO_ROOT, 'data', 'experiments', 'enrich-fetch');

function parseArgs(argv) {
  const opts = {
    experiment: null,
    scope: 'url',
    mode: 'all',
    max: Infinity,
    concurrency: 6,
    providers: ['local', 'jina', 'markdown-new', 'syndication'],
    outDir: null,
    model: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--experiment') opts.experiment = argv[++i];
    else if (a === '--scope') opts.scope = argv[++i] || opts.scope;
    else if (a === '--mode') opts.mode = argv[++i] || opts.mode;
    else if (a === '--max') opts.max = Number(argv[++i]) || opts.max;
    else if (a === '--concurrency') opts.concurrency = Number(argv[++i]) || opts.concurrency;
    else if (a === '--providers') {
      opts.providers = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--out') opts.outDir = argv[++i];
    else if (a === '--model') opts.model = argv[++i];
    else if (a === '--results') {
      const p = argv[++i];
      opts.experiment = dirname(p);
    }
  }

  if (!opts.experiment) {
    console.error(
      'Usage: run-fetch-judge.mjs --experiment <dir> [--scope url|attempt] [--mode all|edge] [--max N]'
    );
    process.exit(1);
  }

  if (!opts.outDir) {
    const expName = opts.experiment.split('/').filter(Boolean).pop() || 'experiment';
    opts.outDir = join(
      EXPERIMENTS_DIR,
      `judge-${expName}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`
    );
  }

  return opts;
}

function aiSettingsFromEnv(modelOverride) {
  return {
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: modelOverride || process.env.OPENROUTER_JUDGE_MODEL || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    timeoutMs: 45_000,
  };
}

async function runUrlPool(candidates, settings, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < candidates.length) {
      const i = index++;
      const c = candidates[i];
      const outcome = await runUrlFetchJudge(settings, c);

      results.push({
        id: c.id,
        url: c.url,
        host: c.host,
        sourceKind: c.sourceKind,
        regexAnyUsable: c.regexAnyUsable,
        status: outcome.status,
        error: outcome.error,
        judge: outcome.data || null,
      });

      if ((i + 1) % 10 === 0 || i + 1 === candidates.length) {
        process.stderr.write(`  judged ${i + 1}/${candidates.length} URLs\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
  return results;
}

async function runAttemptPool(candidates, settings, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < candidates.length) {
      const i = index++;
      const c = candidates[i];
      const outcome = await runAttemptFetchJudge(settings, c);

      results.push({
        id: c.id,
        url: c.url,
        host: c.host,
        sourceKind: c.sourceKind,
        provider: c.provider,
        trigger: c.trigger,
        regexUsable: c.regexUsable,
        regexReason: c.regexReason,
        regexBytes: c.regexBytes,
        status: outcome.status,
        error: outcome.error,
        judge: outcome.data || null,
      });

      if ((i + 1) % 25 === 0 || i + 1 === candidates.length) {
        process.stderr.write(`  judged ${i + 1}/${candidates.length} attempts\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
  return results;
}

async function main() {
  const env = loadProjectEnv(__dir);
  if (!env.loaded) console.error('Warning: .env not found at', env.path);

  const opts = parseArgs(process.argv.slice(2));
  const settings = aiSettingsFromEnv(opts.model);

  if (!settings.apiKey.trim()) {
    console.error('Set OPENROUTER_API_KEY in .env');
    process.exit(1);
  }

  const experimentDir = opts.experiment.startsWith('/')
    ? opts.experiment
    : join(process.cwd(), opts.experiment);

  if (!existsSync(join(experimentDir, 'results.jsonl'))) {
    console.error(`No results.jsonl in ${experimentDir}`);
    process.exit(1);
  }

  const results = loadExperimentResults(experimentDir);
  let candidates =
    opts.scope === 'url'
      ? buildUrlJudgeCandidates(results, experimentDir, { providers: opts.providers })
      : buildJudgeCandidates(results, experimentDir, { mode: opts.mode, providers: opts.providers });

  console.error(`Experiment: ${experimentDir}`);
  console.error(`Scope: ${opts.scope}, candidates: ${candidates.length}, model: ${settings.model}`);

  if (opts.max < candidates.length) {
    candidates = candidates.slice(0, opts.max);
    console.error(`Capped to --max ${opts.max}`);
  }

  mkdirSync(opts.outDir, { recursive: true });

  const judged =
    opts.scope === 'url'
      ? await runUrlPool(candidates, settings, opts.concurrency)
      : await runAttemptPool(candidates, settings, opts.concurrency);

  const jsonlPath = join(opts.outDir, 'judge-results.jsonl');
  writeFileSync(jsonlPath, judged.map((r) => JSON.stringify(r)).join('\n') + '\n');

  if (opts.scope === 'url') {
    const metrics = aggregateUrlJudgeResults(judged);
    const md = buildUrlJudgeMarkdown({
      experimentDir,
      scope: opts.scope,
      metrics,
      candidateCount: candidates.length,
    });
    writeFileSync(join(opts.outDir, 'JUDGE.md'), md);
    writeFileSync(
      join(opts.outDir, 'meta.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          experimentDir,
          scope: opts.scope,
          model: settings.model,
          urlCount: candidates.length,
          judged: metrics.judged,
          regexOk: metrics.regexOk,
          judgeOk: metrics.judgeOk,
          disagreements: metrics.disagreements,
        },
        null,
        2
      )
    );
    console.error('');
    console.error(md.split('\n').slice(0, 30).join('\n'));
    console.error(`\nWrote ${jsonlPath}`);
    console.error(
      `URL usable: regex ${metrics.regexOk}/${candidates.length} → judge ${metrics.judgeOk}/${candidates.length} (disagree ${metrics.disagreements})`
    );
  } else {
    const metrics = aggregateJudgeResults(judged);
    const md = buildJudgeMarkdown({
      experimentDir,
      mode: opts.mode,
      metrics,
      providers: opts.providers,
      candidateCount: candidates.length,
    });
    writeFileSync(join(opts.outDir, 'JUDGE.md'), md);
    writeFileSync(
      join(opts.outDir, 'meta.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          experimentDir,
          scope: opts.scope,
          mode: opts.mode,
          model: settings.model,
          candidateCount: candidates.length,
          judged: metrics.judged,
          disagreements: metrics.disagreements,
        },
        null,
        2
      )
    );
    console.error('');
    console.error(md.split('\n').slice(0, 25).join('\n'));
    console.error(`\nWrote ${jsonlPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
