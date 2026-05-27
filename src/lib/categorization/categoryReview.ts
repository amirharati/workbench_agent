import { getDB } from '../db';
import { notifyDataChanged } from '../dataChangeNotifier';
import type { AiItemCategoryLink } from './types';
import { aiLinkId } from './service';

export class CategoryReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CategoryReviewError';
  }
}

async function putReviewedLink(link: AiItemCategoryLink): Promise<AiItemCategoryLink> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_category_links')) {
    throw new CategoryReviewError('Category links unavailable');
  }
  const tx = db.transaction('ai_item_category_links', 'readwrite');
  await tx.objectStore('ai_item_category_links').put(link);
  await tx.done;
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
