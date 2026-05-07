export type AIProvider = 'openrouter' | 'chrome-native';

export type AITaskType = 'general' | 'summarize' | 'tag';

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
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  taskType?: AITaskType;
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
  code: 'invalid-config' | 'timeout' | 'rate-limit' | 'auth' | 'provider' | 'network';
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
