# Fetch experiment analysis

URLs tested: **50**
Providers: **local, tab, jina, markdown-new**

## Provider success rates

| Provider | usable | ok (http) | avg bytes | avg ms |
|----------|--------|-----------|-----------|--------|
| local | 26/50 | 26/50 | 209285 | 1467 |
| tab | 30/50 | 47/50 | 18811 | 6004 |
| jina | 29/50 | 42/50 | 12347 | 4384 |
| markdown-new | 0/50 | 0/50 | 0 | 544 |

## Failure reasons (by provider)

### local
- parse_empty: 16
- provider_error: 8

### tab
- matched block pattern /you'?ve been blocked by network security/i: 8
- weak_title: 8
- parse_empty: 3
- too_short: 1

### jina
- provider_error: 8
- matched block pattern /people on x are the first to know/i: 8
- matched block pattern /performing security verification/i: 3
- matched block pattern /sign in to continue/i: 2

### markdown-new
- provider_error: 50

## Provider agreement

How often providers agree on **usable** for the same URL:

- All core providers usable: **0** URLs
- Split (some usable, some not): **36** URLs
- None usable: **14** URLs

Largest usable snippet wins (rough tie-break):
- jina: 25 URLs
- tab: 7 URLs
- local: 4 URLs

## By source kind

- **article**: 34 URLs
- **video**: 8 URLs
- **x**: 8 URLs

## Boilerplate in usable snippets

Usable fetches whose snippet preview still matches cookie/login/consent patterns:

- **jina** · youtube.com · https://www.youtube.com/watch?v=8YI5hGucHSg…
  `YouTube  Back [![Image 1](https://www.youtube.com/watch?v=8YI5hGucHSg)](https://www.youtube.com/ "Yo…`
- **tab** · x.com · https://x.com/rohanpaul_ai/status/1775608234180558851…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **jina** · youtube.com · https://www.youtube.com/watch?t=551s&v=pt4auu_ZPm4…
  `Introduction to BACKTRADER [Backtesting Trading Strategies Library for Python] - YouTube  Back [![Im…`
- **tab** · linkedin.com · https://www.linkedin.com/posts/generative-artificial-intelli…
  `Select Accept to consent or Reject to decline non-essential cookies for this use. You can update you…`
- **tab** · x.com · https://x.com/FiSurgi/status/1765207468391465127…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **jina** · youtube.com · https://www.youtube.com/watch?v=SmmIJ7wjsnw…
  `how to play games remotely for gamers - YouTube  Back [![Image 5](https://www.youtube.com/watch?v=Sm…`
- **tab** · x.com · https://x.com/matthijspoot/status/1708888627223158822…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **jina** · youtube.com · https://www.youtube.com/watch?v=UkGbyS9vrFA…
  `Raindrop + Obsidian/Logseq/Roam = 🔥🔥🔥 | How I Use Raindrop with my note-taking app - YouTube  Bac…`
- **tab** · x.com · https://x.com/chrysb/status/1825561834151436288…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **jina** · youtube.com · https://www.youtube.com/watch?v=O8Un3pg84Zg…
  `Every RTX 4090 Owner Needs To Do This! Undervolt + Power Limit - YouTube  Back [![Image 1](https://w…`
- **tab** · x.com · https://x.com/quantymacro/status/1640375531374878721…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **jina** · youtube.com · https://www.youtube.com/watch?v=7VzXHUTqE7E…
  `Liquid Cooling vs. Air Cooling Benchmark In-Depth (NH-D15, NZXT X62, & More) - YouTube  Back [![Imag…`
- **local** · github.com · https://github.com/huggingface/diffusion-models-class…
  `[![License](https://camo.githubusercontent.com/8b34466e96199505594ca275a98392e540231824eac45f77b2800…`
- **tab** · github.com · https://github.com/huggingface/diffusion-models-class…
  `[![License](https://camo.githubusercontent.com/8b34466e96199505594ca275a98392e540231824eac45f77b2800…`
- **jina** · github.com · https://github.com/huggingface/diffusion-models-class…
  `[![Image 1: License](https://camo.githubusercontent.com/8b34466e96199505594ca275a98392e540231824eac4…`
- **tab** · x.com · https://x.com/krypticmouse/status/1777354442825724235…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **jina** · youtube.com · https://www.youtube.com/watch?t=13s&v=FbrNHpXaWkE…
  `Supplements - User Manual For Humans S1 E11 - Dr Ekberg - YouTube  Back [![Image 1](https://www.yout…`
