---
name: ah-fix-ui-bug
description: "Use this skill to debug and fix UI bugs in web apps when using the 'ah' prefix. Use when asked to 'ah fix ui bug'. Also use when elements are at wrong positions, animations land at wrong spots, layout shifts occur, elements overflow containers, buttons/chips/overlays are mispositioned, or persistent visual regressions appear. Uses chrome-devtools CLI to navigate pages, inspect elements, inject diagnostic scripts, take screenshots, and analyze DOM mutations. Works with Storybook, localhost dev servers, or any browser page. For single-frame flash/flicker timing races, prefer ah-fix-dom-flash instead."
argument-hint: "URL or page description, element selector or interaction that triggers the bug"
---

# Fix UI Bug with Chrome DevTools CLI

## Input

- **Page URL or description** (REQUIRED): The URL, Storybook story, or page description where the bug reproduces (e.g., `http://localhost:6006/iframe.html?id=...`, "Settings page").
- **Suspected element** (optional): CSS selector, component name, or description (e.g., `[data-button-id]`, "save button overlay").
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

# Take an accessibility tree snapshot (lists elements with UIDs for clicking)
chrome-devtools take_snapshot --verbose true

# Take a visual screenshot for reference
chrome-devtools take_screenshot --filePath /tmp/before.png
```

The a11y snapshot returns elements like `uid=6_2 button "Apple"`. These UIDs
are used in subsequent click/hover commands.

For Storybook, use the iframe URL (`/iframe.html?id=...`) to avoid Storybook's
own UI interfering with snapshots.

### 2. Instrument the Page

Inject diagnostic JavaScript before reproducing the bug. Use
`chrome-devtools evaluate_script` to install observers. The function must
be a JS arrow function that returns a JSON-serializable value.

Choose the relevant diagnostics from the recipes below based on the bug symptoms.

#### Layout Shift Detection

Detects elements that move unexpectedly (CLS):

```bash
chrome-devtools evaluate_script "() => {
  window.__shifts = [];
  const obs = new PerformanceObserver(list => {
    for (const e of list.getEntries()) {
      window.__shifts.push({
        value: e.value,
        sources: e.sources?.map(s => ({
          node: s.node?.tagName + '.' + s.node?.className?.substring(0, 60),
          prevRect: JSON.stringify(s.previousRect),
          currRect: JSON.stringify(s.currentRect)
        }))
      });
    }
  });
  obs.observe({type: 'layout-shift', buffered: false});
  return 'PerformanceObserver installed';
}"
```

#### Element Position Tracking

Tracks target elements every animation frame:

```bash
# CUSTOMIZE: change '[data-button-id]' to match the target elements
chrome-devtools evaluate_script "() => {
  const els = document.querySelectorAll('[data-button-id]');
  window.__posLog = [];
  let prev = {};
  els.forEach(el => {
    const r = el.getBoundingClientRect();
    prev[el.dataset.buttonId] = {t: Math.round(r.top), l: Math.round(r.left)};
  });
  function check() {
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      const curr = {t: Math.round(r.top), l: Math.round(r.left)};
      const p = prev[el.dataset.buttonId];
      if (curr.t !== p.t || curr.l !== p.l) {
        window.__posLog.push({id: el.dataset.buttonId, from: p, to: curr, time: performance.now()});
      }
      prev[el.dataset.buttonId] = curr;
    });
    requestAnimationFrame(check);
  }
  requestAnimationFrame(check);
  return 'Position tracker installed on ' + els.length + ' elements';
}"
```

#### Attribute Mutation Observer

Watches for class/style/attribute changes on target elements:

```bash
# CUSTOMIZE: change the selector to match the target element
chrome-devtools evaluate_script "() => {
  const el = document.querySelector('[data-button-id=\"btn-warm\"]');
  window.__mutations = [];
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      window.__mutations.push({
        attr: m.attributeName,
        oldVal: m.oldValue?.substring(0, 100),
        newVal: el.getAttribute(m.attributeName)?.substring(0, 100),
        style: el.style.cssText,
        transform: getComputedStyle(el).transform,
        position: getComputedStyle(el).position
      });
    }
  });
  mo.observe(el, {attributes: true, attributeOldValue: true});
  return 'MutationObserver installed';
}"
```

#### Ancestor CSS Property Check

Finds ancestors with `transform`, `will-change`, `filter` that create new
containing blocks (breaking `position: fixed`):

```bash
# CUSTOMIZE: change '.my-element' to match the target element
chrome-devtools evaluate_script "() => {
  let el = document.querySelector('.my-element');
  const issues = [];
  while (el) {
    const s = getComputedStyle(el);
    const hasTransform = s.transform !== 'none';
    const hasWillChange = s.willChange !== 'auto' && s.willChange.includes('transform');
    const hasFilter = s.filter !== 'none';
    if (hasTransform || hasWillChange || hasFilter) {
      issues.push({
        tag: el.tagName,
        class: el.className?.substring(0, 80),
        transform: s.transform,
        willChange: s.willChange,
        filter: s.filter
      });
    }
    el = el.parentElement;
  }
  return issues;
}"
```

#### Native API Patch (Animation Logging)

Patches `Element.animate` to log fly/transition animation parameters.
NOTE: This assumes the object-of-arrays keyframe format (`{transform: ['...', '...']}`),
which is one of two valid Web Animations API formats. Adjust if your code uses the
array-of-objects format (`[{transform: '...'}, {transform: '...'}]`).

```bash
chrome-devtools evaluate_script "() => {
  const orig = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = function(keyframes, options) {
    if (keyframes?.transform?.[1]?.includes('translate')) {
      const r = this.getBoundingClientRect();
      console.log('[ANIM]', {
        from: {left: this.style.left, top: this.style.top},
        actual: {left: r.left, top: r.top},
        transform: keyframes.transform[1],
        duration: options?.duration
      });
    }
    return orig.call(this, keyframes, options);
  };
  return 'animate() patched';
}"
```

### 3. Interact and Capture

Reproduce the bug while instrumentation is active.

```bash
# Click elements by UID (from take_snapshot)
chrome-devtools click "<uid>" --includeSnapshot true

