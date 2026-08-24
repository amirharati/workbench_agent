import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proposeCategoryDescription, proposeCategoryStructure } from './categoryManagement';

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  complete: vi.fn(),
}));

vi.mock('../ai/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ai/settings')>()),
  loadAISettings: mocks.loadSettings,
}));

vi.mock('../ai/client', () => ({
  runAICompletion: mocks.complete,
}));

const settings = {
  provider: 'openrouter' as const,
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'test-model',
  apiKey: 'key',
  timeoutMs: 45_000,
  temperature: 0.2,
  maxOutputTokens: 700,
  strictModelMatch: false,
  routingMode: 'single' as const,
  taskModels: {},
};

describe('category structure proposal', () => {
  beforeEach(() => {
    mocks.loadSettings.mockReset().mockResolvedValue(settings);
    mocks.complete.mockReset().mockResolvedValue({
      text: JSON.stringify({
        parentName: 'Machine learning operations',
        parentDescription: 'Operating machine-learning systems.',
        childName: 'Model deployment',
        childDescription: 'Deploying trained models to production.',
      }),
      model: 'test-model',
    });
  });

  it('proposes editable parent and child fields from one idea', async () => {
    await expect(proposeCategoryStructure({
      intent: 'tools for deploying ML models',
      mode: 'parent_child',
      nearbyCategories: [],
    })).resolves.toEqual({
      parentName: 'Machine learning operations',
      parentDescription: 'Operating machine-learning systems.',
      childName: 'Model deployment',
      childDescription: 'Deploying trained models to production.',
      generated: true,
    });
    expect(mocks.complete.mock.calls[0]?.[1]?.messages?.[0]?.content)
      .toContain('intersection of the child name and parent domain');
  });

  it('falls back to editable manual fields when AI credentials are unavailable', async () => {
    mocks.loadSettings.mockResolvedValue({ ...settings, apiKey: '' });
    const result = await proposeCategoryStructure({
      intent: 'tools for deploying ML models',
      mode: 'parent_child',
    });
    expect(result).toMatchObject({
      parentName: 'tools for deploying ML models',
      childName: '',
      generated: false,
    });
    expect(result.warning).toContain('Enter the final name fields manually');
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('refreshes a description without changing the user-edited category name', async () => {
    mocks.complete.mockResolvedValueOnce({
      text: JSON.stringify({
        description: 'People, communities, and professional activity related to financial trading.',
      }),
      model: 'test-model',
    });

    await expect(proposeCategoryDescription({
      name: 'Traders',
      kind: 'leaf',
      parent: { name: 'Finance', description: 'Financial markets and money.' },
    })).resolves.toEqual({
      description: 'People, communities, and professional activity related to financial trading.',
      generated: true,
    });
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ content: expect.stringContaining('"exactName":"Traders"') }),
        ]),
      })
    );
    expect(mocks.complete.mock.calls[0]?.[1]?.messages?.[0]?.content)
      .toContain('supplied parent is binding context');
    expect(mocks.complete.mock.calls[0]?.[1]?.messages?.[1]?.content)
      .toContain('"name":"Finance"');
  });
});
