import React, { useState } from 'react';
import { Monitor, X, Bookmark, ChevronDown, ChevronRight } from 'lucide-react';
import { Collection } from '../lib/db';

interface WindowGroup {
  windowId: number;
  tabs: chrome.tabs.Tab[];
}

interface OpenWindowsSectionProps {
  windows: WindowGroup[];
  collections: Collection[];
  onCloseTab: (tabId: number) => void;
  onSaveTab: (tab: chrome.tabs.Tab, collectionId?: string) => void;
  onSaveWindow: (windowId: number, collectionId?: string) => void;
  onSaveAllWindows: (collectionId?: string) => void;
}

export const OpenWindowsSection: React.FC<OpenWindowsSectionProps> = ({
  windows,
  collections,
  onCloseTab,
  onSaveTab,
  onSaveWindow,
  onSaveAllWindows,
}) => {
  const [expandedWindows, setExpandedWindows] = useState<Set<number>>(new Set(windows.map((w) => w.windowId)));
  const [saveDropdownOpen, setSaveDropdownOpen] = useState<string | null>(null);

  const toggleWindow = (windowId: number) => {
    const newExpanded = new Set(expandedWindows);
    if (newExpanded.has(windowId)) newExpanded.delete(windowId);
    else newExpanded.add(windowId);
    setExpandedWindows(newExpanded);
  };

  const totalTabs = windows.reduce((sum, w) => sum + w.tabs.length, 0);

  const CategoryDropdown = ({ onSelect, buttonLabel }: { onSelect: (id?: string) => void; buttonLabel: string }) => (
    <div style={{ position: 'relative' }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setSaveDropdownOpen(saveDropdownOpen === buttonLabel ? null : buttonLabel);
        }}
        style={{
          padding: '0.375rem 0.75rem',
          background: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '0.375rem',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
        }}
      >
        <Bookmark size={12} /> {buttonLabel}
      </button>
      {saveDropdownOpen === buttonLabel && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.25rem',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: '150px',
            zIndex: 100,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            onClick={(e) => { e.stopPropagation(); onSelect(undefined); setSaveDropdownOpen(null); }}
            style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', borderBottom: '1px solid #e5e7eb' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
          >
            📥 Unsorted
          </div>
          {collections.map((col) => (
            <div
              key={col.id}
              onClick={(e) => { e.stopPropagation(); onSelect(col.id); setSaveDropdownOpen(null); }}
              style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
            >
              📁 {col.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#6b7280' }}>
          OPEN WINDOWS
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
            {windows.length} windows • {totalTabs} tabs
          </span>
          <CategoryDropdown onSelect={(id) => onSaveAllWindows(id)} buttonLabel="Save All" />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {windows.map((window, idx) => {
          const isExpanded = expandedWindows.has(window.windowId);
          return (
            <div
              key={window.windowId}
              style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 0.75rem',
                  background: '#fafafa',
                  cursor: 'pointer',
                }}
                onClick={() => toggleWindow(window.windowId)}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Monitor size={16} style={{ color: '#6b7280' }} />
                <span style={{ fontWeight: 500, fontSize: '0.8125rem', flex: 1 }}>Window {idx + 1}</span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{window.tabs.length}</span>
                <CategoryDropdown onSelect={(id) => onSaveWindow(window.windowId, id)} buttonLabel="Save Window" />
              </div>

              {isExpanded && (
                <div style={{ padding: '0.25rem 0.5rem' }}>
                  {window.tabs.map((tab) => (
                    <div
                      key={tab.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.375rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.8125rem',
                        position: 'relative',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {tab.favIconUrl && <img src={tab.favIconUrl} alt="" style={{ width: '14px', height: '14px' }} />}
                      <span
                        style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', color: '#374151' }}
                        onClick={() => {
                          if (tab.id) chrome.tabs.update(tab.id, { active: true });
                          chrome.windows.update(window.windowId, { focused: true });
                        }}
                      >
                        {tab.title}
                      </span>
                      {/* Save tab with category dropdown */}
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSaveDropdownOpen(saveDropdownOpen === `tab-${tab.id}` ? null : `tab-${tab.id}`);
                          }}
                          title="Save this tab"
                          style={{ padding: '0.25rem', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#9ca3af')}
                        >
                          <Bookmark size={14} />
                        </button>
                        {saveDropdownOpen === `tab-${tab.id}` && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '100%',
                              right: 0,
                              marginTop: '0.25rem',
                              background: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '0.5rem',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              minWidth: '140px',
                              zIndex: 200,
                            }}
                          >
                            <div
                              onClick={(e) => { e.stopPropagation(); onSaveTab(tab, undefined); setSaveDropdownOpen(null); }}
                              style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem', borderBottom: '1px solid #e5e7eb' }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                            >
                              📥 Unsorted
                            </div>
                            {collections.map((col) => (
                              <div
                                key={col.id}
                                onClick={(e) => { e.stopPropagation(); onSaveTab(tab, col.id); setSaveDropdownOpen(null); }}
                                style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                              >
                                📁 {col.name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); tab.id && onCloseTab(tab.id); }}
                        style={{ padding: '0.25rem', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#9ca3af')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
