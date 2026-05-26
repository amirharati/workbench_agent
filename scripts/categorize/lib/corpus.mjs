import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadCorpusItems } from '../../enrich-fetch/lib/aiEvalCorpus.mjs';
import { assessCategorizationEligibility } from './eligibility.mjs';
import {
  buildClusterEmbedTextFromCorpus,
  buildClassifyTextFromCorpus,
  clusterSubstantiveLength,
} from './itemText.mjs';

export function loadAiEvalById(jsonlPath) {
  const map = new Map();
  if (!jsonlPath || !existsSync(jsonlPath)) return map;
  for (const line of readFileSync(jsonlPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      map.set(row.id, {
        aiStatus: row.status,
        aiTags: row.data?.tags,
        aiSummary: row.data?.summary,
        aiKeyPoints: row.data?.keyPoints,
      });
    } catch {
      /* skip */
    }
  }
  return map;
}

export function corpusToPipelineItems(corpusRows, aiEvalById = new Map(), { includeSnippet = false } = {}) {
  return corpusRows.map((row) => {
    const ai = aiEvalById.get(row.id) ?? {};
    const merged = {
      ...row,
      ...row.hints,
      aiStatus: ai.aiStatus,
      aiTags: ai.aiTags,
      aiSummary: ai.aiSummary,
      aiKeyPoints: ai.aiKeyPoints,
      notes: row.notes,
    };
    const eligibility = assessCategorizationEligibility(merged);
    const { text: classifyText, substantiveLength } = buildClassifyTextFromCorpus(merged, {
      includeSnippet,
      allowSnippetFallback: eligibility.allowSnippetFallback,
    });
    const clusterText = buildClusterEmbedTextFromCorpus(merged);
    return {
      itemId: row.id,
      title: row.title,
      url: row.url,
      notes: merged.notes,
      text: classifyText,
      classifyText,
      clusterText,
      substantiveLength,
      clusterSubstantiveLength: clusterSubstantiveLength(merged),
      semanticLength: eligibility.semanticLength,
      categorizationEligible: eligibility.eligible,
      eligibilityReason: eligibility.reason,
      enrichmentAiTags: ai.aiTags,
      aiSummary: merged.aiSummary,
      aiKeyPoints: merged.aiKeyPoints,
      sourceKind: row.sourceKind,
    };
  });
}

export function loadPipelineCorpus({ corpora, aiEvalJsonl, max = Infinity, includeSnippet = false }) {
  const raw = loadCorpusItems(corpora);
  const aiMap = loadAiEvalById(aiEvalJsonl);
  let items = corpusToPipelineItems(raw, aiMap, { includeSnippet });
  if (max < items.length) items = items.slice(0, max);
  return { items, rawCount: raw.length, aiEvalMerged: aiMap.size };
}
