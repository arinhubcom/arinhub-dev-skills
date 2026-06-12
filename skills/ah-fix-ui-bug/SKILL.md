---
name: ah-fix-ui-bug
description: "Use this skill to debug and fix UI bugs in web apps when using the 'ah' prefix. Use when asked to 'ah fix ui bug'. Also use when elements are at wrong positions, animations land at wrong spots, layout shifts occur, elements overflow containers, buttons/chips/overlays are mispositioned, z-index layering is wrong, flex/grid alignment is off, text is truncated or overflowing, hover states get stuck, scroll jumps occur, or persistent visual regressions appear. Uses chrome-devtools CLI to navigate pages, inspect elements, inject diagnostic scripts, take screenshots, and analyze DOM mutations. Works with Storybook, localhost dev servers, or any browser page. For single-frame flash/flicker timing races, prefer ah-fix-dom-flash instead."
argument-hint: "URL or page description, element selector or interaction that triggers the bug"
---

# Fix UI Bug with Chrome DevTools CLI

Uses `chrome-devtools-cli` skill for all browser interactions.
Invoke `/chrome-devtools-cli` for command syntax or flags.

Diagnostic scripts in `scripts/`. To use: read script file, customize
selector for the bug, pass content to `chrome-devtools evaluate_script`.

## Input

- **Page URL or description** (REQUIRED): URL, Storybook story, or page description where bug reproduces (e.g., `http://localhost:6006/iframe.html?id=...`, "Settings page").
- **Suspected element** (optional): CSS selector, component name, or description (e.g., `.save-btn`, "save button overlay").
- **Interaction type** (optional): What triggers bug -- click, hover, drag, scroll, resize, animation.

## Procedure

### 0. Verify Chrome DevTools Connection

Ensure Chrome running with DevTools protocol enabled.

```bash
chrome-devtools list_pages
```

No pages available? Start daemon:

```bash
chrome-devtools start
```

### 1. Navigate and Snapshot

Orient -- see page contents, identify element UIDs.

```bash
# Navigate to the page with the bug
chrome-devtools navigate_page --url "http://localhost:6006/iframe.html?id=..."

# Primary inspection tool -- returns structured a11y tree with element UIDs
chrome-devtools take_snapshot --verbose true

# Visual screenshot only when you need a visual reference
chrome-devtools take_screenshot --filePath /tmp/before.png
```

a11y snapshot returns elements like `uid=6_2 button "Apple"`. UIDs used in
subsequent click/hover commands. Always prefer `take_snapshot` over
`take_screenshot` for debugging -- structured, queryable data.

For Storybook, use iframe URL (`/iframe.html?id=...`) to avoid Storybook's
own UI interfering with snapshots.

### 2. Triage

Before instrumenting, classify bug to choose right diagnostics.
Match primary symptom to decide which scripts to inject in Step 3:

| Symptom                                    | Category          | Scripts to Inject                                    |
| ------------------------------------------ | ----------------- | ---------------------------------------------------- |
| Element offset from expected position      | Containing block  | `ancestor-css-check.js` + `position-tracking.js`     |
| Element shifts after click / state change  | Layout shift      | `layout-shift-detection.js` + `position-tracking.js` |
| Animation or transition ends at wrong spot | Animation         | `animation-logging.js` + `position-tracking.js`      |
| Elements overlap or wrong layer order      | Z-index           | `stacking-context-inspector.js`                      |
| Flex/grid items misaligned or wrong size   | Flex/Grid         | `flex-grid-inspector.js`                             |
| Text clipped, overflowing, or truncated    | Overflow          | `computed-styles-dump.js`                            |
| Element invisible when it should show      | Visibility        | `computed-styles-dump.js`                            |
| Hover/focus state stuck after interaction  | Interaction state | `attribute-mutation-observer.js`                     |
| Layout breaks at certain viewport widths   | Responsive        | `computed-styles-dump.js` + `resize_page`            |
| Scroll jumps or content shifts on scroll   | Scroll            | `layout-shift-detection.js` + `scroll-tracking.js`   |
| Sticky element stops sticking              | Sticky            | `computed-styles-dump.js` on element + ancestors      |
| Click/hover passes through element         | Pointer events    | `computed-styles-dump.js`                            |

