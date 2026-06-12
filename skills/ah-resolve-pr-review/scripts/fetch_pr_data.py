#!/usr/bin/env python3
"""
Fetch all PR data needed by the ah-resolve-pr-review skill.

Collects PR metadata, diff, review threads (with resolution status),
reviews, conversation comments, and linked issues.

Automatically detects the PR number from the current git branch,
so no input arguments are required.

Optimization
------------
Data collection is collapsed into a single combined GraphQL query plus a
parallel `gh pr diff` call, instead of 8-10 sequential `gh` invocations:

  1. gh pr view --json number,url   -> resolve owner/repo/number
  2. gh api graphql (combined)      -> metadata, files, reviewThreads,
                                       reviews, comments, and linked issues
                                       with full detail inlined
  3. gh pr diff <n>                 -> unified diff (not exposed via GraphQL)

Steps 2 and 3 run concurrently. Pagination fires only on the connections
whose `hasNextPage` is true, so typical PRs cost exactly two `gh` calls
after ref resolution. The combined GraphQL query also draws from a single
5000-points/hour budget instead of mixing the separate REST rate-limit pool.

The output JSON shape is identical to the previous implementation.

Token optimization
------------------
The full JSON bundle (including the unbounded `diff` and every thread's
`diffHunk`) is written to a file rather than printed to stdout, so it does
not flood the caller's context. Only a compact, bounded summary is printed
to stdout: PR metadata, counts, and an index of unresolved threads
(`path:line` + a truncated first-comment preview). The caller reads the
full file selectively (e.g. `jq`) only for the threads it actually fixes.
The file's JSON shape is unchanged from before.

Requires:
  - `gh auth login` already set up
  - current branch has an associated (open) PR

Usage:
  python fetch_pr_data.py [output_path]   # default: pr_data.json
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from typing import Any, cast


# ---------------------------------------------------------------------------
# Combined GraphQL query
# ---------------------------------------------------------------------------
# Three independent cursors let each connection paginate on its own. The first
# page asks for `first: 100` everywhere; only connections whose
# pageInfo.hasNextPage is true are refetched (see fetch_combined).
COMBINED_QUERY = """\
query(
  $owner: String!,
  $repo: String!,
  $number: Int!,
  $threadsCursor: String,
  $reviewsCursor: String,
  $commentsCursor: String
) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number
      title
      body
      url
      state
      baseRefName
      headRefName
      author { login }
      files(first: 100) {
        nodes { path additions deletions }
      }
      reviewThreads(first: 100, after: $threadsCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          subjectType
          path
          line
          startLine
          diffSide
          startDiffSide
          originalLine
          originalStartLine
          resolvedBy { login }
          comments(first: 100) {
            nodes {
              id
              databaseId
              body
              diffHunk
              createdAt
              updatedAt
              author { login }
              path
              originalPosition
            }
          }
        }
      }
      reviews(first: 100, after: $reviewsCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          body
          state
          author { login }
          submittedAt
        }
      }
      comments(first: 100, after: $commentsCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          body
          author { login }
          createdAt
        }
      }
      closingIssuesReferences(first: 10) {
        nodes {
          number
          title
          body
          url
          labels(first: 20) { nodes { name } }
          comments(first: 50) {
            nodes {
              body
              author { login }
              createdAt
            }
          }
        }
      }
    }
  }
}
"""


# ---------------------------------------------------------------------------
# Shell helpers
# ---------------------------------------------------------------------------
def _run(cmd: list[str], stdin: str | None = None) -> str:
    p = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{p.stderr}")
    return p.stdout


def _run_json(cmd: list[str], stdin: str | None = None) -> Any:
    out = _run(cmd, stdin=stdin)
    try:
        return json.loads(out)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"Failed to parse JSON from command output: {e}\nRaw:\n{out}"
        ) from e


# ---------------------------------------------------------------------------
# PR detection from current branch
# ---------------------------------------------------------------------------
def get_current_pr_ref() -> tuple[str, str, int]:
    """
    Resolve the PR for the current branch via `gh pr view`.
    Returns (owner, repo, pr_number).

    Uses the PR URL to extract owner/repo, which always points to the
    repository where the PR lives (correct even for fork-based PRs).
    """
    pr = _run_json(["gh", "pr", "view", "--json", "number,url"])
    url = pr["url"]  # e.g. https://github.com/octocat/Spoon-Knife/pull/123
    parts = url.rstrip("/").split("/")
    return parts[-4], parts[-3], int(pr["number"])


# ---------------------------------------------------------------------------
# Combined GraphQL fetch with selective pagination
# ---------------------------------------------------------------------------
def _gh_graphql(query: str, variables: dict[str, Any]) -> dict[str, Any]:
    cmd = ["gh", "api", "graphql", "-F", "query=@-"]
    for key, val in variables.items():
        if val is None:
            continue
        # `-F` lets gh infer the type (Int for number, String for cursors),
        # which is what the GraphQL variables expect.
        cmd += ["-F", f"{key}={val}"]
    payload = _run_json(cmd, stdin=query)
    if payload.get("errors"):
        raise RuntimeError(
            "GitHub GraphQL errors:\n" + json.dumps(payload["errors"], indent=2)
        )
    return payload["data"]["repository"]["pullRequest"]


def _next_cursor(connection: dict[str, Any]) -> str | None:
    info = connection["pageInfo"]
    return info["endCursor"] if info["hasNextPage"] else None


def fetch_combined(owner: str, repo: str, number: int) -> dict[str, Any]:
    """Run the combined query, then paginate only the connections that need it."""
    base_vars: dict[str, Any] = {"owner": owner, "repo": repo, "number": number}

    pr = _gh_graphql(COMBINED_QUERY, base_vars)

    threads = list(pr["reviewThreads"]["nodes"])
    reviews = list(pr["reviews"]["nodes"])
    comments = list(pr["comments"]["nodes"])

    # None means "stop paginating this connection".
    t_cursor = _next_cursor(pr["reviewThreads"])
    r_cursor = _next_cursor(pr["reviews"])
    c_cursor = _next_cursor(pr["comments"])

    # Loop only while at least one connection still has pages. In practice this
    # body almost never runs for typical PRs.
    while t_cursor or r_cursor or c_cursor:
        page = _gh_graphql(
            COMBINED_QUERY,
            {
                **base_vars,
                "threadsCursor": t_cursor,
                "reviewsCursor": r_cursor,
                "commentsCursor": c_cursor,
            },
        )
        if t_cursor:
            threads.extend(page["reviewThreads"]["nodes"])
            t_cursor = _next_cursor(page["reviewThreads"])
        if r_cursor:
            reviews.extend(page["reviews"]["nodes"])
            r_cursor = _next_cursor(page["reviews"])
        if c_cursor:
            comments.extend(page["comments"]["nodes"])
            c_cursor = _next_cursor(page["comments"])

    # Inject merged collections back so callers see fully-paginated data.
    pr["reviewThreads"]["nodes"] = threads
    pr["reviews"]["nodes"] = reviews
    pr["comments"]["nodes"] = comments
    return pr


# ---------------------------------------------------------------------------
# PR diff (REST -- GraphQL doesn't expose a unified diff)
# ---------------------------------------------------------------------------
def fetch_pr_diff(pr_number: int) -> str:
    return _run(["gh", "pr", "diff", str(pr_number)])


# ---------------------------------------------------------------------------
# Linked issue details (REST) -- used by the body-parsing fallback only
# ---------------------------------------------------------------------------
def fetch_issue_details(
    owner: str, repo: str, issue_number: int
) -> dict[str, Any]:
    return _run_json(
        [
            "gh", "issue", "view", str(issue_number),
            "--json", "number,title,body,labels,comments",
        ]
    )


# ---------------------------------------------------------------------------
# Body-parsing fallback for linked issues (regex only -- no API)
# ---------------------------------------------------------------------------
_CLOSING_KEYWORD = r"(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)"
_CLOSING_HASH = re.compile(rf"\b{_CLOSING_KEYWORD}\s+#(\d+)", re.IGNORECASE)
_CLOSING_URL = re.compile(
    rf"\b{_CLOSING_KEYWORD}\s+https?://github\.com/[^/]+/[^/]+/issues/(\d+)",
    re.IGNORECASE,
)


def extract_closing_issue_numbers(body: str) -> list[int]:
    """Extract unique issue numbers referenced by closing keywords in the body."""
    seen: set[int] = set()
    out: list[int] = []
    for m in _CLOSING_HASH.findall(body) + _CLOSING_URL.findall(body):
        n = int(m)
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


# ---------------------------------------------------------------------------
# Output normalization (keeps the original JSON shape)
# ---------------------------------------------------------------------------
def _login(node: Any) -> str:
    if isinstance(node, dict):
        d = cast(dict[str, Any], node)
        return str(d.get("login", ""))
    return ""


def normalize_review(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": r.get("id"),
        "body": r.get("body", ""),
        "state": r.get("state", ""),
        "user": _login(r.get("author")),
        "submitted_at": r.get("submittedAt", ""),
    }


def normalize_comment(c: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": c.get("id"),
        "body": c.get("body", ""),
        "user": _login(c.get("author")),
        "created_at": c.get("createdAt", ""),
    }


def normalize_linked_issue(i: dict[str, Any]) -> dict[str, Any]:
    # Match the shape `gh issue view --json number,title,body,labels,comments`
    # produced, so downstream consumers keep working.
    return {
        "number": i.get("number"),
        "title": i.get("title", ""),
        "body": i.get("body", ""),
        "url": i.get("url", ""),
        "labels": [
            {"name": n.get("name", "")}
            for n in (i.get("labels") or {}).get("nodes", [])
        ],
        "comments": [
            {
                "body": c.get("body", ""),
                "author": {"login": _login(c.get("author"))},
                "createdAt": c.get("createdAt", ""),
            }
            for c in (i.get("comments") or {}).get("nodes", [])
        ],
    }


def collect_linked_issues(
    owner: str, repo: str, pr_number: int, pr_body: str, graphql_nodes: list[Any]
) -> list[dict[str, Any]]:
    """
    Prefer GitHub's canonical closingIssuesReferences (already inlined in the
    combined query). Fall back to closing keywords in the PR body only when
    GraphQL returns nothing, fetching full details for those few issues so the
    linked_issues contract stays full-detail.
    """
    if graphql_nodes:
        return [normalize_linked_issue(i) for i in graphql_nodes]

    if not pr_body:
        return []

    issues: list[dict[str, Any]] = []
    for num in extract_closing_issue_numbers(pr_body):
        if num == pr_number:
            continue
        try:
            issues.append(fetch_issue_details(owner, repo, num))
        except RuntimeError:
            issues.append({"number": num, "error": "Could not fetch issue details"})
    return issues


# ---------------------------------------------------------------------------
# Compact stdout summary (keeps the heavy bundle out of the caller's context)
# ---------------------------------------------------------------------------
_PREVIEW_CHARS = 200


def _first_comment_preview(thread: dict[str, Any]) -> str:
    """First comment body of a thread, collapsed to one truncated line."""
    nodes = (thread.get("comments") or {}).get("nodes") or []
    if not nodes:
        return ""
    body = " ".join((nodes[0].get("body") or "").split())
    return body[:_PREVIEW_CHARS] + ("..." if len(body) > _PREVIEW_CHARS else "")


def build_summary(result: dict[str, Any], output_path: str) -> str:
    """Render a bounded, human/LLM-readable summary of the full bundle."""
    pr = result["pull_request"]
    rt = result["review_threads"]
    lines: list[str] = [
        f"PR #{pr['number']} [{pr['state']}] {pr['title']}",
        f"  {pr['url']}",
        f"  {pr['base_branch']} <- {pr['head_branch']}",
        (
            f"  files={len(pr['files'])} "
            f"threads={rt['total']} (unresolved={rt['unresolved_count']}, "
            f"resolved={rt['resolved_count']}) "
            f"reviews={len(result['reviews'])} "
            f"comments={len(result['conversation_comments'])} "
            f"linked_issues={len(result['linked_issues'])}"
        ),
        f"  full JSON written to: {output_path}",
    ]
    if rt["unresolved"]:
        lines.append("")
        lines.append("Unresolved threads:")
        for t in rt["unresolved"]:
            loc = t.get("path") or "(file)"
            if t.get("line") is not None:
                loc += f":{t['line']}"
            flags = " [outdated]" if t.get("isOutdated") else ""
            lines.append(f"  - {loc}{flags} :: {_first_comment_preview(t)}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    output_path = sys.argv[1] if len(sys.argv) > 1 else "pr_data.json"
    owner, repo, pr_number = get_current_pr_ref()
    print(f"Fetching data for {owner}/{repo}#{pr_number} ...", file=sys.stderr)

    # Fan out: the GraphQL bundle and the unified diff are independent, so run
    # them concurrently to halve wall-clock time on typical PRs.
    with ThreadPoolExecutor(max_workers=2) as pool:
        pr_future = pool.submit(fetch_combined, owner, repo, pr_number)
        diff_future = pool.submit(fetch_pr_diff, pr_number)
        pr = pr_future.result()
        diff = diff_future.result()

    threads = pr["reviewThreads"]["nodes"]
    reviews = pr["reviews"]["nodes"]
    comments = pr["comments"]["nodes"]
    linked_nodes = (pr.get("closingIssuesReferences") or {}).get("nodes") or []

    linked_issues = collect_linked_issues(
        owner, repo, pr_number, pr.get("body") or "", linked_nodes
    )

    # The combined query returns each thread's comments as {nodes: [...]}, the
    # shape downstream code reads. Guard against a bare-list shape just in case.
    for t in threads:
        if isinstance(t.get("comments"), list):
            t["comments"] = {"nodes": t["comments"]}

    unresolved_threads = [t for t in threads if not t.get("isResolved")]
    resolved_threads = [t for t in threads if t.get("isResolved")]

    result: dict[str, Any] = {
        "pull_request": {
            "number": pr["number"],
            "title": pr["title"],
            "body": pr.get("body", ""),
            "url": pr["url"],
            "state": pr["state"],
            "base_branch": pr["baseRefName"],
            "head_branch": pr["headRefName"],
            "files": [
                {
                    "path": f.get("path", ""),
                    "additions": f.get("additions", 0),
                    "deletions": f.get("deletions", 0),
                }
                for f in (pr.get("files") or {}).get("nodes", [])
            ],
            "owner": owner,
            "repo": repo,
        },
        "diff": diff,
        "review_threads": {
            "total": len(threads),
            "unresolved_count": len(unresolved_threads),
            "resolved_count": len(resolved_threads),
            "unresolved": unresolved_threads,
            "resolved": resolved_threads,
        },
        "reviews": [normalize_review(r) for r in reviews],
        "conversation_comments": [normalize_comment(c) for c in comments],
        "linked_issues": linked_issues,
    }

    # Write the full, unchanged bundle to a file (compact: no indent), and
    # print only a bounded summary to stdout so the caller's context stays small.
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, separators=(",", ":"))

    print(build_summary(result, output_path))


if __name__ == "__main__":
    main()
