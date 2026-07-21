import React from 'react';
import type { CategoryUpdatePlan } from '../../lib/pipeline/pipelineMaintenanceSnapshot';
import { DialogShell } from './DialogShell';

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
    <DialogShell
      title="Update categories"
      description={<>Scope: <strong>{plan.scopeLabel}</strong></>}
      onClose={onCancel}
      maxWidth={480}
      raised
      footer={
        <>
          <button className="ui-button ui-button--secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="ui-button ui-button--primary" type="button" onClick={onConfirm}>Run update</button>
        </>
      }
    >
      <section className="ui-dialog__section">
        <h3 className="ui-dialog__section-title">Waiting</h3>
        <ul className="ui-dialog__list">
          {plan.pendingClassifyInScope > 0 ? (
            <li><strong>{plan.pendingClassifyInScope}</strong> new / ready for topics</li>
          ) : null}
          {plan.stuckPool > 0 ? (
            <li>
              <strong>{plan.stuckPool}</strong> weak or missing topic — unassigned ({kb.unassigned}),
              General/Other ({kb.general}), need discover ({kb.pending_discover})
            </li>
          ) : null}
        </ul>
      </section>

      <section className="ui-dialog__section">
        <h3 className="ui-dialog__section-title">This run</h3>
        <ol className="ui-dialog__list">
          {steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>

      <div className="ui-status" data-tone="warning">
        Uses your AI API. You get a before/after report when done, including bookmarks that land in
        General/Other or return to the waiting pool.
      </div>
    </DialogShell>
  );
};
