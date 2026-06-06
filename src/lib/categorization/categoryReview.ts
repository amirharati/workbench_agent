import { getDB } from '../db';
import { aiLinkId } from './service';
import type { AiItemCategoryLink } from './types';
import { applyUserSignal, UserSignalPolicyError } from './userSignalPolicy';

export class CategoryReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CategoryReviewError';
  }
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

function mapPolicyError(e: unknown): never {
  if (e instanceof UserSignalPolicyError) {
    throw new CategoryReviewError(e.message);
  }
  throw e;
}

export async function acceptAiCategoryLink(linkId: string): Promise<AiItemCategoryLink> {
  const link = await loadLink(linkId);
  if (link.status !== 'suggested' && link.status !== 'accepted') {
    throw new CategoryReviewError('Link is not awaiting review');
  }
  try {
    await applyUserSignal('category_accepted', {
      itemId: link.itemId,
      categoryId: link.categoryId,
    });
  } catch (e) {
    mapPolicyError(e);
  }
  return loadLink(linkId);
}

export async function rejectAiCategoryLink(linkId: string): Promise<AiItemCategoryLink> {
  const link = await loadLink(linkId);
  if (link.status !== 'suggested' && link.status !== 'rejected') {
    throw new CategoryReviewError('Link is not awaiting review');
  }
  try {
    await applyUserSignal('category_rejected', {
      itemId: link.itemId,
      categoryId: link.categoryId,
    });
  } catch (e) {
    mapPolicyError(e);
  }
  return loadLink(linkId);
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
