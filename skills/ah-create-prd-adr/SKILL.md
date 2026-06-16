---
name: ah-create-prd-adr
description: Use this skill to create a PRD and ADR from a feature description using the "ah" prefix. Use when asked to "ah create prd adr", "ah create prd and adr", or "ah prd adr". Takes a feature description (in any language), runs a short discovery interview, then generates a Product Requirements Document at ~/.agents/prds/prd-<repo>-<feature>.md and an Architectural Decision Record at ~/.agents/adrs/adr-<repo>-<feature>.md, with the ADR using the PRD as context. The output pair feeds directly into "ah create tasks".
argument-hint: "a feature description, optionally a feature-name slug"
---

# Create PRD and ADR from a Description

Transform a feature **description** into two paired planning artifacts in one run:

1. A **Product Requirements Document (PRD)** at `~/.agents/prds/prd-<repo>-<feature>.md`
2. An **Architectural Decision Record (ADR)** at `~/.agents/adrs/adr-<repo>-<feature>.md`

The PRD captures **what** and **why** (requirements, user stories, success criteria); the ADR
captures **how** at the architecture level (chosen design, trade-offs, alternatives). The ADR
is generated second and reads the PRD for context, so the two stay aligned. The resulting pair
is what `ah create tasks` consumes next.

## Input

- **description** (required): The feature description, in any language. If the user did not
  provide one, ask for it before doing anything else.
- **feature name** (optional): A short kebab-case slug for the filenames (e.g.
  `dark-mode-toggle`). If not provided, derive it from the description.

## Procedure

### Step 0 - Initialize

Resolve the repo name and output paths:

```bash
REPO_NAME=$(basename -s .git "$(git remote get-url origin 2>/dev/null)")
# Fallback when the repo has no 'origin' remote:
[ -z "$REPO_NAME" ] && REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")
mkdir -p ~/.agents/prds ~/.agents/adrs
PROGRESS_DIR=~/.agents/arinhub/progresses
source "<skill_dir>/scripts/progress.sh"
```

- Translate the description to **English** (all document content is written in English). Keep
  the English translation of the original wording verbatim for the `**Original prompt:**` line.
- Derive a kebab-case `<feature>` slug from the description (2-5 words capturing the core
  feature), unless the user supplied one. Lowercase, hyphen-separated, no special characters.
- Compute the two paths and reuse them throughout:
  - `PRD_PATH=~/.agents/prds/prd-${REPO_NAME}-${FEATURE}.md`
  - `ADR_PATH=~/.agents/adrs/adr-${REPO_NAME}-${FEATURE}.md`
- Initialize the progress log (keyed by feature slug, since this skill has no branch yet):
  - `PROGRESS_FILE="${PROGRESS_DIR}/progress-prd-adr-${REPO_NAME}-${FEATURE}.md"`
  - `progress_init "${PROGRESS_FILE}" "${FEATURE}" "" ""`

  Progress is a deterministic append-only log written by `scripts/progress.sh` (path resolved
  relative to this SKILL.md's directory), not an LLM-maintained markdown file.

If a file already exists at either path, tell the user it will be overwritten and confirm
before continuing.

### Step 1 - Discovery interview

A description alone usually leaves gaps that make a PRD vague. Before drafting, ask the user
**2-3 focused questions** and wait for the answers. Good defaults:

- **The core problem**: Why build this now? What pain does it remove?
- **Success metrics**: How will we know it worked? (so success criteria can be measurable)
- **Constraints**: Tech stack, deadline, or dependencies to respect?

Only ask what you genuinely cannot infer from the description and the repository. If the
description is already rich and specific, ask fewer questions rather than padding.

### Step 2 - Generate the PRD

Read `references/prd-template.md` and write `PRD_PATH` following it exactly. The file must:

- Begin with `# PRD: <Title>`.
- Immediately follow with `**Original prompt:** <English translation of the description>` and a
  `---` divider, so the source intent is preserved at the top of the file.
- Use the strict PRD schema: Executive Summary -> User Experience & Functionality -> AI System
  Requirements (if applicable) -> Technical Specifications -> Risks & Roadmap.
- Express success criteria as concrete, measurable items with codes (`SC-01`, `SC-02`, ...).
  Avoid vague words like "fast", "easy", or "intuitive" -- attach numbers or observable
  behavior instead.

After writing it: `progress_log "${PROGRESS_FILE}" 1 prd done "" "${PRD_PATH}"`.

### Step 3 - Generate the ADR

Read the PRD you just wrote at `PRD_PATH` for context, then read `references/adr-template.md`
and write `ADR_PATH` following it exactly. The file must:

- Start with YAML front matter: `title: "ADR-NNNN: <Decision Title>"`, `status: "Proposed"`,
  `date` (use the current date, `date +%F`), `authors`, `tags`, `supersedes`, `superseded_by`.
- Include the sections: Status -> Context -> Decision -> Consequences (with `POS-001` /
  `NEG-001` coded bullets) -> Alternatives Considered (`ALT-001`, at least 2-3, with rejection
  reasons) -> Implementation Notes (`IMP-001`) -> References (`REF-001`, linking the PRD).
- Stay consistent with the PRD: the decision must satisfy the PRD's requirements and
  constraints. Reference the PRD in the References section.

After writing it: `progress_log "${PROGRESS_FILE}" 2 adr done "" "${ADR_PATH}"`.

### Step 4 - Report

Print a short summary:

- The PRD path and the ADR path.
- A one-line description of the feature.
- A note that the pair can now be fed into `ah create tasks` (which takes a PRD path, an ADR
  path, and an issue number).

Then mark the run complete: `progress_done "${PROGRESS_FILE}" completed`.

## Important Notes

- **Naming convention**: both files mirror the same `<repo>-<feature>` slug
  (`prd-<repo>-<feature>.md` / `adr-<repo>-<feature>.md`) so they are easy to pair.
- **Language**: all document content is written in English, regardless of input language.
  Only the `**Original prompt:**` line carries the (translated) original wording.
- **No emojis** in any generated document.
- **Overwrite safety**: if either target file already exists, confirm with the user before
  replacing it -- these files may already be in use by `ah create tasks`.
- If the description is too thin to produce a meaningful PRD even after the interview, say so
  and ask for more detail rather than inventing requirements or constraints.
