---
name: ah-workflow
description: Use this skill to run the full ArinHub feature-development pipeline end-to-end using the "ah" prefix. Use when asked to "ah workflow", "ah run workflow", or "ah full workflow". Takes a feature description, an issue number, and a base branch, then sequentially launches subagents for ah-create-prd-adr -> ah-create-tasks -> ah-implement-tasks -> ah-check-qa -> ah-finalize-code (which creates the PR) -> revise-claude-md. Anchors the run with the /goal command and guards every phase with retry + escalation so it never loops forever. Use this skill whenever the user wants to take a feature from idea to PR in one orchestrated run, or mentions running the whole ah pipeline / all the ah steps at once.
argument-hint: "a feature description, an issue number, a base branch (optional: mode feature|update [default feature], spec number [required when mode=update], branch prefix, dry-run, skip <phase>, max-retries N, resume)"
---

# AH Workflow

Orchestrate the entire ArinHub feature-development pipeline from a single starting point: a feature
description, an issue number, and a base branch. This skill is an orchestrator-of-orchestrators --
each phase skill is itself a multi-step workflow, and here we run them in order -- one subagent per
phase (except the final CLAUDE.md revision, which runs in the main session) -- carrying the right
inputs forward between them.

Why this exists: today each `ah-*` skill is launched by hand and the hand-off between them is just a
sentence ("next, run ah create tasks"). This skill makes the hand-off real -- it captures each
phase's outputs, feeds them into the next phase, records progress, and keeps the run aimed at one
completion goal without spinning forever on a phase that can't progress.

## Configuration

- **Orchestrator model**: This `ah-workflow` orchestrator itself runs on Opus with low effort.
- **Subagent defaults**: Opus with low effort for every phase subagent. Each phase subagent's
  job is to invoke the corresponding `ah-*` skill and report back the artifacts it produced.
- **Phase skills don't need a committer here**: each `ah-*` phase skill (phases 1-5) already runs its
  own `committer` subagent internally, so this orchestrator does not commit on its own. The exception
  is phase 6 (`revise-claude-md`), which is not an `ah-*` skill and does not commit -- handle its
  changes explicitly (see phase 6).
- **Progress file is the source of truth**: every phase result is written to the workflow progress
  file. That file is also what the `/goal` evaluator reads (see "Anchor the run with /goal"), so after
  each phase, echo the relevant part of it into the conversation.

## The pipeline

| # | Phase skill | Input it needs | What it produces |
|---|-------------|----------------|------------------|
| 1 | `ah-create-prd-adr` | feature description | `~/.agents/prds/prd-<repo>-<feat>.md`, `~/.agents/adrs/adr-<repo>-<feat>.md` |
| 2 | `ah-create-tasks` | PRD path, ADR path, issue number (base branch via checkout -- see note) | new git branch + `specs/<branch>/` (spec.md carries Base Branch + Issue Number metadata, plan.md, tasks.md) |
| 3 | `ah-implement-tasks` | reads `specs/<branch>` and spec.md metadata | implemented code, commits, tasks.md checked off |
| 4 | `ah-check-qa` | a running dev server (auto-detected) | QA report with Critical/Warning/Info severities |
| 5 | `ah-finalize-code` | reads spec.md metadata | simplify + tests + docs + review, then creates/updates the PR via `ah-create-pr` |
| 6 | `claude-md-management:revise-claude-md` | the current session | CLAUDE.md updated with learnings |

`ah-create-pr` is **not** a separate phase -- `ah-finalize-code` calls it at the end of phase 5.

Key input propagation: phases 1 and 2 are where data flows between skills. Phase 1 produces the
PRD and ADR paths; you pass them into phase 2. **Important about the base branch:** `ah-create-tasks`
does not take a base branch as an argument -- it reads `git branch --show-current` and uses whatever
is checked out as the base, branching off it. So the orchestrator must `git checkout <base-branch>`
*before* launching phase 2. Phase 2 then creates the feature branch off it and writes the base branch
and issue number into `spec.md`, so phases 3-5 read those themselves -- you don't need to thread them
through again. Subagents share the working directory, so the branch phase 2 creates stays checked out
for every later phase.

**Mode (feature vs update):** this orchestrator accepts an optional `mode` -- `feature`
(default) or `update`. It only changes phase 2: in `update` mode the phase-2 subagent runs
`ah-create-tasks` in *its* update mode (skip re-specify, start from clarify), which needs a
`spec number` and a `branch prefix`. Everything else is identical -- phase 1
(`ah-create-prd-adr`) still runs in both modes (update mode distills its clarify prompt from
the PRD), and the base-branch checkout before phase 2 happens in both modes
(`ah-create-tasks` reads the base from the current branch even in update mode). Default to
`feature` when no mode is given, so existing behavior is unchanged.

