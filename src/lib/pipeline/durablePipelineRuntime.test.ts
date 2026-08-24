import { describe, expect, it } from 'vitest';
import { isRuntimeModuleLoadError } from './durablePipelineEngine';

describe('durable pipeline runtime recovery', () => {
  it('recognizes missing lazy chunks as a coordinator-generation failure', () => {
    expect(isRuntimeModuleLoadError(
      new TypeError(
        'Failed to fetch dynamically imported module: chrome-extension://id/assets/scopedPipelineRows-old.js'
      )
    )).toBe(true);
    expect(isRuntimeModuleLoadError(new Error('ChunkLoadError: Loading chunk 42 failed'))).toBe(true);
  });

  it('does not retry ordinary provider or model failures as runtime changes', () => {
    expect(isRuntimeModuleLoadError(new Error('OpenRouter returned HTTP 401'))).toBe(false);
    expect(isRuntimeModuleLoadError(new Error('No usable article text was extracted'))).toBe(false);
  });
});
