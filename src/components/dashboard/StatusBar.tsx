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

const TYPE_ICONS: Record<StatusMessageType, string> = {
  warning: '⚠',
  error: '✕',
  info: 'i',
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
        const icon = TYPE_ICONS[msg.type];
        return (
          <div
            key={msg.id}
            className="status-bar-message ui-status-bar__message"
            data-tone={msg.type}
            role={msg.type === 'error' ? 'alert' : 'status'}
          >
            <span className="ui-status-bar__icon" aria-hidden="true">{icon}</span>
            <span style={{ flex: 1 }}>{msg.message}</span>
            {msg.action && (
              <button
                className="ui-status-bar__action"
                onClick={msg.action.onClick}
              >
                {msg.action.label}
              </button>
            )}
            <button
              className="ui-status-bar__dismiss"
              onClick={() => onDismiss(msg.id)}
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
