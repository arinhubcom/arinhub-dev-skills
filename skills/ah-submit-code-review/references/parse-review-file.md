# Parsing a review file

Apply these rules only when the issue list comes from an `ah-review-code` review
file (Step 5, source 1). For issues collected from the current chat session,
skip this file entirely.

The review file uses a different format than the submission API. Apply these
transformations when extracting issues:

| Review file field                        | Maps to                                | Transformation                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**Severity:** High Priority`            | `severity`                             | Use the value directly (`High Priority`, `Medium Priority`, or `Low Priority`)                                                                                                                                                                                                                                                                                                         |
| Issue heading (`#### <text>`)            | `title`                                | Use the heading text as the title                                                                                                                                                                                                                                                                                                                                                      |
| `**Source:** ...`                        | _(skip)_                               | Informational only -- not used in submission                                                                                                                                                                                                                                                                                                                                           |
| `**File:** path/to/file.ts`              | `path`                                 | Use the path directly. Strip any markdown link syntax (e.g., ``[`path:42`](/abs/path#L42)`` → `path`) and any `:line` or `:line-line` suffix                                                                                                                                                                                                                                           |
| `**File In Diff:** true` or `false`      | `file_in_diff`                         | Use the boolean value directly. If the field is missing, default to `true`                                                                                                                                                                                                                                                                                                             |
| `**Line(s):** 42`                        | `line: 42`                             | Single line: set `line` only                                                                                                                                                                                                                                                                                                                                                           |
| `**Line(s):** 42-50`                     | `start_line: 42, line: 50`             | Range: set `start_line` to the first number, `line` to the second                                                                                                                                                                                                                                                                                                                      |
| `**Line(s):** 77, 324-325`               | Split into separate issues             | Comma-separated values indicate multiple locations. Create one issue per segment (e.g., `line: 77` and `start_line: 324, line: 325`), each sharing the same severity, title, path, file_in_diff, and explanation. Duplicate the `suggestion` only if it applies to each segment; otherwise omit `suggestion` from both and append the original diff block(s) to `explanation` instead. |
| `**Description:** ...`                   | `explanation`                          | Use as the explanation text                                                                                                                                                                                                                                                                                                                                                            |
| `**Code:** ` ` ```...``` ` block         | _(skip)_                               | Informational only -- not used in submission                                                                                                                                                                                                                                                                                                                                           |
| `**Suggestion:** ` ` ```diff ``` ` block | `suggestion` or `explanation` appendix | See **Suggestion conversion rules** below.                                                                                                                                                                                                                                                                                                                                             |

## Suggestion conversion rules

A `**Suggestion:**` section in the review file may contain one or more ` ```diff ``` ` blocks. Apply these rules to decide how to handle it:

**Convert to `suggestion`** (simple case) -- when the suggestion contains **exactly one** diff block **and** all changed lines (`+`/`-` lines) form a **contiguous group** (no unchanged context lines between separate groups of changes):

1. Remove lines starting with `-` (deletions).
2. For lines starting with `+`, remove the leading `+` prefix. If a single space follows the `+`, remove that space as well (it is the diff marker separator, not part of the code). If no space follows the `+` (e.g., an empty added line), remove only the `+`.
3. The result is the raw replacement code -- store it in `suggestion`.

Example:

Review file:

```diff
- const result = unsafeOperation(input);
+ const result = safeOperation(sanitize(input));
```

Extracted `suggestion` (raw replacement code):

```
const result = safeOperation(sanitize(input));
```

**Keep as markdown diff** (complex case) -- when **any** of these conditions is true:

- The suggestion contains **multiple** ` ```diff ``` ` blocks
- The diff block contains **non-contiguous changes** (changed lines separated by unchanged context lines, indicating edits at distant locations within the file)

In this case:

1. Do **not** set the `suggestion` field.
2. Append the original ` ```diff ``` ` block(s) verbatim to the `explanation` text (separated by a blank line).
3. The comment will be posted as a pure observation (without a GitHub suggestion "Apply" button).

Example -- multiple diff blocks (keep as diff):

Review file:

````
```diff
- import { foo } from './utils';
+ import { foo, bar } from './utils';
```

```diff
- foo(data);
+ bar(foo(data));
```
````

Result: `suggestion` is **not set**. The two diff blocks are appended to `explanation` as-is.

Example -- non-contiguous changes within a single diff block (keep as diff):

Review file:

```diff
  function process(input) {
-   const raw = input;
+   const raw = sanitize(input);
    // ... many unchanged lines ...
    const config = loadConfig();
-   return execute(raw, config);
+   return executeSafely(raw, config);
  }
```

Result: `suggestion` is **not set**. The diff block is appended to `explanation` as-is.
