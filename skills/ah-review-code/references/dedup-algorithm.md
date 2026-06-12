# Merge and Deduplicate Algorithm

Read all subagent output files (`${REVIEWS_DIR}/subagent-*-${REVIEW_ID}.md`) and
deduplicate using this concrete algorithm.

## Step 1: Parse issues

Extract individual issues from each subagent file. Each issue has these fields (from the issue format): severity, file path, line range, description, code, suggestion.

## Step 2: Build fingerprints

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

## Step 3: Group and deduplicate

Group issues by fingerprint. Within each group:

1. If only one issue exists, keep it as-is.
2. If multiple issues share the same fingerprint, keep the one with the longest description + suggestion (most detailed). Tag it with all sources: `[code-reviewer, octocode-roast]`.
3. If two issues are in adjacent buckets (e.g., 40 and 50) for the same file and concern category, check if they describe the same problem by comparing their descriptions. If the descriptions overlap significantly (both mention the same function/variable name and the same fix), merge them — keep the more detailed one and tag with both sources.

## Step 4: Format for review file

Transform each kept issue's `**File:**` field from the plain path in issue-format into the linked format used in review-format: combine the file path with the `**Line(s):**` value to produce a markdown link — e.g., `**File:** [`path/to/file.ts:42`](/absolute/path/to/file.ts#L42)` for single lines or `**File:** [`path/to/file.ts:42-50`](/absolute/path/to/file.ts#L42-L50)` for ranges.
