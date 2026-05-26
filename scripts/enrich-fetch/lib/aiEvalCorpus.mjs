/**
 * Load saved experiment bodies for AI eval (production-aligned provider pick).
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseFetchedContent } from './parse.mjs';
import { HYBRID_PROVIDER_ORDER } from './aiPrompts.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..', '..');
const EXPERIMENTS_DIR = join(REPO_ROOT, 'data', 'experiments', 'enrich-fetch');

const DEFAULT_CORPORA = [
  '2026-05-21T02-02-56',
  '2026-05-21T03-03-24',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function pickHybridMarkdown(attempts, sourceKind, expDir) {
  const order = HYBRID_PROVIDER_ORDER[sourceKind] || HYBRID_PROVIDER_ORDER.article;
  const byProvider = new Map(attempts.map((a) => [a.provider, a]));

  for (const provider of order) {
    const attempt = byProvider.get(provider);
    if (!attempt?.usable || !attempt.files?.markdown) continue;
    const mdPath = join(expDir, attempt.files.markdown);
    if (existsSync(mdPath)) {
      return {
        provider,
        markdown: readFileSync(mdPath, 'utf8'),
        title: attempt.parsed?.title || attempt.title,
      };
    }
  }

  const fallback = attempts.find((a) => a.usable && a.files?.markdown);
  if (!fallback) return null;
  const mdPath = join(expDir, fallback.files.markdown);
  if (!existsSync(mdPath)) return null;
  return {
    provider: fallback.provider,
    markdown: readFileSync(mdPath, 'utf8'),
    title: fallback.parsed?.title || fallback.title,
  };
}

export function loadCorpusItems(experimentIds = DEFAULT_CORPORA) {
  const items = [];

  for (const expId of experimentIds) {
    const expDir = join(EXPERIMENTS_DIR, expId);
    const bodiesDir = join(expDir, 'bodies');
    if (!existsSync(bodiesDir)) continue;

    for (const name of readdirSync(bodiesDir)) {
      const bodyDir = join(bodiesDir, name);
      if (!statSync(bodyDir).isDirectory()) continue;

      const attemptsPath = join(bodyDir, 'attempts.json');
      if (!existsSync(attemptsPath)) continue;

      const meta = readJson(attemptsPath);
      const picked = pickHybridMarkdown(meta.attempts || [], meta.sourceKind || 'article', expDir);
      if (!picked) continue;

      const parsed = parseFetchedContent(picked.markdown, meta.sourceKind || 'article', picked.title);
      const snippet = parsed.snippet?.trim() || '';
      if (snippet.length < 80) continue;

      items.push({
        id: `${expId}/${name}`,
        experimentId: expId,
        url: meta.url,
        host: meta.host,
        sourceKind: meta.sourceKind || 'article',
        provider: picked.provider,
        title: parsed.title || picked.title,
        snippetLen: snippet.length,
        snippet,
        hints: {
          quotedText: parsed.quotedText,
          quotedAuthor: parsed.quotedAuthor,
          channel: parsed.channel,
          description: parsed.description,
        },
      });
    }
  }

  return items;
}

export function aggregateMetrics(results) {
  const total = results.length;
  const byStatus = {};
  const byKind = {};
  let parseOk = 0;
  let hasSummary = 0;
  let hasTitle = 0;
  let hasKeyPoints = 0;
  let tagCounts = [];
  let summaryLens = [];
  let keyPointCounts = [];

  for (const r of results) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const kind = r.sourceKind || 'article';
    if (!byKind[kind]) {
      byKind[kind] = { total: 0, ok: 0, summary: 0, title: 0, keyPoints: 0, tags: [], summaryLen: [] };
    }
    byKind[kind].total++;

    if (r.status === 'ok') {
      parseOk++;
      byKind[kind].ok++;
      if (r.data?.summary?.trim()) {
        hasSummary++;
        byKind[kind].summary++;
        summaryLens.push(r.data.summary.trim().length);
        byKind[kind].summaryLen.push(r.data.summary.trim().length);
      }
      if (r.data?.keyPoints?.length) {
        hasKeyPoints++;
        byKind[kind].keyPoints++;
        keyPointCounts.push(r.data.keyPoints.length);
      }
      if (r.data?.improvedTitle?.trim()) {
        hasTitle++;
        byKind[kind].title++;
      }
      const n = r.data?.tags?.length || 0;
      tagCounts.push(n);
      byKind[kind].tags.push(n);
    }
  }

  const pct = (n) => (total ? ((n / total) * 100).toFixed(1) : '0.0');

  return {
    total,
    parseOk,
    parseOkPct: pct(parseOk),
    hasSummary,
    summaryPct: pct(hasSummary),
    hasTitle,
    titlePct: pct(hasTitle),
    hasKeyPoints,
    keyPointsPct: pct(hasKeyPoints),
    avgSummaryLen:
      summaryLens.length > 0
        ? Math.round(summaryLens.reduce((a, b) => a + b, 0) / summaryLens.length)
        : 0,
    avgKeyPointCount:
      keyPointCounts.length > 0
        ? (keyPointCounts.reduce((a, b) => a + b, 0) / keyPointCounts.length).toFixed(2)
        : '0',
    tagCounts,
    avgTags: tagCounts.length ? (tagCounts.reduce((a, b) => a + b, 0) / tagCounts.length).toFixed(2) : '0',
    byStatus,
    byKind,
  };
}

export function buildSummaryMarkdown({ variant, corpora, metrics, outDir }) {
  const lines = [];
  lines.push(`# AI extraction eval — ${variant}`);
  lines.push('');
  lines.push(`- Corpus runs: ${corpora.join(', ')}`);
  lines.push(`- Items evaluated: **${metrics.total}**`);
  lines.push(`- Output: \`${outDir}\``);
  lines.push('');
  lines.push('## Overall metrics');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Parse/extract ok | ${metrics.parseOk}/${metrics.total} (${metrics.parseOkPct}%) |`);
  lines.push(`| Non-empty summary | ${metrics.hasSummary}/${metrics.total} (${metrics.summaryPct}%) |`);
  lines.push(`| Non-empty improvedTitle | ${metrics.hasTitle}/${metrics.total} (${metrics.titlePct}%) |`);
  lines.push(`| Has keyPoints | ${metrics.hasKeyPoints}/${metrics.total} (${metrics.keyPointsPct}%) |`);
  lines.push(`| Avg summary length (ok rows) | ${metrics.avgSummaryLen} chars |`);
  lines.push(`| Avg keyPoint count (ok rows) | ${metrics.avgKeyPointCount} |`);
  lines.push(`| Avg tag count (ok rows) | ${metrics.avgTags} |`);
  lines.push('');
  lines.push('## Status buckets');
  lines.push('');
  for (const [k, v] of Object.entries(metrics.byStatus).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${k}**: ${v}`);
  }
  lines.push('');
  lines.push('## By source kind');
  lines.push('');
  lines.push('| Kind | N | ok | summary | keyPts | avg summary len | avg tags |');
  lines.push('|------|---|----|---------|--------|-----------------|----------|');
  for (const [kind, row] of Object.entries(metrics.byKind).sort()) {
    const avgTags =
      row.tags.length > 0
        ? (row.tags.reduce((a, b) => a + b, 0) / row.tags.length).toFixed(2)
        : '0';
    const avgSum =
      row.summaryLen?.length > 0
        ? Math.round(row.summaryLen.reduce((a, b) => a + b, 0) / row.summaryLen.length)
        : 0;
    lines.push(
      `| ${kind} | ${row.total} | ${row.ok} | ${row.summary} | ${row.keyPoints} | ${avgSum} | ${avgTags} |`
    );
  }
  lines.push('');
  return lines.join('\n');
}
