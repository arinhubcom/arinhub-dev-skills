# Thread Comment Template

Each inline thread comment posted on a specific line or line range in the PR diff.

## Rules

- Keep each thread comment concise and actionable
- Explain the "why" not just the "what"
- Prefer suggested changes over plain comments whenever a concrete fix can be proposed
- The explanation text goes **before** the suggestion block in the `body`
- Each comment `line` must fall within a diff hunk for the given `path`
- `side` must be `"RIGHT"` (the new version of the file) for comments with suggestions
- Do not use emojis anywhere in the comment body

## Assembling the body

For each issue, build the `body` field by combining the `severity`, `title`, `explanation`, and optional `suggestion` from Step 4 of the main procedure. The ` ```suggestion ``` ` fences are added here — the `suggestion` field contains only raw replacement code, never fences.

## Format

### With suggestion

Use a suggestion block whenever you can propose a concrete fix. GitHub renders it as a diff with an "Apply" button the author can click to commit the change directly.

The suggestion content is the **exact code** that will replace the selected line(s) from `start_line` (or `line`) through `line` -- preserve indentation and formatting precisely.

````md
<title>

<explanation>

```suggestion
<suggestion>
```
````

**Special cases:**

- **Delete lines** -- use an empty suggestion block (no content between the fences):

  ````
  ```suggestion
  ```
  ````

- **Multi-line replacement** -- the suggestion replaces the entire range defined by `start_line` … `line`; both must fall within the same diff hunk

### With diff block (complex suggestion)

Use a markdown diff block when the suggested change contains multiple diff blocks or non-contiguous edits that cannot be expressed as a single GitHub suggestion. The diff block is appended to the explanation text. The comment will not have an "Apply" button.

````md
<title>

<explanation>

```diff
<original diff block from review file, verbatim>
```
````

### Without suggestion (pure observation)

```md
<title>

<explanation>
```

## Examples

### High Priority -- with suggestion

````md
Unvalidated user input passed to SQL query

The `userId` parameter is interpolated directly into the query string, which is vulnerable to SQL injection. Use a parameterized query instead.

```suggestion
const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
```
````

### Medium Priority -- with suggestion

````md
Simplify conditional with optional chaining

The nested null checks can be replaced with optional chaining for better readability.

```suggestion
const name = user?.profile?.displayName ?? 'Anonymous';
```
````

### Medium Priority -- with diff block (multiple changes)

````md
Missing import and usage update

The `bar` utility is used below but never imported, and the call site should chain through it for proper validation.

```diff
- import { foo } from './utils';
+ import { foo, bar } from './utils';
```

```diff
- foo(data);
+ bar(foo(data));
```
````

### Low Priority -- without suggestion

```md
Consider extracting magic number to a named constant

The timeout value `3000` appears in multiple places. A named constant like `DEFAULT_TIMEOUT_MS` would make the intent clearer and centralize future changes.
```
