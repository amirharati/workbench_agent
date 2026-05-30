/** Marker for base64-wrapped bytes in extension RPC (structured clone drops some TypedArrays). */
export const BINARY_RPC_TAG = '__workbenchBinary';

export type BinaryRpcPayload = { [BINARY_RPC_TAG]: true; b64: string };

export function isBinaryRpcPayload(data: unknown): data is BinaryRpcPayload {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as BinaryRpcPayload)[BINARY_RPC_TAG] === true &&
    typeof (data as BinaryRpcPayload).b64 === 'string'
  );
}

/** Coerce worker/RPC export or folder read into bytes safe for FileSystemWritableFileStream. */
export function normalizeBinaryPayload(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'number') {
    return Uint8Array.from(data);
  }
  return null;
}

/** Wrap bytes for chrome.runtime.sendMessage — survives tab → SW → offscreen → worker. */
export function encodeBinaryForRpc(bytes: Uint8Array): BinaryRpcPayload {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return { [BINARY_RPC_TAG]: true, b64: btoa(binary) };
}

/** Decode RPC args or pass through raw TypedArray when already intact. */
export function decodeBinaryFromRpc(data: unknown): Uint8Array | null {
  if (isBinaryRpcPayload(data)) {
    const binary = atob(data.b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  return normalizeBinaryPayload(data);
}
