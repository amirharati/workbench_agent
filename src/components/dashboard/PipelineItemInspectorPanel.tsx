import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Sparkles,
  Tags,
  X,
  Database,
  Layers,
  Bookmark,
  type LucideIcon,
} from 'lucide-react';
import type { Collection, Item } from '../../lib/db';
import {
  AI_STATUS_HINTS,
  clearItemPipelineStage,
  describeAiFailure,
  ensureItemEmbedding,
  formatEnrichmentFailureMessage,
  isSnippetTooShortForAI,
  loadRawBody,
  resolveEnrichmentFailureLabel,
  type ItemEnrichment,
  type PipelineStageClear,
} from '../../lib/enrichment';
import { ENRICHMENT_DEFAULTS } from '../../lib/enrichment/types';
import { shouldOfferTabSessionFetch } from '../../lib/enrichment/tabSessionExtract';
import { resolveClassificationPresentation } from '../../lib/categorization/classificationPresentation';
import { DEFAULT_EMBEDDING_MODEL } from '../../lib/categorization/service';
import { useItemPipelineContext } from '../../hooks/useItemPipelineContext';
import { getEmbeddingDimensions, resolvePipelineBadge } from '../../lib/pipeline';
import { usePipelineProgress } from './PipelineProgressProvider';
import { EnrichmentContent } from './PipelineDisplayBlocks';
import { HubActionConfirmModal } from './HubActionConfirmModal';
import { BookmarkUrlLink, openBookmarkInBrowser } from './BookmarkUrlLink';
import { LinkVisual } from './LinkVisual';

interface PipelineItemInspectorPanelProps {
  item: Item;
  enrichment?: ItemEnrichment;
  embedFailed: boolean;
  /** Optional — shows collection names in the Bookmark drawer. */
  collections?: Collection[];
  /** All selected item ids — actions run on every id when length > 1. */
  targetIds?: string[];
  itemLabels?: Record<string, string>;
  navIndex?: number;
  navTotal?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onActionComplete?: () => void;
}

function formatTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STAGE_BODY_LINES = 10;
const STAGE_BODY_LINE_HEIGHT = 1.45;
/** ~10 lines of `text-xs` in each pipeline stage card body */
const STAGE_BODY_HEIGHT = `${STAGE_BODY_LINES * STAGE_BODY_LINE_HEIGHT}em`;

const stageCardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-panel)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
};

function isQueuedClassifyState(state?: string): boolean {
  return state === 'pending_classify' || state === 'pending_reclassify';
}

const actionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text-muted)',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  cursor: 'pointer',
};

function StageHeader({
  icon: Icon,
  title,
  status,
  statusColor,
  onClear,
  clearDisabled,
  clearTitle,
}: {
  icon: LucideIcon;
  title: string;
  status: string;
  statusColor: string;
  onClear?: () => void;
  clearDisabled?: boolean;
  clearTitle?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 'var(--text-sm)' }}>
        <Icon size={15} />
        {title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            disabled={clearDisabled}
            title={clearTitle ?? 'Clear this stage (not undoable)'}
            style={{
              ...actionBtnStyle,
              padding: '2px 7px',
              fontSize: 10,
              color: 'var(--error, #f85149)',
              borderColor: 'color-mix(in srgb, var(--error, #f85149) 35%, var(--border))',
              opacity: clearDisabled ? 0.45 : 1,
            }}
          >
            Clear
          </button>
        ) : null}
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 999,
            background: `${statusColor}22`,
            color: statusColor,
          }}
        >
          {status}
        </span>
      </div>
    </div>
  );
}

function MetaLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 'inherit', color: 'var(--text-muted)', lineHeight: STAGE_BODY_LINE_HEIGHT }}>
      <span style={{ color: 'var(--text-faint)' }}>{label}: </span>
      <span style={{ color: 'var(--text)' }}>{children}</span>
    </div>
  );
}

