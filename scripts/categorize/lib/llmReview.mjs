import { meanVector, cosineSimilarity } from './math.mjs';
import { normalizeTag, slugFromTerms } from './naming.mjs';
import { compactItem, chunk } from './llmReviewShared.mjs';
import { callTopicExtractBatch, topicRowToDecision } from './topicExtract.mjs';
import { mergeNewLeaves } from './taxonomyDiscover.mjs';

/** Large grouped catalogs + JSON items → smaller batches to avoid truncated result arrays. */
export function topicExtractBatchSize(leafCount, requested = 20) {
  if (leafCount > 34) return Math.min(requested, 8);
  if (leafCount > 28) return Math.min(requested, 12);
  return requested;
}

async function retryMissingTopicExtract(settings, categoriesNow, batch, categoryIds, leafById, discoverParents) {
  const recovered = [];
  for (const item of batch) {
    const one = await callTopicExtractBatch(settings, categoriesNow, [item], {
      parents: discoverParents,
    });
    if (one.ok && one.rows?.length) {
      const d = topicRowToDecision(one.rows[0], categoryIds, leafById);
      if (d) recovered.push(d);
    }
  }
  return recovered;
}

function buildUserPrompt(categories, items, { usePerItemShortlist = false } = {}) {
  const rules = [
    'Primary evidence: title + summary text in textForClassification.',
    'extractedTagsHint (if present) is optional and may be noisy — NEVER assign from tags alone.',
    'Assign existing ONLY when the category name AND description clearly describe the bookmark topic.',
    'Use none freely when the fit is weak, tangential, or only tag-level — none is a good outcome.',
    'Use new_category when the topic is clear but not covered by any candidate or listed category.',
    'Multiple categoryIds (max 3) only when two or more DISTINCT topics clearly apply; first id is primary.',
    'Do not force every item into a category.',
  ];
  if (usePerItemShortlist) {
    rules.unshift(
      'For each item, pick categoryIds ONLY from that item\'s candidateCategories (pre-filtered by embedding similarity).',
      'similarityScore is a hint only — low scores should often mean none.'
    );
  }

  const body = {
    task: usePerItemShortlist
      ? 'Classify each bookmark using only its candidateCategories shortlist (embedding pre-filter).'
      : 'Classify each bookmark independently. You are NOT given any prior assignment — decide fresh.',
    items,
    rules,
  };

  if (!usePerItemShortlist) {
    body.categories = categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      canonicalTags: c.canonicalTags ?? [],
      parentName: c.parentName ?? undefined,
    }));
  }

  return JSON.stringify(
    {
      ...body,
      output_schema: {
        results: [
          {
            itemId: 'string',
            decisionType: 'existing | none | new_category',
            categoryIds: 'array of existing ids when decisionType=existing (1-3)',
            categoryId: 'legacy single id (optional if categoryIds set)',
            proposedCategory: {
              name: 'required when decisionType=new_category',
              canonicalTags: ['lowercase', 'tags'],
              description: 'one sentence',
            },
            confidence: '0..1',
            reason: 'short rationale',
            needsReclassify: 'boolean',
          },
        ],
      },
    },
    null,
    2
  );
}

function resolveCategoryIds(raw, categoryIds) {
  if (Array.isArray(raw.categoryIds) && raw.categoryIds.length) {
    return raw.categoryIds
      .filter((id) => typeof id === 'string' && categoryIds.has(id.trim()))
      .map((id) => id.trim())
      .slice(0, 3);
  }
  const single = typeof raw.categoryId === 'string' ? raw.categoryId.trim() : '';
  if (single && categoryIds.has(single)) return [single];
  return [];
}

