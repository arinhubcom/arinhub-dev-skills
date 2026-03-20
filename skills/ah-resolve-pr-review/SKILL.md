---
name: ah-resolve-pr-review
description: Use this skill to resolve unresolved PR conversations when using the "ah" prefix. Use when asked to "ah resolve pr review". Also use when the user mentions resolving, addressing, or fixing PR review feedback or unresolved threads.
argument-hint: "PR number or URL (e.g., 47, #47, https://github.com/owner/repo/pull/47), or omit to auto-detect from current branch"
---

# Resolve Unresolved PR Conversations

Resolve unresolved review conversations on a pull request by reading each comment, understanding the reviewer's intent, and implementing fixes directly in the codebase. After fixing, reply to each thread explaining what was done and mark it as resolved on GitHub. Uses the full PR context, the linked GitHub issue, and the existing codebase structure to produce clean, idiomatic fixes.

## Input

- **PR number or URL** (optional): Accepts `123`, `#123`, or full URL. If omitted, the script auto-detects the PR from the current git branch.

## Procedure

### 1. Checkout PR Branch and Fetch Data

Before doing anything, save the current branch and stash state so they can be restored later:

```bash
ORIGINAL_BRANCH=$(git branch --show-current)
STASH_MSG="ah-resolve-pr-review: auto-stash before checkout"
```

**If the user provided a specific PR number or URL**, checkout that branch:

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

**If no PR was specified**, the current branch is assumed to be the PR branch. No checkout or stash is needed.

