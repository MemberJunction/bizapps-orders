#!/usr/bin/env bash
#
# Every workflow calls its helpers by path — `./ci/check-bump-level.sh`,
# `node .github/scripts/parse-migrations.mjs`. Nothing resolves those paths until the step
# runs, so a rename, a bad merge or a file missed during a port fails at RUN time with
# `exit 127` or MODULE_NOT_FOUND — both of which read as a broken build rather than a missing
# file, and for the release gate that means finding out on a release PR.
#
# This derives the list from the workflows rather than maintaining one, so a new script is
# covered the moment it is called, and the same file drops into any repo in the family with
# nothing to configure.
#
# Orphans — a script in the tree that no workflow calls — are reported as a warning, not a
# failure: a helper can legitimately be imported by another script rather than invoked.
set -euo pipefail

WF_DIR="${1:-.github/workflows}"
FAIL=0

# Path-shaped tokens: ci/… or .github/scripts/… ending in an executable extension. Trailing
# punctuation (quotes, backticks, commas) is stripped; `${{ }}` expressions never match because
# a brace is not in the character class.
REFS=$(grep -rhoE '(\./)?(\.github/scripts|ci)/[A-Za-z0-9_./-]+\.(sh|mjs|js)' "$WF_DIR" 2>/dev/null \
       | sed 's|^\./||' | sort -u || true)

if [ -z "$REFS" ]; then
  echo "::error::No script references found under $WF_DIR. Either the workflows moved or this check's pattern is wrong — it has never been correct for this to be empty."
  exit 1
fi

echo "Checking $(echo "$REFS" | wc -l | tr -d ' ') script reference(s) from $WF_DIR"
MISSING=""
while IFS= read -r ref; do
  if [ -e "$ref" ]; then
    echo "  ok       $ref"
  else
    echo "  MISSING  $ref"
    MISSING="${MISSING}${ref}"$'\n'
  fi
done <<< "$REFS"

if [ -n "$MISSING" ]; then
  echo "::error::A workflow calls a script that does not exist. At run time this surfaces as exit 127 or MODULE_NOT_FOUND, which looks like a broken build rather than a missing file. Missing:"
  printf '%s' "$MISSING" | sed 's/^/  /'
  FAIL=1
fi

# Orphans, advisory only.
ON_DISK=$(find ci .github/scripts -maxdepth 1 -type f \( -name '*.sh' -o -name '*.mjs' -o -name '*.js' \) 2>/dev/null | sed 's|^\./||' | sort -u || true)
ORPHANS=$(comm -23 <(printf '%s\n' "$ON_DISK") <(printf '%s\n' "$REFS") 2>/dev/null || true)
if [ -n "${ORPHANS:-}" ]; then
  echo "::warning::These scripts exist but no workflow calls them by path. That is fine if another script imports them — worth a look if not:"
  printf '%s\n' "$ORPHANS" | sed 's/^/  /'
fi

[ "$FAIL" -eq 0 ] && echo "All script references resolve"
exit "$FAIL"
