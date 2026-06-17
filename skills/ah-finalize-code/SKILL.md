---
name: ah-finalize-code
description: Use this skill to finalize code changes before creating a PR when using the "ah" prefix. Use when asked to "ah finalize code", "ah finalize changes", or "ah finalize". Runs a multi-step workflow that simplifies code, creates a retrospective, adds tests, updates JSDoc references, updates documentation, optimizes and syncs specs, performs a code review, and creates a pull request -- committing after each step. Steps with no relevant changes are auto-skipped to save time. Supports resuming interrupted runs and skipping steps by name (e.g., "ah finalize code skip docs").
argument-hint: "optional: 'skip docs', 'skip tests', 'skip specs' to skip specific steps; 'autonomous' to run non-interactively"
---

# Finalize Code

Orchestrate the full pre-PR finalization workflow for the current branch. Specialized subagents handle each aspect -- simplification, testing, documentation, specs, code review -- with a commit after every step that produces changes. The workflow ends by creating a pull request.

## Configuration

- **Subagent defaults**: Opus with low effort for all subagents.
- **Committer protocol**: After each step that produces changes, spawn subagent **committer** (Opus, low) to run `/commit`. If a step was skipped or produced no file changes, skip the commit too. Applies to every step below; not repeated in each section.
- **Fresh diff rule**: Each subagent that analyzes code must compute `git diff "${MERGE_BASE}"` before starting, so it always sees the latest state including commits from previous steps.

## Skip Conditions

Steps auto-skip when their input isn't relevant. The orchestrator evaluates these after computing the diff in step 0 and marks auto-skipped steps in the progress file.

| Step | Skips when |
|------|-----------|
| 4a JSDoc Updater | Diff contains no `.ts`, `.tsx`, `.js`, or `.jsx` files |
| 4b Tests Docs Updater | No `docs/tests/` directory exists in the repo |
| 5a API Docs Updater | No `docs:generate` script in package.json, or diff touches only internal/private code |

Steps 1-3, 5b, 6-8 always run. Users can also skip steps manually -- see step 0.

## Procedure

### 0. Initialize

Determine **autonomy**: if the user passed `autonomous`, set `AUTONOMOUS=1`, else `AUTONOMOUS=0`. When `AUTONOMOUS=1`, never prompt the user anywhere in this skill -- take the deterministic defaults / fail-fast noted at each decision point, and run the retrospective non-interactively (see step 2).

```bash
BRANCH_NAME=$(git branch --show-current)
REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
SAFE_BRANCH_NAME=$(echo "${BRANCH_NAME}" | tr '/' '-')
SPEC_DIR="specs/${BRANCH_NAME}"
PROGRESS_DIR=~/.agents/arinhub/progresses
PROGRESS_FILE="${PROGRESS_DIR}/progress-pr-${REPO_NAME}-${SAFE_BRANCH_NAME}.md"

mkdir -p "${PROGRESS_DIR}"
```

#### Pre-validation

1. **Branch has changes**: Compare against the expected base. If no commits ahead, abort: "Nothing to finalize."

   ```bash
   git log --oneline -1
   ```

2. **Spec directory exists**: Verify `${SPEC_DIR}/spec.md` exists. If missing, stop: "No spec found at `${SPEC_DIR}/spec.md`. Run the task creation workflow first."

3. **No uncommitted changes**: Run `git status --porcelain`. If there are uncommitted changes, ask the user whether to stash, commit first, or abort. When `AUTONOMOUS=1`, do not ask -- fail fast with a clear error listing the uncommitted paths.

#### Extract metadata

Read `${SPEC_DIR}/spec.md` and extract:

- `BASE_BRANCH` from the **Base Branch** metadata field
- `ISSUE_NUMBER` from the **Issue Number** metadata field

If either is missing, ask the user before proceeding (or, when `AUTONOMOUS=1`, fail fast with a clear error naming the missing field).

#### Step selection

Parse the user's prompt for skip instructions:

- `skip docs` -- skips steps 4a, 4b, 5a
- `skip tests` -- skips step 3
- `skip specs` -- skips step 5b
- `skip <step-name>` -- skips the named step (e.g., `skip retrospective`)
- `only <steps>` -- runs only the listed steps plus 0, 7, 8 (always required)

