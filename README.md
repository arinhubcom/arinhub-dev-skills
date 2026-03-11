# ArinHub

Collection of AI agents, hooks, and [skills](skills).

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- [GitHub CLI](https://cli.github.com/) (`gh`) — authenticated with repo access
- Node.js with `npx` available

## Agent Skills

[Agent Skills](https://agentskills.io) are reusable agent definitions that can be invoked from any chat session. They are designed to perform specific tasks and can orchestrate other skills and commands as needed.

All skills have a unique namespace prefix (`ah-`) to avoid naming conflicts and can be easily invoked using their short names. For example, the `ah-review-code` skill can be invoked with the command `/ah-review-code` or `ah review code`.

| Skill                                                                                | Description                                                                                                                                       | Use when                                                                                                                                                                            |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ah-review-code`](skills/ah-review-code/SKILL.md)                                   | Orchestrate a comprehensive code review by running multiple review strategies in parallel, merging and deduplicating findings into a review file. | `"ah review code"`, `"ah review code 123"`                                                                                                                                          |
| [`ah-submit-code-review`](skills/ah-submit-code-review/SKILL.md)                     | Submit code review from chat session or review file to a GitHub PR.                                                                               | `"ah submit code review 123"`                                                                                                                                                       |
| [`ah-verify-requirements-coverage`](skills/ah-verify-requirements-coverage/SKILL.md) | Verify that a PR or local changes fully implement the requirements described in a linked GitHub issue.                                            | `"ah verify requirements coverage"`, `"ah verify requirements coverage issue 42"`, `"ah verify requirements coverage PR 123"`, `"ah verify requirements coverage PR 123, issue 42"` |
| [`ah-create-tasks`](skills/ah-create-tasks/SKILL.md)                                 | Create tasks from a PRD and ADR using the full Spec Kit pipeline with consistency analysis passes.                                                | `"ah create tasks"`                                                                                                                                                                 |
| [`ah-create-pr`](skills/ah-create-pr/SKILL.md)                                       | Analyze the current branch, run quality checks, and create a well-structured GitHub PR with summary, changes, tests, and linked issues.           | `"ah create pr"`, `"ah pr"`                                                                                                                                                         |

### How to Use `ah-review-code`

#### Local Changes

```sh
/ah-review-code
# or
ah review code
```

#### GitHub Pull Request

```sh
# navigate to the PR repository first
/ah-review-code 123
# or
ah review code 123
```

#### Required Commands & Skills

The orchestrator launches parallel subagents that depend on external commands and skills:

| Subagent | Skill / Command                                                                                                                      | Description                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A        | [`code-reviewer`](https://github.com/google-gemini/gemini-cli/blob/main/.gemini/skills/code-reviewer/SKILL.md)                       | Standards-driven reviewer that scores findings by confidence (≥80 threshold) and analyzes code against CLAUDE.md guidelines across seven pillars.                             |
| B        | [`octocode-roast`](https://github.com/bgauryy/octocode-mcp/blob/main/skills/octocode-roast/SKILL.md)                                 | Brutally honest code critic using LSP semantic analysis (call hierarchy, find-refs) to hunt sins ranked by a six-level severity registry from capital offenses to nitpicks.   |
| C        | [`pr-review-toolkit:review-pr`](https://github.com/anthropics/claude-code/blob/main/plugins/pr-review-toolkit/commands/review-pr.md) | Multi-specialist toolkit dispatching six focused sub-agents (comment accuracy, test coverage, silent failures, type design, general quality, and code simplification).        |
| D        | [`react-doctor`](https://github.com/millionco/react-doctor/blob/main/skills/react-doctor/SKILL.md)                                   | React-specific static analyzer that runs an external CLI on the live working tree, producing a 0–100 health score alongside diagnostics for hooks, performance, and patterns. |

Additionally, after the review phase:

| Step                | Skill                                                                                | When                |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------- |
| Verify requirements | [`ah-verify-requirements-coverage`](skills/ah-verify-requirements-coverage/SKILL.md) | remote PR and local |
| Submit review       | [`ah-submit-code-review`](skills/ah-submit-code-review/SKILL.md)                     | remote PR only      |

Install all required commands and skills:

```sh
claude plugin install pr-review-toolkit
npx skills add arinhubcom/arinhub -y -g -s ah-review-code -s ah-submit-code-review -s ah-verify-requirements-coverage -s ah-create-tasks -s ah-create-pr
npx skills add google-gemini/gemini-cli -y -g -s code-reviewer
npx skills add bgauryy/octocode-mcp -y -g -s octocode-roast
npx skills add millionco/react-doctor -y -g -s react-doctor
```

To update all installed skills to their latest versions:

```sh
npx skills update
```

> **Note:** `pr-review-toolkit` is an official Claude Code plugin. Official plugins have automatic updates enabled by default.

### How to Use `ah-create-tasks`

```sh
/ah-create-tasks path/to/prd.md, path/to/adr.md, issue 42
# or
ah create tasks path/to/prd.md, path/to/adr.md, issue 42
```

#### Required Commands & Skills

The orchestrator launches subagents that depend on the [Spec Kit](https://github.com/github/spec-kit) commands.

### How to Use `ah-submit-code-review`

> Automatically called by `ah-review-code` when reviewing a remote PR. Can also be used standalone:

```sh
/ah-submit-code-review 123
# or
ah submit code review 123
```

### How to Use `ah-verify-requirements-coverage`

> Automatically called by `ah-review-code` for both local and remote reviews. Can also be used standalone:

```sh
/ah-verify-requirements-coverage PR 123, issue 42
# or
ah verify requirements coverage PR 123, issue 42
```
