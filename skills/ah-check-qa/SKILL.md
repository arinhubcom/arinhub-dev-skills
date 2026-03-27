---
name: ah-check-qa
description: "Use this skill to run UI and UX quality assurance checks when using the 'ah' prefix. Use when asked to 'ah check qa'. Also use when the user wants to verify visual correctness, check responsive layout, audit interactive elements, run E2E smoke tests, detect console or network errors, compare before/after screenshots during refactoring, or verify that a page works correctly across viewports. Uses chrome-devtools CLI for visual inspection, snapshots, Lighthouse audits, interaction testing, and E2E flows. Works with any localhost dev server, Storybook, or live URL."
argument-hint: "URL (optional, auto-detected from running dev server), route or page name to focus on, or 'before' to capture baseline screenshots"
---

# Check Quality Assurance

Run comprehensive UI and UX quality checks using `chrome-devtools-cli` for everything:
visual inspection, screenshots, Lighthouse audits, interaction testing, and E2E flow
verification. The skill auto-discovers routes, detects the dev server, and generates
a QA report with screenshots as evidence.

Invoke `/chrome-devtools-cli` if you need help with command syntax or flags.

Diagnostic scripts are in `scripts/`. Inject them via `chrome-devtools evaluate_script`
after reading their content -- no manual editing needed, they scan the full page.

## Input

- **URL** (optional): If omitted, the skill auto-detects running dev servers.
- **Mode** (optional): Pass `before` to capture baseline screenshots for later comparison.
  When run without `before` and baseline screenshots already exist, the skill
  automatically enters comparison mode.
- **Focus** (optional): A route path, page name, or component to focus on instead of
  testing all discovered routes.

## Procedure

### 0. Detect Environment and Resolve URL

If no URL was provided, find a running dev server:

```bash
# Check common dev server ports
for port in 3000 3001 5173 5174 4321 8080 8888 6006; do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}" | grep -qE "^[23]"; then
    echo "Dev server found at http://localhost:${port}"
    break
  fi
done
```

If no dev server is running, stop and tell the user to start one.

Detect the project framework from `package.json` dependencies:

| Dependency | Framework | Route source |
|---|---|---|
| `next` | Next.js | `app/` or `pages/` directory |
| `@remix-run/react` | Remix | `app/routes/` directory |
| `vite`, `react-router` | Vite + React Router | Search for `createBrowserRouter` or `<Route` |
| `nuxt` | Nuxt | `pages/` directory |
| `@angular/core` | Angular | `app-routing.module.ts` or `app.routes.ts` |
| `astro` | Astro | `src/pages/` directory |

Set up directories:

```bash
REPO_NAME=$(basename -s .git "$(git remote get-url origin)" 2>/dev/null || basename "$PWD")
QA_DIR=~/.agents/arinhub/qa-reports
SCREENSHOTS_DIR=${QA_DIR}/${REPO_NAME}/screenshots
mkdir -p "${QA_DIR}" "${SCREENSHOTS_DIR}"
```

Detect dark mode support by checking for common indicators:

```bash
# Check for dark mode in Tailwind config, CSS custom properties, or theme providers
grep -rl "darkMode\|dark:\|prefers-color-scheme\|data-theme\|ThemeProvider" \
  --include="*.ts" --include="*.tsx" --include="*.css" --include="*.js" --include="*.jsx" \
  --include="*.json" . | head -5
```

If dark mode support is detected, set `HAS_DARK_MODE=true` to include dark mode
testing in Step 4.

### 1. Route Discovery

Scan the project to build a list of testable routes. Adapt the search to the
detected framework. For a Vite + React project, for example:

```bash
# Find page/route files
find src -name "*.tsx" -o -name "*.jsx" | head -30

# Search for route definitions
grep -rn "path:" src/ --include="*.tsx" --include="*.ts" | head -20
grep -rn "<Route" src/ --include="*.tsx" --include="*.jsx" | head -20
```

