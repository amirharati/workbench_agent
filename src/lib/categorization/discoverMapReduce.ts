/**
 * Map → reduce discover pipeline (V3 session 1a).
 * Map: short LLM calls on item batches → candidate parents/leaves (recall).
 * Reduce: LLM on proposals only → merge into existing taxonomy + within-run dupes.
 * Mechanical: dedupe, orphan parentId fix (mergeDiscovery*), taxonomyMerge safety net.
 */
import { runAICompletion } from '../ai/client';
import { aiSettingsForBatchJob } from '../ai/settings';
import type { AISettings } from '../ai/types';
import {
  mergeDiscoveryTaxonomy,
  parentIdFromProposal,
  type DiscoverSampleItem,
  type DiscoveryBatchResponse,
  type DiscoveryLeafProposal,
  type DiscoveryParentProposal,
} from './discoverTaxonomy';
import { stripFences } from './parseReview';
import type { AiCategory } from './types';
import { getParentsFromCategories } from './taxonomyCatalog';
import {
  applyTaxonomyMergeInMemory,
  type TaxonomyMergeAuditEntry,
} from './taxonomyMergeCore';
import {
  callDiscoveryBatchWithRetry,
  DEFAULT_DISCOVER_BATCH_SIZE,
  sliceDiscoverMapPool,
} from './discoverPolicy';

/** Items per map call — aligned with legacy/CLI discover batch (32). */
export const DISCOVER_MAP_BATCH_SIZE = DEFAULT_DISCOVER_BATCH_SIZE;

/** Generous MAP caps (recall); reduce phases trim. */
export const DISCOVER_MAP_MAX_PARENTS_PER_CALL = 6;
export const DISCOVER_MAP_MAX_LEAVES_PER_CALL = 28;

/** Net caps after reduce (quality-first; still bounded). */
export const DISCOVER_REDUCE_MAX_NET_PARENTS = 5;
export const DISCOVER_REDUCE_MAX_NET_LEAVES = 36;

/** Max concurrent per-parent leaf reduce LLM calls. */
export const DISCOVER_REDUCE_LEAF_CONCURRENCY = 5;

/** Leaf floor when MAP proposed heavily — avoid over-pruning. */
export const DISCOVER_REDUCE_RAW_LEAF_FLOOR = 12;
export const DISCOVER_REDUCE_MIN_NET_LEAVES = 22;
export const DISCOVER_REDUCE_MIN_LEAVES_PER_PARENT = 6;
export const DISCOVER_REDUCE_MAX_LEAVES_PER_PARENT_CAP = 18;

const DISCOVER_MAP_MAX_TOKENS = 6500;
const DISCOVER_REDUCE_PARENTS_MAX_TOKENS = 5500;
const DISCOVER_REDUCE_LEAVES_MAX_TOKENS = 5000;
const DISCOVER_REDUCE_SINGLE_MAX_TOKENS = 7000;

/** Max leaf names listed per parent in MAP catalog (quality vs size). */
const MAP_LEAF_NAMES_PER_PARENT = 14;

export type DiscoverReduceMode = 'per-parent' | 'single';

export interface DiscoverMapReduceOpts {
  mapBatchSize?: number;
  /** Omit to MAP every item in `samples` (ceil(n/batchSize) calls). Set to cap cost/tests. */
  maxMapBatches?: number;
  maxNetParents?: number;
  maxNetLeaves?: number;
  gapFillMode?: boolean;
  signal?: AbortSignal;
  onProgress?: (label: string) => void;
  /** Use legacy single-phase discover (for baseline comparison only). */
  legacySinglePhase?: boolean;
  /** `per-parent` (default): reduce parents, then parallel leaf reduce per parent. */
  reduceMode?: DiscoverReduceMode;
}

export interface DiscoverMapReduceResult {
  categories: AiCategory[];
  addedParents: AiCategory[];
  addedLeaves: AiCategory[];
  proposedParentsRaw: number;
  proposedLeavesRaw: number;
  mapBatches: number;
  reduceCalls: number;
  reduceLeafCalls: number;
  reduceMode: DiscoverReduceMode | 'legacy';
  llmErrors: number;
  mergeAudit: TaxonomyMergeAuditEntry[];
  taxonomyMerge: { mergedParents: number; mergedLeaves: number };
}

