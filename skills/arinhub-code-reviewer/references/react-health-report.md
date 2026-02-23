# React Health Report

If `HAS_REACT=true`, append the full output from the `react-doctor` subagent (Subagent D) to the review file under a dedicated section.

This section captures React-specific diagnostics (performance, hooks, component patterns, security) separately from the general deduplicated issues above.

## Format

```markdown
## React Health

<full react-doctor report>
```
