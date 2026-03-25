---
name: ah-review-code
description: Use this skill to review code when using the "ah" prefix. Use when asked to "ah review code" or "ah review code 123". Review code for correctness, maintainability, and adherence to project standards. Supports local branch changes and remote Pull Requests (by ID or URL). Also use when the user says "ah review", "ah code review", "ah review my changes", "ah review this PR", or mentions reviewing code with the "ah" prefix, even if they don't say "code" explicitly.
argument-hint: "PR number or URL (e.g., 100, #456, https://github.com/owner/repo/pull/789), or omit for local changes"
---

# Code Reviewer

Orchestrate a comprehensive code review by running multiple review strategies in parallel, merging and deduplicating findings into a review file. Supports both remote PRs and local branch changes.

## Input

- **PR number or URL** (optional): Accepts `123`, `#123`, or full URL. If omitted, reviews local changes.
- **Base branch** (optional, local mode only): The branch to diff against (e.g., `main`, `develop`). Auto-detected if not provided.

## Procedure

### 0. Verify GitHub CLI Authentication

```bash
gh auth status
```

If this command fails, stop and ask the user to authenticate with `gh auth login`.

### 1. Determine Review Target

- **Remote PR**: If the user provides a PR number or URL (e.g., "Review PR #123"), target that remote PR. Set `MODE=pr`.
- **Local Changes**: If no specific PR is mentioned, or if the user asks to "review my changes", target the current local file system changes (staged and unstaged). Set `MODE=local`.

### 2. Resolve Identifier and Repository

```sh
REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
REVIEWS_DIR=~/.agents/arinhub/code-reviews
DIFFS_DIR=~/.agents/arinhub/diffs
```

Create `${REVIEWS_DIR}` and `${DIFFS_DIR}` directories if they do not exist.

**If `MODE=pr`:**

```sh
MODE=pr
PR_NUMBER=<extracted from user input>
REVIEW_ID=${MODE}-${REPO_NAME}-${PR_NUMBER}
REVIEW_FILE=${REVIEWS_DIR}/code-review-${REVIEW_ID}.md

# Get the PR branch name, base branch, URL, and title from PR metadata (single API call).
PR_META=$(gh pr view ${PR_NUMBER} --json headRefName,baseRefName,url,title)
PR_BRANCH=$(echo "$PR_META" | jq -r '.headRefName')
PR_BASE=$(echo "$PR_META" | jq -r '.baseRefName')
PR_URL=$(echo "$PR_META" | jq -r '.url')
PR_TITLE=$(echo "$PR_META" | jq -r '.title')
```

**If `MODE=local`:**

Auto-detect the base branch using this priority order:

1. User-provided base branch (if given)
2. Base branch of an open/draft PR for the current branch: `gh pr view --json baseRefName -q '.baseRefName' 2>/dev/null`
3. Repository default branch: `gh repo view --json defaultBranchRef -q '.defaultBranchRef.name' 2>/dev/null`
4. Fall back to `main`

```sh
MODE=local
BRANCH_NAME=$(git branch --show-current | tr '/' '-')
REVIEW_ID=${MODE}-${REPO_NAME}-branch-${BRANCH_NAME}
REVIEW_FILE=${REVIEWS_DIR}/code-review-${REVIEW_ID}.md

BASE_BRANCH=<resolved from priority above>

# Find the point where the current branch diverged from the base branch.
MERGE_BASE=$(git merge-base "${BASE_BRANCH}" HEAD)
```

**Collision avoidance:** Check whether a review file or any subagent files for this `REVIEW_ID` already exist. If so, append a sequential number suffix to produce a unique `REVIEW_ID`.

```bash
BASE_REVIEW_ID=${REVIEW_ID}

if compgen -G "${REVIEWS_DIR}/code-review-${BASE_REVIEW_ID}.md" > /dev/null 2>&1 || \
   compgen -G "${REVIEWS_DIR}/subagent-*-${BASE_REVIEW_ID}.md" > /dev/null 2>&1; then
  N=1
  while compgen -G "${REVIEWS_DIR}/code-review-${BASE_REVIEW_ID}-${N}.md" > /dev/null 2>&1 || \
        compgen -G "${REVIEWS_DIR}/subagent-*-${BASE_REVIEW_ID}-${N}.md" > /dev/null 2>&1; do
    N=$((N + 1))
  done
  REVIEW_ID=${BASE_REVIEW_ID}-${N}
  REVIEW_FILE=${REVIEWS_DIR}/code-review-${REVIEW_ID}.md
fi
```

