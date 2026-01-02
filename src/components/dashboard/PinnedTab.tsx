import React from 'react';
import { Pin, PinOff } from 'lucide-react';

export const PinnedTab: React.FC = () => {
  return (
    <div
      style={{
        padding: '1.25rem',
        overflowY: 'auto',
        height: '100%',
        color: 'var(--text)',
        background: 'var(--bg-panel)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-panel)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <Pin size={20} style={{ color: 'var(--accent)' }} />
        <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>Pinned Items</h2>
      </div>

      <div
        style={{
          padding: '3rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
          background: 'var(--bg-glass)',
          borderRadius: 8,
          border: '1px dashed var(--border)',
        }}
      >
        <PinOff size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
        <p style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
          Pinned Items
        </p>
        <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
          Pin important items to keep them easily accessible.
          <br />
          Right-click any item and select "Pin" to add it here.
        </p>
        <div
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: 'var(--bg-panel)',
            borderRadius: 8,
            border: '1px solid var(--border)',
            textAlign: 'left',
            fontSize: '0.85rem',
            color: 'var(--text-muted)',
          }}
        >
          <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '0.5rem' }}>
            Coming Soon:
          </strong>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.8 }}>
            <li>Pin/unpin items from context menu</li>
            <li>Pinned items appear at top of lists</li>
            <li>Visual pin indicator in item cards</li>
            <li>Quick access from sidebar</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

