# Main Review Comment Template

## Format

```md
<paragraph-1: what the core change does correctly, architectural assessment>.

<requirements coverage one-line summary referencing the linked issue as a markdown link>.
```

If there are **non-diff issues** (issues where `file_in_diff: false`), append this section after the requirements coverage line. Construct file links as full GitHub blob URLs using the PR's head branch so they are reliably clickable: `https://github.com/<owner>/<repo>/blob/<headRefName>/<path>#L<line>`.

````md
Additional issues outside the diff:

- <title-1>

[`<path>:<line>`](https://github.com/<owner>/<repo>/blob/<headRefName>/<path>#L<line>) (or [`<path>:<start_line>-<line>`](https://github.com/<owner>/<repo>/blob/<headRefName>/<path>#L<start_line>-L<line>))

<explanation>

```diff
<suggestion diff block, if present>
```

- <title-2>

...
````

## Rules

- Do not use emojis in the main review comment
- Keep paragraphs concise -- aim for 1-3 sentences each
- First paragraph: acknowledge what the change does well -- the core fix, the right architectural direction, positive observations
- Last line (before non-diff section): requirements coverage brief summary. Reference the linked issue as a full markdown link `[#N](https://github.com/owner/repo/issues/N)`. Source the coverage data from one of these (in priority order):
  1. **Review file**: If a review file was used, look for a `## Requirements Coverage` section and extract the percentage and summary from it.
  2. **Current chat session**: Search for output from the `ah-verify-requirements-coverage` skill (sections starting with `## Requirements Coverage:`).
  3. **No data available**: If neither source contains requirements coverage, use explanatory language like "requirements coverage not provided" or "coverage data unavailable" instead of a percentage.
- **Non-diff issues section**: Only include when there are issues with `file_in_diff: false`.

## Examples

### Approve (no High or Medium Priority issues)

```md
The new caching layer is well-structured: TTL-based invalidation handles edge cases correctly, and the cache key design avoids collision risks across tenants.

All requirements from linked issue [#245](https://github.com/acme/app/issues/245) are fully addressed.
```

### Request Changes (High Priority issues found)

```md
The core bug fix is correct and well-motivated: adding `!processingError` to `showProgress` guards and clearing `processingError` on new job submission stops the spinner from getting stuck in an error state. Lifting state computation out of `VerbatimsForm` into the page component is the right architectural direction.

All requirements from linked issue [#1327](https://github.com/acme/app/issues/1327) are fully addressed.
```

### Request Changes (partial requirements coverage)

```md
The authentication middleware correctly validates JWT tokens and handles expiry with proper error responses. The refresh token rotation logic follows security best practices.

Rate limiting for failed attempts (requirement 4 from issue [#89](https://github.com/acme/app/issues/89)) is not yet implemented.
```

### Request Changes (with non-diff issues)

````md
The new validation middleware correctly sanitizes request bodies and rejects malformed payloads with clear error messages.

All requirements from linked issue [#312](https://github.com/acme/app/issues/312) are fully addressed.

Additional issues outside the diff:

- Shared validation helper duplicates logic

[`src/utils/validators.ts:15-22`](https://github.com/acme/app/blob/feature/validation/src/utils/validators.ts#L15-L22)

The `validateEmail` helper in this file uses the same flawed regex. Since the new middleware introduces a corrected pattern, this existing helper should be updated to stay consistent and avoid silent validation drift.

```diff
- const EMAIL_REGEX = /^[a-zA-Z0-9.]+@[a-zA-Z0-9]+\.[a-zA-Z]{2,}$/;
+ const EMAIL_REGEX = /^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
```
````
