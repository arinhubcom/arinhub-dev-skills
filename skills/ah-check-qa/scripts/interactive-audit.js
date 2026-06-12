// Interactive Elements Audit Script
// Inject via: chrome-devtools evaluate_script "<this script>"
// Scans all interactive elements and checks accessibility, visibility,
// touch target size, and keyboard reachability.
// Returns JSON array of issues.
() => {
  const issues = [];
  const seen = new Set();
  const MIN_TOUCH_TARGET = 44; // WCAG 2.5.8 minimum
  const MAX_ISSUES = 50;

  // Compact rect: rounded {x,y,w,h} instead of rect.toJSON() (which duplicates
  // top/right/bottom/left), keeping each issue small in the caller's context.
  const compactRect = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });

  // Deduplication: nested interactive elements (e.g., <a> wrapping <button>)
  // can trigger the same issue at the same position. Fingerprint by type + rect.
  const dedupe = (issue) => {
    const key = `${issue.type}:${issue.rect?.x || 0},${issue.rect?.y || 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  const pushIssue = (issue) => {
    if (dedupe(issue)) issues.push(issue);
  };

  const interactiveSelectors = [
    'button',
    'a[href]',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="slider"]',
    '[role="combobox"]',
    '[tabindex]:not([tabindex="-1"])',
  ];

  const elements = document.querySelectorAll(interactiveSelectors.join(', '));
  let totalChecked = 0;

  elements.forEach((el) => {
    const style = getComputedStyle(el);

    // Skip hidden elements
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    totalChecked++;
    const label = el.getAttribute('aria-label') ||
      el.getAttribute('aria-labelledby') ||
      el.getAttribute('title') ||
      el.textContent.trim().slice(0, 60) ||
      el.getAttribute('placeholder') ||
      el.getAttribute('name') ||
      '';

    const elementDesc = `${el.tagName.toLowerCase()}${el.type ? `[type=${el.type}]` : ''} "${label.slice(0, 40)}"`;

    // 1. Missing accessible label
    if (!label && el.tagName !== 'INPUT') {
      pushIssue({
        type: 'missing-label',
        severity: 'critical',
        element: elementDesc,
        message: 'Interactive element has no accessible label',
        rect: compactRect(rect),
      });
    }

    // For inputs, check for associated label or aria-label
    if (el.tagName === 'INPUT' && el.type !== 'hidden') {
      const hasLabel = label ||
        el.labels?.length > 0 ||
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby');
      if (!hasLabel) {
        pushIssue({
          type: 'missing-input-label',
          severity: 'critical',
          element: elementDesc,
          message: 'Input has no associated label, aria-label, or aria-labelledby',
          rect: compactRect(rect),
        });
      }
    }

    // 2. Touch target too small
    if (rect.width < MIN_TOUCH_TARGET || rect.height < MIN_TOUCH_TARGET) {
      pushIssue({
        type: 'small-touch-target',
        severity: 'warning',
        element: elementDesc,
        message: `Touch target ${Math.round(rect.width)}x${Math.round(rect.height)}px is below ${MIN_TOUCH_TARGET}x${MIN_TOUCH_TARGET}px minimum`,
        rect: compactRect(rect),
      });
    }

    // 3. Pointer events disabled
    if (style.pointerEvents === 'none') {
      pushIssue({
        type: 'pointer-events-disabled',
        severity: 'critical',
        element: elementDesc,
        message: 'Interactive element has pointer-events: none',
        rect: compactRect(rect),
      });
    }

    // 4. Element obscured by another element
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    if (centerX >= 0 && centerY >= 0 && centerX <= document.documentElement.clientWidth && centerY <= document.documentElement.clientHeight) {
      const topEl = document.elementFromPoint(centerX, centerY);
      if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
        pushIssue({
          type: 'obscured',
          severity: 'warning',
          element: elementDesc,
          message: `Element center is obscured by ${topEl.tagName.toLowerCase()}.${topEl.className?.split?.(' ')?.[0] || ''}`,
          rect: compactRect(rect),
        });
      }
    }

    // 5. Disabled without visual indication
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
      if (style.opacity > 0.8 && style.cursor !== 'not-allowed') {
        pushIssue({
          type: 'disabled-no-visual',
          severity: 'info',
          element: elementDesc,
          message: 'Disabled element lacks clear visual indication (normal opacity, no not-allowed cursor)',
          rect: compactRect(rect),
        });
      }
    }

    // 6. Link without href or with javascript:void
    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      if (!href || href === '#' || href.startsWith('javascript:')) {
        pushIssue({
          type: 'invalid-link',
          severity: 'warning',
          element: elementDesc,
          message: `Link has ${!href ? 'no href' : `href="${href}"`} -- should be a button if not a navigation link`,
          rect: compactRect(rect),
        });
      }
    }

    // 7. Button without type (defaults to submit, may cause unintended form submissions)
    if (el.tagName === 'BUTTON' && !el.getAttribute('type')) {
      const inForm = el.closest('form');
      if (inForm) {
        pushIssue({
          type: 'button-no-type',
          severity: 'info',
          element: elementDesc,
          message: 'Button inside form has no type attribute (defaults to "submit")',
          rect: compactRect(rect),
        });
      }
    }
  });

  // Bounded output: keep true counts in the summary; sort by severity so the
  // most important issues survive the cap, then slice.
  const rank = { critical: 0, warning: 1, info: 2 };
  const byType = {};
  for (const i of issues) byType[i.type] = (byType[i.type] || 0) + 1;
  const sorted = issues.slice().sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));

  return JSON.stringify({
    summary: {
      totalChecked,
      totalIssues: issues.length,
      truncated: issues.length > MAX_ISSUES,
      byType,
      bySeverity: {
        critical: issues.filter((i) => i.severity === 'critical').length,
        warning: issues.filter((i) => i.severity === 'warning').length,
        info: issues.filter((i) => i.severity === 'info').length,
      },
    },
    issues: sorted.slice(0, MAX_ISSUES),
  });
}
