# V3 fetch service replacement roadmap

> Decision — 2026-08-23: replace the current URL fetch/extraction stack as one bounded subsystem.
> Do not patch the local-PDF regression inside the legacy router first, and do not incrementally thread
> new readers through the old provider chain. Build and prove the replacement separately, switch the
> shared pipeline once, then remove the legacy stack.

## Objective

Create one content-acquisition service for every URL-processing entry point:

- one link from the side panel, Inspector, or Enrichment Hub;
- a selected group of links;
- Import Studio batches;
- resumed or recovered durable jobs;
- explicit Re-fetch and Full digest actions.

Those surfaces already submit work to the shared offscreen pipeline coordinator. They must not choose a
fetcher, run extraction, write fetched content, or own retries. For each item, the coordinator calls the same
replacement service with the same contract. A bulk job is only repeated invocation of the one-item contract;
it is not a separate fetch implementation.

The replacement must acquire the best truthful textual representation available from the user's current
Chrome context, preserve provenance, and fail honestly when a modality has no text. It must support normal
web pages, authenticated pages, site-specific pages, remote PDFs, and local files without adding a companion
server or another external API.

## Hard boundaries

1. **New subsystem, not a legacy refactor.** Implement the replacement under a new content-acquisition
   namespace and protocol. Do not add more branches to the legacy `fetchService` routing, `hybrid` provider,
   or monolithic injected page extractor.
2. **One production stack at a time.** During development the old stack remains the production implementation.
   Test tooling may compare old and new results, but the new stack must never fall back into the old stack for
   an individual item. Cutover is one coordinator-level selection; rollback selects the old stack as a whole.
3. **Preserve providers, replace their orchestration.** Existing useful capabilities—including PDF.js,
   authenticated Chrome extraction, Jina, FxTwitter/X thread retrieval, X syndication, direct/local HTTP,
   cancellation primitives, URL normalization, and storage clients—remain available through clean v2
   candidate adapters. We are deleting the old router and mixed control flow, not deleting proven provider
   capabilities. The new service owns applicability, isolation, parallel execution, quality evaluation,
   merging, errors, privacy policy, and provenance.
4. **Extensible provider registry.** The architecture must allow additional local readers, site-specific
   readers, and external providers without changing the coordinator or creating a second single/bulk path.
   The initial rebuild adds no new API because that is the current product decision. A new provider may be
   added later—or during the evaluation phase if explicitly approved—by implementing the candidate contract
   and declaring applicability, privacy, authentication, cost, timeout, and rate-limit policy. Do not add a
   localhost Playwright companion or silently introduce credentials/configuration.
5. **No automatic media playback or transcription.** Video acquisition is text-first: metadata,
   description, chapters, and a transcript only when the loaded page exposes one. Do not play, record,
   download, or locally transcribe audio in the V3 path.
6. **Storage ownership does not move.** The service computes a result but opens no application database.
   The coordinator writes fetched bodies through the content worker and status/metadata through the core DB
   worker.
7. **Browser capability stays narrow.** Only the service worker may query, create, script, or close Chrome
   tabs. It owns no job state and performs no application-data writes.

## Target architecture

```text
Import / Hub / side panel / Inspector / maintenance
                         |
                         | submit durable job with item IDs
                         v
             offscreen pipeline coordinator
                         |
                         | acquire(item, browser binding, cancellation)
                         v
              content-acquisition service v2
                         |
            +------------+-------------+
            |                          |
            v                          v
   service-worker browser       non-tab local candidates
   capability                   (document bytes / existing public fallback)
            |                          |
            v                          v
   authenticated/inactive tab     isolated candidate results
            |
            v
   isolated local candidates
            |
            +------------+-------------+
                         v
          deterministic evaluate / select / merge
                         |
                         v
       AcquisitionResult: content + provenance + diagnostics
                         |
              +----------+----------+
              v                     v
       content worker          core DB worker
       raw body by key         status/reference only
```

Candidate parallelism is bounded inside one item. It does not change the coordinator's current serialized
item lane. All candidates share the item's abort signal and deadline; cancellation must stop page loading,
injected extraction, byte fetching, and any public fallback.

## Implementation checkpoint — 2026-08-23

An experimental v2 stack is now available for ordered real-extension testing while Legacy remains the
default:

