# Fetch experiment analysis

URLs tested: **100**
Providers: **local, tab, jina, markdown-new**

## Provider success rates

| Provider | usable | ok (http) | avg bytes | avg ms |
|----------|--------|-----------|-----------|--------|
| local | 64/100 | 69/100 | 11881 | 2420 |
| tab | 78/100 | 88/100 | 18205 | 5843 |
| jina | 79/100 | 89/100 | 19173 | 4184 |
| markdown-new | 0/100 | 0/100 | 0 | 544 |

## Failure reasons (by provider)

### local
- provider_error: 15
- parse_empty: 8
- network: 6
- too_short: 4
- rate_limited: 2
- matched block pattern /something went wrong/i: 1

### tab
- parse_empty: 6
- network: 5
- only 36 chars: 3
- matched block pattern /performing security verification/i: 2
- timeout: 1
- matched block pattern /you'?ve been blocked by network security/i: 1
- weak_title: 1
- only 12 chars: 1
- too_short: 1
- only 26 chars: 1

### jina
- provider_error: 7
- matched block pattern /performing security verification/i: 3
- too_short: 3
- network: 2
- timeout: 2
- matched block pattern /you'?ve been blocked by network security/i: 1
- matched block pattern /people on x are the first to know/i: 1
- matched block pattern /just a moment\.\.\./i: 1
- matched block pattern /something went wrong/i: 1

### markdown-new
- provider_error: 100

## Provider agreement

How often providers agree on **usable** for the same URL:

- All core providers usable: **0** URLs
- Split (some usable, some not): **88** URLs
- None usable: **12** URLs

Largest usable snippet wins (rough tie-break):
- jina: 58 URLs
- local: 17 URLs
- tab: 13 URLs

## By source kind

- **article**: 100 URLs

## Boilerplate in usable snippets

Usable fetches whose snippet preview still matches cookie/login/consent patterns:

- **tab** · silentpc.com · https://silentpc.com/case-insulation…
  `Your Source for Custom SILENT PCs.  Your Source for Custom SILENT PCs. We sell **ultra-quiet, high-e…`
- **tab** · linkedin.com · https://www.linkedin.com/posts/generative-artificial-intelli…
  `Select Accept to consent or Reject to decline non-essential cookies for this use. You can update you…`
- **jina** · deepinfra.com · https://deepinfra.com…
  `We use essential cookies to make our site work. With your consent, we may also use non-essential coo…`
- **tab** · towardsdatascience.com · https://towardsdatascience.com/implementing-visualttransform…
  `We value your privacy  We use cookies to enhance your browsing experience, serve personalised ads or…`
- **jina** · towardsdatascience.com · https://towardsdatascience.com/implementing-visualttransform…
  `We value your privacy  We use cookies to enhance your browsing experience, serve personalised ads or…`
- **local** · indiehackers.com · https://www.indiehackers.com/post/lets-talk-about-pain-point…
  `Hey,  Jakob from [Opportunities.so](https://opportunities.so/) here with another report.  What all e…`
- **jina** · indiehackers.com · https://www.indiehackers.com/post/lets-talk-about-pain-point…
  `Hey,  Jakob from [Opportunities.so](https://opportunities.so/) here with another report.  What all e…`
- **local** · arcade.software · https://www.arcade.software/pricing…
  `## Pricing that grows with your storytelling.  Monthly  Yearly  \-15%  For you  Free  Try Arcade and…`
- **tab** · arcade.software · https://www.arcade.software/pricing…
  `## Pricing that grows with your storytelling.  Monthly  Yearly  \-15%  For you  Free  Try Arcade and…`
- **jina** · arcade.software · https://www.arcade.software/pricing…
  `## Pricing that grows with your storytelling.  Monthly  Yearly  -15%  For you  Free  Try Arcade and …`
- **tab** · chromewebstore.google.com · https://chromewebstore.google.com/detail/supademo-ai-interac…
  `We use [cookies](https://policies.google.com/technologies/cookies?hl=en-US&utm_source=ucb) and data …`
