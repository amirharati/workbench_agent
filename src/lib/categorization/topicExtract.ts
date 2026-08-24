import { runAICompletion } from '../ai/client';
import { isTerminalAIBackendError } from '../ai/errors';
import { aiSettingsForBatchJob } from '../ai/settings';
import type { AISettings } from '../ai/types';
import { normalizeTag } from './naming';
import { LLM_BATCH_RETRY_ROUNDS, LLM_SINGLE_FALLBACK_CAP } from './llmBatchRetry';
import { chunk, MAX_CLASSIFY_PREVIEW, parseReviewJson } from './parseReview';
import {
  buildGroupedLeafCatalog,
  formatGroupedCatalogMarkdown,
  resolveTopicAssignments,
  TOPIC_CATALOG_RULES,
} from './taxonomyCatalog';
import type { AiCategory, ProposedCategoryDraft, TopicExtractDecision } from './types';
import { TOPIC_FEW_SHOT } from './topicFewShot';

export const TOPIC_NO_MATCH = 'NO_MATCH';

export function topicExtractBatchSize(leafCount: number, requested = 20): number {
  if (leafCount > 34) return Math.min(requested, 8);
  if (leafCount > 28) return Math.min(requested, 12);
  return requested;
}

export interface ClassifyBatchItem {
  itemId: string;
  title: string;
  textForClassification: string;
  enrichmentAiTags?: string[];
}

export interface FreeTopicAnalysis {
  itemId: string;
  semanticLabel: string;
  primarySubject: string;
  likelySavePurpose: string;
  contentKind: string;
  secondaryThemes: string[];
  freeTopics: string[];
  broadDomain?: string;
  evidence?: string;
  contentState: 'substantive' | 'login_wall' | 'dead_or_error' | 'empty';
}

function compactItemForTopics(item: ClassifyBatchItem): ClassifyBatchItem {
  return {
    itemId: item.itemId,
    title: item.title || '',
    textForClassification: item.textForClassification.slice(0, MAX_CLASSIFY_PREVIEW),
    enrichmentAiTags: item.enrichmentAiTags?.filter((t) => t?.trim()).slice(0, 6),
  };
}