- Settings → AI & processing → Fetch service selects Legacy or Fetch service v2 for **new** jobs.
- The client pins that value into the durable job payload. Navigation, pause, sleep, and Resume do not
  re-read Settings or mix engines inside a batch.
- Both one-link and bulk jobs enter v2 only at the shared durable coordinator's `enrich` stage. The remaining
  AI, embedding, classification, content-worker, and core-DB-worker ownership is unchanged.
- The new service-worker protocol reuses an exact page tab or opens one inactive tab in the job's Chrome
  window, captures accessible frames/rendered evidence, and closes only tabs it created.
- Generic evidence is evaluated through independent visible-text, Defuddle, and Readability candidates.
  Direct HTTP, Jina, X syndication/FxTwitter, authenticated document bytes, and PDF.js are candidate
  capabilities; local files never enter an HTTP/Jina path.
- Local file access is checked explicitly and reports Chrome's “Allow access to file URLs” requirement.
- V2 PDF transport stages bytes in the service worker and transfers them to the coordinator in bounded 2 MB
  chunks. The former 25 MB browser-message ceiling and 50 MB decoder ceiling remain unchanged for Legacy but
  do not apply to V2; PDF page/text output remains bounded and cancellation still interrupts decoding.
- A demonstrated OpenReview challenge failure is handled by an isolated v2 document-target provider that
  keeps the original bookmark URL while trying OpenReview's authenticated API2 document representations.
- Rendered evidence now keeps Open Graph, structured-data, visible-heading, and document titles separately.
  Generic title-quality selection can recover an email subject or video title from a generic Gmail/YouTube
  tab shell without adding Gmail or YouTube selectors to the page reader. A successful fetch updates an
  empty, URL-like, or browser/site-shell bookmark title; a later AI-only pass may do the same with its clearer
  title. Meaningful saved/user titles are not replaced merely because the fetched or AI wording differs, and
  the unchanged-content fast path still performs this safe title repair.
- Candidate exceptions are isolated, requests share a 90-second acquisition deadline and durable cancel
  signal, video playback is never started, and only page-exposed transcript text is considered.

V2 is now the default for newly submitted jobs after initial live single-link testing. The Settings selector
retains Legacy as an explicit fallback, and every durable job pins its selected engine so Resume never changes
implementation mid-run. Dedicated corpus coverage for Reddit/X/video variants, candidate diagnostic
presentation, privacy policy refinement for public fallbacks, and the remaining Phase 6 live gates are still
required before any Legacy code can be removed.

## One-item contract

The replacement exposes one operation conceptually equivalent to:

```text
acquireContent({
  itemId,
  url,
  browserWindowId,
  preferredTabId?,
  signal,
  policy
}) -> AcquisitionResult
```

The result must contain:

- requested and final URL without changing bookmark identity implicitly;
- normalized title and optional preview image;
- selected Markdown/text;
- source kind and modality (`html`, `pdf`, `local-file`, `video-metadata`, and so on);
- every candidate attempted, its duration, byte/character counts, quality score, and rejection reason;
- whether authenticated browser state was used;
- whether content was local/private and therefore forbidden from external fallback;
- transcript state: `available`, `not_available`, or `not_applicable`;
- stable error code plus an actionable user-facing explanation when acquisition fails.

Candidate exceptions are data, not control flow. One broken site adapter must never prevent the generic
candidate from completing. The selection/merge layer must be deterministic and testable without Chrome.

## Candidate sets

### 1. Generic rendered HTML

Run independent local candidates against the same fully rendered document:

- Defuddle for high-quality primary content and metadata;
- Mozilla Readability on a clone;
- high-recall rendered visible text plus page metadata;
- accessible same-permission frame results;
- open shadow-root text where accessible.

These candidates run for every normal HTML page, including sites that also have a specialized candidate.
No title, Open Graph description, or adapter result may suppress the generic visible-text candidate.

### 2. Optional site candidates

Specialized candidates are isolated enhancements selected by URL/source kind:

- **X:** authenticated rendered post/thread candidate; existing public X representation may be evaluated
  for public URLs only; linked public pages remain separate candidates with explicit provenance.
- **Reddit:** rendered post, comments, or listing candidate in addition to generic extraction.
- **YouTube/video pages:** title, channel/creator, description, date, chapters, and transcript text when the
  loaded page exposes it. Loading an inactive page is allowed; playing or capturing media is not.
