# Submit PR Review

Spawn a subagent to submit the review for PR `${PR_NUMBER}` using the `arinhub-submit-code-review` skill.
Pass the review file path (`${REVIEW_FILE}`) so the subagent reads issues from it.
The subagent must follow the `arinhub-submit-code-review` procedure for deduplication against existing PR comments before submission.