export function buildFreeTopicPrompt(batchItems: ClassifyBatchItem[]): string {
  return [
    '## Task',
    'Describe the real subject of each bookmark without seeing or guessing any taxonomy.',
    'This is semantic analysis only. Do not map to a library category and do not reuse a category name from prior knowledge.',
    '',
    '## Rules',
    '- Read the complete meaning, not isolated words in the title or summary.',
    '- semanticLabel: a neutral 2-8 word description of what the saved item is actually about.',
    '- primarySubject: the main object or subject the user saved, not an incidental theme inside it.',
    '- likelySavePurpose: the most likely reason a user would want to retrieve this exact link later (for example watch an episode, read research, follow a tutorial, compare a product, use a tool, or revisit advice).',
    '- contentKind: a plain content form such as research article, tutorial, product page, TV episode, film, book, recipe, discussion, or error page.',
    '- secondaryThemes: themes mentioned inside the object that are not its primary identity.',
    '- freeTopics: 1-3 atomic subjects in your own words; no slash-separated mashups.',
    '- broadDomain: an ordinary-language domain, not a taxonomy identifier.',
    '- evidence: one short statement naming the facts that support the label.',
    '- Personal growth, purpose, values, or flourishing are not finance unless the content actually concerns money, investing, budgeting, tax, insurance, or retirement.',
    '- Infer save purpose conservatively from the page’s function, title, summary, URL context, and any explicit user note or tag. Explicit user intent wins; otherwise prefer what the link lets the user do over incidental entities or words it mentions.',
    '- For a page whose primary object is a film, TV episode, book, song, game, or other creative work, identify that work/media as primary. Plot events and character relationships are secondaryThemes unless the saved page is specifically an essay or analysis about those themes.',
    '- Mark contentState=login_wall only when the available content is an authentication wall with no subject.',
    '- Mark contentState=dead_or_error only for a real 404/5xx/removed/placeholder page with no subject.',
    '- Mark contentState=empty only when there is no usable subject at all. Otherwise use substantive.',
    '- Return one result per itemId with no omissions.',
    '',
    '## Examples',
    JSON.stringify([
      {
        title: 'Growing on Purpose: Meaningful Work in the Age of AI',
        textForClassification: 'Human flourishing, values, and purposeful work as AI changes professional life.',
        output: {
          semanticLabel: 'Human flourishing amid AI',
          primarySubject: 'Discussion of human flourishing and meaningful work amid AI',
          likelySavePurpose: 'Revisit an interview about purposeful work and AI',
          contentKind: 'interview or discussion',
          secondaryThemes: ['personal values', 'professional growth'],
          freeTopics: ['human flourishing', 'meaningful work', 'AI and society'],
          broadDomain: 'philosophy of work and artificial intelligence',
          evidence: 'The discussion concerns purpose, values, work, and AI; it contains no money or investing subject.',
          contentState: 'substantive',
        },
      },
      {
        title: 'A Practical Retirement Portfolio',
        textForClassification: 'Index funds, retirement accounts, asset allocation, rebalancing, and investment risk.',
        output: {
          semanticLabel: 'Retirement investing strategy',
          primarySubject: 'Retirement portfolio construction',
          likelySavePurpose: 'Use a guide for retirement investment planning',
          contentKind: 'financial guide',
          secondaryThemes: [],
          freeTopics: ['retirement investing', 'index funds', 'portfolio allocation'],
          broadDomain: 'personal finance and investing',
          evidence: 'The item explicitly discusses retirement accounts, funds, allocation, and investment risk.',
          contentState: 'substantive',
        },
      },
      {
        title: 'Night Harbor - Season 2 Episode 4 Watch',
        textForClassification: 'An episode page describing a dramatic family conflict, addiction, and a fundraiser in the TV series Night Harbor.',
        output: {
          semanticLabel: 'Night Harbor TV episode',
          primarySubject: 'A streaming/watch page for one television episode',
          likelySavePurpose: 'Watch or return to this television episode',
          contentKind: 'TV episode page',
          secondaryThemes: ['family conflict', 'addiction', 'fundraiser drama'],
          freeTopics: ['television episode', 'drama series', 'streaming'],
          broadDomain: 'television and entertainment',
          evidence: 'The saved object is an episode/watch page; relationships and addiction are events or themes within its plot.',
          contentState: 'substantive',
        },
      },
    ], null, 2),
    '',
    '## Items',
    JSON.stringify(batchItems.map(compactItemForTopics), null, 2),
    '',
    '## Response format (JSON only)',
    JSON.stringify({
      results: [{
        itemId: 'matching itemId',
        semanticLabel: '2-8 words',
        primarySubject: 'main saved object or subject',
        likelySavePurpose: 'likely reason to retrieve this exact link later',
        contentKind: 'plain content form',
        secondaryThemes: ['incidental themes'],
        freeTopics: ['1-3 atomic subjects'],
        broadDomain: 'ordinary-language domain',
        evidence: 'short evidence statement',
        contentState: 'substantive | login_wall | dead_or_error | empty',
      }],
    }),
  ].join('\n');
}

