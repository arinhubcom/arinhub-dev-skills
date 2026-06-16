---
name: ah-check-qa
description: "Use this skill to run UI and UX quality assurance checks when using the 'ah' prefix. Use when asked to 'ah check qa'. Also use when the user wants to verify visual correctness, check responsive layout, audit interactive elements, run E2E smoke tests, detect console or network errors, compare before/after screenshots during refactoring, or verify that a page works correctly across viewports. Uses agent-browser CLI for visual inspection, snapshots, Core Web Vitals audits, interaction testing, and E2E flows. Works with any localhost dev server, Storybook, or live URL."
argument-hint: "URL (optional, auto-detected from running dev server), route or page name to focus on, or 'before' to capture baseline screenshots"
---

# Check Quality Assurance

Run UI/UX quality checks via `agent-browser`: visual inspection, screenshots,
Core Web Vitals audits, interaction testing, E2E flow verification. Auto-discovers routes,
detects dev server, generates QA report with screenshots as evidence.

Load the `agent-browser` skill and run `agent-browser skills get core` for command syntax/flags help.

Diagnostic scripts in `scripts/`. Inject by piping their content into
`agent-browser eval --stdin` (wrapped as an IIFE) after reading their content --
no manual editing, they scan full page.

## Input

- **URL** (optional): If omitted, auto-detects running dev servers.
- **Mode** (optional): Pass `before` to capture baseline screenshots for later comparison.
  Without `before` when baselines already exist, auto-enters comparison mode.
- **Focus** (optional): Route path, page name, or component to focus on instead of
  all discovered routes.

## Procedure

### 0. Detect Environment and Resolve URL

If no URL provided, find running dev server:

```bash
# Check common dev server ports
for port in 3000 3001 5173 5174 4321 8080 8888 6006; do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}" | grep -qE "^[23]"; then
    echo "Dev server found at http://localhost:${port}"
    break
  fi
done
```

If no dev server running, stop and tell user to start one.

Detect framework from `package.json` dependencies:

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

Detect dark mode support via common indicators:

```bash
# Check for dark mode in Tailwind config, CSS custom properties, or theme providers
grep -rl "darkMode\|dark:\|prefers-color-scheme\|data-theme\|ThemeProvider" \
  --include="*.ts" --include="*.tsx" --include="*.css" --include="*.js" --include="*.jsx" \
  --include="*.json" . | head -5
```

If dark mode detected, set `HAS_DARK_MODE=true` to include dark mode testing in Step 4.

### 1. Route Discovery

Scan project to build list of testable routes. Adapt search to detected framework.
Vite + React example:

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

Build `ROUTES` list from discovered files. If focus argument provided, filter to
matching routes only. If no routes discovered, test root URL only.

**Route prioritization**: When more than 10 routes discovered, prioritize in this
order rather than testing everything:

1. Root / homepage (always first)
2. Routes with dynamic segments (e.g., `/users/:id`) -- test one instance of each pattern
3. Routes with forms or interactive content (settings, checkout, auth pages)
4. Layout-heavy routes (dashboards, listings)
5. Simple content pages last

Cap at 8-10 routes unless user explicitly asks for full coverage. Mention skipped
routes in report so nothing is silently ignored.

### 2. Verify Browser Connection

```bash
agent-browser tab
```

The browser auto-starts on the first command. If you hit connection problems:
```bash
agent-browser doctor
```

### 3. Wait for Content and Dismiss Overlays

After navigating to any route throughout this procedure, wait for page to finish
loading before screenshots or audits. SPAs and SSR-hydrated apps often show spinners
or skeleton screens that disappear once data arrives.

```bash
# agent-browser open waits for load on navigation; for a standalone settle after
# the page is already open, pause briefly to let pending requests finish.
sleep 2
```

After page settles, check for and dismiss blocking overlays (cookie banners,
newsletter popups, onboarding modals). These interfere with screenshots and
interaction tests:

```bash
# Interactive snapshot here (`-i` exposes @e refs) -- fixed-position/backdrop detail
# helps spot overlays. Elsewhere prefer plain `snapshot` when you only need structure;
# add `-i` when you need actionable element refs, since that output is larger.
agent-browser snapshot -i
# Look for common patterns: cookie consent, modal backdrops, dialog elements
# If found, dismiss by clicking accept/close/dismiss buttons, then re-snapshot
agent-browser click @e3
agent-browser snapshot -i
```

Common overlay indicators in a11y snapshot:
- Elements with role `dialog` or `alertdialog`
- Nodes containing "cookie", "consent", "accept", "privacy"
- Fixed-position elements covering large portion of viewport

Dismiss overlays once at session start. If they reappear on navigation (unlikely
but possible), dismiss again. Note any dismissed overlays in report as informational
findings.

### 4. Baseline Mode (if `before` argument)

Follow procedure in [baseline-mode.md](references/baseline-mode.md).
If this mode active, exit after capturing baselines -- skip steps 5-11.

### 5. UI Visual QA

For each discovered route (respecting priority order from Step 1):

#### 5a. Navigate and Snapshot

```bash
agent-browser open "${ROUTE_URL}"
agent-browser snapshot
```

Review a11y snapshot for structural issues:
- Missing heading hierarchy (h1 followed by h3, skipping h2)
- Images without alt text (look for `img` nodes without accessible names)
- Empty landmark regions
- Duplicate IDs

#### 5b. Multi-Viewport Screenshots

Capture at three breakpoints, check layout issues at each:

```bash
# Mobile
agent-browser set viewport 375 812
agent-browser screenshot "${SCREENSHOTS_DIR}/current-mobile-${ROUTE_SLUG}.png"
agent-browser snapshot

# Tablet
agent-browser set viewport 768 1024
agent-browser screenshot "${SCREENSHOTS_DIR}/current-tablet-${ROUTE_SLUG}.png"

# Desktop
agent-browser set viewport 1280 800
agent-browser screenshot "${SCREENSHOTS_DIR}/current-desktop-${ROUTE_SLUG}.png"
```

At each viewport, review snapshot for responsive issues:
- Elements overflowing viewport (horizontal scroll)
- Text too small to read on mobile (< 12px)
- Touch targets too small on mobile (< 44x44px)
- Content hidden unintentionally

#### 5c. Core Web Vitals Audit

agent-browser has no Lighthouse. Capture Core Web Vitals instead:

```bash
agent-browser vitals "${ROUTE_URL}"
```

Extract metrics: LCP, CLS, TTFB, FCP, INP. Record any that exceed
"good" thresholds (e.g. LCP > 2.5s, CLS > 0.1, INP > 200ms) with descriptions.
Note: Lighthouse-specific category scores (Accessibility, Best Practices, SEO)
are not available via agent-browser -- rely on the snapshot and audit scripts for
accessibility/structure findings.

#### 5d. Start Performance Trace

Start trace after screenshots and the vitals audit are done -- those involve viewport
resizes and page manipulation that would pollute the trace. From here, trace
captures script injections, clicks, hovers, form fills through Steps 5e-5f and 6.

```bash
agent-browser trace start
```

#### 5e. Visual Audit Script

Read `scripts/visual-audit.js` and inject it:

```bash
{ printf '('; cat scripts/visual-audit.js; printf ')()'; } | agent-browser eval --stdin
```

Script returns JSON `{ summary, issues }` (broken images, text overflow, elements
outside viewport, empty visible containers). `summary` has true counts (`total`,
`byType`, `bySeverity`, `truncated`); `issues` capped at 50, sorted severity-first.
Use `summary` for tallies, `issues` for specifics -- record all findings.

#### 5f. Console and Network Errors

```bash
agent-browser console
# Only the failed/slow requests matter below -- a chatty route can flood context,
# so focus on error statuses where supported.
agent-browser network requests
```

From network requests, identify:
- Failed requests (4xx, 5xx status codes)
- Mixed content warnings (HTTP resources on HTTPS page)
- Missing resources (404s)
- Slow requests (> 3s response time)

