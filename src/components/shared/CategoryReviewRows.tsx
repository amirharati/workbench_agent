import { useState } from 'react';
import {
  acceptAiCategoryLinkByIds,
  rejectAiCategoryLinkByIds,
  CategoryReviewError,
} from '../../lib/categorization/categoryReview';
import {
  isLinkQualityAttentionLeafId,
  isLinkQualityRemovalLeafId,
  isLinkQualityRedirectMismatchLeafId,
} from '../../lib/categorization/linkQuality';
import { useToast } from '../ToastContainer';
import { categoryColorStyle } from './categoryColor';

export type CategoryReviewFeedback = (message: string, type: 'success' | 'error') => void;
export const COMPACT_CATEGORY_LIMIT = 3;

export function CategoryOverflowToggle({
  hiddenCount,
  expanded,
  onToggle,
}: {
  hiddenCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!expanded && hiddenCount <= 0) return null;
  return (
    <button
      className="ui-category-overflow-toggle"
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      {expanded ? 'Show less' : `More (${hiddenCount})`}
    </button>
  );
}

export function UnmatchedTopicSuggestion({
  name,
  description,
  onReview,
}: {
  name: string;
  description?: string;
  onReview: () => void;
}) {
  return (
    <div className="ui-unmatched-topic">
      <div className="ui-unmatched-topic__copy">
        <span>Suggested topic · no existing category matched</span>
        <strong>{name}</strong>
        {description ? <small>{description}</small> : null}
      </div>
      <button
        className="ui-button ui-button--compact ui-button--secondary"
        type="button"
        onClick={onReview}
      >
        Review categories
      </button>
    </div>
  );
}

export function CategoryChip({
  label,
  parentLabel,
  muted,
  onClick,
  title,
  categoryId,
}: {
  label: string;
  parentLabel?: string;
  muted?: boolean;
  onClick?: () => void;
  title?: string;
  categoryId?: string;
}) {
  const danger = isLinkQualityRemovalLeafId(categoryId);
  const warning = isLinkQualityAttentionLeafId(categoryId);
  const visibleParent = parentLabel?.trim() && parentLabel.trim() !== label.trim()
    ? parentLabel.trim()
    : undefined;
  const style = {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 0,
    padding: '1px 5px',
    borderRadius: 4,
    border: '1px solid var(--category-label-border)',
    background: 'var(--category-label-bg)',
    color: 'var(--category-label-text)',
    fontSize: '9px',
    fontWeight: danger || warning ? 650 : undefined,
    ...categoryColorStyle({ categoryId, label, parentLabel }),
  } as const;

  if (onClick) {
    return (
      <button
        type="button"
        className="ui-category-label"
        data-tone={danger ? 'danger' : warning ? 'warning' : 'topic'}
        data-muted={muted ? 'true' : 'false'}
        onClick={onClick}
        title={title ?? `View all bookmarks in ${label}`}
        style={{
          ...style,
          fontFamily: 'inherit',
          lineHeight: 1.2,
          cursor: 'pointer',
        }}
      >
        <span>{label}</span>
        {visibleParent ? (
          <small style={{ color: 'var(--text-faint)', fontSize: '8px', fontWeight: 500, lineHeight: 1.1 }}>
            {visibleParent}
          </small>
        ) : null}
      </button>
    );
  }

  return (
    <span
      className="ui-category-label"
      data-tone={danger ? 'danger' : warning ? 'warning' : 'topic'}
      data-muted={muted ? 'true' : 'false'}
      style={style}
    >
      <span>{label}</span>
      {visibleParent ? (
        <small style={{ color: 'var(--text-faint)', fontSize: '8px', fontWeight: 500, lineHeight: 1.1 }}>
          {visibleParent}
        </small>
      ) : null}
    </span>
  );
}

function ReviewActionButton({
  label,
  onClick,
  disabled,
  variant,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant: 'accept' | 'reject' | 'edit';
}) {
  const isAccept = variant === 'accept';
  const isEdit = variant === 'edit';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '1px 4px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${isAccept ? 'var(--accent)' : 'var(--border)'}`,
        background: isAccept ? 'var(--accent-weak)' : 'transparent',
        color: isAccept ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: '9px',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontStyle: isEdit ? 'normal' : undefined,
      }}
    >
      {label}
    </button>
  );
}

export function SuggestedCategoryRow({
  itemId,
  link,
  onDone,
  onEdit,
  onBrowse,
  feedback,
}: {
  itemId: string;
  link: {
    categoryId: string;
    name: string;
    parentName?: string;
    score: number;
    isPrimary?: boolean;
  };
  onDone: () => void;
  onEdit?: () => void;
  onBrowse?: (categoryId: string, name: string) => void;
  feedback?: CategoryReviewFeedback;
}) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const redirectWarning = isLinkQualityRedirectMismatchLeafId(link.categoryId);
  const reviewLabel = redirectWarning
    ? `${link.name} (warning)`
    : link.isPrimary
      ? `${link.name} (suggested · primary)`
      : `${link.name} (suggested)`;

  const notify = (message: string, type: 'success' | 'error') => {
    if (feedback) {
      feedback(message, type);
      return;
    }
    addToast({ type, message });
  };

  const run = async (action: 'accept' | 'reject') => {
    setBusy(action);
    try {
      if (action === 'accept') {
        await acceptAiCategoryLinkByIds(itemId, link.categoryId);
        notify('Category accepted', 'success');
      } else {
        await rejectAiCategoryLinkByIds(itemId, link.categoryId);
        notify('Category rejected', 'success');
      }
      onDone();
    } catch (e) {
      const reason =
        e instanceof CategoryReviewError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Unknown error';
      notify(`Could not update category${reason ? `: ${reason}` : ''}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 3,
        padding: '3px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3, minWidth: 0 }}>
        <CategoryChip
          label={reviewLabel}
          parentLabel={link.parentName}
          categoryId={link.categoryId}
          muted
          onClick={onBrowse ? () => onBrowse(link.categoryId, link.name) : undefined}
        />
        {link.score > 0 && (
          <span style={{ fontSize: '9px', color: 'var(--text-faint)' }}>
            {Math.round(link.score * 100)}%
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginLeft: 'auto' }}>
        <ReviewActionButton
          label="Accept"
          variant="accept"
          disabled={busy !== null}
          onClick={() => void run('accept')}
        />
        <ReviewActionButton
          label="Reject"
          variant="reject"
          disabled={busy !== null}
          onClick={() => void run('reject')}
        />
        {onEdit ? (
          <ReviewActionButton
            label="Manage"
            variant="edit"
            disabled={busy !== null}
            onClick={onEdit}
          />
        ) : null}
      </div>
    </div>
  );
}
