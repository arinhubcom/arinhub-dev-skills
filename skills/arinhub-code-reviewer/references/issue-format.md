# Issue Format

Each issue must follow this structure:

````markdown
- **Severity:** High Priority | Medium Priority | Low Priority
  **File:** path/to/file.ts
  **Line(s):** 42 (or 42-50)
  **Description:** Clear explanation of the problem.
  **Code:**
  ```ts
  // the problematic code from the PR diff
  const result = unsafeOperation(input);
  ```
  **Suggestion:**
  ```diff
  - const result = unsafeOperation(input);
  + const result = safeOperation(sanitize(input));
  ```
````
