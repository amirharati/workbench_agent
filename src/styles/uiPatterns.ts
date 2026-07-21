import type React from 'react';

/**
 * Shared layout grammar for dashboard surfaces.
 * Keep these structural; typography and decorative polish belong in theme tokens.
 */
export const uiPatterns = {
  pageFrame: {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    overflow: 'hidden',
    padding: '16px 18px 72px',
    boxSizing: 'border-box',
  } satisfies React.CSSProperties,

  pageHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexShrink: 0,
  } satisfies React.CSSProperties,

  pageTitle: {
    margin: 0,
    color: 'var(--text)',
    fontSize: 'var(--text-xl)',
    fontWeight: 700,
    lineHeight: 1.25,
  } satisfies React.CSSProperties,

  pageDescription: {
    margin: '3px 0 0',
    color: 'var(--text-faint)',
    fontSize: 'var(--text-xs)',
    lineHeight: 1.45,
  } satisfies React.CSSProperties,

  actionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 7,
    flexWrap: 'wrap',
  } satisfies React.CSSProperties,

  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flexShrink: 0,
  } satisfies React.CSSProperties,

  tabBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: 5,
    flexWrap: 'wrap',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-panel)',
  } satisfies React.CSSProperties,

  viewTab(active: boolean): React.CSSProperties {
    return {
      minHeight: 31,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: '0 10px',
      border: active ? '1px solid var(--border-active)' : '1px solid transparent',
      borderRadius: 'var(--radius-sm)',
      background: active ? 'var(--accent-weak)' : 'transparent',
      color: active ? 'var(--accent-hover)' : 'var(--text-muted)',
      fontSize: 'var(--text-xs)',
      fontWeight: 650,
      cursor: 'pointer',
    };
  },

  panel: {
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--bg-panel)',
    boxShadow: 'var(--shadow-sm)',
  } satisfies React.CSSProperties,

  panelHeader: {
    minHeight: 46,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '8px 11px',
    borderBottom: '1px solid var(--border)',
    boxSizing: 'border-box',
  } satisfies React.CSSProperties,

  splitCanvas: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(280px, 390px) minmax(0, 1fr)',
    gap: 12,
  } satisfies React.CSSProperties,

  emptyState: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    placeItems: 'center',
    padding: 24,
    color: 'var(--text-faint)',
    fontSize: 'var(--text-sm)',
    lineHeight: 1.5,
    textAlign: 'center',
  } satisfies React.CSSProperties,

  secondaryButton: {
    minHeight: 29,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '0 9px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-glass)',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } satisfies React.CSSProperties,

  primaryButton: {
    minHeight: 29,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '0 9px',
    border: '1px solid var(--accent-solid, var(--accent))',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--accent-solid, var(--accent))',
    color: 'var(--accent-text)',
    fontSize: 'var(--text-xs)',
    fontWeight: 650,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } satisfies React.CSSProperties,

  dangerButton: {
    minHeight: 29,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '0 9px',
    border: '1px solid rgba(239, 68, 68, 0.45)',
    borderRadius: 'var(--radius-sm)',
    background: 'rgba(239, 68, 68, 0.08)',
    color: 'var(--danger, #ef4444)',
    fontSize: 'var(--text-xs)',
    fontWeight: 650,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } satisfies React.CSSProperties,

  iconButton: {
    width: 27,
    height: 27,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-glass)',
    color: 'var(--text-faint)',
    cursor: 'pointer',
  } satisfies React.CSSProperties,

  select: {
    minWidth: 120,
    maxWidth: 230,
    height: 29,
    padding: '0 7px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-input)',
    color: 'var(--text)',
    fontSize: 'var(--text-xs)',
  } satisfies React.CSSProperties,

  searchField: {
    width: 'min(560px, 100%)',
    height: 34,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 10px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--input-bg)',
    boxSizing: 'border-box',
  } satisfies React.CSSProperties,

  fieldLabel: {
    display: 'block',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  } satisfies React.CSSProperties,

  fieldInput: {
    width: '100%',
    boxSizing: 'border-box',
    marginTop: 4,
    padding: '7px 9px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-input)',
    color: 'var(--text)',
    fontSize: 'var(--text-sm)',
    fontWeight: 400,
    textTransform: 'none',
    letterSpacing: 0,
    outline: 'none',
  } satisfies React.CSSProperties,

  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'rgba(0, 0, 0, 0.48)',
  } satisfies React.CSSProperties,

  dialog: {
    width: '100%',
    maxWidth: 460,
    overflow: 'hidden',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--bg-panel)',
    color: 'var(--text)',
    boxShadow: 'var(--shadow-panel, 0 20px 50px rgba(0,0,0,0.35))',
  } satisfies React.CSSProperties,
};
