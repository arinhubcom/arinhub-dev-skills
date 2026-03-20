---
name: ah-resolve-pr-review
description: Use this skill to resolve unresolved PR conversations when using the "ah" prefix. Use when asked to "ah resolve pr review", or "ah resolve pr review <PR number or URL>". Also use when the user mentions resolving, addressing, or fixing PR review feedback or unresolved threads.
argument-hint: "PR number or URL (e.g., 123, #456, https://github.com/owner/repo/pull/789)"
---

# Resolve Unresolved PR Conversations

Resolve unresolved review conversations on a pull request by reading each comment, understanding the reviewer's intent, and implementing fixes directly in the codebase. Uses the full PR context, the linked GitHub issue, and the existing codebase structure to produce clean, idiomatic fixes.

## Input

- **PR number or URL** (required): The pull request identifier. Accepts:
  - Number: `123`
  - Hash-prefixed: `#123`
  - Full URL: `https://github.com/owner/repo/pull/123`

## Procedure

### 0. Verify GitHub CLI Authentication

```bash
gh auth status
```

If this command fails, stop and ask the user to authenticate with `gh auth login`.

### 1. Resolve PR Identifier and Repository

Extract the PR number from the user input. Resolve the repository owner and name for API calls.

```bash
PR_NUMBER=<extracted number>
REPO_OWNER=$(gh repo view --json owner -q '.owner.login')
REPO_NAME=$(gh repo view --json name -q '.name')
```

### 2. Fetch Full PR Context

Gather the complete PR picture in parallel -- metadata, diff, comments, and reviews.

```bash
# PR metadata (title, body, base/head branches, changed files)
PR_META=$(gh pr view $PR_NUMBER --json number,title,body,baseRefName,headRefName,files,url,state)
PR_BODY=$(echo "$PR_META" | jq -r '.body')
PR_BRANCH=$(echo "$PR_META" | jq -r '.headRefName')
PR_BASE=$(echo "$PR_META" | jq -r '.baseRefName')
PR_URL=$(echo "$PR_META" | jq -r '.url')
PR_TITLE=$(echo "$PR_META" | jq -r '.title')

# Full diff
gh pr diff $PR_NUMBER

# All review comments (inline thread comments)
gh api repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUMBER/comments \
  --paginate \
  --jq '.[] | {id, path, line, original_line, diff_hunk, body, user: .user.login, in_reply_to_id, created_at, pull_request_review_id}'

# All reviews (top-level review bodies with state)
gh api repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUMBER/reviews \
  --paginate \
  --jq '.[] | {id, body, state, user: .user.login}'

# Issue comments (general PR conversation, not inline)
gh api repos/$REPO_OWNER/$REPO_NAME/issues/$PR_NUMBER/comments \
  --paginate \
  --jq '.[] | {id, body, user: .user.login, created_at}'
```

### 3. Find and Read Linked Issue

The linked GitHub issue provides essential context about what the PR is trying to achieve. Extract the issue number from the PR body, then read the full issue.

**Method A -- Closing keywords in PR body:**

Search `$PR_BODY` for GitHub closing keywords: `closes #N`, `fixes #N`, `resolves #N` (and their variants: `close`, `closed`, `fix`, `fixed`, `resolve`, `resolved`), or full URL references.

**Method B -- GitHub linked issues API:**

```bash
gh api graphql \
  -F owner="$REPO_OWNER" \
  -F repo="$REPO_NAME" \
  -F pr_number=$PR_NUMBER \
  -f query='
    query($owner: String!, $repo: String!, $pr_number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr_number) {
          closingIssuesReferences(first: 10) {
            nodes { number title }
          }
        }
      }
    }
  ' --jq '.data.repository.pullRequest.closingIssuesReferences.nodes'
```

**Method C -- Issue reference in PR body:**

Scan `$PR_BODY` for any `#N` pattern or issue URL. Verify each candidate is an actual issue:

```bash
gh api "repos/${REPO_OWNER}/${REPO_NAME}/issues/$N" --jq 'select(.pull_request == null) | .number'
```

If a linked issue is found, fetch its full details:

```bash
gh issue view $ISSUE_NUMBER --json number,title,body,labels,comments
```

Read the entire issue body and comments -- this context helps understand the original requirements and informs whether a reviewer's feedback aligns with the intended behavior.

If no linked issue is found, proceed without it. Note the absence in the final report.

### 4. Identify Unresolved Conversations

Use the GitHub GraphQL API to fetch all review threads and their resolution status:

```bash
gh api graphql \
  -F owner="$REPO_OWNER" \
  -F repo="$REPO_NAME" \
  -F pr_number=$PR_NUMBER \
  -f query='
    query($owner: String!, $repo: String!, $pr_number: Int!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr_number) {
          reviewThreads(first: 100, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              isResolved
              isOutdated
              path
              line
              startLine
              diffSide
              comments(first: 50) {
                nodes {
                  id
                  body
                  author { login }
                  createdAt
                  originalPosition
                  path
                }
              }
            }
          }
        }
      }
    }
  '
```

If `pageInfo.hasNextPage` is `true`, re-run the query with `-F cursor="<endCursor>"` and merge the results. Repeat until `hasNextPage` is `false`. This ensures all review threads are fetched even on large PRs with more than 100 threads.

