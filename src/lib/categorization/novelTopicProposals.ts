import type { Item } from '../db';
import { normalizeCategoryName } from './categorySimilarity';
import type {
  AiItemSignal,
  ProposedCategoryDraft,
} from './types';

export type NovelTopicProposalGroup = {
  key: string;
  proposal: ProposedCategoryDraft;
  itemCount: number;
  pendingReclassifyCount: number;
  sampleItems: Array<{ itemId: string; title: string }>;
  latestAt: number;
};

const PROPOSAL_STATES = new Set([
  'pending_discover',
  'pending_reclassify',
  'manual_review',
]);

export function novelTopicProposalKey(
  proposal: Pick<ProposedCategoryDraft, 'name' | 'parentId'>
): string {
  return `${proposal.parentId?.trim() ?? ''}::${normalizeCategoryName(proposal.name)}`;
}

function proposalForSignal(signal: AiItemSignal): ProposedCategoryDraft | undefined {
  const proposal = signal.llmReview?.novelTopicSuggestion;
  if (!proposal?.name?.trim()) return undefined;
  if (!PROPOSAL_STATES.has(signal.classifyState ?? '')) return undefined;
  return proposal;
}

/**
 * Build compact UI suggestions from durable per-bookmark no-match evidence.
 * These groups are projections only: they never become taxonomy rows or links.
 */
export function aggregateNovelTopicProposals(input: {
  signals: AiItemSignal[];
  items: Array<Pick<Item, 'id' | 'title'>>;
  activeCategoryItemIds?: ReadonlySet<string>;
  sampleLimit?: number;
  groupLimit?: number;
}): NovelTopicProposalGroup[] {
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const active = input.activeCategoryItemIds ?? new Set<string>();
  const sampleLimit = Math.max(1, Math.floor(input.sampleLimit ?? 4));
  const grouped = new Map<string, NovelTopicProposalGroup>();

  for (const signal of input.signals) {
    if (active.has(signal.itemId)) continue;
    const proposal = proposalForSignal(signal);
    if (!proposal) continue;
    const key = novelTopicProposalKey(proposal);
    const normalizedName = key.slice(key.indexOf('::') + 2);
    if (normalizedName) {
      const existing = grouped.get(key);
      const latestAt = Math.max(signal.lastClassifiedAt ?? 0, signal.lastProcessedAt ?? 0);
      if (!existing) {
        grouped.set(key, {
          key,
          proposal: {
            ...proposal,
            name: proposal.name.trim(),
            description: proposal.description?.trim() || undefined,
            canonicalTags: [...new Set(proposal.canonicalTags ?? [])].slice(0, 8),
          },
          itemCount: 1,
          pendingReclassifyCount: signal.classifyState === 'pending_reclassify' ? 1 : 0,
          sampleItems: [{
            itemId: signal.itemId,
            title: itemById.get(signal.itemId)?.title?.trim() || signal.itemId,
          }],
          latestAt,
        });
        continue;
      }

      existing.itemCount += 1;
      if (signal.classifyState === 'pending_reclassify') {
        existing.pendingReclassifyCount += 1;
      }
      const isNewer = latestAt >= existing.latestAt;
      existing.latestAt = Math.max(existing.latestAt, latestAt);
      existing.proposal.canonicalTags = [...new Set([
        ...existing.proposal.canonicalTags,
        ...(proposal.canonicalTags ?? []),
      ])].slice(0, 8);
      if (isNewer && proposal.description?.trim()) {
        existing.proposal.description = proposal.description.trim();
      }
      if (existing.sampleItems.length < sampleLimit) {
        existing.sampleItems.push({
          itemId: signal.itemId,
          title: itemById.get(signal.itemId)?.title?.trim() || signal.itemId,
        });
      }
    }
  }

  return [...grouped.values()]
    .sort((left, right) =>
      right.itemCount - left.itemCount ||
      right.latestAt - left.latestAt ||
      left.proposal.name.localeCompare(right.proposal.name)
    )
    .slice(0, Math.max(1, Math.floor(input.groupLimit ?? 100)));
}

/** Mark one proposal group ready for the cheap classify stage after taxonomy changes. */
export function queueNovelTopicProposalSignals(input: {
  signals: AiItemSignal[];
  proposalKey: string;
  activeCategoryItemIds?: ReadonlySet<string>;
  now?: number;
}): AiItemSignal[] {
  const active = input.activeCategoryItemIds ?? new Set<string>();
  const now = input.now ?? Date.now();
  return input.signals
    .filter((signal) => {
      if (active.has(signal.itemId)) return false;
      if (signal.classifyState === 'pending_reclassify') return false;
      const proposal = proposalForSignal(signal);
      return proposal ? novelTopicProposalKey(proposal) === input.proposalKey : false;
    })
    .map((signal) => ({
      ...signal,
      classifyState: 'pending_reclassify',
      discoverState: 'pending',
      isNovelty: true,
      classifyRetryCount: 0,
      lastClassifySkipReason: 'Taxonomy changed — ready to match stored topic again',
      lastProcessedAt: now,
    }));
}
