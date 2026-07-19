import React, { useState } from 'react';
import { ChevronRight, Clock, Folder, Layers3, Star, Trash2, Workflow } from 'lucide-react';
import type { Item, Project } from '../../lib/db';
import { ItemQuickAccessMarkers } from './ItemQuickAccessMarkers';

type BrowseMode = 'projects' | 'recent' | 'quick-access';

export interface HomeProjectSummary {
  project: Project;
  collectionCount: number;
  itemCount: number;
}

interface HomeBrowsePanelProps {
  projects: HomeProjectSummary[];
  recentItems: Item[];
  quickAccessItems: Item[];
  selectedItemId?: string | null;
  totalItems: number;
  onOpenProject: (projectId: string) => void;
  onSelectItem: (item: Item) => void;
  onItemContextMenu: (event: React.MouseEvent, item: Item) => void;
  onOpenTrash: () => void;
  onOpenPipeline?: () => void;
}

export const HomeBrowsePanel: React.FC<HomeBrowsePanelProps> = ({
  projects,
  recentItems,
  quickAccessItems,
  selectedItemId,
  totalItems,
  onOpenProject,
  onSelectItem,
  onItemContextMenu,
  onOpenTrash,
  onOpenPipeline,
}) => {
  const [mode, setMode] = useState<BrowseMode>('projects');
  const visibleItems = mode === 'recent' ? recentItems : quickAccessItems;

  return (
    <section style={{ width: '100%', maxWidth: 1000 }} aria-labelledby="home-browse-heading">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div>
          <h2 id="home-browse-heading" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 650 }}>
            <Layers3 size={13} /> Browse library
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
            Projects organize durable work; Recent and Favorites &amp; pins help you return quickly.
          </p>
        </div>
        <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
          {totalItems} item{totalItems !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-panel)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ minHeight: 43, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 9px', borderBottom: '1px solid var(--border)' }} aria-label="Library browse views">
          {([
            { id: 'projects' as const, label: 'Projects', icon: Folder, count: projects.length },
            { id: 'recent' as const, label: 'Recent', icon: Clock, count: recentItems.length },
            { id: 'quick-access' as const, label: 'Favorites & pins', icon: Star, count: quickAccessItems.length },
          ]).map(({ id, label, icon: Icon, count }) => {
            const active = mode === id;
            return (
              <button key={id} type="button" onClick={() => setMode(id)} aria-pressed={active} style={browseTabStyle(active)}>
                <Icon size={12} /> {label}
                <span style={{ color: active ? 'var(--accent)' : 'var(--text-faint)', fontSize: 10 }}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="scrollbar" style={{ minHeight: 150, maxHeight: 330, overflowY: 'auto' }}>
          {mode === 'projects' ? (
            projects.length === 0 ? (
              <EmptyBrowseState message="Create a project when you want a durable home for related work." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, padding: 10 }}>
                {projects.map(({ project, collectionCount, itemCount }) => (
                  <button key={project.id} type="button" onClick={() => onOpenProject(project.id)} style={projectButtonStyle}>
                    <span style={{ width: 30, height: 30, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: project.isDefault ? 'var(--accent-weak)' : 'var(--bg-hover)', color: project.isDefault ? 'var(--accent)' : 'var(--text-faint)' }}>
                      <Folder size={14} />
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 650 }}>{project.name}</span>
                      <span style={{ display: 'block', marginTop: 3, color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{project.isDefault ? `${itemCount} incoming` : `${itemCount} items · ${collectionCount} collections`}</span>
                    </span>
                    <ChevronRight size={13} style={{ flexShrink: 0, color: 'var(--text-faint)' }} />
                  </button>
                ))}
              </div>
            )
          ) : visibleItems.length === 0 ? (
            <EmptyBrowseState message={mode === 'quick-access' ? 'Favorite or pin items to keep them close.' : 'Newly captured material will appear here.'} />
          ) : (
            visibleItems.map((item) => {
              const selected = selectedItemId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectItem(item)}
                  onContextMenu={(event) => onItemContextMenu(event, item)}
                  title={item.title || 'Untitled'}
                  style={{ width: '100%', minHeight: 42, display: 'flex', alignItems: 'center', gap: 9, padding: '7px 11px', border: 'none', borderBottom: '1px solid var(--border)', background: selected ? 'var(--bg-active)' : 'transparent', color: selected ? 'var(--accent)' : 'var(--text-muted)', textAlign: 'left', cursor: 'pointer' }}
                >
                  <span style={{ width: 25, height: 25, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'var(--bg-hover)' }}>
                    <ItemQuickAccessMarkers item={item} size={11} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? 'var(--accent)' : 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: selected ? 650 : 550 }}>{item.title || 'Untitled'}</span>
                    <span style={{ display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)', fontSize: 10 }}>{item.url || item.notes || 'Note'}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div style={{ minHeight: 38, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '5px 9px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          {onOpenPipeline && <button type="button" onClick={onOpenPipeline} style={utilityButtonStyle}><Workflow size={11} /> Processing</button>}
          <button type="button" onClick={onOpenTrash} style={utilityButtonStyle}><Trash2 size={11} /> Trash</button>
        </div>
      </div>
    </section>
  );
};

const EmptyBrowseState: React.FC<{ message: string }> = ({ message }) => (
  <div style={{ minHeight: 150, display: 'grid', placeItems: 'center', padding: 24, color: 'var(--text-faint)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>{message}</div>
);

const browseTabStyle = (active: boolean): React.CSSProperties => ({ minHeight: 29, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 9px', border: '1px solid', borderColor: active ? 'var(--border-active)' : 'transparent', borderRadius: 'var(--radius-sm)', background: active ? 'var(--accent-weak)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: active ? 650 : 550, cursor: 'pointer' });
const projectButtonStyle: React.CSSProperties = { minWidth: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg)', color: 'var(--text-muted)', textAlign: 'left', cursor: 'pointer' };
const utilityButtonStyle: React.CSSProperties = { minHeight: 27, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', cursor: 'pointer' };
