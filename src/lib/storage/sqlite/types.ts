/** SQLite storage layer types */

export interface SqliteConfig {
  dbName: string;
  schemaVersion: number;
  /** Optional isolated OPFS pool for a worker with a separate storage lifecycle. */
  opfsVfsName?: string;
  opfsDirectory?: string;
}

export interface TransactionContext {
  exec: (sql: string, bind?: unknown[]) => void;
  selectAll: <T>(sql: string, bind?: unknown[]) => T[];
  selectOne: <T>(sql: string, bind?: unknown[]) => T | undefined;
}

export type TransactionMode = 'readonly' | 'readwrite';

export type SqliteStorageMode = 'folder' | 'opfs' | 'memory';

export interface SqliteConnection {
  isReady: () => boolean;
  getStorageMode: () => SqliteStorageMode;
  
  exec: (sql: string, bind?: unknown[]) => void;
  selectAll: <T>(sql: string, bind?: unknown[]) => T[];
  selectOne: <T>(sql: string, bind?: unknown[]) => T | undefined;
  
  withTransaction: <T>(
    fn: (ctx: TransactionContext) => T,
    mode?: TransactionMode
  ) => T;
  
  exportDatabase: () => Promise<Uint8Array>;
  importDatabase: (data: Uint8Array) => Promise<void>;
  
  close: () => void;
}

export const DEFAULT_CONFIG: SqliteConfig = {
  dbName: 'workbench.sqlite',
  schemaVersion: 8,
};