- Additional site candidates require a demonstrated corpus failure and their own contract tests. They are
  never allowed to become the only reader for a site.

### 3. Documents and local files

- **Remote text PDF:** obtain bytes through the authenticated first-party browser context and decode locally
  with PDF.js. A public fallback may run only after the authenticated/local path fails and only for a public
  URL.
- **Local PDF (`file://`):** check Chrome file-scheme access, read bytes locally, and decode with the same
  PDF.js leaf utility. Never send the path, name, bytes, or text to Jina or any other network service.
- **Local HTML/text:** read from the explicitly opened/permitted local tab and run the applicable generic
  candidates.
- **Scanned/image-only PDF:** report that no selectable text was found. OCR is outside the V3 replacement
  unless separately approved later.

Chrome's `Allow access to file URLs` toggle is an explicit precondition. The service must detect it using
`chrome.extension.isAllowedFileSchemeAccess()`. A disabled permission, missing/moved file, unreadable file,
image-only document, and decoder failure are distinct outcomes; none is reported as login/auth failure.

### 4. Provider adapters and public fallbacks

All useful existing providers are retained behind the new candidate contract:

- Jina for eligible public HTTP(S) pages;
- FxTwitter/X thread retrieval and X syndication for eligible public X URLs;
- authenticated Chrome-tab extraction for browser/session-dependent content;
- direct/local HTTP fetching where policy permits;
- PDF.js document decoding for remote and local bytes.

Jina is never invoked for `file://`, private/authenticated content, or merely because one local candidate
threw. Existing public X services are similarly limited to public X URLs. The new selection layer records
every provider attempt and when an external result won.

The registry is intentionally open. New candidates may later cover another site, document type, or public
reader. Adding one must not require modifying the shared pipeline and must not make it the only reader for a
site when a generic candidate can still run.

Provider removal is a separate evidence-based decision. This rebuild does not remove Jina, X providers, or
another useful provider merely because their old orchestration is removed.

## Delivery phases

### Phase 0 — Freeze the contract and corpus

- Define `AcquisitionRequest`, `CandidateResult`, `AcquisitionResult`, error codes, provenance, and privacy
  policy before implementing readers.
- Assemble a versioned acceptance corpus covering ordinary articles, SPAs/listings, authenticated pages,
  public/private X, Reddit, YouTube with and without a transcript, remote PDFs, local PDFs, local HTML/text,
  a scanned PDF, a redirect, a login wall, and an inaccessible/dead URL.
- Capture current results only as comparison evidence. Do not encode current incorrect behavior as the new
  specification.
- Inventory every current provider and assign it a v2 adapter/applicability/privacy policy so provider parity
  is explicit rather than assumed.

Exit: contract and expected truth for every corpus item are reviewed and agreed.

### Phase 1 — Build the independent service shell

- Add the new namespace, candidate registry, applicability rules, bounded parallel runner, abort/deadline
  handling, deterministic evaluator, diagnostics, and test fixtures.
- Add a new narrow service-worker acquisition protocol without changing the legacy browser-fetch protocol.
- Prove that candidate failure is isolated and that cancellation terminates every running candidate.
- Prove that a provider can be registered or removed without changing the coordinator, single/bulk callers,
  evaluator, or storage owners.
- Keep the production coordinator pointed entirely at the legacy stack.

Exit: synthetic candidates prove routing, privacy, timeout, selection, merge, and cancellation contracts.

### Phase 2 — Implement document and local-file candidates

- Add local-file permission detection and actionable errors.
- Implement local PDF bytes to the existing PDF.js decoder.
- Implement authenticated remote PDF bytes to that same decoder.
- Add local HTML/text handling.
- Ensure local paths/content can never reach an external candidate.

Exit: local text PDF, remote public PDF, authenticated remote PDF, local HTML/text, missing file, disabled
file permission, and image-only PDF all produce the agreed result without touching the legacy router.

### Phase 3 — Implement generic rendered-page candidates

- Add Defuddle, Readability, high-recall rendered text/metadata, frames, and accessible shadow content as
  independent candidates.
- Normalize their outputs without discarding meaningful lists, code, math, structured metadata, or long
  page bodies.
- Establish deterministic quality signals for substance, shell/navigation dominance, duplication, login
  walls, redirect mismatch, and suspiciously short content.

Exit: the generic corpus meets fidelity and latency targets, and an exception in any candidate leaves the
others unaffected.

