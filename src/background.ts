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

// Create offscreen document for audio playback
async function createOffscreenDocument() {
  // Check if offscreen document already exists
  const clients = await chrome.offscreen.hasDocument();
  console.log('[Background] Offscreen document exists:', clients);
  if (clients) {
    return;
  }

  console.log('[Background] Creating offscreen document...');
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_SCRAPING' as chrome.offscreen.Reason], // Audio playback reason
      justification: 'Audio playback needs to continue when side panel is closed'
    });
    console.log('[Background] Offscreen document created successfully');
  } catch (error) {
    console.error('[Background] Failed to create offscreen document:', error);
    throw error;
  }
}

// Create offscreen document when extension starts
chrome.runtime.onStartup.addListener(createOffscreenDocument);
chrome.runtime.onInstalled.addListener(createOffscreenDocument);

// Handle request to create offscreen document
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CREATE_OFFSCREEN') {
    console.log('[Background] CREATE_OFFSCREEN message received');
    createOffscreenDocument().then(() => {
      console.log('[Background] CREATE_OFFSCREEN success');
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('[Background] CREATE_OFFSCREEN error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }
  
  // Don't intercept other messages - let them pass through to offscreen document
  return false;
});

