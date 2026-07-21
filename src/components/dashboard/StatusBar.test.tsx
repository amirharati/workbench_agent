import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StatusBar } from './StatusBar';

describe('StatusBar', () => {
  it('exposes semantic tones and live-region roles without hardcoded palettes', () => {
    const markup = renderToStaticMarkup(
      <StatusBar
        messages={[
          { id: 'warning', type: 'warning', message: 'Check this setting.' },
          { id: 'error', type: 'error', message: 'Save failed.' },
          { id: 'info', type: 'info', message: 'Sync complete.' },
        ]}
        onDismiss={vi.fn()}
      />
    );

    expect(markup).toContain('data-tone="warning"');
    expect(markup).toContain('data-tone="error"');
    expect(markup).toContain('data-tone="info"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('role="status"');
  });
});
