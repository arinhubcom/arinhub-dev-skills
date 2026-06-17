---
name: ah-resolve-pr-review
description: Resolve unresolved PR conversations with the "ah" prefix. Use for "ah resolve pr review", or when resolving, addressing, or fixing PR review feedback or unresolved threads.
argument-hint: "PR number or URL (e.g., 47, #47, https://github.com/owner/repo/pull/47), or omit to auto-detect from current branch"
---

# Resolve Unresolved PR Conversations

Resolve unresolved review threads on a PR. Read each comment, grasp reviewer intent, build fix plan. Present plan to user for approval before any code change. After approval: implement fixes, reply to each thread explaining what was done, mark threads resolved on GitHub. Use full PR context, linked issue, existing codebase for clean idiomatic fixes.

## Input

- **PR number or URL** (optional): accepts `123`, `#123`, full URL. If omitted, script auto-detects PR from current branch.

## Procedure

### 0. Initialize

```bash
REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
PLANS_DIR=~/.agents/arinhub/plans
mkdir -p "${PLANS_DIR}"
```

### 1. Checkout PR Branch and Fetch Data

First, save current branch and stash state for later restore:

```bash
ORIGINAL_BRANCH=$(git branch --show-current)
STASH_MSG="ah-resolve-pr-review: auto-stash before checkout"
```

**If user provided specific PR number or URL**, checkout that branch:

```bash
# Stash uncommitted changes before switching branches
git stash --include-untracked -m "${STASH_MSG}"

if ! gh pr checkout <PR_NUMBER>; then
  STASH_INDEX=$(git stash list | grep -m1 "${STASH_MSG}" | sed 's/stash@{\([0-9]*\)}.*/\1/')
  [ -n "$STASH_INDEX" ] && git stash pop "stash@{$STASH_INDEX}"
  echo "ERROR: Failed to check out PR. Aborting."
  exit 1
fi
```

**If no PR specified**, current branch is the PR branch. No checkout or stash needed.

