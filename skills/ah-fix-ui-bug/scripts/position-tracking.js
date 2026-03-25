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
 * @customize Change '.target-element' to match the element(s) being tracked.
 * @usage chrome-devtools evaluate_script "<content>"
 * @global {Array} window.__posLog - Position change entries with timestamps.
 * @returns {string} Confirmation with element count.
 */
() => {
  const els = document.querySelectorAll('.target-element');
  window.__posLog = [];
  const prev = new Map();
  els.forEach(el => {
    const r = el.getBoundingClientRect();
    prev.set(el, {t: Math.round(r.top), l: Math.round(r.left)});
  });
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
    requestAnimationFrame(check);
  }
  requestAnimationFrame(check);
  return 'Position tracker installed on ' + els.length + ' elements';
}
