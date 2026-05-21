#!/usr/bin/env node
/**
 * CLI fetch/enrich tester — runs ALL providers by default so you can compare outputs.
 *
 * Usage:
 *   npm run fetch-test -- "https://..."
 *   cat urls.txt | npm run fetch-test
 *
 * Options:
 *   --provider all|local|tab|jina|markdown-new|syndication|hybrid  (default: all)
 *   --no-tab          skip Playwright tab provider (faster)
 *   --tab-headed      show browser window for tab provider
 *   --tab-profile DIR persistent browser profile (cookies / login)
 *   --quiet           summary only, no full provider dumps
 *   --notes "text"    simulate bookmark notes (snippetIsUseful check)
 *   --json            JSON lines output
 *   --raw             print hybrid winner markdown after summary
 */

import { classifySourceKind, parseFetchedContent, snippetIsUseful } from './lib/parse.mjs';
import { PROVIDERS, diagnoseResult, fetchAllProviders, fetchHybrid, setProviderRunOptions } from './lib/providers.mjs';
import { setTabBrowserOptions } from './lib/tabBrowser.mjs';

const DEBUG_MAX_CHARS = 20_000;

function usage() {
  console.error(`Usage: fetch-test.mjs [options] [url...]

Default: run local, tab (Playwright), jina, markdown-new, syndication (X) for every URL.
Use --no-tab to skip slow browser step. Use --tab-profile ./.fetch-browser to keep logins.`);
}

