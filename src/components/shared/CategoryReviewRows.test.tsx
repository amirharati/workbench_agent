import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CategoryChip } from './CategoryReviewRows';

describe('CategoryChip link-quality styling', () => {
  it('renders removal/failure categories as errors', () => {
    const markup = renderToStaticMarkup(
      <CategoryChip
        label="Fetch or AI enrich failed (suggested)"
        categoryId="seed_enrich-fetch-failed"
        muted
      />
    );

    expect(markup).toContain('var(--error-weak)');
    expect(markup).toContain('var(--error)');
  });

  it('renders attention categories as warnings and normal topics as categories', () => {
    const warning = renderToStaticMarkup(
      <CategoryChip label="Login or auth required" categoryId="seed_login-auth-required" />
    );
    const topic = renderToStaticMarkup(
      <CategoryChip label="Machine learning" categoryId="seed_machine-learning" />
    );

    expect(warning).toContain('var(--warning-weak)');
    expect(warning).toContain('var(--warning)');
    expect(topic).toContain('var(--accent-weak)');
    expect(topic).toContain('var(--accent)');
  });
});
