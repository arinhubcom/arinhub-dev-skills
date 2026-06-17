---
name: ah-workflow
description: Use this skill to run the full ArinHub feature-development pipeline end-to-end using the "ah" prefix. Use when asked to "ah workflow", "ah run workflow", "ah full workflow", or given a GitHub issue URL to take from issue to PR (e.g. "ah workflow https://github.com/org/repo/issues/42"). Takes either a feature description + an issue number + a base branch, OR a GitHub issue URL (it then resolves those inputs from the issue via references/resolve-gh-issue.md, auto-classifying the issue as a new feature or an update). Sequentially launches subagents for ah-create-prd-adr -> ah-create-tasks -> ah-implement-tasks -> ah-finalize-code (which creates the PR). Anchors the run with the /goal command and guards every phase with retry + escalation so it never loops forever. Use this skill whenever the user wants to take a feature or a GitHub issue from idea to PR in one orchestrated run, or mentions running the whole ah pipeline / all the ah steps at once.
argument-hint: "a feature description + an issue number + a base branch, OR a GitHub issue URL (optional: mode create|update [default create], spec number [required when mode=update, optional in create mode to pin the branch number], branch prefix, dry-run, skip <phase>, max-retries N, resume, autonomous [on by default])"
---

# AH Workflow

Orchestrate the entire ArinHub feature-development pipeline from a single starting point: a feature
description, an issue number, and a base branch. This skill is an orchestrator-of-orchestrators --
each phase skill is itself a multi-step workflow, and here we run them in order -- one subagent per
phase -- carrying the right inputs forward between them.

Why this exists: today each `ah-*` skill is launched by hand and the hand-off between them is just a
sentence ("next, run ah create tasks"). This skill makes the hand-off real -- it captures each
phase's outputs, feeds them into the next phase, records progress, and keeps the run aimed at one
completion goal without spinning forever on a phase that can't progress.

## Configuration

- **Orchestrator model**: This `ah-workflow` orchestrator itself runs on Opus with low effort.
- **Subagent defaults**: Opus with low effort for every phase subagent. Each phase subagent's
  job is to invoke the corresponding `ah-*` skill and report back the artifacts it produced.
- **Phase skills don't need a committer here**: each `ah-*` phase skill already runs its
  own `committer` subagent internally, so this orchestrator does not commit on its own.
- **Progress file is the source of truth**: every phase result is appended to the workflow progress
  log by `scripts/progress.sh` (a deterministic shell helper, not an LLM-maintained markdown file).
  That log is also what the `/goal` evaluator reads (see "Anchor the run with /goal"), so after each
  phase, echo its rendering (`progress_render`) into the conversation. Each phase line carries the
  phase status, attempt count, and its artifact paths -- the load-bearing fields the evaluator and the
  next phase consume.

## The pipeline

| # | Phase skill | Input it needs | What it produces |
|---|-------------|----------------|------------------|
| 1 | `ah-create-prd-adr` | feature description | `~/.agents/prds/prd-<repo>-<feat>.md`, `~/.agents/adrs/adr-<repo>-<feat>.md` |
| 2 | `ah-create-tasks` | PRD path, ADR path, issue number (base branch via checkout -- see note) | new git branch + `specs/<branch>/` (spec.md carries Base Branch + Issue Number metadata, plan.md, tasks.md) |
| 3 | `ah-implement-tasks` | reads `specs/<branch>` and spec.md metadata | implemented code, commits, tasks.md checked off |
| 4 | `ah-finalize-code` | reads spec.md metadata | simplify + tests + docs + review, then creates/updates the PR via `ah-create-pr` |

`ah-create-pr` is **not** a separate phase -- `ah-finalize-code` calls it at the end of phase 4.

Key input propagation: phases 1 and 2 are where data flows between skills. Phase 1 produces the
PRD and ADR paths; you pass them into phase 2. **Important about the base branch:** `ah-create-tasks`
does not take a base branch as an argument -- it reads `git branch --show-current` and uses whatever
is checked out as the base, branching off it. So the orchestrator must `git checkout <base-branch>`
*before* launching phase 2. Phase 2 then creates the feature branch off it and writes the base branch
and issue number into `spec.md`, so phases 3-4 read those themselves -- you don't need to thread them
through again. Subagents share the working directory, so the branch phase 2 creates stays checked out
for every later phase.

