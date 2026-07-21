import React, { useState } from 'react';
import { HUB_DISCOVER_SAMPLE_BATCH_SIZE } from '../../lib/pipeline/pipelineMaintenanceSnapshot';
import { DialogShell } from './DialogShell';

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
    <DialogShell
      title="Discover new topics"
      description={<>Scope: <strong>{plan.scopeLabel}</strong></>}
      onClose={onCancel}
      maxWidth={540}
      raised
      footer={
        <>
          <button className="ui-button ui-button--secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="ui-button ui-button--secondary" type="button" onClick={() => onConfirm(inputScope, false, batches)} disabled={selectedCount === 0}>Discover only</button>
          <button className="ui-button ui-button--primary" type="button" onClick={() => onConfirm(inputScope, true, batches)} disabled={selectedCount === 0}>Discover + classify</button>
        </>
      }
    >
      <section className="ui-dialog__section">
        <h3 className="ui-dialog__section-title">1. Choose input bookmarks</h3>
        <div className="ui-choice-list">
          <label className="ui-choice-row" data-selected={inputScope === 'unassigned'}>
            <input type="radio" name="discover_scope" checked={inputScope === 'unassigned'} onChange={() => setInputScope('unassigned')} />
            <span>No category found <small>Classify ran, but no topic matched.</small></span>
            <strong>{counts.unassigned}</strong>
          </label>
          <label className="ui-choice-row" data-selected={inputScope === 'unassigned_general'}>
            <input type="radio" name="discover_scope" checked={inputScope === 'unassigned_general'} onChange={() => setInputScope('unassigned_general')} />
            <span>No category found + General/Other</span>
            <strong>{counts.unassigned + counts.general}</strong>
          </label>
          <label className="ui-choice-row" data-selected={inputScope === 'unassigned_general_pending'}>
            <input type="radio" name="discover_scope" checked={inputScope === 'unassigned_general_pending'} onChange={() => setInputScope('unassigned_general_pending')} />
            <span>No category found + General/Other + waiting</span>
            <strong>{counts.unassigned + counts.general + counts.pendingClassify}</strong>
          </label>
          <label className="ui-choice-row" data-selected={inputScope === 'all'}>
            <input type="radio" name="discover_scope" checked={inputScope === 'all'} onChange={() => setInputScope('all')} />
            <span>All bookmarks in scope</span>
            <strong>{counts.all}</strong>
          </label>
        </div>
      </section>

      <section className="ui-dialog__section">
        <label className="ui-dialog__section-title" htmlFor="discover-batch-size">2. How many items to process?</label>
        <select id="discover-batch-size" className="ui-field" value={batches} onChange={(e) => setBatches(Number(e.target.value))} style={{ width: '100%', marginTop: 7, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-input)', color: 'var(--text)' }}>
          <option value={1000000}>All {selectedCount} items</option>
          {batchOptions.map((n) => {
            const maxItems = n * HUB_DISCOVER_SAMPLE_BATCH_SIZE;
            if (maxItems >= selectedCount) return null;
            return <option key={n} value={n}>Sample {maxItems} items</option>;
          })}
        </select>
      </section>

      <div className="ui-status" data-tone="info">
        <strong>Discover only</strong> proposes topics without assigning bookmarks. <strong>Discover + classify</strong> proposes topics and then re-evaluates the sampled bookmarks against them.
      </div>
    </DialogShell>
  );
};
