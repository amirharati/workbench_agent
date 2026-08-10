/** Dedicated worker that exclusively owns workbench-content.sqlite. */
import {
  bootstrapContentDatabaseFromBytes,
  clearContentDatabase,
  deleteContentDocument,
  exportContentDatabaseBytes,
  getContentDatabaseStats,
  getContentDocumentByRef,
  markContentDatabaseExported,
  putContentDocument,
} from './contentDatabase';

const CONTENT_WORKER_PROTOCOL_VERSION = 8;
// Fixed maximum delay from the first dirty write. Do not debounce by resetting
// this timer: a continuous large import must still publish bounded checkpoints.
const SNAPSHOT_MAX_DELAY_MS = 60_000;
const SNAPSHOT_WRITE_TIMEOUT_MS = 120_000;

type RpcRequest = { id: number; method: string; args: unknown[] };
type WorkerControlMessage = {
  type: 'content-mirror-ack';
  ok?: boolean;
  error?: string;
};

const workerScope = self as unknown as {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<RpcRequest | WorkerControlMessage>) => void) | null;
};

const rpcQueue: RpcRequest[] = [];
let rpcRunning = false;
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotPromise: Promise<{ ok: boolean; error?: string }> | null = null;
let pendingMirrorAck: ((result: { ok: boolean; error?: string }) => void) | null = null;

function waitForMirrorAck(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    pendingMirrorAck = resolve;
    setTimeout(() => {
      if (pendingMirrorAck === resolve) {
        pendingMirrorAck = null;
        resolve({ ok: false, error: 'Content snapshot write timed out' });
      }
    }, SNAPSHOT_WRITE_TIMEOUT_MS);
  });
}

async function checkpointContentDatabase(): Promise<{ ok: boolean; error?: string }> {
  if (snapshotPromise) return snapshotPromise;
  snapshotPromise = (async () => {
    const stats = await getContentDatabaseStats();
    const bytes = await exportContentDatabaseBytes();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const ack = waitForMirrorAck();
    workerScope.postMessage(
      { type: 'content-mirror-bytes', bytes: copy.buffer, revision: stats.revision },
      [copy.buffer]
    );
    const result = await ack;
    if (result.ok) await markContentDatabaseExported(stats.revision);
    return result;
  })();
  try {
    return await snapshotPromise;
  } finally {
    snapshotPromise = null;
  }
}

function scheduleContentSnapshot(): void {
  if (snapshotTimer) return;
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null;
    void checkpointContentDatabase().then((result) => {
      if (!result.ok) console.warn('[Content worker] background snapshot failed:', result.error);
    }).catch((error) => {
      console.warn('[Content worker] background snapshot failed:', error);
    });
  }, SNAPSHOT_MAX_DELAY_MS);
}

async function handleMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case 'ping':
      return 'pong';
    case 'getProtocolVersion':
      return CONTENT_WORKER_PROTOCOL_VERSION;
    case 'put': {
      const result = await putContentDocument(args[0] as Parameters<typeof putContentDocument>[0]);
      scheduleContentSnapshot();
      return result;
    }
    case 'getByRef':
      return getContentDocumentByRef(String(args[0] ?? ''));
    case 'delete': {
      const result = await deleteContentDocument(
        String(args[0] ?? ''),
        args[1] as Parameters<typeof deleteContentDocument>[1]
      );
      if (result.removed) scheduleContentSnapshot();
      return result;
    }
    case 'clear': {
      const result = await clearContentDatabase();
      scheduleContentSnapshot();
      return result;
    }
    case 'getStatus':
      return getContentDatabaseStats();
    case 'checkpointNow':
      if (snapshotTimer) {
        clearTimeout(snapshotTimer);
        snapshotTimer = null;
      }
      return checkpointContentDatabase();
    case 'bootstrapFromFolderBytes':
      return bootstrapContentDatabaseFromBytes(args[0]);
    default:
      throw new Error(`Unknown content worker RPC: ${method}`);
  }
}

async function runOneRpc(request: RpcRequest): Promise<void> {
  try {
    const result = await handleMethod(request.method, request.args ?? []);
    workerScope.postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    workerScope.postMessage({ id: request.id, ok: false, error: String(error) });
  }
}

function pumpRpcQueue(): void {
  if (rpcRunning) return;
  const next = rpcQueue.shift();
  if (!next) return;
  rpcRunning = true;
  void runOneRpc(next).finally(() => {
    rpcRunning = false;
    pumpRpcQueue();
  });
}

workerScope.onmessage = (event) => {
  const message = event.data;
  if (message && 'type' in message && message.type === 'content-mirror-ack') {
    if (pendingMirrorAck) {
      const resolve = pendingMirrorAck;
      pendingMirrorAck = null;
      resolve({ ok: Boolean(message.ok), error: message.error });
    }
    return;
  }
  rpcQueue.push(message as RpcRequest);
  pumpRpcQueue();
};

void getContentDatabaseStats()
  .then(() => workerScope.postMessage({ type: 'content-worker-ready' }))
  .catch((error) => workerScope.postMessage({ type: 'content-worker-error', error: String(error) }));
