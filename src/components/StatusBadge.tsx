import React from 'react';

export type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'verified';

interface StatusBadgeProps {
  variant: StatusBadgeVariant;
  children: React.ReactNode;
}

const VARIANT_STYLES: Record<StatusBadgeVariant, { bg: string; color: string; icon: string }> = {
  success: { bg: 'color-mix(in srgb, var(--status-success) 14%, transparent)', color: 'var(--status-success)', icon: '✓' },
  verified: { bg: 'color-mix(in srgb, var(--status-verified) 14%, transparent)', color: 'var(--status-verified)', icon: '✓' },
  warning: { bg: 'var(--warning-weak)', color: 'var(--warning)', icon: '⚠' },
  error: { bg: 'var(--error-weak)', color: 'var(--error)', icon: '✗' },
  info: { bg: 'color-mix(in srgb, var(--status-info) 14%, transparent)', color: 'var(--status-info)', icon: 'i' },
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
