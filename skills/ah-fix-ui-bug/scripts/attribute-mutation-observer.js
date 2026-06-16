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
 * window.__stopMutations() disconnects the observer, and the log is capped at
 * MAX_ENTRIES so it does not grow without bound during long sessions.
 *
 * @customize Change '.target-element' to match the element being debugged.
 * @usage { printf '('; cat attribute-mutation-observer.js; printf ')()'; } | agent-browser eval --stdin
 * @global {Array} window.__mutations - Recorded attribute changes with computed state (capped).
 * @global {Function} window.__stopMutations - Disconnects the observer.
 * @returns {string} Confirmation message.
 */
() => {
  const MAX_ENTRIES = 500;
  const el = document.querySelector('.target-element');
  if (!el) return 'Element not found';
  window.__mutations = [];
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (window.__mutations.length >= MAX_ENTRIES) {
        mo.disconnect();
        return;
      }
      const cs = getComputedStyle(el);
      window.__mutations.push({
        attr: m.attributeName,
        oldVal: m.oldValue?.substring(0, 100),
        newVal: el.getAttribute(m.attributeName)?.substring(0, 100),
        style: el.style.cssText,
        transform: cs.transform,
        position: cs.position
      });
    }
  });
  mo.observe(el, {attributes: true, attributeOldValue: true});
  window.__stopMutations = () => mo.disconnect();
  return 'MutationObserver installed (call window.__stopMutations() to stop)';
}
