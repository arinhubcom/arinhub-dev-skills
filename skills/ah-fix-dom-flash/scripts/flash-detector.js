/**
 * Flash Detector v2
 *
 * Detects DOM flash/flicker bugs -- elements that briefly appear in wrong
 * positions due to timing races between framework DOM manipulation and
 * React's async re-render cycle.
 *
 * Two detection strategies run in parallel:
 *
 * 1. MutationObserver -- fires synchronously on DOM changes. Only reports
 *    elements that match overlay/portal patterns, have fixed/absolute
 *    positioning, or appear at suspicious positions (0,0 / off-viewport).
 *    This filters out normal DOM activity that the v1 detector over-reported.
 *
 * 2. requestAnimationFrame loop -- runs between render frames. Tracks
 *    which elements were previously positioned (fixed/absolute) and detects
 *    when they lose positioning while still having visible content. Also
 *    catches overlay elements that have content but no positioning (the
 *    classic one-frame flash).
 *
 * Deduplication: Each unique element + detection type combination is
 * reported only once. This prevents the flood of duplicate entries that
 * made v1 results hard to interpret.
 *
 * @configure Set window.__flashDetectorConfig BEFORE injecting this script:
 *   window.__flashDetectorConfig = {
 *     selector: '[data-my-overlay]',  // CSS selector for suspected element
 *     maxDetections: 50,              // max entries to record (default: 50)
 *   }
 * @usage chrome-devtools evaluate_script "<content>"
 * @global {Array} window.__flashDetected - Collected flash detection entries.
 * @global {Function} window.__stopFlashDetector - Call to stop both observers.
 * @returns {string} Confirmation message with active configuration.
 */
() => {
  const config = window.__flashDetectorConfig || {};
  const CUSTOM_SELECTOR = config.selector || '';
  const MAX_DETECTIONS = config.maxDetections || 50;

  window.__flashDetected = [];
  const seenKeys = new Set();
  let running = true;

  function fingerprint(el, type) {
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.x / 5) * 5;
    const y = Math.round(rect.y / 5) * 5;
    return `${type}|${el.tagName}|${(el.className || '').toString().substring(0, 50)}|${x},${y}`;
  }

  function record(entry, el) {
    if (window.__flashDetected.length >= MAX_DETECTIONS) return;
    const key = fingerprint(el, entry.type);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    window.__flashDetected.push(entry);
  }

  const OVERLAY_SELECTORS = [
    '[data-dnd-overlay]',
    '[data-radix-popper-content-wrapper]',
    '[data-radix-portal]',
    '[data-floating-ui-portal]',
    '[data-framer-portal]',
    '[role="dialog"]',
    '[role="tooltip"]',
    '[role="menu"]',
    '[role="listbox"]',
  ].join(', ');

  function isOverlayElement(el) {
    try {
      if (CUSTOM_SELECTOR && el.matches(CUSTOM_SELECTOR)) return true;
      return el.matches(OVERLAY_SELECTORS);
    } catch {
      return false;
    }
  }

  function isSuspiciousPosition(rect) {
    return (
      (rect.x === 0 && rect.y === 0 && rect.width > 0) ||
      rect.y > window.innerHeight ||
      rect.x < -10 ||
      rect.y < -10
    );
  }

  // --- Strategy 1: MutationObserver ---
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const el = node;
        const computed = window.getComputedStyle(el);
        if (computed.display === 'none') continue;
        const rect = el.getBoundingClientRect();
        if (rect.height <= 0) continue;

        const isOverlay = isOverlayElement(el);
        const isPositioned =
          computed.position === 'fixed' || computed.position === 'absolute';
        const suspicious = isSuspiciousPosition(rect);

        if (isOverlay || isPositioned || suspicious) {
          record(
            {
              type: 'added',
              source: 'mutation',
              time: performance.now(),
              tag: el.tagName,
              className: (el.className || '').toString().substring(0, 150),
              position: computed.position,
              rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
              text: el.textContent?.substring(0, 60),
              suspicious,
            },
            el,
          );
        }
      }

      if (m.type === 'attributes' && m.target.nodeType === 1) {
        const el = m.target;
        const computed = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (rect.height <= 0) continue;

        if (
          isOverlayElement(el) ||
          computed.position === 'fixed' ||
          computed.position === 'absolute'
        ) {
          record(
            {
              type: 'attr-change',
              source: 'mutation',
              time: performance.now(),
              attr: m.attributeName,
              tag: el.tagName,
              position: computed.position,
              opacity: computed.opacity,
              transform: computed.transform?.substring(0, 100),
              style: el.getAttribute('style')?.substring(0, 200),
              rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
            },
            el,
          );
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
      'data-state',
      'data-side',
      'data-dnd-dragging',
      'data-dnd-feedback',
      'hidden',
      'aria-hidden',
    ],
  });

  window.__stopFlashDetector = () => {
    running = false;
    observer.disconnect();
  };

  // --- Strategy 2: requestAnimationFrame loop ---
  const rafSelector =
    CUSTOM_SELECTOR ||
    [
      '[data-dnd-overlay]',
      '[data-radix-popper-content-wrapper]',
      '[data-radix-portal]',
      '[data-floating-ui-portal]',
      '[data-framer-portal]',
      '[role="dialog"][style]',
      '[role="tooltip"][style]',
    ].join(', ');

  const prevPositioned = new WeakMap();

  function checkFrame() {
    if (!running) return;

    const suspects = document.querySelectorAll(rafSelector);
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
      const wasPositioned = prevPositioned.get(el);

      if (isPositioned) {
        prevPositioned.set(el, computed.position);
      }

      if (isHidden || rect.height <= 0) continue;

      // Detect positioning loss: was fixed/absolute, now static, still visible
      if (wasPositioned && !isPositioned && hasContent) {
        record(
          {
            type: 'position-lost',
            source: 'raf',
            time: performance.now(),
            tag: el.tagName,
            previousPosition: wasPositioned,
            currentPosition: computed.position,
            display: computed.display,
            rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
            text: el.textContent?.substring(0, 60),
            childCount: el.children.length,
          },
          el,
        );
        prevPositioned.delete(el);
      }

      // Detect content without positioning (original "flash" pattern)
      if (hasContent && !isPositioned) {
        record(
          {
            type: 'flash',
            source: 'raf',
            time: performance.now(),
            tag: el.tagName,
            position: computed.position,
            display: computed.display,
            rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
            text: el.textContent?.substring(0, 60),
            childCount: el.children.length,
          },
          el,
        );
      }

      // Detect transform loss on positioned element at suspicious position
      if (
        isPositioned &&
        hasContent &&
        computed.transform === 'none' &&
        isSuspiciousPosition(rect)
      ) {
        record(
          {
            type: 'transform-lost',
            source: 'raf',
            time: performance.now(),
            tag: el.tagName,
            position: computed.position,
            rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
            text: el.textContent?.substring(0, 60),
          },
          el,
        );
      }
    }
    requestAnimationFrame(checkFrame);
  }
  requestAnimationFrame(checkFrame);

  return (
    'Flash detector v2 installed. Config: ' +
    JSON.stringify({
      selector: rafSelector.substring(0, 80),
      maxDetections: MAX_DETECTIONS,
    })
  );
}
