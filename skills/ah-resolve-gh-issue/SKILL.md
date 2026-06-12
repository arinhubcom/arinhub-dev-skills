---
name: ah-resolve-gh-issue
description: Use this skill to resolve a GitHub issue end-to-end using the "ah" prefix. Use when asked to "ah resolve gh issue", "ah resolve github issue", "ah resolve issue <url>", or given a GitHub issue link to take from issue to PR. Reads the issue with `gh`, derives the feature description and base branch, auto-classifies the issue as a new feature or an update (bug fix / refactor), then launches the full ArinHub pipeline via `ah-workflow` in the right mode. Use this skill whenever the user points at a GitHub issue and wants it implemented, fixed, or refactored automatically, even if they don't say "workflow".
argument-hint: "a GitHub issue URL or number (optional: base branch, mode override feature|update, spec number)"
---

# Resolve GitHub Issue

Turn a single GitHub issue link into a full pipeline run. This skill is a thin front
door over `ah-workflow`: it reads the issue, decides whether the work is a **new feature**
or an **update** (bug fix / refactor), assembles the inputs `ah-workflow` needs, and hands
off. The heavy lifting (PRD/ADR -> tasks -> implement -> QA -> finalize/PR) all happens
inside `ah-workflow`; this skill only classifies and delegates.

Why this exists: the rest of the `ah-*` family starts from a hand-typed feature
description plus an issue number plus a base branch. Starting from an issue URL is the
common case, and the feature-vs-update decision is mechanical enough to make here so the
user doesn't have to.

## Configuration

- **Model**: Opus with low effort.
- This skill runs no subagents of its own -- it resolves inputs in the main session and
  invokes `/ah-workflow`, which owns all the phase orchestration.

## Input

- **issue** (required): a GitHub issue URL (e.g.
  `https://github.com/owner/repo/issues/42`) or a bare number (e.g. `42`). If missing,
  ask before doing anything.
- **base branch** (optional): overrides body/default resolution (see step 3).
- **mode override** (optional): `feature` or `update` to force the classification
  (see step 4).
- **spec number** (optional): only relevant in update mode (see step 5).
- **branch prefix** (optional): forwarded to update mode (see step 5).

Pass-through directives for `ah-workflow` (`dry-run`, `skip <phase>`, `max-retries N`,
`resume`/`restart`) are forwarded verbatim -- do not interpret them here.

## Procedure

### 1. Resolve the issue ref

Accept a full URL or a bare number.

- If a URL: parse `OWNER`, `REPO`, and `NUMBER` from
  `https://github.com/<OWNER>/<REPO>/issues/<NUMBER>`.
- If a bare number: use it as `NUMBER` and the current repo.

Guard against operating on the wrong repository. The pipeline (`git checkout`, branch
creation, commits) runs in the **current working directory**, so the issue must belong to
the current repo:

```bash
CURRENT_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

If the URL's `<OWNER>/<REPO>` does not match `${CURRENT_REPO}`, stop and tell the user --
do not silently resolve an issue from one repo while running the pipeline in another. Ask
them to switch to the right repo or confirm the number belongs to the current one.

### 2. Fetch the issue

```bash
gh issue view "${NUMBER}" --json number,title,body,labels,url
```

(Same access pattern as `ah-verify-requirements-coverage`.) If the issue can't be fetched
(closed, wrong number, no access), report it and stop.

### 3. Build the feature description and resolve the base branch

**Feature description**: distill the issue **title + body** into a concise feature
description -- this is the input `ah-workflow` phase 1 (`ah-create-prd-adr`) consumes. Keep
the *what* and *why*; drop noise like screenshots, logs, and `@`-mentions. Preserve any
non-English wording verbatim; `ah-create-prd-adr` handles translation.

**Base branch** -- resolve in this order (marker, then default):

1. If the user passed a base branch, use it.
2. Else scan the issue body for a marker line, case-insensitive, e.g.
   `Base Branch: develop` or `base: main`. Take the first match.
3. Else fall back to the repo default:

   ```bash
   BASE_BRANCH=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
   ```

4. Only if all three fail, ask the user. Never guess silently -- the base branch decides
   where the PR targets (same discipline as `ah-create-pr` / `ah-workflow`).

### 4. Classify the mode (feature vs update)

A **feature** adds new capability; an **update** fixes or refactors existing behavior.
`ah-workflow` runs both, but the mode flows down to `ah-create-tasks`, where it really
matters (update mode skips re-specifying). Classify labels-first:

1. **Labels** (primary signal):
   - `bug`, `bugfix`, `fix`, `refactor`, `refactoring`, `chore` -> `update`
   - `feature`, `enhancement`, `feat` -> `feature`
2. **Body/title** (fallback when labels are missing or point both ways): judge intent --
   a request for something new -> `feature`; fixing, correcting, or restructuring existing
   code/behavior -> `update`.
3. A user-supplied **mode override** wins over both.

Echo the decision with its evidence, e.g.
`mode=update (label: bug)` or `mode=feature (no labels; title describes a new export view)`,
so the choice is auditable before the (expensive) pipeline starts.

### 5. Update-mode extras (only when mode = update)

Update mode in `ah-create-tasks` needs two more things; resolve them here so the run
doesn't stall on an interactive prompt deep in the pipeline:

- **Spec number**: scan the body for a marker (`Spec Number: 001` / `spec: 001`,
  case-insensitive). If absent, **ask the user** for it before launching.
- **Branch prefix**: if the user passed one, forward it; else resolve from the environment
  (`GIT_BRANCH_PREFIX`); else ask once now. Update mode branches as
  `<prefix>/<spec>-<desc>`, and `ah-create-tasks` would otherwise ask for the prefix
  mid-run.

For a **feature**, skip this step entirely.

### 6. Delegate to ah-workflow

Hand off everything resolved above. Use the family's slash-style delegation (as
`ah-finalize-code` calls its siblings):

```
Run /ah-workflow with prompt: '<feature description>; issue <NUMBER>; base branch <BASE_BRANCH>; mode <MODE>[; spec <SPEC_NUMBER>][; branch prefix <PREFIX>]' <plus any forwarded directives: dry-run, skip <phase>, max-retries N, resume>
```

`ah-workflow` collects these, runs its dev-server preflight, anchors the run with `/goal`,
and drives all six phases -- forwarding `mode` (and the spec number) into the
`ah-create-tasks` phase. Do not re-implement any of that here.

### 7. Report

Before (or alongside) the hand-off, print a short summary so the user can confirm the
resolved inputs: issue URL + title, chosen base branch (and how it was resolved: marker
vs default), classified mode + evidence, and -- in update mode -- the spec number and
branch prefix. Then let `ah-workflow`'s own reporting take over.

## Notes

- This skill makes a decision the user can override at every step (base branch, mode, spec
  number) -- always surface what it chose and why, never bury it.
- It does not commit or branch on its own; all git state changes happen inside the phase
  skills `ah-workflow` launches.
- `dry-run` is the cheap way to preview: it threads through to `ah-workflow`'s dry run,
  which prints the resolved inputs, the chosen mode, and the six phases without launching
  anything.
