// Visual Audit Script
// Inject via: chrome-devtools evaluate_script "<this script>"
// Returns JSON array of visual issues found on the page.
() => {
  const issues = [];

  // 1. Broken images (failed to load or zero dimensions)
  document.querySelectorAll('img').forEach((img) => {
    if (!img.complete || img.naturalWidth === 0) {
      issues.push({
        type: 'broken-image',
        severity: 'critical',
        element: img.tagName,
        selector: img.src || img.getAttribute('data-src') || 'unknown',
        message: `Broken image: ${img.alt || img.src || 'no alt/src'}`,
        rect: img.getBoundingClientRect().toJSON(),
      });
    }
    if (!img.alt && !img.getAttribute('role')) {
      issues.push({
        type: 'missing-alt',
        severity: 'warning',
        element: img.tagName,
        selector: img.src || 'unknown',
        message: `Image missing alt text: ${img.src}`,
        rect: img.getBoundingClientRect().toJSON(),
      });
    }
  });

  // 2. Text overflow (content wider than container)
  document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, li, td, th, a, label, div').forEach((el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    if (el.scrollWidth > el.clientWidth + 2 && style.overflow !== 'hidden' && style.overflowX !== 'hidden') {
      // Only flag if the element has actual text content
      if (el.textContent.trim().length > 0 && el.clientWidth > 0) {
        issues.push({
          type: 'text-overflow',
          severity: 'warning',
          element: el.tagName,
          selector: el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
          message: `Text overflows container (scrollWidth: ${el.scrollWidth}, clientWidth: ${el.clientWidth})`,
          text: el.textContent.trim().slice(0, 80),
          rect: el.getBoundingClientRect().toJSON(),
        });
      }
    }
  });

  // 3. Elements outside viewport
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"]').forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    if (rect.right < 0 || rect.bottom < 0 || rect.left > vw || rect.top > vh) {
      issues.push({
        type: 'outside-viewport',
        severity: 'info',
        element: el.tagName,
        selector: el.textContent.trim().slice(0, 40) || el.className || el.tagName,
        message: `Interactive element outside viewport at (${Math.round(rect.left)}, ${Math.round(rect.top)})`,
        rect: rect.toJSON(),
      });
    }
  });

  // 4. Horizontal scroll detection
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 5) {
    issues.push({
      type: 'horizontal-scroll',
      severity: 'warning',
      element: 'document',
      selector: 'html',
      message: `Page has horizontal scroll (scrollWidth: ${document.documentElement.scrollWidth}, clientWidth: ${document.documentElement.clientWidth})`,
    });
  }

  // 5. Empty visible containers (have background/border but no content)
  document.querySelectorAll('div, section, article, aside, main').forEach((el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;
    const hasBackground = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
    const hasBorder = parseInt(style.borderWidth) > 0;
    const hasVisualPresence = hasBackground || hasBorder;
    if (hasVisualPresence && el.textContent.trim().length === 0 && el.querySelectorAll('img, svg, video, canvas, iframe').length === 0) {
      issues.push({
        type: 'empty-container',
        severity: 'info',
        element: el.tagName,
        selector: el.className ? `.${el.className.split(' ')[0]}` : el.id ? `#${el.id}` : el.tagName.toLowerCase(),
        message: `Visible container with no content (${Math.round(rect.width)}x${Math.round(rect.height)})`,
        rect: rect.toJSON(),
      });
    }
  });

  // 6. Z-index stacking issues (very high z-index values)
  document.querySelectorAll('*').forEach((el) => {
    const style = getComputedStyle(el);
    const z = parseInt(style.zIndex);
    if (z > 10000) {
      issues.push({
        type: 'extreme-z-index',
        severity: 'info',
        element: el.tagName,
        selector: el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
        message: `Extremely high z-index: ${z}`,
        rect: el.getBoundingClientRect().toJSON(),
      });
    }
  });

  // 7. Small text detection (below 12px)
  document.querySelectorAll('p, span, a, li, td, th, label, small').forEach((el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    if (el.textContent.trim().length === 0) return;
    const fontSize = parseFloat(style.fontSize);
    if (fontSize < 12 && fontSize > 0) {
      issues.push({
        type: 'small-text',
        severity: 'warning',
        element: el.tagName,
        selector: el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
        message: `Text size ${fontSize}px is below 12px minimum`,
        text: el.textContent.trim().slice(0, 40),
      });
    }
  });

  return JSON.stringify(issues);
}
