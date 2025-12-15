import React, { useState } from 'react';
import { Save, Download, Upload, RefreshCw, ChevronDown } from 'lucide-react';
import { Collection } from '../lib/db';

interface SidePanelViewProps {
  collections: Collection[];
  onSaveTab: (collectionId?: string) => Promise<void>;
  onExport: () => Promise<void>;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onOpenFullPage: () => void;
  status: string;
}

export const SidePanelView: React.FC<SidePanelViewProps> = ({
  collections,
  onSaveTab,
  onExport,
  onImport,
  onOpenFullPage,
  status,
}) => {
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Quick Actions</h2>

      {/* Save with category dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.75rem',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          <Save size={16} /> Save This Tab <ChevronDown size={14} />
        </button>

        {showCategoryDropdown && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '0.25rem',
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 100,
            }}
          >
            <div
              onClick={() => { onSaveTab(undefined); setShowCategoryDropdown(false); }}
              style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', borderBottom: '1px solid #e5e7eb' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
            >
              📥 Save to Unsorted
            </div>
            {collections.map((col) => (
              <div
                key={col.id}
                onClick={() => { onSaveTab(col.id); setShowCategoryDropdown(false); }}
                style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
              >
                📁 {col.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {status && (
        <div
          style={{
            padding: '0.5rem',
            background: '#ecfdf5',
            color: '#047857',
            borderRadius: '0.375rem',
            fontSize: '0.75rem',
            textAlign: 'center',
          }}
        >
          {status}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={onExport}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            background: 'white',
            cursor: 'pointer',
            fontSize: '0.75rem',
          }}
        >
          <Download size={12} /> Backup
        </button>
        <label
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            background: 'white',
            cursor: 'pointer',
            fontSize: '0.75rem',
          }}
        >
          <Upload size={12} /> Restore
          <input type="file" onChange={onImport} style={{ display: 'none' }} accept=".json" />
        </label>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0.5rem 0' }} />

      <button
        onClick={onOpenFullPage}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.75rem',
          background: '#f3f4f6',
          color: '#374151',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        <RefreshCw size={16} /> Open Dashboard
      </button>
    </div>
  );
};
