#!/bin/bash
# Fixture tests for validate-package-lock-case.sh (which reads pnpm-lock.yaml).
#
# WHY THIS EXISTS. The version of this guard inherited from bizapps-caliber / bizapps-tasks /
# BlueCypress/SaaS could not detect a mis-cased lockfile path AT ALL. It searched for the case
# variant with `git ls-files "$path*/package.json" | grep -i ...`, but a git pathspec glob is
# case-sensitive regardless of core.ignorecase — `packages/entities*` never matches
# `packages/Entities`, so the glob returned empty and the `grep -i` behind it had nothing to work
# on. Every run printed "No case-sensitivity issues found", including runs over a lockfile that
# would break `pnpm install --frozen-lockfile` on Linux.
#
# That is a gate which was green for its entire life without ever being able to fail. The only
# defence against writing the same thing again is a test that watches it fail on purpose — and
# that pins BOTH core.ignorecase settings, since the local (macOS, true) and CI (Linux, false)
# behaviours differ and only one of them is ever observed by a developer.
#
# Usage: ./.github/scripts/__tests__/validate-package-lock-case.test.sh
# Exit 0 = all cases pass.

set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/validate-package-lock-case.sh"
PASS=0
FAIL=0

# Builds a repo tracking packages/Entities + packages/Server, with a pnpm-lock.yaml whose
# `importers:` keys are $1 (space-separated, may be empty). Echoes the directory.
#
# The fixture emits pnpm's shape rather than npm's `.packages` map because the gate now parses
# `importers:` — the workspace paths pnpm records — with sed/grep instead of jq. What is being
# pinned is unchanged: a lockfile path whose CASE differs from what git tracks.
make_repo() {
  local lock_paths="$1"
  local dir; dir=$(mktemp -d)
  git -C "$dir" init -q
  git -C "$dir" config user.email t@t.local
  git -C "$dir" config user.name test
  # No ${p,,} here: macOS ships bash 3.2, where that expansion is a FATAL "bad substitution" that
  # aborts this function before it echoes $dir — leaving the caller with an empty path and, before
  # the guard in `check`, silently running the gate against the real repository instead.
  for p in Entities Server; do
    mkdir -p "$dir/packages/$p"
    echo "{\"name\":\"@fixture/$p\"}" > "$dir/packages/$p/package.json"
  done
  # `settings:` after the block matters — the parser reads from `importers:` to the next
  # column-0 key, so without a following key the sed range would run to end-of-file.
  {
    echo "lockfileVersion: '9.0'"
    echo ""
    echo "importers:"
    echo "  .:"
    echo "    dependencies: {}"
    for p in $lock_paths; do
      echo "  $p:"
      echo "    dependencies: {}"
    done
    echo ""
    echo "settings:"
    echo "  autoInstallPeers: true"
  } > "$dir/pnpm-lock.yaml"
  git -C "$dir" add -A >/dev/null
  git -C "$dir" commit -qm base
  echo "$dir"
}

# check <name> <expected-exit> <lock-paths> <ignorecase> [grep-for-in-output]
check() {
  local name="$1" want="$2" lock_paths="$3" ignorecase="$4" expect_text="${5:-}"
  local dir out rc
  dir=$(make_repo "$lock_paths")
  # If the fixture failed to build, `cd ""` is a no-op and the gate would run against the REAL
  # repository — reporting a result about the wrong tree. Refuse rather than measure the wrong
  # thing. (Not hypothetical: a bash-4-ism in make_repo did exactly this.)
  if [ -z "$dir" ] || [ ! -d "$dir" ]; then
    FAIL=$((FAIL + 1)); echo "  FAIL — $name (fixture repo could not be built)"
    return
  fi
  out=$(cd "$dir" && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.ignorecase \
    GIT_CONFIG_VALUE_0="$ignorecase" bash "$SCRIPT" 2>&1); rc=$?
  local ok=1
  [ "$rc" -eq "$want" ] || ok=0
  if [ -n "$expect_text" ] && ! grep -qF "$expect_text" <<<"$out"; then ok=0; fi
  if [ "$ok" -eq 1 ]; then
    PASS=$((PASS + 1)); echo "  ok   — $name"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL — $name (exit $rc, wanted $want)"; sed 's/^/         | /' <<<"$out"
  fi
  rm -rf "$dir"
}

echo "validate-package-lock-case.sh"

for ic in true false; do
  label="core.ignorecase=$ic"

  check "[$label] correct casing passes" \
    0 "packages/Entities packages/Server" "$ic" "No case-sensitivity issues found"

  # THE REGRESSION. Green for the entire life of the inherited script.
  check "[$label] a mis-cased path is CAUGHT" \
    1 "packages/entities" "$ic" "lockfile: packages/entities -> git: packages/Entities"

  check "[$label] a mis-cased path is caught alongside correct ones" \
    1 "packages/Entities packages/server" "$ic" "lockfile: packages/server -> git: packages/Server"

  # Not a casing finding: breaks the install identically on both platforms, so it is not this gate's job.
  check "[$label] a workspace git does not track at all is not reported" \
    0 "packages/Ghost" "$ic" "No case-sensitivity issues found"
done

# A gate that cannot open its input has not passed — it abstained.
MISSING_DIR=$(mktemp -d)
git -C "$MISSING_DIR" init -q
out=$(cd "$MISSING_DIR" && bash "$SCRIPT" 2>&1); rc=$?
if [ "$rc" -eq 1 ] && grep -qF "not found" <<<"$out"; then
  PASS=$((PASS + 1)); echo "  ok   — a missing lockfile fails instead of reporting all-clear"
else
  FAIL=$((FAIL + 1)); echo "  FAIL — a missing lockfile fails instead of reporting all-clear (exit $rc)"
  sed 's/^/         | /' <<<"$out"
fi
rm -rf "$MISSING_DIR"

echo "  $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
