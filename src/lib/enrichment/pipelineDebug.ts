import { getDB } from '../db';

const DEBUG_FLAG_KEY = 'workbench.pipelineDebugEnabled';

/** Default on while tuning fetch pipeline; flip to false when debug is no longer needed. */
export const PIPELINE_DEBUG_DEFAULT_ENABLED = true;

async function debugStoreInvoke<T>(method: string, args: unknown[] = []): Promise<T> {
  const { isDbWorkerProcess, dbRpc } = await import('../storage/dbClient');
  if (isDbWorkerProcess()) {
    const store = await getDB();
    const fn = (store as unknown as Record<string, (...a: unknown[]) => T>)[method];
    if (typeof fn !== 'function') {
      throw new Error(`Unknown store method: ${method}`);
    }
    return fn(...args);
  }
  return dbRpc<T>('storeInvoke', [method, args]);
}

import type { PipelineDebugAICall } from '../ai/callAudit';

export interface PipelineDebugPhase {
  name: string;
  ms: number;
  ok?: boolean;
  detail?: string;
}

/** Redirect probe + pre-summary verdict + summary prompt mode — debug only. */
export interface PipelineDebugRedirect {
  redirectClass: string;
  resourceMismatch: boolean;
  requestedUrl: string;
  finalUrl: string;
  verdictEligible: boolean;
  /** ok | skipped | not_configured | parse_failed | api_error | skipped:not_eligible */
  verdictStatus?: string;
  verdictMs?: number;
  verdictPageMatchesBookmark?: boolean;
  verdictFetchedPageKind?: string;
  verdictRedirectNote?: string;
  /** prior_verdict = separate redirect judge ran; redirect_fields = summary-only redirect JSON rules */
  summaryPromptMode: 'prior_verdict' | 'redirect_fields' | 'benign_hint' | 'none';
  summaryPageMatchesBookmark?: boolean;
  summaryRedirectNote?: string;
  pendingFetchReview?: boolean;
}

/** Per-item pipeline timing — debug only; stored in `pipeline_debug` table. */
export interface PipelineDebugPayload {
  capturedAt: number;
  url: string;
  fetchMs: number;
  aiMs?: number;
  totalMs: number;
  fetchSourceId?: string;
  enrichStatus: string;
  aiStatus?: string;
  errorCode?: string;
  preferTabSession?: boolean;
  tabId?: number;
  tabSessionOnly?: boolean;
  skipAi?: boolean;
  attempts?: number;
  phases: PipelineDebugPhase[];
  redirect?: PipelineDebugRedirect;
  /** Provider HTTP calls during this enrich (raw response text + model + tokens). */
  aiCalls?: PipelineDebugAICall[];
}

export interface PipelineDebugRecord {
  itemId: string;
  capturedAt: number;
  payload: PipelineDebugPayload;
}

export class PipelineDebugCollector {
  private phaseStart = Date.now();
  readonly phases: PipelineDebugPhase[] = [];

  phase(name: string, ok?: boolean, detail?: string): void {
    const now = Date.now();
    this.phases.push({ name, ms: now - this.phaseStart, ok, detail });
    this.phaseStart = now;
  }
}

export function isPipelineDebugEnabled(): boolean {
  try {
    const raw = localStorage.getItem(DEBUG_FLAG_KEY);
    if (raw === null) return PIPELINE_DEBUG_DEFAULT_ENABLED;
    return raw === '1';
  } catch {
    return PIPELINE_DEBUG_DEFAULT_ENABLED;
  }
}

export function setPipelineDebugEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(DEBUG_FLAG_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export async function putPipelineDebugRecord(record: PipelineDebugRecord): Promise<void> {
  if (!isPipelineDebugEnabled()) return;
  const db = await getDB();
  db.putPipelineDebug(record);
}

export async function getAllPipelineDebugRecords(): Promise<PipelineDebugRecord[]> {
  return debugStoreInvoke<PipelineDebugRecord[]>('getAllPipelineDebug');
}

export async function getPipelineDebugCount(): Promise<number> {
  const rows = await getAllPipelineDebugRecords();
  return rows.length;
}

/** Remove all debug timing rows (safe — does not touch enrichments). */
export async function purgeAllPipelineDebug(): Promise<number> {
  return debugStoreInvoke<number>('clearAllPipelineDebug');
}

export async function saveEnrichPipelineDebug(input: {
  itemId: string;
  url: string;
  collector?: PipelineDebugCollector;
  fetchMs: number;
  aiMs?: number;
  totalMs: number;
  fetchSourceId?: string;
  enrichStatus: string;
  aiStatus?: string;
  errorCode?: string;
  attempts?: number;
  redirect?: PipelineDebugRedirect;
  aiCalls?: PipelineDebugAICall[];
  options?: {
    preferTabSession?: boolean;
    tabId?: number;
    tabSessionOnly?: boolean;
    skipAi?: boolean;
  };
}): Promise<void> {
  if (!isPipelineDebugEnabled()) return;
  await putPipelineDebugRecord({
    itemId: input.itemId,
    capturedAt: Date.now(),
    payload: {
      capturedAt: Date.now(),
      url: input.url,
      fetchMs: input.fetchMs,
      aiMs: input.aiMs,
      totalMs: input.totalMs,
      fetchSourceId: input.fetchSourceId,
      enrichStatus: input.enrichStatus,
      aiStatus: input.aiStatus,
      errorCode: input.errorCode,
      preferTabSession: input.options?.preferTabSession,
      tabId: input.options?.tabId,
      tabSessionOnly: input.options?.tabSessionOnly,
      skipAi: input.options?.skipAi,
      attempts: input.attempts,
      phases: input.collector?.phases ?? [],
      redirect: input.redirect,
      aiCalls: input.aiCalls?.length ? input.aiCalls : undefined,
    },
  });
}
