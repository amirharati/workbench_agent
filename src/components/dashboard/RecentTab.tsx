import React, { useMemo } from 'react';
import type { Item } from '../../lib/db';
import { getDomain, isValidHttpUrl, formatDateTime } from '../../lib/utils';
import { Clock, ExternalLink } from 'lucide-react';

interface RecentTabProps {
  items: Item[];
  onItemClick?: (item: Item) => void;
}

export const RecentTab: React.FC<RecentTabProps> = ({ items, onItemClick }) => {
  const recentItems = useMemo(() => {
    return [...items]
      .sort((a, b) => (b.updated_at ?? b.created_at) - (a.updated_at ?? a.created_at))
      .slice(0, 20);
  }, [items]);

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
        <Clock size={20} style={{ color: 'var(--accent)' }} />
        <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>Recent Items</h2>
      </div>

      {recentItems.length === 0 ? (
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
          <Clock size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: '0.9rem' }}>No recent items yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {recentItems.map((item) => (
            <div
              key={item.id}
              onClick={() => onItemClick?.(item)}
              style={{
                padding: '1rem',
                background: 'var(--bg-glass)',
                borderRadius: 8,
                border: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-glass)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>
                    {item.title || 'Untitled'}
                  </div>
                  {item.url && isValidHttpUrl(item.url) && (
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)',
                        marginBottom: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <ExternalLink size={12} />
                      {getDomain(item.url)}
                    </div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Updated: {formatDateTime(item.updated_at ?? item.created_at)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

