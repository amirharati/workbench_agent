/**
 * Backup and restore utilities with safety checks
 */

import { exportDB, importDB, verifyBackup } from './db';

export interface BackupStats {
  projects: number;
  collections: number;
  items: number;
  notes: number;
  workspaces: number;
  timestamp: number;
}

/**
 * Creates a backup and returns stats
 */
export const createBackup = async (): Promise<{ success: boolean; stats?: BackupStats; error?: string }> => {
  try {
    const json = await exportDB();
    const data = JSON.parse(json);
    
    const stats: BackupStats = {
      projects: Array.isArray(data.projects) ? data.projects.length : 0,
      collections: Array.isArray(data.collections) ? data.collections.length : 0,
      items: Array.isArray(data.items) ? data.items.length : 0,
      notes: Array.isArray(data.notes) ? data.notes.length : 0,
      workspaces: Array.isArray(data.workspaces) ? data.workspaces.length : 0,
      timestamp: Date.now(),
    };
    
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: String(error) };
  }
};

/**
 * Downloads backup file
 */
export const downloadBackup = async (): Promise<boolean> => {
  try {
    const json = await exportDB();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `workbench-backup-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Backup download failed:', error);
    return false;
  }
};

/**
 * Restores from backup with safety checks
 */
export const restoreBackup = async (
  file: File,
  options: { createBackupFirst?: boolean; verifyFirst?: boolean } = {}
): Promise<{ success: boolean; error?: string; stats?: BackupStats }> => {
  const { createBackupFirst = true, verifyFirst = true } = options;
  
  try {
    const text = await file.text();
    
    // Verify backup structure
    if (verifyFirst) {
      const verification = verifyBackup(text);
      if (!verification.valid) {
        return { success: false, error: verification.error };
      }
    }
    
    // Import (will create backup first if createBackupFirst is true)
    const success = await importDB(text, createBackupFirst);
    
    if (success) {
      const data = JSON.parse(text);
      const stats: BackupStats = {
        projects: Array.isArray(data.projects) ? data.projects.length : 0,
        collections: Array.isArray(data.collections) ? data.collections.length : 0,
        items: Array.isArray(data.items) ? data.items.length : 0,
        notes: Array.isArray(data.notes) ? data.notes.length : 0,
        workspaces: Array.isArray(data.workspaces) ? data.workspaces.length : 0,
        timestamp: Date.now(),
      };
      return { success: true, stats };
    }
    
    return { success: false, error: 'Import failed' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
};

