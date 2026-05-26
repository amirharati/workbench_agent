#!/usr/bin/env node
/**
 * Task 03 — incremental classify diagnostics + optional LLM run (CLI parity).
 *
 *   npm run classify-incremental -- --dry-run
 *   npm run classify-incremental -- --run-llm --max 40
 *   npm run classify-incremental -- --state-in ./data/experiments/categorize/.../classify-state.jsonl --dry-run
 *   npm run classify-incremental -- --retry-stuck --run-llm
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadEnvFile, classifySettingsFromEnv } from './lib/loadEnv.mjs';
import { loadPipelineCorpus } from './lib/corpus.mjs';
import { assessCategorizationEligibility } from './lib/eligibility.mjs';
import {
  applyClassifyRetryPolicy,
  bumpFailureBucket,
  emptyTopicClassifySummary,
  isGeneralLeafId,
  shouldSkipClassify,
} from './lib/classifyPolicy.mjs';
import { callTopicExtractBatch, topicRowToDecision } from './lib/topicExtract.mjs';
import { DEFAULT_SEED_PATH, loadSeedTaxonomy } from './lib/seedTaxonomy.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');
const ENRICH_EXPERIMENTS_DIR = join(REPO_ROOT, 'data', 'experiments', 'enrich-fetch');
const CATEGORIZE_EXPERIMENTS_DIR = join(REPO_ROOT, 'data', 'experiments', 'categorize');

function hashText(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function parseArgs(argv) {
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const opts = {
    max: Infinity,
    corpora: ['2026-05-21T02-02-56', '2026-05-21T03-03-24'],
    aiEvalJsonl: join(
      ENRICH_EXPERIMENTS_DIR,
      'ai-eval-2026-05-25T01-53-38',
      'results-v2.jsonl'
    ),
    seedTaxonomy: DEFAULT_SEED_PATH,
    stateIn: null,
    outDir: join(CATEGORIZE_EXPERIMENTS_DIR, `classify-inc-${ts}`),
    dryRun: true,
    runLlm: false,
    forceReclassify: false,
    retryStuck: false,
    reviewBatchSize: 12,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max') opts.max = Number(argv[++i]) || opts.max;
    else if (a === '--corpus') opts.corpora = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--ai-eval') opts.aiEvalJsonl = argv[++i];
    else if (a === '--seed-taxonomy') opts.seedTaxonomy = argv[++i];
    else if (a === '--state-in') opts.stateIn = argv[++i];
    else if (a === '--out') opts.outDir = argv[++i];
    else if (a === '--dry-run') {
      opts.dryRun = true;
      opts.runLlm = false;
    } else if (a === '--run-llm') {
      opts.runLlm = true;
      opts.dryRun = false;
    } else if (a === '--force-reclassify') opts.forceReclassify = true;
    else if (a === '--retry-stuck') opts.retryStuck = true;
    else if (a === '--review-batch') opts.reviewBatchSize = Number(argv[++i]) || opts.reviewBatchSize;
  }

  return opts;
}

function loadStateJsonl(path) {
  const map = new Map();
  if (!path || !existsSync(path)) return map;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.itemId) map.set(row.itemId, row);
    } catch {
      /* skip */
    }
  }
  return map;
}