function normalizeNameKey(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function buildCompactParentList(
  parents: Array<{ id: string; name: string; description?: string }>
): string {
  if (!parents.length) return '(empty — cold start; you may propose newParents)';
  return parents
    .map((p) => `- **${p.id}**: ${p.name}${p.description ? ` — ${p.description.slice(0, 120)}` : ''}`)
    .join('\n');
}

/** Parents + leaf names (no leaf ids) — richer MAP context without full classify catalog. */
function buildMapCatalogSection(
  parents: Array<{ id: string; name: string; description?: string }>,
  leaves: AiCategory[]
): string {
  if (!parents.length) return '(empty — cold start; you may propose newParents)';
  const namesByParent = new Map<string, string[]>();
  for (const leaf of leaves) {
    if (leaf.kind !== 'leaf' || !leaf.assignable || leaf.isGeneralFallback) continue;
    const pid = leaf.parentId ?? '';
    if (!namesByParent.has(pid)) namesByParent.set(pid, []);
    const list = namesByParent.get(pid)!;
    if (list.length < MAP_LEAF_NAMES_PER_PARENT) list.push(leaf.name);
  }
  const lines: string[] = [];
  for (const parent of parents) {
    lines.push(`**${parent.id}** — ${parent.name}`);
    const leafNames = namesByParent.get(parent.id) ?? [];
    if (leafNames.length) {
      lines.push(`  leaves: ${leafNames.join(' · ')}`);
    }
  }
  return lines.join('\n');
}

function buildMapDiscoveryPrompt(
  parents: Array<{ id: string; name: string; description?: string }>,
  leaves: AiCategory[],
  batchItems: DiscoverSampleItem[],
  maxNewParents: number,
  maxNewLeaves: number,
  gapFillMode: boolean
): string {
  return [
    '## Task (MAP — proposals only)',
    gapFillMode
      ? 'These bookmarks lack a specific topic. Propose candidate **parents** and **leaves** as JSON. ' +
          'Do not assign items yet; another step will merge into the taxonomy.'
      : 'From this sample, list candidate **newParents** and **newLeaves** that would help organize these bookmarks. ' +
          'Prefer reusing parentIds below and leaves that complement (not duplicate) existing leaf names.',
    '',
    '## Existing taxonomy (parentId + leaf names)',
    buildMapCatalogSection(parents, leaves),
    '',
    '## Rules',
    '- MAP phase: propose freely within caps; duplicates across batches are OK.',
    '- Use exact parentId strings from the list for newLeaves[].parentId.',
    '- Only propose newParents[] for a genuinely new top-level domain not covered above.',
    '- Each new leaf: 2–5 words, atomic; parentId must exist above or appear in newParents[].',
    '- Require ≥2 items in the batch to justify a new leaf.',
    `- At most ${maxNewParents} newParents, ${maxNewLeaves} newLeaves in this response.`,
    '',
    '## Items (JSON)',
    '```json',
    JSON.stringify(
      batchItems.map((i) => ({
        itemId: i.itemId,
        title: i.title,
        summary: i.aiSummary.slice(0, 1200),
        ...(i.stuckKind ? { stuckKind: i.stuckKind } : {}),
      })),
      null,
      2
    ),
    '```',
    '',
    '## Response (JSON only)',
    JSON.stringify({
      newParents: [{ id: 'optional-slug', name: 'Broad domain', description: 'scope' }],
      newLeaves: [
        {
          id: 'optional-slug',
          parentId: 'exact-parent-id',
          name: 'atomic topic',
          description: 'one sentence',
          canonicalTags: ['tag'],
        },
      ],
    }),
  ].join('\n');
}

function buildReduceParentsPrompt(
  parents: Array<{ id: string; name: string; description?: string }>,
  parentProposals: DiscoveryParentProposal[],
  maxNetParents: number
): string {
  return [
    '## Task (REDUCE-PARENTS — domains only)',
    'Prune candidate **parent** proposals from MAP. Do **not** decide leaves yet.',
    '',
    '### Rules',
    '- **merge_into_existing**: record in parentRemap[] with canonicalParentId from **Existing parents** only — do NOT add to newParents[].',
    '- Never set canonicalParentId to a domain not listed under Existing parents (no invented seed ids on cold start).',
    '- **keep_new**: add to newParents[] (genuinely new top-level domain only).',
    '- **drop**: omit and optionally record in parentRemap with action drop.',
    '- Deep learning, NLP, data science, cloud, DevOps, etc. → existing seed parents, not newParents.',
    `- At most ${maxNetParents} entries in newParents[].`,
    '',
    '## Existing parents',
    buildCompactParentList(parents),
    '',
    '## Candidate parents from MAP',
    '```json',
    JSON.stringify(parentProposals, null, 2),
    '```',
    '',
    '## Response (JSON only)',
    JSON.stringify({
      newParents: [{ id: 'optional-slug', name: 'kept domain', description: 'why' }],
      parentRemap: [
        {
          proposalId: 'id-from-map-proposal',
          canonicalParentId: 'existing-parent-id',
          action: 'merge_into_existing',
          reason: 'short',
        },
      ],
    }),
  ].join('\n');
}

function buildReduceLeavesForParentPrompt(
  parent: { id: string; name: string; description?: string },
  existingLeaves: AiCategory[],
  leafProposals: DiscoveryLeafProposal[],
  maxLeavesForParent: number
): string {
  const leafLines = existingLeaves
    .filter((l) => l.kind === 'leaf' && l.parentId === parent.id)
    .map((l) => {
      const fb = l.isGeneralFallback ? ' [general]' : '';
      return `  • ${l.name}${fb}`;
    })
    .join('\n');

  return [
    `## Task (REDUCE-LEAVES — parent "${parent.id}")`,
    `Parent: **${parent.name}** — ${(parent.description || '').slice(0, 120)}`,
    'Prune candidate **leaf** proposals for this parent only. Compare to **all** existing leaves listed below.',
    '',
    '### Rules',
    '- **merge_into_existing** / duplicate name: omit from newLeaves[] (record in merges if useful).',
    '- **keep_new**: add to newLeaves[] with parentId exactly `' + parent.id + '`.',
    '- **drop**: only when clearly duplicate of an existing leaf name or useless singleton.',
    '- Do **not** over-prune: if MAP proposed distinct clusters, keep leaves that would help classify bookmarks.',
    '- Each kept leaf: 2–5 words, distinct from existing leaf names under this parent.',
    `- Up to ${maxLeavesForParent} leaves in newLeaves[] (keep useful ones; merging duplicates is OK).`,
    '',
    '## Existing leaves under this parent',
    leafLines || '(none — cold parent)',
    '',
    '## Candidate leaf proposals (already assigned to this parent)',
    '```json',
    JSON.stringify(leafProposals, null, 2),
    '```',
    '',
    '## Response (JSON only)',
    JSON.stringify({
      newLeaves: [
        {
          id: 'optional',
          parentId: parent.id,
          name: 'atomic topic',
          description: 'one sentence',
          canonicalTags: ['tag'],
        },
      ],
      merges: [
        {
          kind: 'leaf',
          absorbedName: 'proposal name',
          canonicalId: 'existing-leaf-id-or-name',
          action: 'merge_into_existing',
          reason: 'duplicate of existing leaf',
        },
      ],
    }),
  ].join('\n');
}

function buildReduceDiscoveryPrompt(
  parents: Array<{ id: string; name: string; description?: string }>,
  leavesSoFar: AiCategory[],
  parentProposals: DiscoveryParentProposal[],
  leafProposals: DiscoveryLeafProposal[],
  maxNetParents: number,
  maxNetLeaves: number
): string {
  const leafCatalog = buildMapCatalogSection(parents, leavesSoFar);

  return [
    '## Task (REDUCE — merge proposals)',
    'You receive candidate parents/leaves from a MAP phase. Output a **pruned** list to add to the taxonomy.',
  '',
    '### Merge rules',
    '- **merge_into_existing**: fold proposal into an existing parent or leaf (do not include in newParents/newLeaves).',
    '- **keep_new**: include in newParents[] or newLeaves[] (valid parentId required for leaves).',
    '- **drop**: redundant or too narrow; omit from output arrays.',
    '- Never create a new parent if content fits an existing parent (deep learning, NLP, cloud, etc. → existing ML/infra/dev parents).',
    '- Prefer new leaves under existing parents over new parents.',
    `- Output at most ${maxNetParents} parents and ${maxNetLeaves} leaves total in newParents/newLeaves.`,
    '',
    '## Existing taxonomy',
    leafCatalog,
    '',
    '## Candidate parents from MAP',
    '```json',
    JSON.stringify(parentProposals, null, 2),
    '```',
    '',
    '## Candidate leaves from MAP',
    '```json',
    JSON.stringify(leafProposals, null, 2),
    '```',
    '',
    '## Response (JSON only)',
    JSON.stringify({
      newParents: [{ id: 'optional', name: 'kept parent', description: 'why kept' }],
      newLeaves: [
        {
          id: 'optional',
          parentId: 'existing-or-new-parent-id',
          name: 'kept leaf',
          description: 'why',
          canonicalTags: ['tag'],
        },
      ],
      merges: [
        {
          kind: 'parent',
          absorbedName: 'Deep Learning Education',
          canonicalId: 'machine-learning',
          action: 'merge_into_existing',
          reason: 'fits ML seed parent',
        },
      ],
    }),
  ].join('\n');
}

export async function callDiscoveryMapBatch(
  settings: AISettings,
  parents: Array<{ id: string; name: string; description?: string }>,
  leaves: AiCategory[],
  batchItems: DiscoverSampleItem[],
  opts: {
    maxNewParents: number;
    maxNewLeaves: number;
    gapFillMode?: boolean;
    signal?: AbortSignal;
  }
): Promise<{ ok: boolean; data?: DiscoveryBatchResponse; error?: string }> {
  try {
    const response = await runAICompletion(
      aiSettingsForBatchJob(settings, DISCOVER_MAP_MAX_TOKENS),
      {
      taskType: 'general',
      signal: opts.signal,
      messages: [
        {
          role: 'system',
          content:
            'You propose taxonomy candidates from bookmark samples. Return only valid JSON with newParents and newLeaves arrays. No itemResults in MAP phase.',
        },
        {
          role: 'user',
          content: buildMapDiscoveryPrompt(
            parents,
            leaves,
            batchItems,
            opts.maxNewParents,
            opts.maxNewLeaves,
            opts.gapFillMode === true
          ),
        },
      ],
    }
    );
    if (opts.signal?.aborted) throw new Error('Cancelled');
    const parsed = JSON.parse(stripFences(response.text)) as DiscoveryBatchResponse;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Failed to parse map JSON' };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    if (opts.signal?.aborted || (e instanceof Error && e.message === 'Cancelled')) {
      throw new Error('Cancelled');
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface DiscoveryReduceResponse extends DiscoveryBatchResponse {
  merges?: Array<{
    kind?: string;
    absorbedName?: string;
    canonicalId?: string;
    action?: string;
    reason?: string;
  }>;
}

export interface DiscoveryReduceParentsResponse {
  newParents?: DiscoveryParentProposal[];
  parentRemap?: Array<{
    proposalId?: string;
    canonicalParentId?: string;
    action?: string;
    reason?: string;
  }>;
  merges?: DiscoveryReduceResponse['merges'];
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function callDiscoveryReduceParents(
  settings: AISettings,
  parents: Array<{ id: string; name: string; description?: string }>,
  parentProposals: DiscoveryParentProposal[],
  opts: { maxNetParents: number; signal?: AbortSignal }
): Promise<{ ok: boolean; data?: DiscoveryReduceParentsResponse; error?: string }> {
  if (!parentProposals.length) {
    return { ok: true, data: { newParents: [], parentRemap: [] } };
  }
  try {
    const response = await runAICompletion(
      aiSettingsForBatchJob(settings, DISCOVER_REDUCE_PARENTS_MAX_TOKENS),
      {
      taskType: 'general',
      signal: opts.signal,
      messages: [
        {
          role: 'system',
          content:
            'You merge taxonomy parent proposals. Return only valid JSON with newParents and parentRemap. No leaves.',
        },
        {
          role: 'user',
          content: buildReduceParentsPrompt(parents, parentProposals, opts.maxNetParents),
        },
      ],
    }
    );
    if (opts.signal?.aborted) throw new Error('Cancelled');
    const parsed = JSON.parse(stripFences(response.text)) as DiscoveryReduceParentsResponse;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Failed to parse reduce-parents JSON' };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    if (opts.signal?.aborted || (e instanceof Error && e.message === 'Cancelled')) {
      throw new Error('Cancelled');
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function callDiscoveryReduceLeavesForParent(
  settings: AISettings,
  parent: { id: string; name: string; description?: string },
  existingLeaves: AiCategory[],
  leafProposals: DiscoveryLeafProposal[],
  opts: { maxLeavesForParent: number; signal?: AbortSignal }
): Promise<{ ok: boolean; data?: DiscoveryReduceResponse; error?: string }> {
  if (!leafProposals.length) {
    return { ok: true, data: { newLeaves: [], merges: [] } };
  }
  try {
    const response = await runAICompletion(
      aiSettingsForBatchJob(settings, DISCOVER_REDUCE_LEAVES_MAX_TOKENS),
      {
      taskType: 'general',
      signal: opts.signal,
      messages: [
        {
          role: 'system',
          content:
            'You merge leaf proposals under one parent. Return only valid JSON. Every newLeaves[].parentId must match the parent in the prompt.',
        },
        {
          role: 'user',
          content: buildReduceLeavesForParentPrompt(
            parent,
            existingLeaves,
            leafProposals,
            opts.maxLeavesForParent
          ),
        },
      ],
    }
    );
    if (opts.signal?.aborted) throw new Error('Cancelled');
    const parsed = JSON.parse(stripFences(response.text)) as DiscoveryReduceResponse;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Failed to parse reduce-leaves JSON' };
    }
    for (const leaf of parsed.newLeaves ?? []) {
      leaf.parentId = parent.id;
    }
    return { ok: true, data: parsed };
  } catch (e) {
    if (opts.signal?.aborted || (e instanceof Error && e.message === 'Cancelled')) {
      throw new Error('Cancelled');
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function parentRemapToMap(
  entries: DiscoveryReduceParentsResponse['parentRemap'],
  audit: TaxonomyMergeAuditEntry[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of entries ?? []) {
    const from = (row.proposalId || '').trim();
    const to = (row.canonicalParentId || '').trim();
    if (!from || !to) continue;
    map.set(from, to);
    if (row.action === 'merge_into_existing' || row.action === 'merge') {
      audit.push({
        kind: 'parent',
        absorbed: from,
        canonical: to,
        source: 'llm_reduce',
        reason: row.reason,
      });
    }
  }
  return map;
}

function applyParentRemapToLeaves(
  leaves: DiscoveryLeafProposal[],
  remap: Map<string, string>,
  validParentIds: Set<string>
): DiscoveryLeafProposal[] {
  return leaves.map((p) => {
    const pid = (p.parentId || '').trim();
    const mapped = remap.get(pid);
    if (mapped && validParentIds.has(mapped)) {
      return { ...p, parentId: mapped };
    }
    if (validParentIds.has(pid)) return p;
    return p;
  });
}

function effectiveMinNetLeaves(rawLeafCount: number, maxNetLeaves: number): number {
  if (rawLeafCount < DISCOVER_REDUCE_RAW_LEAF_FLOOR) return maxNetLeaves;
  const target = Math.max(
    DISCOVER_REDUCE_MIN_NET_LEAVES,
    Math.ceil(rawLeafCount * 0.58)
  );
  return Math.min(maxNetLeaves, target);
}

function maxLeavesPerParentBudget(
  parentCount: number,
  maxNetLeaves: number,
  rawLeafCount: number
): number {
  const netTarget = effectiveMinNetLeaves(rawLeafCount, maxNetLeaves);
  const share = Math.ceil(netTarget / Math.max(1, parentCount));
  return Math.max(
    DISCOVER_REDUCE_MIN_LEAVES_PER_PARENT,
    Math.min(DISCOVER_REDUCE_MAX_LEAVES_PER_PARENT_CAP, share)
  );
}

/** If LLM reduce kept too few leaves, backfill from MAP pool (deduped). */
function backfillLeavesIfSparse(
  kept: DiscoveryLeafProposal[],
  pool: DiscoveryLeafProposal[],
  minNet: number,
  maxNet: number
): DiscoveryLeafProposal[] {
  let out = dedupeLeafProposals(kept);
  if (out.length >= minNet || !pool.length) {
    return out.slice(0, maxNet);
  }
  const seen = new Set(out.map((l) => `${l.parentId}::${normalizeNameKey(l.name)}`));
  for (const p of pool) {
    if (out.length >= minNet || out.length >= maxNet) break;
    const key = `${p.parentId}::${normalizeNameKey(p.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return dedupeLeafProposals(out).slice(0, maxNet);
}

function groupLeavesByParent(
  leaves: DiscoveryLeafProposal[],
  validParentIds: Set<string>
): Map<string, DiscoveryLeafProposal[]> {
  const groups = new Map<string, DiscoveryLeafProposal[]>();
  for (const leaf of leaves) {
    const pid = (leaf.parentId || '').trim();
    if (!pid || !validParentIds.has(pid)) continue;
    if (!groups.has(pid)) groups.set(pid, []);
    groups.get(pid)!.push(leaf);
  }
  return groups;
}

export async function callDiscoveryReduce(
  settings: AISettings,
  parents: Array<{ id: string; name: string; description?: string }>,
  leavesSoFar: AiCategory[],
  parentProposals: DiscoveryParentProposal[],
  leafProposals: DiscoveryLeafProposal[],
  opts: {
    maxNetParents: number;
    maxNetLeaves: number;
    signal?: AbortSignal;
  }
): Promise<{ ok: boolean; data?: DiscoveryReduceResponse; error?: string }> {
  if (!parentProposals.length && !leafProposals.length) {
    return { ok: true, data: { newParents: [], newLeaves: [], merges: [] } };
  }
  try {
    const response = await runAICompletion(
      aiSettingsForBatchJob(settings, DISCOVER_REDUCE_SINGLE_MAX_TOKENS),
      {
      taskType: 'general',
      signal: opts.signal,
      messages: [
        {
          role: 'system',
          content:
            'You merge and prune taxonomy proposals against an existing catalog. Return only valid JSON. ' +
            'newParents/newLeaves must be the final kept set; record folded items in merges[].',
        },
        {
          role: 'user',
          content: buildReduceDiscoveryPrompt(
            parents,
            leavesSoFar,
            parentProposals,
            leafProposals,
            opts.maxNetParents,
            opts.maxNetLeaves
          ),
        },
      ],
    }
    );
    if (opts.signal?.aborted) throw new Error('Cancelled');
    const parsed = JSON.parse(stripFences(response.text)) as DiscoveryReduceResponse;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Failed to parse reduce JSON' };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    if (opts.signal?.aborted || (e instanceof Error && e.message === 'Cancelled')) {
      throw new Error('Cancelled');
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function dedupeParentProposals(proposals: DiscoveryParentProposal[]): DiscoveryParentProposal[] {
  const seen = new Set<string>();
  const out: DiscoveryParentProposal[] = [];
  for (const p of proposals) {
    if (!p?.name?.trim()) continue;
    const key = normalizeNameKey(p.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function dedupeLeafProposals(proposals: DiscoveryLeafProposal[]): DiscoveryLeafProposal[] {
  const seen = new Set<string>();
  const out: DiscoveryLeafProposal[] = [];
  for (const p of proposals) {
    if (!p?.name?.trim()) continue;
    const key = `${p.parentId ?? ''}::${normalizeNameKey(p.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function mergeAuditFromReduce(
  merges: DiscoveryReduceResponse['merges']
): TaxonomyMergeAuditEntry[] {
  const audit: TaxonomyMergeAuditEntry[] = [];
  for (const m of merges ?? []) {
    if (!m?.absorbedName && !m?.canonicalId) continue;
    audit.push({
      kind: m.kind === 'leaf' ? 'leaf' : 'parent',
      absorbed: m.absorbedName ?? m.canonicalId ?? '',
      canonical: m.canonicalId ?? '',
      source: 'llm_reduce',
      reason: m.reason,
    });
  }
  return audit;
}

/**
 * Run map → reduce discover on in-memory categories + samples.
 */
export async function runDiscoverMapReduce(
  settings: AISettings,
  categories: AiCategory[],
  samples: DiscoverSampleItem[],
  opts: DiscoverMapReduceOpts = {}
): Promise<DiscoverMapReduceResult> {
  const mapBatchSize = opts.mapBatchSize ?? DISCOVER_MAP_BATCH_SIZE;
  const maxNetParents = opts.maxNetParents ?? DISCOVER_REDUCE_MAX_NET_PARENTS;
  const maxNetLeaves = opts.maxNetLeaves ?? DISCOVER_REDUCE_MAX_NET_LEAVES;
  const gapFillMode = opts.gapFillMode === true;
  const reduceMode: DiscoverReduceMode | 'legacy' = opts.legacySinglePhase
    ? 'legacy'
    : opts.reduceMode ?? 'per-parent';
  const now = Date.now();

  let proposedParentsRaw = 0;
  let proposedLeavesRaw = 0;
  let llmErrors = 0;
  let reduceCalls = 0;
  let reduceLeafCalls = 0;
  const mergeAudit: TaxonomyMergeAuditEntry[] = [];

  const mapChunks = sliceDiscoverMapPool(samples, mapBatchSize, opts.maxMapBatches);
  const rawParents: DiscoveryParentProposal[] = [];
  const rawLeaves: DiscoveryLeafProposal[] = [];

  if (opts.legacySinglePhase) {
    for (let i = 0; i < mapChunks.length; i++) {
      opts.onProgress?.(`Legacy discover batch ${i + 1}/${mapChunks.length}…`);
      const parents = getParentsFromCategories(categories);
      const resp = await callDiscoveryBatchWithRetry(
        settings,
        parents,
        categories,
        mapChunks[i]!,
        {
          maxNewParents: DISCOVER_MAP_MAX_PARENTS_PER_CALL,
          maxNewLeaves: DISCOVER_MAP_MAX_LEAVES_PER_CALL,
          gapFillMode,
          batchSize: mapBatchSize,
          signal: opts.signal,
        }
      );
      if (!resp.ok) {
        llmErrors++;
        continue;
      }
      const data = resp.data ?? {};
      rawParents.push(...(data.newParents ?? []));
      rawLeaves.push(...(data.newLeaves ?? []));
    }
    proposedParentsRaw = rawParents.length;
    proposedLeavesRaw = rawLeaves.length;
    const merged = mergeDiscoveryTaxonomy(categories, {
      newParents: dedupeParentProposals(rawParents).slice(0, maxNetParents),
      newLeaves: dedupeLeafProposals(rawLeaves).slice(0, maxNetLeaves),
    }, { maxNewParents: maxNetParents, maxNewLeaves: maxNetLeaves, now });
    const mechanical = applyTaxonomyMergeInMemory(merged.categories);
    return {
      categories: mechanical.categories,
      addedParents: merged.addedParents,
      addedLeaves: merged.addedLeaves,
      proposedParentsRaw,
      proposedLeavesRaw,
      mapBatches: mapChunks.length,
      reduceCalls: 0,
      reduceLeafCalls: 0,
      reduceMode: 'legacy',
      llmErrors,
      mergeAudit: [...mergeAudit, ...mechanical.audit],
      taxonomyMerge: {
        mergedParents: mechanical.mergedParents,
        mergedLeaves: mechanical.mergedLeaves,
      },
    };
  }

  for (let i = 0; i < mapChunks.length; i++) {
    opts.onProgress?.(`Map batch ${i + 1}/${mapChunks.length} (${mapChunks[i]!.length} items)…`);
    const parents = getParentsFromCategories(categories);
    const resp = await callDiscoveryMapBatch(settings, parents, categories, mapChunks[i]!, {
      maxNewParents: DISCOVER_MAP_MAX_PARENTS_PER_CALL,
      maxNewLeaves: DISCOVER_MAP_MAX_LEAVES_PER_CALL,
      gapFillMode,
      signal: opts.signal,
    });
    if (!resp.ok) {
      llmErrors++;
      console.warn(`[discoverMapReduce] map batch ${i + 1} failed:`, resp.error);
      continue;
    }
    const data = resp.data ?? {};
    rawParents.push(...(data.newParents ?? []));
    rawLeaves.push(...(data.newLeaves ?? []));
  }

  proposedParentsRaw = rawParents.length;
  proposedLeavesRaw = rawLeaves.length;

  const dedupedParents = dedupeParentProposals(rawParents);
  let dedupedLeaves = dedupeLeafProposals(rawLeaves);

  let finalParents = dedupedParents.slice(0, maxNetParents);
  let finalLeaves: DiscoveryLeafProposal[] = [];

  const catalogParents = getParentsFromCategories(categories);
  const allLeaves = categories.filter((c) => c.kind === 'leaf');

  if (dedupedParents.length > 0 || dedupedLeaves.length > 0) {
    if (reduceMode === 'single') {
      opts.onProgress?.('Reduce (single): merging all proposals…');
      const reduceResp = await callDiscoveryReduce(
        settings,
        catalogParents,
        allLeaves,
        dedupedParents,
        dedupedLeaves,
        { maxNetParents, maxNetLeaves, signal: opts.signal }
      );
      reduceCalls = 1;
      if (reduceResp.ok && reduceResp.data) {
        mergeAudit.push(...mergeAuditFromReduce(reduceResp.data.merges));
        finalParents = dedupeParentProposals(reduceResp.data.newParents ?? finalParents).slice(
          0,
          maxNetParents
        );
        finalLeaves = dedupeLeafProposals(reduceResp.data.newLeaves ?? []).slice(0, maxNetLeaves);
      } else {
        llmErrors++;
        finalLeaves = dedupedLeaves.slice(0, maxNetLeaves);
        opts.onProgress?.(`Reduce failed (${reduceResp.error ?? 'unknown'}); mechanical dedupe only`);
      }
    } else {
      opts.onProgress?.('Reduce parents: pruning domain proposals…');
      const parentReduceResp = await callDiscoveryReduceParents(settings, catalogParents, dedupedParents, {
        maxNetParents,
        signal: opts.signal,
      });
      reduceCalls = 1;

      let parentRemap = new Map<string, string>();
      if (parentReduceResp.ok && parentReduceResp.data) {
        mergeAudit.push(...mergeAuditFromReduce(parentReduceResp.data.merges));
        parentRemap = parentRemapToMap(parentReduceResp.data.parentRemap, mergeAudit);
        finalParents = dedupeParentProposals(parentReduceResp.data.newParents ?? []).slice(
          0,
          maxNetParents
        );
      } else {
        llmErrors++;
        finalParents = dedupedParents.slice(0, maxNetParents);
        opts.onProgress?.(
          `Reduce-parents failed (${parentReduceResp.error ?? 'unknown'}); using map parents`
        );
      }

      const validParentIds = new Set(catalogParents.map((p) => p.id));
      for (const p of finalParents) {
        const id = (p.id || '').trim() || parentIdFromProposal(p.name, validParentIds);
        validParentIds.add(id);
      }

      dedupedLeaves = applyParentRemapToLeaves(dedupedLeaves, parentRemap, validParentIds);
      const leafGroups = groupLeavesByParent(dedupedLeaves, validParentIds);
      if (!leafGroups.size && dedupedLeaves.length) {
        const fallbackParent = finalParents[0];
        if (fallbackParent) {
          const fid =
            (typeof fallbackParent.id === 'string' && fallbackParent.id.trim()
              ? fallbackParent.id.trim().replace(/[^a-z0-9-]/g, '-')
              : parentIdFromProposal(fallbackParent.name, validParentIds)) || 'domain';
          validParentIds.add(fid);
          leafGroups.set(
            fid,
            dedupedLeaves.map((l) => ({ ...l, parentId: fid }))
          );
        }
      }
      const parentById = new Map(catalogParents.map((p) => [p.id, p]));
      for (const p of finalParents) {
        const id =
          typeof p.id === 'string' && p.id.trim()
            ? p.id.trim().replace(/[^a-z0-9-]/g, '-')
            : parentIdFromProposal(p.name, validParentIds);
        parentById.set(id, { id, name: p.name, description: p.description });
      }

      const parentIdsWithLeaves = [...leafGroups.keys()];
      const minNetLeaves = effectiveMinNetLeaves(dedupedLeaves.length, maxNetLeaves);
      const maxPerParent = maxLeavesPerParentBudget(
        parentIdsWithLeaves.length,
        maxNetLeaves,
        dedupedLeaves.length
      );

      opts.onProgress?.(
        `Reduce leaves: ${parentIdsWithLeaves.length} parent(s), ≤${maxPerParent}/parent, target ≥${minNetLeaves} leaves…`
      );

      const leafResults = await runWithConcurrency(
        parentIdsWithLeaves,
        DISCOVER_REDUCE_LEAF_CONCURRENCY,
        async (parentId) => {
          if (opts.signal?.aborted) throw new Error('Cancelled');
          const proposals = leafGroups.get(parentId) ?? [];
          const parent =
            parentById.get(parentId) ??
            ({ id: parentId, name: parentId, description: '' } as const);
          const resp = await callDiscoveryReduceLeavesForParent(
            settings,
            parent,
            allLeaves,
            proposals,
            { maxLeavesForParent: maxPerParent, signal: opts.signal }
          );
          return { parentId, resp };
        }
      );

      for (const { resp } of leafResults) {
        reduceLeafCalls++;
        if (!resp.ok) {
          llmErrors++;
          continue;
        }
        mergeAudit.push(...mergeAuditFromReduce(resp.data?.merges));
        finalLeaves.push(...dedupeLeafProposals(resp.data?.newLeaves ?? []));
      }

      if (!finalLeaves.length && dedupedLeaves.length && llmErrors > 0) {
        finalLeaves = dedupedLeaves.slice(0, maxNetLeaves);
      } else {
        finalLeaves = backfillLeavesIfSparse(
          finalLeaves,
          dedupedLeaves,
          minNetLeaves,
          maxNetLeaves
        );
      }
    }
  }

  const merged = mergeDiscoveryTaxonomy(
    categories,
    { newParents: finalParents, newLeaves: finalLeaves },
    { maxNewParents: maxNetParents, maxNewLeaves: maxNetLeaves, now }
  );

  opts.onProgress?.('Mechanical taxonomy merge (keyword safety net)…');
  const mechanical = applyTaxonomyMergeInMemory(merged.categories);
  mergeAudit.push(...mechanical.audit);

  return {
    categories: mechanical.categories,
    addedParents: merged.addedParents,
    addedLeaves: merged.addedLeaves,
    proposedParentsRaw,
    proposedLeavesRaw,
    mapBatches: mapChunks.length,
    reduceCalls,
    reduceLeafCalls,
    reduceMode,
    llmErrors,
    mergeAudit,
    taxonomyMerge: {
      mergedParents: mechanical.mergedParents,
      mergedLeaves: mechanical.mergedLeaves,
    },
  };
}
