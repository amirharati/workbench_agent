import React from 'react';
import {
  Home,
  BookMarked,
  Search,
  Star,
  Pin,
  Trash2,
  MousePointerClick,
  Keyboard,
  PanelLeft,
  Upload,
  Tags,
  Terminal,
  Settings,
  Layers,
  GripHorizontal,
  Zap,
  Workflow,
} from 'lucide-react';

function modKeyLabel(): string {
  if (typeof navigator === 'undefined') return '⌘ / Ctrl';
  return /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl';
}

const mod = modKeyLabel();

type HelpSection = {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
};

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd
    style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 4,
      border: '1px solid var(--border)',
      background: 'var(--bg-glass)',
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
      color: 'var(--text)',
      lineHeight: 1.4,
    }}
  >
    {children}
  </kbd>
);

const ShortcutRow: React.FC<{ keys: React.ReactNode; desc: string }> = ({ keys, desc }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      padding: '8px 0',
      borderBottom: '1px solid var(--border)',
      fontSize: 'var(--text-sm)',
    }}
  >
    <span style={{ color: 'var(--text-muted)', flex: 1 }}>{desc}</span>
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', flexShrink: 0 }}>
      {keys}
    </span>
  </div>
);

const FeatureRow: React.FC<{ icon: React.ReactNode; title: string; desc: string }> = ({
  icon,
  title,
  desc,
}) => (
  <div style={{ display: 'flex', gap: 12, padding: '10px 0' }}>
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: 'var(--accent-weak)',
        color: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {icon}
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.55 }}>{desc}</div>
    </div>
  </div>
);

