import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ButtonDanger,
  ButtonGhost,
  ButtonPrimary,
  IconButton,
  Input,
  Panel,
} from './primitives';

describe('shared UI primitives', () => {
  it('keeps caller classes while applying the shared panel class', () => {
    const markup = renderToStaticMarkup(<Panel className="custom-panel" />);

    expect(markup).toContain('class="ui-panel custom-panel"');
  });

  it('maps button variants to class-backed interaction styles', () => {
    expect(renderToStaticMarkup(<ButtonGhost>Secondary</ButtonGhost>)).toContain(
      'class="ui-button ui-button--secondary"'
    );
    expect(renderToStaticMarkup(<ButtonPrimary>Primary</ButtonPrimary>)).toContain(
      'class="ui-button ui-button--primary"'
    );
    expect(renderToStaticMarkup(<ButtonDanger>Danger</ButtonDanger>)).toContain(
      'class="ui-button ui-button--danger"'
    );
    expect(renderToStaticMarkup(<IconButton aria-label="More" />)).toContain(
      'class="ui-button ui-button--icon"'
    );
  });

  it('applies the shared field behavior without dropping caller classes', () => {
    const markup = renderToStaticMarkup(<Input className="custom-input" />);

    expect(markup).toContain('class="ui-field custom-input"');
  });
});
