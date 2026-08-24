import { embedTexts } from '../ai/openrouterEmbeddings';
import { runAICompletion } from '../ai/client';
import { loadAISettings } from '../ai/settings';
import { notifyDataChanged } from '../dataChangeNotifier';
import { warmCategorySearchProfiles } from '../search/categorySearchProfileService';
import { dbRpc } from '../storage/dbClient';
import { DEFAULT_EMBEDDING_MODEL } from './service';
import { rankCategoryNames } from './categorySimilarity';
import { isManageableTopicCategory } from '../search/categorySearchProfiles';
import type {
  AiCategory,
  AiItemCategoryLink,
  AiItemSignal,
  AiCategoryKind,
} from './types';

export type CategoryDraft = {
  name: string;
  description: string;
  kind: AiCategoryKind;
  parentId?: string;
  canonicalTags?: string[];
  child?: {
    name: string;
    description: string;
    canonicalTags?: string[];
  };
};

export type CategoryStructureProposal = {
  parentName?: string;
  parentDescription?: string;
  childName: string;
  childDescription?: string;
  generated: boolean;
  warning?: string;
};

export type CategoryManagementSnapshot = {
  categories: AiCategory[];
  links: AiItemCategoryLink[];
  signal?: AiItemSignal;
};

export type CategorySimilarityMatch = {
  category: AiCategory;
  score: number;
  lexicalScore: number;
  semanticScore: number;
  exact: boolean;
};

export type CategorySimilarityResult = {
  matches: CategorySimilarityMatch[];
  exactDuplicate?: AiCategory;
  semanticAvailable: boolean;
  semanticWarning?: string;
};

export type ManualCategoryMutationResult = {
  category?: AiCategory;
  links?: AiItemCategoryLink[];
  attachedCategoryId?: string;
  deletedCategoryIds?: string[];
  affectedItemIds?: string[];
  revision: number;
};

export async function getCategoryManagementSnapshot(
  itemId?: string
): Promise<CategoryManagementSnapshot> {
  return dbRpc('getCategoryManagementSnapshot', itemId ? [itemId] : []);
}

function draftEmbeddingText(draft: CategoryDraft): string {
  // The user has not chosen a hierarchy level yet. Keep the query neutral so
  // the same vector can retrieve both matching parents and matching children.
  return ['Category concept', draft.name]
    .filter(Boolean)
    .join('\n');
}

