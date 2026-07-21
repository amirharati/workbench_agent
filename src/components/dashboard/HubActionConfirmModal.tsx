import React from 'react';
import { DialogShell } from './DialogShell';

export type HubActionConfirmVariant = 'accent' | 'warn' | 'danger';

export interface HubActionConfirmModalProps {
  title: string;
  description?: string;
  bullets?: string[];
  warning?: string;
  confirmLabel: string;
  confirmVariant?: HubActionConfirmVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

export const HubActionConfirmModal: React.FC<HubActionConfirmModalProps> = ({
  title,
  description,
  bullets,
  warning,
  confirmLabel,
  confirmVariant = 'accent',
  onConfirm,
  onCancel,
}) => {
  const confirmClass = confirmVariant === 'danger'
    ? 'ui-button ui-button--danger'
    : confirmVariant === 'warn'
      ? 'ui-button ui-button--warning'
      : 'ui-button ui-button--primary';

  return (
    <DialogShell
      title={title}
      description={description}
      onClose={onCancel}
      maxWidth={440}
      raised
      footer={
        <>
          <button className="ui-button ui-button--secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className={confirmClass} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </>
      }
    >
      {bullets && bullets.length > 0 ? (
        <ul className="ui-dialog__list">
          {bullets.map((line) => <li key={line}>{line}</li>)}
        </ul>
      ) : null}
      {warning ? <div className="ui-status" data-tone="warning">{warning}</div> : null}
    </DialogShell>
  );
};
