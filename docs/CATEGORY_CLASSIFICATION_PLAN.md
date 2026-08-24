# Dual-signal category classification

Status: V3 exact-classifier and durable abstention implementation completed on 2026-08-24; live acceptance remains. This document is
the durable source of truth for the classification work; live bugs and acceptance evidence remain tracked in
`V3_RELEASE_ISSUES.md`.

## Goal

Classify every eligible bookmark with two independent signals and merge their additive category suggestions
deterministically:

1. the existing purpose-aware, two-pass LLM classifier; and
2. a local embedding classifier that compares the bookmark vector with category definitions, category-member
   aggregates, and nearby accepted examples.

The embedding path does not train a model, call another service, or own another pipeline. It runs inside the
existing DB-worker boundary from the already-persisted bookmark/category vectors. Single-link, Import, bulk,
Enrichment Hub, and maintenance Classify jobs still enter the same durable coordinator stage.

The result is multi-label. A rental listing may retain both a narrow `Airbnb Rentals` suggestion and a broader
`Housing & real estate` suggestion. A later stochastic result never deletes an earlier active category merely by
omission.

## Current facts

- Classify already supplies the complete current taxonomy—including manual categories—to the LLM matcher.
- Search/category management already persist one profile per category with its taxonomy-text vector,
  member centroid, and blended prototype.
- The DB worker already owns normalized `Float32Array` vectors, exact cosine scoring, a dense process-local
  top-K similarity index, and durable SQLite rows. No new JavaScript ML, vector-database, or ANN dependency is
  required for V3.
- With roughly 145 categories and 1,536 dimensions, an exact category scan is under 1 MiB of profile vectors and
  about 223,000 multiply-adds per item. This must remain exact and deterministic for V3.
- Manual category creation can currently produce near-duplicate leaves or a new root parent when an existing
  parent was intended. Classification must not special-case domains such as Airbnb; creation and matching must
  preserve valid hierarchy and expose duplicate evidence.

## V3 design

### Signal A — purpose-aware LLM

Keep the existing independent two-pass behavior:

1. taxonomy-free analysis identifies the saved object, likely retrieval purpose, content kind, domain, and
   secondary themes;
2. taxonomy matching sees the full hierarchy, ranks parents, and selects up to three existing leaves.

The LLM path must not be restricted to an embedding shortlist. Embedding failure or a cold category profile must
not make a valid category invisible to semantic reasoning.

### Explicit abstention — `NO_MATCH`

Taxonomy matching is not required to assign a category. The in-flight matcher returns the reserved
`matchStatus: "NO_MATCH"` outcome when the taxonomy-free subject has no defensible parent. `NO_MATCH` is never an
`ai_categories` row, category link, embedding target, search result, or countable taxonomy member.

The coordinator converts that transient token into durable per-bookmark evidence in
`ai_item_signals.llm_review`:

- `decisionType: "none"` and an empty category ID list;
- the taxonomy-free semantic label, subject, retrieval purpose, and evidence;
- one editable `novelTopicSuggestion`; and
- `pending_discover` / novelty state with no category link.

This state is a successful classification abstention, not an AI failure. It does not consume the ordinary
general/unassigned retry budget. A General leaf is valid only when source-derived bookmark text supports its
parent; classifier explanations, ensemble diagnostics, and proposed-category prose never participate in broad
fallback keyword checks. If an unsupported General result is rejected, the free-form semantic analysis becomes
the durable novel-topic suggestion instead of being redirected into another unrelated parent.

The DB worker projects unresolved suggestions into compact groups for the category manager. The projection shows
supporting-bookmark counts and samples but does not create taxonomy. A user can review a proposal through the
normal existing-category/parent/child search, create or merge taxonomy deliberately, and then mark that proposal
group `pending_reclassify`. This reuses existing enrichment and embeddings; it does not refetch, rerun extraction,
or create another pipeline owner.

Discover includes the stored proposed topic beside each pending bookmark's summary, so clustered proposals can
justify a new parent/leaf. Proposal evidence remains per item until a real category is attached or a later
classification replaces it. Items with an active category are excluded from the unresolved-proposal projection.

### Signal B — exact local embedding classifier

For every eligible item with a compatible embedding, the DB worker ranks assignable topical leaves using three
separately retained measurements:

- **Definition score:** item vector against the category metadata vector built from parent name/description,
  leaf name/description, and canonical tags. This provides zero-member cold start.
- **Aggregate score:** item vector against the accepted/reliable-member centroid and the existing blended
  category prototype. Member influence ramps with support rather than allowing one example to erase the
  taxonomy definition.
- **Example score:** exact top-K similarity against a bounded set of accepted manual examples for the strongest
  category-profile candidates. Use a small top-neighbor aggregate rather than one maximum so a single bad
  attachment cannot dominate.

Profile ranking is exact across all categories. Example ranking uses the current worker similarity-index interface
to build a bounded disposable shard containing only the current item and recent manually accepted examples for the
strongest profile candidates. It therefore never warms the full-library index on the pipeline critical path and
never hydrates vectors into a dashboard tab. The first implementation records raw component scores and support
counts so thresholds can be evaluated rather than hidden inside one opaque number.

