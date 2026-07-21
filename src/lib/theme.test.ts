import { describe, expect, it } from 'vitest';
import { resolveAppTheme } from './theme';

describe('theme preference', () => {
  it('uses an explicit saved choice', () => {
    expect(resolveAppTheme('light', true)).toBe('light');
    expect(resolveAppTheme('dark', false)).toBe('dark');
  });

  it('falls back to the system preference', () => {
    expect(resolveAppTheme(null, true)).toBe('dark');
    expect(resolveAppTheme(null, false)).toBe('light');
  });
});
