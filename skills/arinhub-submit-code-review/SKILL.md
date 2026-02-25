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

Extract the PR number from the user input. Strip any `#` prefix or parse the number from a URL. Also resolve the repository owner and name for API calls.

```bash
PR_NUMBER=<extracted number>
REPO_INFO=$(gh repo view --json owner,name)
REPO_OWNER=$(echo "$REPO_INFO" | jq -r '.owner.login')
REPO_NAME=$(echo "$REPO_INFO" | jq -r '.name')
```

### 2. Fetch PR Metadata

Gather PR details:

```bash
gh pr view $PR_NUMBER --json number,title,body,baseRefName,headRefName,files,url
```

### 3. Fetch Existing Review Comments

Retrieve all existing review comments to prevent duplication:

```bash
gh api repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUMBER/comments --paginate --jq '.[] | {id, path, line, body, user: .user.login}'
```

Also fetch top-level review bodies:

```bash
gh api repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUMBER/reviews --paginate --jq '.[] | {id, body, state, user: .user.login}'
```

### 4. Get Issue List

Get a list of issues from one of these sources (in priority order):

1. **Review file**: If a review file path is provided (e.g., from `arinhub-code-reviewer` orchestrator), read the file and extract all issues from the `## Issues` section.
2. **Current chat session**: If no review file is specified, collect issues identified during the code review in the current chat session.

For each issue found, record:

- `severity`: One of `High Priority`, `Medium Priority`, or `Low Priority`
- `title`: A short descriptive title for the issue (e.g., "Unvalidated user input passed to SQL query")
- `path`: The relative file path
- `line`: The specific line number in the new version of the file (must be within the diff hunk). For multi-line issues, this is the **last** line of the range.
- `start_line` (optional): The first line of a multi-line range. Only set when the issue spans more than one line.
- `body`: A concise, actionable comment explaining the issue (the "why", not just the "what")
- `suggestion` (optional): The **raw replacement code** that should replace the line(s) from `start_line` (or `line`) through `line`. Include this whenever you can propose a concrete fix. The suggestion content is the **exact code** that will replace the selected lines -- do not include ` ```suggestion ` fences here, they are added automatically in Step 7.

#### Parsing a review file

The review file from `arinhub-code-reviewer` uses a different format than the submission API. Apply these transformations when extracting issues:

| Review file field                        | Maps to                    | Transformation                                                                                                                                                                        |
| ---------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**Severity:** High Priority`            | `severity`                 | Use the value directly (`High Priority`, `Medium Priority`, or `Low Priority`)                                                                                                        |
| Issue heading (`#### <text>`)            | `title`                    | Use the heading text as the title                                                                                                                                                     |
| `**File:** path/to/file.ts`              | `path`                     | Use the path directly (strip any markdown link syntax or line-number suffix)                                                                                                          |
| `**Line(s):** 42`                        | `line: 42`                 | Single line: set `line` only                                                                                                                                                          |
| `**Line(s):** 42-50`                     | `start_line: 42, line: 50` | Range: set `start_line` to the first number, `line` to the second                                                                                                                     |
| `**Description:** ...`                   | `body`                     | Use as the explanation text                                                                                                                                                           |
| `**Suggestion:** ` ` ```diff ``` ` block | `suggestion`               | **Strip diff markers**: remove lines starting with `-` (deletions), and for lines starting with `+`, remove the `+` prefix and leading space. The result is the raw replacement code. |

**Example diff-to-suggestion transformation:**

Review file contains:

```diff
- const result = unsafeOperation(input);
+ const result = safeOperation(sanitize(input));
```

Extracted `suggestion` (raw replacement code):

```
const result = safeOperation(sanitize(input));
```

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

**Thread comments** (`comments[].body`): See [thread-comment.md](references/thread-comment.md) for the full template, body assembly instructions, and examples.

#### Determining event type

- Use `"APPROVE"` if **no** issues with severity `High Priority` remain after deduplication.
- Use `"COMMENT"` if **any** issue has severity `High Priority`.
- Never use `"REQUEST_CHANGES"` unless the user explicitly asks.

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
- Each `body` that includes a suggestion contains ` ```suggestion ``` ` fences wrapping the raw replacement code (assembled in "Assembling thread comment body" above)
- Suggestion replacement code preserves indentation and exact intended final content
- Empty suggestion block (` ```suggestion\n``` `) only when the intent is to delete the selected line(s)

#### Submit command

Build the JSON payload with all comments (single-line and multi-line mixed) and submit:

```bash
gh api repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUMBER/reviews \
  --method POST \
  --input - <<'EOF'
{
  "event": "<APPROVE or COMMENT per 'Determining event type' above>",
  "body": "<main-review-comment>",
  "comments": [
    {
      "path": "src/auth.ts",
      "line": 42,
      "side": "RIGHT",
      "body": "<assembled thread-comment body>"
    },
    {
      "path": "src/utils.ts",
      "start_line": 10,
      "line": 14,
      "start_side": "RIGHT",
      "side": "RIGHT",
      "body": "<assembled thread-comment body>"
    }
  ]
}
EOF
```

#### Error handling

If the API returns an error (e.g., `422 Unprocessable Entity`):

1. Parse the error response to identify which comment(s) failed (GitHub typically reports the index or the `path`/`line` that is invalid).
2. The most common cause is a `line` or `start_line` that falls outside the PR diff hunk. For each failing comment:
   - Re-fetch the diff hunk for that file (`gh pr diff $PR_NUMBER` and locate the `@@` headers for the file).
   - Verify that the `line` value falls within one of the hunk ranges. If not, adjust the line to the nearest valid line within the hunk, or drop the comment if no valid line exists.
3. Remove or fix the failing comments and retry the submission **once**. If the retry also fails, report the error to the user with the full API response and the list of comments that could not be submitted.

### 8. Report Result

After submission, confirm to the user:

- Number of review comments submitted (and any that were dropped due to errors)
- The PR URL for reference
- Brief list of issues flagged

If no review was submitted (Step 6), explain that no new issues were found beyond existing review comments.

### 9. Extract Requirements Coverage

Look for a Requirements Coverage section in the same source used in Step 4:

1. **Review file**: If a review file was used, look for a `## Requirements Coverage` section and extract its full content (everything from the `## Requirements Coverage` heading to the next `##` heading or end of file).
2. **Current chat session**: If no review file was used, search the current chat session for output from the `arinhub-verify-requirements-coverage` skill. Specifically, look for a section starting with `## PR Requirements Coverage:` or `## Local Requirements Coverage:` that contains a requirements table and summary.

If no Requirements Coverage is found from either source, skip to the end -- this step is optional.

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

- The `line` field in review comments must reference a line that appears in the diff -- comments on unchanged lines will be rejected by the API
- For multi-line suggestions, use `start_line` and `line` together to define the range being replaced; both must be within the diff hunk
- An empty suggestion block (` ```suggestion\n``` `) means "delete these lines"
- The content inside ` ```suggestion ``` ` replaces the selected line(s) verbatim -- ensure correct indentation and formatting
- Never fabricate issues -- only flag genuine concerns backed by evidence in the code