### Phase 4 — Implement isolated site candidates

- Add X, Reddit, and YouTube/video candidates behind the same interface.
- For YouTube, extract a page-exposed transcript when present; otherwise return honest metadata with
  `transcript=not_available`.
- Verify specialized output is merged with or loses to a better generic candidate as appropriate.
- Keep site rules inside their own candidate modules; no site selector enters the generic reader.
- Port the existing X/FxTwitter/syndication capabilities into adapters; do not discard them during cutover.

Exit: public/private X, Reddit post/listing, YouTube with transcript, and YouTube without transcript pass
without media playback and without a new API.

### Phase 5 — Pipeline integration without mixed execution

- Add one coordinator-level implementation switch used by every job source.
- Both single and bulk processing call the identical `acquireContent` operation.
- Keep all production jobs on legacy during development. Use explicit test/dev runs to exercise v2.
- Do not add `v2 failed -> legacy fetch` behavior. A v2 failure must remain visible during acceptance.
- Commit selected content through the existing content worker, then continue the unchanged AI, embedding,
  classification, and finalize stages.

Exit: one-link and bulk jobs differ only in durable scheduling/priority, never in acquisition behavior.

### Phase 6 — Ordered real-extension acceptance

Run in order and stop at the first failing gate:

1. One ordinary public article.
2. One authenticated ordinary page already open in Chrome.
3. One local text PDF, then one remote public PDF and one authenticated remote PDF.
4. One public X post and one private X post.
5. One Reddit post/listing.
6. One YouTube video with a transcript and one without.
7. Five mixed items; verify exact per-item provenance and counts.
8. Cancel during tab load, candidate extraction, and PDF decoding; immediately run a new item.
9. Navigate/refresh, close the observing dashboard according to the coordinator policy, and Resume.
10. Sleep/wake during a mixed batch; completed acquisitions are not repeated.
11. Run the large batch; verify bounded tab placement, responsive DB/UI reads, no retry storm, and no
    content-backup work on the completion critical path.

Every result is inspected in the content database and UI. Automated tests and builds are necessary but do
not replace this sequence.

### Phase 7 — Atomic cutover and legacy deletion

- Make v2 the only coordinator acquisition implementation after Phase 6 passes.
- Retain one short-lived whole-stack rollback checkpoint in Git, not a per-item runtime fallback.
- Remove the legacy provider router, monolithic tab extractor, old browser-fetch protocol, duplicate
  quality gates, duplicate provider wrappers, and tests that assert obsolete routing. Retain the underlying
  Jina, X, authenticated-tab, direct-fetch, and PDF capabilities through their v2 adapters.
- Rename v2 modules to ordinary production names only after deletion, so the final codebase has one fetch
  service rather than permanent `legacy`/`v2` layers.
- Update Help, pipeline architecture, V3 release gates, and troubleshooting to describe only the final path.

Exit: repository search finds one acquisition entry point, one browser capability protocol, and no UI-owned,
single-link-only, bulk-only, or legacy fallback pipeline.

## Cutover acceptance criteria

- Single and bulk use the same acquisition service and produce equivalent results for the same item/policy.
- A site-adapter exception cannot prevent generic extraction.
- Local PDFs produce real PDF.js text and never make a network extraction request.
- Authenticated remote pages and PDFs use the user's Chrome session without exporting cookies.
- YouTube/video never plays automatically; transcript presence is represented truthfully.
- Candidate execution is bounded, cancellable, and cannot leave a tab or queued request behind.
- Results include enough provenance to explain exactly what ran and why the winner was selected.
- Sleep/recovery resumes from durable completed work rather than rerunning finished items.
- Content writes go only through the content worker; job/library writes go only through the core DB worker.
- No unapproved external service/API key, companion process, database, or automatic run-artifact directory
  exists. The registry remains capable of accepting an explicitly approved provider later.

## Explicitly deferred

- OCR for scanned PDFs and images.
- Audio/video downloading or local transcription.
- Agent-controlled browsing or arbitrary page interaction.
- Selecting and enabling new hosted extraction providers during the initial parity cutover. The provider
  contract supports them later without another architecture rewrite.
- Higher pipeline item concurrency.
- Automatic taxonomy pruning or other downstream enrichment redesign.

These may be evaluated later as separate features only after the replacement fetch service and the V3 data
integrity/recovery gates pass.
