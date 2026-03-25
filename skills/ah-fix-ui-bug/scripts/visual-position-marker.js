/**
 * Visual Position Marker
 *
 * When debugging positioning bugs, you often have a calculated coordinate
 * (from getBoundingClientRect, a transform value, or an animation target) and
 * need to verify whether it actually corresponds to the right spot on screen.
 * Comparing pixel values mentally is error-prone -- placing a visible marker
 * at the coordinates gives immediate visual confirmation of where the browser
 * thinks the position is.
 *
 * The dot uses position:fixed so it stays at viewport coordinates regardless
 * of scroll position, matching how getBoundingClientRect reports positions.
 * It auto-removes after 3 seconds to avoid cluttering the page.
 *
 * @param {number} targetX - X coordinate (viewport pixels).
 * @param {number} targetY - Y coordinate (viewport pixels).
 * @usage chrome-devtools evaluate_script "<content>" --args 200 150
 * @returns {string} Confirmation with coordinates.
 */
(targetX, targetY) => {
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;width:10px;height:10px;background:red;border-radius:50%;z-index:99999;pointer-events:none;';
  dot.style.left = (targetX - 5) + 'px';
  dot.style.top = (targetY - 5) + 'px';
  document.body.appendChild(dot);
  setTimeout(() => dot.remove(), 3000);
  return 'Red dot placed at (' + targetX + ',' + targetY + ')';
}
