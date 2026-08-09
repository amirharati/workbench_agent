#!/usr/bin/env node
/**
 * Task 04 — hybrid search eval (uses src/lib/search/* — same core as app).
 *
 *   npm run search-eval -- --dry-run
 *   npm run search-eval -- --backup ~/Documents/testing/latest.json
 *   npm run search-eval -- --backup ~/Documents/testing/latest.json --run-embed
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadPipelineCorpus } from '../categorize/lib/corpus.mjs';
import { hybridSearch } from '../../src/lib/search/hybridSearch';
import { parseSearchQuery } from '../../src/lib/search/queryLanguage';
import { extractSearchRelated } from '../../src/lib/search/searchRelated';
import { mergeWeights } from '../../src/lib/search/ranking';
import { searchIndexStats } from '../../src/lib/search/categoryCentroids';
import { loadIndexFromBackupFile, loadIndexFromCorpusPayload } from './lib/backupIndex.ts';
import { cliEmbeddingSettings, embedSingleQuery, loadEnvFile } from './lib/cliEmbed.ts';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');
const SEARCH_EXPERIMENTS = join(REPO_ROOT, 'data', 'experiments', 'search');
const DEFAULT_QUERIES = join(SEARCH_EXPERIMENTS, 'queries-v1.json');
const DEFAULT_BACKUP = join(homedir(), 'Documents', 'testing', 'latest.json');
const DEFAULT_AI_EVAL = join(
  REPO_ROOT,
  'data/experiments/enrich-fetch/ai-eval-2026-05-25T01-53-38/results-v2.jsonl'
);

interface QueryRow {
  id: string;
  text: string;
  intent?: string;
  filters?: import('../../src/lib/search/types').SearchFilters;
}

function parseArgs(argv: string[]) {
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const opts = {
    backup: null as string | null,
    corpora: ['2026-05-21T02-02-56', '2026-05-21T03-03-24'],
    aiEval: DEFAULT_AI_EVAL,
    queries: DEFAULT_QUERIES,
    outDir: join(SEARCH_EXPERIMENTS, `eval-${ts}`),
    dryRun: true,
    runEmbed: false,
    limit: 10,
    mode: 'both' as 'both' | 'hybrid' | 'lexical-only',
    withRelated: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--backup') opts.backup = argv[++i];
    else if (a === '--corpus') {
      opts.corpora = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--ai-eval') opts.aiEval = argv[++i];
    else if (a === '--queries') opts.queries = argv[++i];
    else if (a === '--out') opts.outDir = argv[++i];
    else if (a === '--limit') opts.limit = Number(argv[++i]) || opts.limit;
    else if (a === '--dry-run') {
      opts.dryRun = true;
      opts.runEmbed = false;
    } else if (a === '--run-embed') {
      opts.runEmbed = true;
      opts.dryRun = false;
    } else if (a === '--mode') opts.mode = (argv[++i] as typeof opts.mode) || opts.mode;
    else if (a === '--with-related') opts.withRelated = true;
  }

  return opts;
}

function loadQueries(path: string): QueryRow[] {
  if (!existsSync(path)) {
    console.error(`Query set not found: ${path}`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { queries?: QueryRow[] } | QueryRow[];
  return Array.isArray(raw) ? raw : (raw.queries ?? []);
}

function summarizeRun(label: string, rows: Array<{ results: unknown[] }>) {
  const withHits = rows.filter((r) => r.results.length > 0).length;
  return {
    label,
    queries: rows.length,
    coverage: rows.length ? withHits / rows.length : 0,
    avgTopScore:
      rows.reduce(
        (acc, r) =>
          acc +
          ((r.results[0] as { breakdown?: { finalScore?: number } })?.breakdown?.finalScore ?? 0),
        0
      ) / Math.max(1, rows.length),
  };
}

async function main() {
  loadEnvFile();
  const opts = parseArgs(process.argv.slice(2));
  const queries = loadQueries(opts.queries);

  let index;
  let source: string;
  let kind: string;

  if (opts.backup) {
    const loaded = loadIndexFromBackupFile(opts.backup);
    index = loaded.index;
    source = loaded.path;
    kind = 'backup';
  } else {
    const { items } = loadPipelineCorpus({
      corpora: opts.corpora,
      aiEvalJsonl: opts.aiEval,
    });

    index = loadIndexFromCorpusPayload({
      items: items.map((row) => ({
        id: row.itemId,
        title: row.title ?? '',
        url: row.url ?? '',
        tags: row.enrichmentAiTags ?? [],
        notes: row.notes ?? '',
        collectionIds: [],
        created_at: Date.now(),
        updated_at: Date.now(),
        source: 'corpus',
      })),
      item_enrichment: items.map((row) => ({
        itemId: row.itemId,
        aiStatus: row.aiSummary ? 'ok' : undefined,
        summary: row.aiSummary ?? '',
        aiKeyPoints: row.aiKeyPoints ?? [],
        aiTags: row.enrichmentAiTags ?? [],
        sourceKind: row.sourceKind,
        updated_at: Date.now(),
      })),
    });
    source = `corpus:${opts.corpora.join(',')}`;
    kind = 'corpus';
  }

  const stats = searchIndexStats(index);
  console.log(
    `[search-eval] source=${source} kind=${kind} docs=${stats.documents} embeddings=${stats.withEmbeddings} categories=${index.categories.length} queries=${queries.length}`
  );

  const canEmbed = opts.runEmbed && cliEmbeddingSettings().apiKey.trim();
  mkdirSync(opts.outDir, { recursive: true });

  const modes =
    opts.mode === 'both' ? (['lexical-only', 'hybrid'] as const) : ([opts.mode] as const);
  const allRows: unknown[] = [];
  const summaries = [];

  for (const mode of modes) {
    const modeRows = [];
    for (const q of queries) {
      const parsedQuery = parseSearchQuery(q.text);
      let queryEmbedding: number[] | undefined;
      if (mode === 'hybrid' && canEmbed && parsedQuery.semanticText) {
        queryEmbedding = await embedSingleQuery(parsedQuery.semanticText);
      }

      const result = hybridSearch(index, {
        query: q.text,
        limit: opts.limit,
        mode,
        queryEmbedding,
        filters: q.filters,
      });

      const related = opts.withRelated
        ? extractSearchRelated(index, result, {
            queryEmbedding,
            filters: q.filters,
            parsedQuery,
          })
        : undefined;

      modeRows.push({
        id: q.id,
        text: q.text,
        intent: q.intent,
        mode,
        embeddingPathUsed: result.embeddingPathUsed,
        matchedCategoryIds: result.matchedCategoryIds,
        results: result.results.map((r) => ({
          itemId: r.itemId,
          title: r.title,
          url: r.url,
          domain: r.domain,
          primaryCategoryName: r.primaryCategoryName,
          breakdown: r.breakdown,
        })),
        related,
      });
    }

    allRows.push(...modeRows);
    summaries.push(summarizeRun(mode, modeRows));
  }

  const payloadHash = createHash('sha256')
    .update(JSON.stringify({ source, weights: mergeWeights(), core: 'src/lib/search' }))
    .digest('hex')
    .slice(0, 12);

  writeFileSync(
    join(opts.outDir, 'results.jsonl'),
    allRows.map((r) => JSON.stringify(r)).join('\n') + '\n'
  );
  writeFileSync(
    join(opts.outDir, 'run-stats.json'),
    JSON.stringify(
      {
        at: Date.now(),
        source,
        kind,
        core: 'src/lib/search',
        ...stats,
        queries: queries.length,
        embedUsed: Boolean(canEmbed),
        withRelated: opts.withRelated,
        payloadHash,
        summaries,
      },
      null,
      2
    )
  );

  const md = [
    '# Search eval summary',
    '',
    `- Core: \`src/lib/search/*\` (same as app)`,
    `- Source: \`${source}\` (${kind})`,
    `- Documents: ${stats.documents}`,
    `- With embeddings: ${stats.withEmbeddings}`,
    `- Queries: ${queries.length}`,
    `- Embedding path: ${canEmbed ? 'on' : 'off (lexical + category only)'}`,
    '',
    '## Mode comparison',
    '',
    ...summaries.map(
      (s) =>
        `- **${s.label}**: coverage ${(s.coverage * 100).toFixed(0)}% · avg top score ${s.avgTopScore.toFixed(3)}`
    ),
    '',
    '## Sample results',
    '',
  ];

  for (const q of queries.slice(0, 5)) {
    const hybridRow = allRows.find(
      (r) => (r as { id: string; mode: string }).id === q.id && (r as { mode: string }).mode === 'hybrid'
    ) as { results?: Array<{ title: string; breakdown: { finalScore: number; lexical: number; embedding: number; category: number } }> } | undefined;
    const top = hybridRow?.results?.[0];
    md.push(`### ${q.id}: ${q.text}`);
    if (top) {
      md.push(`- Top: **${top.title}** (score ${top.breakdown.finalScore.toFixed(3)})`);
      md.push(
        `  lexical=${top.breakdown.lexical.toFixed(2)} emb=${top.breakdown.embedding.toFixed(2)} cat=${top.breakdown.category.toFixed(2)}`
      );
    } else {
      md.push('- No results');
    }
    md.push('');
  }

  writeFileSync(join(opts.outDir, 'SUMMARY.md'), md.join('\n'));
  console.log(`[search-eval] wrote ${opts.outDir}`);
  for (const s of summaries) {
    console.log(`  ${s.label}: coverage=${(s.coverage * 100).toFixed(0)}% avgTop=${s.avgTopScore.toFixed(3)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
