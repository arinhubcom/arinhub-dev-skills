---
name: ah-implement-tasks
description: Use this skill to implement tasks from tasks.md when using the "ah" prefix. Use when asked to "ah implement tasks". Validates prerequisites, detects the project's tech stack to load relevant best-practice context (React composition patterns, performance guidelines, component building), gathers live library documentation via context7, fetches dependency source via npx opensrc, then runs speckit.implement as a subagent with TDD, progress tracking, and commit-after-pass. Implementer subagents can search GitHub for real-world patterns via grep MCP, look up docs on-the-fly via context7, and visually verify UI work via agent-browser. Supports resume from interrupted runs, monorepo scoping, and automatic retry on incomplete passes. Also use when the user mentions implementing a feature plan, executing a task list, or starting the coding phase after task creation with the "ah" prefix.
argument-hint: "optional: feature directory path, specific task IDs, skip phases, or additional instructions"
---

# Implement Tasks

Execute tasks.md implementation plan with full orchestration: pre-validation, tech-stack-aware best-practice context loading, external doc/source gathering, subagent-driven implementation, commit after each pass, automatic retry, progress tracking.

## Configuration

- **Subagent defaults**: Opus, low effort, all subagents.
- **Committer protocol**: After each implementation pass producing changes, spawn subagent **committer** (Opus, low) to run `/commit`. Pass produced no file changes: skip commit.
- **Fresh diff rule**: Each implementation subagent computes `git diff "${MERGE_BASE}"` before starting, so it sees latest state including prior-pass commits.

### External Tools

Tools below available to orchestrator and implementer subagents. Use when situation calls for it -- not mandatory every run.

| Tool | What It Does | When to Use |
|------|-------------|-------------|
| `context7` MCP | Fetches current, version-specific library documentation | During context loading (step 2) and inside implementer subagents on unfamiliar or recently-changed APIs |
| `grep` MCP | Searches 1M+ public GitHub repos for code patterns | Inside implementer subagents needing real-world usage, implementation patterns, solutions to tricky problems |
| `agent-browser` skill | Browser automation: navigate, snapshot a11y tree, screenshots, DOM inspection | Inside implementer subagents for visual verification of UI implementations (frontend tasks only) |
| `npx opensrc` | Fetches npm package source code locally | During context loading (step 2) when tasks reference libraries where type definitions alone insufficient |
| `npx repomix` | Packs codebase sections into AI-friendly format | During context loading (step 2) to give implementer compact context of relevant source files |

## Input

- **feature directory** (optional): Path to feature's spec directory containing tasks.md. If omitted, auto-detected via prerequisites script.
- **additional instructions** (optional): Extra guidance forwarded to `/speckit.implement` (e.g., specific task IDs, phases to focus on).
- **skip directives** (optional): `skip context` skips best-practice and documentation loading, `skip checklists` skips checklist verification.
- **autonomous** (optional): `autonomous` to run non-interactively. The skill then never prompts the user: it picks deterministic defaults (resume an existing run, proceed past incomplete checklists with a recorded note), fails fast on missing required inputs/metadata, and on persistent failure reports remaining tasks instead of asking how to proceed. It also suppresses its own Step 5 user report (returns only artifact paths + status). Default off (interactive). Always set by ah-workflow.

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

Determine **autonomy**: if the user passed `autonomous`, set `AUTONOMOUS=1`, else `AUTONOMOUS=0`. When `AUTONOMOUS=1`, never prompt the user anywhere in this skill -- use the deterministic defaults noted at each decision point, and fail fast on any missing required value.

#### Pre-validation

1. **Tasks exist**: Verify `${SPEC_DIR}/tasks.md` exists. If missing, stop: "No tasks.md found at `${SPEC_DIR}/tasks.md`. Run `/ah-create-tasks` first."

2. **Spec exists**: Verify `${SPEC_DIR}/spec.md` exists. If missing, stop: "No spec.md found. The spec directory may be incomplete."

