/**
 * Paste in DevTools console on extension dashboard after v5 upgrade.
 * Verifies item_enrichment store and enrichment-cache folder layout.
 */
(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('personal-tools-db');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  console.log('DB version:', db.version);
  console.log('Stores:', [...db.objectStoreNames]);
  const hasEnrich = db.objectStoreNames.contains('item_enrichment');
  console.log('item_enrichment:', hasEnrich);
  if (hasEnrich) {
    const tx = db.transaction('item_enrichment', 'readonly');
    const all = await new Promise((res, rej) => {
      const r = tx.objectStore('item_enrichment').getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    console.log('enrichment rows:', all.length, all.slice(0, 3));
  }
  db.close();
})();
