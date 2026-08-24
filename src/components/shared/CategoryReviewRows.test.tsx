import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CategoryChip,
  CategoryOverflowToggle,
  UnmatchedTopicSuggestion,
} from './CategoryReviewRows';

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

  it('shows a child parent as secondary text without repeating a parent label', () => {
    const child = renderToStaticMarkup(
      <CategoryChip label="Habit tracking" parentLabel="Productivity & organization" />
    );
    const parent = renderToStaticMarkup(
      <CategoryChip label="Productivity & organization" parentLabel="Productivity & organization" />
    );

    expect(child).toContain('Habit tracking');
    expect(child).toContain('Productivity &amp; organization');
    expect(parent.match(/Productivity &amp; organization/g)).toHaveLength(1);
    expect(child).toContain('border-radius:4px');
    expect(child).toContain('font-size:9px');
    expect(child).toContain('font-size:8px');
  });

  it('labels unmatched classifier evidence as a suggestion rather than a category', () => {
    const markup = renderToStaticMarkup(
      <UnmatchedTopicSuggestion
        name="Habit tracking"
        description="Tools for monitoring personal habits."
        onReview={() => undefined}
      />
    );

    expect(markup).toContain('Suggested topic · no existing category matched');
    expect(markup).toContain('Habit tracking');
    expect(markup).toContain('Review categories');
  });

  it('renders a compact explicit overflow disclosure', () => {
    const collapsed = renderToStaticMarkup(
      <CategoryOverflowToggle hiddenCount={4} expanded={false} onToggle={() => undefined} />
    );
    const expanded = renderToStaticMarkup(
      <CategoryOverflowToggle hiddenCount={4} expanded onToggle={() => undefined} />
    );

    expect(collapsed).toContain('More (4)');
    expect(collapsed).toContain('aria-expanded="false"');
    expect(expanded).toContain('Show less');
  });
});
