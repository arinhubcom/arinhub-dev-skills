---
name: ah-create-tasks
description: Use this skill to create tasks from a PRD and ADR using the "ah" prefix. Use when asked to "ah create tasks". Runs the full Spec Kit pipeline -- specify, clarify, plan, research, complexity check, checklist, and task generation -- with consistency analysis passes, committing after each major step. Also supports "update" mode (e.g., "ah create tasks update 001") which skips initial specify/verify steps, creates a new branch, and starts from clarify.
argument-hint: "a feature name (derives default prd/adr paths) or explicit prd.md and adr.md paths, optionally 'update <spec-number>' for update mode"
---

# Create Tasks from PRD and ADR

Orchestrate full Spec Kit pipeline. Transform `prd.md` + `adr.md` into well-structured `tasks.md`. Generates intermediate artifacts (spec.md, plan.md, research.md, checklists), runs consistency checks, commits after each major step.

Two modes:

- **Create mode** (default): full pipeline, specify through task generation.
- **Update mode**: requires spec number (e.g., `001`). Creates new git branch, skips steps 1-4 (specify/verify), starts from Clarify using PRD to generate clarification prompt.

## Input

- **feature name** (optional): kebab-case slug (e.g. `dark-mode-toggle`). When given, PRD/ADR paths default to `ah-create-prd-adr` convention: `~/.agents/prds/prd-<repo>-<feature>.md` and `~/.agents/adrs/adr-<repo>-<feature>.md` (see Step 0). Lets user pass feature name instead of two full paths.
- **prd.md path** (required unless **feature name** given): path to PRD describing feature. If neither this nor feature name given, ask before proceeding.
- **adr.md path** (required unless **feature name** given): path to ADR (Architectural Decision Records) describing architectural decisions, constraints, rationale. If neither this nor feature name given, ask before proceeding.
- **issue number** (required): GitHub issue number for this feature (e.g., `42`). If not provided, ask before proceeding.
- **mode** (optional): `update` to skip steps 1-4 and start from Clarify. Default create (full pipeline).
- **spec number** (required in update mode): spec number (e.g., `001`). Used to construct branch name.

## Configuration

- **Subagent model defaults**: Opus for all subagents
- **Thinking mode**: low effort for all subagents

## Procedure

### 0. Initialize

```bash
BASE_BRANCH=$(git branch --show-current)
REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
PROGRESS_TEMPLATE="progress-tasks.md"
```

Determine **mode**:

- If user said "update" and gave spec number, set `MODE=update`, store spec number as `SPEC_NUMBER`.
- Otherwise set `MODE=create`.

Resolve `PRD_PATH` and `ADR_PATH`:

- If user gave **feature name** (not explicit paths), derive default paths via `ah-create-prd-adr` naming convention:

  ```bash
  FEATURE="<feature-name-slug>"
  PRD_PATH=~/.agents/prds/prd-${REPO_NAME}-${FEATURE}.md
  ADR_PATH=~/.agents/adrs/adr-${REPO_NAME}-${FEATURE}.md
  ```

- If user gave explicit paths, use those (override feature-name default).

If user gave neither explicit paths nor feature name, and no **issue number**, ask for all missing values now (before any other work). In update mode, also ask for **spec number** if not provided. Store as `PRD_PATH`, `ADR_PATH`, `ISSUE_NUMBER`, and (update mode) `SPEC_NUMBER`.

Verify `prd.md` exists at `PRD_PATH` and `adr.md` exists at `ADR_PATH`. If either missing, ask user for correct path or feature name.

#### Update Mode Branch Setup

If `MODE=update`:

1. Resolve git branch prefix:

   ```bash
   GIT_BRANCH_PREFIX="${GIT_BRANCH_PREFIX:-}"
   ```

   If `GIT_BRANCH_PREFIX` empty, ask user for branch prefix (e.g., `jj`).

2. Read `prd.md` at `${PRD_PATH}`. Derive short kebab-case branch description from title/main feature (e.g., `fix-submit-button`). Capture main feature or fix in 2-5 words.

3. Create and switch to new branch:

   ```bash
   BRANCH_DESCRIPTION="<derived-kebab-case-description>"
   NEW_BRANCH_NAME="${GIT_BRANCH_PREFIX}/${SPEC_NUMBER}-${BRANCH_DESCRIPTION}"
   git checkout -b "${NEW_BRANCH_NAME}"
   SPEC_DIR="specs/${NEW_BRANCH_NAME}"
   SAFE_BRANCH_NAME=$(echo "${NEW_BRANCH_NAME}" | tr '/' '-')
   PROGRESS_FILE="~/.agents/arinhub/progresses/progress-tasks-${REPO_NAME}-${SAFE_BRANCH_NAME}.md"
   ```

