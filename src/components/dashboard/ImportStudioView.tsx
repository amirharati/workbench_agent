import React from 'react';
import {
  bulkImportBookmarks,
  ensureProjectUnsortedCollection,
  normalizeBookmarkUrl,
  refreshPipelineCacheFromWorker,
  type BulkImportAffectedItem,
  type BulkImportSkippedTrashedItem,
  type Collection,
  type Project,
} from '../../lib/db';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';
import {
  getTrashHistoryMap,
  matchRowsAgainstTrashHistory,
  type TrashHistoryEntry,
} from '../../lib/trashHistory';
import {
  buildImportReport,
  pipelineProgressBar,
  preflightImportPipelineStart,
  resolvePipelineSummaryTone,
  type BatchDigestResult,
  type ImportReport,
} from '../../lib/pipeline';
import { runBatchOnOffscreen } from '../../lib/pipeline/offscreenPipelineClient';
import { getEnrichmentsForItemIds, type ItemEnrichment } from '../../lib/enrichment';
import {
  isCompleteAiEnrichment,
  shouldProcessImportedBookmark,
  type ImportEnrichmentRefreshPolicy,
} from '../../lib/import/importProcessingPolicy';
import { useToast } from '../ToastContainer';
import {
  formatAllImportSchemaHelp,
  parseBookmarkImportFile,
  type BookmarkImportCandidate,
} from '../../lib/import/bookmarkFileImport';
import { ImportReportOverlay } from './ImportReportOverlay';
import { uiPatterns } from '../../styles/uiPatterns';
import { INCOMING_COLLECTION_NAME, UNFILED_COLLECTION_NAME } from '../../lib/systemDataModel';

export type ImportSource = 'file' | 'chrome' | 'assistant';

interface ImportStudioViewProps {
  projects: Project[];
  collections: Collection[];
  onBack: () => void;
  onImported?: () => Promise<void> | void;
}

type ImportCandidate = Omit<BookmarkImportCandidate, 'source'> & {
  source: BookmarkImportCandidate['source'] | 'chrome-api';
};

const SKIP_TRASHED_IMPORT_KEY = 'workbench-import-skip-previously-trashed';

