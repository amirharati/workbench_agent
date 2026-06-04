import React from 'react';
import { Loader2 } from 'lucide-react';

type LibraryLoadingPlaceholderProps = {
  message?: string;
  /** Taller block for table/list areas */
  variant?: 'inline' | 'panel';
};

export const LibraryLoadingPlaceholder: React.FC<LibraryLoadingPlaceholderProps> = ({
  message = 'Loading library…',
  variant = 'panel',
}) => {
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
        {message}
      </span>
    );
  }

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
      <div>{message}</div>
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
      <style>{`
        @keyframes library-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>
    </div>
  );
};