4. Initialize `${PROGRESS_FILE}` from template `references/${PROGRESS_TEMPLATE}`. Replace all `<PLACEHOLDER>` values with actual values. Mark Specifier and Spec Verifier sections as `status: skipped (update mode)`.

5. Verify `${SPEC_DIR}` exists and contains `spec.md`. If not, create directory and report to user that new `spec.md` will be generated during Clarify step.

6. **Skip steps 1-4. Proceed directly to step 5 (Clarify).**

### 1. Specify

> **Update mode**: Skip this step and steps 2-4. Proceed directly to step 5 (Clarify).

Read `prd.md` at `${PRD_PATH}`. Distill into prompt for `/speckit.specify`. Focus on **what** and **why** -- strip tech stack details, implementation specifics, architecture choices. Keep only user-facing requirements, goals, motivation, context relevant for specifier writing initial `spec.md`. Goal: clear concise prompt capturing feature essence without prescribing implementation.

Spawn subagent **specifier** (Opus, low):

- Provide `${PRD_PATH}` so subagent reads PRD directly for context
- Run `/speckit.specify` with distilled prompt
- After `/speckit.specify` completes, it created a new branch. Capture it:
  ```bash
  NEW_BRANCH_NAME=$(git branch --show-current)
  SPEC_DIR="specs/${NEW_BRANCH_NAME}"
  SAFE_BRANCH_NAME=$(echo "${NEW_BRANCH_NAME}" | tr '/' '-')
  PROGRESS_FILE="~/.agents/arinhub/progresses/progress-tasks-${REPO_NAME}-${SAFE_BRANCH_NAME}.md"
  ```
- Initialize `${PROGRESS_FILE}` from template `references/${PROGRESS_TEMPLATE}`. Replace all `<PLACEHOLDER>` values with actual values (branch name, base branch, PRD path, ADR path, issue number, timestamp). Every subagent updates its own section after completing work.
- After file generated, prepend this metadata block at very top of `spec.md` (before existing content):
  ```
  **Base Branch**: <BASE_BRANCH>
  **Issue Number**: <ISSUE_NUMBER>
  **Input**: <the distilled prompt>
  ```
- Update `${PROGRESS_FILE}` Specifier section (status: completed, findings)

### 2. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 3. Verify Spec

Spawn subagent **spec-verifier** (Opus, low):

- Prompt: `Act as a Senior Code Reviewer. Analyze spec.md in ${SPEC_DIR} and identify errors, logical gaps, or inconsistencies. If the spec.md references refactoring or existing codebases, perform a comparative analysis to ensure functional parity and identify any missing requirements. Fix all issues you find.`
- Update `${PROGRESS_FILE}` Spec Verifier section

### 4. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 5. Clarify

**Update mode**: Read `prd.md` at `${PRD_PATH}`. Distill into prompt for `/speckit.clarify`. Focus on **what** and **why** -- strip tech stack details, implementation specifics, architecture choices. Keep only user-facing requirements, goals, motivation, context relevant for clarifier refining `spec.md`. Pass this prompt to `/speckit.clarify`.

Run `/speckit.clarify` yourself (not as subagent -- this command may require user interaction).

If clarification asks questions needing user input, **wait for the user to respond** before proceeding. Do not skip or auto-answer clarification questions.

Update `${PROGRESS_FILE}` Clarifier section.

### 6. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 7. Plan

Read `adr.md` at `${ADR_PATH}`. Distill into prompt for `/speckit.plan`. ADR contains architectural decisions, constraints, rationale -- use to inform prompt with tech stack choices, architecture patterns, design trade-offs.

Also read AGENTS.md in repo root to gather active technologies and recent changes. After generating plan, update AGENTS.md with any new active technologies or recent changes discovered during planning.

Spawn subagent **planner** (Opus, low):

- Provide `${ADR_PATH}` so subagent reads ADR directly for context
- Run `/speckit.plan` with distilled prompt
- Update `${PROGRESS_FILE}` Planner section

### 8. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 9. Research

Spawn subagent **researcher** (Opus, low):

- Prompt: `I want you to go through the implementation plan and implementation details in ${SPEC_DIR}, looking for areas that could benefit from additional research. For those areas that you identify that require further research, update the research document with additional details about the specific versions that we are going to be using in this application and spawn parallel research tasks to clarify any details using research from the web or context7 tool.`
- Update `${PROGRESS_FILE}` Researcher section

