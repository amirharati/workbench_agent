import {
  formatClassifyDoneModalSummary,
  formatClassifyRunSummary,
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

  console.log('pipelineBatchReport.test.ts: all tests passed');
}

runTests();
