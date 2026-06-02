// Run this in Chrome DevTools Console (on the extension tab) to verify migration v4.
//
// IMPORTANT: Paste EVERYTHING below this comment — NOT the file path.
// Typing "data/migrations/..." alone causes: ReferenceError: data is not defined
//
// Open the file in your editor, Select All, Copy, paste into Console, Enter.

(async () => {
  const dbName = 'personal-tools-db';
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  console.log('=== Migration v4 Verification ===\n');
  console.log(`Database Version: ${db.version} (should be 4)`);
  console.log(`\nStores: ${Array.from(db.objectStoreNames).join(', ')}`);
  
  // Check items
  const items = await getAllFromStore(db, 'items');
  console.log(`\n✅ Items: ${items.length} total`);
  
  // Check for placements
  const withPlacements = items.filter(i => i.placements && Object.keys(i.placements).length > 0);
  const multiPlacement = items.filter(i => i.placements && Object.keys(i.placements).length > 1);
  console.log(`   With placements: ${withPlacements.length}`);
  console.log(`   Multi-collection: ${multiPlacement.length}`);
  
  // Check for normalized URLs
  const withUrlRaw = items.filter(i => i.urlRaw);
  console.log(`   With urlRaw (tracking stripped): ${withUrlRaw.length}`);
  
  // Check for duplicates by URL
  const urlCounts = new Map();
  items.forEach(item => {
    if (item.url) {
      urlCounts.set(item.url, (urlCounts.get(item.url) || 0) + 1);
    }
  });
  const duplicates = [...urlCounts.entries()].filter(([url, count]) => count > 1);
  console.log(`   Duplicate URLs remaining: ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.log('   Duplicates:', duplicates.slice(0, 5));
  }
  
  // Sample item
  if (items.length > 0) {
    const sample = items[0];
    console.log(`\n   Sample item:`);
    console.log(`     - id: ${sample.id}`);
    console.log(`     - url: ${sample.url}`);
    console.log(`     - urlRaw: ${sample.urlRaw || 'not set'}`);
    console.log(`     - collectionIds: [${(sample.collectionIds || []).join(', ')}]`);
    console.log(`     - placements: ${sample.placements ? Object.keys(sample.placements).length : 0}`);
    if (sample.placements) {
      const firstPlacement = Object.values(sample.placements)[0];
      if (firstPlacement) {
        console.log(`     - first placement notes: ${firstPlacement.notes || 'none'}`);
        console.log(`     - first placement source: ${firstPlacement.source || 'unknown'}`);
      }
    }
  }
  
  // Check workspaces for deduplication
  const workspaces = await getAllFromStore(db, 'workspaces');
  console.log(`\n✅ Workspaces: ${workspaces.length} total`);
  
  let totalTabs = 0;
  let duplicateTabsInWorkspaces = 0;
  for (const ws of workspaces) {
    const seenUrls = new Set();
    for (const win of (ws.windows || [])) {
      for (const tab of (win.tabs || [])) {
        totalTabs++;
        if (tab.url) {
          if (seenUrls.has(tab.url)) {
            duplicateTabsInWorkspaces++;
          }
          seenUrls.add(tab.url);
        }
      }
    }
  }
  console.log(`   Total tabs across workspaces: ${totalTabs}`);
  console.log(`   Duplicate tabs in workspaces: ${duplicateTabsInWorkspaces}`);

  console.log(`\n=== Summary ===`);
  const allGood = 
    db.version === 4 &&
    withPlacements.length === items.length &&
    duplicates.length === 0;
  
  console.log(allGood ? '✅ Migration successful!' : '⚠️ Some issues detected - check details above');
  
  db.close();
})();

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve([]);
      return;
    }
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