Unsure? Start with `computed-styles-dump.js` and `position-tracking.js` --
broadest range of issues.

### 3. Instrument the Page

Read recommended script file(s) from `scripts/`, customize selector
(replace `.target-element`, `.flex-container`, etc. with actual CSS selector
for bugged element), inject via `chrome-devtools evaluate_script`.

Available scripts in `scripts/`:

| Script                           | Purpose                                             | Selector to Customize      |
| -------------------------------- | --------------------------------------------------- | -------------------------- |
| `computed-styles-dump.js`        | Dumps key computed CSS properties and bounding rect | `.target-element`          |
| `layout-shift-detection.js`      | Installs PerformanceObserver for CLS detection      | None (observes all shifts) |
| `position-tracking.js`           | Tracks element positions every animation frame      | `.target-element`          |
| `ancestor-css-check.js`          | Finds ancestors creating containing blocks          | `.target-element`          |
| `stacking-context-inspector.js`  | Maps stacking contexts in ancestor chain            | `.target-element`          |
| `flex-grid-inspector.js`         | Inspects flex/grid container and children sizing    | `.flex-container`          |
| `attribute-mutation-observer.js` | Watches attribute/class/style changes               | `.target-element`          |
| `animation-logging.js`           | Patches `Element.animate` to log parameters         | None (patches globally)    |
| `persistent-overlay.js`          | On-screen real-time diagnostic monitor              | `.target-element`          |
| `visual-position-marker.js`      | Drops a red dot at coordinates (pass `--args x y`)  | None (uses args)           |
| `scroll-tracking.js`             | Monitors scroll position changes                    | `.scroll-container`        |
| `viewport-responsive-check.js`   | Inspects container and children at current viewport | `.responsive-container`    |

Example workflow:

```bash
# 1. Read the script
# 2. Customize selector: change '.target-element' to '.my-tooltip'
# 3. Inject the customized script
chrome-devtools evaluate_script "() => {
  let el = document.querySelector('.my-tooltip');
  ...rest of script content...
}"
```

#### Script Usage Notes

**animation-logging.js** -- Patches global `HTMLElement.prototype.animate`,
no selector needed. Assumes object-of-arrays keyframe format
(`{transform: ['...', '...']}`). Adjust script if code uses
array-of-objects format. Read logged animations via:

```bash
chrome-devtools list_console_messages --pageSize 20 --types log
```

**persistent-overlay.js** -- Use when automated clicks don't reproduce bug
(some libraries like dnd-kit's PointerSensor check `event.isPrimary` on synthetic
events). Inject it, then ask user to interact manually in browser. After
user interacts, read collected data and take screenshot.

**visual-position-marker.js** -- Pass coordinates as args. Dot auto-removes
after 3 seconds:

```bash
chrome-devtools evaluate_script "<script content>" --args 200 150
```

**scroll-tracking.js** -- Read results after interaction:

```bash
chrome-devtools evaluate_script "() => JSON.stringify(window.__scrollLog)"
```

#### Performance Traces

Use Chrome's built-in performance profiling when other scripts don't capture
the issue (happens at compositor/paint level):

```bash
# Start recording before the interaction
chrome-devtools performance_start_trace --filePath /tmp/trace.json

# Reproduce the bug (click, drag, scroll, etc.)
chrome-devtools click "<uid>" --includeSnapshot true

# Stop recording
chrome-devtools performance_stop_trace --filePath /tmp/trace.json
```

Trace file loads in Chrome DevTools (Performance tab) or
`chrome://tracing`. Look for:

- Long frames (>16ms) causing visual jank
- Layout thrashing (forced reflows between read/write cycles)
- Paint regions that shouldn't be repainting
- Compositor layer promotion/demotion

#### Viewport / Responsive Testing

Test layout at different viewport widths when bug only appears at certain
screen sizes:

```bash
chrome-devtools resize_page 375 812     # Mobile (iPhone)
chrome-devtools take_screenshot --filePath /tmp/mobile.png

chrome-devtools resize_page 768 1024    # Tablet
chrome-devtools take_screenshot --filePath /tmp/tablet.png

chrome-devtools resize_page 1280 800    # Desktop
chrome-devtools take_screenshot --filePath /tmp/desktop.png

chrome-devtools resize_page 1920 1080   # Large desktop
chrome-devtools take_screenshot --filePath /tmp/large-desktop.png
```

