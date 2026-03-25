/**
 * Ancestor CSS Property Check
 *
 * When a position:fixed element appears offset from where it should be,
 * the cause is almost always a "containing block" created by an ancestor.
 * Per the CSS spec, transform, will-change:transform, and filter on ANY
 * ancestor make that ancestor (not the viewport) the containing block for
 * fixed-positioned descendants. This is one of the most common and least
 * intuitive CSS gotchas -- the ancestor might be several levels up and
 * set by a third-party library the developer never inspected.
 *
 * This script walks up the entire ancestor chain and reports every element
 * that creates a containing block, because the bug might be caused by a
 * grandparent, not the direct parent. Checking only the parent would miss it.
 *
 * @customize Change '.target-element' to match the mispositioned element.
 * @usage chrome-devtools evaluate_script "<content>"
 * @returns {Array} Ancestor elements with containing-block-creating properties.
 */
() => {
  let el = document.querySelector('.target-element');
  const issues = [];
  while (el) {
    const s = getComputedStyle(el);
    const hasTransform = s.transform !== 'none';
    const hasWillChange = s.willChange !== 'auto' && s.willChange.includes('transform');
    const hasFilter = s.filter !== 'none';
    if (hasTransform || hasWillChange || hasFilter) {
      issues.push({
        tag: el.tagName,
        class: el.className?.substring(0, 80),
        transform: s.transform,
        willChange: s.willChange,
        filter: s.filter
      });
    }
    el = el.parentElement;
  }
  return issues;
}