function normalizeDecision(raw, categoryIds) {
  if (!raw || typeof raw !== 'object') return null;
  const itemId = typeof raw.itemId === 'string' ? raw.itemId : null;
  if (!itemId) return null;

  const decisionType = String(raw.decisionType || '').toLowerCase().trim();
  const confidence = Number.isFinite(raw.confidence)
    ? Math.max(0, Math.min(1, raw.confidence))
    : undefined;
  const reason = typeof raw.reason === 'string' ? raw.reason.slice(0, 280) : undefined;
  const needsReclassify = Boolean(raw.needsReclassify);

  if (decisionType === 'existing') {
    const ids = resolveCategoryIds(raw, categoryIds);
    if (!ids.length) {
      return { itemId, decisionType: 'none', confidence, reason, needsReclassify: true };
    }
    return { itemId, decisionType, categoryIds: ids, confidence, reason, needsReclassify };
  }

  if (decisionType === 'new_category') {
    const p = raw.proposedCategory ?? {};
    const name = typeof p.name === 'string' ? p.name.trim().slice(0, 120) : '';
    const canonicalTags = Array.isArray(p.canonicalTags)
      ? p.canonicalTags
          .map((t) => (typeof t === 'string' ? normalizeTag(t) : null))
          .filter(Boolean)
          .slice(0, 6)
      : [];
    const description = typeof p.description === 'string' ? p.description.trim().slice(0, 300) : '';
    if (!name) return { itemId, decisionType: 'none', confidence, reason, needsReclassify: true };
    return {
      itemId,
      decisionType,
      proposedCategory: {
        name,
        canonicalTags: canonicalTags.length ? canonicalTags : ['misc'],
        description,
      },
      confidence,
      reason,
      needsReclassify: true,
    };
  }

  return { itemId, decisionType: 'none', confidence, reason, needsReclassify };
}

function assignmentsFromCategoryIds(item, categoryIds, categoriesNow) {
  return categoryIds.map((categoryId, i) => {
    const cat = categoriesNow.find((c) => c.id === categoryId);
    const score =
      cat && item.embedding?.length ? cosineSimilarity(item.embedding, cat.centroid) : 0.5 - i * 0.02;
    return { categoryId, score, isPrimary: i === 0 };
  });
}