export function freeTopicRowToAnalysis(raw: Record<string, unknown>): FreeTopicAnalysis | null {
  const itemId = typeof raw.itemId === 'string' ? raw.itemId.trim() : '';
  const semanticLabel = typeof raw.semanticLabel === 'string' ? raw.semanticLabel.trim().slice(0, 120) : '';
  if (!itemId || !semanticLabel) return null;
  const freeTopics = Array.isArray(raw.freeTopics)
    ? raw.freeTopics
        .filter((topic): topic is string => typeof topic === 'string' && Boolean(topic.trim()))
        .map((topic) => topic.trim().slice(0, 80))
        .slice(0, 3)
    : [];
  if (!freeTopics.length) freeTopics.push(semanticLabel);
  const primarySubject = typeof raw.primarySubject === 'string'
    ? raw.primarySubject.trim().slice(0, 180)
    : semanticLabel;
  const likelySavePurpose = typeof raw.likelySavePurpose === 'string'
    ? raw.likelySavePurpose.trim().slice(0, 180)
    : `Revisit ${primarySubject}`;
  const contentKind = typeof raw.contentKind === 'string'
    ? raw.contentKind.trim().slice(0, 80)
    : 'unknown';
  const secondaryThemes = Array.isArray(raw.secondaryThemes)
    ? raw.secondaryThemes
        .filter((theme): theme is string => typeof theme === 'string' && Boolean(theme.trim()))
        .map((theme) => theme.trim().slice(0, 80))
        .slice(0, 5)
    : [];
  const rawState = typeof raw.contentState === 'string' ? raw.contentState : 'substantive';
  const contentState: FreeTopicAnalysis['contentState'] =
    rawState === 'login_wall' || rawState === 'dead_or_error' || rawState === 'empty'
      ? rawState
      : 'substantive';
  return {
    itemId,
    semanticLabel,
    primarySubject,
    likelySavePurpose,
    contentKind,
    secondaryThemes,
    freeTopics,
    broadDomain: typeof raw.broadDomain === 'string' ? raw.broadDomain.trim().slice(0, 160) : undefined,
    evidence: typeof raw.evidence === 'string' ? raw.evidence.trim().slice(0, 300) : undefined,
    contentState,
  };
}

