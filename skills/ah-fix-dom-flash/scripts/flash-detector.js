/**
 * Flash Detector
 *
 * DOM flash/flicker bugs happen when a framework (e.g., @dnd-kit, Framer Motion,
 * Radix) synchronously removes positioning attributes from an overlay element,
 * but React asynchronously clears the overlay's children on the next render
 * cycle. For one frame the element has content but no positioning, so it falls
 * into normal document flow and flashes at (0,0) or at the bottom of the page.
 *
 * This script combines two detection strategies because each catches different
 * classes of flashes:
 *
 * 1. MutationObserver -- fires synchronously on DOM changes, catching added
 *    nodes and attribute mutations on fixed/absolute elements the instant they
 *    happen. Good for detecting framework-level attribute removals.
 *
 * 2. requestAnimationFrame loop -- runs between render frames, catching visual
 *    states where an overlay/portal element has content but lost its positioning
 *    (position:static with children). Good for detecting the one-frame flash
 *    itself, which MutationObserver alone may miss if the positioning was
 *    removed via a class toggle rather than an inline style change.
 *
 * The detector stores all findings in window.__flashDetected and provides a
 * cleanup function at window.__stopFlashDetector. Always inject BEFORE
 * reproducing the interaction, then collect results AFTER.
 *
 * @customize Change the `suspects` selector in the rAF section to target the
 *   specific element causing the flash (e.g., '[data-dnd-overlay]').
 * @usage chrome-devtools evaluate_script "<content>"
 * @global {Array} window.__flashDetected - Collected flash detection entries.
 * @global {Function} window.__stopFlashDetector - Call to stop both observers.
 * @returns {string} Confirmation message.
 */
() => {
  window.__flashDetected = [];
  let running = true;

  // Strategy 1: MutationObserver for attribute/style changes
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // Check added nodes
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const el = node;
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);
        if (rect.height > 0 && computed.display !== 'none') {
          window.__flashDetected.push({
            type: 'added',
            source: 'mutation',
            time: performance.now(),
            tag: el.tagName,
            className: (el.className || '').substring(0, 150),
            position: computed.position,
            rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
            text: el.textContent?.substring(0, 60),
          });
        }
      }
      // Check style/attribute changes on fixed/absolute elements
      if (m.type === 'attributes' && m.target.nodeType === 1) {
        const el = m.target;
        const computed = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (
          rect.height > 0 &&
          (computed.position === 'fixed' || computed.position === 'absolute')
        ) {
          window.__flashDetected.push({
            type: 'attr-change',
            source: 'mutation',
            time: performance.now(),
            attr: m.attributeName,
            tag: el.tagName,
            position: computed.position,
            style: el.getAttribute('style')?.substring(0, 200),
            rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          });
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'style',
      'class',
      'data-dnd-dragging',
      'data-dnd-feedback',
    ],
  });

  window.__stopFlashDetector = () => {
    running = false;
    observer.disconnect();
  };

  // Strategy 2: requestAnimationFrame loop to catch between-render states
  // CUSTOMIZE: adjust the selector for the suspected element
  function checkFrame() {
    if (!running) return;
    const suspects = document.querySelectorAll(
      '[data-dnd-overlay], [data-radix-popper-content-wrapper], [class*="overlay"], [class*="portal"]',
    );
    for (const el of suspects) {
      const computed = window.getComputedStyle(el);
      const hasContent = el.children.length > 0;
      const isPositioned =
        computed.position === 'fixed' || computed.position === 'absolute';
      const isHidden =
        computed.display === 'none' ||
        computed.visibility === 'hidden' ||
        computed.opacity === '0';
      const rect = el.getBoundingClientRect();

      if (hasContent && !isPositioned && !isHidden && rect.height > 0) {
        window.__flashDetected.push({
          type: 'flash',
          source: 'raf',
          time: performance.now(),
          tag: el.tagName,
          position: computed.position,
          display: computed.display,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          text: el.textContent?.substring(0, 60),
          childCount: el.children.length,
        });
      }
    }
    requestAnimationFrame(checkFrame);
  }
  requestAnimationFrame(checkFrame);

  return 'Flash detector installed';
}
