import React, { useMemo, useState } from 'react';
import { Workspace } from '../../../lib/db';
import { DashboardView } from './DashboardLayout';

interface MainContentProps {
  activeView: DashboardView;
  workspaces: Workspace[];
}

export const MainContent: React.FC<MainContentProps> = ({ activeView, workspaces }) => {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedWindowIds, setSelectedWindowIds] = useState<Set<string>>(new Set());
  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId) || null,
    [workspaces, selectedWorkspaceId]
  );

  const toggleWindowSelection = (id: string) => {
    setSelectedWindowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllWindows = () => {
    if (!selectedWorkspace) return;
    const allIds = selectedWorkspace.windows.map((w) => w.id);
    setSelectedWindowIds(new Set(allIds));
  };

  const clearWindowSelection = () => setSelectedWindowIds(new Set());

  const getSelectedWindows = () => {
    if (!selectedWorkspace) return [];
    if (selectedWindowIds.size === 0) return selectedWorkspace.windows;
    return selectedWorkspace.windows.filter((w) => selectedWindowIds.has(w.id));
  };

  const restoreWindows = async (windowsToRestore: Workspace['windows']) => {
    for (const w of windowsToRestore) {
      const urls = (w.tabs || [])
        .map((t) => t.url)
        .filter((u): u is string => Boolean(u) && u.startsWith('http'));
      if (urls.length === 0) continue;
      try {
        await chrome.windows.create({ url: urls });
      } catch (e) {
        console.error('Restore window failed', e);
      }
    }
  };

  const handleRestoreAll = async () => {
    if (!selectedWorkspace) return;
    await restoreWindows(selectedWorkspace.windows);
  };

  const handleRestoreSelected = async () => {
    if (!selectedWorkspace) return;
    await restoreWindows(getSelectedWindows());
  };

  const handleRestoreSingle = async (windowId: string) => {
    if (!selectedWorkspace) return;
    const w = selectedWorkspace.windows.find((x) => x.id === windowId);
    if (!w) return;
    await restoreWindows([w]);
  };

  const handleOpenLinkHere = async (url: string | undefined) => {
    if (!url || !url.startsWith('http')) return;
    try {
      const currentWindow = await chrome.windows.getCurrent();
      await chrome.tabs.create({ windowId: currentWindow.id, url, active: true });
    } catch (e) {
      console.error('Open link failed', e);
    }
  };

  const renderContent = () => {
    switch (activeView) {
      case 'projects':
        return (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1.5rem'
          }}>
            {[1, 2, 3].map((i) => (
              <div 
                key={i} 
                style={{
                  background: 'white',
                  padding: '1.5rem',
                  borderRadius: '0.5rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  border: '1px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
              >
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  marginBottom: '0.5rem' 
                }}>
                  <h3 style={{ 
                    fontWeight: 600, 
                    fontSize: '1.125rem', 
                    margin: 0 
                  }}>
                    Project {i}
                  </h3>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    background: '#dbeafe', 
                    color: '#1e40af', 
                    padding: '0.25rem 0.5rem', 
                    borderRadius: '9999px' 
                  }}>
                    Active
                  </span>
                </div>
                <p style={{ 
                  color: '#6b7280', 
                  fontSize: '0.875rem', 
                  marginBottom: '1rem',
                  margin: '0 0 1rem 0'
                }}>
                  Description of project {i} goes here.
                </p>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem', 
                  fontSize: '0.875rem', 
                  color: '#9ca3af' 
                }}>
                  <span>12 bookmarks</span>
                  <span>•</span>
                  <span>4 notes</span>
                </div>
              </div>
            ))}
          </div>
        );
      case 'bookmarks':
        return (
          <div style={{
            background: 'white',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1rem',
              borderBottom: '1px solid #f3f4f6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <input 
                type="text" 
                placeholder="Search bookmarks..." 
                style={{
                  width: '256px',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem'
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button style={{
                  padding: '0.375rem 0.75rem',
                  fontSize: '0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  background: 'white',
                  cursor: 'pointer'
                }}>
                  Filter
                </button>
                <button style={{
                  padding: '0.375rem 0.75rem',
                  fontSize: '0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  background: 'white',
                  cursor: 'pointer'
                }}>
                  Sort
                </button>
              </div>
            </div>
            <table style={{ width: '100%', fontSize: '0.875rem', textAlign: 'left' }}>
              <thead style={{ background: '#f9fafb', color: '#6b7280' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>Title</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>URL</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>Tags</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr 
                    key={i} 
                    style={{ 
                      borderTop: '1px solid #f3f4f6',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 500, color: '#111827' }}>
                      React Documentation {i}
                    </td>
                    <td style={{ 
                      padding: '0.75rem 1rem', 
                      color: '#6b7280', 
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      maxWidth: '300px'
                    }}>
                      https://react.dev/learn/example-{i}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        background: '#f3f4f6',
                        color: '#4b5563',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem'
                      }}>
                        dev
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#9ca3af' }}>Dec 15</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'notes':
        return (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: '1.5rem',
            height: '100%'
          }}>
            {/* Note List */}
            <div style={{
              borderRight: '1px solid #e5e7eb',
              paddingRight: '1.5rem',
              overflowY: 'auto'
            }}>
              {[1, 2, 3, 4].map((i) => (
                <div 
                  key={i} 
                  style={{
                    padding: '1rem',
                    marginBottom: '0.5rem',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    border: '1px solid transparent',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = 'transparent';
                  }}
                >
                  <h4 style={{ 
                    fontWeight: 500, 
                    color: '#111827', 
                    marginBottom: '0.25rem',
                    margin: '0 0 0.25rem 0'
                  }}>
                    Meeting Notes {i}
                  </h4>
                  <p style={{ 
                    fontSize: '0.75rem', 
                    color: '#6b7280', 
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    margin: '0 0 0.5rem 0'
                  }}>
                    Discussion about the new architecture and how we plan to migrate the database...
                  </p>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    color: '#9ca3af', 
                    display: 'block' 
                  }}>
                    2 hours ago
                  </span>
                </div>
              ))}
            </div>
            {/* Editor Placeholder */}
            <div style={{
              background: 'white',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              padding: '2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af'
            }}>
              Select a note to view
            </div>
          </div>
        );
      case 'workspaces':
        if (workspaces.length === 0) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
              <div style={{ textAlign: 'center', maxWidth: '520px' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#111827' }}>No workspaces yet</div>
                <div style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.95rem', lineHeight: 1.5 }}>
                  Save a snapshot from <b>Tab Commander</b> (bottom panel) and it will show up here.
                </div>
              </div>
            </div>
          );
        }

        // Card list page: pick a workspace
        if (!selectedWorkspace) {
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.75rem',
                    padding: '0.75rem',
                    background: '#ffffff',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setSelectedWorkspaceId(ws.id);
                    setSelectedWindowIds(new Set());
                  }}
                  title={ws.name}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 900, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ws.name}
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 900, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '9999px', padding: '0.125rem 0.5rem', color: '#374151' }}>
                      {ws.windows.length} windows
                    </span>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.375rem' }}>
                    Updated {new Date(ws.updated_at).toLocaleString()}
                  </div>
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    <button
                      style={{
                        padding: '0.375rem 0.5rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e5e7eb',
                        background: 'white',
                        cursor: 'pointer',
                        fontWeight: 800,
                        color: '#374151',
                      }}
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        }

        // Detail page: back + two-column (windows left, tabs right) like Tab Commander
        const selectedWindows = selectedWindowIds.size === 0
          ? selectedWorkspace.windows
          : selectedWorkspace.windows.filter((w) => selectedWindowIds.has(w.id));

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                onClick={() => {
                  setSelectedWorkspaceId(null);
                  setSelectedWindowIds(new Set());
                }}
                style={{
                  padding: '0.375rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb',
                  background: 'white',
                  cursor: 'pointer',
                  fontWeight: 800,
                  color: '#374151',
                }}
              >
                ← Back
              </button>
              <div>
                <div style={{ fontWeight: 900, color: '#111827', fontSize: '1.1rem' }}>{selectedWorkspace.name}</div>
                <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                  Updated {new Date(selectedWorkspace.updated_at).toLocaleString()} • {selectedWorkspace.windows.length} windows
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '0.75rem', flex: 1, minHeight: 0 }}>
              {/* Windows column */}
              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  background: 'white',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ fontWeight: 900, color: '#111827' }}>Windows</div>
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    <button
                      onClick={handleRestoreAll}
                      style={{
                        padding: '0.35rem 0.6rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #2563eb',
                        background: '#2563eb',
                        color: 'white',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Restore all
                    </button>
                    <button
                      onClick={handleRestoreSelected}
                      style={{
                        padding: '0.35rem 0.6rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e5e7eb',
                        background: 'white',
                        color: '#111827',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Restore selected
                    </button>
                    <button
                      onClick={selectAllWindows}
                      style={{
                        padding: '0.35rem 0.6rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e5e7eb',
                        background: 'white',
                        color: '#111827',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Select all
                    </button>
                    <button
                      onClick={clearWindowSelection}
                      style={{
                        padding: '0.35rem 0.6rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e5e7eb',
                        background: 'white',
                        color: '#111827',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                  {selectedWorkspace.windows.map((w) => {
                    const isChecked = selectedWindowIds.size === 0 ? true : selectedWindowIds.has(w.id);
                    return (
                      <div
                        key={w.id}
                        onClick={() => toggleWindowSelection(w.id)}
                        style={{
                          padding: '0.6rem',
                          marginBottom: '0.35rem',
                          borderRadius: '0.6rem',
                          border: isChecked ? '1px solid #93c5fd' : '1px solid #e5e7eb',
                          background: isChecked ? '#eef2ff' : 'white',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleWindowSelection(w.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#2563eb' }}
                              title="Select window"
                            />
                            <div style={{ fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {w.name || 'Window'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 900,
                                background: '#f3f4f6',
                                border: '1px solid #e5e7eb',
                                borderRadius: '9999px',
                                padding: '0.1rem 0.45rem',
                                color: '#374151',
                              }}
                            >
                              {w.tabs.length}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRestoreSingle(w.id);
                              }}
                              style={{
                                padding: '0.3rem 0.45rem',
                                borderRadius: '0.5rem',
                                border: '1px solid #e5e7eb',
                                background: 'white',
                                cursor: 'pointer',
                                fontWeight: 800,
                                color: '#374151',
                              }}
                            >
                              Restore
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tabs column */}
              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  background: 'white',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  minHeight: 0,
                }}
              >
                <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 900, color: '#111827', fontSize: '1rem' }}>Tabs</div>
                  <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                    {selectedWindows.length} window(s) • {selectedWindows.reduce((sum, w) => sum + w.tabs.length, 0)} tabs
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem' }}>
                  {selectedWindows.length === 0 && (
                    <div style={{ padding: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>Select a window to view tabs.</div>
                  )}
                  {selectedWindows.flatMap((w) =>
                    w.tabs.map((t, idx) => (
                      <div
                        key={`${w.id}-${idx}`}
                        onClick={() => handleOpenLinkHere(t.url)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.35rem 0.25rem',
                          borderRadius: '0.5rem',
                          cursor: 'pointer',
                          border: '1px solid transparent',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                        title={t.url}
                      >
                        {t.favIconUrl ? (
                          <img src={t.favIconUrl} alt="" style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 14, height: 14, borderRadius: 2, background: '#e5e7eb', flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              fontWeight: 800,
                              color: '#111827',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {t.title || 'Untitled'}
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {t.url}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return <div>Select a view</div>;
    }
  };

  return (
    <div style={{ 
      height: '100%', 
      width: '100%', 
      display: 'flex', 
      flexDirection: 'column' 
    }}>
      <div style={{ 
        marginBottom: '1.5rem', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <h1 style={{ 
          fontSize: '1.5rem', 
          fontWeight: 'bold', 
          color: '#111827',
          margin: 0,
          textTransform: 'capitalize'
        }}>
          {activeView}
        </h1>
        <button style={{
          padding: '0.5rem 1rem',
          background: '#2563eb',
          color: 'white',
          borderRadius: '0.375rem',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#1d4ed8'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#2563eb'}
        >
          <span>+ New {activeView.slice(0, -1)}</span>
        </button>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto' }}>
        {renderContent()}
      </div>
    </div>
  );
};
