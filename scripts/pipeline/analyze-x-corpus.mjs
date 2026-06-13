#!/usr/bin/env node
/**
 * Analyze X/Twitter bookmarks in workbench.sqlite — input vs enrichment output.
 * Usage: node scripts/pipeline/analyze-x-corpus.mjs ~/Documents/test4/workbench.sqlite
 */

import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';

const dbPath = process.argv[2] || `${process.env.HOME}/Documents/test4/workbench.sqlite`;

function sqlJson(sql) {
  const out = execFileSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.trim() ? JSON.parse(out) : [];
}

function classifyUrl(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '').toLowerCase();
    if (h === 't.co') return 't.co-short';
    if (h.includes('twitter') || h === 'x.com') {
      const p = u.pathname;
      if (/\/status\/\d+/i.test(p)) {
        if (p.includes('/photo/')) return 'status-photo';
        if (p.includes('/video/')) return 'status-video';
        return 'status-tweet';
      }
      if (p.includes('/i/bookmarks')) return 'bookmarks-page';
      if (p.includes('/i/lists/')) return 'list';
      if (p.includes('/search')) return 'search';
      if (p.startsWith('/i/')) return 'x-internal';
      return 'profile-or-other';
    }
    return 'other-x-host';
  } catch {
    return 'invalid';
  }
}

function bump(map, key) {
  const k = key || '(null)';
  map[k] = (map[k] ?? 0) + 1;
}

function topEntries(map, n = 20) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
}

const items = sqlJson(`
SELECT
  i.id,
  i.url,
  i.title,
  i.source,
  e.status,
  e.fetch_source_id,
  e.source_kind,
  e.last_error_code,
  e.last_error_detail,
  e.failure_category,
  e.pending_fetch_review,
  e.pending_fetch_review_reason,
  e.ai_status,
  e.ai_error,
  length(e.summary) AS summary_len,
  length(e.snippet) AS snippet_len,
  e.summary,
  e.quoted_text,
  e.quoted_author,
  e.fetched_title,
  e.skip_reason,
  e.ai_key_points,
  e.fetched_at
FROM items i
LEFT JOIN item_enrichment e ON e.item_id = i.id
WHERE i.deleted_at IS NULL
AND (
  lower(i.url) LIKE '%://x.com/%'
  OR lower(i.url) LIKE '%://twitter.com/%'
  OR lower(i.url) LIKE '%://mobile.twitter.com/%'
  OR lower(i.url) LIKE '%://t.co/%'
)
`);

const enrichedIds = items.filter((r) => r.status).map((r) => r.id);
const debugMap = {};
if (enrichedIds.length) {
  const chunkSize = 40;
  for (let i = 0; i < enrichedIds.length; i += chunkSize) {
    const chunk = enrichedIds.slice(i, i + chunkSize);
    const ph = chunk.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
    const rows = sqlJson(`SELECT item_id, payload FROM pipeline_debug WHERE item_id IN (${ph})`);
    for (const row of rows) {
      try {
        debugMap[row.item_id] = JSON.parse(row.payload);
      } catch {
        /* ignore */
      }
    }
  }
}

const byUrlKind = {};
const bySource = {};
const byStatus = {};
const byFetch = {};
const byAi = {};
const crossFetchAi = {};

for (const r of items) {
  bump(byUrlKind, classifyUrl(r.url));
  bump(bySource, r.source);
  bump(byStatus, r.status || 'not_enriched');
}

