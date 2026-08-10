import React, { useState } from 'react';
import { runPipelineActionOnOffscreen } from '../../lib/pipeline/offscreenPipelineClient';
import {
  describeClassifyQueueStatus,
  type ClassifyQueueActionId,
  type ClassifyQueueReasonInput,
} from '../../lib/categorization/classifyQueueReason';

type Props = ClassifyQueueReasonInput & {
  compact?: boolean;
  style?: React.CSSProperties;
  /** When set, suggested actions become clickable for this bookmark. */
  itemId?: string;
  onActionComplete?: () => void;
};

async function runQueueAction(actionId: ClassifyQueueActionId, itemId: string): Promise<void> {
  await runPipelineActionOnOffscreen('classify', [itemId], {
    classify: true,
    forceReclassify: actionId === 'force_reclassify' || actionId === 'retry_manual',
    retryManualReview: actionId === 'retry_manual',
  });
}

export function ClassifyQueueReasonBlock({
  compact = false,
  style,
  itemId,
  onActionComplete,
  ...input
}: Props) {
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const info = describeClassifyQueueStatus(input);

  const canAct = !!itemId && !!info.actionId && !loading;
  const isForceReclassify = info.actionId === 'force_reclassify';
  const actionAccent = isForceReclassify ? '#a371f7' : 'var(--accent)';
  const actionBg = isForceReclassify ? '#a371f7' : 'var(--accent-weak)';
  const actionColor = isForceReclassify ? '#fff' : 'var(--text)';

  const handleAction = () => {
    if (!itemId || !info.actionId || loading) return;
    setLoading(true);
    setActionError(null);
    void (async () => {
      try {
        await runQueueAction(info.actionId!, itemId);
        onActionComplete?.();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Classify failed');
      } finally {
        setLoading(false);
      }
    })();
  };

  if (compact) {
    return (
      <span
        title={[info.primaryReason, info.detail, info.suggestedAction].filter(Boolean).join('\n')}
        style={{
          fontSize: 'var(--dev-fs-caption)',
          color: 'var(--text-faint)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 200,
          display: 'inline-block',
          verticalAlign: 'bottom',
          ...style,
        }}
      >
        {info.primaryReason}
      </span>
    );
  }

  return (
    <div
      style={{
        marginBottom: 12,
        padding: '10px 12px',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--bg)',
        fontSize: 'var(--dev-fs-sm)',
        lineHeight: 1.45,
        ...style,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>
        Classify queue · {info.stateLabel}
      </div>
      <div style={{ color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text)' }}>Why:</strong> {info.primaryReason}
      </div>
      {info.detail && info.detail !== info.primaryReason ? (
        <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{info.detail}</div>
      ) : null}
      {info.suggestedAction && info.actionId && itemId ? (
        <button
          type="button"
          onClick={handleAction}
          disabled={!canAct}
          style={{
            marginTop: 8,
            padding: '6px 12px',
            fontSize: 'var(--dev-fs-sm)',
            fontWeight: 600,
            border: `1px solid ${actionAccent}`,
            borderRadius: 6,
            background: actionBg,
            color: actionColor,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Running classify…' : info.suggestedAction}
        </button>
      ) : info.suggestedAction ? (
        <div style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 'var(--dev-fs-caption)' }}>
          {info.suggestedAction}
        </div>
      ) : null}
      {actionError ? (
        <div style={{ color: 'var(--error)', marginTop: 6, fontSize: 'var(--dev-fs-caption)' }}>
          {actionError}
        </div>
      ) : null}
    </div>
  );
}
