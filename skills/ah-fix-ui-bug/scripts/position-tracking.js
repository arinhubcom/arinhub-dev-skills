/**
 * Position Tracking
 *
 * Some positioning bugs are intermittent -- an element flickers to a wrong
 * position for a few frames during a transition, or drifts gradually due to
 * cumulative rounding errors. A single-frame snapshot misses these entirely.
 *
 * This script polls getBoundingClientRect on every animation frame and logs
 * only when the position actually changes, creating a timeline of every movement.
 * The rAF loop is intentional: it runs until page reload so it can catch
 * delayed or animation-driven shifts that happen hundreds of milliseconds
 * after the interaction.
 *
 * A Map is used instead of a plain object because DOM elements can't reliably
 * serve as object keys (toString gives "[object HTMLDivElement]" for all divs).
 *
 * The rAF loop stops automatically once MAX_ENTRIES position changes are logged,
 * and window.__stopPosLog() cancels it on demand, so the loop does not run for
 * the page lifetime once debugging is done.
 *
 * @customize Change '.target-element' to match the element(s) being tracked.
 * @usage { printf '('; cat position-tracking.js; printf ')()'; } | agent-browser eval --stdin
 * @global {Array} window.__posLog - Position change entries with timestamps (capped).
 * @global {Function} window.__stopPosLog - Cancels the rAF loop.
 * @returns {string} Confirmation with element count.
 */
() => {
  const MAX_ENTRIES = 500;
  const els = document.querySelectorAll('.target-element');
  window.__posLog = [];
  const prev = new Map();
  els.forEach(el => {
    const r = el.getBoundingClientRect();
    prev.set(el, {t: Math.round(r.top), l: Math.round(r.left)});
  });
  let rafId = 0;
  function check() {
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      const curr = {t: Math.round(r.top), l: Math.round(r.left)};
      const p = prev.get(el);
      if (curr.t !== p.t || curr.l !== p.l) {
        window.__posLog.push({
          sel: el.className?.substring(0, 60) || el.tagName,
          from: p, to: curr, time: performance.now()
        });
      }
      prev.set(el, curr);
    });
    if (window.__posLog.length >= MAX_ENTRIES) return;
    rafId = requestAnimationFrame(check);
  }
  rafId = requestAnimationFrame(check);
  window.__stopPosLog = () => cancelAnimationFrame(rafId);
  return 'Position tracker installed on ' + els.length +
    ' elements (call window.__stopPosLog() to stop)';
}
