---
name: ah-fix-dom-flash
description: "Use this skill to detect and debug DOM flash/flicker bugs using chrome-devtools CLI when using the 'ah' prefix. Use when asked to 'ah fix dom flash'. Also use when elements briefly appear in wrong positions, visual artifacts flash on screen after interactions (drag-drop, transitions, animations), timing races between framework DOM cleanup and React/Vue re-renders cause ghost elements, opacity/transform jump flashes on mount/unmount, portal content outliving its positioning context, or any single-frame visual glitch after a state change."
argument-hint: "URL or page description, suspected element selector or interaction type"
---

# Fix DOM Flash/Flicker Bugs

This skill uses the `chrome-devtools-cli` skill for all browser interactions.
Invoke `/chrome-devtools-cli` if you need help with command syntax or flags.

Diagnostic scripts are in `scripts/`. The flash detector is configurable via
`window.__flashDetectorConfig` -- set it before injecting, no manual script
editing needed.

## Input

- **Page URL or description** (REQUIRED): URL, Storybook story, or page description.
- **Suspected element** (optional): CSS selector, component name, or description of the flashing element.
- **Interaction type** (optional): What triggers the flash -- drag-and-drop, click, hover, keyboard, animation, page-load.

## When to Use

- Element flashes in wrong position after drag-and-drop
- Ghost/duplicate element appears briefly after interaction
- Visual artifact at (0,0), bottom-left, or unexpected position
- Element loses `position: fixed/absolute` while still having content
- Opacity flash: element briefly visible at full opacity before transition starts
- Transform jump: element snaps to wrong position for one frame before animation
- Portal/overlay content flashes when popover/tooltip/dialog closes
- Any flicker that happens for one frame after an interaction or state change

## Procedure

### 1. Verify Chrome DevTools Connection

```bash
chrome-devtools list_pages
```

If no pages are available:

```bash
chrome-devtools start
```

### 2. Navigate and Take Baseline

```bash
chrome-devtools navigate_page --url "http://localhost:6006/iframe.html?id=..."
chrome-devtools take_snapshot --verbose true
chrome-devtools take_screenshot --filePath /tmp/before.png
```

The a11y snapshot returns elements like `uid=6_2 button "Apple"`. These UIDs
are used in subsequent click/hover/drag commands. Prefer `take_snapshot`
over `take_screenshot` for debugging -- snapshots provide structured data.

### 3. Configure and Install Flash Detector

If the user provided a suspected element selector, configure the detector
first. This avoids manual code editing -- the script reads the config at
injection time:

```bash
chrome-devtools evaluate_script "() => { window.__flashDetectorConfig = { selector: '[data-dnd-overlay]' }; return 'configured'; }"
```

Configuration options (all optional):
- `selector` -- CSS selector for suspected elements. Overrides the default overlay selectors.
- `maxDetections` -- Maximum entries to record (default: 50).

Then read `scripts/flash-detector.js` and inject it as-is:

```bash
chrome-devtools evaluate_script "<flash-detector.js content>"
```

Available scripts:

| Script                       | Purpose                                        | Configure via                  |
| ---------------------------- | ---------------------------------------------- | ------------------------------ |
| `flash-detector.js`          | Dual-strategy detector (MutationObserver + rAF)| `window.__flashDetectorConfig` |
| `collect-flash-results.js`   | Collects, deduplicates, and summarizes results  | None                           |
| `lingering-fixed-elements.js`| Scans for leftover fixed/absolute elements      | None                           |

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

Flash bugs are timing-dependent. If the first attempt shows zero detections,
repeat the interaction 2-3 more times *without* re-injecting the detector.
It stays active and accumulates results across multiple interactions.

Note: The detector stays active until you inject `collect-flash-results.js`,
which stops it. If you need another detection round after collecting, you
must re-inject the detector (and optionally the config) before reproducing
again.

### 5. Collect Results

Read `scripts/collect-flash-results.js` and inject it:

```bash
chrome-devtools evaluate_script "<collect-flash-results.js content>"
```

The collector separates results into high-confidence flashes and lower-confidence noise:

```json
{
  "total": 5,
  "flashCount": 2,
  "noiseCount": 3,
  "summary": { "position-lost": 1, "flash": 1, "added": 2, "attr-change": 1 },
  "flashes": [ ... ],
  "noise": [ ... ]
}
```

