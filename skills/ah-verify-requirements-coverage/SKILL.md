---
name: ah-verify-requirements-coverage
description: Use this skill to verify requirements coverage when using the "ah" prefix. Use when asked to "ah verify requirements coverage", "ah verify requirements coverage issue 42", "ah verify requirements coverage PR 123", or "ah verify requirements coverage PR 123, issue 42". Verify that a PR or local changes fully implement requirements from a linked GitHub issue.
argument-hint: "PR number or URL (e.g., 123, #456, https://github.com/owner/repo/pull/789), or issue number for local changes (e.g., issue #42)"
---

# Verify Requirements Coverage

Verify PR or local changes fully implement requirements in GitHub issue. Extract issue ref, analyze diff against issue description, produce coverage report.

## Input

- **PR number or URL** (optional): PR identifier. Accepts:
  - Number: `123`
  - Hash-prefixed: `#123`
  - Full URL: `https://github.com/owner/repo/pull/123`
  - If omitted, verifies local changes instead.
- **Issue number** (optional): Issue number to check coverage against (e.g., `issue #42`). Works in remote and local modes. In remote mode, overrides automatic issue detection from PR body.
- **Diff file path** (optional): Path to pre-existing diff file (e.g., passed by `ah-review-code`). If provided, skip fetching diff in Step 7 and read this file instead.

## Procedure

### 1. Determine Review Target

- **Remote PR**: User provides PR number or URL (e.g., "Verify PR #123") -> target that remote PR. Set `MODE=remote`.
- **Local Changes**: No PR mentioned, or user asks "verify my changes" / "do my changes cover the issue" -> target current local changes (staged and unstaged). Set `MODE=local`.

### 2. Resolve Identifier

**If `MODE=remote`:**

Extract PR number from user input. Strip `#` prefix or parse number from URL.

```
PR_NUMBER=<extracted number>
```

**If `MODE=local`:**

Determine current branch name and base branch for identification and diffing.

```bash
BRANCH_NAME=$(git branch --show-current | tr '/' '-')

# Determine the base (source) branch using this priority:
# 1. If an open/draft PR exists for the current branch, use its base branch.
# 2. Fall back to the repository's default branch.
# 3. Last resort: "main".
BASE_BRANCH=$(gh pr view --json baseRefName -q '.baseRefName' 2>/dev/null || gh repo view --json defaultBranchRef -q '.defaultBranchRef.name' 2>/dev/null || git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')
BASE_BRANCH=${BASE_BRANCH:-main}

# Find the point where the current branch diverged from the base branch.
MERGE_BASE=$(git merge-base "${BASE_BRANCH}" HEAD)
```

### 3. Fetch Metadata

**If `MODE=remote`:**

Gather PR details: body, linked issues. Resolve repo owner and name for later API calls.

```bash
PR_META=$(gh pr view $PR_NUMBER --json number,title,body,baseRefName,headRefName,files,url)
PR_BODY=$(echo "$PR_META" | jq -r '.body')

# Resolve repository owner and name for API calls (e.g., GraphQL in Step 4).
REPO_OWNER=$(gh repo view --json owner -q '.owner.login')
REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
```

**If `MODE=local`:**

Gather changed files on branch (committed and unstaged tracked) relative to base branch. Note: untracked files (new files not yet `git add`-ed) are not included.

```bash
git diff --name-only "${MERGE_BASE}"
```

### 4. Extract Linked Issue Number

**If `MODE=remote`:**

Determine related issue using these methods in priority order:

**Method A -- User-provided issue number:** If user explicitly provided issue number (e.g., "verify PR 123, issue #42"), use it directly. Skip Methods B–D.

**Method B -- Closing keywords in PR body:**

Search `$PR_BODY` (from Step 3) for GitHub closing keywords followed by issue reference:

- `closes #N`, `fixes #N`, `resolves #N` (and variants: `close`, `closed`, `fix`, `fixed`, `resolve`, `resolved`)
- Full URL references: `closes https://github.com/owner/repo/issues/N`

**Method C -- GitHub linked issues API:**

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

**Method D -- Issue reference in PR body:**

If Methods A–C yield nothing, scan `$PR_BODY` for any `#N` pattern or issue URL that is not a closing keyword reference. After extracting candidate numbers, verify each is an actual issue (not a PR) by checking for absence of a `pull_request` key:

```bash
# Returns empty if $N is a PR, returns the issue number if it is an issue.
gh api "repos/${REPO_OWNER}/${REPO_NAME}/issues/$N" --jq 'select(.pull_request == null) | .number'
```

**If `MODE=local`:**

Determine related issue using these methods in priority order:

**Method A -- User-provided issue number:** If user explicitly provided issue number (e.g., "verify my changes against issue #42"), use it directly.

**Method B -- Branch name convention:** Extract issue number from branch name if it follows a convention like `feature/42-description`, `fix/42`, `issue-42-description`, `42-description`, `jj/42-description`, etc.

```bash
# Extract the first standalone number (2+ digits) that appears after a slash or dash
# boundary (or at the start), followed by a dash, slash, or end of string.
# Matches: feature/42-desc, fix/42, issue-42-desc, 42-desc, jj/42-desc
# Skips: feature/v2-add-auth (single digit after letter), release/1.0 (version-like)
ISSUE_NUMBER=$(git branch --show-current | grep -oP '(?:^|[/-])\K\d{2,}(?=[-/]|$)' | head -1)
```