#### 5g. Dark Mode Testing (if detected)

If `HAS_DARK_MODE=true` (detected in Step 0), test current route in dark mode after
light-mode checks above. Catches color contrast failures, invisible text on dark
backgrounds, images without transparent backgrounds clashing with dark surfaces, and
hardcoded colors that ignore theme variables.

```bash
# Switch to dark color scheme.
# Note: if agent-browser exposes no color-scheme emulation, force it from the page
# by setting the preference (e.g. toggle the app's theme switch via a click, or
# `agent-browser eval "document.documentElement.classList.add('dark')"` /
# set `data-theme="dark"`) to match how the app activates dark mode.
agent-browser eval "document.documentElement.classList.add('dark')"

# Pause to let the theme transition settle
sleep 1

# Screenshot at desktop viewport (one viewport is enough for theme checks)
agent-browser screenshot "${SCREENSHOTS_DIR}/current-dark-${ROUTE_SLUG}.png"

# Run the visual audit again in dark mode -- different issues surface
{ printf '('; cat scripts/visual-audit.js; printf ')()'; } | agent-browser eval --stdin
```

Tag any dark-mode-specific findings with `[dark]` in report. Common dark mode issues:
- Text with hardcoded dark colors becoming invisible on dark backgrounds
- Box shadows that look wrong (too harsh or invisible)
- Images/icons without dark-mode variants blending into background
- Focus rings or outlines that lose contrast

```bash
# Restore light mode before moving to the next route
agent-browser eval "document.documentElement.classList.remove('dark')"
```

Skip dark mode testing if app has no dark mode support -- false positives from
forcing dark scheme on a light-only app are not useful.

### 6. UX Interaction QA

#### 6a. Interactive Elements Audit

Read `scripts/interactive-audit.js` and inject it:

```bash
{ printf '('; cat scripts/interactive-audit.js; printf ')()'; } | agent-browser eval --stdin
```

Script scans all interactive elements (buttons, links, inputs, selects) and checks:
visibility, accessible label, minimum touch target size, pointer-events not disabled,
tabindex reachability. Returns categorized issue list.

#### 6b. Interaction Spot-Checks

Pick 3-5 key interactive elements from the interactive snapshot (primary buttons,
navigation links, form inputs) and verify they respond to interaction. Get element
refs (`@e1`, `@e2`, ...) from `agent-browser snapshot -i`; they go stale after the
page changes, so re-snapshot when that happens:

```bash
# Click a primary button, then re-snapshot to check the result
agent-browser click @e3
agent-browser snapshot -i
# Verify state changed (new content, navigation, modal opened)

# Hover a navigation item
agent-browser hover @e3
agent-browser snapshot -i
# Verify hover state appears (dropdown, tooltip, style change)
```

#### 6c. Form Behavior (if forms exist)

If page contains form elements, test basic form behavior:

```bash
# Fill an input
agent-browser fill @e3 "test@example.com"
agent-browser snapshot -i

# Submit with empty required fields (validation check)
agent-browser click @e5
agent-browser snapshot -i
# Verify validation messages appear
```

### 7. Stop and Analyze Performance Trace

Trace running since Step 5d, capturing visual audit script injection, console/network
checks, clicks, hovers, form fills -- the real interaction exercise without
screenshot/vitals-audit noise. Stop and analyze now:

```bash
agent-browser trace stop /tmp/qa-trace-${ROUTE_SLUG}.json
# Analyze the saved trace for the insights listed below
```

Look for:
- **Long tasks** (> 50ms): Block main thread, cause jank
- **Layout thrashing**: Forced reflows from interleaved read/write DOM operations
- **Excessive paint regions**: Areas repainting when they should not
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
agent-browser open "${BASE_URL}"
agent-browser snapshot -i

# Identify navigation links from the snapshot
# Click through main navigation items using their @e refs, then re-snapshot
agent-browser click @e1
agent-browser snapshot -i
# Verify page changed (snapshot shows different content)

