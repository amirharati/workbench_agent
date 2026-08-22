export type AIProvider = 'openrouter' | 'chrome-native';

export type AITaskType = 'general' | 'summarize' | 'tag' | 'redirect_verdict' | 'vision';

export type AIMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface AISettings {
  provider: AIProvider;
  /**
   * Provider root URL (without trailing /chat/completions).
   * Example: https://openrouter.ai/api/v1
   */
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  temperature: number;
  maxOutputTokens: number;
  strictModelMatch: boolean;
  routingMode: 'single' | 'by-task';
  taskModels?: Partial<Record<AITaskType, string>>;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AIMessageContentPart[];
}

import type { AICallAuditContext } from './callAudit';

export interface AICompletionRequest {
  messages: AIMessage[];
  taskType?: AITaskType;
  signal?: AbortSignal;
  /** When set, each provider HTTP call is recorded (model, tokens, raw response text). */
  audit?: AICallAuditContext;
}

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AICompletionResponse {
  text: string;
  model: string;
  requestedModel?: string;
  modelMismatch?: boolean;
  usage?: AIUsage;
}

export class AIClientError extends Error {
  code: 'invalid-config' | 'timeout' | 'rate-limit' | 'auth' | 'quota' | 'provider' | 'network';
  status?: number;

  constructor(
    code: AIClientError['code'],
    message: string,
    options?: { status?: number }
  ) {
    super(message);
    this.name = 'AIClientError';
    this.code = code;
    this.status = options?.status;
  }
}