Focus on the `flashes` array -- these are actual flash bugs. The `noise`
array contains MutationObserver events that may be normal DOM activity;
only investigate these if `flashes` is empty and the user reports a visible
flash.

### 6. Analyze Findings

**High-confidence indicators** (in `flashes`):

| Finding                                 | Meaning                                                |
| --------------------------------------- | ------------------------------------------------------ |
| `type: "position-lost"`                 | Element was fixed/absolute, became static -- FLASH BUG |
| `type: "flash"`, position is `"static"` | Overlay has content without positioning                 |
| `type: "transform-lost"` at (0,0)       | Animation cleared transform before unmount              |

**Lower-confidence indicators** (in `noise`):

| Finding                                 | Meaning                                                |
| --------------------------------------- | ------------------------------------------------------ |
| `type: "added"` with `suspicious: true` | New element at (0,0) or off-viewport -- investigate     |
| `type: "attr-change"` on overlay        | Framework changed attributes -- may be normal           |

If zero flashes after 3 attempts, use a Performance trace:

```bash
chrome-devtools performance_start_trace --filePath /tmp/trace.json
# Reproduce the interaction
chrome-devtools performance_stop_trace --filePath /tmp/trace.json
```

### 7. Inspect Lingering Elements

After the interaction, check for leftover positioned elements:

```bash
chrome-devtools evaluate_script "<lingering-fixed-elements.js content>"
```

This reports both `position: fixed` elements and `position: absolute`
elements with `z-index > 100`. Compare against the page's expected
fixed elements (navbar, toast) to identify ghost leftovers.

### 8. Identify Root Cause

Match findings to a root cause pattern. For detailed patterns and
framework-specific fixes, read `references/root-causes.md`.

Quick reference:

| Pattern | Trigger | Key Signal | Fix Strategy |
| ------- | ------- | ---------- | ------------ |
| Framework cleanup vs React re-render | dnd-kit, Radix, Floating UI | `position-lost` | CSS: hide when positioning attr absent |
| flushSync vs async setState | Mixed sync/async updates | Intermediate state visible | Batch into single render pass |
| Drop animation clearing transform | dnd-kit drop, Framer exit | `transform-lost` at (0,0) | CSS: hide when transform absent |
| Portal outliving positioning context | Popover/tooltip close | `flash` on portal element | CSS: `display: none` when empty |
| Opacity transition initial flash | Mount animations | Element visible before transition | Set `opacity: 0` in CSS, not JS |
| AnimatePresence exit timing | Framer Motion unmount | Ghost during exit animation | `mode="wait"` or `onExitComplete` |
| GSAP timeline vs React unmount | GSAP .kill() timing | Element at default position | `useLayoutEffect` cleanup |
| Suspense/lazy FOUC | Code splitting | Unstyled content flash | Matching Suspense fallback layout |
| Z-index pop-through | Reorder, modal stacking | Element briefly behind another | CSS z-index + `will-change: transform` |

### 9. Verify Fix

After applying a fix, reload and re-run the full detection cycle:

```bash
chrome-devtools navigate_page --url "..."
chrome-devtools take_snapshot --verbose true

# Optionally re-configure
chrome-devtools evaluate_script "() => { window.__flashDetectorConfig = { selector: '...' }; return 'ok'; }"

# Inject detector
chrome-devtools evaluate_script "<flash-detector.js content>"

# Reproduce interaction 2-3 times
# ...

# Collect -- expect zero flashes
chrome-devtools evaluate_script "<collect-flash-results.js content>"

# Visual confirmation
chrome-devtools take_screenshot --filePath /tmp/after-fix.png
```

### 10. Report to User

- **Flash detected**: Yes/No, with count and summary from collector
- **Root cause**: Which pattern matched (reference Step 8 table)
- **Fix applied**: Description of the CSS/code change
- **Verification**: Whether re-run confirmed zero flash detections
- **Screenshots**: Before and after for visual confirmation

## Error Handling

- Chrome DevTools connection fails: run `chrome-devtools start`
- Flash detector fails to inject (CSP): suggest disabling CSP in dev environment
- Zero detections after 3+ attempts: use Performance traces or manual frame-stepping
- Element UID not found: re-take snapshot with `chrome-devtools take_snapshot`
- Script returns undefined: ensure the script is wrapped as an arrow function `() => { ... }`

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
