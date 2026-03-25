---
name: ah-fix-dom-flash
description: "Use this skill to detect and debug DOM flash/flicker bugs using chrome-devtools CLI when using the 'ah' prefix. Use when asked to 'ah fix dom flash'. Also use when elements briefly appear in wrong positions, visual artifacts flash on screen after interactions (drag-drop, transitions, animations), or timing races between framework DOM cleanup and React/Vue re-renders cause ghost elements."
argument-hint: "URL or page description, suspected element selector or interaction type"
---

# Fix DOM Flash/Flicker Bugs

This skill uses the `chrome-devtools-cli` skill for all browser interactions.
Invoke `/chrome-devtools-cli` if you need help with command syntax or flags.

Diagnostic scripts are in the `scripts/` directory. To use them: read the
script file, customize the selector for the specific bug, then pass the
content to `chrome-devtools evaluate_script`.

Detects elements that briefly appear in wrong positions due to timing races between
framework-level DOM manipulation (e.g., @dnd-kit, Framer Motion, GSAP) and React's
async re-render cycle.

## Input

- **Page URL or description** (REQUIRED): The URL, Storybook story where the bug reproduces, or a description of the page (e.g., "Product page", "Drag-and-drop story").
- **Suspected element** (optional): CSS selector, component name, or description of the flashing element (e.g., `[data-dnd-overlay]`, "drag overlay", "tooltip").
- **Interaction type** (optional): What triggers the flash -- drag-and-drop, click, hover, keyboard, or animation.

## When to Use

- Element flashes in wrong position after drag-and-drop
- Ghost/duplicate element appears briefly after interaction
- Visual artifact at (0,0), bottom-left, or unexpected position
- Element loses `position: fixed/absolute` while still having content
- Any "flicker" or "flash" that happens for one frame after an interaction

## Procedure

### 1. Verify Chrome DevTools Connection

Ensure Chrome is running with DevTools protocol enabled.

```bash
chrome-devtools list_pages
```

If no pages are available, start the daemon:

```bash
chrome-devtools start
```

### 2. Navigate and Take Baseline

Navigate to the page or Storybook story where the bug reproduces, then
capture the initial state.

```bash
# Navigate to the page with the bug
chrome-devtools navigate_page --url "http://localhost:6006/iframe.html?id=..."

# Primary inspection tool -- returns structured a11y tree with element UIDs
chrome-devtools take_snapshot --verbose true

# Visual screenshot for baseline reference
chrome-devtools take_screenshot --filePath /tmp/before.png
```

The a11y snapshot returns elements like `uid=6_2 button "Apple"`. These UIDs
are used in subsequent click/hover/drag commands. Always prefer `take_snapshot`
over `take_screenshot` for debugging -- it provides structured, queryable data.

### 3. Install Flash Detector

Before reproducing the bug, inject the detector that catches elements appearing
in wrong positions between frames. This is the critical step.

Read `scripts/flash-detector.js`, customize the `suspects` selector in the rAF
section if the user provided a suspected element, then inject:

```bash
chrome-devtools evaluate_script "<customized flash-detector.js content>"
```

Available scripts in `scripts/`:

| Script                       | Purpose                                       | Selector to Customize       |
| ---------------------------- | --------------------------------------------- | --------------------------- |
| `flash-detector.js`          | Dual-strategy detector (MutationObserver+rAF) | `suspects` selector in rAF  |
| `collect-flash-results.js`   | Collects results and stops the detector        | None                        |
| `lingering-fixed-elements.js`| Scans for leftover fixed-position elements     | None                        |

IMPORTANT: If the user provided a suspected element selector, customize the
`suspects` selector in the rAF loop of `flash-detector.js` to target that
element specifically.

### 4. Reproduce the Interaction

Trigger the bug using the appropriate command:

```bash
# Drag-and-drop
chrome-devtools drag "<src_uid>" "<dst_uid>" --includeSnapshot true

# Click
chrome-devtools click "<uid>" --includeSnapshot true

# Hover
chrome-devtools hover "<uid>" --includeSnapshot true

# Keyboard
chrome-devtools press_key "<key>"
```

### 5. Collect Results

After the interaction, read `scripts/collect-flash-results.js` and inject it:

```bash
chrome-devtools evaluate_script "<collect-flash-results.js content>"
```

Expected output:

```json
{ "count": 3, "detections": [ ... ] }
```

### 6. Analyze Findings

Key indicators in the results:

| Finding                               | Meaning                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `type: "flash"`, `position: "static"` | Element lost fixed/absolute positioning but still has content -- TIMING RACE |
| `rect.y` beyond widget bounds         | Element fell into normal document flow below the component                   |
| `rect.x: 0, rect.y: 0`                | Element snapped to top-left default position                                 |
| `text` contains component content     | Confirms it is the ghost element, not a structural div                       |
| Multiple detections at same `time`    | Single frame where the bug manifests                                         |

