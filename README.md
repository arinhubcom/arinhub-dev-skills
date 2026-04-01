# ArinHub Dev Skills

Collection of AI [agent skills](#agent-skills) for software development workflows, designed for use with [Claude Code](https://code.claude.com/docs).

## Development workflow for implementing a new feature or fixing a bug

```sh
# Create PRD and ADR files from description.
- /ah-create-prd-adr

# Create implementation tasks from PRD and ADR files.
- /ah-create-tasks

# Implement tasks with TDD, React best practices, and automatic retry for incomplete tasks.
- /ah-implement-tasks

# Check UI and performance quality with automated checks and E2E smoke tests.
- /ah-check-qa

# Finalize code with simplification, retrospectives, code review, and PR creation.
- /ah-finalize-code
```

## Prerequisites

- [Node.js](https://nodejs.org/en/download) with `npm` available
- [Claude Code](https://code.claude.com/docs)
- [GitHub CLI](https://cli.github.com/) (`gh`) — authenticated with repo access
- [Spec Kit](https://github.com/github/spec-kit)
- [Chrome DevTools CLI skill](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/skills/chrome-devtools-cli/SKILL.md) — `npx skills add ChromeDevTools/chrome-devtools-mcp -y -g -s chrome-devtools-cli`
- [Context7 MCP](https://github.com/upstash/context7) — `npx ctx7 setup`
- [Vercel Grep MCP](https://vercel.com/blog/grep-a-million-github-repositories-via-mcp) — `claude mcp add --transport http grep https://mcp.grep.app`

## Installation

```sh
npx skills add arinhubcom/arinhub-dev-skills -y -g -s ah-review-code -s ah-submit-code-review -s ah-verify-requirements-coverage -s ah-create-tasks -s ah-implement-tasks -s ah-check-qa -s ah-create-pr -s ah-finalize-code -s ah-resolve-pr-review -s ah-fix-dom-flash -s ah-fix-ui-bug -s ah-create-prd-adr
```

## Agent Skills

[Agent Skills](https://agentskills.io) are reusable agent definitions that can be invoked from any chat session. They are designed to perform specific tasks and can orchestrate other skills and commands as needed.

All skills have a unique namespace prefix (`ah-`) to avoid naming conflicts and can be easily invoked using their short names. For example, the `ah-review-code` skill can be invoked with the command `/ah-review-code` or `ah review code`.

| Skill                                                                                | Description                                                                                                                                           | Use when                                                                                                                                                                            |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ah-review-code`](skills/ah-review-code/SKILL.md)                                   | Orchestrate a comprehensive code review by running multiple review strategies in parallel, merging and deduplicating findings into a review file.     | `"ah review code"`, `"ah review code 123"`                                                                                                                                          |
| [`ah-submit-code-review`](skills/ah-submit-code-review/SKILL.md)                     | Submit code review from chat session or review file to a GitHub PR.                                                                                   | `"ah submit code review 123"`                                                                                                                                                       |
| [`ah-verify-requirements-coverage`](skills/ah-verify-requirements-coverage/SKILL.md) | Verify that a PR or local changes fully implement the requirements described in a linked GitHub issue.                                                | `"ah verify requirements coverage"`, `"ah verify requirements coverage issue 42"`, `"ah verify requirements coverage PR 123"`, `"ah verify requirements coverage PR 123, issue 42"` |
| [`ah-create-tasks`](skills/ah-create-tasks/SKILL.md)                                 | Create tasks from a PRD and ADR using the full Spec Kit pipeline with consistency analysis passes.                                                    | `"ah create tasks"`                                                                                                                                                                 |
| [`ah-implement-tasks`](skills/ah-implement-tasks/SKILL.md)                           | Load React best practices context, then execute tasks from tasks.md phase-by-phase with TDD and automatic retry for incomplete tasks.                 | `"ah implement tasks"`                                                                                                                                                              |
| [`ah-check-qa`](skills/ah-check-qa/SKILL.md)                                         | Run UI/UX quality checks with Chrome DevTools: visual inspection, Lighthouse audits, interaction testing, E2E smoke tests, and screenshot comparison. | `"ah check qa"`, `"ah check qa before"`, `"ah check qa http://localhost:3000"`                                                                                                      |
| [`ah-create-pr`](skills/ah-create-pr/SKILL.md)                                       | Analyze the current branch, run quality checks, and create a well-structured GitHub PR with summary, changes, tests, and linked issues.               | `"ah create pr"`, `"ah pr"`                                                                                                                                                         |
| [`ah-finalize-code`](skills/ah-finalize-code/SKILL.md)                               | Orchestrate the full pre-PR finalization: simplify, retrospective, tests, JSDoc, docs, specs, code review, and PR -- committing after each step.      | `"ah finalize code"`, `"ah finalize changes"`                                                                                                                                       |
| [`ah-resolve-pr-review`](skills/ah-resolve-pr-review/SKILL.md)                       | Resolve unresolved PR review conversations by reading each comment, understanding the reviewer's intent, and implementing fixes in the codebase.      | `"ah resolve pr review"`                                                                                                                                                            |
| [`ah-fix-dom-flash`](skills/ah-fix-dom-flash/SKILL.md)                               | Detect and debug DOM flash/flicker bugs using Chrome DevTools CLI -- finds timing races between framework DOM cleanup and React re-renders.           | `"ah fix dom flash"`                                                                                                                                                                |
| [`ah-fix-ui-bug`](skills/ah-fix-ui-bug/SKILL.md)                                     | Debug and fix UI bugs using Chrome DevTools CLI -- inspects elements, injects diagnostics, tracks positions, and analyzes DOM mutations.              | `"ah fix ui bug"`                                                                                                                                                                   |

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

### How to Use `ah-implement-tasks`

Run from a feature branch after `/ah-create-tasks` has generated a `tasks.md`:

```sh
/ah-implement-tasks
# or
ah implement tasks
```

Loads `/vercel-composition-patterns`, `/vercel-react-best-practices`, and `/building-components` guidelines into context, then runs `/speckit.implement`. If not all tasks are completed in the first pass, automatically retries once.

#### Required Skills

| Skill                                                                                                                       | Source                     | Description                                                                      |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| [`building-components`](https://github.com/vercel/components.build/blob/main/skills/building-components/SKILL.md)           | `vercel/components.build`  | Modern, accessible, composable UI component guidelines                           |
| [`vercel-react-best-practices`](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md) | `vercel-labs/agent-skills` | React and Next.js performance optimization from Vercel Engineering               |
| [`vercel-composition-patterns`](https://github.com/vercel-labs/agent-skills/blob/main/skills/composition-patterns/SKILL.md) | `vercel-labs/agent-skills` | React composition patterns: compound components, render props, context providers |

Install the required skills:

```sh
npx skills add vercel/components.build -y -g -s building-components
npx skills add vercel-labs/agent-skills -y -g -s vercel-react-best-practices -s vercel-composition-patterns
```

#### Required MCP Servers

Requires `context7` and `grep` MCP servers (see [Prerequisites](#prerequisites)).

### How to Use `ah-check-qa`

Run from a feature branch after implementing tasks. Auto-detects the running dev server and discovers routes from the project structure.

```sh
# Full QA audit (auto-detect dev server and routes)
/ah-check-qa
# or
ah check qa

# Capture baseline screenshots before refactoring
/ah-check-qa before
# or
ah check qa before

# Target a specific URL
/ah-check-qa http://localhost:3000/settings
# or
ah check qa http://localhost:3000/settings
```

Requires `chrome-devtools-cli` skill (see [Prerequisites](#prerequisites)). Runs visual inspection, Lighthouse audits, interaction testing, dark mode checks (if supported), E2E smoke tests, and generates a report with screenshots. When baseline screenshots exist from a prior `before` run, automatically compares current vs. baseline and flags regressions.

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

### How to Use `ah-finalize-code`

Run from a feature branch with a `specs/<branch-name>/spec.md` file containing `Base Branch` and `Issue Number` metadata:

```sh
/ah-finalize-code
# or
ah finalize code
```

### How to Use `ah-resolve-pr-review`

```sh
/ah-resolve-pr-review
# or
ah resolve pr review
```

Optionally accepts a PR number, `#123`, or a full PR URL. If omitted, the skill detects the PR from the current branch. It checks out the PR branch, fetches all unresolved review threads, implements fixes where possible, runs verification, and presents a summary report before committing.

### How to Use `ah-fix-dom-flash`

```sh
/ah-fix-dom-flash in the widget component, after dragging the chip onto the button, the chip appears in the bottom left
# or
ah fix dom flash, in the widget component, after dragging the chip onto the button, the chip appears in the bottom left
```

Requires `chrome-devtools-cli` skill (see [Prerequisites](#prerequisites)). The skill injects a flash detector (MutationObserver + requestAnimationFrame) from `scripts/`, reproduces the interaction via DevTools, and identifies timing races between framework DOM cleanup and React re-renders.

### How to Use `ah-fix-ui-bug`

```sh
/ah-fix-ui-bug http://localhost:3000/settings, .save-button shifts down after clicking
# or
ah fix ui bug http://localhost:6006/iframe.html?id=my-story, the chip lands at wrong position after drag
```

Requires `chrome-devtools-cli` skill (see [Prerequisites](#prerequisites)). The skill navigates to the page, takes an a11y snapshot, injects diagnostic scripts (layout shift detection, position tracking, mutation observers), reproduces the interaction, and analyzes collected data to identify the root cause. For single-frame flash/flicker timing races, use `ah-fix-dom-flash` instead.

## How to create your own Agent Skill

```sh
# https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
npx skills add anthropics/skills -y -g -s skill-creator

/skill-creator create skill-name skill in file skills/skill-name/SKILL.md
/skill-creator improve skill-name skill
```
