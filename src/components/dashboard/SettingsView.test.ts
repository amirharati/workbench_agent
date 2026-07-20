import { describe, expect, it } from 'vitest';
import { resolveInitialSettingsSection } from './SettingsView';

describe('SettingsView navigation', () => {
  it('opens backup setup when automatic protection needs attention', () => {
    expect(resolveInitialSettingsSection(false, false)).toBe('backup');
    expect(resolveInitialSettingsSection(true, false)).toBe('backup');
  });

  it('opens general settings after backup protection is ready', () => {
    expect(resolveInitialSettingsSection(true, true)).toBe('general');
  });
});
