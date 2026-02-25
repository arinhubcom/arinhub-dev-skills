# Thread Comment Template

Each inline thread comment posted on a specific line or line range in the PR diff.

## Rules

- Keep each thread comment concise and actionable
- Explain the "why" not just the "what"
- Prefer suggested changes over plain comments whenever a concrete fix can be proposed
- The explanation text goes **before** the suggestion block in the `body`
- Each comment `line` must fall within a diff hunk for the given `path`
- `side` must be `"RIGHT"` (the new version of the file) for comments with suggestions
- Do not use emojis anywhere except the severity prefix at the start of the comment body

## Severity Emojis

Use the following emojis to indicate the severity of the issue:

- **High Priority**: 🚨
- **Medium Priority**: ✨
- **Low Priority**: 📝

## Format

### With suggestion

Use a suggestion block whenever you can propose a concrete fix. GitHub renders it as a diff with an "Apply" button the author can click to commit the change directly.

The suggestion content is the **exact code** that will replace the selected line(s) from `start_line` (or `line`) through `line` -- preserve indentation and formatting precisely.

````md
<emoji> [<Severity>] <title>

<explanation-why>

```suggestion
<replacement-code>
```
````

**Special cases:**

- **Delete lines** -- use an empty suggestion block:

  ````md
  ```suggestion

  ```
  ````

- **Multi-line replacement** -- the suggestion replaces the entire range defined by `start_line` … `line`; both must fall within the same diff hunk

### Without suggestion (pure observation)

```md
<emoji> [<Severity>] <title>

<explanation-why>
```

## Examples

### High Priority -- with suggestion

````md
🚨 [High Priority] Unvalidated user input passed to SQL query

The `userId` parameter is interpolated directly into the query string, which is vulnerable to SQL injection. Use a parameterized query instead.

```suggestion
const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
```
````

### Medium Priority -- with suggestion

````md
✨ [Medium Priority] Simplify conditional with optional chaining

The nested null checks can be replaced with optional chaining for better readability.

```suggestion
const name = user?.profile?.displayName ?? 'Anonymous';
```
````

### Low Priority -- without suggestion

```md
📝 [Low Priority] Consider extracting magic number to a named constant

The timeout value `3000` appears in multiple places. A named constant like `DEFAULT_TIMEOUT_MS` would make the intent clearer and centralize future changes.
```
