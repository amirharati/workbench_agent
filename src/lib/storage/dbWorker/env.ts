/** True when code runs inside the dedicated DB worker. */
export function isDbWorkerProcess(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    !!(globalThis as { __WORKBENCH_DB_WORKER__?: boolean }).__WORKBENCH_DB_WORKER__
  );
}

export function markDbWorkerProcess(): void {
  (globalThis as { __WORKBENCH_DB_WORKER__?: boolean }).__WORKBENCH_DB_WORKER__ = true;
}
