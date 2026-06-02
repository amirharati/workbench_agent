// Opens the side panel instantly when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  });
  