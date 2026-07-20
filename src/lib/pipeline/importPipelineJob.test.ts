import { describe, expect, it } from 'vitest';
import {
  createImportPipelineJob,
  isImportPipelineJobTerminal,
} from './importPipelineJob';

describe('import pipeline job lifecycle', () => {
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
});
