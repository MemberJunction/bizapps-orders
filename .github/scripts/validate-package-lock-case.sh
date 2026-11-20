#!/bin/bash
# Detects case-sensitivity mismatches between pnpm-lock.yaml and git
# macOS is case-insensitive; Linux CI (GitHub Actions) is case-sensitive

set -uo pipefail

LOCKFILE=pnpm-lock.yaml

echo "Validating $LOCKFILE for case-sensitivity issues..."

# A missing or unreadable lockfile is NOT "no issues found". Without this guard the extraction
# below came back empty, the loop ran zero times, and the script closed with "No case-sensitivity
# issues found" and exit 0 — a green check over a file it never opened. That is the same
# fail-open-quietly shape the sibling guards in this directory are written against, and it is
# reachable here for a mundane reason: this repo has no lockfile until the first `pnpm install`.
if [ ! -f "$LOCKFILE" ]; then
  echo "::error::'$LOCKFILE' not found (resolved from $(pwd)). This gate validated nothing; it has not passed. Run 'pnpm install' to generate it."
  exit 1
fi

MISMATCHES=()

# Extract workspace package paths from the lockfile (packages/ and apps/).
#
# pnpm records them as the keys of the top-level `importers:` map, one indent level in, so this
# reads that block without a YAML parser: everything between `importers:` and the next column-0
# key, keeping only 2-space-indented keys under packages/ or apps/. (The npm-era version read
# `.packages` with jq; the paths being compared are the same, only their home changed.)
PATHS=$(sed -n '/^importers:/,/^[a-zA-Z]/p' "$LOCKFILE" \
        | grep -E "^  (packages|apps)/[^:]+:" \
        | sed -E 's/^  //; s/:[[:space:]]*$//')

# Every workspace package.json git actually tracks, enumerated ONCE with no pathspec filtering.
#
# ⚠️ THIS LIST IS THE FIX. The inherited version of this script (bizapps-caliber, bizapps-tasks and
# BlueCypress/SaaS all still carry it) looked for the case-variant with
#     git ls-files "$path*/package.json" | grep -i "^$path/package.json$"
# and that can never match: a git PATHSPEC GLOB is case-sensitive regardless of core.ignorecase, so
# `packages/entities*` does not match `packages/Entities` and the glob returns EMPTY — the `grep -i`
# behind it is handed nothing to be insensitive about. The mismatch list therefore stayed empty for
# a genuinely mis-cased lockfile, on Linux CI as well as macOS, and the script printed "No
# case-sensitivity issues found". The guard had never once detected the failure it exists for.
# Verified both ways with `git -c core.ignorecase=false`. Do the matching in grep, on a list git
# was never asked to filter.
GIT_PATHS=$(git ls-files -- 'packages/*/package.json' 'apps/*/package.json')

for path in $PATHS; do
  # Exact casing present in the index → nothing to report.
  if git ls-files --error-unmatch "$path/package.json" > /dev/null 2>&1; then
    continue
  fi
  # No exact match. Is there one that differs ONLY by case? -F so a package name containing a
  # regex metacharacter is compared literally; -x so it is a whole-line match, not a substring.
  actual=$(printf '%s\n' "$GIT_PATHS" | grep -ixF "$path/package.json" | head -1)
  if [ -n "$actual" ]; then
    MISMATCHES+=("lockfile: $path -> git: $(dirname "$actual")")
  fi
  # A lockfile path git does not track in ANY casing is deliberately NOT reported here: that is a
  # missing/renamed workspace, which breaks the install identically on both platforms and so is not a
  # case-sensitivity finding. Naming it here would make this gate fail for an unrelated reason.
done

if [ ${#MISMATCHES[@]} -gt 0 ]; then
  echo ""
  echo "::error::Found ${#MISMATCHES[@]} case mismatch(es) in $LOCKFILE"
  echo ""
  for m in "${MISMATCHES[@]}"; do echo "  $m"; done
  echo ""
  echo "This happens when macOS (case-insensitive) generates a lockfile with"
  echo "different casing than what git stores. This causes pnpm install"
  echo "--frozen-lockfile to fail on Linux (case-sensitive) in GitHub Actions."
  echo ""
  echo "To fix:"
  echo "  1. Check actual casing: git ls-files packages/ | grep -i <package>"
  echo "  2. Rename via temp: mv packages/Path packages/temp && mv packages/temp packages/path"
  echo "  3. Regenerate lockfile: rm $LOCKFILE && pnpm install"
  exit 1
fi

echo "No case-sensitivity issues found in $LOCKFILE"
