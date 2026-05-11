import React from 'react';
import { bulkImportBookmarks, ensureProjectUnsortedCollection, type Collection, type Project } from '../../lib/db';

type ImportTab = 'file' | 'chrome' | 'ai';

interface ImportStudioViewProps {
  projects: Project[];
  collections: Collection[];
  onBack: () => void;
  onImported?: () => Promise<void> | void;
}

interface ImportCandidate {
  source: 'file-html' | 'file-csv' | 'file-json' | 'chrome-api';
  title: string;
  url: string;
  description?: string;
  notes?: string;
  tags?: string[];
  folderPath?: string;
  imageUrl?: string;
  importSource?: string;
}

type AutoDetectedFormat = 'json' | 'csv' | 'html' | 'unknown';

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
  onImported,
}) => {
  const [tab, setTab] = React.useState<ImportTab>('file');
  const [rows, setRows] = React.useState<ImportCandidate[]>([]);
  const [sourceLabel, setSourceLabel] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [commitMessage, setCommitMessage] = React.useState('');
  const [commitError, setCommitError] = React.useState('');
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
      const description = pickField(row, keyMap, ['description', 'summary', 'excerpt', 'text']);
      const notes = pickField(row, keyMap, ['notes', 'comment']);
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
        description: description || undefined,
        notes: notes || description || undefined,
        tags: tags.length ? tags : undefined,
        folderPath: folderPath || undefined,
        imageUrl: imageUrl || undefined,
        importSource: importSource || undefined,
      });
    }
    return out;
  };

  const parseJson = (text: string): ImportCandidate[] => {
    const parseLooseJson = (raw: string): unknown => {
      const trimmed = raw.trim();
      if (!trimmed) return [];

      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        // Support JS assignment wrappers like: window.foo = [...];
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex >= 0) {
          try {
            const rhs = trimmed.slice(eqIndex + 1).trim().replace(/;+\s*$/, '');
            return JSON.parse(rhs) as unknown;
          } catch {
            // continue to block extraction below
          }
        }

        // Support pasted/saved blobs with extra wrappers/noise around JSON.
        const firstArrayStart = trimmed.indexOf('[');
        const firstObjectStart = trimmed.indexOf('{');
        const starts = [firstArrayStart, firstObjectStart].filter((n) => n >= 0);
        if (starts.length > 0) {
          const start = Math.min(...starts);
          for (let end = trimmed.length; end > start + 1; end -= 1) {
            const chunk = trimmed.slice(start, end).trim().replace(/;+\s*$/, '');
            if (!(chunk.startsWith('[') || chunk.startsWith('{'))) continue;
            try {
              return JSON.parse(chunk) as unknown;
            } catch {
              // keep shrinking until parse succeeds or exhausted
            }
          }
        }

        throw new Error('Could not parse JSON data.');
      }
    };

    const parsed = parseLooseJson(text);

    const toRecord = (value: unknown): Record<string, unknown> | null => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      return value as Record<string, unknown>;
    };

    const firstString = (row: Record<string, unknown>, keys: string[]): string => {
      for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
      return '';
    };

    const truncate = (value: string, maxLength = 120): string => {
      if (value.length <= maxLength) return value;
      return `${value.slice(0, maxLength - 1).trimEnd()}…`;
    };

    const firstUrlInText = (value: string): string => {
      const match = value.match(/https?:\/\/\S+/i);
      return match ? match[0].trim() : '';
    };

    const inferXBookmarkImage = (row: Record<string, unknown>): string => {
      const extendedMedia = row.extended_media;
      if (!Array.isArray(extendedMedia)) return '';
      for (const mediaEntry of extendedMedia) {
        const media = toRecord(mediaEntry);
        if (!media) continue;
        const imageUrl = firstString(media, ['media_url_https', 'media_url', 'url', 'expanded_url']);
        if (imageUrl) return imageUrl;
      }
      return '';
    };

    const isXBookmarkRow = (row: Record<string, unknown>): boolean => {
      const hasTweetUrl = !!firstString(row, ['tweet_url']);
      const hasTweetText = !!firstString(row, ['full_text', 'note_tweet_text']);
      const hasAuthor = !!firstString(row, ['screen_name', 'name']);
      return hasTweetUrl && (hasTweetText || hasAuthor);
    };

    const firstWords = (value: string, maxWords = 10): string => {
      const words = value
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean);
      if (words.length <= maxWords) return words.join(' ');
      return `${words.slice(0, maxWords).join(' ')}…`;
    };

    const inferXBookmarkDescription = (row: Record<string, unknown>): string => {
      return firstString(row, ['note_tweet_text', 'full_text', 'description', 'text']);
    };

    const inferXBookmarkTitle = (row: Record<string, unknown>, fallbackUrl: string): string => {
      const description = inferXBookmarkDescription(row).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join(' ');
      const author = firstString(row, ['screen_name', 'name']);
      if (description) {
        const preview = firstWords(description, 10);
        return author ? `${author}: ${preview}` : preview;
      }
      if (author) return `${author}: ${truncate(fallbackUrl, 80)}`;
      return fallbackUrl;
    };

    const collectObjectCandidates = (root: unknown): Record<string, unknown>[] => {
      const out: Record<string, unknown>[] = [];
      const queue: unknown[] = [root];
      let inspected = 0;
      const MAX_NODES = 20000;

      while (queue.length > 0 && inspected < MAX_NODES) {
        const current = queue.shift();
        inspected += 1;
        if (!current) continue;

        if (Array.isArray(current)) {
          current.forEach((entry) => queue.push(entry));
          continue;
        }

        if (typeof current !== 'object') continue;
        const row = current as Record<string, unknown>;
        const hasLinkLikeField = !!firstString(row, ['url', 'href', 'link', 'tweet_url', 'expanded_url', 'permalink']);
        const hasTextLinkHint = !!firstUrlInText(firstString(row, ['full_text', 'note_tweet_text', 'text']));
        if (hasLinkLikeField || hasTextLinkHint) out.push(row);

        Object.values(row).forEach((value) => {
          if (value && (Array.isArray(value) || typeof value === 'object')) {
            queue.push(value);
          }
        });
      }

      return out;
    };

    // Always scan the full parsed document because some exporters include decoy
    // wrapper arrays (`items`, etc.) while bookmark rows live elsewhere.
    const candidateEntries = collectObjectCandidates(parsed);
    if (candidateEntries.length === 0) return [];

    const out: ImportCandidate[] = [];
    for (const entry of candidateEntries) {
      const row = toRecord(entry);
      if (!row) continue;

      const baseUrl = firstString(row, ['url', 'href', 'link', 'tweet_url', 'expanded_url', 'permalink']);
      const textUrl = firstUrlInText(firstString(row, ['full_text', 'note_tweet_text', 'text']));
      const url = baseUrl || textUrl;
      if (!url) continue;

      const looksLikeXBookmark = isXBookmarkRow(row);
      const description = looksLikeXBookmark
        ? inferXBookmarkDescription(row)
        : firstString(row, ['description', 'summary', 'excerpt', 'full_text', 'note_tweet_text', 'text']);
      const title =
        firstString(row, ['title']) ||
        (looksLikeXBookmark ? inferXBookmarkTitle(row, url) : firstString(row, ['name']) || url);
      const notes = firstString(row, ['notes', 'comment']) || description;
      const rawTags = row.tags;
      const tags = Array.isArray(rawTags)
        ? rawTags.map((t) => String(t).trim()).filter(Boolean)
        : typeof rawTags === 'string'
        ? rawTags.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
        : [];
      const imageUrl =
        firstString(row, ['imageUrl', 'image', 'cover', 'thumbnail']) ||
        firstString(row, ['profile_image_url_https']) ||
        inferXBookmarkImage(row);
      const importSource =
        firstString(row, ['importSource', 'source', 'provider']) ||
        (looksLikeXBookmark ? 'x-bookmarks-export-v1' : '');

      out.push({
        source: 'file-json',
        title: title || 'Untitled',
        url,
        description: description || undefined,
        notes: notes || undefined,
        tags: tags.length ? tags : undefined,
        folderPath: firstString(row, ['folderPath', 'folder', 'collection']) || (looksLikeXBookmark ? 'X / Bookmarks' : undefined),
        imageUrl: imageUrl || undefined,
        importSource: importSource || undefined,
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
        description: undefined,
        folderPath: getFolderPath(a as HTMLAnchorElement) || undefined,
      });
    });
    return out;
  };

  const setImportedRows = (nextRows: ImportCandidate[], label: string) => {
    setRows(nextRows);
    setSourceLabel(label);
    setError('');
    setCommitError('');
    setCommitMessage('');
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
      const trimmed = text.trim();
      const firstLine = trimmed.split(/\r?\n/, 1)[0]?.toLowerCase() || '';
      const isLikelyJsonContent =
        trimmed.startsWith('{') ||
        trimmed.startsWith('[') ||
        /(?:window|module\.exports|export\s+default)\b/i.test(trimmed) ||
        (trimmed.includes('=') && (trimmed.includes('[') || trimmed.includes('{')));
      const isLikelyHtmlContent =
        /<!doctype html/i.test(trimmed) ||
        /<a\s+[^>]*href=/i.test(trimmed) ||
        /<dl>|<dt>|<h3/i.test(trimmed);
      const isLikelyCsvContent =
        firstLine.includes(',') && /(url|href|link|title|name|description|notes|comment|folder|collection)/i.test(firstLine);

      const runJson = (): ImportCandidate[] => {
        try {
          return parseJson(text);
        } catch {
          return [];
        }
      };

      const runCsv = (): ImportCandidate[] => parseCsv(text);
      const runHtml = (): ImportCandidate[] => parseNetscapeHtml(text);

      const attempts: Array<{ format: AutoDetectedFormat; parse: () => ImportCandidate[] }> = [];

      if (isLikelyJsonContent || lowerName.endsWith('.json') || lowerName.endsWith('.js') || lowerName.endsWith('.txt')) {
        attempts.push({ format: 'json', parse: runJson });
      }
      if (isLikelyCsvContent || lowerName.endsWith('.csv')) {
        attempts.push({ format: 'csv', parse: runCsv });
      }
      if (isLikelyHtmlContent || lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
        attempts.push({ format: 'html', parse: runHtml });
      }

      // Always include all parsers as fallback to make detection extension-agnostic.
      ([
        { format: 'json' as const, parse: runJson },
        { format: 'csv' as const, parse: runCsv },
        { format: 'html' as const, parse: runHtml },
      ]).forEach((candidate) => {
        if (!attempts.some((a) => a.format === candidate.format)) attempts.push(candidate);
      });

      let parsedRows: ImportCandidate[] = [];
      let detectedFormat: AutoDetectedFormat = 'unknown';
      for (const attempt of attempts) {
        const rowsCandidate = attempt.parse();
        if (rowsCandidate.length > 0) {
          parsedRows = rowsCandidate;
          detectedFormat = attempt.format;
          break;
        }
      }

      const hasXAdapterRows = parsedRows.some((row) => row.importSource === 'x-bookmarks-export-v1');
      const adapterLabel = hasXAdapterRows ? 'X adapter' : 'generic adapter';
      const detectedLabel = detectedFormat === 'unknown' ? 'auto-detect: no match' : `auto-detect: ${detectedFormat} (${adapterLabel})`;

      setImportedRows(parsedRows, `File: ${file.name} • ${detectedLabel}`);
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
              description: undefined,
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

  const handleCommitToDb = async () => {
    if (rows.length === 0) {
      setCommitError('Nothing to import yet. Load a file or Chrome bookmarks first.');
      return;
    }

    try {
      setCommitting(true);
      setCommitError('');
      setCommitMessage('');

      const targetCollectionId =
        selectedCollectionId ||
        (selectedProjectId ? await ensureProjectUnsortedCollection(selectedProjectId) : '');

      const result = await bulkImportBookmarks(
        rows.map((row) => ({
          url: row.url,
          title: row.title || row.url,
          description: row.description,
          notes: row.notes || row.description,
          tags: row.tags,
          source: row.importSource || row.source || 'import',
          favicon: undefined,
        })),
        targetCollectionId
      );

      const targetLabel =
        selectedCollectionId
          ? filteredCollections.find((c) => c.id === selectedCollectionId)?.name || 'selected collection'
          : selectedProjectId
          ? `${projects.find((p) => p.id === selectedProjectId)?.name || 'selected project'} / Unsorted`
          : 'Default / Unsorted';

      setCommitMessage(
        `Imported to ${targetLabel}: created ${result.created}, merged ${result.merged}, skipped ${result.skipped}.`
      );

      if (onImported) {
        await onImported();
      }
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : 'Import commit failed.');
    } finally {
      setCommitting(false);
    }
  };

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
              {['Title', 'URL', 'Description', 'Folder', 'Image', 'Source'].map((h) => (
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
                <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{row.description || row.notes || '-'}</td>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Commit uses URL dedupe/merge and writes to selected collection (or project Unsorted/default Unsorted).
        </div>
        <button
          type="button"
          onClick={handleCommitToDb}
          disabled={committing || rows.length === 0}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: 'var(--accent-text, #fff)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: committing || rows.length === 0 ? 'not-allowed' : 'pointer',
            opacity: committing || rows.length === 0 ? 0.6 : 1,
          }}
        >
          {committing ? 'Committing…' : 'Commit to DB'}
        </button>
      </div>
      {commitError ? <div style={{ fontSize: 'var(--text-xs)', color: '#dc2626' }}>{commitError}</div> : null}
      {commitMessage ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{commitMessage}</div> : null}
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
          {['Netscape HTML', 'CSV (url/title/notes)', 'JSON array', 'X bookmarks JSON (tweet export shape)'].map((format) => (
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
          accept=".html,.htm,.csv,.json,.js,.txt,text/html,text/csv,application/json,text/plain,application/javascript"
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
            Auto-detects JSON/CSV/HTML by content (not just extension), including X bookmarks exports.
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
