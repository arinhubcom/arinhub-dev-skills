# PR Body Template

Read this template before composing the PR body. Follow its structure exactly.

## Template

```md
## Summary

<2-4 sentence explanation of what this PR does and why. Parse git diff and commit messages to understand the change intent. If an issue number was provided, retrieve its context and write a clear, standalone explanation -- never just say "Fixes #XXX" without explaining what the issue was about.>

## Changes

<For each logical group of changes, write a bullet point describing:

- What was changed (component/file/feature area)
- Why it was changed (how it contributes to the Summary)
- Brief technical approach if complex

Every significant diff block in `${DIFF}` must be represented. The diff is the single source of truth. Explicitly note if any changes seem unrelated to the main purpose. Do not link to files or code snippets.>

Example:

- **Added new help-circle icon** (`src/icons/help-circle.svg`)
  - Consistent with existing icon style (24x24 SVG with animated strokes)
  - Question mark in circle design for FAQ functionality

- **Modified AppLayout sidebar menu** (`src/layouts/AppLayout/index.tsx`)
  - Replaced contact button with FAQ link that opens in a new tab
  - Added `rel="noopener noreferrer"` for security best practices

## Tests

<List which existing tests should be affected based on the changes. Identify whether new functionality requires new tests and whether they are included. Check for `.test.ts`, `.spec.ts`, or test-related changes in the diff. Flag if new functionality lacks test coverage. Include manual testing steps if relevant.>

Example:

- **Manual Testing Required**: Verify the fix works by:
  1. Step one
  2. Step two
  3. Step three
- **Automated Tests**: Description of test coverage status

## GH

<Include ONLY if an issue number was provided. Use closing keywords with proper syntax: `Fixes #123`, `Closes #456`, `Resolves #789`. If no issue number was provided, omit this entire section.>
```

## Rules

- All sections except GH are always present
- GH section is omitted entirely when no issue number was provided
- Do not use placeholder text like "TODO" or "TBD" (unless in explicit TODO checkboxes)
- Changes section must cover every significant diff block -- the diff is the single source of truth
- Do not link to files or code snippets in the Changes section
