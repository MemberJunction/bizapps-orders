#!/bin/bash
# Fixture tests for ci/check-bump-level.sh (the `rr: minor bump` release gate).
#
# WHY THIS EXISTS. The gate's first guard exits 0 when there is no `v*` tag, and the template
# never publishes, so it never tags — the script had never got past line one in this repo. No
# tag fixes that either: a static `v0.0.0` equals the template's own 0.0.0 version and fails every
# migration PR forever, and a tag that follows `next` is also the diff base, so nothing ever
# looks changed. The template has no version lineage to compare against, so the only way to run
# the logic is to give it one: throwaway repos with a tag, a change, and a resolved version.
#
# Several branches here fire rarely in a real repo — "nothing versioned yet" once in its life, a
# mis-selected baseline tag only after releases that sort differently by name than by version —
# so this is the only place they are exercised before the day they matter.
#
# Assertions are on the exit code AND the message: "a patch" and "nothing versioned yet" both
# fail, but they send the developer to different fixes.
#
# Usage: ./.github/scripts/__tests__/check-bump-level.test.sh
# Exit 0 = all cases pass.

set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/ci/check-bump-level.sh"
PASS=0
FAIL=0
DIR=""

# Starts a fixture repo with one released commit: a migration, a metadata record and
# packages/Entities at version $1, tagged v$1. Sets DIR.
new_repo() {
  local version="$1"
  DIR=$(mktemp -d)
  git -C "$DIR" init -q
  git -C "$DIR" config user.email t@t.local
  git -C "$DIR" config user.name test
  mkdir -p "$DIR/migrations" "$DIR/metadata/widgets" "$DIR/packages/Entities"
  echo "CREATE TABLE a (id INT);" > "$DIR/migrations/V202601010000__v${version}_Base.sql"
  echo "# Migrations" > "$DIR/migrations/_README.md"
  echo "# Widgets" > "$DIR/metadata/widgets/README.md"
  cat > "$DIR/metadata/widgets/.widgets.json" <<'JSON'
[
  {
    "fields": { "Name": "Alpha", "Color": "red" },
    "primaryKey": { "ID": "11111111-1111-1111-1111-111111111111" },
    "sync": { "lastModified": "2026-01-01T00:00:00.000Z", "checksum": "aaaa" }
  }
]
JSON
  set_version "$version"
  commit "release $version"
  git -C "$DIR" tag "v$version"
}

set_version() {
  echo "{\"name\":\"@fixture/entities\",\"version\":\"$1\"}" > "$DIR/packages/Entities/package.json"
}

commit() {
  git -C "$DIR" add -A >/dev/null
  git -C "$DIR" commit -qm "$1" --allow-empty
}

add_migration() {
  echo "ALTER TABLE a ADD b INT;" > "$DIR/migrations/V202602010000__v_Next.sql"
}

# check <name> <expected-exit> <expected-text> [VAR=value ...]
# Runs the gate inside $DIR with any extra environment, then removes $DIR.
check() {
  local name="$1" want="$2" expect_text="$3"; shift 3
  local out rc
  # If the fixture failed to build, `cd ""` is a no-op and the gate would run against the REAL
  # repository — reporting a result about the wrong tree. Refuse rather than measure that.
  if [ -z "$DIR" ] || [ ! -d "$DIR/.git" ]; then
    FAIL=$((FAIL + 1)); echo "  FAIL — $name (fixture repo could not be built)"
    return
  fi
  out=$(cd "$DIR" && env "$@" bash "$SCRIPT" 2>&1); rc=$?
  local ok=1
  [ "$rc" -eq "$want" ] || ok=0
  grep -qF -- "$expect_text" <<<"$out" || ok=0
  if [ "$ok" -eq 1 ]; then
    PASS=$((PASS + 1)); echo "  ok   — $name"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL — $name (exit $rc, wanted $want; expected text: $expect_text)"
    sed 's/^/         | /' <<<"$out"
  fi
  rm -rf "$DIR"; DIR=""
}

echo "check-bump-level.sh"

# --- the bump level against a migration ------------------------------------------------------

new_repo 1.2.0; add_migration; set_version 1.2.1; commit "patch with a migration"
check "a migration on a patch FAILS" \
  1 "This release bumps 1.2.0 -> 1.2.1, a patch, but migrations/ changed since v1.2.0"

new_repo 1.2.0; add_migration; set_version 1.3.0; commit "minor with a migration"
check "a migration on a minor passes" \
  0 "1.2.0 -> 1.3.0 is a minor or major bump, and migrations/ changed — ok"

new_repo 1.2.0; add_migration; set_version 2.0.0; commit "major with a migration"
check "a migration on a major passes (minor resets to 0)" \
  0 "1.2.0 -> 2.0.0 is a minor or major bump"

