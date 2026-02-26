# Submit PR Review

Spawn a subagent to submit the review. The subagent's sole job is to invoke its assigned skill and return whatever the skill produces. Do NOT write submission logic or call the GitHub API manually.

- **Invoke:** `/ah-submit-code-review`
- **Arguments:** PR number (`${PR_NUMBER}`), review file path (`${REVIEW_FILE}`)

The skill handles deduplication against existing PR comments before submission.
