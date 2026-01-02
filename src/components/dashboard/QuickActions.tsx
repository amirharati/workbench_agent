import React from 'react';
import { Pin, Clock, Star, Trash2 } from 'lucide-react';

type QuickActionId = 'pinned' | 'recent' | 'favorites' | 'trash';

interface QuickActionsProps {
  onAction: (id: QuickActionId) => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ onAction }) => {
  const actions: { id: QuickActionId; label: string; Icon: typeof Pin }[] = [
    { id: 'pinned', label: 'Pinned', Icon: Pin },
    { id: 'recent', label: 'Recent', Icon: Clock },
    { id: 'favorites', label: 'Favorites', Icon: Star },
    { id: 'trash', label: 'Trash', Icon: Trash2 },
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: '2px',
        alignItems: 'center',
      }}
    >
      {actions.map((a) => (
        <button
          key={a.id}
          onClick={() => onAction(a.id)}
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            padding: '4px 8px',
            height: 24,
            fontSize: 'var(--text-xs)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: 'var(--text-muted)',
            borderRadius: 4,
            cursor: 'pointer',
            transition: 'all 0.1s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)';
            e.currentTarget.style.color = 'var(--text)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.borderColor = 'transparent';
          }}
          title={a.label}
        >
          <a.Icon size={12} />
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
};
