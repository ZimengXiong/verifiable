(() => {
  const ARTICLE_SELECTOR = 'article[data-testid="tweet"]';
  const USER_NAME_SELECTOR = '[data-testid="User-Name"]';
  const BADGE_SELECTOR = [
    `${USER_NAME_SELECTOR} svg[data-testid="icon-verified"]`,
    `${USER_NAME_SELECTOR} svg[aria-label="Verified account"]`
  ].join(", ");

  const countedKeys = new Set();
  let updateTimer = null;
  let scanQueued = false;
  let lastHref = location.href;

  const state = {
    pageKey: location.href,
    pageUrl: location.href,
    postsScrolled: 0,
    noBadgePosts: 0,
    badgePosts: 0,
    badgeBreakdown: {
      blue: 0,
      gold: 0,
      gray: 0,
      unknown: 0
    },
    seenPostKeys: []
  };

  function cloneState() {
    return {
      pageKey: state.pageKey,
      pageUrl: state.pageUrl,
      postsScrolled: state.postsScrolled,
      noBadgePosts: state.noBadgePosts,
      badgePosts: state.badgePosts,
      badgeBreakdown: { ...state.badgeBreakdown },
      seenPostKeys: [...countedKeys]
    };
  }

  function schedulePersist() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      chrome.runtime.sendMessage({
        type: "xscroller:set-state",
        pageKey: state.pageKey,
        state: cloneState()
      });
    }, 80);
  }

  function loadState(savedState) {
    countedKeys.clear();
    for (const key of savedState?.seenPostKeys || []) {
      countedKeys.add(key);
    }

    state.pageKey = savedState?.pageKey || location.href;
    state.pageUrl = savedState?.pageUrl || location.href;
    state.postsScrolled = savedState?.postsScrolled || 0;
    state.noBadgePosts = savedState?.noBadgePosts || 0;
    state.badgePosts = savedState?.badgePosts || 0;
    state.badgeBreakdown.blue = savedState?.badgeBreakdown?.blue || 0;
    state.badgeBreakdown.gold = savedState?.badgeBreakdown?.gold || 0;
    state.badgeBreakdown.gray = savedState?.badgeBreakdown?.gray || 0;
    state.badgeBreakdown.unknown = savedState?.badgeBreakdown?.unknown || 0;
  }

  function newEmptyState(pageKey) {
    return {
      pageKey,
      pageUrl: pageKey,
      postsScrolled: 0,
      noBadgePosts: 0,
      badgePosts: 0,
      badgeBreakdown: {
        blue: 0,
        gold: 0,
        gray: 0,
        unknown: 0
      },
      seenPostKeys: []
    };
  }

  async function restoreOrInitialize(pageKey) {
    const response = await chrome.runtime.sendMessage({
      type: "xscroller:get-state",
      pageKey
    });

    loadState(response?.state || newEmptyState(pageKey));
    schedulePersist();
    queueScan();
  }

  function parseRgb(value) {
    if (!value) return null;
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return null;
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3])
    };
  }

  function classifyRgb(rgb) {
    if (!rgb) return "unknown";
    const { r, g, b } = rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    if (max - min < 24 && max > 90 && max < 235) return "gray";
    if (b >= g && b > r && b >= 140) return "blue";
    if (r >= 150 && g >= 110 && b <= 130 && r > b + 40) return "gold";

    return "unknown";
  }

  function getBadgeType(svg) {
    if (!svg) return null;

    const inspected = new Set();
    const nodes = [svg, ...svg.querySelectorAll("path, g, circle, rect")];
    let cursor = svg.parentElement;

    while (cursor && !cursor.matches(USER_NAME_SELECTOR)) {
      nodes.push(cursor);
      cursor = cursor.parentElement;
    }
    if (cursor) nodes.push(cursor);

    for (const node of nodes) {
      if (!(node instanceof Element) || inspected.has(node)) continue;
      inspected.add(node);

      const style = getComputedStyle(node);
      const candidates = [style.fill, style.stroke, style.color];
      for (const value of candidates) {
        const type = classifyRgb(parseRgb(value));
        if (type !== "unknown") return type;
      }
    }

    return "unknown";
  }

  function getPostKey(article) {
    const statusLink = article.querySelector('a[href*="/status/"]');
    if (statusLink?.href) return `status:${statusLink.href}`;

    const handleLink = article.querySelector(`${USER_NAME_SELECTOR} a[href]`)?.href || "";
    const timeText = article.querySelector("time")?.getAttribute("datetime") || "";
    const text = article.querySelector('[data-testid="tweetText"]')?.innerText || "";
    return `fallback:${handleLink}|${timeText}|${text.trim().slice(0, 140)}`;
  }

  function inspectArticle(article) {
    const badge = article.querySelector(BADGE_SELECTOR);
    if (!badge) {
      return { hasBadge: false, badgeType: null };
    }

    return {
      hasBadge: true,
      badgeType: getBadgeType(badge)
    };
  }

  function countArticle(article) {
    const key = getPostKey(article);
    if (!key || countedKeys.has(key)) return;

    countedKeys.add(key);
    state.postsScrolled += 1;

    const badgeInfo = inspectArticle(article);
    if (badgeInfo.hasBadge) {
      state.badgePosts += 1;
      state.badgeBreakdown[badgeInfo.badgeType || "unknown"] += 1;
    } else {
      state.noBadgePosts += 1;
    }

    schedulePersist();
  }

  function shouldCountArticle(article) {
    const rect = article.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const activationLine = viewportHeight * 0.72;
    return rect.top <= activationLine && rect.bottom >= 0;
  }

  function scanVisibleArticles() {
    scanQueued = false;
    const articles = document.querySelectorAll(ARTICLE_SELECTOR);
    for (const article of articles) {
      if (shouldCountArticle(article)) {
        countArticle(article);
      }
    }
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scanVisibleArticles);
  }

  function handleUrlChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    restoreOrInitialize(location.href);
  }

  const mutationObserver = new MutationObserver(() => {
    handleUrlChange();
    queueScan();
  });

  window.addEventListener("scroll", queueScan, { passive: true });
  window.addEventListener("resize", queueScan, { passive: true });

  setInterval(handleUrlChange, 400);

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  restoreOrInitialize(location.href);
})();
