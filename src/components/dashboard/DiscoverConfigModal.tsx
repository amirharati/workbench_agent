import React, { useState } from 'react';
import { X } from 'lucide-react';
import { HUB_DISCOVER_SAMPLE_BATCH_SIZE } from '../../lib/pipeline/pipelineMaintenanceSnapshot';

export type DiscoverInputScope = 'unassigned' | 'unassigned_general' | 'unassigned_general_pending' | 'all';

export interface DiscoverConfigPlan {
  scopeLabel: string;
  counts: {
    unassigned: number;
    general: number;
    pendingClassify: number;
    all: number;
  };
}

export interface DiscoverConfigModalProps {
  plan: DiscoverConfigPlan;
  onConfirm: (scope: DiscoverInputScope, andClassify: boolean, batches: number) => void;
  onCancel: () => void;
}

export const DiscoverConfigModal: React.FC<DiscoverConfigModalProps> = ({
  plan,
  onConfirm,
  onCancel,
}) => {
  const [inputScope, setInputScope] = useState<DiscoverInputScope>('unassigned_general');
  const [batches, setBatches] = useState(1000000);

  const { counts } = plan;
  
  const getSelectedCount = () => {
    if (inputScope === 'unassigned') return counts.unassigned;
    if (inputScope === 'unassigned_general') return counts.unassigned + counts.general;
    if (inputScope === 'unassigned_general_pending') return counts.unassigned + counts.general + counts.pendingClassify;
    return counts.all;
  };

  const selectedCount = getSelectedCount();
  const batchOptions = Array.from({ length: 6 }, (_, i) => i + 1);

  return (
    <div
      role="dialog"
      aria-modal="true"
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
          maxWidth: 520,
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
              style={{
                margin: 0,
                fontSize: 'var(--text-base)',
                fontWeight: 600,
                lineHeight: 1.35,
              }}
            >
              Discover New Topics
            </h2>
            <button
              type="button"
              onClick={onCancel}
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
              margin: '0 0 16px',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              lineHeight: 1.55,
            }}
          >
            Scope: <strong style={{ color: 'var(--text)' }}>{plan.scopeLabel}</strong>
          </p>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 'var(--text-sm)' }}>
              1. Choose input bookmarks for AI to analyze:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="discover_scope"
                  checked={inputScope === 'unassigned'}
                  onChange={() => setInputScope('unassigned')}
                />
                <span>No category found (classify ran, no topic matched) <strong style={{ color: 'var(--text)' }}>({counts.unassigned})</strong></span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="discover_scope"
                  checked={inputScope === 'unassigned_general'}
                  onChange={() => setInputScope('unassigned_general')}
                />
                <span>No category found + General/Other <strong style={{ color: 'var(--text)' }}>({counts.unassigned + counts.general})</strong></span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="discover_scope"
                  checked={inputScope === 'unassigned_general_pending'}
                  onChange={() => setInputScope('unassigned_general_pending')}
                />
                <span>No category found + General/Other + Waiting to classify <strong style={{ color: 'var(--text)' }}>({counts.unassigned + counts.general + counts.pendingClassify})</strong></span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="discover_scope"
                  checked={inputScope === 'all'}
                  onChange={() => setInputScope('all')}
                />
                <span>All bookmarks in scope <strong style={{ color: 'var(--text)' }}>({counts.all})</strong></span>
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 'var(--text-sm)' }}>
              2. How many items to process?
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 'var(--text-sm)' }}>
              <select
                value={batches}
                onChange={(e) => setBatches(Number(e.target.value))}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-glass)',
                  color: 'var(--text)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <option value={1000000}>All {selectedCount} items</option>
                {batchOptions.map((n) => {
                  const maxItems = n * HUB_DISCOVER_SAMPLE_BATCH_SIZE;
                  if (maxItems >= selectedCount) return null;
                  return (
                    <option key={n} value={n}>
                      Sample {maxItems} items
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-glass)',
              fontSize: 'var(--text-sm)',
              lineHeight: 1.55,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>
              Discover Only vs Discover + Classify
            </div>
            <p style={{ margin: '0 0 4px', color: 'var(--text-muted)' }}>
              <strong>Discover Only:</strong> AI proposes new topics based on the inputs. No bookmarks are assigned to topics yet.
            </p>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              <strong>Discover + Classify:</strong> AI proposes new topics, then immediately re-evaluates the sampled inputs to assign them to the best topics (including the new ones).
            </p>
          </div>
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
            onClick={() => onConfirm(inputScope, false, batches)}
            disabled={selectedCount === 0}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg-glass)',
              color: selectedCount === 0 ? 'var(--text-faint)' : 'var(--text)',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Discover Only
          </button>
          <button
            type="button"
            onClick={() => onConfirm(inputScope, true, batches)}
            disabled={selectedCount === 0}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: selectedCount === 0 ? 'var(--bg-glass)' : 'var(--accent)',
              color: selectedCount === 0 ? 'var(--text-faint)' : '#fff',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Discover + Classify
          </button>
        </div>
      </div>
    </div>
  );
};
