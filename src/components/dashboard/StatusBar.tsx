import React, { useState } from 'react';
import { X } from 'lucide-react';

export type StatusMessageType = 'warning' | 'error' | 'info';

export interface StatusMessage {
  id: string;
  type: StatusMessageType;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface StatusBarProps {
  messages: StatusMessage[];
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<StatusMessageType, { icon: string; color: string; bg: string }> = {
  warning: { icon: '⚠', color: '#d29922', bg: 'rgba(210, 153, 34, 0.08)' },
  error:   { icon: '✗', color: 'var(--danger)', bg: 'var(--danger-weak)' },
  info:    { icon: 'i', color: '#818cf8', bg: 'rgba(99, 102, 241, 0.08)' },
};

const MAX_MESSAGES = 3;

export const StatusBar: React.FC<StatusBarProps> = ({ messages, onDismiss }) => {
  const visible = messages.slice(0, MAX_MESSAGES);
  if (visible.length === 0) return null;

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
      }}
    >
      {visible.map((msg) => {
        const { icon, color, bg } = TYPE_STYLES[msg.type];
        return (
          <div
            key={msg.id}
            className="status-bar-message"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 12px',
              background: bg,
              borderBottom: `1px solid var(--border)`,
              fontSize: 'var(--text-xs)',
              color: 'var(--text)',
            }}
          >
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>{icon}</span>
            <span style={{ flex: 1 }}>{msg.message}</span>
            {msg.action && (
              <button
                onClick={msg.action.onClick}
                style={{
                  background: 'none',
                  border: 'none',
                  color,
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                  flexShrink: 0,
                }}
              >
                {msg.action.label}
              </button>
            )}
            <button
              onClick={() => onDismiss(msg.id)}
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
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

// Hook for managing status bar messages in a parent component
let _msgCounter = 0;

export function useStatusBar() {
  const [messages, setMessages] = useState<StatusMessage[]>([]);

  const addStatusMessage = (opts: Omit<StatusMessage, 'id'>) => {
    const id = `status-${++_msgCounter}`;
    setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), { id, ...opts }]);
  };

  const dismissStatusMessage = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  return { messages, addStatusMessage, dismissStatusMessage };
}
