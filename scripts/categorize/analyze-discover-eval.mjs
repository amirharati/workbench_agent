#!/usr/bin/env node
/**
 * Diagnose discover eval: unrecoverable links vs good-input classify misses.
 * Usage: node scripts/categorize/analyze-discover-eval.mjs <eval-root> [arm-warm] [arm-baseline]
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadPipelineCorpus } from './lib/corpus.mjs';
import { assessCategorizationEligibility } from './lib/eligibility.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

const evalRoot = process.argv[2];
const armBest = process.argv[3] || 'candidate-v3-warm';
const armBase = process.argv[4] || 'baseline-warm';
const AI_EVAL =
  process.argv[5] ||
  'data/experiments/enrich-fetch/ai-eval-2026-05-25T01-53-38/results-v2.jsonl';

if (!evalRoot) {
  console.error(
    'Usage: node analyze-discover-eval.mjs <eval-root> [best-arm] [baseline-arm]'
  );
  process.exit(1);
}

function isGeneralLeafId(id) {
  if (!id) return false;
  const lower = id.toLowerCase();
  return lower.endsWith('-general') || lower.includes('other');
}

function loadClassifyMap(cellDir) {
  const path = join(cellDir, 'classify', 'classify-state.jsonl');
  const map = new Map();
  if (!existsSync(path)) return map;
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

function outcome(row) {
  if (!row) return 'missing';
  const st = row.classifyState;
  if (st === 'ineligible' || st === 'skipped' || st === 'manual_review') return st;
  const pid = row.primaryCategoryId;
  if (pid && !isGeneralLeafId(pid)) return 'specific';
  if (pid && isGeneralLeafId(pid)) return 'general';
  if (st === 'pending_discover') return 'pending_discover';
  return 'unassigned';
}

function shortId(itemId) {
  const p = itemId.split('/');
  return p[p.length - 1] || itemId;
}

function loadAiEvalMap() {
  const map = new Map();
  const path = join(ROOT, AI_EVAL);
  if (!existsSync(path)) return map;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      map.set(row.id, row);
    } catch {
      /* skip */
    }
  }
  return map;
}

const { items } = loadPipelineCorpus({
  corpora: ['2026-05-21T02-02-56'],
  aiEvalJsonl: join(ROOT, AI_EVAL),
  max: 124,
  includeSnippet: false,
});

const aiById = loadAiEvalMap();
const bestMap = loadClassifyMap(join(evalRoot, armBest));
const baseMap = loadClassifyMap(join(evalRoot, armBase));

const itemById = new Map(items.map((i) => [i.itemId, i]));
for (const id of new Set([...bestMap.keys(), ...baseMap.keys()])) {
  if (!itemById.has(id)) {
    itemById.set(id, {
      itemId: id,
      title: '',
      url: '',
      notes: '',
      enrichmentAiTags: [],
      aiSummary: '',
    });
  }
}
const allItems = [...itemById.values()];

const buckets = {
  unrecoverable: [],
  borderline_input: [],
  model_appropriate_miss: [],
  good_input_failed: [],
  v3_win_vs_baseline: [],
  v3_regress_vs_baseline: [],
  both_specific: [],
  fragmentation_candidates: [],
};

const leafUsage = new Map();

for (const item of allItems) {
  const ai = aiById.get(item.itemId) ?? {};
  const merged = {
    title: item.title,
    notes: item.notes,
    aiStatus: ai.status,
    aiSummary: ai.data?.summary ?? item.aiSummary,
    aiTags: ai.data?.tags ?? item.enrichmentAiTags,
    aiKeyPoints: ai.data?.keyPoints,
    snippet: '',
  };
  const elig = assessCategorizationEligibility(merged);
  const best = bestMap.get(item.itemId);
  const base = baseMap.get(item.itemId);
  const bestOut = outcome(best);
  const baseOut = outcome(base);

  const record = {
    itemId: item.itemId,
    short: shortId(item.itemId),
    url: item.url,
    title: (item.title || '').slice(0, 80),
    aiStatus: ai.status ?? '—',
    semanticLength: elig.semanticLength,
    eligible: elig.eligible,
    eligibilityReason: elig.reason,
    qualityTier: best?.inputQualityTier ?? elig.qualityTier,
    tags: (merged.aiTags ?? []).slice(0, 6).join(', '),
    summaryLen: (merged.aiSummary ?? '').length,
    best: bestOut,
    base: baseOut,
    bestLeaf: best?.primaryCategoryId ?? null,
    baseLeaf: base?.primaryCategoryId ?? null,
    conf: best?.llmReview?.confidence,
    reason: best?.llmReview?.reason?.slice(0, 120),
  };

  if (!elig.eligible || bestOut === 'ineligible') {
    buckets.unrecoverable.push(record);
    continue;
  }

  const goodInput =
    ai.status === 'ok' &&
    (merged.aiSummary?.length ?? 0) >= 50 &&
    elig.semanticLength >= 100 &&
    record.qualityTier === 'high';

  if (!goodInput && elig.semanticLength < 100) {
    buckets.borderline_input.push(record);
  }

  const failedSpecific = ['pending_discover', 'unassigned', 'general'].includes(bestOut);

  if (failedSpecific && goodInput) {
    const reason = (record.reason || '').toLowerCase();
    const genericPage =
      /no specific topic|generic|faq|homepage|landing|too broad|not enough/i.test(reason);
    if (genericPage || (merged.aiTags?.length ?? 0) < 2) {
      buckets.model_appropriate_miss.push(record);
    } else {
      buckets.good_input_failed.push(record);
    }
  }

  if (bestOut === 'specific' && baseOut !== 'specific') {
    buckets.v3_win_vs_baseline.push(record);
  }
  if (baseOut === 'specific' && bestOut !== 'specific') {
    buckets.v3_regress_vs_baseline.push(record);
  }
  if (bestOut === 'specific' && baseOut === 'specific') {
    buckets.both_specific.push(record);
  }

  if (bestOut === 'specific' && record.bestLeaf) {
    leafUsage.set(record.bestLeaf, (leafUsage.get(record.bestLeaf) ?? 0) + 1);
  }
}

