/**
 * Attribute Mutation Observer
 *
 * Many UI bugs are triggered by attribute changes that happen too fast to
 * catch manually -- a class toggling on hover, an inline style being set and
 * immediately overwritten, or a data attribute changing during a drag operation.
 * The MutationObserver API captures these synchronously, including the old value,
 * so you can see the exact sequence of changes that led to the visual bug.
 *
 * The script also captures the element's computed transform and position at
 * each mutation, because attribute changes often cause cascading style
 * recalculations. Seeing the computed state alongside the attribute change
 * reveals whether the attribute itself or a downstream style rule is the culprit.
 *
 * @customize Change '.target-element' to match the element being debugged.
 * @usage chrome-devtools evaluate_script "<content>"
 * @global {Array} window.__mutations - Recorded attribute changes with computed state.
 * @returns {string} Confirmation message.
 */
() => {
  const el = document.querySelector('.target-element');
  if (!el) return 'Element not found';
  window.__mutations = [];
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      window.__mutations.push({
        attr: m.attributeName,
        oldVal: m.oldValue?.substring(0, 100),
        newVal: el.getAttribute(m.attributeName)?.substring(0, 100),
        style: el.style.cssText,
        transform: getComputedStyle(el).transform,
        position: getComputedStyle(el).position
      });
    }
  });
  mo.observe(el, {attributes: true, attributeOldValue: true});
  return 'MutationObserver installed';
}
