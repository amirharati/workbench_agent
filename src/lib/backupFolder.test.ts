import { describe, expect, it } from 'vitest';
import { formatBackupFolderError } from './backupFolder';

describe('formatBackupFolderError', () => {
  it('keeps DOMException name and message instead of object text', () => {
    expect(
      formatBackupFolderError({
        name: 'InvalidStateError',
        message: 'The file handle cannot be moved in this directory',
      })
    ).toBe('InvalidStateError: The file handle cannot be moved in this directory');
  });

  it('uses a DOMException name when Chrome supplies no message', () => {
    expect(formatBackupFolderError({ name: 'NoModificationAllowedError' })).toBe(
      'NoModificationAllowedError'
    );
  });
});