function assessRow(r) {
  const urlKind = classifyUrl(r.url);
  const dbg = debugMap[r.id];
  const phases = dbg?.phases?.map((p) => p.phase || p.name).filter(Boolean) ?? [];
  const aiCalls = dbg?.aiCalls ?? [];
  const redirect = dbg?.redirect;

  let keyPointCount = 0;
  try {
    keyPointCount = r.ai_key_points ? JSON.parse(r.ai_key_points).length : 0;
  } catch {
    /* ignore */
  }

  const summaryIsTitleFallback =
    r.summary && r.title && r.summary.trim() === r.title.trim();
  const hasQuote = !!(r.quoted_text || r.quoted_author);
  const isThreadSnippet = (r.snippet_len ?? 0) > 0 && dbg?.snippet?.includes?.('thread');

  const flags = [];
  if (!r.status) flags.push('NOT_ENRICHED');
  else if (r.status === 'failed') flags.push('FETCH_FAILED');
  else if (r.status === 'ok') flags.push('FETCH_OK');

  if (r.ai_status === 'ok') flags.push('AI_OK');
  else if (r.ai_status === 'empty_response') flags.push('AI_EMPTY');
  else if (r.ai_status) flags.push(`AI_${r.ai_status.toUpperCase()}`);

  if (summaryIsTitleFallback) flags.push('SUMMARY_IS_TITLE');
  if (r.pending_fetch_review) flags.push('NEEDS_REVIEW');
  if ((r.snippet_len ?? 0) < 80 && r.status === 'ok') flags.push('THIN_SNIPPET');
  if (hasQuote) flags.push('HAS_QUOTE');
  if (urlKind === 't.co-short') flags.push('SHORT_URL');
  if (urlKind.includes('photo') || urlKind.includes('video')) flags.push('MEDIA_PATH');
  if (r.fetch_source_id === 'tab-session') flags.push('ROUTE_TAB');
  if (r.fetch_source_id?.startsWith('syndication')) flags.push('ROUTE_SYNDICATION');
  if (phases.some((p) => String(p).includes('thread'))) flags.push('THREAD_PHASE');

  const manualQuestion = buildManualQuestion(r, urlKind, flags, dbg);

  return {
    id: r.id,
    url: r.url,
    title: r.title?.slice(0, 120),
    source: r.source,
    urlKind,
    status: r.status,
    fetchSourceId: r.fetch_source_id,
    aiStatus: r.ai_status,
    aiError: r.ai_error,
    lastErrorCode: r.last_error_code,
    lastErrorDetail: r.last_error_detail?.slice(0, 160),
    pendingReview: !!r.pending_fetch_review,
    reviewReason: r.pending_fetch_review_reason,
    summaryPreview: r.summary?.slice(0, 200),
    summaryIsTitleFallback,
    snippetLen: r.snippet_len ?? 0,
    summaryLen: r.summary_len ?? 0,
    keyPointCount,
    hasQuote,
    quotedAuthor: r.quoted_author,
    quotedPreview: r.quoted_text?.slice(0, 100),
    phases: phases.join(' → '),
    redirectClass: redirect?.redirectClass,
    redirectFinal: redirect?.finalUrl,
    aiCallTypes: aiCalls.map((c) => c.taskType).join(', '),
    flags: flags.join('+'),
    manualQuestion,
  };
}

function buildManualQuestion(r, urlKind, flags, dbg) {
  if (!r.status) {
    if (urlKind === 't.co-short') {
      return 'After full enrich: does t.co expand to the intended tweet? Is syndication or tab needed first?';
    }
    return 'Run digest — expect syndication or tab-session. Does UI show enrich pending?';
  }
  if (flags.includes('AI_EMPTY') && flags.includes('ROUTE_TAB')) {
    return 'Tab fetch returned chrome-only body — open tweet logged-in in browser and re-fetch with tab session?';
  }
  if (flags.includes('AI_EMPTY') && flags.includes('ROUTE_SYNDICATION')) {
    return 'Syndication got text but AI filtered it — inspect raw snippet: login shell or real tweet?';
  }
  if (flags.includes('SUMMARY_IS_TITLE')) {
    return 'Summary equals bookmark title — is AI summary missing while fetch succeeded? Compare Inspector raw body.';
  }
  if (flags.includes('NEEDS_REVIEW')) {
    return `Why flagged for review (${r.pending_fetch_review_reason ?? '?'}) — redirect mismatch or low quality?`;
  }
  if (flags.includes('HAS_QUOTE')) {
    return 'Quote tweet — does quoted author/text match what you see on X? Any linked media captured?';
  }
  if (flags.includes('THREAD_PHASE') || (dbg?.phases ?? []).some((p) => String(p.phase || p.name).includes('thread'))) {
    return 'Thread detected — does snippet include all parts (1/N…)? Missing replies?';
  }
  if (flags.includes('MEDIA_PATH')) {
    return 'Photo/video URL — does enrichment capture tweet text + media context, not just media page chrome?';
  }
  if (flags.includes('FETCH_OK') && flags.includes('AI_OK') && !flags.includes('SUMMARY_IS_TITLE')) {
    return 'Looks healthy — spot-check: does summary match tweet intent? Any missing link preview / quote?';
  }
  if (r.status === 'failed') {
    return `Fetch failed (${r.last_error_code}) — retry in browser tab vs headless syndication?`;
  }
  return 'Spot-check summary vs live tweet.';
}

