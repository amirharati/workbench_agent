import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PipelineHubViewTabs, resolvePipelineHubView } from './PipelineHubView';

describe('PipelineHubView navigation', () => {
  it('restores the flat review destination from the previous nested state', () => {
    expect(resolvePipelineHubView('enrichment', 'queue')).toBe('enrichment');
    expect(resolvePipelineHubView('categories', 'queue')).toBe('classification');
    expect(resolvePipelineHubView('categories', 'taxonomy')).toBe('taxonomy');
  });

  it('presents enrichment, classification, and taxonomy as peer views', () => {
    const markup = renderToStaticMarkup(
      <PipelineHubViewTabs activeView="classification" onChange={vi.fn()} />
    );

    expect(markup).toContain('data-enrichment-hub-views="true"');
    expect(markup).toContain('aria-label="Enrichment Hub view"');
    expect(markup).toContain('Enrichment review');
    expect(markup).toContain('Classification review');
    expect(markup).toContain('Taxonomy');
    expect(markup.match(/role="tab"/g)).toHaveLength(3);
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
  });
});
