/**
 * Flex/Grid Layout Inspector
 *
 * Flex and grid layout bugs are hard to debug because the final size of each
 * child depends on the interplay of multiple properties (flex-grow, flex-shrink,
 * flex-basis, min-width, align-self) across ALL siblings, not just the one
 * that looks wrong. Inspecting a single element in DevTools doesn't reveal
 * why the flex algorithm gave it that particular size.
 *
 * This script dumps the container's layout mode and every child's flex/grid
 * properties alongside their actual rendered dimensions, so you can see the
 * full picture at once. The min-width and min-height values are included
 * because the most common flex bug (items not shrinking) is caused by
 * min-width:auto, which prevents flex-shrink from working below content size.
 *
 * @customize Change '.flex-container' to match the flex/grid container.
 * @usage chrome-devtools evaluate_script "<content>"
 * @returns {Object} Container properties and array of children with their sizing.
 */
() => {
  const container = document.querySelector('.flex-container');
  if (!container) return 'Container not found';
  const cs = getComputedStyle(container);
  const children = [...container.children].map(child => {
    const s = getComputedStyle(child);
    const r = child.getBoundingClientRect();
    return {
      tag: child.tagName,
      class: child.className?.substring(0, 60),
      flexGrow: s.flexGrow, flexShrink: s.flexShrink, flexBasis: s.flexBasis,
      alignSelf: s.alignSelf, minWidth: s.minWidth, minHeight: s.minHeight,
      width: Math.round(r.width), height: Math.round(r.height),
      overflow: s.overflow !== 'visible' ? s.overflow : undefined
    };
  });
  return {
    display: cs.display,
    flexDirection: cs.flexDirection, flexWrap: cs.flexWrap,
    justifyContent: cs.justifyContent, alignItems: cs.alignItems,
    gap: cs.gap,
    gridTemplateColumns: cs.gridTemplateColumns,
    gridTemplateRows: cs.gridTemplateRows,
    children
  };
}