const enrichedRows = items.filter((r) => r.status).map(assessRow);
for (const r of enrichedRows) {
  bump(byFetch, r.fetchSourceId);
  bump(byAi, r.aiStatus);
  const cross = `${r.fetchSourceId || '?'} | ${r.aiStatus || '?'}`;
  crossFetchAi[cross] = (crossFetchAi[cross] ?? 0) + 1;
}

const flagCounts = {};
for (const r of enrichedRows) {
  for (const f of r.flags.split('+')) bump(flagCounts, f);
}

const lines = [];
const push = (s = '') => lines.push(s);

push('# X/Twitter corpus analysis');
push('');
push(`Database: \`${dbPath}\``);
push(`Generated: ${new Date().toISOString()}`);
push('');

push('## Corpus totals');
push('');
push(`| Metric | Count |`);
push(`|--------|------:|`);
push(`| All X-related bookmarks | **${items.length}** |`);
push(`| Enriched (any status) | **${enrichedRows.length}** |`);
push(`| Not enriched yet | **${items.length - enrichedRows.length}** |`);
push('');

push('### By URL kind');
push('');
for (const [k, v] of topEntries(byUrlKind)) push(`- ${k}: **${v}**`);
push('');

push('### By import source');
push('');
for (const [k, v] of topEntries(bySource)) push(`- ${k}: **${v}**`);
push('');

push('### Enrichment status (all X URLs)');
push('');
for (const [k, v] of topEntries(byStatus)) push(`- ${k}: **${v}**`);
push('');

push('## Enriched subset (processed batch)');
push('');
push(`| Metric | Count |`);
push(`|--------|------:|`);
push(`| fetch ok | **${enrichedRows.filter((r) => r.status === 'ok').length}** |`);
push(`| fetch failed | **${enrichedRows.filter((r) => r.status === 'failed').length}** |`);
push(`| AI ok | **${enrichedRows.filter((r) => r.aiStatus === 'ok').length}** |`);
push(`| AI empty_response | **${enrichedRows.filter((r) => r.aiStatus === 'empty_response').length}** |`);
push(`| summary = title fallback | **${enrichedRows.filter((r) => r.summaryIsTitleFallback).length}** |`);
push(`| pending fetch review | **${enrichedRows.filter((r) => r.pendingReview).length}** |`);
push(`| has quoted tweet fields | **${enrichedRows.filter((r) => r.hasQuote).length}** |`);
push('');

push('### Fetch route (enriched)');
push('');
for (const [k, v] of topEntries(byFetch)) push(`- ${k}: **${v}**`);
push('');

push('### AI status (enriched)');
push('');
for (const [k, v] of topEntries(byAi)) push(`- ${k}: **${v}**`);
push('');

push('### Fetch route × AI status');
push('');
for (const [k, v] of topEntries(crossFetchAi)) push(`- ${k}: **${v}**`);
push('');

push('### Flag counts (enriched)');
push('');
for (const [k, v] of topEntries(flagCounts)) push(`- ${k}: **${v}**`);
push('');

// Group enriched by primary issue for manual review priority
const buckets = {
  healthy: [],
  ai_empty_tab: [],
  ai_empty_syndication: [],
  summary_is_title: [],
  needs_review: [],
  non_tweet_url: [],
  failed: [],
  other: [],
};

