import { AIClientError, AICompletionRequest, AICompletionResponse, AISettings } from '../types';

interface OpenRouterChatResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

const buildEndpoint = (baseUrl: string): string => {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new AIClientError('invalid-config', 'AI base URL is required.');
  }
  return `${trimmed}/chat/completions`;
};

const toMessageText = (
  content: string | Array<{ type?: string; text?: string }> | undefined
): string => {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join('\n');
};

const toErrorCode = (status: number): AIClientError['code'] => {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  return 'provider';
};

export const runOpenRouterCompletion = async (
  settings: AISettings,
  request: AICompletionRequest,
  effectiveModel: string
): Promise<AICompletionResponse> => {
  if (!settings.apiKey.trim()) {
    throw new AIClientError('invalid-config', 'Missing API key. Add one in Settings > AI.');
  }
  if (!effectiveModel.trim()) {
    throw new AIClientError('invalid-config', 'Missing model id. Add one in Settings > AI.');
  }
  if (!request.messages.length) {
    throw new AIClientError('invalid-config', 'At least one message is required.');
  }

  const endpoint = buildEndpoint(settings.baseUrl);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), settings.timeoutMs);

  const abortListener = () => controller.abort();
  if (request.signal) {
    if (request.signal.aborted) {
      controller.abort();
    } else {
      request.signal.addEventListener('abort', abortListener);
    }
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: effectiveModel,
        messages: request.messages,
        temperature: settings.temperature,
        max_tokens: settings.maxOutputTokens,
      }),
    });

    const payload = (await response.json()) as OpenRouterChatResponse;
    if (!response.ok) {
      const message =
        payload.error?.message?.trim() ||
        `Provider request failed with status ${response.status}.`;
      throw new AIClientError(toErrorCode(response.status), message, {
        status: response.status,
      });
    }

    const content = toMessageText(payload.choices?.[0]?.message?.content);
    if (!content) {
      throw new AIClientError('provider', 'Provider returned an empty response.');
    }

    const resolvedModel = payload.model || effectiveModel;
    const modelMismatch =
      Boolean(payload.model) && payload.model!.trim().toLowerCase() !== effectiveModel.trim().toLowerCase();
    if (settings.strictModelMatch && modelMismatch) {
      throw new AIClientError(
        'provider',
        `Provider returned model "${resolvedModel}" but "${effectiveModel}" was requested.`
      );
    }

    return {
      text: content,
      model: resolvedModel,
      requestedModel: effectiveModel,
      modelMismatch,
      usage: {
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
        totalTokens: payload.usage?.total_tokens,
      },
    };
  } catch (error) {
    if (error instanceof AIClientError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AIClientError('timeout', `AI request timed out or was aborted.`);
    }
    throw new AIClientError('network', 'Network error while calling AI provider.');
  } finally {
    globalThis.clearTimeout(timeout);
    if (request.signal) {
      request.signal.removeEventListener('abort', abortListener);
    }
  }
};
