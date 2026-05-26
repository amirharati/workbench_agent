/** Headers OpenRouter expects (same as chat eval / completions). */

export const OPENROUTER_APP_REFERER = 'https://workbench-agent.local';

export function openRouterHeaders(apiKey: string, title = 'Workbench Agent'): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': OPENROUTER_APP_REFERER,
    'X-Title': title,
  };
}
