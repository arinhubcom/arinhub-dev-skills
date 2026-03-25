/**
 * Lingering Positioned Elements Inspector
 *
 * After a flash-producing interaction (drag-drop end, popover close, animation
 * finish), elements that should have been removed may linger in the DOM with
 * position:fixed or position:absolute at high z-index. These ghost elements
 * can cause visual artifacts on subsequent interactions or block click targets.
 *
 * This script scans for:
 * - All position:fixed elements with non-trivial width (>2px)
 * - All position:absolute elements with z-index > 100 and non-trivial width
 *
 * It reports tag, class, inline style, bounding rect, text content, visibility,
 * and data attributes so you can distinguish legitimate elements (navbar, toast)
 * from leftover ghost elements.
 *
 * @usage chrome-devtools evaluate_script "<content>"
 * @returns {Array} Positioned elements with their properties and visibility.
 */
() => {
  const all = document.querySelectorAll('*');
  const suspects = [];
  for (const el of all) {
    const computed = window.getComputedStyle(el);
    const isFixed = computed.position === 'fixed';
    const isAbsoluteHighZ =
      computed.position === 'absolute' &&
      parseInt(computed.zIndex, 10) > 100;

    if ((isFixed || isAbsoluteHighZ) && el.offsetWidth > 2) {
      const dataAttrs = {};
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-')) {
          dataAttrs[attr.name] = attr.value.substring(0, 50);
        }
      }

      suspects.push({
        tag: el.tagName,
        className: (el.className || '').toString().substring(0, 100),
        style: (el.getAttribute('style') || '').substring(0, 200),
        position: computed.position,
        zIndex: computed.zIndex,
        rect: el.getBoundingClientRect(),
        text: el.textContent?.substring(0, 60),
        visible:
          computed.visibility !== 'hidden' &&
          computed.opacity !== '0' &&
          computed.display !== 'none',
        dataAttrs,
        childCount: el.children.length,
      });
    }
  }
  return suspects;
}
