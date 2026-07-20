---
name: ah-audit-plan
description: Audit implementation plan for missed touch-points, false premises, downstream blockers before finalizing, with the "ah" prefix. Use for "ah audit plan"; applies to removal/rename/refactor, new feature, config/infra/tooling change, migration. Verify premises vs repo; sweep whole codebase (incl. sibling apps, docs, tests, fixtures, CI); surface under-addressed risks.
---

# ah-audit-plan

Purpose: before finalizing plan, falsify it vs repo. Catch wrong premises, missed touch-points (docs/tests/fixtures/sibling apps), and downstream blockers before work starts.

The **spirit**: don't just re-read the plan — try to *falsify* it. Verify each factual claim
against the current repo, hunt for everything the change ripples into, and name the risks the
plan glosses over. Report as a delta on the plan, then update the plan file.

## When to use

- User asks "ah audit plan" (or "audit this plan").
- You are about to `ExitPlanMode` / start executing and want confidence the plan is complete.
- Any non-trivial plan: removal/rename/refactor, new feature, schema change, config/tooling/
  infra/CI change, dependency bump, or migration.

## How to run

1. **Read the plan** and extract its factual premises and its list of changes.
2. **Verify the premises** — every "X works like Y" / "only Z reads this" / "CI already does W"
   claim gets checked against the actual repo (grep, read the file, run a read-only probe).
   A plan built on a wrong assumption fails no matter how well executed.
3. **Sweep for touch-points** — launch one **Explore** subagent with an exhaustive brief so
   the file dumps stay out of your context and you get back the conclusion. Grep every
   relevant identifier / path / config key across the WHOLE repo, not just one app.
4. **Stress the consequences** — for each change, ask what else depends on it and what breaks
   in environments the plan didn't consider (CI, headless, background jobs, other worktrees,
   fresh clones).
5. **Confirm the key files yourself**, then write the delta back into the plan file.

## Audit lenses — apply the ones that fit

Not every lens fits every plan; pick the relevant ones and skip the rest. For each, report
exact `path:line` + quoted evidence.

- **Premise check** — is each factual claim in the plan actually true of the current code?
  (Behavior, ownership, "only consumer", "CI covers it", tool/flag existence.) This is the
  highest-value lens and applies to *every* plan.
- **Whole-repo touch-point sweep** — everywhere the change ripples: source, types, config,
  callers, docs, and **sibling / legacy / reference apps** that share the identifier.
- **Tests & fixtures** — unit/integration tests asserting the old behavior; snapshot and
  screenshot/visual baselines; seed data / fixtures. State explicitly what breaks or "no
  change needed" with the reason.
- **Docs & manifests** — READMEs, AGENTS.md/CLAUDE.md, test-catalogs, generated API docs, and
  ID-numbered tables/lists that must stay in sync.
- **Environment & lifecycle** — will the change behave differently across CI vs local,
  headless vs interactive, background/sub-agent vs foreground, fresh clone vs installed,
  each git worktree? Heavy steps that can't run everywhere are a classic blocker.
- **Consequence / coverage shift** — if the plan moves or drops a check (e.g. out of a hook
  into CI), confirm the new home actually runs it, so coverage moves rather than vanishes.
- **Ordering & positional traps** — anything auto-numbered or order-dependent (test-case IDs,
  snapshot/baseline filenames, migration order): deleting/inserting in the middle shifts
  everything after it; the committed artifact AND docs must be re-synced.
- **False positives** — a grep hit on the identifier may be an unrelated idiom or a
  similarly-named token; confirm before acting.

### Identifier-removal sweep (checklist mode)

When the plan removes/renames a cross-cutting identifier (a prop, enum/schema field, config
option, API surface), run this concrete sweep — each item maps to whatever layer the repo
uses; skip layers it lacks:

1. **Schema / validation** — the field/enum definition (removing it is what strips it from
   runtime data). Confirm no OTHER consumer reads a shared-schema field before deleting it.
2. **Type definitions** — the interface(s) and any mirror/duplicate declaration.
3. **Consumer logic** — every read site, helper, variant/style map, conditional token, and
   downstream call site. Remove now-dead branches/keys.
4. **Stories / examples / playground** — demos, UI knobs, and composed examples in *other*
   components that set the field inline.
5. **Unit tests** — read fully; confirm nothing asserts the removed behavior.
6. **Snapshot tests** — regenerate with the PROJECT command, never a raw updater that may
   delete VCS/LFS-tracked snapshot files. Mind positional renumbering.
7. **Screenshot / visual baselines** — the story list + baseline images; positional renumber.
8. **Docs / test-catalog / API docs** — ID-numbered rows/manifests; renumber trailing rows.
9. **Data fixtures / seed data** — drop the field, or delete demo entries that exist only to
   show it; check no index references deleted ids.
10. **Sibling / legacy / reference apps** — same identifier in another app or generated
    manifest; decide scope explicitly, don't silently skip.
11. **Repo instructions & specs** — AGENTS.md / CLAUDE.md / spec / ADR folders.

## Output

Report as a delta on the existing plan: per lens, either the concrete finding (`path:line`,
quoted) or "no change needed" with the reason. Lead with any **falsified premise** or
**environment blocker** — those change the plan most. Then update the plan file: fix wrong
assumptions, add missed touch-points, and add the verification steps below.

## Verification the plan should include

- Verify every premise the plan depends on is still true (re-grep / re-read).
- Project typecheck / compile (the variant that also checks tests, if one exists).
- Whole-repo grep of every touched identifier/path → no unintended leftover hits.
- Regenerate any snapshots/baselines via project commands; run the affected suites green.
- Run the affected unit tests.
- Exercise the change in the environments it must work in — for UI, the real entry points
  (routes/URLs/screens) named in the plan, not just isolated story/harness renders; for
  tooling/infra, the headless/background/fresh-clone paths, not only the happy interactive one.
