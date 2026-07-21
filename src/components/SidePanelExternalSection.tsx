import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Link2, X } from 'lucide-react';
import { ButtonPrimary, Input, Panel } from '../styles/primitives';
import { isValidBookmarkUrl } from '../lib/utils';

export type SessionExternalLink = {
  itemId: string;
  url: string;
  digestStatus?: string;
};

interface SidePanelExternalSectionProps {
  open: boolean;
  onToggleOpen: () => void;
  links: SessionExternalLink[];
  onSave: (url: string) => Promise<void>;
  canSave: boolean;
  saveHint?: string;
  destinationLabel?: string;
  destinationControls?: React.ReactNode;
  showTrigger?: boolean;
}

export const SidePanelExternalSection: React.FC<SidePanelExternalSectionProps> = ({
  open,
  onToggleOpen,
  links,
  onSave,
  canSave,
  saveHint,
  destinationLabel,
  destinationControls,
  showTrigger = true,
}) => {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Paste a URL');
      return;
    }
    if (!isValidBookmarkUrl(trimmed)) {
      setError('URL must be http(s) or file://');
      return;
    }
    if (!canSave) {
      setError(saveHint || 'Choose a destination first');
      return;
    }
    setSubmitting(true);
    try {
      await onSave(trimmed);
      setUrl('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save link');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {showTrigger ? (
        <button
          type="button"
          onClick={onToggleOpen}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.5rem 0.6rem',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: open ? 'var(--accent-weak)' : 'var(--bg-glass)',
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
            fontWeight: 650,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Link2 size={14} /> Add link
          </span>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
      ) : null}

      {open ? (
        <Panel style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 700 }}>
              Capture a link from this page
            </div>
            {!showTrigger ? (
              <button
                type="button"
                className="ui-button ui-button--icon"
                aria-label="Close add link"
                onClick={onToggleOpen}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 2,
                }}
              >
                <X size={15} />
              </button>
            ) : null}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Paste a link mentioned in the current page without navigating away.
          </div>
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            style={{ height: 32 }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
          />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
            Destination: {destinationLabel ?? 'current selection'}
          </div>
          {destinationControls}
          {!canSave && saveHint ? (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{saveHint}</div>
          ) : null}
          {error ? (
            <div
              role="alert"
              style={{
                padding: '0.35rem 0.45rem',
                borderRadius: 6,
                background: 'var(--error-weak)',
                color: 'var(--error)',
                fontSize: 'var(--text-xs)',
              }}
            >
              {error}
            </div>
          ) : null}
          <ButtonPrimary
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !url.trim() || !canSave}
            style={{ width: '100%', padding: '0.5rem', fontWeight: 650 }}
          >
            {submitting ? 'Saving…' : 'Save link'}
          </ButtonPrimary>

          {links.length > 0 ? (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 5 }}>
                Captured this visit
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {links.map((link) => (
                  <div
                    key={link.itemId}
                    title={link.url}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      minWidth: 0,
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <CheckCircle2 size={12} color="var(--status-success)" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {link.url}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
};