3. **No uncommitted changes**: Run `git status --porcelain`. If uncommitted changes exist, ask user: stash, commit first, or abort. When `AUTONOMOUS=1`, do not ask -- fail fast with a clear error listing the uncommitted paths (the caller must hand over a clean tree).

#### Extract metadata

Read `${SPEC_DIR}/spec.md`, extract:

- `BASE_BRANCH` from **Base Branch** metadata field
- `ISSUE_NUMBER` from **Issue Number** metadata field

If either missing, ask the user before proceeding (or, when `AUTONOMOUS=1`, fail fast with a clear error naming the missing field).

#### Detect tech stack

Read `${SPEC_DIR}/plan.md` (and `package.json` if it exists) to determine tech stack:

| Stack | Indicators |
|-------|-----------|
| React / Next.js | `react` in dependencies, `.tsx`/`.jsx` files, Next.js config |
| Vue | `vue` in dependencies, `.vue` files |
| Svelte | `svelte` in dependencies, `.svelte` files |
| Angular | `@angular/core` in dependencies |
| Non-frontend | No frontend framework detected |

Store detected stack as `TECH_STACK` for step 2.

Also extract `KEY_LIBRARIES` -- primary libraries referenced in `tasks.md` and `plan.md` (e.g., `react-query`, `zod`, `drizzle-orm`, `tailwindcss`). Used in step 2 for documentation fetching.

#### Monorepo detection

If repo is a monorepo (multiple `package.json` files, workspace config in root `package.json`, or monorepo tools like turborepo/nx), identify target application from changed file paths or tasks.md references. Scope all commands (test, lint, build) to that application.

#### Initialize progress file

