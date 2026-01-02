import React from 'react';
import { Trash2 } from 'lucide-react';

export const TrashTab: React.FC = () => {
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
        <Trash2 size={20} style={{ color: '#ef4444' }} />
        <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>Trash</h2>
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
        <Trash2 size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
        <p style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
          Trash is Empty
        </p>
        <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
          Deleted items will appear here and can be restored or permanently deleted.
          <br />
          Items are automatically removed after 30 days.
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
            <li>Soft delete (items move to trash instead of being deleted)</li>
            <li>Restore deleted items</li>
            <li>Permanently delete from trash</li>
            <li>Auto-cleanup after 30 days</li>
            <li>Empty trash action</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

