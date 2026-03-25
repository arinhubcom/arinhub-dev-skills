/**
 * Stacking Context Inspector
 *
 * Z-index bugs are almost never about the z-index value itself -- they're about
 * stacking contexts. A z-index:9999 element can appear behind a z-index:1 element
 * if they live in different stacking contexts, because z-index only competes
 * within the SAME context. Many CSS properties silently create new stacking
 * contexts (opacity<1, transform, filter, isolation:isolate, will-change),
 * and developers often don't realize a parent created one.
 *
 * This script walks the ancestor chain and identifies every element that creates
 * a stacking context, reporting which CSS property caused it. This reveals the
 * actual z-index hierarchy the browser is using, which is often very different
 * from what the developer expects by reading z-index values alone.
 *
 * @customize Change '.target-element' to match the element with wrong layering.
 * @usage chrome-devtools evaluate_script "<content>"
 * @returns {Array} Ancestor stacking contexts with their z-index and trigger property.
 */
() => {
  let el = document.querySelector('.target-element');
  const contexts = [];
  while (el) {
    const s = getComputedStyle(el);
    const createsContext = (s.zIndex !== 'auto' && s.position !== 'static')
      || s.opacity !== '1'
      || s.transform !== 'none'
      || s.filter !== 'none'
      || s.isolation === 'isolate'
      || (s.willChange && /opacity|transform|filter/.test(s.willChange))
      || s.mixBlendMode !== 'normal';
    if (createsContext) {
      contexts.push({
        tag: el.tagName,
        class: el.className?.substring(0, 80),
        zIndex: s.zIndex, position: s.position,
        opacity: s.opacity !== '1' ? s.opacity : undefined,
        transform: s.transform !== 'none' ? s.transform : undefined,
        isolation: s.isolation !== 'auto' ? s.isolation : undefined
      });
    }
    el = el.parentElement;
  }
  return contexts;
}
