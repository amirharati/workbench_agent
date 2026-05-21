# Fetch experiment analysis

URLs tested: **100**
Providers: **local, tab, jina, markdown-new**

## Provider success rates

| Provider | usable | ok (http) | avg bytes | avg ms |
|----------|--------|-----------|-----------|--------|
| local | 63/100 | 67/100 | 23467 | 2609 |
| tab | 76/100 | 87/100 | 16743 | 5962 |
| jina | 83/100 | 91/100 | 24430 | 5060 |
| markdown-new | 0/100 | 0/100 | 0 | 515 |

## Failure reasons (by provider)

### local
- provider_error: 18
- parse_empty: 9
- network: 6
- too_short: 3
- matched block pattern /something went wrong/i: 1

### tab
- network: 7
- parse_empty: 5
- only 36 chars: 4
- matched block pattern /performing security verification/i: 3
- only 12 chars: 2
- timeout: 1
- too_short: 1
- only 26 chars: 1

### jina
- provider_error: 8
- matched block pattern /performing security verification/i: 3
- too_short: 2
- matched block pattern /sign in to continue/i: 1
- matched block pattern /just a moment\.\.\./i: 1
- timeout: 1
- matched block pattern /something went wrong/i: 1

### markdown-new
- provider_error: 100

## Provider agreement

How often providers agree on **usable** for the same URL:

- All core providers usable: **0** URLs
- Split (some usable, some not): **90** URLs
- None usable: **10** URLs

Largest usable snippet wins (rough tie-break):
- jina: 65 URLs
- local: 18 URLs
- tab: 7 URLs

## By source kind

- **article**: 98 URLs
- **video**: 1 URLs
- **x**: 1 URLs

## Boilerplate in usable snippets

Usable fetches whose snippet preview still matches cookie/login/consent patterns:

- **jina** · pornid.xxx · https://www.pornid.xxx/girl-licks-man-s-feet-and-allows-him-…
  `*   [Sign Up](https://www.pornid.xxx/girl-licks-man-s-feet-and-allows-him-to-put-leg-on-head.html#) …`
- **jina** · youtube.com · https://www.youtube.com/watch?v=7VzXHUTqE7E…
  `Liquid Cooling vs. Air Cooling Benchmark In-Depth (NH-D15, NZXT X62, & More) - YouTube  Back [![Imag…`
- **local** · notebooklm.google.com · https://notebooklm.google.com/notebook/dc15514a-e42e-472c-a9…
  `Not your computer? Use Guest mode to sign in privately. [Learn more about using Guest mode](https://…`
- **tab** · notebooklm.google.com · https://notebooklm.google.com/notebook/dc15514a-e42e-472c-a9…
  `Not your computer? Use Guest mode to sign in privately. [Learn more about using Guest mode](https://…`
- **local** · marktechpost.com · https://www.marktechpost.com/2023/02/22/meet-resmem-a-new-ai…
  `Modern big neural networks’ phenomenal results in generalizing new data and tasks have been attribut…`
- **tab** · marktechpost.com · https://www.marktechpost.com/2023/02/22/meet-resmem-a-new-ai…
  `Modern big neural networks’ phenomenal results in generalizing new data and tasks have been attribut…`
- **jina** · marktechpost.com · https://www.marktechpost.com/2023/02/22/meet-resmem-a-new-ai…
  `[![Image 2: Logo](https://www.marktechpost.com/wp-content/uploads/2025/09/272x90-300x99.png)News Hub…`
- **jina** · ebuyer.com · https://www.ebuyer.com/blog/2021/03/what-is-the-nvidia-shiel…
  `[GoToContentActionLink](https://www.ebuyer.com/blog/2021/03/what-is-the-nvidia-shield-and-what-does-…`
- **tab** · x.com · https://x.com/milan_milanovic/status/1706601674293293183…
  `Did someone say … cookies? X and its partners use cookies to provide you with a better, safer and fa…`
- **jina** · memoryexpress.com · https://www.memoryexpress.com/Store/Location/ONETO…
  `**Site** Navigation   [](https://www.memoryexpress.com/Store/Location/ONETO#Close)   Welcome   *   […`
- **jina** · producthunt.com · https://www.producthunt.com/products/buildpad/alternatives…
  `[](https://www.producthunt.com/)  *   [Best Products](https://www.producthunt.com/categories?ref=hea…`
- **tab** · silentpc.com · https://silentpc.com/case-insulation…
  `Your Source for Custom SILENT PCs.  Your Source for Custom SILENT PCs. We sell **ultra-quiet, high-e…`
- **jina** · silentpc.com · https://silentpc.com/case-insulation…
  `This website uses cookies to ensure you get the best experience on our website. [Learn more](https:/…`