### 3. Initialize Review File

**If `MODE=pr`:**

Create the review file with a header:

```markdown
# PR Review: ${REPO_NAME} #${PR_NUMBER}

**Date:** <current date>
**Repo:** ${REPO_NAME}
**Branch:** ${PR_BRANCH}
**Base Branch:** ${PR_BASE}
**PR Number:** ${PR_NUMBER}
**PR Title:** ${PR_TITLE}
**PR Link:** ${PR_URL}

## Issues

<!-- Issues from parallel review agents merged below. No duplicates. -->
```

**If `MODE=local`:**

Create the review file with a header:

```markdown
# Local Review: ${REPO_NAME} (${BRANCH_NAME})

**Date:** <current date>
**Repo:** ${REPO_NAME}
**Branch:** ${BRANCH_NAME}
**Base Branch:** ${BASE_BRANCH} (merge base: ${MERGE_BASE})

## Issues

<!-- Issues from parallel review agents merged below. No duplicates. -->
```

### 4. Prepare Diff

Save the diff to a shared file so subagents can read it.

**If `MODE=pr`:**

```bash
DIFF_FILE=${DIFFS_DIR}/diff-${REVIEW_ID}.diff
gh pr diff ${PR_NUMBER} > ${DIFF_FILE}
```

**If `MODE=local`:**

Diff from the merge base (resolved in Step 2) to the current working tree. This captures all changes on the feature branch — both committed and uncommitted — relative to the source branch. Note: untracked files (new files not yet `git add`-ed) are not included in the diff. To include new files in the review, stage them first with `git add -N <file>` (intent-to-add) before running the review.

```bash
DIFF_FILE=${DIFFS_DIR}/diff-${REVIEW_ID}.diff
git diff "${MERGE_BASE}" > "${DIFF_FILE}"
```

#### Diff size check

After saving the diff, check its size:

```bash
DIFF_LINES=$(wc -l < "${DIFF_FILE}")
```

- **Under 5,000 lines**: Proceed normally — pass the full diff to all subagents.
- **5,000 to 15,000 lines**: Warn the user that the diff is large and the review may take longer or miss some issues. Proceed with the full diff.
- **Over 15,000 lines**: The diff is too large for reliable review. Ask the user whether to:
  1. Proceed anyway (with a warning that review quality will degrade)
  2. Provide a list of files or directories to focus on — then re-generate the diff filtered to those paths: `git diff "${MERGE_BASE}" -- <paths>` (local) or `gh pr diff ${PR_NUMBER} | filterdiff -i '<pattern>'` (PR mode, if `filterdiff` is available, otherwise filter manually)

### 5. Detect React Code

Check whether the diff contains React code using a quick grep — no subagent needed.

```bash
HAS_REACT=false
if grep -qE '\.(tsx|jsx)\b' "${DIFF_FILE}" || \
   grep -qE "from ['\"]react['\"]|from ['\"]react-dom|require\(['\"]react['\"]" "${DIFF_FILE}" || \
   grep -qE '<[A-Z][a-zA-Z]+|React\.createElement|use(State|Effect|Ref|Memo|Callback|Context|Reducer|LayoutEffect)\b' "${DIFF_FILE}"; then
  HAS_REACT=true
fi
```

This covers file extensions (`.tsx`, `.jsx`), React imports, JSX elements (tags starting with uppercase), `React.createElement`, and common hooks. The grep runs in milliseconds on even large diffs, so there is no reason to delegate this to a subagent.

### 6. Launch Parallel Subagents

Spawn all subagents **in a single turn** so they run concurrently. This includes both the review subagents (A–D) and the requirements coverage subagent (E), because they are independent of each other.

Each review subagent writes to its own dedicated file:

```
SUBAGENT_FILE=${REVIEWS_DIR}/subagent-<agent-name>-${REVIEW_ID}.md
```

Where `<agent-name>` is one of: `code-reviewer`, `octocode-roast`, `pr-review-toolkit`, `react-doctor`.

Before launching the subagents, read the issue format specification from [issue-format.md](references/issue-format.md) and embed its full content directly into each review subagent prompt (A–D). This ensures subagents have the format regardless of the current working directory.

**Shared context for review subagents (A–D):**

Every review subagent prompt must include:

