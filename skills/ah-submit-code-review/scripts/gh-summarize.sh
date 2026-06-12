#!/usr/bin/env bash
#
# gh-summarize.sh -- token-bounded wrapper around `gh api --paginate --jq`.
#
# A raw `gh api ... --paginate` on a busy PR can return hundreds of items with
# long bodies, all of which land in the caller's context. This wrapper enforces
# three caps so the output stays small:
#   1. a per-item jq projection (required -- never dump full objects),
#   2. truncation of long string fields to MAX_FIELD chars,
#   3. a hard cap of MAX_ITEMS emitted rows (the true total is printed to stderr).
#
# Usage:
#   gh-summarize.sh <api_path> <jq_item_filter> [max_items] [max_field_chars]
#
# Example (existing ah-submit-code-review call):
#   gh-summarize.sh \
#     "repos/$OWNER/$REPO/pulls/$PR/comments" \
#     '{id, path, line, body, user: .user.login}' \
#     100 400
#
# <jq_item_filter> is applied per element (the script wraps it as `.[] | <filter>`).
# Stdout is one compact JSON object per line; stderr carries the total/emitted counts.
set -euo pipefail

API_PATH="${1:?usage: gh-summarize.sh <api_path> <jq_item_filter> [max_items] [max_field_chars]}"
ITEM_FILTER="${2:?missing jq item filter (e.g. '{id, body}')}"
MAX_ITEMS="${3:-100}"
MAX_FIELD="${4:-400}"

# Truncate any string field longer than MAX_FIELD so a single huge body can't
# blow up the output. walk() applies to every nested string value.
TRUNCATE="walk(if type == \"string\" and (length > ${MAX_FIELD}) then .[0:${MAX_FIELD}] + \"...[truncated]\" else . end)"

# Fetch all pages, project each item, truncate long fields, emit one compact
# JSON object per line (gh's --jq prints each result compact on its own line).
mapfile -t ROWS < <(gh api "${API_PATH}" --paginate --jq ".[] | (${ITEM_FILTER}) | ${TRUNCATE}")

TOTAL="${#ROWS[@]}"
EMITTED="${TOTAL}"
if (( TOTAL > MAX_ITEMS )); then
  EMITTED="${MAX_ITEMS}"
fi

printf '%s\n' "${ROWS[@]:0:${EMITTED}}"

if (( TOTAL > EMITTED )); then
  echo "gh-summarize: emitted ${EMITTED} of ${TOTAL} items (capped; raise max_items for more)" >&2
else
  echo "gh-summarize: ${TOTAL} items" >&2
fi
