# ArinHub

Collection of AI agents, hooks, and [skills](skills).

## Agent Skills

[Agent Skills](https://agentskills.io) are reusable agent definitions that can be invoked from any chat session. They are designed to perform specific tasks and can orchestrate other skills and commands as needed.

| Skill                                                                                          | Description                                                                                                                                       | Use when                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [`arinhub-code-reviewer`](skills/arinhub-code-reviewer/SKILL.md)                               | Orchestrate a comprehensive code review by running multiple review strategies in parallel, merging and deduplicating findings into a review file. | `"ah review code"`, `"ah review code 123"`, `"ah review PR 123"`                                                                                |
| [`arinhub-submit-code-review`](skills/arinhub-submit-code-review/SKILL.md)                     | Submit code review from chat session or review file to a GitHub PR.                                                                               | `"ah submit code review 123"`, `"ah submit code review to PR 123"`                                                                              |
| [`arinhub-verify-requirements-coverage`](skills/arinhub-verify-requirements-coverage/SKILL.md) | Verify that a PR or local changes fully implement the requirements described in a linked GitHub issue.                                            | `"ah verify requirements"`, `"ah verify requirements issue 42"`, `"ah verify requirements PR 123"`, `"ah verify requirements PR 123, issue 42"` |

### How to Use `arinhub-code-reviewer`

#### Local Changes

```sh
/arinhub-code-reviewer
# or
ah review code
```

#### GitHub Pull Request

```sh
# navigate to the PR repository first
/arinhub-code-reviewer 123
# or
ah review code 123
```

### `arinhub-code-reviewer` — Required Commands & Skills

The orchestrator launches parallel subagents that depend on external commands and skills:

| Subagent | Skill / Command                                                                                                                      | Description                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A        | [`code-reviewer`](https://github.com/google-gemini/gemini-cli/blob/main/.gemini/skills/code-reviewer/SKILL.md)                       | Standards-driven reviewer that runs preflight checks, scores findings by confidence (≥80 threshold), and analyzes code against CLAUDE.md guidelines across seven pillars.     |
| B        | [`octocode-roast`](https://github.com/bgauryy/octocode-mcp/blob/main/skills/octocode-roast/SKILL.md)                                 | Brutally honest code critic using LSP semantic analysis (call hierarchy, find-refs) to hunt sins ranked by a six-level severity registry from capital offenses to nitpicks.   |
| C        | [`pr-review-toolkit:review-pr`](https://github.com/anthropics/claude-code/blob/main/plugins/pr-review-toolkit/commands/review-pr.md) | Multi-specialist toolkit dispatching six focused sub-agents (comment accuracy, test coverage, silent failures, type design, general quality, and code simplification).        |
| D        | [`react-doctor`](https://github.com/millionco/react-doctor/blob/main/skills/react-doctor/SKILL.md)                                   | React-specific static analyzer that runs an external CLI on the live working tree, producing a 0–100 health score alongside diagnostics for hooks, performance, and patterns. |

Additionally, after the review phase:

| Step                | Skill                                                                                          | When                |
| ------------------- | ---------------------------------------------------------------------------------------------- | ------------------- |
| Verify requirements | [`arinhub-verify-requirements-coverage`](skills/arinhub-verify-requirements-coverage/SKILL.md) | remote PR and local |
| Submit review       | [`arinhub-submit-code-review`](skills/arinhub-submit-code-review/SKILL.md)                     | remote PR only      |

Install all required commands and skills:

```sh
claude plugin install pr-review-toolkit
npx skills add arinhubcom/arinhub -y -g -s arinhub-code-reviewer -s arinhub-submit-code-review -s arinhub-verify-requirements-coverage
npx skills add google-gemini/gemini-cli -y -g -s code-reviewer
npx skills add bgauryy/octocode-mcp -y -g -s octocode-roast
npx skills add millionco/react-doctor -y -g -s react-doctor
```

To update all installed skills to their latest versions:

```sh
npx skills update
```

> **Note:** `pr-review-toolkit` is an official Claude Code plugin. Official plugins have automatic updates enabled by default.
