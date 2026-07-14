import { commitPendingDbWrites, getDB, getItem } from '../db';
import { notifyDataChanged } from '../dataChangeNotifier';
import { assessCategorizationEligibility } from '../enrichment/categorizationEligibility';
import { getEnrichment } from '../enrichment/storage';
import {
  classifyStateFromPrimary,
  verifiedPrimaryLeafIdFromLinks,
} from './counts';
import { hasSpecificPrimaryTopic } from './categorizationFairGame';
import { resolveStagedClassifyStateAfterReject } from './userSignalStageResolve';
import { DEFAULT_EMBEDDING_MODEL, aiLinkId } from './service';
import type { AiItemCategoryLink, AiItemSignal, ClassifyState } from './types';

export type UserSignalKind = 'category_accepted' | 'category_rejected';

export type UserSignalPayload = {
  itemId: string;
  categoryId: string;
  meta?: Record<string, unknown>;
};

export class UserSignalPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserSignalPolicyError';
  }
}

export { resolveStagedClassifyStateAfterReject } from './userSignalStageResolve';

function validatePayload(payload: UserSignalPayload): void {
  if (!payload.itemId?.trim()) {
    throw new UserSignalPolicyError('itemId is required');
  }
  if (!payload.categoryId?.trim()) {
    throw new UserSignalPolicyError('categoryId is required');
  }
}

async function loadAiLink(itemId: string, categoryId: string): Promise<AiItemCategoryLink> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_category_links')) {
    throw new UserSignalPolicyError('Category links unavailable');
  }
  const link = await db.get('ai_item_category_links', aiLinkId(itemId, categoryId));
  if (!link) throw new UserSignalPolicyError('Link not found');
  if (link.source !== 'ai') {
    throw new UserSignalPolicyError('Only AI suggestions can be processed via user signal');
  }
  return link;
}

async function putLink(link: AiItemCategoryLink): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('ai_item_category_links', 'readwrite');
  await tx.objectStore('ai_item_category_links').put(link);
  await tx.done;
}

async function loadLinksForItem(itemId: string): Promise<AiItemCategoryLink[]> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_category_links')) return [];
  return db.getAllFromIndex('ai_item_category_links', 'by-item', itemId);
}

function buildMinimalSignalStub(
  itemId: string,
  prev: AiItemSignal | undefined,
  enrichment: Awaited<ReturnType<typeof getEnrichment>>,
  classifyState: ClassifyState,
  discoverState: AiItemSignal['discoverState'] = 'none'
): AiItemSignal {
  const now = Date.now();
  const signalStatus =
    prev?.signalStatus ??
    (enrichment?.aiStatus === 'ok' ? 'ok' : 'insufficient_enrichment');
  return {
    itemId,
    textHash: prev?.textHash ?? '',
    classifyTextHash: prev?.classifyTextHash,
    embeddingModel: prev?.embeddingModel ?? DEFAULT_EMBEDDING_MODEL,
    embedding: prev?.embedding ?? [],
    derivedTags: prev?.derivedTags ?? [],
    tagConfidence: prev?.tagConfidence,
    signalStatus,
    classifyState,
    discoverState,
    isNovelty: prev?.isNovelty,
    classifyRetryCount: prev?.classifyRetryCount,
    lastClassifySkipReason: prev?.lastClassifySkipReason,
    eligibilityReason: prev?.eligibilityReason,
    inputQualityTier: prev?.inputQualityTier,
    lastProcessedAt: now,
    lastClassifiedAt: prev?.lastClassifiedAt,
    llmReview: prev?.llmReview,
  };
}

async function upsertSignal(
  itemId: string,
  patch: Partial<AiItemSignal> & { classifyState: ClassifyState }
): Promise<void> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('ai_item_signals')) return;
  const prev = await db.get('ai_item_signals', itemId);
  const enrichment = await getEnrichment(itemId);
  const base = prev
    ? { ...prev, itemId }
    : buildMinimalSignalStub(itemId, undefined, enrichment, patch.classifyState);
  const next: AiItemSignal = {
    ...base,
    ...patch,
    itemId,
    lastProcessedAt: Date.now(),
  };
  await db.put('ai_item_signals', next);
}

async function handleCategoryAccepted(itemId: string, categoryId: string): Promise<void> {
  const link = await loadAiLink(itemId, categoryId);
  const now = Date.now();

  if (link.status === 'rejected') {
    throw new UserSignalPolicyError('Cannot accept a rejected link');
  }

  if (link.status === 'suggested') {
    await putLink({ ...link, status: 'accepted', updated_at: now });
  }

  await upsertSignal(itemId, {
    classifyState: 'manual_only',
    discoverState: 'none',
  });
  await commitPendingDbWrites();
  notifyDataChanged('categorization.review');
}

async function handleCategoryRejected(itemId: string, categoryId: string): Promise<void> {
  const link = await loadAiLink(itemId, categoryId);
  const now = Date.now();

  if (link.status === 'accepted') {
    throw new UserSignalPolicyError('Cannot reject an accepted link');
  }

  if (link.status === 'suggested') {
    await putLink({ ...link, status: 'rejected', updated_at: now });
  }

  const links = await loadLinksForItem(itemId);
  const primaryId = verifiedPrimaryLeafIdFromLinks(links);

  if (primaryId && hasSpecificPrimaryTopic(primaryId)) {
    const classifyState = classifyStateFromPrimary(primaryId, true);
    await upsertSignal(itemId, {
      classifyState,
      discoverState: 'none',
    });
    await commitPendingDbWrites();
    notifyDataChanged('categorization.review');
    return;
  }

  const item = await getItem(itemId);
  const enrichment = await getEnrichment(itemId);
  const eligibility = item
    ? assessCategorizationEligibility(item, enrichment, { aiTags: enrichment?.aiTags })
    : { eligible: false };
  const next = resolveStagedClassifyStateAfterReject({
    eligible: eligibility.eligible,
    primaryCategoryId: primaryId,
  });

  await upsertSignal(itemId, {
    classifyState: next,
    discoverState: next === 'pending_discover' ? 'pending' : 'none',
  });
  await commitPendingDbWrites();
  notifyDataChanged('categorization.review');
}

export async function applyUserSignal(
  kind: UserSignalKind,
  payload: UserSignalPayload
): Promise<void> {
  validatePayload(payload);
  const { itemId, categoryId } = payload;

  switch (kind) {
    case 'category_accepted':
      await handleCategoryAccepted(itemId, categoryId);
      return;
    case 'category_rejected':
      await handleCategoryRejected(itemId, categoryId);
      return;
    default: {
      const _exhaustive: never = kind;
      throw new UserSignalPolicyError(`Unknown signal kind: ${String(_exhaustive)}`);
    }
  }
}
