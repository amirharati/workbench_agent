# Fetch experiment analysis

URLs tested: **147**
Providers: **local, tab, jina, markdown-new**

## Provider success rates

| Provider | usable | ok (http) | avg bytes | avg ms |
|----------|--------|-----------|-----------|--------|
| local | 89/147 | 93/147 | 90518 | 1901 |
| tab | 108/147 | 132/147 | 32837 | 5982 |
| jina | 118/147 | 133/147 | 18802 | 3877 |
| markdown-new | 0/147 | 0/147 | 0 | 499 |

## Failure reasons (by provider)

### local
- provider_error: 28
- parse_empty: 22
- network: 3
- too_short: 3
- matched block pattern /something went wrong/i: 1
- rate_limited: 1

### tab
- parse_empty: 10
- matched block pattern /you'?ve been blocked by network security/i: 8
- weak_title: 7
- network: 4
- only 36 chars: 3
- only 12 chars: 2
- matched block pattern /performing security verification/i: 2
- only 26 chars: 1
- timeout: 1
- too_short: 1

### jina
- provider_error: 12
- matched block pattern /people on x are the first to know/i: 7
- matched block pattern /performing security verification/i: 3
- timeout: 2
- too_short: 2
- matched block pattern /sign in to continue/i: 2
- matched block pattern /something went wrong/i: 1

### markdown-new
- provider_error: 147

## Provider agreement

How often providers agree on **usable** for the same URL:

- All core providers usable: **0** URLs
- Split (some usable, some not): **127** URLs
- None usable: **20** URLs

Largest usable snippet wins (rough tie-break):
- jina: 97 URLs
- local: 19 URLs
- tab: 11 URLs

## By source kind

- **article**: 131 URLs
- **video**: 8 URLs
- **x**: 8 URLs

## Boilerplate in usable snippets

Usable fetches whose snippet preview still matches cookie/login/consent patterns:

- **tab** · chromewebstore.google.com · https://chromewebstore.google.com/detail/supademo-ai-interac…
  `We use [cookies](https://policies.google.com/technologies/cookies?hl=en-US&utm_source=ucb) and data …`
- **jina** · deepinfra.com · https://deepinfra.com…
  `We use essential cookies to make our site work. With your consent, we may also use non-essential coo…`
- **jina** · every.to · https://every.to/superorganizers/gpt-3-is-the-best-journal-y…
  `[![Image 7: Every](https://every.to/assets/every-logo-white-d8b0c13c4b860174d4ac9717f446538ba8fa4f3b…`
- **local** · github.com · https://github.com/huggingface/diffusion-models-class…
  `[![License](https://camo.githubusercontent.com/8b34466e96199505594ca275a98392e540231824eac45f77b2800…`
- **jina** · github.com · https://github.com/huggingface/diffusion-models-class…
  `[![Image 1: License](https://camo.githubusercontent.com/8b34466e96199505594ca275a98392e540231824eac4…`
- **jina** · grok.com · https://grok.com/c/18c55632-2419-421d-8057-e57efdcbea48…
  `[](https://grok.com/)   Fast   ## Privacy Preference Center  When you visit any website, it may stor…`
- **local** · notebooklm.google.com · https://notebooklm.google.com/notebook/dc15514a-e42e-472c-a9…
  `Not your computer? Use Guest mode to sign in privately. [Learn more about using Guest mode](https://…`
- **tab** · notebooklm.google.com · https://notebooklm.google.com/notebook/dc15514a-e42e-472c-a9…
  `Not your computer? Use Guest mode to sign in privately. [Learn more about using Guest mode](https://…`
- **tab** · silentpc.com · https://silentpc.com/case-insulation…
  `Your Source for Custom SILENT PCs.  Your Source for Custom SILENT PCs. We sell **ultra-quiet, high-e…`
- **jina** · store.gorecell.ca · https://store.gorecell.ca/collections/apple/products/apple-i…
  `English  *   [English](https://store.gorecell.ca/collections/apple/products/apple-iphone-13-128gb-a2…`
- **jina** · us.myprotein.com · https://us.myprotein.com/thezone/supplements/l-arginine-bene…
  `Skip to main content   ✕   [Trending](https://us.myprotein.com/c/nutrition/bestsellers-en-us/)  [Bes…`
- **local** · arcade.software · https://www.arcade.software/pricing…
  `## Pricing that grows with your storytelling.  Monthly  Yearly  \-15%  For you  Free  Try Arcade and…`
