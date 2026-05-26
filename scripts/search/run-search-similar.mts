#!/usr/bin/env node
/**
 * Find similar bookmarks for one item (same core as app runAppFindSimilar).
 *
 *   npm run search-similar -- --backup ~/Documents/testing/latest.json --item-id <uuid>
 *   npm run search-similar -- --backup ~/Documents/testing/latest.json --item-id <uuid> --limit 20
 */

import { mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { findSimilarItems } from '../../src/lib/search/findSimilar';
import { buildSearchEmbedText } from '../../src/lib/enrichment/searchEmbedText';
import type { Item } from '../../src/lib/db';
import type { ItemEnrichment } from '../../src/lib/enrichment/types';
import { loadIndexFromBackupFile, readBackupFile } from './lib/backupIndex.ts';
import { embedSingleQuery, loadEnvFile } from './lib/cliEmbed.ts';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');
const OUT_ROOT = join(REPO_ROOT, 'data', 'experiments', 'search');

function parseArgs(argv: string[]) {
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const opts = {
    backup: join(homedir(), 'Documents', 'testing', 'latest.json'),
    itemId: '',
    limit: 15,
    domain: '',
    outDir: join(OUT_ROOT, `similar-${ts}`),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--backup') opts.backup = argv[++i];
    else if (a === '--item-id') opts.itemId = argv[++i];
    else if (a === '--limit') opts.limit = Number(argv[++i]) || opts.limit;
    else if (a === '--domain') opts.domain = argv[++i];
    else if (a === '--out') opts.outDir = argv[++i];
  }
  return opts;
}

async function main() {
  loadEnvFile();
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.itemId) {
    console.error('Usage: npm run search-similar -- --backup <path> --item-id <id>');
    process.exit(1);
  }

  const { index, path: source } = loadIndexFromBackupFile(opts.backup);
  const filters = opts.domain.trim() ? { domain: opts.domain.trim() } : undefined;

  let result = findSimilarItems(index, {
    itemId: opts.itemId,
    limit: opts.limit,
    filters,
  });

  if (!result.results.length && !result.anchorHasEmbedding) {
    const anchor = index.documents.find((d) => d.itemId === opts.itemId);
    if (anchor) {
      const { data } = readBackupFile(opts.backup);
      const items = (data.items ?? []) as Item[];
      const enrichments = (data.item_enrichment ?? []) as ItemEnrichment[];
      const item = items.find((i) => i.id === opts.itemId);
      const enrichment = enrichments.find((e) => e.itemId === opts.itemId);
      const embedText = item ? buildSearchEmbedText(item, enrichment) : anchor.title;
      const queryEmbedding = await embedSingleQuery(embedText);
      if (queryEmbedding?.length) {
        const patchedDocs = index.documents.map((d) =>
          d.itemId === opts.itemId ? { ...d, embedding: queryEmbedding } : d
        );
        result = findSimilarItems(
          { ...index, documents: patchedDocs },
          { itemId: opts.itemId, limit: opts.limit, filters }
        );
        result = { ...result, anchorHasEmbedding: true };
      }
    }
  }

  mkdirSync(opts.outDir, { recursive: true });
  writeFileSync(join(opts.outDir, 'similar.json'), JSON.stringify({ source, ...result }, null, 2));

  console.log(`[search-similar] anchor="${result.anchorTitle}" hasEmbed=${result.anchorHasEmbedding}`);
  console.log(`[search-similar] ${result.results.length} results (of ${result.totalCandidates} candidates)`);
  for (const [i, row] of result.results.entries()) {
    console.log(
      `  ${i + 1}. ${row.title.slice(0, 72)} (${row.breakdown.finalScore.toFixed(3)}) [${row.sources.join('+')}]`
    );
  }
  console.log(`[search-similar] wrote ${opts.outDir}/similar.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
