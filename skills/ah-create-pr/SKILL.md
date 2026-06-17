---
name: ah-create-pr
description: Create or update a GitHub Pull Request with the "ah" prefix. Use for "ah create pr", "ah create pull request", or "ah pr". Analyzes the current branch, runs quality checks, and generates a PR with summary, changes, tests, and linked issues. Updates an existing open PR via `gh pr edit`, otherwise creates one via `gh pr create`.
argument-hint: "base branch, issue number, labels"
---

# Create or Update GitHub Pull Request

Analyze current branch and create or update a well-structured GitHub Pull Request. If an open PR already exists for the current branch, update it instead of creating a duplicate. The diff against the base branch is the single source of truth for all PR content.

## Input

- **Base branch** (REQUIRED): target branch this PR merges into (e.g., `main`, `develop`). If the user did not provide it, STOP and ask before proceeding (or, when `autonomous`, fail fast with a clear error). Never assume or default to any branch.
- **Issue number** (optional): GitHub issue number this PR addresses (e.g., `42`, `#42`). If not provided by the user, do not infer it from the branch name -- omit issue references from the PR.
- **Labels** (optional): comma-separated labels to apply (e.g., `bug,urgent`, `feature,frontend`). If not provided by the user, auto-detect labels in step 2.
- **autonomous** (optional): `autonomous` to run non-interactively. Every point that would otherwise STOP and ask the user (missing base branch, `gh auth` failure, uncommitted changes, failed quality checks, base-branch mismatch on an existing PR) instead **fails fast with a clear error** -- the PR is not created and the caller (e.g. ah-workflow) escalates. The skill also suppresses its own Step 5 user report (returns only the PR URL + status). Default off (interactive). Set by ah-workflow / ah-finalize-code.
- Current Git branch with unmerged commits
- Git diff against the base branch

## Procedure

### 0. Preparation

Determine **autonomy**: if the user passed `autonomous`, set `AUTONOMOUS=1`, else `AUTONOMOUS=0`. When `AUTONOMOUS=1`, never prompt the user -- every STOP/ask below becomes a fail-fast error.

Verify GitHub CLI authentication and check for uncommitted changes before proceeding.

```bash
gh auth status

# Warn if there are uncommitted changes that won't be included in the PR
git status --porcelain
```

If `gh auth status` fails, stop and ask the user to authenticate with `gh auth login`. If there are uncommitted changes (staged or unstaged), warn the user that these changes will not be included in the PR and ask whether to continue or wait. When `AUTONOMOUS=1`, do not ask: fail fast on `gh auth` failure, and fail fast if there are uncommitted changes (the caller must hand over a clean, committed tree).

Run quality checks to catch issues before creating the PR. If any check fails, report the failure and ask the user how to proceed. When `AUTONOMOUS=1`, do not ask -- fail fast with the failing check output so the workflow escalates instead of creating a PR on a broken build.

```bash
pnpm preflight
pnpm preflight:build
```

Also compare `.env*` files in the repo root: identify missing keys across them and flag any security risks or naming inconsistencies.

### 1. Gather Context

If the user did not provide a base branch, STOP and ask for it before proceeding.

```bash
BASE_BRANCH=<user-provided base branch>
CURRENT_BRANCH=$(git branch --show-current)

# Compute merge base for reliable diffing (works even if origin isn't fetched)
git fetch origin "${BASE_BRANCH}" --quiet
MERGE_BASE=$(git merge-base "origin/${BASE_BRANCH}" HEAD)

# Diff against merge base. Lead with --stat (cheap summary); write the full diff
# to a file instead of into context, and read hunks from it only as needed.
git diff "${MERGE_BASE}" --stat
DIFF_FILE=$(mktemp /tmp/pr-diff.XXXXXX.patch)
git diff "${MERGE_BASE}" > "${DIFF_FILE}"
echo "Full diff: ${DIFF_FILE} ($(wc -l < "${DIFF_FILE}") lines)"

# Commit history on this branch
git log "${MERGE_BASE}"..HEAD --no-decorate

# Branch tracking status
git status -sb

# Check for existing open PR on this branch (single API call)
EXISTING_PR=$(gh pr list --head "${CURRENT_BRANCH}" --state open --json number,url,baseRefName --jq '.[0]')
EXISTING_PR_NUMBER=$(echo "${EXISTING_PR}" | jq -r '.number // empty')
EXISTING_PR_URL=$(echo "${EXISTING_PR}" | jq -r '.url // empty')
EXISTING_PR_BASE=$(echo "${EXISTING_PR}" | jq -r '.baseRefName // empty')
```

If an open PR already exists for the current branch, the skill updates it in Step 4 instead of creating a new one. If the existing PR targets a different base branch than the one the user provided, warn the user and ask how to proceed before continuing. When `AUTONOMOUS=1`, do not ask -- fail fast with a clear error describing the base-branch mismatch.

