---
name: ah-finalize-code
description: Use this skill to finalize code changes before creating a PR when using the "ah" prefix. Use when asked to "ah finalize code", "ah finalize changes", or "ah finalize". Runs a multi-step workflow that simplifies code, creates a retrospective, adds tests, updates JSDoc references, updates documentation, optimizes and syncs specs, performs a code review, and creates a pull request -- committing after each step. Steps with no relevant changes are auto-skipped to save time. Supports resuming interrupted runs and skipping steps by name (e.g., "ah finalize code skip docs").
argument-hint: "optional: 'skip docs', 'skip tests', 'skip specs' to skip specific steps"
---

# Finalize Code

Orchestrate the full pre-PR finalization workflow for the current branch. Specialized subagents handle each aspect -- simplification, testing, documentation, specs, code review -- with a commit after every step that produces changes. The workflow ends by creating a pull request.

## Configuration

- **Subagent defaults**: Opus with ultrathink effort for all subagents except `committer` (Sonnet).
- **Committer protocol**: After each step that produces changes, spawn subagent **committer** (Sonnet) to run `/commit`. If a step was skipped or produced no file changes, skip the commit too. This applies to every step below and won't be repeated in each section.
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

3. **No uncommitted changes**: Run `git status --porcelain`. If there are uncommitted changes, ask the user whether to stash, commit first, or abort.

#### Extract metadata

Read `${SPEC_DIR}/spec.md` and extract:

- `BASE_BRANCH` from the **Base Branch** metadata field
- `ISSUE_NUMBER` from the **Issue Number** metadata field

If either is missing, ask the user before proceeding.

#### Step selection

Parse the user's prompt for skip instructions:

- `skip docs` -- skips steps 4a, 4b, 5a
- `skip tests` -- skips step 3
- `skip specs` -- skips step 5b
- `skip <step-name>` -- skips the named step (e.g., `skip retrospective`)
- `only <steps>` -- runs only the listed steps plus 0, 7, 8 (always required)

Mark user-skipped steps in the progress file as `status: skipped (user request)`.

#### Initialize progress file

Read the template from `references/progress-pr.md`, replace all `<BRANCH_NAME>`, `<BASE_BRANCH>`, `<ISSUE_NUMBER>`, and `<TIMESTAMP>` placeholders with actual values, and write to `${PROGRESS_FILE}`.

If `${PROGRESS_FILE}` already exists:

- **Resume**: If some steps are completed, show progress and ask: "Resume from step N, or restart?" If resuming, skip completed steps and their commits.
- **Restart**: Overwrite with a fresh template.

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

Compute the diff file list and check each auto-skip condition from the table above. Mark auto-skipped steps as `status: skipped (no relevant changes)`.

If the repository is a monorepo, identify the correct application from the changed file paths and scope all commands (preflight, test, lint) to that application.

### 1. Simplify

Spawn subagent **simplifier**:

- Get fresh diff, then run `/simplify` with prompt: `Simplify changes in current diff only, then check "pnpm preflight"`
- Update `${PROGRESS_FILE}` Simplifier section

### 2. Retrospective

Spawn subagent **retrospective**:

- Run `/speckit.retrospective.analyze`
- After the skill finishes, fix any follow-up actions listed in the retrospective.md file and update the retrospective file accordingly
- Update `${PROGRESS_FILE}` Retrospective section

### 3. Test Creator

Spawn subagent **test-creator**:

- Get fresh diff, then prompt: `Run command "pnpm test:coverage", find the coverage file location from the test:coverage script configuration, read coverage file, add important tests for changes in current diff only, optimize count of tests to avoid redundancy, verify coverage improvements, then run "pnpm preflight"`
- Update `${PROGRESS_FILE}` Test Creator section

### 4. JSDoc Updater + Tests Docs Updater (parallel)

Spawn both subagents **in parallel** -- they modify non-overlapping file sets (source code JSDoc comments vs. `docs/tests/` markdown). Skip either if its skip condition is met.

#### 4a: jsdoc-updater

