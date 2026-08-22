import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { useItemPipelineContext } from '../hooks/useItemPipelineContext';
import { resolvePipelineBadge } from '../lib/pipeline';
import {
  formatPipelineStageHint,
  hasPartialPipelineData,
} from '../lib/pipeline/itemPipelineContext';
import { ButtonGhost, Panel } from '../styles/primitives';
import { ItemDigestQuickActions } from './dashboard/ItemDigestQuickActions';
import { EnrichmentContent, ItemPipelineBadge } from './dashboard/PipelineDisplayBlocks';
import {
  CategoryChip,
  SuggestedCategoryRow,
  type CategoryReviewFeedback,
} from './shared/CategoryReviewRows';

interface SidePanelDigestPanelProps {
  itemId: string;
  statusLabel?: string;
  onOpenInApp?: () => void;
}

function truncate(value: string, limit: number): string {
  const clean = value.trim();
  return clean.length > limit ? `${clean.slice(0, limit).trimEnd()}…` : clean;
}

export const SidePanelDigestPanel: React.FC<SidePanelDigestPanelProps> = ({
  itemId,
  statusLabel,
  onOpenInApp,
}) => {
  const { context, loading, reload } = useItemPipelineContext(itemId);
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  );

  const onFeedback: CategoryReviewFeedback = (message, type) => {
    setFeedback({ message, type });
  };

  const badge = context ? resolvePipelineBadge(context) : null;
  const hasData = hasPartialPipelineData(context);
  const stageHint = context ? formatPipelineStageHint(context) : undefined;
  const fetchedSnippet = context?.enrichment?.snippet?.trim() || '';
  const preview = useMemo(() => {
    if (!context) return '';
    return truncate(context.summary || fetchedSnippet, 420);
  }, [context, fetchedSnippet]);

  return (
    <Panel
      className="side-panel-digest-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.55rem',
        padding: '0.75rem 0.75rem 0.75rem 0.85rem',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div
            className="side-panel-section-kicker"
            style={{
              color: 'var(--text-muted)',
            }}
          >
            AI digest
          </div>
          <div className="side-panel-supporting-copy" style={{ marginTop: 2 }}>
            Optional · runs only when requested
          </div>
        </div>
        {badge ? <ItemPipelineBadge badge={badge} /> : null}
      </div>

      <ItemDigestQuickActions
        itemId={itemId}
        itemUrl={context?.item.url}
        context={context}
        badge={badge}
        enrichment={context?.enrichment}
        onDone={reload}
      />

      {statusLabel ? (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text)', lineHeight: 1.45 }}>
          {statusLabel}
        </div>
      ) : null}
      {feedback ? (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          style={{
            fontSize: 'var(--text-xs)',
            color: feedback.type === 'error' ? 'var(--error)' : 'var(--status-success)',
          }}
        >
          {feedback.message}
        </div>
      ) : null}
      {stageHint && !statusLabel?.includes(stageHint) ? (
        <div className="side-panel-supporting-copy">{stageHint}</div>
      ) : null}

      {loading ? (
        <div className="side-panel-supporting-copy">Loading digest…</div>
      ) : !context ? (
        <p className="side-panel-supporting-copy" style={{ margin: 0 }}>
          Could not load bookmark data.
        </p>
      ) : !hasData ? (
        <p className="side-panel-supporting-copy" style={{ margin: 0 }}>
          No AI data yet. Run a digest when you want to fetch and summarize this page.
        </p>
      ) : (
        <>
          <div
            className="side-panel-section-title"
            style={{
              paddingTop: '0.1rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={context.item.title || 'Untitled'}
          >
            {context.item.title || 'Untitled'}
          </div>

          {!expanded ? (
            <>
              {preview ? (
                <p
                  className="side-panel-digest-copy"
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {preview}
                </p>
              ) : null}
              {context.keyPoints.length > 0 ? (
                <ul
                  className="side-panel-digest-copy"
                  style={{
                    margin: 0,
                    paddingLeft: '1.1rem',
                  }}
                >
                  {context.keyPoints.slice(0, 3).map((point, index) => (
                    <li key={`${index}-${point.slice(0, 24)}`}>{truncate(point, 180)}</li>
                  ))}
                </ul>
              ) : null}
              {context.acceptedLinks.length > 0 || context.primaryCategoryName ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {context.acceptedLinks.length > 0
                    ? context.acceptedLinks.slice(0, 3).map((link) => (
                        <CategoryChip key={link.categoryId} label={link.name} />
                      ))
                    : context.primaryCategoryName
                      ? <CategoryChip label={context.primaryCategoryName} />
                      : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <EnrichmentContent
                summary={context.summary}
                keyPoints={context.keyPoints}
                references={context.references}
                emptyMessage={fetchedSnippet ? undefined : 'No summary is available yet.'}
              />
              {!context.summary && context.keyPoints.length === 0 && fetchedSnippet ? (
                <section>
                  <div
                    style={{
                      marginBottom: 4,
                      fontSize: 'var(--text-xs)',
                      fontWeight: 650,
                      color: 'var(--text-muted)',
                    }}
                  >
                    Fetched excerpt
                  </div>
                  <p
                    className="side-panel-digest-copy"
                    style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {fetchedSnippet}
                  </p>
                </section>
              ) : null}

              <section>
                <div
                  style={{
                    marginBottom: 4,
                    fontSize: 'var(--text-xs)',
                    fontWeight: 650,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Categories
                </div>
                <p className="side-panel-supporting-copy" style={{ margin: '0 0 6px' }}>
                  AI categories are separate from project collections.
                </p>
                {context.primaryCategoryName &&
                context.acceptedLinks.length === 0 &&
                context.suggestedLinks.length === 0 ? (
                  <CategoryChip label={context.primaryCategoryName} />
                ) : null}
                {context.acceptedLinks.length === 0 && context.suggestedLinks.length === 0 ? (
                  <p className="side-panel-supporting-copy" style={{ margin: 0 }}>
                    {statusLabel?.toLowerCase().includes('classif')
                      ? 'Classifying…'
                      : context.classifyState === 'manual_review'
                        ? 'In manual review — open the dashboard or run Classify now.'
                        : 'Not yet classified.'}
                  </p>
                ) : (
                  <>
                    {context.acceptedLinks.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        {context.acceptedLinks.map((link) => (
                          <CategoryChip key={`accepted-${link.categoryId}`} label={link.name} />
                        ))}
                      </div>
                    ) : null}
                    {context.suggestedLinks.map((link) => (
                      <SuggestedCategoryRow
                        key={`suggested-${link.categoryId}`}
                        itemId={context.item.id}
                        link={link}
                        onDone={reload}
                        onEdit={onOpenInApp}
                        feedback={onFeedback}
                      />
                    ))}
                  </>
                )}
              </section>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <ButtonGhost
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 8px' }}
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {expanded ? 'Show less' : 'Show full digest'}
            </ButtonGhost>
            {onOpenInApp ? (
              <ButtonGhost
                type="button"
                onClick={onOpenInApp}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 8px' }}
              >
                Dashboard <ExternalLink size={12} />
              </ButtonGhost>
            ) : null}
          </div>
        </>
      )}
    </Panel>
  );
};
