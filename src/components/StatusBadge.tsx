import React from 'react';

export type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'verified';

interface StatusBadgeProps {
  variant: StatusBadgeVariant;
  children: React.ReactNode;
}

const VARIANT_STYLES: Record<StatusBadgeVariant, { bg: string; color: string; icon: string }> = {
  success: { bg: 'rgba(63, 185, 80, 0.15)', color: '#3fb950', icon: '✓' },
  verified: { bg: 'rgba(163, 113, 247, 0.18)', color: '#a371f7', icon: '✓' },
  warning: { bg: 'rgba(210, 153, 34, 0.15)', color: '#d29922', icon: '⚠' },
  error: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', icon: '✗' },
  info: { bg: 'rgba(88, 166, 255, 0.15)', color: '#58a6ff', icon: 'i' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ variant, children }) => {
  const { bg, color, icon } = VARIANT_STYLES[variant];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        background: bg,
        color,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: '0.65em', lineHeight: 1 }}>{icon}</span>
      {children}
    </span>
  );
};
