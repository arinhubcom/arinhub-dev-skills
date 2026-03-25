/**
 * Viewport / Responsive Check
 *
 * Responsive layout bugs often stem from a mismatch between what the developer
 * expects a media query or container query to do and what actually happens at
 * a given viewport width. The computed styles of a container and its children
 * change across breakpoints, but it's tedious to manually check each child in
 * DevTools after every resize.
 *
 * This script snapshots the container's layout type (including containerType
 * for CSS container queries) and every child's display mode and width in one
 * call. Running it at different viewport sizes (via chrome-devtools resize_page)
 * and comparing the outputs reveals exactly which breakpoint transition changes
 * the layout and which child is affected.
 *
 * @customize Change '.responsive-container' to match the container being tested.
 * @usage chrome-devtools evaluate_script "<content>"
 * @returns {Object} Container type/width and array of children with display/width.
 */
() => {
  const container = document.querySelector('.responsive-container');
  if (!container) return 'Container not found';
  const s = getComputedStyle(container);
  return {
    width: s.width,
    containerType: s.containerType,
    children: [...container.children].map(c => ({
      class: c.className?.substring(0, 60),
      display: getComputedStyle(c).display,
      width: getComputedStyle(c).width
    }))
  };
}
