// Interactive Elements Audit Script
// Inject via: chrome-devtools evaluate_script "<this script>"
// Scans all interactive elements and checks accessibility, visibility,
// touch target size, and keyboard reachability.
// Returns JSON array of issues.
() => {
  const issues = [];
  const MIN_TOUCH_TARGET = 44; // WCAG 2.5.8 minimum

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
  let totalIssues = 0;

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
      issues.push({
        type: 'missing-label',
        severity: 'critical',
        element: elementDesc,
        message: 'Interactive element has no accessible label',
        rect: rect.toJSON(),
      });
      totalIssues++;
    }

    // For inputs, check for associated label or aria-label
    if (el.tagName === 'INPUT' && el.type !== 'hidden') {
      const hasLabel = label ||
        el.labels?.length > 0 ||
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby');
      if (!hasLabel) {
        issues.push({
          type: 'missing-input-label',
          severity: 'critical',
          element: elementDesc,
          message: 'Input has no associated label, aria-label, or aria-labelledby',
          rect: rect.toJSON(),
        });
        totalIssues++;
      }
    }

    // 2. Touch target too small
    if (rect.width < MIN_TOUCH_TARGET || rect.height < MIN_TOUCH_TARGET) {
      issues.push({
        type: 'small-touch-target',
        severity: 'warning',
        element: elementDesc,
        message: `Touch target ${Math.round(rect.width)}x${Math.round(rect.height)}px is below ${MIN_TOUCH_TARGET}x${MIN_TOUCH_TARGET}px minimum`,
        rect: rect.toJSON(),
      });
      totalIssues++;
    }

    // 3. Pointer events disabled
    if (style.pointerEvents === 'none') {
      issues.push({
        type: 'pointer-events-disabled',
        severity: 'critical',
        element: elementDesc,
        message: 'Interactive element has pointer-events: none',
        rect: rect.toJSON(),
      });
      totalIssues++;
    }

    // 4. Element obscured by another element
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    if (centerX >= 0 && centerY >= 0 && centerX <= document.documentElement.clientWidth && centerY <= document.documentElement.clientHeight) {
      const topEl = document.elementFromPoint(centerX, centerY);
      if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
        issues.push({
          type: 'obscured',
          severity: 'warning',
          element: elementDesc,
          message: `Element center is obscured by ${topEl.tagName.toLowerCase()}.${topEl.className?.split?.(' ')?.[0] || ''}`,
          rect: rect.toJSON(),
        });
        totalIssues++;
      }
    }

    // 5. Disabled without visual indication
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
      if (style.opacity > 0.8 && style.cursor !== 'not-allowed') {
        issues.push({
          type: 'disabled-no-visual',
          severity: 'info',
          element: elementDesc,
          message: 'Disabled element lacks clear visual indication (normal opacity, no not-allowed cursor)',
          rect: rect.toJSON(),
        });
        totalIssues++;
      }
    }

    // 6. Link without href or with javascript:void
    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      if (!href || href === '#' || href.startsWith('javascript:')) {
        issues.push({
          type: 'invalid-link',
          severity: 'warning',
          element: elementDesc,
          message: `Link has ${!href ? 'no href' : `href="${href}"`} -- should be a button if not a navigation link`,
          rect: rect.toJSON(),
        });
        totalIssues++;
      }
    }

    // 7. Button without type (defaults to submit, may cause unintended form submissions)
    if (el.tagName === 'BUTTON' && !el.getAttribute('type')) {
      const inForm = el.closest('form');
      if (inForm) {
        issues.push({
          type: 'button-no-type',
          severity: 'info',
          element: elementDesc,
          message: 'Button inside form has no type attribute (defaults to "submit")',
          rect: rect.toJSON(),
        });
        totalIssues++;
      }
    }
  });

  return JSON.stringify({
    summary: {
      totalChecked,
      totalIssues,
      bySeverity: {
        critical: issues.filter((i) => i.severity === 'critical').length,
        warning: issues.filter((i) => i.severity === 'warning').length,
        info: issues.filter((i) => i.severity === 'info').length,
      },
    },
    issues,
  });
}
