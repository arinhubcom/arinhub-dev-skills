# Issue Format

## Severity Levels

Use the following severity levels to categorize issues:

- **High Priority**: Critical issues that could cause bugs, security vulnerabilities, or data loss. These should be addressed before merging.
- **Medium Priority**: Important improvements that enhance code quality, maintainability, or performance but are not critical. These should be addressed before merging if possible.
- **Low Priority**: Minor issues such as style inconsistencies, formatting, or non-functional suggestions. These can be addressed at the developer's discretion.

## Structure

Each issue must follow this structure:

````markdown
- **Severity:** High Priority | Medium Priority | Low Priority
- **File:** path/to/file.ts
- **Line(s):** 42 (or 42-50)
- **Description:** Clear explanation of the problem.
- **Code:**
  ```ts
  // the problematic code from the PR diff
  const result = unsafeOperation(input);
  ```
- **Suggestion:**
  ```diff
  - const result = unsafeOperation(input);
  + const result = safeOperation(sanitize(input));
  ```
````
