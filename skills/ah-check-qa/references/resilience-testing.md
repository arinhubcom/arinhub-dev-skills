# Resilience / Break Testing

Actively try to break the page through stress testing, input fuzzing, and edge
case scenarios. This step simulates adversarial user behavior and catches
crashes, unhandled errors, and degraded states that normal QA misses.

Run this on the primary route (root or the user's focus route). If the page has
forms or many interactive elements, run on that route too.

## a. Capture Error Baseline

Before running destructive tests, record the current console error count:

```bash
chrome-devtools list_console_messages --types error --pageSize 100
```

Save the count for comparison after tests complete.

## b. Resilience Test Script

Read `scripts/resilience-test.js` and inject it:

```bash
chrome-devtools evaluate_script "<resilience-test.js content>"
```

The script runs these tests automatically and returns a JSON report:

- **Input fuzzing**: Fills all inputs with XSS payloads, SQL injection strings,
  extreme-length strings, unicode overflow, null bytes, and path traversal attempts
- **XSS prevention**: Checks whether injected script tags were rendered as executable HTML
- **Rapid click stress**: Triple-clicks every visible button to trigger race conditions
- **Form double-submit**: Dispatches submit events twice on every form
- **DOM mutation resilience**: Removes and restores a main content container
- **Rapid event dispatch**: Fires 50 resize/scroll/focus/blur/key events in quick succession
- **localStorage boundary**: Probes storage capacity limits
- **Global state exposure**: Scans `window` for leaked tokens, secrets, or credentials
- **Error boundary presence**: Checks whether React apps have error boundaries

Parse the JSON result. Any test with `passed: false` is a finding. Map to
report severities:

| Test name | Failure severity |
|---|---|
| `xss-prevention` | critical |
| `no-exposed-secrets` | critical |
| `input-fuzzing` | warning |
| `rapid-click-stress` | warning |
| `form-double-submit` | warning |
| `dom-mutation-resilience` | warning |
| `error-boundary-present` | warning |
| All others | info |

## c. Rapid Navigation Stress

Test page stability under aggressive navigation:

```bash
# Rapid reload cycle
chrome-devtools navigate_page --url "reload"
chrome-devtools navigate_page --url "reload"
chrome-devtools wait_for --event networkIdle --timeout 5000

# Rapid back/forward (only if history exists from prior steps)
chrome-devtools navigate_page --url "back"
chrome-devtools navigate_page --url "forward"
chrome-devtools navigate_page --url "back"
chrome-devtools navigate_page --url "forward"
chrome-devtools wait_for --event networkIdle --timeout 5000

# Check for errors after navigation stress
chrome-devtools list_console_messages --types error --pageSize 50
```

## d. Viewport Stress

Rapidly cycle through viewport sizes to trigger responsive layout edge cases:

```bash
chrome-devtools resize_page 320 480
chrome-devtools resize_page 1920 1080
chrome-devtools resize_page 375 812
chrome-devtools resize_page 2560 1440
chrome-devtools resize_page 768 1024

# Check for JS errors after rapid resizing
chrome-devtools list_console_messages --types error --pageSize 50

# Take snapshot to verify layout survived
chrome-devtools take_snapshot --verbose true
```

Look for:
- Layout breakage at extreme sizes (320px wide, 2560px wide)
- JS errors from resize event handlers
- Elements that disappeared or overlapped after resize

## e. Network Throttle Test

Test the page under slow network conditions:

```bash
# Throttle to slow 3G
chrome-devtools emulate --network "Slow 3G"

# Reload and wait (longer timeout for throttled network)
chrome-devtools navigate_page --url "reload"
chrome-devtools wait_for --event networkIdle --timeout 30000

# Check for timeout errors or broken UI
chrome-devtools list_console_messages --types error --pageSize 50
chrome-devtools take_snapshot --verbose true

# Restore normal network
chrome-devtools emulate --network "No throttling"
```

Look for:
- Unhandled timeout errors
- UI stuck in loading state (spinners that never resolve)
- Missing error/retry UI for failed or slow requests
- Content that depends on fast responses and breaks without them

## f. Keyboard Stress

Test keyboard interaction resilience:

```bash
# Tab through focusable elements rapidly
chrome-devtools press_key "Tab"
chrome-devtools press_key "Tab"
chrome-devtools press_key "Tab"
chrome-devtools press_key "Tab"
chrome-devtools press_key "Tab"

# Escape key spam (close modals, cancel operations)
chrome-devtools press_key "Escape"
chrome-devtools press_key "Escape"

# Enter key on whatever is focused
chrome-devtools press_key "Enter"

# Check for errors
chrome-devtools list_console_messages --types error --pageSize 50
```

## g. Compare Error Count

Compare post-test console errors with the baseline from step a:

```bash
chrome-devtools list_console_messages --types error --pageSize 100
```

New errors introduced during resilience testing indicate fragile error handling.
Classify new errors:
- Unhandled exceptions or promise rejections: **warning**
- Page crash or blank screen: **critical**
- Framework error overlay appeared (React red box, Vue warn overlay): **critical**

Restore page to a known good state before continuing:

```bash
chrome-devtools navigate_page --url "${BASE_URL}"
chrome-devtools wait_for --event networkIdle --timeout 10000
chrome-devtools resize_page 1280 800
```
