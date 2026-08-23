import { describe, expect, it } from 'vitest';
import { shouldUpgradeBookmarkTitle, titleIsGenericShell } from './eligibility';

describe('bookmark title upgrade policy', () => {
  it('replaces generic browser and site-shell titles with fetched content titles', () => {
    expect(shouldUpgradeBookmarkTitle(
      'Gmail',
      'Quarterly research review',
      'https://mail.google.com/mail/u/0/#inbox/thread'
    )).toBe(true);
    expect(shouldUpgradeBookmarkTitle(
      'Probabilistic inference - YouTube',
      'Probabilistic inference lecture 12',
      'https://www.youtube.com/watch?v=abc'
    )).toBe(true);
    expect(shouldUpgradeBookmarkTitle(
      'https://example.com/research/new-model',
      'A New Model for Structured Inference',
      'https://example.com/research/new-model'
    )).toBe(true);
  });

  it('does not replace a meaningful saved title merely because AI wording differs', () => {
    expect(shouldUpgradeBookmarkTitle(
      'My inference notes for the reading group',
      'A New Model for Structured Inference',
      'https://example.com/research/new-model'
    )).toBe(false);
  });

  it('distinguishes a short live content title from a generic site shell', () => {
    const url = 'https://mail.google.com/mail/u/0/#inbox/thread';
    expect(titleIsGenericShell('Gmail', url)).toBe(true);
    expect(titleIsGenericShell('Meeting', url)).toBe(false);
  });
});
