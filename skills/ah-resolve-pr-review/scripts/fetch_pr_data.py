#!/usr/bin/env python3
"""
Fetch all PR data needed by the ah-resolve-pr-review skill.

Collects PR metadata, diff, review threads (with resolution status),
reviews, conversation comments, and linked issues -- all via `gh` CLI.

Automatically detects the PR number from the current git branch,
so no input arguments are required.

Requires:
  - `gh auth login` already set up
  - current branch has an associated (open) PR

Usage:
  python fetch_pr_data.py > pr_data.json
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from typing import Any, cast


# ---------------------------------------------------------------------------
# GraphQL: review threads with resolution status (paginated)
# ---------------------------------------------------------------------------
REVIEW_THREADS_QUERY = """\
query(
  $owner: String!,
  $repo: String!,
  $number: Int!,
  $cursor: String
) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
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
    }
  }
}
"""

# ---------------------------------------------------------------------------
# GraphQL: linked (closing) issues
# ---------------------------------------------------------------------------
LINKED_ISSUES_QUERY = """\
query(
  $owner: String!,
  $repo: String!,
  $number: Int!
) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      closingIssuesReferences(first: 10) {
        nodes {
          number
          title
          url
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


def _run_optional(cmd: list[str], stdin: str | None = None) -> str | None:
    """Run a command, returning None on failure instead of raising."""
    p = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
    if p.returncode != 0:
        return None
    return p.stdout


# ---------------------------------------------------------------------------
# Authentication check
# ---------------------------------------------------------------------------
def ensure_gh_authenticated() -> None:
    try:
        _run(["gh", "auth", "status"])
    except RuntimeError:
        print(
            "run `gh auth login` to authenticate the GitHub CLI",
            file=sys.stderr,
        )
        raise RuntimeError(
            "gh auth status failed; run `gh auth login` to authenticate the GitHub CLI"
        ) from None


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
    owner = parts[-4]
    repo = parts[-3]
    number = int(pr["number"])
    return owner, repo, number


# ---------------------------------------------------------------------------
# PR metadata (REST)
# ---------------------------------------------------------------------------
def fetch_pr_metadata(pr_number: int) -> dict[str, Any]:
    return _run_json(
        [
            "gh", "pr", "view", str(pr_number),
            "--json",
            "number,title,body,baseRefName,headRefName,files,url,state",
        ]
    )


# ---------------------------------------------------------------------------
# PR diff (REST)
# ---------------------------------------------------------------------------
def fetch_pr_diff(pr_number: int) -> str:
    return _run(["gh", "pr", "diff", str(pr_number)])


# ---------------------------------------------------------------------------
# Review threads via GraphQL (paginated)
# ---------------------------------------------------------------------------
def _gh_graphql(
    query: str,
    owner: str,
    repo: str,
    number: int,
    extra_vars: dict[str, str] | None = None,
) -> dict[str, Any]:
    cmd = [
        "gh", "api", "graphql",
        "-F", "query=@-",
        "-F", f"owner={owner}",
        "-F", f"repo={repo}",
        "-F", f"number={number}",
    ]
    for key, val in (extra_vars or {}).items():
        cmd += ["-F", f"{key}={val}"]
    return _run_json(cmd, stdin=query)


def fetch_review_threads(
    owner: str, repo: str, number: int
) -> list[dict[str, Any]]:
    threads: list[dict[str, Any]] = []
    cursor: str | None = None

    while True:
        extra: dict[str, str] = {}
        if cursor:
            extra["cursor"] = cursor

        payload = _gh_graphql(
            REVIEW_THREADS_QUERY, owner, repo, number, extra_vars=extra
        )

        if payload.get("errors"):
            raise RuntimeError(
                f"GitHub GraphQL errors:\n{json.dumps(payload['errors'], indent=2)}"
            )

        rt = payload["data"]["repository"]["pullRequest"]["reviewThreads"]
        threads.extend(rt.get("nodes") or [])

        if rt["pageInfo"]["hasNextPage"]:
            cursor = rt["pageInfo"]["endCursor"]
        else:
            break

    return threads


# ---------------------------------------------------------------------------
# Reviews (REST, paginated)
# ---------------------------------------------------------------------------
def fetch_reviews(owner: str, repo: str, number: int) -> list[dict[str, Any]]:
    out = _run(
        [
            "gh", "api",
            f"repos/{owner}/{repo}/pulls/{number}/reviews",
            "--paginate",
        ]
    )
    return json.loads(out) if out.strip() else []


# ---------------------------------------------------------------------------
# Issue comments / conversation comments (REST, paginated)
# ---------------------------------------------------------------------------
def fetch_conversation_comments(
    owner: str, repo: str, number: int
) -> list[dict[str, Any]]:
    out = _run(
        [
            "gh", "api",
            f"repos/{owner}/{repo}/issues/{number}/comments",
            "--paginate",
        ]
    )
    return json.loads(out) if out.strip() else []


# ---------------------------------------------------------------------------
# Linked issues via GraphQL
# ---------------------------------------------------------------------------
def fetch_linked_issues(
    owner: str, repo: str, number: int
) -> list[dict[str, Any]]:
    payload = _gh_graphql(LINKED_ISSUES_QUERY, owner, repo, number)

    if payload.get("errors"):
        raise RuntimeError(
            f"GitHub GraphQL errors:\n{json.dumps(payload['errors'], indent=2)}"
        )

    return (
        payload["data"]["repository"]["pullRequest"]
        ["closingIssuesReferences"]["nodes"]
    )


# ---------------------------------------------------------------------------
# Linked issue details (REST)
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
# Fallback: extract issue refs from PR body
# ---------------------------------------------------------------------------
_CLOSING_KEYWORD = r"(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)"

# Matches: fixes #123
_CLOSING_HASH_PATTERN = re.compile(
    rf"\b{_CLOSING_KEYWORD}\s+#(\d+)",
    re.IGNORECASE,
)

# Matches: fixes https://github.com/owner/repo/issues/123
_CLOSING_URL_PATTERN = re.compile(
    rf"\b{_CLOSING_KEYWORD}\s+https?://github\.com/[^/]+/[^/]+/issues/(\d+)",
    re.IGNORECASE,
)

_ISSUE_REF_PATTERN = re.compile(r"#(\d+)")


def extract_issue_numbers_from_body(body: str) -> list[int]:
    """Extract issue numbers from closing keywords in the PR body."""
    hash_matches = _CLOSING_HASH_PATTERN.findall(body)
    url_matches = _CLOSING_URL_PATTERN.findall(body)
    seen: set[int] = set()
    result: list[int] = []
    for m in (*hash_matches, *url_matches):
        n = int(m)
        if n not in seen:
            seen.add(n)
            result.append(n)
    return result


def extract_all_issue_refs_from_body(body: str) -> list[int]:
    """Extract all unique #N references from the PR body."""
    matches = _ISSUE_REF_PATTERN.findall(body)
    seen: set[int] = set()
    result: list[int] = []
    for m in matches:
        n = int(m)
        if n not in seen:
            seen.add(n)
            result.append(n)
    return result


def verify_is_issue(owner: str, repo: str, number: int) -> bool:
    """Check if a number refers to an issue (not a PR)."""
    out = _run_optional(
        ["gh", "api", f"repos/{owner}/{repo}/issues/{number}", "-q", ".pull_request"]
    )
    # If pull_request field is null/absent, it's a real issue
    return out is not None and out.strip() in ("", "null")


# ---------------------------------------------------------------------------
# Collect linked issue details with fallback
# ---------------------------------------------------------------------------
def collect_linked_issues(
    owner: str, repo: str, pr_number: int, pr_body: str
) -> list[dict[str, Any]]:
    """
    Try GraphQL closingIssuesReferences first; fall back to body-parsing.
    Returns full issue details for each linked issue found.
    """
    # Method A: GraphQL
    linked = fetch_linked_issues(owner, repo, pr_number)
    issue_numbers = [i["number"] for i in linked]

    # Method B: Closing keywords in PR body
    if not issue_numbers and pr_body:
        issue_numbers = extract_issue_numbers_from_body(pr_body)

    # Method C: Any #N reference in body, verified as issue
    if not issue_numbers and pr_body:
        candidates = extract_all_issue_refs_from_body(pr_body)
        # Exclude the PR's own number
        candidates = [n for n in candidates if n != pr_number]
        issue_numbers = [
            n for n in candidates
            if verify_is_issue(owner, repo, n)
        ]

    # Fetch full details for each linked issue
    issues: list[dict[str, Any]] = []
    seen: set[int] = set()
    for num in issue_numbers:
        if num in seen:
            continue
        seen.add(num)
        try:
            detail = fetch_issue_details(owner, repo, num)
            issues.append(detail)
        except RuntimeError:
            # Issue might be in a different repo or inaccessible
            issues.append({"number": num, "error": "Could not fetch issue details"})

    return issues


# ---------------------------------------------------------------------------
# Simplify review/comment payloads
# ---------------------------------------------------------------------------
def _get_login(user_field: Any) -> str:
    if isinstance(user_field, dict):
        user = cast(dict[str, Any], user_field)
        return str(user.get("login", ""))
    return ""


def simplify_review(review: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": review.get("id"),
        "body": review.get("body", ""),
        "state": review.get("state", ""),
        "user": _get_login(review.get("user")),
        "submitted_at": review.get("submitted_at") or review.get("submittedAt", ""),
    }


def simplify_comment(comment: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": comment.get("id"),
        "body": comment.get("body", ""),
        "user": _get_login(comment.get("user")),
        "created_at": comment.get("created_at") or comment.get("createdAt", ""),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    ensure_gh_authenticated()

    owner, repo, pr_number = get_current_pr_ref()
    print(f"Fetching data for {owner}/{repo}#{pr_number} ...", file=sys.stderr)

    # Fetch all data
    metadata = fetch_pr_metadata(pr_number)
    diff = fetch_pr_diff(pr_number)
    review_threads = fetch_review_threads(owner, repo, pr_number)
    reviews_raw = fetch_reviews(owner, repo, pr_number)
    comments_raw = fetch_conversation_comments(owner, repo, pr_number)
    linked_issues = collect_linked_issues(
        owner, repo, pr_number, metadata.get("body") or ""
    )

    # Separate unresolved vs resolved threads
    unresolved_threads = [t for t in review_threads if not t.get("isResolved")]
    resolved_threads = [t for t in review_threads if t.get("isResolved")]

    result: dict[str, Any] = {
        "pull_request": {
            "number": metadata["number"],
            "title": metadata["title"],
            "body": metadata.get("body", ""),
            "url": metadata["url"],
            "state": metadata["state"],
            "base_branch": metadata["baseRefName"],
            "head_branch": metadata["headRefName"],
            "files": metadata.get("files", []),
            "owner": owner,
            "repo": repo,
        },
        "diff": diff,
        "review_threads": {
            "total": len(review_threads),
            "unresolved_count": len(unresolved_threads),
            "resolved_count": len(resolved_threads),
            "unresolved": unresolved_threads,
            "resolved": resolved_threads,
        },
        "reviews": [simplify_review(r) for r in reviews_raw],
        "conversation_comments": [simplify_comment(c) for c in comments_raw],
        "linked_issues": linked_issues,
    }

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
