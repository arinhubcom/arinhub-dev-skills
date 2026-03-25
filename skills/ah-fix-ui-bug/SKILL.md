---
name: ah-fix-ui-bug
description: "Use this skill to debug and fix UI bugs in web apps when using the 'ah' prefix. Use when asked to 'ah fix ui bug'. Also use when elements are at wrong positions, animations land at wrong spots, layout shifts occur, elements overflow containers, buttons/chips/overlays are mispositioned, z-index layering is wrong, flex/grid alignment is off, text is truncated or overflowing, hover states get stuck, scroll jumps occur, or persistent visual regressions appear. Uses chrome-devtools CLI to navigate pages, inspect elements, inject diagnostic scripts, take screenshots, and analyze DOM mutations. Works with Storybook, localhost dev servers, or any browser page. For single-frame flash/flicker timing races, prefer ah-fix-dom-flash instead."
argument-hint: "URL or page description, element selector or interaction that triggers the bug"
---

# Fix UI Bug with Chrome DevTools CLI

This skill uses the `chrome-devtools-cli` skill for all browser interactions.
Invoke `/chrome-devtools-cli` if you need help with command syntax or flags.

Diagnostic scripts are in the `scripts/` directory. To use them: read the
script file, customize the selector for the specific bug, then pass the
content to `chrome-devtools evaluate_script`.

## Input

- **Page URL or description** (REQUIRED): The URL, Storybook story, or page description where the bug reproduces (e.g., `http://localhost:6006/iframe.html?id=...`, "Settings page").
- **Suspected element** (optional): CSS selector, component name, or description (e.g., `.save-btn`, "save button overlay").
- **Interaction type** (optional): What triggers the bug -- click, hover, drag, scroll, resize, animation.

## Procedure

### 0. Verify Chrome DevTools Connection

Ensure Chrome is running with DevTools protocol enabled.

```bash
chrome-devtools list_pages
```

If no pages are available, start the daemon:

```bash
chrome-devtools start
```

### 1. Navigate and Snapshot

Get oriented -- see what's on the page and identify element UIDs.

```bash
# Navigate to the page with the bug
chrome-devtools navigate_page --url "http://localhost:6006/iframe.html?id=..."

# Primary inspection tool -- returns structured a11y tree with element UIDs
chrome-devtools take_snapshot --verbose true

# Visual screenshot only when you need a visual reference
chrome-devtools take_screenshot --filePath /tmp/before.png
```

The a11y snapshot returns elements like `uid=6_2 button "Apple"`. These UIDs
are used in subsequent click/hover commands. Always prefer `take_snapshot` over
`take_screenshot` for debugging -- it provides structured, queryable data.

For Storybook, use the iframe URL (`/iframe.html?id=...`) to avoid Storybook's
own UI interfering with snapshots.

### 2. Triage

Before instrumenting, classify the bug to choose the right diagnostics.
Match the primary symptom to decide which scripts to inject in Step 3:

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
| Click/hover passes through element         | Pointer events    | `computed-styles-dump.js`                             |

If unsure, start with `computed-styles-dump.js` and `position-tracking.js` --
they cover the broadest range of issues.

### 3. Instrument the Page

Read the recommended script file(s) from `scripts/`, customize the selector
(replace `.target-element`, `.flex-container`, etc. with the actual CSS selector
for the bugged element), then inject via `chrome-devtools evaluate_script`.

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

**animation-logging.js** -- Patches the global `HTMLElement.prototype.animate`,
no selector needed. Assumes the object-of-arrays keyframe format
(`{transform: ['...', '...']}`). Adjust the script if the code uses the
array-of-objects format. Read logged animations via:

```bash
chrome-devtools list_console_messages --pageSize 20 --types log
```

**persistent-overlay.js** -- Use when automated clicks don't reproduce the bug
(some libraries like dnd-kit's PointerSensor check `event.isPrimary` on synthetic
events). Inject it, then ask the user to interact manually in the browser. After
the user interacts, read collected data and take a screenshot.

**visual-position-marker.js** -- Pass coordinates as args. The dot auto-removes
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

The trace file can be loaded in Chrome DevTools (Performance tab) or
`chrome://tracing`. Look for:

- Long frames (>16ms) causing visual jank
- Layout thrashing (forced reflows between read/write cycles)
- Paint regions that shouldn't be repainting
- Compositor layer promotion/demotion

