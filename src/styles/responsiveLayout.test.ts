import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./global.css', import.meta.url), 'utf8');

describe('responsive dashboard layout contract', () => {
  it('responds to actual workspace width instead of viewport width alone', () => {
    expect(css).toContain('container-name: dashboard-workspace');
    expect(css).toContain('@container dashboard-workspace (max-width: 1000px)');
    expect(css).toContain('@container dashboard-workspace (max-width: 720px)');
  });

  it('uses compact-height density without reducing the typography scale', () => {
    expect(css).toContain('@media (max-height: 820px)');
    expect(css).toContain('--project-launcher-grid-height: 58px');
    expect(css).toContain("[data-all-library-working-canvas]");
    expect(css).not.toMatch(/@media \(max-height: 820px\)[\s\S]*?--font-scale:/);
  });

  it('never trades Chrome-safe bottom clearance for compact density', () => {
    expect(css).toContain('--browser-footer-safe-clearance: calc(var(--browser-footer-clearance) + env(safe-area-inset-bottom, 0px))');
    expect(css).toMatch(/\.ui-dashboard-shell \{[\s\S]*?height: 100dvh;[\s\S]*?padding-bottom: var\(--browser-footer-safe-clearance\);/);
    expect(css).not.toMatch(/\.ui-dashboard-shell__body \{[\s\S]*?padding-bottom: var\(--browser-footer-safe-clearance\);/);
    expect(css).toContain('--page-safe-bottom: calc(var(--page-bottom-clearance) + env(safe-area-inset-bottom, 0px))');
    expect(css).toMatch(/\.ui-page-frame,\s*\.ui-home-overview \{[\s\S]*?padding-bottom: var\(--page-safe-bottom\) !important;/);
    expect(css).toMatch(/@media \(max-width: 1320px\)[\s\S]*?\.right-panel \{[\s\S]*?bottom: 0;/);
    expect(css).not.toContain('padding-bottom: 56px !important');
    expect(css).not.toContain('padding: 12px var(--space-md) 56px !important');
  });

  it('sizes the project launcher as complete rows and scales the whole card system', () => {
    expect(css).toContain('--project-launcher-grid-height: 138px');
    expect(css).toContain('--project-launcher-card-min-width: 220px');
    expect(css).toContain('grid-auto-rows: var(--project-launcher-card-height)');
    expect(css).toContain('height: var(--project-launcher-card-height)');
    expect(css).toContain('--project-launcher-card-min-width: 190px');
    expect(css).toContain('--project-launcher-icon-size: 26px');
  });

  it('switches browse/detail canvases one pane at a time when narrow', () => {
    expect(css).toContain(".ui-adaptive-browser[data-detail-open='false'] > :nth-child(2)");
    expect(css).toContain(".ui-adaptive-browser[data-detail-open='true'] > :first-child");
    expect(css).toContain('.ui-adaptive-detail-back');
  });

  it('overlays the Inspector before the workspace becomes cramped', () => {
    expect(css).toContain('@media (max-width: 1320px)');
    expect(css).toMatch(/@media \(max-width: 1320px\)[\s\S]*?\.right-panel \{[\s\S]*?position: absolute;/);
  });
});
