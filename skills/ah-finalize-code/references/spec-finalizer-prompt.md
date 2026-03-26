# Spec Finalizer Prompt

Optimize and update the `${SPEC_DIR}/` folder. Follow these phases in order:

## Phase 1: Consolidate and Clean

Step 1 -- Inventory: List every file and subdirectory in `${SPEC_DIR}/`.

Step 2 -- Consolidate before deleting: For each file marked for deletion
below, read it and extract any non-obvious decisions, constraints, or
context that is NOT already captured in the essential files. Append
extracted content to the most relevant essential file (spec.md for
requirements/decisions, plan.md for architecture/implementation details,
data-model.md for schema/type info).

Step 3 -- Delete redundant files: Remove the following files (they served
their purpose during planning and are now consumed):
  - research.md -- research findings should already be in spec.md/plan.md
  - tasks.md -- tasks are completed, tracked in git history
  - checklist.md -- checklist items are done
  - requirements.md -- requirements are in spec.md
  - Any quickstart guide files (e.g. quickstart.md, getting-started.md)
  - Any other temporary/working files not listed as essential below

Step 4 -- Keep essential files: These files MUST be preserved:
  - spec.md -- core specification with metadata (Base Branch, Issue Number)
  - plan.md -- implementation plan and architecture decisions
  - data-model.md -- data model definitions and schema
  - retrospective.md -- implementation retrospective
  - contracts/ directory -- but only contracts still referenced by the
    codebase; delete any contract file whose types/interfaces no longer
    exist in the current diff

## Phase 2: Update to Reflect Code

Step 5 -- Sync with implementation: For each essential file, compare its
content against the current diff and update:
  - Add any implemented behaviors or decisions not yet documented
  - Correct any details that diverged during implementation
  - Remove "Next Steps" sections (implementation is done)
  - Remove resolved "TODO" or "TBD" markers
  - Remove references to deleted files
  - Fix broken internal links between remaining files

Step 6 -- Verify: Confirm that no critical context, valid cross-references,
or needed information was lost. List any files deleted and any content
consolidated.
