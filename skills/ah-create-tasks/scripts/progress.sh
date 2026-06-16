#!/usr/bin/env bash
# Append-only progress log helper for the ah-* skill pipeline.
#
# Replaces the old LLM-maintained markdown logbooks: instead of the model
# reading a template and re-writing markdown sections after every step, each
# step appends a single pipe-delimited line via these shell functions. This
# keeps progress tracking deterministic and out of the token budget.
#
# Source it with an absolute path resolved from the calling SKILL.md's dir, e.g.
#   source "<skill_dir>/scripts/progress.sh"
#
# Progress files live under ~/.agents/arinhub/progresses/ and use the same
# names as before (progress-<skill>-<repo>-<key>.md).
#
# Line format:
#   # <skill> progress
#   meta|<key>|<value>
#   step|<n>|<name>|<status>|<commit-or-attempts>|<duration>|<artifacts>
#   done|status|<status>
#
# status values: done | skipped(user) | skipped(none) | skipped(update) | failed

# Resolve the progress directory using $HOME (never a quoted "~", which does not
# expand) and ensure it exists.
_progress_dir() {
  local dir="${HOME}/.agents/arinhub/progresses"
  mkdir -p "${dir}"
  printf '%s' "${dir}"
}

_progress_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

# progress_path <skill> <repo> <key>
# Builds the standard progress-file path (progress-<skill>-<repo>-<key>.md),
# sanitizing <key> (typically a branch name) by turning '/' into '-'. Single
# source of truth so callers never re-derive the path inline.
progress_path() {
  local skill="$1" repo="$2" key="$3"
  local safe
  safe=$(printf '%s' "${key}" | tr '/' '-')
  printf '%s/progress-%s-%s-%s.md' "$(_progress_dir)" "${skill}" "${repo}" "${safe}"
}

# progress_init <file> <branch> <base> <issue>
# Writes the header + meta lines only when <file> does not yet exist, so a
# re-run leaves an existing log untouched (enables grep-based resume).
progress_init() {
  local file="$1" branch="$2" base="$3" issue="$4"
  _progress_dir >/dev/null
  if [ -f "${file}" ]; then
    return 0
  fi
  {
    printf '# progress\n'
    printf 'meta|branch|%s\n' "${branch}"
    printf 'meta|base|%s\n' "${base}"
    printf 'meta|issue|%s\n' "${issue}"
    printf 'meta|started|%s\n' "$(_progress_now)"
  } >"${file}"
}

# progress_log <file> <n> <name> <status> [commit-or-attempts] [artifacts]
# Appends one step line. The helper stamps the line's timestamp from `date`;
# the caller never supplies timestamps or durations.
progress_log() {
  local file="$1" n="$2" name="$3" st="$4" extra="${5:-}" artifacts="${6:-}"
  printf 'step|%s|%s|%s|%s|%s|%s\n' \
    "${n}" "${name}" "${st}" "${extra}" "$(_progress_now)" "${artifacts}" \
    >>"${file}"
}

# progress_done <file> <status>
progress_done() {
  local file="$1" st="$2"
  {
    printf 'done|status|%s\n' "${st}"
    printf 'done|ended|%s\n' "$(_progress_now)"
  } >>"${file}"
}

# progress_render <file>
# Prints a compact human-readable summary to stdout. Load-bearing for
# ah-workflow: the /goal evaluator only sees the conversation, so the skill
# echoes this output after each phase instead of re-reading markdown sections.
progress_render() {
  local file="$1"
  [ -f "${file}" ] || { printf '(no progress file)\n'; return 0; }
  awk -F'|' '
    /^meta\|/ { meta[$2] = $3 }
    /^step\|/ { printf "  %s. %-22s %-16s %s %s\n", $2, $3, $4, $5, $7 }
    /^done\|status\|/ { done_status = $3 }
    END {
      printf "branch=%s base=%s issue=%s\n", meta["branch"], meta["base"], meta["issue"]
      if (done_status != "") printf "overall: %s\n", done_status
    }
  ' "${file}"
}
