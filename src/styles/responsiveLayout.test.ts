import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./global.css', import.meta.url), 'utf8');

describe('responsive dashboard layout contract', () => {
  it('responds to actual workspace width instead of viewport width alone', () => {
    expect(css).toContain('container-name: dashboard-workspace');
    expect(css).toContain('@container dashboard-workspace (max-width: 1000px)');
    expect(css).toContain('@container dashboard-workspace (max-width: 720px)');
    expect(css).toContain('@container dashboard-workspace (max-width: 560px)');
    expect(css).toContain('container-name: detail-panel');
    expect(css).toContain('container-name: item-workspace');
  });

  it('uses compact-height density without reducing the typography scale', () => {
    expect(css).toContain('@media (max-height: 820px)');
    expect(css).not.toMatch(/@media \(max-height: 820px\)[\s\S]*?--font-scale:/);
    expect(css).not.toMatch(/@media \(max-height: (?:820|700)px\)[\s\S]*?\[data-all-library-working-canvas\][\s\S]*?height:/);
  });

  it('lets gallery copy and controls use distinct full-width card rows', () => {
    expect(css).toMatch(/data-content-view='gallery'\] \.ui-content-browser__entry \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?grid-template-rows: auto auto minmax\(0, 1fr\) auto;/);
    expect(css).toMatch(/data-content-view='gallery'\] \.ui-content-browser__leading \{[\s\S]*?grid-row: 1;/);
    expect(css).toMatch(/data-content-view='gallery'\] \.ui-content-browser__entry-title \{[\s\S]*?grid-row: 2;/);
    expect(css).toMatch(/data-content-view='gallery'\] \.ui-content-browser__subtitle \{[\s\S]*?grid-row: 3;/);
    expect(css).toMatch(/data-content-view='gallery'\] \.ui-content-browser__footer \{[\s\S]*?grid-row: 4;/);
    expect(css).not.toContain(".ui-content-browser__entry:has(.ui-content-browser__actions)");
  });

  it('gives shared list filters their own compact responsive row', () => {
    expect(css).toContain('.ui-list-quick-filter');
    expect(css).toContain('container-name: content-browser');
    expect(css).toMatch(/@container content-browser \(max-width: 520px\)[\s\S]*?\.ui-content-browser__quick-filter \{[\s\S]*?flex-basis: 100%;/);
  });

  it('keeps the compact Project view ribbon visually substantial', () => {
    expect(css).toMatch(/\[data-project-view-tabs\] \{[\s\S]*?flex: 1;/);
    expect(css).toMatch(/@container dashboard-workspace \(max-width: 1000px\)[\s\S]*?\[data-project-view-tabs\] \{[\s\S]*?min-height: 46px;/);
    expect(css).toMatch(/\[data-project-view-tabs\] \.ui-view-tab,[\s\S]*?min-height: 34px !important;/);
  });

  it('never trades Chrome-safe bottom clearance for compact density', () => {
    expect(css).toContain('--browser-footer-safe-clearance: calc(var(--browser-footer-clearance) + env(safe-area-inset-bottom, 0px))');
    expect(css).toContain('--scroll-footer-safe-bottom: calc(var(--browser-footer-clearance) + env(safe-area-inset-bottom, 0px))');
    expect(css).toMatch(/\.ui-dashboard-shell \{[\s\S]*?height: 100dvh;/);
    expect(css).not.toMatch(/\.ui-dashboard-shell \{[\s\S]*?padding-bottom: var\(--browser-footer-safe-clearance\);/);
    expect(css).not.toMatch(/\.ui-dashboard-shell__body \{[\s\S]*?padding-bottom: var\(--browser-footer-safe-clearance\);/);
    expect(css).toContain('--page-safe-bottom: calc(var(--page-bottom-clearance) + env(safe-area-inset-bottom, 0px))');
    expect(css).toMatch(/\.ui-scroll-footer-safe,\s*\.ui-home-overview \{[\s\S]*?padding-bottom: var\(--scroll-footer-safe-bottom\) !important;/);
    expect(css).toMatch(/\.ui-content-browser__body \{[\s\S]*?padding-bottom: var\(--scroll-footer-safe-bottom\);/);
    expect(css).toMatch(/\.ui-all-library-workspace \.ui-content-browser__body \{[\s\S]*?padding-bottom: var\(--space-md\);/);
    expect(css).toContain('--right-panel-width: min(var(--right-panel-user-width, 380px), 58vw);');
    expect(css).not.toMatch(/@media \(max-width: 1320px\)[\s\S]*?\.right-panel \{[\s\S]*?position: absolute;/);
    expect(css).not.toContain('padding-bottom: 56px !important');
    expect(css).not.toContain('padding: 12px var(--space-md) 56px !important');
  });

  it('keeps project navigation readable and expands the full browser on demand', () => {
    expect(css).toMatch(/\.ui-all-library-controlbar \{[\s\S]*?flex-direction: column;/);
    expect(css).toMatch(/\.ui-project-switcher__row \{[\s\S]*?min-height: 48px;/);
    expect(css).toMatch(/\.ui-project-switcher__quick-list \{[\s\S]*?overflow-x: auto;/);
    expect(css).toMatch(/\.ui-project-switcher__quick-project \{[\s\S]*?min-width: max-content;[\s\S]*?max-width: none;/);
    expect(css).toMatch(/\.ui-project-launcher__project-copy strong \{[\s\S]*?white-space: normal;/);
    expect(css).not.toContain('max-width: 190px');
    expect(css).toContain(".ui-project-switcher[data-expanded='true']");
    expect(css).toMatch(/\.ui-project-browser \{[\s\S]*?position: absolute;[\s\S]*?max-height: min\(360px, calc\(100dvh - 150px\)\);/);
    expect(css).toMatch(/\.ui-project-launcher__grid \{[\s\S]*?flex-direction: column;/);
  });

  it('consolidates compact Home and Project context chrome', () => {
    expect(css).toMatch(/\.ui-all-library-controlbar \{[\s\S]*?display: flex;/);
    expect(css).toMatch(/\.ui-home-title-tabs \{[\s\S]*?display: inline-flex;/);
    expect(css).toMatch(/\.ui-home-context-bar \{[\s\S]*?min-height: 44px;/);
    expect(css).toMatch(/@container dashboard-workspace \(max-width: 1000px\)[\s\S]*?\.ui-project-page-header \{[\s\S]*?display: none !important;/);
    expect(css).toMatch(/\.ui-project-workspace-actions \{[\s\S]*?display: inline-flex;/);
  });

  it('switches browse/detail canvases one pane at a time when narrow', () => {
    expect(css).toMatch(/@container dashboard-workspace \(max-width: 560px\)[\s\S]*?\.ui-adaptive-browser \{/);
    expect(css).toContain(".ui-adaptive-browser[data-detail-open='false'] > :nth-child(2)");
    expect(css).toContain(".ui-adaptive-browser[data-detail-open='true'] > :first-child");
    expect(css).toContain('.ui-adaptive-detail-back');
  });

  it('adapts item details to their pane width instead of the viewport', () => {
    expect(css).toContain('@container detail-panel (max-width: 620px)');
    expect(css).toContain('@container item-workspace (max-width: 640px)');
    expect(css).toMatch(/@container item-workspace \(max-width: 640px\)[\s\S]*?\.ui-organization-editor__destination-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important;/);
    expect(css).toMatch(/@container detail-panel \(max-width: 620px\)[\s\S]*?\.ui-detail-panel__body \{[\s\S]*?padding: 14px !important;/);
  });

  it('keeps the resizable Inspector in layout flow and caps it on narrow screens', () => {
    expect(css).toContain('@media (max-width: 1320px)');
    expect(css).toContain('--right-panel-width: min(var(--right-panel-user-width, 380px), 58vw);');
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.right-panel \{[\s\S]*?clamp\(220px, 34vw, 280px\)/);
    expect(css).not.toMatch(/@media \(max-width: 1320px\)[\s\S]*?\.right-panel \{[\s\S]*?position: absolute;/);
  });
});
