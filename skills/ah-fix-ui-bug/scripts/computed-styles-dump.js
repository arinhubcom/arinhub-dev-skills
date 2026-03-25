/**
 * Computed Styles Dump
 *
 * Many UI bugs stem from unexpected computed values -- an element inheriting
 * overflow:hidden from a parent, a flex item collapsing because of min-width:auto,
 * or a z-index being ignored because position is static. Inspecting the browser
 * DevTools panel only shows one property at a time, making it easy to miss the
 * interaction between properties. This script dumps all the properties that
 * commonly cause visual bugs in a single snapshot, so you can spot the culprit
 * without switching between panels.
 *
 * The bounding rect is included because computed CSS values (e.g., width:"auto")
 * don't always reveal the actual rendered size -- getBoundingClientRect gives
 * the ground truth the browser is using for layout.
 *
 * @customize Change '.target-element' to match the element being debugged.
 * @usage chrome-devtools evaluate_script "<content>"
 * @returns {Object} Key computed CSS properties and bounding rect of the element.
 */
() => {
  const el = document.querySelector('.target-element');
  if (!el) return 'Element not found';
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    display: s.display, position: s.position,
    top: s.top, left: s.left, right: s.right, bottom: s.bottom,
    width: s.width, height: s.height, maxWidth: s.maxWidth, minWidth: s.minWidth,
    overflow: s.overflow, overflowX: s.overflowX, overflowY: s.overflowY,
    textOverflow: s.textOverflow, whiteSpace: s.whiteSpace,
    zIndex: s.zIndex, opacity: s.opacity, visibility: s.visibility,
    transform: s.transform, willChange: s.willChange,
    flexGrow: s.flexGrow, flexShrink: s.flexShrink, flexBasis: s.flexBasis,
    alignSelf: s.alignSelf, justifySelf: s.justifySelf,
    gridColumn: s.gridColumn, gridRow: s.gridRow,
    boxSizing: s.boxSizing, pointerEvents: s.pointerEvents,
    rect: {x: r.x, y: r.y, w: r.width, h: r.height}
  };
}
