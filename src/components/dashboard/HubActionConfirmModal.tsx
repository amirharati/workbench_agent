import React from 'react';
import { X } from 'lucide-react';

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

const CONFIRM_COLORS: Record<HubActionConfirmVariant, string> = {
  accent: 'var(--accent)',
  warn: 'var(--er-warn, #d29922)',
  danger: 'var(--error, #f85149)',
};

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
  const confirmColor = CONFIRM_COLORS[confirmVariant];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hub-action-confirm-title"
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
      onClick={onCancel}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          display: 'flex',
          flexDirection: 'column',
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
              marginBottom: description || bullets?.length ? 10 : 0,
            }}
          >
            <h2
              id="hub-action-confirm-title"
              style={{
                margin: 0,
                fontSize: 'var(--text-base)',
                fontWeight: 600,
                lineHeight: 1.35,
              }}
            >
              {title}
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
          {description ? (
            <p
              style={{
                margin: '0 0 10px',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
                lineHeight: 1.55,
              }}
            >
              {description}
            </p>
          ) : null}
          {bullets && bullets.length > 0 ? (
            <ul
              style={{
                margin: '0 0 10px',
                paddingLeft: 18,
                fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
                lineHeight: 1.55,
              }}
            >
              {bullets.map((line) => (
                <li key={line} style={{ marginBottom: 4 }}>
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          {warning ? (
            <p
              style={{
                margin: 0,
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 'var(--text-xs)',
                lineHeight: 1.45,
                color: 'var(--er-warn, #d29922)',
                background: 'color-mix(in srgb, var(--er-warn, #d29922) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--er-warn, #d29922) 35%, transparent)',
              }}
            >
              {warning}
            </p>
          ) : null}
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
              background: confirmColor,
              color: '#fff',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
