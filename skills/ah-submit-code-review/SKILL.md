---
name: ah-submit-code-review
description: Use this skill to submit code review when using the "ah" prefix. Use when asked to "ah submit code review 123". Submit a completed code review with line-specific comments and suggestions to a GitHub PR.
argument-hint: "PR number or URL (e.g., 123, #456, https://github.com/owner/repo/pull/789)"
---

# Submit Code Review

Submit structured code review with line-specific comments to GitHub PR. Identifies issues in current chat session or review file, checks duplicate comments, submits review.

## Input

- **PR number or URL** (required): PR identifier. Accepts:
  - Number: `123`
  - Hash-prefixed: `#123`
  - Full URL: `https://github.com/owner/repo/pull/123`
- **Review file path** (optional): Path to review file from `ah-review-code` (e.g., `~/.agents/arinhub/code-reviews/code-review-pr-my-app-123.md`). If provided, extract issues from this file instead of current chat session.

## Configuration

- **Subagent defaults**: Opus, low effort, all subagents.

## Procedure

### 1. Resolve PR Identifier

Extract PR number from user input. Strip `#` prefix or parse number from URL. Resolve repo owner and name for API calls.

```bash
PR_NUMBER=<extracted number>
REPO_OWNER=$(gh repo view --json owner -q '.owner.login')
REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
```

### 2. Fetch PR Metadata

```bash
gh pr view $PR_NUMBER --json number,title,body,baseRefName,headRefName,files,url
```

### 3. Verify Requirements Coverage

Check whether coverage data already available:

1. **Review file provided**: If review file path given, check for `## Requirements Coverage` section. If yes, extract coverage percentage and summary -- done.
2. **Current chat session**: If no review file, check current chat session for output from prior `ah-verify-requirements-coverage` invocation (sections starting `## Requirements Coverage:`). If found, use it -- done.
3. **No coverage data**: If neither source has coverage, spawn subagent (Opus, low) to execute `/ah-verify-requirements-coverage` skill:
   - Pass PR number from Step 1.
   - If linked issue number known (e.g., from review file or PR body), pass it too.
   - Store resulting coverage report for main review comment in Step 8.

If subagent cannot find linked issue (e.g., PR body has no closing keywords, no explicit issue reference), proceed without coverage data -- main review comment will note coverage data unavailable.

### 4. Fetch Existing Review Comments

Retrieve all existing review comments to prevent duplication. Use
`scripts/gh-summarize.sh` wrapper (resolve path relative to this SKILL.md's
directory) -- projects each item to a few fields, truncates long bodies,
caps item count so busy PR does not flood context (true total
printed to stderr):

```bash
# Inline review comments (id, path, line, truncated body, user)
<skill_dir>/scripts/gh-summarize.sh \
  "repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUMBER/comments" \
  '{id, path, line, body, user: .user.login}'
```

Also fetch top-level review bodies:

```bash
<skill_dir>/scripts/gh-summarize.sh \
  "repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUMBER/reviews" \
  '{id, body, state, user: .user.login}'
```

Each emitted line is one compact JSON object. For deduplication (Step 6) only
`path`/`line`/`body` of each existing comment matters.

### 5. Get Issue List

Get issue list from one source (priority order):

1. **Review file**: If review file path provided (e.g., from `ah-review-code` orchestrator), read file and extract all issues from `## Issues` section.
2. **Current chat session**: If no review file, collect issues identified during code review in current chat session.

For each issue, record:

