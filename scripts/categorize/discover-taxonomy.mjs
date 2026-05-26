#!/usr/bin/env node
/**
 * Discover seed taxonomy from corpus via batched LLM (title + summary only).
 *
 *   npm run discover-taxonomy
 *   npm run discover-taxonomy -- --ai-eval data/experiments/enrich-fetch/ai-eval-2026-05-25T01-53-38/results-v2.jsonl
 */

import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadEnvFile, embeddingSettingsFromEnv, classifySettingsFromEnv } from './lib/loadEnv.mjs';
import { loadPipelineCorpus } from './lib/corpus.mjs';
import { embedTexts } from './lib/embed.mjs';
import { DEFAULT_SEED_PATH, loadSeedTaxonomy } from './lib/seedTaxonomy.mjs';
import {
  DEFAULT_PARENTS,
  filterItemsForDiscovery,
  orderItemsByDiversity,
  chunkItems,
  callDiscoveryBatch,
  mergeNewLeaves,
  mergeNewParents,
  buildSeedDocument,
  sanitizeDiscoveryItemResults,
  leafProposalsFromItemResults,
} from './lib/taxonomyDiscover.mjs';
import { ensureGeneralFallbackLeaves } from './lib/taxonomyCatalog.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');
const ENRICH_EXPERIMENTS_DIR = join(REPO_ROOT, 'data', 'experiments', 'enrich-fetch');
const CATEGORIZE_EXPERIMENTS_DIR = join(REPO_ROOT, 'data', 'experiments', 'categorize');
const SEED_PATH = DEFAULT_SEED_PATH;
const MANUAL_BACKUP = join(__dir, 'seed', 'categories.seed.manual-v0.json');

function parseArgs(argv) {
  const opts = {
    max: Infinity,
    corpora: ['2026-05-21T02-02-56', '2026-05-21T03-03-24'],
    aiEvalJsonl: join(
      ENRICH_EXPERIMENTS_DIR,
      'ai-eval-2026-05-25T01-53-38',
      'results-v2.jsonl'
    ),
    batchSize: 32,
    maxBatches: Infinity,
    dedupeSimilarity: 0.92,
    maxNewPerBatch: 0,
    bootstrapMaxNew: 20,
    writeSeed: true,
    initialSeed: join(__dir, 'seed', 'categories.seed.manual-v0.json'),
    outDir: join(CATEGORIZE_EXPERIMENTS_DIR, `discover-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`),
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max') opts.max = Number(argv[++i]) || opts.max;
    else if (a === '--corpus') opts.corpora = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--ai-eval') opts.aiEvalJsonl = argv[++i];
    else if (a === '--batch-size') opts.batchSize = Number(argv[++i]) || opts.batchSize;
    else if (a === '--max-batches') opts.maxBatches = Number(argv[++i]) || opts.maxBatches;
    else if (a === '--dedupe') opts.dedupeSimilarity = Number(argv[++i]) || opts.dedupeSimilarity;
    else if (a === '--max-new-per-batch') opts.maxNewPerBatch = Number(argv[++i]) || opts.maxNewPerBatch;
    else if (a === '--bootstrap-max-new') opts.bootstrapMaxNew = Number(argv[++i]) || opts.bootstrapMaxNew;
    else if (a === '--out') opts.outDir = argv[++i];
    else if (a === '--no-write-seed') opts.writeSeed = false;
    else if (a === '--initial-seed') opts.initialSeed = argv[++i];
    else if (a === '--no-initial-seed') opts.initialSeed = null;
  }

  return opts;
}