## Procedure

### 0. Initialize

Collect the three required inputs from the user's prompt: **feature description**, **issue number**,
**base branch**. If any is missing, ask for it before doing anything else -- the base branch in
particular is never guessed (same rule as `ah-create-pr`), because it determines where the PR targets.

Parse optional directives:

- `mode feature|update` -- which pipeline mode to run (default `feature`). In `update`
  mode, also collect a `spec number` (e.g. `001`) and a `branch prefix` (e.g. `jj`); if
  either is missing, ask for it now, before doing anything else -- update mode's phase 2
  needs both and would otherwise stall mid-run.
- `dry-run` -- plan only, run nothing (see "Dry run").
- `skip <phase>` -- skip a named phase (e.g. `skip qa`). Mark it `skipped (user request)`.
- `max-retries N` -- per-phase attempt cap (default 2).
- `resume` / `restart` -- how to handle an existing progress file.

```bash
REPO_NAME=$(basename -s .git "$(git remote get-url origin)" 2>/dev/null || basename "$(git rev-parse --show-toplevel)")
ISSUE_NUMBER="<issue number from the user>"
BASE_BRANCH="<base branch from the user>"
PROGRESS_DIR=~/.agents/arinhub/progresses
PROGRESS_FILE="${PROGRESS_DIR}/progress-workflow-${REPO_NAME}-${ISSUE_NUMBER}.md"
mkdir -p "${PROGRESS_DIR}"
```

The progress file is keyed by issue number rather than branch (the other `ah-*` skills key on branch),
because at workflow start no feature branch exists yet -- phase 2 creates it.

#### Dev-server preflight

Do this now, in step 0 -- not later at phase 4 -- so a missing dev server is known up front rather than
surfacing as a surprise skip deep into the run. Scan the common dev-server ports (the same set
`ah-check-qa` uses):

```bash
for p in 3000 3001 5173 5174 4321 8080 8888 6006; do
  curl -sf -o /dev/null "http://localhost:${p}" && echo "dev server detected on port ${p}"
done
```

- **Running** -> record the URL; phase 4 (QA) will run against it.
- **Not running** -> tell the user the QA phase will soft-skip, and offer to let them start the dev
  server now (and wait) before continuing. QA needs a live app; without one its findings are
  meaningless, so decide here rather than at phase 4.

Record the result in the progress file's **Dev server** field.

#### Initialize the progress file

Read `references/progress-workflow.md`, replace the `<REPO_NAME>`, `<ISSUE_NUMBER>`, `<BASE_BRANCH>`,
`<FEATURE_DESCRIPTION>`, `<MAX_RETRIES>`, `<DEV_SERVER_STATUS>`, and `<TIMESTAMP>` placeholders
(`TIMESTAMP` from `date`), and write to `${PROGRESS_FILE}`.

If `${PROGRESS_FILE}` already exists and `restart` was not requested:

- **Resume**: show which phases are done and ask "Resume from phase N, or restart?" On resume, skip
  completed phases.
- **Restart**: overwrite with a fresh template.

### Anchor the run with /goal

Set a session goal so Claude keeps working across turns toward completion, with a hard turn cap as the
outermost runaway guard:

```
/goal the ah-workflow progress file for issue <N> shows all six phases complete (PRD+ADR, tasks, implement, QA, finalize+PR, claude-md), or stop after <T> turns
```

Pick `T` as roughly `(remaining phases) x (max-retries) + 4` for headroom. Why this works: the `/goal`
evaluator only sees what's in the conversation and never runs tools, so after every phase you must echo
that phase's progress-file section into the conversation -- that's what lets the evaluator judge
"complete". The `or stop after <T> turns` clause is the tripwire that stops the session even if the
per-phase guards below somehow fail.

### Per-phase orchestration pattern

Apply the same loop to each of the six phases, in order. For phase _k_:

1. **Skip checks**: if the user asked to skip it, or it's already complete on resume, mark it and move
   on. For phase 4 specifically, if the preflight found no dev server, soft-skip it here.