If zero detections are found, try reproducing the interaction again or adjust
the detector selector in Step 3. The flash may be too fast for the rAF loop --
consider using a Performance trace instead:

```bash
chrome-devtools performance_start_trace --filePath /tmp/trace.json
# Reproduce the interaction
chrome-devtools performance_stop_trace --filePath /tmp/trace.json
```

### 7. Inspect Current DOM State

After the interaction, check for lingering elements by reading
`scripts/lingering-fixed-elements.js` and injecting it:

```bash
chrome-devtools evaluate_script "<lingering-fixed-elements.js content>"
```

### 8. Identify Root Cause

Match findings against these common root causes:

#### 8a. Framework cleanup vs React re-render race

**Pattern**: Library (e.g., @dnd-kit, Radix) synchronously removes positioning
attributes/styles from an overlay element, but React asynchronously clears
the overlay's children on the next render cycle. For one frame, the element
has content but no positioning.

**Fix**: Hide the element via CSS when the library's attribute is absent:

```css
/* Example for @dnd-kit */
[data-dnd-overlay]:not([data-dnd-dragging]) { display: none; }

/* As Tailwind class */
className="[&:not([data-dnd-dragging])]:hidden"
```

#### 8b. flushSync vs async setState race

**Pattern**: One part of the system uses `flushSync` (synchronous render) while
another uses normal `setState` (async). The sync part completes first, showing
an intermediate state.

**Fix**: Ensure both state changes happen in the same render pass, or hide
the element at the CSS level.

#### 8c. Drop animation clearing transform before unmount

**Pattern**: A drop animation or `dropAnimation: null` config removes
`position: fixed` / `transform` from an overlay before React unmounts it.

**Fix**: Use CSS to hide the overlay when the positioning attribute is removed,
rather than relying on React unmount timing.

#### 8d. Portal/overlay content outliving its positioning context

**Pattern**: A portal renders content outside the component tree. When the
positioning context is removed (e.g., popover closes), the portal content
briefly appears in document flow.

**Fix**: Add `display: none` fallback when the positioning attribute is absent.

### 9. Verify Fix

After applying a fix, re-run Steps 3-5 to confirm zero flash detections:

```bash
# Reload the page
chrome-devtools navigate_page --url "..."

# Take snapshot to get fresh UIDs
chrome-devtools take_snapshot --verbose true

# Re-inject flash detector, reproduce, collect results
chrome-devtools evaluate_script "<flash-detector.js content>"
# ... reproduce interaction ...
chrome-devtools evaluate_script "<collect-flash-results.js content>"
# Expected: { "count": 0, "detections": [] }

# Visual confirmation
chrome-devtools take_screenshot --filePath /tmp/after-fix.png
```

### 10. Report to User

Present findings and resolution:

- **Flash detected**: Yes/No, with count and summary of detections
- **Root cause**: Which pattern from Step 8 matched (or unknown if none matched)
- **Fix applied**: Description of the CSS/code change made
- **Verification**: Whether re-run of detector confirmed zero detections
- **Screenshot**: Before and after screenshots for visual confirmation

## Error Handling

- If Chrome DevTools connection fails, run `chrome-devtools start` to start the daemon
- If the flash detector script fails to inject (e.g., CSP restrictions), inform the user and suggest disabling CSP in the dev environment
- If zero detections after multiple reproduction attempts, suggest using Performance traces or manual frame-stepping instead
- If the interaction tool fails (e.g., element UID not found), re-take a snapshot with `chrome-devtools take_snapshot`

## Important Notes

- Prefer `take_snapshot` over `take_screenshot` for debugging. Snapshots provide structured a11y tree data with UIDs; screenshots are only needed for visual confirmation.
- The flash detector uses both MutationObserver and requestAnimationFrame strategies. MutationObserver catches DOM changes synchronously, while rAF catches visual states between render frames.
- The rAF loop `suspects` selector must be customized for the specific element causing the flash. The default selector targets common overlay/portal patterns.
- Flash bugs are timing-dependent -- they may not reproduce consistently. Run the detection cycle 2-3 times before concluding there is no issue.
- CSS-level fixes (hiding elements when attributes are absent) are preferred over JavaScript fixes because they prevent the flash at the render level rather than cleaning up after it.
- The detector captures up to 20 detections to avoid memory issues. If the bug produces many events (e.g., continuous animation), increase the slice limit or filter by `type`.
- All JavaScript snippets use `chrome-devtools evaluate_script`. The function must be an arrow function returning a JSON-serializable value.
- Selectors in script files are placeholders -- customize them for the specific bug before injecting.

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
| `press_key "<key>"`         | Press keyboard key  |                                              |
| `performance_start_trace`   | Start perf trace    | `--filePath`                                |
| `performance_stop_trace`    | Stop perf trace     | `--filePath`                                |