Then run the fetch script (resolve the path relative to this SKILL.md's directory):

```bash
python3 <skill_dir>/scripts/fetch_pr_data.py
```

If the script fails with an auth error, stop and ask the user to run `gh auth login`.

The script outputs a JSON object containing:

- `pull_request` -- metadata: `number`, `title`, `body`, `url`, `state`, `base_branch`, `head_branch`, `files`, `owner`, `repo`
- `diff` -- full PR diff as a string
- `review_threads` -- object with `total`, `unresolved_count`, `resolved_count`, `unresolved` (array of thread objects with `id`, `isResolved`, `isOutdated`, `path`, `line`, `startLine`, `diffSide`, `comments`), `resolved`
- `reviews` -- simplified review submissions
- `conversation_comments` -- simplified issue comments
- `linked_issues` -- full details of linked issues

Store this JSON for use in subsequent steps. No additional API calls are needed for data collection.

### 2. Validate PR State

Check `pull_request.state`. If it is not `OPEN`, abort and inform the user that only open PRs can be resolved.

If `review_threads.unresolved_count` is `0`, inform the user that there are no unresolved conversations and stop.

### 3. Scan Codebase Structure

Before implementing fixes, build a mental model of the codebase so fixes reuse existing patterns rather than introducing duplicates.

Discover the project layout by checking which directories exist at the project root -- do not assume any specific structure like `src/`. Common layouts include:

- `src/`, `app/`, `lib/`, `packages/`, `modules/`
- Monorepo workspaces: check `package.json` `workspaces` field or `pnpm-workspace.yaml`
- Framework-specific: `pages/`, `routes/`, `api/`, `server/`, `client/`

Focus the scan on directories related to the files referenced in the unresolved threads. For each file touched by an unresolved conversation:

1. Read the file itself and its surrounding module (sibling files, index exports)
2. Identify nearby utilities, hooks, types, constants, and shared functions
3. Check for project-wide conventions: formatting config, linting rules, import aliases

Read key config files relevant to the changes (`package.json`, `tsconfig.json`, etc.). This informs whether existing utilities, hooks, components, CSS classes, or shared functions should be reused in fixes instead of writing new code.

### 4. Process Unresolved Conversations

Group the unresolved threads by `path` (file) so each file is read once and all related threads are processed together. This avoids redundant file reads and helps maintain consistency across fixes in the same file.

For each file group, read the file once, then process each thread in the group:

#### 4a. Check if Thread is Outdated

If `isOutdated` is `true`, the thread references code that has since changed. The `line`/`startLine` values may no longer match the current file content:

1. Read the current version of the file from the working tree.
2. Use the thread's `diffHunk` and comment context to locate the relevant code -- search for the code patterns mentioned rather than relying on original line numbers.
3. If the referenced code no longer exists or has already been changed to address the concern, record the thread as `Already addressed` with the reason.
4. If the referenced code still exists at a different location, proceed with the fix using the updated location.

#### 4b. Understand the Reviewer's Intent

Read the full thread (all comments and replies). Determine:

- What is the reviewer asking for? (bug fix, refactor, style change, logic change, performance improvement, etc.)
- Is there a specific suggestion? (GitHub suggestion block, code snippet, or verbal description)
- Does the request conflict with the linked issue requirements?
- In threads with multiple replies, the most recent comment from the reviewer typically represents their final position.

#### 4c. Assess Feasibility

**Fixable** -- the request is clear, the change is within scope, and sufficient information exists to implement it correctly.

**Not fixable** -- common reasons:

- Missing information: ambiguous comment or question without direction
- Out of scope: change requires modifying code unrelated to the PR
- Conflicting requirements: contradicts the linked issue
- External dependency: fix requires changes in another repository or service
- Needs discussion: design question requiring team consensus

#### 4d. Implement the Fix (if fixable)

Apply the change directly to the source code:

- **Reuse existing code**: Use utilities, hooks, components, constants already in the codebase. Search before writing new code.
- **Match project conventions**: Follow coding style, naming conventions, and patterns established in the project.
- **Keep changes minimal**: Only change what the reviewer requested. Do not refactor surrounding code.
- **Preserve behavior**: Do not break existing functionality or tests.
- **Apply GitHub suggestions verbatim**: If the reviewer left a `suggestion` block, apply it exactly unless it introduces a bug or violates project conventions.

#### 4e. Record the Outcome

For each thread, record:

- Thread ID (`id` from GraphQL -- this is the node ID needed for the resolve mutation)
- File path and line reference
- Reviewer's request (one-sentence summary)
- Outcome: `Fixed`, `Not fixable`, `Already addressed`, or `Partially fixed`
- What was done (for fixes) or why it cannot be done (for non-fixable items)

### 5. Verify Changes

After processing all conversations, verify the changes are sound.

Read `package.json` to find available verification scripts. Determine the package manager by checking for lock files (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lockb`).

Run only scripts that exist in `package.json`. Check for these common script names in order of preference:

- **Preflight** (runs multiple checks): `preflight`
- **Type checking**: `typecheck`, `type-check`, `tsc`
- **Linting**: `lint`
- **Tests**: `test`, `test:unit`
- **Build**: `build`, `preflight:build`

If no verification scripts are found, note this in the report and skip verification. Do not silently assume verification passed.

If verification fails, determine which fix caused the failure. Fix the regression if possible. If a fix cannot be corrected without introducing new issues, revert it and update the thread's outcome to `Not fixable` with the reason (e.g., "Fix caused type error; reverted").

### 6. Reply to Threads and Resolve on GitHub

For each thread that was `Fixed` or `Already addressed`, post a reply and resolve it on GitHub. This closes the feedback loop for the reviewer.

#### 6a. Reply to the Thread

Post a concise reply explaining what was done. Use the first comment's `id` from the thread to reply:

```bash
gh api repos/<owner>/<repo>/pulls/<pr_number>/comments/<comment_id>/replies \
  -f body="<reply_message>"
```

Reply format by outcome:

- **Fixed**: Describe what was changed in 1-2 sentences. Example: "Added input validation using the existing `validateInput()` from `utils/validation.ts`."
- **Already addressed**: Explain that the code has changed since the review. Example: "This was already addressed in a subsequent commit -- the function now uses the pattern you suggested."

Do not reply to `Not fixable` or `Partially fixed` threads -- those need human follow-up.

#### 6b. Resolve the Thread

After replying, resolve the thread using its GraphQL node ID (the `id` field from the review thread data):

```bash
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread { isResolved }
    }
  }
' -f threadId="<thread_id>"
```

If the resolve mutation fails (e.g., permissions), log the failure but do not abort. The reply is still valuable even if auto-resolve is not possible.

### 7. Report to User

Present a summary using the PR metadata from the JSON output:

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

### 8. Prompt User for Next Steps

After presenting the report, ask the user:

- Whether to commit the changes (if any fixes were applied)
- Whether to push to the PR branch
- Whether any "Not fixable" items need further discussion

Do not commit or push automatically -- wait for the user's decision.

### 9. Restore Working Tree

**Only if a branch checkout was performed in Step 1** (i.e., the user provided a specific PR number/URL and the original branch was different). If the current branch was already the PR branch, skip this step.

After the user has made their decision (or if the process is aborted):

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

If `git stash pop` fails due to merge conflicts, inform the user and preserve the stash for manual resolution.

Skip this step entirely if the user chose to stay on the PR branch.

## Important Notes

- Only process **unresolved** threads. Resolved conversations require no action.
- The linked GitHub issue provides the "why" behind the PR. Use it to judge whether feedback aligns with or contradicts the original requirements.
- Prefer reusing existing codebase utilities over writing new helpers. Search the project before creating new code.
- When a thread has multiple replies, the most recent comment from the reviewer typically represents their final position.
- Never fabricate fixes or pretend a conversation is resolved when the underlying issue was not addressed.
- Always restore the original branch state when done (if a checkout was performed). If stash pop fails, inform the user and preserve the stash.
