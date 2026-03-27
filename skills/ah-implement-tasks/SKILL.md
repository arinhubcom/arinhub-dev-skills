---
name: ah-implement-tasks
description: Use this skill to implement tasks from tasks.md when using the "ah" prefix. Use when asked to "ah implement tasks". Validates prerequisites, detects the project's tech stack to load relevant best-practice context (React composition patterns, performance guidelines, component building), then runs speckit.implement as a subagent with TDD, progress tracking, and commit-after-pass. Supports resume from interrupted runs, monorepo scoping, and automatic retry on incomplete passes. Also use when the user mentions implementing a feature plan, executing a task list, or starting the coding phase after task creation with the "ah" prefix.
argument-hint: "optional: feature directory path, specific task IDs, skip phases, or additional instructions"
---

# Implement Tasks

Execute the implementation plan from tasks.md with full orchestration: pre-validation, tech-stack-aware best-practice context loading, subagent-driven implementation with commits after each pass, automatic retry, and progress tracking.

## Configuration

- **Subagent defaults**: Opus with ultrathink effort for all subagents except `committer` (Sonnet).
- **Committer protocol**: After each implementation pass that produces changes, spawn subagent **committer** (Sonnet) to run `/commit`. If a pass produced no file changes, skip the commit.
- **Fresh diff rule**: Each implementation subagent computes `git diff "${MERGE_BASE}"` before starting, so it always sees the latest state including commits from previous passes.

## Input

- **feature directory** (optional): Path to the feature's spec directory containing tasks.md. If omitted, auto-detected via the prerequisites script.
- **additional instructions** (optional): Extra guidance to forward to `/speckit.implement` (e.g., specific task IDs, phases to focus on).
- **skip directives** (optional): `skip context` to skip best-practice loading, `skip checklists` to skip checklist verification.

## Procedure

### 0. Initialize

```bash
BRANCH_NAME=$(git branch --show-current)
REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
SAFE_BRANCH_NAME=$(echo "${BRANCH_NAME}" | tr '/' '-')
SPEC_DIR="specs/${BRANCH_NAME}"
PROGRESS_DIR=~/.agents/arinhub/progresses
PROGRESS_FILE="${PROGRESS_DIR}/progress-implement-${REPO_NAME}-${SAFE_BRANCH_NAME}.md"

mkdir -p "${PROGRESS_DIR}"
```

#### Pre-validation

1. **Tasks exist**: Verify `${SPEC_DIR}/tasks.md` exists. If missing, stop: "No tasks.md found at `${SPEC_DIR}/tasks.md`. Run `/ah-create-tasks` first."

2. **Spec exists**: Verify `${SPEC_DIR}/spec.md` exists. If missing, stop: "No spec.md found. The spec directory may be incomplete."

3. **No uncommitted changes**: Run `git status --porcelain`. If there are uncommitted changes, ask the user whether to stash, commit first, or abort.

#### Extract metadata

Read `${SPEC_DIR}/spec.md` and extract:

- `BASE_BRANCH` from the **Base Branch** metadata field
- `ISSUE_NUMBER` from the **Issue Number** metadata field

If either is missing, ask the user before proceeding.

#### Detect tech stack

Read `${SPEC_DIR}/plan.md` (and `package.json` if it exists) to determine the project's tech stack:

| Stack | Indicators |
|-------|-----------|
| React / Next.js | `react` in dependencies, `.tsx`/`.jsx` files, Next.js config |
| Vue | `vue` in dependencies, `.vue` files |
| Svelte | `svelte` in dependencies, `.svelte` files |
| Angular | `@angular/core` in dependencies |
| Non-frontend | No frontend framework detected |

Store the detected stack as `TECH_STACK` for step 2.

#### Monorepo detection

If the repository is a monorepo (multiple `package.json` files, workspace configuration in root `package.json`, or monorepo tools like turborepo/nx), identify the target application from the changed file paths or tasks.md references. Scope all commands (test, lint, build) to that application.

#### Initialize progress file

Read the template from `references/progress-implement.md`, replace all `<BRANCH_NAME>`, `<BASE_BRANCH>`, `<ISSUE_NUMBER>`, `<TECH_STACK>`, and `<TIMESTAMP>` placeholders with actual values, and write to `${PROGRESS_FILE}`.

If `${PROGRESS_FILE}` already exists:

- **Resume**: If some steps are completed, show progress and ask: "Resume from step N, or restart?" If resuming, skip completed steps and their commits.
- **Restart**: Overwrite with a fresh template.

#### Compute merge base

```bash
git fetch origin "${BASE_BRANCH}" --quiet
MERGE_BASE=$(git merge-base "origin/${BASE_BRANCH}" HEAD)
```

### 1. Check Checklists (main session)

Skip if user specified `skip checklists`.

If `${SPEC_DIR}/checklists/` exists, scan all checklist files:

- Count total, completed (`[X]`/`[x]`), and incomplete (`[ ]`) items per file
- Display a status table:

  ```text
  | Checklist   | Total | Done | Remaining | Status |
  |-------------|-------|------|-----------|--------|
  | ux.md       | 12    | 12   | 0         | PASS   |
  | test.md     | 8     | 5    | 3         | FAIL   |
  ```

- **If any incomplete**: Ask "Some checklists are incomplete. Proceed anyway?" Wait for user response. If the user declines, halt execution.
- **If all complete or no checklists directory**: Proceed automatically.

Update `${PROGRESS_FILE}` Checklists section.

### 2. Load Best Practices Context

Skip if user specified `skip context`.

Based on `TECH_STACK` detected in step 0, determine which skills the implementation subagent should load:

| Tech Stack | Skills to Load |
|-----------|---------------|
| React / Next.js | `/vercel-composition-patterns`, `/vercel-react-best-practices`, `/building-components` |
| Vue / Svelte / Angular | `/building-components` |
| Non-frontend | (none -- skip this step entirely) |

Store the skill list as `CONTEXT_SKILLS`. The implementation subagent in step 3 invokes these skills at the start of its session so the guidance is in context during coding.

Briefly confirm to the user which best-practice contexts will be loaded (one line each).

Update `${PROGRESS_FILE}` Context Loading section.

### 3. Execute Implementation (Pass 1)

Spawn subagent **implementer** (Opus, ultrathink):

- If `CONTEXT_SKILLS` is not empty, first invoke each skill to load best-practice guidance into the session
- Then run `/speckit.implement` with any user-provided arguments forwarded
- The loaded best practices remain in context throughout -- apply them when writing components, structuring code, and making architectural micro-decisions

After the subagent completes, update `${PROGRESS_FILE}` Implementation Pass 1 section with tasks completed, tasks remaining, and any errors.

Spawn subagent **committer** (Sonnet): Run `/commit`.

### 4. Verify and Retry

Read `${SPEC_DIR}/tasks.md` and check whether all tasks are marked `[X]`.

**If all complete**: Skip to step 5.

**If tasks remain (`[ ]`)**: Run up to 2 additional passes (3 total). For each retry:

1. Report which tasks are still open (task IDs and descriptions).
2. Spawn subagent **implementer-pass-N** (Opus, ultrathink):
   - Load `CONTEXT_SKILLS` again (fresh context window needs them reloaded)
   - Run `/speckit.implement` -- it picks up uncompleted tasks automatically because only `[ ]` tasks remain
3. Update `${PROGRESS_FILE}` Implementation Pass N section.
4. Spawn subagent **committer** (Sonnet): Run `/commit`.
5. Re-read `tasks.md` -- if all complete, break out of retry loop.

**If still incomplete after 3 passes**: Report the remaining tasks with their IDs and descriptions, and ask the user how to proceed:
- Retry again
- Skip remaining tasks and continue to report
- Investigate specific failures

### 5. Report

Present a summary:

- Path to `${PROGRESS_FILE}` with the full audit trail
- Completed tasks by phase (Setup, Tests, Core, Integration, Polish)
- Any failures or skipped tasks with reasons
- How many passes were needed (1, 2, or 3)
- Test results and coverage status
- Next steps: run `/ah-finalize-code` to prepare for PR

## Workflow Diagram

```
[0] Initialize -- validate, detect tech stack, check/resume progress
 |
 v
[1] Check checklists (main session, may pause for user)
 |
 v
[2] Determine best-practice skills to load
 |
 v
[3] Subagent: load context + /speckit.implement (pass 1) --> commit
 |
 v
[4] All tasks [X]?
    |            |
   YES          NO
    |            |-- Subagent: /speckit.implement (pass 2) --> commit
    |            |-- All [X]? --NO--> pass 3 --> commit
    |            |                      |
    |           YES                  All [X]? --NO--> ask user
    |            |                      |
    v            v                     YES
[5] Report  <--------------------------+
```

## Important Notes

- Every subagent except `committer` runs on Opus with ultrathink. The `committer` runs on Sonnet and only creates a commit via `/commit`.
- The `${PROGRESS_FILE}` is a running audit trail. Each step updates its section immediately after finishing.
- **Resume support**: Re-running the skill detects an existing progress file and offers to resume from the last incomplete step. Completed steps and their commits are skipped.
- **Duration tracking**: Each subagent records start/end timestamps and computes duration (e.g., `duration: 2m 34s`).
- **Tech stack detection** informs which best-practice skills are loaded. React/Next.js projects get the full set; other frontend frameworks get component-building guidance; non-frontend projects skip context loading entirely.
- **Monorepo support**: If the repo is a monorepo, commands are scoped to the target application identified from tasks.md or changed file paths.
- All Spec Kit output files live in `specs/<branch-name>/`.
- If any subagent fails, note the failure in `${PROGRESS_FILE}` and report to the user. Do not silently skip steps.
- After implementation is complete, the natural next step is `/ah-finalize-code` which handles simplification, testing, docs, code review, and PR creation.
- Base branch and issue number come from `spec.md` metadata -- if missing, ask the user.
