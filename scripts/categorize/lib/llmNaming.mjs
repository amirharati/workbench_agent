/**
 * CLI mirror of src/lib/categorization/llmNaming.ts — example-based cluster naming.
 */

import { nameCategoryFromMembers } from './naming.mjs';

const SYSTEM = `You name a group of related bookmarks for a personal knowledge base.
Read the sample pages (title + summary) and return ONE clear topic label for the whole cluster.

Reply with JSON only, no markdown:
{"name":"short human-readable label (2-5 words, NOT slash-separated topics)","tags":["tag1","tag2","tag3"],"description":"one sentence: what links in this cluster share"}

Rules:
- name: single coherent theme (e.g. "Algorithmic trading", "Flutter mobile dev") — never "foo / bar / baz"
- tags: 3-6 lowercase searchable tags
- description: used later to classify new bookmarks into this category
- No generic words: website, page, article, home, welcome`;

function parseNamingJson(text) {
  const trimmed = (text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function formatSample(member) {
  const parts = [];
  if (member.title?.trim()) parts.push(`Title: ${member.title.trim()}`);
  if (member.aiSummary?.trim()) {
    parts.push(`Summary: ${member.aiSummary.trim().slice(0, 400)}`);
  } else if (member.aiTags?.length) {
    parts.push(`Tags: ${member.aiTags.slice(0, 4).join(', ')}`);
  }
  if (member.score != null) parts.push(`(similarity ${member.score.toFixed(3)})`);
  return parts.join('\n');
}

export async function llmNameCategory(settings, members, fallback) {
  const samples = members
    .slice(0, 8)
    .map(formatSample)
    .filter((s) => s.length > 10);

  if (!samples.length) return { ...fallback, description: fallback.description ?? '' };

  const endpoint = `${(settings.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs || 30_000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://workbench-agent.local',
        'X-Title': 'Workbench Category Naming',
      },
      body: JSON.stringify({
        model: settings.model || 'openai/gpt-4o-mini',
        temperature: settings.temperature ?? 0.2,
        max_tokens: 400,
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `Representative bookmarks in this cluster (highest similarity first):\n\n${samples.map((s, i) => `### Example ${i + 1}\n${s}`).join('\n\n')}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) return { ...fallback, description: fallback.description ?? '' };

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim() || '';
    const parsed = parseNamingJson(text);
    const name = parsed?.name?.trim().slice(0, 120);
    const tags = Array.isArray(parsed?.tags)
      ? parsed.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 8)
      : null;
    const description = typeof parsed?.description === 'string' ? parsed.description.trim().slice(0, 300) : '';

    if (name && tags?.length) {
      return { name, canonicalTags: tags, description };
    }
  } catch {
    /* fallback */
  } finally {
    clearTimeout(timer);
  }

  return { ...fallback, description: fallback.description ?? '' };
}

export async function llmRenameCategories(settings, categories, membersByCategoryId) {
  if (!settings.apiKey?.trim()) return { categories, named: 0, error: 'Missing OPENROUTER_API_KEY' };

  const out = [];
  let named = 0;

  for (const cat of categories) {
    const members = membersByCategoryId?.get(cat.id) ?? [];
    const fallback = nameCategoryFromMembers(
      members.map((m) => ({
        title: m.title,
        aiTags: m.aiTags,
        text: m.aiSummary || '',
      }))
    );
    const result = await llmNameCategory(settings, members, {
      name: cat.name || fallback.name,
      canonicalTags: cat.canonicalTags?.length ? cat.canonicalTags : fallback.canonicalTags,
      description: cat.description ?? '',
    });
    if (result.name !== cat.name) named++;
    out.push({
      ...cat,
      name: result.name,
      canonicalTags: result.canonicalTags,
      description: result.description || '',
      updated_at: Date.now(),
    });
  }

  return { categories: out, named, error: null };
}
