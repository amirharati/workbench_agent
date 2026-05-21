import type { FetchProvider } from './types';

/** Deterministic provider for tests / offline — returns canned markdown. */
export const noopProvider: FetchProvider = {
  id: 'noop',
  async fetchUrl({ normalizedUrl }) {
    return {
      ok: true,
      markdown: `# Sample page\n\nFetched stub for ${normalizedUrl}\n\nBody text for enrichment testing.`,
      title: 'Sample page',
      rawBytesApprox: 120,
    };
  },
};
