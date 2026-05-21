# Fetch experiment analysis

URLs tested: **2**
Providers: **local, tab, jina, markdown-new**

## Provider success rates

| Provider | usable | ok (http) | avg bytes | avg ms |
|----------|--------|-----------|-----------|--------|
| local | 1/2 | 1/2 | 277 | 1144 |
| tab | 0/2 | 0/2 | 0 | 183 |
| jina | 1/2 | 1/2 | 416 | 586 |
| markdown-new | 0/2 | 0/2 | 0 | 328 |

## Failure reasons (by provider)

### local
- parse_empty: 1

### tab
- provider_error: 2

### jina
- provider_error: 1

### markdown-new
- provider_error: 2

## Provider agreement

How often providers agree on **usable** for the same URL:

- All core providers usable: **0** URLs
- Split (some usable, some not): **1** URLs
- None usable: **1** URLs

Largest usable snippet wins (rough tie-break):
- jina: 1 URLs

## By source kind

- **x**: 1 URLs
- **article**: 1 URLs

## Boilerplate in usable snippets

Usable fetches whose snippet preview still matches cookie/login/consent patterns:

- (none detected in preview)

## Per-URL summary

| Host | Kind | local | tab | jina | markdown-new |
|------|------|---|---|---|---|
| x.com | x | ✓ 211b | ✗ provider_error | ✓ 832b | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ provider_error | ✗ provider_error | ✗ provider_error |

## Detected patterns (for pipeline design)

1. **Local-only success**: 0 URLs — static HTML or special APIs (X CDN) suffice.
2. **Tab beats local**: 0 URLs — JS-rendered content; tab provider adds value.
3. **Jina rescue**: 0 URLs — remote fetch when local+tab fail.
4. **Cookie/consent false positives**: check boilerplate section — penalize snippets dominated by consent copy, not whole-page cookie keyword bans.
5. **X status URLs**: compare local (Twitter CDN) vs tab (often cookie modal) vs jina (noisy but complete).
6. **Do not LLM-gate every fetch** — use mechanical scores first; LLM only when providers disagree or boilerplate score is high.