**Mode (create vs update):** this orchestrator accepts an optional `mode` -- `create`
(default) or `update`. It only changes phase 2: in `update` mode the phase-2 subagent runs
`ah-create-tasks` in *its* update mode (skip re-specify, start from clarify), which needs a
`spec number` and a `branch prefix`. Everything else is identical -- phase 1
(`ah-create-prd-adr`) still runs in both modes (update mode distills its clarify prompt from
the PRD), and the base-branch checkout before phase 2 happens in both modes
(`ah-create-tasks` reads the base from the current branch even in update mode). Default to
`create` when no mode is given, so existing behavior is unchanged.

## Procedure

### 0. Initialize

**Input fork -- issue URL vs. classic inputs.** First decide how the inputs arrive. If the
prompt is, or contains, a GitHub issue URL (`https://github.com/<owner>/<repo>/issues/<n>`,
or `issue <url>`, or a bare issue number with no feature description), read
`references/resolve-gh-issue.md` and follow it **in this main session** (it may ask you for
a base branch, spec number, or branch prefix). It returns the **feature description**,
**issue number**, **base branch**, **mode**, and -- in update mode -- the **spec number**
and **branch prefix**. Any value the user passed explicitly (base branch, `mode`, spec
number, branch prefix) overrides what the issue implies; pass those overrides into the
resolution. Then continue below with those values already in hand.

Otherwise (classic invocation), collect the three required inputs from the user's prompt:
**feature description**, **issue number**, **base branch**. If any is missing, ask for it
before doing anything else -- the base branch in particular is never guessed (same rule as
`ah-create-pr`), because it determines where the PR targets.

Parse optional directives:

- `mode create|update` -- which pipeline mode to run (default `create`). In `update`
  mode, also collect a `spec number` (e.g. `001`) and a `branch prefix` (e.g. `jj`); if
  either is missing, ask for it now, before doing anything else -- update mode's phase 2
  needs both and would otherwise stall mid-run. In `create` mode a `spec number` is
  optional: pass it through to pin the feature branch number, but never prompt for it.
- `dry-run` -- plan only, run nothing (see "Dry run").
- `skip <phase>` -- skip a named phase (e.g. `skip finalize`). Log it `skipped(user)`.
- `max-retries N` -- per-phase attempt cap (default 2).
- `resume` / `restart` -- how to handle an existing progress file.
- `autonomous` -- run every phase non-interactively. **On by default in this workflow** and
  always passed to every phase subagent: the pipeline runs phases as subagents with no channel
  to the user, so each `ah-*` skill must decide from context (recording assumptions) or fail
  fast instead of pausing -- otherwise the run deadlocks. There is no reason to turn it off
  inside a workflow run; the workflow's own escalation guard handles genuine blockers.

```bash
REPO_NAME=$(basename -s .git "$(git remote get-url origin)" 2>/dev/null || basename "$(git rev-parse --show-toplevel)")
ISSUE_NUMBER="<issue number from the user>"
BASE_BRANCH="<base branch from the user>"
PROGRESS_DIR=~/.agents/arinhub/progresses
PROGRESS_FILE="${PROGRESS_DIR}/progress-workflow-${REPO_NAME}-${ISSUE_NUMBER}.md"
source "<skill_dir>/scripts/progress.sh"
```

The progress file is keyed by issue number rather than branch (the other `ah-*` skills key on branch),
because at workflow start no feature branch exists yet -- phase 2 creates it.

#### Initialize the progress file

