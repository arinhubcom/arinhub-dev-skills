---
name: ah-finalize-code
description: Use this skill to finalize code changes before creating a PR when using the "ah" prefix. Use when asked to "ah finalize code", or "ah finalize changes". Runs a multi-step workflow that simplifies code, creates a retrospective, adds tests, updates JSDoc references, updates documentation, optimizes specs, performs a code review, and creates a pull request -- committing after each step.
argument-hint: "no arguments needed, works on the current branch"
---

# Finalize Code

Orchestrate the full pre-PR finalization workflow for the current branch. This involves running a sequence of specialized subagents -- each handling a different aspect of the finalization (simplification, testing, documentation, specs, code review) -- with a commit after every step. The workflow ends by creating a pull request.

## Configuration

- **Subagent model defaults**: Opus for all subagents except `committer`, which uses Sonnet
- **Thinking mode**: ultrathink effort for all subagents

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

Before reading spec.md or doing any work, verify the branch is in a usable state:

1. **Branch has changes**: Compare the current branch against the expected base. If there are no commits ahead of the base, abort and tell the user there is nothing to finalize.

   ```bash
   # Quick check -- will be refined after BASE_BRANCH is known
   git log --oneline -1
   ```

2. **Spec directory exists**: Verify `${SPEC_DIR}/spec.md` exists. If the spec directory or file is missing, stop and tell the user: "No spec found at `${SPEC_DIR}/spec.md`. Run the task creation workflow first, or provide the correct spec path."

3. **No uncommitted changes**: Run `git status --porcelain`. If there are uncommitted changes (staged or unstaged), warn the user and ask whether to stash them, commit them first, or abort.

#### Extract metadata

Read `${SPEC_DIR}/spec.md` and extract:

- `BASE_BRANCH` from the **Base Branch** metadata field
- `ISSUE_NUMBER` from the **Issue Number** metadata field

If either value is missing from spec.md, ask the user before proceeding.

#### Initialize progress file

Read the template from `references/progress-pr.md`, replace all `<BRANCH_NAME>`, `<BASE_BRANCH>`, `<ISSUE_NUMBER>`, and `<TIMESTAMP>` placeholders with actual values, and write the result to `${PROGRESS_FILE}`.

If `${PROGRESS_FILE}` already exists, check its contents:

- **Resume support**: If some steps are already marked as `completed`, present the progress to the user and ask: "Some steps are already done. Resume from step N, or restart from the beginning?" If the user chooses to resume, skip completed steps and their commits.
- If the user chooses to restart, overwrite the file with a fresh template.

Every subagent updates its own section after completing its work.

#### Compute merge base

```bash
git fetch origin "${BASE_BRANCH}" --quiet
MERGE_BASE=$(git merge-base "origin/${BASE_BRANCH}" HEAD)
```

Verify the branch has commits ahead of the merge base:

```bash
AHEAD_COUNT=$(git rev-list --count "${MERGE_BASE}"..HEAD)
if [ "${AHEAD_COUNT}" -eq 0 ]; then
  echo "No commits ahead of ${BASE_BRANCH}. Nothing to finalize."
  exit 1
fi
```

Each subagent that analyzes code changes must compute its own fresh diff before starting its work:

```bash
DIFF=$(git diff "${MERGE_BASE}")
```

This ensures every subagent sees the latest state of changes, including modifications committed by previous steps.

If the repository is a monorepo, identify the correct application from the changed files in the diff and run all commands in the context of that application.

### 1. Simplify

Spawn subagent **simplifier** (Opus, ultrathink):

- Get fresh diff: `git diff "${MERGE_BASE}"`
- Run `/simplify` with prompt: `Simplify changes in current diff only, then check "pnpm preflight"`
- Record start/end timestamps and update `${PROGRESS_FILE}` Simplifier section (status: completed, findings, duration)

Then spawn subagent **committer** (Sonnet) -- run `/commit`.

### 2. Retrospective

Spawn subagent **retrospective** (Opus, ultrathink):

- Run `/speckit.retrospective.analyze`
- After the skill finishes, fix any follow-up actions listed in the retrospective.md file and update the retrospective file accordingly
- Record start/end timestamps and update `${PROGRESS_FILE}` Retrospective section