- **tab** · arcade.software · https://www.arcade.software/pricing…
  `## Pricing that grows with your storytelling.  Monthly  Yearly  \-15%  For you  Free  Try Arcade and…`
- **jina** · arcade.software · https://www.arcade.software/pricing…
  `## Pricing that grows with your storytelling.  Monthly  Yearly  -15%  For you  Free  Try Arcade and …`
- **jina** · ebuyer.com · https://www.ebuyer.com/blog/2021/03/what-is-the-nvidia-shiel…
  `[GoToContentActionLink](https://www.ebuyer.com/blog/2021/03/what-is-the-nvidia-shield-and-what-does-…`
- **local** · lennysnewsletter.com · https://www.lennysnewsletter.com/p/i-built-a-lenny-chatbot-u…
  `_👋 Hey, [Lenny](https://twitter.com/lennysan) here! Welcome to this month’s ✨ **free edition** ✨ of…`
- **tab** · lennysnewsletter.com · https://www.lennysnewsletter.com/p/i-built-a-lenny-chatbot-u…
  `_👋 Hey, [Lenny](https://twitter.com/lennysan) here! Welcome to this month’s ✨ **free edition** ✨ of…`
- **jina** · lennysnewsletter.com · https://www.lennysnewsletter.com/p/i-built-a-lenny-chatbot-u…
  `_👋 Hey,[Lenny](https://twitter.com/lennysan)here!Welcome to this month’s✨**free edition**✨ of Lenny…`
- **tab** · linkedin.com · https://www.linkedin.com/posts/generative-artificial-intelli…
  `Select Accept to consent or Reject to decline non-essential cookies for this use. You can update you…`
- **local** · marktechpost.com · https://www.marktechpost.com/2023/02/22/meet-resmem-a-new-ai…
  `Modern big neural networks’ phenomenal results in generalizing new data and tasks have been attribut…`
- **tab** · marktechpost.com · https://www.marktechpost.com/2023/02/22/meet-resmem-a-new-ai…
  `Modern big neural networks’ phenomenal results in generalizing new data and tasks have been attribut…`
- **jina** · marktechpost.com · https://www.marktechpost.com/2023/02/22/meet-resmem-a-new-ai…
  `[Discord](https://pxl.to/ivxz41s "Discord")[Linkedin](https://www.linkedin.com/company/marktechpost/…`
- **jina** · memoryexpress.com · https://www.memoryexpress.com/Store/Location/ONETO…
  `**Site** Navigation   [](https://www.memoryexpress.com/Store/Location/ONETO#Close)   Welcome   *   […`
- **local** · pornid.xxx · https://www.pornid.xxx/girl-licks-man-s-feet-and-allows-him-…
  `Advertisement  Video by [Hot Wife XXX](https://www.pornid.xxx/cs/hot-wife-xxx/)  [Exclusive PornID O…`
- **jina** · pornid.xxx · https://www.pornid.xxx/girl-licks-man-s-feet-and-allows-him-…
  `*   [Sign Up](https://www.pornid.xxx/girl-licks-man-s-feet-and-allows-him-to-put-leg-on-head.html#) …`
- **jina** · producthunt.com · https://www.producthunt.com/products/buildpad/alternatives…
  `[](https://www.producthunt.com/)  *   [Best Products](https://www.producthunt.com/categories?ref=hea…`
- **jina** · theverge.com · https://www.theverge.com/23274055/raindrop-best-bookmarking-…
  `[Skip to main content](https://www.theverge.com/23274055/raindrop-best-bookmarking-app#content)  [Th…`
- **jina** · youtube.com · https://www.youtube.com/watch?t=13s&v=FbrNHpXaWkE…
  `Supplements - User Manual For Humans S1 E11 - Dr Ekberg - YouTube  Back [![Image 1](https://www.yout…`
- **jina** · youtube.com · https://www.youtube.com/watch?t=551s&v=pt4auu_ZPm4…
  `Introduction to BACKTRADER [Backtesting Trading Strategies Library for Python] - YouTube  Back [![Im…`
- **jina** · youtube.com · https://www.youtube.com/watch?v=7VzXHUTqE7E…
  `Liquid Cooling vs. Air Cooling Benchmark In-Depth (NH-D15, NZXT X62, & More) - YouTube  Back [![Imag…`