Progress is a deterministic append-only log written by `scripts/progress.sh` (sourced above, path
resolved relative to this SKILL.md's directory) -- not an LLM-maintained markdown file. The feature
branch does not exist yet, so the log is keyed by issue number; pass it as the branch field for now:

```bash
progress_init "${PROGRESS_FILE}" "issue-${ISSUE_NUMBER}" "${BASE_BRANCH}" "${ISSUE_NUMBER}"
```

`progress_init` stamps `meta|started` from `date` and writes the header only when the file does not
yet exist.

If `${PROGRESS_FILE}` already exists and `restart` was not requested:

- **Resume**: inspect `grep '^step|' "${PROGRESS_FILE}"`, show which phases are done, and ask "Resume
  from phase N, or restart?" On resume, skip completed phases.
- **Restart**: `rm "${PROGRESS_FILE}"` and call `progress_init` again.

### Anchor the run with /goal

Set a session goal so Claude keeps working across turns toward completion, with a hard turn cap as the
outermost runaway guard:

```
/goal the ah-workflow progress file for issue <N> shows all four phases complete (PRD+ADR, tasks, implement, finalize+PR), or stop after <T> turns
```

Pick `T` as roughly `(remaining phases) x (max-retries) + 4` for headroom. Why this works: the `/goal`
evaluator only sees what's in the conversation and never runs tools, so after every phase you must echo
`progress_render "${PROGRESS_FILE}"` into the conversation -- that's what lets the evaluator judge
"complete". The `or stop after <T> turns` clause is the tripwire that stops the session even if the
per-phase guards below somehow fail.

### Per-phase orchestration pattern

Apply the same loop to each of the four phases, in order. For phase _k_:

1. **Skip checks**: if the user asked to skip it, or it's already complete on resume, mark it and move
   on.
2. **Launch a subagent** (Opus, low) whose prompt is: "Invoke the skill `<ah-skill-for-phase-k>`
   with these inputs: <inputs>. When done, report the exact artifact paths you produced and a one-line
   status." Pass the phase-specific inputs:
   Every phase below must also include `autonomous` in its inputs (see the `autonomous` directive)
   so the subagent never pauses for the unreachable user.
   - Phase 1: the feature description, plus `autonomous`. The skill derives the feature slug itself (its convention:
     2-5 words, lowercase, hyphen-separated, no special chars -- e.g. "add a dark mode toggle to
     settings" -> `dark-mode-toggle`), and that slug determines the PRD/ADR filenames.
   - Phase 2: **first `git checkout <base-branch>`** (and `git pull` if it tracks a remote) so the new
     feature branch is cut from the right base -- `ah-create-tasks` reads the base from the current
     branch, it has no base-branch argument. Then pass the PRD path and ADR path captured from phase
     1's report, plus the issue number. **Always include `autonomous` in the inputs** -- this
     workflow runs `ah-create-tasks` as a subagent with no channel to the user, so its Step 5
     (clarify) and Step 11 (complexity check) must decide from context and record ASSUMPTIONs
     instead of pausing; without it the run deadlocks. (Passing the derived feature slug also works
     in place of the two paths, per `ah-create-tasks`'s feature-name input.) **In `update` mode**, additionally tell
     the subagent to run `ah-create-tasks` in update mode -- i.e. include `update <spec-number>` and
     the `branch prefix` (exported as `GIT_BRANCH_PREFIX`) in the inputs -- so it skips re-specify and
     branches as `<prefix>/<spec>-<desc>`. In `create` mode, pass nothing extra (the default)
     unless a `spec number` was resolved -- then pass it too, so `ah-create-tasks` pins the
     feature branch number (`jj/<spec>-<desc>`) instead of auto-detecting it.
   - Phase 3 (`ah-implement-tasks`): include `autonomous` -- the skill reads `spec.md`; just name the
     spec dir if helpful.
   - Phase 4 (`ah-finalize-code`): include `autonomous` -- it runs the retrospective non-interactively
     and forwards `autonomous` to `ah-create-pr`, so PR creation fails fast (rather than pausing) on a
     broken build or missing input. The skill reads `spec.md`; name the spec dir if helpful.
3. **Verify real artifacts first.** The subagent's reported status (a one-line summary, a
   `Stream idle timeout`, an error, a partial/0-token result) is **advisory only** and frequently
   wrong -- it reflects transport state, not committed work. Before doing anything with it, check the
   filesystem and git for the phase's expected artifacts. If the artifacts exist, the phase
   **succeeded** regardless of what the status said: log `done`, capture the paths, and continue. Only
   when the artifacts are genuinely absent do you treat the phase as failed and enter the retry path.
   **Never retry or fail a phase on a reported timeout/error alone.** Per-phase checks:
   - **Phase 1 (`ah-create-prd-adr`)**: both `~/.agents/prds/prd-<repo>-<feat>.md` and
     `~/.agents/adrs/adr-<repo>-<feat>.md` exist and are non-empty.
   - **Phase 2 (`ah-create-tasks`)**: `git branch --show-current` is a new feature branch (not the
     base), `specs/<branch>/` exists with `spec.md`, `plan.md`, and `tasks.md`, and
     `git log <base>..HEAD --oneline` shows the expected spec commits.
   - **Phase 3 (`ah-implement-tasks`)**: `git log` shows new implementation commits beyond phase 2,
     and `tasks.md` checkboxes advanced (compare checked count vs. the post-phase-2 state).
   - **Phase 4 (`ah-finalize-code`)**: an open PR exists for the branch (`gh pr view --json url` /
     `ah-create-pr`'s reported URL) and `retrospective.md` exists in the spec dir.
4. **Capture outputs** into the log with one call -- the artifact paths go in the last field, the
   attempt count in the `extra` field:
   `progress_log "${PROGRESS_FILE}" <k> <phase-name> <status> <attempts> "<artifact paths>"`
   (status: `done`, `skipped(user)`, `failed`). Phase 1 -> PRD + ADR paths; phase 2 -> feature branch
   (`git branch --show-current`) + spec dir; phase 3 -> commits / tasks.md completion; phase 4 -> PR URL.
   After the final phase, `progress_done "${PROGRESS_FILE}" completed`.
5. **Echo** the log into the conversation with `progress_render "${PROGRESS_FILE}"` (for the `/goal`
   evaluator, which only sees the conversation).
6. **Verify progress** and decide retry vs. escalate (next section).

### Anti-loop / stuck detection

You only reach this section when the artifact check above (step 3) found the phase's expected
artifacts **missing**. A reported timeout/error with artifacts present is a success, not a failure --
do not count it as a retry attempt.

A phase that fails the same way over and over must not loop forever -- that's the whole point of the
guard. For each phase, allow at most `max-retries` (default 2) attempts. Between attempts, check whether
the attempt actually changed anything:

- **Commits**: did the commit count on the branch (or the latest commit hash) change?
- **Artifacts**: did the phase's expected artifact change -- e.g. `tasks.md`, `spec.md`, the PRD/ADR
  files, or the phase's own section in its internal progress file (hash or content diff)?

If a retry produced **no change in either**, treat the phase as genuinely stuck -- retrying blindly will
just burn turns. Stop retrying that phase.

When attempts are exhausted **or** the phase is detected stuck:

- Log the failure with `progress_log "${PROGRESS_FILE}" <k> <phase-name> failed <attempts> "<last error>"`
  (the `ah-*` convention is "do not silently skip steps").
- **Escalate to the user** -- report what's blocked and ask how to proceed. Do not loop, and do not
  silently continue to the next phase.

The `/goal` turn clause is the final backstop: even if this per-phase logic misbehaves, the session
stops at `T` turns.

### Dry run

If `dry-run` was passed, do not launch any subagent. Instead print:

- the resolved inputs (repo, issue number, base branch, mode -- the spec number and branch
  prefix in update mode, and the spec number too if one was supplied in create mode --
  plus the derived feature slug -- 2-5 words, lowercase,
  hyphen-separated, matching `ah-create-prd-adr`'s convention),
- the four phases in order with the input each will receive,
- the target artifact paths (PRD, ADR, spec dir, progress file).

This is a cheap way to confirm the plan before committing to a full run.

### Resume

On a re-run with an existing progress file, detect completed phases and continue from the first
unfinished one. Completed phases (and their commits, done inside the phase skills) are not redone.

### Report

When the pipeline finishes (or stops at an escalation), print a final summary: the status of each
phase, paths to the PRD / ADR / spec dir, and the PR URL from phase 4.

Because every phase ran autonomously (deciding without the user), surface the autonomous decisions
for review. The spec dir is the phase-2 artifact captured in the progress log (or `specs/<branch>/`
by convention). From the working repo where the pipeline ran, read and echo:

- the `## Clarification Assumptions` section from `${SPEC_DIR}/spec.md` (written by `ah-create-tasks`),
- the `Follow-up Actions` from `${SPEC_DIR}/retrospective.md` (written by `ah-finalize-code`'s
  retrospective step).

If a file or section is absent (nothing was assumed, or the repo has no retrospective extension),
silently skip it -- never hard-error on a missing file.

Then echo `progress_render "${PROGRESS_FILE}"` one last time so the `/goal` evaluator can
confirm completion and clear the goal.
