---
name: ah-resolve-pr-review
description: Use this skill to resolve unresolved PR conversations when using the "ah" prefix. Use when asked to "ah resolve pr review". Also use when the user mentions resolving, addressing, or fixing PR review feedback or unresolved threads.
---

# Resolve Unresolved PR Conversations

Resolve unresolved review conversations on a pull request by reading each comment, understanding the reviewer's intent, and implementing fixes directly in the codebase. Uses the full PR context, the linked GitHub issue, and the existing codebase structure to produce clean, idiomatic fixes.

## Input

- **PR number or URL** (optional): If provided, checkout that PR branch first. If omitted, the script auto-detects the PR from the current git branch.

## Procedure

### 1. Fetch All PR Data

Read and execute the `scripts/fetch_pr_data.py` script from this skill's directory. It verifies `gh auth status`, auto-detects the PR from the current git branch, and collects all needed data in a single call with proper pagination.

Before anything else, capture the current branch so it can be restored later:

```bash
ORIGINAL_BRANCH=$(git branch --show-current)
STASH_MSG="ah-resolve-pr-review: auto-stash before checkout"
```

If the user provided a specific PR number or URL, checkout that branch first so the script can detect it:

```bash
gh pr checkout <PR_NUMBER>
```

Then run the script (resolve the path relative to this SKILL.md's directory):

```bash
python3 <skill_dir>/scripts/fetch_pr_data.py
```

If the script fails with an auth error, stop and ask the user to run `gh auth login`.

The script outputs a JSON object with the following structure:

- `pull_request` -- metadata: `number`, `title`, `body`, `url`, `state`, `base_branch`, `head_branch`, `files`, `owner`, `repo`
- `diff` -- full PR diff as a string
- `review_threads` -- object containing:
  - `total`, `unresolved_count`, `resolved_count` -- counts
  - `unresolved` -- array of unresolved thread objects (each with `id`, `isResolved`, `isOutdated`, `path`, `line`, `startLine`, `diffSide`, `comments`)
  - `resolved` -- array of resolved thread objects
- `reviews` -- simplified review submissions (`id`, `body`, `state`, `user`, `submitted_at`)
- `conversation_comments` -- simplified issue comments (`id`, `body`, `user`, `created_at`)
- `linked_issues` -- full details of linked issues (found via GraphQL `closingIssuesReferences`, closing keywords in PR body, or `#N` references verified as issues)

Store this JSON for use in subsequent steps. All PR context, review threads, linked issues, and diff are available from this single output -- no additional API calls are needed for data collection.

### 2. Validate PR State

Check `pull_request.state` in the JSON output. If it is not `OPEN`, abort and inform the user that only open PRs can be resolved.

If `review_threads.unresolved_count` is `0`, inform the user that there are no unresolved conversations and stop.

### 3. Scan Codebase Structure

Before implementing fixes, build a mental model of the codebase so fixes reuse existing patterns rather than introducing duplicates. Use Glob and Read tools to explore the project structure and identify available resources.

Search for these key directories and patterns (adjust paths based on the project):

- **Utility functions**: `src/utils/**`, `src/helpers/**`, `src/lib/**`
- **Hooks**: `src/hooks/**`
- **Components**: `src/components/**`
- **Styles/CSS**: `src/styles/**`, `tailwind.config.*`, `*.css`
- **Types**: `src/types/**`
- **Constants**: `src/constants/**`
- **Config**: `src/config/**`

Read key files that are relevant to the files touched by the unresolved conversations (package.json, tsconfig.json, relevant config files, nearby utility modules). This informs whether existing utilities, hooks, components, CSS classes, or shared functions can be used in fixes instead of writing new code.

Focus the scan on directories related to the files referenced in the unresolved threads -- there is no need to map the entire codebase if the conversations only touch a few areas.

### 4. Checkout PR Branch

Skip this step if already on the PR branch (either from Step 1 checkout or because auto-detect means the current branch IS the PR branch).

If a checkout is needed, stash any uncommitted local changes first:

```bash
# Stash any uncommitted local changes
git stash --include-untracked -m "${STASH_MSG}"

# Checkout the PR branch; restore stash and abort on failure
if ! gh pr checkout $PR_NUMBER; then
  STASH_INDEX=$(git stash list | grep -m1 "${STASH_MSG}" | sed 's/stash@{\([0-9]*\)}.*/\1/')
  [ -n "$STASH_INDEX" ] && git stash pop "stash@{$STASH_INDEX}"
  echo "ERROR: Failed to check out PR. Review aborted."
  exit 1
fi
```

### 5. Process Each Unresolved Conversation

For each unresolved thread from `review_threads.unresolved` in the JSON data, follow this sequence:

#### 5a. Check if Thread is Outdated

If `is_outdated` is `true`, the thread references code that has since changed. The `line`/`startLine` values from the thread may no longer correspond to the current file content. In this case:

1. Read the current version of the file at `path` from the working tree (not the diff hunk).
2. Use the thread's `diff_hunk` and surrounding comment context to locate the relevant code in the current file -- search for the code patterns mentioned in the reviewer's comment rather than relying on the original line numbers.
3. If the referenced code no longer exists or has already been changed to address the reviewer's concern, mark the thread as `Not fixable` with the reason: "Code has changed since review; the concern may already be addressed."
4. If the referenced code still exists at a different location, proceed with the fix using the updated line numbers.

#### 5b. Understand the Reviewer's Intent

Read the full thread (all comments and replies). Determine:

- What is the reviewer asking for? (bug fix, refactor, style change, logic change, performance improvement, etc.)
- Is there a specific suggestion in the thread? (GitHub suggestion block, code snippet, or verbal description)
- Does the request conflict with the linked issue requirements?

#### 5c. Read the Relevant Source Code

Read the file referenced by the thread. Look at the surrounding context -- not just the exact line, but the function/component/module it belongs to. Understand how the code fits into the broader architecture.

#### 5d. Assess Feasibility

Determine if the conversation's request can be addressed in this branch:

**Fixable** -- the request is clear, the change is within scope of the PR, and sufficient information exists to implement it correctly.

**Not fixable** -- the request cannot be addressed. Common reasons:

- Missing information: The reviewer's comment is ambiguous or asks a question without providing direction
- Out of scope: The change would require modifying code unrelated to this PR's purpose
- Conflicting requirements: The reviewer's request contradicts the linked issue's requirements
- External dependency: The fix requires changes in another repository, service, or configuration that this branch cannot affect
- Needs discussion: The reviewer raised a design question that requires team consensus before implementation

#### 5e. Implement the Fix (if fixable)

Apply the change directly to the source code. Follow these principles:

- **Reuse existing code**: Use utilities, hooks, components, CSS classes, constants, and shared functions already present in the codebase. Search for existing patterns before writing new code.
- **Match project conventions**: Follow the coding style, naming conventions, and patterns established in the project (indentation, imports, file organization).
- **Keep changes minimal**: Only change what the reviewer requested. Do not refactor surrounding code or add unrelated improvements.
- **Preserve behavior**: Ensure the fix does not break existing functionality or tests.

#### 5f. Record the Outcome

For each thread, record:

- Thread ID and file/line reference
- Reviewer's request (one-sentence summary)
- Outcome: `Fixed`, `Not fixable`, or `Partially fixed`
- What was done (for fixes) or why it cannot be done (for non-fixable items)

### 6. Verify Changes

After processing all conversations, verify the changes are sound:

Read `package.json` to find available verification scripts (e.g., `preflight`, `lint`, `typecheck`, `build`). Determine which package manager the project uses (`pnpm`, `npm`, or `yarn`) by checking for lock files (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`).

Run only the scripts that exist in `package.json`. Do not blindly chain commands with `2>/dev/null` -- if a script is not defined, skip it. If a script exists, run it and check its exit code:

```bash
# Example: Read package.json first, then run only defined scripts
# If package.json has "preflight" script:
pnpm preflight

# If package.json has "build" or "preflight:build" script:
pnpm preflight:build
```

If no verification scripts are found in `package.json`, note this in the report and skip verification. Do not silently assume verification passed.

If verification fails, determine which fix caused the failure. Fix the regression if possible. If a fix cannot be corrected without introducing new issues, revert it and mark the conversation as `Not fixable` with the reason (e.g., "Fix caused type error in unrelated module; reverted").

### 7. Report to User

Present a summary using the PR metadata from the JSON output:

```markdown
## PR Review Resolution: #<pull_request.number>

**PR:** <pull_request.title> (<pull_request.url>)
**Branch:** <pull_request.head_branch>
**Linked Issue:** #<linked_issues[0].number> (or "None found")
**Threads processed:** <total> | Fixed: <count> | Not fixable: <count> | Partially fixed: <count>

### Resolution Details

| #   | File          | Line(s) | Reviewer  | Request Summary           | Outcome     | Notes                                                                            |
| --- | ------------- | ------- | --------- | ------------------------- | ----------- | -------------------------------------------------------------------------------- |
| 1   | `src/auth.ts` | 42      | @reviewer | Add input validation      | Fixed       | Used existing `validateInput()` from `src/utils/validation.ts`                   |
| 2   | `src/api.ts`  | 15-20   | @reviewer | Unclear naming suggestion | Not fixable | Comment is a question without clear direction; needs clarification from reviewer |
| 3   | `src/db.ts`   | 88      | @reviewer | Add error handling        | Fixed       | Wrapped in try-catch matching pattern from `src/utils/errors.ts`                 |

### Not Fixable Items

For each "Not fixable" conversation, provide a brief explanation:

1. **`src/api.ts:15-20`** (@reviewer): "Should we rename this?" -- This is a question, not a directive. The reviewer needs to specify the preferred name before a change can be made.
```

The report should be concise and actionable. For "Not fixable" items, the explanation should be clear enough that the user can follow up with the reviewer directly.

### 8. Prompt User for Next Steps

After presenting the report, ask the user:

- Whether to commit the changes (if any fixes were applied)
- Whether to push to the PR branch
- Whether any "Not fixable" items need further discussion

Do not commit or push automatically -- wait for the user's decision.

### 9. Restore Working Tree

After the user has made their decision (or if the process is aborted at any point), restore the original branch state:

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

If `git stash pop` fails due to merge conflicts, inform the user that their stashed changes are preserved and provide instructions for manual resolution. Do not silently leave the working tree in a conflicted state.

Skip this step if the user chose to stay on the PR branch (e.g., to continue working on it).

## Important Notes

- Only process **unresolved** threads. Resolved conversations are already handled and require no action.
- The linked GitHub issue provides the "why" behind the PR. Use it to judge whether a reviewer's feedback aligns with or contradicts the original requirements.
- Prefer reusing existing codebase utilities over writing new helper functions. Search `src/utils/`, `src/hooks/`, `src/components/`, and similar directories before creating new code.
- If a reviewer left a GitHub suggestion block (```suggestion), apply it verbatim unless it introduces a bug or violates project conventions.
- When a thread has multiple replies, the most recent comment from the reviewer typically represents their final position. Earlier comments may have been addressed by intermediate replies.
- Never fabricate fixes or pretend a conversation is resolved when the underlying issue was not addressed.
- Always restore the original branch state when done. If stash pop fails due to conflicts, inform the user and preserve the stash for manual resolution.