export function buildTopicExtractPrompt(
  topicCatalog: ReturnType<typeof buildGroupedLeafCatalog>,
  analyses: FreeTopicAnalysis[],
  requireAssignment = false
): string {
  const catalogMarkdown = formatGroupedCatalogMarkdown(topicCatalog);
  const matchExamples: Array<{
    semanticAnalysis: Record<string, unknown>;
    taxonomyMatch: Record<string, unknown>;
  }> = TOPIC_FEW_SHOT.map((example) => ({
    semanticAnalysis: ('semanticAnalysis' in example && example.semanticAnalysis
      ? example.semanticAnalysis
      : {
          semanticLabel: example.title,
          primarySubject: example.title,
          likelySavePurpose: `Revisit ${example.title}`,
          contentKind: 'bookmark',
          secondaryThemes: [],
          freeTopics: [example.title],
          evidence: example.summary,
          contentState: example.output.topicIds.some((id) =>
            id === 'seed_login-auth-required'
          )
            ? 'login_wall'
            : example.output.topicIds.some((id) =>
                id === 'seed_page-not-found' || id === 'seed_placeholder-junk' || id === 'seed_enrich-fetch-failed'
              )
              ? 'dead_or_error'
              : 'substantive',
        }) as Record<string, unknown>,
    taxonomyMatch: { matchStatus: 'MATCH', ...example.output },
  }));
  matchExamples.push({
    semanticAnalysis: {
      semanticLabel: 'Competitive memory sculpture',
      primarySubject: 'A new participatory art practice with no matching taxonomy domain',
      likelySavePurpose: 'Revisit the rules and examples for this practice',
      contentKind: 'event explainer',
      secondaryThemes: [],
      freeTopics: ['memory sculpture', 'participatory competition'],
      evidence: 'The page documents competitions involving physical memory sculptures.',
      contentState: 'substantive',
    },
    taxonomyMatch: {
      matchStatus: TOPIC_NO_MATCH,
      skip: false,
      topicIds: [],
      topicPaths: [],
      primaryParentId: undefined,
      parentCandidates: [],
      novelTopicSuggestion: {
        name: 'Competitive memory sculpture',
        description: 'Participatory competitions involving physical memory sculptures.',
        canonicalTags: ['memory-sculpture', 'participatory-art'],
      },
      confidence: 0.86,
      reason: 'No existing parent has a defensible semantic fit.',
    },
  });
  const rules = [
    'The semantic pass already described each item without taxonomy influence. Match that analysis; do not reinterpret isolated words.',
    ...TOPIC_CATALOG_RULES,
    'NEVER skip or reject links because they are adult/erotic/porn — assign adult-erotic-content or sexuality-sexual-health.',
    'NEVER put substantive pages in link-quality (generic-low-signal, etc.): movie/TV lists, immigration/visa, directories, tutorials, adult — always use a normal topic leaf or the correct *-general leaf.',
    'Login/auth walls (YouTube sign-in, etc.) → login-auth-required (attention basket — keep bookmark). Removal leaves: 404/5xx, example.com, fetch fail, blank pages only.',
    'url-redirect-mismatch: RARE — only when the semantic analysis explicitly states that the saved URL does not match the fetched page (article→hub). NEVER for www/https, t.co→tweet, or when unsure — prefer normal topic.',
    'If the semantic analysis describes a real topic, NEVER use link-quality.',
    'Singularity/containers/HPC runtime → infra-hosting-general unless a specific infra leaf fits.',
    'Indie hackers / business ideas → the best existing business leaf, otherwise business-product-marketing-general.',
    'Immigration / embassy / visa process → government-services-immigration.',
    'Movies / TV / streaming site lists → movies-tv-streaming.',
    'Compare the free topics and evidence against every parent description before choosing a parent.',
    'Ask first: “What is the purpose of this exact link, and why would the user save it?” Choose primaryParentId from explicit intent (if present), likelySavePurpose, primarySubject, contentKind, and broadDomain—in that order. secondaryThemes must not outrank the saved purpose or object.',
    'For a film, TV episode, book, song, game, or watch/read/listen page, the creative work/media parent is primary. Plot events, character relationships, depicted illnesses, locations, or professions are not independent primary topics.',
    'A theme parent is primary only when the page itself is analysis, reporting, instruction, or advice about that theme—not merely when the theme appears inside a story or work.',
    'Return parentCandidates ranked best-first with similarity 0..1 and a short semantic reason. Do not treat the number as calibrated probability.',
    'The primary topicPath leaf must be under primaryParentId, and primaryParentId must be the first parentCandidates entry.',
    'Use judgment: if the item clearly belongs to a parent domain, pick the best leaf — specific if it fits, otherwise that parent\'s *-general. Do NOT force-fit unrelated categories.',
    'If a parent fits but no specific leaf fits, use that parent\'s *-general leaf.',
    `If no parent has a defensible semantic fit, return matchStatus: "${TOPIC_NO_MATCH}", leave topicIds empty, and return exactly one novelTopicSuggestion in the free topic\'s own words. Do not force-fit.`,
    'A novelTopicSuggestion is recorded as evidence only. Classify never creates it; clustered Discover decides later whether it deserves a category.',
    'Dead links: 404/5xx/placeholder → link-quality; never generic-low-signal for those (use page-not-found or placeholder-junk).',
    'Return one result object per item in items[] — same itemId, no omissions.',
  ];
  if (requireAssignment) {
    rules.unshift(
      'REQUIRED CORRECTION: every item here already passed the content-quality gate. Return at least one valid existing catalog leafId when a parent fits, or one novelTopicSuggestion when none fits. Empty topicIds plus an empty suggestion, and skip:true, are invalid.',
      'When a parent fits but no specific sibling fits, use that parent\'s *-general leaf. Do not force an unrelated parent merely to avoid a novel suggestion.'
    );
  }

  return [
    '## Task',
    'Match taxonomy-free semantic analyses to the existing parent → leaf catalog.',
    '',
    catalogMarkdown,
    '',
    '## Rules',
    rules.map((r) => `- ${r}`).join('\n'),
    '',
    '## Few-shot examples (JSON)',
    '```json',
    JSON.stringify(matchExamples, null, 2),
    '```',
    '',
    '## Taxonomy-free semantic analyses to match (JSON)',
    '```json',
    JSON.stringify(analyses, null, 2),
    '```',
    '',
    '## Response format (JSON only, no markdown fences)',
    JSON.stringify({
      results: [
        {
          itemId: 'string — must match every item above',
          matchStatus: 'MATCH or NO_MATCH',
          skip: false,
          topicIds: ['leafId from catalog', 'max 3'],
          topicPaths: [['parentId', 'leafId']],
          primaryParentId: 'best existing parent id, or null for a novel domain',
          parentCandidates: [{ parentId: 'existing parent id', similarity: '0..1', reason: 'semantic comparison' }],
          novelTopicSuggestion: null,
          confidence: '0..1',
          reason: 'short',
        },
      ],
    }),
  ].join('\n');
}