> A diff file at `${DIFF_FILE}` contains all the changes to review. Do not switch branches, run `gh pr checkout`, or modify the working tree. Do not submit any review.
>
> **Output:** Write your findings to `${SUBAGENT_FILE}` (your dedicated output file). Use the issue format specification embedded in your prompt above.

**Delegation rule (applies to ALL subagents A–E):** Each subagent's sole job is to invoke its assigned skill and return whatever the skill produces. Do NOT perform the analysis yourself. Do NOT write review logic, diagnostic logic, or generate findings manually. Each skill contains its own methodology — delegate to it completely.

**Worktree isolation for PR mode:** In `MODE=pr`, launch review subagents A–D with `isolation: "worktree"` so they get an isolated copy of the repo checked out to the PR branch. This avoids touching the user's working tree entirely — no stashing, no checkout, no risk of interrupted state. The worktree is cleaned up automatically when the subagent finishes. In `MODE=local`, do not use worktree isolation — the working tree already contains the changes.

- If `HAS_REACT=true`: spawn **five** subagents (A, B, C, D, E).
- If `HAS_REACT=false`: spawn **four** subagents (A, B, C, E) — skip Subagent D.

#### Subagent A: code-reviewer

- **File:** `${REVIEWS_DIR}/subagent-code-reviewer-${REVIEW_ID}.md`
- **Invoke:** `/code-reviewer`

#### Subagent B: octocode-roast

- **File:** `${REVIEWS_DIR}/subagent-octocode-roast-${REVIEW_ID}.md`
- **Invoke:** `/octocode-roast`
- **Extra Arguments:** add `code review`

#### Subagent C: pr-review-toolkit

- **File:** `${REVIEWS_DIR}/subagent-pr-review-toolkit-${REVIEW_ID}.md`
- **Invoke:** `/pr-review-toolkit:review-pr`
- **Extra Arguments:** add `all parallel`

#### Subagent D: react-doctor (only if `HAS_REACT=true`)

- **File:** `${REVIEWS_DIR}/subagent-react-doctor-${REVIEW_ID}.md`
- **Invoke:** `/react-doctor`
- **Extra Output:** add full diagnostic report in the subagent's response for merging into the final review file

#### Subagent E: requirements coverage

- **Invoke:** `/ah-verify-requirements-coverage`
- **CRITICAL:** Do NOT perform requirements verification yourself. The skill contains its own methodology — delegate to it completely and return whatever it produces (full requirements coverage report in markdown format).

**If `MODE=pr`:** Pass PR `${PR_NUMBER}` and `${DIFF_FILE}` as arguments to the skill. If a linked issue number was identified during the review (e.g., from PR body or metadata), pass it as well to avoid redundant API lookups. The skill will resolve the linked issue on its own if no issue number is provided.

**If `MODE=local`:** Pass `${DIFF_FILE}` as an argument to the skill. The skill will attempt to extract the linked issue number from the branch name (e.g., `feature/42-description`, `fix/42`, `issue-42-description`). If no issue can be determined, the skill will skip coverage verification and report that no linked issue was found.

### 7. Handle Subagent Failures

As subagent results come in, check each one:

- **Review subagents (A–D):** Verify the subagent's output file exists and is non-empty. If a subagent failed (error, timeout, or empty output), log it in the review file under a `## Subagent Failures` section and continue with results from the remaining agents:

```markdown
## Subagent Failures

- **octocode-roast**: Timed out after 10 minutes. Issues from this agent are not included.
```

- **Requirements coverage (E):** If the subagent failed, note it in the review file and proceed without coverage data. Do not block the review on this failure.

The review is only aborted if **all** review subagents (A–D) fail. If at least one produces results, proceed with what is available.

### 8. Merge and Deduplicate Issues

Read all subagent output files (`${REVIEWS_DIR}/subagent-*-${REVIEW_ID}.md`) and deduplicate using the following concrete algorithm:

#### Step 1: Parse issues

Extract individual issues from each subagent file. Each issue has these fields (from the issue format): severity, file path, line range, description, code, suggestion.

#### Step 2: Build fingerprints

For each issue, create a fingerprint tuple:

```
(normalized_file_path, line_bucket, concern_category)
```