function StageBody({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="scrollbar"
      style={{
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: '0 0 auto',
        height: STAGE_BODY_HEIGHT,
        minHeight: STAGE_BODY_HEIGHT,
        maxHeight: STAGE_BODY_HEIGHT,
        overflow: 'auto',
        fontSize: 'var(--text-xs)',
        lineHeight: STAGE_BODY_LINE_HEIGHT,
      }}
    >
      {children}
    </div>
  );
}

export const PipelineItemInspectorPanel: React.FC<PipelineItemInspectorPanelProps> = ({
  item,
  enrichment,
  embedFailed,
  collections,
  targetIds: targetIdsProp,
  itemLabels: itemLabelsProp,
  navIndex = 0,
  navTotal = 1,
  onPrev,
  onNext,
  onClose,
  onActionComplete,
}) => {
  const pipeline = usePipelineProgress();
  const targetIds = targetIdsProp ?? [item.id];
  const isBulk = targetIds.length > 1;
  const countSuffix = isBulk ? ` (${targetIds.length})` : '';
  const itemLabels =
    itemLabelsProp ??
    Object.fromEntries(targetIds.map((id) => [id, id === item.id ? item.title || item.url || id : id]));
  const { context, loading: ctxLoading, reload: reloadContext } = useItemPipelineContext(item.id);
  const [rawDump, setRawDump] = useState<string | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState('');
  const [rawViewerOpen, setRawViewerOpen] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [embedBusy, setEmbedBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [pendingClearStage, setPendingClearStage] = useState<PipelineStageClear | null>(null);
  const [bookmarkOpen, setBookmarkOpen] = useState(true);

  const enrich = enrichment ?? context?.enrichment;
  const references = context?.references ?? enrich?.references ?? [];
  const failureLabel = enrich ? resolveEnrichmentFailureLabel(enrich, embedFailed) : null;
  const badge = context ? resolvePipelineBadge(context) : null;
  const running = pipeline.isLocalRunning || embedBusy || clearBusy;

  const showTabFetch = shouldOfferTabSessionFetch(
    item.url ?? '',
    enrich ?? null,
    badge?.kind ?? null
  );

  const loadDump = useCallback(async () => {
    const ref = enrich?.rawRef;
    if (!ref) {
      setRawError('No raw fetch file saved for this item.');
      return;
    }
    setRawLoading(true);
    setRawError('');
    try {
      const text = await loadRawBody(ref);
      if (!text) {
        setRawError(`File missing — ${ref}`);
        setRawDump(null);
      } else {
        setRawDump(text);
      }
    } catch (e) {
      setRawError(e instanceof Error ? e.message : 'Failed to load fetch dump');
    } finally {
      setRawLoading(false);
    }
  }, [enrich?.rawRef]);

  useEffect(() => {
    setBookmarkOpen(true);
    setRawViewerOpen(false);
    setRawDump(null);
    setRawError('');
  }, [item.id]);

  useEffect(() => {
    setRawDump(null);
    setRawError('');
    if (rawViewerOpen && enrich?.rawRef && enrich?.hasRawBody) {
      void loadDump();
    }
  }, [
    rawViewerOpen,
    enrich?.rawRef,
    enrich?.hasRawBody,
    enrich?.fetchedAt,
    enrich?.contentHash,
    enrich?.rawBytes,
    loadDump,
  ]);

  const afterAction = () => {
    reloadContext();
    onActionComplete?.();
  };

  const STAGE_CLEAR_LABELS: Record<PipelineStageClear, string> = {
    fetch: 'fetch data (dump, snippet, enrichment record)',
    ai: 'AI summary and tags',
    embed: 'search embedding vector',
    classify: 'category links and classify state',
    all: 'all enrichment data for this bookmark',
  };

  const runClearStage = async (stage: PipelineStageClear) => {
    if (running || clearBusy) return;
    setPendingClearStage(stage);
  };

  const executeClearStage = async () => {
    const stage = pendingClearStage;
    if (!stage || running || clearBusy) return;
    setPendingClearStage(null);
    setClearBusy(true);
    setLocalMessage(null);
    try {
      await clearItemPipelineStage(targetIds, stage);
      if (stage === 'fetch' || stage === 'all') {
        setRawDump(null);
        setRawError('');
      }
      const stageName =
        stage === 'all' ? 'All enrichment data' : stage.charAt(0).toUpperCase() + stage.slice(1);
      setLocalMessage(`${stageName} cleared${countSuffix}. Re-run the step when ready.`);
      afterAction();
    } catch (e) {
      setLocalMessage(e instanceof Error ? e.message : 'Clear failed');
    } finally {
      setClearBusy(false);
    }
  };

  const runFetch = async (tabSessionOnly?: boolean) => {
    if (running) return;
    if (isBulk && tabSessionOnly) return;
    try {
      if (isBulk) {
        await pipeline.runBatch(targetIds, {
          title: `Re-fetch${countSuffix}`,
          enrich: true,
          classify: false,
          processAll: true,
          forceEnrich: true,
          cancellable: true,
          collectItemResults: true,
          itemLabels,
        });
      } else {
        await pipeline.runSingle(item.id, {
          title: tabSessionOnly ? 'Fetch in browser' : 'Re-fetch',
          forceEnrich: true,
          skipClassify: true,
          tabSessionOnly,
          itemLabel: item.title || item.url || item.id,
        });
      }
      afterAction();
    } catch {
      /* modal */
    }
  };

  const runAi = async (force?: boolean) => {
    if (running) return;
    try {
      const title = force ? `Run AI anyway${countSuffix}` : `Re-run AI${countSuffix}`;
      if (isBulk) {
        await pipeline.runReextractBatch(targetIds, {
          title,
          itemLabels,
          force,
        });
      } else {
        await pipeline.runReextract(item.id, {
          title,
          itemLabel: item.title || item.url || item.id,
          force,
        });
      }
      afterAction();
    } catch {
      /* modal */
    }
  };

  const runFullDigest = async () => {
    if (running) return;
    try {
      if (isBulk) {
        await pipeline.runBatch(targetIds, {
          title: `Full digest${countSuffix}`,
          enrich: true,
          classify: true,
          processAll: true,
          forceEnrich: true,
          forceReclassify: true,
          cancellable: true,
          collectItemResults: true,
          skipDiscover: false,
          drainPendingClassifyQueue: false,
          itemLabels,
        });
      } else {
        await pipeline.runSingle(item.id, {
          title: 'Full digest',
          forceEnrich: true,
          forceReclassify: true,
          skipClassify: false,
          itemLabel: item.title || item.url || item.id,
        });
      }
      afterAction();
    } catch {
      /* modal */
    }
  };

  const runClassify = async () => {
    if (running) return;
    try {
      await pipeline.runBatch(targetIds, {
        title: `Classify${countSuffix}`,
        enrich: false,
        classify: true,
        processAll: true,
        forceReclassify: true,
        collectItemResults: true,
        skipDiscover: false,
        drainPendingClassifyQueue: false,
        itemLabels,
      });
      afterAction();
    } catch {
      /* modal */
    }
  };

  const runEmbed = async () => {
    if (running) return;
    setEmbedBusy(true);
    setLocalMessage(null);
    try {
      if (isBulk) {
        const result = await pipeline.runEmbedBatch(targetIds, {
          title: `Re-embed${countSuffix}`,
        });
        setLocalMessage(
          `${result.embedded} embedded${result.skipped ? ` · ${result.skipped} skipped` : ''}${result.failed ? ` · ${result.failed} failed` : ''}`
        );
      } else {
        if (!enrich) return;
        const result = await ensureItemEmbedding(item.id, enrich);
        if (result.embedded) {
          setLocalMessage('Search embedding updated.');
        } else if (result.skipped === 'no_api_key') {
          setLocalMessage('Embed skipped — add AI key in Settings.');
        } else if (result.skipped === 'hash_unchanged') {
          setLocalMessage('Embed unchanged — text hash matches existing vector.');
        } else if (result.skipped === 'embed_failed') {
          setLocalMessage('Embed failed — check AI settings or retry.');
        } else {
          setLocalMessage('Embed skipped — not enough text or ineligible.');
        }
      }
      afterAction();
    } catch (e) {
      setLocalMessage(e instanceof Error ? e.message : 'Embed failed');
    } finally {
      setEmbedBusy(false);
    }
  };

  const fetchStatus = enrich?.status ?? 'none';
  const fetchColor =
    fetchStatus === 'ok'
      ? 'var(--er-ok, #3fb950)'
      : fetchStatus === 'failed'
        ? 'var(--error, #f85149)'
        : 'var(--text-muted)';

  const aiStatus = enrich?.aiStatus ?? '—';
  const aiColor =
    aiStatus === 'ok'
      ? 'var(--er-ok, #3fb950)'
      : aiStatus === 'not_configured'
        ? 'var(--er-warn, #d29922)'
        : aiStatus !== '—'
          ? 'var(--error, #f85149)'
          : 'var(--text-muted)';

  const signal = context?.signal;
  const embeddingDimensions = getEmbeddingDimensions(signal);
  const hasEmbed = embeddingDimensions > 0;
  const embedCurrent =
    hasEmbed &&
    signal?.embeddingModel === DEFAULT_EMBEDDING_MODEL &&
    signal?.textHash &&
    signal.textHash === enrich?.textHash;
  const embedStatus = embedFailed
    ? 'failed'
    : embedCurrent
      ? 'indexed'
      : hasEmbed
        ? 'stale'
        : 'missing';
  const embedColor =
    embedStatus === 'indexed'
      ? 'var(--er-ok, #3fb950)'
      : embedStatus === 'failed'
        ? 'var(--error, #f85149)'
        : embedStatus === 'stale'
          ? 'var(--er-warn, #d29922)'
          : 'var(--text-faint)';

  const classificationPresentation = resolveClassificationPresentation({
    primaryCategoryId: context?.primaryCategoryId,
    classifyState: context?.classifyState,
  });
  const primaryTopicName =
    context?.primaryCategoryName ??
    context?.suggestedLinks.find((l) => l.isPrimary)?.name ??
    context?.suggestedLinks[0]?.name;
  const classifyLabel = classificationPresentation
    ? primaryTopicName
      ? `${classificationPresentation.headline}: ${primaryTopicName}`
      : classificationPresentation.headline
    : context?.primaryCategoryName
      ? `Assigned: ${context.primaryCategoryName}`
      : context?.suggestedLinks.find((l) => l.isPrimary)?.name
        ? `Suggested: ${context.suggestedLinks.find((l) => l.isPrimary)?.name}`
        : context?.suggestedLinks[0]?.name ??
          (context?.classifyState === 'classified' &&
          !context?.acceptedLinks.length &&
          !context?.suggestedLinks.length
            ? 'classified (no topic stored)'
            : context?.classifyState?.replace(/_/g, ' ')) ??
          '—';
  const classifyStatusColor = classificationPresentation?.color ?? 'var(--accent)';

  const aiShortGated =
    enrich?.aiStatus === 'content_too_short' || isSnippetTooShortForAI(enrich);
  const snippetLen = enrich?.snippet?.trim().length ?? 0;

  return (
    <>
      {pendingClearStage ? (
        <HubActionConfirmModal
          title={`Clear ${STAGE_CLEAR_LABELS[pendingClearStage]}?`}
          description={
            targetIds.length > 1
              ? `This deletes stored data for ${targetIds.length} selected items so you can re-run that step from scratch.`
              : 'This deletes stored data so you can re-run that step from scratch.'
          }
          warning="This is not an undo — previous values are not restored."
          confirmLabel="Clear data"
          confirmVariant="danger"
          onConfirm={() => void executeClearStage()}
          onCancel={() => setPendingClearStage(null)}
        />
      ) : null}
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--accent-weak)',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          {navTotal > 1 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <button
                type="button"
                onClick={onPrev}
                disabled={navIndex <= 0}
                aria-label="Previous item"
                style={{
                  ...actionBtnStyle,
                  padding: '4px 6px',
                  opacity: navIndex <= 0 ? 0.4 : 1,
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
                {navIndex + 1} of {navTotal}
                {isBulk ? ` · ${targetIds.length} selected` : ''}
              </span>
              <button
                type="button"
                onClick={onNext}
                disabled={navIndex >= navTotal - 1}
                aria-label="Next item"
                style={{
                  ...actionBtnStyle,
                  padding: '4px 6px',
                  opacity: navIndex >= navTotal - 1 ? 0.4 : 1,
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
            <LinkVisual url={item.url} title={item.title} favicon={item.favicon} />
            <span>{item.title || 'Untitled'}</span>
          </div>
          <BookmarkUrlLink
            item={item}
            style={{
              color: 'var(--text-muted)',
              whiteSpace: 'normal',
              wordBreak: 'break-all',
              overflow: 'visible',
              textOverflow: 'unset',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button type="button" onClick={onClose} aria-label="Close" style={actionBtnStyle}>
            <X size={14} />
          </button>
        </div>
      </div>

      {localMessage ? (
        <div
          style={{
            padding: '8px 16px',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {localMessage}
        </div>
      ) : null}

      {/* Bookmark / link details — same info users expect from the Inspector sidebar */}
      {!isBulk ? (
        <div
          style={{
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg)',
          }}
        >
          <button
            type="button"
            onClick={() => setBookmarkOpen((v) => !v)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 16px',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            {bookmarkOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Bookmark size={12} />
            Bookmark
          </button>
          {bookmarkOpen ? (
            <div
              style={{
                padding: '0 16px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                fontSize: 'var(--text-xs)',
                color: 'var(--text)',
                lineHeight: 1.45,
              }}
            >
              {item.url || item.title ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <LinkVisual url={item.url} title={item.title} favicon={item.favicon} />
                  <div style={{ minWidth: 0, fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                    {item.title || 'Untitled'}
                  </div>
                </div>
              ) : null}
              {item.url ? (
                <BookmarkUrlLink
                  item={item}
                  style={{
                    color: 'var(--text-muted)',
                    whiteSpace: 'normal',
                    wordBreak: 'break-all',
                  }}
                />
              ) : null}
              {collections && item.collectionIds?.length ? (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--text-faint)',
                      textTransform: 'uppercase',
                      marginBottom: 4,
                    }}
                  >
                    Collections
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {item.collectionIds.map((cid) => {
                      const col = collections.find((c) => c.id === cid);
                      return (
                        <span
                          key={cid}
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-panel)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {col?.name ?? cid}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {item.tags && item.tags.length > 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>
                  Tags: {item.tags.join(', ')}
                </div>
              ) : null}
              {item.notes ||
              Object.values(item.placements ?? {}).some((p) => p.notes?.trim()) ? (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--text-faint)',
                      textTransform: 'uppercase',
                      marginBottom: 4,
                    }}
                  >
                    Notes
                  </div>
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text-muted)',
                      maxHeight: 120,
                      overflow: 'auto',
                    }}
                    className="scrollbar"
                  >
                    {item.notes?.trim() ||
                      Object.values(item.placements ?? {})
                        .map((p) => p.notes?.trim())
                        .filter(Boolean)
                        .join('\n\n')}
                  </div>
                </div>
              ) : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: 'var(--text-faint)' }}>
                <span>Added: {new Date(item.created_at).toLocaleDateString()}</span>
                <span>Updated: {new Date(item.updated_at).toLocaleDateString()}</span>
                {item.source ? <span>Source: {item.source}</span> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" disabled={running} onClick={() => void runFetch()} style={actionBtnStyle}>
          {running ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
          Re-fetch{countSuffix}
        </button>
        {showTabFetch && !isBulk ? (
          <button type="button" disabled={running} onClick={() => void runFetch(true)} style={actionBtnStyle}>
            <Globe size={13} />
            Fetch in browser
          </button>
        ) : null}
        <button
          type="button"
          disabled={running || (!isBulk && enrich?.status !== 'ok')}
          onClick={() => void runAi()}
          style={actionBtnStyle}
          title={!isBulk && enrich?.status !== 'ok' ? 'Needs successful fetch first' : undefined}
        >
          <Sparkles size={13} />
          Re-run AI{countSuffix}
        </button>
        {aiShortGated || isBulk ? (
          <button
            type="button"
            disabled={running || (!isBulk && enrich?.status !== 'ok')}
            onClick={() => void runAi(true)}
            style={{
              ...actionBtnStyle,
              borderColor: 'var(--er-warn, #d29922)',
              color: 'var(--er-warn, #d29922)',
            }}
            title={
              isBulk
                ? 'Bypass minimum text length for all selected'
                : `Bypass ${snippetLen} char minimum — send cached text to AI anyway`
            }
          >
            <Sparkles size={13} />
            Run AI anyway{countSuffix}
          </button>
        ) : null}
        <button
          type="button"
          disabled={running || (!isBulk && !enrich?.summary)}
          onClick={() => void runEmbed()}
          style={actionBtnStyle}
          title={!isBulk && !enrich?.summary ? 'Needs AI summary first' : undefined}
        >
          <Layers size={13} />
          Re-embed{countSuffix}
        </button>
        <button type="button" disabled={running} onClick={() => void runClassify()} style={actionBtnStyle}>
          <Tags size={13} />
          Classify{countSuffix}
        </button>
        <span
          aria-hidden
          style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }}
        />
        <button type="button" disabled={running} onClick={() => void runFullDigest()} style={actionBtnStyle}>
          <RefreshCw size={13} />
          Full digest{countSuffix}
        </button>
        <span
          aria-hidden
          style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }}
        />
        <button
          type="button"
          disabled={running}
          onClick={() => void runClearStage('all')}
          style={{
            ...actionBtnStyle,
            color: 'var(--error, #f85149)',
            borderColor: 'color-mix(in srgb, var(--error, #f85149) 35%, var(--border))',
          }}
          title="Delete all fetch, AI, embed, and classify data (not undoable)"
        >
          Clear all{countSuffix}
        </button>
      </div>

      <div
        style={{
          padding: '0 16px 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
          alignItems: 'stretch',
        }}
      >
        {/* AI stage */}
        <div style={stageCardStyle}>
          <StageHeader
            icon={Sparkles}
            title="AI extract"
            status={String(aiStatus)}
            statusColor={aiColor}
            onClear={() => void runClearStage('ai')}
            clearDisabled={running || (!isBulk && !enrich?.summary && !enrich?.aiStatus)}
            clearTitle="Delete AI summary, tags, and search embed (keeps fetch snippet)"
          />
          <StageBody>
            {enrich?.aiError || (enrich?.aiStatus && enrich.aiStatus !== 'ok') ? (
              <div style={{ color: 'var(--error, #f85149)' }}>
                {enrich.aiError ??
                  describeAiFailure(enrich.aiStatus, enrich.aiError) ??
                  AI_STATUS_HINTS[enrich.aiStatus!]}
              </div>
            ) : null}
            {aiShortGated ? (
              <div style={{ color: 'var(--er-warn, #d29922)' }}>
                Cached text is {snippetLen} chars (min {ENRICHMENT_DEFAULTS.minUsefulSnippetChars}) — use Run AI anyway to bypass.
              </div>
            ) : null}
            <MetaLine label="Last run">{formatTime(enrich?.aiAt)}</MetaLine>
            {enrich?.aiTags?.length ? (
              <MetaLine label="Tags">{enrich.aiTags.join(', ')}</MetaLine>
            ) : null}
            <EnrichmentContent
              summary={context?.summary ?? enrich?.summary}
              keyPoints={context?.keyPoints ?? enrich?.aiKeyPoints ?? []}
              references={references}
              compact
              emptyMessage="No summary yet"
            />
          </StageBody>
        </div>

        {/* Fetch stage */}
        <div style={stageCardStyle}>
          <StageHeader
            icon={Globe}
            title="Fetch"
            status={fetchStatus}
            statusColor={fetchColor}
            onClear={() => void runClearStage('fetch')}
            clearDisabled={running}
            clearTitle="Delete fetch dump, snippet, and enrichment record (also clears embed & categories)"
          />
          <StageBody>
            {failureLabel?.stage === 'fetch' || fetchStatus === 'failed' ? (
              <div style={{ color: 'var(--error, #f85149)' }}>
                {formatEnrichmentFailureMessage(enrich) ?? failureLabel?.label}
              </div>
            ) : null}
            <MetaLine label="Provider">
              {enrich?.providerId ?? '—'}
              {enrich?.fetchSourceId && enrich.fetchSourceId !== enrich.providerId
                ? ` (${enrich.fetchSourceId})`
                : ''}
            </MetaLine>
            <MetaLine label="Fetched">{formatTime(enrich?.fetchedAt)}</MetaLine>
            <MetaLine label="Raw dump">
              {enrich?.hasRawBody ? `Yes · ${enrich.rawBytes ?? '?'} bytes` : 'Not saved'}
            </MetaLine>
            {references.length > 0 ? (
              <MetaLine label="Indexed links">{references.length}</MetaLine>
            ) : null}
            {enrich?.snippet ? (
              <div style={{ color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--text-faint)' }}>Preview: </span>
                {enrich.snippet}
              </div>
            ) : null}
          </StageBody>
        </div>

        {/* Embed stage */}
        <div style={stageCardStyle}>
          <StageHeader
            icon={Layers}
            title="Search embed"
            status={embedStatus}
            statusColor={embedColor}
            onClear={() => void runClearStage('embed')}
            clearDisabled={running || (!isBulk && !hasEmbed)}
            clearTitle="Delete search embedding vector (keeps classify)"
          />
          <StageBody>
            <MetaLine label="Vector">
              {hasEmbed ? `${embeddingDimensions} dims` : 'None'}
            </MetaLine>
            <MetaLine label="Model">{signal?.embeddingModel || '—'}</MetaLine>
            <MetaLine label="Text hash">
              {signal?.textHash ? `${signal.textHash.slice(0, 8)}…` : '—'}
            </MetaLine>
            {ctxLoading ? (
              <span style={{ color: 'var(--text-faint)' }}>Loading signal…</span>
            ) : null}
            {!ctxLoading && !hasEmbed ? (
              <div style={{ color: 'var(--text-faint)' }}>
                No search vector yet — run Re-embed after AI extract succeeds.
              </div>
            ) : null}
            {embedStatus === 'stale' ? (
              <div style={{ color: 'var(--er-warn, #d29922)' }}>
                Vector exists but text hash changed — re-embed to refresh search index.
              </div>
            ) : null}
          </StageBody>
        </div>

        {/* Classify stage */}
        <div style={stageCardStyle}>
          <StageHeader
            icon={Tags}
            title="Categories"
            status={classifyLabel}
            statusColor={classifyStatusColor}
            onClear={() => void runClearStage('classify')}
            clearDisabled={running}
            clearTitle="Delete category links and reset classify state"
          />
          <StageBody>
            <MetaLine label="State">
              <span style={{ color: classificationPresentation?.color }}>
                {classificationPresentation?.headline ??
                  context?.classifyState?.replace(/_/g, ' ') ??
                  '—'}
              </span>
            </MetaLine>
            {context?.acceptedLinks.length ? (
              <div style={{ color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--text-faint)' }}>Accepted: </span>
                {context.acceptedLinks.map((l) => (
                  <span key={l.categoryId} style={{ marginRight: 6 }}>
                    {l.name}
                    {l.isPrimary ? ' ★' : ''}
                  </span>
                ))}
              </div>
            ) : null}
            {context?.suggestedLinks.length ? (
              <div style={{ color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--text-faint)' }}>
                  {context.acceptedLinks.length
                    ? 'Additional model categories: '
                    : isQueuedClassifyState(context.classifyState)
                    ? 'AI suggested: '
                    : 'Model selected (not accepted): '}
                </span>
                {context.suggestedLinks.map((l) => (
                  <span key={l.categoryId} style={{ marginRight: 6 }}>
                    {l.name}
                    {l.isPrimary ? ' ★' : ''}
                  </span>
                ))}
                <span style={{ color: 'var(--text-faint)' }}>
                  {isQueuedClassifyState(context.classifyState)
                    ? ' (accept in Categories hub)'
                    : ' (classified result; accept in Categories hub to lock it)'}
                </span>
                {isQueuedClassifyState(context.classifyState) ? (
                  <div style={{ color: 'var(--er-warn, #d29922)', marginTop: 4 }}>
                    Provisional only — item is still queued for classify and this suggestion can change.
                  </div>
                ) : null}
              </div>
            ) : null}
            {!context?.acceptedLinks.length &&
            !context?.suggestedLinks.length &&
            context?.classifyState === 'classified' ? (
              <div style={{ color: 'var(--er-warn, #d29922)' }}>
                Classified state but no category stored — run Classify again (or Clear categories).
              </div>
            ) : !context?.acceptedLinks.length && !context?.suggestedLinks.length ? (
              <div style={{ color: 'var(--text-faint)' }}>No accepted category</div>
            ) : null}
            {context && context.acceptedLinks.length + context.suggestedLinks.length > 1 ? (
              <MetaLine label="All categories">
                {[...context.acceptedLinks, ...context.suggestedLinks]
                  .map((link) => `${link.name}${link.isPrimary ? ' ★' : ''}`)
                  .join(', ')}
              </MetaLine>
            ) : null}
          </StageBody>
        </div>
      </div>

      {/* Raw fetch/debug data stays out of the primary review flow until requested. */}
      <div
        style={{
          padding: '0 16px 16px',
        }}
      >
        <div
          style={{
            ...stageCardStyle,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <button
            type="button"
            onClick={() => setRawViewerOpen((open) => !open)}
            aria-expanded={rawViewerOpen}
            aria-controls={`fetch-dump-${item.id}`}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              border: 'none',
              borderBottom: rawViewerOpen ? '1px solid var(--border)' : 'none',
              background: 'var(--bg)',
              color: 'var(--text)',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 'var(--text-sm)' }}>
              <Database size={15} />
              Raw fetch &amp; debug data
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
              {enrich?.hasRawBody ? `${enrich.rawBytes ?? '?'} bytes` : 'No saved dump'}
              <ChevronDown
                size={15}
                aria-hidden
                style={{ transform: rawViewerOpen ? 'rotate(180deg)' : undefined }}
              />
            </div>
          </button>
          {rawViewerOpen ? (
            <div id={`fetch-dump-${item.id}`}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, padding: '8px 10px 0' }}>
              {item.url ? (
                <button
                  type="button"
                  title={item.url}
                  onClick={() => void openBookmarkInBrowser(item)}
                  style={{ ...actionBtnStyle, textDecoration: 'none' }}
                >
                  <ExternalLink size={13} />
                  URL
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void loadDump()}
                disabled={rawLoading || !enrich?.rawRef}
                style={actionBtnStyle}
              >
                {rawLoading ? <Loader2 size={13} className="spin" /> : null}
                {rawDump ? 'Reload' : 'Load dump'}
              </button>
              </div>
              <div
                className="scrollbar"
                style={{
                  margin: 10,
                  padding: 12,
                  maxHeight: 360,
                  overflow: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--bg)',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 11,
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: 'var(--text-muted)',
                }}
              >
                {rawError ? <span style={{ color: 'var(--error)' }}>{rawError}</span> : null}
                {!rawError && !rawDump && !rawLoading ? (
                  enrich?.hasRawBody
                    ? 'Open or reload the saved fetch dump.'
                    : 'No fetch dump on disk — run Re-fetch first.'
                ) : null}
                {rawLoading ? 'Loading fetch dump…' : rawDump}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
    </>
  );
};
