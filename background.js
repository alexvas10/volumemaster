async function createOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'To process tab audio with GainNode'
  });
}

const currentVolumes = {};
const capturedTabs = new Set();

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.type === "SET_VOLUME") {
    const tabId = request.tabId;
    currentVolumes[tabId] = request.volume;
    await createOffscreen();
    
    if (!capturedTabs.has(tabId)) {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
            capturedTabs.add(tabId);
            chrome.runtime.sendMessage({
                type: 'START_CAPTURE',
                streamId: streamId,
                volume: request.volume,
                tabId: tabId
            });
        });
    } else {
        chrome.runtime.sendMessage({
            type: 'UPDATE_VOLUME',
            volume: request.volume,
            tabId: tabId
        });
    }
  }

  if (request.type === "GET_CURRENT_VOLUME") {
    sendResponse({ volume: currentVolumes[request.tabId] || 100 });
  }

  // New message to get the list of IDs for filtered display
  if (request.type === "GET_CAPTURED_TABS") {
    sendResponse({ tabIds: Array.from(capturedTabs) });
  }
  
  return true; 
});

chrome.tabs.onRemoved.addListener((tabId) => {
    capturedTabs.delete(tabId);
    delete currentVolumes[tabId];
    chrome.runtime.sendMessage({ type: 'STOP_CAPTURE', tabId: tabId });
});