Then spawn subagent **committer** (Sonnet) -- run `/commit`.

### 3. Test Creator

Spawn subagent **test-creator** (Opus, ultrathink):

- Get fresh diff: `git diff "${MERGE_BASE}"`
- Prompt: `Run command "pnpm test:coverage", find the coverage file location from the test:coverage script configuration, read coverage file, add important tests for changes in current diff only, optimize count of tests to avoid redundancy, verify coverage improvements, then run "pnpm preflight"`
- Record start/end timestamps and update `${PROGRESS_FILE}` Test Creator section

Then spawn subagent **committer** (Sonnet) -- run `/commit`.

### 4. JSDoc Updater + Tests Docs Updater (parallel)

Spawn both subagents **in parallel** -- they operate on different file sets (JSDoc comments vs. docs/tests/ markdown files) and do not conflict:

#### Subagent A: jsdoc-updater (Opus, ultrathink)

- Get fresh diff: `git diff "${MERGE_BASE}"`
- Prompt: `In JSDoc comments on the current diff, add/update spec references using shorthand "SXXX:FR-YYY" or "SXXX:SC-YYY" format (S001=001-minute-qset-react) with short descriptions, remove outdated refs and task numbers (e.g. T012), ensure standard JSDoc format, add missing shorthand to spec.md if needed, and run formatter + linter on modified files.`
- Record start/end timestamps and update `${PROGRESS_FILE}` JSDoc Updater section

#### Subagent B: tests-docs-updater (Opus, ultrathink)

- Get fresh diff: `git diff "${MERGE_BASE}"`
- Prompt: `Update docs/tests/tests-*.md files to reflect changes in current diff only, ensure that each test file follows the established format and includes all necessary details. If no code changes are detected, do not make changes. Check if there are any redundant or unnecessary tests in changes in current diff -- if so, remove redundant tests.`
- Record start/end timestamps and update `${PROGRESS_FILE}` Tests Docs Updater section

After **both** subagents complete, spawn subagent **committer** (Sonnet) -- run `/commit`.

### 5. API Docs Updater

Spawn subagent **api-docs-updater** (Opus, ultrathink):

- Prompt: `Run "pnpm docs:generate", then extract type definitions, interfaces, and function signatures from "docs/typedoc" output to create/update "docs/api/index.md" (overview + TOC) and topic files ("docs/api/api-components.md", "api-hooks.md", etc.) with one file per logical section, validate all index links resolve to existing files, and report progress -- do not generate code examples, tutorials, or document private APIs.`
- Record start/end timestamps and update `${PROGRESS_FILE}` API Docs Updater section

Then spawn subagent **committer** (Sonnet) -- run `/commit`.

### 6. Spec Optimizer

Spawn subagent **spec-optimizer** (Opus, ultrathink):

- Get fresh diff: `git diff "${MERGE_BASE}"`
- Prompt:

  ```
  Optimize the "${SPEC_DIR}/" folder. Follow these steps in order:

  Step 1 -- Inventory: List every file and subdirectory in "${SPEC_DIR}/".

  Step 2 -- Consolidate before deleting: For each file marked for deletion
  below, read it and extract any non-obvious decisions, constraints, or
  context that is NOT already captured in the essential files. Append
  extracted content to the most relevant essential file (spec.md for
  requirements/decisions, plan.md for architecture/implementation details,
  data-model.md for schema/type info).

  Step 3 -- Delete redundant files: Remove the following files (they served
  their purpose during planning and are now consumed):
    - research.md -- research findings should already be in spec.md/plan.md
    - tasks.md -- tasks are completed, tracked in git history
    - checklist.md -- checklist items are done
    - requirements.md -- requirements are in spec.md
    - Any quickstart guide files (e.g. quickstart.md, getting-started.md)
    - Any other temporary/working files not listed as essential below

  Step 4 -- Keep essential files: These files MUST be preserved:
    - spec.md -- core specification with metadata (Base Branch, Issue Number)
    - plan.md -- implementation plan and architecture decisions
    - data-model.md -- data model definitions and schema
    - retrospective.md -- implementation retrospective
    - contracts/ directory -- but only contracts still referenced by the
      codebase; delete any contract file whose types/interfaces no longer
      exist in the current diff

  Step 5 -- Clean up kept files: In each essential file:
    - Remove "Next Steps" sections (implementation is done)
    - Remove "TODO" or "TBD" markers that are resolved
    - Remove references to deleted files
    - Fix any broken internal links between the remaining files

  Step 6 -- Verify: Confirm that no critical context, valid cross-references,
  or needed information was lost. List any files deleted and any content
  consolidated.
  ```
