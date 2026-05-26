#!/usr/bin/env node
/**
 * Backfill doc embeddings into backup (same plan as app embedBackfillPlan).
 *
 *   npm run embed-incremental -- --backup ~/Documents/testing/latest.json --dry-run
 *   npm run embed-incremental -- --backup ~/Documents/testing/latest.json --run-embed --max 50
 */

import { mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AiItemSignal } from '../../src/lib/categorization/types';
import type { Item } from '../../src/lib/db';
import type { ItemEnrichment } from '../../src/lib/enrichment/types';
import { DEFAULT_EMBEDDING_MODEL } from '../../src/lib/categorization/service';
import {
  buildEmbeddedSignal,
  buildEmbedFailedSignal,
  collectPendingEmbedRows,
  EMBED_BATCH_SIZE,
} from '../../src/lib/enrichment/embedBackfillPlan';
import { readBackupFile, resolveCliPath } from './lib/backupIndex.ts';
import { cliEmbeddingSettings, embedQueryTexts, loadEnvFile } from './lib/cliEmbed.ts';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');
const OUT_ROOT = join(REPO_ROOT, 'data', 'experiments', 'search');

function parseArgs(argv: string[]) {
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const opts = {
    backup: join(homedir(), 'Documents', 'testing', 'latest.json'),
    outDir: join(OUT_ROOT, `embed-${ts}`),
    dryRun: true,
    runEmbed: false,
    max: Infinity,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--backup') opts.backup = argv[++i];
    else if (a === '--out') opts.outDir = argv[++i];
    else if (a === '--max') opts.max = Number(argv[++i]) || opts.max;
    else if (a === '--dry-run') {
      opts.dryRun = true;
      opts.runEmbed = false;
    } else if (a === '--run-embed') {
      opts.runEmbed = true;
      opts.dryRun = false;
    }
  }
  return opts;
}

async function main() {
  loadEnvFile();
  const opts = parseArgs(process.argv.slice(2));
  const backupPath = resolveCliPath(opts.backup);
  const { raw, data } = readBackupFile(backupPath);

  const items = (data.items ?? []) as Item[];
  const enrichments = (data.item_enrichment ?? []) as ItemEnrichment[];
  const signals = [...((data.ai_item_signals ?? []) as AiItemSignal[])];
  const signalByItem = new Map(signals.map((s) => [s.itemId, s]));

  const { pending, summary } = await collectPendingEmbedRows(items, enrichments, signals, {
    max: opts.max,
  });

  console.log(
    `[embed-incremental] backup=${backupPath} core=src/lib/enrichment/embedBackfillPlan ai_ok=${summary.considered} to_embed=${summary.toEmbed} skipped_hash=${summary.skippedHash}`
  );

  mkdirSync(opts.outDir, { recursive: true });

  const outRows: Array<{ itemId: string; textHash: string; dim: number }> = [];
  let embedded = 0;
  let embedFailed = 0;

  if (opts.runEmbed && pending.length) {
    const settings = cliEmbeddingSettings();
    if (!settings.apiKey.trim()) {
      console.error('Missing OPENROUTER_API_KEY');
      process.exit(1);
    }

    for (let i = 0; i < pending.length && embedded < opts.max; i += EMBED_BATCH_SIZE) {
      const batch = pending.slice(i, i + EMBED_BATCH_SIZE).slice(0, opts.max - embedded);
      try {
        const vectors = await embedQueryTexts(batch.map((b) => b.text));
        for (let j = 0; j < batch.length; j++) {
          const row = batch[j];
          const nextSignal = buildEmbeddedSignal(row, vectors[j], DEFAULT_EMBEDDING_MODEL);
          signalByItem.set(row.itemId, nextSignal);
          outRows.push({ itemId: row.itemId, textHash: row.textHash, dim: nextSignal.embedding.length });
          embedded++;
        }
      } catch (err) {
        console.error('[embed-incremental] batch failed:', err instanceof Error ? err.message : err);
        for (const row of batch) {
          signalByItem.set(row.itemId, buildEmbedFailedSignal(row));
          embedFailed++;
        }
      }
    }
  }

  writeFileSync(
    join(opts.outDir, 'run-stats.json'),
    JSON.stringify(
      {
        at: Date.now(),
        backupPath,
        core: 'src/lib/enrichment/embedBackfillPlan',
        ...summary,
        embedded,
        embedFailed,
        dryRun: opts.dryRun,
      },
      null,
      2
    )
  );

  if (outRows.length) {
    writeFileSync(
      join(opts.outDir, 'embed-results.jsonl'),
      outRows.map((r) => JSON.stringify(r)).join('\n') + '\n'
    );
    const patched = {
      ...raw,
      data: {
        ...data,
        ai_item_signals: [...signalByItem.values()],
      },
    };
    writeFileSync(join(opts.outDir, 'backup-with-embeddings.json'), JSON.stringify(patched));
    console.log(`[embed-incremental] wrote backup-with-embeddings.json (${embedded} vectors)`);
  }

  console.log(`[embed-incremental] done embedded=${embedded} failed=${embedFailed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
