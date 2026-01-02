import React, { forwardRef } from 'react';
import { tokens } from './theme';

type DivProps = React.HTMLAttributes<HTMLDivElement>;
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Panel - Container with background, border, and shadow
 * Use for cards, dialogs, dropdowns
 */
export const Panel: React.FC<DivProps> = ({ style, ...rest }) => (
  <div
    {...rest}
    style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: tokens.radius.lg,
      boxShadow: 'var(--shadow-soft)',
      ...style,
    }}
  />
);

/**
 * ButtonGhost - Subtle button with border
 * Use for secondary actions
 */
export const ButtonGhost: React.FC<ButtonProps> = ({ style, ...rest }) => (
  <button
    {...rest}
    style={{
      border: '1px solid var(--border)',
      background: 'var(--bg-glass)',
      color: 'var(--text)',
      borderRadius: tokens.radius.md,
      padding: '4px 10px',
      fontSize: 'var(--text-sm)',
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      ...style,
    }}
  />
);

/**
 * ButtonPrimary - Accent colored button
 * Use for primary actions
 */
export const ButtonPrimary: React.FC<ButtonProps> = ({ style, ...rest }) => (
  <button
    {...rest}
    style={{
      border: 'none',
      background: 'var(--accent)',
      color: 'var(--accent-text)',
      borderRadius: tokens.radius.md,
      padding: '4px 12px',
      fontSize: 'var(--text-sm)',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      ...style,
    }}
  />
);

/**
 * Input - Text input field
 * Compact height for IDE feel
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(({ style, ...rest }, ref) => (
  <input
    {...rest}
    ref={ref}
    style={{
      width: '100%',
      height: tokens.height.input,
      background: 'var(--input-bg)',
      border: '1px solid var(--border)',
      padding: '0 10px',
      borderRadius: tokens.radius.md,
      color: 'var(--text)',
      fontSize: 'var(--text-sm)',
      outline: 'none',
      transition: 'border-color 0.15s ease',
      ...style,
    }}
  />
));

Input.displayName = 'Input';

/**
 * Badge - Small label/tag
 */
export const Badge: React.FC<DivProps> = ({ style, ...rest }) => (
  <span
    {...rest}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 6px',
      fontSize: 'var(--text-xs)',
      fontWeight: 500,
      background: 'var(--bg-glass)',
      border: '1px solid var(--border)',
      borderRadius: tokens.radius.sm,
      color: 'var(--text-muted)',
      ...style,
    }}
  />
);

/**
 * Divider - Horizontal separator line
 */
export const Divider: React.FC<DivProps> = ({ style, ...rest }) => (
  <div
    {...rest}
    style={{
      height: 1,
      background: 'var(--border)',
      margin: '8px 0',
      ...style,
    }}
  />
);