- `severity`: One of `High Priority`, `Medium Priority`, `Low Priority`
- `title`: Short descriptive title (e.g., "Unvalidated user input passed to SQL query")
- `path`: Relative file path
- `file_in_diff`: Whether file appears in PR diff (`true` or `false`). Issues with `file_in_diff: false` cannot be posted as inline thread comments -- included in main review body instead (see Step 8).
- `line`: Specific line number in new version of file. For multi-line issues, this is the **last** line of range.
- `start_line` (optional): First line of multi-line range. Set only when issue spans more than one line.
- `explanation`: Concise, actionable comment explaining issue (the "why", not just the "what")
- `suggestion` (optional): Raw replacement code for concrete fix. Set only for simple, contiguous changes (see **Suggestion conversion rules**). When set, this code replaces lines `start_line` (or `line`) through `line` verbatim. Do not include ` ```suggestion ` fences -- added automatically in Step 8. For complex suggestions (multiple diff blocks or non-contiguous changes), do **not** set this field; instead append diff block(s) to `explanation`.

#### Parsing a review file

When issue list comes from review file (source 1 above), file uses
different format than submission API. Read
[references/parse-review-file.md](references/parse-review-file.md) for
field-mapping table and suggestion-conversion rules (when to emit GitHub
`suggestion` vs. append diff to explanation). Skip that reference when
issues come from current chat session (source 2).

### 6. Deduplicate Comments

For each issue from Step 5, compare against existing comments from Step 4:

- **Skip** if existing comment on same `path` and `line` (or nearby range +/- 5 lines) already addresses same concern
- **Skip** if issue already mentioned in any top-level review body
- Use semantic comparison, not exact string matching -- if existing comment covers same problem, even with different wording, skip new comment

### 7. Decision Gate

- If **no new issues** remain after deduplication (neither inline nor non-diff): **Do not submit a review.** Inform user no new issues found beyond existing review comments.
- If **new issues exist** (inline, non-diff, or both): Proceed to Step 8. A review with only non-diff issues is still submitted -- issues appear in main review body even though no inline thread comments.

### 8. Submit the Review

Submit single review via GitHub API. Review consists of one **main review comment** with individual **thread comments** appearing as conversation threads anchored to specific lines in diff.

**Main review comment** (`body`): You MUST use the Read tool to read `references/main-review-comment.md` before composing the main review body. Follow its template and formatting exactly.

**Thread comments** (`comments[].body`): You MUST use the Read tool to read `references/thread-comment.md` before composing any thread comment. Follow its template and formatting exactly.

#### Separating inline vs. non-diff issues

Before building payload, split deduplicated issues into two groups:

- **Inline issues** (`file_in_diff: true`): Posted as thread comments anchored to specific lines in diff.
- **Non-diff issues** (`file_in_diff: false`): Cannot be posted as thread comments (API would reject them). Instead appended to main review body as dedicated section. **However**, only include a non-diff issue if directly relevant to PR body context (e.g., the change described in PR description or files/features the PR touches) **or** requirements coverage context (e.g., a requirement from linked issue the PR should address). If a non-diff issue falls outside both contexts, **drop it** -- do not include in review body. The issues table in Step 9 will still list all non-diff issues, but "Reason" column will explain why any non-diff issue was excluded from review body.

#### Determining event type

- Use `"REQUEST_CHANGES"` if **any** issue (inline or non-diff) with severity `High Priority` or `Medium Priority` remains after deduplication.
- Use `"APPROVE"` if **all** remaining issues (inline and non-diff) are `Low Priority` only.

#### Comment types

Each entry in `comments` uses one of two shapes depending on whether issue targets a single line or a range of lines:

**Single-line comment** -- targets exactly one line in diff:

```json
{
  "path": "src/auth.ts",
  "line": 42,
  "side": "RIGHT",
  "body": "<thread-comment>"
}
```

Required fields: `path`, `line`, `side`.

**Multi-line comment** -- targets range from `start_line` through `line` (both inclusive, both must be within same diff hunk):

```json
{
  "path": "src/utils.ts",
  "start_line": 10,
  "line": 14,
  "start_side": "RIGHT",
  "side": "RIGHT",
  "body": "<thread-comment>"
}
```

Required fields: `path`, `start_line`, `line`, `start_side`, `side`. Suggestion content replaces **all** lines from `start_line` through `line` verbatim.

#### Preflight validation

Run before submission:

- Validate JSON payload syntax (e.g., pipe heredoc through `jq . >/dev/null`)
- Every comment has `path`, `line`, `side: "RIGHT"`
- Multi-line comments additionally have `start_line` and `start_side: "RIGHT"`
- `line` (and `start_line` for ranges) falls inside PR diff hunk for that file
- Each `body` that includes suggestion contains ` ```suggestion ``` ` fences wrapping raw replacement code
- Suggestion replacement code preserves indentation and exact intended final content
- Empty suggestion block (` ```suggestion\n``` `) only when intent is to delete selected line(s)

#### Submit command

Build JSON payload with all comments (single-line and multi-line mixed) and submit:

```bash
gh api repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUMBER/reviews \
  --method POST \
  --input - <<'EOF'
{
  "event": "<APPROVE or REQUEST_CHANGES per 'Determining event type' above>",
  "body": "<main-review-comment>",
  "comments": [
    {
      "path": "src/auth.ts",
      "line": 42,
      "side": "RIGHT",
      "body": "<thread-comment>"
    },
    {
      "path": "src/utils.ts",
      "start_line": 10,
      "line": 14,
      "start_side": "RIGHT",
      "side": "RIGHT",
      "body": "<thread-comment>"
    }
  ]
}
EOF
```

#### Error handling

If API returns error (e.g., `422 Unprocessable Entity`):

1. Parse error response to identify which comment(s) failed (GitHub typically reports index or `path`/`line` that is invalid).
2. Most common cause: `line` or `start_line` falls outside PR diff hunk. For each failing comment:
   - Re-fetch diff hunk for that file (`gh pr diff $PR_NUMBER` and locate `@@` headers for the file).
   - Verify `line` value falls within one of hunk ranges. If not, adjust line to nearest valid line within hunk, or drop comment if no valid line exists.
3. Remove or fix failing comments and retry submission **once**. If retry also fails, report error to user with full API response and list of comments that could not be submitted.

### 9. Report Result

Present summary of review submission to user, including:

1. PR URL for reference
2. Number of review comments submitted vs. total issues found
3. Requirements coverage summary (percentage and any missing requirements from Step 3)
4. Issues table below

#### Issues table

You **MUST** output a markdown table listing **every** issue from Step 5 with submission status and reason. Never omit this table, even when all issues skipped. Use this format:

| #   | Severity        | File                | Line(s) | Title                          | Status         | Reason                            |
| --- | --------------- | ------------------- | ------- | ------------------------------ | -------------- | --------------------------------- |
| 1   | High Priority   | `src/auth.ts`       | 42      | Unvalidated input              | Submitted      | —                                 |
| 2   | Medium Priority | `src/utils.ts`      | 10-14   | Missing null check             | Skipped        | Duplicate of existing comment     |
| 3   | Medium Priority | `src/api.ts`        | 88      | Unused variable                | Skipped        | Line outside diff hunk            |
| 4   | Medium Priority | `src/db.ts`         | 22      | SQL injection risk             | Failed         | API error 422 — retry also failed |
| 5   | Low Priority    | `src/validators.ts` | 15-22   | Shared helper duplicates logic | In review body | File not in diff                  |

**Status values:**

- **Submitted** — comment successfully posted as inline thread comment on PR. Reason: `—`
- **In review body** — file not part of PR diff (`file_in_diff: false`), so issue included in main review body under "Additional issues outside the diff" section. Reason: `File not in diff`
- **Skipped (duplicate)** — removed during deduplication (Step 6). Reason: describe which existing comment covers it
- **Skipped (no diff line)** — target line not within any diff hunk and could not be adjusted. Reason: explain why
- **Failed** — API rejected comment and retry also failed. Reason: include API error detail

If no review submitted (Step 7), explain no new issues found beyond existing review comments and still show table with all issues marked skipped.
List all issues in descending severity order (High → Medium → Low).

## Important Notes

- The `line` field in review comments must reference a line that appears in diff -- comments on unchanged lines will be rejected by API
- For multi-line suggestions, use `start_line` and `line` together to define range being replaced; both must be within diff hunk
- An empty suggestion block (` ```suggestion\n``` `) means "delete these lines"
- Content inside ` ```suggestion ``` ` replaces selected line(s) verbatim -- ensure correct indentation and formatting
- Never fabricate issues -- only flag genuine concerns backed by evidence in code
