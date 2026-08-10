import React, { useMemo, useState } from 'react';
import { ChevronDown, Play } from 'lucide-react';
import type { EnrichmentHubRow } from '../../lib/pipeline/pipelineHubQueries';
import {
  computeChainedHubBulkTargets,
  computeHubBulkStageCounts,
  countHubRowsCompleteForBulk,
  fillPipelineGaps,
  previewChainedCountIfStepChecked,
  HUB_BULK_CONFIRM_THRESHOLD,
  HUB_BULK_STAGE_LABELS,
  HUB_BULK_STAGE_ORDER,
  isGapFilledStage,
  itemLabelsFromRows,
  type HubBulkScopeMode,
  type HubBulkStageKey,
} from '../../lib/pipeline/hubBulkStages';
import { usePipelineProgress } from './PipelineProgressProvider';
import { HubActionConfirmModal } from './HubActionConfirmModal';

const STAGE_KEYS = HUB_BULK_STAGE_ORDER;

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 12px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  cursor: 'pointer',
};

export interface HubBulkStagedActionsProps {
  selectedRows: EnrichmentHubRow[];
  /** Disable submission while the current dashboard already observes a job. */
  disabled?: boolean;
}

type PendingRun = {
  steps: HubBulkStageKey[];
  mode: HubBulkScopeMode;
  totalTargets: number;
};

