#!/usr/bin/env node
/**
 * AI categorization CLI (Task 02).
 *
 *   npm run categorize
 *   npm run categorize -- --compare          # lean (no snippet) vs with-snippet
 *   npm run categorize -- --with-snippet   # single run with capped snippet
 *   npm run categorize -- --max 30
 *   npm run categorize -- --seed-taxonomy   # default: scripts/categorize/seed/categories.seed.json
 *   npm run categorize -- --no-seed           # k-means bootstrap instead
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadEnvFile, embeddingSettingsFromEnv, classifySettingsFromEnv } from './lib/loadEnv.mjs';
import { loadPipelineCorpus } from './lib/corpus.mjs';
import { embedTexts } from './lib/embed.mjs';
import { runPipeline, DEFAULT_THRESHOLDS, bootstrapCategories } from './lib/categorizeCore.mjs';
import { runLlmReviewAllOnce } from './lib/llmReview.mjs';
import { llmRenameCategories } from './lib/llmNaming.mjs';
import {
  DEFAULT_SEED_PATH,
  loadAndEmbedSeedTaxonomy,
  buildShortlistMap,
  DEFAULT_SHORTLIST,
} from './lib/seedTaxonomy.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    max: Infinity,
    corpora: ['2026-05-21T02-02-56', '2026-05-21T03-03-24'],
    aiEvalJsonl: join(
      __dir,
      '..',
      'enrich-fetch',
      'experiments',
      'ai-eval-2026-05-25T01-53-38',
      'results-v2.jsonl'
    ),
    categoriesIn: null,
    clusterNovelty: false,
    compare: false,
    compareFrozen: false,
    withSnippet: false,
    bootstrapIfEmpty: true,
    llmReviewAllOnce: false,
    llmNameCategories: true,
    allowNewCategories: true,
    llmPromoteThreshold: 2,
    llmReviewBatch: 20,
    llmMinConfidence: 0.55,
    llmMinCentroidScore: 0.52,
    llmMinCentroidScoreSeed: 0.44,
    seedTaxonomy: null,
    classifyMode: 'topic-extract',
    seedShortlistK: DEFAULT_SHORTLIST.topK,
    seedShortlistMin: DEFAULT_SHORTLIST.minScore,
    outDir: join(
      __dir,
      'experiments',
      `cat-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`
    ),
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max') opts.max = Number(argv[++i]) || opts.max;
    else if (a === '--corpus') opts.corpora = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--ai-eval') opts.aiEvalJsonl = argv[++i];
    else if (a === '--categories-in') opts.categoriesIn = argv[++i];
    else if (a === '--out') opts.outDir = argv[++i];
    else if (a === '--cluster-novelty') opts.clusterNovelty = true;
    else if (a === '--compare') opts.compare = true;
    else if (a === '--compare-frozen') opts.compareFrozen = true;
    else if (a === '--with-snippet') opts.withSnippet = true;
    else if (a === '--no-bootstrap') opts.bootstrapIfEmpty = false;
    else if (a === '--llm-review-all-once') opts.llmReviewAllOnce = true;
    else if (a === '--no-llm-name') opts.llmNameCategories = false;
    else if (a === '--no-new-categories') opts.allowNewCategories = false;
    else if (a === '--llm-promote-threshold') opts.llmPromoteThreshold = Number(argv[++i]) || opts.llmPromoteThreshold;
    else if (a === '--llm-review-batch') opts.llmReviewBatch = Number(argv[++i]) || opts.llmReviewBatch;
    else if (a === '--llm-min-confidence') opts.llmMinConfidence = Number(argv[++i]) || opts.llmMinConfidence;
    else if (a === '--llm-min-centroid') opts.llmMinCentroidScore = Number(argv[++i]) || opts.llmMinCentroidScore;
    else if (a === '--seed-taxonomy') {
      const next = argv[i + 1];
      opts.seedTaxonomy = next && !next.startsWith('--') ? argv[++i] : DEFAULT_SEED_PATH;
    } else if (a === '--no-seed') opts.seedTaxonomy = false;
    else if (a === '--seed-shortlist-k') opts.seedShortlistK = Number(argv[++i]) || opts.seedShortlistK;
    else if (a === '--seed-shortlist-min') opts.seedShortlistMin = Number(argv[++i]) || opts.seedShortlistMin;
    else if (a === '--legacy-shortlist') opts.classifyMode = 'shortlist';
    else if (a === '--classify-mode') opts.classifyMode = argv[++i] || opts.classifyMode;
  }

  if (opts.seedTaxonomy === null && existsSync(DEFAULT_SEED_PATH)) {
    opts.seedTaxonomy = DEFAULT_SEED_PATH;
  }

  return opts;
}

function buildSummaryMd({ label, summary, embeddingModel, corpora, thresholds, textMode }) {
  return [
    label ? `## ${label}` : '# Categorization run',
    '',
    textMode ? `- Text mode: **${textMode}**` : '',
    `- Embedding model: **${embeddingModel}**`,
    `- Corpus: ${corpora.join(', ')}`,
    '',
    '| Metric | Count |',
    '|--------|-------|',
    ...Object.entries(summary).map(([k, v]) => `| ${k} | ${v} |`),
    '',
  ].join('\n');
}

function sampleAssignments(itemResults, categories, limit = 12) {
  const byName = new Map(categories.map((c) => [c.id, c.name]));
  const lines = ['### Sample assignments', ''];
  let n = 0;
  for (const r of itemResults) {
    if (!r.assignments?.length) continue;
    if (n++ >= limit) break;
    const cats = r.assignments
      .map((a) => `${byName.get(a.categoryId) ?? a.categoryId} (${a.score.toFixed(3)}${a.isPrimary ? ', primary' : ''})`)
      .join('; ');
    lines.push(`- **${r.title?.slice(0, 60) || r.itemId}** → ${cats}`);
    if (r.derivedTags?.length) lines.push(`  - tags: ${r.derivedTags.join(', ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

function listCategories(categories) {
  const lines = ['### Categories', ''];
  for (const c of categories) {
    const desc = c.description ? ` — ${c.description}` : '';
    lines.push(`- **${c.name}** (${c.canonicalTags?.join(', ') || '—'})${desc}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function runOnce({
  opts,
  embedSettings,
  includeSnippet,
  label,
  outDir,
  categoriesIn,
  classifySettings,
  seedCategories = null,
  seedMeta = null,
}) {
  const { items, rawCount, aiEvalMerged } = loadPipelineCorpus({
    corpora: opts.corpora,
    aiEvalJsonl: existsSync(opts.aiEvalJsonl) ? opts.aiEvalJsonl : null,
    max: opts.max,
    includeSnippet,
  });

  console.error(
    `[${label}] Corpus: ${items.length} items (${rawCount} bodies, ${aiEvalMerged} AI eval merged, snippet=${includeSnippet})`
  );

  let categories = seedCategories ? [...seedCategories] : [];
  if (!categories.length && categoriesIn && existsSync(categoriesIn)) {
    categories = JSON.parse(readFileSync(categoriesIn, 'utf8'));
  }

  const useSeed = Boolean(seedCategories?.length);
  const result = await runPipeline({
    items,
    categories,
    embeddingModel: embedSettings.model,
    embed: (texts) => embedTexts(embedSettings, texts),
    thresholds: DEFAULT_THRESHOLDS,
    bootstrapIfEmpty: opts.bootstrapIfEmpty && !categories.length,
  });

  if (useSeed) {
    result.summary.seedTaxonomy = true;
    result.summary.seedLeafCount = seedMeta?.leafCount ?? categories.length;
    result.summary.taxonomyVersion = seedMeta?.taxonomyVersion ?? 0;
  }

  if (opts.clusterNovelty) {
    const novelty = result.itemResults
      .filter((r) => r.isNovelty && r.embedding?.length)
      .map((r) => {
        const item = items.find((i) => i.itemId === r.itemId);
        return {
          itemId: r.itemId,
          embedding: r.embedding,
          text: item?.text ?? '',
          title: item?.title,
          aiTags: item?.enrichmentAiTags,
        };
      });
    const extraBoot = bootstrapCategories(
      novelty.map((n) => ({
        ...n,
        clusterText: n.text,
        aiSummary: items.find((i) => i.itemId === n.itemId)?.aiSummary,
      }))
    );
    if (extraBoot.categories.length) result.categories = [...result.categories, ...extraBoot.categories];
  }

  const suffix = includeSnippet ? 'with-snippet' : 'lean';

  let shortlistByItemId = null;
  let shortlistStats = null;
  const useTopicExtract = opts.classifyMode === 'topic-extract';

  if (
    opts.llmReviewAllOnce &&
    useSeed &&
    !useTopicExtract &&
    classifySettings.apiKey?.trim()
  ) {
    const shortlistOpts = {
      topK: opts.seedShortlistK,
      minScore: opts.seedShortlistMin,
    };
    const built = buildShortlistMap(result.itemResults, categories, seedMeta?.seed, shortlistOpts);
    shortlistByItemId = built.byItemId;
    shortlistStats = built.stats;
    result.summary = { ...result.summary, ...shortlistStats };
    writeFileSync(
      join(outDir, `shortlists-${suffix}.jsonl`),
      [...shortlistByItemId.entries()]
        .map(([itemId, sl]) =>
          JSON.stringify({
            itemId,
            maxScore: sl.maxScore,
            parentIds: sl.parentIds,
            candidates: sl.candidates,
          })
        )
        .join('\n') + '\n'
    );
    console.error(
      `[${label}] Seed shortlists: avg ${shortlistStats.shortlistAvgCandidates} candidates/item, ${shortlistStats.shortlistLowMaxScore} below min score`
    );
  }

  if (
    opts.llmNameCategories &&
    !useSeed &&
    result.membersByCategoryId?.size &&
    classifySettings.apiKey?.trim()
  ) {
    console.error(`[${label}] LLM naming categories from top cluster examples...`);
    const named = await llmRenameCategories(
      classifySettings,
      result.categories,
      result.membersByCategoryId
    );
    if (named.error) {
      console.error(`[${label}] LLM naming skipped: ${named.error}`);
    } else {
      result.categories = named.categories;
      result.summary.categoriesNamed = named.named;
      console.error(`[${label}] Named ${named.named}/${result.categories.length} categories`);
    }
  }

  if (opts.llmReviewAllOnce) {
    console.error(
      `[${label}] LLM classify (${opts.classifyMode}) on ${result.categories.length} categories...`
    );
    const review = await runLlmReviewAllOnce({
      items,
      categories: result.categories,
      itemResults: result.itemResults,
      settings: classifySettings,
      reviewBatchSize: opts.llmReviewBatch,
      allowNewCategories: opts.allowNewCategories,
      promoteThreshold: opts.llmPromoteThreshold,
      minLlmConfidence: opts.llmMinConfidence,
      minCentroidScore: useSeed ? opts.llmMinCentroidScoreSeed : opts.llmMinCentroidScore,
      shortlistByItemId: useTopicExtract ? null : shortlistByItemId,
      classifyMode: opts.classifyMode,
      skipCentroidVeto: useTopicExtract,
    });
    if (review.error) {
      console.error(`[${label}] LLM review skipped: ${review.error}`);
    } else {
      result.categories = review.categories;
      result.itemResults = review.itemResults;
      result.summary = { ...result.summary, ...review.summaryPatch };

      writeFileSync(
        join(outDir, `review-results-${suffix}.jsonl`),
        review.reviewRows.map((r) => JSON.stringify(r)).join('\n') + '\n'
      );
      writeFileSync(
        join(outDir, `proposed-categories-${suffix}.json`),
        JSON.stringify(review.proposedCategories, null, 2)
      );
      writeFileSync(
        join(outDir, `pending-reclassify-${suffix}.json`),
        JSON.stringify(review.pendingReclassify, null, 2)
      );
    }
  }

  writeFileSync(join(outDir, `categories-${suffix}.json`), JSON.stringify(result.categories, null, 2));
  writeFileSync(
    join(outDir, `results-${suffix}.jsonl`),
    result.itemResults.map((r) => JSON.stringify(r)).join('\n') + '\n'
  );

  const md =
    buildSummaryMd({
      label,
      summary: result.summary,
      embeddingModel: result.embeddingModel,
      corpora: opts.corpora,
      thresholds: DEFAULT_THRESHOLDS,
      textMode: useSeed
        ? `seed A${seedMeta?.taxonomyVersion ?? 0} (${categories.length} leaves) | ${opts.classifyMode}`
        : includeSnippet
          ? 'cluster: title+summary | classify: full lean + snippet'
          : 'cluster: title+summary | classify: title+notes+tags+summary+keypoints',
    }) +
    listCategories(result.categories) +
    sampleAssignments(result.itemResults, result.categories);

  writeFileSync(join(outDir, `SUMMARY-${suffix}.md`), md);

  console.error(`[${label}] Summary:`, result.summary);
  if (result.summary.embedError) console.error(`[${label}] Embed error:`, result.summary.embedError);

  return { result, suffix, items };
}

function buildCompareMd(lean, snippet, frozen = false) {
  const lines = [
    frozen
      ? '# Categorization compare — frozen taxonomy (lean bootstrap → reassign with snippet fallback)'
      : '# Categorization compare — lean vs with-snippet',
    '',
    frozen
      ? '| | Lean bootstrap | Reassign (snippet fallback text) |'
      : '| | Lean (no snippet) | With snippet (2k cap) |',
    '|--|-------------------|------------------------|',
    `| Categories | ${lean.result.categories.length} | ${snippet.result.categories.length} |`,
    `| Primary assignments | ${lean.result.summary.assignedPrimary} | ${snippet.result.summary.assignedPrimary} |`,
    `| Secondary assignments | ${lean.result.summary.assignedSecondary} | ${snippet.result.summary.assignedSecondary} |`,
    `| Novelty | ${lean.result.summary.novelty} | ${snippet.result.summary.novelty} |`,
    '',
    '## Lean categories',
    '',
    ...lean.result.categories.map((c) => `- ${c.name}`),
    '',
    '## With-snippet categories',
    '',
    ...snippet.result.categories.map((c) => `- ${c.name}`),
    '',
  ];
  return lines.join('\n');
}

async function main() {
  loadEnvFile();
  const opts = parseArgs(process.argv.slice(2));
  const embedSettings = embeddingSettingsFromEnv();
  const classifySettings = classifySettingsFromEnv();

  if (!embedSettings.apiKey.trim()) {
    console.error('Set OPENROUTER_API_KEY in .env');
    process.exit(1);
  }

  mkdirSync(opts.outDir, { recursive: true });

  if (opts.compare || opts.compareFrozen) {
    const frozen = opts.compareFrozen;
    const lean = await runOnce({
      opts: { ...opts, bootstrapIfEmpty: true },
      embedSettings,
      includeSnippet: false,
      label: frozen ? 'lean-frozen-bootstrap' : 'lean',
      outDir: opts.outDir,
      categoriesIn: null,
      classifySettings,
    });
    const categoriesFrozen = join(opts.outDir, 'categories-lean.json');
    const snippet = await runOnce({
      opts: { ...opts, bootstrapIfEmpty: false },
      embedSettings,
      includeSnippet: true,
      label: frozen ? 'reassign-with-snippet' : 'with-snippet',
      outDir: opts.outDir,
      categoriesIn: frozen ? categoriesFrozen : null,
      classifySettings,
    });
    writeFileSync(join(opts.outDir, 'COMPARE.md'), buildCompareMd(lean, snippet, frozen));
    console.error(
      `Wrote ${opts.outDir} (${frozen ? 'COMPARE.md frozen taxonomy' : 'COMPARE.md + lean + with-snippet'})`
    );
    return;
  }

  const includeSnippet = opts.withSnippet;

  let seedCategories = null;
  let seedMeta = null;
  if (opts.seedTaxonomy && existsSync(opts.seedTaxonomy)) {
    console.error(`Loading seed taxonomy: ${opts.seedTaxonomy}`);
    const loaded = await loadAndEmbedSeedTaxonomy(opts.seedTaxonomy, (texts) =>
      embedTexts(embedSettings, texts)
    );
    seedCategories = loaded.categories;
    seedMeta = {
      seed: loaded.seed,
      leafCount: loaded.leafCount,
      taxonomyVersion: loaded.seed.taxonomyVersion,
      path: loaded.seed.path,
    };
    writeFileSync(
      join(opts.outDir, 'categories-seed-embedded.json'),
      JSON.stringify(seedCategories, null, 2)
    );
    console.error(`Embedded ${seedCategories.length} seed leaves (taxonomy v${seedMeta.taxonomyVersion})`);
  } else if (opts.seedTaxonomy) {
    console.error(`Seed file not found: ${opts.seedTaxonomy} — falling back to bootstrap`);
  }

  if (!opts.llmReviewAllOnce && seedCategories?.length) {
    console.error('Seed loaded — LLM classify will run automatically (or pass --llm-review-all-once explicitly)');
  }

  const { result } = await runOnce({
    opts: {
      ...opts,
      bootstrapIfEmpty: opts.bootstrapIfEmpty && !seedCategories?.length,
      llmReviewAllOnce: opts.llmReviewAllOnce || Boolean(seedCategories?.length),
    },
    embedSettings,
    includeSnippet,
    label: includeSnippet ? 'with-snippet' : 'lean',
    outDir: opts.outDir,
    categoriesIn: opts.categoriesIn,
    classifySettings,
    seedCategories,
    seedMeta,
  });

  if (result.summary.embedFailed > 0 && result.summary.embedded === 0) {
    console.error('❌ No embeddings created. Check OPENROUTER_API_KEY in .env');
    process.exit(1);
  }

  console.error(`Wrote ${opts.outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
