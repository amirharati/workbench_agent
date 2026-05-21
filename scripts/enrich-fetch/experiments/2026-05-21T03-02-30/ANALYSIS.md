# Fetch experiment analysis

URLs tested: **2**
Providers: **local, tab, jina, markdown-new**

## Provider success rates

| Provider | usable | ok (http) | avg bytes | avg ms |
|----------|--------|-----------|-----------|--------|
| local | 0/2 | 0/2 | 174 | 1025 |
| tab | 0/2 | 2/2 | 295 | 5611 |
| jina | 0/2 | 1/2 | 1557 | 4611 |
| markdown-new | 0/2 | 0/2 | 0 | 709 |

## Failure reasons (by provider)

### local
- provider_error: 1
- parse_empty: 1

### tab
- matched block pattern /you'?ve been blocked by network security/i: 1
- weak_title: 1

### jina
- provider_error: 1
- matched block pattern /people on x are the first to know/i: 1

### markdown-new
- provider_error: 2

## Provider agreement

How often providers agree on **usable** for the same URL:

- All core providers usable: **0** URLs
- Split (some usable, some not): **0** URLs
- None usable: **2** URLs

Largest usable snippet wins (rough tie-break):

## By source kind

- **article**: 2 URLs

## Boilerplate in usable snippets

Usable fetches whose snippet preview still matches cookie/login/consent patterns:

- (none detected in preview)

## Per-URL summary

| Host | Kind | local | tab | jina | markdown-new |
|------|------|---|---|---|---|
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ auth_required | ✗ provider_error |

## Detected patterns (for pipeline design)

1. **Local-only success**: 0 URLs — static HTML or special APIs (X CDN) suffice.
2. **Tab beats local**: 0 URLs — JS-rendered content; tab provider adds value.
3. **Jina rescue**: 0 URLs — remote fetch when local+tab fail.
4. **Cookie/consent false positives**: check boilerplate section — penalize snippets dominated by consent copy, not whole-page cookie keyword bans.
5. **X status URLs**: compare local (Twitter CDN) vs tab (often cookie modal) vs jina (noisy but complete).
6. **Do not LLM-gate every fetch** — use mechanical scores first; LLM only when providers disagree or boilerplate score is high.
