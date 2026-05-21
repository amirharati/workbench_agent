import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

function urlDirName(index, host) {
  const safeHost = (host || 'unknown').replace(/[^a-z0-9.-]/gi, '-').slice(0, 48);
  return `${String(index + 1).padStart(3, '0')}-${safeHost}`;
}

function writeIfPresent(path, text) {
  if (text == null || text === '') return null;
  writeFileSync(path, typeof text === 'string' ? text : String(text));
  return path;
}

/**
 * Persist full provider outputs under outDir/bodies/<idx-host>/ for manual review.
 * Returns JSONL-safe attempt records with relative file paths + full parsed text.
 */
export function persistUrlResults(outDir, index, { url, host, sourceKind, attempts }) {
  const dirName = urlDirName(index, host);
  const absDir = join(outDir, 'bodies', dirName);
  mkdirSync(absDir, { recursive: true });
  writeFileSync(join(absDir, 'url.txt'), `${url}\n`);

  const relDir = `bodies/${dirName}`;
  const serializedAttempts = [];

  for (const a of attempts) {
    const provider = a.id;
    const files = {};

    if (a.markdown) {
      const rel = `${relDir}/${provider}.md`;
      writeFileSync(join(outDir, rel), a.markdown);
      files.markdown = rel;
    }
    if (a.preview) {
      const rel = `${relDir}/${provider}.preview.txt`;
      writeFileSync(join(outDir, rel), a.preview);
      files.preview = rel;
    }
    if (a.error) {
      const rel = `${relDir}/${provider}.error.txt`;
      writeFileSync(join(outDir, rel), a.error);
      files.error = rel;
    }
    if (a.diagnosis?.detail) {
      const rel = `${relDir}/${provider}.detail.txt`;
      writeIfPresent(join(outDir, rel), a.diagnosis.detail);
      files.detail = rel;
    }

    serializedAttempts.push({
      provider,
      ok: a.ok,
      usable: a.diagnosis?.usable ?? false,
      reason: a.diagnosis?.reason,
      blockedBy: a.diagnosis?.blockedBy,
      bytes: a.rawBytes ?? a.markdown?.length ?? a.diagnosis?.bytes ?? 0,
      ms: a.ms,
      title: a.title,
      error: a.error,
      files,
      parsed: a.parsed
        ? {
            title: a.parsed.title,
            snippetLen: a.parsed.snippet?.length ?? 0,
            snippet: a.parsed.snippet,
            summary: a.parsed.summary,
            quotedText: a.parsed.quotedText,
            quotedAuthor: a.parsed.quotedAuthor,
          }
        : null,
      diagnosis: a.diagnosis
        ? {
            reason: a.diagnosis.reason,
            blockedBy: a.diagnosis.blockedBy,
            detail: a.diagnosis.detail ?? null,
          }
        : null,
    });
  }

  writeFileSync(
    join(absDir, 'attempts.json'),
    JSON.stringify({ url, host, sourceKind, attempts: serializedAttempts }, null, 2)
  );

  return {
    url,
    host,
    sourceKind,
    bodyDir: relDir,
    attempts: serializedAttempts,
  };
}
