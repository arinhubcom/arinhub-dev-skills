# Main Review Comment Template

The top-level review comment submitted with the `event` field (`APPROVE` or `COMMENT`).

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

## Rules

- Always start with the `### Code Review` heading
- First paragraph: acknowledge what the change does well -- the core fix, the right architectural direction, positive observations
- Second section: list main concerns as a markdown bullet list under "Main concerns:" or state "No significant concerns." if there are none
- Last line: requirements coverage percentage and a brief summary. Reference the linked issue as a full markdown link `[#N](https://github.com/owner/repo/issues/N)`. Use `N/A` if no linked issue exists
- Do not use emojis in the main review comment
- Keep paragraphs concise -- aim for 1-3 sentences each

## Examples

### Approve (no High Priority issues)

```
### Code Review

The new caching layer is well-structured: TTL-based invalidation handles edge cases correctly, and the cache key design avoids collision risks across tenants.

No significant concerns.

Requirements coverage: **100%** — all requirements from linked issue [#245](https://github.com/acme/app/issues/245) are fully addressed.
```

### Comment (High Priority issues found)

```
### Code Review

The core bug fix is correct and well-motivated: adding `!processingError` to `showProgress` guards and clearing `processingError` on new job submission stops the spinner from getting stuck in an error state. Lifting state computation out of `VerbatimsForm` into the page component is the right architectural direction.

Main concerns:

- The introduced `isProcessing = showProgress` alias adds naming confusion without value
- The test strategy re-implements production logic locally (shadow-testing) instead of importing it, so tests can pass even when production code diverges
- A few silent failure risks remain (`updatePoll` missing `onError`, `console.log` shipping to production)

Requirements coverage: **100%** — all requirements from linked issue [#1327](https://github.com/acme/app/issues/1327) are fully addressed.
```

### Comment (partial requirements coverage)

```
### Code Review

The authentication middleware correctly validates JWT tokens and handles expiry with proper error responses. The refresh token rotation logic follows security best practices.

Main concerns:

- A race condition in concurrent token refresh can lead to dropped requests
- The error response format for expired tokens doesn't match the API spec documented in the issue

Requirements coverage: **75%** — rate limiting for failed attempts (requirement 4 from issue [#89](https://github.com/acme/app/issues/89)) is not yet implemented.
```
