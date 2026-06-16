# Resolve a GitHub issue into workflow inputs

`ah-workflow` follows this reference when its input is a GitHub issue URL (or `issue
<url>` / a bare issue number). The job here is narrow: read the issue and **return**
structured inputs to the orchestrator -- a feature description, issue number, base branch,
mode, and (in update mode) a spec number and branch prefix. This reference does **not**
launch anything and does **not** call `ah-workflow`; the orchestrator that read it
continues with step 0 using the values produced here.

Do this in the **main session**, not a subagent -- it may need to ask the user for a base
branch, spec number, or branch prefix, and those answers must reach the orchestrator.

**Override precedence**: any value the user passed explicitly to `ah-workflow` (a base
branch, `mode create|update`, a spec number, a branch prefix) wins over whatever the issue
implies. The order in each step below already encodes "explicit arg > issue marker/labels >
default".

## 1. Resolve the issue ref and guard the repo

Accept a full URL or a bare number.

- URL: parse `OWNER`, `REPO`, `NUMBER` from
  `https://github.com/<OWNER>/<REPO>/issues/<NUMBER>`.
- Bare number: use it as `NUMBER` with the current repo.

The pipeline (`git checkout`, branch creation, commits) runs in the **current working
directory**, so the issue must belong to the current repo:

```bash
CURRENT_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

If the URL's `<OWNER>/<REPO>` does not match `${CURRENT_REPO}`, stop and tell the user --
do not silently resolve an issue from one repo while running the pipeline in another. Ask
them to switch to the right repo or confirm the number belongs to the current one.

## 2. Fetch the issue

```bash
gh issue view "${NUMBER}" --json number,title,body,labels,url
```

(Same access pattern as `ah-verify-requirements-coverage`.) If the issue can't be fetched
(closed, wrong number, no access), report it and stop.

## 3. Build the feature description

Distill the issue **title + body** into a concise feature description -- this is what
`ah-workflow` phase 1 (`ah-create-prd-adr`) consumes. Keep the *what* and *why*; drop noise
like screenshots, logs, and `@`-mentions. Preserve any non-English wording verbatim;
`ah-create-prd-adr` handles translation.

## 4. Resolve the base branch

In order (explicit, then marker, then default):

1. If the user passed a base branch, use it.
2. Else scan the issue body for a marker line, case-insensitive, e.g.
   `Base Branch: develop` or `base: main`. Take the first match.
3. Else fall back to the repo default:

   ```bash
   BASE_BRANCH=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
   ```

4. Only if all three fail, ask the user. Never guess silently -- the base branch decides
   where the PR targets (same discipline as `ah-create-pr`).

## 5. Classify the mode (create vs update)

A **create** issue adds new capability; an **update** fixes or refactors existing behavior.
The mode flows down to `ah-create-tasks` (update mode skips re-specifying). Classify
labels-first:

1. **Labels** (primary signal):
   - `bug`, `bugfix`, `fix`, `refactor`, `refactoring`, `chore` -> `update`
   - `feature`, `enhancement`, `feat` -> `create`
2. **Body/title** (fallback when labels are missing or point both ways): judge intent -- a
   request for something new -> `create`; fixing, correcting, or restructuring existing
   code/behavior -> `update`.
3. A user-supplied **mode override** wins over both.

Echo the decision with its evidence, e.g. `mode=update (label: bug)` or
`mode=create (no labels; title describes a new export view)`, so the choice is auditable
before the (expensive) pipeline starts.

## 6. Update-mode extras (only when mode = update)

Resolve these here so the run doesn't stall on an interactive prompt deep in the pipeline:

- **Spec number**: scan the body for a marker (`Spec Number: 001` / `spec: 001`,
  case-insensitive). If absent, **ask the user**.
- **Branch prefix**: if the user passed one, use it; else resolve from the environment
  (`GIT_BRANCH_PREFIX`); else ask once. Update mode branches as `<prefix>/<spec>-<desc>`,
  and `ah-create-tasks` would otherwise ask for the prefix mid-run.

For a **feature**, skip this step.

## 7. Return to the orchestrator

Print a short summary so the user can confirm the resolved inputs -- issue URL + title,
chosen base branch (and how it was resolved: explicit / marker / default), classified mode
+ evidence, and the spec number and branch prefix (always in update mode; the spec number
too -- outside update mode -- if the user supplied one) -- then hand `ah-workflow` these values:

- feature description
- issue number (`NUMBER`)
- base branch (`BASE_BRANCH`)
- mode (`create` | `update`)
- spec number and branch prefix (required in update mode; outside update mode the spec number is optional -- pass it through when supplied so `ah-create-tasks` pins the branch number in its create mode)

`ah-workflow` resumes step 0 with these -- it builds its progress file (keyed by issue
number), runs the dev-server preflight, anchors the run with `/goal`, and drives the six
phases. Nothing in this reference branches or commits on its own.
