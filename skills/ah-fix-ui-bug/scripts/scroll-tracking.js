/**
 * Scroll Position Tracking
 *
 * Scroll-related bugs (content jumping, scroll position resetting, scroll
 * locking) are hard to debug because the scroll state is transient -- by the
 * time you check DevTools, the scroll position has already settled. This script
 * records every scroll event with its delta and absolute position, creating a
 * timeline that reveals unexpected jumps, double-scrolls, or scroll hijacking.
 *
 * Both window-level and container-level scroll events are tracked because many
 * apps use overflow:auto containers instead of page-level scrolling. The
 * passive:true flag ensures the listeners don't block scrolling performance,
 * which is critical because a non-passive scroll listener would itself cause
 * the kind of jank being investigated.
 *
 * Scroll deltas below 1px are filtered out to avoid noise from sub-pixel
 * rendering and smooth-scroll interpolation.
 *
 * window.__stopScrollLog() removes every listener it added, and the log is capped
 * at MAX_ENTRIES so it cannot grow without bound during long sessions.
 *
 * @customize Change '.scroll-container' to match the scrollable element(s).
 * @usage { printf '('; cat scroll-tracking.js; printf ')()'; } | agent-browser eval --stdin
 * @global {Array} window.__scrollLog - Scroll position entries with timestamps (capped).
 * @global {Function} window.__stopScrollLog - Removes all scroll listeners.
 * @returns {string} Confirmation message.
 */
() => {
  const MAX_ENTRIES = 500;
  window.__scrollLog = [];
  const record = entry => {
    if (window.__scrollLog.length >= MAX_ENTRIES) return;
    window.__scrollLog.push(entry);
  };
  let lastScrollY = window.scrollY;
  let lastScrollX = window.scrollX;
  const handler = () => {
    const dy = window.scrollY - lastScrollY;
    const dx = window.scrollX - lastScrollX;
    if (Math.abs(dy) > 1 || Math.abs(dx) > 1) {
      record({
        time: performance.now(),
        scrollX: window.scrollX, scrollY: window.scrollY,
        deltaX: dx, deltaY: dy
      });
    }
    lastScrollY = window.scrollY;
    lastScrollX = window.scrollX;
  };
  window.addEventListener('scroll', handler, {passive: true});
  const containerListeners = [];
  document.querySelectorAll('.scroll-container').forEach(el => {
    const fn = () => record({
      time: performance.now(),
      element: el.className?.substring(0, 60),
      scrollTop: el.scrollTop, scrollLeft: el.scrollLeft
    });
    el.addEventListener('scroll', fn, {passive: true});
    containerListeners.push({el, fn});
  });
  window.__stopScrollLog = () => {
    window.removeEventListener('scroll', handler);
    containerListeners.forEach(({el, fn}) => el.removeEventListener('scroll', fn));
  };
  return 'Scroll tracker installed (call window.__stopScrollLog() to stop)';
}
