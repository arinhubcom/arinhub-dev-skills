/**
 * Lingering Fixed Elements Inspector
 *
 * After a flash-producing interaction (drag-drop end, popover close, animation
 * finish), elements that should have been removed may linger in the DOM with
 * position:fixed. These ghost elements can cause visual artifacts on subsequent
 * interactions or interfere with click targets.
 *
 * This script scans every element on the page for position:fixed with non-trivial
 * width (>2px to skip hairline borders and hidden elements). It reports tag,
 * class, inline style, bounding rect, text content, and visibility state so
 * you can determine whether the element is a legitimate fixed element (navbar,
 * toast) or a leftover from a failed cleanup.
 *
 * @usage chrome-devtools evaluate_script "<content>"
 * @returns {Array} Fixed-position elements with their properties and visibility.
 */
() => {
  const all = document.querySelectorAll('*');
  const suspects = [];
  for (const el of all) {
    const computed = window.getComputedStyle(el);
    if (computed.position === 'fixed' && el.offsetWidth > 2) {
      suspects.push({
        tag: el.tagName,
        className: (el.className || '').substring(0, 100),
        style: (el.getAttribute('style') || '').substring(0, 200),
        rect: el.getBoundingClientRect(),
        text: el.textContent?.substring(0, 60),
        visible: computed.visibility !== 'hidden' && computed.opacity !== '0',
      });
    }
  }
  return suspects;
}