If the user provided an issue number, use it for the PR references. Do not infer issue numbers from the branch name or commit messages.

### 2. Analyze Changed Files

- **Categorize changes** by functional area (features, components, API, config, tests, etc.).
- **Identify patterns** -- look for related changes that form logical blocks (e.g., "Auth flow refactor", "Error handling improvements").
- **Validate scope** -- verify all changes contribute to the same feature/fix. Flag unrelated changes that may need separate PRs.

#### Determine Labels

If the user provided labels, use them as-is. Otherwise, auto-detect labels by analyzing:

1. **Fetch available labels** from the repository:
   ```bash
   gh label list --limit 100 --json name,description
   ```
2. **Match labels** based on PR content:
   - **PR title type** -- map the commit type (`feat`, `fix`, `refactor`, `docs`, `test`, `perf`, `chore`) to matching labels (e.g., `feat` -> `feature`/`enhancement`, `fix` -> `bug`/`bugfix`, `docs` -> `documentation`)
   - **Changed file paths** -- infer domain labels from directories (e.g., changes in `apps/app-name/` -> `app-name`, changes in `src/api/` -> `api`/`backend`, changes in `src/components/` -> `frontend`/`ui`, changes in `infra/` -> `infrastructure`)
   - **Diff content** -- detect patterns like security fixes, dependency updates, breaking changes, and match to corresponding labels
3. **Select only labels that exist** in the repository. Never create or suggest labels that do not exist.
4. **Limit to 1-4 labels** -- pick the most relevant ones. Prefer specific labels over generic ones.

### 3. Generate PR Content

Read the PR body template from [references/pr-body.md](references/pr-body.md) and follow its structure and rules exactly.

### 4. Create Pull Request

**Title format**: `<type>: <brief description>` -- keep under 70 characters.

- Types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `perf`
- For monorepos, prefix with app name: `app-name/feat: description`
- Extract from the first commit if it already follows this format.

**Draft mode**: Create as draft if any of these apply:

- TODOs identified in commit messages
- Tests missing for new features
- Scope seems too large (>20 files changed)

Push the branch to the remote if it has not been pushed yet or is behind:

```bash
git push -u origin ${CURRENT_BRANCH}
```

#### If an open PR already exists (`EXISTING_PR_NUMBER` is set)

Update the existing PR with the newly generated content:

```bash
gh pr edit ${EXISTING_PR_NUMBER} \
  --title "<type>: <brief description>" \
  --add-label "<label1>" --add-label "<label2>" \
  --body "$(cat <<'EOF'
<PR body from references/pr-body.md>
EOF
)"
```

Omit `--add-label` flags entirely if no labels were determined.

#### If no open PR exists

Create a new PR (include `--label` flags for each determined label):

```bash
gh pr create \
  --base "${BASE_BRANCH}" \
  --head "${CURRENT_BRANCH}" \
  --title "<type>: <brief description>" \
  --label "<label1>" --label "<label2>" \
  --body "$(cat <<'EOF'
<PR body from references/pr-body.md>
EOF
)"
```

Omit `--label` flags entirely if no labels were determined.

### 5. Report to User

When `AUTONOMOUS=1`, skip this user-facing report; return only the PR URL and a one-line status (created/updated) to the caller.

**Interactive mode (`AUTONOMOUS=0`)** -- after creating or updating the PR, provide:

1. **PR URL** -- direct link to the created or updated pull request
2. **Status** -- whether the PR was **created** or **updated** (existing PR detected)
3. **Summary** -- brief recap of what was included
4. **Labels** -- list the labels applied and briefly explain why each was chosen (or note that none were applicable)
5. **Action Items** -- any TODOs or follow-ups identified
6. **Review Checklist** -- quick reminders for self-review before requesting reviewers

## Validation Checks

Before submitting the PR, verify:

- All applicable sections are populated (Summary, Changes, Tests, and GH if an issue was provided)
- No placeholder text like "TODO" or "TBD" remains (unless in explicit TODO checkboxes)
- If an issue number was provided, closing keywords are correctly formatted
- Changes align with branch name and commit messages
- Test coverage is addressed (present or explicitly noted as TODO)

## Error Handling

When `AUTONOMOUS=1`, every "STOP and ask" / "prompt the user" below becomes a fail-fast error (clear message, no PR created) so the caller can escalate.

- If no base branch was provided, STOP and ask the user for it
- If no commits exist ahead of the base branch, abort and inform the user
- If diff is empty, check for unstaged changes and prompt the user
- If an existing open PR targets a different base branch than the user provided, warn the user and ask whether to update the existing PR's base or create a new PR

## Best Practices

- **Atomic PRs**: Warn if scope seems too broad (suggest splitting if >30 files or multiple unrelated features)
- **Conventional Commits**: Use semantic versioning-friendly titles
- **Self-Review**: Suggest the author review the generated content before requesting reviewers
