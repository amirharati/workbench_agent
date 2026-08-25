import React from 'react';
import {
  AlertTriangle,
  BookMarked,
  Database,
  ExternalLink,
  FileText,
  FolderTree,
  HelpCircle,
  Home,
  Layers3,
  MonitorUp,
  PanelLeft,
  Pencil,
  Pin,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Tags,
  Trash2,
  Upload,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { uiPatterns } from '../../styles/uiPatterns';

function modKeyLabel(): string {
  if (typeof navigator === 'undefined') return '⌘ / Ctrl';
  return /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl';
}

const mod = modKeyLabel();

export type HelpMedia =
  | {
      kind: 'image';
      src: string;
      alt: string;
      caption?: string;
    }
  | {
      kind: 'video';
      src: string;
      title: string;
      caption?: string;
      poster?: string;
    };

export type HelpTopic = {
  id: string;
  group: 'Start here' | 'Daily workflows' | 'Safety & reference';
  title: string;
  summary: string;
  icon: LucideIcon;
  keywords: string[];
  content: React.ReactNode;
  /** Add local image/video descriptors here; the page needs no structural change. */
  media?: HelpMedia[];
};

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="ui-help__kbd">{children}</kbd>
);

const GuideSteps: React.FC<{ steps: React.ReactNode[] }> = ({ steps }) => (
  <ol className="ui-help__steps">
    {steps.map((step, index) => (
      <li key={index}>
        <span aria-hidden="true">{index + 1}</span>
        <div>{step}</div>
      </li>
    ))}
  </ol>
);

const DefinitionGrid: React.FC<{
  entries: Array<{ icon: LucideIcon; term: string; description: React.ReactNode }>;
}> = ({ entries }) => (
  <div className="ui-help__definition-grid">
    {entries.map(({ icon: Icon, term, description }) => (
      <div className="ui-help__definition" key={term}>
        <span className="ui-help__definition-icon"><Icon size={15} aria-hidden="true" /></span>
        <div>
          <strong>{term}</strong>
          <p>{description}</p>
        </div>
      </div>
    ))}
  </div>
);

const Callout: React.FC<{
  tone?: 'info' | 'warning' | 'success';
  title: string;
  children: React.ReactNode;
}> = ({ tone = 'info', title, children }) => (
  <aside className="ui-help__callout" data-tone={tone}>
    {tone === 'warning'
      ? <AlertTriangle size={16} aria-hidden="true" />
      : tone === 'success'
        ? <ShieldCheck size={16} aria-hidden="true" />
        : <HelpCircle size={16} aria-hidden="true" />}
    <div><strong>{title}</strong><p>{children}</p></div>
  </aside>
);

const ShortcutRow: React.FC<{ keys: React.ReactNode; children: React.ReactNode }> = ({ keys, children }) => (
  <div className="ui-help__shortcut">
    <span>{children}</span>
    <span className="ui-help__shortcut-keys">{keys}</span>
  </div>
);

