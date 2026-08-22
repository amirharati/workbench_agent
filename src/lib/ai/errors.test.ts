import { describe, expect, it } from 'vitest';
import { AIClientError } from './types';
import { isTerminalAIBackendError, normalizeAIBackendError } from './errors';

describe('AI backend error normalization', () => {
  it('turns an invalid key response into an actionable authentication message', () => {
    const error = normalizeAIBackendError(new AIClientError(
      'provider',
      JSON.stringify({ error: { message: 'Invalid API key' } }),
      { status: 401 }
    ));

    expect(error.code).toBe('auth');
    expect(error.message).toContain('AI authentication failed: Invalid API key');
    expect(error.message).toContain('Settings > AI');
    expect(isTerminalAIBackendError(error)).toBe(true);
  });

  it('recognizes insufficient credits even when the provider omits HTTP 402', () => {
    const error = normalizeAIBackendError(
      new AIClientError('provider', 'Insufficient credits for this request')
    );

    expect(error.code).toBe('quota');
    expect(error.message).toContain('AI credits or quota unavailable');
  });

  it('keeps already normalized messages stable', () => {
    const once = normalizeAIBackendError(new AIClientError('rate-limit', 'Too many requests', {
      status: 429,
    }));
    const twice = normalizeAIBackendError(once);

    expect(twice.message).toBe(once.message);
    expect(twice.message.match(/AI rate limit reached:/g)).toHaveLength(1);
  });
});