export const HubBulkStagedActions: React.FC<HubBulkStagedActionsProps> = ({
  selectedRows,
  disabled = false,
}) => {
  const pipeline = usePipelineProgress();
  const running = disabled || pipeline.isRunning;
  const jobBusy = pipeline.isRunning;

  const [expanded, setExpanded] = useState(false);
  const [scopeMode, setScopeMode] = useState<HubBulkScopeMode>('missing');
  const [checked, setChecked] = useState<Set<HubBulkStageKey>>(
    () => new Set(['classify'])
  );
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);

  const effectiveChecked = useMemo(() => fillPipelineGaps(checked), [checked]);

  const checkedSteps = useMemo(
    () => HUB_BULK_STAGE_ORDER.filter((k) => effectiveChecked.has(k)),
    [effectiveChecked]
  );

  const chainedTargets = useMemo(
    () => computeChainedHubBulkTargets(selectedRows, checkedSteps, scopeMode),
    [selectedRows, checkedSteps, scopeMode]
  );

  const stageCounts = useMemo(
    () => computeHubBulkStageCounts(selectedRows, scopeMode),
    [selectedRows, scopeMode]
  );

  const countsByKey = useMemo(
    () => new Map(stageCounts.map((s) => [s.key, s])),
    [stageCounts]
  );

  const selectedCount = selectedRows.length;
  const completeCount = useMemo(
    () => countHubRowsCompleteForBulk(selectedRows),
    [selectedRows]
  );

  const targetCountForStep = (key: HubBulkStageKey): number =>
    chainedTargets.get(key)?.length ?? 0;

  const runPreview = useMemo(() => {
    const parts = checkedSteps
      .map((key) => {
        const n = targetCountForStep(key);
        if (n === 0) return null;
        const label = countsByKey.get(key)?.label ?? HUB_BULK_STAGE_LABELS[key];
        return `${label}: ${n.toLocaleString()} item${n === 1 ? '' : 's'}`;
      })
      .filter(Boolean);
    if (!parts.length) return '';
    const gapNote =
      effectiveChecked.size > checked.size ? ' · in-between steps auto-included' : '';
    return checkedSteps.length > 1
      ? `${parts.join(' → ')}${gapNote}`
      : parts.join(' · ');
  }, [checkedSteps, countsByKey, effectiveChecked.size, checked.size, chainedTargets]);

  const totalTargetsForRun = useMemo(() => {
    let max = 0;
    for (const key of checkedSteps) {
      const n = targetCountForStep(key);
      if (n > max) max = n;
    }
    return max;
  }, [checkedSteps, chainedTargets]);

  const toggleStage = (key: HubBulkStageKey) => {
    if (isGapFilledStage(key, checked, effectiveChecked)) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const executeRun = async (steps: HubBulkStageKey[], mode: HubBulkScopeMode) => {
    const labels = itemLabelsFromRows(selectedRows);
    const targets = computeChainedHubBulkTargets(selectedRows, steps, mode);

    for (const key of HUB_BULK_STAGE_ORDER) {
      if (!steps.includes(key)) continue;

      const targetIds = targets.get(key) ?? [];
      if (!targetIds.length) continue;

      if (key === 'fetch') {
        await pipeline.runBatch(targetIds, {
          title: `Re-fetch (${targetIds.length})`,
          enrich: true,
          classify: false,
          processAll: true,
          forceEnrich: true,
          cancellable: true,
          collectItemResults: true,
          skipDiscover: true,
          drainPendingClassifyQueue: false,
          itemLabels: labels,
        });
      } else if (key === 'summarize') {
        await pipeline.runReextractBatch(targetIds, {
          title: `Re-summarize (${targetIds.length})`,
          itemLabels: labels,
          force: mode === 'all',
        });
      } else if (key === 'embed') {
        await pipeline.runEmbedBatch(targetIds, {
          title: `Re-embed (${targetIds.length})`,
        });
      } else if (key === 'classify') {
        await pipeline.runBatch(targetIds, {
          title: `Classify (${targetIds.length})`,
          enrich: false,
          classify: true,
          processAll: true,
          forceReclassify: true,
          collectItemResults: true,
          skipDiscover: true,
          drainPendingClassifyQueue: false,
          itemLabels: labels,
        });
      }
    }
  };

  const handleRunClick = () => {
    if (running || !checkedSteps.length) return;
    const hasWork = checkedSteps.some((k) => targetCountForStep(k) > 0);
    if (!hasWork) return;

    if (totalTargetsForRun > HUB_BULK_CONFIRM_THRESHOLD) {
      setPendingRun({
        steps: checkedSteps,
        mode: scopeMode,
        totalTargets: totalTargetsForRun,
      });
      return;
    }
    void executeRun(checkedSteps, scopeMode).catch(() => {
      /* modal */
    });
  };

  const stageCountLabel = (key: HubBulkStageKey): string => {
    const isActive = effectiveChecked.has(key);
    const isGap = isGapFilledStage(key, checked, effectiveChecked);
    const count = isActive
      ? targetCountForStep(key)
      : previewChainedCountIfStepChecked(selectedRows, checked, key, scopeMode);
    const n = count.toLocaleString();

    if (!isActive) {
      if (scopeMode === 'all') {
        return `${selectedCount.toLocaleString()} eligible`;
      }
      if (count === 0) {
        return 'none eligible';
      }
      return `${n} eligible`;
    }

    if (scopeMode === 'all') {
      return `runs on all ${n} selected`;
    }
    if (count === 0) {
      return 'none will run';
    }
    if (isGap) {
      return `${n} will run (in-between)`;
    }
    return `${n} will run`;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        disabled={running}
        style={{
          ...btnStyle,
          borderColor: expanded ? 'var(--accent)' : 'var(--border)',
          cursor: running ? 'wait' : 'pointer',
          opacity: running ? 0.7 : 1,
        }}
        title="Each step includes the previous step’s targets, left to right"
      >
        Run steps
        <ChevronDown
          size={13}
          style={{
            transform: expanded ? 'rotate(180deg)' : undefined,
            transition: 'transform 0.15s',
          }}
        />
      </button>

      {expanded ? (
        <div
          style={{
            flexBasis: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            paddingTop: 4,
            borderTop: '1px solid color-mix(in srgb, var(--accent) 25%, var(--border))',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              lineHeight: 1.45,
            }}
          >
            <strong style={{ color: 'var(--text)' }}>
              {selectedCount.toLocaleString()} selected
            </strong>
            {scopeMode === 'missing' && completeCount > 0 ? (
              <> · {completeCount.toLocaleString()} fully enriched</>
            ) : null}
            {' '}
            — left → right: each step runs on items missing that step plus everything the
            step before it runs on. Gaps between checked steps are filled automatically.
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
            }}
          >
            {STAGE_KEYS.map((key) => {
              const isChecked = effectiveChecked.has(key);
              const isGap = isGapFilledStage(key, checked, effectiveChecked);
              return (
                <label
                  key={key}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text)',
                    cursor: running || isGap ? 'default' : 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={running || isGap}
                    onChange={() => toggleStage(key)}
                  />
                  <span style={{ fontWeight: 600 }}>{HUB_BULK_STAGE_LABELS[key]}</span>
                  <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>
                    {stageCountLabel(key)}
                  </span>
                </label>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              alignItems: 'center',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--text-faint)' }}>Apply to:</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name="hub-bulk-scope"
                checked={scopeMode === 'missing'}
                disabled={running}
                onChange={() => setScopeMode('missing')}
              />
              Only items missing that step
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name="hub-bulk-scope"
                checked={scopeMode === 'all'}
                disabled={running}
                onChange={() => setScopeMode('all')}
              />
              All selected (force replay)
            </label>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => void handleRunClick()}
              disabled={running || !checkedSteps.length || !runPreview}
              style={{
                ...btnStyle,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                opacity: running || !runPreview ? 0.6 : 1,
                cursor: running || !runPreview ? 'not-allowed' : 'pointer',
              }}
              title={
                jobBusy
                  ? 'Wait for the current dashboard job to finish'
                  : undefined
              }
            >
              <Play size={13} />
              {jobBusy ? 'Queue checked steps' : 'Run checked steps'}
            </button>
            {runPreview ? (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Will run — {runPreview}
              </span>
            ) : (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                No items match the checked steps for this scope.
              </span>
            )}
          </div>
        </div>
      ) : null}

      {pendingRun ? (
        <HubActionConfirmModal
          title={`Run on ${pendingRun.totalTargets.toLocaleString()} items?`}
          description="Large bulk run — this may take a long time and use API quota."
          bullets={[
            `Steps: ${pendingRun.steps.map((s) => HUB_BULK_STAGE_LABELS[s]).join(' → ')}`,
            pendingRun.mode === 'missing'
              ? 'Scope: each step = missing for that step + prior step’s run set'
              : 'Scope: all selected items (force replay)',
            `${selectedCount.toLocaleString()} rows selected in the table`,
          ]}
          warning="You can cancel while the job is running if it supports cancellation."
          confirmLabel="Run"
          confirmVariant="warn"
          onCancel={() => setPendingRun(null)}
          onConfirm={() => {
            const { steps, mode } = pendingRun;
            setPendingRun(null);
            void executeRun(steps, mode).catch(() => {
              /* modal */
            });
          }}
        />
      ) : null}
    </>
  );
};
