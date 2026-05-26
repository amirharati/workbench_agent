import { runAICompletion } from '../ai/client';
import type { AISettings } from '../ai/types';
import type { AiCategory } from './types';
import type { CategoryNameMember } from './tags';
import { nameCategoryFromMembers } from './tags';

const SYSTEM = `You name bookmark topic clusters for a personal knowledge base.
Reply with JSON only, no markdown: {"name":"topic1 / topic2 / topic3","tags":["tag1","tag2","tag3"]}
Use 3 slash-separated topic words for name; 3-6 lowercase tags. No generic words like "website", "page", "article".`;

function parseNamingJson(text: string): { name?: string; tags?: string[] } | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as { name?: string; tags?: string[] };
  } catch {
    return null;
  }
}

export async function llmNameCategory(
  settings: AISettings,
  members: CategoryNameMember[],
  fallback: { name: string; canonicalTags: string[] }
): Promise<{ name: string; canonicalTags: string[] }> {
  const samples = members
    .slice(0, 8)
    .map((m) => {
      const parts = [m.title?.trim(), ...(m.aiTags ?? []).slice(0, 4)].filter(Boolean);
      return parts.join(' — ');
    })
    .filter(Boolean);

  if (!samples.length) return fallback;

  try {
    const res = await runAICompletion(settings, {
      taskType: 'tag',
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Sample bookmarks in this cluster:\n${samples.map((s) => `- ${s}`).join('\n')}`,
        },
      ],
    });
    const parsed = parseNamingJson(res.text);
    const name = parsed?.name?.trim();
    const tags = parsed?.tags?.map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (name && tags?.length) {
      return { name, canonicalTags: tags.slice(0, 8) };
    }
  } catch {
    /* fall through */
  }
  return fallback;
}

export async function llmRenameCategories(
  settings: AISettings,
  categories: AiCategory[],
  membersByCategoryId: Map<string, CategoryNameMember[]>
): Promise<AiCategory[]> {
  const out: AiCategory[] = [];
  for (const cat of categories) {
    const members = membersByCategoryId.get(cat.id) ?? [];
    const fallback = nameCategoryFromMembers(members);
    const named = await llmNameCategory(settings, members, {
      name: cat.name || fallback.name,
      canonicalTags: cat.canonicalTags?.length ? cat.canonicalTags : fallback.canonicalTags,
    });
    out.push({
      ...cat,
      name: named.name,
      canonicalTags: named.canonicalTags,
      updated_at: Date.now(),
    });
  }
  return out;
}
