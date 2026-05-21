/**
 * Pattern analysis for batch fetch experiment results.
 */

const BOILERPLATE_RE =
  /cookie|sign in|log in|subscribe|paywall|captcha|accept all|consent|people on x|just a moment|something went wrong/i;

export function analyzeResults(results, providerNames) {
  const lines = [];
  const push = (s = '') => lines.push(s);

  push('# Fetch experiment analysis');
  push('');
  push(`URLs tested: **${results.length}**`);
  push(`Providers: **${providerNames.join(', ')}**`);
  push('');

  // Provider success rates
  push('## Provider success rates');
  push('');
  push('| Provider | usable | ok (http) | avg bytes | avg ms |');
  push('|----------|--------|-----------|-----------|--------|');

  for (const name of providerNames) {
    const rows = results.flatMap((r) => r.attempts.filter((a) => a.provider === name));
    const usable = rows.filter((a) => a.usable).length;
    const ok = rows.filter((a) => a.ok).length;
    const avgBytes = avg(rows.map((a) => a.bytes || 0));
    const avgMs = avg(rows.map((a) => a.ms || 0));
    push(`| ${name} | ${usable}/${results.length} | ${ok}/${results.length} | ${Math.round(avgBytes)} | ${Math.round(avgMs)} |`);
  }
  push('');

  // Failure reasons
  push('## Failure reasons (by provider)');
  push('');
  for (const name of providerNames) {
    const reasons = countBy(
      results.flatMap((r) => r.attempts.filter((a) => a.provider === name && !a.usable)),
      (a) => a.blockedBy || a.reason || a.error || 'unknown'
    );
    push(`### ${name}`);
    if (Object.keys(reasons).length === 0) push('- (none — all usable)');
    else for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) push(`- ${k}: ${v}`);
    push('');
  }

  // Agreement matrix
  push('## Provider agreement');
  push('');
  push('How often providers agree on **usable** for the same URL:');
  push('');
  let allAgree = 0;
  let noneUsable = 0;
  let split = 0;
  const winnerCounts = {};

  for (const r of results) {
    const usable = r.attempts.filter((a) => providerNames.includes(a.provider) && a.usable);
    if (usable.length === 0) noneUsable++;
    else if (usable.length === providerNames.length) allAgree++;
    else split++;

    if (usable.length > 0) {
      const best = usable.sort((a, b) => (b.bytes || 0) - (a.bytes || 0))[0];
      winnerCounts[best.provider] = (winnerCounts[best.provider] || 0) + 1;
    }
  }
  push(`- All core providers usable: **${allAgree}** URLs`);
  push(`- Split (some usable, some not): **${split}** URLs`);
  push(`- None usable: **${noneUsable}** URLs`);
  push('');
  push('Largest usable snippet wins (rough tie-break):');
  for (const [p, n] of Object.entries(winnerCounts).sort((a, b) => b[1] - a[1])) {
    push(`- ${p}: ${n} URLs`);
  }
  push('');

  // By source kind
  push('## By source kind');
  push('');
  const kinds = countBy(results, (r) => r.sourceKind);
  for (const [k, v] of Object.entries(kinds)) {
    push(`- **${k}**: ${v} URLs`);
  }
  push('');

  // Boilerplate in "usable" results
  push('## Boilerplate in usable snippets');
  push('');
  push('Usable fetches whose snippet preview still matches cookie/login/consent patterns:');
  push('');
  let boilerplateHits = 0;
  for (const r of results) {
    for (const a of r.attempts) {
      const snippetText = a.parsed?.snippet || a.diagnosis?.detail || '';
      if (!a.usable || !snippetText) continue;
      if (BOILERPLATE_RE.test(snippetText)) {
        boilerplateHits++;
        push(`- **${a.provider}** · ${r.host} · ${r.url.slice(0, 60)}…`);
        push(`  \`${snippetText.slice(0, 100).replace(/\n/g, ' ')}…\``);
      }
    }
  }
  if (boilerplateHits === 0) push('- (none detected in preview)');
  push('');

  // Per-URL table
  push('## Per-URL summary');
  push('');
  push('| Host | Kind | ' + providerNames.map((p) => p).join(' | ') + ' |');
  push('|------|------|' + providerNames.map(() => '---').join('|') + '|');

  for (const r of results) {
    const cells = providerNames.map((name) => {
      const a = r.attempts.find((x) => x.provider === name);
      if (!a) return '—';
      if (a.usable) return `✓ ${a.bytes}b`;
      return `✗ ${a.reason || 'fail'}`;
    });
    push(`| ${r.host.slice(0, 24)} | ${r.sourceKind} | ${cells.join(' | ')} |`);
  }
  push('');

  // Patterns / recommendations
  push('## Detected patterns (for pipeline design)');
  push('');
  for (const tip of detectPatterns(results, providerNames)) push(tip);
  push('');

  return lines.join('\n');
}

function detectPatterns(results, providerNames) {
  const tips = [];

  const localOnly = results.filter((r) => {
    const u = (p) => r.attempts.find((a) => a.provider === p)?.usable;
    return u('local') && !u('tab') && !u('jina');
  }).length;
  const tabBeatsLocal = results.filter((r) => {
    const u = (p) => r.attempts.find((a) => a.provider === p)?.usable;
    return u('tab') && !u('local');
  }).length;
  const jinaSaves = results.filter((r) => {
    const u = (p) => r.attempts.find((a) => a.provider === p)?.usable;
    return u('jina') && !u('local') && !u('tab');
  }).length;

  tips.push(`1. **Local-only success**: ${localOnly} URLs — static HTML or special APIs (X CDN) suffice.`);
  tips.push(`2. **Tab beats local**: ${tabBeatsLocal} URLs — JS-rendered content; tab provider adds value.`);
  tips.push(`3. **Jina rescue**: ${jinaSaves} URLs — remote fetch when local+tab fail.`);
  tips.push('4. **Cookie/consent false positives**: check boilerplate section — penalize snippets dominated by consent copy, not whole-page cookie keyword bans.');
  tips.push('5. **X status URLs**: compare local (Twitter CDN) vs tab (often cookie modal) vs jina (noisy but complete).');
  tips.push('6. **Do not LLM-gate every fetch** — use mechanical scores first; LLM only when providers disagree or boilerplate score is high.');

  return tips;
}

function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function countBy(arr, fn) {
  const m = {};
  for (const x of arr) {
    const k = fn(x);
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}