export const HelpMediaGallery: React.FC<{ media?: HelpMedia[] }> = ({ media }) => {
  if (!media?.length) return null;
  return (
    <div className="ui-help__media-grid" aria-label="Topic media">
      {media.map((entry) => (
        <figure className="ui-help__media" data-kind={entry.kind} key={`${entry.kind}:${entry.src}`}>
          {entry.kind === 'image' ? (
            <img src={entry.src} alt={entry.alt} loading="lazy" />
          ) : (
            <video controls preload="metadata" poster={entry.poster} aria-label={entry.title}>
              <source src={entry.src} />
            </video>
          )}
          {entry.caption ? <figcaption>{entry.caption}</figcaption> : null}
        </figure>
      ))}
    </div>
  );
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'first-run',
    group: 'Start here',
    title: 'First run and your data folder',
    summary: 'Connect storage, understand what is local, and make your first capture safely.',
    icon: ShieldCheck,
    keywords: ['setup', 'install', 'onboarding', 'dropbox', 'folder', 'sqlite', 'backup', 'inbox', 'incoming'],
    content: (
      <>
        <p>Homebase is local-first. Your live browser database is protected by a mirror in the data folder you choose during setup.</p>
        <GuideSteps steps={[
            <>Finish any Chrome install or New Tab prompt, then choose a dedicated data folder. If Chrome interrupts the picker, Homebase keeps setup open and changes nothing.</>,
            <>Review the folder name and recognized files, then select <strong>Use this folder</strong>. The folder is not linked before this confirmation.</>,
            <>If the folder already contains <code>workbench.sqlite</code>, Homebase loads it. An empty browser database must not replace it.</>,
            <>Read the completion summary: it reports the selected folder, item count, and whether <code>workbench.sqlite</code> and <code>workbench-content.sqlite</code> were loaded or created.</>,
            <>Save an initial link with the side panel or create a note in Library. Unscoped captures go to <strong>Inbox / Incoming</strong>.</>,
            <>Open <strong>Settings → Backup &amp; restore</strong> and confirm the live mirror reports a successful write.</>,
          ]} />
        <Callout tone="warning" title="Dropbox is not multi-device sync">
          Do not let two Homebase installations write the same shared SQLite file. Multi-device merge is a later feature.
        </Callout>
      </>
    ),
  },
  {
    id: 'mental-model',
    group: 'Start here',
    title: 'How Homebase is organized',
    summary: 'Learn which structures are durable organization and which are temporary working context.',
    icon: Layers3,
    keywords: ['model', 'item', 'link', 'note', 'project', 'collection', 'favorite', 'pin', 'workspace', 'focus'],
    content: (
      <>
        <DefinitionGrid entries={[
          { icon: BookMarked, term: 'Library item', description: <>A saved link or a note. One item can belong to several collections without creating separate copies.</> },
          { icon: FolderTree, term: 'Project', description: <>A durable area of work. It owns collections, project Pins, and project workspaces.</> },
          { icon: Tags, term: 'Collection', description: <>A manual folder inside a project. Collections are not AI categories.</> },
          { icon: Star, term: 'Favorite', description: <>A global quick-access flag visible across the library.</> },
          { icon: Pin, term: 'Pin', description: <>A project-local quick-access flag. The same item can be pinned in one project and not another.</> },
          { icon: Layers3, term: 'Workspace', description: <>A working set of library items and saved searches. A browser snapshot stays separate until you explicitly add its URLs. Workspace membership does not replace permanent project/collection membership.</> },
        ]} />
        <Callout title="Temporary versus permanent">
          <strong>Add to workspace</strong> changes the working set. <strong>Organize…</strong> changes durable project and collection membership.
        </Callout>
      </>
    ),
  },
  {
    id: 'home-library',
    group: 'Daily workflows',
    title: 'Home and Library',
    summary: 'Use Home for active context and Library for complete maintenance and browsing.',
    icon: Home,
    keywords: ['home', 'overview', 'library', 'all items', 'links', 'notes', 'gallery', 'list', 'inspector', 'focus'],
    content: (
      <>
        <DefinitionGrid entries={[
          { icon: Home, term: 'Home · Overview', description: <>Resume recent material, open projects, browse Favorites &amp; pins, and see the active workspace.</> },
          { icon: Search, term: 'Home · Search', description: <>Search without leaving the current Home context. Search state is retained when you return to Overview.</> },
          { icon: Tags, term: 'Home · Categories', description: <>Browse topical AI categories across All Library or the current project. Select several categories to show items that belong to any selected topic.</> },
          { icon: BookMarked, term: 'Library', description: <>Browse the full catalog with All items, Links, Notes, Favorites &amp; pins, and Workspace views.</> },
          { icon: PanelLeft, term: 'Inspector / Item', description: <>Selecting an item updates the shared Inspector without navigating. The selection follows you when a page restores its open detail. Categories appear before the bounded, scrollable summary; <strong>Add to workspace…</strong> files the item without leaving the page.</> },
        ]} />
        <ul>
          <li>Use the context row to switch between <strong>All Library</strong> and recently used projects.</li>
          <li>Use list/gallery view for density, then use the local filter to narrow the visible list without leaving it.</li>
          <li>Click the displayed URL to visit a page. Clicking elsewhere on an item row selects it instead.</li>
          <li>The Inspector shows up to three compact category assignments initially. Use <strong>More</strong> to review the rest inside its bounded category list.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'capture-edit',
    group: 'Daily workflows',
    title: 'Capture, edit, and organize material',
    summary: 'Save the current page, create notes, edit details, and place material deliberately.',
    icon: Pencil,
    keywords: ['capture', 'save', 'side panel', 'bookmark', 'note', 'edit', 'organize', 'tags', 'url', 'favorite'],
    content: (
      <>
        <GuideSteps steps={[
            <>Open the browser side panel on a page. Confirm the title and URL, add notes if useful, then choose a project and collection.</>,
            <>For an existing URL, edit the existing saved item or add it to another location. Homebase keeps one canonical item with several placements.</>,
            <>In Home, Library, Project, Search, or Inspector, select an item and use <strong>Edit</strong> to change title, URL, notes, or tags.</>,
            <>Use <strong>Organize…</strong> to add or remove project/collection memberships, or create a destination inline.</>,
            <>Use <strong>Favorite</strong> for global quick access and <strong>Pin</strong> for the active project.</>,
          ]} />
        <Callout title="A URL is the navigation target">
          Only the URL itself opens the external page. The rest of the card or row is for selection and item actions.
        </Callout>
      </>
    ),
  },
  {
    id: 'projects-collections',
    group: 'Daily workflows',
    title: 'Projects and collections',
    summary: 'Keep durable work grouped without losing the ability to browse the whole library.',
    icon: FolderTree,
    keywords: ['project', 'collection', 'incoming', 'inbox', 'unfiled', 'scope', 'pin', 'delete'],
    content: (
      <>
        <ul>
          <li>Select a project in the sidebar or Home context row. The project page keeps All items, Pinned, Collection, and Workspace as explicit views.</li>
          <li>Selecting a collection changes the visible project material; it does not create a new workspace.</li>
          <li>Normal projects have an <strong>Unfiled</strong> destination for material not assigned to a named collection.</li>
          <li><strong>Inbox</strong> is the unscoped capture project and intentionally has one <strong>Incoming</strong> collection. Additional Inbox collections are not allowed.</li>
          <li>Deleting a collection keeps its items; material with no remaining named placement is reassigned to the safe default destination described by the confirmation.</li>
        </ul>
        <Callout title="Scope is a view, not ownership">
          Widening a view to All Library does not remove project membership. Search scope and organization are separate choices.
        </Callout>
      </>
    ),
  },
  {
    id: 'search',
    group: 'Daily workflows',
    title: 'Search and list filtering',
    summary: 'Use full Search for discovery and local filters for quickly narrowing the list in front of you.',
    icon: Search,
    keywords: ['search', 'hybrid', 'scope', 'filter', 'recent query', 'workspace', 'organize', 'command palette', 'exact phrase', 'boolean', 'site', 'exclude', 'tag', 'category'],
    content: (
      <>
        <DefinitionGrid entries={[
          { icon: Search, term: 'Full Search', description: <>Searches the chosen library/project/collection scope and can use the configured hybrid retrieval path.</> },
          { icon: FileText, term: 'List filter', description: <>Instantly narrows the currently visible list using item fields, tags, placement names, and metadata. It does not run AI or embeddings.</> },
        ]} />
        <GuideSteps steps={[
            <>Open <strong>Home · Search</strong> or press <Kbd>{mod}</Kbd> + <Kbd>K</Kbd>.</>,
            <>Choose All Library, a project, or a collection as the search scope.</>,
            <>Select a result to inspect it. Use <strong>Add to workspace…</strong> for temporary working context or <strong>Organize…</strong> for permanent membership.</>,
            <>Use <strong>Add to workspace…</strong> beside the search title when you want a frozen search entry; choose and confirm its destination in the modal.</>,
          ]} />
        <DefinitionGrid entries={[
          { icon: Search, term: 'All terms', description: <><code>ml in trading</code> requires both meaningful terms. Connector words such as “in” do not become requirements.</> },
          { icon: Search, term: 'Exact phrase', description: <>Use quotes: <code>“machine learning in trading”</code>.</> },
          { icon: Search, term: 'Alternatives', description: <>Use uppercase or lowercase <code>OR</code>: <code>ai OR quant</code>. Plain spacing, <code>AND</code>, and a leading <code>+</code> are required-term forms.</> },
          { icon: Search, term: 'Tags / categories', description: <>Use exact membership filters such as <code>tag:investing</code> or <code>category:“Investment Strategies”</code>, then add ordinary words to refine. Repeat fields with <code>+</code> / <code>AND</code>, or use <code>OR</code> for alternatives.</> },
          { icon: Search, term: 'Exclude / site', description: <>Use <code>-beginner</code>, <code>-“intro course”</code>, or <code>site:arxiv.org</code>.</> },
        ]} />
        <Callout title="Exact rules first; semantics remain visible">
          Primary results obey the parsed terms, phrases, exclusions, site, and current organization scope. Hybrid mode uses available embeddings to rank those matches and shows semantic discoveries separately. If embeddings are unavailable or processing is using the heavy index, Search labels the run as a text fallback instead of silently changing the query meaning.
        </Callout>
      </>
    ),
  },
  {
    id: 'workspaces-tabs',
    group: 'Daily workflows',
    title: 'Workspaces and browser snapshots',
    summary: 'Use one explicit workspace system while keeping captured Chrome windows separate.',
    icon: Layers3,
    keywords: ['workspace', 'general workspace', 'named workspace', 'active workspace', 'focus', 'tab commander', 'browser snapshot', 'copy', 'move'],
    content: (
      <>
        <DefinitionGrid entries={[
          { icon: Layers3, term: 'Global workspace', description: <>The one shared workspace available from every project and page.</> },
          { icon: BookMarked, term: 'Project workspaces', description: <>Every project has one automatic General workspace and may have additional named workspaces.</> },
          { icon: MonitorUp, term: 'Browser snapshot', description: <>A captured Chrome window/tab arrangement. Restore it in Chrome or explicitly add its URLs to a Homebase workspace.</> },
          { icon: ExternalLink, term: 'Active workspace', description: <>The one workspace whose entries are currently presented. Page and project navigation do not change it automatically.</> },
        ]} />
        <ul>
          <li>Use <strong>Add to workspace…</strong> to choose Global, a project's General workspace, or a named workspace. The active workspace is preselected but never used without confirmation.</li>
          <li>An item may exist in several workspaces. Copy keeps the source entry; Move removes it from the source after adding it to the destination.</li>
          <li>Use <strong>Open links</strong> to open URL-capable workspace entries. Notes remain in Homebase.</li>
          <li>Use <strong>Tab Commander</strong> to inspect live Chrome windows and create browser snapshots. A snapshot is not automatically a Homebase workspace.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'import',
    group: 'Daily workflows',
    title: 'Import bookmarks',
    summary: 'Preview and commit a controlled batch before optionally spending money on processing.',
    icon: Upload,
    keywords: ['import', 'bookmark file', 'chrome bookmarks', 'csv', 'json', 'html', 'preview', 'dedupe', 'pipeline'],
    content: (
      <>
        <GuideSteps steps={[
            <>Open <strong>Import Studio</strong> and choose Bookmark file or Chrome bookmarks. Format assistant is visibly marked not implemented.</>,
            <>Review detected format, valid/invalid rows, duplicates, and the proposed destination. Inbox / Incoming is the safe default.</>,
            <>Filter and select the rows you actually want, then commit them to the database.</>,
            <>After the bookmarks are saved, choose whether to run enrichment. Importing and AI processing are separate decisions.</>,
            <>Read the completion report for imported, merged, skipped, restored, unavailable, or incomplete rows. A mixed result is an informational completion report, not a failed import.</>,
          ]} />
        <Callout tone="success" title="Saved before optional AI">
          A processing cancellation keeps database work already committed. Verify the report rather than assuming every selected row ran through AI.
        </Callout>
      </>
    ),
  },
  {
    id: 'move-remove',
    group: 'Daily workflows',
    title: 'Copy, move, remove, and restore',
    summary: 'Organize one item or a filtered group, understand copy/move rules, and recover safely.',
    icon: Trash2,
    keywords: ['drag', 'drop', 'copy', 'move', 'batch', 'bulk', 'select all', 'filtered', 'remove', 'delete', 'trash', 'restore', 'undo', 'workspace', 'collection', 'project'],
    content: (
      <>
        <DefinitionGrid entries={[
          { icon: Search, term: 'Result → container', description: <>Dragging from Search, Similar, All Library, Favorites, Recent, or Enrichment adds the item to the destination. The source result is never removed.</> },
          { icon: Layers3, term: 'Same container type', description: <>Workspace to workspace and collection to collection can Copy or Move. Homebase asks which action you intend.</> },
          { icon: FolderTree, term: 'Different container types', description: <>Workspace to collection, or collection to workspace, always copies. Their roles are different, so the source membership remains.</> },
          { icon: Layers3, term: 'Group selection', description: <>Choose <strong>Select</strong> in a list or Search, optionally filter first, then use <strong>Select all filtered</strong> and <strong>Organize selected</strong>. Dragging any selected row carries the same group.</> },
          { icon: Trash2, term: 'Trash', description: <>Removing an item from every saved location moves it to Trash. Restore returns it; Delete permanently or Empty trash cannot be undone.</> },
        ]} />
        <ul>
          <li><strong>All Library</strong> is a source view, never a drop destination.</li>
          <li>A Search selection means the current result set. A list selection can include every item or only the items matching its quick filter.</li>
          <li>Removing an entry from a workspace removes only that reference. It does not delete the library item or its enrichment.</li>
          <li>When an item has several collection placements, the removal dialog shows them so you can remove selected locations or move the item to Trash.</li>
          <li>Deleted projects and collections appear in Trash as complete recoverable containers. Restoring the container restores its saved structure.</li>
          <li>A collection deletion does not delete its canonical items. The confirmation explains where items without another active placement will go.</li>
        </ul>
        <Callout tone="warning" title="Empty Trash is final">
          Empty Trash permanently removes deleted items and the recovery snapshots for deleted projects and collections. Verify the list before confirming.
        </Callout>
      </>
    ),
  },
  {
    id: 'enrichment',
    group: 'Daily workflows',
    title: 'Enrichment, classification, and AI categories',
    summary: 'Inspect what happened, understand what is suggested, and rerun only the scope you intend.',
    icon: Workflow,
    keywords: ['enrichment', 'pipeline', 'fetch', 'fetch v2', 'legacy', 'browser tab', 'authenticated', 'resume', 'cancel', 'sleep', 'ai', 'embed', 'classification', 'taxonomy', 'status', 'retry', 'discover', 'no match', 'suggested topic', 'category manager'],
    content: (
      <>
        <DefinitionGrid entries={[
          { icon: Workflow, term: 'Shared job', description: <>Import, Enrichment, the side panel, and item actions submit to the same background pipeline. Pages observe jobs; they do not run separate copies.</> },
          { icon: ExternalLink, term: 'Fetch service v2', description: <>The default acquisition service collects bounded candidates from the signed-in Chrome page and applicable local document, structured, site-aware, or public readers, then keeps the strongest useful result. Single and bulk jobs use this same service. Legacy remains selectable in Settings for temporary comparison or rollback.</> },
          { icon: ShieldCheck, term: 'Durable progress', description: <>Navigation, refresh, another dashboard, sleep, or an extension restart does not erase completed stages. Resume continues pending work instead of starting the batch at item one.</> },
          { icon: Workflow, term: 'Enrichment review', description: <>Inspect fetch and AI quality, failures, raw/extracted content, and the next available action.</> },
          { icon: Tags, term: 'Classification review', description: <>Review readiness, blockers, assigned categories, and suggested categories before reruns.</> },
          { icon: FolderTree, term: 'AI categories', description: <>The library-wide topics used by classification. <strong>All categories</strong> shows every group and category; these remain separate from your manual collections.</> },
          { icon: Search, term: 'Two classification signals', description: <>A purpose-aware LLM and a local exact embedding comparison contribute independently. Strong results are combined additively; rerunning does not erase an accepted category merely because a later pass omits it.</> },
          { icon: HelpCircle, term: 'No matching category', description: <>If no existing parent topic is defensible, Homebase leaves the item unassigned and stores its free-form topic as review evidence. It remains eligible for Discover and category management instead of being forced into an unrelated General category.</> },
        ]} />
        <ul>
          <li>For local and remote PDFs, Fetch v2 transfers document bytes in bounded chunks and extracts text locally. It does not depend on scraping Chrome's PDF viewer.</li>
          <li>Authenticated browser capture reads the rendered page without activating temporary tabs in your current work. Applicable readers can run as independent candidates; one broken adapter must not discard useful generic page text.</li>
          <li><strong>Fetched</strong> means useful page text was saved. <strong>Enriched</strong> means later AI work also succeeded. Missing, invalid, rate-limited, or out-of-credit AI settings do not discard a successful fetch.</li>
          <li>Click a status badge for item-specific meaning and suggested next steps.</li>
          <li>Use per-item actions while diagnosing; use selected/bulk actions only after confirming their scope and expected AI cost.</li>
          <li>A full single-item job runs its own scoped Discover/classify sequence. A bulk job completes fetch/AI and embedding waves, runs Discover once for the submitted scope, then classifies each eligible item once against that settled taxonomy.</li>
          <li>Suggested categories are not assigned categories. Accept, reject, remove, choose a primary, or open <strong>Manage</strong> to search existing parents/children and create a missing structure. Changes are additive and item-local rejection does not suppress a category globally.</li>
          <li>A <strong>Suggested topic · no existing category matched</strong> message is evidence, not an assignment. Review it in the same full category manager from the Inspector or side panel.</li>
          <li>Cancel or closing the job's owner dashboard stops at a safe stage boundary; completed writes are retained. Resume binds the job to an open dashboard and continues what remains.</li>
        </ul>
        <Callout title="Failures are stage-specific">
          A fetch, AI, embedding, or classification failure should identify its own stage. Retry that scope instead of assuming the saved bookmark or earlier completed work was lost.
        </Callout>
      </>
    ),
  },
  {
    id: 'backup-restore',
    group: 'Safety & reference',
    title: 'Backup, restore, and recovery',
    summary: 'Know which file is live, what automatic copies exist, and how to recover without clobbering data.',
    icon: Database,
    keywords: ['backup', 'restore', 'recovery', 'workbench.sqlite', 'workbench-content.sqlite', 'content database', 'raw fetch', 'prev', 'manual', 'safety', 'undo', 'conflict', 'reconnect'],
    content: (
      <>
        <DefinitionGrid entries={[
          { icon: Database, term: 'workbench.sqlite', description: <>The core library: items, projects, collections, workspaces, enrichment metadata, and durable jobs. Homebase works from its browser-local database and maintains this recovery mirror in your chosen folder.</> },
          { icon: FileText, term: 'workbench-content.sqlite', description: <>The fetched and extracted page bodies, stored compressed under opaque content keys. It has its own worker and exactly one durable copy in the chosen folder.</> },
          { icon: ShieldCheck, term: 'Automatic previous copies', description: <><code>workbench.prev.sqlite</code> and <code>workbench.prev2.sqlite</code> rotate before live replacement.</> },
          { icon: BookMarked, term: 'Manual core snapshot', description: <>Backup now creates a timestamped snapshot of the core library. JSON export is an optional portable representation. Neither one contains fetched page bodies.</> },
          { icon: Trash2, term: 'Safety / undo snapshot', description: <>Restore protects the state being replaced so an accidental rollback can itself be reversed.</> },
        ]} />
        <GuideSteps steps={[
            <>Check <strong>Settings → Backup &amp; restore</strong> for the linked folder, last mirror, and any error or conflict.</>,
            <>If folder access is paused, reconnect the saved folder. Do not choose a new empty folder just to dismiss the message.</>,
            <>Use <strong>Backup now</strong> before destructive testing or major imports. It also flushes current fetched bodies to <code>workbench-content.sqlite</code>, but it does not create versioned content history.</>,
            <>Restore replaces the current library. Compare the snapshot date/size and read the confirmation; Homebase saves the current state first.</>,
            <>After reinstall, choose the existing folder and verify counts and recognizable items before making new edits. Keep both database files if you also need the saved raw fetch bodies.</>,
          ]} />
        <Callout title="Different data, different lifecycle">
          Core snapshots protect organization and enrichment state. <code>workbench-content.sqlite</code> is a replaceable content cache with one current durable copy, so snapshot comparison covers library inventory—not historical raw page content.
        </Callout>
        <Callout tone="warning" title="Never ignore suspected loss">
          Stop writing, preserve the folder files, and record counts, timestamps, and the exact action. Do not repeatedly reload or restore until the cause is understood.
        </Callout>
      </>
    ),
  },
  {
    id: 'settings-shortcuts',
    group: 'Safety & reference',
    title: 'Settings, shortcuts, and troubleshooting',
    summary: 'Adjust appearance, configure optional AI, move quickly, and collect useful evidence when something fails.',
    icon: Settings,
    keywords: ['settings', 'theme', 'font', 'shortcut', 'keyboard', 'troubleshoot', 'console', 'reload', 'api key', 'fetch v2', 'legacy fetch'],
    content: (
      <>
        <h3>Settings</h3>
        <ul>
          <li><strong>General:</strong> dashboard theme, font size, and browser Home/New Tab guidance.</li>
          <li><strong>AI &amp; processing:</strong> provider, model routing, API key, fetch-service selector, and a test prompt. Fetch v2 is the default; Legacy remains available as a deliberate rollback choice. AI is optional and user-triggered. If a key is missing or the provider rejects a request (authentication, credits, rate limit, timeout, network, or model/server error), the initiating view explains the failure; successful fetched text remains available to keyword search.</li>
          <li><strong>Backup &amp; restore:</strong> folder health, mirror status, snapshots, restore, and conflict choices.</li>
          <li><strong>Advanced:</strong> taxonomy repair and diagnostics. Use destructive controls only after reading their confirmation.</li>
        </ul>
        <h3>Keyboard</h3>
        <div className="ui-help__shortcuts">
          <ShortcutRow keys={<><Kbd>{mod}</Kbd><Kbd>K</Kbd></>}>Open library search from anywhere in the dashboard.</ShortcutRow>
          <ShortcutRow keys={<><Kbd>{mod}</Kbd><Kbd>W</Kbd></>}>Close the active workspace entry when focus is not inside an editor.</ShortcutRow>
          <ShortcutRow keys={<Kbd>Esc</Kbd>}>Close the command palette, menus, or dialogs.</ShortcutRow>
          <ShortcutRow keys={<><Kbd>{mod}</Kbd><Kbd>S</Kbd></>}>Save while editing a note.</ShortcutRow>
          <ShortcutRow keys={<><Kbd>{mod}</Kbd><Kbd>Enter</Kbd></>}>Submit the current prompt in Ask.</ShortcutRow>
        </div>
        <h3>Troubleshooting evidence</h3>
        <ul>
          <li>Record the current branch/commit, Chrome version, screen size, active project/collection, and exact steps.</li>
          <li>For storage problems, also record item counts and data-folder filenames, sizes, and timestamps.</li>
          <li>Copy the first application-owned console error. Repeated third-party preload warnings usually belong to the visited site, not Homebase.</li>
          <li>After a code fix, rebuild and reload the unpacked extension, then repeat the same action before broader testing.</li>
        </ul>
      </>
    ),
  },
];

export function filterHelpTopics(query: string, topics: HelpTopic[] = HELP_TOPICS): HelpTopic[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return topics;
  return topics.filter((topic) => {
    const searchable = [topic.title, topic.summary, topic.group, ...topic.keywords].join(' ').toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

const GROUPS: HelpTopic['group'][] = ['Start here', 'Daily workflows', 'Safety & reference'];

export const HelpView: React.FC = () => {
  const [query, setQuery] = React.useState('');
  const visibleTopics = React.useMemo(() => filterHelpTopics(query), [query]);

  const goToTopic = (id: string) => {
    document.getElementById(`help-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="scrollbar ui-page-frame ui-help-page" style={{ ...uiPatterns.pageFrame, overflow: 'auto' }}>
      <header className="ui-help__hero">
        <div className="ui-help__hero-copy">
          <span className="ui-help__eyebrow"><HelpCircle size={13} aria-hidden="true" /> Homebase guide</span>
          <h1 style={uiPatterns.pageTitle}>Help</h1>
          <p>Learn the current workflow, understand where data lives, and find the right action without leaving Homebase.</p>
        </div>
        <label className="ui-help__search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Help…"
            aria-label="Search Help"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear Help search"><X size={14} /></button>
          ) : null}
        </label>
      </header>

      <div className="ui-help__orientation" role="note">
        <ShieldCheck size={16} aria-hidden="true" />
        <span><strong>New here?</strong> Read First run, How Homebase is organized, then Capture and edit. Your data-safety guide is always under Backup and recovery.</span>
      </div>

      <div className="ui-help__layout">
        <nav className="ui-panel ui-help__contents" aria-label="Help contents">
          <div className="ui-help__contents-title">Contents</div>
          {GROUPS.map((group) => {
            const topics = visibleTopics.filter((topic) => topic.group === group);
            if (!topics.length) return null;
            return (
              <div className="ui-help__contents-group" key={group}>
                <div>{group}</div>
                {topics.map((topic) => {
                  const Icon = topic.icon;
                  return (
                    <button type="button" key={topic.id} onClick={() => goToTopic(topic.id)}>
                      <Icon size={14} aria-hidden="true" />
                      <span>{topic.title}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <main className="ui-help__articles" aria-label="Help articles" aria-live="polite">
          {visibleTopics.length ? visibleTopics.map((topic) => {
            const Icon = topic.icon;
            return (
              <article className="ui-panel ui-help__article" id={`help-${topic.id}`} key={topic.id}>
                <header>
                  <span className="ui-help__article-icon"><Icon size={19} aria-hidden="true" /></span>
                  <div>
                    <div className="ui-help__article-group">{topic.group}</div>
                    <h2>{topic.title}</h2>
                    <p>{topic.summary}</p>
                  </div>
                </header>
                <div className="ui-help__article-body">{topic.content}</div>
                <HelpMediaGallery media={topic.media} />
              </article>
            );
          }) : (
            <div className="ui-panel ui-help__empty">
              <Search size={22} aria-hidden="true" />
              <h2>No Help topics match “{query.trim()}”</h2>
              <p>Try a broader term such as backup, workspace, Search, project, or import.</p>
              <button className="ui-button ui-button--secondary" type="button" onClick={() => setQuery('')}>Show all topics</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
