import {
  clearWorkingSetForTests,
  evictWorkingSetIfNeeded,
  getWorkingSetStats,
  lookupWorkingSetByUrl,
  markUrlDurable,
  pinSavedItem,
  syncOpenTabUrls,
} from './workingSetCache';

function item(id: string, url: string) {
  return {
    id,
    url,
    title: id,
    collectionIds: [],
    tags: [],
    created_at: 1,
    updated_at: 1,
    source: 'manual' as const,
  };
}

clearWorkingSetForTests();

pinSavedItem('https://example.com/a?utm_source=x', item('1', 'https://example.com/a'), {
  durable: false,
});
const hit = lookupWorkingSetByUrl('https://example.com/a');
if (!hit || hit[0]?.id !== '1') throw new Error('expected working-set hit after pin');

markUrlDurable('https://example.com/a');
syncOpenTabUrls([]);
// Fill past cap with durable closed-tab entries
for (let i = 0; i < 210; i++) {
  pinSavedItem(`https://example.com/p/${i}`, item(`p${i}`, `https://example.com/p/${i}`), {
    durable: true,
  });
}
evictWorkingSetIfNeeded();
const stats = getWorkingSetStats();
if (stats.size > 200) throw new Error(`expected size <= 200, got ${stats.size}`);

// Non-durable recent save must survive eviction pressure
pinSavedItem('https://keep.example/pending', item('keep', 'https://keep.example/pending'), {
  durable: false,
});
for (let i = 0; i < 50; i++) {
  pinSavedItem(`https://example.com/q/${i}`, item(`q${i}`, `https://example.com/q/${i}`), {
    durable: true,
  });
}
evictWorkingSetIfNeeded();
const kept = lookupWorkingSetByUrl('https://keep.example/pending');
if (!kept || kept[0]?.id !== 'keep') throw new Error('non-durable entry was evicted');

clearWorkingSetForTests();
console.log('workingSetCache.test.ts: all tests passed');
