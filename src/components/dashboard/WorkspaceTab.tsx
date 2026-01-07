import React from 'react';
import type { Workspace } from '../../lib/db';
import { ExternalLink, Globe } from 'lucide-react';

interface WorkspaceTabProps {
  workspace: Workspace;
}

export const WorkspaceTab: React.FC<WorkspaceTabProps> = ({ workspace }) => {
  // Flatten all tabs from all windows
  const allTabs = workspace.windows.flatMap((window) =>
    window.tabs.map((tab) => ({
      ...tab,
      windowName: window.name || `Window ${window.id}`,
    }))
  );

  const handleOpenAll = () => {
    // Open all tabs in a new window
    const urls = allTabs.map((tab) => tab.url).filter(Boolean) as string[];
    if (urls.length > 0) {
      chrome.windows.create({ url: urls });
    }
  };

  const handleOpenTab = (url: string) => {
    if (url) {
      chrome.tabs.create({ url });
    }
  };

  return (
    <div
      style={{
        padding: '12px',
        overflowY: 'auto',
        height: '100%',
        background: 'var(--bg-panel)',
        borderRadius: 6,
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-panel)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2, marginBottom: '0.25rem' }}>
            {workspace.name}
          </h2>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {workspace.windows.length} window{workspace.windows.length !== 1 ? 's' : ''} • {allTabs.length} tab{allTabs.length !== 1 ? 's' : ''}
          </div>
        </div>
        {allTabs.length > 0 && (
          <button
            onClick={handleOpenAll}
            style={{
              padding: '6px 12px',
              background: 'var(--accent)',
              color: 'var(--accent-text)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            <Globe size={14} />
            Open All
          </button>
        )}
      </div>

      {/* Tabs list */}
      {allTabs.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>
          No tabs in this workspace
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {workspace.windows.map((window, windowIdx) => (
            <div key={window.id} style={{ marginBottom: windowIdx < workspace.windows.length - 1 ? '12px' : 0 }}>
              {/* Window header */}
              {workspace.windows.length > 1 && (
                <div
                  style={{
                    padding: '6px 8px',
                    background: 'var(--bg-glass)',
                    borderRadius: 4,
                    marginBottom: '6px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {window.name || `Window ${windowIdx + 1}`}
                </div>
              )}

              {/* Tabs in this window */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {window.tabs.map((tab, tabIdx) => (
                  <div
                    key={`${window.id}-${tabIdx}`}
                    onClick={() => handleOpenTab(tab.url)}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--bg-glass)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'all 0.1s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      e.currentTarget.style.borderColor = 'var(--accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--bg-glass)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }}
                  >
                    <ExternalLink size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          fontSize: 'var(--text-sm)',
                          color: 'var(--text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginBottom: '2px',
                        }}
                      >
                        {tab.title || 'Untitled'}
                      </div>
                      {tab.url && (
                        <div
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {tab.url}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

