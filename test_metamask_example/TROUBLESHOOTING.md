# Use the pattern that works every time

## Working pattern (v2.0)

Copied from Google **cookbook.sidepanel-global** + MetaMask `initSidePanelBehavior`:

- `setPanelBehavior({ openPanelOnActionClick: true })`
- `side_panel.default_path` in manifest
- **Never** add `chrome.action.onClicked` — Chrome blocks reliable opens when both exist

## What we stopped doing (caused random slow / nothing / gesture errors)

| Broken approach | Why |
|-----------------|-----|
| `onClicked` + `setPanelBehavior` | Conflict |
| `open()` after `await` / `.then()` | User gesture error |
| `onClicked` + `open()` only | Cold service worker, inconsistent |
| Login `opacity: 0` until CSS anim | Blank panel |

## Reload

Remove extension → Load unpacked → click on `https://` tab.
