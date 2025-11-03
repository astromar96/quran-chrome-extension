// Background service worker to handle side panel opening
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  } else if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Set side panel when extension is installed or enabled
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({
    path: 'popup.html',
    enabled: true
  });
});

