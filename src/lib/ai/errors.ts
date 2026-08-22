import { AIClientError } from './types';

const USER_PREFIXES = [
  'AI configuration error:',
  'AI authentication failed:',
  'AI credits or quota unavailable:',
  'AI rate limit reached:',
  'AI request timed out:',
  'AI network error:',
  'AI provider error:',
];

function cleanProviderMessage(message: string): string {
  const raw = message.trim();
  if (!raw) return 'The AI request failed.';
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const nested = typeof parsed.error === 'string'
      ? parsed.error
      : parsed.error?.message ?? parsed.message;
    if (nested?.trim()) return nested.trim().slice(0, 500);
  } catch {
    /* plain provider message */
  }
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function inferCode(
  code: AIClientError['code'],
  message: string,
  status?: number
): AIClientError['code'] {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'quota';
  if (status === 429) return 'rate-limit';
  if (/insufficient (?:credits?|balance|quota)|payment required|out of credits?|quota exceeded/i.test(message)) {
    return 'quota';
  }
  if (/invalid api key|unauthori[sz]ed|authentication|forbidden/i.test(message)) {
    return 'auth';
  }
  return code;
}

export function formatAIBackendError(error: AIClientError): string {
  if (USER_PREFIXES.some((prefix) => error.message.startsWith(prefix))) return error.message;
  const detail = cleanProviderMessage(error.message);
  const code = inferCode(error.code, detail, error.status);
  switch (code) {
    case 'invalid-config':
      return `AI configuration error: ${detail} Check Settings > AI.`;
    case 'auth':
      return `AI authentication failed: ${detail} Check the API key in Settings > AI.`;
    case 'quota':
      return `AI credits or quota unavailable: ${detail} Add provider credits or change the API key/provider in Settings > AI.`;
    case 'rate-limit':
      return `AI rate limit reached: ${detail} Wait and try again.`;
    case 'timeout':
      return `AI request timed out: ${detail} Try again or increase the timeout in Settings > AI.`;
    case 'network':
      return `AI network error: ${detail} Check the connection and provider URL in Settings > AI.`;
    case 'provider':
    default:
      return `AI provider error: ${detail} Check the provider and model in Settings > AI.`;
  }
}

export function normalizeAIBackendError(
  error: unknown,
  fallback = 'The AI request failed.'
): AIClientError {
  const original = error instanceof AIClientError
    ? error
    : new AIClientError(
        error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'provider',
        error instanceof Error ? error.message : typeof error === 'string' ? error : fallback
      );
  const detail = cleanProviderMessage(original.message);
  const code = inferCode(original.code, detail, original.status);
  return new AIClientError(code, formatAIBackendError(new AIClientError(code, detail, {
    status: original.status,
  })), { status: original.status });
}

/** Transport/configuration failures should not trigger immediate per-item retries. */
export function isTerminalAIBackendError(error: unknown): boolean {
  return error instanceof AIClientError;
}
