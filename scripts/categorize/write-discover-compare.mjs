#!/usr/bin/env node
/**
 * Write eval-<id>/COMPARE.md — discover counts + classify assignment quality.
 * Usage: node scripts/categorize/write-discover-compare.mjs data/experiments/categorize/eval-2026-06-03
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const evalRoot = process.argv[2];
if (!evalRoot) {
  console.error('Usage: node write-discover-compare.mjs <eval-root-dir>');
  process.exit(1);
}

function listCells(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        !d.name.startsWith('.') &&
        existsSync(join(root, d.name, 'discover', 'run-stats.json'))
    )
    .map((d) => d.name)
    .sort();
}

const cells = listCells(evalRoot);

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isGeneralLeafId(id) {
  if (!id || typeof id !== 'string') return false;
  const lower = id.toLowerCase();
  return lower.endsWith('-general') || lower.includes('other');
}

function classifyQuality(outDir) {
  const path = join(outDir, 'classify', 'classify-state.jsonl');
  if (!existsSync(path)) return null;
  const rows = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  if (!rows.length) return null;

  let processed = 0;
  let specific = 0;
  let general = 0;
  let unassigned = 0;
  const confSpec = [];
  const confGen = [];
  const confAssigned = [];

  for (const row of rows) {
    const st = row.classifyState;
    if (st === 'ineligible' || st === 'skipped' || st === 'manual_review') continue;
    processed++;
    const conf = row.llmReview?.confidence;
    const pid = row.primaryCategoryId;
    if (pid && !isGeneralLeafId(pid)) {
      specific++;
      if (Number.isFinite(conf)) {
        confSpec.push(conf);
        confAssigned.push(conf);
      }
    } else if (pid && isGeneralLeafId(pid)) {
      general++;
      if (Number.isFinite(conf)) {
        confGen.push(conf);
        confAssigned.push(conf);
      }
    } else {
      unassigned++;
    }
  }

  const avg = (arr) =>
    arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '—';
  const pctHigh = (arr, threshold = 0.85) =>
    arr.length
      ? Math.round((100 * arr.filter((c) => c >= threshold).length) / arr.length)
      : '—';

  const assigned = specific + general;
  return {
    processed,
    specific,
    general,
    unassigned,
    specificPct: processed ? Math.round((100 * specific) / processed) : '—',
    assignedPct: processed ? Math.round((100 * assigned) / processed) : '—',
    avgConfSpecific: avg(confSpec),
    avgConfGeneral: avg(confGen),
    avgConfAssigned: avg(confAssigned),
    highConfSpecificPct: pctHigh(confSpec),
    highConfAssignedPct: pctHigh(confAssigned),
  };
}

function classifyMetrics(outDir) {
  const stats = readJson(join(outDir, 'classify', 'run-stats.json'));
  const s = stats?.summary ?? stats ?? {};
  return {
    classifiedSpecific: s.classifiedSpecific ?? '—',
    classified_general: s.classifiedGeneral ?? '—',
    pending_discover: s.pendingDiscover ?? '—',
    unassigned: s.unassigned ?? '—',
    assignedPrimary: s.assignedPrimary ?? '—',
  };
}

function discoverMetrics(outDir) {
  const stats = readJson(join(outDir, 'discover', 'run-stats.json'))?.summary ?? {};
  const tax = readJson(join(outDir, 'discover', 'taxonomy-out.json'));
  const parents = tax?.parents?.length ?? '—';
  const leaves = tax?.leaves?.length ?? '—';
  let orphan = '—';
  const orphanPath = join(outDir, 'discover', 'orphan-leaves.txt');
  if (existsSync(orphanPath)) {
    const m = readFileSync(orphanPath, 'utf8').match(/orphanParentId=(\d+)/);
    if (m) orphan = m[1];
  }
  const rawL = stats.proposedLeavesRaw ?? 0;
  const newL = stats.newLeaves ?? 0;
  const keptPct =
    rawL > 0 && typeof newL === 'number' ? Math.round((100 * newL) / rawL) : stats.leavesKeptPct ?? '—';
  return {
    proposedParentsRaw: stats.proposedParentsRaw ?? '—',
    proposedLeavesRaw: stats.proposedLeavesRaw ?? '—',
    newParents: stats.newParents ?? '—',
    newLeaves: stats.newLeaves ?? '—',
    leavesKeptPct: keptPct,
    reduceCalls: stats.reduceCalls ?? '—',
    reduceLeafCalls: stats.reduceLeafCalls ?? '—',
    reduceMode: stats.reduceMode ?? '—',
    llmErrors: stats.llmErrors ?? 0,
    parents,
    leaves,
    orphan,
  };
}

const rows = cells.map((cell) => {
  const dir = join(evalRoot, cell);
  return {
    cell,
    discover: discoverMetrics(dir),
    classify: classifyMetrics(dir),
    quality: classifyQuality(dir),
  };
});

const lines = [
  '# Discover eval compare',
  '',
  `Root: \`${evalRoot}\``,
  '',
  '## Discover (primary)',
  '',
  '| Cell | raw→new parents | raw leaves | new leaves | kept% | tax leaves | orphan | reduce | mode |',
  '|------|-----------------|------------|------------|-------|------------|--------|--------|------|',
];

for (const r of rows) {
  const d = r.discover;
  const parentCol =
    d.proposedParentsRaw !== '—'
      ? `${d.proposedParentsRaw}→${d.newParents}`
      : `${d.newParents}`;
  const reduceCol =
    d.reduceLeafCalls !== '—' && d.reduceLeafCalls !== 0
      ? `${d.reduceCalls}+${d.reduceLeafCalls}`
      : String(d.reduceCalls);
  lines.push(
    `| ${r.cell} | ${parentCol} | ${d.proposedLeavesRaw} | ${d.newLeaves} | ${d.leavesKeptPct} | ${d.leaves} | ${d.orphan} | ${reduceCol} | ${d.reduceMode} |`
  );
}

lines.push(
  '',
  '## Classify counts (not equal quality)',
  '',
  '| Cell | specific | general | unassigned | pending_discover | assignedPrimary |',
  '|------|----------|---------|------------|------------------|-----------------|'
);

for (const r of rows) {
  const c = r.classify;
  lines.push(
    `| ${r.cell} | ${c.classifiedSpecific} | ${c.classified_general} | ${c.unassigned} | ${c.pending_discover} | ${c.assignedPrimary} |`
  );
}

lines.push(
  '',
  '## Classify quality (from classify-state.jsonl + llmReview.confidence)',
  '',
  '| Cell | % specific | % any primary | avg conf (specific) | avg conf (assigned) | % specific conf≥0.85 |',
  '|------|------------|---------------|---------------------|---------------------|---------------------|'
);

for (const r of rows) {
  const q = r.quality;
  if (!q) {
    lines.push(`| ${r.cell} | — | — | — | — | — |`);
    continue;
  }
  lines.push(
    `| ${r.cell} | ${q.specificPct} | ${q.assignedPct} | ${q.avgConfSpecific} | ${q.avgConfAssigned} | ${q.highConfSpecificPct} |`
  );
}

lines.push(
  '',
  '## Algorithm key',
  '',
  '| Prefix | Pipeline |',
  '|--------|----------|',
  '| **baseline** | Legacy discover (single call, full catalog) |',
  '| **candidate** | Map + single reduce |',
  '| **candidate-v2** | Map + per-parent reduce (strict leaf prune) |',
  '| **candidate-v3** | v2 + leaf floor / higher per-parent cap + backfill |',
  '',
  '## Notes',
  '',
  '- Counts alone mislead: **general** and low-confidence **specific** are weaker assignments.',
  '- Compare **% specific**, **avg conf (specific)**, and **% conf≥0.85** across arms.',
  '- MAP covers **full discover pool** by default (ceil(n/32) batches); pass `--max-batches` only to cap cost.',
  ''
);

writeFileSync(join(evalRoot, 'COMPARE.md'), lines.join('\n'));
console.error(`Wrote ${join(evalRoot, 'COMPARE.md')} (${cells.length} cells)`);
