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

When providing suggestions, use markdown diff format to clearly indicate the proposed changes.
This format helps maintain clarity and allows developers to easily understand the suggested modifications.
Ensure that suggestions are based on the current state of the codebase and do not reference code that has been deleted in the diff file.
Can include multiple diff blocks if necessary, but should be focused on the specific issue being raised.
Don't include similar comments like `// ... later:` in suggestions, use more direct markdown diff code blocks to indicate the changes.

## Structure

Each issue must follow this structure:

````markdown
- **Severity:** High Priority | Medium Priority | Low Priority
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
