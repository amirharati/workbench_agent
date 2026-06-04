#!/usr/bin/env -S npx tsx
/**
 * Incremental discover CLI — uses app map→reduce (src/lib/categorization).
 * Replaces duplicated logic in taxonomyDiscover.mjs for eval and dogfood.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
// @ts-expect-error — ESM corpus helper
import { loadPipelineCorpus } from './lib/corpus.mjs';
// @ts-expect-error
import { loadEnvFile, classifySettingsFromEnv } from './lib/loadEnv.mjs';
// @ts-expect-error
import {
  bumpFailureBucket,
  buildDiscoverPool,
  emptyDiscoverRunSummary,
  MIN_DISCOVER_POOL,
} from './lib/discoverPolicy.mjs';
import {
  runDiscoverMapReduce,
  DISCOVER_MAP_BATCH_SIZE,
} from '../../src/lib/categorization/discoverMapReduce.ts';
import {
  planDiscoverMapBatches,
} from '../../src/lib/categorization/discoverPolicy.ts';
import {
  seedDocumentToCategories,
  type SeedDocument,
} from '../../src/lib/categorization/seedImport.ts';
import type { AISettings } from '../../src/lib/ai/types.ts';
import type { AiCategory, DiscoverRunSummary } from '../../src/lib/categorization/types.ts';

function cliAISettings(): AISettings {
  const e = classifySettingsFromEnv();
  return {
    provider: 'openrouter',
    baseUrl: e.baseUrl,
    model: e.model,
    apiKey: e.apiKey,
    timeoutMs: e.timeoutMs,
    temperature: e.temperature ?? 0.15,
    maxOutputTokens: e.maxOutputTokens ?? 4000,
    strictModelMatch: false,
    routingMode: 'single',
    taskModels: {},
  };
}

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');
const ENRICH_EXPERIMENTS_DIR = join(REPO_ROOT, 'data', 'experiments', 'enrich-fetch');
const CATEGORIZE_EXPERIMENTS_DIR = join(REPO_ROOT, 'data', 'experiments', 'categorize');
const DEFAULT_SEED = join(__dir, 'seed', 'categories.seed.json');

function parseArgs(argv: string[]) {
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const opts = {
    max: Infinity,
    corpora: ['2026-05-21T02-02-56', '2026-05-21T03-03-24'],
    aiEvalJsonl: join(
      ENRICH_EXPERIMENTS_DIR,
      'ai-eval-2026-05-25T01-53-38',
      'results-v2.jsonl'
    ),
    seedIn: DEFAULT_SEED,
    stateIn: null as string | null,
    outDir: join(CATEGORIZE_EXPERIMENTS_DIR, `discover-inc-${ts}`),
    dryRun: true,
    runLlm: false,
    stuckOnly: true,
    batchSize: DISCOVER_MAP_BATCH_SIZE,
    maxBatches: undefined as number | undefined,
    maxNewLeaves: 36,
    maxNewParents: 5,
    noSeed: false,
    legacy: false,
    reduceMode: 'per-parent' as 'per-parent' | 'single',
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max') opts.max = Number(argv[++i]) || opts.max;
    else if (a === '--corpus') {
      opts.corpora = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--ai-eval') opts.aiEvalJsonl = argv[++i]!;
    else if (a === '--no-seed') {
      opts.noSeed = true;
      opts.seedIn = '';
    } else if (a === '--seed-in') opts.seedIn = argv[++i]!;
    else if (a === '--state-in') opts.stateIn = argv[++i]!;
    else if (a === '--out') opts.outDir = argv[++i]!;
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
    else if (a === '--max-new-parents') opts.maxNewParents = Number(argv[++i]) || opts.maxNewParents;
    else if (a === '--legacy-single-phase') opts.legacy = true;
    else if (a === '--reduce-single') opts.reduceMode = 'single';
    else if (a === '--reduce-per-parent') opts.reduceMode = 'per-parent';
  }
  return opts;
}

function loadStateJsonl(path: string | null) {
  const map = new Map<string, Record<string, unknown>>();
  if (!path || !existsSync(path)) return map;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { itemId?: string };
      if (row.itemId) map.set(row.itemId, row);
    } catch {
      /* skip */
    }
  }
  return map;
}

function loadSeedCategories(path: string): AiCategory[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as SeedDocument;
  return seedDocumentToCategories(raw);
}

function categoriesToTaxonomyOut(categories: AiCategory[], taxonomyVersion: number, meta: object) {
  const parents = categories
    .filter((c) => c.kind === 'parent')
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
    }));
  const leaves = categories
    .filter((c) => c.kind === 'leaf')
    .map((l) => ({
      id: l.id.replace(/^seed_/, ''),
      parentId: l.parentId ?? '',
      name: l.name,
      description: l.description ?? '',
      canonicalTags: l.canonicalTags ?? [],
      isGeneralFallback: l.isGeneralFallback,
    }));
  return {
    version: 1,
    taxonomyVersion,
    description: 'Map→reduce discover (app pipeline)',
    discoveredAt: new Date().toISOString(),
    parents,
    leaves,
    corpusMeta: meta,
  };
}