- **jina** · us2.make.com · https://us2.make.com/organization/2835281/dashboard…
  `Email*   Value must not be empty.  [Forgot password?](https://us2.make.com/en/lost-password)  Passwo…`
- **tab** · pornid.xxx · https://www.pornid.xxx/girl-licks-man-s-feet-and-allows-him-…
  `Advertisement  Video by [Hot Wife XXX](https://www.pornid.xxx/cs/hot-wife-xxx/)  [Exclusive PornID O…`
- **jina** · pornid.xxx · https://www.pornid.xxx/girl-licks-man-s-feet-and-allows-him-…
  `*   [Sign Up](https://www.pornid.xxx/girl-licks-man-s-feet-and-allows-him-to-put-leg-on-head.html#) …`
- **jina** · producthunt.com · https://www.producthunt.com/products/buildpad/alternatives…
  `[](https://www.producthunt.com/)  *   [Best Products](https://www.producthunt.com/categories?ref=hea…`
- **tab** · udemy.com · https://www.udemy.com/course/algorithmic-cryptocurrency-trad…
  `By clicking ”OK”, you agree to the storing of cookies on your device to enhance site navigation, ana…`
- **jina** · aicofounder.com · https://aicofounder.com…
  `[![Image 42: aicofounder.com logo](https://aicofounder.com/assets/aicofounder-logo.svg)](https://aic…`
- **tab** · iki.ai · https://iki.ai…
  `We use cookies to enhance your browsing experience, serve personalised ads or content, and analyse o…`
- **jina** · iki.ai · https://iki.ai…
  `We value your privacy  We use cookies to enhance your browsing experience, serve personalised ads or…`
- **jina** · grok.com · https://grok.com/c/18c55632-2419-421d-8057-e57efdcbea48…
  `[](https://grok.com/)   Fast   ## Privacy Preference Center  When you visit any website, it may stor…`
- **local** · mail.google.com · https://mail.google.com/mail/u/0…
  `Not your computer? Use Guest mode to sign in privately. [Learn more about using Guest mode](https://…`
- **tab** · mail.google.com · https://mail.google.com/mail/u/0…
  `Not your computer? Use Guest mode to sign in privately. [Learn more about using Guest mode](https://…`
- **local** · marktechpost.com · https://www.marktechpost.com/2023/02/22/meet-resmem-a-new-ai…
  `Modern big neural networks’ phenomenal results in generalizing new data and tasks have been attribut…`
- **tab** · marktechpost.com · https://www.marktechpost.com/2023/02/22/meet-resmem-a-new-ai…
  `Modern big neural networks’ phenomenal results in generalizing new data and tasks have been attribut…`
- **jina** · marktechpost.com · https://www.marktechpost.com/2023/02/22/meet-resmem-a-new-ai…
  `[![Image 2: Logo](https://www.marktechpost.com/wp-content/uploads/2025/09/272x90-300x99.png)News Hub…`
- **jina** · memoryexpress.com · https://www.memoryexpress.com/Store/Location/ONETO…
  `**Site** Navigation   [](https://www.memoryexpress.com/Store/Location/ONETO#Close)   Welcome   *   […`
- **jina** · refact.ai · https://refact.ai/pricing…
  `Refact Cloud is shutting down soon [Read More](https://refact.ai/blog/2026/refact-cloud-is-shutting-…`

## Per-URL summary

