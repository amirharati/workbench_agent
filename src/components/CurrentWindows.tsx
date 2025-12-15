import React from 'react';
import { Monitor, X, Bookmark } from 'lucide-react';

interface WindowGroup {
  windowId: number;
  tabs: chrome.tabs.Tab[];
}

interface CurrentWindowsProps {
  windows: WindowGroup[];
  onCloseTab: (tabId: number) => void;
  onSaveWindow: (windowId: number) => void;
}

export const CurrentWindows: React.FC<CurrentWindowsProps> = ({ windows, onCloseTab, onSaveWindow }) => {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#1f2937' }}>
          Current Windows
        </h2>
        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          {windows.length} window{windows.length !== 1 ? 's' : ''} open
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {windows.map((window, idx) => (
          <div
            key={window.windowId}
            style={{
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.75rem',
              padding: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Monitor size={18} style={{ color: '#3b82f6' }} />
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1f2937' }}>
                  Window {idx + 1}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', background: '#f3f4f6', padding: '0.125rem 0.5rem', borderRadius: '9999px' }}>
                  {window.tabs.length} tabs
                </span>
              </div>
              <button
                onClick={() => onSaveWindow(window.windowId)}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: '#eff6ff',
                  color: '#2563eb',
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
                <Bookmark size={12} /> Save Window
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {window.tabs.map((tab) => (
                <div
                  key={tab.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    borderRadius: '0.375rem',
                    background: tab.active ? '#f0f9ff' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    if (tab.id) chrome.tabs.update(tab.id, { active: true });
                    if (window.windowId) chrome.windows.update(window.windowId, { focused: true });
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = tab.active ? '#e0f2fe' : '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = tab.active ? '#f0f9ff' : 'transparent';
                  }}
                >
                  {tab.favIconUrl && (
                    <img src={tab.favIconUrl} alt="" style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                  )}
                  <span
                    style={{
                      flex: 1,
                      fontSize: '0.8125rem',
                      color: '#374151',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tab.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tab.id) onCloseTab(tab.id);
                    }}
                    style={{
                      padding: '0.125rem',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: '#9ca3af',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#ef4444';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#9ca3af';
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
