# UI Bug Root Causes

Diagnostic knowledge base for common UI positioning, stacking, sticky, and
flex/grid bugs. Load this when the first diagnosis pass (`### 5`) needs to map a
symptom to a likely cause.

## Common Root Causes

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

## Containing Block Issues (position:fixed)

These CSS properties on ANY ancestor create a new containing block:

- `will-change: transform` (even without an actual transform!)
- `transform: anything-other-than-none`
- `filter: anything-other-than-none`
- `backdrop-filter`
- `contain: paint` or `contain: layout`
- `perspective`

Fix: Use a React Portal (`createPortal`) to render the fixed element on
`document.body`, escaping the transformed ancestor entirely.

## Z-Index / Stacking Context Issues

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

## Sticky Positioning Failures

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

## Flex/Grid Sizing Issues

Common flex pitfalls:

- `min-width: auto` (default) prevents flex items from shrinking below content
  size. Fix: set `min-width: 0` on the flex item.
- `flex-basis: auto` uses content size. Fix: `flex-basis: 0` for equal distribution.
- Missing `overflow: hidden` on flex items causes content to expand beyond the
  flex track. Fix: add `overflow: hidden` or `min-width: 0`.
