---
name: ah-create-tasks
description: Create tasks from a PRD and ADR with the "ah" prefix. Use for "ah create tasks". Runs the full Spec Kit pipeline -- specify, clarify, plan, research, complexity check, checklist, task generation -- with consistency passes, committing after each step. Also supports "update" mode (e.g. "ah create tasks update 001"), which skips specify/verify, creates a new branch, and starts from clarify.
argument-hint: "a feature name (derives default prd/adr paths) or explicit prd.md and adr.md paths, optionally 'update <spec-number>' for update mode, or a bare <spec-number> in create mode to pin the branch number"
---

# Create Tasks from PRD and ADR

Orchestrate full Spec Kit pipeline. Transform `prd.md` + `adr.md` into well-structured `tasks.md`. Generates intermediate artifacts (spec.md, plan.md, research.md, checklists), runs consistency checks, commits after each major step.

Two modes:

- **Create mode** (default): full pipeline, specify through task generation. Optionally accepts a spec number to pin the feature branch number (`jj/<spec>-<desc>`) instead of letting `/speckit.specify` auto-detect it.
- **Update mode**: requires spec number (e.g., `001`). Creates new git branch, skips steps 1-4 (specify/verify), starts from Clarify using PRD to generate clarification prompt.

## Input

- **feature name** (optional): kebab-case slug (e.g. `dark-mode-toggle`). When given, PRD/ADR paths default to `ah-create-prd-adr` convention: `~/.agents/prds/prd-<repo>-<feature>.md` and `~/.agents/adrs/adr-<repo>-<feature>.md` (see Step 0). Lets user pass feature name instead of two full paths.
- **prd.md path** (required unless **feature name** given): path to PRD describing feature. If neither this nor feature name given, ask before proceeding.
- **adr.md path** (required unless **feature name** given): path to ADR (Architectural Decision Records) describing architectural decisions, constraints, rationale. If neither this nor feature name given, ask before proceeding.
- **issue number** (required): GitHub issue number for this feature (e.g., `42`). If not provided, ask before proceeding.
- **mode** (optional): `update` to skip steps 1-4 and start from Clarify. Default create (full pipeline).
- **autonomous** (optional): `autonomous` to run non-interactively. Steps 5 (clarify) and 11 (complexity check) then never wait for a human -- they decide from PRD/ADR/spec and record every choice as an ASSUMPTION. Any missing required input fails fast with a clear error instead of prompting. Default off (interactive). Always set by ah-workflow.
- **spec number** (required in update mode, optional in create mode): spec number (e.g., `001`). In update mode it is used to construct the branch name. In create mode, when supplied, it pins the feature branch number (`jj/<spec>-<desc>`) via `/speckit.specify`'s `--number` flag instead of letting the script auto-detect it. Strictly non-interactive in create mode: only used if already supplied; never prompted for.

## Configuration

- **Subagent model defaults**: Opus for all subagents
- **Thinking mode**: low effort for all subagents

## Procedure

### 0. Initialize

```bash
BASE_BRANCH=$(git branch --show-current)
REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
source "<skill_dir>/scripts/progress.sh"
```