Progress is recorded as a deterministic append-only log written by a shell helper -- not an LLM-maintained markdown file. Source the helper (resolve path relative to this SKILL.md's directory) and initialize:

```bash
source "<skill_dir>/scripts/progress.sh"
progress_init "${PROGRESS_FILE}" "${BRANCH_NAME}" "${BASE_BRANCH}" "${ISSUE_NUMBER}"
```

`progress_init` writes the header only when the file does not yet exist, so a re-run leaves an existing log untouched.

If `${PROGRESS_FILE}` already existed before this run:

- **Resume**: Inspect completed steps with `grep '^step|' "${PROGRESS_FILE}"`. If some steps are logged `done`/`skipped(...)`, show them and ask: "Resume from step N, or restart?" If resuming, skip completed steps and their commits. When `AUTONOMOUS=1`, do not ask -- default to resuming from the first incomplete step.
- **Restart**: `rm "${PROGRESS_FILE}"` and call `progress_init` again for a fresh log.

Record each step with `progress_log "${PROGRESS_FILE}" <n> <name> <status> [commit]` (status: `done`, `skipped(user)`, `skipped(none)`, `failed`). The helper stamps timestamps itself.

#### Compute merge base

```bash
git fetch origin "${BASE_BRANCH}" --quiet
MERGE_BASE=$(git merge-base "origin/${BASE_BRANCH}" HEAD)
```

### 1. Check Checklists (main session)

Skip if user specified `skip checklists`.

If `${SPEC_DIR}/checklists/` exists, scan all checklist files:

- Count total, completed (`[X]`/`[x]`), incomplete (`[ ]`) items per file
- Display status table:

  ```text
  | Checklist   | Total | Done | Remaining | Status |
  |-------------|-------|------|-----------|--------|
  | ux.md       | 12    | 12   | 0         | PASS   |
  | test.md     | 8     | 5    | 3         | FAIL   |
  ```

- **If any incomplete**: Ask "Some checklists are incomplete. Proceed anyway?" Wait for user response. If user declines, halt execution. When `AUTONOMOUS=1`, do not ask -- proceed anyway and record a one-line note listing which checklists were incomplete.
- **If all complete or no checklists directory**: Proceed automatically.

`progress_log "${PROGRESS_FILE}" 1 checklists done` (or `skipped(user)` if skipped).

### 2. Load Implementation Context

Skip if user specified `skip context`.

Gathers three context categories implementer subagents use: best-practice skills, live library documentation, codebase context.

#### 2a. Best-practice skills

Based on `TECH_STACK` from step 0, determine which skills the implementation subagent loads:

| Tech Stack | Skills to Load |
|-----------|---------------|
| React / Next.js | `/vercel-composition-patterns`, `/vercel-react-best-practices`, `/building-components` |
| Vue / Svelte / Angular | `/building-components` |
| Non-frontend | (none) |

Store skill list as `CONTEXT_SKILLS`.

#### 2b. Library documentation

For each library in `KEY_LIBRARIES`, use `context7` to fetch current documentation relevant to tasks. Store as `LIBRARY_DOCS` -- forwarded to implementer subagent prompt.

Limit to **5 most task-relevant libraries**. Skip unresolvable libraries silently.

#### 2c. Dependency source

Scan `tasks.md` for tasks needing deep npm-package integration (extending internals, wrapping unexported utilities, working around undocumented behavior). Use `npx opensrc` to fetch those packages locally. Implementer subagent then reads source directly.

Skip if no tasks need source-level understanding. Limit to **3 packages**.

#### 2d. Codebase context

If `tasks.md` references many existing files (5+), use `npx repomix` to pack relevant directories into a compressed file. Derive scope from file paths in `tasks.md` and `plan.md`. Implementer reads this at session start for codebase overview.

Skip if scope is narrow -- implementer can read files directly.

#### 2e. Confirm and record

Briefly confirm to user which contexts will load (one line per category). This is informational only -- do not pause for a response; when `AUTONOMOUS=1`, emit it only to the log, not to the user:

```text
Skills: /vercel-composition-patterns, /vercel-react-best-practices, /building-components
Docs: react-query (TanStack Query v5), zod (v3.23), tailwindcss (v4)
Source: @tanstack/react-query (npx opensrc)
Codebase: src/components/**, src/hooks/** (npx repomix, compressed)
```

`progress_log "${PROGRESS_FILE}" 2 context done` (or `skipped(user)` if skipped).

### 3. Execute Implementation (Pass 1)

Spawn subagent **implementer** (Opus, low):

**Context loading phase** (beginning of subagent session):
- If `CONTEXT_SKILLS` not empty, invoke each skill to load best-practice guidance
- If `LIBRARY_DOCS` not empty, include fetched documentation summaries in subagent prompt
- If repomix context file generated, read it for codebase overview
- If `npx opensrc` packages fetched, mention their paths so subagent reads source when needed

**Implementation phase**:
- Run `/speckit.implement` with any user-provided arguments forwarded
- Loaded best practices and documentation remain in context throughout -- apply them when writing components, structuring code, making architectural micro-decisions

**Available tools during implementation** -- all external tools from Configuration section available. Use as needed, not mandatory.

After subagent completes, `progress_log "${PROGRESS_FILE}" 3 implement-pass-1 done <commit>` (use `failed` if the pass errored). Per-step prose (tasks completed/remaining, tools used) goes into the final report, not the log.

Spawn subagent **committer** (Opus, low): Run `/commit`.

### 4. Verify and Retry

Read `${SPEC_DIR}/tasks.md`, check whether all tasks marked `[X]`.

**If all complete**: Skip to step 5.

**If tasks remain (`[ ]`)**: Run up to 2 additional passes (3 total). For each retry:

1. Report which tasks still open (task IDs and descriptions).
2. **Diagnose blockers** before retrying blindly -- use external tools from Configuration to gather context (docs, GitHub examples, screenshots, dependency source); include diagnosis in retry prompt.
3. Spawn subagent **implementer-pass-N** (Opus, low):
   - Load `CONTEXT_SKILLS` again (fresh context window needs them reloaded)
   - Include `LIBRARY_DOCS` and any new documentation gathered during diagnosis
   - Include specific diagnosis and hints for failing tasks
   - Run `/speckit.implement` -- picks up uncompleted tasks automatically because only `[ ]` tasks remain
   - Same external tools available as in pass 1
4. `progress_log "${PROGRESS_FILE}" <3+N> implement-pass-N done <commit>` (or `failed`).
5. Spawn subagent **committer** (Opus, low): Run `/commit`.
6. Re-read `tasks.md` -- if all complete, break out of retry loop.

**If still incomplete after 3 passes**: Report remaining tasks with IDs and descriptions, ask user how to proceed:
- Retry again
- Skip remaining tasks and continue to report
- Investigate specific failures

When `AUTONOMOUS=1`, do not ask -- skip remaining tasks and continue to the report, listing the remaining task IDs/descriptions so the caller can surface them.

### 5. Report

**Interactive mode (`AUTONOMOUS=0`)**: Present summary:

- Path to `${PROGRESS_FILE}` plus a compact rendering via `progress_render "${PROGRESS_FILE}"`
- Completed tasks by phase (Setup, Tests, Core, Integration, Polish)
- Any failures or skipped tasks with reasons
- How many passes needed (1, 2, or 3)
- External tools used and what they contributed
- Test results and coverage status
- Next steps: run `/ah-finalize-code` to prepare for PR

**Autonomous mode (`AUTONOMOUS=1`)**: skip the user-facing summary; return only the artifact paths (progress file, tasks.md completion) plus a one-line status (and any remaining task IDs) to the caller.

## Workflow Diagram

```
[0] Initialize -- validate, detect tech stack + key libraries, check/resume progress
 |
 v
[1] Check checklists (main session, may pause for user)
 |
 v
[2] Load implementation context
    [2a] Best-practice skills
    [2b] Library docs (context7)
    [2c] Dependency source (npx opensrc)    -- skip if not needed
    [2d] Codebase context (npx repomix)     -- skip if scope is narrow
 |
 v
[3] Subagent: load context + /speckit.implement (pass 1) --> commit
    External tools available
 |
 v
[4] All tasks [X]?
    |            |
   YES          NO
    |            |-- Diagnose blockers (external tools)
    |            |-- Subagent: /speckit.implement (pass 2) --> commit
    |            |-- All [X]? --NO--> diagnose + pass 3 --> commit
    |            |                      |
    |           YES                  All [X]? --NO--> ask user
    |            |                      |
    v            v                     YES
[5] Report  <--------------------------+
```

## Important Notes

- Every subagent runs Opus, low. `committer` only creates a commit via `/commit`.
- `${PROGRESS_FILE}` is an append-only log written by `scripts/progress.sh`, not an LLM-maintained markdown file. Each step appends one `progress_log` line; no markdown re-reads/re-writes.
- **Resume support**: Re-running detects the existing log via `grep '^step|'`, offers resume from last incomplete step. Completed steps and their commits skipped.
- **Timestamps**: The helper stamps each line from `date` -- the model never supplies timestamps or durations.
- **Tech stack detection** informs which best-practice skills load. React/Next.js gets full set; other frontend frameworks get component-building guidance; non-frontend skips context loading entirely.
- **External tools are situational**: Tools in Configuration section available but not mandatory every run. Use when they add value -- unfamiliar APIs, visual UI work, deep dependency integration, large codebase scope. Skip for straightforward tasks.
- **Monorepo support**: If repo is a monorepo, commands scoped to target application identified from tasks.md or changed file paths.
- All Spec Kit output files live in `specs/<branch-name>/`.
- If any subagent fails, note failure in `${PROGRESS_FILE}` and report to user. Do not silently skip steps.
- After implementation complete, natural next step is `/ah-finalize-code` -- handles simplification, testing, docs, code review, PR creation.
- Base branch and issue number come from `spec.md` metadata -- if missing, ask the user (or, when `AUTONOMOUS=1`, fail fast with a clear error). Steps that interact with the user (uncommitted-changes, resume, checklist gate, after-3-passes) only do so when `AUTONOMOUS=0`; with the `autonomous` flag they take deterministic defaults or fail fast, as noted at each step.