async function callReviewBatch(settings, categories, batchItems, { usePerItemShortlist = false } = {}) {
  const endpoint = `${(settings.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs || 45_000);
  const systemContent = usePerItemShortlist
    ? 'You classify bookmarks using per-item candidateCategories only. Return only valid JSON. Prefer none over weak fits. Use 2-3 categoryIds only when distinct topics clearly match separate candidates. Never assign from tags alone.'
    : 'You classify bookmarks from scratch. Return only valid JSON. none is common and correct for weak fits. Use existing only on clear description match; use new_category for clear uncovered topics; never assign based on tags alone.';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://workbench-agent.local',
        'X-Title': 'Workbench Categorization LLM Review',
      },
      body: JSON.stringify({
        model: settings.model || 'openai/gpt-4o-mini',
        temperature: settings.temperature ?? 0.1,
        max_tokens: settings.maxOutputTokens ?? 3600,
        messages: [
          {
            role: 'system',
            content: systemContent,
          },
          {
            role: 'user',
            content: buildUserPrompt(categories, batchItems, { usePerItemShortlist }),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 240)}` };
    }
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim() || '';
    if (!text) return { ok: false, error: 'Empty model response' };
    return { ok: true, rows: parseReviewJson(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

function buildProposalKey(name, canonicalTags) {
  const slug = slugFromTerms(canonicalTags?.length ? canonicalTags : [name.toLowerCase()]);
  return `${name.toLowerCase()}::${slug}`;
}

function nearestCategoryScore(embedding, categories) {
  let best = -1;
  for (const c of categories) {
    const s = cosineSimilarity(embedding, c.centroid);
    if (s > best) best = s;
  }
  return best;
}

function recalcAssignmentSummary(itemResults) {
  const summary = {
    assignedPrimary: 0,
    assignedSecondary: 0,
    novelty: 0,
    unassigned: 0,
  };
  for (const r of itemResults) {
    if (r.signalStatus !== 'ok') continue;
    const primary = r.assignments?.find((a) => a.isPrimary);
    if (primary) summary.assignedPrimary++;
    else {
      summary.novelty++;
      summary.unassigned++;
    }
    summary.assignedSecondary += (r.assignments ?? []).filter((a) => !a.isPrimary).length;
  }
  return summary;
}

export async function runLlmReviewAllOnce({
  items,
  categories,
  itemResults,
  settings,
  reviewBatchSize = 20,
  allowNewCategories = true,
  promoteThreshold = 3,
  minLlmConfidence = 0.55,
  minCentroidScore = 0.52,
  shortlistByItemId = null,
  classifyMode = 'topic-extract',
  skipCentroidVeto = false,
}) {
  const useTopicExtract = classifyMode === 'topic-extract';
  const usePerItemShortlist = !useTopicExtract && Boolean(shortlistByItemId?.size);
  const trustLlmTopics = useTopicExtract || skipCentroidVeto;
  const effectiveMinConfidence = useTopicExtract ? Math.min(minLlmConfidence, 0.4) : minLlmConfidence;
  if (!settings.apiKey?.trim()) {
    return {
      error: 'Missing OPENROUTER_API_KEY',
      reviewRows: [],
      proposedCategories: [],
      promotedCategories: [],
      pendingReclassify: [],
      itemResults,
      categories,
      summaryPatch: { llmReviewed: 0, llmErrors: 1 },
    };
  }

  const categoriesNow = [...categories];
  const categoryIds = new Set(categoriesNow.map((c) => c.id));
  const leafById = new Map(categoriesNow.map((c) => [c.id, c]));
  const discoverParents = [
    ...new Map(
      categoriesNow
        .filter((c) => c.parentId)
        .map((c) => [c.parentId, { id: c.parentId, name: c.parentName ?? c.parentId }])
    ).values(),
  ];
  const itemById = new Map(items.map((i) => [i.itemId, i]));
  const resultById = new Map(itemResults.map((r) => [r.itemId, r]));
  const candidates = itemResults.filter((r) => r.signalStatus === 'ok' && itemById.has(r.itemId));
  const batchSize = useTopicExtract
    ? topicExtractBatchSize(categoriesNow.length, reviewBatchSize)
    : Math.max(1, reviewBatchSize);

  const batches = chunk(
    candidates.map((r) => {
      const item = itemById.get(r.itemId);
      const sl = shortlistByItemId?.get(r.itemId);
      return compactItem(item, sl?.candidates ?? null);
    }),
    batchSize
  );

  const reviewRows = [];
  const errorItemIds = new Set();
  let llmErrors = 0;

  for (const batch of batches) {
    let rowsForBatch = null;
    const callBatch = useTopicExtract
      ? () => callTopicExtractBatch(settings, categoriesNow, batch, { parents: discoverParents })
      : () => callReviewBatch(settings, categoriesNow, batch, { usePerItemShortlist });

    const resp = await callBatch();
    if (resp.ok) {
      rowsForBatch = resp.rows ?? [];
    } else if (batch.length > 1) {
      const recovered = [];
      for (const single of batch) {
        const one = useTopicExtract
          ? await callTopicExtractBatch(settings, categoriesNow, [single], { parents: discoverParents })
          : await callReviewBatch(settings, categoriesNow, [single], { usePerItemShortlist });
        if (one.ok && one.rows?.length) recovered.push(...one.rows);
        else {
          llmErrors++;
          reviewRows.push({
            itemId: single.itemId,
            decisionType: 'none',
            confidence: 0,
            reason: `llm_error: ${one.error || resp.error}`,
            needsReclassify: true,
            status: 'error',
          });
          errorItemIds.add(single.itemId);
        }
      }
      rowsForBatch = recovered;
    } else {
      llmErrors++;
      const i = batch[0];
      reviewRows.push({
        itemId: i.itemId,
        decisionType: 'none',
        confidence: 0,
        reason: `llm_error: ${resp.error}`,
        needsReclassify: true,
        status: 'error',
      });
      errorItemIds.add(i.itemId);
      continue;
    }

    const normalized = new Map();
    for (const row of rowsForBatch ?? []) {
      const d = useTopicExtract
        ? topicRowToDecision(row, categoryIds, leafById)
        : normalizeDecision(row, categoryIds);
      if (d) normalized.set(d.itemId, d);
    }

    if (useTopicExtract) {
      const missing = batch.filter((i) => !normalized.has(i.itemId) && !errorItemIds.has(i.itemId));
      if (missing.length) {
        const retried = await retryMissingTopicExtract(
          settings,
          categoriesNow,
          missing,
          categoryIds,
          leafById,
          discoverParents
        );
        for (const d of retried) normalized.set(d.itemId, d);
      }
    }

    for (const i of batch) {
      if (errorItemIds.has(i.itemId)) continue;
      const d = normalized.get(i.itemId) ?? {
        itemId: i.itemId,
        decisionType: 'none',
        confidence: 0,
        reason: 'missing decision from model',
        needsReclassify: true,
      };
      const sl = shortlistByItemId?.get(i.itemId);
      reviewRows.push({
        ...d,
        status: 'ok',
        classifyMode: useTopicExtract ? 'topic-extract' : 'shortlist',
        shortlistMaxScore: sl?.maxScore,
        shortlistCandidateIds: sl?.candidates?.map((c) => c.id),
      });
    }
  }

  const proposals = new Map();
  for (const row of reviewRows) {
    if (row.decisionType !== 'new_category' || !row.proposedCategory) continue;
    const key = buildProposalKey(row.proposedCategory.name, row.proposedCategory.canonicalTags);
    const existing = proposals.get(key) ?? {
      key,
      name: row.proposedCategory.name,
      canonicalTags: row.proposedCategory.canonicalTags,
      description: row.proposedCategory.description,
      count: 0,
      itemIds: [],
      reasons: [],
    };
    existing.count++;
    existing.itemIds.push(row.itemId);
    if (row.reason) existing.reasons.push(row.reason);
    proposals.set(key, existing);
  }
  const proposedCategories = [...proposals.values()].sort((a, b) => b.count - a.count);

  const promotedCategories = [];
  if (allowNewCategories) {
    let promoIdx = 0;
    for (const p of proposedCategories) {
      if (p.count < promoteThreshold) continue;
      const embs = p.itemIds
        .map((id) => resultById.get(id)?.embedding)
        .filter((v) => Array.isArray(v) && v.length > 0);
      if (!embs.length) continue;
      const centroid = meanVector(embs);
      if (nearestCategoryScore(centroid, categoriesNow) >= 0.9) continue;
      const id = `ai_proposed_${slugFromTerms(p.canonicalTags)}_llm_${promoIdx++}`;
      const cat = {
        id,
        name: p.name,
        status: 'ai_proposed',
        centroid,
        canonicalTags: p.canonicalTags,
        description: p.description || '',
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      categoriesNow.push(cat);
      categoryIds.add(id);
      promotedCategories.push({ ...p, id });
    }
  }

  const promotedByKey = new Map(promotedCategories.map((p) => [p.key, p]));
  const pendingReclassify = [];
  let llmAssigned = 0;
  let llmUnassigned = 0;
  let llmNeedsReclassify = 0;
  let llmMultiLabel = 0;
  let llmRejectedLowConfidence = 0;
  let llmVetoedLowCentroid = 0;

  for (const row of reviewRows) {
    const item = resultById.get(row.itemId);
    if (!item || item.signalStatus !== 'ok') continue;

    let decision = row;

    if (
      !trustLlmTopics &&
      decision.decisionType === 'existing' &&
      decision.confidence != null &&
      decision.confidence < effectiveMinConfidence
    ) {
      decision = {
        ...decision,
        decisionType: 'none',
        categoryIds: undefined,
        reason: `${decision.reason || ''} (rejected: confidence ${decision.confidence} < ${effectiveMinConfidence})`.trim(),
      };
      llmRejectedLowConfidence++;
    }

    if (decision.decisionType === 'existing' && decision.categoryIds?.length) {
      const assignments = assignmentsFromCategoryIds(item, decision.categoryIds, categoriesNow);
      const primary = assignments.find((a) => a.isPrimary);
      const cat = primary ? categoriesNow.find((c) => c.id === primary.categoryId) : null;
      const centroidScore =
        cat && item.embedding?.length ? cosineSimilarity(item.embedding, cat.centroid) : 0;

      if (!trustLlmTopics && centroidScore < minCentroidScore) {
        item.assignments = [];
        item.isNovelty = true;
        item.llmReview = {
          ...decision,
          vetoed: 'low_centroid_score',
          centroidScore,
        };
        llmUnassigned++;
        llmVetoedLowCentroid++;
        continue;
      }

      item.assignments = assignments;
      item.isNovelty = false;
      item.llmReview = {
        ...decision,
        centroidScore: trustLlmTopics ? undefined : centroidScore,
        classifyMode: useTopicExtract ? 'topic-extract' : undefined,
      };
      llmAssigned++;
      if (decision.categoryIds.length > 1) llmMultiLabel++;
      if (decision.needsReclassify) {
        pendingReclassify.push({ itemId: row.itemId, url: item.url, reason: decision.reason || 'llm_marked' });
        llmNeedsReclassify++;
      }
      continue;
    }

    if (decision.decisionType === 'new_category' && decision.proposedCategory) {
      if (useTopicExtract && decision.proposedCategory.parentId) {
        const parentIds = new Set(discoverParents.map((p) => p.id));
        const leavesDraft = categoriesNow
          .filter((c) => c.parentId)
          .map((c) => ({
            id: c.id,
            parentId: c.parentId,
            name: c.name,
            description: c.description ?? '',
            canonicalTags: c.canonicalTags ?? [],
          }));
        const merge = mergeNewLeaves(
          leavesDraft,
          [
            {
              parentId: decision.proposedCategory.parentId,
              name: decision.proposedCategory.name,
              description: decision.proposedCategory.description ?? '',
              canonicalTags: decision.proposedCategory.canonicalTags ?? [],
            },
          ],
          parentIds,
          { maxNewPerBatch: 1 }
        );
        if (merge.added?.length) {
          const leaf = merge.added[0];
          const centroid =
            item.embedding?.length && Array.isArray(item.embedding) ? item.embedding : [];
          const cat = {
            id: leaf.id,
            name: leaf.name,
            parentId: leaf.parentId,
            canonicalTags: leaf.canonicalTags,
            description: leaf.description || '',
            centroid,
            status: 'ai_proposed',
            created_at: Date.now(),
            updated_at: Date.now(),
          };
          categoriesNow.push(cat);
          categoryIds.add(cat.id);
          leafById.set(cat.id, { id: cat.id, parentId: cat.parentId });
          item.assignments = assignmentsFromCategoryIds(item, [cat.id], categoriesNow);
          item.isNovelty = false;
          item.llmReview = {
            ...decision,
            promotedCategoryId: cat.id,
            classifyMode: 'topic-extract',
          };
          llmAssigned++;
          continue;
        }
      }

      const key = buildProposalKey(decision.proposedCategory.name, decision.proposedCategory.canonicalTags);
      const promoted = promotedByKey.get(key);
      if (promoted) {
        item.assignments = assignmentsFromCategoryIds(item, [promoted.id], categoriesNow);
        item.isNovelty = false;
        item.llmReview = { ...decision, promotedCategoryId: promoted.id };
        llmAssigned++;
      } else {
        item.assignments = [];
        item.isNovelty = true;
        item.llmReview = decision;
        pendingReclassify.push({
          itemId: row.itemId,
          url: item.url,
          reason: decision.reason || 'proposed_category_not_promoted',
        });
        llmUnassigned++;
        llmNeedsReclassify++;
      }
      continue;
    }

    item.assignments = [];
    item.isNovelty = true;
    item.llmReview = decision;
    llmUnassigned++;
    if (decision.needsReclassify) {
      pendingReclassify.push({ itemId: row.itemId, url: item.url, reason: decision.reason || 'llm_none' });
      llmNeedsReclassify++;
    }
  }

  const assignmentSummary = recalcAssignmentSummary(itemResults);
  const llmMissingDecisions = reviewRows.filter((r) =>
    String(r.reason || '').includes('missing decision from model')
  ).length;

  return {
    error: null,
    categories: categoriesNow,
    itemResults,
    reviewRows,
    proposedCategories,
    promotedCategories,
    pendingReclassify,
    summaryPatch: {
      ...assignmentSummary,
      categoriesCount: categoriesNow.length,
      llmReviewed: candidates.length,
      llmAssigned,
      llmUnassigned,
      llmMultiLabel,
      llmNeedsReclassify,
      llmMissingDecisions,
      llmProposedCategories: proposedCategories.length,
      llmPromotedCategories: promotedCategories.length,
      llmRejectedLowConfidence,
      llmVetoedLowCentroid,
      llmErrors,
      classifyMode: useTopicExtract ? 'topic-extract' : usePerItemShortlist ? 'shortlist' : 'full-catalog',
    },
  };
}
