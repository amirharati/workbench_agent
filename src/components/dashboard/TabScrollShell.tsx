import React from 'react';

/** Consistent scroll container for tab bodies inside flex layouts. */
export const TabScrollShell: React.FC<{
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, className = 'scrollbar ui-scroll-footer-safe', style }) => (
  <div
    className={className}
    style={{
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      ...style,
    }}
  >
    {children}
  </div>
);

/** Outer flex frame for tab content — pairs with TabScrollShell or a fill-height child. */
export const TabPaneFrame: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      ...style,
    }}
  >
    {children}
  </div>
);
