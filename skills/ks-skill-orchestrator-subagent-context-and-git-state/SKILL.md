---
name: ks-skill-orchestrator-subagent-context-and-git-state
description: |
  Use when: (1) building a skill/command that orchestrates other skills by spawning subagents,
  (2) a delegated sub-skill reads git working-tree state (e.g. `git branch --show-current`) instead
  of taking it as an argument, (3) a sub-skill is supposed to "reflect on this session" / capture
  session learnings (like revise-claude-md) but runs in a subagent, (4) base branch ends up wrong
  or a session-reflection step sees an empty/trivial context. Keywords: orchestrator, subagent
  isolated context, git branch --show-current, base branch checkout, revise-claude-md, this session.
---

# Orchestrator pitfalls: subagent context isolation + git-derived state

## Overview

When a skill orchestrates other skills by launching one subagent per phase, two non-obvious
assumptions silently break. Both come from the same root: a subagent is an isolated context with its
own conversation, and many skills read ambient state (git working tree) rather than their arguments.

## When to Use

- Writing an "orchestrator-of-orchestrators" skill (e.g. `ah-workflow`) that runs phase skills in
  sequence via subagents.
- Auditing such a skill for correctness before shipping.
- A handed-off value (base branch, current branch, env) doesn't reach the sub-skill as expected.

## When NOT to Use

- Single-skill workflows with no subagent delegation.
- Sub-skills that genuinely accept the value as an explicit argument (verify first by reading them).

## Solution

### Pitfall 1 — sub-skill derives state from the git working tree, not from args

Many skills compute their base/context from the working tree, e.g.
`BASE_BRANCH=$(git branch --show-current)`. Passing a "base branch" string in the subagent prompt has
**no effect** — the skill ignores it and uses whatever branch is checked out.

Fix: set up the working-tree state *before* launching the subagent. For a base branch, the
orchestrator must `git checkout <base-branch>` (and `git pull` if it tracks a remote) first, so the
sub-skill's `git branch --show-current` returns the intended base. Always read the sub-skill's actual
Step 0 to learn which state it derives vs. which it accepts as an argument.

### Pitfall 2 — a "reflect on this session" skill must run in the main session

Skills like `revise-claude-md` operate on *"this session"* (the conversation history). Run inside a
subagent, they reflect on the subagent's own isolated context — which only contains "I invoked one
skill" — not the orchestrator's full run. The captured learnings are therefore empty or trivial.

Fix: invoke session-reflection skills **in the main orchestrator session**, not as a subagent. Make
this an explicit exception in the per-phase loop.

### Corollary — non-`ah-*` (non-pipeline) steps may not auto-commit

Pipeline skills often run an internal `committer` subagent. A general command like `revise-claude-md`
does not, and if it runs after the PR is already created, its file edits land uncommitted and outside
the PR. Handle such steps explicitly: present the diff and ask whether to commit + push onto the PR
branch.

## Quick Reference

| Symptom | Root cause | Fix |
| ------- | ---------- | --- |
| Base branch wrong in `spec.md` / new branch cut from wrong base | sub-skill uses `git branch --show-current`, ignores passed arg | `git checkout <base>` before launching that phase |
| Session-learnings step produces empty/trivial output | reflection skill ran in isolated subagent context | run it in the main session |
| CLAUDE.md / doc edits left uncommitted, not in PR | non-pipeline step has no internal committer; runs post-PR | commit + push explicitly, or run before PR creation |

## Common Mistakes

- Assuming the subagent prompt's "inputs" reach the skill — they only reach it if the skill reads
  args for that value. State derived from git/env must be staged in the working tree first.
- Treating every phase identically as "spawn a subagent" — session-aware steps are an exception.

## Verification

- Read each phase sub-skill's Step 0/Input section and classify each needed value as
  arg-driven vs. working-tree-derived. Stage the working-tree-derived ones before the call.
- After a dry run / real run, confirm `spec.md` (or equivalent) records the intended base branch and
  that the reflection step's output references the whole pipeline, not just "invoked a skill".

## Notes

Discovered while building `ah-workflow` (arinhub-dev-skills): `ah-create-tasks` derives base branch
from `git branch --show-current`, and `claude-md-management:revise-claude-md` reflects on the current
session. See also [[ks-merge-dropped-feature-stale-base]] for related git-base hazards.