For Next.js:
```bash
find app -name "page.tsx" -o -name "page.jsx" 2>/dev/null | head -20
find pages -name "*.tsx" -o -name "*.jsx" 2>/dev/null | grep -v "_app\|_document\|api/" | head -20
```

Build a `ROUTES` list from the discovered files. If a focus argument was provided,
filter to matching routes only. If no routes are discovered, test just the root URL.

**Route prioritization**: When more than 10 routes are discovered, prioritize testing
in this order rather than testing everything:

1. Root / homepage (always first)
2. Routes with dynamic segments (e.g., `/users/:id`) -- test one instance of each pattern
3. Routes with forms or interactive content (settings, checkout, auth pages)
4. Layout-heavy routes (dashboards, listings)
5. Simple content pages last

Cap at 8-10 routes unless the user explicitly asks for full coverage. Mention skipped
routes in the report so nothing is silently ignored.

### 2. Verify Chrome DevTools Connection

```bash
chrome-devtools list_pages
```

If no pages are available:
```bash
chrome-devtools start
```

### 3. Wait for Content and Dismiss Overlays

After navigating to any route throughout this procedure, wait for the page to finish
loading before taking screenshots or running audits. SPAs and SSR-hydrated apps often
show spinners or skeleton screens that disappear once data arrives.

```bash
# Wait for network idle (no pending requests for 500ms)
chrome-devtools wait_for --event networkIdle --timeout 10000
```

After the page settles, check for and dismiss blocking overlays (cookie banners,
newsletter popups, onboarding modals). These interfere with screenshots and interaction
tests:

```bash
# Take a snapshot to identify overlay elements
chrome-devtools take_snapshot --verbose true
# Look for common patterns: cookie consent, modal backdrops, dialog elements
# If found, dismiss by clicking accept/close/dismiss buttons
chrome-devtools click "<dismiss_button_uid>" --includeSnapshot true
```

Common overlay indicators in the a11y snapshot:
- Elements with role `dialog` or `alertdialog`
- Nodes containing "cookie", "consent", "accept", "privacy"
- Fixed-position elements covering a large portion of the viewport

Dismiss overlays once at the start of the session. If they reappear on navigation
(unlikely but possible), dismiss again. Note any dismissed overlays in the report
as informational findings.

### 4. Baseline Mode (if `before` argument)

When the user passes `before`, capture baseline screenshots and exit early.
These will be used for comparison in a subsequent run. Wait for content to load
(Step 3) before capturing each screenshot.

```bash
BASELINE_DIR=${SCREENSHOTS_DIR}/baseline-$(date +%Y%m%d-%H%M%S)
mkdir -p "${BASELINE_DIR}"
```

For each route, at each viewport:
```bash
chrome-devtools navigate_page --url "${URL}"
chrome-devtools resize_page 375 812
chrome-devtools take_screenshot --filePath "${BASELINE_DIR}/mobile-${ROUTE_SLUG}.png"
chrome-devtools resize_page 768 1024
chrome-devtools take_screenshot --filePath "${BASELINE_DIR}/tablet-${ROUTE_SLUG}.png"
chrome-devtools resize_page 1280 800
chrome-devtools take_screenshot --filePath "${BASELINE_DIR}/desktop-${ROUTE_SLUG}.png"
```

Save the baseline directory path:
```bash
echo "${BASELINE_DIR}" > "${SCREENSHOTS_DIR}/latest-baseline.txt"
```

Report the baseline path to the user and exit. The full QA audit happens on the next run.

### 5. UI Visual QA

For each discovered route (respecting the priority order from Step 1):

#### 5a. Navigate and Snapshot

```bash
chrome-devtools navigate_page --url "${ROUTE_URL}"
chrome-devtools wait_for --event networkIdle --timeout 10000
chrome-devtools take_snapshot --verbose true
```