- **tab** · optiontracker.io · https://optiontracker.io…
  `This website uses cookies to enhance the user experience. By continuing to use this site, you consen…`
- **jina** · optiontracker.io · https://optiontracker.io…
  `This website uses cookies to enhance the user experience. By continuing to use this site, you consen…`
- **jina** · aicofounder.com · https://aicofounder.com…
  `[![Image 42: aicofounder.com logo](https://aicofounder.com/assets/aicofounder-logo.svg)](https://aic…`
- **tab** · towardsdatascience.com · https://towardsdatascience.com/implementing-visualttransform…
  `We value your privacy  We use cookies to enhance your browsing experience, serve personalised ads or…`
- **jina** · towardsdatascience.com · https://towardsdatascience.com/implementing-visualttransform…
  `We value your privacy  We use cookies to enhance your browsing experience, serve personalised ads or…`
- **tab** · chromewebstore.google.com · https://chromewebstore.google.com/detail/supademo-ai-interac…
  `We use [cookies](https://policies.google.com/technologies/cookies?hl=en-US&utm_source=ucb) and data …`
- **jina** · deepinfra.com · https://deepinfra.com…
  `We use essential cookies to make our site work. With your consent, we may also use non-essential coo…`

## Per-URL summary

| Host | Kind | local | tab | jina | markdown-new |
|------|------|---|---|---|---|
| 100ms.live | article | ✓ 12143b | ✓ 12143b | ✓ 12430b | ✗ provider_error |
| saltedmango.atlassian.ne | article | ✗ parse_empty | ✗ parse_empty | ✓ 1529b | ✗ provider_error |
| pornid.xxx | article | ✓ 546b | ✓ 546b | ✓ 28290b | ✗ provider_error |
| robotwealth.com | article | ✓ 2807b | ✓ 2807b | ✓ 2708b | ✗ provider_error |
| app.clickup.com | article | ✓ 896b | ✓ 130b | ✓ 895b | ✗ provider_error |
| youtube.com | video | ✗ parse_empty | ✓ 9594b | ✓ 47211b | ✗ provider_error |
| probabilitycourse.com | article | ✓ 192b | ✓ 192b | ✓ 27638b | ✗ provider_error |
| quantstart.com | article | ✓ 18483b | ✓ 18483b | ✓ 18483b | ✗ provider_error |
| run.ai | article | ✓ 11175b | ✓ 18645b | ✓ 17574b | ✗ provider_error |
| notebooklm.google.com | article | ✓ 150b | ✓ 150b | ✓ 1800b | ✗ provider_error |
| oreilly.com | article | ✓ 4440b | ✓ 4440b | ✓ 39065b | ✗ provider_error |
| jonathanhaidt.substack.c | article | ✓ 43169b | ✓ 43169b | ✓ 43609b | ✗ provider_error |
| phasrmedia.com | article | ✗ provider_error | ✗ parse_empty | ✗ too_short | ✗ provider_error |
| hashnode.com | article | ✗ too_short | ✓ 9946b | ✓ 56167b | ✗ provider_error |
| pymc.io | article | ✓ 106b | ✓ 106b | ✓ 6868b | ✗ provider_error |
| fmovies.to | article | ✗ network | ✗ network | ✗ provider_error | ✗ provider_error |
| assemblyai.com | article | ✓ 75843b | ✓ 76973b | ✓ 77413b | ✗ provider_error |
| ubiquitouslearning.githu | article | ✓ 208b | ✓ 208b | ✓ 2710b | ✗ provider_error |
| leetcode.com | article | ✗ provider_error | ✗ auth_required | ✗ auth_required | ✗ provider_error |
| linkedin.com | article | ✓ 2782b | ✗ parse_empty | ✗ auth_required | ✗ provider_error |
| marktechpost.com | article | ✓ 4273b | ✓ 4273b | ✓ 179959b | ✗ provider_error |
| indiehackers.com | article | ✓ 7082b | ✗ timeout | ✓ 55579b | ✗ provider_error |
| hetzner.com | article | ✓ 5587b | ✓ 5573b | ✓ 5547b | ✗ provider_error |
| intel.com | article | ✗ provider_error | ✓ 1400b | ✓ 74869b | ✗ provider_error |
| typedream.com | article | ✓ 9950b | ✓ 9950b | ✓ 10163b | ✗ provider_error |
| threadreaderapp.com | article | ✓ 13755b | ✓ 13755b | ✓ 14209b | ✗ provider_error |
| tabextend.com | article | ✓ 723b | ✓ 723b | ✓ 3706b | ✗ provider_error |
| pascio.gumroad.com | article | ✗ parse_empty | ✓ 5056b | ✓ 4983b | ✗ provider_error |
| eia.gov | article | ✓ 2076b | ✓ 2076b | ✓ 30057b | ✗ provider_error |
| ebuyer.com | article | ✗ provider_error | ✗ network | ✓ 14074b | ✗ provider_error |
| sites.google.com | article | ✓ 4756b | ✓ 4756b | ✓ 5517b | ✗ provider_error |
| iki.ai | article | ✓ 6563b | ✓ 2346b | ✓ 15603b | ✗ provider_error |
| x.com | x | ✓ 350b | ✓ 246b | ✓ 758b | ✗ provider_error |
| splurge.ai | article | ✗ too_short | ✗ too_short | ✗ too_short | ✗ provider_error |
| verywellhealth.com | article | ✗ provider_error | ✗ parse_empty | ✗ auth_required | ✗ provider_error |
| crossminds.ai | article | ✗ network | ✗ network | ✗ provider_error | ✗ provider_error |
| logseq.com | article | ✗ parse_empty | ✓ 2167b | ✓ 2193b | ✗ provider_error |
| chartmill.com | article | ✗ provider_error | ✓ 16722b | ✓ 16817b | ✗ provider_error |
| app.raindrop.io | article | ✗ parse_empty | ✓ 389b | ✓ 388b | ✗ provider_error |
| alphacephei.com | article | ✓ 24289b | ✓ 24289b | ✓ 25017b | ✗ provider_error |
| memoryexpress.com | article | ✗ provider_error | ✗ auth_required | ✓ 38625b | ✗ provider_error |
| blog.quantinsti.com | article | ✓ 3424b | ✓ 3424b | ✓ 3424b | ✗ provider_error |
| unix.stackexchange.com | article | ✗ provider_error | ✓ 2251b | ✓ 32558b | ✗ provider_error |
| newegg.ca | article | ✓ 11361b | ✓ 14647b | ✓ 182905b | ✗ provider_error |
| tradingview.com | article | ✓ 4718b | ✓ 4718b | ✓ 4711b | ✗ provider_error |
| developer.oanda.com | article | ✓ 3734b | ✓ 5174b | ✓ 5205b | ✗ provider_error |
| abnormalreturns.com | article | ✓ 1872b | ✓ 1872b | ✗ provider_error | ✗ provider_error |
| producthunt.com | article | ✗ provider_error | ✗ auth_required | ✓ 20945b | ✗ provider_error |
| codeless.co | article | ✓ 27190b | ✓ 27190b | ✓ 27888b | ✗ provider_error |
| silentpc.com | article | ✗ too_short | ✓ 4401b | ✓ 27236b | ✗ provider_error |
| techpowerup.com | article | ✓ 151b | ✓ 145b | ✓ 151b | ✗ provider_error |
| onnxruntime.ai | article | ✓ 2873b | ✓ 2873b | ✓ 2873b | ✗ provider_error |
| creativebloq.com | article | ✓ 36370b | ✓ 36364b | ✗ provider_error | ✗ provider_error |
| optiontracker.io | article | ✗ parse_empty | ✓ 9976b | ✓ 9934b | ✗ provider_error |
| github.com | article | ✓ 711b | ✓ 711b | ✓ 15447b | ✗ provider_error |
| avalonaccounting.ca | article | ✓ 16802b | ✓ 16802b | ✓ 16828b | ✗ provider_error |
| leverageedu.com | article | ✗ provider_error | ✓ 359b | ✓ 30784b | ✗ provider_error |
| semianalysis.com | article | ✓ 31766b | ✗ parse_empty | ✓ 31765b | ✗ provider_error |
| tecmint.com | article | ✓ 8101b | ✓ 8101b | ✓ 8260b | ✗ provider_error |
| computerinfobits.com | article | ✗ provider_error | ✓ 1068b | ✗ timeout | ✗ provider_error |
| google.com | article | ✗ parse_empty | ✓ 532b | ✓ 725b | ✗ provider_error |
| blueshift.quantinsti.com | article | ✗ parse_empty | ✓ 2110b | ✓ 2026b | ✗ provider_error |
| aicofounder.com | article | ✓ 9679b | ✓ 9679b | ✓ 46016b | ✗ provider_error |
| secondcell.ca | article | ✓ 6258b | ✓ 6258b | ✓ 42993b | ✗ provider_error |
| cleanmymac.com | article | ✓ 6318b | ✓ 6343b | ✓ 6362b | ✗ provider_error |
| perforce.com | article | ✓ 12295b | ✓ 12581b | ✓ 13062b | ✗ provider_error |
| immigrationnewscanada.ca | article | ✗ auth_required | ✗ parse_empty | ✗ auth_required | ✗ provider_error |
| iporntv.net | article | ✗ provider_error | ✗ parse_empty | ✓ 23856b | ✗ provider_error |
| carbmanager.com | article | ✓ 14513b | ✓ 14513b | ✓ 14523b | ✗ provider_error |
| alphapc.ca | article | ✓ 4807b | ✓ 4807b | ✓ 4982b | ✗ provider_error |
| wondergressive.com | article | ✓ 41089b | ✗ parse_empty | ✓ 41169b | ✗ provider_error |
| udemy.com | article | ✗ provider_error | ✓ 160b | ✗ auth_required | ✗ provider_error |
| introjs.com | article | ✓ 298b | ✓ 298b | ✓ 6601b | ✗ provider_error |
| technical.traders.com | article | ✓ 14937b | ✓ 14937b | ✓ 14906b | ✗ provider_error |
| gabymora.com.au | article | ✓ 4970b | ✗ parse_empty | ✓ 4975b | ✗ provider_error |
| towardsdatascience.com | article | ✓ 6919b | ✓ 316b | ✓ 33112b | ✗ provider_error |
| lambdatest.com | article | ✓ 31100b | ✓ 31100b | ✓ 377064b | ✗ provider_error |
| arxiv.org | article | ✗ network | ✗ network | ✓ 42729b | ✗ provider_error |
| chromewebstore.google.co | article | ✓ 9822b | ✓ 1375b | ✓ 10805b | ✗ provider_error |
| ekwb.com | article | ✓ 4375b | ✓ 4375b | ✗ auth_required | ✗ provider_error |
| marketdata.app | article | ✗ provider_error | ✓ 87b | ✓ 10890b | ✗ provider_error |
| quantconnect.com | article | ✓ 811b | ✓ 2040b | ✓ 25232b | ✗ provider_error |
| dailystoic.com | article | ✓ 54372b | ✓ 54460b | ✓ 60248b | ✗ provider_error |
| idph.iowa.gov | article | ✓ 7368b | ✓ 7368b | ✓ 6880b | ✗ provider_error |
| scribehow.com | article | ✗ parse_empty | ✗ parse_empty | ✓ 674b | ✗ provider_error |
| stable-baselines3.readth | article | ✓ 1170b | ✓ 213b | ✓ 6652b | ✗ provider_error |
| qmr.ai | article | ✗ network | ✗ network | ✗ provider_error | ✗ provider_error |
| libgen.rs | article | ✗ network | ✗ network | ✗ provider_error | ✗ provider_error |
| lilianweng.github.io | article | ✓ 90201b | ✓ 58734b | ✓ 70660b | ✗ provider_error |
| docs.google.com | article | ✗ provider_error | ✗ parse_empty | ✓ 1868b | ✗ provider_error |
| theverge.com | article | ✓ 5473b | ✓ 1971b | ✗ provider_error | ✗ provider_error |
| dipseastories.com | article | ✗ provider_error | ✓ 140b | ✓ 601b | ✗ provider_error |
| theaisummer.com | article | ✓ 42481b | ✓ 42481b | ✓ 46058b | ✗ provider_error |
| wwww | article | ✗ network | ✗ network | ✗ provider_error | ✗ provider_error |
| vagrantup.com | article | ✓ 2899b | ✓ 2899b | ✓ 2803b | ✗ provider_error |
| gettoby.com | article | ✓ 137b | ✗ parse_empty | ✓ 508b | ✗ provider_error |
| deepinfra.com | article | ✓ 305b | ✓ 305b | ✓ 25287b | ✗ provider_error |
| cloudways.com | article | ✗ provider_error | ✓ 11566b | ✓ 56945b | ✗ provider_error |
| financialwisdomforum.org | article | ✗ provider_error | ✓ 163b | ✓ 48688b | ✗ provider_error |
| qoppac.blogspot.com | article | ✓ 1804b | ✓ 1804b | ✓ 45977b | ✗ provider_error |

## Detected patterns (for pipeline design)

1. **Local-only success**: 1 URLs — static HTML or special APIs (X CDN) suffice.
2. **Tab beats local**: 19 URLs — JS-rendered content; tab provider adds value.
3. **Jina rescue**: 8 URLs — remote fetch when local+tab fail.
4. **Cookie/consent false positives**: check boilerplate section — penalize snippets dominated by consent copy, not whole-page cookie keyword bans.
5. **X status URLs**: compare local (Twitter CDN) vs tab (often cookie modal) vs jina (noisy but complete).
6. **Do not LLM-gate every fetch** — use mechanical scores first; LLM only when providers disagree or boilerplate score is high.
