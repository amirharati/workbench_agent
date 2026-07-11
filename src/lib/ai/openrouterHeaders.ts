/** Headers OpenRouter expects (same as chat eval / completions). */

export const OPENROUTER_APP_REFERER = 'https://homebase.local';
export const OPENROUTER_APP_TITLE = 'Homebase';

export function openRouterHeaders(apiKey: string, title = OPENROUTER_APP_TITLE): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': OPENROUTER_APP_REFERER,
    'X-Title': title,
  };
}