function parseArgs(argv) {
  const opts = {
    provider: 'all',
    json: false,
    quiet: false,
    raw: false,
    notes: '',
    noTab: false,
    tabHeaded: false,
    tabProfile: null,
    urls: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--json') opts.json = true;
    else if (arg === '--quiet') opts.quiet = true;
    else if (arg === '--raw') opts.raw = true;
    else if (arg === '--no-tab') opts.noTab = true;
    else if (arg === '--tab-headed') opts.tabHeaded = true;
    else if (arg === '--tab-profile') opts.tabProfile = argv[++i] || null;
    else if (arg === '--debug' || arg === '--debug-all') {
      /* legacy flags — debug is now default unless --quiet */
    }
    else if (arg === '--provider') opts.provider = argv[++i] || 'all';
    else if (arg === '--notes') opts.notes = argv[++i] || '';
    else if (arg.startsWith('http://') || arg.startsWith('https://')) opts.urls.push(arg);
    else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`);
      usage();
      process.exit(1);
    } else {
      opts.urls.push(arg);
    }
  }

  return opts;
}

async function readStdinUrls(hasArgUrls) {
  if (hasArgUrls || process.stdin.isTTY) return [];
  const text = await new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (buf += c));
    process.stdin.on('end', () => resolve(buf));
  });
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function attachProviderDebug(result, sourceKind, localBundle) {
  const diagnosis = diagnoseResult(result);
  const body = result.markdown || result.preview || result.error || '';
  let parsed;
  if (result.ok && result.markdown) {
    parsed = parseFetchedContent(result.markdown, sourceKind, result.title);
    parsed.useful = diagnosis.usable && snippetIsUseful(parsed.snippet, localBundle);
  }
  return {
    provider: result.id,
    ok: result.ok,
    ...diagnosis,
    title: result.title,
    body: typeof body === 'string' ? body : String(body),
    parsed: parsed
      ? {
          title: parsed.title,
          snippetLen: parsed.snippet.length,
          snippet: parsed.snippet,
          useful: parsed.useful,
        }
      : undefined,
  };
}

function pickHybridWinner(attempts, sourceKind, localBundle) {
  for (const a of attempts) {
    const d = a.diagnosis ?? diagnoseResult(a);
    if (!d.usable || !a.markdown) continue;
    const parsed = parseFetchedContent(a.markdown, sourceKind, a.title);
    if (snippetIsUseful(parsed.snippet, localBundle)) {
      return { result: a, parsed, status: 'ok' };
    }
  }
  const last = attempts[attempts.length - 1];
  const d = last?.diagnosis ?? diagnoseResult(last ?? { ok: false, id: 'none' });
  return {
    result: last,
    parsed: last?.markdown ? parseFetchedContent(last.markdown, sourceKind, last.title) : null,
    status: 'failed',
    errorCode: d.reason || last?.errorCode || 'provider_error',
  };
}

function buildReportFromAll(url, sourceKind, localBundle, run, opts) {
  const debugProviders = run.attempts.map((a) => attachProviderDebug(a, sourceKind, localBundle));
  const hybridPick = pickHybridWinner(run.attempts, sourceKind, localBundle);
  const winner = hybridPick.result ?? run.winner;

  return {
    url,
    sourceKind,
    status: hybridPick.status,
    errorCode: hybridPick.status === 'failed' ? hybridPick.errorCode : undefined,
    provider: 'all',
    fetchSourceId: winner?.fetchSourceId || winner?.id,
    hybridWouldPick: winner?.id,
    attempts: debugProviders.map((d) => ({
      provider: d.provider,
      ok: d.ok,
      usable: d.usable,
      reason: d.reason,
      blockedBy: d.blockedBy,
      bytes: d.bytes,
    })),
    parsed: hybridPick.parsed
      ? {
          title: hybridPick.parsed.title,
          snippetLen: hybridPick.parsed.snippet.length,
          summary: hybridPick.parsed.summary.slice(0, 400),
          snippetPreview: hybridPick.parsed.snippet.slice(0, 500),
          useful: hybridPick.status === 'ok',
        }
      : null,
    rawBytes: winner?.rawBytes ?? winner?.markdown?.length ?? 0,
    debugProviders,
    markdown: opts.raw && winner?.markdown ? winner.markdown : undefined,
  };
}

async function evaluateUrl(url, opts) {
  const sourceKind = classifySourceKind(url);
  const localBundle = opts.notes.trim();

  if (opts.provider === 'all') {
    const run = await fetchAllProviders(url);
    return buildReportFromAll(url, sourceKind, localBundle, run, opts);
  }

  if (opts.provider === 'hybrid') {
    const hybrid = await fetchHybrid(url);
    const report = buildReportFromAll(url, sourceKind, localBundle, hybrid, opts);
    report.provider = 'hybrid';
    report.hybridWouldPick = hybrid.winner?.id;
    return report;
  }

  const fn = PROVIDERS[opts.provider];
  if (!fn) throw new Error(`Unknown provider: ${opts.provider}`);
  const fetchResult = await fn(url);
  const debug = attachProviderDebug(fetchResult, sourceKind, localBundle);
  const report = buildReportFromAll(
    url,
    sourceKind,
    localBundle,
    { attempts: [fetchResult], winner: fetchResult, ok: debug.usable },
    opts
  );
  report.provider = opts.provider;
  report.debugProviders = [debug];
  return report;
}

function clipDebugBody(text) {
  if (!text) return '';
  if (text.length <= DEBUG_MAX_CHARS) return text;
  return `${text.slice(0, DEBUG_MAX_CHARS)}\n\n… [truncated at ${DEBUG_MAX_CHARS} chars, total ${text.length}]`;
}

function printDebugDumps(report) {
  if (!report.debugProviders?.length) return;

  console.log('\n' + '═'.repeat(72));
  console.log('ALL PROVIDERS — raw output');
  console.log('═'.repeat(72));

  for (const d of report.debugProviders) {
    console.log(`\n${'─'.repeat(72)}`);
    console.log(`▶ ${d.provider}`);
    console.log(`  http ok: ${d.ok ? 'yes' : 'no'}`);
    console.log(`  verdict: ${d.usable ? 'usable' : d.reason || 'fail'} (${d.bytes ?? 0} bytes)`);
    if (d.blockedBy) console.log(`  rejected because: ${d.blockedBy}`);
    if (d.detail && !d.ok) console.log(`  detail: ${String(d.detail).slice(0, 200)}`);
    if (d.title) console.log(`  title: ${d.title}`);
    if (d.parsed) {
      console.log(`  parsed snippet: ${d.parsed.snippetLen} chars · useful=${d.parsed.useful}`);
      if (d.parsed.snippet) {
        console.log('  --- parsed snippet ---');
        console.log(d.parsed.snippet.slice(0, 1200));
      }
    }
    console.log('  --- raw body ---');
    console.log(clipDebugBody(d.body) || '(empty)');
  }
}

function printHuman(report, opts) {
  console.log('\n' + '─'.repeat(72));
  console.log(report.url);
  console.log(
    `kind=${report.sourceKind} hybrid-would-pick=${report.hybridWouldPick ?? '?'} status=${report.status}${report.errorCode ? ` error=${report.errorCode}` : ''}`
  );

  if (report.attempts?.length) {
    console.log('all providers:');
    for (const a of report.attempts) {
      const tag = a.usable ? 'OK' : a.reason || 'fail';
      console.log(`  - ${a.provider}: ${tag} (${a.bytes} bytes)`);
      if (a.blockedBy) console.log(`      ↳ ${a.blockedBy}`);
    }
  }

  if (report.parsed) {
    console.log(`winner snippet: ${report.parsed.snippetLen} chars useful=${report.parsed.useful}`);
    if (report.parsed.title) console.log(`title: ${report.parsed.title}`);
    if (!opts.quiet && report.parsed.summary) console.log(`summary: ${report.parsed.summary}`);
  }

  if (report.markdown) {
    console.log('\n--- winner markdown ---\n');
    console.log(report.markdown);
  }

  if (!opts.quiet) printDebugDumps(report);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  setProviderRunOptions({ includeTab: !opts.noTab });
  setTabBrowserOptions({
    headed: opts.tabHeaded,
    userDataDir: opts.tabProfile,
  });

  const stdinUrls = await readStdinUrls(opts.urls.length > 0);
  const urls = [...opts.urls, ...stdinUrls];

  if (urls.length === 0) {
    usage();
    process.exit(1);
  }

  for (const url of urls) {
    try {
      const report = await evaluateUrl(url, opts);
      if (opts.json) {
        const out = { ...report };
        if (out.debugProviders) {
          out.debugProviders = out.debugProviders.map((d) => ({
            ...d,
            body: d.body?.length > DEBUG_MAX_CHARS ? d.body.slice(0, DEBUG_MAX_CHARS) + '…' : d.body,
          }));
        }
        console.log(JSON.stringify(out));
      } else {
        printHuman(report, opts);
      }
    } catch (e) {
      const err = { url, status: 'error', error: e instanceof Error ? e.message : String(e) };
      if (opts.json) console.log(JSON.stringify(err));
      else console.error('Error:', err.error, url);
      process.exitCode = 1;
    }
  }
}

main();
