// Resilience Test Script
// Inject via: chrome-devtools evaluate_script "<this script>"
// Attempts to break the page through stress testing, input fuzzing,
// and edge case scenarios. Captures JS errors and reports findings.
// Returns JSON with test results and discovered issues.
() => {
  const results = {
    tests: [],
    capturedErrors: [],
  };

  // --- Error capture setup ---
  const capturedErrors = [];
  const originalOnError = window.onerror;
  const originalOnUnhandled = window.onunhandledrejection;

  window.onerror = (msg, src, line, col, err) => {
    capturedErrors.push({
      type: 'runtime-error',
      message: String(msg),
      source: src,
      line,
      stack: err?.stack?.slice(0, 200),
    });
    if (originalOnError) originalOnError(msg, src, line, col, err);
  };

  window.onunhandledrejection = (event) => {
    capturedErrors.push({
      type: 'unhandled-rejection',
      message: String(event.reason),
      stack: event.reason?.stack?.slice(0, 200),
    });
    if (originalOnUnhandled) originalOnUnhandled(event);
  };

  const addTest = (name, passed, details) => {
    results.tests.push({ name, passed, details });
  };

  // --- Test 1: Input Fuzzing ---
  const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
  const savedValues = new Map();
  const fuzzPayloads = [
    { name: 'xss-script', value: '<script>alert("xss")</script>' },
    { name: 'xss-img', value: '"><img src=x onerror=alert(1)>' },
    { name: 'sql-injection', value: "' OR 1=1; DROP TABLE users; --" },
    { name: 'long-string', value: 'A'.repeat(10000) },
    { name: 'unicode-overflow', value: '\u{1F4A9}'.repeat(500) },
    { name: 'null-bytes', value: 'test\x00\x00\x00value' },
    { name: 'path-traversal', value: '../../../etc/passwd' },
    { name: 'negative-number', value: '-99999999999' },
    { name: 'float-precision', value: '0.1 + 0.2' },
    { name: 'html-entities', value: '&lt;&gt;&amp;&quot;&#x27;' },
    { name: 'rtl-override', value: '\u202Ereversed\u202C' },
    { name: 'zero-width', value: 'test\u200B\u200B\u200Bvalue' },
  ];

  const errorsBeforeFuzz = capturedErrors.length;

  inputs.forEach((input) => {
    if (input.type === 'hidden' || input.type === 'file') return;
    savedValues.set(input, input.value || input.textContent);

    fuzzPayloads.forEach((payload) => {
      try {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set ||
          Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

        if (nativeInputValueSetter && input.tagName !== 'DIV') {
          nativeInputValueSetter.call(input, payload.value);
        } else {
          input.textContent = payload.value;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {
        // Error captured by global handler
      }
    });
  });

  // Check if XSS payloads were rendered as executable HTML
  const xssRendered =
    document.body.innerHTML.includes('<script>alert') ||
    document.body.innerHTML.includes('onerror=alert');

  addTest(
    'xss-prevention',
    !xssRendered,
    xssRendered
      ? 'XSS payload was rendered as HTML -- potential XSS vulnerability'
      : 'XSS payloads were properly escaped',
  );

  const fuzzErrors = capturedErrors.length - errorsBeforeFuzz;
  addTest(
    'input-fuzzing',
    fuzzErrors === 0,
    fuzzErrors > 0
      ? `${fuzzErrors} JS error(s) triggered by fuzz input in ${inputs.length} field(s)`
      : `${inputs.length} input(s) tested with ${fuzzPayloads.length} payloads, no crashes`,
  );

  // Restore original values
  savedValues.forEach((val, input) => {
    try {
      if (input.tagName === 'DIV') {
        input.textContent = val;
      } else {
        input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (_) {
      // Best-effort restore
    }
  });

  // --- Test 2: Rapid Click Stress ---
  const errorsBeforeClicks = capturedErrors.length;
  const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"]');
  let clickCount = 0;

  buttons.forEach((btn) => {
    const style = getComputedStyle(btn);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    if (btn.disabled) return;

    for (let i = 0; i < 3; i++) {
      try {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        clickCount++;
      } catch (_) {
        // Error captured by global handler
      }
    }
  });

  const clickErrors = capturedErrors.length - errorsBeforeClicks;
  addTest(
    'rapid-click-stress',
    clickErrors === 0,
    clickErrors > 0
      ? `${clickErrors} error(s) from rapid-clicking ${buttons.length} button(s)`
      : `${clickCount} rapid clicks on ${buttons.length} button(s), no crashes`,
  );

  // --- Test 3: Form Double-Submit ---
  const forms = document.querySelectorAll('form');
  const errorsBeforeForms = capturedErrors.length;

  forms.forEach((form) => {
    try {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    } catch (_) {
      // Error captured by global handler
    }
  });

  const formErrors = capturedErrors.length - errorsBeforeForms;
  addTest(
    'form-double-submit',
    formErrors === 0,
    forms.length === 0
      ? 'No forms found on page'
      : formErrors > 0
        ? `${formErrors} error(s) from double-submitting ${forms.length} form(s)`
        : `${forms.length} form(s) survived double-submit`,
  );

  // --- Test 4: DOM Mutation Resilience ---
  const errorsBeforeDom = capturedErrors.length;
  const testContainers = document.querySelectorAll(
    'main, [role="main"], .content, #app > div, #root > div, #__next > div',
  );
  let domTestRan = false;

  if (testContainers.length > 0) {
    const target = testContainers[0];
    const clone = target.cloneNode(true);
    const parent = target.parentNode;
    const nextSibling = target.nextSibling;

    try {
      parent.removeChild(target);
      if (nextSibling) {
        parent.insertBefore(clone, nextSibling);
      } else {
        parent.appendChild(clone);
      }
      domTestRan = true;
    } catch (_) {
      // Attempt to restore on failure
      try {
        if (!document.contains(target) && !document.contains(clone)) {
          if (nextSibling) {
            parent.insertBefore(target, nextSibling);
          } else {
            parent.appendChild(target);
          }
        }
      } catch (__) {
        // Best-effort restore
      }
    }
  }

  const domErrors = capturedErrors.length - errorsBeforeDom;
  addTest(
    'dom-mutation-resilience',
    domErrors === 0,
    !domTestRan
      ? 'No suitable container found to test'
      : domErrors > 0
        ? `${domErrors} error(s) after DOM removal/restoration`
        : 'Page survived DOM removal and restoration',
  );

  // --- Test 5: Rapid Event Dispatch ---
  const errorsBeforeEvents = capturedErrors.length;
  const eventTypes = ['resize', 'scroll', 'focus', 'blur', 'keydown', 'keyup', 'mousemove'];
  let eventCount = 0;

  eventTypes.forEach((type) => {
    for (let i = 0; i < 50; i++) {
      try {
        window.dispatchEvent(new Event(type, { bubbles: true }));
        eventCount++;
      } catch (_) {
        // Error captured by global handler
      }
    }
  });

  const eventErrors = capturedErrors.length - errorsBeforeEvents;
  addTest(
    'rapid-event-dispatch',
    eventErrors === 0,
    eventErrors > 0
      ? `${eventErrors} error(s) from ${eventCount} rapid events`
      : `${eventCount} rapid events dispatched, no crashes`,
  );

  // --- Test 6: LocalStorage Boundary ---
  const errorsBeforeStorage = capturedErrors.length;
  let storageTestResult = 'skipped';

  try {
    const testKey = '__resilience_test__';
    const sizes = [1024, 10240, 102400, 1048576];
    let maxSize = 0;

    for (const size of sizes) {
      try {
        localStorage.setItem(testKey, 'x'.repeat(size));
        maxSize = size;
        localStorage.removeItem(testKey);
      } catch (_) {
        break;
      }
    }

    storageTestResult =
      maxSize >= 1048576
        ? 'localStorage accepts 1MB+ writes'
        : `localStorage limit reached at ${maxSize / 1024}KB`;
  } catch (e) {
    storageTestResult = `localStorage unavailable: ${e.message}`;
  }

  const storageErrors = capturedErrors.length - errorsBeforeStorage;
  addTest('localstorage-boundary', storageErrors === 0, storageTestResult);

  // --- Test 7: Global State Exposure ---
  const sensitivePatterns = [
    'token',
    'secret',
    'password',
    'apikey',
    'api_key',
    'auth',
    'credential',
    'jwt',
    'session',
    'private_key',
  ];

  const exposedGlobals = [];

  for (const key of Object.keys(window)) {
    const lowerKey = key.toLowerCase();
    if (sensitivePatterns.some((p) => lowerKey.includes(p))) {
      const val = window[key];
      if (typeof val === 'string' && val.length > 0) {
        exposedGlobals.push({ key, type: typeof val, length: val.length });
      }
    }
  }

  addTest(
    'no-exposed-secrets',
    exposedGlobals.length === 0,
    exposedGlobals.length > 0
      ? `${exposedGlobals.length} potentially sensitive global(s): ${exposedGlobals.map((g) => g.key).join(', ')}`
      : 'No sensitive-looking globals found on window',
  );

  // --- Test 8: Error Boundary Presence ---
  const reactRoot =
    document.getElementById('root') ||
    document.getElementById('app') ||
    document.getElementById('__next');
  const hasReactFiber = reactRoot && Object.keys(reactRoot).some((k) => k.startsWith('__react'));
  const hasErrorBoundary =
    document.querySelector('[data-error-boundary]') ||
    document.body.innerHTML.includes('error-boundary') ||
    document.body.innerHTML.includes('ErrorBoundary');

  addTest(
    'error-boundary-present',
    !hasReactFiber || hasErrorBoundary,
    hasReactFiber
      ? hasErrorBoundary
        ? 'React app has error boundary indicators'
        : 'React app detected but no error boundary found -- unhandled render errors will crash the app'
      : 'Not a React app or no React root detected',
  );

  // --- Cleanup: Restore error handlers ---
  window.onerror = originalOnError;
  window.onunhandledrejection = originalOnUnhandled;

  // --- Compile results ---
  results.capturedErrors = capturedErrors;
  results.summary = {
    totalTests: results.tests.length,
    passed: results.tests.filter((t) => t.passed).length,
    failed: results.tests.filter((t) => !t.passed).length,
    totalJsErrors: capturedErrors.length,
  };

  return JSON.stringify(results);
};
