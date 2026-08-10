import type {
  ContentDatabaseStats,
  ContentDocument,
  ContentDocumentKind,
  PutContentDocumentInput,
} from './contentDatabase';

export type LocalContentRpcTransport = (
  method: string,
  args: unknown[]
) => Promise<unknown>;

let localTransport: LocalContentRpcTransport | null = null;

export function setLocalContentRpcTransport(transport: LocalContentRpcTransport | null): void {
  localTransport = transport;
}

export async function contentRpc<T>(method: string, args: unknown[] = []): Promise<T> {
  if (localTransport) return (await localTransport(method, args)) as T;
  const id = Date.now() + Math.floor(Math.random() * 1000);
  const response = await chrome.runtime.sendMessage({
    target: 'content-rpc',
    id,
    method,
    args,
  });
  if (!response?.ok) throw new Error(response?.error ?? `Content RPC ${method} failed`);
  return response.result as T;
}

export function putContent(input: PutContentDocumentInput): Promise<{
  rawRef: string;
  rawBytes: number;
  storedBytes: number;
  revision: number;
}> {
  return contentRpc('put', [input]);
}

export function getContentByRef(rawRef: string): Promise<ContentDocument | null> {
  return contentRpc('getByRef', [rawRef]);
}

export function deleteContent(
  itemId: string,
  kind?: ContentDocumentKind
): Promise<{ removed: number; revision: number }> {
  return contentRpc('delete', [itemId, kind]);
}

export function clearContent(): Promise<{ removed: number; revision: number }> {
  return contentRpc('clear');
}

export function getContentStatus(): Promise<ContentDatabaseStats> {
  return contentRpc('getStatus');
}

export function checkpointContentStore(): Promise<{ ok: boolean; error?: string }> {
  return contentRpc('checkpointNow');
}

export function bootstrapContentFromBackupFolderFile(): Promise<{
  imported: boolean;
  reason?: string;
  rowCount: number;
}> {
  return contentRpc('bootstrapFromBackupFolderFile');
}
