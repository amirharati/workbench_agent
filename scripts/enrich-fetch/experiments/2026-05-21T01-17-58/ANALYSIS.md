# Fetch experiment analysis

URLs tested: **24**
Providers: **local, tab, jina, markdown-new**

## Provider success rates

| Provider | usable | ok (http) | avg bytes | avg ms |
|----------|--------|-----------|-----------|--------|
| local | 17/24 | 18/24 | 87730 | 1874 |
| tab | 0/24 | 0/24 | 0 | 23 |
| jina | 20/24 | 23/24 | 13977 | 5113 |
| markdown-new | 0/24 | 0/24 | 0 | 488 |

## Failure reasons (by provider)

### local
- parse_empty: 5
- provider_error: 1
- too_short: 1

### tab
- network: 24

### jina
- provider_error: 1
- matched block pattern /you'?ve been blocked by network security/i: 1
- matched block pattern /performing security verification/i: 1
- matched block pattern /sign in to continue/i: 1

### markdown-new
- provider_error: 23
- network: 1

## Provider agreement

How often providers agree on **usable** for the same URL:

- All core providers usable: **0** URLs
- Split (some usable, some not): **22** URLs
- None usable: **2** URLs

Largest usable snippet wins (rough tie-break):
- jina: 16 URLs
- local: 6 URLs

## By source kind

- **x**: 1 URLs
- **article**: 22 URLs
- **video**: 1 URLs

## Boilerplate in usable snippets

Usable fetches whose snippet preview still matches cookie/login/consent patterns:

- **jina** · youtube.com · https://www.youtube.com/watch?v=UkGbyS9vrFA…
  `Raindrop + Obsidian/Logseq/Roam = 🔥🔥🔥 | How I Use Raindrop with my note-taking app - YouTube  Bac…`
- **jina** · towardsdatascience.com · https://towardsdatascience.com/making-your-neural-network-sa…
  `We value your privacy  We use cookies to enhance your browsing experience, serve personalised ads or…`
- **local** · mail.google.com · https://mail.google.com/mail/u/0…
  `Not your computer? Use Guest mode to sign in privately. [Learn more about using Guest mode](https://…`
- **jina** · grok.com · https://grok.com/c/d6c7a92b-8dda-4e6c-8103-f32643f10d0f…
  `[](https://grok.com/)   Fast   ## Privacy Preference Center  When you visit any website, it may stor…`
- **local** · priceactionlab.com · https://www.priceactionlab.com/Blog/2023/01/win-rate-trend-f…
  `Photo by Anna Nekrashevich.  The win rate of a trend-following strategy is related to the probabilit…`

## Per-URL summary

| Host | Kind | local | tab | jina | markdown-new |
|------|------|---|---|---|---|
| x.com | x | ✓ 211b | ✗ network | ✓ 832b | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ network | ✗ provider_error | ✗ provider_error |
| github.com | article | ✓ 9792b | ✗ network | ✓ 12114b | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ network | ✗ auth_required | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✗ network | ✓ 48736b | ✗ provider_error |
| medium.com | article | ✓ 14059b | ✗ network | ✗ auth_required | ✗ provider_error |
| docs.google.com | article | ✓ 551b | ✗ network | ✓ 5303b | ✗ provider_error |
| towardsdatascience.com | article | ✓ 6919b | ✗ network | ✓ 33182b | ✗ provider_error |
| google.com | article | ✗ parse_empty | ✗ network | ✓ 725b | ✗ provider_error |
| linkedin.com | article | ✓ 2782b | ✗ network | ✗ auth_required | ✗ provider_error |
| enjeeneer.io | article | ✓ 949b | ✗ network | ✓ 949b | ✗ network |
| mail.google.com | article | ✓ 150b | ✗ network | ✓ 1786b | ✗ provider_error |
| blog.quantinsti.com | article | ✓ 3618b | ✗ network | ✓ 3618b | ✗ provider_error |
| qoppac.blogspot.com | article | ✓ 35906b | ✗ network | ✓ 35490b | ✗ provider_error |
| notion.so | article | ✗ parse_empty | ✗ network | ✓ 590b | ✗ provider_error |
| grok.com | article | ✗ parse_empty | ✗ network | ✓ 2882b | ✗ provider_error |
| quantifiedstrategies.com | article | ✗ too_short | ✗ network | ✓ 127b | ✗ provider_error |
| arxiv.org | article | ✓ 2484b | ✗ network | ✓ 2454b | ✗ provider_error |
| quantconnect.com | article | ✓ 9632b | ✗ network | ✓ 9975b | ✗ provider_error |
| dipseastories.com | article | ✓ 10497b | ✗ network | ✓ 16885b | ✗ provider_error |
| lilianweng.github.io | article | ✓ 47917b | ✗ network | ✓ 48148b | ✗ provider_error |
| indiehackers.com | article | ✓ 7082b | ✗ network | ✓ 55579b | ✗ provider_error |
| priceactionlab.com | article | ✓ 661b | ✗ network | ✓ 18884b | ✗ provider_error |
| huggingface.co | article | ✓ 11506b | ✗ network | ✓ 12292b | ✗ provider_error |

## Detected patterns (for pipeline design)

1. **Local-only success**: 2 URLs — static HTML or special APIs (X CDN) suffice.
2. **Tab beats local**: 0 URLs — JS-rendered content; tab provider adds value.
3. **Jina rescue**: 5 URLs — remote fetch when local+tab fail.
4. **Cookie/consent false positives**: check boilerplate section — penalize snippets dominated by consent copy, not whole-page cookie keyword bans.
5. **X status URLs**: compare local (Twitter CDN) vs tab (often cookie modal) vs jina (noisy but complete).
6. **Do not LLM-gate every fetch** — use mechanical scores first; LLM only when providers disagree or boilerplate score is high.
