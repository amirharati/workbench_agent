import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DB_OWNER_PROTOCOL_VERSION } from './dbOwnerProtocol';

const serviceWorkerSource = readFileSync(
  new URL('../../../public/service-worker.js', import.meta.url),
  'utf8'
);

const participantSources = [
  new URL('../../offscreen/offscreen.ts', import.meta.url),
  new URL('./dbWorker/worker.ts', import.meta.url),
  new URL('./content/worker.ts', import.meta.url),
].map((url) => readFileSync(url, 'utf8'));

describe('DB owner protocol contract', () => {
  it('keeps the unbundled service worker aligned with the shared worker protocol', () => {
    const mirroredVersion = serviceWorkerSource.match(
      /const DB_OWNER_PROTOCOL_VERSION = (\d+);/
    );
    expect(mirroredVersion?.[1]).toBe(String(DB_OWNER_PROTOCOL_VERSION));
    for (const source of participantSources) {
      expect(source).toMatch(/from ['"][^'"]*dbOwnerProtocol['"]/);
      expect(source).not.toMatch(/getProtocolVersion['"]:\s*\n\s*return \d+/);
    }
  });

  it('does not close a retained owner after an unavailable one-shot probe', () => {
    expect(serviceWorkerSource).toContain("if (protocol.status !== 'mismatch')");
    expect(serviceWorkerSource).toContain("throw new Error('DB owner is still starting; retry')");
    expect(serviceWorkerSource).toContain('mismatchConfirmations >= 2');
  });

  it('opens the manifest-enabled side panel without racing setOptions', () => {
    const actionHandler = serviceWorkerSource.slice(
      serviceWorkerSource.indexOf('chrome.action.onClicked.addListener'),
      serviceWorkerSource.indexOf('chrome.tabs.onRemoved.addListener')
    );
    expect(actionHandler).toContain('.open({ tabId: tab.id })');
    expect(actionHandler).not.toContain('.setOptions(');
  });
});
