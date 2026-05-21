# Fetch experiment analysis

URLs tested: **2**
Providers: **local, tab, jina, markdown-new**

## Provider success rates

| Provider | usable | ok (http) | avg bytes | avg ms |
|----------|--------|-----------|-----------|--------|
| local | 2/2 | 2/2 | 7543 | 1336 |
| tab | 2/2 | 2/2 | 7543 | 5211 |
| jina | 2/2 | 2/2 | 7528 | 872 |
| markdown-new | 0/2 | 0/2 | 0 | 563 |

## Failure reasons (by provider)

### local
- (none — all usable)

### tab
- (none — all usable)

### jina
- (none — all usable)

### markdown-new
- provider_error: 2

## Provider agreement

How often providers agree on **usable** for the same URL:

- All core providers usable: **0** URLs
- Split (some usable, some not): **2** URLs
- None usable: **0** URLs

Largest usable snippet wins (rough tie-break):
- local: 2 URLs

## By source kind

- **article**: 2 URLs

## Boilerplate in usable snippets

Usable fetches whose snippet preview still matches cookie/login/consent patterns:

- (none detected in preview)

## Per-URL summary

| Host | Kind | local | tab | jina | markdown-new |
|------|------|---|---|---|---|
| example.com | article | ✓ 149b | ✓ 149b | ✓ 149b | ✗ provider_error |
| technical.traders.com | article | ✓ 14937b | ✓ 14937b | ✓ 14906b | ✗ provider_error |

## Detected patterns (for pipeline design)

1. **Local-only success**: 0 URLs — static HTML or special APIs (X CDN) suffice.
2. **Tab beats local**: 0 URLs — JS-rendered content; tab provider adds value.
3. **Jina rescue**: 0 URLs — remote fetch when local+tab fail.
4. **Cookie/consent false positives**: check boilerplate section — penalize snippets dominated by consent copy, not whole-page cookie keyword bans.
5. **X status URLs**: compare local (Twitter CDN) vs tab (often cookie modal) vs jina (noisy but complete).
6. **Do not LLM-gate every fetch** — use mechanical scores first; LLM only when providers disagree or boilerplate score is high.
