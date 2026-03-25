/**
 * Layout Shift Detection
 *
 * Elements that jump position after a state change or click are often caused by
 * late-loading content, border/padding transitions, or display toggling that
 * pushes siblings around. These shifts happen too fast to observe visually but
 * are captured by the browser's PerformanceObserver API as "layout-shift" entries.
 *
 * This script hooks into that API to record every shift with its CLS value and
 * the specific elements that moved (including before/after rects), because
 * manually watching for layout shifts is unreliable -- they happen in a single
 * frame and the human eye can't always tell which element triggered the cascade.
 *
 * The buffered:false flag ensures we only capture shifts that happen AFTER
 * injection, so the data reflects the interaction being debugged, not page load.
 *
 * @usage chrome-devtools evaluate_script "<content>"
 * @global {Array} window.__shifts - Collected layout shift entries.
 * @returns {string} Confirmation message.
 */
() => {
  window.__shifts = [];
  const obs = new PerformanceObserver(list => {
    for (const e of list.getEntries()) {
      window.__shifts.push({
        value: e.value,
        sources: e.sources?.map(s => ({
          node: s.node?.tagName + '.' + s.node?.className?.substring(0, 60),
          prevRect: JSON.stringify(s.previousRect),
          currRect: JSON.stringify(s.currentRect)
        }))
      });
    }
  });
  obs.observe({type: 'layout-shift', buffered: false});
  return 'PerformanceObserver installed';
}