function orphanLeafCount(categories: AiCategory[]): number {
  const parentIds = new Set(
    categories.filter((c) => c.kind === 'parent').map((c) => c.id)
  );
  return categories.filter(
    (c) => c.kind === 'leaf' && c.parentId && !parentIds.has(c.parentId)
  ).length;
}

async function main() {
  loadEnvFile();
  const opts = parseArgs(process.argv.slice(2));

  if (opts.stuckOnly && !opts.stateIn) {
    console.error('Gap-fill mode requires --state-in (classify-state.jsonl)');
    process.exit(1);
  }
  if (!opts.noSeed && (!opts.seedIn || !existsSync(opts.seedIn))) {
    console.error(`Seed not found: ${opts.seedIn} (use --no-seed for cold)`);
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

  const summary: DiscoverRunSummary = { ...emptyDiscoverRunSummary(), ...poolSummary };

  if (pool.length < MIN_DISCOVER_POOL) {
    summary.failureBuckets = bumpFailureBucket(summary.failureBuckets, 'pool_too_small');
    writeFileSync(join(opts.outDir, 'run-stats.json'), JSON.stringify({ at: Date.now(), summary }, null, 2));
    console.error(`Too few items (${pool.length} < ${MIN_DISCOVER_POOL})`);
    process.exit(0);
  }

  let categories: AiCategory[] = opts.noSeed ? [] : loadSeedCategories(opts.seedIn);
  let taxonomyVersion = opts.noSeed
    ? 0
    : (JSON.parse(readFileSync(opts.seedIn, 'utf8')) as SeedDocument).taxonomyVersion ?? 0;

  if (opts.runLlm) {
    const envSettings = cliAISettings();
    if (!envSettings.apiKey?.trim()) {
      console.error('Set OPENROUTER_API_KEY for --run-llm');
      process.exit(1);
    }
    const result = await runDiscoverMapReduce(
      envSettings,
      categories,
      pool,
      {
        mapBatchSize: opts.batchSize,
        maxMapBatches: opts.maxBatches,
        maxNetParents: opts.maxNewParents,
        maxNetLeaves: opts.maxNewLeaves,
        gapFillMode: opts.stuckOnly && categories.some((c) => c.kind === 'leaf'),
        legacySinglePhase: opts.legacy,
        reduceMode: opts.legacy ? undefined : opts.reduceMode,
        onProgress: (msg) => console.error(`  ${msg}`),
      }
    );

    categories = result.categories;
    summary.proposedParentsRaw = result.proposedParentsRaw;
    summary.proposedLeavesRaw = result.proposedLeavesRaw;
    summary.newParents = result.addedParents.length;
    summary.newLeaves = result.addedLeaves.length;
    if (result.proposedLeavesRaw > 0) {
      (summary as DiscoverRunSummary & { leavesKeptPct?: number }).leavesKeptPct =
        Math.round((result.addedLeaves.length / result.proposedLeavesRaw) * 100);
    }
    summary.discoverBatches = result.mapBatches;
    summary.reduceCalls = result.reduceCalls;
    summary.reduceLeafCalls = result.reduceLeafCalls;
    summary.reduceMode = result.reduceMode;
    summary.taxonomyMergeParents = result.taxonomyMerge.mergedParents;
    summary.taxonomyMergeLeaves = result.taxonomyMerge.mergedLeaves;
    summary.mergeAuditCount = result.mergeAudit.length;
    summary.llmErrors = result.llmErrors;
    const mapPlan = planDiscoverMapBatches(pool.length, opts.batchSize, opts.maxBatches);
    summary.itemsSampled = mapPlan.itemsSampled;

    if (result.addedParents.length || result.addedLeaves.length) taxonomyVersion += 1;

    writeFileSync(
      join(opts.outDir, 'merge-audit.json'),
      JSON.stringify(result.mergeAudit, null, 2)
    );
  } else {
    const mapPlan = planDiscoverMapBatches(pool.length, opts.batchSize, opts.maxBatches);
    summary.itemsSampled = mapPlan.itemsSampled;
    summary.discoverBatches = mapPlan.mapBatchCount;
  }

  const taxonomyOut = categoriesToTaxonomyOut(categories, taxonomyVersion, {
    stuckOnly: opts.stuckOnly,
    mapReduce: !opts.legacy,
    reduceMode: opts.legacy ? 'legacy' : opts.reduceMode,
    itemsSampled: summary.itemsSampled,
  });

  writeFileSync(join(opts.outDir, 'taxonomy-out.json'), JSON.stringify(taxonomyOut, null, 2));
  writeFileSync(join(opts.outDir, 'run-stats.json'), JSON.stringify({ at: Date.now(), summary }, null, 2));
  writeFileSync(
    join(opts.outDir, 'orphan-leaves.txt'),
    `orphanParentId=${orphanLeafCount(categories)}\nparents=${taxonomyOut.parents.length}\nleaves=${taxonomyOut.leaves.length}\n`
  );

  console.error('[discover-app] Summary:', summary);
  console.error(`Wrote ${opts.outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