#### Viewport / Responsive Testing

Test layout at different viewport widths when the bug only appears at certain
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

Between resizes, run `scripts/computed-styles-dump.js` on the problematic element
to see which CSS properties change at each breakpoint. For container queries,
use `scripts/viewport-responsive-check.js` after customizing the selector.

### 4. Interact and Capture

Reproduce the bug while instrumentation is active.

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

If automated clicks don't reproduce the bug (some libraries check
`event.isPrimary` on synthetic events), use `scripts/persistent-overlay.js`
and ask the user to interact manually in the browser.

### 5. Diagnose

Analyze collected data to identify the root cause. Work through the data
systematically -- don't jump to conclusions from a single signal.

#### Reading Diagnostic Output

**computed-styles-dump.js** -- Look for mismatches between what you expect
and what's computed. Key signals:
- `position: static` on an element that should be `fixed` or `absolute`
- `overflow: hidden` when content is clipped unexpectedly
- `display: none` or `visibility: hidden` when element should be visible
- `rect` with `w: 0` or `h: 0` means the element has collapsed
- `transform: none` when an animation should be active
- `zIndex: auto` on a positioned element that needs layering

**position-tracking.js** (`window.__posLog`) -- Look for:
- Sudden jumps (large `from`/`to` deltas in a single entry) = layout shift
- Gradual drift (many small changes) = animation or transition issue
- Position snapping back to origin after interaction = containing block problem
- Empty log = element isn't moving (bug may be in initial position, not movement)

**layout-shift-detection.js** (`window.__shifts`) -- Look for:
- `value > 0.1` = significant layout shift
- `sources` array tells you which elements moved and their before/after rects
- Shifts immediately after click = likely `display` toggle or content insertion

**ancestor-css-check.js** -- Any results mean a containing block exists.
The first entry in the array is the nearest ancestor creating the block --
that's usually the one to fix.

**stacking-context-inspector.js** -- Read bottom-to-top (document root first).
The element's effective z-index is determined by its nearest stacking context
ancestor, not its own z-index value. If two elements have different stacking
context parents, compare those parents' z-index values.

**flex-grid-inspector.js** -- Look for:
- `flexShrink: "1"` + `minWidth: "auto"` = item won't shrink below content
- `flexBasis: "auto"` when equal sizing expected = use `0`
- Children `width` sum exceeding container width = overflow

**attribute-mutation-observer.js** (`window.__mutations`) -- Look for:
- Class additions that persist after interaction ends = stuck state
- Style attribute changing rapidly = JS fighting CSS transitions
- `position` changing from `fixed` to `static` = framework cleanup race

#### When First Hypothesis is Wrong

If the triage category from Step 2 doesn't match the data:
1. Run `computed-styles-dump.js` on the element -- it covers the broadest range
2. Run `ancestor-css-check.js` -- containing block issues masquerade as many
   different symptoms
3. Compare the element's `rect` position with its CSS `top`/`left` values --
   a large discrepancy points to a containing block or transform offset
4. Check PARENT elements, not just the target -- the bug is often one level up

#### Common Root Causes