Between resizes, run `scripts/computed-styles-dump.js` on problematic element
to see which CSS properties change at each breakpoint. For container queries,
use `scripts/viewport-responsive-check.js` after customizing the selector.

### 4. Interact and Capture

Reproduce bug while instrumentation active.

```bash
# Click elements by UID (from take_snapshot) -- use --includeSnapshot to get
# updated a11y tree immediately after the click
chrome-devtools click "<uid>" --includeSnapshot true

# Take a snapshot after interaction to inspect DOM state changes
chrome-devtools take_snapshot --verbose true

# Take screenshot only when visual confirmation is needed
chrome-devtools take_screenshot --filePath /tmp/after-click.png

# Read injected console logs
chrome-devtools list_console_messages --pageSize 20
chrome-devtools get_console_message <msgid>
```

Read collected data from window globals:

```bash
chrome-devtools evaluate_script "() => JSON.stringify(window.__shifts)"
chrome-devtools evaluate_script "() => JSON.stringify(window.__posLog)"
chrome-devtools evaluate_script "() => JSON.stringify(window.__mutations)"
chrome-devtools evaluate_script "() => JSON.stringify(window.__scrollLog)"
```

Automated clicks don't reproduce bug (some libraries check
`event.isPrimary` on synthetic events)? Use `scripts/persistent-overlay.js`
and ask user to interact manually in browser.

### 5. Diagnose

Analyze collected data to find root cause. Work through data
systematically -- don't jump to conclusions from a single signal.

#### Reading Diagnostic Output

**computed-styles-dump.js** -- Look for mismatches between expected
and computed. Key signals:
- `position: static` on element that should be `fixed` or `absolute`
- `overflow: hidden` when content clipped unexpectedly
- `display: none` or `visibility: hidden` when element should be visible
- `rect` with `w: 0` or `h: 0` = element collapsed
- `transform: none` when animation should be active
- `zIndex: auto` on positioned element needing layering

**position-tracking.js** (`window.__posLog`) -- Look for:
- Sudden jumps (large `from`/`to` deltas in single entry) = layout shift
- Gradual drift (many small changes) = animation or transition issue
- Position snapping back to origin after interaction = containing block problem
- Empty log = element isn't moving (bug may be in initial position, not movement)

**layout-shift-detection.js** (`window.__shifts`) -- Look for:
- `value > 0.1` = significant layout shift
- `sources` array tells which elements moved and their before/after rects
- Shifts immediately after click = likely `display` toggle or content insertion

**ancestor-css-check.js** -- Any results mean containing block exists.
First entry in array is nearest ancestor creating the block --
usually the one to fix.

**stacking-context-inspector.js** -- Read bottom-to-top (document root first).
Element's effective z-index determined by its nearest stacking context
ancestor, not its own z-index value. If two elements have different stacking
context parents, compare those parents' z-index values.

**flex-grid-inspector.js** -- Look for:
- `flexShrink: "1"` + `minWidth: "auto"` = item won't shrink below content
- `flexBasis: "auto"` when equal sizing expected = use `0`
- Children `width` sum exceeding container width = overflow

**attribute-mutation-observer.js** (`window.__mutations`) -- Look for:
- Class additions persisting after interaction ends = stuck state
- Style attribute changing rapidly = JS fighting CSS transitions
- `position` changing from `fixed` to `static` = framework cleanup race

#### When First Hypothesis is Wrong

If triage category from Step 2 doesn't match data:
1. Run `computed-styles-dump.js` on element -- covers broadest range
2. Run `ancestor-css-check.js` -- containing block issues masquerade as many
   different symptoms
3. Compare element's `rect` position with its CSS `top`/`left` values --
   large discrepancy points to containing block or transform offset
4. Check PARENT elements, not just the target -- bug is often one level up

#### Common Root Causes

For symptom-to-cause lookup table and detailed guides on containing
blocks (`position:fixed`), z-index/stacking contexts, sticky positioning, and
flex/grid sizing, read [references/root-causes.md](references/root-causes.md)
when you need to map a diagnosed symptom to its likely cause and fix.

### 6. Find Source Code

