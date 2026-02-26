# Review Format

````md
### High Priority

#### Title of the issue

- **Severity:** High Priority
- **Source:** [source]
- **File:** [`path/to/file.ts:42`](/absolute/path/to/file.ts#L42)
- **File In Diff:** true
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

### Medium Priority

#### Title of the issue

- **Severity:** Medium Priority
- **Source:** [source]
- **File:** [`path/to/file.ts:88-95`](/absolute/path/to/file.ts#L88-L95)
- **File In Diff:** true
- **Line(s):** 88-95
- **Description:** Clear explanation of the problem.
- **Code:**
  ```ts
  // the problematic code from the PR diff
  items.forEach((item) => {
    process(item);
  });
  ```
- **Suggestion:**
  ```diff
  - items.forEach((item) => {
  -   process(item);
  - });
  + await Promise.all(items.map((item) => process(item)));
  ```

### Low Priority

#### Title of the issue

- **Severity:** Low Priority
- **Source:** [source]
- **File:** [`path/to/file.ts:12`](/absolute/path/to/file.ts#L12)
- **File In Diff:** true
- **Line(s):** 12
- **Description:** Clear explanation of the problem.
- **Code:**
  ```ts
  // the relevant code snippet
  let x = getValue();
  ```

---

**Total issues:** N (X High Priority, Y Medium Priority, Z Low Priority)
**Sources:** code-reviewer, octocode-roast, pr-review-toolkit[, react-doctor] (include react-doctor only if HAS_REACT=true)

Omit any severity section that has no issues (e.g., if there are no High Priority issues, do not include the `### High Priority` heading).
````
