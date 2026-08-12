import { describe, expect, it } from 'vitest';
import { pipelineProgressBar } from './itemPipeline';

describe('pipelineProgressBar', () => {
  it('keeps a large job aligned with overall completed items across every stage', () => {
    const phases = ['enrich', 'embed', 'classify', 'save'] as const;
    const percents = phases.map((phase) => pipelineProgressBar({
      phase,
      label: `${phase} stage-local 1/1`,
      current: 1,
      total: 1,
      overallCurrent: 540,
      overallTotal: 3_000,
    }).percent);

    expect(percents).toEqual([18, 18, 18, 18]);
  });

  it('does not let stage-local completion replace whole-job progress', () => {
    const bar = pipelineProgressBar({
      phase: 'classify',
      label: 'Classification batch 1/1',
      current: 1,
      total: 1,
      overallCurrent: 12,
      overallTotal: 100,
    });

    expect(bar.completed).toBe(12);
    expect(bar.total).toBe(100);
    expect(bar.percent).toBe(13);
  });

  it('still gives a one-item job useful stage movement', () => {
    const values = ['prep', 'enrich', 'embed', 'classify', 'save', 'done'].map((phase) =>
      pipelineProgressBar({
        phase: phase as 'prep' | 'enrich' | 'embed' | 'classify' | 'save' | 'done',
        label: phase,
        current: phase === 'done' ? 1 : 0,
        total: 1,
      }).percent
    );

    expect(values).toEqual([0, 15, 55, 80, 95, 100]);
  });
});