- `normalized_file_path`: The file path with any leading `./` or `/` stripped.
- `line_bucket`: The midpoint of the line range, rounded down to the nearest multiple of 10. This groups issues on nearby lines (e.g., lines 42 and 47 both bucket to 40). Single-line issues use the line number itself rounded down.
- `concern_category`: One of: `security`, `correctness`, `performance`, `maintainability`, `style`, `accessibility`, `other`. Assign by scanning the description for keywords:
  - `security`: injection, XSS, CSRF, auth, secret, sanitize, escape, vulnerability
  - `correctness`: bug, null, undefined, crash, error, race condition, incorrect, wrong
  - `performance`: slow, O(n), memory, cache, lazy, optimize, render, re-render
  - `maintainability`: complex, refactor, duplicate, dead code, coupling, readability
  - `style`: naming, format, convention, lint, whitespace, consistency
  - `accessibility`: a11y, aria, screen reader, focus, keyboard, alt text
  - If multiple categories match, use the first one in the list above (higher priority). If none match, use `other`.

#### Step 3: Group and deduplicate

Group issues by fingerprint. Within each group:

1. If only one issue exists, keep it as-is.
2. If multiple issues share the same fingerprint, keep the one with the longest description + suggestion (most detailed). Tag it with all sources: `[code-reviewer, octocode-roast]`.
3. If two issues are in adjacent buckets (e.g., 40 and 50) for the same file and concern category, check if they describe the same problem by comparing their descriptions. If the descriptions overlap significantly (both mention the same function/variable name and the same fix), merge them — keep the more detailed one and tag with both sources.

#### Step 4: Format for review file

Transform each kept issue's `**File:**` field from the plain path in issue-format into the linked format used in review-format: combine the file path with the `**Line(s):**` value to produce a markdown link — e.g., `**File:** [`path/to/file.ts:42`](/absolute/path/to/file.ts#L42)` for single lines or `**File:** [`path/to/file.ts:42-50`](/absolute/path/to/file.ts#L42-L50)` for ranges.

### 9. Write Issues to Review File

Append deduplicated issues to the review file, grouped by severity. Use the format defined in [review-format.md](references/review-format.md).

### 10. React Health Report

**Skip this step if `HAS_REACT=false`.**

Follow the instructions in [react-health-report.md](references/react-health-report.md).

### 11. Append Requirements Coverage

Append the requirements coverage report (returned by Subagent E in Step 6) to the review file:

```markdown
## Requirements Coverage

<coverage report content from ah-verify-requirements-coverage>
```

If Subagent E failed or returned no data, note that coverage data is unavailable.

### 12. Submit PR Review

**Skip this step if `MODE=local`.**

**Wait for Step 11** — do not proceed until the requirements coverage report has been appended to the review file.

Follow the instructions in [submit-pr-review.md](references/submit-pr-review.md).
The subagent returns an **Issues Table** — append it to the end of `${REVIEW_FILE}`.

### 13. Report to User

**If `MODE=pr`:**

Present a summary:

- Path to the review file
- Total issues found (by severity)
- Requirements coverage percentage with one-line summary (if available)
- Whether the review was submitted successfully
- The PR URL for reference
- Present the **Issues Table** (returned by the `ah-submit-code-review` subagent in Step 12)
- Any subagent failures noted in Step 7

**If `MODE=local`:**

Present the review file (`${REVIEW_FILE}`) content to the user and a summary:

- Path to the review file
- Total issues found (by severity)
- Requirements coverage percentage with one-line summary (if available)
- Branch name and list of changed files reviewed
- Any subagent failures noted in Step 7

## Important Notes

- Review subagents and requirements coverage all run in parallel to minimize total review time.
- The `react-doctor` subagent is only launched when the diff contains React code (detected via grep in Step 5). This avoids unnecessary React diagnostics on non-React changes.
- In `MODE=pr`, subagents use worktree isolation — the user's working tree is never modified. No stashing, no checkout, no restore step needed.
- The review file is the single source of truth — all findings are merged there before submission.
- Deduplication uses a fingerprint-based algorithm: file path + line bucket + concern category. Issues with the same fingerprint are merged, keeping the most detailed version.
- The review file persists at `~/.agents/arinhub/code-reviews/` for future reference and audit.
- The diff file persists at `~/.agents/arinhub/diffs/` and is shared read-only across all subagents.
- If a subagent fails or times out, the review proceeds with results from the remaining agents. Failures are noted in the review file.
- In `MODE=local`, Step 12 (Submit PR Review) is skipped — the review is output only to the review file and presented to the user.
