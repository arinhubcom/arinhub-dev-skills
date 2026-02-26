# Main Review Comment Template

## Format

```
### Code Review

<paragraph-1: what the core change does correctly, architectural assessment>.

Main concerns:

- <concern-1>
- <concern-2>
- ...

Requirements coverage: **<percentage>%** — <one-line summary referencing the linked issue as a markdown link>.
```

If there are **non-diff issues** (issues where `file_in_diff: false`), append this section after the requirements coverage line:

````
---

<details>
<summary><strong>Additional issues outside the diff</strong> (<count> issues)</summary>

The following issues were found in files not modified by this PR. They cannot be attached as inline comments but are worth addressing:

#### _<severity>_: <title-1>

- [<path>:<line>](<path>#L<line>) (or [<path>:<start_line>-<line>](<path>#L<start_line>-L<line>))

<explanation>

```diff
<suggestion diff block, if present>
```

#### <title-2>

...

</details>
````

## Rules

- Always start with the `### Code Review` heading
- Do not use emojis in the main review comment
- Keep paragraphs concise -- aim for 1-3 sentences each
- First paragraph: acknowledge what the change does well -- the core fix, the right architectural direction, positive observations
- Second section: list main concerns as a markdown bullet list under "Main concerns:" or state "No significant concerns." if there are none
- Last line (before non-diff section): requirements coverage percentage and a brief summary. Reference the linked issue as a full markdown link `[#N](https://github.com/owner/repo/issues/N)`. Use `N/A` if no linked issue exists. Source the coverage data from one of these (in priority order):
  1. **Review file**: If a review file was used, look for a `## Requirements Coverage` section and extract the percentage and summary from it.
  2. **Current chat session**: Search for output from the `ah-verify-requirements-coverage` skill (sections starting with `## Requirements Coverage:`).
  3. **No data available**: If neither source contains requirements coverage, use `N/A` for the percentage.
- **Non-diff issues section**: Only include when there are issues with `file_in_diff: false`. Wrap in a `<details>` tag to keep the review body clean. Include the full issue details (severity, file, lines, description, and suggestion diff if present) so the author has all context without needing inline comments.

## Examples

### Approve (no High or Medium Priority issues)

```
### Code Review

The new caching layer is well-structured: TTL-based invalidation handles edge cases correctly, and the cache key design avoids collision risks across tenants.

No significant concerns.

Requirements coverage: **100%** — all requirements from linked issue [#245](https://github.com/acme/app/issues/245) are fully addressed.
```

### Request Changes (High Priority issues found)

```
### Code Review

The core bug fix is correct and well-motivated: adding `!processingError` to `showProgress` guards and clearing `processingError` on new job submission stops the spinner from getting stuck in an error state. Lifting state computation out of `VerbatimsForm` into the page component is the right architectural direction.

Main concerns:

- The introduced `isProcessing = showProgress` alias adds naming confusion without value
- The test strategy re-implements production logic locally (shadow-testing) instead of importing it, so tests can pass even when production code diverges
- A few silent failure risks remain (`updatePoll` missing `onError`, `console.log` shipping to production)

Requirements coverage: **100%** — all requirements from linked issue [#1327](https://github.com/acme/app/issues/1327) are fully addressed.
```

### Request Changes (partial requirements coverage)

```
### Code Review

The authentication middleware correctly validates JWT tokens and handles expiry with proper error responses. The refresh token rotation logic follows security best practices.

Main concerns:

- A race condition in concurrent token refresh can lead to dropped requests
- The error response format for expired tokens doesn't match the API spec documented in the issue

Requirements coverage: **75%** — rate limiting for failed attempts (requirement 4 from issue [#89](https://github.com/acme/app/issues/89)) is not yet implemented.
```

### Request Changes (with non-diff issues)

````
### Code Review

The new validation middleware correctly sanitizes request bodies and rejects malformed payloads with clear error messages.

Main concerns:

- The regex pattern for email validation rejects valid addresses with `+` aliases

Requirements coverage: **100%** — all requirements from linked issue [#312](https://github.com/acme/app/issues/312) are fully addressed.

---

<details>
<summary><strong>Additional issues outside the diff</strong> (1 issue)</summary>

The following issues were found in files not modified by this PR. They cannot be attached as inline comments but are worth addressing:

#### _Medium Priority_: Shared validation helper duplicates logic

- [src/utils/validators.ts:15-22](src/utils/validators.ts#L15-L22)

The `validateEmail` helper in this file uses the same flawed regex. Since the new middleware introduces a corrected pattern, this existing helper should be updated to stay consistent and avoid silent validation drift.

```diff
- const EMAIL_REGEX = /^[a-zA-Z0-9.]+@[a-zA-Z0-9]+\.[a-zA-Z]{2,}$/;
+ const EMAIL_REGEX = /^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
```

</details>
````