export function topicRowToDecision(
  raw: Record<string, unknown>,
  categoryIds: Set<string>,
  leafById: Map<string, { id: string; parentId?: string | null }>
): TopicExtractDecision | null {
  if (!raw || typeof raw !== 'object') return null;
  const itemId = typeof raw.itemId === 'string' ? raw.itemId : null;
  if (!itemId) return null;

  const confidence = Number.isFinite(raw.confidence as number)
    ? Math.max(0, Math.min(1, raw.confidence as number))
    : undefined;
  const reason = typeof raw.reason === 'string' ? raw.reason.slice(0, 280) : undefined;

  if (raw.skip === true) {
    return { itemId, decisionType: 'none', confidence, reason, needsReclassify: false, status: 'ok' };
  }

  const proposedList = Array.isArray(raw.proposed) ? raw.proposed : [];
  const p = (raw.novelTopicSuggestion ?? proposedList[0] ?? raw.proposedCategory) as Record<string, unknown> | undefined;
  let proposal: ProposedCategoryDraft | undefined;
  if (p && typeof p === 'object' && typeof p.name === 'string' && p.name.trim()) {
    const canonicalTags = Array.isArray(p.canonicalTags)
      ? (p.canonicalTags as string[])
          .map((t) => (typeof t === 'string' ? normalizeTag(t) : null))
          .filter((t): t is string => Boolean(t))
          .slice(0, 6)
      : [];
    proposal = {
      name: p.name.trim().slice(0, 120),
      description: (typeof p.description === 'string' ? p.description : '').trim().slice(0, 300),
      canonicalTags: canonicalTags.length ? canonicalTags : ['misc'],
      parentId: typeof p.parentId === 'string' ? p.parentId : undefined,
    };
  }

  const explicitNoMatch =
    raw.matchStatus === TOPIC_NO_MATCH ||
    raw.match === TOPIC_NO_MATCH ||
    raw.noMatch === true;
  if (explicitNoMatch) {
    return {
      itemId,
      decisionType: 'none',
      proposedCategory: proposal,
      novelTopicSuggestion: proposal,
      confidence,
      reason,
      needsReclassify: false,
      status: 'ok',
    };
  }

  const topicIds = resolveTopicAssignments(
    raw as { topicPaths?: string[][]; topicIds?: string[]; categoryIds?: string[] },
    categoryIds,
    leafById
  );
  if (topicIds.length) {
    return {
      itemId,
      decisionType: 'existing',
      categoryIds: topicIds,
      confidence,
      reason,
      needsReclassify: false,
      status: 'ok',
    };
  }

  if (proposal) {
    return {
      itemId,
      decisionType: 'none',
      proposedCategory: proposal,
      novelTopicSuggestion: proposal,
      confidence,
      reason,
      needsReclassify: false,
      status: 'ok',
    };
  }

  return { itemId, decisionType: 'none', confidence, reason, needsReclassify: false, status: 'ok' };
}

/** Convert taxonomy-free analysis into durable proposal evidence after a rejected match. */
export function novelTopicSuggestionFromDecision(
  decision: Pick<
    TopicExtractDecision,
    'novelTopicSuggestion' | 'proposedCategory' | 'semanticLabel' | 'primarySubject' |
    'semanticEvidence' | 'freeTopics'
  >
): ProposedCategoryDraft | undefined {
  if (decision.novelTopicSuggestion?.name.trim()) return decision.novelTopicSuggestion;
  if (decision.proposedCategory?.name.trim()) return decision.proposedCategory;
  const name = decision.semanticLabel?.trim() || decision.freeTopics?.[0]?.trim() || decision.primarySubject?.trim();
  if (!name) return undefined;
  const canonicalTags = [...new Set(
    (decision.freeTopics ?? [])
      .map((topic) => normalizeTag(topic))
      .filter((topic): topic is string => Boolean(topic))
  )].slice(0, 6);
  return {
    name: name.slice(0, 120),
    description: decision.semanticEvidence?.trim().slice(0, 300),
    canonicalTags: canonicalTags.length ? canonicalTags : ['misc'],
  };
}

