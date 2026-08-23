/// <reference types="vite/client" />

declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}

/** File System Access API — Chromium; TS DOM lib may lag behind */
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite'; id?: string; startIn?: FileSystemHandle | string }): Promise<FileSystemDirectoryHandle>;
}