function readSkipTrashedImportPref(): boolean {
  try {
    return localStorage.getItem(SKIP_TRASHED_IMPORT_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function isImportableBookmarkUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

export function getDefaultImportSelection(rows: Array<{ url: string }>): Set<number> {
  return new Set(rows.flatMap((row, index) => (isImportableBookmarkUrl(row.url) ? [index] : [])));
}

export function resolveImportDestinationLabel(
  projects: Project[],
  collections: Collection[],
  projectId: string,
  collectionId: string
): string {
  if (collectionId) {
    return collections.find((collection) => collection.id === collectionId)?.name || 'Selected collection';
  }
  if (projectId) {
    const projectName = projects.find((project) => project.id === projectId)?.name || 'Selected project';
    return `${projectName} / ${UNFILED_COLLECTION_NAME}`;
  }
  return `Inbox / ${INCOMING_COLLECTION_NAME}`;
}

export function resolveImportReportProcessedIds(result: {
  completedItemIds: string[];
}): Set<string> {
  return new Set(result.completedItemIds);
}

/**
 * A resolved bulk job is not itself an error merely because individual URLs
 * were unavailable. Keep Import Studio aligned with the shared pipeline modal:
 * red is reserved for a rejected/failed job, while mixed outcomes are success
 * or informational completion.
 */
export function resolveImportPipelineToastType(
  result: Pick<
    BatchDigestResult,
    | 'enriched'
    | 'fetched'
    | 'skipped'
    | 'failed'
    | 'classified'
    | 'classifyError'
    | 'aiError'
    | 'classifySummary'
  >
): 'success' | 'error' | 'info' {
  return resolvePipelineSummaryTone(result);
}

export function getDefaultImportPipelineSelection(
  items: BulkImportAffectedItem[],
  enrichments: Map<string, ItemEnrichment>,
  policy: ImportEnrichmentRefreshPolicy,
  now = Date.now()
): Set<string> {
  return new Set(
    items
      .filter((item) => shouldProcessImportedBookmark(enrichments.get(item.itemId), policy, now))
      .map((item) => item.itemId)
  );
}

const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px',
  background: 'var(--bg-glass)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

export const ImportStudioView: React.FC<ImportStudioViewProps> = ({
  projects,
  collections,
  onBack,
  onImported,
}) => {
  const [source, setSource] = React.useState<ImportSource>('file');
  const [rows, setRows] = React.useState<ImportCandidate[]>([]);
  const [selectedRowIndexes, setSelectedRowIndexes] = React.useState<Set<number>>(() => new Set());
  const [reviewQuery, setReviewQuery] = React.useState('');
  const [sourceLabel, setSourceLabel] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const [wavePipelineRunning, setWavePipelineRunning] = React.useState(false);
  const [processProgress, setProcessProgress] = React.useState('');
  const [processProgressPercent, setProcessProgressPercent] = React.useState(0);
  const pipelineAbortRef = React.useRef<AbortController | null>(null);
  const cancelPipelineProcessing = () => {
    pipelineAbortRef.current?.abort('user-cancelled');
  };
  const [skipPreviouslyTrashed, setSkipPreviouslyTrashed] = React.useState(readSkipTrashedImportPref);
  const [trashHistoryMap, setTrashHistoryMap] = React.useState<Map<string, TrashHistoryEntry>>(
    () => new Map()
  );
  const [showTrashedImportPreview, setShowTrashedImportPreview] = React.useState(false);
  const [pipelineConfirm, setPipelineConfirm] = React.useState<{
    importSummary: string;
    items: BulkImportAffectedItem[];
  } | null>(null);
  const [pipelineSelectedIds, setPipelineSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [pipelineRefreshPolicy, setPipelineRefreshPolicy] =
    React.useState<ImportEnrichmentRefreshPolicy>('missing');
  const [pipelineEnrichments, setPipelineEnrichments] = React.useState<Map<string, ItemEnrichment>>(
    () => new Map()
  );
  const [pipelinePolicyLoading, setPipelinePolicyLoading] = React.useState(false);
  const [pipelineFilter, setPipelineFilter] = React.useState('');
  const [commitMessage, setCommitMessage] = React.useState('');
  const [commitError, setCommitError] = React.useState('');
  const [lastCommitMeta, setLastCommitMeta] = React.useState<{
    importSummary: string;
    targetLabel: string;
    created: number;
    merged: number;
    skipped: number;
    skippedPreviouslyTrashed: number;
    skippedTrashedItems: BulkImportSkippedTrashedItem[];
    items: BulkImportAffectedItem[];
  } | null>(null);
  const [importReport, setImportReport] = React.useState<ImportReport | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [selectedProjectId, setSelectedProjectId] = React.useState('');
  const [selectedCollectionId, setSelectedCollectionId] = React.useState('');
  const { addToast } = useToast();

  React.useEffect(() => {
    if (!processing) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [processing]);

  const reloadTrashHistory = React.useCallback(async () => {
    setTrashHistoryMap(await getTrashHistoryMap());
  }, []);

  React.useEffect(() => {
    void reloadTrashHistory();
    return subscribeToDataChanges(() => {
      void reloadTrashHistory();
    });
  }, [reloadTrashHistory]);

  const filteredPipelineItems = React.useMemo(() => {
    if (!pipelineConfirm) return [];
    const q = pipelineFilter.trim().toLowerCase();
    if (!q) return pipelineConfirm.items;
    return pipelineConfirm.items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.url.toLowerCase().includes(q) ||
        item.outcome.includes(q)
    );
  }, [pipelineConfirm, pipelineFilter]);

  const selectedPipelineCount = pipelineSelectedIds.size;
  const policySkippedCount = React.useMemo(() => {
    if (!pipelineConfirm || pipelinePolicyLoading) return 0;
    const now = Date.now();
    return pipelineConfirm.items.filter(
      (item) => !shouldProcessImportedBookmark(pipelineEnrichments.get(item.itemId), pipelineRefreshPolicy, now)
    ).length;
  }, [pipelineConfirm, pipelineEnrichments, pipelinePolicyLoading, pipelineRefreshPolicy]);

  React.useEffect(() => {
    if (!pipelineConfirm) return;
    let cancelled = false;
    setPipelinePolicyLoading(true);
    void getEnrichmentsForItemIds(pipelineConfirm.items.map((item) => item.itemId))
      .then((enrichments) => {
        if (cancelled) return;
        setPipelineEnrichments(enrichments);
        setPipelineSelectedIds(
          getDefaultImportPipelineSelection(pipelineConfirm.items, enrichments, pipelineRefreshPolicy)
        );
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('Could not inspect existing enrichment before import processing', error);
        setPipelineEnrichments(new Map());
        setPipelineSelectedIds(
          new Set(
            pipelineConfirm.items
              .filter((item) => item.outcome === 'created')
              .map((item) => item.itemId)
          )
        );
        addToast({
          type: 'error',
          message: 'Could not inspect existing enrichment. Existing bookmarks were left unselected for safety.',
        });
      })
      .finally(() => {
        if (!cancelled) setPipelinePolicyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pipelineConfirm]);

  const togglePipelineItem = (itemId: string, checked: boolean) => {
    setPipelineSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  };

  const setPipelineSelectionForFiltered = (select: boolean) => {
    setPipelineSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of filteredPipelineItems) {
        if (select) next.add(item.itemId);
        else next.delete(item.itemId);
      }
      return next;
    });
  };

  const resetImportSession = () => {
    setRows([]);
    setSelectedRowIndexes(new Set());
    setReviewQuery('');
    setSourceLabel('');
    setError('');
    setCommitMessage('');
    setCommitError('');
    setPipelineConfirm(null);
    setPipelineFilter('');
    setPipelineSelectedIds(new Set());
    setPipelineRefreshPolicy('missing');
    setPipelineEnrichments(new Map());
    setPipelinePolicyLoading(false);
    setLastCommitMeta(null);
    setImportReport(null);
  };

  const openImportReport = async (
    meta: NonNullable<typeof lastCommitMeta>,
    processedIds: Set<string>
  ) => {
    if (processedIds.size > 0) {
      await refreshPipelineCacheFromWorker();
    }
    const report = await buildImportReport({
      ...meta,
      processedIds,
    });
    setImportReport(report);
    setPipelineConfirm(null);
    setPipelineFilter('');
    setCommitMessage('');
  };

  const skipPipelineConfirm = async () => {
    setPipelineConfirm(null);
    setPipelineFilter('');
    setPipelineSelectedIds(new Set());
    if (lastCommitMeta) {
      addToast({ type: 'info', message: 'Digest skipped — run later from Enrichment Hub or Home.' });
      await openImportReport(lastCommitMeta, new Set());
    } else {
      addToast({
        type: 'info',
        message: 'Import saved. Run fetch + AI later from Home → Process not enriched.',
      });
    }
  };

  const runSelectedPipeline = async () => {
    if (!pipelineConfirm || !lastCommitMeta) return;
    const ids = pipelineConfirm.items
      .map((item) => item.itemId)
      .filter((id) => pipelineSelectedIds.has(id));
    if (ids.length === 0) {
      addToast({ type: 'info', message: 'Select at least one link to process.' });
      return;
    }

    const pre = await preflightImportPipelineStart();
    if (!pre.ok) {
      addToast({ type: 'error', message: pre.reason ?? 'Cannot start import pipeline.' });
      return;
    }

    setPipelineConfirm(null);
    setPipelineFilter('');
    setProcessing(true);
    setWavePipelineRunning(true);
    setProcessProgress(`Starting pipeline on ${ids.length} selected link${ids.length === 1 ? '' : 's'}…`);
    setProcessProgressPercent(0);
    addToast({
      type: 'info',
      message: `Running fetch + AI + classify on ${ids.length} link${ids.length === 1 ? '' : 's'} in the shared coordinator.`,
    });

    try {
      const ac = new AbortController();
      pipelineAbortRef.current = ac;
      const result = await runBatchOnOffscreen(ids, {
        enrich: true,
        classify: true,
        forceEnrich: true,
        forceReclassify: true,
        signal: ac.signal,
        onProgress: (p) => {
          setProcessProgress(p.label);
          const bar = pipelineProgressBar(p);
          setProcessProgressPercent((current) => Math.max(current, bar.percent));
        },
      });
      setProcessProgressPercent(100);
      addToast({ type: resolveImportPipelineToastType(result), message: result.message });
      if (onImported) {
        await onImported();
      }
      await openImportReport(
        lastCommitMeta,
        new Set(result.itemEnrichResults?.map((row) => row.itemId) ?? [])
      );
    } catch (e) {
      const cancelled = pipelineAbortRef.current?.signal.aborted;
      const msg = cancelled ? 'Pipeline cancelled.' : e instanceof Error ? e.message : 'Post-import processing failed';
      addToast({ type: 'error', message: msg });
      if (!cancelled) setCommitError(msg);
    } finally {
      setProcessing(false);
      setWavePipelineRunning(false);
      setProcessProgress('');
      setProcessProgressPercent(0);
      setPipelineSelectedIds(new Set());
      pipelineAbortRef.current = null;
    }
  };

  const normalizeUrl = (url: string): string => {
    try {
      const u = new URL(url.trim());
      u.hash = '';
      const path = u.pathname.replace(/\/+$/, '');
      u.pathname = path || '/';
      return u.toString().replace(/\/$/, '');
    } catch {
      return url.trim();
    }
  };

  const setImportedRows = (nextRows: ImportCandidate[], label: string) => {
    setRows(nextRows);
    setSelectedRowIndexes(getDefaultImportSelection(nextRows));
    setReviewQuery('');
    setSourceLabel(label);
    setError('');
    setCommitError('');
    setCommitMessage('');
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handleFilePicked: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      setError('');
      const text = await file.text();
      const result = await parseBookmarkImportFile({
        fileName: file.name,
        text,
        byteLength: file.size,
      });
      if (result.rows.length > 0) {
        setImportedRows(result.rows, result.sourceLabel);
      } else {
        setRows([]);
        setSelectedRowIndexes(new Set());
        setSourceLabel('');
        setError(result.errorMessage ?? 'No bookmark rows were detected in that file.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse file.');
      setRows([]);
      setSelectedRowIndexes(new Set());
      setSourceLabel('');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  const loadFromChromeApi = async () => {
    setLoading(true);
    try {
      if (!chrome?.bookmarks?.getTree) {
        throw new Error('Chrome bookmarks API is unavailable in this context.');
      }
      const tree = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
        chrome.bookmarks.getTree((result) => {
          const runtimeError = chrome.runtime?.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }
          resolve(result || []);
        });
      });

      const out: ImportCandidate[] = [];
      const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[], path: string[]) => {
        nodes.forEach((node) => {
          if (node.url) {
            out.push({
              source: 'chrome-api',
              title: node.title || node.url,
              url: node.url,
              description: undefined,
              folderPath: path.join(' / ') || undefined,
            });
            return;
          }
          const nextPath = node.title ? [...path, node.title] : path;
          if (Array.isArray(node.children) && node.children.length > 0) {
            walk(node.children, nextPath);
          }
        });
      };

      walk(tree, []);
      setImportedRows(out, 'Chrome bookmarks');
      if (out.length === 0) {
        setError('No bookmark URLs returned from Chrome API.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Chrome bookmarks.');
      setRows([]);
      setSelectedRowIndexes(new Set());
      setSourceLabel('');
    } finally {
      setLoading(false);
    }
  };

  const trashedImportMatches = React.useMemo(
    () => matchRowsAgainstTrashHistory(rows, trashHistoryMap),
    [rows, trashHistoryMap]
  );

  const stats = React.useMemo(() => {
    const valid = rows.filter((row) => isImportableBookmarkUrl(row.url)).length;
    const invalid = rows.length - valid;
    const seen = new Set<string>();
    let duplicates = 0;
    rows.forEach((row) => {
      const key = normalizeUrl(row.url);
      if (!key) return;
      if (seen.has(key)) {
        duplicates += 1;
      } else {
        seen.add(key);
      }
    });
    return { total: rows.length, valid, invalid, duplicates };
  }, [rows]);

  const filteredCollections = React.useMemo(() => {
    if (!selectedProjectId) return collections;
    return collections.filter(
      (c) =>
        c.primaryProjectId === selectedProjectId ||
        (Array.isArray(c.projectIds) && c.projectIds.includes(selectedProjectId))
    );
  }, [collections, selectedProjectId]);

  const visibleRowIndexes = React.useMemo(() => {
    const query = reviewQuery.trim().toLowerCase();
    return rows.flatMap((row, index) => {
      if (!query) return [index];
      return [row.title, row.url, row.description, row.notes, row.folderPath, row.importSource, row.source]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
        ? [index]
        : [];
    });
  }, [reviewQuery, rows]);

  const selectedRows = React.useMemo(
    () => rows.filter((_, index) => selectedRowIndexes.has(index)),
    [rows, selectedRowIndexes]
  );

  const setVisibleRowSelection = (selected: boolean) => {
    setSelectedRowIndexes((current) => {
      const next = new Set(current);
      for (const index of visibleRowIndexes) {
        if (!isImportableBookmarkUrl(rows[index].url)) continue;
        if (selected) next.add(index);
        else next.delete(index);
      }
      return next;
    });
  };

  const changeSource = (nextSource: ImportSource) => {
    if (nextSource === source || processing || committing || pipelineConfirm) return;
    resetImportSession();
    setSource(nextSource);
  };

  const handleCommitToDb = async () => {
    if (selectedRows.length === 0) {
      setCommitError('Nothing to import yet. Load a file or Chrome bookmarks first.');
      return;
    }

    try {
      setCommitting(true);
      setCommitError('');
      setCommitMessage('');

      const targetCollectionId =
        selectedCollectionId ||
        (selectedProjectId ? await ensureProjectUnsortedCollection(selectedProjectId) : '');

      const result = await bulkImportBookmarks(
        selectedRows.map((row) => ({
          url: row.url,
          title: row.title || row.url,
          description: row.description,
          notes: row.notes || row.description,
          tags: row.tags,
          source: row.importSource || row.source || 'import',
          favicon: undefined,
        })),
        targetCollectionId,
        { skipPreviouslyTrashed }
      );

      const targetLabel = resolveImportDestinationLabel(
        projects,
        collections,
        selectedProjectId,
        selectedCollectionId
      );

      const withheldPart =
        result.skippedPreviouslyTrashed > 0
          ? `, withheld ${result.skippedPreviouslyTrashed} previously trashed`
          : '';
      const restoredPart =
        result.restoredFromTrash > 0 ? `, restored ${result.restoredFromTrash} from trash` : '';
      const importSummary = `Imported to ${targetLabel}: created ${result.created}, merged ${result.merged}${restoredPart}, skipped ${result.skipped}${withheldPart}.`;
      const commitMeta = {
        importSummary,
        targetLabel,
        created: result.created,
        merged: result.merged,
        skipped: result.skipped,
        skippedPreviouslyTrashed: result.skippedPreviouslyTrashed,
        skippedTrashedItems: result.skippedTrashedItems,
        items: result.affectedItems,
      };
      setCommitMessage(importSummary);
      setLastCommitMeta(commitMeta);

      if (onImported) {
        await onImported();
      }

      if (result.affectedItems.length > 0) {
        setPipelineFilter('');
        setPipelineRefreshPolicy('missing');
        setPipelineConfirm({
          importSummary,
          items: result.affectedItems,
        });
        setPipelineEnrichments(new Map());
        setPipelineSelectedIds(new Set());
        setPipelinePolicyLoading(true);
        addToast({
          type: 'info',
          message: `Import saved — choose whether to process ${result.affectedItems.length} link${result.affectedItems.length === 1 ? '' : 's'} now or finish.`,
        });
      } else {
        addToast({
          type: 'info',
          message: 'No valid links to process — all rows were skipped.',
        });
        await openImportReport(commitMeta, new Set());
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Import commit failed.';
      setCommitError(msg);
      addToast({ type: 'error', message: msg });
    } finally {
      setCommitting(false);
    }
  };

  const renderPipelineConfirmPanel = () => {
    if (!pipelineConfirm || processing) return null;

    return (
      <div
        style={{
          ...sectionStyle,
          borderColor: 'var(--accent)',
          background: 'var(--accent-weak)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
            Step 3 — Process imported bookmarks (optional)
          </div>
          <button
            type="button"
            onClick={() => void runSelectedPipeline()}
            disabled={selectedPipelineCount === 0 || pipelinePolicyLoading}
            style={{
              minHeight: 34,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--accent)',
              background: 'var(--accent)',
              color: 'var(--accent-text, #fff)',
              fontSize: 'var(--text-xs)',
              fontWeight: 650,
              cursor: selectedPipelineCount === 0 || pipelinePolicyLoading ? 'not-allowed' : 'pointer',
              opacity: selectedPipelineCount === 0 || pipelinePolicyLoading ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            {pipelinePolicyLoading ? 'Checking existing enrichment…' : `Process selected (${selectedPipelineCount})`}
          </button>
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--er-ok, #3fb950)' }}>Bookmarks are already saved in the database.</strong>{' '}
          {pipelineConfirm.importSummary} Nothing is fetched and no AI provider is called until you confirm
          below. Processing may use your configured paid AI provider. Uncheck links to leave them as
          import-only, or finish now and process them later from Enrichment Hub.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Process existing enrichment
            <select
              value={pipelineRefreshPolicy}
              disabled={pipelinePolicyLoading}
              onChange={(event) => {
                const policy = event.target.value as ImportEnrichmentRefreshPolicy;
                setPipelineRefreshPolicy(policy);
                if (pipelineConfirm) {
                  setPipelineSelectedIds(
                    getDefaultImportPipelineSelection(pipelineConfirm.items, pipelineEnrichments, policy)
                  );
                }
              }}
              style={{
                padding: '5px 8px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 'var(--text-xs)',
              }}
            >
              <option value="missing">Only missing or incomplete (default)</option>
              <option value="older-than-7-days">Also refresh older than 7 days</option>
              <option value="older-than-30-days">Also refresh older than 30 days</option>
              <option value="older-than-90-days">Also refresh older than 90 days</option>
              <option value="all">Reprocess all selected bookmarks</option>
            </select>
          </label>
          {!pipelinePolicyLoading && policySkippedCount > 0 ? (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {policySkippedCount} complete bookmark{policySkippedCount === 1 ? '' : 's'} skipped by this policy.
            </span>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={pipelineFilter}
            onChange={(e) => setPipelineFilter(e.target.value)}
            placeholder="Filter by title or URL…"
            style={{
              flex: '1 1 180px',
              padding: '6px 8px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 'var(--text-xs)',
            }}
          />
          <button
            type="button"
            onClick={() => setPipelineSelectionForFiltered(true)}
            disabled={filteredPipelineItems.length === 0}
            style={{
              padding: '5px 8px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
            }}
          >
            Select {pipelineFilter.trim() ? 'filtered' : 'all'}
          </button>
          <button
            type="button"
            onClick={() => setPipelineSelectionForFiltered(false)}
            disabled={filteredPipelineItems.length === 0}
            style={{
              padding: '5px 8px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
            }}
          >
            Deselect {pipelineFilter.trim() ? 'filtered' : 'all'}
          </button>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {selectedPipelineCount} of {pipelineConfirm.items.length} selected
          </span>
        </div>
        <div
          style={{
            maxHeight: 'min(50vh, 420px)',
            overflow: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--bg)',
          }}
        >
          {filteredPipelineItems.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              No links match this filter.
            </div>
          ) : (
            filteredPipelineItems.map((item) => {
              const checked = pipelineSelectedIds.has(item.itemId);
              const enrichment = pipelineEnrichments.get(item.itemId);
              const complete = isCompleteAiEnrichment(enrichment);
              return (
                <label
                  key={item.itemId}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '8px 10px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => togglePipelineItem(item.itemId, e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        marginRight: 6,
                        padding: '1px 6px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 600,
                        background: item.outcome === 'created' ? 'var(--accent-weak)' : 'var(--bg-hover)',
                        color: item.outcome === 'created' ? 'var(--accent)' : 'var(--text-muted)',
                      }}
                    >
                      {item.outcome === 'created' ? 'new' : 'existing'}
                    </span>
                    <strong style={{ color: 'var(--text)' }}>{item.title || 'Untitled'}</strong>
                    {complete ? (
                      <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>AI enrichment exists</span>
                    ) : null}
                    <div style={{ color: 'var(--text-muted)', wordBreak: 'break-all', marginTop: 2 }}>{item.url}</div>
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => void skipPipelineConfirm()}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Finish without processing
          </button>
        </div>
      </div>
    );
  };

  const renderDestinationControls = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
          Destination
        </div>
        <div style={{ marginTop: 3, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Every selected bookmark will be saved to this location. You can reorganize individual items later.
        </div>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        Project
        <select
          value={selectedProjectId}
          onChange={(event) => {
            setSelectedProjectId(event.target.value);
            setSelectedCollectionId('');
          }}
          disabled={committing || processing}
          style={selectStyle}
        >
          <option value="">Inbox (default)</option>
          {projects.filter((project) => !project.isDefault).map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </label>
      {selectedProjectId ? (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Collection
          <select
            value={selectedCollectionId}
            onChange={(event) => setSelectedCollectionId(event.target.value)}
            disabled={committing || processing}
            style={selectStyle}
          >
            <option value="">{UNFILED_COLLECTION_NAME} (default)</option>
            {filteredCollections.filter((collection) => !collection.isDefault).map((collection) => (
              <option key={collection.id} value={collection.id}>{collection.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <div style={{ padding: '7px 9px', borderRadius: 6, background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
          Collection: {INCOMING_COLLECTION_NAME}
        </div>
      )}
    </div>
  );

  const renderPostSaveStage = () => (
    <div style={{ ...sectionStyle, padding: 14, background: 'var(--bg-panel)' }}>
      {commitMessage ? (
        <div style={{ padding: '9px 11px', borderRadius: 7, background: 'color-mix(in srgb, var(--er-ok, #3fb950) 10%, transparent)', color: 'var(--text)', fontSize: 'var(--text-sm)' }}>
          {commitMessage}
        </div>
      ) : null}
      {processing && processProgress ? (
        <div style={{ padding: '10px 12px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--accent-weak)', fontSize: 'var(--text-xs)', color: 'var(--text)', lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>Processing imported bookmarks</div>
          <div
            role="progressbar"
            aria-label="Import processing progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={processProgressPercent}
            style={{ height: 9, margin: '8px 0', overflow: 'hidden', borderRadius: 999, background: 'var(--bg-hover)' }}
          >
            <div
              style={{
                width: `${processProgressPercent}%`,
                height: '100%',
                borderRadius: 999,
                background: 'var(--accent)',
                transition: 'width 180ms ease-out',
              }}
            />
          </div>
          <div style={{ marginBottom: 5, color: 'var(--text-faint)' }}>{processProgressPercent}% complete</div>
          {processProgress}
          <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
            Progress is checkpointed after each wave and can be resumed if this page closes.
          </div>
          {wavePipelineRunning ? (
            <button type="button" onClick={cancelPipelineProcessing} style={{ ...smallButtonStyle, marginTop: 8 }}>
              Cancel processing
            </button>
          ) : null}
        </div>
      ) : null}
      {commitError ? <div role="alert" style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>{commitError}</div> : null}
      {renderPipelineConfirmPanel()}
    </div>
  );

  const renderImportButton = () => {
    const disabled = committing || processing || !!pipelineConfirm || selectedRows.length === 0;
    return (
      <button
        type="button"
        onClick={handleCommitToDb}
        disabled={disabled}
        style={{
          minHeight: 34,
          padding: '6px 12px',
          borderRadius: 6,
          border: '1px solid var(--accent)',
          background: 'var(--accent)',
          color: 'var(--accent-text, #fff)',
          fontSize: 'var(--text-xs)',
          fontWeight: 650,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          flexShrink: 0,
        }}
      >
        {committing
          ? 'Saving bookmarks…'
          : processing
            ? 'Processing…'
            : `Import ${selectedRows.length} bookmark${selectedRows.length === 1 ? '' : 's'}`}
      </button>
    );
  };

  const renderPreviewTable = () => pipelineConfirm || processing ? renderPostSaveStage() : (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
            Step 2 — Review and save
          </div>
          {sourceLabel ? <div style={{ marginTop: 3, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{sourceLabel}</div> : null}
        </div>
        {renderImportButton()}
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        <span>{selectedRows.length} selected</span>
        <span>{stats.valid} valid URLs</span>
        <span>Invalid URL: {stats.invalid}</span>
        <span>Potential duplicates: {stats.duplicates}</span>
      </div>
      {error ? (
        <div
          role="alert"
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--danger)',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.45,
            padding: '8px',
            borderRadius: 6,
            border: '1px solid rgba(220, 38, 38, 0.35)',
            background: 'rgba(220, 38, 38, 0.06)',
          }}
        >
          {error}
        </div>
      ) : null}
      <div className="ui-responsive-sidecar" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(270px, 0.38fr)', gap: 12, alignItems: 'start' }}>
        <div style={{ minWidth: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', padding: 8, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <input
              type="search"
              value={reviewQuery}
              onChange={(event) => setReviewQuery(event.target.value)}
              placeholder="Filter imported bookmarks…"
              aria-label="Filter imported bookmarks"
              style={{ ...selectStyle, flex: '1 1 190px' }}
            />
            <button type="button" onClick={() => setVisibleRowSelection(true)} style={smallButtonStyle}>Select shown</button>
            <button type="button" onClick={() => setVisibleRowSelection(false)} style={smallButtonStyle}>Clear shown</button>
          </div>
          <div className="scrollbar" style={{ maxHeight: 'min(48vh, 520px)', overflowY: 'auto' }}>
            {visibleRowIndexes.length === 0 ? (
              <div style={{ padding: 18, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No bookmarks match this filter.</div>
            ) : visibleRowIndexes.map((index) => {
              const row = rows[index];
              const valid = isImportableBookmarkUrl(row.url);
              return (
                <label key={`${row.url}-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px', borderBottom: '1px solid var(--border)', cursor: valid ? 'pointer' : 'not-allowed', opacity: valid ? 1 : 0.62 }}>
                  <input
                    type="checkbox"
                    checked={selectedRowIndexes.has(index)}
                    disabled={!valid || committing || processing}
                    onChange={(event) => setSelectedRowIndexes((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(index); else next.delete(index);
                      return next;
                    })}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--text)', fontSize: 'var(--text-xs)' }}>{row.title || 'Untitled'}</strong>
                      {!valid ? <span style={{ color: 'var(--error)', fontSize: 10, fontWeight: 700 }}>Invalid URL</span> : null}
                      {row.folderPath ? <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>{row.folderPath}</span> : null}
                    </span>
                    <span style={{ display: 'block', marginTop: 2, color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.url}</span>
                    {row.description || row.notes ? <span style={{ display: 'block', marginTop: 3, color: 'var(--text-faint)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description || row.notes}</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="ui-responsive-sidecar__aside" style={{ ...sectionStyle, padding: 12, background: 'var(--bg-panel)', position: 'sticky', top: 0 }}>
          {renderDestinationControls()}
          <div style={{ height: 1, background: 'var(--border)' }} />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Saving imports or merges the selected bookmarks. It does not fetch pages or call an AI provider.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            cursor: committing || processing ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={skipPreviouslyTrashed}
            onChange={(e) => {
              const checked = e.target.checked;
              setSkipPreviouslyTrashed(checked);
              try {
                localStorage.setItem(SKIP_TRASHED_IMPORT_KEY, checked ? 'true' : 'false');
              } catch {
                /* ignore */
              }
            }}
            disabled={committing || processing}
            style={{ marginTop: 2 }}
          />
          <span>
            <strong style={{ color: 'var(--text)' }}>Skip links you previously trashed</strong>
            <br />
            Uses a persistent discard list (by URL) so dead or unwanted bookmarks do not come back on
            re-import. Restore from Trash clears the block for that URL.
            {trashedImportMatches.length > 0 ? (
              <>
                {' '}
                <strong style={{ color: 'var(--er-warn, #d29922)' }}>
                  {trashedImportMatches.length} link{trashedImportMatches.length === 1 ? '' : 's'} in this
                  file match.
                </strong>
              </>
            ) : null}
          </span>
        </label>
        {skipPreviouslyTrashed && trashedImportMatches.length > 0 ? (
          <div style={{ marginLeft: 22 }}>
            <button
              type="button"
              onClick={() => setShowTrashedImportPreview((v) => !v)}
              style={{
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: 'var(--accent)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {showTrashedImportPreview ? 'Hide' : 'Show'} withheld links ({trashedImportMatches.length})
            </button>
            {showTrashedImportPreview ? (
              <div
                style={{
                  marginTop: 8,
                  maxHeight: 180,
                  overflow: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--bg)',
                }}
              >
                {trashedImportMatches.slice(0, 100).map((match) => (
                  <div
                    key={normalizeBookmarkUrl(match.url)}
                    style={{
                      padding: '8px 10px',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {match.title || match.url}
                    </div>
                    <div style={{ color: 'var(--text-faint)', wordBreak: 'break-all' }}>{match.url}</div>
                    <div style={{ color: 'var(--er-warn, #d29922)', marginTop: 2 }}>{match.reason}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {processing && processProgress ? (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid var(--accent)',
            background: 'var(--accent-weak)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text)',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>
            Pipeline running — keep this tab open
          </div>
          {processProgress}
          <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
            Progress is saved after each wave; you can resume from the dashboard banner if this tab closes.
          </div>
          {wavePipelineRunning ? (
            <button
              type="button"
              onClick={cancelPipelineProcessing}
              style={{
                marginTop: 8,
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
      {commitError ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>{commitError}</div> : null}
      {commitMessage ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{commitMessage}</div> : null}
      {renderPipelineConfirmPanel()}
    </div>
  );

  const renderFileTab = () => (
    <>
      <div style={sectionStyle}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
          Step 1 — Choose a bookmark file
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Start with known formats, then normalize into one import preview model.
        </div>
        <details style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text)' }}>
            Supported formats &amp; required fields
          </summary>
          <pre
            style={{
              margin: '8px 0 0',
              padding: '8px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.45,
              fontFamily: 'inherit',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}
          >
            {formatAllImportSchemaHelp()}
          </pre>
        </details>
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm,.csv,.json,.js,.txt,text/html,text/csv,application/json,text/plain,application/javascript"
          onChange={handleFilePicked}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleChooseFile}
            disabled={loading}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--accent)',
              background: 'var(--accent)',
              color: 'var(--accent-text, #fff)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: loading ? 'progress' : 'pointer',
            }}
          >
            {loading ? 'Parsing…' : 'Choose file'}
          </button>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Auto-detects JSON/CSV/HTML by content (not just extension), including X bookmarks exports.
          </span>
        </div>
      </div>
      {(rows.length > 0 || error) && renderPreviewTable()}
    </>
  );

  const renderChromeTab = () => (
    <>
      <div style={sectionStyle}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
          Step 1 — Load Chrome bookmarks
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Read the bookmarks currently saved in Chrome, then review exactly what will enter Homebase.
        </div>
        <button
          type="button"
          onClick={loadFromChromeApi}
          disabled={loading}
          style={{
            width: 'fit-content',
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: 'var(--accent-text, #fff)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: loading ? 'progress' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Load from Chrome'}
        </button>
      </div>
      {(rows.length > 0 || error) && renderPreviewTable()}
    </>
  );

  const renderAssistantTab = () => (
    <div style={{ ...sectionStyle, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
          Format assistant
        </div>
        <span style={{ padding: '2px 7px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-faint)', fontSize: 10, fontWeight: 700 }}>
          Not implemented
        </span>
      </div>
      <div style={{ maxWidth: 720, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        This future tool will help map an unsupported bookmark format into the same review workflow.
        It will remain disabled until the mapping behavior, validation, and AI cost confirmation are implemented.
      </div>
      <textarea
        disabled
        aria-label="Unsupported format sample"
        placeholder="Paste an unsupported format sample here in a future version…"
        rows={7}
        style={{ maxWidth: 720, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text-muted)', padding: 8, resize: 'vertical', opacity: 0.65 }}
      />
      <button type="button" disabled style={{ ...smallButtonStyle, width: 'fit-content', cursor: 'not-allowed', opacity: 0.6 }}>
        Generate mapping — not implemented
      </button>
    </div>
  );

  return (
    <div className="scrollbar ui-page-frame" style={{ ...uiPatterns.pageFrame, overflow: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 1320, margin: '0 auto', position: 'relative' }}>
      {importReport ? (
        <ImportReportOverlay
          report={importReport}
          onClose={() => {
            setImportReport(null);
            resetImportSession();
          }}
          onImportAnother={() => {
            setImportReport(null);
            resetImportSession();
          }}
        />
      ) : null}
      <div className="ui-page-header" style={uiPatterns.pageHeader}>
        <div>
          <h1 style={uiPatterns.pageTitle}>
            Import bookmarks
          </h1>
          <p style={uiPatterns.pageDescription}>
            Bring bookmarks into your library first, then choose whether any should be processed with AI.
          </p>
        </div>
        <button
          className="ui-button ui-button--secondary"
          type="button"
          onClick={onBack}
          disabled={processing}
          title={processing ? 'Wait for the pipeline to finish' : undefined}
          style={{
            ...uiPatterns.secondaryButton,
            opacity: processing ? 0.6 : 1,
          }}
        >
          Back to bookmarks
        </button>
      </div>

      <div className="ui-tab-bar" role="tablist" aria-label="Import source" style={uiPatterns.tabBar}>
        {([
          { id: 'file', label: 'Bookmark file' },
          { id: 'chrome', label: 'Chrome bookmarks' },
          { id: 'assistant', label: 'Format assistant · Not implemented' },
        ] as const).map((item) => {
          const active = source === item.id;
          return (
            <button
              className="ui-view-tab"
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => changeSource(item.id)}
              disabled={processing || committing || !!pipelineConfirm}
              style={{
                ...uiPatterns.viewTab(active),
                opacity: processing || committing || pipelineConfirm ? 0.65 : 1,
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
        {source === 'file' && renderFileTab()}
        {source === 'chrome' && renderChromeTab()}
        {source === 'assistant' && renderAssistantTab()}
      </div>
      </div>
    </div>
  );
};

const selectStyle: React.CSSProperties = {
  minHeight: 32,
  padding: '6px 8px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 'var(--text-xs)',
  boxSizing: 'border-box',
};

const smallButtonStyle: React.CSSProperties = {
  minHeight: 30,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text-muted)',
  fontSize: 'var(--text-xs)',
  cursor: 'pointer',
};