async function callFreeTopicExtractBatch(
  settings: AISettings,
  batchItems: ClassifyBatchItem[],
  signal?: AbortSignal
): Promise<{ ok: boolean; analyses?: FreeTopicAnalysis[]; error?: string; terminal?: boolean }> {
  try {
    const response = await runAICompletion(
      aiSettingsForBatchJob(settings, 2400),
      {
        taskType: 'general',
        signal,
        messages: [
          {
            role: 'system',
            content: 'Analyze bookmarks independently of any taxonomy. Return strict JSON only. Infer what each exact link is for and why a user would likely save it, then distinguish its primary object from incidental themes. Use explicit user intent when present; otherwise infer conservatively from evidence.',
          },
          { role: 'user', content: buildFreeTopicPrompt(batchItems) },
        ],
      }
    );
    if (signal?.aborted) throw new Error('Cancelled');
    const analyses = parseReviewJson(response.text)
      .map(freeTopicRowToAnalysis)
      .filter((row): row is FreeTopicAnalysis => Boolean(row));
    if (!analyses.length) return { ok: false, error: 'Empty or unparseable semantic analysis' };
    return { ok: true, analyses };
  } catch (e) {
    if (signal?.aborted || (e instanceof Error && e.message === 'Cancelled')) throw new Error('Cancelled');
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      terminal: isTerminalAIBackendError(e),
    };
  }
}

export async function callTopicExtractBatch(
  settings: AISettings,
  categories: AiCategory[],
  analyses: FreeTopicAnalysis[],
  parents: Array<{ id: string; name: string; description?: string }> = [],
  signal?: AbortSignal,
  requireAssignment = false
): Promise<{ ok: boolean; rows?: Record<string, unknown>[]; error?: string; terminal?: boolean }> {
  const topicCatalog = buildGroupedLeafCatalog(categories, parents);
  const prompt = buildTopicExtractPrompt(topicCatalog, analyses, requireAssignment);
  try {
    const response = await runAICompletion(
      aiSettingsForBatchJob(settings, 4000),
      {
        taskType: 'general',
        signal,
        messages: [
          {
            role: 'system',
            content:
              `You match an independent bookmark-purpose analysis to an existing two-level taxonomy (JSON only). Primary classification answers why the user would retrieve this exact link, using explicit intent first and inferred save purpose second; incidental themes do not outrank the saved object. Rank plausible parents, then choose a leaf under the best-fitting parent. Prefer specific leaves over *-general. If no parent fits, return matchStatus: "${TOPIC_NO_MATCH}" plus one novelTopicSuggestion; never force-fit or create taxonomy. link-quality removal: 404, 5xx, example.com, fetch fail. Login walls → login-auth-required (attention, not removal). Never link-quality when the analysis has a real subject. Adult → adult-erotic-content.` +
              (requireAssignment
                ? ' These inputs are eligible: every result MUST assign a valid existing leaf or record one novelTopicSuggestion; empty/skip is invalid and force-fitting is forbidden.'
                : ''),
          },
          { role: 'user', content: prompt },
        ],
      }
    );
    if (signal?.aborted) throw new Error('Cancelled');
    const rows = parseReviewJson(response.text);
    if (!rows.length) return { ok: false, error: 'Empty or unparseable model response' };
    return { ok: true, rows };
  } catch (e) {
    if (signal?.aborted || (e instanceof Error && e.message === 'Cancelled')) throw new Error('Cancelled');
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      terminal: isTerminalAIBackendError(e),
    };
  }
}

export interface TopicExtractBatchRetryResult {
  decisions: Map<string, TopicExtractDecision>;
  unresolvedItemIds: string[];
  lastError?: string;
  terminalError?: boolean;
}

function pendingTopicExtractItems(
  batchItems: ClassifyBatchItem[],
  decisions: Map<string, TopicExtractDecision>
): ClassifyBatchItem[] {
  return batchItems.filter((item) => !decisions.has(item.itemId));
}

