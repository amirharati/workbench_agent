import type { AITaskType, AICompletionRequest, AICompletionResponse } from './types';

/** One completed (or failed) provider HTTP call — proof for pipeline debug. */
export interface PipelineDebugAICall {
  callId: string;
  /** Logical step: redirect_verdict, enrich_summary, classify_topic, … */
  purpose: string;
  taskType: AITaskType;
  at: number;
  durationMs: number;
  model: string;
  requestedModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Raw provider response text (truncated) — not re-parsed outcome */
  responseText: string;
  promptChars: number;
  ok: boolean;
  error?: string;
}

export type AICallAuditHook = (record: PipelineDebugAICall) => void;

export type AICallAuditContext = {
  purpose: string;
  record: AICallAuditHook;
};

const RESPONSE_TEXT_MAX = 4_000;

export function promptCharCount(messages: AICompletionRequest['messages']): number {
  return messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
}

export function recordAICallAudit(input: {
  audit: AICallAuditContext;
  taskType: AITaskType;
  startedAt: number;
  messages: AICompletionRequest['messages'];
  response?: AICompletionResponse;
  error?: string;
}): void {
  const { audit, taskType, startedAt, messages, response, error } = input;
  audit.record({
    callId: crypto.randomUUID(),
    purpose: audit.purpose,
    taskType,
    at: startedAt,
    durationMs: Date.now() - startedAt,
    model: response?.model ?? '',
    requestedModel: response?.requestedModel,
    inputTokens: response?.usage?.inputTokens,
    outputTokens: response?.usage?.outputTokens,
    totalTokens: response?.usage?.totalTokens,
    responseText: (response?.text ?? '').slice(0, RESPONSE_TEXT_MAX),
    promptChars: promptCharCount(messages),
    ok: Boolean(response?.text) && !error,
    error,
  });
}
