#!/usr/bin/env node
/**
 * Compare CLI fetch reference vs app pipeline run (same URLs).
 *
 *   npm run pipeline-compare -- \
 *     data/experiments/enrich-fetch/a1-2026-05-30T22-fetch-400 \
 *     /path/to/backup/pipeline-runs/app-2026-...
 *
 * Writes compare.md + compare.tsv in the app run folder (or cwd).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadCliResults(dir) {
  const path = join(dir, 'results.jsonl');
  const rows = readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const byUrl = new Map();
  for (const row of rows) {
    byUrl.set(normalizeUrl(row.url), row);
  }
  return { rows, byUrl, dir };
}

function loadAppResults(inputPath) {
  let dir = inputPath;
  if (inputPath.endsWith('.json') && !inputPath.endsWith('summary.json')) {
    const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
    if (raw.results) {
      const byUrl = new Map();
      for (const row of raw.results) byUrl.set(normalizeUrl(row.url), row);
      return { rows: raw.results, byUrl, dir: dirname(inputPath) };
    }
    dir = dirname(inputPath);
  }
  if (dir.endsWith('/')) dir = dir.slice(0, -1);
  const jsonl = join(dir, 'results.jsonl');
  const rows = readFileSync(jsonl, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const byUrl = new Map();
  for (const row of rows) byUrl.set(normalizeUrl(row.url), row);
  return { rows, byUrl, dir };
}

function normalizeUrl(url) {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    if (u.pathname.endsWith('/') && u.pathname.length > 1) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.href;
  } catch {
    return url.trim();
  }
}

function attemptMap(row) {
  const m = {};
  for (const a of row.attempts ?? []) {
    m[a.provider] = a;
  }
  return m;
}

function usableFlag(a) {
  if (!a) return '';
  return a.usable ? 'Y' : 'N';
}

function cliAnyUsable(row) {
  return (row.attempts ?? []).some((a) => a.usable);
}

function cliTabUsable(row) {
  return (row.attempts ?? []).some((a) => a.provider === 'tab' && a.usable);
}

function cliHeadlessUsable(row) {
  return (row.attempts ?? []).some(
    (a) => ['local', 'jina', 'markdown-new'].includes(a.provider) && a.usable
  );
}

function appOk(row) {
  return row.enrich?.status === 'ok';
}

function appRecordKind(row) {
  if (row.recordKind) return row.recordKind;
  const st = row.enrich?.status;
  if (st === 'failed') return 'failed';
  if (st === 'skipped') return 'skipped';
  if (st === 'ok') return row.enrich?.pendingFetchReview ? 'review' : 'record';
  return 'none';
}

function appFetchRoute(row) {
  if (row.fetchRoute) return row.fetchRoute;
  const src = row.enrich?.fetchSourceId;
  if (src === 'tab-session') return 'tab';
  if (['local', 'jina', 'markdown-new', 'hybrid', 'syndication'].includes(src)) return 'headless';
  return 'other';
}

function parityLabel(cliRow, appRow) {
  if (!cliRow && !appRow) return 'missing_both';
  if (!cliRow) return 'app_only';
  if (!appRow) return 'cli_only';
  const cliAny = cliAnyUsable(cliRow);
  const app = appOk(appRow);
  if (cliAny && app) return 'match_ok';
  if (!cliAny && !app) return 'match_fail';
  if (cliAny && !app) return 'app_worse';
  return 'app_better';
}

function bump(map, key) {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
}

function compare(cli, app) {
  const urls = new Set([...cli.byUrl.keys(), ...app.byUrl.keys()]);
  const rows = [];
  const stats = {
    total: 0,
    overlap: 0,
    parity: {},
    cliAnyUsable: 0,
    cliTabUsable: 0,
    cliHeadlessUsable: 0,
    appOk: 0,
    appTab: 0,
    appHeadless: 0,
    appRecord: 0,
    appReview: 0,
    appFailed: 0,
  };

  for (const url of [...urls].sort()) {
    const cliRow = cli.byUrl.get(url);
    const appRow = app.byUrl.get(url);
    stats.total++;
    if (cliRow && appRow) stats.overlap++;

    if (cliRow) {
      if (cliAnyUsable(cliRow)) stats.cliAnyUsable++;
      if (cliTabUsable(cliRow)) stats.cliTabUsable++;
      if (cliHeadlessUsable(cliRow)) stats.cliHeadlessUsable++;
    }
    if (appRow) {
      if (appOk(appRow)) stats.appOk++;
      const route = appFetchRoute(appRow);
      if (route === 'tab') stats.appTab++;
      if (route === 'headless') stats.appHeadless++;
      const kind = appRecordKind(appRow);
      if (kind === 'record') stats.appRecord++;
      if (kind === 'review') stats.appReview++;
      if (kind === 'failed') stats.appFailed++;
    }

    const p = parityLabel(cliRow, appRow);
    bump(stats.parity, p);

    const attempts = cliRow ? attemptMap(cliRow) : {};
    rows.push({
      url,
      host: cliRow?.host ?? appRow?.host ?? '',
      cli_local: usableFlag(attempts.local),
      cli_jina: usableFlag(attempts.jina),
      cli_tab: usableFlag(attempts.tab),
      cli_any: cliRow ? (cliAnyUsable(cliRow) ? 'Y' : 'N') : '',
      app_status: appRow?.enrich?.status ?? '',
      app_fetchRoute: appRow ? appFetchRoute(appRow) : '',
      app_fetchSource: appRow?.enrich?.fetchSourceId ?? '',
      app_recordKind: appRow ? appRecordKind(appRow) : '',
      app_error: appRow?.enrich?.lastErrorCode ?? '',
      app_ai: appRow?.enrich?.aiStatus ?? '',
      parity: p,
    });
  }

  return { rows, stats, cliDir: cli.dir, appDir: app.dir };
}

function toMarkdown(result) {
  const { stats, cliDir, appDir } = result;
  const lines = [];
  const push = (s = '') => lines.push(s);

  push('# CLI reference vs app run');
  push('');
  push(`- CLI: \`${cliDir}\``);
  push(`- App: \`${appDir}\``);
  push(`- URLs compared: **${stats.total}** (overlap **${stats.overlap}**)`);
  push('');

  push('## Fetch path: tab vs headless');
  push('');
  push('### CLI reference (per-provider usable flags)');
  push('');
  push(`- any provider usable: **${stats.cliAnyUsable}**`);
  push(`- tab usable: **${stats.cliTabUsable}**`);
  push(`- headless (local/jina/md) usable: **${stats.cliHeadlessUsable}**`);
  push('');
  push('### App run');
  push('');
  push(`- enrich ok: **${stats.appOk}**`);
  push(`- won via **tab** route: **${stats.appTab}**`);
  push(`- won via **headless** route: **${stats.appHeadless}**`);
  push('');

  push('## Record kind: saved vs review vs failed');
  push('');
  push(`- **record** (ok, normal save): **${stats.appRecord}**`);
  push(`- **review** (ok but pendingFetchReview — kept prior summary): **${stats.appReview}**`);
  push(`- **failed**: **${stats.appFailed}**`);
  push('');

  push('## Parity (CLI any-usable vs app ok)');
  push('');
  push('- **match_ok** = CLI had usable body and app ok');
  push('- **match_fail** = neither usable');
  push('- **app_worse** = CLI usable but app failed');
  push('- **app_better** = app ok but CLI had no usable provider');
  push('');
  for (const [k, v] of Object.entries(stats.parity).sort((a, b) => b[1] - a[1])) {
    push(`- ${k}: **${v}**`);
  }
  push('');

  const mismatches = result.rows.filter((r) => r.parity === 'app_worse' || r.parity === 'app_better');
  if (mismatches.length) {
    push('## Mismatches (sample)');
    push('');
    for (const r of mismatches.slice(0, 50)) {
      push(
        `- **${r.parity}** \`${r.host}\` — CLI local/jina/tab=${r.cli_local}/${r.cli_jina}/${r.cli_tab} · app ${r.app_status} ${r.app_fetchRoute}/${r.app_fetchSource} · ${r.app_error || r.app_recordKind}`
      );
      push(`  ${r.url}`);
    }
    if (mismatches.length > 50) push(`- … ${mismatches.length - 50} more in compare.tsv`);
    push('');
  }

  return lines.join('\n');
}

function toTsv(result) {
  const cols = [
    'url',
    'host',
    'cli_local',
    'cli_jina',
    'cli_tab',
    'cli_any',
    'app_status',
    'app_fetchRoute',
    'app_fetchSource',
    'app_recordKind',
    'app_error',
    'app_ai',
    'parity',
  ];
  const esc = (v) => String(v ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
  const lines = [cols.join('\t')];
  for (const r of result.rows) {
    lines.push(cols.map((c) => esc(r[c])).join('\t'));
  }
  return lines.join('\n') + '\n';
}

function main() {
  const cliPath = process.argv[2];
  const appPath = process.argv[3];
  if (!cliPath || !appPath) {
    console.error(
      'Usage: npm run pipeline-compare -- <cli-experiment-dir> <app-pipeline-run-dir>'
    );
    process.exit(1);
  }
  if (!existsSync(cliPath) || !existsSync(appPath)) {
    console.error('Both paths must exist');
    process.exit(1);
  }

  const cli = loadCliResults(cliPath.endsWith('results.jsonl') ? dirname(cliPath) : cliPath);
  const app = loadAppResults(appPath);
  const result = compare(cli, app);
  const md = toMarkdown(result);
  const tsv = toTsv(result);

  console.log(md);

  const outDir = app.dir;
  const mdPath = join(outDir, 'compare-cli.md');
  const tsvPath = join(outDir, 'compare-cli.tsv');
  writeFileSync(mdPath, md);
  writeFileSync(tsvPath, tsv);
  console.error(`\nWrote ${mdPath}`);
  console.error(`Wrote ${tsvPath}`);
}

main();