export async function findSimilarCategories(
  draft: CategoryDraft,
  categories: AiCategory[]
): Promise<CategorySimilarityResult> {
  const manageableCategories = categories.filter(isManageableTopicCategory);
  const lexical = rankCategoryNames(draft.name, '', manageableCategories, 20);
  const lexicalById = new Map(lexical.map((match) => [match.categoryId, match]));
  const exactDuplicate = lexical.find((match) => match.exact);
  let semanticMatches: Array<{ categoryId: string; score: number }> = [];
  let semanticWarning: string | undefined;

  try {
    const settings = await loadAISettings();
    if (!settings.apiKey.trim()) {
      semanticWarning = 'Add an AI key to compare category meaning. Name matching is still active.';
    } else {
      await warmCategorySearchProfiles();
      const [embedding] = await embedTexts(
        {
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          model: DEFAULT_EMBEDDING_MODEL,
          timeoutMs: 60_000,
        },
        [draftEmbeddingText(draft)]
      );
      const ranked = await dbRpc<{
        matches: Array<{ categoryId: string; score: number }>;
        profileCount: number;
      }>('rankCategoryManagementProfiles', [embedding, DEFAULT_EMBEDDING_MODEL, 20], {
        priority: 'high',
      });
      semanticMatches = ranked.matches;
      if (!ranked.profileCount) {
        semanticWarning = 'Category meaning profiles are still being prepared; name matching is active.';
      }
    }
  } catch (error) {
    semanticWarning = `Meaning comparison unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }

  const semanticById = new Map(semanticMatches.map((match) => [match.categoryId, match.score]));
  const categoryById = new Map(manageableCategories.map((category) => [category.id, category]));
  const candidateIds = new Set([...lexicalById.keys(), ...semanticById.keys()]);
  const matches = [...candidateIds]
    .map((categoryId): CategorySimilarityMatch | null => {
      const category = categoryById.get(categoryId);
      if (!category || category.status === 'deprecated') return null;
      const lexicalMatch = lexicalById.get(categoryId);
      const lexicalScore = lexicalMatch?.score ?? 0;
      const semanticScore = semanticById.get(categoryId) ?? 0;
      const exact = lexicalMatch?.exact ?? false;
      const score = exact ? 1 : Math.max(lexicalScore, semanticScore * 0.92 + lexicalScore * 0.08);
      return { category, score, lexicalScore, semanticScore, exact };
    })
    .filter((match): match is CategorySimilarityMatch => match != null)
    .filter((match) => match.exact || match.score >= 0.28)
    .sort((left, right) => Number(right.exact) - Number(left.exact) || right.score - left.score)
    .slice(0, 12);

  return {
    matches,
    exactDuplicate: exactDuplicate ? categoryById.get(exactDuplicate.categoryId) : undefined,
    semanticAvailable: semanticMatches.length > 0,
    semanticWarning,
  };
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function proposalFallback(
  intent: string,
  mode: 'child' | 'parent_child',
  warning: string
): CategoryStructureProposal {
  return mode === 'child'
    ? { childName: intent.trim(), generated: false, warning }
    : {
        parentName: intent.trim(),
        parentDescription: '',
        childName: '',
        childDescription: '',
        generated: false,
        warning,
      };
}

/**
 * Turn one user concept into editable taxonomy names. This is advisory only;
 * the DB worker still validates every final name and writes the structure.
 */
export async function proposeCategoryStructure(input: {
  intent: string;
  mode: 'child' | 'parent_child';
  existingParent?: Pick<AiCategory, 'id' | 'name' | 'description'>;
  nearbyCategories?: Array<Pick<AiCategory, 'name' | 'kind' | 'parentName' | 'description'>>;
  signal?: AbortSignal;
}): Promise<CategoryStructureProposal> {
  const intent = input.intent.trim();
  if (!intent) throw new Error('Enter a category name or idea first');
  const settings = await loadAISettings();
  if (settings.provider === 'openrouter' && !settings.apiKey.trim()) {
    return proposalFallback(
      intent,
      input.mode,
      'AI naming is unavailable because no API key is configured. Enter the final name fields manually.'
    );
  }

  const expected = input.mode === 'child'
    ? '{"childName":"...","childDescription":"..."}'
    : '{"parentName":"...","parentDescription":"...","childName":"...","childDescription":"..."}';
  try {
    const response = await runAICompletion(
      { ...settings, temperature: 0.1, maxOutputTokens: Math.max(300, settings.maxOutputTokens) },
      {
        taskType: 'general',
        signal: input.signal,
        messages: [
          {
            role: 'system',
            content: [
              'You name a two-level bookmark taxonomy. Return only one valid JSON object.',
              'Names must be concise, clear noun phrases suitable for navigation.',
              'A parent is a broad durable domain. A child is a narrower retrieval topic.',
              'Never use General, Other, Miscellaneous, the same name for parent and child, or explanatory sentences as names.',
              'Descriptions are one short sentence explaining what belongs there.',
              `Required shape: ${expected}`,
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              userIdea: intent,
              requestedStructure: input.mode,
              existingParent: input.existingParent ?? null,
              nearbyExistingCategories: (input.nearbyCategories ?? []).slice(0, 12),
            }),
          },
        ],
      }
    );
    const parsed = JSON.parse(stripJsonFences(response.text)) as Record<string, unknown>;
    const childName = typeof parsed.childName === 'string' ? parsed.childName.trim() : '';
    const childDescription = typeof parsed.childDescription === 'string'
      ? parsed.childDescription.trim()
      : '';
    const parentName = typeof parsed.parentName === 'string' ? parsed.parentName.trim() : '';
    const parentDescription = typeof parsed.parentDescription === 'string'
      ? parsed.parentDescription.trim()
      : '';
    if (!childName || (input.mode === 'parent_child' && !parentName)) {
      return proposalFallback(
        intent,
        input.mode,
        'AI did not return a complete structure. Review and enter the final names manually.'
      );
    }
    return {
      parentName: input.mode === 'parent_child' ? parentName : undefined,
      parentDescription: input.mode === 'parent_child' ? parentDescription : undefined,
      childName,
      childDescription,
      generated: true,
    };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    return proposalFallback(
      intent,
      input.mode,
      `AI naming was unavailable: ${error instanceof Error ? error.message : String(error)}. Enter the final names manually.`
    );
  }
}

export async function createManualCategory(
  draft: CategoryDraft,
  options?: { itemId?: string; makePrimary?: boolean }
): Promise<ManualCategoryMutationResult> {
  const result = await dbRpc<ManualCategoryMutationResult>('createManualCategoryAtomic', [
    draft,
    options ?? {},
  ]);
  notifyDataChanged('categorization.review', {
    entityId: options?.itemId ?? result.category?.id,
  });
  return result;
}

export async function manageItemCategory(
  itemId: string,
  categoryId: string,
  action: 'add' | 'accept' | 'reject' | 'remove' | 'primary'
): Promise<ManualCategoryMutationResult> {
  const result = await dbRpc<ManualCategoryMutationResult>('manageItemCategoryAtomic', [
    itemId,
    categoryId,
    action,
  ]);
  notifyDataChanged('categorization.review', { entityId: itemId });
  return result;
}

export async function updateManualCategory(
  categoryId: string,
  input: { name: string; description?: string }
): Promise<ManualCategoryMutationResult> {
  const result = await dbRpc<ManualCategoryMutationResult>('updateManualCategoryAtomic', [
    categoryId,
    input,
  ]);
  notifyDataChanged('categorization.review', { entityId: categoryId });
  return result;
}

export async function deleteManualCategory(
  categoryId: string
): Promise<ManualCategoryMutationResult> {
  const result = await dbRpc<ManualCategoryMutationResult>('deleteManualCategoryAtomic', [categoryId]);
  notifyDataChanged('categorization.review', { entityId: categoryId });
  return result;
}
