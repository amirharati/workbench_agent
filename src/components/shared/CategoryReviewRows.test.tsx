import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CategoryChip,
  CategoryOverflowToggle,
  SuggestedCategoryRow,
  UnmatchedTopicSuggestion,
} from './CategoryReviewRows';
import { categoryColorStyle } from './categoryColor';

describe('CategoryChip link-quality styling', () => {
  it('keeps category-family colors deterministic', () => {
    const first = categoryColorStyle({ categoryId: 'asr', parentLabel: 'Machine learning & AI research' });
    const sibling = categoryColorStyle({ categoryId: 'nlp', parentLabel: 'Machine learning & AI research' });
    const repeated = categoryColorStyle({ categoryId: 'asr', parentLabel: 'Machine learning & AI research' });

    expect(first).toEqual(sibling);
    expect(first).toEqual(repeated);
  });

  it('renders removal/failure categories as errors', () => {
    const markup = renderToStaticMarkup(
      <CategoryChip
        label="Fetch or AI enrich failed (suggested)"
        categoryId="seed_enrich-fetch-failed"
        muted
      />
    );

    expect(markup).toContain('data-tone="danger"');
    expect(markup).toContain('var(--category-label-bg)');
  });

  it('renders attention categories as warnings and normal topics as categories', () => {
    const warning = renderToStaticMarkup(
      <CategoryChip label="Login or auth required" categoryId="seed_login-auth-required" />
    );
    const topic = renderToStaticMarkup(
      <CategoryChip label="Machine learning" categoryId="seed_machine-learning" />
    );

    expect(warning).toContain('data-tone="warning"');
    expect(topic).toContain('data-tone="topic"');
    expect(topic).toContain('--category-hue:');
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

  it('makes a suggested category label browsable when a category route is available', () => {
    const markup = renderToStaticMarkup(
      <SuggestedCategoryRow
        itemId="item-a"
        link={{ categoryId: 'topic-a', name: 'Planning tools', score: 0.8 }}
        onDone={() => undefined}
        onBrowse={() => undefined}
      />
    );

    expect(markup).toContain('title="View all bookmarks in Planning tools (suggested)"');
    expect(markup).toContain('<button');
  });

  it('labels a redirect as a warning and a real primary category explicitly', () => {
    const warning = renderToStaticMarkup(
      <SuggestedCategoryRow
        itemId="item-a"
        link={{
          categoryId: 'seed_url-redirect-mismatch',
          name: 'URL redirect mismatch',
          score: 0.94,
          isPrimary: false,
        }}
        onDone={() => undefined}
      />
    );
    const primary = renderToStaticMarkup(
      <SuggestedCategoryRow
        itemId="item-a"
        link={{ categoryId: 'asr', name: 'ASR', score: 0.9, isPrimary: true }}
        onDone={() => undefined}
      />
    );

    expect(warning).toContain('URL redirect mismatch (warning)');
    expect(warning).not.toContain('primary');
    expect(primary).toContain('ASR (suggested · primary)');
  });
});
