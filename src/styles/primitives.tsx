import React, { forwardRef } from 'react';
import { tokens } from './theme';

type DivProps = React.HTMLAttributes<HTMLDivElement>;
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Panel: React.FC<DivProps> = ({ style, ...rest }) => (
  <div
    {...rest}
    style={{
      background: 'var(--bg-panel)',
      border: `1px solid var(--border)`,
      borderRadius: tokens.radius.lg,
      boxShadow: 'var(--shadow-panel)',
      ...style,
    }}
  />
);

export const ButtonGhost: React.FC<ButtonProps> = ({ style, ...rest }) => (
  <button
    {...rest}
    style={{
      border: `1px solid var(--border)`,
      background: 'var(--bg-glass)',
      color: 'var(--text)',
      borderRadius: tokens.radius.md,
      padding: '0.35rem 0.65rem',
      cursor: 'pointer',
      boxShadow: 'var(--shadow-soft)',
      ...style,
    }}
  />
);

export const Input = forwardRef<HTMLInputElement, InputProps>(({ style, ...rest }, ref) => (
  <input
    {...rest}
    ref={ref}
    style={{
      width: '100%',
      background: 'var(--input-bg)',
      border: `1px solid var(--border)`,
      padding: '0.45rem 0.75rem',
      borderRadius: tokens.radius.md,
      color: 'var(--text)',
      outline: 'none',
      ...style,
    }}
  />
));

Input.displayName = 'Input';

