import React from 'react';
import { X } from 'lucide-react';
import type { CategoryUpdatePlan } from '../../lib/pipeline/pipelineMaintenanceSnapshot';

export interface CategoryUpdateConfirmModalProps {
  plan: CategoryUpdatePlan;
  onConfirm: () => void;
  onCancel: () => void;
}

export const CategoryUpdateConfirmModal: React.FC<CategoryUpdateConfirmModalProps> = ({
  plan,
  onConfirm,
  onCancel,
}) => {
  const { stuckKindBreakdown: kb } = plan;
  const steps: string[] = [];
  if (plan.willRunDiscover) {
    steps.push(
      `Propose new topics from ${plan.discoverItems} weak/unassigned bookmark${plan.discoverItems === 1 ? '' : 's'} (~${plan.discoverBatches} AI call${plan.discoverBatches === 1 ? '' : 's'})`
    );
  }
  if (plan.classifyItemsEstimate > 0) {
    steps.push(
      `Assign topics to ${plan.classifyItemsEstimate} bookmark${plan.classifyItemsEstimate === 1 ? '' : 's'} (~${plan.classifyBatchesEstimate} AI batch${plan.classifyBatchesEstimate === 1 ? '' : 'es'})`
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-update-confirm-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--layer-modal-raised)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0,0,0,0.45)',
        boxSizing: 'border-box',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--bg-panel)',
          color: 'var(--text)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '18px 20px 14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 10,
            }}
          >
            <h2
              id="category-update-confirm-title"
              style={{
                margin: 0,
                fontSize: 'var(--text-base)',
                fontWeight: 600,
                lineHeight: 1.35,
              }}
            >
              Update categories
            </h2>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              style={{
                padding: 4,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                borderRadius: 4,
              }}
            >
              <X size={18} />
            </button>
          </div>

          <p
            style={{
              margin: '0 0 12px',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              lineHeight: 1.55,
            }}
          >
            Scope: <strong style={{ color: 'var(--text)' }}>{plan.scopeLabel}</strong>
          </p>

          <div
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-glass)',
              fontSize: 'var(--text-sm)',
              lineHeight: 1.55,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Waiting</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)' }}>
              {plan.pendingClassifyInScope > 0 ? (
                <li>
                  <strong style={{ color: 'var(--text)' }}>{plan.pendingClassifyInScope}</strong>{' '}
                  new / ready for topics
                </li>
              ) : null}
              {plan.stuckPool > 0 ? (
                <li>
                  <strong style={{ color: 'var(--text)' }}>{plan.stuckPool}</strong> weak or
                  missing topic — unassigned ({kb.unassigned}), General/Other ({kb.general}),
                  need discover ({kb.pending_discover})
                </li>
              ) : null}
            </ul>
          </div>

          <div
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-glass)',
              fontSize: 'var(--text-sm)',
              lineHeight: 1.55,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>This run</div>
            <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)' }}>
              {steps.map((step) => (
                <li key={step} style={{ marginBottom: 4 }}>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: 'var(--text-xs)',
              lineHeight: 1.45,
              color: 'var(--text-faint)',
            }}
          >
            Uses your AI API. You get a before/after report when done — including any bookmarks that
            landed in General/Other or back in the waiting pool.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '7px 14px',
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
            onClick={onConfirm}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Run update
          </button>
        </div>
      </div>
    </div>
  );
};
