import React, { useState } from 'react';
import { Loader2, RefreshCw, Sparkles, Tags } from 'lucide-react';
import {
  type PipelineMaintenanceSnapshot,
} from '../../lib/pipeline/pipelineMaintenanceSnapshot';
import { DiscoverConfigModal, type DiscoverInputScope, type DiscoverConfigPlan } from './DiscoverConfigModal';
import { HubActionConfirmModal } from './HubActionConfirmModal';

export type PipelineMaintenanceStripProps = {
  snapshot: PipelineMaintenanceSnapshot | null;
  loading?: boolean;
  refreshing?: boolean;
  scopeLabel?: string;
  discoverConfigPlan?: DiscoverConfigPlan;
  /** Scoped stuck pool: unassigned + general (includes pending_discover rows). */
  discoverWaiting?: number;
  disabled?: boolean;
  onRefresh?: () => void;
  onDiscover: (scope: DiscoverInputScope, andClassify: boolean, batches: number) => void;
  onClassifyPending?: () => void;
  onReclassifyAll?: () => void;
  onRetryManual?: () => void;
  onViewManualReview?: () => void;
};

export const PipelineMaintenanceStrip: React.FC<PipelineMaintenanceStripProps> = ({
  snapshot,
  loading,
  refreshing,
  scopeLabel = 'Entire library',
  discoverConfigPlan,
  discoverWaiting = 0,
  disabled,
  onRefresh,
  onDiscover,
  onClassifyPending,
  onReclassifyAll,
  onRetryManual,
  onViewManualReview,
}) => {
  const [discoverModalOpen, setDiscoverModalOpen] = useState(false);
  const [reclassifyConfirmOpen, setReclassifyConfirmOpen] = useState(false);

  if (loading && !snapshot) {
    return (
      <div className="ui-pipeline-maintenance ui-pipeline-maintenance--loading">
        <Loader2 size={14} className="spin" />
        Loading category stats…
      </div>
    );
  }

  if (!snapshot) return null;

  const { queue } = snapshot;
  const pendingClassify = discoverConfigPlan?.counts.pendingClassify ?? 0;
  const discoverDisabled = disabled || !discoverConfigPlan || discoverWaiting === 0;
  const classifyPendingDisabled = disabled || pendingClassify === 0;
  const noStagedWork = discoverWaiting === 0 && pendingClassify === 0;

  return (
    <>
      {discoverModalOpen && discoverConfigPlan ? (
        <DiscoverConfigModal
          plan={discoverConfigPlan}
          onConfirm={(scope, andClassify, batches) => {
            onDiscover(scope, andClassify, batches);
            setDiscoverModalOpen(false);
          }}
          onCancel={() => setDiscoverModalOpen(false)}
        />
      ) : null}

      {reclassifyConfirmOpen ? (
        <HubActionConfirmModal
          title="Reclassify every bookmark in this scope?"
          description={`Re-run topic classification AI on ${discoverConfigPlan?.counts.all ?? 0} bookmarks in ${scopeLabel}, including bookmarks that already have a specific topic.`}
          warning="Use this after a significant category change. It may consume many paid API calls."
          confirmLabel="Start reclassify"
          confirmVariant="warn"
          onCancel={() => setReclassifyConfirmOpen(false)}
          onConfirm={() => {
            onReclassifyAll?.();
            setReclassifyConfirmOpen(false);
          }}
        />
      ) : null}

      <div className="ui-pipeline-maintenance">
        <p className="ui-pipeline-maintenance__eyebrow">
          Staged AI — nothing runs until you click Run below.
        </p>

        <div className="ui-pipeline-maintenance__header">
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="ui-pipeline-maintenance__title">
              Category actions
            </div>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.45 }}>
              Scope: {scopeLabel}. Select rows below to limit what runs. Filter chips are view-only.
            </p>
          </div>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh stats"
              className="ui-button ui-button--secondary ui-button--icon"
            >
              <RefreshCw size={13} />
            </button>
          ) : null}
        </div>

        <div className="ui-pipeline-maintenance__actions">
          {/* DISCOVER SECTION */}
          <div className="ui-pipeline-maintenance__action-card">
            <div className="ui-pipeline-maintenance__action-title">
              Discover
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.4 }}>
              Propose new topics for bookmarks waiting on discover.
            </p>
            {queue.pendingDiscover > 0 ? (
              <p style={{ margin: '0 0 8px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {queue.pendingDiscover} marked pending discover
              </p>
            ) : null}
            <button
              type="button"
              disabled={discoverDisabled}
              onClick={() => setDiscoverModalOpen(true)}
              className="ui-button ui-button--warning"
            >
              <Sparkles size={13} />
              Run discover ({discoverWaiting})
            </button>
          </div>

          {/* CLASSIFY SECTION */}
          <div className="ui-pipeline-maintenance__action-card">
            <div className="ui-pipeline-maintenance__action-title">
              Classify
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.4 }}>
              Ready to classify — assign existing topics to bookmarks.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {onClassifyPending && (
                <button
                  type="button"
                  disabled={classifyPendingDisabled}
                  onClick={onClassifyPending}
                  className="ui-button ui-button--primary"
                >
                  <Tags size={13} />
                  Classify Pending ({pendingClassify})
                </button>
              )}
              {onReclassifyAll && (
                <button
                  type="button"
                  disabled={disabled || discoverConfigPlan?.counts.all === 0}
                  onClick={() => setReclassifyConfirmOpen(true)}
                  className="ui-button ui-button--secondary"
                >
                  <RefreshCw size={13} />
                  Reclassify in scope ({discoverConfigPlan?.counts.all ?? 0})
                </button>
              )}
            </div>
          </div>
        </div>

        {noStagedWork ? (
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-faint)',
              lineHeight: 1.45,
            }}
          >
            No staged discover or classify work in this scope.
          </p>
        ) : null}

        {/* MANUAL REVIEW SECTION */}
        {onRetryManual && queue.manualReview > 0 ? (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {queue.manualReview} bookmarks in manual review.
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={onRetryManual}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry manual
            </button>
            {onViewManualReview ? (
              <button
                type="button"
                onClick={onViewManualReview}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--accent)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                }}
              >
                View list
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
};