for (const r of enrichedRows) {
  if (r.status === 'failed') buckets.failed.push(r);
  else if (r.urlKind !== 'status-tweet' && r.urlKind !== 't.co-short') buckets.non_tweet_url.push(r);
  else if (r.pendingReview) buckets.needs_review.push(r);
  else if (r.flags.includes('AI_EMPTY') && r.flags.includes('ROUTE_TAB')) buckets.ai_empty_tab.push(r);
  else if (r.flags.includes('AI_EMPTY') && r.flags.includes('ROUTE_SYNDICATION')) buckets.ai_empty_syndication.push(r);
  else if (r.summaryIsTitleFallback) buckets.summary_is_title.push(r);
  else if (r.flags.includes('FETCH_OK') && r.flags.includes('AI_OK')) buckets.healthy.push(r);
  else buckets.other.push(r);
}

function printBucket(title, rows, max = 25) {
  if (!rows.length) return;
  push(`## ${title} (${rows.length})`);
  push('');
  for (const r of rows.slice(0, max)) {
    push(`### ${r.title || r.url}`);
    push('');
    push(`- **URL:** ${r.url}`);
    push(`- **Kind:** ${r.urlKind} | **Route:** ${r.fetchSourceId ?? '—'} | **AI:** ${r.aiStatus ?? '—'}`);
    push(`- **Flags:** ${r.flags}`);
    if (r.summaryPreview) push(`- **Summary:** ${r.summaryPreview}`);
    if (r.aiError) push(`- **AI error:** ${r.aiError}`);
    if (r.lastErrorDetail) push(`- **Fetch detail:** ${r.lastErrorDetail}`);
    if (r.phases) push(`- **Phases:** ${r.phases}`);
    if (r.aiCallTypes) push(`- **AI calls:** ${r.aiCallTypes}`);
    push(`- **Manual check:** ${r.manualQuestion}`);
    push('');
  }
  if (rows.length > max) push(`_… and ${rows.length - max} more (see JSON export)_`);
  push('');
}

printBucket('Priority — tab route + AI empty', buckets.ai_empty_tab);
printBucket('Priority — syndication + AI empty', buckets.ai_empty_syndication);
printBucket('Priority — summary equals title (weak AI)', buckets.summary_is_title);
printBucket('Priority — pending fetch review', buckets.needs_review);
printBucket('Fetch failed', buckets.failed);
printBucket('Non-tweet X URLs (analytics, login flow, etc.)', buckets.non_tweet_url);
printBucket('Other / mixed', buckets.other);
printBucket('Healthy — spot-check sample', buckets.healthy, 15);

push('## Unenriched backlog (not processed yet)');
push('');
const unenriched = items.filter((r) => !r.status);
const unByKind = {};
for (const r of unenriched) bump(unByKind, classifyUrl(r.url));
for (const [k, v] of topEntries(unByKind)) push(`- ${k}: **${v}**`);
push('');
push(`Total waiting: **${unenriched.length}** (${unByKind['status-tweet'] ?? 0} status tweets, ${unByKind['t.co-short'] ?? 0} t.co)`);
push('');

const outMd = lines.join('\n');
const outJson = {
  generatedAt: new Date().toISOString(),
  dbPath,
  totals: {
    all: items.length,
    enriched: enrichedRows.length,
    notEnriched: unenriched.length,
    byUrlKind,
    bySource,
    byStatus,
    byFetch,
    byAi,
    crossFetchAi,
    flagCounts,
    buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
  },
  enrichedRows,
  unenrichedSample: unenriched.slice(0, 20).map((r) => ({
    url: r.url,
    title: r.title?.slice(0, 100),
    urlKind: classifyUrl(r.url),
    source: r.source,
  })),
};

const mdPath = '/tmp/x-corpus-analysis.md';
const jsonPath = '/tmp/x-corpus-analysis.json';
writeFileSync(mdPath, outMd);
writeFileSync(jsonPath, JSON.stringify(outJson, null, 2));

console.log(outMd);
console.log('\n---');
console.log(`Wrote ${mdPath} and ${jsonPath}`);