| Symptom                                                                    | Likely Cause                                                                      | How to Confirm                                                     |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `style.left` differs from `getBoundingClientRect().left` by large constant | Ancestor has `will-change:transform` or `transform` creating new containing block | Run `ancestor-css-check.js`                                        |
| Element shifts position after state change                                 | CSS `transition` + box model change (border/padding)                              | Check mutations for class changes                                  |
| Animation lands at wrong position                                          | `getBoundingClientRect()` called during layout transition                         | Compare rects at capture time vs stable state                      |
| Element disappears during interaction                                      | `overflow:hidden` on ancestor clipping during transform                           | Temporarily remove `overflow:hidden` and test                      |
| Layout shift on click                                                      | `display` change or element insertion affecting flex/grid flow                    | Check layout-shift entries                                         |
| Element behind another despite higher z-index                              | Different stacking contexts -- z-index only competes within the same context      | Run `stacking-context-inspector.js` on both elements               |
| Flex item unexpectedly shrinking or overflowing                            | `flex-shrink: 1` (default) + `min-width: auto` allowing collapse                  | Check `flex-grid-inspector.js` for shrink/min-width                |
| Text truncated without ellipsis                                            | Missing `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`    | Run `computed-styles-dump.js` on text element                      |
| Hover/focus state stuck after mouse leaves                                 | Event listener not cleaning up, or element repositioned under cursor              | Check mutations for lingering class/attribute                      |
| Layout breaks at specific viewport width                                   | Media query breakpoint mismatch or fixed-width ancestor                           | Use `resize_page` at various widths, run `computed-styles-dump.js` |
| Sticky element stops sticking                                              | Ancestor has `overflow: hidden/auto/scroll` breaking sticky containment           | Run `ancestor-css-check.js`, check `overflow` on each ancestor     |
| Click/hover passes through element to one behind                           | `pointer-events: none` on element or ancestor                                     | Run `computed-styles-dump.js`, check `pointerEvents` value         |
| Element correct size but content overflows visually                        | `box-sizing: content-box` (not `border-box`) with padding/border                  | Check `computed-styles-dump.js` for `boxSizing`                    |
| Child elements unclickable inside positioned parent                        | Parent has `pointer-events: none` cascading to children                            | Add `pointer-events: auto` on the clickable child                  |

#### Containing Block Issues (position:fixed)

These CSS properties on ANY ancestor create a new containing block:

- `will-change: transform` (even without an actual transform!)
- `transform: anything-other-than-none`
- `filter: anything-other-than-none`
- `backdrop-filter`
- `contain: paint` or `contain: layout`
- `perspective`

Fix: Use a React Portal (`createPortal`) to render the fixed element on
`document.body`, escaping the transformed ancestor entirely.

#### Z-Index / Stacking Context Issues

Z-index only works between elements in the SAME stacking context. A `z-index: 9999`
inside a stacking context with `z-index: 1` still appears below a sibling
context with `z-index: 2`.

Common accidental stacking context creators:

- `opacity` less than 1
- `transform` other than none
- `filter`, `backdrop-filter`
- `isolation: isolate`
- `will-change` targeting opacity/transform

Fix: Restructure the DOM so both elements share a stacking context,
or use a Portal to escape the nested context.

#### Sticky Positioning Failures

`position: sticky` silently fails when any ancestor between the sticky
element and its scroll container has `overflow: hidden`, `overflow: auto`,
or `overflow: scroll`. The sticky element becomes effectively `relative`.

The `ancestor-css-check.js` script doesn't check overflow by default.
To diagnose, run `computed-styles-dump.js` on each ancestor between the
sticky element and the scrolling container, checking for `overflow` values
other than `visible`.

Fix: Remove the `overflow` property from the offending ancestor, or
restructure the DOM so no clipping ancestor sits between the sticky
element and its scroll container.

#### Flex/Grid Sizing Issues

Common flex pitfalls:

- `min-width: auto` (default) prevents flex items from shrinking below content
  size. Fix: set `min-width: 0` on the flex item.
- `flex-basis: auto` uses content size. Fix: `flex-basis: 0` for equal distribution.
- Missing `overflow: hidden` on flex items causes content to expand beyond the
  flex track. Fix: add `overflow: hidden` or `min-width: 0`.

### 6. Find Source Code

Bridge from browser diagnosis to the codebase. The goal is to find which
source file renders the bugged element so you can apply the fix.

**Strategy 1: Data attributes and unique identifiers** (most reliable)

Look for `data-testid`, `data-*`, `id`, or `role` attributes in the snapshot.
These are unique and map directly to source code:

```bash
grep -r "data-overlay" src/ --include="*.tsx" --include="*.jsx" -l
grep -r 'testId.*"save-btn"' src/ --include="*.tsx" --include="*.jsx" -l
```

**Strategy 2: Text content or aria labels**

Visible text from the snapshot maps to JSX or i18n keys:

```bash
grep -r "Save Changes" src/ --include="*.tsx" --include="*.jsx" -l
```

**Strategy 3: CSS class names**

For Tailwind, search the exact utility combination. For CSS modules or
styled-components, search the class root:

```bash
grep -r "overflow-hidden" src/ --include="*.tsx" --include="*.jsx" -l
grep -r "will-change" src/ --include="*.css" --include="*.tsx" -l
```

**Strategy 4: Component name from React DevTools**

