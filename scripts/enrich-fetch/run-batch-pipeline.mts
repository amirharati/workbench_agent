#!/usr/bin/env tsx
/**
 * Batch end-to-end pipeline: fetch → redirect verdict → AI summary → link-quality / redirect bucket → classify.
 *
 *   npx tsx scripts/enrich-fetch/run-batch-pipeline.mts --from-experiment data/experiments/enrich-fetch/2026-05-28T15-35-48/results.jsonl --max 100
 *   npx tsx scripts/enrich-fetch/run-batch-pipeline.mts urls.txt --max 50 --concurrency 3
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadProjectEnvFromImportMeta } from '../lib/loadProjectEnv.mjs';
import { classifySettingsFromEnv, loadEnvFile } from '../categorize/lib/loadEnv.mjs';
import { loadSeedTaxonomy } from '../categorize/lib/seedTaxonomy.mjs';
import { callTopicExtractBatch, topicRowToDecision } from '../categorize/lib/topicExtract.mjs';
import {
  detectLinkQualityFromItem,
  detectUrlRedirectMismatchAttention,
  LINK_QUALITY_LEAF_IDS,
} from '../../src/lib/categorization/linkQuality.ts';
import { fetchHybrid, setProviderRunOptions } from './lib/providers.mjs';
import { runOpenRouterExtract, resolveSummaryRedirectPromptMode } from './lib/aiPrompts.mjs';
import { classifySourceKind, parseFetchedContent } from './lib/parse.mjs';
import { shouldFlagRedirectReview, shouldRunRedirectAiVerdict } from './lib/fetchRedirect.mjs';
import { runRedirectAiVerdict } from './lib/redirectAiVerdict.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');

type BatchOpts = {
  max: number;
  concurrency: number;
  noTab: boolean;
  urlFile: string | null;
  fromExperiment: string | null;
  outDir: string;
  seed: number;
};

type PipelineRow = {
  url: string;
  host: string;
  fetchOk: boolean;
  fetchProvider?: string;
  fetchError?: string;
  redirectClass?: string;
  resourceMismatch?: boolean;
  redirectVerdictMatch?: boolean | null;
  redirectVerdictStatus?: string;
  redirectVerdictMs?: number;
  summaryPromptMode?: string;
  pageMatchesBookmark?: boolean;
  pendingFetchReview: boolean;
  redirectAnnotate?: string;
  redirectReviewReason?: string;
  aiStatus?: string;
  linkQualityLeaf?: string | null;
  redirectAttentionLeaf?: boolean;
  classifyMode?: 'topic' | 'link-quality' | 'redirect-attention' | 'skipped';
  classifyCategoryIds?: string[];
  classifyReason?: string;
  error?: string;
};

function parseArgs(argv: string[]): BatchOpts {
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const opts: BatchOpts = {
    max: 100,
    concurrency: 3,
    noTab: true,
    urlFile: null,
    fromExperiment: null,
    outDir: join(REPO_ROOT, 'data', 'experiments', 'pipeline-batch', ts),
    seed: 42,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-tab') opts.noTab = true;
    else if (a === '--tab') opts.noTab = false;
    else if (a === '--max') opts.max = Number(argv[++i]) || opts.max;
    else if (a === '--concurrency') opts.concurrency = Math.max(1, Number(argv[++i]) || opts.concurrency);
    else if (a === '--out') opts.outDir = argv[++i];
    else if (a === '--seed') opts.seed = Number(argv[++i]) ?? opts.seed;
    else if (a === '--from-experiment') opts.fromExperiment = argv[++i];
    else if (!a.startsWith('-') && !opts.urlFile) opts.urlFile = a;
  }
  return opts;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'invalid';
  }
}

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadUrls(opts: BatchOpts): string[] {
  if (opts.fromExperiment) {
    const path = opts.fromExperiment.startsWith('/')
      ? opts.fromExperiment
      : join(REPO_ROOT, opts.fromExperiment);
    if (!existsSync(path)) throw new Error(`Experiment file not found: ${path}`);
    const urls = readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line).url as string;
        } catch {
          return null;
        }
      })
      .filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)));
    return shuffle(urls, makeRng(opts.seed)).slice(0, opts.max);
  }
  const file =
    opts.urlFile ??
    join(__dir, 'seeds', 'diverse-urls.txt');
  const path = file.startsWith('/') ? file : join(REPO_ROOT, file);
  if (!existsSync(path)) throw new Error(`URL file not found: ${path}`);
  const urls = readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.replace(/\s+#.*$/, '').trim())
    .filter((l) => l && !l.startsWith('#') && /^https?:\/\//i.test(l));
  return shuffle(urls, makeRng(opts.seed)).slice(0, opts.max);
}

function aiSettingsFromEnv() {
  return {
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    temperature: 0.2,
    maxOutputTokens: 1200,
    timeoutMs: 25_000,
  };
}

function buildTaxonomy() {
  const seed = loadSeedTaxonomy();
  const categories = seed.leaves.map((leaf) => ({
    id: `seed_${leaf.id}`,
    name: leaf.name,
    description: leaf.description ?? '',
    canonicalTags: leaf.canonicalTags ?? [],
    parentId: leaf.parentId ?? null,
    parentName: seed.parentById.get(leaf.parentId)?.name ?? null,
  }));
  const parents = [
    ...new Map(
      categories
        .filter((c) => c.parentId)
        .map((c) => [c.parentId, { id: c.parentId, name: c.parentName ?? c.parentId }])
    ).values(),
  ];
  return { categories, parents };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function runOne(
  url: string,
  aiSettings: ReturnType<typeof aiSettingsFromEnv>,
  classifySettings: ReturnType<typeof classifySettingsFromEnv>,
  taxonomy: ReturnType<typeof buildTaxonomy>
): Promise<PipelineRow> {
  const row: PipelineRow = { url, host: hostOf(url), fetchOk: false, pendingFetchReview: false };
  try {
    const fetchRun = await fetchHybrid(url);
    const winner = fetchRun.winner;
    const redirectContext = fetchRun.redirectContext;
    row.fetchOk = Boolean(fetchRun.ok && winner?.ok && winner.markdown?.trim());
    row.fetchProvider = winner?.id ?? winner?.fetchSourceId;
    if (!row.fetchOk) {
      row.fetchError = winner?.error || 'no body';
      row.classifyMode = 'skipped';
      return row;
    }

    if (redirectContext) {
      row.redirectClass = redirectContext.redirectClass;
      row.resourceMismatch = redirectContext.resourceMismatch;
    }

    const sourceKind = classifySourceKind(url);
    const parsed = parseFetchedContent(winner!.markdown!, sourceKind, winner!.title);

    let redirectVerdict: Awaited<ReturnType<typeof runRedirectAiVerdict>>['data'];
    const verdictEligible = redirectContext && shouldRunRedirectAiVerdict(redirectContext);
    if (verdictEligible && redirectContext) {
      const verdictStart = Date.now();
      const verdictOutcome = await runRedirectAiVerdict(aiSettings, {
        redirectContext,
        bookmarkTitle: url,
        fetchedTitle: parsed.title ?? winner!.title,
        bodyPreview: parsed.snippet || winner!.markdown!,
      });
      row.redirectVerdictMs = Date.now() - verdictStart;
      row.redirectVerdictStatus = verdictOutcome.status;
      if (verdictOutcome.data) {
        redirectVerdict = verdictOutcome.data;
        row.redirectVerdictMatch = redirectVerdict.pageMatchesBookmark;
      }
    } else if (redirectContext) {
      row.redirectVerdictStatus = 'skipped:not_eligible';
    }

    const summaryPromptMode = resolveSummaryRedirectPromptMode({ redirectContext, redirectVerdict });
    row.summaryPromptMode = summaryPromptMode;

    const aiOutcome = await runOpenRouterExtract(aiSettings, {
      url,
      title: parsed.title ?? winner!.title,
      body: parsed.snippet || winner!.markdown!,
      sourceKind,
      hints: { redirectContext, redirectVerdict },
      variant: 'v2',
    });
    row.aiStatus = aiOutcome.status;
    const ai = aiOutcome.data;
    if (typeof ai?.pageMatchesBookmark === 'boolean') {
      row.pageMatchesBookmark = ai.pageMatchesBookmark;
    }

    const redirectReview = redirectContext
      ? shouldFlagRedirectReview(redirectContext, {
          pageMatchesBookmark: ai?.pageMatchesBookmark,
          redirectNote: ai?.redirectNote,
        redirectVerdict: redirectVerdict
          ? {
              pageMatchesBookmark: redirectVerdict.pageMatchesBookmark,
              fetchedPageKind: redirectVerdict.fetchedPageKind,
              redirectNote: redirectVerdict.redirectNote,
              reason: redirectVerdict.reason,
            }
          : undefined,
        })
      : { flag: false as const };

    row.pendingFetchReview = redirectReview.flag;
    row.redirectAnnotate = redirectReview.annotate;
    row.redirectReviewReason = redirectReview.reason;

    const redirectNote =
      redirectReview.annotate?.trim() ||
      ai?.redirectNote?.trim() ||
      redirectReview.reason?.trim();

    const enrichmentLike = {
      status: aiOutcome.status === 'ok' ? ('ok' as const) : ('failed' as const),
      aiStatus: aiOutcome.status,
      summary: ai?.summary,
      aiTags: ai?.tags,
      aiKeyPoints: ai?.keyPoints,
      snippet: parsed.snippet,
      lastErrorDetail: redirectNote,
      hasRawBody: true,
      pendingFetchReview: redirectReview.flag,
      pendingFetchReviewReason: redirectReview.flag ? ('url_redirect' as const) : undefined,
    };

    const redirectAttention = detectUrlRedirectMismatchAttention(enrichmentLike);
    if (redirectAttention) {
      row.redirectAttentionLeaf = true;
      row.linkQualityLeaf = LINK_QUALITY_LEAF_IDS.URL_REDIRECT_MISMATCH;
      row.classifyMode = 'redirect-attention';
      row.classifyCategoryIds = [`seed_${LINK_QUALITY_LEAF_IDS.URL_REDIRECT_MISMATCH}`];
      row.classifyReason = redirectAttention.reason;
      return row;
    }

    const lq = detectLinkQualityFromItem(
      { title: parsed.title ?? winner!.title ?? url, url },
      enrichmentLike
    );
    if (lq) {
      row.linkQualityLeaf = lq.leafId;
      row.classifyMode = 'link-quality';
      row.classifyCategoryIds = [`seed_${lq.leafId}`];
      row.classifyReason = lq.reason;
      return row;
    }

    if (aiOutcome.status !== 'ok' || !ai?.summary?.trim()) {
      row.classifyMode = 'skipped';
      return row;
    }

    const { categories, parents } = taxonomy;
    const classifyText = [ai.summary, ...(ai.keyPoints ?? [])].filter(Boolean).join('\n');
    const batchItem = {
      itemId: `batch-${hostOf(url)}`,
      title: ai.improvedTitle || parsed.title || winner!.title || url,
      textForClassification: classifyText,
    };
    const topicBatch = await callTopicExtractBatch(classifySettings, categories, [batchItem], {
      parents,
    });
    if (!topicBatch.ok) {
      row.error = topicBatch.error;
      row.classifyMode = 'skipped';
      return row;
    }
    const topicRow = topicBatch.results?.[0];
    const categoryIds = new Set(categories.map((c) => c.id));
    const leafById = new Map(categories.map((c) => [c.id, c]));
    const decision = topicRow ? topicRowToDecision(topicRow, categoryIds, leafById) : null;
    row.classifyMode = 'topic';
    row.classifyCategoryIds = decision?.categoryIds;
    row.classifyReason = decision?.reason;
    return row;
  } catch (e) {
    row.error = e instanceof Error ? e.message : String(e);
    row.classifyMode = 'skipped';
    return row;
  }
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function writeSummary(rows: PipelineRow[], outDir: string, opts: BatchOpts) {
  const n = rows.length;
  const fetchOk = rows.filter((r) => r.fetchOk).length;
  const redirectClass: Record<string, number> = {};
  const linkQuality: Record<string, number> = {};
  let pendingReview = 0;
  let redirectAttention = 0;
  let mechanicalMismatch = 0;
  let verdictFalse = 0;
  const summaryPromptMode: Record<string, number> = {};
  const redirectVerdictStatus: Record<string, number> = {};
  let topicClassified = 0;
  let skipped = 0;

  const redirectAttentionUrls: PipelineRow[] = [];
  const pendingReviewUrls: PipelineRow[] = [];
  const mechanicalOnly: PipelineRow[] = [];

  for (const r of rows) {
    if (r.redirectClass) bump(redirectClass, r.redirectClass);
    if (r.pendingFetchReview) {
      pendingReview++;
      pendingReviewUrls.push(r);
    }
    if (r.redirectAttentionLeaf) {
      redirectAttention++;
      redirectAttentionUrls.push(r);
    }
    if (r.resourceMismatch && !r.pendingFetchReview) mechanicalMismatch++;
    if (r.redirectVerdictMatch === false) verdictFalse++;
    if (r.summaryPromptMode) bump(summaryPromptMode, r.summaryPromptMode);
    if (r.redirectVerdictStatus) bump(redirectVerdictStatus, r.redirectVerdictStatus);
    if (r.linkQualityLeaf) bump(linkQuality, r.linkQualityLeaf);
    if (r.classifyMode === 'topic') topicClassified++;
    if (r.classifyMode === 'skipped') skipped++;
  }

  const lines = [
    '# Pipeline batch experiment',
    '',
    `- URLs: **${n}** (seed ${opts.seed}, concurrency ${opts.concurrency}, tab ${opts.noTab ? 'off' : 'on'})`,
    `- Fetch ok: **${fetchOk}** / ${n}`,
    `- Topic classified: **${topicClassified}**`,
    `- Skipped (fetch/AI fail): **${skipped}**`,
    '',
    '## Redirect signals',
    `- redirectClass: ${JSON.stringify(redirectClass)}`,
    `- redirectVerdictStatus: ${JSON.stringify(redirectVerdictStatus)}`,
    `- summaryPromptMode: ${JSON.stringify(summaryPromptMode)}`,
    `- mechanical resourceMismatch (no review flag): **${mechanicalMismatch}**`,
    `- redirect AI verdict false: **${verdictFalse}**`,
    `- pendingFetchReview (url_redirect): **${pendingReview}**`,
    `- **url-redirect-mismatch** taxonomy bucket: **${redirectAttention}**`,
    '',
    '## Link-quality buckets',
    ...Object.entries(linkQuality)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- \`${k}\`: ${v}`),
    '',
  ];

  if (redirectAttentionUrls.length) {
    lines.push('## URL redirect mismatch (attention)', '');
    for (const r of redirectAttentionUrls.slice(0, 25)) {
      lines.push(`- \`${r.host}\` — ${r.url.slice(0, 90)}${r.url.length > 90 ? '…' : ''}`);
      if (r.classifyReason) lines.push(`  - ${r.classifyReason.slice(0, 120)}`);
    }
    if (redirectAttentionUrls.length > 25) {
      lines.push(`- … and ${redirectAttentionUrls.length - 25} more (see results.jsonl)`);
    }
    lines.push('');
  }

  if (mechanicalMismatch > 0) {
    lines.push('## Mechanical mismatch only (no review / no bucket)', '');
    for (const r of rows.filter((x) => x.resourceMismatch && !x.pendingFetchReview).slice(0, 15)) {
      lines.push(`- \`${r.host}\` class=${r.redirectClass} → topic: ${r.classifyCategoryIds?.[0] ?? 'skipped'}`);
    }
    lines.push('');
  }

  if (pendingReviewUrls.length && pendingReviewUrls.length !== redirectAttentionUrls.length) {
    lines.push('## Pending review without redirect bucket (unexpected)', '');
    for (const r of pendingReviewUrls.filter((x) => !x.redirectAttentionLeaf)) {
      lines.push(`- ${r.url}`);
    }
    lines.push('');
  }

  writeFileSync(join(outDir, 'SUMMARY.md'), lines.join('\n'));
}

async function main() {
  loadProjectEnvFromImportMeta(import.meta.url);
  loadEnvFile();

  const opts = parseArgs(process.argv.slice(2));
  const aiSettings = aiSettingsFromEnv();
  if (!aiSettings.apiKey.trim()) {
    console.error('Set OPENROUTER_API_KEY in .env');
    process.exit(1);
  }

  const urls = loadUrls(opts);
  if (!urls.length) {
    console.error('No URLs to process');
    process.exit(1);
  }

  mkdirSync(opts.outDir, { recursive: true });
  writeFileSync(join(opts.outDir, 'urls.txt'), urls.join('\n') + '\n');
  writeFileSync(join(opts.outDir, 'opts.json'), JSON.stringify(opts, null, 2));

  setProviderRunOptions({ includeTab: !opts.noTab });
  const classifySettings = classifySettingsFromEnv();
  const taxonomy = buildTaxonomy();

  console.log(`Pipeline batch: ${urls.length} URLs → ${opts.outDir}`);
  console.log(`concurrency=${opts.concurrency} noTab=${opts.noTab}`);

  const jsonlPath = join(opts.outDir, 'results.jsonl');
  const stream = createWriteStream(jsonlPath, { flags: 'w' });
  let done = 0;

  const rows = await mapPool(urls, opts.concurrency, async (url, i) => {
    const row = await runOne(url, aiSettings, classifySettings, taxonomy);
    stream.write(JSON.stringify(row) + '\n');
    done++;
    if (done % 5 === 0 || done === urls.length) {
      console.log(`[${done}/${urls.length}] last=${row.host} fetch=${row.fetchOk ? 'ok' : 'fail'} classify=${row.classifyMode ?? '?'}`);
    }
    return row;
  });

  stream.end();
  writeSummary(rows, opts.outDir, opts);
  console.log(`\nDone. ${join(opts.outDir, 'SUMMARY.md')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
