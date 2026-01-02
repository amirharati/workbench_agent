/**
 * Design tokens for IDE-like compact UI
 * Use CSS variables from global.css for colors
 * These are numeric values for use in JS/inline styles
 */

export const tokens = {
  // Spacing (compact IDE scale)
  space: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },
  
  // Border radius (tighter for IDE feel)
  radius: {
    sm: 4,
    md: 6,
    lg: 8,
  },
  
  // Shadows
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.15)',
    md: '0 4px 8px rgba(0,0,0,0.18)',
    lg: '0 8px 16px rgba(0,0,0,0.22)',
    panel: '0 8px 24px rgba(0,0,0,0.25)',
    soft: '0 2px 8px rgba(0,0,0,0.12)',
  },
  
  // Typography
  fontSize: {
    xs: '0.7rem',      // 11.2px
    sm: '0.8rem',      // 12.8px
    base: '0.875rem',  // 14px
    lg: '1rem',        // 16px
    xl: '1.125rem',    // 18px
  },
  
  // Z-index
  z: {
    dropdown: 100,
    modal: 500,
    overlay: 1000,
    tooltip: 2000,
  },
  
  // Component heights (for consistency)
  height: {
    tabBar: 28,
    navItem: 28,
    input: 28,
    button: 28,
    listItem: 28,
  },
};

// Spacing helpers for inline styles
export const sp = {
  xxs: '2px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
};