| Host | Kind | local | tab | jina | markdown-new |
|------|------|---|---|---|---|
| spinningup.openai.com | article | ✓ 33181b | ✓ 33181b | ✓ 35419b | ✗ provider_error |
| qoppac.blogspot.com | article | ✓ 35906b | ✓ 35906b | ✓ 35490b | ✗ provider_error |
| harpa.ai | article | ✓ 12134b | ✓ 12134b | ✓ 12334b | ✗ provider_error |
| puzzled-savory-63c.notio | article | ✗ parse_empty | ✗ timeout | ✓ 3778b | ✗ provider_error |
| leetcode.com | article | ✗ provider_error | ✓ 2079b | ✗ auth_required | ✗ provider_error |
| technical.traders.com | article | ✓ 14937b | ✓ 14937b | ✓ 14906b | ✗ provider_error |
| vectorbt.dev | article | ✓ 15752b | ✓ 15791b | ✓ 15753b | ✗ provider_error |
| silentpc.com | article | ✗ too_short | ✓ 4401b | ✓ 26688b | ✗ provider_error |
| typedream.com | article | ✓ 9950b | ✓ 9950b | ✓ 10163b | ✗ provider_error |
| otio.ai | article | ✓ 9723b | ✓ 9723b | ✓ 10003b | ✗ provider_error |
| linkedin.com | article | ✓ 1995b | ✓ 489b | ✓ 4463b | ✗ provider_error |
| dipseastories.com | article | ✓ 10497b | ✓ 10497b | ✓ 16885b | ✗ provider_error |
| optiontracker.io | article | ✗ parse_empty | ✗ parse_empty | ✗ network | ✗ provider_error |
| idph.iowa.gov | article | ✓ 7368b | ✓ 7368b | ✓ 6880b | ✗ provider_error |
| deepinfra.com | article | ✓ 305b | ✓ 305b | ✓ 25247b | ✗ provider_error |
| leverageedu.com | article | ✗ provider_error | ✓ 359b | ✓ 30784b | ✗ provider_error |
| gabymora.com.au | article | ✓ 4970b | ✗ parse_empty | ✓ 4975b | ✗ provider_error |
| ekwb.com | article | ✓ 4375b | ✓ 4375b | ✗ auth_required | ✗ provider_error |
| dataforseo.com | article | ✓ 11956b | ✓ 12423b | ✓ 14625b | ✗ provider_error |
| capacities.io | article | ✓ 458b | ✓ 458b | ✓ 4302b | ✗ provider_error |
| quantstart.com | article | ✓ 18483b | ✓ 18483b | ✓ 18483b | ✗ provider_error |
| example.com | article | ✓ 149b | ✓ 149b | ✓ 149b | ✗ provider_error |
| nzxt.com | article | ✗ provider_error | ✓ 7150b | ✗ provider_error | ✗ provider_error |
| perforce.com | article | ✓ 12295b | ✓ 12581b | ✓ 13062b | ✗ provider_error |
| docs.sylabs.io | article | ✓ 23673b | ✓ 23673b | ✓ 25375b | ✗ provider_error |
| towardsdatascience.com | article | ✓ 6919b | ✓ 316b | ✓ 33112b | ✗ provider_error |
| reddit.com | article | ✗ provider_error | ✗ auth_required | ✗ auth_required | ✗ provider_error |
| quantconnect.com | article | ✓ 9632b | ✓ 9632b | ✓ 9975b | ✗ provider_error |
| onnxruntime.ai | article | ✓ 2873b | ✓ 2873b | ✓ 2873b | ✗ provider_error |
| intel.com | article | ✗ provider_error | ✓ 1400b | ✓ 74869b | ✗ provider_error |
| huggingface.co | article | ✓ 11506b | ✓ 11506b | ✓ 12292b | ✗ provider_error |
| raindrop.io | article | ✓ 10618b | ✓ 10618b | ✓ 11039b | ✗ provider_error |
| read.readwise.io | article | ✗ too_short | ✗ parse_empty | ✗ too_short | ✗ provider_error |
| stable-baselines3.readth | article | ✓ 1170b | ✓ 213b | ✓ 6262b | ✗ provider_error |
| abnormalreturns.com | article | ✓ 1872b | ✓ 1872b | ✗ provider_error | ✗ provider_error |
| storylane.io | article | ✓ 10969b | ✓ 10969b | ✓ 11108b | ✗ provider_error |
| libgen.rs | article | ✗ network | ✗ network | ✗ provider_error | ✗ provider_error |
| indiehackers.com | article | ✓ 10745b | ✓ 748b | ✓ 10735b | ✗ provider_error |
| theaisummer.com | article | ✓ 42481b | ✓ 42481b | ✓ 46058b | ✗ provider_error |
| convexvalue.com | article | ✓ 1089b | ✓ 1034b | ✓ 1031b | ✗ provider_error |
| developer.oanda.com | article | ✓ 3734b | ✓ 5174b | ✓ 4637b | ✗ provider_error |
| brython.info | article | ✗ too_short | ✓ 1250b | ✓ 1248b | ✗ provider_error |
| gettoby.com | article | ✓ 137b | ✗ parse_empty | ✓ 508b | ✗ provider_error |
| run.ai | article | ✓ 11175b | ✓ 18645b | ✓ 17574b | ✗ provider_error |
| ideaflow.io | article | ✓ 2637b | ✓ 2637b | ✓ 2647b | ✗ provider_error |
| marketdata.app | article | ✗ provider_error | ✓ 87b | ✓ 10890b | ✗ provider_error |
| t.co | article | ✗ parse_empty | ✗ weak_title | ✗ auth_required | ✗ provider_error |
| cobusgreyling.me | article | ✗ provider_error | ✓ 120b | ✓ 120b | ✗ provider_error |
| probabilitycourse.com | article | ✓ 192b | ✓ 192b | ✓ 27638b | ✗ provider_error |
| arcade.software | article | ✓ 33571b | ✓ 33625b | ✓ 36082b | ✗ provider_error |
| wwww | article | ✗ network | ✗ network | ✗ provider_error | ✗ provider_error |
| chromewebstore.google.co | article | ✓ 9822b | ✓ 1375b | ✓ 10805b | ✗ provider_error |
| flo.health | article | ✓ 9819b | ✓ 9819b | ✗ timeout | ✗ provider_error |
| h5p.org | article | ✓ 3887b | ✓ 3887b | ✓ 41905b | ✗ provider_error |
| github.com | article | ✓ 6381b | ✓ 6381b | ✓ 6622b | ✗ provider_error |
| financialwisdomforum.org | article | ✗ rate_limited | ✓ 163b | ✓ 48688b | ✗ provider_error |
| medium.com | article | ✓ 1001b | ✓ 1074b | ✗ auth_required | ✗ provider_error |
| us2.make.com | article | ✗ parse_empty | ✗ parse_empty | ✓ 4783b | ✗ provider_error |
| app.clickup.com | article | ✓ 896b | ✓ 200b | ✓ 834b | ✗ provider_error |
| computerinfobits.com | article | ✗ provider_error | ✓ 1068b | ✗ timeout | ✗ provider_error |
| pornid.xxx | article | ✓ 546b | ✓ 1146b | ✓ 28290b | ✗ provider_error |
| hetzner.com | article | ✓ 5587b | ✓ 5572b | ✓ 5534b | ✗ provider_error |
| fmovies.to | article | ✗ network | ✗ network | ✗ provider_error | ✗ provider_error |
| pascio.gumroad.com | article | ✗ parse_empty | ✓ 3591b | ✓ 4983b | ✗ provider_error |
| eia.gov | article | ✓ 2076b | ✓ 2076b | ✓ 30057b | ✗ provider_error |
| semianalysis.com | article | ✗ rate_limited | ✗ parse_empty | ✓ 31765b | ✗ provider_error |
| verywellhealth.com | article | ✗ provider_error | ✗ parse_empty | ✗ auth_required | ✗ provider_error |
| producthunt.com | article | ✗ provider_error | ✗ auth_required | ✓ 20945b | ✗ provider_error |
| phasrmedia.com | article | ✗ provider_error | ✗ parse_empty | ✗ too_short | ✗ provider_error |
| splurge.ai | article | ✗ too_short | ✗ too_short | ✗ too_short | ✗ provider_error |
| dataorigami.net | article | ✗ network | ✗ network | ✗ provider_error | ✗ provider_error |
| udemy.com | article | ✗ provider_error | ✓ 198b | ✓ 1218b | ✗ provider_error |
| carbmanager.com | article | ✓ 14513b | ✓ 14513b | ✓ 14533b | ✗ provider_error |
| 100ms.live | article | ✓ 12143b | ✓ 12143b | ✓ 12430b | ✗ provider_error |
| opengrants.io | article | ✗ provider_error | ✓ 80b | ✓ 2386b | ✗ provider_error |
| newegg.ca | article | ✓ 11361b | ✓ 14647b | ✓ 182905b | ✗ provider_error |
| aicofounder.com | article | ✓ 9679b | ✓ 9679b | ✓ 46016b | ✗ provider_error |
| iki.ai | article | ✓ 6563b | ✓ 172b | ✓ 35979b | ✗ provider_error |
| grok.com | article | ✗ parse_empty | ✗ parse_empty | ✓ 2882b | ✗ provider_error |
| bzarg.com | article | ✓ 25582b | ✓ 24903b | ✓ 227530b | ✗ provider_error |
| mail.google.com | article | ✓ 150b | ✓ 150b | ✓ 427b | ✗ provider_error |
| blueshift.quantinsti.com | article | ✗ parse_empty | ✓ 2110b | ✓ 2026b | ✗ provider_error |
| immigrationnewscanada.ca | article | ✗ auth_required | ✗ parse_empty | ✗ auth_required | ✗ provider_error |
| techpowerup.com | article | ✓ 151b | ✓ 145b | ✓ 151b | ✗ provider_error |
| assemblyai.com | article | ✓ 75843b | ✓ 76973b | ✓ 77413b | ✗ provider_error |
| introjs.com | article | ✓ 298b | ✓ 298b | ✓ 6601b | ✗ provider_error |
| theverge.com | article | ✓ 5473b | ✓ 5561b | ✗ provider_error | ✗ provider_error |
| nutrisense.io | article | ✓ 21370b | ✓ 23126b | ✓ 23164b | ✗ provider_error |
| jonathanhaidt.substack.c | article | ✓ 43169b | ✓ 43169b | ✓ 43609b | ✗ provider_error |
| marktechpost.com | article | ✓ 4273b | ✓ 4273b | ✓ 179959b | ✗ provider_error |
| devblogs.microsoft.com | article | ✓ 13947b | ✓ 15027b | ✓ 14308b | ✗ provider_error |
| tradingview.com | article | ✓ 4718b | ✓ 4718b | ✓ 4711b | ✗ provider_error |
| enjeeneer.io | article | ✗ network | ✗ network | ✓ 82292b | ✗ provider_error |
| memoryexpress.com | article | ✗ network | ✗ auth_required | ✓ 38813b | ✗ provider_error |
| refact.ai | article | ✗ provider_error | ✓ 106b | ✓ 1668b | ✗ provider_error |
| ubiquitouslearning.githu | article | ✓ 208b | ✓ 208b | ✓ 2710b | ✗ provider_error |
| docs.flutter.dev | article | ✓ 6773b | ✓ 6773b | ✗ network | ✗ provider_error |
| app.raindrop.io | article | ✗ parse_empty | ✓ 389b | ✓ 388b | ✗ provider_error |
| vagrantup.com | article | ✓ 2899b | ✓ 2899b | ✓ 2803b | ✗ provider_error |
| docs.google.com | article | ✗ provider_error | ✗ parse_empty | ✓ 1798b | ✗ provider_error |

## Detected patterns (for pipeline design)

1. **Local-only success**: 0 URLs — static HTML or special APIs (X CDN) suffice.
2. **Tab beats local**: 16 URLs — JS-rendered content; tab provider adds value.
3. **Jina rescue**: 8 URLs — remote fetch when local+tab fail.
4. **Cookie/consent false positives**: check boilerplate section — penalize snippets dominated by consent copy, not whole-page cookie keyword bans.
5. **X status URLs**: compare local (Twitter CDN) vs tab (often cookie modal) vs jina (noisy but complete).
6. **Do not LLM-gate every fetch** — use mechanical scores first; LLM only when providers disagree or boilerplate score is high.
