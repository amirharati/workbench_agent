#!/usr/bin/env node
/**
 * Analyze an in-app pipeline run export (backup folder or downloaded bundle).
 *
 *   node scripts/pipeline/analyze-app-run.mjs path/to/pipeline-runs/app-.../
 *   node scripts/pipeline/analyze-app-run.mjs path/to/pipeline-run-....json
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadExport(inputPath) {
  if (inputPath.endsWith('.json') && !inputPath.endsWith('summary.json')) {
    const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
    if (raw.results && raw.meta) return raw;
    if (raw.meta && raw.counts) {
      const jsonlPath = join(dirname(inputPath), 'results.jsonl');
      if (existsSync(jsonlPath)) {
        const results = readFileSync(jsonlPath, 'utf8')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => JSON.parse(l));
        return { ...raw, results };
      }
    }
    throw new Error('Unrecognized JSON bundle shape');
  }

  const dir = inputPath.endsWith('/') ? inputPath.slice(0, -1) : inputPath;
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const counts = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  const batchPath = join(dir, 'batch.json');
  const batch = existsSync(batchPath) ? JSON.parse(readFileSync(batchPath, 'utf8')) : undefined;
  const results = readFileSync(join(dir, 'results.jsonl'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  return { meta, counts, batch, results };
}

function bump(map, key) {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
}

function topEntries(map, n = 12) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function analyze(exported) {
  const lines = [];
  const push = (s = '') => lines.push(s);
  const { meta, counts, results, batch } = exported;

  push('# App pipeline run analysis (CLI)');
  push('');
  push(`- Run: \`${meta.runId}\``);
  push(`- Kind: **${meta.kind}**`);
  push(`- Items: **${meta.itemCount ?? results.length}**`);
  push(`- Window: ${meta.startedAt} → ${meta.finishedAt}`);
  if (batch?.message) push(`- Batch: ${batch.message}`);
  push('');

  push('## Totals');
  push('');
  push(`- enrich ok: **${counts.enrichOk ?? 0}**`);
  push(`- enrich failed: **${counts.enrichFailed ?? 0}**`);
  push(`- enrich skipped: **${counts.enrichSkipped ?? 0}**`);
  push('');

  for (const [title, map] of [
    ['Fetch route (ok): tab vs headless', counts.fetchRoute ?? {}],
    ['Record kind: record vs review vs failed', counts.recordKind ?? {}],
    ['Fetch source (ok)', counts.fetchBySource ?? {}],
    ['Fetch error codes', counts.fetchErrors ?? {}],
    ['Failure categories', counts.failureCategories ?? {}],
    ['AI status', counts.aiStatus ?? {}],
    ['Classify state', counts.classifyState ?? {}],
    ['Run outcomes', counts.runOutcomes ?? {}],
  ]) {
    if (!Object.keys(map).length) continue;
    push(`## ${title}`);
    push('');
    for (const [k, v] of topEntries(map)) push(`- ${k}: ${v}`);
    push('');
  }

  const failedRows = results.filter((r) => r.enrich?.status === 'failed');
  if (failedRows.length) {
    push('## Failed URLs (sample)');
    push('');
    for (const row of failedRows.slice(0, 40)) {
      push(
        `- \`${row.host}\` — ${row.enrich.lastErrorCode ?? '?'} — ${(row.enrich.lastErrorDetail ?? row.enrich.failureLabel ?? '').slice(0, 120)}`
      );
      push(`  ${row.url}`);
    }
    if (failedRows.length > 40) push(`- … and ${failedRows.length - 40} more`);
    push('');
  }

  const byHost = {};
  for (const row of results) {
    if (row.enrich?.status !== 'failed') continue;
    bump(byHost, row.host);
  }
  if (Object.keys(byHost).length) {
    push('## Failed hosts');
    push('');
    for (const [k, v] of topEntries(byHost)) push(`- ${k}: ${v}`);
    push('');
  }

  return lines.join('\n');
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/pipeline/analyze-app-run.mjs <run-dir-or-bundle.json>');
    process.exit(1);
  }
  if (!existsSync(input)) {
    console.error(`Not found: ${input}`);
    process.exit(1);
  }

  const exported = loadExport(input);
  const md = analyze(exported);
  console.log(md);

  const outDir = input.endsWith('.json') ? dirname(input) : input;
  const outPath = join(outDir, 'analysis-cli.md');
  try {
    writeFileSync(outPath, md);
    console.error(`\nWrote ${outPath}`);
  } catch {
    /* read-only or bundle-only */
  }
}

main();