Review the a11y snapshot for structural issues:
- Missing heading hierarchy (h1 followed by h3, skipping h2)
- Images without alt text (look for `img` nodes without accessible names)
- Empty landmark regions
- Duplicate IDs

#### 5b. Multi-Viewport Screenshots

Capture at three breakpoints and check for layout issues at each:

```bash
# Mobile
chrome-devtools resize_page 375 812
chrome-devtools take_screenshot --filePath "${SCREENSHOTS_DIR}/current-mobile-${ROUTE_SLUG}.png"
chrome-devtools take_snapshot --verbose true

# Tablet
chrome-devtools resize_page 768 1024
chrome-devtools take_screenshot --filePath "${SCREENSHOTS_DIR}/current-tablet-${ROUTE_SLUG}.png"

# Desktop
chrome-devtools resize_page 1280 800
chrome-devtools take_screenshot --filePath "${SCREENSHOTS_DIR}/current-desktop-${ROUTE_SLUG}.png"
```

At each viewport, review the snapshot for responsive issues:
- Elements overflowing the viewport (horizontal scroll)
- Text too small to read on mobile (< 12px)
- Touch targets too small on mobile (< 44x44px)
- Content hidden unintentionally

#### 5c. Lighthouse Audit

```bash
chrome-devtools lighthouse_audit
```

Extract scores for: Performance, Accessibility, Best Practices, SEO.
Record any failing audits (score < 90) with their descriptions.

#### 5d. Start Performance Trace

Start the trace after screenshots and Lighthouse are done -- those involve
viewport resizes and Lighthouse's own page manipulation that would pollute
the trace. From this point on, the trace captures script injections, clicks,
hovers, and form fills through Steps 5e-5f and 6.

```bash
chrome-devtools performance_start_trace --filePath /tmp/qa-trace-${ROUTE_SLUG}.json
```

#### 5e. Visual Audit Script

Read `scripts/visual-audit.js` and inject it:

```bash
chrome-devtools evaluate_script "<visual-audit.js content>"
```

The script returns a JSON array of issues found (broken images, text overflow,
elements outside viewport, empty visible containers). Record all findings.

#### 5f. Console and Network Errors

```bash
chrome-devtools list_console_messages --types error,warning --pageSize 50
chrome-devtools list_network_requests
```

From network requests, identify:
- Failed requests (4xx, 5xx status codes)
- Mixed content warnings (HTTP resources on HTTPS page)
- Missing resources (404s)
- Slow requests (> 3s response time)

#### 5g. Dark Mode Testing (if detected)

If `HAS_DARK_MODE=true` (detected in Step 0), test the current route in dark mode
after completing the light-mode checks above. This catches color contrast failures,
invisible text on dark backgrounds, images without transparent backgrounds clashing
with dark surfaces, and hardcoded colors that ignore theme variables.

```bash
# Switch to dark color scheme
chrome-devtools emulate --colorScheme dark

# Wait for theme transition to settle
chrome-devtools wait_for --event networkIdle --timeout 3000

# Screenshot at desktop viewport (one viewport is enough for theme checks)
chrome-devtools take_screenshot --filePath "${SCREENSHOTS_DIR}/current-dark-${ROUTE_SLUG}.png"

# Run the visual audit again in dark mode -- different issues surface
chrome-devtools evaluate_script "<visual-audit.js content>"
```

Tag any dark-mode-specific findings with `[dark]` in the report. Common dark mode issues:
- Text with hardcoded dark colors becoming invisible on dark backgrounds
- Box shadows that look wrong (too harsh or invisible)
- Images/icons without dark-mode variants blending into the background
- Focus rings or outlines that lose contrast

```bash
# Restore light mode before moving to the next route
chrome-devtools emulate --colorScheme light
```

Skip dark mode testing if the app has no dark mode support -- false positives from
forcing dark scheme on a light-only app are not useful.

### 6. UX Interaction QA

#### 6a. Interactive Elements Audit

