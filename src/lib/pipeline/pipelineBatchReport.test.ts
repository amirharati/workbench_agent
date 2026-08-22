import {
  formatClassifyDoneModalSummary,
  formatClassifyRunSummary,
  formatPipelineCompletionSummary,
  resolveClassifyDoneModalTone,
} from './pipelineDictionary';
import { emptyTopicClassifySummary } from '../categorization/classifyPolicy';
import type { TopicClassifySummary } from '../categorization/types';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
}

function baseSummary(overrides: Partial<TopicClassifySummary> = {}): TopicClassifySummary {
  return {
    ...emptyTopicClassifySummary(),
    totalConsidered: 200,
    processed: 200,
    assignedPrimary: 180,
    classifiedSpecific: 180,
    classifiedGeneral: 5,
    pendingDiscover: 15,
    ...overrides,
  };
}

function runTests(): void {
  const summary = baseSummary();
  const runLine = formatClassifyRunSummary(summary, 250);
  assert(runLine.includes('180 specific'), 'run summary includes classified specific');
  assert(runLine.includes('250 selected'), 'run summary includes selection count when differs from processed');

  const modalLine = formatClassifyDoneModalSummary({
    summary,
    selectedCount: 200,
    reportRowCount: 50,
    reportRowTotal: 200,
  });
  assert(modalLine.includes('180 specific'), 'modal summary leads with run totals');
  assert(modalLine.includes('50 of 200'), 'modal notes partial row table');

  assert(
    resolveClassifyDoneModalTone(summary) === 'success',
    'mostly successful run uses success tone'
  );

  const allFailSummary = baseSummary({
    classifiedSpecific: 0,
    classifiedGeneral: 0,
    llmErrors: 12,
    processed: 12,
  });
  assert(
    resolveClassifyDoneModalTone(allFailSummary) === 'error',
    'all-LLM-error run stays error tone'
  );

  assert(
    formatPipelineCompletionSummary({ enriched: 342, classified: 261, skipped: 2, failed: 115 }) ===
      '342 enriched · 261 classified · 2 skipped · 115 unavailable',
    'mixed completed batch calls per-link misses unavailable rather than failed'
  );
  assert(
    formatPipelineCompletionSummary({ failed: 1 }) === '1 failed',
    'all-failed batch remains an honest failure'
  );
  assert(
    formatPipelineCompletionSummary({
      fetched: 1,
      aiError: 'AI authentication failed: Invalid API key.',
    }) === '1 fetched · AI authentication failed: Invalid API key.',
    'fetch success with AI failure is never labelled enriched'
  );

  console.log('pipelineBatchReport.test.ts: all tests passed');
}

runTests();