### Deterministic ensemble

The LLM and embedding outputs remain visible as independent evidence. A deterministic resolver, not another LLM
call, produces the final additive suggestion set:

- agreement promotes confidence;
- different but compatible leaves can both remain active suggestions;
- a strong narrow metric match may coexist with a broader LLM category;
- a weak metric result adds nothing;
- a missing/failing metric path does not fail LLM classification, and an LLM provider failure does not erase a
  valid metric result;
- existing accepted categories remain locked, existing active suggestions are not deleted by omission, and at
  most the product's bounded number of new suggestions is committed per run.

Initial conservative thresholds and component weights are configuration constants covered by fixtures, including
the observed Airbnb broad/narrow score boundary. They remain provisional until the broader acceptance corpus
demonstrates useful separation; final tuning must not optimize only for Airbnb.

For V3, link rows continue to use the existing `ai`/`suggested` representation. The existing JSON classification
snapshot is extended to retain the LLM candidates, metric candidates and component scores, ensemble decision, and
short reason. This gives Inspector/dev diagnostics enough provenance without adding another durable database or a
second execution owner.

### Removal and rejection semantics

Remove/Reject is an item-category decision, not a global taxonomy judgment:

- `(item A, category X) = rejected` prevents automatic reattachment of X to A until the user explicitly restores
  it;
- category X remains available to the LLM and embedding classifier for every other item;
- a rejected pair is excluded from positive centroid/example evidence and filtered from both classifier outputs
  before commit;
- rejection must not delete, deprecate, demote, or negatively rewrite the global category profile;
- deleting/deprecating a category globally remains a separate explicit Taxonomy action.

The DB worker remains the final authority enforcing these rules atomically, regardless of which classifier
proposed the link.

## Implementation checkpoints

1. **Pure metric scoring**
   - Define typed metric evidence and deterministic multi-label resolution.
   - Reuse category profiles and exact cosine math; add no dependency and no new database.
   - Unit-test cold categories, one/few accepted examples, broad+narrow compatible results, weak matches, model
     mismatch, and quality-category exclusion.

2. **Worker-owned evidence query**
   - Add one DB-worker operation that receives an item ID, reads its vector and current category profiles, obtains
     bounded accepted-example neighbors, and returns scores only.
   - Keep profiles/index lazy and derived; SQLite remains source of truth.
   - Verify category rename/removal, item embedding updates, and accepted/rejected link changes invalidate or
     refresh the relevant evidence.

3. **Shared Classify integration**
   - Run the existing LLM path and local metric path as independent work inside the same durable classify stage.
   - Resolve once, commit signal plus all new links through the existing worker-owned atomic classification commit,
     and checkpoint once.
   - Preserve cancellation, retry, sleep/reload recovery, one-link priority, and bulk stage barriers.

4. **Review and diagnostics**
   - Show final additive categories through the existing Category review UI.
   - Keep detailed component evidence in Inspector/dev diagnostics; ordinary users need a concise reason, not raw
     vector numbers.
   - Never label a mixed but successful classification as a pipeline failure.
   - Show unresolved `NO_MATCH` proposals separately from active taxonomy, with Review and Reclassify actions.

5. **Acceptance gates**
   - Fresh taxonomy: classify ordinary seed-covered links without manual examples.
   - Create one correctly parented Airbnb category, accept one Airbnb example, then classify several different
     Airbnb listings plus non-Airbnb housing/travel controls.
   - Confirm the metric path can suggest Airbnb and Housing together without forcing either through a site rule.
   - Reject Airbnb for exactly one listing, rerun it, and verify no resurrection; classify another matching listing
     and verify Airbnb remains available.
   - Repeat with five links, bulk import, cancellation, navigation/reload, closed dashboards, sleep/wake, and Resume;
     verify no duplicate paid LLM call and no lost committed metric/LLM evidence.
   - Record latency and memory at realistic 20k-library scale before V3 signoff.
   - Run an uncovered habit-tracker case: confirm `NO_MATCH`, no fake/General category link, durable proposal UI,
     Discover eligibility, and classify-only requeue after a fitting category is created.

## Explicit post-V3 upgrade

V3 deliberately keeps exact category scans and the current bounded dense similarity index. After V3 dogfood,
benchmark 20k and 100k libraries behind the existing `SimilarityIndex` interface. Only measured need authorizes an
ANN/WASM dependency.

The post-V3 classifier upgrade must evaluate:

- a maintained browser-WASM ANN backend with exact-recall, incremental-update, reload, worker-lifecycle, bundle,
  and Chrome MV3 tests;
- multiple prototypes/medoids for categories whose member embeddings are not a single coherent cluster;
- calibrated per-category thresholds and learned ensemble weights from reviewed user decisions;
- canonical category aliases/merge so near-duplicates do not split evidence;
- richer positive/negative feedback policy, decay, and explicit pruning while permanently protecting accepted
  assignments;
- optional quantization/batched matrix scoring if memory or large-bulk latency requires it.

USearch, EdgeVec, `hnswlib-wasm`, or a future maintained alternative are candidates, not architectural
commitments. The local SQLite database remains the durable source of truth; any ANN index stays disposable and
rebuildable.
