import { getDB } from '../db';
import type { ItemEnrichment } from './types';

export async function getEnrichment(itemId: string): Promise<ItemEnrichment | undefined> {
  const db = await getDB();
  return db.get('item_enrichment', itemId);
}

export async function putEnrichment(record: ItemEnrichment): Promise<void> {
  const db = await getDB();
  await db.put('item_enrichment', record);
}

export async function deleteEnrichment(itemId: string): Promise<void> {
  const db = await getDB();
  try {
    await db.delete('item_enrichment', itemId);
  } catch {
    /* store may not exist yet */
  }
}

export async function getAllEnrichments(): Promise<ItemEnrichment[]> {
  const db = await getDB();
  return db.getAll('item_enrichment');
}

export async function getEnrichmentsByStatus(
  statuses: ItemEnrichment['status'][]
): Promise<ItemEnrichment[]> {
  const all = await getAllEnrichments();
  return all.filter((e) => statuses.includes(e.status));
}