- **jina** · youtube.com · https://www.youtube.com/watch?v=8YI5hGucHSg…
  `YouTube  Back [![Image 1](https://www.youtube.com/watch?v=8YI5hGucHSg)](https://www.youtube.com/ "Yo…`
- **jina** · youtube.com · https://www.youtube.com/watch?v=O8Un3pg84Zg…
  `Every RTX 4090 Owner Needs To Do This! Undervolt + Power Limit - YouTube  Back [![Image 1](https://w…`
- **jina** · youtube.com · https://www.youtube.com/watch?v=SmmIJ7wjsnw…
  `how to play games remotely for gamers - YouTube  Back [![Image 5](https://www.youtube.com/watch?v=Sm…`
- **jina** · youtube.com · https://www.youtube.com/watch?v=UkGbyS9vrFA…
  `Raindrop + Obsidian/Logseq/Roam = 🔥🔥🔥 | How I Use Raindrop with my note-taking app - YouTube  Bac…`
- **jina** · youtube.com · https://www.youtube.com/watch?v=xl8TNhsBG0o…
  `Hands-On Introduction To Quantitative Trading | Yale School of Management - YouTube  Back [![Image 1…`
- **tab** · x.com · https://x.com/FiSurgi/status/1765207468391465127…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **jina** · x.com · https://x.com/FiSurgi/status/1765207468391465127…
  `## New to X? Sign up now to get your own personalized timeline! [Create account](https://x.com/i/flo…`
- **tab** · x.com · https://x.com/austinvhuang/status/1824877790153584730…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **tab** · x.com · https://x.com/chrysb/status/1825561834151436288…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **tab** · x.com · https://x.com/krypticmouse/status/1777354442825724235…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **tab** · x.com · https://x.com/matthijspoot/status/1708888627223158822…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **tab** · x.com · https://x.com/quantymacro/status/1640375531374878721…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **tab** · x.com · https://x.com/rohanpaul_ai/status/1775608234180558851…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **jina** · zapier.com · https://zapier.com/app/zaps…
  `## Cookies settings  When you visit any website, it may store or retrieve information on your browse…`

## Per-URL summary

