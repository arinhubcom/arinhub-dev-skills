# Issue Format

## Severity Levels

Use the following severity levels to categorize issues:

- **High Priority**: Critical issues that could cause bugs, security vulnerabilities, or data loss. These should be addressed before merging.
- **Medium Priority**: Important improvements that enhance code quality, maintainability, or performance but are not critical. These should be addressed before merging if possible.
- **Low Priority**: Minor issues such as style inconsistencies, formatting, or non-functional suggestions. These can be addressed at the developer's discretion.

## Line Variable

When referencing lines in the issue, use the following format:

- For a single line: `Line(s): 42`
- For a range of lines: `Line(s): 42-50`
- For multiple specific lines: `Line(s): 77, 324-325` - two markdown code blocks can be used in suggestion

## Code Section

When referencing code in the issue, include the relevant code sections from the diff file.
This helps maintain context and ensures that suggestions are based on the current state of the codebase.

## Suggestion Section

Suggestions MUST be written as ` ```diff ` code blocks using `-` (removed) and `+` (added) line prefixes.
Lines that stay unchanged within the diff context use a single space (` `) prefix — never leave them unprefixed.

Rules:

- Always base the `-` lines on the exact code from the current diff — do not paraphrase or abbreviate.
- Each suggestion should be a self-contained diff block that a developer could apply directly.
- Multiple diff blocks are allowed when changes span non-adjacent regions, but keep each block focused on the specific issue.
- Do NOT use placeholder comments like `// ... rest unchanged` or `// ... later:` — instead, either show the full context or split into separate diff blocks.
- If the suggestion is purely an addition (no lines removed), use only `+` prefixed lines with enough ` ` context lines around them for clarity.

## Structure

Each issue must follow this structure:

````markdown
- **Severity:** High Priority | Medium Priority | Low Priority
- **Source:** <agent-name> (e.g., code-reviewer, octocode-roast, pr-review-toolkit, react-doctor)
- **File:** path/to/file.ts
- **File In Diff:** true (if the file is part of the diff file) or false (if the file is not part of the diff file)
- **Line(s):** 42 (or 42-50, or 77, 324-325)
- **Description:** Clear explanation of the problem.
- **Code:**
  ```ts
  // the problematic code from the diff file
  const result = unsafeOperation(input);
  ```
- **Suggestion:**
  ```diff
  - const result = unsafeOperation(input);
  + const result = safeOperation(sanitize(input));
  ```
````
