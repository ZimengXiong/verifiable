async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function getState(pageKey) {
  const response = await chrome.runtime.sendMessage({
    type: "xscroller:get-active-state",
    pageKey
  });
  return response?.state || null;
}

function setText(id, value) {
  document.getElementById(id).textContent = String(value);
}

function renderState(state, tab) {
  if (!state) {
    document.getElementById("status").textContent =
      tab?.url?.startsWith("http") || tab?.url?.startsWith("file:")
        ? "No post data yet for this page."
        : "Open X and start scrolling.";
    return;
  }

  setText("postsScrolled", state.postsScrolled || 0);
  setText("badgePosts", state.badgePosts || 0);
  setText("noBadgeCount", state.noBadgePosts || 0);
  setText("blueCount", state.badgeBreakdown?.blue || 0);
  setText("goldCount", state.badgeBreakdown?.gold || 0);
  setText("grayCount", state.badgeBreakdown?.gray || 0);
  setText("unknownCount", state.badgeBreakdown?.unknown || 0);

  document.getElementById("status").textContent =
    "Counts persist per page URL, including reloads, until that stored page state is replaced.";
}

async function main() {
  const tab = await getActiveTab();
  const pageKey = tab?.url?.startsWith("http") || tab?.url?.startsWith("file:")
    ? tab.url
    : null;
  const state = await getState(pageKey);
  renderState(state, tab);
}

main();
