import React, { useMemo, useState } from 'react';
import type { Project, Workspace } from '../../lib/db';
import { Panel } from '../../styles/primitives';
import { Resizer } from './Resizer';
import { WorkspaceTab } from './WorkspaceTab';
import { Calendar } from 'lucide-react';

interface WorkspacesViewProps {
  projects: Project[];
  workspaces: Workspace[];
}

export const WorkspacesView: React.FC<WorkspacesViewProps> = ({ projects, workspaces }) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | 'detached' | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [projectNavWidth, setProjectNavWidth] = useState(200);
  const [workspacesListWidth, setWorkspacesListWidth] = useState(300);

  // Group workspaces by project
  const workspacesByProject = useMemo(() => {
    const grouped = new Map<string | 'detached', Workspace[]>();
    
    // Initialize with all projects and detached
    projects.forEach((p) => grouped.set(p.id, []));
    grouped.set('detached', []);
    
    workspaces.forEach((ws) => {
      const key = ws.projectId || 'detached';
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(ws);
    });
    
    return grouped;
  }, [projects, workspaces]);

  // Get workspaces for selected project
  const projectWorkspaces = useMemo(() => {
    if (!selectedProjectId) return [];
    return workspacesByProject.get(selectedProjectId) || [];
  }, [selectedProjectId, workspacesByProject]);

  // Get selected workspace
  const selectedWorkspace = useMemo(() => {
    if (!selectedWorkspaceId) return null;
    return workspaces.find((w) => w.id === selectedWorkspaceId) || null;
  }, [selectedWorkspaceId, workspaces]);

  // Get project counts
  const projectCounts = useMemo(() => {
    const counts = new Map<string | 'detached', number>();
    projects.forEach((p) => {
      counts.set(p.id, (workspacesByProject.get(p.id) || []).length);
    });
    counts.set('detached', (workspacesByProject.get('detached') || []).length);
    return counts;
  }, [projects, workspacesByProject]);

  // Auto-select first project if none selected
  React.useEffect(() => {
    if (selectedProjectId === null && projects.length > 0) {
      // Try to select a project with workspaces, or first project, or detached
      const projectWithWorkspaces = projects.find((p) => (workspacesByProject.get(p.id) || []).length > 0);
      if (projectWithWorkspaces) {
        setSelectedProjectId(projectWithWorkspaces.id);
      } else if ((workspacesByProject.get('detached') || []).length > 0) {
        setSelectedProjectId('detached');
      } else if (projects.length > 0) {
        setSelectedProjectId(projects[0].id);
      }
    }
  }, [selectedProjectId, projects, workspacesByProject]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${projectNavWidth}px 4px ${workspacesListWidth}px 4px 1fr`, gap: '4px', height: '100%', minHeight: 0 }}>
      {/* Left: Project Navigation */}
      <Panel style={{ padding: '4px', overflowY: 'auto' }} className="scrollbar">
        <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>Projects</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {/* Detached workspaces */}
          <button
            onClick={() => {
              setSelectedProjectId('detached');
              setSelectedWorkspaceId(null);
            }}
            style={{
              padding: '6px 8px',
              textAlign: 'left',
              border: 'none',
              background: selectedProjectId === 'detached' ? 'var(--accent-weak)' : 'transparent',
              color: selectedProjectId === 'detached' ? 'var(--accent)' : 'var(--text)',
              cursor: 'pointer',
              borderRadius: 4,
              fontSize: 'var(--text-xs)',
              fontWeight: selectedProjectId === 'detached' ? 600 : 400,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => {
              if (selectedProjectId !== 'detached') {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedProjectId !== 'detached') {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <span>Detached</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {projectCounts.get('detached') || 0}
            </span>
          </button>

          {/* Projects */}
          {projects.map((project) => {
            const count = projectCounts.get(project.id) || 0;
            const isSelected = selectedProjectId === project.id;
            return (
              <button
                key={project.id}
                onClick={() => {
                  setSelectedProjectId(project.id);
                  setSelectedWorkspaceId(null);
                }}
                style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  border: 'none',
                  background: isSelected ? 'var(--accent-weak)' : 'transparent',
                  color: isSelected ? 'var(--accent)' : 'var(--text)',
                  cursor: 'pointer',
                  borderRadius: 4,
                  fontSize: 'var(--text-xs)',
                  fontWeight: isSelected ? 600 : 400,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <span>{project.name}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{count}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Resizer
        direction="vertical"
        onResize={(delta) => {
          setProjectNavWidth((w) => Math.min(Math.max(150, w + delta), 400));
        }}
      />

      {/* Middle: Workspaces List */}
      <Panel style={{ padding: '4px', overflowY: 'auto' }} className="scrollbar">
        {selectedProjectId === null ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Select a project to view workspaces
          </div>
        ) : projectWorkspaces.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            No workspaces in this project
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {projectWorkspaces.map((ws) => {
              const totalTabs = ws.windows.reduce((sum, w) => sum + w.tabs.length, 0);
              const isSelected = selectedWorkspaceId === ws.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => setSelectedWorkspaceId(ws.id)}
                  style={{
                    padding: '8px 10px',
                    textAlign: 'left',
                    border: '1px solid var(--border)',
                    background: isSelected ? 'var(--accent-weak)' : 'var(--bg-glass)',
                    color: isSelected ? 'var(--accent)' : 'var(--text)',
                    cursor: 'pointer',
                    borderRadius: 6,
                    fontSize: 'var(--text-xs)',
                    transition: 'all 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      e.currentTarget.style.borderColor = 'var(--accent)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'var(--bg-glass)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: 'var(--text-sm)' }}>{ws.name}</div>
                  <div style={{ display: 'flex', gap: '8px', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                    <span>{ws.windows.length} window{ws.windows.length !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>{totalTabs} tab{totalTabs !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={10} />
                    {new Date(ws.updated_at).toLocaleDateString()}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <Resizer
        direction="vertical"
        onResize={(delta) => {
          setWorkspacesListWidth((w) => Math.min(Math.max(200, w + delta), 500));
        }}
      />

      {/* Right: Workspace Details */}
      <Panel style={{ padding: '12px', overflowY: 'auto' }} className="scrollbar">
        {selectedWorkspace ? (
          <WorkspaceTab workspace={selectedWorkspace} />
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Select a workspace to view its links
          </div>
        )}
      </Panel>
    </div>
  );
};

