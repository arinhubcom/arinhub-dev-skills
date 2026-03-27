---
name: ah-implement-tasks
description: Use this skill to implement tasks from tasks.md when using the "ah" prefix. Use when asked to "ah implement tasks". Loads React and component best practices context (composition patterns, React performance guidelines, component building) before execution, then runs the speckit.implement workflow to process all tasks phase-by-phase with TDD, progress tracking, and validation. Also use when the user mentions implementing a feature plan, executing a task list, or starting the coding phase after task creation with the "ah" prefix.
argument-hint: "optional: feature directory path, specific task IDs, or additional instructions for implementation"
---

# Implement Tasks

Execute the implementation plan from tasks.md with React and component best practices loaded as context. The skill loads reference knowledge first so that all coding decisions during implementation are informed by proven patterns, then delegates to `/speckit.implement` for the actual task execution.

## Input

- **feature directory** (optional): Path to the feature's spec directory containing tasks.md. If omitted, `speckit.implement` auto-detects it via the prerequisites script.
- **additional instructions** (optional): Any extra guidance to forward to `/speckit.implement` (e.g., specific task IDs, phases to focus on).

## Procedure

### 0. Initialize

```bash
BRANCH_NAME=$(git branch --show-current)
REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
```

Verify the branch has a tasks.md file available (either in `specs/${BRANCH_NAME}/` or detectable by the speckit prerequisites script). If no tasks.md exists, stop and suggest: "No tasks.md found. Run `/ah-create-tasks` first to generate the task list."

### 1. Load Best Practices Context

Invoke the following three skills sequentially to load their guidance into the current session. These provide the coding standards and patterns that apply to all code written during implementation -- composition, performance, and accessibility decisions should follow this guidance.

1. **`/vercel-composition-patterns`** -- React composition patterns that scale: compound components, render props, context providers, slot patterns. Informs how to structure components and avoid boolean prop proliferation.

2. **`/vercel-react-best-practices`** -- React and Next.js performance optimization from Vercel Engineering. Informs data fetching, bundle optimization, rendering strategies, and Server Component usage.

3. **`/building-components`** -- Guide for building modern, accessible, composable UI components. Informs component API design, accessibility implementation, design tokens, and documentation.

After loading all three, briefly confirm to the user which best-practice contexts were loaded (one line each) before proceeding.

### 2. Execute Implementation (first pass)

Invoke `/speckit.implement` with any user-provided arguments forwarded.

The `speckit.implement` command handles the full implementation lifecycle:

- Validates prerequisites (tasks.md, plan.md must exist)
- Checks checklist completion status (pauses if incomplete)
- Loads implementation context (plan.md, data-model.md, contracts/, research.md)
- Verifies project setup (ignore files, tooling configuration)
- Parses task phases: Setup, Tests, Core, Integration, Polish
- Executes tasks phase-by-phase following TDD order (tests before implementation)
- Respects dependencies: sequential tasks in order, parallel tasks `[P]` concurrently
- Tracks progress by marking completed tasks `[X]` in tasks.md
- Halts on non-parallel task failures, continues past parallel failures
- Validates completion against the specification

The best practices loaded in step 1 remain in context throughout execution -- apply them when writing components, structuring code, and making architectural micro-decisions.

### 3. Verify Completion and Retry

After the first `/speckit.implement` pass finishes, read `tasks.md` and check whether all tasks are marked `[X]`. If any tasks remain uncompleted (`[ ]`):

1. Report which tasks are still open (list task IDs and descriptions).
2. Invoke `/speckit.implement` again -- it will pick up from where it left off because only uncompleted tasks remain.
3. After the second pass, read `tasks.md` once more. If tasks are still incomplete, report them to the user and ask how to proceed (retry, skip, or investigate).

This retry mechanism handles cases where a single pass runs into context limits, transient failures, or long task lists that cannot be fully processed in one run.

### 4. Report

After all tasks are completed (or the user decides to stop), present:

- Summary of completed tasks by phase
- Any failures or skipped tasks with reasons
- How many passes were needed (1 or 2)
- Test results and coverage status
- Next steps (e.g., run `/ah-finalize-code` to prepare for PR)

## Workflow Diagram

```
[0] Initialize -- verify tasks.md exists
 |
 v
[1] Load best practices context
    /vercel-composition-patterns
    /vercel-react-best-practices
    /building-components
 |
 v
[2] /speckit.implement -- execute all tasks (first pass)
    Setup --> Tests --> Core --> Integration --> Polish
 |
 v
[3] Check tasks.md -- all [X]?
    |            |
   YES          NO
    |            |
    v            v
   [4]     /speckit.implement (second pass)
    |            |
    |            v
    |       All done? -- NO --> ask user
    |            |
    |           YES
    v            |
[4] Report  <---+
```

## Important Notes

- This skill runs in the main session (not spawned as subagents) because `/speckit.implement` may pause for user input (e.g., incomplete checklists) and the best-practices context must remain available throughout.
- The three reference skills are loaded for their knowledge -- they inform coding decisions but do not produce output files themselves.
- If the project is not React-based, the composition and React skills still provide useful general component patterns. The implementation adapts the principles to whatever framework is in use.
- All Spec Kit output files live in `specs/<branch-name>/`.
- After implementation is complete, the natural next step is `/ah-finalize-code` which handles simplification, testing, docs, code review, and PR creation.
