/** Timed abort for a single fetch phase; dispose() when the phase ends. */
export function timedAbortSignal(
  ms: number,
  parent?: AbortSignal
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  const onParentAbort = () => {
    clearTimeout(timer);
    controller.abort();
  };

  if (parent?.aborted) {
    clearTimeout(timer);
    controller.abort();
  } else if (parent) {
    parent.addEventListener('abort', onParentAbort, { once: true });
  }

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onParentAbort);
    },
  };
}

/** User cancel + overall fetch deadline. */
export function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  return controller.signal;
}