- Record start/end timestamps and update `${PROGRESS_FILE}` Spec Optimizer section

Then spawn subagent **committer** (Sonnet) -- run `/commit`.

### 7. Spec Updater

Spawn subagent **spec-updater** (Opus, ultrathink):

- Get fresh diff: `git diff "${MERGE_BASE}"`
- Prompt: `Update files in the "${SPEC_DIR}/" folder to reflect the code changes in current diff only. Ensure that each spec file follows the established format and includes all necessary details. If no code changes are detected, do not make changes.`
- Record start/end timestamps and update `${PROGRESS_FILE}` Spec Updater section

Then spawn subagent **committer** (Sonnet) -- run `/commit`.

### 8. Code Review

Spawn subagent **code-reviewer** (Opus, ultrathink):

- Run `/ah-review-code` with prompt: `base branch is ${BASE_BRANCH}, after code review read the code review file and fix all issues you find, then check "pnpm preflight"`
- Record start/end timestamps and update `${PROGRESS_FILE}` Code Reviewer section

Then spawn subagent **committer** (Sonnet) -- run `/commit`.

### 9. Create PR

Spawn subagent **pr-creator** (Opus, ultrathink):

- Run `/ah-create-pr` with prompt: `base branch: ${BASE_BRANCH}, issue number: ${ISSUE_NUMBER}`
- Record start/end timestamps and update `${PROGRESS_FILE}` PR Creator section (status: completed, PR URL).

### 10. Report to User

Present a summary:

- Path to `${PROGRESS_FILE}` with the full audit trail
- PR URL
- List of steps completed and any issues encountered
- Any unresolved findings from the code review
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
    Tests Docs Updater-+--> commit (parallel)
 |
 v
[5] API Docs Updater --> commit
 |
 v
[6] Spec Optimizer --> commit
 |
 v
[7] Spec Updater --> commit
 |
 v
[8] Code Review --> commit
 |
 v
[9] Create PR
 |
 v
[10] Report to User
```

## Important Notes

- Every subagent except `committer` runs on Opus with ultrathink effort mode. The `committer` subagent runs on Sonnet.
- The `${PROGRESS_FILE}` serves as a running audit trail. Each subagent (except `committer`) updates its section immediately after finishing, so progress is always visible. The `committer` subagent only creates a commit and does not update the progress file.
- **Resume support**: If the workflow is interrupted or a step fails, re-running the skill will detect the existing progress file and offer to resume from the last incomplete step. Completed steps and their commits are skipped.
- **Duration tracking**: Each subagent records its start timestamp before beginning work and its end timestamp after finishing. It computes the duration and writes it to the `duration:` field in its progress section (e.g., `duration: 2m 34s`).
- All Spec Kit output files live in `specs/<branch-name>/`.
- The workflow is mostly sequential -- each step must complete before the next begins, because later steps depend on commits from earlier steps. The exception is Step 4, where JSDoc Updater and Tests Docs Updater run in parallel since they modify non-overlapping file sets.
- If any subagent fails, note the failure in `${PROGRESS_FILE}` and report to the user before continuing. Do not silently skip steps.
- The `/commit` command creates a conventional commit with a descriptive message based on the staged changes. The committer subagent should not do anything else beyond creating the commit.
- Base branch and issue number come from `spec.md` metadata -- if they are missing, ask the user before starting.
- Each subagent computes a fresh diff (`git diff "${MERGE_BASE}"`) before starting its work, so it always sees the latest state including commits from previous steps.
- In a monorepo, identify the correct application from the changed file paths and scope all commands (preflight, test, lint, etc.) to that application.