**No issue found:** If no linked issue can be determined, inform user and stop. Do not guess or fabricate an issue number.

```
ISSUE_NUMBER=<extracted number>
```

If multiple issues found, process each and produce a separate coverage report per issue.

### 5. Fetch Issue Details

Retrieve full issue description:

```bash
gh issue view $ISSUE_NUMBER --json number,title,body,labels
```

### 6. Extract Requirements from Issue

Parse issue body and title to identify discrete, testable requirements. Look for:

- Checklist items (`- [ ]` or `- [x]`)
- Numbered steps or acceptance criteria
- Explicit behavioral descriptions ("should", "must", "when X then Y")
- UI changes, API changes, or data model changes mentioned
- Edge cases or error handling requirements
- Non-functional requirements (performance, security, accessibility)

Produce a numbered list of requirements:

```
R1: <requirement description>
R2: <requirement description>
...
```

If issue body is vague or has no clear requirements, use issue title and any available context to infer expected behavior. Flag inferred requirements clearly.

### 7. Fetch Diff

Write diff to file, read on demand (per file/hunk) rather than loading whole diff into context. Set `DIFF_FILE` so Step 8 can reference it.

**If a diff file path was provided as input**, set `DIFF_FILE` to that path and skip the commands below.

**If `MODE=remote`:**

```bash
DIFF_FILE=$(mktemp /tmp/req-diff.XXXXXX.patch)
gh pr diff "$PR_NUMBER" > "${DIFF_FILE}"
echo "Diff: ${DIFF_FILE} ($(wc -l < "${DIFF_FILE}") lines)"
```

**If `MODE=local`:**

Diff from merge base (resolved in Step 2) to current working tree. Captures all branch changes — committed and unstaged tracked — relative to base branch. Note: untracked files (new files not yet `git add`-ed) are not included.

```bash
DIFF_FILE=$(mktemp /tmp/req-diff.XXXXXX.patch)
git diff "${MERGE_BASE}" > "${DIFF_FILE}"
echo "Diff: ${DIFF_FILE} ($(wc -l < "${DIFF_FILE}") lines)"
```

Use changed-files list from Step 3 to understand scope, then read targeted hunks from `${DIFF_FILE}` as you analyze each requirement (e.g. `grep`/`git diff "${MERGE_BASE}" -- <path>`). For a large diff, scan per file rather than reading the whole patch at once.

### 8. Analyze Coverage

For each requirement from Step 6, determine whether diff addresses it:

- **Covered**: Diff contains code changes that directly implement the requirement
- **Partially covered**: Diff addresses some aspects but misses edge cases or details
- **Not covered**: No code changes in diff relate to this requirement

Use evidence from diff to justify each assessment. Do not speculate -- base judgments on actual code changes.

Calculate coverage percentage: `coverage = (fully covered count / total requirements) × 100`, rounded to nearest integer. Partially covered requirements do **not** count toward covered total -- treated same as "Not covered" for percentage calculation, but still distinguished in report table.

### 9. Produce Report

Set `TARGET` label based on mode:
- `MODE=remote`: `PR #<PR_NUMBER>`
- `MODE=local`: `branch ${BRANCH_NAME}`

Generate report using coverage analysis from Step 8.

**If all requirements are covered (100% coverage):**

```
## Requirements Coverage: 100%

All requirements from issue #<ISSUE_NUMBER> are implemented in <TARGET>.

### Requirements
| # | Requirement | Status |
|---|-------------|--------|
| R1 | <description> | Covered |
| R2 | <description> | Covered |

### Summary
<2-3 sentences confirming full coverage, highlighting key implementation decisions>
```

**If any requirements are missing or partially covered:**

```
## Requirements Coverage: <percentage>%

<TARGET> does not fully implement issue #<ISSUE_NUMBER>.

### Requirements
| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| R1 | <description> | Covered | |
| R2 | <description> | Not covered | <what is missing> |
| R3 | <description> | Partially covered | <what is incomplete> |

### Missing Implementation
<For each uncovered or partially covered requirement, describe specifically what code changes are needed to complete the implementation>

### Summary
<2-3 sentences describing the overall gap between the issue requirements and the current implementation>
```

### 10. Report to User

Present coverage report from Step 9. Include:

- Issue number and title for context
- `MODE=remote`: PR URL for reference; `MODE=local`: branch name and list of changed files
- Coverage percentage
- Clear next steps if coverage incomplete

## Important Notes

- Never fabricate requirements not present or implied in the issue
- If issue lacks acceptance criteria, clearly state which requirements were inferred from context
- Do not evaluate code quality -- this skill only checks implementation completeness against the issue description
- For issues with sub-tasks or linked child issues, only evaluate requirements in the specific linked issue
- When multiple issues are linked, report coverage for each issue separately
- In `MODE=local`, diff comes from `git diff "${MERGE_BASE}"` (all committed and unstaged tracked changes on branch relative to base branch; untracked files not included) instead of a PR diff. Issue must be provided by user or extracted from branch name — if neither yields a result, inform user and stop