- Get fresh diff, then prompt: `In JSDoc comments on the current diff, add/update spec references using shorthand "SXXX:FR-YYY" or "SXXX:SC-YYY" format (S001=001-minute-qset-react) with short descriptions, remove outdated refs and task numbers (e.g. T012), ensure standard JSDoc format, add missing shorthand to spec.md if needed, and run formatter + linter on modified files.`
- Update `${PROGRESS_FILE}` JSDoc Updater section

#### 4b: tests-docs-updater

- Get fresh diff, then prompt: `Update docs/tests/tests-*.md files to reflect changes in current diff only, ensure that each test file follows the established format and includes all necessary details. If no code changes are detected, do not make changes. Check if there are any redundant or unnecessary tests in changes in current diff -- if so, remove redundant tests.`
- Update `${PROGRESS_FILE}` Tests Docs Updater section

After **both** complete (or the non-skipped one completes), commit.

### 5. API Docs Updater + Spec Finalizer (parallel)

Spawn both subagents **in parallel** -- they operate on completely independent file sets (`docs/api/` vs. `specs/<branch>/`). Skip API Docs if its skip condition is met.

#### 5a: api-docs-updater

- Prompt: `Run "pnpm docs:generate", then extract type definitions, interfaces, and function signatures from "docs/typedoc" output to create/update "docs/api/index.md" (overview + TOC) and topic files ("docs/api/api-components.md", "api-hooks.md", etc.) with one file per logical section, validate all index links resolve to existing files, and report progress -- do not generate code examples, tutorials, or document private APIs.`
- Update `${PROGRESS_FILE}` API Docs Updater section

#### 5b: spec-finalizer

This step consolidates the spec directory (removing consumed planning artifacts) and then updates the remaining essential files to reflect the actual implementation. These two phases are combined into one subagent because they both operate on `${SPEC_DIR}/` and the update phase depends on the consolidation phase completing first.

- Get fresh diff, then read the prompt from `references/spec-finalizer-prompt.md` (substituting `${SPEC_DIR}` with the actual path) and execute it
- Update `${PROGRESS_FILE}` Spec Finalizer section

After **both** complete (or the non-skipped one completes), commit.

### 6. Code Review

Spawn subagent **code-reviewer**:

- Run `/ah-review-code` with prompt: `base branch is ${BASE_BRANCH}, after code review read the code review file and fix all issues you find, then check "pnpm preflight"`
- Update `${PROGRESS_FILE}` Code Reviewer section

This step runs last (before PR creation) so it reviews everything -- code, docs, and spec changes from all previous steps.

### 7. Create PR

Spawn subagent **pr-creator**:

- Run `/ah-create-pr` with prompt: `base branch: ${BASE_BRANCH}, issue number: ${ISSUE_NUMBER}`
- Update `${PROGRESS_FILE}` PR Creator section (PR URL)

### 8. Report to User

Present a summary:

- Path to `${PROGRESS_FILE}` with the full audit trail
- PR URL
- Steps completed, skipped (with reasons), and any failures
- Unresolved findings from the code review
- Total workflow duration (sum of all step durations)

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

- Every subagent except `committer` runs on Opus with ultrathink. The `committer` runs on Sonnet and only creates a commit via `/commit`.
- The `${PROGRESS_FILE}` is a running audit trail. Each subagent updates its section immediately after finishing.
- **Resume support**: Re-running the skill detects an existing progress file and offers to resume from the last incomplete step. Completed steps and their commits are skipped.
- **Duration tracking**: Each subagent records start/end timestamps and computes duration (e.g., `duration: 2m 34s`).
- **Skip behavior**: Auto-skipped and user-skipped steps are logged in the progress file with the reason. Skipped steps don't trigger commits.
- All Spec Kit output files live in `specs/<branch-name>/`.
- If any subagent fails, note the failure in `${PROGRESS_FILE}` and report to the user. Do not silently skip steps.
- In a monorepo, identify the correct application from changed file paths and scope all commands to that application.
- Base branch and issue number come from `spec.md` metadata -- if missing, ask the user.
