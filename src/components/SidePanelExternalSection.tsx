import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Link2 } from 'lucide-react';
import { Input, ButtonGhost, ButtonPrimary, Panel } from '../styles/primitives';
import { isValidBookmarkUrl } from '../lib/utils';
import { SidePanelDigestPanel } from './SidePanelDigestPanel';

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
  onOpenInApp?: () => void;
}

export const SidePanelExternalSection: React.FC<SidePanelExternalSectionProps> = ({
  open,
  onToggleOpen,
  links,
  onSave,
  canSave,
  saveHint,
  onOpenInApp,
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
      setError(saveHint || 'Pick a project and collection first');
      return;
    }

    setSubmitting(true);
    try {
      await onSave(trimmed);
      setUrl('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save link');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <button
        type="button"
        onClick={onToggleOpen}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '0.5rem 0.6rem',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: open ? 'var(--accent-weak)' : 'var(--bg-glass)',
          color: 'var(--text)',
          cursor: 'pointer',
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Link2 size={15} />
          Add external link
          {!open && links.length > 0 ? (
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                color: 'var(--text-muted)',
              }}
            >
              ({links.length})
            </span>
          ) : null}
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {open ? (
        <Panel style={{ padding: '0.55rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.35 }}>
            Save a link mentioned on this page (article, feed post, etc.) without leaving the tab.
          </div>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            style={{ height: 30, fontSize: 'var(--text-sm)' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
          {saveHint && !canSave ? (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{saveHint}</div>
          ) : null}
          {error ? (
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: '#ef4444',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.35)',
                padding: '0.35rem 0.45rem',
                borderRadius: 6,
              }}
            >
              {error}
            </div>
          ) : null}
          <ButtonPrimary
            onClick={() => void submit()}
            disabled={submitting || !url.trim()}
            style={{ width: '100%', padding: '0.45rem', fontSize: 'var(--text-sm)', fontWeight: 600 }}
          >
            {submitting ? 'Saving…' : 'Save external link'}
          </ButtonPrimary>
        </Panel>
      ) : null}

      {open && links.length > 0 ? (
        <Panel style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            External links this visit ({links.length})
          </div>
          {links.map((link) => (
            <div
              key={link.itemId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                padding: '0.45rem',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-panel)',
              }}
            >
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  wordBreak: 'break-all',
                  lineHeight: 1.35,
                }}
                title={link.url}
              >
                {link.url}
              </div>
              {link.digestStatus ? (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>{link.digestStatus}</div>
              ) : null}
              <SidePanelDigestPanel
                itemId={link.itemId}
                statusLabel={link.digestStatus}
                onOpenInApp={onOpenInApp}
              />
            </div>
          ))}
          <ButtonGhost
            type="button"
            onClick={onToggleOpen}
            style={{ padding: '0.3rem 0.45rem', fontSize: 'var(--text-xs)', alignSelf: 'flex-start' }}
          >
            Add another
          </ButtonGhost>
        </Panel>
      ) : null}
    </div>
  );
};
