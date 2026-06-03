import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Search, Sparkles } from 'lucide-react';
import { EmbedBackfillBlock } from './EmbedBackfillBlock';
import {
  InlineSimilarPanel,
  SearchRelatedPanel,
} from './SearchDiscoveryBlocks';
import {
  runAppHybridSearchWithRelated,
  runAppFindSimilar,
  loadSearchIndexFromDb,
  searchIndexStats,
  type HybridSearchResultWithRelated,
  type SearchFilters,
} from '../../lib/search';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';

function ScoreBar({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--dev-fs-caption)' }}>
      <span style={{ width: 72, color: 'var(--text-muted)' }}>{label}</span>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: 'var(--border)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--accent)',
          }}
        />
      </div>
      <span style={{ width: 36, textAlign: 'right', color: 'var(--text-faint)' }}>{value.toFixed(2)}</span>
    </div>
  );
}

export function SearchDevPanel() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'hybrid' | 'lexical-only'>('hybrid');
  const [domainFilter, setDomainFilter] = useState('');
  const [resultLimit, setResultLimit] = useState(30);
  const [loading, setLoading] = useState(false);
  const [indexLine, setIndexLine] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HybridSearchResultWithRelated | null>(null);
  const [similarForId, setSimilarForId] = useState<string | null>(null);
  const [similarTitle, setSimilarTitle] = useState('');
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarResults, setSimilarResults] = useState<
    import('../../lib/search').SimilarItemResult[]
  >([]);

  const refreshIndexLine = useCallback(async () => {
    const index = await loadSearchIndexFromDb();
    const s = searchIndexStats(index);
    setIndexLine(
      `${s.documents.toLocaleString()} bookmarks · ${s.withEmbeddings} with vectors · ${s.withEnrichmentSummary} AI summaries · ${s.withCategoryLinks} categorized · ${s.leavesWithCentroid} category centroids (lexical searches all bookmarks)`
    );
  }, []);

  useEffect(() => {
    void refreshIndexLine();
  }, [refreshIndexLine]);

  const runSearchWithQuery = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setQuery(trimmed);
      setLoading(true);
      setError(null);
      setSimilarForId(null);
      try {
        const filters: SearchFilters | undefined = domainFilter.trim()
          ? { domain: domainFilter.trim() }
          : undefined;
        const res = await runAppHybridSearchWithRelated({
          query: trimmed,
          mode,
          limit: resultLimit,
          filters,
        });
        setResult(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [mode, domainFilter, resultLimit]
  );

  const runSearch = useCallback(async () => {
    await runSearchWithQuery(query);
  }, [query, runSearchWithQuery]);

  const loadSimilar = useCallback(
    async (itemId: string, title: string) => {
      setSimilarForId(itemId);
      setSimilarTitle(title);
      setSimilarLoading(true);
      setSimilarResults([]);
      try {
        const filters: SearchFilters | undefined = domainFilter.trim()
          ? { domain: domainFilter.trim() }
          : undefined;
        const res = await runAppFindSimilar({ itemId, limit: 15, filters });
        setSimilarResults(res.results);
      } catch {
        setSimilarResults([]);
      } finally {
        setSimilarLoading(false);
      }
    },
    [domainFilter]
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <EmbedBackfillBlock onComplete={() => void refreshIndexLine()} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="search"
              placeholder="Hybrid search query…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runSearch();
              }}
              style={{
                width: '100%',
                padding: '8px 10px 8px 32px',
                fontSize: 'var(--dev-fs-base)',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-input)',
                color: 'var(--text)',
              }}
            />
          </div>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'hybrid' | 'lexical-only')}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
              fontSize: 'var(--dev-fs-sm)',
            }}
          >
            <option value="hybrid">Hybrid</option>
            <option value="lexical-only">Lexical only</option>
          </select>
          <input
            type="text"
            placeholder="Domain filter (overlay)"
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            style={{
              width: 160,
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
              fontSize: 'var(--dev-fs-sm)',
            }}
          />
          <select
            value={resultLimit}
            onChange={(e) => setResultLimit(Number(e.target.value))}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
              fontSize: 'var(--dev-fs-sm)',
            }}
          >
            <option value={15}>Top 15</option>
            <option value={30}>Top 30</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
          </select>
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={loading || !query.trim()}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 'var(--dev-fs-sm)',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading || !query.trim() ? 0.6 : 1,
            }}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {indexLine ? (
          <p style={{ margin: '8px 0 0', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)' }}>
            Index: {indexLine}
          </p>
        ) : null}

        {error ? (
          <p style={{ margin: '8px 0 0', fontSize: 'var(--dev-fs-caption)', color: 'var(--error, #f85149)' }}>
            {error}
          </p>
        ) : null}
        {result ? (
          <p style={{ margin: '8px 0 0', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)' }}>
            Mode: <strong>{result.mode}</strong>
            {result.embeddingPathUsed ? ' · query + doc embedding' : ' · lexical + category (embed query or backfill docs)'}
            {result.matchedCategoryIds.length
              ? ` · ${result.matchedCategoryIds.length} matched categories`
              : ''}
            {' · '}
            showing top <strong>{result.results.length}</strong>
            {result.totalCandidates > result.results.length
              ? ` of ${result.totalCandidates} scored candidates`
              : ` of ${result.totalCandidates} candidates`}
          </p>
        ) : null}
      </div>

      <div className="scrollbar" style={{ flex: 1, overflow: 'auto', padding: '8px 16px 16px' }}>
        {!result?.results.length ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
            {result ? 'No matches.' : 'Backfill embeddings if needed, then search.'}
          </div>
        ) : (
          <>
            {result.results.map((row, i) => (
              <div
                key={row.itemId}
                style={{
                  padding: '10px 12px',
                  marginBottom: 8,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: i === 0 ? 'var(--accent-weak)' : 'var(--bg)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 'var(--dev-fs-caption)',
                      color: 'var(--text-faint)',
                      minWidth: 20,
                    }}
                  >
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--dev-fs-sm)', marginBottom: 2 }}>
                      {row.title || row.itemId}
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--dev-fs-caption)',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.domain}
                      {row.primaryCategoryName ? ` · ${row.primaryCategoryName}` : ''}
                    </div>
                    {row.breakdown.matchedCategories.length ? (
                      <div style={{ fontSize: 'var(--dev-fs-caption)', color: 'var(--text-faint)', marginTop: 2 }}>
                        categories: {row.breakdown.matchedCategories.slice(0, 3).join(', ')}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <ScoreBar label="final" value={row.breakdown.finalScore} />
                      <ScoreBar label="lexical" value={row.breakdown.lexical} />
                      <ScoreBar label="embed" value={row.breakdown.embedding} />
                      <ScoreBar label="category" value={row.breakdown.category} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 'var(--dev-fs-caption)', color: 'var(--text-faint)' }}>
                      sources: {row.breakdown.candidateSources.join(', ') || '—'}
                      {row.breakdown.matchedTerms.length
                        ? ` · terms: ${row.breakdown.matchedTerms.slice(0, 6).join(', ')}`
                        : ''}
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadSimilar(row.itemId, row.title || row.itemId)}
                      style={{
                        marginTop: 8,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 8px',
                        borderRadius: 4,
                        border: '1px solid var(--border)',
                        background: similarForId === row.itemId ? 'var(--accent-weak)' : 'transparent',
                        color: 'var(--text-muted)',
                        fontSize: 'var(--dev-fs-caption)',
                        cursor: 'pointer',
                      }}
                    >
                      <Sparkles size={12} />
                      Similar
                    </button>
                    {similarForId === row.itemId ? (
                      <InlineSimilarPanel
                        anchorTitle={similarTitle}
                        results={similarResults}
                        loading={similarLoading}
                        onClose={() => setSimilarForId(null)}
                        onItemClick={(id, title) => void loadSimilar(id, title)}
                      />
                    ) : null}
                  </div>
                  {row.url ? (
                    <ExtensionPageUrlLink
                      url={row.url}
                      style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'inline-flex' }}
                      title="Open URL"
                    >
                      <ExternalLink size={14} />
                    </ExtensionPageUrlLink>
                  ) : null}
                </div>
              </div>
            ))}

            <SearchRelatedPanel
              related={result.related}
              onTopicClick={(name) => void runSearchWithQuery(name)}
              onTagClick={(tag) => void runSearchWithQuery(tag)}
              onRelatedClick={(id, title) => void loadSimilar(id, title)}
            />
          </>
        )}
      </div>
    </div>
  );
}
