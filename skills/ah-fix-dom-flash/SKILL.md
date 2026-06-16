---
name: ah-fix-dom-flash
description: "Use this skill to detect and debug DOM flash/flicker bugs using agent-browser CLI when using the 'ah' prefix. Use when asked to 'ah fix dom flash'. Also use when elements briefly appear in wrong positions, visual artifacts flash on screen after interactions (drag-drop, transitions, animations), timing races between framework DOM cleanup and React/Vue re-renders cause ghost elements, opacity/transform jump flashes on mount/unmount, portal content outliving its positioning context, or any single-frame visual glitch after a state change."
argument-hint: "URL or page description, suspected element selector or interaction type"
---

# Fix DOM Flash/Flicker Bugs

This skill uses the `agent-browser` skill for all browser interactions.
Load the `agent-browser` skill (`agent-browser skills get core`) for help with command syntax or flags.

Diagnostic scripts are in `scripts/`. The flash detector is configurable via
`window.__flashDetectorConfig` -- set it before injecting; no manual script
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
- Any flicker for one frame after an interaction or state change

## Procedure

### 1. Verify Browser Connection

```bash
agent-browser tab
```

If the browser does not connect (it auto-starts on first use):

```bash
agent-browser doctor
```

### 2. Navigate and Take Baseline

```bash
agent-browser open "http://localhost:6006/iframe.html?id=..."
agent-browser snapshot -i
agent-browser screenshot /tmp/before.png
```

The a11y snapshot returns elements with refs like `@e1 button "Apple"`. These
refs are used in subsequent click/hover/drag commands and go stale after a page
change -- re-snapshot when that happens. Prefer `snapshot -i`
over `screenshot` for debugging -- snapshots provide structured data.

### 3. Configure and Install Flash Detector

If the user provided a suspected element selector, configure the detector
first. This avoids manual code editing -- the script reads the config at
injection time:

```bash
agent-browser eval "window.__flashDetectorConfig = { selector: '[data-dnd-overlay]' }; 'configured'"
```

Configuration options (all optional):
- `selector` -- CSS selector for suspected elements. Overrides the default overlay selectors.
- `maxDetections` -- Maximum entries to record (default: 50).

Then read `scripts/flash-detector.js` and inject it as-is:

```bash
{ printf '('; cat scripts/flash-detector.js; printf ')()'; } | agent-browser eval --stdin
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
agent-browser drag @e1 @e2

# Click
agent-browser click @e3
agent-browser snapshot -i

# Hover
agent-browser hover @e3

# Keyboard
agent-browser press <key>
```

Flash bugs are timing-dependent. If the first attempt shows zero detections,
repeat the interaction 2-3 more times *without* re-injecting the detector.
It stays active and accumulates results across multiple interactions.

Note: The detector stays active until you inject `collect-flash-results.js`,
which stops it. For another detection round after collecting, re-inject the
detector (and optionally the config) before reproducing again.

### 5. Collect Results

Read `scripts/collect-flash-results.js` and inject it:

```bash
{ printf '('; cat scripts/collect-flash-results.js; printf ')()'; } | agent-browser eval --stdin
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
investigate these only if `flashes` is empty and the user reports a visible
flash.

### 6. Analyze Findings

**High-confidence indicators** (in `flashes`):

| Finding                                 | Meaning                                                |
| --------------------------------------- | ------------------------------------------------------ |
| `type: "position-lost"`                 | Element was fixed/absolute, became static -- FLASH BUG |
| `type: "flash"`, position is `"static"` | Overlay has content without positioning                 |
| `type: "transform-lost"` at (0,0)       | Animation cleared transform before unmount             |

**Lower-confidence indicators** (in `noise`):

| Finding                                 | Meaning                                                |
| --------------------------------------- | ------------------------------------------------------ |
| `type: "added"` with `suspicious: true` | New element at (0,0) or off-viewport -- investigate     |
| `type: "attr-change"` on overlay        | Framework changed attributes -- may be normal           |

If zero flashes after 3 attempts, use a Performance trace:

```bash
agent-browser trace start
# Reproduce the interaction
agent-browser trace stop /tmp/trace.json
```

### 7. Inspect Lingering Elements

After the interaction, check for leftover positioned elements:

```bash
{ printf '('; cat scripts/lingering-fixed-elements.js; printf ')()'; } | agent-browser eval --stdin
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
agent-browser open "..."
agent-browser snapshot -i

# Optionally re-configure
agent-browser eval "window.__flashDetectorConfig = { selector: '...' }; 'ok'"

# Inject detector
{ printf '('; cat scripts/flash-detector.js; printf ')()'; } | agent-browser eval --stdin

# Reproduce interaction 2-3 times
# ...

# Collect -- expect zero flashes
{ printf '('; cat scripts/collect-flash-results.js; printf ')()'; } | agent-browser eval --stdin

# Visual confirmation
agent-browser screenshot /tmp/after-fix.png
```

### 10. Report to User

- **Flash detected**: Yes/No, with count and summary from collector
- **Root cause**: Which pattern matched (reference Step 8 table)
- **Fix applied**: Description of the CSS/code change
- **Verification**: Whether re-run confirmed zero flash detections
- **Screenshots**: Before and after for visual confirmation

## Error Handling

- Browser connection fails: run `agent-browser doctor`
- Flash detector fails to inject (CSP): suggest disabling CSP in dev environment
- Zero detections after 3+ attempts: use Performance traces or manual frame-stepping
- Element ref not found (stale after page change): re-take snapshot with `agent-browser snapshot -i`
- Script returns undefined: ensure the script is wrapped as an arrow function `() => { ... }`

## Quick Reference

For the full agent-browser command list and flags, load the `agent-browser` skill (`agent-browser skills get core`).
