import React, { forwardRef } from 'react';
import { uiClassNames } from './uiPatterns';

type DivProps = React.HTMLAttributes<HTMLDivElement>;
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const cx = (...values: Array<string | undefined>) => values.filter(Boolean).join(' ');

/**
 * Panel - Container with background, border, and shadow
 * Use for cards, dialogs, dropdowns
 */
export const Panel: React.FC<DivProps> = ({ className, style, ...rest }) => (
  <div
    {...rest}
    className={cx(uiClassNames.panel, className)}
    style={{
      ...style,
    }}
  />
);

/**
 * ButtonGhost - Subtle button with border
 * Use for secondary actions
 */
export const ButtonGhost: React.FC<ButtonProps> = ({ className, style, ...rest }) => (
  <button
    {...rest}
    className={cx(uiClassNames.button.secondary, className)}
    style={style}
  />
);

/**
 * ButtonPrimary - Accent colored button
 * Use for primary actions
 */
export const ButtonPrimary: React.FC<ButtonProps> = ({ className, style, ...rest }) => (
  <button
    {...rest}
    className={cx(uiClassNames.button.primary, className)}
    style={style}
  />
);

export const ButtonDanger: React.FC<ButtonProps> = ({ className, style, ...rest }) => (
  <button
    {...rest}
    className={cx(uiClassNames.button.danger, className)}
    style={style}
  />
);

export const IconButton: React.FC<ButtonProps> = ({ className, style, ...rest }) => (
  <button
    {...rest}
    className={cx(uiClassNames.button.icon, className)}
    style={style}
  />
);

/**
 * Input - Text input field
 * Compact height for IDE feel
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, style, ...rest }, ref) => (
  <input
    {...rest}
    ref={ref}
    className={cx(uiClassNames.field, className)}
    style={{
      width: '100%',
      height: 'var(--control-height-md)',
      background: 'var(--input-bg)',
      border: '1px solid var(--border)',
      padding: '0 10px',
      borderRadius: 'var(--radius-md)',
      color: 'var(--text)',
      fontSize: 'var(--text-sm)',
      outline: 'none',
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
      fontWeight: 600,
      background: 'var(--bg-subtle)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
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
