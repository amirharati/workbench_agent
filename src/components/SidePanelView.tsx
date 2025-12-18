import React, { useState } from 'react';
import { Save, Download, Upload, RefreshCw, ChevronDown } from 'lucide-react';
import { Collection } from '../lib/db';

interface SidePanelViewProps {
  collections: Collection[];
  onSaveTab: (collectionId?: string) => Promise<void>;
  onAddBookmark: (url: string, title?: string, collectionId?: string) => Promise<void>;
  onExport: () => Promise<void>;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onOpenFullPage: () => void;
  status: string;
}

export const SidePanelView: React.FC<SidePanelViewProps> = ({
  collections,
  onSaveTab,
  onAddBookmark,
  onExport,
  onImport,
  onOpenFullPage,
  status,
}) => {
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualCollectionId, setManualCollectionId] = useState<string | undefined>(undefined);
  const [showManualForm, setShowManualForm] = useState(false);

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

      {/* Manual add bookmark (lightweight) */}
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <button
          onClick={() => setShowManualForm((v) => !v)}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#2563eb',
            cursor: 'pointer',
            fontSize: '0.85rem',
            padding: '0.25rem 0',
            textDecoration: 'underline'
          }}
        >
          {showManualForm ? 'Hide add URL' : 'Add another URL'}
        </button>
      </div>
      {showManualForm && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.65rem', background: 'white', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <input
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://example.com"
            style={{
              width: '100%',
              padding: '0.45rem 0.55rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.85rem',
            }}
          />
          <input
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            placeholder="Title (optional)"
            style={{
              width: '100%',
              padding: '0.45rem 0.55rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.85rem',
            }}
          />
          <select
            value={manualCollectionId || ''}
            onChange={(e) => setManualCollectionId(e.target.value || undefined)}
            style={{
              width: '100%',
              padding: '0.4rem 0.55rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.85rem',
              background: 'white',
            }}
          >
            <option value="">Unsorted</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (!manualUrl.trim()) return;
              await onAddBookmark(manualUrl.trim(), manualTitle.trim(), manualCollectionId);
              setManualUrl('');
              setManualTitle('');
              setManualCollectionId(undefined);
              setShowManualForm(false);
            }}
            style={{
              width: '100%',
              padding: '0.5rem',
              background: '#111827',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem'
            }}
          >
            Add bookmark
          </button>
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
