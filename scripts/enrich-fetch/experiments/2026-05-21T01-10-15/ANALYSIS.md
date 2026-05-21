# Fetch experiment analysis

URLs tested: **15**
Providers: **local, tab, jina, markdown-new**

## Provider success rates

| Provider | usable | ok (http) | avg bytes | avg ms |
|----------|--------|-----------|-----------|--------|
| local | 9/15 | 10/15 | 100837 | 1703 |
| tab | 11/15 | 15/15 | 7690 | 5091 |
| jina | 12/15 | 15/15 | 19261 | 3802 |
| markdown-new | 0/15 | 0/15 | 0 | 568 |

## Failure reasons (by provider)

### local
- provider_error: 3
- rate_limited: 1
- parse_empty: 1
- weak_title: 1

### tab
- matched block pattern /performing security verification/i: 1
- only 6 chars: 1
- matched block pattern /you'?ve been blocked by network security/i: 1
- weak_title: 1

### jina
- only 6 chars: 1
- matched block pattern /you'?ve been blocked by network security/i: 1
- weak_title: 1

### markdown-new
- provider_error: 15

## Provider agreement

How often providers agree on **usable** for the same URL:

- All core providers usable: **0** URLs
- Split (some usable, some not): **12** URLs
- None usable: **3** URLs

Largest usable snippet wins (rough tie-break):
- jina: 7 URLs
- local: 4 URLs
- tab: 1 URLs

## By source kind

- **x**: 1 URLs
- **article**: 13 URLs
- **video**: 1 URLs

## Boilerplate in usable snippets

Usable fetches whose snippet preview still matches cookie/login/consent patterns:

- **tab** · x.com · https://x.com/pyquantnews/status/1832086911856386223…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **jina** · youtube.com · https://www.youtube.com/watch?v=dQw4w9WgXcQ…
  `Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster) - YouTube  Back [![Image 1](htt…`

## Per-URL summary

| Host | Kind | local | tab | jina | markdown-new |
|------|------|---|---|---|---|
| x.com | x | ✓ 122b | ✓ 246b | ✓ 535b | ✗ provider_error |
| example.com | article | ✓ 149b | ✓ 149b | ✓ 149b | ✗ provider_error |
| react.dev | article | ✓ 16689b | ✓ 16689b | ✓ 16653b | ✗ provider_error |
| docs.python.org | article | ✓ 17677b | ✓ 17677b | ✓ 17682b | ✗ provider_error |
| martinfowler.com | article | ✓ 7099b | ✓ 7099b | ✓ 7106b | ✗ provider_error |
| github.com | article | ✓ 7590b | ✓ 7590b | ✓ 8017b | ✗ provider_error |
| stackoverflow.com | article | ✗ provider_error | ✗ auth_required | ✓ 147618b | ✗ provider_error |
| en.wikipedia.org | article | ✓ 44166b | ✓ 44358b | ✓ 46083b | ✗ provider_error |
| arxiv.org | article | ✓ 2357b | ✓ 2357b | ✓ 2314b | ✗ provider_error |
| news.ycombinator.com | article | ✗ rate_limited | ✗ parse_empty | ✗ parse_empty | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ auth_required | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 7016b | ✓ 32439b | ✗ provider_error |
| blog.python.org | article | ✓ 1645b | ✓ 1645b | ✓ 1589b | ✗ provider_error |
| bloomberg.com | article | ✗ provider_error | ✓ 9697b | ✓ 832b | ✗ provider_error |
| medium.com | article | ✗ weak_title | ✗ weak_title | ✗ weak_title | ✗ provider_error |

## Detected patterns (for pipeline design)

1. **Local-only success**: 0 URLs — static HTML or special APIs (X CDN) suffice.
2. **Tab beats local**: 2 URLs — JS-rendered content; tab provider adds value.
3. **Jina rescue**: 1 URLs — remote fetch when local+tab fail.
4. **Cookie/consent false positives**: check boilerplate section — penalize snippets dominated by consent copy, not whole-page cookie keyword bans.
5. **X status URLs**: compare local (Twitter CDN) vs tab (often cookie modal) vs jina (noisy but complete).
6. **Do not LLM-gate every fetch** — use mechanical scores first; LLM only when providers disagree or boilerplate score is high.