Then run fetch script (resolve path relative to this SKILL.md's directory). Writes full data bundle to file, prints only compact summary:

```bash
python3 <skill_dir>/scripts/fetch_pr_data.py /tmp/pr_data.json
```

If script fails with auth error, stop and ask user to run `gh auth login`.

**stdout** is bounded summary only -- read it directly: PR number/title/state/url, branch pair, counts (files, threads with unresolved/resolved breakdown, reviews, comments, linked issues), index of unresolved threads (`path:line [outdated] :: <truncated first comment>`). Drives validation (step 2) and thread-fix planning **without** loading heavy bundle into context.

**Full JSON file** (`/tmp/pr_data.json`) holds complete unchanged data. Read selectively with `jq` only for threads you fix -- never `cat` whole file (contains full diff and every `diffHunk`). File shape:

- `pull_request` -- metadata: `number`, `title`, `body`, `url`, `state`, `base_branch`, `head_branch`, `files`, `owner`, `repo`
- `diff` -- full PR diff string (read per-file on demand: `jq -r .diff` or prefer `gh pr diff <PR> -- <path>`)
- `review_threads` -- object with `total`, `unresolved_count`, `resolved_count`, `unresolved` (array of thread objects), `resolved`
  - Thread fields: `id` (GraphQL node ID for resolve mutation), `isResolved`, `isOutdated`, `subjectType` (`LINE` or `FILE`), `path`, `line`, `startLine`, `diffSide`, `startDiffSide`, `originalLine`, `originalStartLine`, `resolvedBy`
  - Comment fields: `id` (GraphQL node ID), `databaseId` (numeric -- use for REST API replies), `body`, `diffHunk`, `createdAt`, `updatedAt`, `author`, `path`, `originalPosition`
- `reviews` -- simplified review submissions
- `conversation_comments` -- simplified issue comments
- `linked_issues` -- full details of linked issues

Example -- pull just unresolved threads (no diff, no resolved) at step 4:

```bash
jq '.review_threads.unresolved' /tmp/pr_data.json
```

Set `PR_NUMBER` for later steps. If user provided PR number/URL, use that. Otherwise take from summary's `PR #<n>` header (or `jq -r .pull_request.number /tmp/pr_data.json`).

### 2. Validate PR State

Check `pull_request.state`. If not `OPEN`, abort and inform user that only open PRs can be resolved.

If `review_threads.unresolved_count` is `0`, inform user there are no unresolved conversations and stop.

### 3. Scan Codebase Structure

Before fixes, build mental model of codebase so fixes reuse existing patterns rather than duplicate.

Discover project layout by checking which directories exist at project root -- do not assume structure like `src/`. Common layouts:

- `src/`, `app/`, `lib/`, `packages/`, `modules/`
- Monorepo workspaces: check `package.json` `workspaces` field or `pnpm-workspace.yaml`
- Framework-specific: `pages/`, `routes/`, `api/`, `server/`, `client/`

Focus scan on directories tied to files in unresolved threads. For each file touched by an unresolved conversation:

1. Read file itself and surrounding module (sibling files, index exports)
2. Identify nearby utilities, hooks, types, constants, shared functions
3. Check project-wide conventions: formatting config, linting rules, import aliases

Read key config files relevant to changes (`package.json`, `tsconfig.json`, etc.). Informs whether existing utilities, hooks, components, CSS classes, or shared functions should be reused instead of writing new code.

### 4. Analyze Unresolved Conversations

Group unresolved threads by `path` (file) so each file is read once and all related threads processed together. Avoids redundant reads, keeps consistency across same-file fixes.

For each file group, read file once, then process each thread in group.

**File-level threads** (`subjectType` is `FILE`): comments apply to whole file, not a specific line. `line` and `startLine` are `null`. Skip line-location logic in step 4a; treat entire file as context. Reviewer's comment body is sole guide.

#### 4a. Check if Thread is Outdated

If `isOutdated` is `true`, thread references code that since changed. `line`/`startLine` may no longer match current file:

1. Read current version of file from working tree.
2. Use thread's `diffHunk` and comment context to locate relevant code -- search for code patterns mentioned rather than original line numbers.
3. If referenced code no longer exists or was already changed to address concern, record thread as `Already addressed` with reason.
4. If referenced code still exists at different location, proceed with fix using updated location.

#### 4b. Understand the Reviewer's Intent

Read full thread (all comments and replies). Determine:

- What is reviewer asking for? (bug fix, refactor, style change, logic change, performance improvement, etc.)
- Specific suggestion? (GitHub suggestion block, code snippet, verbal description)
- Does request conflict with linked issue requirements?
- In multi-reply threads, most recent reviewer comment typically represents final position.

#### 4c. Assess Feasibility

**Fixable** -- request clear, change within scope, enough info to implement correctly.

**Not fixable** -- common reasons:

- Missing information: ambiguous comment or question without direction
- Out of scope: change requires modifying code unrelated to PR
- Conflicting requirements: contradicts linked issue
- External dependency: fix requires changes in another repo or service
- Needs discussion: design question requiring team consensus

#### 4d. Plan the Fix (if fixable)

Do NOT implement yet. Create detailed fix plan per fixable thread:

- **Describe the change**: what exactly modified, added, or removed.
- **Specify the location**: file path, line range, surrounding context.
- **Reference existing code**: utilities, hooks, components, patterns from codebase to reuse.
- **Estimate impact**: other files or tests affected by change.
- **Note GitHub suggestions**: if reviewer left a `suggestion` block, include verbatim in plan.

#### 4e. Record the Analysis

Per thread, record:

- Thread ID (`id` from GraphQL -- node ID for resolve mutation)
- File path and line reference
- Reviewer's request (one-sentence summary)
- Assessment: `Fixable`, `Not fixable`, or `Already addressed`
- Planned fix (fixable items) or reason (non-fixable items)

### 5. Present Fix Plan for Approval

#### 5a. Save Plan to File

Assemble plan file path:

```bash
PLAN_FILE="${PLANS_DIR}/plan-resolve-pr-review-${REPO_NAME}-${PR_NUMBER}.md"
```

Write complete fix plan to `${PLAN_FILE}` using this format:

```markdown
## Fix Plan: PR #<number>

**Threads analyzed:** <total> | Fixable: <count> | Not fixable: <count> | Already addressed: <count>

### Planned Fixes

| # | File | Line(s) | Reviewer | Request Summary | Planned Change |
|---|------|---------|----------|-----------------|----------------|
| 1 | `src/auth.ts` | 42 | @reviewer | Add input validation | Use existing `validateInput()` from `utils/validation.ts` |
| 2 | `src/api.ts` | 15-20 | @reviewer | Rename variable | Rename `data` to `userData` per reviewer's suggestion |

### Not Fixable / Already Addressed

| # | File | Line(s) | Reviewer | Request Summary | Reason |
|---|------|---------|----------|-----------------|--------|
| 3 | `src/api.ts` | 30 | @reviewer | Unclear naming suggestion | Question without clear direction; needs clarification |
```

Display only a link to file in chat:

```
Plan saved to: ${PLAN_FILE}
```

#### 5b. Validate Plan

Spawn a **plan-validator** subagent (Opus, low) with these instructions:

1. Read plan file at `${PLAN_FILE}`
2. Collect relevant `AGENTS.md` files: for each file path in plan, walk up from that file's directory to repo root, collecting any `AGENTS.md` found. Deduplicate (root `AGENTS.md` appears for every path).
3. Read each collected `AGENTS.md` file
4. Review plan for:
   - Errors (incorrect file paths, wrong line references, invalid thread IDs)
   - Inconsistencies (conflicting planned changes, duplicate entries)
   - Missing or ambiguous information (vague planned changes, missing context)
   - Logical problems (fixes that contradict each other or the linked issue)
   - Violations of any rules or conventions in `AGENTS.md` files
5. Return structured list of findings with fix number and description of each issue, or confirm no issues found

#### 5c. Fix Validation Issues

After validator returns, review findings:

- If issues found, update `${PLAN_FILE}` to correct them before proceeding.
- If no issues, proceed directly to approval.

#### 5d. Ask for Approval

Use **AskUserQuestion** tool to ask user for approval:

- Reference plan file path (`${PLAN_FILE}`)
- Ask: "Do you approve this fix plan? You can approve all, reject all, or specify which fixes to skip by number (e.g., 'approve all except #2')."
- Wait for user response before proceeding.

Handle response:

- **Approve all**: proceed to step 6 with all fixable threads.
- **Approve with exclusions**: remove excluded fixes from implementation list, proceed with rest.
- **Reject all**: skip to step 9 (Report), present only analysis without code changes.
- **Request changes to plan**: update `${PLAN_FILE}` per feedback, present again for approval.

### 6. Implement Approved Fixes

Apply only fixes approved by user in step 5. Per approved fix:

- **Reuse existing code**: use utilities, hooks, components, constants already in codebase. Search before writing new code.
- **Match project conventions**: follow coding style, naming, patterns established in project.
- **Keep changes minimal**: change only what reviewer requested. Do not refactor surrounding code.
- **Preserve behavior**: do not break existing functionality or tests.
- **Apply GitHub suggestions verbatim**: if reviewer left a `suggestion` block, apply exactly unless it introduces a bug or violates project conventions.

After each fix, update status from `Fixable` to `Fixed` or `Partially fixed`.

### 7. Verify Changes

After processing all conversations, verify changes are sound.

Read `package.json` for available verification scripts. Determine package manager by lock files (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lockb`).

Run only scripts that exist in `package.json`. Check these common script names in order of preference:

- **Preflight** (runs multiple checks): `preflight`
- **Type checking**: `typecheck`, `type-check`, `tsc`
- **Linting**: `lint`
- **Tests**: `test`, `test:unit`
- **Build**: `build`, `preflight:build`

If no verification scripts found, note in report and skip verification. Do not silently assume verification passed.

If verification fails, determine which fix caused failure. Fix regression if possible. If a fix cannot be corrected without new issues, revert it and update thread outcome to `Not fixable` with reason (e.g., "Fix caused type error; reverted").

### 8. Reply to Threads and Resolve on GitHub

For each thread `Fixed` or `Already addressed`, post reply and resolve on GitHub. Closes feedback loop for reviewer.

#### 8a. Reply to the Thread

Post concise reply explaining what was done. Use first comment's `databaseId` (numeric ID) from thread -- do not use GraphQL node `id`:

```bash
gh api repos/<owner>/<repo>/pulls/<pr_number>/comments/<database_id>/replies \
  -f body="<reply_message>"
```

Reply format by outcome:

- **Fixed**: describe what changed in 1-2 sentences. Example: "Added input validation using the existing `validateInput()` from `utils/validation.ts`."
- **Already addressed**: explain code changed since review. Example: "This was already addressed in a subsequent commit -- the function now uses the pattern you suggested."

Do not reply to `Not fixable` or `Partially fixed` threads -- those need human follow-up.

#### 8b. Resolve the Thread

After replying, resolve thread using its GraphQL node ID (the `id` field from review thread data):

```bash
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread { isResolved }
    }
  }
