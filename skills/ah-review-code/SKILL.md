---
name: ah-review-code
description: Review code with the "ah" prefix. Use for "ah review code", "ah review code 123", "ah review", "ah code review", "ah review my changes", or "ah review this PR" (even without "code"). Reviews correctness, maintainability, and adherence to project standards for local branch changes or remote Pull Requests (by ID or URL).
argument-hint: "PR number or URL (e.g., 100, #456, https://github.com/owner/repo/pull/789), or omit for local changes"
---

# Code Reviewer

Orchestrate comprehensive code review. Run multiple review strategies in parallel, merge and dedup findings into review file. Supports remote PRs and local branch changes.

## Input

- **PR number or URL** (optional): Accepts `123`, `#123`, or full URL. Omitted = review local changes.
- **Base branch** (optional, local mode only): Branch to diff against (e.g., `main`, `develop`). Auto-detected if not provided.

## Configuration

- **Subagent defaults**: Opus with low effort for all subagents.

## Procedure

### 0. Verify GitHub CLI Authentication

```bash
gh auth status
```

If command fails, stop and ask the user to authenticate with `gh auth login`.

### 1. Determine Review Target

- **Remote PR**: User provides PR number or URL (e.g., "Review PR #123"). Target that remote PR. Set `MODE=pr`.
- **Local Changes**: No PR mentioned, or user asks to "review my changes". Target current local file system changes (staged and unstaged). Set `MODE=local`.

### 2. Resolve Identifier and Repository

```sh
REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
REVIEWS_DIR=~/.agents/arinhub/code-reviews
DIFFS_DIR=~/.agents/arinhub/diffs
```

Create `${REVIEWS_DIR}` and `${DIFFS_DIR}` if they do not exist.

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

Auto-detect base branch using this priority order:

1. User-provided base branch (if given)
2. Base branch of an open/draft PR for current branch: `gh pr view --json baseRefName -q '.baseRefName' 2>/dev/null`
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

**Collision avoidance:** Check whether a review file or any subagent files for this `REVIEW_ID` already exist. If so, append sequential number suffix to produce unique `REVIEW_ID`.

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

Create review file with header:

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

Create review file with header:

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

Save diff to shared file so subagents can read it.

**If `MODE=pr`:**

```bash
DIFF_FILE=${DIFFS_DIR}/diff-${REVIEW_ID}.diff
gh pr diff ${PR_NUMBER} > ${DIFF_FILE}
```

**If `MODE=local`:**

Diff from merge base (resolved in Step 2) to current working tree. Captures all feature-branch changes — committed and uncommitted — relative to source branch. Note: untracked files (new files not yet `git add`-ed) are not included in diff. To include new files, stage them first with `git add -N <file>` (intent-to-add) before running review.

```bash
DIFF_FILE=${DIFFS_DIR}/diff-${REVIEW_ID}.diff
git diff "${MERGE_BASE}" > "${DIFF_FILE}"
```

#### Diff size check

After saving diff, check its size:

```bash
DIFF_LINES=$(wc -l < "${DIFF_FILE}")
```

- **Under 5,000 lines**: Proceed normally — pass full diff to all subagents.
- **5,000 to 15,000 lines**: Warn user diff is large; review may take longer or miss issues. Proceed with full diff.
- **Over 15,000 lines**: Diff too large for reliable review. Ask user whether to:
  1. Proceed anyway (warn review quality will degrade)
  2. Provide list of files or directories to focus on — then re-generate diff filtered to those paths: `git diff "${MERGE_BASE}" -- <paths>` (local) or `gh pr diff ${PR_NUMBER} | filterdiff -i '<pattern>'` (PR mode, if `filterdiff` available, otherwise filter manually)

### 5. Detect React Code

Check whether diff contains React code via quick grep — no subagent needed.

```bash
HAS_REACT=false
if grep -qE '\.(tsx|jsx)\b' "${DIFF_FILE}" || \
   grep -qE "from ['\"]react['\"]|from ['\"]react-dom|require\(['\"]react['\"]" "${DIFF_FILE}" || \
   grep -qE '<[A-Z][a-zA-Z]+|React\.createElement|use(State|Effect|Ref|Memo|Callback|Context|Reducer|LayoutEffect)\b' "${DIFF_FILE}"; then
  HAS_REACT=true
fi
```

Covers file extensions (`.tsx`, `.jsx`), React imports, JSX elements (uppercase tags), `React.createElement`, common hooks. Grep runs in milliseconds even on large diffs — no reason to delegate to a subagent.

### 6. Launch Parallel Subagents

Spawn all subagents **in a single turn** so they run concurrently. Includes both review subagents (A–D) and requirements coverage subagent (E) — they are independent.

Each review subagent writes to its own dedicated file:

```
SUBAGENT_FILE=${REVIEWS_DIR}/subagent-<agent-name>-${REVIEW_ID}.md
```

Where `<agent-name>` is one of: `code-reviewer`, `octocode-roast`, `pr-review-toolkit`, `react-doctor`.

Before launching subagents, read issue format spec from [issue-format.md](references/issue-format.md) and embed its full content directly into each review subagent prompt (A–D). Ensures subagents have the format regardless of current working directory.

**Shared context for review subagents (A–D):**

Every review subagent prompt must include:

