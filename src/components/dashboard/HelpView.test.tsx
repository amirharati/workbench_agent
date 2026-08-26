// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { filterHelpTopics, HelpMediaGallery, HelpView, HELP_TOPICS } from './HelpView';

describe('HelpView', () => {
  it('documents the redesigned product rather than the removed split-Home workflow', () => {
    const markup = renderToStaticMarkup(<HelpView />);

    expect(markup).toContain('aria-label="Search Help"');
    expect(markup).toContain('How Homebase is organized');
    expect(markup).toContain('Home · Overview');
    expect(markup).toContain('Inbox / Incoming');
    expect(markup).toContain('Add to workspace');
    expect(markup).toContain('Organize…');
    expect(markup).toContain('ml in trading');
    expect(markup).toContain('site:arxiv.org');
    expect(markup).toContain('Exact rules first; semantics remain visible');
    expect(markup).toContain('Backup, restore, and recovery');
    expect(markup).toContain('workbench.sqlite');
    expect(markup).toContain('workbench-content.sqlite');
    expect(markup).toContain('Fetch service v2');
    expect(markup).toContain('Durable progress');
    expect(markup).toContain('Two classification signals');
    expect(markup).toContain('No matching category');
    expect(markup).toContain('Suggested topic · no existing category matched');
    expect(markup).toContain('A mixed result is an informational completion report');
    expect(markup).toContain('Use <strong>More</strong>');
    expect(markup).toContain('Copy, move, remove, and restore');
    expect(markup).toContain('Destination browser');
    expect(markup).toContain('release the drag over the <strong>project</strong>');
    expect(markup).toContain('Projects and quick access');
    expect(markup).not.toContain('Drag the horizontal divider');
    expect(markup).not.toContain('tab strip appears at the bottom of Home');
    expect(markup).not.toContain('Processing Digest');
    expect(markup).not.toContain('Images and videos can be attached');
  });

  it('filters topics across titles, summaries, groups, and explicit keywords', () => {
    expect(filterHelpTopics('dropbox').map((topic) => topic.id)).toEqual(['first-run']);
    expect(filterHelpTopics('named workspace').map((topic) => topic.id)).toContain('workspaces-tabs');
    expect(filterHelpTopics('Safety recovery').map((topic) => topic.id)).toContain('backup-restore');
    expect(filterHelpTopics('no match').map((topic) => topic.id)).toContain('enrichment');
    expect(filterHelpTopics('legacy fetch').map((topic) => topic.id)).toEqual(expect.arrayContaining([
      'enrichment',
      'settings-shortcuts',
    ]));
    expect(filterHelpTopics('no-such-help-topic')).toEqual([]);
    expect(filterHelpTopics('')).toBe(HELP_TOPICS);
  });

  it('has unique anchors and covers every release-critical help area', () => {
    const ids = HELP_TOPICS.map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      'first-run',
      'mental-model',
      'home-library',
      'capture-edit',
      'projects-collections',
      'search',
      'workspaces-tabs',
      'import',
      'move-remove',
      'enrichment',
      'backup-restore',
      'settings-shortcuts',
    ]));
  });

  it('renders optional image and video media without requiring empty placeholders', () => {
    expect(renderToStaticMarkup(<HelpMediaGallery />)).toBe('');

    const markup = renderToStaticMarkup(
      <HelpMediaGallery media={[
        { kind: 'image', src: '/help/library.webp', alt: 'Library with an item selected', caption: 'Select an item to edit it.' },
        { kind: 'video', src: '/help/capture.webm', title: 'Capture a page', poster: '/help/capture.webp', caption: 'Save from the side panel.' },
      ]} />
    );

    expect(markup).toContain('data-kind="image"');
    expect(markup).toContain('alt="Library with an item selected"');
    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain('data-kind="video"');
    expect(markup).toContain('controls=""');
    expect(markup).toContain('preload="metadata"');
    expect(markup).toContain('Select an item to edit it.');
    expect(markup).toContain('Save from the side panel.');
  });
});