- **jina** · youtube.com · https://www.youtube.com/watch?v=xl8TNhsBG0o…
  `Hands-On Introduction To Quantitative Trading | Yale School of Management - YouTube  Back [![Image 1…`
- **tab** · x.com · https://x.com/austinvhuang/status/1824877790153584730…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`

## Per-URL summary

| Host | Kind | local | tab | jina | markdown-new |
|------|------|---|---|---|---|
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ auth_required | ✗ provider_error |
| medium.com | article | ✓ 10369b | ✓ 10834b | ✗ auth_required | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✗ too_short | ✓ 2249b | ✗ provider_error |
| github.com | article | ✓ 13785b | ✓ 13785b | ✓ 14820b | ✗ provider_error |
| linkedin.com | article | ✓ 2782b | ✗ parse_empty | ✗ auth_required | ✗ provider_error |
| x.com | x | ✓ 344b | ✓ 246b | ✓ 2894b | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ auth_required | ✗ provider_error |
| medium.com | article | ✓ 12802b | ✓ 13267b | ✗ auth_required | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 2688b | ✓ 38582b | ✗ provider_error |
| github.com | article | ✓ 711b | ✓ 711b | ✓ 17294b | ✗ provider_error |
| linkedin.com | article | ✓ 1995b | ✓ 489b | ✓ 4463b | ✗ provider_error |
| x.com | x | ✓ 164b | ✓ 246b | ✗ auth_required | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ auth_required | ✗ provider_error |
| medium.com | article | ✓ 8283b | ✓ 8381b | ✗ auth_required | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 3031b | ✓ 23916b | ✗ provider_error |
| github.com | article | ✓ 6973b | ✓ 6952b | ✓ 5473b | ✗ provider_error |
| linkedin.com | article | ✓ 3786b | ✗ parse_empty | ✗ auth_required | ✗ provider_error |
| x.com | x | ✓ 95b | ✓ 246b | ✓ 625b | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ auth_required | ✗ provider_error |
| medium.com | article | ✓ 5478b | ✓ 5686b | ✓ 5502b | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 16348b | ✓ 52715b | ✗ provider_error |
| github.com | article | ✓ 15470b | ✓ 15470b | ✓ 17450b | ✗ provider_error |
| x.com | x | ✓ 315b | ✓ 246b | ✓ 732b | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ auth_required | ✗ provider_error |
| medium.com | article | ✓ 14059b | ✓ 15059b | ✓ 14549b | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 383b | ✓ 39570b | ✗ provider_error |
| github.com | article | ✓ 21344b | ✓ 21344b | ✓ 22046b | ✗ provider_error |
| x.com | x | ✓ 292b | ✓ 246b | ✓ 974b | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✓ 1966b | ✗ provider_error |
| medium.com | article | ✓ 40079b | ✓ 41054b | ✓ 40260b | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 9594b | ✓ 47457b | ✗ provider_error |
| github.com | article | ✓ 5560b | ✓ 5560b | ✓ 5865b | ✗ provider_error |
| x.com | x | ✓ 275b | ✓ 246b | ✓ 622b | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✓ 1898b | ✗ provider_error |
| medium.com | article | ✓ 1001b | ✓ 1074b | ✓ 35567b | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 7242b | ✓ 42067b | ✗ provider_error |
| github.com | article | ✓ 43525b | ✓ 43525b | ✓ 47985b | ✗ provider_error |
| x.com | x | ✓ 124b | ✗ parse_empty | ✗ auth_required | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ auth_required | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 9586b | ✓ 43179b | ✗ provider_error |
| github.com | article | ✓ 3713b | ✓ 3713b | ✓ 19275b | ✗ provider_error |
| x.com | x | ✓ 480b | ✓ 246b | ✓ 1037b | ✗ provider_error |

## Detected patterns (for pipeline design)

1. **Local-only success**: 3 URLs — static HTML or special APIs (X CDN) suffice.
2. **Tab beats local**: 7 URLs — JS-rendered content; tab provider adds value.
3. **Jina rescue**: 3 URLs — remote fetch when local+tab fail.
4. **Cookie/consent false positives**: check boilerplate section — penalize snippets dominated by consent copy, not whole-page cookie keyword bans.
5. **X status URLs**: compare local (Twitter CDN) vs tab (often cookie modal) vs jina (noisy but complete).
6. **Do not LLM-gate every fetch** — use mechanical scores first; LLM only when providers disagree or boilerplate score is high.