| Host | Kind | local | tab | jina | markdown-new |
|------|------|---|---|---|---|
| example.com | article | ✓ 149b | ✓ 149b | ✓ 149b | ✗ provider_error |
| technical.traders.com | article | ✓ 14937b | ✓ 14937b | ✓ 14906b | ✗ provider_error |
| wwww | article | ✗ network | ✗ network | ✗ provider_error | ✗ provider_error |
| abnormalreturns.com | article | ✓ 1872b | ✓ 1872b | ✓ 29900b | ✗ provider_error |
| alphapc.ca | article | ✓ 4807b | ✓ 4807b | ✓ 4982b | ✗ provider_error |
| blog.quantinsti.com | article | ✓ 3618b | ✓ 3618b | ✓ 3618b | ✗ provider_error |
| capacities.io | article | ✓ 458b | ✓ 458b | ✓ 4302b | ✗ provider_error |
| chromewebstore.google.co | article | ✓ 9822b | ✓ 1375b | ✓ 10805b | ✗ provider_error |
| cleanmymac.com | article | ✓ 6318b | ✓ 6343b | ✓ 6362b | ✗ provider_error |
| cobusgreyling.me | article | ✗ provider_error | ✓ 120b | ✓ 120b | ✗ provider_error |
| computerinfobits.com | article | ✗ provider_error | ✓ 1068b | ✗ timeout | ✗ provider_error |
| convexvalue.com | article | ✓ 1089b | ✓ 1034b | ✓ 1031b | ✗ provider_error |
| crossminds.ai | article | ✗ network | ✗ network | ✗ provider_error | ✗ provider_error |
| dailystoic.com | article | ✓ 54372b | ✓ 54460b | ✓ 60248b | ✗ provider_error |
| dataforseo.com | article | ✓ 11956b | ✓ 12423b | ✓ 14625b | ✗ provider_error |
| deepinfra.com | article | ✓ 305b | ✓ 305b | ✓ 25287b | ✗ provider_error |
| devblogs.microsoft.com | article | ✓ 13947b | ✓ 15027b | ✓ 15180b | ✗ provider_error |
| developer.oanda.com | article | ✓ 3734b | ✓ 5174b | ✓ 5205b | ✗ provider_error |
| docs.google.com | article | ✗ provider_error | ✗ parse_empty | ✓ 1868b | ✗ provider_error |
| docs.sylabs.io | article | ✓ 23673b | ✓ 23673b | ✓ 25375b | ✗ provider_error |
| enjeeneer.io | article | ✓ 949b | ✓ 949b | ✓ 949b | ✗ provider_error |
| every.to | article | ✓ 5871b | ✓ 5871b | ✓ 35287b | ✗ provider_error |
| flo.health | article | ✓ 9819b | ✓ 9819b | ✓ 9875b | ✗ provider_error |
| fmovies.to | article | ✗ network | ✗ network | ✗ provider_error | ✗ provider_error |
| github.com | article | ✓ 6973b | ✓ 6952b | ✓ 5473b | ✗ provider_error |
| github.com | article | ✓ 3713b | ✓ 3713b | ✓ 19275b | ✗ provider_error |
| github.com | article | ✓ 711b | ✓ 711b | ✓ 17294b | ✗ provider_error |
| github.com | article | ✓ 5560b | ✗ timeout | ✓ 5865b | ✗ provider_error |
| github.com | article | ✓ 43525b | ✓ 43525b | ✓ 47985b | ✗ provider_error |
| github.com | article | ✓ 13785b | ✓ 13785b | ✓ 14820b | ✗ provider_error |
| github.com | article | ✓ 21344b | ✓ 21344b | ✓ 22046b | ✗ provider_error |
| github.com | article | ✓ 15470b | ✓ 15470b | ✓ 17450b | ✗ provider_error |
| grok.com | article | ✗ parse_empty | ✗ parse_empty | ✓ 2882b | ✗ provider_error |
| h5p.org | article | ✓ 3887b | ✓ 3887b | ✓ 41905b | ✗ provider_error |
| hardforum.com | article | ✗ provider_error | ✓ 4756b | ✓ 58720b | ✗ provider_error |
| hashnode.com | article | ✗ too_short | ✓ 10038b | ✓ 57058b | ✗ provider_error |
| huggingface.co | article | ✓ 1904b | ✓ 844b | ✓ 5753b | ✗ provider_error |
| idph.iowa.gov | article | ✓ 7368b | ✓ 7368b | ✓ 6880b | ✗ provider_error |
| immigrationnewscanada.ca | article | ✗ auth_required | ✗ parse_empty | ✗ auth_required | ✗ provider_error |
| introjs.com | article | ✓ 298b | ✓ 298b | ✓ 6601b | ✗ provider_error |
| iporntv.net | article | ✗ provider_error | ✗ parse_empty | ✓ 23856b | ✗ provider_error |
| jonathanhaidt.substack.c | article | ✓ 43169b | ✓ 43169b | ✓ 43609b | ✗ provider_error |
| leverageedu.com | article | ✗ provider_error | ✓ 359b | ✓ 30784b | ✗ provider_error |
| logseq.com | article | ✗ parse_empty | ✓ 2167b | ✓ 2196b | ✗ provider_error |
| medium.com | article | ✓ 5478b | ✓ 5686b | ✓ 5502b | ✗ provider_error |
| medium.com | article | ✓ 40079b | ✓ 41054b | ✗ auth_required | ✗ provider_error |
| medium.com | article | ✓ 8283b | ✓ 8639b | ✗ auth_required | ✗ provider_error |
| medium.com | article | ✓ 1001b | ✓ 1074b | ✓ 35542b | ✗ provider_error |
| medium.com | article | ✓ 12802b | ✓ 13267b | ✓ 11865b | ✗ provider_error |
| medium.com | article | ✓ 14059b | ✓ 15059b | ✓ 14549b | ✗ provider_error |
| medium.com | article | ✓ 10369b | ✓ 10834b | ✓ 10857b | ✗ provider_error |
| notebooklm.google.com | article | ✓ 150b | ✓ 150b | ✓ 536b | ✗ provider_error |
| nzxt.com | article | ✗ provider_error | ✓ 7097b | ✓ 7232b | ✗ provider_error |
| oilprice.com | article | ✓ 8611b | ✓ 8611b | ✗ provider_error | ✗ provider_error |
| otio.ai | article | ✓ 9723b | ✓ 9723b | ✓ 10003b | ✗ provider_error |
| pascio.gumroad.com | article | ✗ parse_empty | ✓ 5056b | ✓ 4983b | ✗ provider_error |
| phasrmedia.com | article | ✗ provider_error | ✗ parse_empty | ✗ too_short | ✗ provider_error |
| qoppac.blogspot.com | article | ✓ 1804b | ✓ 1804b | ✓ 45977b | ✗ provider_error |
| raindrop.io | article | ✓ 10618b | ✓ 10618b | ✓ 10584b | ✗ provider_error |
| read.readwise.io | article | ✗ too_short | ✗ parse_empty | ✗ too_short | ✗ provider_error |
| robotwealth.com | article | ✓ 2807b | ✓ 2807b | ✓ 2708b | ✗ provider_error |
| saltedmango.atlassian.ne | article | ✗ parse_empty | ✗ parse_empty | ✓ 1865b | ✗ provider_error |
| scribehow.com | article | ✗ parse_empty | ✗ parse_empty | ✓ 674b | ✗ provider_error |
| secondcell.ca | article | ✓ 6258b | ✓ 6258b | ✓ 42993b | ✗ provider_error |
| silentpc.com | article | ✗ too_short | ✓ 4401b | ✓ 26688b | ✗ provider_error |
| srush.github.io | article | ✓ 1725209b | ✓ 1726536b | ✓ 52047b | ✗ provider_error |
| stable-baselines3.readth | article | ✓ 1170b | ✓ 213b | ✓ 6652b | ✗ provider_error |
| store.gorecell.ca | article | ✗ provider_error | ✓ 135b | ✓ 5860b | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ auth_required | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ parse_empty | ✗ auth_required | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ auth_required | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ auth_required | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✓ 1839b | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✓ 1966b | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ auth_required | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ auth_required | ✗ provider_error |
| theaisummer.com | article | ✓ 42481b | ✓ 42481b | ✓ 35471b | ✗ provider_error |
| threadreaderapp.com | article | ✓ 13755b | ✓ 13755b | ✓ 14221b | ✗ provider_error |
| typedream.com | article | ✓ 9950b | ✓ 9950b | ✓ 10165b | ✗ provider_error |
| ubiquitouslearning.githu | article | ✓ 208b | ✓ 208b | ✓ 2718b | ✗ provider_error |
| us.myprotein.com | article | ✓ 4536b | ✓ 4908b | ✓ 34503b | ✗ provider_error |
| vectorbt.dev | article | ✓ 15752b | ✓ 15791b | ✓ 15684b | ✗ provider_error |
| wondergressive.com | article | ✓ 41089b | ✗ parse_empty | ✓ 41169b | ✗ provider_error |
| arcade.software | article | ✓ 33571b | ✓ 33625b | ✓ 36082b | ✗ provider_error |
| assemblyai.com | article | ✓ 75843b | ✓ 76973b | ✓ 77413b | ✗ provider_error |
| avalonaccounting.ca | article | ✓ 16802b | ✓ 16802b | ✓ 16828b | ✗ provider_error |
| bzarg.com | article | ✓ 25582b | ✓ 24877b | ✓ 104567b | ✗ provider_error |
| carbmanager.com | article | ✓ 14513b | ✓ 14513b | ✓ 14533b | ✗ provider_error |
| chartmill.com | article | ✗ provider_error | ✓ 16722b | ✓ 16817b | ✗ provider_error |
| cloudways.com | article | ✗ provider_error | ✓ 11566b | ✓ 56945b | ✗ provider_error |
| dipseastories.com | article | ✗ provider_error | ✓ 140b | ✓ 601b | ✗ provider_error |
| ebuyer.com | article | ✗ provider_error | ✗ network | ✓ 14074b | ✗ provider_error |
| eia.gov | article | ✓ 2076b | ✓ 2076b | ✓ 30057b | ✗ provider_error |
| ekwb.com | article | ✓ 4375b | ✓ 4375b | ✗ auth_required | ✗ provider_error |
| financialwisdomforum.org | article | ✗ provider_error | ✓ 163b | ✓ 48688b | ✗ provider_error |
| gettoby.com | article | ✓ 137b | ✗ parse_empty | ✓ 508b | ✗ provider_error |
| intel.com | article | ✗ provider_error | ✓ 1400b | ✓ 74869b | ✗ provider_error |
| lambdatest.com | article | ✓ 31100b | ✓ 31100b | ✓ 31182b | ✗ provider_error |
| lennysnewsletter.com | article | ✓ 32597b | ✓ 32597b | ✓ 32520b | ✗ provider_error |
| linkedin.com | article | ✓ 2782b | ✗ parse_empty | ✗ auth_required | ✗ provider_error |
| linkedin.com | article | ✓ 1967b | ✓ 489b | ✓ 4463b | ✗ provider_error |
| linkedin.com | article | ✓ 3786b | ✗ parse_empty | ✗ auth_required | ✗ provider_error |
| marketdata.app | article | ✗ provider_error | ✓ 87b | ✓ 10890b | ✗ provider_error |
| marktechpost.com | article | ✓ 4273b | ✓ 4273b | ✓ 179791b | ✗ provider_error |
| memoryexpress.com | article | ✗ provider_error | ✗ auth_required | ✓ 38626b | ✗ provider_error |
| moomoo.com | article | ✓ 1879b | ✓ 1879b | ✓ 41318b | ✗ provider_error |
| newegg.ca | article | ✓ 11361b | ✓ 14647b | ✓ 182756b | ✗ provider_error |
| notion.so | article | ✗ parse_empty | ✓ 2366b | ✓ 590b | ✗ provider_error |
| nutrisense.io | article | ✓ 21370b | ✓ 23126b | ✓ 23164b | ✗ provider_error |
| opengrants.io | article | ✗ provider_error | ✓ 80b | ✓ 2386b | ✗ provider_error |
| oreilly.com | article | ✓ 4440b | ✓ 4440b | ✓ 39065b | ✗ provider_error |
| pornid.xxx | article | ✓ 1238b | ✓ 546b | ✓ 28290b | ✗ provider_error |
| producthunt.com | article | ✗ provider_error | ✗ auth_required | ✓ 20818b | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ provider_error | ✗ provider_error |
| semianalysis.com | article | ✗ rate_limited | ✗ parse_empty | ✓ 31765b | ✗ provider_error |
| tabextend.com | article | ✓ 723b | ✓ 723b | ✓ 3706b | ✗ provider_error |
| techpowerup.com | article | ✓ 151b | ✓ 145b | ✓ 151b | ✗ provider_error |
| tecmint.com | article | ✓ 8101b | ✓ 8101b | ✓ 8260b | ✗ provider_error |
| thediff.co | article | ✓ 149b | ✓ 149b | ✓ 2161b | ✗ provider_error |
| theverge.com | article | ✓ 5473b | ✓ 5561b | ✓ 27129b | ✗ provider_error |
| tradingview.com | article | ✓ 4718b | ✓ 4718b | ✗ timeout | ✗ provider_error |
| vagrantup.com | article | ✓ 2899b | ✓ 2899b | ✓ 2803b | ✗ provider_error |
| verywellhealth.com | article | ✗ provider_error | ✗ parse_empty | ✓ 8721b | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 7182b | ✓ 51084b | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 2688b | ✓ 38582b | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 9594b | ✓ 47457b | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✗ too_short | ✓ 2249b | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 383b | ✓ 39570b | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 3031b | ✓ 23916b | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 16308b | ✓ 52715b | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 9586b | ✓ 43179b | ✗ provider_error |
| x.com | x | ✓ 164b | ✓ 246b | ✓ 1107b | ✗ provider_error |
| x.com | x | ✓ 480b | ✓ 246b | ✓ 1037b | ✗ provider_error |
| x.com | x | ✓ 315b | ✓ 246b | ✓ 732b | ✗ provider_error |
| x.com | x | ✓ 124b | ✗ parse_empty | ✗ auth_required | ✗ provider_error |
| x.com | x | ✓ 275b | ✓ 246b | ✓ 622b | ✗ provider_error |
| x.com | x | ✓ 95b | ✓ 246b | ✓ 625b | ✗ provider_error |
| x.com | x | ✓ 292b | ✓ 246b | ✓ 974b | ✗ provider_error |
| x.com | x | ✓ 344b | ✓ 246b | ✓ 2894b | ✗ provider_error |
| zapier.com | article | ✓ 458b | ✓ 525b | ✓ 3153b | ✗ provider_error |

## Detected patterns (for pipeline design)

1. **Local-only success**: 3 URLs — static HTML or special APIs (X CDN) suffice.
2. **Tab beats local**: 25 URLs — JS-rendered content; tab provider adds value.
3. **Jina rescue**: 13 URLs — remote fetch when local+tab fail.
4. **Cookie/consent false positives**: check boilerplate section — penalize snippets dominated by consent copy, not whole-page cookie keyword bans.
5. **X status URLs**: compare local (Twitter CDN) vs tab (often cookie modal) vs jina (noisy but complete).
6. **Do not LLM-gate every fetch** — use mechanical scores first; LLM only when providers disagree or boilerplate score is high.