Progress is recorded as a deterministic append-only log written by `scripts/progress.sh` (sourced above, path resolved relative to this SKILL.md's directory) -- not an LLM-maintained markdown file. The `${PROGRESS_FILE}` path depends on the feature branch, which only exists after the Specifier creates it (create mode) or after `git checkout -b` (update mode), so `progress_init` is called there, not here.

Determine **mode**:

- If user said "update" and gave spec number, set `MODE=update`, store spec number as `SPEC_NUMBER`.
- Otherwise set `MODE=create`. If the user also supplied a bare spec number (e.g., `007`), store it as `SPEC_NUMBER` (optional in create mode -- it pins the branch number in Step 1). If none was supplied, leave `SPEC_NUMBER` empty; do not prompt for it.

Determine **autonomy**: if the user passed `autonomous`, set `AUTONOMOUS=1`, else `AUTONOMOUS=0`. When `AUTONOMOUS=1`, never prompt the user anywhere in this skill: any missing required input (prd/adr path, feature name, issue number, branch prefix) must fail fast with a clear error instead of asking.

Resolve `PRD_PATH` and `ADR_PATH`:

- If user gave **feature name** (not explicit paths), derive default paths via `ah-create-prd-adr` naming convention:

  ```bash
  FEATURE="<feature-name-slug>"
  PRD_PATH=~/.agents/prds/prd-${REPO_NAME}-${FEATURE}.md
  ADR_PATH=~/.agents/adrs/adr-${REPO_NAME}-${FEATURE}.md
  ```

- If user gave explicit paths, use those (override feature-name default).

If user gave neither explicit paths nor feature name, and no **issue number**, ask for all missing values now (before any other work). In update mode, also ask for **spec number** if not provided. In create mode, never ask for a spec number -- it is optional there and only used if already supplied. Store as `PRD_PATH`, `ADR_PATH`, `ISSUE_NUMBER`, and (update mode) `SPEC_NUMBER`. When `AUTONOMOUS=1`, do not ask -- fail fast with a clear error naming the missing input.

Verify `prd.md` exists at `PRD_PATH` and `adr.md` exists at `ADR_PATH`. If either missing, ask user for correct path or feature name (or, when `AUTONOMOUS=1`, fail fast with a clear error).

#### Update Mode Branch Setup

If `MODE=update`:

1. Resolve git branch prefix:

   ```bash
   GIT_BRANCH_PREFIX="${GIT_BRANCH_PREFIX:-}"
   ```

   If `GIT_BRANCH_PREFIX` empty, ask user for branch prefix (e.g., `jj`) -- or, when `AUTONOMOUS=1`, fail fast with a clear error instead of asking.

2. Read `prd.md` at `${PRD_PATH}`. Derive short kebab-case branch description from title/main feature (e.g., `fix-submit-button`). Capture main feature or fix in 2-5 words.

3. Create and switch to new branch:

   ```bash
   BRANCH_DESCRIPTION="<derived-kebab-case-description>"
   NEW_BRANCH_NAME="${GIT_BRANCH_PREFIX}/${SPEC_NUMBER}-${BRANCH_DESCRIPTION}"
   git checkout -b "${NEW_BRANCH_NAME}"
   SPEC_DIR="specs/${NEW_BRANCH_NAME}"
   PROGRESS_FILE=$(progress_path tasks "${REPO_NAME}" "${NEW_BRANCH_NAME}")
   ```

4. Initialize the log and mark the create-only steps as skipped:

   ```bash
   progress_init "${PROGRESS_FILE}" "${NEW_BRANCH_NAME}" "${BASE_BRANCH}" "${ISSUE_NUMBER}"
   progress_log "${PROGRESS_FILE}" 1 specifier "skipped(update)"
   progress_log "${PROGRESS_FILE}" 2 spec-verifier "skipped(update)"
   ```

   `progress_init` writes the header only if the file does not exist (re-run leaves an existing log untouched). On a pre-existing log, inspect `grep '^step|' "${PROGRESS_FILE}"` and offer "Resume from step N, or restart?" (restart = `rm` then `progress_init`).

5. Verify `${SPEC_DIR}` exists and contains `spec.md`. If not, create directory and report to user that new `spec.md` will be generated during Clarify step.

6. **Skip steps 1-4. Proceed directly to step 5 (Clarify).**

### 1. Specify

> **Update mode**: Skip this step and steps 2-4. Proceed directly to step 5 (Clarify).

Read `prd.md` at `${PRD_PATH}`. Distill into prompt for `/speckit.specify`. Focus on **what** and **why** -- strip tech stack details, implementation specifics, architecture choices. Keep only user-facing requirements, goals, motivation, context relevant for specifier writing initial `spec.md`. Goal: clear concise prompt capturing feature essence without prescribing implementation.

Spawn subagent **specifier** (Opus, low):

- Provide `${PRD_PATH}` so subagent reads PRD directly for context
- Run `/speckit.specify` with distilled prompt
- **Branch numbering**: If `${SPEC_NUMBER}` is set, you MUST pass `--number ${SPEC_NUMBER}` to `create-new-feature.sh` when running `/speckit.specify`, so the branch is numbered `jj/${SPEC_NUMBER}-<short-name>` instead of auto-detected. The `speckit.specify` command normally instructs "Do NOT pass `--number`"; this instruction overrides that -- pass it. If the branch already exists, `git checkout -b` will fail; surface that error to the user rather than retrying blindly. If `${SPEC_NUMBER}` is unset, do not pass `--number` (speckit auto-detects the next number, today's behavior).
- After `/speckit.specify` completes, it created a new branch. Capture it:
  ```bash
  NEW_BRANCH_NAME=$(git branch --show-current)
  # Guard: /speckit.specify must have created and checked out a NEW feature branch.
  # If it failed (e.g. --number collided with an existing branch), HEAD is still
  # the base branch -- abort rather than write progress/specs onto the wrong branch.
  if [ "${NEW_BRANCH_NAME}" = "${BASE_BRANCH}" ]; then
    echo "ERROR: still on base branch '${BASE_BRANCH}' -- /speckit.specify did not create a feature branch. Stop and report to the user." >&2
    exit 1
  fi
  # When a spec number was requested, the new branch must carry it.
  if [ -n "${SPEC_NUMBER}" ] && ! printf '%s' "${NEW_BRANCH_NAME}" | grep -q "${SPEC_NUMBER}"; then
    echo "ERROR: branch '${NEW_BRANCH_NAME}' does not contain requested spec number '${SPEC_NUMBER}'. Stop and report to the user." >&2
    exit 1
  fi
  SPEC_DIR="specs/${NEW_BRANCH_NAME}"
  PROGRESS_FILE=$(progress_path tasks "${REPO_NAME}" "${NEW_BRANCH_NAME}")
  progress_init "${PROGRESS_FILE}" "${NEW_BRANCH_NAME}" "${BASE_BRANCH}" "${ISSUE_NUMBER}"
  ```
- Each step appends one `progress_log "${PROGRESS_FILE}" <n> <name> <status> [commit]` line (status: `done`, `skipped(update)`, `failed`). The helper stamps timestamps itself; no markdown sections are written.
- After file generated, prepend this metadata block at very top of `spec.md` (before existing content):
  ```
  **Base Branch**: <BASE_BRANCH>
  **Issue Number**: <ISSUE_NUMBER>
  **Input**: <the distilled prompt>
  ```
- `progress_log "${PROGRESS_FILE}" 1 specifier done`

### 2. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 3. Verify Spec

Spawn subagent **spec-verifier** (Opus, low):

- Prompt: `Act as a Senior Code Reviewer. Analyze spec.md in ${SPEC_DIR} and identify errors, logical gaps, or inconsistencies. If the spec.md references refactoring or existing codebases, perform a comparative analysis to ensure functional parity and identify any missing requirements. Fix all issues you find.`
- `progress_log "${PROGRESS_FILE}" 2 spec-verifier done`

### 4. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 5. Clarify

**Update mode**: Read `prd.md` at `${PRD_PATH}`. Distill into prompt for `/speckit.clarify`. Focus on **what** and **why** -- strip tech stack details, implementation specifics, architecture choices. Keep only user-facing requirements, goals, motivation, context relevant for clarifier refining `spec.md`. Pass this prompt to `/speckit.clarify`.

Run `/speckit.clarify` yourself (not as subagent -- this command may require user interaction).

**Interactive mode (`AUTONOMOUS=0`)**: If clarification asks questions needing user input, **wait for the user to respond** before proceeding. Do not skip or auto-answer clarification questions.

**Autonomous mode (`AUTONOMOUS=1`)**: `/speckit.clarify` is inherently interactive and has no non-interactive flag, but it computes a "Recommended" option per question and permits proceeding when the user explicitly states they are skipping clarification. So prepend this directive to the prompt you pass it: "Run clarification non-interactively -- do NOT ask the user anything. For each question, select the Recommended option, or if none, the most reasonable answer derivable from PRD (`${PRD_PATH}`), ADR (`${ADR_PATH}`) and spec.md. The user is skipping interactive clarification. Apply the chosen answers to spec.md and append a `## Clarification Assumptions` section listing each question, the chosen answer, and a one-line rationale. Then continue without pausing." If the command still tries to pause, bypass it: read spec/PRD/ADR yourself, fill the gaps directly into spec.md, and write the same `## Clarification Assumptions` section.

**Update mode only**: once `${SPEC_DIR}/spec.md` exists after clarify, prepend the same metadata block that create mode writes in Step 1 (it is otherwise never written in update mode, because Step 1 is skipped). Downstream phases (`ah-implement-tasks`, `ah-finalize-code`) read `Base Branch` and `Issue Number` from this block and will stop to ask the user if it is missing, so writing it here keeps an automated run from stalling. Prepend at the very top of `spec.md` (before existing content), using the values already in scope (`BASE_BRANCH` from Step 0, `ISSUE_NUMBER` from input):

```
**Base Branch**: <BASE_BRANCH>
**Issue Number**: <ISSUE_NUMBER>
**Input**: <the distilled clarify prompt>
```

Skip this prepend in create mode -- Step 1 already wrote the block there.

`progress_log "${PROGRESS_FILE}" 3 clarifier done`

### 6. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 7. Plan

Read `adr.md` at `${ADR_PATH}`. Distill into prompt for `/speckit.plan`. ADR contains architectural decisions, constraints, rationale -- use to inform prompt with tech stack choices, architecture patterns, design trade-offs.

Also read AGENTS.md in repo root to gather active technologies and recent changes. After generating plan, update AGENTS.md with any new active technologies or recent changes discovered during planning.

Spawn subagent **planner** (Opus, low):

- Provide `${ADR_PATH}` so subagent reads ADR directly for context
- Run `/speckit.plan` with distilled prompt
- `progress_log "${PROGRESS_FILE}" 4 planner done`

### 8. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 9. Research

Spawn subagent **researcher** (Opus, low):

- Prompt: `I want you to go through the implementation plan and implementation details in ${SPEC_DIR}, looking for areas that could benefit from additional research. For those areas that you identify that require further research, update the research document with additional details about the specific versions that we are going to be using in this application and spawn parallel research tasks to clarify any details using research from the web or context7 tool.`
- `progress_log "${PROGRESS_FILE}" 5 researcher done`

### 10. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 11. Complexity Check

Spawn subagent **complexity-checker** (Opus, low):

- Prompt: `Cross-check the details to see if there are any over-engineered pieces in folder ${SPEC_DIR}. Return a numbered list of all issues found with severity and recommended fix for each.`

After subagent returns:

- **Interactive mode (`AUTONOMOUS=0`)**: present findings to user yourself (not in subagent) and **ask which issues to fix**. Wait for user to respond before continuing.
- **Autonomous mode (`AUTONOMOUS=1`)**: do not ask. Auto-select all issues with severity High/Critical to fix; record Medium/Low issues as a note in spec.md (or the spec dir) for later human review. Proceed with the auto-selected list.

Once the fix list is determined, spawn subagent **complexity-fixer** (Opus, low):

- Prompt: `Fix the following issues in ${SPEC_DIR}: <list of user-selected issues from complexity-checker findings>`
- `progress_log "${PROGRESS_FILE}" 6 complexity-checker done`

### 12. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 13. Generate Checklist

Spawn subagent **checklist-generator** (Opus, low):

- Run `/speckit.checklist` with prompt: `full breadth pre-implementation checklist, exclude the general spec-quality items already covered in requirements.md and focus only on domain-specific requirement gaps`
- `progress_log "${PROGRESS_FILE}" 7 checklist-generator done`

### 14. Check Checklist

Spawn subagent **checklist-checker** (Opus, low):

- Prompt: `Read the checklist in ${SPEC_DIR}, and check off each item in the checklist if the feature spec meets the criteria. Leave it empty if it does not. Fix all gaps.`
- `progress_log "${PROGRESS_FILE}" 8 checklist-checker done`

### 15. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 16. Generate Tasks

Spawn subagent **tasks-generator** (Opus, low):

- Run `/speckit.tasks`
- `progress_log "${PROGRESS_FILE}" 9 tasks-generator done`

### 17. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 18. Analyze Tasks (Pass 1)

Spawn subagent **tasks-analyzer** (Opus, low):

- Run `/speckit.analyze` with prompt: `if there are any issues fix all`
- `progress_log "${PROGRESS_FILE}" 10 tasks-analyzer-1 done`

### 19. Commit

Spawn **committer** subagent (Opus, low) to run `/commit`.

### 20. Analyze Tasks (Pass 2)

Spawn subagent **tasks-analyzer-2** (Opus, low):

- Run `/speckit.analyze` with prompt: `if there are any issues fix all`
- `progress_log "${PROGRESS_FILE}" 11 tasks-analyzer-2 done` then `progress_done "${PROGRESS_FILE}" completed`

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
[1] /speckit.specify --> spec.md (uses prd.md; pins branch number via --number when spec number given)
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
- Steps 5 (clarify) and 11 (complexity check) require user interaction **only when `AUTONOMOUS=0`** -- the workflow then pauses and waits for user input before continuing. With the `autonomous` flag they decide from PRD/ADR/spec context and record ASSUMPTIONs without pausing. Step 0 input gathering likewise only prompts when `AUTONOMOUS=0`; otherwise missing inputs fail fast.
- `${PROGRESS_FILE}` is an append-only log written by `scripts/progress.sh`, not an LLM-maintained markdown file. Each step appends one `progress_log` line; timestamps come from `date` inside the helper. View it with `progress_render "${PROGRESS_FILE}"`.
- All Spec Kit output files saved to `specs/<NEW_BRANCH_NAME>/`.
- If any subagent fails, log it with `progress_log ... failed` and report to user before continuing. Do not silently skip steps.
- `/commit` creates conventional commit with descriptive message based on staged changes. Committer subagent should not do anything beyond creating the commit.
