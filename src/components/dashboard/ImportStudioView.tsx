import React from 'react';
import type { Collection, Project } from '../../lib/db';

type ImportTab = 'file' | 'chrome' | 'ai';

interface ImportStudioViewProps {
  projects: Project[];
  collections: Collection[];
  onBack: () => void;
}

interface ImportCandidate {
  source: 'file-html' | 'file-csv' | 'file-json' | 'chrome-api';
  title: string;
  url: string;
  notes?: string;
  tags?: string[];
  folderPath?: string;
  imageUrl?: string;
  importSource?: string;
}

const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px',
  background: 'var(--bg-glass)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

export const ImportStudioView: React.FC<ImportStudioViewProps> = ({
  projects,
  collections,
  onBack,
}) => {
  const [tab, setTab] = React.useState<ImportTab>('file');
  const [rows, setRows] = React.useState<ImportCandidate[]>([]);
  const [sourceLabel, setSourceLabel] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [selectedProjectId, setSelectedProjectId] = React.useState('');
  const [selectedCollectionId, setSelectedCollectionId] = React.useState('');

  const normalizeUrl = (url: string): string => {
    try {
      const u = new URL(url.trim());
      u.hash = '';
      const path = u.pathname.replace(/\/+$/, '');
      u.pathname = path || '/';
      return u.toString().replace(/\/$/, '');
    } catch {
      return url.trim();
    }
  };

  const isHttpUrl = (url: string): boolean => /^https?:\/\//i.test(url.trim());

  const parseCsvLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const next = line[i + 1];
      if (ch === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  };

  const toKeyMap = (headers: string[]): Record<string, number> => {
    const map: Record<string, number> = {};
    headers.forEach((h, i) => {
      map[h.trim().toLowerCase()] = i;
    });
    return map;
  };

  const pickField = (row: string[], keyMap: Record<string, number>, aliases: string[]): string => {
    for (const alias of aliases) {
      const index = keyMap[alias];
      if (typeof index === 'number' && row[index]) return row[index].trim();
    }
    return '';
  };

  const parseCsv = (text: string): ImportCandidate[] => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];
    const header = parseCsvLine(lines[0]);
    const keyMap = toKeyMap(header);
    const out: ImportCandidate[] = [];

    for (let i = 1; i < lines.length; i += 1) {
      const row = parseCsvLine(lines[i]);
      const url = pickField(row, keyMap, ['url', 'href', 'link']);
      const title = pickField(row, keyMap, ['title', 'name']) || url;
      const notes = pickField(row, keyMap, ['notes', 'description', 'comment']);
      const tagsRaw = pickField(row, keyMap, ['tags', 'tag']);
      const folderPath = pickField(row, keyMap, [
        'folder',
        'folder path',
        'path',
        'collection',
        'group',
        'category',
      ]);
      const imageUrl = pickField(row, keyMap, [
        'image',
        'image url',
        'cover',
        'cover url',
        'thumbnail',
        'preview',
        'media',
      ]);
      const importSource = pickField(row, keyMap, ['source', 'provider', 'from', 'origin']);
      const tags = tagsRaw ? tagsRaw.split(/[;,]/).map((t) => t.trim()).filter(Boolean) : [];
      if (!url) continue;
      out.push({
        source: 'file-csv',
        title: title || 'Untitled',
        url,
        notes: notes || undefined,
        tags: tags.length ? tags : undefined,
        folderPath: folderPath || undefined,
        imageUrl: imageUrl || undefined,
        importSource: importSource || undefined,
      });
    }
    return out;
  };

  const parseJson = (text: string): ImportCandidate[] => {
    const parsed = JSON.parse(text) as unknown;
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object'
      ? ((parsed as Record<string, unknown>).bookmarks ||
          (parsed as Record<string, unknown>).items ||
          (parsed as Record<string, unknown>).links ||
          []) as unknown
      : [];
    if (!Array.isArray(items)) return [];

    const out: ImportCandidate[] = [];
    for (const entry of items) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const url = String(row.url ?? row.href ?? row.link ?? '').trim();
      if (!url) continue;
      const title = String(row.title ?? row.name ?? url).trim();
      const notes = String(row.notes ?? row.description ?? '').trim();
      const rawTags = row.tags;
      const tags = Array.isArray(rawTags)
        ? rawTags.map((t) => String(t).trim()).filter(Boolean)
        : typeof rawTags === 'string'
        ? rawTags.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
        : [];
      out.push({
        source: 'file-json',
        title: title || 'Untitled',
        url,
        notes: notes || undefined,
        tags: tags.length ? tags : undefined,
        folderPath: String(row.folderPath ?? row.folder ?? row.collection ?? '').trim() || undefined,
        imageUrl: String(row.imageUrl ?? row.image ?? row.cover ?? row.thumbnail ?? '').trim() || undefined,
        importSource: String(row.importSource ?? row.source ?? row.provider ?? '').trim() || undefined,
      });
    }
    return out;
  };

  const parseNetscapeHtml = (text: string): ImportCandidate[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const anchors = Array.from(doc.querySelectorAll('a[href]'));

    const getFolderPath = (anchor: HTMLAnchorElement): string => {
      const segments: string[] = [];
      let current: HTMLElement | null = anchor.parentElement;
      while (current) {
        if (current.tagName === 'DL') {
          const prev = current.previousElementSibling as HTMLElement | null;
          if (prev && /^H[1-6]$/i.test(prev.tagName)) {
            const textValue = prev.textContent?.trim();
            if (textValue) segments.unshift(textValue);
          }
        }
        current = current.parentElement;
      }
      return segments.join(' / ');
    };

    const out: ImportCandidate[] = [];
    anchors.forEach((a) => {
      const url = a.getAttribute('href')?.trim() || '';
      if (!url) return;
      out.push({
        source: 'file-html',
        title: a.textContent?.trim() || url,
        url,
        folderPath: getFolderPath(a as HTMLAnchorElement) || undefined,
      });
    });
    return out;
  };

  const setImportedRows = (nextRows: ImportCandidate[], label: string) => {
    setRows(nextRows);
    setSourceLabel(label);
    setError('');
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handleFilePicked: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      const text = await file.text();
      const lowerName = file.name.toLowerCase();
      let parsedRows: ImportCandidate[] = [];
      if (lowerName.endsWith('.csv')) {
        parsedRows = parseCsv(text);
      } else if (lowerName.endsWith('.json')) {
        parsedRows = parseJson(text);
      } else {
        parsedRows = parseNetscapeHtml(text);
      }
      setImportedRows(parsedRows, `File: ${file.name}`);
      if (parsedRows.length === 0) {
        setError('No bookmark rows were detected in that file.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse file.');
      setRows([]);
      setSourceLabel('');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  const loadFromChromeApi = async () => {
    setLoading(true);
    try {
      if (!chrome?.bookmarks?.getTree) {
        throw new Error('Chrome bookmarks API is unavailable in this context.');
      }
      const tree = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
        chrome.bookmarks.getTree((result) => {
          const runtimeError = chrome.runtime?.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }
          resolve(result || []);
        });
      });

      const out: ImportCandidate[] = [];
      const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[], path: string[]) => {
        nodes.forEach((node) => {
          if (node.url) {
            out.push({
              source: 'chrome-api',
              title: node.title || node.url,
              url: node.url,
              folderPath: path.join(' / ') || undefined,
            });
            return;
          }
          const nextPath = node.title ? [...path, node.title] : path;
          if (Array.isArray(node.children) && node.children.length > 0) {
            walk(node.children, nextPath);
          }
        });
      };

      walk(tree, []);
      setImportedRows(out, 'Chrome bookmarks API');
      if (out.length === 0) {
        setError('No bookmark URLs returned from Chrome API.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Chrome bookmarks.');
      setRows([]);
      setSourceLabel('');
    } finally {
      setLoading(false);
    }
  };

  const stats = React.useMemo(() => {
    const valid = rows.filter((row) => isHttpUrl(row.url)).length;
    const invalid = rows.length - valid;
    const seen = new Set<string>();
    let duplicates = 0;
    rows.forEach((row) => {
      const key = normalizeUrl(row.url);
      if (!key) return;
      if (seen.has(key)) {
        duplicates += 1;
      } else {
        seen.add(key);
      }
    });
    return { total: rows.length, valid, invalid, duplicates };
  }, [rows]);

  const filteredCollections = React.useMemo(() => {
    if (!selectedProjectId) return collections;
    return collections.filter(
      (c) =>
        c.primaryProjectId === selectedProjectId ||
        (Array.isArray(c.projectIds) && c.projectIds.includes(selectedProjectId))
    );
  }, [collections, selectedProjectId]);

  const renderPreviewTable = () => (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
          Import preview
        </div>
        {sourceLabel ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{sourceLabel}</div> : null}
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        <span>Total: {stats.total}</span>
        <span>Valid URL: {stats.valid}</span>
        <span>Invalid URL: {stats.invalid}</span>
        <span>Potential duplicates: {stats.duplicates}</span>
      </div>
      {error ? <div style={{ fontSize: 'var(--text-xs)', color: '#dc2626' }}>{error}</div> : null}
      <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              {['Title', 'URL', 'Folder', 'Image', 'Source'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    position: 'sticky',
                    top: 0,
                    background: 'var(--bg)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((row, index) => (
              <tr key={`${row.url}-${index}`}>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{row.title || 'Untitled'}</td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', wordBreak: 'break-all' }}>{row.url}</td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{row.folderPath || '-'}</td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', wordBreak: 'break-all' }}>
                  {row.imageUrl || '-'}
                </td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                  {row.importSource || row.source}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 300 ? (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Showing first 300 rows. Full row count is still used for stats.
        </div>
      ) : null}
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        Save-to-DB is intentionally disabled for this phase; this screen validates ingestion/preview only.
      </div>
    </div>
  );

  const renderFileTab = () => (
    <>
      <div style={sectionStyle}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
          File import sources
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Start with known formats, then normalize into one import preview model.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
          {['Netscape HTML', 'CSV (url/title/notes)', 'JSON array'].map((format) => (
            <div
              key={format}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '8px',
                background: 'var(--bg)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text)',
              }}
            >
              {format}
            </div>
          ))}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm,.csv,.json,text/html,text/csv,application/json"
          onChange={handleFilePicked}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleChooseFile}
            disabled={loading}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--accent)',
              background: 'var(--accent)',
              color: 'var(--accent-text, #fff)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: loading ? 'progress' : 'pointer',
            }}
          >
            {loading ? 'Parsing…' : 'Choose file'}
          </button>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Supports Netscape HTML, CSV, and JSON.
          </span>
        </div>
      </div>
      <div style={sectionStyle}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>Destination mapping (planning)</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Preselect destination for next phase (write pipeline).</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <select
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              setSelectedCollectionId('');
            }}
            style={{
              padding: '6px 8px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--bg)',
              color: 'var(--text)',
            }}
          >
            <option value="">Select project (optional)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={selectedCollectionId}
            onChange={(e) => setSelectedCollectionId(e.target.value)}
            style={{
              padding: '6px 8px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--bg)',
              color: 'var(--text)',
            }}
          >
            <option value="">Select collection (optional)</option>
            {filteredCollections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {(rows.length > 0 || error) && renderPreviewTable()}
    </>
  );

  const renderChromeTab = () => (
    <>
      <div style={sectionStyle}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
          Import from Chrome bookmarks API
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Pulls current bookmarks via `chrome.bookmarks.getTree()` and converts them to the same preview schema.
        </div>
        <button
          type="button"
          onClick={loadFromChromeApi}
          disabled={loading}
          style={{
            width: 'fit-content',
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: 'var(--accent-text, #fff)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: loading ? 'progress' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Load from Chrome'}
        </button>
      </div>
      {(rows.length > 0 || error) && renderPreviewTable()}
    </>
  );

  const renderAiTab = () => (
    <div style={sectionStyle}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
        AI format assistant (mockup)
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
        Future mode: paste unknown format samples, generate a mapping schema, validate, then run through
        the same import pipeline. Leaving this as mock-only until we collect real examples.
      </div>
      <textarea
        placeholder="Paste unknown sample rows or format notes here..."
        rows={7}
        style={{
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'var(--bg)',
          color: 'var(--text)',
          padding: '8px',
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          disabled
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg-hover)',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: 'not-allowed',
          }}
        >
          Generate schema (later)
        </button>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Mockup only; no AI parsing logic wired yet.
        </span>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text)' }}>
          Bookmark Import Studio
        </h1>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
          }}
        >
          Back to bookmarks
        </button>
      </div>

      <div style={{ display: 'flex', gap: '6px' }}>
        {[
          { id: 'file', label: 'File import' },
          { id: 'chrome', label: 'Chrome API' },
          { id: 'ai', label: 'AI assistant (mock)' },
        ].map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as ImportTab)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent-weak)' : 'var(--bg)',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0, overflow: 'auto' }}>
        {tab === 'file' && renderFileTab()}
        {tab === 'chrome' && renderChromeTab()}
        {tab === 'ai' && renderAiTab()}
      </div>
    </div>
  );
};