Record user-skipped steps with `progress_log "${PROGRESS_FILE}" <n> <name> "skipped(user)"`.

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

Verify the branch has commits ahead:

```bash
AHEAD_COUNT=$(git rev-list --count "${MERGE_BASE}"..HEAD)
if [ "${AHEAD_COUNT}" -eq 0 ]; then
  echo "No commits ahead of ${BASE_BRANCH}. Nothing to finalize."
  exit 1
fi
```

#### Evaluate skip conditions

Compute the diff file list and check each auto-skip condition from the table above. Record auto-skipped steps with `progress_log "${PROGRESS_FILE}" <n> <name> "skipped(none)"`.

If the repository is a monorepo, identify the correct application from the changed file paths and scope all commands (preflight, test, lint) to that application.

### 1. Simplify

Spawn subagent **simplifier**:

- Get fresh diff, then run `/simplify` with prompt: `Simplify changes in current diff only, then check "pnpm preflight"`
- `progress_log "${PROGRESS_FILE}" 1 simplifier done <commit>`

### 2. Retrospective

Spawn subagent **retrospective**:

- Run `/speckit.retrospective.analyze`
- When `AUTONOMOUS=1`, prepend this directive to the subagent's prompt: "Run `/speckit.retrospective.analyze` non-interactively. Do NOT ask the user anything. Respect the command's default-NO confirmation policy: do NOT modify `spec.md`, and do NOT stop on the <50%-completion gate -- instead record findings and follow-up actions in `retrospective.md` and continue." This avoids the command's interactive STOP/<50% and spec-change y/N gates, which would otherwise deadlock a subagent with no user channel.
- After the skill finishes, fix any follow-up actions listed in the retrospective.md file and update the retrospective file accordingly
- `progress_log "${PROGRESS_FILE}" 2 retrospective done <commit>`

### 3. Test Creator

Spawn subagent **test-creator**:

- Get fresh diff, then prompt: `Run command "pnpm test:coverage", find the coverage file location from the test:coverage script configuration, read coverage file, add important tests for changes in current diff only, optimize count of tests to avoid redundancy, verify coverage improvements, then run "pnpm preflight"`
- `progress_log "${PROGRESS_FILE}" 3 test-creator done <commit>`

### 4. JSDoc Updater + Tests Docs Updater (parallel)

Spawn both subagents **in parallel** -- they modify non-overlapping file sets (source code JSDoc comments vs. `docs/tests/` markdown). Skip either if its skip condition is met.

#### 4a: jsdoc-updater

- Get fresh diff, then prompt: `In JSDoc comments on the current diff, add/update spec references using shorthand "SXXX:FR-YYY" or "SXXX:SC-YYY" format (S001=001-minute-qset-react) with short descriptions, remove outdated refs and task numbers (e.g. T012), ensure standard JSDoc format, add missing shorthand to spec.md if needed, and run formatter + linter on modified files.`
- `progress_log "${PROGRESS_FILE}" 4a jsdoc-updater done`

#### 4b: tests-docs-updater

- Get fresh diff, then prompt: `Update docs/tests/tests-*.md files to reflect changes in current diff only, ensure that each test file follows the established format and includes all necessary details. If no code changes are detected, do not make changes. Check if there are any redundant or unnecessary tests in changes in current diff -- if so, remove redundant tests.`
- `progress_log "${PROGRESS_FILE}" 4b tests-docs-updater done`

After **both** complete (or the non-skipped one completes), commit.

### 5. API Docs Updater + Spec Finalizer (parallel)

Spawn both subagents **in parallel** -- they operate on completely independent file sets (`docs/api/` vs. `specs/<branch>/`). Skip API Docs if its skip condition is met.

#### 5a: api-docs-updater

- Prompt: `Run "pnpm docs:generate", then extract type definitions, interfaces, and function signatures from "docs/typedoc" output to create/update "docs/api/index.md" (overview + TOC) and topic files ("docs/api/api-components.md", "api-hooks.md", etc.) with one file per logical section, validate all index links resolve to existing files, and report progress -- do not generate code examples, tutorials, or document private APIs.`
- `progress_log "${PROGRESS_FILE}" 5a api-docs-updater done`