Read `scripts/interactive-audit.js` and inject it:

```bash
chrome-devtools evaluate_script "<interactive-audit.js content>"
```

The script scans all interactive elements (buttons, links, inputs, selects) and
checks: visibility, accessible label, minimum touch target size, pointer-events
not disabled, and tabindex reachability. It returns a categorized issue list.

#### 6b. Interaction Spot-Checks

Pick 3-5 key interactive elements from the a11y snapshot (primary buttons,
navigation links, form inputs) and verify they respond to interaction:

```bash
# Click a primary button
chrome-devtools click "<uid>" --includeSnapshot true
# Verify state changed (new content, navigation, modal opened)

# Hover a navigation item
chrome-devtools hover "<uid>" --includeSnapshot true
# Verify hover state appears (dropdown, tooltip, style change)
```

#### 6c. Form Behavior (if forms exist)

If the page contains form elements, test basic form behavior:

```bash
# Fill an input
chrome-devtools click "<input_uid>" --includeSnapshot true
chrome-devtools type_text "test@example.com"

# Submit with empty required fields (validation check)
chrome-devtools click "<submit_uid>" --includeSnapshot true
# Verify validation messages appear
```

### 7. Stop and Analyze Performance Trace

The trace has been running since Step 5d, capturing visual audit script injection,
console/network checks, clicks, hovers, and form fills -- the real interaction
exercise without screenshot/Lighthouse noise. Stop and analyze it now:

```bash
chrome-devtools performance_stop_trace --filePath /tmp/qa-trace-${ROUTE_SLUG}.json
chrome-devtools performance_analyze_insight --filePath /tmp/qa-trace-${ROUTE_SLUG}.json
```

Look for:
- **Long tasks** (> 50ms): Block the main thread and cause jank
- **Layout thrashing**: Forced reflows from interleaved read/write DOM operations
- **Excessive paint regions**: Areas repainting when they should not be
- **Long frames** (> 16ms): Cause visible frame drops
- **Large layout shifts**: Elements moving after initial render (CLS contributors)

Record findings with severity:
- Long tasks > 200ms: critical
- Long tasks 50-200ms or layout thrashing: warning
- Minor paint issues: info

### 8. E2E Smoke Test

Multi-step flow testing to verify pages work end-to-end.

#### 8a. Navigation Flow

```bash
# Start from homepage
chrome-devtools navigate_page --url "${BASE_URL}"
chrome-devtools take_snapshot --verbose true

# Identify navigation links from the a11y snapshot
# Click through main navigation items using their UIDs
chrome-devtools click "<nav_link_uid>" --includeSnapshot true
# Verify page changed (snapshot shows different content)

# Test back navigation
chrome-devtools navigate_page --url "back"
chrome-devtools take_snapshot --verbose true
# Verify returned to previous page
```

#### 8b. Key User Flows

Identify the primary user flow from the route structure (e.g., homepage ->
listing -> detail, or dashboard -> settings). Navigate through it:

```bash
chrome-devtools navigate_page --url "${BASE_URL}"
chrome-devtools take_snapshot --verbose true

# Navigate to first discovered sub-route via link click
chrome-devtools click "<link_uid>" --includeSnapshot true

# Continue deeper if more routes exist
chrome-devtools click "<next_link_uid>" --includeSnapshot true
```

At each step, verify:
- Page loads without errors: `chrome-devtools list_console_messages --types error`
- Content is visible (snapshot shows meaningful content, not blank or stuck spinner)
- Navigation is working (URL or content changed)

#### 8c. State Persistence

Test that page state survives reload:

```bash
# If on a page with filters/selections, interact with one
chrome-devtools click "<filter_uid>" --includeSnapshot true

# Reload the page
chrome-devtools navigate_page --url "reload"
chrome-devtools take_snapshot --verbose true
# Compare: did the state persist (URL params, visible selections)?
```

### 9. Resilience / Break Testing