async function main() {
  loadEnvFile();
  const opts = parseArgs(process.argv.slice(2));
  const embedSettings = embeddingSettingsFromEnv();
  const classifySettings = classifySettingsFromEnv();

  if (!classifySettings.apiKey?.trim()) {
    console.error('Set OPENROUTER_API_KEY in .env');
    process.exit(1);
  }

  const { items, rawCount, aiEvalMerged } = loadPipelineCorpus({
    corpora: opts.corpora,
    aiEvalJsonl: existsSync(opts.aiEvalJsonl) ? opts.aiEvalJsonl : null,
    max: opts.max,
    includeSnippet: false,
  });

  const eligible = filterItemsForDiscovery(items);
  console.error(`Corpus: ${items.length} items (${rawCount} raw, ${aiEvalMerged} AI eval)`);
  console.error(`Discovery pool: ${eligible.length} eligible (after enrichment filter)`);

  if (eligible.length < 5) {
    console.error('Too few eligible items for discovery');
    process.exit(1);
  }

  mkdirSync(opts.outDir, { recursive: true });

  console.error('Embedding for diversity ordering...');
  const texts = eligible.map((i) => i.clusterText ?? i.aiSummary ?? i.title ?? '');
  const vectors = await embedTexts(embedSettings, texts);
  const ordered = orderItemsByDiversity(eligible, vectors, { maxSimilarity: opts.dedupeSimilarity });
  const batches = chunkItems(ordered, opts.batchSize).slice(0, opts.maxBatches);

  let parents = [...DEFAULT_PARENTS];
  let parentIds = new Set(parents.map((p) => p.id));
  let leaves = [];
  let taxonomyVersion = 1;

  if (opts.initialSeed && existsSync(opts.initialSeed)) {
    const initial = loadSeedTaxonomy(opts.initialSeed);
    leaves = (initial.leaves ?? []).map((l) => ({
      id: l.id,
      parentId: l.parentId,
      name: l.name,
      description: l.description ?? '',
      canonicalTags: l.canonicalTags ?? [],
      fromInitialSeed: true,
    }));
    taxonomyVersion = (initial.taxonomyVersion ?? 0) + 1;
    console.error(`Initial seed: ${leaves.length} leaves from ${opts.initialSeed} → taxonomy v${taxonomyVersion}`);
  }
  const batchLogs = [];
  const allItemResults = [];

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const bootstrapMode = leaves.length === 0;
    const maxNewThisBatch = bootstrapMode
      ? opts.bootstrapMaxNew
      : opts.maxNewPerBatch > 0
        ? opts.maxNewPerBatch
        : 999;
    console.error(
      `Batch ${b + 1}/${batches.length}: ${batch.length} items, ${leaves.length} leaves (${bootstrapMode ? 'BOOTSTRAP' : 'extend'})`
    );

    const resp = await callDiscoveryBatch(classifySettings, parents, leaves, batch, {
      maxNewPerBatch: maxNewThisBatch,
      maxNewParents: 5,
      bootstrapMode,
      gapFillMode: !bootstrapMode,
    });

    if (!resp.ok) {
      console.error(`  Batch failed: ${resp.error}`);
      batchLogs.push({ batchIndex: b, error: resp.error, itemCount: batch.length });
      continue;
    }

    const data = resp.data ?? {};
    const rawItemResults = Array.isArray(data.itemResults) ? data.itemResults : [];
    const leafIds = new Set(leaves.map((l) => l.id));
    const itemResults = sanitizeDiscoveryItemResults(rawItemResults, parentIds, leafIds);
    const newParents = Array.isArray(data.newParents) ? data.newParents : [];
    const parentMerge = mergeNewParents(parents, newParents, { maxNewPerBatch: 5 });
    parents = parentMerge.parentsSoFar;
    parentIds = parentMerge.parentIds;

    const fromResults = leafProposalsFromItemResults(itemResults, parentIds);
    const newLeaves = [
      ...(Array.isArray(data.newLeaves) ? data.newLeaves : []),
      ...fromResults,
    ];
    const merge = mergeNewLeaves([...leaves], newLeaves, parentIds, {
      maxNewPerBatch: maxNewThisBatch,
    });
    leaves = merge.leavesSoFar;
    const added = merge.added ?? [];
    ensureGeneralFallbackLeaves(parents, leaves);

    for (const row of itemResults) {
      allItemResults.push({ ...row, batchIndex: b });
    }

    batchLogs.push({
      batchIndex: b,
      itemCount: batch.length,
      newParentsAdded: (parentMerge.added ?? []).map((p) => ({ id: p.id, name: p.name })),
      newLeavesAdded: added.map((l) => ({ id: l.id, name: l.name, parentId: l.parentId })),
      itemResultsCount: itemResults.length,
      leavesAfter: leaves.length,
    });

    console.error(
      `  +${(parentMerge.added ?? []).length} parents, +${added.length} leaves → ${parents.length} parents, ${leaves.length} leaves`
    );
  }

  const seedDoc = buildSeedDocument({
    parents,
    leaves,
    taxonomyVersion,
    corpusMeta: {
      initialSeed: opts.initialSeed,
      corpora: opts.corpora,
      aiEvalJsonl: opts.aiEvalJsonl,
      eligible: eligible.length,
      batches: batches.length,
      batchSize: opts.batchSize,
    },
  });

  writeFileSync(join(opts.outDir, 'discovery-batches.json'), JSON.stringify(batchLogs, null, 2));
  writeFileSync(join(opts.outDir, 'categories.discovered.json'), JSON.stringify(seedDoc, null, 2));
  writeFileSync(
    join(opts.outDir, 'discovery-item-results.jsonl'),
    allItemResults.map((r) => JSON.stringify(r)).join('\n') + '\n'
  );

  const md = [
    '# Taxonomy discovery run',
    '',
    `- Eligible items: **${eligible.length}**`,
    `- Batches: **${batches.length}** (size ${opts.batchSize})`,
    `- Leaves discovered: **${leaves.length}**`,
    `- Parents: **${parents.length}** (fixed)`,
    opts.initialSeed ? `- Initial seed: \`${opts.initialSeed}\`` : '',
    '',
    '## Leaves',
    '',
    ...leaves.map(
      (l) =>
        `- **${l.name}** (\`${l.id}\`, parent: ${l.parentId}) — ${l.description?.slice(0, 100) || ''}`
    ),
    '',
  ].join('\n');
  writeFileSync(join(opts.outDir, 'SUMMARY.md'), md);

  if (opts.writeSeed) {
    if (existsSync(SEED_PATH) && !existsSync(MANUAL_BACKUP)) {
      copyFileSync(SEED_PATH, MANUAL_BACKUP);
      console.error(`Backed up prior seed → ${MANUAL_BACKUP}`);
    }
    writeFileSync(SEED_PATH, JSON.stringify(seedDoc, null, 2));
    console.error(`Wrote seed → ${SEED_PATH}`);
  }

  if (leaves.length < 8) {
    console.error(`Warning: only ${leaves.length} leaves discovered — check discovery-batches.json or re-run.`);
  }

  console.error(`Done. Experiment: ${opts.outDir}`);
  console.error(`Next: npm run categorize -- --ai-eval ${opts.aiEvalJsonl}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
