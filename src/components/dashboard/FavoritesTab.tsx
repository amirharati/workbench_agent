import React from 'react';
import { Heart, HeartOff } from 'lucide-react';

export const FavoritesTab: React.FC = () => {
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
        <Heart size={20} style={{ color: '#ef4444', fill: '#ef4444' }} />
        <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>Favorites</h2>
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
        <HeartOff size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
        <p style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
          Your Favorites
        </p>
        <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
          Mark items as favorites to quickly access your most important bookmarks and notes.
          <br />
          Right-click any item and select "Add to Favorites" to get started.
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
            <li>Favorite/unfavorite items from context menu</li>
            <li>Heart icon indicator in item cards</li>
            <li>Dedicated favorites view</li>
            <li>Quick access from sidebar</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

