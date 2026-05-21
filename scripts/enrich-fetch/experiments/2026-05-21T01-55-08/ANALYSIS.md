# Fetch experiment analysis

URLs tested: **2**
Providers: **local, tab, jina, markdown-new**

## Provider success rates

| Provider | usable | ok (http) | avg bytes | avg ms |
|----------|--------|-----------|-----------|--------|
| local | 1/2 | 1/2 | 277 | 868 |
| tab | 1/2 | 2/2 | 246 | 7112 |
| jina | 1/2 | 1/2 | 416 | 822 |
| markdown-new | 0/2 | 0/2 | 0 | 516 |

## Failure reasons (by provider)

### local
- parse_empty: 1

### tab
- weak_title: 1

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

- **tab** · x.com · https://x.com/QingQ77/status/2053112502842544285…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`

## Per-URL summary

| Host | Kind | local | tab | jina | markdown-new |
|------|------|---|---|---|---|
| x.com | x | ✓ 211b | ✓ 246b | ✓ 832b | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ provider_error | ✗ provider_error |

## Detected patterns (for pipeline design)

1. **Local-only success**: 0 URLs — static HTML or special APIs (X CDN) suffice.
2. **Tab beats local**: 0 URLs — JS-rendered content; tab provider adds value.
3. **Jina rescue**: 0 URLs — remote fetch when local+tab fail.
4. **Cookie/consent false positives**: check boilerplate section — penalize snippets dominated by consent copy, not whole-page cookie keyword bans.
5. **X status URLs**: compare local (Twitter CDN) vs tab (often cookie modal) vs jina (noisy but complete).
6. **Do not LLM-gate every fetch** — use mechanical scores first; LLM only when providers disagree or boilerplate score is high.
