/**
 * Shared UTC clock for DB / sync write stamps.
 *
 * Prefers a cached offset from a trusted network Date header; falls back to
 * Date.now(). Never blocks writes; never throws from nowMs().
 */

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SYNC_TIMEOUT_MS = 2000;

/** Stable endpoints that return a Date response header (extension host_permissions cover https). */
const CLOCK_URLS = [
  'https://www.google.com/generate_204',
  'https://www.cloudflare.com/cdn-cgi/trace',
] as const;

let offsetMs = 0;
let hasNetworkOffset = false;
let lastSyncAt = 0;
let syncInFlight: Promise<void> | null = null;

export function nowMs(): number {
  try {
    const base = Date.now();
    if (!hasNetworkOffset) return base;
    const age = base - lastSyncAt;
    if (age > CACHE_TTL_MS) return base;
    const n = base + offsetMs;
    return Number.isFinite(n) ? n : base;
  } catch {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }
}

export function getClockSource(): 'network' | 'system' {
  if (!hasNetworkOffset) return 'system';
  if (Date.now() - lastSyncAt > CACHE_TTL_MS) return 'system';
  return 'network';
}

async function fetchServerDateMs(url: string): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    const raw = res.headers.get('Date');
    if (!raw) return null;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort refresh of the trusted clock offset. Failures are no-ops.
 * Safe to call fire-and-forget; do not await on write paths.
 */
export async function syncClock(): Promise<void> {
  if (syncInFlight) return syncInFlight;
  if (hasNetworkOffset && Date.now() - lastSyncAt < CACHE_TTL_MS) {
    return;
  }

  syncInFlight = (async () => {
    try {
      for (const url of CLOCK_URLS) {
        const before = Date.now();
        const serverMs = await fetchServerDateMs(url);
        const after = Date.now();
        if (serverMs == null) continue;
        // Compare mid-point of RTT to reduce one-way latency skew a bit.
        const localMid = before + (after - before) / 2;
        offsetMs = Math.round(serverMs - localMid);
        hasNetworkOffset = true;
        lastSyncAt = after;
        return;
      }
    } catch {
      // keep previous offset / system fallback
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

/** Test-only: reset module state. */
export function __resetClockForTests(): void {
  offsetMs = 0;
  hasNetworkOffset = false;
  lastSyncAt = 0;
  syncInFlight = null;
}

/** Test-only: inject a trusted offset as if syncClock succeeded. */
export function __setNetworkOffsetForTests(offset: number, syncedAt = Date.now()): void {
  offsetMs = offset;
  hasNetworkOffset = true;
  lastSyncAt = syncedAt;
}
