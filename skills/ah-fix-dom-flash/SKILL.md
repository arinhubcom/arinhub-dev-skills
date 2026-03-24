---
name: ah-fix-dom-flash
description: "Use this skill to detect and debug DOM flash/flicker bugs using Chrome DevTools MCP when using the 'ah' prefix. Use when asked to 'ah fix dom flash'. Also use when elements briefly appear in wrong positions, visual artifacts flash on screen after interactions (drag-drop, transitions, animations), or timing races between framework DOM cleanup and React/Vue re-renders cause ghost elements."
argument-hint: "URL or page description, suspected element selector or interaction type"
---

# Fix DOM Flash/Flicker Bugs

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

### 1. Identify the Target Page

Navigate to the page or Storybook story where the bug reproduces.

```
Use: mcp__chrome-devtools__list_pages -> mcp__chrome-devtools__select_page -> mcp__chrome-devtools__navigate_page
```

If no pages are available or the browser is not connected, stop and ask the user to ensure Chrome is running with DevTools protocol enabled.

### 2. Take Baseline Screenshot and Snapshot

Before any interaction, capture the initial state.

```
Use: mcp__chrome-devtools__take_snapshot (verbose=true) to get element UIDs
Use: mcp__chrome-devtools__take_screenshot to see visual state
```

### 3. Install Flash Detector

Before reproducing the bug, inject a detector that catches elements appearing
in wrong positions between frames. This is the critical step.

```javascript
// Inject via mcp__chrome-devtools__evaluate_script BEFORE reproducing the interaction
() => {
  window.__flashDetected = [];
  let running = true;

  // Strategy 1: MutationObserver for attribute/style changes
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // Check added nodes
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const el = node;
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);
        if (rect.height > 0 && computed.display !== "none") {
          window.__flashDetected.push({
            type: "added",
            source: "mutation",
            time: performance.now(),
            tag: el.tagName,
            className: (el.className || "").substring(0, 150),
            position: computed.position,
            rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
            text: el.textContent?.substring(0, 60),
          });
        }
      }
      // Check style/attribute changes on fixed/absolute elements
      if (m.type === "attributes" && m.target.nodeType === 1) {
        const el = m.target;
        const computed = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (
          rect.height > 0 &&
          (computed.position === "fixed" || computed.position === "absolute")
        ) {
          window.__flashDetected.push({
            type: "attr-change",
            source: "mutation",
            time: performance.now(),
            attr: m.attributeName,
            tag: el.tagName,
            position: computed.position,
            style: el.getAttribute("style")?.substring(0, 200),
            rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          });
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "style",
      "class",
      "data-dnd-dragging",
      "data-dnd-feedback",
    ],
  });

  window.__stopFlashDetector = () => {
    running = false;
    observer.disconnect();
  };

  // Strategy 2: requestAnimationFrame loop to catch between-render states
  // CUSTOMIZE: adjust the selector and condition for the suspected element
  function checkFrame() {
    if (!running) return;
    // Look for overlay/portal elements that lost positioning but still have content
    const suspects = document.querySelectorAll(
      '[data-dnd-overlay], [data-radix-popper-content-wrapper], [class*="overlay"], [class*="portal"]',
    );
    for (const el of suspects) {
      const computed = window.getComputedStyle(el);
      const hasContent = el.children.length > 0;
      const isPositioned =
        computed.position === "fixed" || computed.position === "absolute";
      const isHidden =
        computed.display === "none" ||
        computed.visibility === "hidden" ||
        computed.opacity === "0";
      const rect = el.getBoundingClientRect();

      if (hasContent && !isPositioned && !isHidden && rect.height > 0) {
        window.__flashDetected.push({
          type: "flash",
          source: "raf",
          time: performance.now(),
          tag: el.tagName,
          position: computed.position,
          display: computed.display,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          text: el.textContent?.substring(0, 60),
          childCount: el.children.length,
        });
      }
    }
    requestAnimationFrame(checkFrame);
  }
  requestAnimationFrame(checkFrame);

  return "Flash detector installed";
};
```

IMPORTANT: If the user provided a suspected element selector, customize the `suspects` selector in the rAF loop to target that element specifically.

### 4. Reproduce the Interaction

Use the appropriate Chrome DevTools MCP tool to trigger the bug:

- **Drag-and-drop**: `mcp__chrome-devtools__drag(from_uid, to_uid)`
- **Click**: `mcp__chrome-devtools__click(uid)`
- **Hover**: `mcp__chrome-devtools__hover(uid)`
- **Keyboard**: `mcp__chrome-devtools__press_key(key)`

### 5. Collect Results

```javascript
// Inject via mcp__chrome-devtools__evaluate_script AFTER the interaction
() => {
  const results = window.__flashDetected || [];
  window.__stopFlashDetector?.();
  return {
    count: results.length,
    detections: results.slice(0, 20),
  };
};
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

If zero detections are found, try reproducing the interaction again or adjust the detector selector in Step 3. The flash may be too fast for the rAF loop -- consider using a Performance trace via `mcp__chrome-devtools__performance_start_trace` and `mcp__chrome-devtools__performance_stop_trace` instead.

### 7. Inspect Current DOM State

After the interaction, check for lingering elements:

```javascript
// Inject via mcp__chrome-devtools__evaluate_script
() => {
  const all = document.querySelectorAll("*");
  const suspects = [];
  for (const el of all) {
    const computed = window.getComputedStyle(el);
    if (computed.position === "fixed" && el.offsetWidth > 2) {
      suspects.push({
        tag: el.tagName,
        className: (el.className || "").substring(0, 100),
        style: (el.getAttribute("style") || "").substring(0, 200),
        rect: el.getBoundingClientRect(),
        text: el.textContent?.substring(0, 60),
        visible: computed.visibility !== "hidden" && computed.opacity !== "0",
      });
    }
  }
  return suspects;
};
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

```javascript
// Expected result after fix:
{ count: 0, detections: [] }
```

Also take a screenshot via `mcp__chrome-devtools__take_screenshot` after the interaction to visually confirm no artifacts.

### 10. Report to User

Present findings and resolution:

- **Flash detected**: Yes/No, with count and summary of detections
- **Root cause**: Which pattern from Step 8 matched (or unknown if none matched)
- **Fix applied**: Description of the CSS/code change made
- **Verification**: Whether re-run of detector confirmed zero detections
- **Screenshot**: Before and after screenshots for visual confirmation

## Error Handling

- If Chrome DevTools connection fails, stop and ask the user to ensure Chrome is running with `--remote-debugging-port` enabled
- If the flash detector script fails to inject (e.g., CSP restrictions), inform the user and suggest disabling CSP in the dev environment
- If zero detections after multiple reproduction attempts, suggest using Performance traces or manual frame-stepping instead
- If the interaction tool fails (e.g., element UID not found), re-take a snapshot to get updated UIDs

## Important Notes

- The flash detector uses both MutationObserver and requestAnimationFrame strategies. MutationObserver catches DOM changes synchronously, while rAF catches visual states between render frames.
- The rAF loop `suspects` selector must be customized for the specific element causing the flash. The default selector targets common overlay/portal patterns.
- Flash bugs are timing-dependent -- they may not reproduce consistently. Run the detection cycle 2-3 times before concluding there is no issue.
- CSS-level fixes (hiding elements when attributes are absent) are preferred over JavaScript fixes because they prevent the flash at the render level rather than cleaning up after it.
- The detector captures up to 20 detections to avoid memory issues. If the bug produces many events (e.g., continuous animation), increase the slice limit or filter by `type`.
