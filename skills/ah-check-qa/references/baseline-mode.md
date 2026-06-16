# Baseline Mode

When the user passes `before`, capture baseline screenshots and exit early.
These will be used for comparison in a subsequent run. Wait for content to load
(Step 3) before capturing each screenshot.

```bash
BASELINE_DIR=${SCREENSHOTS_DIR}/baseline-$(date +%Y%m%d-%H%M%S)
mkdir -p "${BASELINE_DIR}"
```

For each route, at each viewport:
```bash
agent-browser open "${URL}"
agent-browser set viewport 375 812
agent-browser screenshot "${BASELINE_DIR}/mobile-${ROUTE_SLUG}.png"
agent-browser set viewport 768 1024
agent-browser screenshot "${BASELINE_DIR}/tablet-${ROUTE_SLUG}.png"
agent-browser set viewport 1280 800
agent-browser screenshot "${BASELINE_DIR}/desktop-${ROUTE_SLUG}.png"
```

Save the baseline directory path:
```bash
echo "${BASELINE_DIR}" > "${SCREENSHOTS_DIR}/latest-baseline.txt"
```

Report the baseline path to the user and exit. The full QA audit happens on the next run.