# Take screenshot at key moments
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
```

#### When Automated Clicks Don't Reproduce the Bug

The `chrome-devtools click` command sends CDP-level events that are trusted,
but some libraries (e.g., dnd-kit's PointerSensor) check `event.isPrimary`
which may not be set on synthetic PointerEvents. If the bug doesn't reproduce:

1. **Inject a persistent diagnostic overlay** that monitors in real-time
2. **Ask the user to interact manually** in the browser while the overlay records
3. **Read the collected data** after the user reports what they saw

Example persistent overlay:

```bash
chrome-devtools evaluate_script "() => {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,0.85);color:#0f0;font:11px monospace;padding:8px;z-index:99999;max-height:200px;overflow-y:auto;pointer-events:none';
  document.body.appendChild(overlay);
  const log = [];
  function addLog(msg) {
    log.push(performance.now().toFixed(0) + 'ms: ' + msg);
    if (log.length > 20) log.shift();
    overlay.textContent = log.join('\\n');
  }
  // ... add position/mutation monitors that call addLog()
  addLog('Diagnostic overlay active - interact manually');
  return 'Overlay installed';
}"
```

#### Visual Position Markers

Drop a colored dot at a computed position to verify alignment visually:

```bash
# Pass coordinates as args: the UID arg is resolved to the element,
# but here we use plain numeric args for x,y positioning
chrome-devtools evaluate_script "(targetX, targetY) => {
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;width:10px;height:10px;background:red;border-radius:50%;z-index:99999;pointer-events:none;';
  dot.style.left = (targetX - 5) + 'px';
  dot.style.top = (targetY - 5) + 'px';
  document.body.appendChild(dot);
  setTimeout(() => dot.remove(), 3000);
  return 'Red dot placed at (' + targetX + ',' + targetY + ')';
}" --args 200 150
```

### 4. Diagnose

Analyze collected data to identify the root cause.

#### Common Root Causes

| Symptom                                                                    | Likely Cause                                                                      | How to Confirm                                                         |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `style.left` differs from `getBoundingClientRect().left` by large constant | Ancestor has `will-change:transform` or `transform` creating new containing block | Run ancestor CSS check recipe                                          |
| Element shifts position after state change                                 | CSS `transition` + box model change (border/padding)                              | Check MutationObserver for class changes with different border/padding |
| Animation lands at wrong position                                          | `getBoundingClientRect()` called during layout transition                         | Compare rects at capture time vs stable state                          |
| Element disappears during interaction                                      | `overflow:hidden` on ancestor clipping during transform                           | Temporarily remove `overflow:hidden` and test                          |
| Layout shift on click                                                      | `display` change or element insertion affecting flex/grid flow                    | Check PerformanceObserver layout-shift entries                         |

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

### 5. Verify the Fix

After applying a code fix:

1. Reload the page: `chrome-devtools navigate_page --url "..."`
2. Re-inject verification scripts (position tracking, animation logging)
3. Repeat the interaction: `chrome-devtools click "<uid>" --includeSnapshot true`
4. Confirm no position diffs, correct animation targets
5. Take final screenshot: `chrome-devtools take_screenshot --filePath /tmp/fixed.png`
6. Optionally ask user to verify manually for pointer-event-dependent bugs

### 6. Report to User

Present findings and resolution:

- **Bug reproduced**: Yes/No, with description of the visual issue
- **Root cause**: Which pattern from Step 4 matched (or unknown if none matched)
- **Fix applied**: Description of the CSS/code change made
- **Verification**: Whether re-run of diagnostics confirmed the fix
- **Screenshot**: Before and after screenshots for visual confirmation

## Error Handling

- If Chrome DevTools connection fails, stop and ask the user to ensure Chrome is running with `--remote-debugging-port` enabled
- If diagnostic scripts fail to inject (e.g., CSP restrictions), inform the user and suggest disabling CSP in the dev environment
- If automated clicks don't reproduce the bug, inject the persistent overlay and ask the user to interact manually
- If element UIDs are stale after page changes, re-take a snapshot with `chrome-devtools take_snapshot`

## Important Notes

- All JavaScript snippets use `chrome-devtools evaluate_script`. The function must be an arrow function returning a JSON-serializable value.
- Selectors in the diagnostic recipes (e.g., `[data-button-id]`, `.my-element`) are placeholders -- customize them for the specific bug.
- The Position Tracking recipe runs a `requestAnimationFrame` loop that continues until page reload. This is intentional for capturing intermittent shifts.
- CSS-level fixes (Portals, containing block escapes) are preferred over JavaScript workarounds for positioning bugs.
- For single-frame flash/flicker timing races (element appears for one frame then disappears), use the `ah-fix-dom-flash` skill instead -- it has specialized detectors for that pattern.

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