' -f threadId="<thread_id>"
```

If resolve mutation fails (e.g., permissions), log failure but do not abort. Reply is still valuable even if auto-resolve not possible.

### 9. Report to User

Present summary using PR metadata from JSON output:

```markdown
## PR Review Resolution: #<number>

**PR:** <title> (<url>)
**Branch:** <head_branch>
**Linked Issue:** #<issue_number> (or "None found")
**Threads processed:** <total> | Fixed: <count> | Not fixable: <count> | Already addressed: <count> | Partially fixed: <count>

### Resolution Details

| # | File | Line(s) | Reviewer | Request Summary | Outcome | Notes |
|---|------|---------|----------|-----------------|---------|-------|
| 1 | `src/auth.ts` | 42 | @reviewer | Add input validation | Fixed | Used existing `validateInput()` from `utils/validation.ts` |
| 2 | `src/api.ts` | 15-20 | @reviewer | Unclear naming suggestion | Not fixable | Question without clear direction; needs clarification |

### Not Fixable Items

For each "Not fixable" conversation, explain clearly enough that the user can follow up with the reviewer:

1. **`src/api.ts:15-20`** (@reviewer): "Should we rename this?" -- This is a question, not a directive. The reviewer needs to specify the preferred name before a change can be made.

### Resolved on GitHub