### 10. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 11. Complexity Check

Spawn subagent **complexity-checker** (Opus, low):

- Prompt: `Cross-check the details to see if there are any over-engineered pieces in folder ${SPEC_DIR}. Return a numbered list of all issues found with severity and recommended fix for each.`

After subagent returns, present findings to user yourself (not in subagent) and **ask which issues to fix**. Wait for user to respond before continuing.

Once user responds, spawn subagent **complexity-fixer** (Opus, low):

- Prompt: `Fix the following issues in ${SPEC_DIR}: <list of user-selected issues from complexity-checker findings>`
- Update `${PROGRESS_FILE}` Complexity Checker section

### 12. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 13. Generate Checklist

Spawn subagent **checklist-generator** (Opus, low):

- Run `/speckit.checklist` with prompt: `full breadth pre-implementation checklist, exclude the general spec-quality items already covered in requirements.md and focus only on domain-specific requirement gaps`
- Update `${PROGRESS_FILE}` Checklist Generator section

### 14. Check Checklist

Spawn subagent **checklist-checker** (Opus, low):

- Prompt: `Read the checklist in ${SPEC_DIR}, and check off each item in the checklist if the feature spec meets the criteria. Leave it empty if it does not. Fix all gaps.`
- Update `${PROGRESS_FILE}` Checklist Checker section

### 15. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 16. Generate Tasks

Spawn subagent **tasks-generator** (Opus, low):

- Run `/speckit.tasks`
- Update `${PROGRESS_FILE}` Tasks Generator section

### 17. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 18. Analyze Tasks (Pass 1)

Spawn subagent **tasks-analyzer** (Opus, low):

- Run `/speckit.analyze` with prompt: `if there are any issues fix all`
- Update `${PROGRESS_FILE}` Tasks Analyzer (pass 1) section

### 19. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 20. Analyze Tasks (Pass 2)

Spawn subagent **tasks-analyzer-2** (Opus, low):

- Run `/speckit.analyze` with prompt: `if there are any issues fix all`
- Update `${PROGRESS_FILE}` Tasks Analyzer (pass 2) section

### 21. Commit (Final)

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 22. Report to User

Present summary:

- Path to generated `tasks.md`
- Path to `${PROGRESS_FILE}` with full audit trail
- List of all generated artifacts in `${SPEC_DIR}/`
- Any unresolved issues or warnings from analysis passes
- Next steps: user can now run `/speckit.implement` to begin implementation

## Workflow Diagram

### Create Mode (default)

```
prd.md + adr.md
  |        |
  v        |
[1] /speckit.specify --> spec.md (uses prd.md)
  |        |
  v        |
[3] spec-verifier --> fixes spec.md
  |        |
  v        |
[5] /speckit.clarify --> user Q&A --> updates spec.md
  |        |
  v        v
[7] /speckit.plan --> plan.md, research.md, data-model.md (uses adr.md)
  |
  v
[9] researcher --> updates research.md
  |
  v
[11] complexity-checker --> user picks fixes
  |
  v
[13-14] /speckit.checklist --> checklist-checker --> fixes gaps
  |
  v
[16] /speckit.tasks --> tasks.md
  |
  v
[18] /speckit.analyze (pass 1) --> fixes
  |
  v
[20] /speckit.analyze (pass 2) --> fixes
  |
  v
tasks.md (final)
```

### Update Mode

Identical to Create Mode from `[5] /speckit.clarify` onward, with two changes at
the start: step `[0]` creates the branch
`${GIT_BRANCH_PREFIX}/${SPEC_NUMBER}-${description}`, and steps `[1-4]`
(specify + spec-verifier) are **skipped** -- the clarify prompt is distilled from
`prd.md` instead.

Each arrow includes a `/commit` step (not shown for brevity).

## Important Notes

- Every subagent runs on Opus with low effort mode.
- Steps 5 (clarify) and 11 (complexity check) require user interaction -- workflow pauses and waits for user input before continuing.
- `${PROGRESS_FILE}` serves as running audit trail. Each subagent updates its section immediately after finishing, so you can always see what is done and what remains.
- All Spec Kit output files saved to `specs/<NEW_BRANCH_NAME>/`.
- If any subagent fails, note failure in `${PROGRESS_FILE}` and report to user before continuing. Do not silently skip steps.
- `/commit` creates conventional commit with descriptive message based on staged changes. Committer subagent should not do anything beyond creating the commit.
