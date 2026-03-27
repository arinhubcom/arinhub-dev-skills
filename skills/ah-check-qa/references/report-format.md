# QA Report Format

Use this template when generating the final QA report.

```markdown
# QA Report: {repo-name}

**Date:** {YYYY-MM-DD HH:MM}
**URL:** {base-url}
**Routes tested:** {count} ({comma-separated list})
**Viewports:** Mobile (375x812), Tablet (768x1024), Desktop (1280x800)
**Tools used:** chrome-devtools-cli, playwright-cli

## Summary

| Category | Critical | Warning | Info |
|---|---|---|---|
| UI Visual | {n} | {n} | {n} |
| UX Interaction | {n} | {n} | {n} |
| E2E Smoke Tests | {pass}/{total} passed | | |

### Lighthouse Scores

| Metric | Score |
|---|---|
| Performance | {score}/100 |
| Accessibility | {score}/100 |
| Best Practices | {score}/100 |
| SEO | {score}/100 |

## UI Issues

### Critical

#### {issue-number}. {title}

- **Route:** {route-path}
- **Viewport:** {viewport-name}
- **Description:** {what is wrong}
- **Screenshot:** {path-to-screenshot}

### Warning

#### {issue-number}. {title}

- **Route:** {route-path}
- **Viewport:** {viewport-name or "all"}
- **Description:** {what is wrong}

### Info

- {brief description of informational finding}

## UX Issues

### Critical

#### {issue-number}. {title}

- **Route:** {route-path}
- **Element:** {element description}
- **Description:** {what is wrong}
- **Impact:** {how this affects user experience}

### Warning

#### {issue-number}. {title}

- **Route:** {route-path}
- **Element:** {element description}
- **Description:** {what is wrong}

### Info

- {brief description of informational finding}

## E2E Smoke Tests

### Passed

- [x] {flow-name}: {brief description of what was tested}

### Failed

- [ ] {flow-name}: {what failed and at which step}

## Console Errors

| Route | Error | Count |
|---|---|---|
| {route} | {error message, truncated} | {n} |

## Network Issues

| Route | URL | Status | Issue |
|---|---|---|---|
| {route} | {request-url, truncated} | {status-code} | {description} |

## Visual Comparison

> This section is included only in comparison mode (when baseline screenshots exist).

### Regressions

#### {issue-number}. {title}

- **Route:** {route-path}
- **Viewport:** {viewport-name}
- **Before:** {path-to-baseline-screenshot}
- **After:** {path-to-current-screenshot}
- **Description:** {what changed}
- **Classification:** Regression / Intentional / Ambiguous

### No Changes

- {route-path} at {viewport}: No visual differences detected

## Screenshots

All screenshots saved to: {screenshots-directory}

| Route | Mobile | Tablet | Desktop |
|---|---|---|---|
| {route} | {path} | {path} | {path} |
```

## Severity Definitions

- **Critical**: Broken functionality, inaccessible content, or visual defect that
  blocks normal usage. Must be fixed before release.
- **Warning**: Degraded experience, minor accessibility issue, or visual imperfection
  that does not block usage. Should be fixed soon.
- **Info**: Suggestion for improvement or minor observation. Low priority.

## Guidelines

- Include screenshot paths as evidence for visual issues.
- For interaction issues, describe what was expected vs what happened.
- Group issues by route when multiple routes are tested.
- The Console Errors and Network Issues sections can be omitted if there are none.
- The Visual Comparison section is only included when baseline screenshots exist.
- Keep error messages concise -- truncate to ~100 characters.
