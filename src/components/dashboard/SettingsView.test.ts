import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveInitialSettingsSection } from './SettingsView';

const settingsSource = readFileSync(new URL('./SettingsView.tsx', import.meta.url), 'utf8');

describe('SettingsView navigation', () => {
  it('opens backup setup when automatic protection needs attention', () => {
    expect(resolveInitialSettingsSection(false, false)).toBe('backup');
    expect(resolveInitialSettingsSection(true, false)).toBe('backup');
  });

  it('opens general settings after backup protection is ready', () => {
    expect(resolveInitialSettingsSection(true, true)).toBe('general');
  });

  it('exposes native folder browsing, read-only snapshot inspection, and manual-backup deletion', () => {
    expect(settingsSource).toContain('Browse data folder…');
    expect(settingsSource).toContain('deleteManualFolderSqliteBackup');
    expect(settingsSource).toContain('inspectImportFromBackupFolderFile');
    expect(settingsSource).toContain('Read-only snapshot inspection');
    expect(settingsSource).toContain('isolated temporary SQLite connection');
    expect(settingsSource).toContain("snap.kind === 'manual'");
    expect(settingsSource).toContain('Delete this manual backup?');
    expect(settingsSource).toContain('Change data folder');
  });
});
