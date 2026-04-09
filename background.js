const PAGE_STATES_KEY = "pageStates";

async function getAllStates() {
  const stored = await chrome.storage.local.get(PAGE_STATES_KEY);
  return stored[PAGE_STATES_KEY] || {};
}

async function getPageState(pageKey) {
  const states = await getAllStates();
  return states[pageKey] || null;
}

async function setPageState(pageKey, state) {
  const states = await getAllStates();
  states[pageKey] = {
    ...state,
    updatedAt: Date.now()
  };
  await chrome.storage.local.set({ [PAGE_STATES_KEY]: states });
}

async function getMostRecentState() {
  const states = await getAllStates();
  const items = Object.values(states);
  if (!items.length) return null;
  items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return items[0];
}

async function updateBadge(tabId, state) {
  const count = state?.postsScrolled || 0;
  const text = count > 999 ? "999+" : String(count || "");
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#1d9bf0" });
  await chrome.action.setBadgeText({ tabId, text });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? message.tabId;

  if (message.type === "xscroller:set-state") {
    setPageState(message.pageKey, message.state).then(async () => {
      if (tabId) {
        await updateBadge(tabId, message.state);
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "xscroller:get-state") {
    getPageState(message.pageKey).then((state) => sendResponse({ ok: true, state }));
    return true;
  }

  if (message.type === "xscroller:get-active-state") {
    if (message.pageKey) {
      getPageState(message.pageKey).then((state) => sendResponse({ ok: true, state }));
    } else {
      getMostRecentState().then((state) => sendResponse({ ok: true, state }));
    }
    return true;
  }

  sendResponse({ ok: false, error: "Unknown message type" });
  return false;
});
