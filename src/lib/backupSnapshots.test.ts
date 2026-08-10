import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SNAPSHOT_DEPTH,
  MAX_SNAPSHOT_DEPTH,
  MIN_SNAPSHOT_DEPTH,
  autoSnapshotFilename,
  buildRotationCopyPlan,
  clampSnapshotDepth,
  classifyFolderSqliteBackup,
  isRestorableFolderSqliteBackup,
  listAutoSnapshotFilenames,
  parseAutoSnapshotSlot,
} from './backupSnapshots';
import { WORKBENCH_DB_FILE } from './backupFolder';

describe('clampSnapshotDepth', () => {
  it('defaults invalid values to 2', () => {
    expect(clampSnapshotDepth(undefined)).toBe(DEFAULT_SNAPSHOT_DEPTH);
    expect(clampSnapshotDepth(NaN)).toBe(DEFAULT_SNAPSHOT_DEPTH);
    expect(clampSnapshotDepth('x')).toBe(DEFAULT_SNAPSHOT_DEPTH);
  });

  it('clamps to 1–5', () => {
    expect(clampSnapshotDepth(0)).toBe(MIN_SNAPSHOT_DEPTH);
    expect(clampSnapshotDepth(1)).toBe(1);
    expect(clampSnapshotDepth(2)).toBe(2);
    expect(clampSnapshotDepth(5)).toBe(MAX_SNAPSHOT_DEPTH);
    expect(clampSnapshotDepth(99)).toBe(MAX_SNAPSHOT_DEPTH);
  });
});

describe('auto snapshot filenames', () => {
  it('names slot 1 as workbench.prev.sqlite', () => {
    expect(autoSnapshotFilename(1)).toBe('workbench.prev.sqlite');
    expect(autoSnapshotFilename(2)).toBe('workbench.prev2.sqlite');
    expect(autoSnapshotFilename(3)).toBe('workbench.prev3.sqlite');
  });

  it('lists filenames for depth', () => {
    expect(listAutoSnapshotFilenames(1)).toEqual(['workbench.prev.sqlite']);
    expect(listAutoSnapshotFilenames(2)).toEqual([
      'workbench.prev.sqlite',
      'workbench.prev2.sqlite',
    ]);
    expect(listAutoSnapshotFilenames(3)).toEqual([
      'workbench.prev.sqlite',
      'workbench.prev2.sqlite',
      'workbench.prev3.sqlite',
    ]);
  });

  it('parses slots and rejects unknown names', () => {
    expect(parseAutoSnapshotSlot('workbench.prev.sqlite')).toBe(1);
    expect(parseAutoSnapshotSlot('workbench.prev2.sqlite')).toBe(2);
    expect(parseAutoSnapshotSlot('manual-2026.sqlite')).toBeNull();
    expect(parseAutoSnapshotSlot('workbench.sqlite')).toBeNull();
  });
});

describe('classifyFolderSqliteBackup', () => {
  it('classifies live / auto / manual / safety', () => {
    expect(classifyFolderSqliteBackup('workbench.sqlite')).toBe('live');
    expect(classifyFolderSqliteBackup('workbench-content.sqlite')).toBeNull();
    expect(classifyFolderSqliteBackup('workbench.prev.sqlite')).toBe('auto');
    expect(classifyFolderSqliteBackup('workbench.prev2.sqlite')).toBe('auto');
    expect(classifyFolderSqliteBackup('manual-2026-07-11_120000.sqlite')).toBe('manual');
    expect(classifyFolderSqliteBackup('safety-before-import-xyz.sqlite')).toBe('safety');
    expect(classifyFolderSqliteBackup('workbench.undo-restore.sqlite')).toBe('undo');
    expect(classifyFolderSqliteBackup('import-staging.sqlite')).toBeNull();
    expect(classifyFolderSqliteBackup('.workbench.restore-incoming.sqlite')).toBeNull();
  });

  it('only non-live kinds are restorable', () => {
    expect(isRestorableFolderSqliteBackup('workbench.sqlite')).toBe(false);
    expect(isRestorableFolderSqliteBackup('workbench.prev.sqlite')).toBe(true);
    expect(isRestorableFolderSqliteBackup('workbench.undo-restore.sqlite')).toBe(true);
    expect(isRestorableFolderSqliteBackup('manual-a.sqlite')).toBe(true);
  });
});

describe('buildRotationCopyPlan', () => {
  it('rotates prev2 ← prev ← live for depth 2', () => {
    expect(buildRotationCopyPlan(2)).toEqual([
      { from: 'workbench.prev.sqlite', to: 'workbench.prev2.sqlite' },
      { from: WORKBENCH_DB_FILE, to: 'workbench.prev.sqlite' },
    ]);
  });

  it('extends chain for depth 3', () => {
    expect(buildRotationCopyPlan(3)).toEqual([
      { from: 'workbench.prev2.sqlite', to: 'workbench.prev3.sqlite' },
      { from: 'workbench.prev.sqlite', to: 'workbench.prev2.sqlite' },
      { from: WORKBENCH_DB_FILE, to: 'workbench.prev.sqlite' },
    ]);
  });

  it('depth 1 only copies live → prev', () => {
    expect(buildRotationCopyPlan(1)).toEqual([
      { from: WORKBENCH_DB_FILE, to: 'workbench.prev.sqlite' },
    ]);
  });
});

describe('rollbackToAutoSnapshot validation', () => {
  it('refuses filenames outside the auto snapshot set', async () => {
    const { rollbackToAutoSnapshot } = await import('./backupSnapshots');
    const res = await rollbackToAutoSnapshot('manual-not-a-snapshot.sqlite');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Not an auto snapshot/);
  });

  it('refuses invalid prev slot names', async () => {
    const { rollbackToAutoSnapshot } = await import('./backupSnapshots');
    const res = await rollbackToAutoSnapshot('workbench.prev99.sqlite');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Not an auto snapshot/);
  });
});
