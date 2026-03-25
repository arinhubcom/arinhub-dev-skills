# Root Cause Patterns for DOM Flash Bugs

Detailed patterns and fixes for each type of DOM flash/flicker bug.
Read this file when the quick-reference table in SKILL.md isn't enough
to identify or fix the root cause.

## Table of Contents

1. [Framework cleanup vs React re-render race](#1-framework-cleanup-vs-react-re-render-race)
2. [flushSync vs async setState race](#2-flushsync-vs-async-setstate-race)
3. [Drop animation clearing transform before unmount](#3-drop-animation-clearing-transform-before-unmount)
4. [Portal/overlay content outliving positioning context](#4-portaloverlay-content-outliving-positioning-context)
5. [Opacity transition initial value flash](#5-opacity-transition-initial-value-flash)
6. [Framer Motion AnimatePresence exit timing](#6-framer-motion-animatepresence-exit-timing)
7. [GSAP timeline cleanup vs React unmount](#7-gsap-timeline-cleanup-vs-react-unmount)
8. [React Suspense/lazy loading FOUC](#8-react-suspenselazy-loading-fouc)
9. [Z-index layer pop-through during reorder](#9-z-index-layer-pop-through-during-reorder)

---

## 1. Framework cleanup vs React re-render race

**Affected libraries**: @dnd-kit, Radix UI, Floating UI, Headless UI

**What happens**: The library synchronously removes positioning
attributes/styles from an overlay element (e.g., removes
`data-dnd-dragging`, clears inline `position: fixed`), but React
asynchronously clears the overlay's children on the next render cycle.
For one frame, the element has content but no positioning, so it falls
into normal document flow and flashes.

**Detection signal**: `type: "position-lost"` or `type: "flash"` with
`position: "static"` on an overlay element.

**Fix**: Hide the element via CSS when the library's positioning
attribute is absent. CSS applies synchronously in the same frame as the
attribute change, while React state updates are batched and async.

```css
/* @dnd-kit: hide overlay when not actively dragging */
[data-dnd-overlay]:not([data-dnd-dragging]) { display: none; }

/* Radix: hide popper when closed */
[data-radix-popper-content-wrapper]:not([data-state="open"]) { display: none; }

/* Floating UI: hide when not positioned */
[data-floating-ui-portal]:empty { display: none; }

/* As Tailwind classes */
className="[&:not([data-dnd-dragging])]:hidden"
className="data-[state=closed]:hidden"
```

---

## 2. flushSync vs async setState race

**Affected patterns**: Mixed `flushSync` + `setState` in same handler

**What happens**: `flushSync` forces a synchronous React render, but
other state updates in the same handler use normal batched `setState`.
The synchronous render completes first, briefly showing an intermediate
state where one piece of state is updated but another isn't.

**Detection signal**: Intermediate state visible for one frame. The
detector may catch this as `type: "attr-change"` on the element.

**Fix**:

```jsx
// BAD: mixed sync/async
flushSync(() => setDragState(null));
setItems(reordered); // async, one frame behind

// GOOD: both in same batch
flushSync(() => {
  setDragState(null);
  setItems(reordered);
});

// BETTER: both async (no forced reflow)
// React 18+ batches these into one render automatically
setDragState(null);
setItems(reordered);
```

---

## 3. Drop animation clearing transform before unmount

**Affected libraries**: @dnd-kit (dropAnimation config), Framer Motion,
react-beautiful-dnd

**What happens**: A drop animation completes and the library removes
`position: fixed` and/or `transform` from the overlay. React hasn't
unmounted the overlay's content yet. For one frame, the overlay sits
at its default position (usually (0,0) or bottom of the document).

**Detection signal**: `type: "transform-lost"` at position (0,0) or
`type: "flash"` on the overlay element after drag ends.

**Fix**:

```css
/* Hide overlay when transform is cleared */
.drag-overlay:not([style*="transform"]) { display: none; }

/* For @dnd-kit specifically */
[data-dnd-overlay]:not([data-dnd-dragging]) { display: none; }
```

If using `dropAnimation: null` in @dnd-kit, the overlay unmounts
immediately without animation. This can still flash if React's unmount
is deferred. The CSS fix handles both cases.

---

## 4. Portal/overlay content outliving positioning context

**Affected patterns**: React portals, Radix portals, any createPortal usage

**What happens**: A portal renders content outside the component tree
(typically appended to `document.body`). When the positioning context is
removed (popover closes, tooltip hides), the portal element briefly
appears in normal document flow before React unmounts it.

**Detection signal**: `type: "flash"` on a portal element, or
`type: "added"` with `suspicious: true` at an unexpected position.

**Fix**:

```css
/* Generic portal fallback */
[data-radix-portal]:empty { display: none; }
[data-floating-ui-portal]:empty { display: none; }

/* For custom portals */
.my-portal:not(.is-open) { display: none; }
```

---

## 5. Opacity transition initial value flash

**Affected patterns**: CSS transitions on mount, Framer Motion initial
prop, animate.css, any enter animation

**What happens**: An element is added to the DOM with its final opacity
(e.g., `opacity: 1`), and then a CSS transition or JS animation tries
to animate it from `opacity: 0`. For one frame, the element is fully
visible before the animation starts.

**Detection signal**: The flash detector may not catch this directly.
Look for `type: "added"` events where a newly added element has full
opacity. A Performance trace is more reliable for this type.

**Fix**: Set initial state in CSS (not JS) so it applies before first paint.

```css
.fade-in {
  opacity: 0;
  transition: opacity 200ms ease;
}
.fade-in.is-visible {
  opacity: 1;
}
```

```jsx
// Framer Motion: use initial prop (applies before first paint)
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

// React: set initial state in CSS, toggle class
<div className={cn('fade-in', isVisible && 'is-visible')}>
```

---

## 6. Framer Motion AnimatePresence exit timing

**Affected**: Framer Motion v4+

**What happens**: `AnimatePresence` keeps exiting elements in the DOM
during their exit animation. If the exit animation configuration is
wrong or the component re-renders during exit, the element can flash
at its default position.

**Detection signal**: Ghost element with animation content appearing
briefly. `type: "flash"` or `type: "added"` on the animated element.

**Fix**:

```jsx
// Use mode="wait" to ensure exit completes before enter
<AnimatePresence mode="wait">
  {isOpen && <motion.div key="dialog" exit={{ opacity: 0 }} />}
</AnimatePresence>

// Use onExitComplete for cleanup
<AnimatePresence onExitComplete={() => cleanupState()}>

// Ensure key is stable -- changing key triggers unmount+remount
<motion.div key={stableId} />
```

---

## 7. GSAP timeline cleanup vs React unmount

**Affected**: GSAP with React

**What happens**: GSAP manipulates DOM elements directly. When React
unmounts a component, GSAP's references become stale. If a GSAP
timeline is still running when React unmounts, the element may flash
at its default position as GSAP's inline styles are partially applied.

**Detection signal**: Element at default position with partial inline
styles. `type: "attr-change"` with GSAP-style transforms in `style`.

**Fix**: Use `useLayoutEffect` (not `useEffect`) because it runs cleanup
synchronously before React removes the DOM node.

```jsx
useLayoutEffect(() => {
  const tl = gsap.timeline();
  tl.to(ref.current, { x: 100, duration: 0.3 });

  return () => {
    tl.kill(); // Kill timeline before DOM removal
  };
}, []);
```

---

## 8. React Suspense/lazy loading FOUC

**Affected**: React.lazy, Suspense boundaries, code splitting

**What happens**: When a lazy-loaded component first renders, there's a
brief moment where the component's HTML is in the DOM but its CSS hasn't
loaded yet. This produces a Flash of Unstyled Content (FOUC).

**Detection signal**: Not caught by the flash detector. Visible as a
layout shift or unstyled content on first load. Use Lighthouse CLS
metric or Performance traces.

**Fix**: Provide a fallback that matches the final layout dimensions.

```jsx
<Suspense fallback={<Skeleton width={300} height={200} />}>
  <LazyComponent />
</Suspense>
```

For CSS-in-JS, prefer solutions that extract CSS at build time
(e.g., vanilla-extract, Tailwind) over runtime injection to avoid FOUC.

---

## 9. Z-index layer pop-through during reorder

**Affected**: Drag-and-drop reorder, sortable lists, modal stacking

**What happens**: During a z-index change (e.g., bringing a dragged
element above others), there's a frame where the old z-index is cleared
but the new one hasn't been applied. The element briefly appears behind
other elements.

**Detection signal**: Visual flash where element appears behind another.
The flash detector may not catch this -- it detects positioning loss,
not z-index changes. Use Performance traces or manual inspection.

**Fix**:

```css
/* Set z-index in CSS, not inline styles */
.dragging { z-index: 9999; }

/* Promote to compositor layer to avoid reflow-based z-index issues */
.sortable-item {
  will-change: transform;
}
```
