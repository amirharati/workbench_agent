import React from 'react';
import { Layout } from 'lucide-react';
import { CurrentWindows } from './CurrentWindows';
import { CategoriesSection } from './CategoriesSection';
import { Collection, Item } from '../lib/db';

interface WindowGroup {
  windowId: number;
  tabs: chrome.tabs.Tab[];
}

interface FullPageDashboardProps {
  windows: WindowGroup[];
  items: Item[];
  collections: Collection[];
  onCloseTab: (tabId: number) => void;
  onSaveWindow: (windowId: number) => void;
  onDeleteItem: (id: string) => void;
  onRefresh: () => void;
}

export const FullPageDashboard: React.FC<FullPageDashboardProps> = ({
  windows,
  items,
  collections,
  onCloseTab,
  onSaveWindow,
  onDeleteItem,
  onRefresh,
}) => {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '1.5rem 2rem',
          background: 'white',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <Layout size={28} style={{ color: '#3b82f6' }} />
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, flex: 1 }}>Tab Manager</h1>
      </header>

      {/* Main Content - Two Column Layout */}
      <main
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 400px',
          gap: '2rem',
          padding: '2rem',
          maxWidth: '1600px',
          margin: '0 auto',
        }}
      >
        {/* Left Column: Current Windows */}
        <div>
          <CurrentWindows
            windows={windows}
            onCloseTab={onCloseTab}
            onSaveWindow={onSaveWindow}
          />
        </div>

        {/* Right Column: Categories */}
        <div>
          <CategoriesSection
            collections={collections}
            items={items}
            onDeleteItem={onDeleteItem}
            onRefresh={onRefresh}
          />
        </div>
      </main>
    </div>
  );
};
