# TASK-V2C-D10.5 — Extension tab-session fetch (Mode B)

**Status:** **done** (2026-05-28)  
**Parent:** [`TASK-V2C-D10-fetch-improvement.md`](TASK-V2C-D10-fetch-improvement.md) · **D-10.5**  
**Depends on:** D10.4 slice 1 ✅; D10.3 eval ✅ (Playwright weak — real Chrome is product path)  
**Blocks:** D-25 review UI (later)

---

## Goal

Port **Mode B** to product: fetch via **user's Chrome profile** (tab + DOM extract), triggered when headless fails or user requests.

---

## Shipped

| Item | Notes |
|------|--------|
| B1 + any-tab match | `findTabForUrl` active → any |
| B2 ephemeral tab | `openEphemeralTabAndExtract` — http(s) + **file://** |
| Tab before headless | `resolveItemFetch` order |
| Tab retry after headless fail | `headlessWarrantsEphemeralTab` |
| **Inspector “Fetch in browser”** | `tabSessionOnly` — skips headless |
| Side panel `preferTabSession` + `tabId` | On save / digest |
| `tab-page-extract.js` | X, Gmail, listing, generic, **local file** |
| Manifest | `scripting`, `file:///*/*` |

### Files

| File | Role |
|------|------|
| `tabSessionExtract.ts` | Tab find, inject, ephemeral, `shouldOfferTabSessionFetch` |
| `tab-page-extract.js` | DOM extractors |
| `fetchService.ts` | `tryOpenTabFetch`, `tabSessionOnly`, ordering |
| `singleLinkDigest.ts` | Tab resolve on digest |
| `InspectorTab.tsx` | Fetch in browser button |
| `PipelineProgressProvider.tsx` | `tabSessionOnly` option |

---

## Acceptance

- [x] Public URL still enriches headless (regression)
- [x] Login-wall does not get `aiStatus: ok` from headless alone
- [x] Tab fetch when matching tab open or ephemeral opens
- [x] Inspector explicit browser fetch
- [x] `file://` local PDF path (user enables “Allow access to file URLs”)
- [x] `npm run build` passes

---

## Out of scope (deferred)

- Dedicated `tabSessionProvider` module (refactor only)
- Full batch digest auto-tab per row
- D-25 two-quality review UI

*Last updated: 2026-05-28 — closed.*
