import React, { useState, useRef, useEffect } from 'react';
import type { Workspace } from '../../lib/db';
import { Layers, ChevronDown, Plus, Link2 } from 'lucide-react';

interface WorkspaceSelectorProps {
  workspaces: Workspace[];
  linkedWorkspaceIds?: string[];
  onLinkWorkspace?: (workspaceId: string) => void;
  onUnlinkWorkspace?: (workspaceId: string) => void;
  onOpenWorkspace?: (workspace: Workspace) => void;
  onCreateWorkspace?: () => void;
}

export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  workspaces,
  linkedWorkspaceIds = [],
  onLinkWorkspace,
  onUnlinkWorkspace,
  onOpenWorkspace,
  onCreateWorkspace,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const linkedWorkspaces = workspaces.filter(w => linkedWorkspaceIds.includes(w.id));
  const availableWorkspaces = workspaces.filter(w => !linkedWorkspaceIds.includes(w.id));
  const hasLinked = linkedWorkspaces.length > 0;

  const pillStyle: React.CSSProperties = {
    padding: '3px 10px',
    height: 24,
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--bg-glass)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.1s ease',
    whiteSpace: 'nowrap' as const,
  };

  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      {/* Linked workspace indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
        <Layers size={12} />
        <span>Workspaces:</span>
      </div>

      {/* Show linked workspaces as pills (max 2) */}
      {linkedWorkspaces.slice(0, 2).map(w => (
        <button
          key={w.id}
          onClick={() => onOpenWorkspace?.(w)}
          style={{
            ...pillStyle,
            background: 'var(--accent-weak)',
            borderColor: 'var(--accent)',
            color: 'var(--text)',
          }}
          title={`Open workspace: ${w.name}`}
        >
          {w.name}
        </button>
      ))}

      {/* If more than 2 linked, show count */}
      {linkedWorkspaces.length > 2 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
          +{linkedWorkspaces.length - 2}
        </span>
      )}

      {/* Dropdown to link/unlink workspaces */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          style={pillStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)';
            e.currentTarget.style.color = 'var(--text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-glass)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
          title={hasLinked ? 'Manage linked workspaces' : 'Link a workspace'}
        >
          <Link2 size={12} />
          <span>{hasLinked ? 'Edit' : 'Link'}</span>
          <ChevronDown size={10} style={{ transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} />
        </button>

        {showDropdown && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              boxShadow: 'var(--shadow-lg)',
              zIndex: 100,
              minWidth: 180,
              maxHeight: 240,
              overflowY: 'auto',
              padding: '4px',
            }}
            className="scrollbar"
          >
            {/* Linked section */}
            {linkedWorkspaces.length > 0 && (
              <>
                <div style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontWeight: 500 }}>
                  Linked
                </div>
                {linkedWorkspaces.map(w => (
                  <div
                    key={w.id}
                    style={{
                      padding: '6px 10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderRadius: 4,
                    }}
                  >
                    <button
                      onClick={() => onOpenWorkspace?.(w)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        fontSize: 'var(--text-xs)',
                        padding: 0,
                        textAlign: 'left',
                      }}
                    >
                      {w.name}
                    </button>
                    {onUnlinkWorkspace && (
                      <button
                        onClick={() => onUnlinkWorkspace(w.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-faint)',
                          cursor: 'pointer',
                          fontSize: 'var(--text-xs)',
                          padding: '2px 4px',
                        }}
                        title="Unlink workspace"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {availableWorkspaces.length > 0 && (
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                )}
              </>
            )}

            {/* Available to link */}
            {availableWorkspaces.length > 0 && (
              <>
                <div style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontWeight: 500 }}>
                  Available
                </div>
                {availableWorkspaces.map(w => (
                  <button
                    key={w.id}
                    onClick={() => {
                      onLinkWorkspace?.(w.id);
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 'var(--text-xs)',
                      textAlign: 'left',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      e.currentTarget.style.color = 'var(--text)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }}
                  >
                    <Plus size={10} />
                    {w.name}
                  </button>
                ))}
              </>
            )}

            {/* Empty state */}
            {workspaces.length === 0 && (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
                No workspaces available
              </div>
            )}

            {/* Create workspace button */}
            {onCreateWorkspace && (
              <>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <button
                  onClick={() => {
                    onCreateWorkspace();
                    setShowDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    fontSize: 'var(--text-xs)',
                    textAlign: 'left',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--accent-weak)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Plus size={10} />
                  Create Workspace
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

