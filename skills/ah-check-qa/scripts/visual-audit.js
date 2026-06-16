// Visual Audit Script
// Inject via: { printf '('; cat visual-audit.js; printf ')()'; } | agent-browser eval --stdin
// Returns JSON { summary, issues } -- issues is capped (see MAX_ISSUES) and the
// summary keeps the true totals so nothing is lost when the list is truncated.
() => {
  const MAX_ISSUES = 50;
  const issues = [];
  const seen = new Set();

  // Compact rect: rounded {x,y,w,h} instead of rect.toJSON() (which duplicates
  // top/right/bottom/left). Keeps each issue small in the caller's context.
  const rectOf = (el) => compactRect(el.getBoundingClientRect());
  const compactRect = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });

  // Deduplication helper: prevents nested elements from reporting the same issue
  // multiple times. Uses issue type + element position as a fingerprint.
  const dedupe = (issue) => {
    const key = `${issue.type}:${issue.rect?.x || 0},${issue.rect?.y || 0},${issue.rect?.w || 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  const pushIssue = (issue) => {
    if (dedupe(issue)) issues.push(issue);
  };

  // 1. Broken images (failed to load or zero dimensions)
  document.querySelectorAll('img').forEach((img) => {
    if (!img.complete || img.naturalWidth === 0) {
      pushIssue({
        type: 'broken-image',
        severity: 'critical',
        element: img.tagName,
        selector: img.src || img.getAttribute('data-src') || 'unknown',
        message: `Broken image: ${img.alt || img.src || 'no alt/src'}`,
        rect: rectOf(img),
      });
    }
    if (!img.alt && !img.getAttribute('role')) {
      pushIssue({
        type: 'missing-alt',
        severity: 'warning',
        element: img.tagName,
        selector: img.src || 'unknown',
        message: `Image missing alt text: ${img.src}`,
        rect: rectOf(img),
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
        pushIssue({
          type: 'text-overflow',
          severity: 'warning',
          element: el.tagName,
          selector: el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
          message: `Text overflows container (scrollWidth: ${el.scrollWidth}, clientWidth: ${el.clientWidth})`,
          text: el.textContent.trim().slice(0, 80),
          rect: rectOf(el),
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
      pushIssue({
        type: 'outside-viewport',
        severity: 'info',
        element: el.tagName,
        selector: el.textContent.trim().slice(0, 40) || el.className || el.tagName,
        message: `Interactive element outside viewport at (${Math.round(rect.left)}, ${Math.round(rect.top)})`,
        rect: compactRect(rect),
      });
    }
  });

  // 4. Horizontal scroll detection
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 5) {
    pushIssue({
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
      pushIssue({
        type: 'empty-container',
        severity: 'info',
        element: el.tagName,
        selector: el.className ? `.${el.className.split(' ')[0]}` : el.id ? `#${el.id}` : el.tagName.toLowerCase(),
        message: `Visible container with no content (${Math.round(rect.width)}x${Math.round(rect.height)})`,
        rect: compactRect(rect),
      });
    }
  });

  // 6. Z-index stacking issues (very high z-index values)
  // Only check positioned elements -- z-index has no effect on static elements,
  // so scanning everything wastes time on complex pages.
  document.querySelectorAll('[style*="z-index"], [class]').forEach((el) => {
    const style = getComputedStyle(el);
    if (style.position === 'static') return;
    const z = parseInt(style.zIndex);
    if (z > 10000) {
      pushIssue({
        type: 'extreme-z-index',
        severity: 'info',
        element: el.tagName,
        selector: el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
        message: `Extremely high z-index: ${z}`,
        rect: rectOf(el),
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
      pushIssue({
        type: 'small-text',
        severity: 'warning',
        element: el.tagName,
        selector: el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
        message: `Text size ${fontSize}px is below 12px minimum`,
        text: el.textContent.trim().slice(0, 40),
      });
    }
  });

  // Build bounded output: true counts in the summary, capped list of issues.
  const rank = { critical: 0, warning: 1, info: 2 };
  const byType = {};
  const bySeverity = {};
  for (const i of issues) {
    byType[i.type] = (byType[i.type] || 0) + 1;
    bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
  }
  const sorted = issues.slice().sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));

  return JSON.stringify({
    summary: { total: issues.length, byType, bySeverity, truncated: issues.length > MAX_ISSUES },
    issues: sorted.slice(0, MAX_ISSUES),
  });
}
