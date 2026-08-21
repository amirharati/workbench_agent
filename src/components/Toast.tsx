import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastData {
  id: string;
  type: ToastType;
  message: string;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<ToastType, { border: string; icon: string; iconColor: string }> = {
  success: { border: 'var(--status-success)', icon: '✓', iconColor: 'var(--status-success)' },
  error:   { border: 'var(--error)', icon: '✗', iconColor: 'var(--error)' },
  info:    { border: 'var(--status-info)', icon: 'i', iconColor: 'var(--status-info)' },
};

// success and info auto-dismiss after 3s; error is persistent
const AUTO_DISMISS_MS: Partial<Record<ToastType, number>> = {
  success: 3000,
  info: 3000,
};

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const [exiting, setExiting] = useState(false);
  const { border, icon, iconColor } = TYPE_STYLES[toast.type];

  const dismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 240);
  };

  useEffect(() => {
  const delay = toast.durationMs ?? AUTO_DISMISS_MS[toast.type];
    if (!delay) return;
    const t = setTimeout(dismiss, delay);
    return () => clearTimeout(t);
  }, [toast.id, toast.type]);

  return (
    <div
      className={exiting ? 'toast-exit' : 'toast-enter'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${border}`,
        boxShadow: 'var(--shadow-md)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text)',
        minWidth: 200,
        maxWidth: 320,
        pointerEvents: 'all',
      }}
    >
      <span style={{ color: iconColor, fontWeight: 700, fontSize: '0.8em', flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => { toast.action!.onClick(); dismiss(); }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '2px 4px',
            flexShrink: 0,
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={dismiss}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-faint)',
          cursor: 'pointer',
          padding: 2,
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        <X size={12} />
      </button>
    </div>
  );
};
