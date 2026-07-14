import { fetchXThreadFromFx } from './src/lib/enrichment/providers/xThread';
(async () => {
  const r = await fetchXThreadFromFx('2064823512104390983', { fallbackUser: 'arckollect', bookmarkUrl: 'https://x.com/arckollect/status/2064823512104390983', linkFollow: false });
  if (!r.ok) { console.log('FAIL', r.errorCode, r.unavailable); return; }
  console.log('parts:', r.partCount, '| source:', r.fetchSourceId, '| title:', r.title);
  console.log('----- markdown -----');
  console.log(r.markdown);
})();
