# Fast Panel Test v2.1

## Open (proven in this repo)

Copied from `public/service-worker.js`:

```javascript
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidepanel.html', enabled: true });
  chrome.sidePanel.open({ tabId: tab.id });
});
```

No `setPanelBehavior` — avoids conflict with `onClicked`.

## Panel (fast paint)

`sidepanel.html` — tiny HTML only. No `sidepanel.js`, no CSS animations, no overlay.

## Load

1. Remove old extension → Load unpacked
2. `https://example.com` → click icon
3. Blue bar **FAST PANEL — loaded** = success

## Still broken?

Copy folder out of Dropbox to Desktop, load from there.