const rareLeaves = [...leafUsage.entries()]
  .filter(([, n]) => n === 1)
  .map(([id]) => id);

for (const item of allItems) {
  const best = bestMap.get(item.itemId);
  if (best?.primaryCategoryId && rareLeaves.includes(best.primaryCategoryId)) {
    const r = buckets.both_specific.find((x) => x.itemId === item.itemId);
    if (r) buckets.fragmentation_candidates.push({ ...r, note: 'singleton leaf assignment' });
  }
}

function mdTable(rows, cols) {
  if (!rows.length) return '_none_\n';
  const head = '| ' + cols.join(' | ') + ' |';
  const sep = '| ' + cols.map(() => '---').join(' | ') + ' |';
  const body = rows
    .slice(0, 40)
    .map((r) => '| ' + cols.map((c) => String(r[c] ?? '').replace(/\|/g, '\\|').slice(0, 60)).join(' | ') + ' |');
  const more = rows.length > 40 ? `\n_…and ${rows.length - 40} more_\n` : '';
  return [head, sep, ...body].join('\n') + more;
}

const summary = {
  corpus: allItems.length,
  unrecoverable: buckets.unrecoverable.length,
  borderline_input: buckets.borderline_input.length,
  eligible: allItems.length - buckets.unrecoverable.length,
  good_input_failed: buckets.good_input_failed.length,
  model_appropriate_miss: buckets.model_appropriate_miss.length,
  v3_win: buckets.v3_win_vs_baseline.length,
  v3_regress: buckets.v3_regress_vs_baseline.length,
  both_specific: buckets.both_specific.length,
  unique_leaves_used: leafUsage.size,
  singleton_leaf_assignments: rareLeaves.length,
};

const md = `# Eval diagnostic — ${evalRoot}

Arms: **${armBest}** vs **${armBase}** · corpus: \`2026-05-21T02-02-56\` + ai-eval

## Summary

| Bucket | Count | Meaning |
|--------|------:|---------|
| Unrecoverable | ${summary.unrecoverable} | Ineligible — bad/missing enrich; no model fix |
| Borderline input | ${summary.borderline_input} | Eligible but thin text; fragile |
| Good input, classify failed | ${summary.good_input_failed} | **Tune target** — rich summary/tags, still no specific leaf |
| Model-appropriate gap | ${summary.model_appropriate_miss} | High conf “no topic” / generic page |
| v3 win vs baseline | ${summary.v3_win} | v3 specific, baseline not |
| v3 regress vs baseline | ${summary.v3_regress} | baseline specific, v3 not |
| Both specific | ${summary.both_specific} | Agreement |
| Unique leaves (v3 warm) | ${summary.unique_leaves_used} | Taxonomy breadth in use |
| Singleton leaf uses | ${summary.singleton_leaf_assignments} | Possible fragmentation |

**Eligible pool:** ${summary.eligible} (classify processed ≈111) · **Good-input failures:** ${summary.good_input_failed} (${summary.eligible ? Math.round((100 * summary.good_input_failed) / summary.eligible) : 0}% of eligible)

### Tune vs ignore (quick)

| Priority | Action |
|----------|--------|
| Ignore | ${summary.unrecoverable} ineligible — fix enrich/fetch, not discover |
| Ignore | ~8 high-conf pending (404, example.com, FAQ, bare social) |
| **Classify** | ~6 on \`*-general\` with clear tags (semianalysis, indiehackers, producthunt, ekwb…) — push specific leaf |
| **Discover** | convexvalue, marketdata — need leaf or better 404 handling |
| **Merge** | ${summary.singleton_leaf_assignments} singleton leaves — reduce fragmentation |

## Unrecoverable (enrich / eligibility)

${mdTable(buckets.unrecoverable, ['short', 'aiStatus', 'semanticLength', 'eligibilityReason'])}

## Good input — model failed to assign specific (${armBest})

${mdTable(buckets.good_input_failed, ['short', 'best', 'base', 'tags', 'reason'])}

## Model-appropriate (generic / no topic — low tune priority)

${mdTable(buckets.model_appropriate_miss, ['short', 'best', 'conf', 'reason'])}

## v3 regressions vs baseline (baseline had specific)

${mdTable(buckets.v3_regress_vs_baseline, ['short', 'baseLeaf', 'best', 'bestLeaf', 'reason'])}

## v3 wins vs baseline

${mdTable(buckets.v3_win_vs_baseline, ['short', 'bestLeaf', 'base', 'tags'])}

## Fragmentation hints (singleton leaf)

${mdTable(buckets.fragmentation_candidates.slice(0, 25), ['short', 'bestLeaf', 'tags'])}

---

Generated by \`scripts/categorize/analyze-discover-eval.mjs\`
`;

const outDir = evalRoot;
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'DIAGNOSTIC.md');
writeFileSync(outPath, md);
writeFileSync(
  join(outDir, 'diagnostic-summary.json'),
  JSON.stringify({ summary, buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])) }, null, 2)
);
writeFileSync(
  join(outDir, 'good-input-failed.jsonl'),
  buckets.good_input_failed.map((r) => JSON.stringify(r)).join('\n') + '\n'
);

console.log(JSON.stringify(summary, null, 2));
console.log('Wrote', outPath);
