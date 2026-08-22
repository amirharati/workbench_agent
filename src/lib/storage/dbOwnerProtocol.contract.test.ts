import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DB_OWNER_PROTOCOL_VERSION } from './dbOwnerProtocol';

const serviceWorkerSource = readFileSync(
  new URL('../../../public/service-worker.js', import.meta.url),
  'utf8'
);
const manifest = JSON.parse(readFileSync(
  new URL('../../../public/manifest.json', import.meta.url),
  'utf8'
)) as Record<string, unknown>;

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

  it('uses only contextual tab panels and never mixes in a manifest-global panel', () => {
    expect(manifest).not.toHaveProperty('side_panel');
    expect(serviceWorkerSource).toContain(
      '.setPanelBehavior({ openPanelOnActionClick: true })'
    );
    expect(serviceWorkerSource).toContain('chrome.sidePanel.onOpened.addListener');
    expect(serviceWorkerSource).toContain('chrome.sidePanel.onClosed.addListener');
    expect(serviceWorkerSource).toContain('isHomebaseDashboardUrl');
    expect(serviceWorkerSource).toContain('chrome.tabs.onUpdated.addListener');
    expect(serviceWorkerSource).toContain('path: SIDE_PANEL_PATH');
    expect(serviceWorkerSource).toContain('setOptions({ tabId, enabled: false })');
    expect(serviceWorkerSource).not.toContain('chrome.action.onClicked.addListener');
    expect(serviceWorkerSource).not.toMatch(/sidePanel\s*\.\s*open\(\{\s*tabId/);
    expect(serviceWorkerSource).not.toContain('chrome.sidePanel.close(');
    expect(serviceWorkerSource).not.toMatch(/sidePanel\s*\.\s*setOptions\(\{\s*enabled:\s*false/);
  });
});
