---
name: ah-audit-plan
description: Audit an implementation/removal plan for missed touch-points before finalizing, with the "ah" prefix. Use for "ah audit plan", or when removing/renaming a feature, prop, variant, config field, enum value, or API and you must be sure nothing is left behind. Sweeps source, types/schema, stories, tests, snapshots, screenshots, docs/test-catalogs, and data fixtures across the whole repo (including sibling apps) and flags positional-numbering renumber traps.
---

# ah-audit-plan

Purpose: before finalizing a plan to **remove, rename, or refactor** a cross-cutting
thing (a widget variant, a prop, a schema/enum field, a config option, an API
surface), audit the WHOLE repo for every place that references it. A source-only
checklist almost always misses docs, snapshots, fixtures, and sibling apps —
and those cause red CI or silent stale artifacts later.

## When to use

- User asks "ah audit plan" (or "audit this plan").
- You are about to `ExitPlanMode` on a removal/rename/refactor and want confidence.
- A feature spans a schema field consumed by a component + stories + tests + fixtures.

## How to run

Prefer launching one **Explore** subagent with an exhaustive brief (it keeps the file
dumps out of your context and returns only the conclusion). Grep each identifier
(the field name, the enum value, helper function name, CSS class tokens, story names)
across the entire repo, not just the one app. Then confirm the key files yourself.

## Audit scope — the checklist to sweep

Stack-agnostic. Each item names a *layer*, not a specific framework — map it to whatever
the repo uses (any typed language, any validation lib, any test/story/doc tool). Skip a
layer that doesn't exist here. For each item, grep the identifier(s) and report exact
`path:line` + quoted code.

1. **Schema / validation** — the enum/field definition in whatever validation layer the
   project uses. Removing it here is what actually strips the field from runtime data.
   Confirm no OTHER consumer reads it before deleting a shared-schema field.
2. **Type definitions** — the interface(s) and any mirror/duplicate declaration. Often
   more than one place (a domain type plus a component/props type).
3. **Consumer logic** — every branch that reads the identifier: helper functions,
   variant/style maps, conditional tokens, the read site, and every call site that passes
   it downstream. Remove now-dead keys/branches too.
4. **Stories / examples / playground** — dedicated stories or examples demoing the
   feature, any UI control/knob for the field, and destructure/spread in wrappers. Also
   **composed stories in other components** that set the field inline.
5. **Unit tests** — read them fully; confirm whether any assert the removed behavior.
   State explicitly that removal won't break them, or list what breaks.
6. **Snapshot tests** — regenerate with the PROJECT's snapshot-update command, never a
   raw updater that may delete VCS/LFS-tracked snapshot files. Watch **positional
   numbering**: if case IDs are auto-numbered by story/test order, deleting a middle case
   renumbers every later one — the committed snapshot AND docs must be re-synced.
7. **Screenshot / visual-regression baselines** — the story list + the baseline images.
   Same positional-renumber trap: deleting one shifts later filenames. Either regenerate
   via the project's baseline-update command, or move the identical-content baseline to
   its new index and remove the deleted one via VCS.
8. **Docs / test-catalog / generated API docs** — tables or manifests that list each
   story/test/field by ID; remove the rows and renumber the trailing ones to match the
   new order.
9. **Data fixtures / seed data** — fixtures in the consuming app(s) that set the field.
   Decide per-fixture: drop just the field, or delete whole demo entries that exist ONLY
   to show it. Check no index/manifest references the deleted ids.
10. **Sibling / legacy / reference apps** — the same identifier may live in another app
    or a reference implementation (generated manifests, its own docs/stories). Decide
    scope explicitly and call it out rather than silently skipping.
11. **Repo instructions & specs** — AGENTS.md / CLAUDE.md / spec or ADR folders: check
    whether they describe the feature. Beware false positives — a grep hit on the
    identifier may be an unrelated idiom or a similarly-named token, not the thing you're
    removing.

## Output

Report as a delta on the existing plan: for each numbered scope item, either the exact
touch-points found (`path:line`, quoted) or "no change needed" with the reason. Highlight
positional-renumbering consequences and any shared-schema field that other consumers read.
Then update the plan file accordingly before finalizing.

## Verification the plan should include

- Project typecheck / compile (the variant that also checks tests, if one exists).
- Whole-repo grep of every identifier → zero leftover source hits in the target app(s).
- Regenerate snapshots/baselines via project commands; run the affected suites green.
- Run the affected unit tests.
- For UI changes, exercise the real entry points named in the plan (the routes/URLs or
  screens the change affects) — isolated story/harness renders miss integrated UX.
