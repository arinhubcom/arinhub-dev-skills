# Resilience / Break Testing

Actively try to break the page through stress testing, input fuzzing, and edge
case scenarios. This step simulates adversarial user behavior and catches
crashes, unhandled errors, and degraded states that normal QA misses.

Run this on the primary route (root or the user's focus route). If the page has
forms or many interactive elements, run on that route too.

## a. Capture Error Baseline

Before running destructive tests, record the current console error count:

```bash
agent-browser console
```

Save the count for comparison after tests complete.

## b. Resilience Test Script

Read `scripts/resilience-test.js` and inject it:

```bash
{ printf '('; cat scripts/resilience-test.js; printf ')()'; } | agent-browser eval --stdin
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
agent-browser reload
agent-browser reload
sleep 3

# Rapid back/forward (only if history exists from prior steps)
agent-browser back
agent-browser forward
agent-browser back
agent-browser forward
sleep 3

# Check for errors after navigation stress
agent-browser console
```

## d. Viewport Stress

Rapidly cycle through viewport sizes to trigger responsive layout edge cases:

```bash
agent-browser set viewport 320 480
agent-browser set viewport 1920 1080
agent-browser set viewport 375 812
agent-browser set viewport 2560 1440
agent-browser set viewport 768 1024

# Check for JS errors after rapid resizing
agent-browser console

# Take snapshot to verify layout survived
agent-browser snapshot -i
```

Look for:
- Layout breakage at extreme sizes (320px wide, 2560px wide)
- JS errors from resize event handlers
- Elements that disappeared or overlapped after resize

## e. Network Throttle Test

Test the page under slow network conditions:

```bash
# agent-browser has no built-in network throttling profile. To approximate slow
# network conditions, intercept requests and add latency via `agent-browser network
# route` (request mocking/interception), or use `agent-browser network har` to
# record/replay. If neither is available in your build, skip the throttle and note
# it in the report.
agent-browser network route

# Reload and wait (longer settle for throttled network)
agent-browser reload
sleep 30

# Check for timeout errors or broken UI
agent-browser console
agent-browser snapshot -i

# Restore normal network (clear any active routes)
agent-browser network route
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
agent-browser press Tab
agent-browser press Tab
agent-browser press Tab
agent-browser press Tab
agent-browser press Tab

# Escape key spam (close modals, cancel operations)
agent-browser press Escape
agent-browser press Escape

# Enter key on whatever is focused
agent-browser press Enter

# Check for errors
agent-browser console
```

## g. Compare Error Count

Compare post-test console errors with the baseline from step a:

```bash
agent-browser console
```

New errors introduced during resilience testing indicate fragile error handling.
Classify new errors:
- Unhandled exceptions or promise rejections: **warning**
- Page crash or blank screen: **critical**
- Framework error overlay appeared (React red box, Vue warn overlay): **critical**

Restore page to a known good state before continuing:

```bash
agent-browser open "${BASE_URL}"
agent-browser set viewport 1280 800
```
