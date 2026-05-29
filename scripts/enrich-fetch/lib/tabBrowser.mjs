/**
 * CLI stand-in for extension "open tab + content script" enrichment.
 * Uses Playwright to load the page with JS, then Readability on rendered HTML.
 *
 * Logged-in sites: use a persistent profile dir (log in once):
 *   npm run fetch-test -- --tab-profile ./.fetch-test-browser "https://medium.com/..."
 */

import { existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { htmlToMarkdown } from './htmlExtract.mjs';
import { stripProviderWrapper } from './fetchQuality.mjs';

const TIMEOUT_MS = 30_000;

const defaultOptions = {
  headed: false,
  userDataDir: null,
  /** Use installed Google Chrome when a persistent profile is set (matches login session). */
  channel: null,
  /** Extra wait after domcontentloaded for lazy JS */
  settleMs: 2500,
};

let tabOptions = { ...defaultOptions };

export function setTabBrowserOptions(opts) {
  tabOptions = { ...defaultOptions, ...opts };
}

export function getTabBrowserOptions() {
  return { ...tabOptions };
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return null;
  }
}

/** Cursor sandbox sets PLAYWRIGHT_BROWSERS_PATH to a temp dir that often has no binaries. */
function resolvePlaywrightBrowsersPath() {
  const custom = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const defaultDir = join(homedir(), 'Library', 'Caches', 'ms-playwright');

  const hasChromium = (dir) => {
    if (!existsSync(dir)) return false;
    try {
      return readdirSync(dir).some((name) => name.startsWith('chromium'));
    } catch {
      return false;
    }
  };

  if (custom && hasChromium(custom)) return custom;
  if (hasChromium(defaultDir)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = defaultDir;
    return defaultDir;
  }
  if (custom) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  return null;
}

function classifyTabLaunchError(msg) {
  if (/executable doesn't exist|playwright install/i.test(msg)) {
    return {
      errorCode: 'provider_error',
      error: 'Chromium not installed for Playwright. Run: npx playwright install chromium',
    };
  }
  if (/timeout/i.test(msg)) return { errorCode: 'timeout', error: msg };
  return { errorCode: 'network', error: msg };
}

export async function fetchViaBrowserTab(url) {
  resolvePlaywrightBrowsersPath();

  const pw = await loadPlaywright();
  if (!pw) {
    return {
      ok: false,
      id: 'tab',
      errorCode: 'provider_error',
      error:
        'playwright not installed. Run: npm install -D playwright && npx playwright install chromium',
    };
  }

  const { chromium } = pw;
  const headless = !tabOptions.headed;
  let browser;
  let context;
  let ownsBrowser = false;

  try {
    if (tabOptions.userDataDir) {
      const launchOpts = {
        headless,
        viewport: { width: 1280, height: 900 },
        args: ['--disable-blink-features=AutomationControlled'],
      };
      const channel = tabOptions.channel || 'chrome';
      try {
        context = await chromium.launchPersistentContext(tabOptions.userDataDir, {
          ...launchOpts,
          channel,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (channel && /channel|chrome/i.test(msg)) {
          context = await chromium.launchPersistentContext(tabOptions.userDataDir, launchOpts);
        } else {
          throw e;
        }
      }
    } else {
      browser = await chromium.launch({ headless });
      ownsBrowser = true;
      context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
    }

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

    if (tabOptions.settleMs > 0) {
      await page.waitForTimeout(tabOptions.settleMs);
    }

    const html = await page.content();
    const parsed = htmlToMarkdown(html, url);
    if (!parsed) {
      return {
        ok: false,
        id: 'tab',
        fetchSourceId: 'tab',
        errorCode: 'parse_empty',
        rawBytes: html.length,
        preview: html.slice(0, 400),
        error: 'Readability found no article in rendered page',
      };
    }

    const markdown = stripProviderWrapper(parsed.markdown);
    return {
      ok: true,
      id: 'tab',
      fetchSourceId: 'tab',
      markdown,
      title: parsed.title,
      rawBytes: markdown.length,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const { errorCode, error } = classifyTabLaunchError(msg);
    return { ok: false, id: 'tab', fetchSourceId: 'tab', errorCode, error };
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    if (ownsBrowser && browser) {
      await browser.close().catch(() => {});
    }
  }
}