#### 5b: spec-finalizer

This step consolidates the spec directory (removing consumed planning artifacts), then updates the remaining essential files to reflect the actual implementation. Combined into one subagent because both phases operate on `${SPEC_DIR}/` and the update phase depends on the consolidation phase completing first.

- Get fresh diff, then read the prompt from `references/spec-finalizer-prompt.md` (substituting `${SPEC_DIR}` with the actual path) and execute it
- `progress_log "${PROGRESS_FILE}" 5b spec-finalizer done`

After **both** complete (or the non-skipped one completes), commit.

### 6. Code Review

Spawn subagent **code-reviewer**:

- Run `/ah-review-code` with prompt: `base branch is ${BASE_BRANCH}, after code review read the code review file and fix all issues you find, then check "pnpm preflight"`
- `progress_log "${PROGRESS_FILE}" 6 code-reviewer done <commit>`

Runs last (before PR creation) so it reviews everything -- code, docs, and spec changes from all previous steps.

### 7. Create PR

Spawn subagent **pr-creator**:

- Run `/ah-create-pr` with prompt: `base branch: ${BASE_BRANCH}, issue number: ${ISSUE_NUMBER}` (when `AUTONOMOUS=1`, append `, autonomous` so the PR step also runs non-interactively)
- `progress_log "${PROGRESS_FILE}" 7 pr-creator done "" "<PR URL>"` then `progress_done "${PROGRESS_FILE}" completed`

### 8. Report to User

**Interactive mode (`AUTONOMOUS=0`)**: Present a summary:

- Path to `${PROGRESS_FILE}` plus a compact rendering via `progress_render "${PROGRESS_FILE}"`
- PR URL
- Steps completed, skipped (with reasons), and any failures
- Unresolved findings from the code review

**Autonomous mode (`AUTONOMOUS=1`)**: skip the user-facing summary; return only the PR URL, the progress file path, and a one-line status to the caller. The retrospective follow-ups live in `${SPEC_DIR}/retrospective.md` for the orchestrator to surface.

## Workflow Diagram

```
[0] Initialize & validate
 |
 v
[1] Simplify --> commit
 |
 v
[2] Retrospective --> commit
 |
 v
[3] Test Creator --> commit
 |
 v
[4] JSDoc Updater ----+
    Tests Docs Updater-+--> commit  (parallel, auto-skip eligible)
 |
 v
[5] API Docs Updater ---+
    Spec Finalizer ------+--> commit  (parallel, auto-skip eligible)
 |
 v
[6] Code Review --> commit
 |
 v
[7] Create PR
 |
 v
[8] Report to User
```

## Important Notes

- Every subagent runs on Opus with low. The `committer` only creates a commit via `/commit`.
- The `${PROGRESS_FILE}` is an append-only log written by `scripts/progress.sh`, not an LLM-maintained markdown file. Each step appends one `progress_log` line.
- **Resume support**: Re-running the skill detects the existing log via `grep '^step|'` and offers to resume from the last incomplete step. Completed steps and their commits are skipped.
- **Timestamps**: The helper stamps each line from `date` -- the model never supplies timestamps or durations.
- **Skip behavior**: Auto-skipped (`skipped(none)`) and user-skipped (`skipped(user)`) steps are logged with the reason. Skipped steps don't trigger commits.
- All Spec Kit output files live in `specs/<branch-name>/`.
- If any subagent fails, log it with `progress_log ... failed` and report to the user. Do not silently skip steps.
- In a monorepo, identify the correct application from changed file paths and scope all commands to that application.
- Base branch and issue number come from `spec.md` metadata -- if missing, ask the user (or, when `AUTONOMOUS=1`, fail fast with a clear error). All user-interaction points (uncommitted-changes, resume, retrospective gates) only apply when `AUTONOMOUS=0`; with the `autonomous` flag they take deterministic defaults / fail fast, as noted at each step.
