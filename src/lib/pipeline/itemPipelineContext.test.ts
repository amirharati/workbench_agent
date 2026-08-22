import { describe, expect, it } from 'vitest';
import { AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE } from '../enrichment/errorMessages';
import {
  formatPipelineStageHint,
  type ItemPipelineContext,
} from './itemPipelineContext';

describe('formatPipelineStageHint', () => {
  it('keeps a successful fetch visible and explains missing AI configuration', () => {
    const context = {
      enrichment: {
        status: 'ok',
        aiStatus: 'not_configured',
      },
      summary: undefined,
      keyPoints: [],
      references: [],
      acceptedLinks: [],
      suggestedLinks: [],
      primaryCategoryId: null,
      classifyState: 'pending_classify',
      eligible: false,
    } as unknown as ItemPipelineContext;

    expect(formatPipelineStageHint(context)).toBe(AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE);
  });
});
