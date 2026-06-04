#!/usr/bin/env node
/**
 * Outcome breakdown for eval cells (good / bad / unclassified).
 * Usage: node scripts/categorize/summarize-eval-outcomes.mjs <eval-root> [cell ...]
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const evalRoot = process.argv[2];
const cellsArg = process.argv.slice(3);
if (!evalRoot) {
  console.error('Usage: node summarize-eval-outcomes.mjs <eval-root> [cell ...]');
  process.exit(1);
}

const LINK_QUALITY = new Set([
  'page-not-found',
  'enrich-fetch-failed',
  'placeholder-junk',
  'generic-low-signal',
  'social-no-topic',
  'seed_page-not-found',
  'seed_enrich-fetch-failed',
  'seed_placeholder-junk',
  'seed_generic-low-signal',
  'seed_social-no-topic',
]);

function isGeneral(id) {
  if (!id) return false;
  const l = id.toLowerCase();
  return l.endsWith('-general') || l.includes('other');
}

function leafKind(id) {
  if (!id) return 'unclassified';
  const raw = id.replace(/^seed_/, '');
  if (LINK_QUALITY.has(id) || LINK_QUALITY.has(raw)) return 'removal';
  if (isGeneral(id)) return 'general';
  return 'specific';
}

function bucketRow(row) {
  const st = row.classifyState;
  if (st === 'ineligible' || st === 'skipped') return 'ineligible';
  if (st === 'classified_removal') return 'removal';
  const pid = row.primaryCategoryId;
  const kind = leafKind(pid);
  if (kind === 'removal') return 'removal';
  if (kind === 'specific') return 'specific';
  if (kind === 'general') return 'general';
  if (st === 'pending_discover') return 'unclassified';
  return 'unclassified';
}

function listCells(root) {
  if (cellsArg.length) return cellsArg;
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'classify', 'classify-state.jsonl')))
    .map((d) => d.name)
    .sort();
}

function loadRows(cell) {
  const path = join(evalRoot, cell, 'classify', 'classify-state.jsonl');
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

for (const cell of listCells(evalRoot)) {
  const rows = loadRows(cell);
  const counts = { specific: 0, general: 0, removal: 0, unclassified: 0, ineligible: 0 };
  const examples = { specific: [], general: [], removal: [], unclassified: [], ineligible: [] };

  for (const row of rows) {
    const b = bucketRow(row);
    counts[b]++;
    const short = (row.itemId || '').split('/').pop() || row.itemId;
    const ex = examples[b];
    if (ex.length < 8) {
      ex.push({
        short,
        state: row.classifyState,
        leaf: row.primaryCategoryId,
        reason: row.llmReview?.reason?.slice(0, 70),
      });
    }
  }

  const eligible = rows.length - counts.ineligible;
  console.log(`\n## ${cell} (n=${rows.length}, eligible=${eligible})\n`);
  console.log('| Bucket | Count | % of corpus | % eligible |');
  for (const [k, v] of Object.entries(counts)) {
    console.log(
      `| ${k} | ${v} | ${Math.round((100 * v) / rows.length)}% | ${eligible ? Math.round((100 * v) / eligible) : '—'}% |`
    );
  }
  console.log('\n**Good (specific topic):**', counts.specific);
  console.log(
    '**Bad / removal bucket:**',
    counts.removal,
    '+ ineligible',
    counts.ineligible,
    '(enrich failed)'
  );
  console.log('**Still unclassified:**', counts.unclassified, '(no primary)');
  console.log('**Broad general:**', counts.general);

  for (const [k, ex] of Object.entries(examples)) {
    if (!ex.length) continue;
    console.log(`\n### Sample ${k}`);
    for (const e of ex) {
      console.log(`- ${e.short} · ${e.state} · ${e.leaf || '—'} · ${e.reason || ''}`);
    }
  }
}
