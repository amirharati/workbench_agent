import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createImportPipelineJob,
  isImportPipelineJobTerminal,
  reconcileImportPipelineJob,
  shouldFinalizeImportPipelineItem,
} from './importPipelineJob';

const mocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  getEnrichment: vi.fn(),
  checkEligibility: vi.fn(),
  removeEntry: vi.fn(),
}));

vi.mock('../backupFolder', () => ({
  readJsonFromBackupFolder: vi.fn(),
  writeJsonToBackupFolder: vi.fn(async () => ({ ok: true })),
  requireWritableBackupFolder: vi.fn(async () => ({ removeEntry: mocks.removeEntry })),
}));
vi.mock('../db', () => ({ getItem: mocks.getItem }));
vi.mock('../enrichment', () => ({
  getEnrichment: mocks.getEnrichment,
  checkEligibility: mocks.checkEligibility,
}));
vi.mock('../categorization/linkQuality', () => ({
  fetchAttemptedForLinkQuality: (enrichment: { status?: string } | undefined) =>
    Boolean(enrichment?.status && enrichment.status !== 'none'),
}));
vi.mock('./downstreamEligible', () => ({
  isDownstreamClassifyEligible: vi.fn(() => false),
}));

describe('import pipeline job lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a partial checkpoint resumable', () => {
    const job = createImportPipelineJob(['a', 'b', 'c']);
    job.completedItemIds = ['a', 'b'];
    expect(isImportPipelineJobTerminal(job)).toBe(false);
  });

  it('treats completed and cancelled jobs as terminal', () => {
    const completed = createImportPipelineJob(['a', 'b']);
    completed.completedItemIds = ['a', 'b'];
    expect(isImportPipelineJobTerminal(completed)).toBe(true);

    const cancelled = createImportPipelineJob(['a', 'b']);
    cancelled.lastError = 'Cancelled';
    expect(isImportPipelineJobTerminal(cancelled)).toBe(true);
  });

  it('finalizes terminal skips and failures instead of offering a false resume', () => {
    expect(
      shouldFinalizeImportPipelineItem({
        itemExists: true,
        hasUrl: true,
        fetchAttempted: false,
        downstreamEligible: false,
        enrichEligible: false,
      })
    ).toBe(true);
    expect(
      shouldFinalizeImportPipelineItem({
        itemExists: true,
        hasUrl: true,
        fetchAttempted: true,
        downstreamEligible: false,
        enrichEligible: true,
      })
    ).toBe(true);
    expect(
      shouldFinalizeImportPipelineItem({
        itemExists: true,
        hasUrl: true,
        fetchAttempted: false,
        downstreamEligible: false,
        enrichEligible: true,
        batchSettled: true,
      })
    ).toBe(true);
  });

  it('keeps only unattempted actionable or downstream work resumable', () => {
    expect(
      shouldFinalizeImportPipelineItem({
        itemExists: true,
        hasUrl: true,
        fetchAttempted: false,
        downstreamEligible: false,
        enrichEligible: true,
      })
    ).toBe(false);
    expect(
      shouldFinalizeImportPipelineItem({
        itemExists: true,
        hasUrl: true,
        fetchAttempted: true,
        downstreamEligible: true,
        enrichEligible: false,
      })
    ).toBe(false);
  });

  it('clears an old no-error checkpoint whose leftovers are terminal skips', async () => {
    const job = createImportPipelineJob(['done', 'unsupported']);
    job.runner = 'scoped_wave';
    job.completedItemIds = ['done'];
    mocks.getItem.mockResolvedValue({
      id: 'unsupported',
      url: 'http://localhost/private',
      title: 'Local page',
      collectionIds: [],
      tags: [],
      created_at: 1,
      updated_at: 1,
      source: 'bookmark',
    });
    mocks.getEnrichment.mockResolvedValue(undefined);
    mocks.checkEligibility.mockReturnValue({ eligible: false, reason: 'excluded_localhost' });

    await expect(reconcileImportPipelineJob(job)).resolves.toBeNull();
    expect(mocks.removeEntry).toHaveBeenCalledWith('import-pipeline-job.json');
  });
});