List threads that were replied to and resolved via the API. If any resolve mutations failed, note which threads could not be auto-resolved.
```

### 10. Prompt User for Next Steps

After report, ask user:

- Whether to commit changes (if any fixes applied)
- Whether to push to PR branch
- Whether any "Not fixable" items need further discussion

Do not commit or push automatically -- wait for user's decision.

### 11. Restore Working Tree

**Only if a branch checkout was performed in Step 1** (i.e., user provided specific PR number/URL and original branch differed). If current branch was already PR branch, skip this step.

After user decides (or if process aborted):

```bash
git checkout "${ORIGINAL_BRANCH}"

# Pop the stash if one was created
STASH_INDEX=$(git stash list | grep -m1 "${STASH_MSG}" | sed 's/stash@{\([0-9]*\)}.*/\1/')
if [ -n "$STASH_INDEX" ]; then
  if ! git stash pop "stash@{$STASH_INDEX}"; then
    echo "WARNING: Stash pop failed due to conflicts. Your stashed changes are preserved in stash@{$STASH_INDEX}."
    echo "Resolve conflicts manually, then run: git stash drop 'stash@{$STASH_INDEX}'"
  fi
fi
```

If `git stash pop` fails due to merge conflicts, inform user and preserve stash for manual resolution.

Skip this step entirely if user chose to stay on PR branch.

## Important Notes

- Process only **unresolved** threads. Resolved conversations need no action.
- Linked GitHub issue provides the "why" behind PR. Use it to judge whether feedback aligns with or contradicts original requirements.
- Prefer reusing existing codebase utilities over new helpers. Search project before creating new code.
- When thread has multiple replies, most recent reviewer comment typically represents final position.
- Never fabricate fixes or pretend a conversation is resolved when underlying issue was not addressed.
- Always restore original branch state when done (if checkout was performed). If stash pop fails, inform user and preserve stash.
