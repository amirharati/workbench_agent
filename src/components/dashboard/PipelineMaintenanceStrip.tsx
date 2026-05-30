import React, { useState } from 'react';
import { Loader2, RefreshCw, Sparkles, Tags, AlertTriangle } from 'lucide-react';
import {
  type PipelineMaintenanceSnapshot,
} from '../../lib/pipeline/pipelineMaintenanceSnapshot';
import { DiscoverConfigModal, type DiscoverInputScope, type DiscoverConfigPlan } from './DiscoverConfigModal';

export type PipelineMaintenanceStripProps = {
  snapshot: PipelineMaintenanceSnapshot | null;
  loading?: boolean;
  refreshing?: boolean;
  scopeLabel?: string;
  discoverConfigPlan?: DiscoverConfigPlan;
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
      <div
        style={{
          padding: '12px 14px',
          marginBottom: 14,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Loader2 size={14} className="spin" />
        Loading category stats…
      </div>
    );
  }

  if (!snapshot) return null;

  const { queue } = snapshot;

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
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10002,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'rgba(0,0,0,0.45)',
            boxSizing: 'border-box',
          }}
          onClick={() => setReclassifyConfirmOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: 'var(--bg-panel)',
              color: 'var(--text)',
              borderRadius: 12,
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
              padding: '20px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} color="var(--er-warn, #d29922)" />
              Reclassify Entire Scope?
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              This will re-run the topic classification AI on <strong>all {discoverConfigPlan?.counts.all} bookmarks</strong> in the current scope ({scopeLabel}), even if they already have a specific topic.
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              This is useful if you have significantly changed your taxonomy and want to apply it everywhere. It may consume a large number of API calls.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setReclassifyConfirmOpen(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onReclassifyAll?.();
                  setReclassifyConfirmOpen(false);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--er-warn, #d29922)',
                  color: '#fff',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Start Reclassify
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          marginBottom: 14,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          padding: '12px 14px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: 6,
              }}
            >
              Taxonomy Actions
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
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-glass)',
                color: 'var(--text-muted)',
                fontSize: 'var(--text-xs)',
                cursor: refreshing ? 'wait' : 'pointer',
              }}
            >
              <RefreshCw size={13} />
            </button>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          {/* DISCOVER SECTION */}
          <div style={{ flex: 1, minWidth: 220, paddingRight: 16, borderRight: '1px solid var(--border)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Discover
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.4 }}>
              Propose new topics based on your bookmarks.
            </p>
            <button
              type="button"
              disabled={disabled || !discoverConfigPlan}
              onClick={() => setDiscoverModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #d29922',
                background: 'color-mix(in srgb, #d29922 15%, transparent)',
                color: 'var(--text)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.7 : 1,
              }}
            >
              <Sparkles size={13} color="#d29922" />
              Discover Topics...
            </button>
          </div>

          {/* CLASSIFY SECTION */}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Classify
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.4 }}>
              Assign existing topics to bookmarks.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {onClassifyPending && (
                <button
                  type="button"
                  disabled={disabled || discoverConfigPlan?.counts.pendingClassify === 0}
                  onClick={onClassifyPending}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    cursor: disabled || discoverConfigPlan?.counts.pendingClassify === 0 ? 'not-allowed' : 'pointer',
                    opacity: disabled || discoverConfigPlan?.counts.pendingClassify === 0 ? 0.7 : 1,
                  }}
                >
                  <Tags size={13} />
                  Classify Pending ({discoverConfigPlan?.counts.pendingClassify ?? 0})
                </button>
              )}
              {onReclassifyAll && (
                <button
                  type="button"
                  disabled={disabled || discoverConfigPlan?.counts.all === 0}
                  onClick={() => setReclassifyConfirmOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-glass)',
                    color: 'var(--text)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    cursor: disabled || discoverConfigPlan?.counts.all === 0 ? 'not-allowed' : 'pointer',
                    opacity: disabled || discoverConfigPlan?.counts.all === 0 ? 0.7 : 1,
                  }}
                >
                  <RefreshCw size={13} />
                  Reclassify All ({discoverConfigPlan?.counts.all ?? 0})
                </button>
              )}
            </div>
          </div>
        </div>

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
