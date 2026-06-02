// Run this in Chrome DevTools Console to verify migration v3
// Copy-paste the entire script and run it

(async () => {
  const dbName = 'personal-tools-db';
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  console.log('=== Migration v3 Verification ===\n');
  console.log(`Database Version: ${db.version} (should be 3)`);
  console.log(`\nStores: ${Array.from(db.objectStoreNames).join(', ')}`);
  
  // Check projects
  const projects = await getAllFromStore(db, 'projects');
  const defaultProject = projects.find(p => p.id === 'project_all');
  console.log(`\n✅ Projects: ${projects.length} total`);
  console.log(`   Default project exists: ${defaultProject ? 'YES' : 'NO'}`);
  if (defaultProject) {
    console.log(`   Default project name: "${defaultProject.name}"`);
    console.log(`   isDefault: ${defaultProject.isDefault}`);
  }

  // Check collections
  const collections = await getAllFromStore(db, 'collections');
  const migrated = collections.filter(c => 
    c.primaryProjectId && Array.isArray(c.projectIds) && typeof c.updated_at === 'number'
  );
  const defaultCollection = collections.find(c => c.id === 'collection_project_all_unsorted');
  console.log(`\n✅ Collections: ${collections.length} total`);
  console.log(`   Migrated: ${migrated.length}/${collections.length}`);
  console.log(`   Default "Unsorted" exists: ${defaultCollection ? 'YES' : 'NO'}`);
  if (collections.length > 0) {
    const sample = collections[0];
    console.log(`   Sample collection:`);
    console.log(`     - primaryProjectId: ${sample.primaryProjectId || 'MISSING'}`);
    console.log(`     - projectIds: [${(sample.projectIds || []).join(', ')}]`);
    console.log(`     - updated_at: ${sample.updated_at ? 'EXISTS' : 'MISSING'}`);
  }

  // Check items
  const items = await getAllFromStore(db, 'items');
  const migratedItems = items.filter(i => 
    Array.isArray(i.collectionIds) && typeof i.updated_at === 'number'
  );
  const oldFormat = items.filter(i => 'collectionId' in i && !Array.isArray(i.collectionIds));
  console.log(`\n✅ Items: ${items.length} total`);
  console.log(`   Migrated (has collectionIds[]): ${migratedItems.length}/${items.length}`);
  console.log(`   Still using old format (collectionId): ${oldFormat.length}`);
  if (items.length > 0) {
    const sample = items[0];
    console.log(`   Sample item:`);
    console.log(`     - collectionIds: [${(sample.collectionIds || []).join(', ')}]`);
    console.log(`     - has old collectionId: ${'collectionId' in sample ? 'YES (BAD!)' : 'NO (GOOD)'}`);
    console.log(`     - updated_at: ${sample.updated_at ? 'EXISTS' : 'MISSING'}`);
  }

  // Check workspaces
  const workspaces = await getAllFromStore(db, 'workspaces');
  const migratedWorkspaces = workspaces.filter(w => 'projectId' in w);
  console.log(`\n✅ Workspaces: ${workspaces.length} total`);
  console.log(`   Has projectId field: ${migratedWorkspaces.length}/${workspaces.length}`);

  // Check notes
  const notes = await getAllFromStore(db, 'notes');
  console.log(`\n✅ Notes: ${notes.length} total`);

  console.log(`\n=== Summary ===`);
  const allGood = 
    db.version === 3 &&
    defaultProject &&
    defaultCollection &&
    migrated.length === collections.length &&
    migratedItems.length === items.length &&
    oldFormat.length === 0 &&
    migratedWorkspaces.length === workspaces.length;
  
  console.log(allGood ? '✅ Migration successful!' : '⚠️ Some issues detected - check details above');
  
  db.close();
})();

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

