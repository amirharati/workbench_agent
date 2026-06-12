#!/usr/bin/env tsx
/**
 * One-URL end-to-end spot check: fetch → AI extract → redirect review → link-quality → classify.
 *
 *   npx tsx scripts/enrich-fetch/run-spot-pipeline.mts "https://..."
 *   npm run fetch-spot-pipeline -- "https://..."
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadProjectEnvFromImportMeta } from '../lib/loadProjectEnv.mjs';
import { classifySettingsFromEnv, loadEnvFile } from '../categorize/lib/loadEnv.mjs';
import { loadSeedTaxonomy } from '../categorize/lib/seedTaxonomy.mjs';
import { callTopicExtractBatch, topicRowToDecision } from '../categorize/lib/topicExtract.mjs';
import { detectLinkQualityFromItem } from '../../src/lib/categorization/linkQuality.ts';
import { fetchHybrid, setProviderRunOptions } from './lib/providers.mjs';
import { runOpenRouterExtract } from './lib/aiPrompts.mjs';
import { classifySourceKind, parseFetchedContent } from './lib/parse.mjs';
import { shouldFlagRedirectReview, shouldRunRedirectAiVerdict } from './lib/fetchRedirect.mjs';
import { runRedirectAiVerdict } from './lib/redirectAiVerdict.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]) {
  const opts = { url: '', noTab: true };
  for (const arg of argv) {
    if (arg === '--no-tab') opts.noTab = true;
    else if (arg === '--tab') opts.noTab = false;
    else if (arg.startsWith('http')) opts.url = arg;
  }
  return opts;
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

function section(title: string) {
  console.log('\n' + '═'.repeat(72));
  console.log(title);
  console.log('═'.repeat(72));
}

async function main() {
  loadProjectEnvFromImportMeta(import.meta.url);
  loadEnvFile();

  const opts = parseArgs(process.argv.slice(2));
  if (!opts.url) {
    console.error('Usage: run-spot-pipeline.mts [--tab] <url>');
    process.exit(1);
  }

  const aiSettings = aiSettingsFromEnv();
  if (!aiSettings.apiKey.trim()) {
    console.error('Set OPENROUTER_API_KEY in .env to run AI + classify steps.');
    process.exit(1);
  }

  setProviderRunOptions({ includeTab: !opts.noTab });

  section('1 · FETCH (hybrid)');
  const fetchRun = await fetchHybrid(opts.url);
  const winner = fetchRun.winner;
  const redirectContext = fetchRun.redirectContext;
  console.log('status:', fetchRun.ok ? 'ok' : 'failed');
  console.log('provider:', winner?.id ?? winner?.fetchSourceId ?? '?');
  console.log('bytes:', winner?.rawBytes ?? winner?.markdown?.length ?? 0);
  if (redirectContext) {
    console.log(
      `redirect: class=${redirectContext.redirectClass}` +
        (redirectContext.resourceMismatch ? ' resourceMismatch=yes' : '')
    );
    if (redirectContext.redirectClass !== 'none') {
      console.log('  saved:', redirectContext.requestedUrl);
      console.log('  final:', redirectContext.finalUrl);
    }
    if (fetchRun.redirectReview?.flag) {
      console.log('  mechanical review:', fetchRun.redirectReview.reason);
    }
  }
  if (!winner?.ok || !winner.markdown?.trim()) {
    console.log('fetch failed — stopping before AI');
    process.exit(1);
  }

  const sourceKind = classifySourceKind(opts.url);
  const parsed = parseFetchedContent(winner.markdown, sourceKind, winner.title);
  console.log('title:', parsed.title ?? winner.title ?? '(none)');
  console.log('snippet:', parsed.snippet.slice(0, 280) + (parsed.snippet.length > 280 ? '…' : ''));

  let redirectVerdict = undefined;
  if (redirectContext && shouldRunRedirectAiVerdict(redirectContext)) {
    section('2 · REDIRECT AI VERDICT (pre-summary)');
    const verdictOutcome = await runRedirectAiVerdict(aiSettings, {
      redirectContext,
      bookmarkTitle: opts.url,
      fetchedTitle: parsed.title ?? winner.title,
      bodyPreview: parsed.snippet || winner.markdown,
    });
    console.log('verdictStatus:', verdictOutcome.status);
    if (verdictOutcome.error) console.log('verdictError:', verdictOutcome.error);
    if (verdictOutcome.data) {
      redirectVerdict = verdictOutcome.data;
      console.log(JSON.stringify(redirectVerdict, null, 2));
    }
  }

  section(redirectVerdict ? '3 · AI SUMMARY (v2 extract)' : '2 · AI SUMMARY (v2 extract)');
  const aiOutcome = await runOpenRouterExtract(aiSettings, {
    url: opts.url,
    title: parsed.title ?? winner.title,
    body: parsed.snippet || winner.markdown,
    sourceKind,
    hints: { redirectContext, redirectVerdict },
    variant: 'v2',
  });
  console.log('aiStatus:', aiOutcome.status);
  if (aiOutcome.error) console.log('aiError:', aiOutcome.error);
  const ai = aiOutcome.data;
  if (ai?.summary) {
    console.log('summary:', ai.summary.slice(0, 400) + (ai.summary.length > 400 ? '…' : ''));
  }
  if (ai?.improvedTitle) console.log('improvedTitle:', ai.improvedTitle);
  if (ai?.tags?.length) console.log('tags:', ai.tags.join(', '));
  if (typeof ai?.pageMatchesBookmark === 'boolean') {
    console.log('pageMatchesBookmark:', ai.pageMatchesBookmark);
  }
  if (ai?.redirectNote) console.log('redirectNote:', ai.redirectNote);

  const redirectReview = redirectContext
    ? shouldFlagRedirectReview(redirectContext, {
        pageMatchesBookmark: ai?.pageMatchesBookmark,
        redirectNote: ai?.redirectNote,
        redirectVerdict: redirectVerdict
          ? {
              pageMatchesBookmark: redirectVerdict.pageMatchesBookmark,
              redirectNote: redirectVerdict.redirectNote,
              reason: redirectVerdict.reason,
            }
          : undefined,
      })
    : { flag: false };
  console.log(
    'enrich would set pendingFetchReview:',
    redirectReview.flag ? `yes (${redirectReview.reason})` : 'no'
  );
  console.log('hub badge (enrich):', redirectReview.flag ? 'Fetch review (warning)' : 'Enriched (if ok)');

  section(redirectVerdict ? '4 · LINK QUALITY (pre-classify gate)' : '3 · LINK QUALITY (pre-classify gate)');
  const enrichmentLike = {
    status: aiOutcome.status === 'ok' ? ('ok' as const) : ('failed' as const),
    aiStatus: aiOutcome.status,
    summary: ai?.summary,
    aiTags: ai?.tags,
    aiKeyPoints: ai?.keyPoints,
    snippet: parsed.snippet,
    lastErrorDetail: redirectReview.reason,
    hasRawBody: true,
    pendingFetchReview: redirectReview.flag,
  };
  const lq = detectLinkQualityFromItem(
    { title: parsed.title ?? winner.title ?? opts.url, url: opts.url },
    enrichmentLike
  );
  if (lq) {
    console.log('link-quality leaf:', lq.leafId);
    console.log('reason:', lq.reason);
    console.log('→ would short-circuit classify into link-quality bucket');
  } else {
    console.log('no link-quality bucket — proceeds to topic classify');
  }

  if (lq) {
    section('5 · CLASSIFY');
    console.log('skipped (link-quality assigned)');
    return;
  }

  if (aiOutcome.status !== 'ok' || !ai?.summary?.trim()) {
    section('5 · CLASSIFY');
    console.log('skipped (no usable AI summary)');
    return;
  }

  section('5 · CLASSIFY (topic extract)');
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
  const classifySettings = classifySettingsFromEnv();
  const classifyText = [ai.summary, ...(ai.keyPoints ?? [])].filter(Boolean).join('\n');
  const batchItem = {
    itemId: 'spot-1',
    title: ai.improvedTitle || parsed.title || winner.title || opts.url,
    textForClassification: classifyText,
  };
  const topicBatch = await callTopicExtractBatch(classifySettings, categories, [batchItem], {
    parents,
  });
  if (!topicBatch.ok) {
    console.log('classify error:', topicBatch.error);
    return;
  }
  const row = topicBatch.results?.[0];
  const categoryIds = new Set(categories.map((c) => c.id));
  const leafById = new Map(categories.map((c) => [c.id, c]));
  const decision = row ? topicRowToDecision(row, categoryIds, leafById) : null;
  console.log('raw topic row:', JSON.stringify(row, null, 2));
  if (decision) {
    console.log('decision:', decision.decisionType);
    if (decision.categoryIds?.length) console.log('categoryIds:', decision.categoryIds.join(', '));
    if (decision.reason) console.log('reason:', decision.reason);
    if (decision.confidence != null) console.log('confidence:', decision.confidence);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