Follow the procedure in [resilience-testing.md](references/resilience-testing.md).
Sub-steps are labeled 9a through 9g in the report and procedure.

### 10. Before/After Comparison

Check if baseline screenshots exist:

```bash
if [ -f "${SCREENSHOTS_DIR}/latest-baseline.txt" ]; then
  BASELINE_DIR=$(cat "${SCREENSHOTS_DIR}/latest-baseline.txt")
fi
```

If a baseline exists, compare current screenshots against it. For each pair:

1. Read both screenshots (baseline and current)
2. Note visible differences: layout shifts, missing elements, color changes,
   spacing differences, new/removed content
3. Classify each difference as:
   - **Intentional**: Matches expected refactoring changes
   - **Regression**: Unexpected visual change that looks like a bug
   - **Ambiguous**: Needs user judgment

Include both screenshot paths in the report so the user can view them.

### 11. Generate QA Report

Compile all findings into a report file. Read the format from
[report-format.md](references/report-format.md).

```bash
REPORT_FILE=${QA_DIR}/qa-report-${REPO_NAME}-$(date +%Y%m%d-%H%M%S).md
```

Write the report following the template, then present the report path and a
summary to the user:

- Total issues by severity (critical, warning, info)
- Lighthouse scores
- E2E pass/fail count
- Visual regressions (if comparison mode)
- Screenshot paths for evidence

## Error Handling

- **No dev server running**: Stop and ask the user to start one. Suggest the
  framework-appropriate command (`npm run dev`, `npx storybook`, etc.).
- **Chrome DevTools connection fails**: Run `chrome-devtools start` and retry.
- **Route discovery finds nothing**: Test only the root URL.
- **Lighthouse times out**: Report timeout, continue with other checks.
- **Page requires authentication**: If a login page is detected (form with
  password field), note it in the report and test only public routes.

## Important Notes

- Prefer `take_snapshot` over `take_screenshot` for analysis. Snapshots provide
  structured a11y data; screenshots are evidence for the report.
- The visual-audit and interactive-audit scripts return JSON -- parse the results,
  don't just dump raw output into the report.
- When testing responsive layouts, always resize BEFORE taking screenshots.
  The order matters because some CSS transitions animate on resize.
- For Storybook URLs, use the iframe path (`/iframe.html?id=...`) to avoid
  Storybook's own UI interfering with audits.
- Console errors from browser extensions or dev tools themselves should be
  filtered out -- focus on application errors only.
- The baseline screenshot mechanism uses a simple file pointer
  (`latest-baseline.txt`). Each `before` run creates a new timestamped directory,
  so old baselines are preserved.
- Use `chrome-devtools navigate_page --url "back"` and `--url "forward"` for
  history navigation, `--url "reload"` for page reload.

## Quick Reference

| Command | Purpose | Key Flags |
|---|---|---|
| `navigate_page --url <url>` | Navigate to URL | `back`, `forward`, `reload` |
| `take_snapshot` | A11y tree with UIDs | `--verbose true` |
| `take_screenshot` | Visual capture | `--filePath`, `--fullPage true`, `--uid` |
| `resize_page <w> <h>` | Change viewport | |
| `evaluate_script "<fn>"` | Inject JS | `--args` |
| `click "<uid>"` | Click element | `--includeSnapshot true`, `--dblClick true` |
| `hover "<uid>"` | Hover element | `--includeSnapshot true` |
| `fill "<uid>" "<value>"` | Fill form field | `--includeSnapshot true` |
| `type_text "<text>"` | Type text | |
| `press_key "<key>"` | Press keyboard key | |
| `lighthouse_audit` | Full Lighthouse run | |
| `list_console_messages` | Console output | `--types error`, `--pageSize` |
| `list_network_requests` | Network activity | |
| `wait_for` | Wait for page event | `--event networkIdle`, `--timeout` |
| `emulate` | Device/network emulation | CPU throttle, geolocation, color scheme |