export const HelpView: React.FC = () => {
  const sections: HelpSection[] = [
    {
      id: 'start',
      title: 'Getting started',
      icon: <Home size={18} />,
      children: (
        <>
          <p style={para}>
            Homebase is your personal library for bookmarks and notes. Save links from the browser side panel,
            organize them into projects and collections, enrich them with AI, and open items in tabs on Home or
            Bookmarks.
          </p>
          <ol style={list}>
            <li>Use the <strong>side panel</strong> (extension) to save the current page.</li>
            <li>Pick a <strong>project</strong> and <strong>collection</strong> in the left sidebar to scope your view.</li>
            <li>Open <strong>Home</strong> for search, quick links, and tabbed item detail.</li>
            <li>Visit <strong>Settings</strong> to connect backup and AI providers.</li>
          </ol>
        </>
      ),
    },
    {
      id: 'shortcuts',
      title: 'Keyboard shortcuts',
      icon: <Keyboard size={18} />,
      children: (
        <>
          <ShortcutRow
            keys={
              <>
                <Kbd>{mod}</Kbd>
                <Kbd>K</Kbd>
              </>
            }
            desc="Open command palette — jump to library search"
          />
          <ShortcutRow
            keys={
              <>
                <Kbd>{mod}</Kbd>
                <Kbd>W</Kbd>
              </>
            }
            desc="Close the active tab on Home (when focus is not in a text field)"
          />
          <ShortcutRow keys={<Kbd>Esc</Kbd>} desc="Close command palette, context menus, or dialogs" />
          <ShortcutRow keys={<Kbd>Enter</Kbd>} desc="Submit search from Home hero or command palette" />
          <ShortcutRow
            keys={
              <>
                <Kbd>{mod}</Kbd>
                <Kbd>Enter</Kbd>
              </>
            }
            desc="Open search result URL in a new browser tab (Search view)"
          />
          <ShortcutRow
            keys={
              <>
                <Kbd>{mod}</Kbd>
                <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>click</span>
              </>
            }
            desc="Open an item in another panel space (when split layout is available)"
          />
          <ShortcutRow
            keys={<span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>× on scope chip</span>}
            desc="Clear project, collection, category, or pipeline browse filter (Bookmarks / Notes)"
          />
        </>
      ),
    },
    {
      id: 'processing',
      title: 'Processing digest (Home)',
      icon: <Zap size={18} />,
      children: (
        <>
          <p style={para}>
            The <strong>Processing Digest</strong> card on Home summarizes pipeline queues. Click a row to open a
            filtered list tab on Home (same as Library Overview).
          </p>
          <ul style={list}>
            <li>
              <strong>Classify queue</strong> — total waiting on AI categories. The row also shows how many are{' '}
              <strong>AI-ready</strong> (can run now). Click <strong>Review & classify</strong> for a checklist;
              items marked &quot;Won&apos;t run&quot; are skipped. After a run, the summary explains sent to AI vs got
              a category vs still in queue.
            </li>
            <li>
              <strong>Process not enriched (N)</strong> — same checklist flow for fetch + classify; Cancel stops
              mid-batch (saved work is kept).
            </li>
            <li>
              <strong>Cancel</strong> — stops an in-flight <em>not enriched</em> batch; work already saved is kept.
            </li>
          </ul>
          <p style={{ ...para, marginBottom: 0 }}>
            <strong>Collections vs AI categories:</strong> Collections are manual folders in the sidebar. AI categories
            are semantic tags assigned by the pipeline — review them under Tools → AI Categories or in the Inspector.
          </p>
        </>
      ),
    },
    {
      id: 'navigation',
      title: 'Navigation',
      icon: <PanelLeft size={18} />,
      children: (
        <>
          <FeatureRow
            icon={<Home size={16} />}
            title="Home"
            desc="Landing page with library search, favorites & pins, recent items, and tabbed detail below. Drag the divider to give more room to landing or tabs."
          />
          <FeatureRow
            icon={<BookMarked size={16} />}
            title="Library"
            desc="Browse links and notes together or filter by type. Scope by project/collection, organize material, add it to any workspace, or enter Focus explicitly."
          />
          <FeatureRow
            icon={<Layers size={16} />}
            title="Workspaces"
            desc="Manage project working sets and browser snapshots together; activate Homebase work or restore captured browser windows."
          />
          <FeatureRow
            icon={<Search size={16} />}
            title="Search"
            desc="Full library search with filters. You can also search from Home or open search in a Home tab."
          />
          <FeatureRow
            icon={<Workflow size={16} />}
            title="Enrichment Hub"
            desc="Fetch, AI, embed, and classify — inspect items, filter by issue type, and run bulk or per-step actions."
          />
          <FeatureRow
            icon={<Upload size={16} />}
            title="Import Studio"
            desc="Import bookmarks from exports and other formats."
          />
          <FeatureRow
            icon={<Tags size={16} />}
            title="Categories (in Enrichment Hub)"
            desc="Semantic tags from enrichment — not the same as Collections (manual folders). Browse taxonomy, run discover, and review assignments in Enrichment Hub → Categories."
          />
          <FeatureRow
            icon={<Terminal size={16} />}
            title="Tab Commander"
            desc="Manage live Chrome windows and tabs, then capture a selection as a browser snapshot or project workspace."
          />
          <FeatureRow
            icon={<Settings size={16} />}
            title="Settings"
            desc="Backup folder, AI keys, enrichment, categorization, and appearance."
          />
        </>
      ),
    },
    {
      id: 'home-tabs',
      title: 'Home & tabs',
      icon: <GripHorizontal size={18} />,
      children: (
        <>
          <p style={para}>
            When you open an item, search, or a utility list (Pinned, Favorites, Recent, Trash), a{' '}
            <strong>tab strip</strong> appears at the bottom of Home. Drag the horizontal divider to resize the
            landing section vs. tabs — both areas scroll independently.
          </p>
          <ul style={list}>
            <li>Click a tab to switch; click <strong>×</strong> on a tab to close it.</li>
            <li>Item tabs show ⭐ and 📌 toggles in the header for favorites and pins.</li>
            <li>Quick links on Home open utility lists in tabs without leaving the page.</li>
            <li>Library Overview and Processing Digest rows open a filtered list tab on Home (not Bookmarks).</li>
          </ul>
        </>
      ),
    },
    {
      id: 'quick-access',
      title: 'Pins, favorites & trash',
      icon: <Star size={18} />,
      children: (
        <>
          <FeatureRow
            icon={<Star size={16} style={{ color: '#ef4444' }} />}
            title="Favorites"
            desc="Star an item from its tab header, side panel, or right-click menu. Favorites appear on Home and in the Favorites tab."
          />
          <FeatureRow
            icon={<Pin size={16} />}
            title="Pinned"
            desc="Pin important items for quick access. In collection lists, pinned items sort to the top. Pinned-only items show 📌; both flags show ⭐ then 📌 on cards."
          />
          <FeatureRow
            icon={<Trash2 size={16} style={{ color: '#ef4444' }} />}
            title="Trash"
            desc="Deleting removes from one collection, or moves to trash when it was the last placement. Restore from the Trash tab or context menu."
          />
          <p style={{ ...para, marginTop: 8 }}>
            <MousePointerClick size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Right-click any item card or list row for pin, favorite, trash, and open actions.
          </p>
        </>
      ),
    },
    {
      id: 'side-panel',
      title: 'Browser side panel',
      icon: <BookMarked size={18} />,
      children: (
        <>
          <p style={para}>
            The extension side panel saves the current tab. If the URL already exists, you can edit an existing
            placement or add to another collection.
          </p>
          <ul style={list}>
            <li><strong>Quick access</strong> — ⭐ / 📌 while editing a saved bookmark.</li>
            <li><strong>Remove</strong> — drops this collection placement; last placement moves the item to trash.</li>
            <li><strong>Trash</strong> — shown when removing the only placement.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'more',
      title: 'More to come',
      icon: <Tags size={18} />,
      children: (
        <p style={para}>
          This help page is updated as features ship — check back from the <strong>Help</strong> link at the bottom of
          the left sidebar.
        </p>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '8px 4px 48px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            margin: '0 0 8px',
            fontSize: 'var(--text-xl)',
            fontWeight: 700,
            letterSpacing: -0.02,
          }}
        >
          Help
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
          Homebase guide — basics, shortcuts, and where to find things. v2
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {sections.map((section) => (
          <section
            key={section.id}
            id={`help-${section.id}`}
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 18px',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <h2
              style={{
                margin: '0 0 12px',
                fontSize: 'var(--text-base)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: 'var(--text)',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'var(--accent-weak)',
                  color: 'var(--accent)',
                }}
              >
                {section.icon}
              </span>
              {section.title}
            </h2>
            <div style={{ color: 'var(--text)' }}>{section.children}</div>
          </section>
        ))}
      </div>
    </div>
  );
};

const para: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
  lineHeight: 1.6,
};

const list: React.CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
  lineHeight: 1.65,
};