function absorbTopicExtractRows(
  rows: Record<string, unknown>[] | undefined,
  categoryIds: Set<string>,
  leafById: Map<string, { id: string; parentId?: string | null }>,
  decisions: Map<string, TopicExtractDecision>,
  analyses: Map<string, FreeTopicAnalysis>
): void {
  if (!rows?.length) return;
  for (const row of rows) {
    const parsedDecision = topicRowToDecision(row, categoryIds, leafById);
    if (parsedDecision) {
      const analysis = analyses.get(parsedDecision.itemId);
      const knownParentIds = new Set(
        [...leafById.values()]
          .map((leaf) => leaf.parentId)
          .filter((parentId): parentId is string => Boolean(parentId))
      );
      const parentCandidates = Array.isArray(row.parentCandidates)
        ? row.parentCandidates
            .filter((candidate): candidate is Record<string, unknown> => Boolean(candidate && typeof candidate === 'object'))
            .map((candidate) => ({
              parentId: typeof candidate.parentId === 'string' ? candidate.parentId.trim() : '',
              similarity: Number.isFinite(candidate.similarity as number)
                ? Math.max(0, Math.min(1, candidate.similarity as number))
                : 0,
              reason: typeof candidate.reason === 'string' ? candidate.reason.trim().slice(0, 180) : undefined,
            }))
            .filter((candidate) => knownParentIds.has(candidate.parentId))
            .slice(0, 3)
        : [];
      const rawPrimaryParentId = typeof row.primaryParentId === 'string'
        ? row.primaryParentId.trim()
        : '';
      const primaryParentId = knownParentIds.has(rawPrimaryParentId)
        ? rawPrimaryParentId
        : parentCandidates[0]?.parentId;
      const selectedPrimaryId = parsedDecision.categoryIds?.[0];
      const selectedParentId = selectedPrimaryId
        ? leafById.get(selectedPrimaryId)?.parentId ?? undefined
        : undefined;
      const d: TopicExtractDecision =
        parsedDecision.decisionType === 'existing' &&
        primaryParentId &&
        selectedParentId !== primaryParentId
          ? {
              ...parsedDecision,
              decisionType: 'none',
              categoryIds: undefined,
              reason: `Rejected inconsistent hierarchy: primary parent ${primaryParentId}, selected leaf parent ${selectedParentId ?? 'missing'}.`,
            }
          : parsedDecision;
      decisions.set(d.itemId, {
        ...d,
        semanticLabel: analysis?.semanticLabel,
        primarySubject: analysis?.primarySubject,
        likelySavePurpose: analysis?.likelySavePurpose,
        contentKind: analysis?.contentKind,
        secondaryThemes: analysis?.secondaryThemes,
        freeTopics: analysis?.freeTopics,
        semanticDomain: analysis?.broadDomain,
        semanticEvidence: analysis?.evidence,
        semanticContentState: analysis?.contentState,
        parentCandidates,
        primaryParentId,
        novelTopicSuggestion: d.proposedCategory,
      });
    }
  }
}

