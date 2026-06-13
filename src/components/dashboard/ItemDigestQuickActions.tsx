import React from 'react';
import type { ItemEnrichment } from '../../lib/enrichment/types';
import { shouldOfferTabSessionFetch } from '../../lib/enrichment/tabSessionExtract';
import type { ItemPipelineContext } from '../../lib/pipeline/itemPipelineContext';
import { resolvePipelineStage, type PipelineMissingStep } from '../../lib/pipeline/pipelineStage';
import type { PipelineBadge } from '../../lib/pipeline';
import { usePipelineProgress } from './PipelineProgressProvider';

const actionBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'var(--bg-glass)',
  color: 'var(--text)',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  ...actionBtnStyle,
  background: 'transparent',
  color: 'var(--text-muted)',
};

function missingStepLabel(steps: PipelineMissingStep[]): string {
  const hasEmbed = steps.includes('embed');
  const hasClassify = steps.includes('classify');
  if (hasEmbed && hasClassify) return 'Embed+classify';
  if (hasEmbed) return 'Embed';
  if (hasClassify) return 'Classify';
  return 'Pipeline';
}

export interface ItemDigestQuickActionsProps {
  itemId: string;
  itemUrl?: string;
  context?: ItemPipelineContext | null;
  badge?: PipelineBadge | null;
  enrichment?: ItemEnrichment | null;
  onDone?: () => void;
}

export const ItemDigestQuickActions: React.FC<ItemDigestQuickActionsProps> = ({
  itemId,
  itemUrl,
  context,
  badge,
  enrichment,
  onDone,
}) => {
  const pipeline = usePipelineProgress();
  const running = pipeline.isRunning;
  const stage = context ? resolvePipelineStage(context) : null;
  const missing = stage?.missing ?? [];

  const showTabFetch =
    !!itemUrl &&
    shouldOfferTabSessionFetch(itemUrl, enrichment ?? null, badge?.kind ?? null);

  const showActions =
    !!itemUrl &&
    (badge?.kind === 'failed' ||
      badge?.kind === 'not_processed' ||
      badge?.label === 'Pending classify' ||
      badge?.kind === 'ready' ||
      missing.length > 0 ||
      stage?.level === 'summarized');

  if (!showActions) return null;

  const primaryLabel =
    badge?.kind === 'failed'
      ? 'Retry digest'
      : badge?.label === 'Pending classify'
        ? 'Classify now'
        : badge?.kind === 'ready' || stage?.level === 'summarized'
          ? 'Re-digest'
          : 'Run digest';

  const after = () => {
    onDone?.();
  };

  const isRedigest =
    primaryLabel === 'Re-digest' || primaryLabel === 'Retry digest';

  const runFull = async (opts?: { forceEnrich?: boolean; tabSessionOnly?: boolean }) => {
    if (running) return;
    try {
      await pipeline.runSingle(itemId, {
        title: opts?.tabSessionOnly ? 'Fetch in browser' : primaryLabel,
        forceEnrich:
          opts?.forceEnrich ??
          (isRedigest || badge?.kind === 'failed' || opts?.tabSessionOnly === true),
        forceReclassify: isRedigest || badge?.kind === 'failed',
        tabSessionOnly: opts?.tabSessionOnly,
        itemLabel: context?.item.title || itemUrl || itemId,
      });
      after();
    } catch {
      /* modal */
    }
  };

  const runMissingSteps = async () => {
    if (running || missing.length === 0) return;
    const title = missingStepLabel(missing);
    try {
      if (missing.includes('embed') && !missing.includes('classify')) {
        await pipeline.runEmbedBatch([itemId], { title });
        after();
        return;
      }
      await pipeline.runBatch([itemId], {
        title,
        enrich: false,
        classify: true,
        processAll: true,
        forceReclassify: true,
        collectItemResults: true,
        skipDiscover: true,
        drainPendingClassifyQueue: false,
        itemLabels: {
          [itemId]: context?.item.title || itemUrl || itemId,
        },
      });
      after();
    } catch {
      /* modal */
    }
  };

  const showMissingButton = missing.length > 0 && stage?.level === 'summarized';

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
      <button
        type="button"
        onClick={() => void runFull({ forceEnrich: badge?.kind === 'failed' })}
        disabled={running}
        style={{
          ...actionBtnStyle,
          cursor: running ? 'wait' : 'pointer',
          opacity: running ? 0.7 : 1,
        }}
      >
        {running ? 'Working…' : primaryLabel}
      </button>
      {showMissingButton ? (
        <button
          type="button"
          onClick={() => void runMissingSteps()}
          disabled={running}
          title={formatImportSchemaHelpForMissing(missing)}
          style={{
            ...secondaryBtnStyle,
            cursor: running ? 'wait' : 'pointer',
            opacity: running ? 0.7 : 1,
          }}
        >
          {missingStepLabel(missing)}
        </button>
      ) : null}
      {showTabFetch ? (
        <button
          type="button"
          onClick={() => void runFull({ tabSessionOnly: true, forceEnrich: true })}
          disabled={running}
          title="Open in Chrome and read the page (skips headless fetch)"
          style={{
            ...secondaryBtnStyle,
            cursor: running ? 'wait' : 'pointer',
            opacity: running ? 0.7 : 1,
          }}
        >
          Fetch in browser
        </button>
      ) : null}
    </div>
  );
};

function formatImportSchemaHelpForMissing(missing: PipelineMissingStep[]): string {
  if (missing.includes('embed') && missing.includes('classify')) {
    return 'Run search embedding and AI categories without re-fetching the page';
  }
  if (missing.includes('embed')) return 'Build search embedding from existing summary';
  return 'Assign AI categories from existing summary';
}
