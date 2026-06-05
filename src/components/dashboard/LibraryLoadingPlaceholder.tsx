import React from 'react';
import { Loader2 } from 'lucide-react';

export type LibraryLoadingProgress = {
  label: string;
  percent?: number;
};

type LibraryLoadingPlaceholderProps = {
  message?: string;
  progress?: LibraryLoadingProgress | null;
  /** Taller block for table/list areas */
  variant?: 'inline' | 'panel';
};

export const LibraryLoadingPlaceholder: React.FC<LibraryLoadingPlaceholderProps> = ({
  message = 'Loading library…',
  progress = null,
  variant = 'panel',
}) => {
  const displayMessage = progress?.label ?? message;
  if (variant === 'inline') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          color: 'var(--text-faint)',
          fontSize: 'var(--text-xs)',
        }}
      >
        <Loader2 size={14} className="spin" />
        {displayMessage}
      </span>
    );
  }

  const showDeterminate =
    typeof progress?.percent === 'number' &&
    progress.percent >= 0 &&
    progress.percent <= 100;

  return (
    <div
      style={{
        padding: variant === 'panel' ? '40px 24px' : 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        minHeight: 120,
        color: 'var(--text-muted)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <Loader2 size={28} className="spin" style={{ opacity: 0.85 }} />
      <div>{displayMessage}</div>
      {showDeterminate ? (
        <div
          role="progressbar"
          aria-valuenow={progress!.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            width: 'min(420px, 90%)',
            height: 6,
            borderRadius: 3,
            background: 'var(--bg-glass)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress!.percent}%`,
              borderRadius: 3,
              background: 'var(--accent, #3b82f6)',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      ) : (
        <div
          aria-hidden
          style={{
            width: 'min(420px, 90%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {[0.92, 0.78, 0.65].map((w) => (
            <div
              key={w}
              style={{
                height: 10,
                width: `${w * 100}%`,
                borderRadius: 4,
                background:
                  'linear-gradient(90deg, var(--bg-glass) 0%, var(--border) 50%, var(--bg-glass) 100%)',
                backgroundSize: '200% 100%',
                animation: 'library-shimmer 1.2s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      )}
      <style>{`
        @keyframes library-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>
    </div>
  );
};
