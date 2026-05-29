import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const BOILERPLATE_RE =
  /cookie|sign in|log in|subscribe|paywall|captcha|accept all|consent|people on x|just a moment|something went wrong/i;

export function loadExperimentResults(experimentDir) {
  const jsonlPath = join(experimentDir, 'results.jsonl');
  if (!existsSync(jsonlPath)) throw new Error(`Missing ${jsonlPath}`);
  return readFileSync(jsonlPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function readBody(experimentDir, attempt) {
  if (attempt.parsed?.snippet?.trim()) {
    return attempt.parsed.snippet;
  }
  const rel = attempt.files?.markdown;
  if (rel && existsSync(join(experimentDir, rel))) {
    return readFileSync(join(experimentDir, rel), 'utf8');
  }
  const preview = attempt.files?.preview;
  if (preview && existsSync(join(experimentDir, preview))) {
    return readFileSync(join(experimentDir, preview), 'utf8');
  }
  const detail = attempt.diagnosis?.detail;
  if (detail) return detail;
  if (attempt.error) return attempt.error;
  return '';
}

function usableProviders(attempts, providerNames) {
  return attempts
    .filter((a) => providerNames.includes(a.provider) && a.usable)
    .map((a) => a.provider);
}

function maxUsableBytes(attempts, providerNames) {
  return Math.max(
    0,
    ...attempts
      .filter((a) => providerNames.includes(a.provider) && a.usable)
      .map((a) => a.bytes || 0)
  );
}

function hasBoilerplateHit(attempt) {
  const text = attempt.parsed?.snippet || attempt.diagnosis?.detail || '';
  return attempt.usable && text && BOILERPLATE_RE.test(text);
}

/**
 * Build one judge row per URL with all provider bodies.
 */
export function buildUrlJudgeCandidates(results, experimentDir, { providers }) {
  const candidates = [];

  for (const row of results) {
    const providerRows = [];
    let regexAnyUsable = false;

    for (const attempt of row.attempts) {
      if (!providers.includes(attempt.provider)) continue;
      if (attempt.reason === 'excluded' || attempt.errorCode === 'excluded') continue;

      const body = readBody(experimentDir, attempt);
      const regexUsable = Boolean(attempt.usable);
      if (regexUsable) regexAnyUsable = true;

      providerRows.push({
        name: attempt.provider,
        regexUsable,
        regexReason: attempt.reason || attempt.blockedBy || attempt.diagnosis?.reason,
        bytes: attempt.bytes || 0,
        title: attempt.parsed?.title || attempt.title || '',
        body,
        error: attempt.error || '',
      });
    }

    if (providerRows.length === 0) continue;

    candidates.push({
      id: row.bodyDir,
      url: row.url,
      host: row.host,
      sourceKind: row.sourceKind,
      bodyDir: row.bodyDir,
      regexAnyUsable,
      providers: providerRows,
    });
  }

  return candidates;
}

/**
 * Build judge candidate rows from experiment results (one row per provider attempt).
 * @param {'all'|'edge'} mode - all attempts with body or usable; edge = filtered triggers only
 */
export function buildJudgeCandidates(results, experimentDir, { mode = 'edge', providers }) {
  const candidates = [];

  for (const row of results) {
    const usableList = usableProviders(row.attempts, providers);
    const noneUsable = usableList.length === 0;
    const split = usableList.length > 0 && usableList.length < providers.filter((p) => p !== 'syndication' || row.sourceKind === 'x').length;

    for (const attempt of row.attempts) {
      if (!providers.includes(attempt.provider)) continue;
      if (attempt.reason === 'excluded' || attempt.errorCode === 'excluded') continue;

      const body = readBody(experimentDir, attempt);
      const hasBody = body.trim().length >= 20;
      const boilerplate = hasBoilerplateHit(attempt);

      let include = false;
      let trigger = 'all';

      if (mode === 'all') {
        include = hasBody || attempt.usable || noneUsable;
        trigger = 'all';
      } else {
        if (split && attempt.usable !== undefined) {
          include = true;
          trigger = 'provider_split';
        }
        if (boilerplate) {
          include = true;
          trigger = 'boilerplate_usable';
        }
        if (noneUsable) {
          include = true;
          trigger = 'none_usable';
        }
        const tab = row.attempts.find((a) => a.provider === 'tab');
        const jina = row.attempts.find((a) => a.provider === 'jina');
        if (tab?.usable && jina?.usable) {
          const d = Math.abs((tab.bytes || 0) - (jina.bytes || 0));
          if (d > 5000 && (attempt.provider === 'tab' || attempt.provider === 'jina')) {
            include = true;
            trigger = 'length_mismatch';
          }
        }
      }

      if (!include) continue;
      if (!hasBody && !attempt.usable && !noneUsable) continue;

      candidates.push({
        id: `${row.bodyDir}/${attempt.provider}`,
        url: row.url,
        host: row.host,
        sourceKind: row.sourceKind,
        bodyDir: row.bodyDir,
        provider: attempt.provider,
        regexUsable: Boolean(attempt.usable),
        regexReason: attempt.reason || attempt.blockedBy || attempt.diagnosis?.reason,
        regexBytes: attempt.bytes || 0,
        title: attempt.parsed?.title || attempt.title || '',
        body,
        trigger,
        boilerplateRegexHit: boilerplate,
      });
    }
  }

  return candidates;
}

export function aggregateUrlJudgeResults(rows) {
  let judged = 0;
  let regexOk = 0;
  let judgeOk = 0;
  let disagreements = 0;
  const bucketCounts = {};
  const bestProviderCounts = {};
  const failureExamples = [];
  const fpExamples = [];

  for (const r of rows) {
    if (r.status !== 'ok' || !r.judge) continue;
    judged++;
    if (r.regexAnyUsable) regexOk++;
    if (r.judge.usableForEnrichment) judgeOk++;

    const agree = r.regexAnyUsable === r.judge.usableForEnrichment;
    if (!agree) {
      disagreements++;
      if (r.regexAnyUsable && !r.judge.usableForEnrichment && fpExamples.length < 40) {
        fpExamples.push({
          host: r.host,
          url: r.url.slice(0, 90),
          expected: r.judge.expectedContent?.slice(0, 120),
          wrong: r.judge.whatWentWrong,
          bucket: r.judge.failureBucket,
        });
      }
    }

    const b = r.judge.failureBucket || 'unknown';
    bucketCounts[b] = (bucketCounts[b] || 0) + 1;

    if (r.judge.bestProvider) {
      bestProviderCounts[r.judge.bestProvider] = (bestProviderCounts[r.judge.bestProvider] || 0) + 1;
    }

    if (!r.judge.usableForEnrichment && failureExamples.length < 40) {
      failureExamples.push({
        host: r.host,
        url: r.url.slice(0, 90),
        expected: r.judge.expectedContent?.slice(0, 120),
        wrong: r.judge.whatWentWrong,
        bucket: r.judge.failureBucket,
      });
    }
  }

  return {
    judged,
    regexOk,
    judgeOk,
    disagreements,
    falsePositives: fpExamples.length,
    bucketCounts,
    bestProviderCounts,
    fpExamples,
    failureExamples,
  };
}

export function buildUrlJudgeMarkdown({ experimentDir, scope, metrics, candidateCount }) {
  const lines = [
    '# Fetch LLM judge report (URL-level)',
    '',
    `- Experiment: \`${experimentDir}\``,
    `- Scope: **${scope}** — one judgment per URL (expected content vs actual fetches)`,
    `- URLs judged: ${metrics.judged} / ${candidateCount}`,
    '',
    '## Overall (URL-level)',
    '',
    '| Metric | Regex (any provider) | LLM judge |',
    '|--------|---------------------|-----------|',
    `| Usable for enrichment | **${metrics.regexOk}** | **${metrics.judgeOk}** |`,
    `| Rate | ${candidateCount ? ((100 * metrics.regexOk) / candidateCount).toFixed(1) : 0}% | ${candidateCount ? ((100 * metrics.judgeOk) / candidateCount).toFixed(1) : 0}% |`,
    '',
    `Disagreements (regex ok ↔ judge rejects): **${metrics.disagreements}**`,
    '',
    '## Failure buckets (judge)',
    '',
  ];

  for (const [b, n] of Object.entries(metrics.bucketCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${b}**: ${n}`);
  }

  lines.push('', '## Best provider (judge pick)', '');
  for (const [p, n] of Object.entries(metrics.bestProviderCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${p}**: ${n}`);
  }

  lines.push('', '## False positives (regex said ok, judge rejected)', '');
  if (metrics.fpExamples.length === 0) lines.push('- (none)');
  else {
    for (const ex of metrics.fpExamples) {
      lines.push(`- **${ex.host}** · \`${ex.bucket}\``);
      lines.push(`  Expected: ${ex.expected}`);
      lines.push(`  Wrong: ${ex.wrong}`);
      lines.push(`  ${ex.url}`);
    }
  }

  lines.push('', '## Failures (judge: not usable)', '');
  if (metrics.failureExamples.length === 0) lines.push('- (none)');
  else {
    for (const ex of metrics.failureExamples.slice(0, 25)) {
      lines.push(`- **${ex.host}** · \`${ex.bucket}\` — ${ex.wrong || '?'}`);
      lines.push(`  Expected: ${ex.expected}`);
    }
  }

  lines.push('', '## Next steps', '');
  lines.push('- **cookie_noise / login_wall** → D10.3 tab-profile or D10.5 extension tab');
  lines.push('- **thin_content (X)** → D10.6 thread expand');
  lines.push('- **bot_blocked / provider_gap** → D10.4 fail-fast + host rules');
  lines.push('- **false positives** → tighten mechanical `fetchQuality` gates');
  lines.push('');

  return lines.join('\n');
}

export function aggregateJudgeResults(rows) {
  const byProvider = {};
  let judged = 0;
  let disagreements = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  const fpExamples = [];
  const bucketCounts = {};
  const kindCounts = {};

  for (const r of rows) {
    if (r.status !== 'ok' || !r.judge) continue;
    judged++;
    const p = r.provider;
    if (!byProvider[p]) {
      byProvider[p] = { judged: 0, regexUsable: 0, judgeUsable: 0, disagree: 0, fp: 0, fn: 0 };
    }
    byProvider[p].judged++;
    if (r.regexUsable) byProvider[p].regexUsable++;
    if (r.judge.usableForEnrichment) byProvider[p].judgeUsable++;

    const agree = r.regexUsable === r.judge.usableForEnrichment;
    if (!agree) {
      disagreements++;
      byProvider[p].disagree++;
      if (r.regexUsable && !r.judge.usableForEnrichment) {
        falsePositives++;
        byProvider[p].fp++;
        if (fpExamples.length < 30) {
          fpExamples.push({
            host: r.host,
            provider: r.provider,
            bucket: r.judge.failureBucket,
            notes: r.judge.notes,
            url: r.url.slice(0, 80),
          });
        }
      }
      if (!r.regexUsable && r.judge.usableForEnrichment) {
        falseNegatives++;
        byProvider[p].fn++;
      }
    }

    const b = r.judge.failureBucket || 'unknown';
    bucketCounts[b] = (bucketCounts[b] || 0) + 1;
    const k = r.judge.contentKind || 'other';
    kindCounts[k] = (kindCounts[k] || 0) + 1;
  }

  return {
    judged,
    disagreements,
    falsePositives,
    falseNegatives,
    byProvider,
    bucketCounts,
    kindCounts,
    fpExamples,
  };
}

export function buildJudgeMarkdown({ experimentDir, mode, metrics, providers, candidateCount }) {
  const lines = [
    '# Fetch LLM judge report',
    '',
    `- Experiment: \`${experimentDir}\``,
    `- Mode: **${mode}**`,
    `- Providers: ${providers.join(', ')}`,
    `- Candidates: ${candidateCount}`,
    `- Judged (ok): ${metrics.judged}`,
    '',
    '## Regex vs judge',
    '',
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Disagreements | **${metrics.disagreements}** |`,
    `| False positives (regex usable, judge not) | **${metrics.falsePositives}** |`,
    `| False negatives (regex fail, judge usable) | **${metrics.falseNegatives}** |`,
    '',
    '## By provider',
    '',
    '| Provider | judged | regex usable | judge usable | FP | FN |',
    '|----------|--------|--------------|--------------|----|----|',
  ];

  for (const p of providers) {
    const s = metrics.byProvider[p];
    if (!s) continue;
    lines.push(`| ${p} | ${s.judged} | ${s.regexUsable} | ${s.judgeUsable} | ${s.fp} | ${s.fn} |`);
  }

  lines.push('', '## Judge failure buckets', '');
  for (const [b, n] of Object.entries(metrics.bucketCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${b}**: ${n}`);
  }

  lines.push('', '## Content kinds', '');
  for (const [k, n] of Object.entries(metrics.kindCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${k}**: ${n}`);
  }

  lines.push('', '## False positive examples (regex usable → judge rejected)', '');
  if (metrics.fpExamples.length === 0) {
    lines.push('- (none)');
  } else {
    for (const ex of metrics.fpExamples) {
      lines.push(`- **${ex.provider}** · ${ex.host} · \`${ex.bucket}\` — ${ex.notes}`);
      lines.push(`  ${ex.url}`);
    }
  }

  lines.push('', '## Implications for D10.4 / D10.6', '');
  lines.push('- **False positives** → tighten `fetchQuality` / boilerplate scoring; don’t trust byte count alone');
  lines.push('- **thin_content on X** → D10.6 thread expand');
  lines.push('- **cookie_noise / login_wall** → auth or tab path (D10.3/D10.5)');
  lines.push('- **bot_block** → fail-fast host list (Reddit, etc.)');
  lines.push('');

  return lines.join('\n');
}