function buildSummaryMd({ summary, opts, mode }) {
  const lines = [
    `# Classify incremental run (${mode})`,
    '',
    `- Corpus: ${opts.corpora.join(', ')}`,
    `- State in: ${opts.stateIn ?? '(none — fresh)'}`,
    `- Force reclassify: ${opts.forceReclassify}`,
    `- Retry stuck (manual_review): ${opts.retryStuck}`,
    '',
    '| Metric | Count |',
    '|--------|-------|',
    ...Object.entries(summary)
      .filter(([k]) => k !== 'failureBuckets' && k !== 'inputQuality')
      .map(([k, v]) => `| ${k} | ${typeof v === 'object' ? JSON.stringify(v) : v} |`),
    '',
    '### Input quality',
    '',
    `- high: ${summary.inputQuality.high}`,
    `- medium: ${summary.inputQuality.medium}`,
    `- low: ${summary.inputQuality.low}`,
    '',
  ];
  if (Object.keys(summary.failureBuckets).length) {
    lines.push('### Failure buckets', '');
    for (const [k, v] of Object.entries(summary.failureBuckets)) {
      lines.push(`- ${k}: ${v}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  loadEnvFile();
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(opts.outDir, { recursive: true });

  const { items } = loadPipelineCorpus({
    corpora: opts.corpora,
    aiEvalJsonl: existsSync(opts.aiEvalJsonl) ? opts.aiEvalJsonl : null,
    max: opts.max,
    includeSnippet: false,
  });

  if (!existsSync(opts.seedTaxonomy)) {
    console.error(`Seed not found: ${opts.seedTaxonomy}`);
    process.exit(1);
  }

  const { categories } = (() => {
    const seed = loadSeedTaxonomy(opts.seedTaxonomy);
    const categories = seed.leaves.map((leaf) => ({
      id: `seed_${leaf.id}`,
      name: leaf.name,
      description: leaf.description ?? '',
      canonicalTags: leaf.canonicalTags ?? [],
      parentId: leaf.parentId ?? null,
      parentName: seed.parentById.get(leaf.parentId)?.name ?? null,
    }));
    return { categories };
  })();
  const parents = [
    ...new Map(
      categories
        .filter((c) => c.parentId)
        .map((c) => [c.parentId, { id: c.parentId, name: c.parentName ?? c.parentId }])
    ).values(),
  ];
  const categoryIds = new Set(categories.map((c) => c.id));
  const leafById = new Map(categories.map((c) => [c.id, c]));

  const priorState = loadStateJsonl(opts.stateIn);
  const summary = emptyTopicClassifySummary();
  const toProcess = [];
  const nextStateRows = [];

  for (const item of items) {
    summary.totalConsidered++;
    const eligibility = assessCategorizationEligibility({
      title: item.title,
      notes: item.notes,
      aiStatus: item.aiSummary ? 'ok' : item.categorizationEligible ? 'ok' : 'content_too_short',
      aiSummary: item.aiSummary,
      aiTags: item.enrichmentAiTags,
      aiKeyPoints: item.aiKeyPoints,
      snippet: '',
    });

    if (!item.categorizationEligible) {
      summary.skippedIneligible++;
      summary.failureBuckets = bumpFailureBucket(
        summary.failureBuckets,
        item.eligibilityReason?.split('(')[0]?.trim() || 'ineligible'
      );
      nextStateRows.push({
        itemId: item.itemId,
        classifyState: 'ineligible',
        eligibilityReason: item.eligibilityReason,
        classifyRetryCount: priorState.get(item.itemId)?.classifyRetryCount ?? 0,
      });
      continue;
    }

    if (eligibility.qualityTier) summary.inputQuality[eligibility.qualityTier]++;

    const hash = hashText(item.classifyText || item.text || '');
    const prev = priorState.get(item.itemId) ?? {};
    const st = prev.classifyState;
    const primaryId = prev.primaryCategoryId ?? null;
    const hashMatch = prev.classifyTextHash === hash;

    const skip = shouldSkipClassify({
      classifyState: st,
      primaryCategoryId: primaryId,
      hashMatch,
      eligible: true,
      forceReclassify: opts.forceReclassify,
      retryManualReview: opts.retryStuck,
    });

    if (skip.skip) {
      if (skip.reason === 'manual_review') summary.skippedManualReview++;
      else summary.skippedHash++;
      nextStateRows.push({ ...prev, itemId: item.itemId, classifyTextHash: hash });
      continue;
    }

    toProcess.push({ item, hash, prev, qualityTier: eligibility.qualityTier });
  }

  console.error(
    `[incremental] considered=${summary.totalConsidered} to_llm=${toProcess.length} skipped_hash=${summary.skippedHash} ineligible=${summary.skippedIneligible} manual_review=${summary.skippedManualReview}`
  );

  if (opts.runLlm) {
    const settings = classifySettingsFromEnv();
    if (!settings.apiKey?.trim()) {
      console.error('Set OPENROUTER_API_KEY for --run-llm');
      process.exit(1);
    }

    const batches = chunk(
      toProcess.map(({ item }) => ({
        itemId: item.itemId,
        title: item.title,
        textForClassification: item.classifyText || item.text,
        enrichmentAiTags: item.enrichmentAiTags,
      })),
      opts.reviewBatchSize
    );

    const decisions = new Map();
    for (const batch of batches) {
      summary.batches++;
      const resp = await callTopicExtractBatch(settings, categories, batch, { parents });
      if (!resp.ok) {
        for (const b of batch) {
          decisions.set(b.itemId, { status: 'error', decisionType: 'none' });
          summary.llmErrors++;
          summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'llm_error');
        }
        continue;
      }
      for (const row of resp.rows ?? []) {
        const d = topicRowToDecision(row, categoryIds, leafById);
        if (d) decisions.set(d.itemId, d);
      }
    }

    for (const { item, hash, prev, qualityTier } of toProcess) {
      summary.processed++;
      const decision = decisions.get(item.itemId);
      const prevRetry = prev.classifyRetryCount ?? 0;
      let classifyState = 'pending_classify';
      let primaryCategoryId = null;
      let retryCount = prevRetry;

      if (!decision || decision.status === 'error') {
        const retry = applyClassifyRetryPolicy(prevRetry, 'error');
        classifyState = retry.nextState;
        retryCount = retry.nextRetryCount;
        summary.llmErrors++;
        summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'llm_error');
      } else if (decision.decisionType === 'existing' && decision.categoryIds?.length) {
        primaryCategoryId = decision.categoryIds[0];
        if (isGeneralLeafId(primaryCategoryId)) {
          const retry = applyClassifyRetryPolicy(prevRetry, 'general');
          classifyState = retry.nextState;
          retryCount = retry.nextRetryCount;
          summary.classifiedGeneral++;
          summary.assignedPrimary++;
        } else {
          classifyState = 'classified';
          retryCount = 0;
          summary.classifiedSpecific++;
          summary.assignedPrimary++;
        }
      } else {
        const retry = applyClassifyRetryPolicy(prevRetry, 'unassigned');
        classifyState = retry.nextState;
        retryCount = retry.nextRetryCount;
        summary.unassigned++;
        if (retry.routedToManualReview) {
          summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'manual_review_unassigned');
        } else {
          summary.pendingDiscover++;
        }
      }

      nextStateRows.push({
        itemId: item.itemId,
        classifyTextHash: hash,
        classifyState,
        primaryCategoryId,
        classifyRetryCount: retryCount,
        inputQualityTier: qualityTier,
        llmReview: decision,
      });
    }
  } else {
    for (const { item, hash, prev } of toProcess) {
      nextStateRows.push({
        ...prev,
        itemId: item.itemId,
        classifyTextHash: hash,
        classifyState: prev.classifyState ?? 'pending_classify',
      });
    }
  }

  const mode = opts.runLlm ? 'llm' : 'dry-run';
  writeFileSync(
    join(opts.outDir, 'classify-state.jsonl'),
    nextStateRows.map((r) => JSON.stringify(r)).join('\n') + '\n'
  );
  writeFileSync(join(opts.outDir, 'run-stats.json'), JSON.stringify({ at: Date.now(), summary }, null, 2));
  writeFileSync(join(opts.outDir, `SUMMARY-${mode}.md`), buildSummaryMd({ summary, opts, mode }));

  console.error('[incremental] Summary:', summary);
  console.error(`Wrote ${opts.outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