# A different failure from the patch case, with a different fix: merge the Version Packages PR.
new_repo 1.2.0; add_migration; commit "migration, not yet versioned"
check "a migration with the version still at the tag FAILS as not-yet-versioned" \
  1 "migrations/ changed since v1.2.0 but the version is still 1.2.0. Nothing has been versioned yet"

new_repo 1.2.0; echo "x" > "$DIR/packages/Entities/x.ts"; set_version 1.2.1; commit "code only"
check "no schema or metadata change: a patch is fine" \
  0 "No schema or metadata changes since v1.2.0 — any bump level is fine"

new_repo 1.2.0; git -C "$DIR" tag -d v1.2.0 >/dev/null; add_migration; set_version 1.2.1; commit "pre-release"
check "no v* tag at all passes as a first release" \
  0 "No v* tag yet — nothing to compare against"

# There is deliberately no exemption (see the script's header). The env var an earlier version
# honoured must not quietly come back as a way around the gate.
new_repo 1.2.0; add_migration; set_version 1.2.1; commit "patch with a migration"
check "BUMP_LEVEL_EXEMPT=true does NOT exempt a patch" \
  1 "a patch, but migrations/ changed" BUMP_LEVEL_EXEMPT=true

# --- which tag is the baseline ---------------------------------------------------------------

# v0.9.0 is created AFTER v1.2.0, so creation order would pick it — and 0.9.0 -> 1.2.1 looks like
# a major, so the wrong baseline turns a real failure into a pass.
new_repo 1.2.0; git -C "$DIR" tag v0.9.0; add_migration; set_version 1.2.1; commit "patch"
check "baseline is the highest version (v1.2.0), not the newest tag (v0.9.0)" \
  1 "migrations/ changed since v1.2.0"

# Name order would pick v1.9.0 over v1.10.0, and 1.9.0 -> 1.10.1 looks like a minor.
new_repo 1.9.0; set_version 1.10.0; commit "release 1.10.0"; git -C "$DIR" tag v1.10.0
add_migration; set_version 1.10.1; commit "patch"
check "baseline compares versions numerically (v1.10.0 over v1.9.0)" \
  1 "This release bumps 1.10.0 -> 1.10.1, a patch"

# --- what counts as a change -----------------------------------------------------------------

new_repo 1.2.0
sed -i.bak 's/"red"/"blue"/' "$DIR/metadata/widgets/.widgets.json"; rm "$DIR/metadata/widgets/.widgets.json.bak"
set_version 1.2.1; commit "metadata edit"
check "a substantive metadata edit on a patch FAILS" \
  1 "a patch, but metadata/ changed since v1.2.0"

# `mj sync push` rewrites the sync block on every run; a consumer cannot observe it.
new_repo 1.2.0
sed -i.bak 's/"aaaa"/"bbbb"/; s/2026-01-01/2026-03-03/' "$DIR/metadata/widgets/.widgets.json"; rm "$DIR/metadata/widgets/.widgets.json.bak"
set_version 1.2.1; commit "sync bookkeeping"
check "a sync-block-only metadata change is not counted" \
  0 "nothing substantive — sync bookkeeping or reserialization only"

new_repo 1.2.0; echo "more docs" >> "$DIR/metadata/widgets/README.md"; set_version 1.2.1; commit "metadata docs"
check "a README under metadata/ is not counted" \
  0 "any bump level is fine"

new_repo 1.2.0; add_migration
echo '[{"fields":{"Name":"Beta"},"primaryKey":{"ID":"22222222-2222-2222-2222-222222222222"}}]' > "$DIR/metadata/widgets/.more.json"
set_version 1.2.1; commit "both"
check "both surfaces changed are both named" \
  1 "a patch, but migrations/ and metadata/ changed"

# The door (check-migration-changeset.sh) and ci/lib/release-surface.sh both count only .sql
# files under migrations/ and migrations-pg/: a README is documentation and a PostgreSQL
# migration is as much a schema change as a SQL Server one. The gate has to agree, or a PR passes
# the door and fails the release for the same files (or the reverse).
new_repo 1.2.0; echo "more docs" >> "$DIR/migrations/_README.md"; set_version 1.2.1; commit "migrations docs"
check "a README under migrations/ is not counted" \
  0 "any bump level is fine"

new_repo 1.2.0; mkdir -p "$DIR/migrations-pg"; echo "ALTER TABLE a ADD b INT;" > "$DIR/migrations-pg/V202602010000__v_Next.pg.sql"
set_version 1.2.1; commit "pg migration on a patch"
check "a migrations-pg/ migration on a patch FAILS" \
  1 "a patch, but migrations/ changed since v1.2.0"

echo "  $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
