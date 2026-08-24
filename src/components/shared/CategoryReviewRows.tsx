import { useState } from 'react';
import {
  acceptAiCategoryLinkByIds,
  rejectAiCategoryLinkByIds,
  CategoryReviewError,
} from '../../lib/categorization/categoryReview';
import {
  isLinkQualityAttentionLeafId,
  isLinkQualityRemovalLeafId,
} from '../../lib/categorization/linkQuality';
import { useToast } from '../ToastContainer';

export type CategoryReviewFeedback = (message: string, type: 'success' | 'error') => void;

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
    gap: 1,
    padding: '2px 8px',
    borderRadius: 999,
    border: `1px solid ${
      danger ? 'var(--error)' : warning ? 'var(--warning-border)' : 'var(--border)'
    }`,
    background: danger
      ? 'var(--error-weak)'
      : warning
        ? 'var(--warning-weak)'
        : muted
          ? 'transparent'
          : 'var(--accent-weak)',
    color: danger
      ? 'var(--error)'
      : warning
        ? 'var(--warning)'
        : muted
          ? 'var(--text-faint)'
          : 'var(--accent)',
    fontSize: 'var(--text-xs)',
    fontWeight: danger || warning ? 650 : undefined,
  } as const;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title ?? `View all bookmarks in ${label}`}
        style={{
          ...style,
          font: 'inherit',
          lineHeight: 1.35,
          cursor: 'pointer',
        }}
      >
        <span>{label}</span>
        {visibleParent ? (
          <small style={{ color: 'var(--text-faint)', fontSize: '10px', fontWeight: 500, lineHeight: 1.2 }}>
            {visibleParent}
          </small>
        ) : null}
      </button>
    );
  }

  return (
    <span style={style}>
      <span>{label}</span>
      {visibleParent ? (
        <small style={{ color: 'var(--text-faint)', fontSize: '10px', fontWeight: 500, lineHeight: 1.2 }}>
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
        padding: '2px 8px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${isAccept ? 'var(--accent)' : 'var(--border)'}`,
        background: isAccept ? 'var(--accent-weak)' : 'transparent',
        color: isAccept ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: 'var(--text-xs)',
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
  feedback,
}: {
  itemId: string;
  link: { categoryId: string; name: string; parentName?: string; score: number };
  onDone: () => void;
  onEdit?: () => void;
  feedback?: CategoryReviewFeedback;
}) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);

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
        flexDirection: 'column',
        gap: 6,
        padding: '6px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <CategoryChip
          label={`${link.name} (suggested)`}
          parentLabel={link.parentName}
          categoryId={link.categoryId}
          muted
        />
        {link.score > 0 && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
            {Math.round(link.score * 100)}%
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
            label="Manage categories"
            variant="edit"
            disabled={busy !== null}
            onClick={onEdit}
          />
        ) : null}
      </div>
    </div>
  );
}
