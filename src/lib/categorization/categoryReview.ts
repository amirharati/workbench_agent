import { getDB } from '../db';
import { notifyDataChanged } from '../dataChangeNotifier';
import type { AiItemCategoryLink, AiItemSignal, ClassifyState } from './types';
import { aiLinkId } from './service';
import { primaryLeafIdFromLinks } from './counts';
import { isGeneralLeafId } from './taxonomyCatalog';

export class CategoryReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CategoryReviewError';
  }
}

/** Compute classifyState from links (no signal lookup needed - just the links) */
function classifyStateFromLinks(links: AiItemCategoryLink[]): ClassifyState {
  const primaryId = primaryLeafIdFromLinks(links);
  if (!primaryId) return 'pending_classify';
  if (isGeneralLeafId(primaryId)) return 'classified_general';
  return 'classified';
}

/** Update the item's signal.classifyState based on current links */
async function syncSignalClassifyState(itemId: string, links: AiItemCategoryLink[]): Promise<void> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_signals')) return;
  
  const signal = await db.get('ai_item_signals', itemId);
  if (!signal) return; // No signal yet, nothing to update
  
  const newState = classifyStateFromLinks(links);
  
  // Only update if state actually changed
  if (signal.classifyState !== newState) {
    const updated: AiItemSignal = { ...signal, classifyState: newState };
    await db.put('ai_item_signals', updated);
  }
}

async function putReviewedLink(link: AiItemCategoryLink): Promise<AiItemCategoryLink> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_category_links')) {
    throw new CategoryReviewError('Category links unavailable');
  }
  
  // Update the link
  const tx = db.transaction('ai_item_category_links', 'readwrite');
  await tx.objectStore('ai_item_category_links').put(link);
  await tx.done;
  
  // Get all links for this item and sync the signal's classifyState
  const allLinks = await db.getAllFromIndex('ai_item_category_links', 'by-item', link.itemId);
  await syncSignalClassifyState(link.itemId, allLinks);
  
  notifyDataChanged('categorization.review');
  return link;
}

async function loadLink(linkId: string): Promise<AiItemCategoryLink> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_category_links')) {
    throw new CategoryReviewError('Category links unavailable');
  }
  const link = await db.get('ai_item_category_links', linkId);
  if (!link) throw new CategoryReviewError('Link not found');
  if (link.source !== 'ai') {
    throw new CategoryReviewError('Only AI suggestions can be reviewed');
  }
  return link;
}

export async function acceptAiCategoryLink(linkId: string): Promise<AiItemCategoryLink> {
  const link = await loadLink(linkId);
  if (link.status !== 'suggested') {
    throw new CategoryReviewError('Link is not awaiting review');
  }
  const now = Date.now();
  return putReviewedLink({ ...link, status: 'accepted', updated_at: now });
}

export async function rejectAiCategoryLink(linkId: string): Promise<AiItemCategoryLink> {
  const link = await loadLink(linkId);
  if (link.status !== 'suggested') {
    throw new CategoryReviewError('Link is not awaiting review');
  }
  const now = Date.now();
  return putReviewedLink({ ...link, status: 'rejected', updated_at: now });
}

export async function acceptAiCategoryLinkByIds(
  itemId: string,
  categoryId: string
): Promise<AiItemCategoryLink> {
  return acceptAiCategoryLink(aiLinkId(itemId, categoryId));
}

export async function rejectAiCategoryLinkByIds(
  itemId: string,
  categoryId: string
): Promise<AiItemCategoryLink> {
  return rejectAiCategoryLink(aiLinkId(itemId, categoryId));
}
