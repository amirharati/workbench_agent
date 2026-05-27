import React, { useState } from 'react';
import { Workspace } from '../../lib/db';

interface WorkspaceTabRendererProps {
  workspace: Workspace;
}

export const WorkspaceTabRenderer: React.FC<WorkspaceTabRendererProps> = ({
  workspace,
}) => {
  const [selectedWsLinks, setSelectedWsLinks] = useState<Set<string>>(new Set());

  // Compute all link keys for this workspace
  const allLinkKeys: string[] = [];
  workspace.windows.forEach((win, winIdx) => {
    win.tabs.forEach((_, tabIdx) => {
      allLinkKeys.push(`${workspace.id}:${winIdx}:${tabIdx}`);
    });
  });
  
  const selectedCount = allLinkKeys.filter(k => selectedWsLinks.has(k)).length;
  const allSelected = selectedCount === allLinkKeys.length && allLinkKeys.length > 0;
  const someSelected = selectedCount > 0;
  
  const toggleAll = () => {
    if (allSelected) {
      setSelectedWsLinks(prev => {
        const next = new Set(prev);
        allLinkKeys.forEach(k => next.delete(k));
        return next;
      });
    } else {
      setSelectedWsLinks(prev => {
        const next = new Set(prev);
        allLinkKeys.forEach(k => next.add(k));
        return next;
      });
    }
  };
  
  const getSelectedTabs = () => {
    const tabs: { url: string; title?: string }[] = [];
    workspace.windows.forEach((win, winIdx) => {
      win.tabs.forEach((tab, tabIdx) => {
        if (selectedWsLinks.has(`${workspace.id}:${winIdx}:${tabIdx}`)) {
          tabs.push(tab);
        }
      });
    });
    return tabs;
  };
  
  const openSelected = () => {
    getSelectedTabs().forEach(tab => {
      if (tab.url) window.open(tab.url, '_blank');
    });
  };

  return (
    <div style={{ padding: '16px 20px', height: '100%', overflowY: 'auto', background: 'var(--bg)' }} className="scrollbar">
      <div style={{ maxWidth: 700 }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 4 }}>
          {workspace.name}
        </h2>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginBottom: 16 }}>
          {allLinkKeys.length} links · {workspace.windows.length} window{workspace.windows.length !== 1 ? 's' : ''}
          {!workspace.projectId && <span style={{ marginLeft: 8, color: 'var(--warning, #f59e0b)' }}>detached</span>}
        </div>
        
        {/* Selection actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            Select all
          </label>
          
          {someSelected && (
            <>
              <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
                {selectedCount} selected
              </span>
              <button
                onClick={openSelected}
                style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
              >
                Open
              </button>
            </>
          )}
          
          {!someSelected && (
            <button
              onClick={() => {
                workspace.windows.forEach(w => {
                  w.tabs.forEach(tab => {
                    if (tab.url) window.open(tab.url, '_blank');
                  });
                });
              }}
              style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
            >
              Open all
            </button>
          )}
        </div>
        
        {workspace.windows.map((win, winIdx) => (
          <div key={win.id || winIdx} style={{ marginBottom: 16 }}>
            {workspace.windows.length > 1 && (
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-faint)', marginBottom: 8, textTransform: 'uppercase' }}>
                Window {winIdx + 1} ({win.tabs.length})
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {win.tabs.map((tab, tabIdx) => {
                const linkKey = `${workspace.id}:${winIdx}:${tabIdx}`;
                const isSelected = selectedWsLinks.has(linkKey);
                
                const toggleSelection = () => {
                  setSelectedWsLinks(prev => {
                    const next = new Set(prev);
                    if (isSelected) next.delete(linkKey);
                    else next.add(linkKey);
                    return next;
                  });
                };
                
                return (
                  <label
                    key={tabIdx}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: isSelected ? 'var(--accent-weak)' : 'var(--bg-panel)',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={toggleSelection}
                      style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
                    />
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tab.title || tab.url}
                      </div>
                      {tab.title && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                          {tab.url}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