2. **Launch a subagent** (Opus, low) whose prompt is: "Invoke the skill `<ah-skill-for-phase-k>`
   with these inputs: <inputs>. When done, report the exact artifact paths you produced and a one-line
   status." **Exception -- phase 6 runs in the main session, not a subagent** (see its bullet below).
   Pass the phase-specific inputs:
   - Phase 1: the feature description. The skill derives the feature slug itself (its convention:
     2-5 words, lowercase, hyphen-separated, no special chars -- e.g. "add a dark mode toggle to
     settings" -> `dark-mode-toggle`), and that slug determines the PRD/ADR filenames.
   - Phase 2: **first `git checkout <base-branch>`** (and `git pull` if it tracks a remote) so the new
     feature branch is cut from the right base -- `ah-create-tasks` reads the base from the current
     branch, it has no base-branch argument. Then pass the PRD path and ADR path captured from phase
     1's report, plus the issue number. (Passing the derived feature slug also works in place of the
     two paths, per `ah-create-tasks`'s feature-name input.) **In `update` mode**, additionally tell
     the subagent to run `ah-create-tasks` in update mode -- i.e. include `update <spec-number>` and
     the `branch prefix` (exported as `GIT_BRANCH_PREFIX`) in the inputs -- so it skips re-specify and
     branches as `<prefix>/<spec>-<desc>`. In `feature` mode, pass nothing extra (the default).
   - Phases 3, 5: nothing extra -- the skill reads `spec.md`. Just name the spec dir if helpful.
   - Phase 4: the detected dev-server URL.
   - Phase 6: do **not** spawn a subagent. Invoke `claude-md-management:revise-claude-md` in the main
     session, because it reflects on "this session" -- a subagent would only see its own empty context,
     not the whole pipeline you just ran. Note it has no internal committer (it's not an `ah-*` skill),
     and it runs after the PR was created in phase 5, so its CLAUDE.md edits land uncommitted: present
     them to the user and ask whether to commit + push them onto the PR branch (updating the PR) or
     leave them for manual review.
3. **Capture outputs** into the progress file: artifact paths, status, attempt count. After phase 2,
   also record the new branch name (`git branch --show-current`).
4. **Echo** the updated phase section into the conversation (for the `/goal` evaluator).
5. **Verify progress** and decide retry vs. escalate (next section).

### Anti-loop / stuck detection

A phase that fails the same way over and over must not loop forever -- that's the whole point of the
guard. For each phase, allow at most `max-retries` (default 2) attempts. Between attempts, check whether
the attempt actually changed anything:

- **Commits**: did the commit count on the branch (or the latest commit hash) change?
- **Artifacts**: did the phase's expected artifact change -- e.g. `tasks.md`, `spec.md`, the PRD/ADR
  files, or the phase's own section in its internal progress file (hash or content diff)?

If a retry produced **no change in either**, treat the phase as genuinely stuck -- retrying blindly will
just burn turns. Stop retrying that phase.

When attempts are exhausted **or** the phase is detected stuck:

- Write the failure into the workflow progress file with what was tried and the last error (the `ah-*`
  convention is "do not silently skip steps").
- **Escalate to the user** -- report what's blocked and ask how to proceed. Do not loop, and do not
  silently continue to the next phase.

The `/goal` turn clause is the final backstop: even if this per-phase logic misbehaves, the session
stops at `T` turns.

### QA soft gate (phase 4)

QA is a soft gate, not a hard stop:

- **No dev server** -> skip with a clear note in the report and progress file (decided in preflight).
- **Critical findings** -> report them and **pause the workflow before phase 5 (finalize)** so the user
  decides: fix first, proceed anyway, or abort. Don't auto-proceed past Critical findings.
- **Warning / Info** -> record them and continue.

### Dry run

If `dry-run` was passed, do not launch any subagent. Instead print:

- the resolved inputs (repo, issue number, base branch, mode -- and in update mode the
  spec number and branch prefix -- plus the derived feature slug -- 2-5 words, lowercase,
  hyphen-separated, matching `ah-create-prd-adr`'s convention),
- the six phases in order with the input each will receive,
- the target artifact paths (PRD, ADR, spec dir, QA report, progress file),
- the dev-server preflight result.

This is a cheap way to confirm the plan before committing to a full run.

### Resume

On a re-run with an existing progress file, detect completed phases and continue from the first
unfinished one. Completed phases (and their commits, done inside the phase skills) are not redone.

### Report

When the pipeline finishes (or stops at an escalation), print a final summary: the status of each
phase, paths to the PRD / ADR / spec dir / QA report, the PR URL from phase 5, and a note on the
CLAUDE.md revision from phase 6. Echo the full progress file one last time so the `/goal` evaluator can
confirm completion and clear the goal.
