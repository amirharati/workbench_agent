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
      data-expanded={showExpanded ? 'true' : 'false'}
      onMouseEnter={() => { if (isCollapsed) setHoverExpanded(true); }}
      onMouseLeave={() => setHoverExpanded(false)}
      style={{ width: showExpanded ? undefined : 8 }}
    >
      {isCollapsed && !hoverExpanded && (
        <button
          onClick={toggle}
          title="Expand panel"
          aria-label="Expand Inspector panel"
          className="right-panel-handle"
        >
          <ChevronLeft size={10} />
        </button>
      )}

      {showExpanded && (
        <div className="right-panel__content">
          <div
            className="right-panel__tabs"
            role="tablist"
            aria-label="Inspector tools"
          >
            {(['inspector', 'ask'] as RightPanelTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className="right-panel__tab"
                data-active={activeTab === tab ? 'true' : 'false'}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => onActiveTabChange(tab)}
              >
                {tab === 'inspector' ? 'Inspector' : 'Ask'}
              </button>
            ))}

            <button
              type="button"
              className="right-panel__collapse"
              onClick={toggle}
              title="Collapse panel"
              aria-label="Collapse Inspector panel"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          <div className="right-panel__body" role="tabpanel">
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
