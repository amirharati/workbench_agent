import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { InspectorTab } from '../InspectorTab';
import { AskTab } from '../AskTab';
import type { Item } from '../../../lib/db';
import type { AISettings } from '../../../lib/ai/types';
import type { RightPanelTab } from '../../../lib/shell/shellLayoutState';

interface RightPanelProps {
  activeItem: Item | null;
  aiSettings?: AISettings;
  scopeProjectId: string | 'all';
  scopeCollectionId: string | 'all';
  searchContext?: {
    query: string;
    resultItemIds: string[];
    items: Item[];
  } | null;
  isSearchSurface?: boolean;
  enrichmentPrimaryInItemTab?: boolean;
  isCollapsed: boolean;
  activeTab: RightPanelTab;
  onCollapsedChange: (collapsed: boolean) => void;
  onActiveTabChange: (tab: RightPanelTab) => void;
  recentQueries?: string[];
  currentSearchQuery?: string;
  onRerunSearch?: (query: string) => void;
  onOpenItemInTab?: (item: Item) => void;
  onOpenItemIdInTab?: (itemId: string) => void;
  onTestAI?: (
    settings: AISettings,
    prompt: string
  ) => Promise<{ text: string; model: string; requestedModel?: string; modelMismatch?: boolean }>;
}

const PANEL_WIDTH = 280;

export const RightPanel: React.FC<RightPanelProps> = ({
  activeItem,
  aiSettings,
  scopeProjectId,
  scopeCollectionId,
  searchContext,
  isSearchSurface,
  enrichmentPrimaryInItemTab,
  isCollapsed,
  activeTab,
  onCollapsedChange,
  onActiveTabChange,
  recentQueries,
  currentSearchQuery,
  onRerunSearch,
  onOpenItemInTab,
  onOpenItemIdInTab,
  onTestAI,
}) => {
  const [hoverExpanded, setHoverExpanded] = useState(false);

  const toggle = () => onCollapsedChange(!isCollapsed);
  const showExpanded = !isCollapsed || hoverExpanded;

  return (
    <div
      className={`right-panel${isCollapsed && !hoverExpanded ? ' right-panel-collapsed' : ''}`}
      onMouseEnter={() => { if (isCollapsed) setHoverExpanded(true); }}
      onMouseLeave={() => setHoverExpanded(false)}
      style={{
        display: 'flex',
        flexShrink: 0,
        borderLeft: '1px solid var(--border)',
        width: showExpanded ? PANEL_WIDTH : 8,
        overflow: 'hidden',
        background: 'var(--bg-panel)',
        minHeight: 0,
        position: 'relative',
      }}
    >
      {isCollapsed && !hoverExpanded && (
        <button
          onClick={toggle}
          title="Expand panel"
          className="right-panel-handle"
          style={{
            width: 8,
            height: '100%',
            background: 'none',
            border: 'none',
            cursor: 'col-resize',
            padding: 0,
            color: 'var(--text-faint)',
          }}
        >
          <ChevronLeft size={10} />
        </button>
      )}

      {showExpanded && (
        <div
          style={{
            width: PANEL_WIDTH,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
            flex: 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              height: 36,
            }}
          >
            {(['inspector', 'ask'] as RightPanelTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => onActiveTabChange(tab)}
                style={{
                  flex: 1,
                  padding: '0 4px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab
                    ? '2px solid var(--accent)'
                    : '2px solid transparent',
                  color: activeTab === tab ? 'var(--text)' : 'var(--text-faint)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: activeTab === tab ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'color 150ms ease',
                }}
              >
                {tab === 'inspector' ? 'Inspector' : 'Ask'}
              </button>
            ))}

            <button
              onClick={toggle}
              title="Collapse panel"
              style={{
                background: 'none',
                border: 'none',
                borderBottom: '2px solid transparent',
                color: 'var(--text-faint)',
                cursor: 'pointer',
                padding: '0 10px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
            >
              <ChevronRight size={13} />
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {activeTab === 'inspector' ? (
              <InspectorTab
                activeItem={activeItem}
                isSearchSurface={isSearchSurface}
                enrichmentPrimaryInItemTab={enrichmentPrimaryInItemTab}
                currentQuery={currentSearchQuery}
                recentQueries={recentQueries}
                onRerunSearch={onRerunSearch}
                onOpenItemInTab={onOpenItemInTab}
                onOpenItemIdInTab={onOpenItemIdInTab}
              />
            ) : (
              <AskTab
                activeItem={activeItem}
                aiSettings={aiSettings}
                scopeProjectId={scopeProjectId}
                scopeCollectionId={scopeCollectionId}
                searchContext={searchContext}
                onTestAI={onTestAI}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
