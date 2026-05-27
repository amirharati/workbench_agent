import React from 'react';
import { Clock } from 'lucide-react';
import type { Item } from '../../lib/db';

interface InspectorTabProps {
  activeItem: Item | null;
  isSearchSurface?: boolean;
  currentQuery?: string;
  recentQueries?: string[];
  onRerunSearch?: (query: string) => void;
}

function SearchHistorySection({
  recentQueries,
  currentQuery,
  onRerunSearch,
  compact,
}: {
  recentQueries: string[];
  currentQuery?: string;
  onRerunSearch?: (query: string) => void;
  compact?: boolean;
}) {
  const normalizedCurrent = currentQuery?.trim().toLowerCase() ?? '';

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        <Clock size={12} />
        Recent searches
      </div>

      {recentQueries.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5 }}>
          Past queries will appear here after you search.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {recentQueries.map((q) => {
            const isCurrent = normalizedCurrent.length > 0 && q.toLowerCase() === normalizedCurrent;
            return (
              <button
                key={q}
                type="button"
                onClick={() => onRerunSearch?.(q)}
                title={q}
                style={{
                  all: 'unset',
                  cursor: onRerunSearch ? 'pointer' : 'default',
                  padding: compact ? '4px 6px' : '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: isCurrent ? 'var(--accent-weak)' : 'transparent',
                  border: isCurrent ? '1px solid var(--accent)' : '1px solid transparent',
                  fontSize: 'var(--text-xs)',
                  color: isCurrent ? 'var(--text)' : 'var(--text-muted)',
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  if (!onRerunSearch || isCurrent) return;
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.color = 'var(--text)';
                }}
                onMouseLeave={(e) => {
                  if (isCurrent) return;
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-muted)';
                }}
              >
                {q.length > 56 ? `${q.slice(0, 56)}…` : q}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export const InspectorTab: React.FC<InspectorTabProps> = ({
  activeItem,
  isSearchSurface = false,
  currentQuery,
  recentQueries = [],
  onRerunSearch,
}) => {
  if (!activeItem && !isSearchSurface) {
    return (
      <div
        style={{
          padding: '24px 12px',
          textAlign: 'center',
          color: 'var(--text-faint)',
          fontSize: 'var(--text-xs)',
          lineHeight: 1.6,
        }}
      >
        Select an item or search result to see details.
      </div>
    );
  }

  if (!activeItem && isSearchSurface) {
    return (
      <div
        className="scrollbar"
        style={{
          padding: '10px 12px',
          overflowY: 'auto',
          height: '100%',
        }}
      >
        <SearchHistorySection
          recentQueries={recentQueries}
          currentQuery={currentQuery}
          onRerunSearch={onRerunSearch}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        overflowY: 'auto',
        height: '100%',
      }}
      className="scrollbar"
    >
      {/* Item title */}
      <div>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--text)',
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}
        >
          {activeItem!.title || 'Untitled'}
        </div>
        {activeItem!.url && (
          <a
            href={activeItem!.url}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-faint)',
              textDecoration: 'none',
              display: 'block',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {activeItem!.url}
          </a>
        )}
      </div>

      {/* Placeholder for enrichment status — wired in 05.3 */}
      <div
        style={{
          padding: '8px 10px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-faint)',
          lineHeight: 1.5,
        }}
      >
        AI summary, categories, and similar items will appear here after enrichment.
        <br />
        <span style={{ color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
          Full Inspector coming in 05.3.
        </span>
      </div>

      {/* Metadata */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
        }}
      >
        <span>Added: {new Date(activeItem!.created_at).toLocaleDateString()}</span>
        <span>Updated: {new Date(activeItem!.updated_at).toLocaleDateString()}</span>
        {activeItem!.url && (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Domain: {(() => { try { return new URL(activeItem!.url).hostname; } catch { return activeItem!.url; } })()}
          </span>
        )}
      </div>

      {isSearchSurface && (
        <>
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }} />
          <SearchHistorySection
            recentQueries={recentQueries}
            currentQuery={currentQuery}
            onRerunSearch={onRerunSearch}
            compact
          />
        </>
      )}
    </div>
  );
};
