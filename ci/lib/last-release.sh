#!/usr/bin/env bash
#
# The last release of THIS line, for the checks that compare a release against the one before it.
#
# With one release line, "the newest v* tag in the repo" was the last release. With several, the
# newest tag can belong to another line: a 6.2-line release judged against a 6.3-line tag would
# see the wrong migrations and the wrong version. So the last release is the newest v* tag
# reachable from the branch being released into (the PR's base): `main` for the newest line, or
# `lts/X.Y` for a line that releases from its own branch. A newer line's tags are never reachable
# from an older line's branch. Outside a PR (no GITHUB_BASE_REF) the branch is HEAD.
#
# Source it; it defines one function and runs nothing.

last_release_tag() {
  local ref=HEAD
  if [ -n "${GITHUB_BASE_REF:-}" ]; then
    git fetch --no-tags --quiet origin "$GITHUB_BASE_REF" 2>/dev/null || true
    if git rev-parse --quiet --verify "origin/$GITHUB_BASE_REF" >/dev/null; then
      ref="origin/$GITHUB_BASE_REF"
    fi
  fi
  git tag --merged "$ref" --list 'v*' --sort=-v:refname | head -1
}