# Test back navigation
agent-browser back
agent-browser snapshot -i
# Verify returned to previous page
```

#### 8b. Key User Flows

Identify primary user flow from route structure (e.g., homepage -> listing -> detail,
or dashboard -> settings). Navigate through it:

```bash
agent-browser open "${BASE_URL}"
agent-browser snapshot -i

# Navigate to first discovered sub-route via link click
agent-browser click @e1
agent-browser snapshot -i

# Continue deeper if more routes exist
agent-browser click @e2
agent-browser snapshot -i
```

At each step, verify:
- Page loads without errors: `agent-browser console`
- Content visible (snapshot shows meaningful content, not blank or stuck spinner)
- Navigation working (URL or content changed)

#### 8c. State Persistence

Test that page state survives reload:

```bash
# If on a page with filters/selections, interact with one
agent-browser click @e1
agent-browser snapshot -i

# Reload the page
agent-browser reload
agent-browser snapshot -i
# Compare: did the state persist (URL params, visible selections)?
```

### 9. Resilience / Break Testing

Follow procedure in [resilience-testing.md](references/resilience-testing.md).
Sub-steps labeled 9a through 9g in report and procedure.

### 10. Before/After Comparison

Check if baseline screenshots exist:

```bash
if [ -f "${SCREENSHOTS_DIR}/latest-baseline.txt" ]; then
  BASELINE_DIR=$(cat "${SCREENSHOTS_DIR}/latest-baseline.txt")
fi
```

If baseline exists, compare current screenshots against it. For each pair:

1. Read both screenshots (baseline and current)
2. Note visible differences: layout shifts, missing elements, color changes,
   spacing differences, new/removed content
3. Classify each difference as:
   - **Intentional**: Matches expected refactoring changes
   - **Regression**: Unexpected visual change that looks like a bug
   - **Ambiguous**: Needs user judgment

Include both screenshot paths in report so user can view them.

### 11. Generate QA Report

Compile all findings into report file. Read format from
[report-format.md](references/report-format.md).

```bash
REPORT_FILE=${QA_DIR}/qa-report-${REPO_NAME}-$(date +%Y%m%d-%H%M%S).md
```

Write report following template, then present report path and summary to user:

- Total issues by severity (critical, warning, info)
- Core Web Vitals (LCP, CLS, INP, FCP, TTFB)
- E2E pass/fail count
- Visual regressions (if comparison mode)
- Screenshot paths for evidence

## Error Handling

- **No dev server running**: Stop and ask user to start one. Suggest
  framework-appropriate command (`npm run dev`, `npx storybook`, etc.).
- **Browser connection fails**: Run `agent-browser doctor` and retry.
- **Route discovery finds nothing**: Test root URL only.
- **Vitals audit times out**: Report timeout, continue with other checks.
- **Page requires authentication**: If login page detected (form with password
  field), note it in report and test only public routes.

## Important Notes

- Prefer `agent-browser snapshot` over `agent-browser screenshot` for analysis.
  Snapshots provide structured a11y data; screenshots are evidence for the report.
- The visual-audit and interactive-audit scripts return JSON -- parse the results,
  don't dump raw output into the report.
- When testing responsive layouts, always resize BEFORE taking screenshots.
  Order matters because some CSS transitions animate on resize.
- For Storybook URLs, use the iframe path (`/iframe.html?id=...`) to avoid
  Storybook's own UI interfering with audits.
- Console errors from browser extensions or dev tools themselves should be
  filtered out -- focus on application errors only.
- The baseline screenshot mechanism uses a simple file pointer
  (`latest-baseline.txt`). Each `before` run creates a new timestamped directory,
  so old baselines are preserved.
- Use `agent-browser back` and `agent-browser forward` for history navigation,
  `agent-browser reload` for page reload.

## Quick Reference

For the full agent-browser command list and flags, load the `agent-browser` skill
and run `agent-browser skills get core`.
