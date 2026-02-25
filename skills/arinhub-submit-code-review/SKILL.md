---
name: arinhub-submit-code-review
description: Use this skill to submit code review when using the "ah" prefix. Use when asked to "ah submit code review 123", or "ah submit code review to PR 123". Submit a completed code review with line-specific comments and suggestions to a GitHub PR.
argument-hint: "PR number or URL (e.g., 123, #456, https://github.com/owner/repo/pull/789)"
---

# Submit Code Review

Submit a structured code review with line-specific comments to a GitHub pull request. Identifies issues in the current chat session or review file, checks for duplicate comments, and submits the review.

## Input

- **PR number or URL** (required): The pull request identifier. Accepts:
  - Number: `123`
  - Hash-prefixed: `#123`
  - Full URL: `https://github.com/owner/repo/pull/123`
- **Review file path** (optional): Path to a review file produced by `arinhub-code-reviewer` (e.g., `~/.agents/arinhub/code-reviews/pr-code-review-my-app-123.md`). If provided, issues are extracted from this file instead of the current chat session.

## Procedure

### 1. Resolve PR Identifier

Extract the PR number from the user input. Strip any `#` prefix or parse the number from a URL.

```
PR_NUMBER=<extracted number>
```

### 2. Fetch PR Metadata

Gather PR details:

```bash
gh pr view $PR_NUMBER --json number,title,body,baseRefName,headRefName,files,url
```

### 3. Fetch Existing Review Comments

Retrieve all existing review comments to prevent duplication:

```bash
gh api repos/{owner}/{repo}/pulls/$PR_NUMBER/comments --paginate --jq '.[] | {id, path, line, body, user: .user.login}'
```

Also fetch top-level review bodies:

```bash
gh api repos/{owner}/{repo}/pulls/$PR_NUMBER/reviews --paginate --jq '.[] | {id, body, state, user: .user.login}'
```

### 4. Get Issue List

Get a list of issues from one of these sources (in priority order):

1. **Review file**: If a review file path is provided (e.g., from `arinhub-code-reviewer` orchestrator), read the file and extract all issues from the `## Issues` section.
2. **Current chat session**: If no review file is specified, collect issues identified during the code review in the current chat session.

For each issue found, record:

- `path`: The relative file path
- `line`: The specific line number in the new version of the file (must be within the diff hunk). For multi-line issues, this is the **last** line of the range.
- `start_line` (optional): The first line of a multi-line range. Only set when the issue spans more than one line.
- `body`: A concise, actionable comment explaining the issue
- `suggestion` (optional): The replacement code that should replace the line(s) from `start_line` (or `line`) through `line`. Include this whenever you can propose a concrete fix. The suggestion content is the **exact code** that will replace the selected lines -- do not include ` ```suggestion ` fences here, they are added automatically in Step 7.

### 5. Deduplicate Comments

For each issue identified in Step 4, compare against existing comments from Step 3:

- **Skip** if an existing comment on the same `path` and `line` (or nearby range +/- 3 lines) already addresses the same concern
- **Skip** if the issue is already mentioned in any top-level review body
- Use semantic comparison, not exact string matching -- if the existing comment covers the same problem, even with different wording, skip the new comment

### 6. Decision Gate

- If **no new issues** remain after deduplication: **Do not submit a review.** Inform the user that no new issues were found beyond existing review comments.
- If **new issues exist**: Proceed to Step 7.

### 7. Submit the Review

Submit a single review via the GitHub API. The review consists of one **main review comment** with individual **thread comments** that appear as conversation threads anchored to specific lines in the diff.

**Main review comment** (`body`): See [main-review-comment.md](references/main-review-comment.md) for the full template and examples.

**Thread comments** (`comments[].body`): See [thread-comment.md](references/thread-comment.md) for the full template and examples.

#### Comment types

Each entry in `comments` uses one of two shapes depending on whether the issue targets a single line or a range of lines:

**Single-line comment** -- targets exactly one line in the diff:

```json
{
  "path": "src/auth.ts",
  "line": 42,
  "side": "RIGHT",
  "body": "<thread-comment>"
}
```

Required fields: `path`, `line`, `side`.

**Multi-line comment** -- targets a range from `start_line` through `line` (both inclusive, both must be within the same diff hunk):

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

Required fields: `path`, `start_line`, `line`, `start_side`, `side`. The suggestion content replaces **all** lines from `start_line` through `line` verbatim.

#### Preflight validation

Run before submission:

- Validate JSON payload syntax (e.g., pipe the heredoc through `jq . >/dev/null`)
- Every comment has `path`, `line`, and `side: "RIGHT"`
- Multi-line comments additionally have `start_line` and `start_side: "RIGHT"`
- `line` (and `start_line` for ranges) falls inside the PR diff hunk for that file
- Suggestion fences are appended in `body` (do not pre-wrap suggestion content in fences earlier)
- Suggestion replacement code preserves indentation and exact intended final content
- Empty suggestion block (` ```suggestion\n``` `) only when the intent is to delete the selected line(s)

#### Submit command

Build the JSON payload with all comments (single-line and multi-line mixed) and submit:

```bash
gh api repos/{owner}/{repo}/pulls/$PR_NUMBER/reviews \
  --method POST \
  --input - <<'EOF'
{
  "event": "APPROVE or COMMENT",
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

### 8. Report Result

After submission, confirm to the user:

- Number of review comments submitted
- The PR URL for reference
- Brief list of issues flagged

If no review was submitted (Step 6), explain that no new issues were found beyond existing review comments.

### 9. Extract Requirements Coverage

Look for a Requirements Coverage section in the same source used in Step 4:

1. **Review file**: If a review file was used, look for a `## Requirements Coverage` section and extract its full content.
2. **Current chat session**: If no review file was used, look for any Requirements Coverage report or coverage summary produced during the current chat session.

If no Requirements Coverage is found, skip to the end -- this step is optional.

### 10. Post Requirements Coverage Comment

**This step runs only if Requirements Coverage was found in Step 9. It must be the very last action -- execute it after all other steps (including the review submission and result report) are complete.**

Post the coverage report as a standalone PR comment:

```bash
gh pr comment $PR_NUMBER --body "$(cat <<'EOF'
<coverage-content>
EOF
)"
```

- Use the Requirements Coverage content exactly as found -- do not modify, summarize, or reformat it
- This comment is independent of the review; post it even if no review was submitted in Step 6
- This must be the very last API call in the entire procedure to ensure the coverage comment appears at the bottom of the PR conversation

## Important Notes

- Use `APPROVE` when no High Priority issues are found, otherwise use `COMMENT`. Never use `REQUEST_CHANGES` unless the user explicitly asks.
- The `line` field in review comments must reference a line that appears in the diff -- comments on unchanged lines will be rejected by the API
- For multi-line suggestions, use `start_line` and `line` together to define the range being replaced; both must be within the diff hunk
- An empty suggestion block (` ```suggestion\n``` `) means "delete these lines"
- The content inside ` ```suggestion ``` ` replaces the selected line(s) verbatim -- ensure correct indentation and formatting
- Never fabricate issues -- only flag genuine concerns backed by evidence in the code