If the snapshot shows a recognizable component structure, search for the
component name directly. Storybook story IDs often contain the component
path (e.g., `components-modal--default` maps to `components/Modal`).

**Strategy 5: CSS property causing the bug**

When the root cause is a specific CSS property (e.g., `will-change: transform`
on an ancestor), search for that property. The fix often isn't on the bugged
element itself but on a parent component:

```bash
grep -r "will-change" src/ --include="*.css" --include="*.tsx" -l
grep -r "overflow-hidden" src/ --include="*.tsx" -l
```

After locating the file, apply the fix pattern identified in Step 5.

### 7. Verify the Fix

After applying a code fix:

1. Reload the page: `chrome-devtools navigate_page --url "..."`
2. Take snapshot to get fresh UIDs: `chrome-devtools take_snapshot --verbose true`
3. Re-inject verification scripts (position tracking, computed styles)
4. Repeat the interaction: `chrome-devtools click "<uid>" --includeSnapshot true`
5. Take snapshot to confirm DOM state is correct: `chrome-devtools take_snapshot --verbose true`
6. Confirm no position diffs, correct computed styles, correct z-index ordering
7. Take final screenshot for visual proof: `chrome-devtools take_screenshot --filePath /tmp/fixed.png`
8. Optionally ask user to verify manually for pointer-event-dependent bugs

### 8. Report to User

Present findings and resolution:

- **Bug reproduced**: Yes/No, with description of the visual issue
- **Root cause**: Which pattern from Step 5 matched (or unknown if none matched)
- **Fix applied**: Description of the CSS/code change made
- **Verification**: Whether re-run of diagnostics confirmed the fix
- **Screenshot**: Before and after screenshots for visual confirmation

## Error Handling

- If Chrome DevTools connection fails, run `chrome-devtools start` to start the daemon
- If diagnostic scripts fail to inject (e.g., CSP restrictions), inform the user and suggest disabling CSP in the dev environment
- If automated clicks don't reproduce the bug, use `scripts/persistent-overlay.js` and ask the user to interact manually
- If element UIDs are stale after page changes, re-take a snapshot with `chrome-devtools take_snapshot`
- If the suspected element can't be found by selector, use `take_snapshot` to discover the correct selector from the a11y tree

## Important Notes

- Prefer `take_snapshot` over `take_screenshot` for debugging. Snapshots provide structured a11y tree data with UIDs; screenshots are only needed for visual confirmation.
- All JavaScript snippets use `chrome-devtools evaluate_script`. The function must be an arrow function returning a JSON-serializable value.
- Selectors in script files (`.target-element`, `.flex-container`) are placeholders -- customize them for the specific bug before injecting.
- The `position-tracking.js` script runs a `requestAnimationFrame` loop that continues until page reload. This is intentional for capturing intermittent shifts.
- CSS-level fixes (Portals, containing block escapes) are preferred over JavaScript workarounds for positioning bugs.
- For single-frame flash/flicker timing races (element appears for one frame then disappears), use the `ah-fix-dom-flash` skill instead -- it has specialized detectors for that pattern.
- When testing responsive bugs, use `chrome-devtools resize_page <width> <height>` to test multiple viewport sizes without manually resizing the browser.

## Quick Reference

| Command                     | Purpose             | Key Flags                                   |
| --------------------------- | ------------------- | ------------------------------------------- |
| `navigate_page --url <url>` | Go to a URL         | `--timeout`                                 |
| `take_snapshot`             | A11y tree with UIDs | `--verbose true`                            |
| `take_screenshot`           | Visual capture      | `--filePath`, `--fullPage true`, `--uid`    |
| `click "<uid>"`             | Click element       | `--includeSnapshot true`, `--dblClick true` |
| `hover "<uid>"`             | Hover element       | `--includeSnapshot true`                    |
| `drag "<src>" "<dst>"`      | Drag element        | `--includeSnapshot true`                    |
| `evaluate_script "<fn>"`    | Run JS in page      | `--args`                                    |
| `list_console_messages`     | List console logs   | `--pageSize`, `--types`                     |
| `get_console_message <id>`  | Read one log entry  |                                             |
| `resize_page <w> <h>`       | Change viewport     |                                             |
| `performance_start_trace`   | Start perf trace    | `--filePath`                                |
| `performance_stop_trace`    | Stop perf trace     | `--filePath`                                |