/** Classify a batch with re-chunked retries; singles only for stubborn leftovers. */
export async function resolveTopicExtractBatchWithRetry(
  settings: AISettings,
  categories: AiCategory[],
  batchItems: ClassifyBatchItem[],
  categoryIds: Set<string>,
  leafById: Map<string, { id: string; parentId?: string | null }>,
  parents: Array<{ id: string; name: string; description?: string }>,
  batchSize: number,
  signal?: AbortSignal,
  onProgress?: (msg: string) => void
): Promise<TopicExtractBatchRetryResult> {
  const decisions = new Map<string, TopicExtractDecision>();
  let lastError: string | undefined;
  let terminalError = false;
  if (!batchItems.length) {
    return { decisions, unresolvedItemIds: [] };
  }

  const analyses = new Map<string, FreeTopicAnalysis>();
  const analyze = async (items: ClassifyBatchItem[]): Promise<void> => {
    if (!items.length || terminalError) return;
    const response = await callFreeTopicExtractBatch(settings, items, signal);
    if (response.ok) {
      for (const analysis of response.analyses ?? []) {
        if (items.some((item) => item.itemId === analysis.itemId)) analyses.set(analysis.itemId, analysis);
      }
    } else {
      lastError = response.error ?? lastError ?? 'Empty or unparseable semantic analysis';
      terminalError = response.terminal === true;
    }
  };

  onProgress?.(`Analyzing ${batchItems.length} item${batchItems.length === 1 ? '' : 's'} without taxonomy…`);
  await analyze(batchItems);
  const missingAnalyses = batchItems.filter((item) => !analyses.has(item.itemId));
  if (!terminalError && missingAnalyses.length > 0) {
    onProgress?.(`Retrying semantic analysis for ${missingAnalyses.length} item${missingAnalyses.length === 1 ? '' : 's'}…`);
    await analyze(missingAnalyses);
  }
  if (terminalError) {
    return {
      decisions,
      unresolvedItemIds: batchItems.map((item) => item.itemId),
      lastError,
      terminalError: true,
    };
  }

  const runBatch = async (
    items: ClassifyBatchItem[],
    requireAssignment = false
  ): Promise<ClassifyBatchItem[]> => {
    if (signal?.aborted) throw new Error('Cancelled');
    if (terminalError) return [];
    const matchingAnalyses = items
      .map((item) => analyses.get(item.itemId))
      .filter((analysis): analysis is FreeTopicAnalysis => Boolean(analysis));
    if (!matchingAnalyses.length) return items;
    const resp = await callTopicExtractBatch(
      settings,
      categories,
      matchingAnalyses,
      parents,
      signal,
      requireAssignment
    );
    if (resp.ok && resp.rows?.length) {
      absorbTopicExtractRows(resp.rows, categoryIds, leafById, decisions, analyses);
    } else {
      lastError = resp.error ?? lastError ?? 'Empty or unparseable model response';
      terminalError = resp.terminal === true;
    }
    return terminalError ? [] : pendingTopicExtractItems(items, decisions);
  };

  let pending = await runBatch(batchItems.filter((item) => analyses.has(item.itemId)));

  const declined = batchItems.filter(
    (item) => {
      const decision = decisions.get(item.itemId);
      return decision?.decisionType === 'none' && !decision.proposedCategory;
    }
  );
  if (declined.length > 0) {
    for (const item of declined) decisions.delete(item.itemId);
    onProgress?.(`Correcting ${declined.length} empty classification${declined.length === 1 ? '' : 's'}…`);
    await runBatch(declined, true);
    pending = pendingTopicExtractItems(batchItems, decisions);
  }

  if (terminalError) {
    return {
      decisions,
      unresolvedItemIds: batchItems.map((item) => item.itemId),
      lastError,
      terminalError: true,
    };
  }

  for (let round = 1; round <= LLM_BATCH_RETRY_ROUNDS && pending.length > 0; round++) {
    if (signal?.aborted) throw new Error('Cancelled');
    onProgress?.(`Retry batch round ${round}/${LLM_BATCH_RETRY_ROUNDS} (${pending.length} items)…`);
    const chunks = chunk(pending, batchSize);
    const nextPending: ClassifyBatchItem[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkItems = chunks[i]!;
      onProgress?.(
        chunks.length > 1
          ? `Retry batch ${round}.${i + 1} (${chunkItems.length} items)…`
          : `Retry batch ${round} (${chunkItems.length} items)…`
      );
      nextPending.push(...(await runBatch(chunkItems)));
    }
    pending = nextPending;
  }

  if (pending.length > 1) {
    onProgress?.(`Final batch retry (${pending.length} items)…`);
    pending = await runBatch(pending);
  }

  if (pending.length > 0) {
    const singles = pending.slice(0, LLM_SINGLE_FALLBACK_CAP);
    onProgress?.(`Single-item retry for ${singles.length} stubborn item(s)…`);
    for (let i = 0; i < singles.length; i++) {
      if (signal?.aborted) throw new Error('Cancelled');
      const item = singles[i]!;
      onProgress?.(`Single retry ${i + 1}/${singles.length}…`);
      pending = await runBatch([item]);
    }
  }

  const unresolvedItemIds = batchItems
    .map((item) => item.itemId)
    .filter((itemId) => !decisions.has(itemId));

  return { decisions, unresolvedItemIds, lastError, terminalError };
}

export { chunk as chunkClassifyBatch };
