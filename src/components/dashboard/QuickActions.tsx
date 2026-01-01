import React from 'react';

type QuickActionId = 'pinned' | 'recent' | 'favorites' | 'trash';

interface QuickActionsProps {
  onAction: (id: QuickActionId) => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ onAction }) => {
  const actions: { id: QuickActionId; label: string; icon: string }[] = [
    { id: 'pinned', label: 'Pinned', icon: '📌' },
    { id: 'recent', label: 'Recent', icon: '🕐' },
    { id: 'favorites', label: 'Favorites', icon: '⭐' },
    { id: 'trash', label: 'Trash', icon: '🗑️' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        padding: '0.35rem 0.5rem',
        background: 'var(--bg-glass)',
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}
    >
      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Quick:</span>
      {actions.map((a) => (
        <button
          key={a.id}
          onClick={() => onAction(a.id)}
          style={{
            background: 'linear-gradient(135deg, var(--bg-glass), transparent)',
            border: '1px solid var(--border)',
            padding: '0.32rem 0.85rem',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            color: 'var(--text)',
            borderRadius: 8,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        >
          <span>{a.icon}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
};


