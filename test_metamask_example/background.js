// Opens on every click — same pattern as public/service-worker.js in this repo.
// open() is called synchronously in the click handler (keeps user gesture).

const PATH = 'sidepanel.html';

chrome.action.onClicked.addListener((tab) => {
  if (typeof tab.id !== 'number') return;

  chrome.sidePanel.setOptions({ tabId: tab.id, path: PATH, enabled: true });
  chrome.sidePanel.open({ tabId: tab.id });
});
