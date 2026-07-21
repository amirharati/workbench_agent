export interface StartupIdleOptions {
  timeoutMs?: number;
}

/**
 * Put non-critical startup work behind the first usable paint while still
 * guaranteeing it runs soon in background or heavily loaded tabs.
 */
export function scheduleStartupIdleWork(
  work: () => void,
  options: StartupIdleOptions = {}
): () => void {
  if (typeof window === 'undefined') return () => {};
  const timeout = options.timeoutMs ?? 400;
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(work, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(work, Math.min(timeout, 32));
  return () => window.clearTimeout(id);
}

export function waitForStartupIdle(options?: StartupIdleOptions): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    scheduleStartupIdleWork(resolve, options);
  });
}