Filter to only **unresolved** threads (`isResolved: false`). Skip threads that are already resolved -- they require no action.

For each unresolved thread, record:

- `thread_id`: The GraphQL node ID
- `path`: The file path the comment is on
- `line`/`startLine`: The line(s) referenced
- `comments`: The full conversation (all replies in the thread)
- `is_outdated`: Whether the thread references code that has since changed

### 5. Scan Codebase Structure

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

### 6. Validate PR State

Before proceeding, verify the PR is open:

```bash
PR_STATE=$(echo "$PR_META" | jq -r '.state')
if [ "$PR_STATE" != "OPEN" ]; then
  echo "ERROR: PR #${PR_NUMBER} is ${PR_STATE}. Only open PRs can be resolved."
  exit 1
fi
```

If the PR is not open (`CLOSED` or `MERGED`), abort and inform the user.

### 7. Checkout PR Branch

Check out the PR branch so fixes are applied to the correct code:

```bash
ORIGINAL_BRANCH=$(git branch --show-current)

# Stash any uncommitted local changes
STASH_MSG="ah-resolve-pr-review: auto-stash before checkout"
git stash --include-untracked -m "${STASH_MSG}"

# Checkout the PR branch; restore stash and abort on failure
if ! gh pr checkout $PR_NUMBER; then
  STASH_INDEX=$(git stash list | grep -m1 "${STASH_MSG}" | sed 's/stash@{\([0-9]*\)}.*/\1/')
  [ -n "$STASH_INDEX" ] && git stash pop "stash@{$STASH_INDEX}"
  echo "ERROR: Failed to check out PR #${PR_NUMBER}. Review aborted."
  exit 1
fi
```

### 8. Process Each Unresolved Conversation

For each unresolved thread from Step 5, follow this sequence:

#### 8a. Check if Thread is Outdated

If `is_outdated` is `true`, the thread references code that has since changed. The `line`/`startLine` values from the thread may no longer correspond to the current file content. In this case:

1. Read the current version of the file at `path` from the working tree (not the diff hunk).
2. Use the thread's `diff_hunk` and surrounding comment context to locate the relevant code in the current file -- search for the code patterns mentioned in the reviewer's comment rather than relying on the original line numbers.
3. If the referenced code no longer exists or has already been changed to address the reviewer's concern, mark the thread as `Not fixable` with the reason: "Code has changed since review; the concern may already be addressed."
4. If the referenced code still exists at a different location, proceed with the fix using the updated line numbers.

#### 8b. Understand the Reviewer's Intent

Read the full thread (all comments and replies). Determine:

- What is the reviewer asking for? (bug fix, refactor, style change, logic change, performance improvement, etc.)
- Is there a specific suggestion in the thread? (GitHub suggestion block, code snippet, or verbal description)
- Does the request conflict with the linked issue requirements?

#### 8c. Read the Relevant Source Code

Read the file referenced by the thread. Look at the surrounding context -- not just the exact line, but the function/component/module it belongs to. Understand how the code fits into the broader architecture.

#### 8d. Assess Feasibility

Determine if the conversation's request can be addressed in this branch:

**Fixable** -- the request is clear, the change is within scope of the PR, and sufficient information exists to implement it correctly.

**Not fixable** -- the request cannot be addressed. Common reasons:

- Missing information: The reviewer's comment is ambiguous or asks a question without providing direction
- Out of scope: The change would require modifying code unrelated to this PR's purpose
- Conflicting requirements: The reviewer's request contradicts the linked issue's requirements
- External dependency: The fix requires changes in another repository, service, or configuration that this branch cannot affect
- Needs discussion: The reviewer raised a design question that requires team consensus before implementation

#### 8e. Implement the Fix (if fixable)

Apply the change directly to the source code. Follow these principles:

- **Reuse existing code**: Use utilities, hooks, components, CSS classes, constants, and shared functions already present in the codebase. Search for existing patterns before writing new code.
- **Match project conventions**: Follow the coding style, naming conventions, and patterns established in the project (indentation, imports, file organization).
- **Keep changes minimal**: Only change what the reviewer requested. Do not refactor surrounding code or add unrelated improvements.
- **Preserve behavior**: Ensure the fix does not break existing functionality or tests.

#### 8f. Record the Outcome

For each thread, record:

- Thread ID and file/line reference
- Reviewer's request (one-sentence summary)
- Outcome: `Fixed`, `Not fixable`, or `Partially fixed`
- What was done (for fixes) or why it cannot be done (for non-fixable items)

### 9. Verify Changes

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

### 10. Report to User

Present a summary of all processed conversations:

```markdown
## PR Review Resolution: #<PR_NUMBER>

**PR:** <PR_TITLE> (<PR_URL>)
**Branch:** <PR_BRANCH>
**Linked Issue:** #<ISSUE_NUMBER> (or "None found")
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

### 11. Prompt User for Next Steps

After presenting the report, ask the user:

- Whether to commit the changes (if any fixes were applied)
- Whether to push to the PR branch
- Whether any "Not fixable" items need further discussion

Do not commit or push automatically -- wait for the user's decision.

### 12. Restore Working Tree

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