> A diff file at `${DIFF_FILE}` contains all the changes to review. Do not switch branches, run `gh pr checkout`, or modify the working tree. Do not submit any review.
>
> **Output:** Write your findings to `${SUBAGENT_FILE}` (your dedicated output file). Use the issue format specification embedded in your prompt above.

**Delegation rule (applies to ALL subagents A–E):** Launch every subagent on Opus with low effort. Each subagent's sole job: invoke its assigned skill and return whatever the skill produces. Do NOT perform analysis yourself. Do NOT write review logic, diagnostic logic, or generate findings manually. Each skill contains its own methodology — delegate to it completely.

**Worktree isolation for PR mode:** In `MODE=pr`, launch review subagents A–D with `isolation: "worktree"` so they get isolated repo copy checked out to PR branch. Avoids touching user's working tree — no stashing, no checkout, no risk of interrupted state. Worktree cleaned up automatically when subagent finishes. In `MODE=local`, do not use worktree isolation — working tree already contains the changes.

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
- **Extra Output:** add full diagnostic report in subagent's response for merging into final review file

#### Subagent E: requirements coverage

- **Invoke:** `/ah-verify-requirements-coverage`
- **CRITICAL:** Do NOT perform requirements verification yourself. The skill contains its own methodology — delegate to it completely and return whatever it produces (full requirements coverage report in markdown format).

**If `MODE=pr`:** Pass PR `${PR_NUMBER}` and `${DIFF_FILE}` as arguments to skill. If linked issue number identified during review (e.g., from PR body or metadata), pass it too to avoid redundant API lookups. Skill resolves linked issue on its own if no issue number provided.

**If `MODE=local`:** Pass `${DIFF_FILE}` as argument to skill. Skill attempts to extract linked issue number from branch name (e.g., `feature/42-description`, `fix/42`, `issue-42-description`). If no issue determined, skill skips coverage verification and reports no linked issue found.

### 7. Handle Subagent Failures

As subagent results come in, check each:

- **Review subagents (A–D):** Verify subagent's output file exists and is non-empty. If a subagent failed (error, timeout, or empty output), log it in review file under `## Subagent Failures` section and continue with results from remaining agents:

```markdown
## Subagent Failures

- **octocode-roast**: Timed out after 10 minutes. Issues from this agent are not included.
```

- **Requirements coverage (E):** If subagent failed, note it in review file and proceed without coverage data. Do not block review on this failure.

Review is aborted only if **all** review subagents (A–D) fail. If at least one produces results, proceed with what is available.

### 8. Merge and Deduplicate Issues

Read all subagent output files (`${REVIEWS_DIR}/subagent-*-${REVIEW_ID}.md`) and merge them following the four-step fingerprint-and-group algorithm in [dedup-algorithm.md](references/dedup-algorithm.md) (parse issues, build `(path, line_bucket, concern_category)` fingerprints, group/deduplicate, then format each kept issue's `**File:**` field as a markdown link).

### 9. Write Issues to Review File

Append deduplicated issues to review file, grouped by severity. Use format defined in [review-format.md](references/review-format.md).

### 10. React Health Report

**Skip this step if `HAS_REACT=false`.**

Follow instructions in [react-health-report.md](references/react-health-report.md).

### 11. Append Requirements Coverage

Append requirements coverage report (returned by Subagent E in Step 6) to review file:

```markdown
## Requirements Coverage

<coverage report content from ah-verify-requirements-coverage>
```

If Subagent E failed or returned no data, note that coverage data is unavailable.

### 12. Submit PR Review

**Skip this step if `MODE=local`.**

**Wait for Step 11** — do not proceed until requirements coverage report has been appended to review file.

Follow instructions in [submit-pr-review.md](references/submit-pr-review.md).
The subagent returns an **Issues Table** — append it to the end of `${REVIEW_FILE}`.

### 13. Report to User

**If `MODE=pr`:**

Present a summary:

- Path to review file
- Total issues found (by severity)
- Requirements coverage percentage with one-line summary (if available)
- Whether review was submitted successfully
- PR URL for reference
- Present the **Issues Table** (returned by the `ah-submit-code-review` subagent in Step 12)
- Any subagent failures noted in Step 7

**If `MODE=local`:**

Present review file (`${REVIEW_FILE}`) content to user and a summary:

- Path to review file
- Total issues found (by severity)
- Requirements coverage percentage with one-line summary (if available)
- Branch name and list of changed files reviewed
- Any subagent failures noted in Step 7

## Important Notes

- Review subagents and requirements coverage all run in parallel to minimize total review time.
- `react-doctor` subagent launched only when diff contains React code (detected via grep in Step 5). Avoids unnecessary React diagnostics on non-React changes.
- In `MODE=pr`, subagents use worktree isolation — user's working tree never modified. No stashing, no checkout, no restore step needed.
- Review file is single source of truth — all findings merged there before submission.
- Deduplication uses fingerprint-based algorithm: file path + line bucket + concern category. Same-fingerprint issues merged, keeping most detailed version.
- Review file persists at `~/.agents/arinhub/code-reviews/` for future reference and audit.
- Diff file persists at `~/.agents/arinhub/diffs/`, shared read-only across all subagents.
- If a subagent fails or times out, review proceeds with results from remaining agents. Failures noted in review file.
- In `MODE=local`, Step 12 (Submit PR Review) is skipped — review output only to review file and presented to user.
