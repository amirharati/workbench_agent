import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

interface CommandPaletteProps {
  open: boolean;
  recentQueries: string[];
  onClose: () => void;
  onSearch: (query: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  recentQueries,
  onClose,
  onSearch,
}) => {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setInput('');
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const submit = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearch(trimmed);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--layer-command)',
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(520px, 92vw)',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ position: 'relative', borderBottom: '1px solid var(--border)' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit(input);
              }
            }}
            placeholder="Search library..."
            style={{
              width: '100%',
              padding: '14px 14px 14px 42px',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--text)',
              fontSize: 'var(--text-base)',
              fontFamily: 'var(--font-sans)',
            }}
          />
        </div>

        {recentQueries.length > 0 && (
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-faint)',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              Recent
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {recentQueries.slice(0, 8).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => submit(q)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-muted)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.color = 'var(--text)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-muted)';
                  }}
                >
                  {q.length > 80 ? `${q.slice(0, 80)}…` : q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
          Enter to search · Esc to close
        </div>
      </div>
    </div>
  );
};
