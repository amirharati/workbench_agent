#!/usr/bin/env node
/**
 * Task 03.1 — incremental discover (gap-fill on stuck classify outcomes).
 *
 *   npm run discover-incremental -- --state-in data/experiments/categorize/.../classify-state.jsonl --dry-run
 *   npm run discover-incremental -- --state-in .../classify-state.jsonl --run-llm --max-batches 1
 *   npm run discover-incremental -- --state-in ... --run-llm --all-eligible   # full corpus discover
 *   npm run discover-incremental -- --no-seed --all-eligible --run-llm --max-batches 4 --out .../cold
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadEnvFile, classifySettingsFromEnv } from './lib/loadEnv.mjs';
import { loadPipelineCorpus } from './lib/corpus.mjs';
import { DEFAULT_SEED_PATH, loadSeedTaxonomy } from './lib/seedTaxonomy.mjs';
import {
  bumpFailureBucket,
  buildDiscoverPool,
  DEFAULT_DISCOVER_BATCH_SIZE,
  emptyDiscoverRunSummary,
  MIN_DISCOVER_POOL,
  planDiscoverMapBatches,
  sliceDiscoverMapPool,
} from './lib/discoverPolicy.mjs';
import {
  callDiscoveryBatch,
  chunkItems,
  leafProposalsFromItemResults,
  mergeNewLeaves,
  mergeNewParents,
  sanitizeDiscoveryItemResults,
} from './lib/taxonomyDiscover.mjs';
import { ensureGeneralFallbackLeaves } from './lib/taxonomyCatalog.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');
const ENRICH_EXPERIMENTS_DIR = join(REPO_ROOT, 'data', 'experiments', 'enrich-fetch');
const CATEGORIZE_EXPERIMENTS_DIR = join(REPO_ROOT, 'data', 'experiments', 'categorize');

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
    seedIn: DEFAULT_SEED_PATH,
    stateIn: null,
    outDir: join(CATEGORIZE_EXPERIMENTS_DIR, `discover-inc-${ts}`),
    dryRun: true,
    runLlm: false,
    stuckOnly: true,
    batchSize: DEFAULT_DISCOVER_BATCH_SIZE,
    maxBatches: undefined,
    maxNewLeaves: 20,
    maxNewParents: 5,
    noSeed: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max') opts.max = Number(argv[++i]) || opts.max;
    else if (a === '--corpus') opts.corpora = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--ai-eval') opts.aiEvalJsonl = argv[++i];
    else if (a === '--no-seed') {
      opts.noSeed = true;
      opts.seedIn = null;
    } else if (a === '--seed-in') opts.seedIn = argv[++i];
    else if (a === '--state-in') opts.stateIn = argv[++i];
    else if (a === '--out') opts.outDir = argv[++i];
    else if (a === '--dry-run') {
      opts.dryRun = true;
      opts.runLlm = false;
    } else if (a === '--run-llm') {
      opts.runLlm = true;
      opts.dryRun = false;
    } else if (a === '--all-eligible') opts.stuckOnly = false;
    else if (a === '--batch-size') opts.batchSize = Number(argv[++i]) || opts.batchSize;
    else if (a === '--max-batches') {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0) opts.maxBatches = n;
    }
    else if (a === '--max-new-leaves') opts.maxNewLeaves = Number(argv[++i]) || opts.maxNewLeaves;
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

function buildSummaryMd({ summary, opts, mode, seedMeta }) {
  const lines = [
    `# Discover incremental run (${mode})`,
    '',
    `- Corpus: ${opts.corpora.join(', ')}`,
    `- Classify state: ${opts.stateIn ?? '(required for gap-fill)'}`,
    `- Seed: ${seedMeta.seedPath ?? opts.seedIn} (v${seedMeta.taxonomyVersion}, ${seedMeta.leafCount} leaves${seedMeta.coldStart ? ', cold start' : ''})`,
    `- Mode: ${opts.stuckOnly ? 'gap-fill (stuck only)' : 'all eligible'}`,
    `- Max batches: ${opts.maxBatches} · batch size: ${opts.batchSize}`,
    '',
    '| Metric | Count |',
    '|--------|-------|',
    ...Object.entries(summary)
      .filter(([k]) => k !== 'failureBuckets' && k !== 'stuckKindBreakdown')
      .map(([k, v]) => `| ${k} | ${typeof v === 'object' ? JSON.stringify(v) : v} |`),
    '',
    '### Stuck kind breakdown (eligible pool)',
    '',
    ...Object.entries(summary.stuckKindBreakdown).map(([k, v]) => `- ${k}: ${v}`),
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

async function main() {
  loadEnvFile();
  const opts = parseArgs(process.argv.slice(2));

  if (opts.stuckOnly && !opts.stateIn) {
    console.error('Gap-fill mode requires --state-in (classify-state.jsonl from classify-incremental)');
    process.exit(1);
  }
  if (!opts.noSeed && (!opts.seedIn || !existsSync(opts.seedIn))) {
    console.error(`Seed not found: ${opts.seedIn} (use --no-seed for cold taxonomy)`);
    process.exit(1);
  }

  mkdirSync(opts.outDir, { recursive: true });

  const { items } = loadPipelineCorpus({
    corpora: opts.corpora,
    aiEvalJsonl: existsSync(opts.aiEvalJsonl) ? opts.aiEvalJsonl : null,
    max: opts.max,
    includeSnippet: false,
  });

  const classifyStateByItem = loadStateJsonl(opts.stateIn);
  const { pool, summary: poolSummary } = buildDiscoverPool(items, classifyStateByItem, {
    stuckOnly: opts.stuckOnly,
  });

  const summary = { ...emptyDiscoverRunSummary(), ...poolSummary };

  console.error(
    `[discover] considered=${summary.totalConsidered} stuck_pool=${summary.stuckPool} ` +
      `skipped_not_stuck=${summary.skippedNotStuck} manual_review=${summary.skippedManualReview}`
  );

  if (pool.length < MIN_DISCOVER_POOL) {
    summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'pool_too_small');
    writeFileSync(join(opts.outDir, 'run-stats.json'), JSON.stringify({ at: Date.now(), summary }, null, 2));
    writeFileSync(
      join(opts.outDir, 'SUMMARY-dry-run.md'),
      buildSummaryMd({
        summary,
        opts,
        mode: 'dry-run',
        seedMeta: { taxonomyVersion: 0, leafCount: 0 },
      }) + `\n\nPool too small (need ≥${MIN_DISCOVER_POOL} stuck items).\n`
    );
    console.error(`Too few stuck items (${pool.length} < ${MIN_DISCOVER_POOL})`);
    process.exit(0);
  }

  const bootstrapMode = opts.noSeed;
  let parents = [];
  let parentIds = new Set();
  let leaves = [];
  let taxonomyVersion = 0;
  if (!opts.noSeed) {
    const seed = loadSeedTaxonomy(opts.seedIn);
    parents = [...(seed.parents ?? [])];
    parentIds = new Set(parents.map((p) => p.id));
    leaves = (seed.leaves ?? []).map((l) => ({
      id: l.id,
      parentId: l.parentId,
      name: l.name,
      description: l.description ?? '',
      canonicalTags: l.canonicalTags ?? [],
    }));
    taxonomyVersion = seed.taxonomyVersion ?? 0;
  }
  const seedMeta = {
    taxonomyVersion,
    leafCount: leaves.length,
    coldStart: opts.noSeed,
    seedPath: opts.noSeed ? '(none)' : opts.seedIn,
  };

  const batches = sliceDiscoverMapPool(pool, opts.batchSize, opts.maxBatches);
  const mapPlan = planDiscoverMapBatches(pool.length, opts.batchSize, opts.maxBatches);
  summary.itemsSampled = mapPlan.itemsSampled;
  summary.discoverBatches = mapPlan.mapBatchCount;

  const batchLogs = [];
  const allItemResults = [];
  const sampledIds = new Set();
  const successfulSampleIds = new Set();

  async function runOneBatch(settings, batch, batchIndex) {
    const resp = await callDiscoveryBatch(settings, parents, leaves, batch, {
      maxNewPerBatch: opts.maxNewLeaves,
      maxNewParents: opts.maxNewParents,
      bootstrapMode: leaves.length === 0,
      gapFillMode: opts.stuckOnly && leaves.length > 0,
    });

    if (resp.ok) return { ok: true, data: resp.data, batch };

    if (batch.length <= 1) {
      return { ok: false, error: resp.error, batch };
    }

    console.error(`  Batch ${batchIndex + 1} failed (${resp.error}); retrying as singles…`);
    const merged = { newParents: [], newLeaves: [], itemResults: [] };
    let errors = 0;
    for (const single of batch) {
      const one = await callDiscoveryBatch(settings, parents, leaves, [single], {
        maxNewPerBatch: opts.maxNewLeaves,
        maxNewParents: opts.maxNewParents,
        bootstrapMode: leaves.length === 0,
        gapFillMode: opts.stuckOnly && leaves.length > 0,
      });
      if (!one.ok) {
        errors++;
        continue;
      }
      const d = one.data ?? {};
      merged.newParents.push(...(d.newParents ?? []));
      merged.newLeaves.push(...(d.newLeaves ?? []));
      merged.itemResults.push(...(d.itemResults ?? []));
    }
    if (!merged.itemResults.length && errors === batch.length) {
      return { ok: false, error: resp.error, batch };
    }
    return { ok: true, data: merged, batch, retriedSingles: true, singleErrors: errors };
  }

  if (opts.runLlm) {
    const settings = classifySettingsFromEnv();
    if (!settings.apiKey?.trim()) {
      console.error('Set OPENROUTER_API_KEY for --run-llm');
      process.exit(1);
    }

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      for (const row of batch) sampledIds.add(row.itemId);

      console.error(`Batch ${b + 1}/${batches.length}: ${batch.length} stuck items, ${leaves.length} leaves`);

      const result = await runOneBatch(settings, batch, b);

      if (!result.ok) {
        summary.llmErrors++;
        summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'llm_batch_error');
        batchLogs.push({ batchIndex: b, error: result.error, itemCount: batch.length });
        console.error(`  Batch failed: ${result.error}`);
        continue;
      }

      if (result.singleErrors) {
        summary.llmErrors += result.singleErrors;
        summary.failureBuckets = bumpFailureBucket(
          summary.failureBuckets,
          'llm_single_error'
        );
      }

      for (const row of batch) successfulSampleIds.add(row.itemId);

      const data = result.data ?? {};
      const rawParents = Array.isArray(data.newParents) ? data.newParents : [];
      const rawLeaves = Array.isArray(data.newLeaves) ? data.newLeaves : [];
      summary.proposedParentsRaw += rawParents.length;
      summary.proposedLeavesRaw += rawLeaves.length;

      const leafIds = new Set(leaves.map((l) => l.id));
      const rawItemResults = Array.isArray(data.itemResults) ? data.itemResults : [];
      const itemResults = sanitizeDiscoveryItemResults(rawItemResults, parentIds, leafIds);

      const parentMerge = mergeNewParents(parents, rawParents, { maxNewPerBatch: opts.maxNewParents });
      parents = parentMerge.parentsSoFar;
      parentIds = parentMerge.parentIds;
      summary.newParents += (parentMerge.added ?? []).length;

      const fromResults = leafProposalsFromItemResults(itemResults, parentIds);
      const leavesBefore = leaves.length;
      const merge = mergeNewLeaves(
        [...leaves],
        [...rawLeaves, ...fromResults],
        parentIds,
        { maxNewPerBatch: opts.maxNewLeaves }
      );
      leaves = merge.leavesSoFar;
      const added = merge.added ?? [];
      summary.newLeaves += added.length;
      summary.duplicateLeavesSkipped += rawLeaves.length + fromResults.length - added.length;
      ensureGeneralFallbackLeaves(parents, leaves);

      if (added.length) taxonomyVersion += 1;

      for (const row of itemResults) {
        allItemResults.push({ ...row, batchIndex: b });
      }

      batchLogs.push({
        batchIndex: b,
        itemCount: batch.length,
        retriedSingles: Boolean(result.retriedSingles),
        stuckKinds: batch.reduce((acc, i) => {
          acc[i.stuckKind] = (acc[i.stuckKind] ?? 0) + 1;
          return acc;
        }, {}),
        newParentsAdded: (parentMerge.added ?? []).map((p) => ({ id: p.id, name: p.name })),
        newLeavesAdded: added.map((l) => ({ id: l.id, name: l.name, parentId: l.parentId })),
        leavesBefore,
        leavesAfter: leaves.length,
      });

      console.error(
        `  +${(parentMerge.added ?? []).length} parents, +${added.length} leaves → ${leaves.length} total leaves`
      );
    }

    if (summary.newLeaves === 0 && summary.proposedLeavesRaw > 0) {
      summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'all_duplicates');
    }
  } else {
    for (const batch of batches) {
      for (const row of batch) sampledIds.add(row.itemId);
    }
  }

  // Mark sampled stuck items for reclassify only when discover LLM succeeded for that batch
  const reclassifyIds = opts.runLlm ? successfulSampleIds : sampledIds;
  const classifyStateOut = [];
  for (const [itemId, prev] of classifyStateByItem) {
    if (!reclassifyIds.has(itemId)) {
      classifyStateOut.push(prev);
      continue;
    }
    if (
      prev.classifyState === 'pending_discover' ||
      prev.classifyState === 'classified_general' ||
      prev.discoverState === 'pending'
    ) {
      classifyStateOut.push({
        ...prev,
        itemId,
        classifyState: 'pending_classify',
        discoverState: 'done',
        lastDiscoverAt: Date.now(),
      });
      summary.itemsMarkedForReclassify++;
    } else {
      classifyStateOut.push(prev);
    }
  }

  const taxonomyOut = {
    version: 1,
    taxonomyVersion,
    description: 'Gap-fill discover incremental run',
    discoveredAt: new Date().toISOString(),
    parents,
    leaves,
    corpusMeta: {
      classifyStateIn: opts.stateIn,
      stuckOnly: opts.stuckOnly,
      itemsSampled: summary.itemsSampled,
    },
  };

  writeFileSync(join(opts.outDir, 'discovery-batches.json'), JSON.stringify(batchLogs, null, 2));
  writeFileSync(join(opts.outDir, 'taxonomy-out.json'), JSON.stringify(taxonomyOut, null, 2));
  writeFileSync(
    join(opts.outDir, 'discovery-item-results.jsonl'),
    allItemResults.map((r) => JSON.stringify(r)).join('\n') + (allItemResults.length ? '\n' : '')
  );
  writeFileSync(
    join(opts.outDir, 'classify-state-after-discover.jsonl'),
    classifyStateOut.map((r) => JSON.stringify(r)).join('\n') + '\n'
  );
  writeFileSync(
    join(opts.outDir, 'discover-pool.jsonl'),
    pool.slice(0, summary.itemsSampled).map((r) => JSON.stringify(r)).join('\n') + '\n'
  );
  writeFileSync(join(opts.outDir, 'run-stats.json'), JSON.stringify({ at: Date.now(), summary }, null, 2));

  const mode = opts.runLlm ? 'llm' : 'dry-run';
  writeFileSync(
    join(opts.outDir, `SUMMARY-${mode}.md`),
    buildSummaryMd({ summary, opts, mode, seedMeta })
  );

  console.error('[discover] Summary:', summary);
  console.error(`Wrote ${opts.outDir}`);
  if (opts.runLlm && summary.newLeaves > 0) {
    console.error(
      `Next: npm run classify-incremental -- --run-llm --state-in ${join(opts.outDir, 'classify-state-after-discover.jsonl')} --seed-taxonomy ${join(opts.outDir, 'taxonomy-out.json')}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