Bridge from browser diagnosis to codebase. Goal: find which
source file renders bugged element so you can apply the fix.

**Strategy 1: Data attributes and unique identifiers** (most reliable)

Look for `data-testid`, `data-*`, `id`, or `role` attributes in snapshot.
Unique, map directly to source code:

```bash
grep -r "data-overlay" src/ --include="*.tsx" --include="*.jsx" -l
grep -r 'testId.*"save-btn"' src/ --include="*.tsx" --include="*.jsx" -l
```

**Strategy 2: Text content or aria labels**

Visible text from snapshot maps to JSX or i18n keys:

```bash
grep -r "Save Changes" src/ --include="*.tsx" --include="*.jsx" -l
```

**Strategy 3: CSS class names**

For Tailwind, search exact utility combination. For CSS modules or
styled-components, search class root:

```bash
grep -r "overflow-hidden" src/ --include="*.tsx" --include="*.jsx" -l
grep -r "will-change" src/ --include="*.css" --include="*.tsx" -l
```

**Strategy 4: Component name from React DevTools**

If snapshot shows recognizable component structure, search for
component name directly. Storybook story IDs often contain component
path (e.g., `components-modal--default` maps to `components/Modal`).

**Strategy 5: CSS property causing the bug**

When root cause is a specific CSS property (e.g., `will-change: transform`
on an ancestor), search for that property. Fix often isn't on bugged
element itself but on a parent component:

```bash
grep -r "will-change" src/ --include="*.css" --include="*.tsx" -l
grep -r "overflow-hidden" src/ --include="*.tsx" -l
```

After locating file, apply fix pattern identified in Step 5.

### 7. Verify the Fix

After applying code fix:

1. Reload page: `chrome-devtools navigate_page --url "..."`
2. Take snapshot to get fresh UIDs: `chrome-devtools take_snapshot --verbose true`
3. Re-inject verification scripts (position tracking, computed styles)
4. Repeat interaction: `chrome-devtools click "<uid>" --includeSnapshot true`
5. Take snapshot to confirm DOM state correct: `chrome-devtools take_snapshot --verbose true`
6. Confirm no position diffs, correct computed styles, correct z-index ordering
7. Take final screenshot for visual proof: `chrome-devtools take_screenshot --filePath /tmp/fixed.png`
8. Optionally ask user to verify manually for pointer-event-dependent bugs

### 8. Report to User

Present findings and resolution:

- **Bug reproduced**: Yes/No, with description of visual issue
- **Root cause**: Which pattern from Step 5 matched (or unknown if none matched)
- **Fix applied**: Description of CSS/code change made
- **Verification**: Whether re-run of diagnostics confirmed the fix
- **Screenshot**: Before and after screenshots for visual confirmation

## Error Handling

- Chrome DevTools connection fails? Run `chrome-devtools start` to start daemon
- Diagnostic scripts fail to inject (e.g., CSP restrictions)? Inform user, suggest disabling CSP in dev environment
- Automated clicks don't reproduce bug? Use `scripts/persistent-overlay.js`, ask user to interact manually
- Element UIDs stale after page changes? Re-take snapshot with `chrome-devtools take_snapshot`
- Suspected element can't be found by selector? Use `take_snapshot` to discover correct selector from a11y tree

## Important Notes

- Prefer `take_snapshot` over `take_screenshot` for debugging. Snapshots provide structured a11y tree data with UIDs; screenshots only needed for visual confirmation.
- All JavaScript snippets use `chrome-devtools evaluate_script`. Function must be arrow function returning JSON-serializable value.
- Selectors in script files (`.target-element`, `.flex-container`) are placeholders -- customize them for the specific bug before injecting.
- `position-tracking.js` runs a `requestAnimationFrame` loop continuing until page reload. Intentional for capturing intermittent shifts.
- CSS-level fixes (Portals, containing block escapes) preferred over JavaScript workarounds for positioning bugs.
- For single-frame flash/flicker timing races (element appears for one frame then disappears), use the `ah-fix-dom-flash` skill instead -- it has specialized detectors for that pattern.
- When testing responsive bugs, use `chrome-devtools resize_page <width> <height>` to test multiple viewport sizes without manually resizing browser.

## Quick Reference

For full chrome-devtools command list and flags, invoke `/chrome-devtools-cli`.
