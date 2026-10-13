#!/usr/bin/env bash
# A PR that adds a migration must carry a minor-or-major changeset.
#
# Its own script rather than inline YAML for one reason: --self-test. The inline version shipped
# a regex that only matched SINGLE-quoted changesets, and 39 of this repo's 69 changesets are
# double-quoted — including both that were pending on `next` when it was written. It would have
# told those authors "your changeset only requests a patch", which is false, and sent them
# hunting in the wrong file. A check whose failure message can lie needs a test.
#
# Usage:  check-migration-changeset.sh <base-ref> <head-ref>
#         check-migration-changeset.sh --self-test
#
# MIGRATION_CHANGESET_EXEMPT=true (the `migration-changeset-exempt` label) skips the minor
# requirement for one PR. It exists for the case this per-PR rule gets wrong: a PR that reverts
# unreleased migration or metadata work, so its own diff touches migrations/ and metadata/ while
# nothing differs from the last release. Without it the revert has to carry a minor changeset,
# and the release goes out as a minor with nothing in it. The label reaches this door check
# only: rr: minor bump and rr: metadata shipped still judge the net change since the last tag,
# with no label, so a mislabelled PR that really changes the schema is caught at the release.
#
set -euo pipefail

# `changeset add` writes the package line as either quote style, and has over this repo's
# history written both. Tolerate unquoted too, plus trailing whitespace and CRLF.
BUMP_LINE_RE="^[[:space:]]*['\"]?[^'\":[:space:]]+['\"]?[[:space:]]*:[[:space:]]*(minor|major)[[:space:]]*$"

has_sufficient_bump() {
  grep -qE "$BUMP_LINE_RE" "$1"
}

self_test() {
  local dir rc=0
  dir=$(mktemp -d)
  trap 'rm -rf "$dir"' RETURN

  _case() { # name, expect(pass|fail), body
    printf '%s' "$3" > "$dir/c.md"
    if has_sufficient_bump "$dir/c.md"; then got=pass; else got=fail; fi
    if [ "$got" = "$2" ]; then
      printf '  ok    %-34s (%s)\n' "$1" "$got"
    else
      printf '  FAIL  %-34s expected %s, got %s\n' "$1" "$2" "$got"; rc=1
    fi
  }

  _case "single-quoted minor"   pass "---
'@mj-biz-apps/common-entities': minor
---
text"
  _case "double-quoted minor"   pass '---
"@mj-biz-apps/common-entities": minor
---
text'
  _case "double-quoted major"   pass '---
"@mj-biz-apps/common-entities": major
---
text'
  _case "unquoted minor"        pass "---
@mj-biz-apps/common-entities: minor
---
text"
  _case "trailing whitespace"   pass "---
'@mj-biz-apps/common-entities': minor   
---
text"
  _case "CRLF line ending"      pass "$(printf -- '---\r\n"@mj-biz-apps/common-entities": minor\r\n---\r\ntext')"
  _case "patch only"            fail '---
"@mj-biz-apps/common-entities": patch
---
text'
  _case "word minor in the body" fail '---
"@mj-biz-apps/common-entities": patch
---
This is a minor cleanup.'
  _case "no frontmatter"        fail 'just prose about a major change'

  [ "$rc" -eq 0 ] && echo "self-test passed" || echo "::error::check-migration-changeset self-test FAILED"
  return "$rc"
}

if [ "${1:-}" = "--self-test" ]; then
  self_test
  exit $?
fi

# Same "what changed that matters" logic as the release gate — see ci/lib/release-surface.sh.
# Without this the door and the gate can disagree about the same files.
. "$(dirname "$0")/../../ci/lib/release-surface.sh"

BASE="${1:?usage: check-migration-changeset.sh <base-ref> <head-ref>}"
HEAD_REF="${2:?usage: check-migration-changeset.sh <base-ref> <head-ref>}"

MIGRATIONS=$(git diff --name-only "$BASE" "$HEAD_REF" | grep -E '^migrations(-pg)?/.*\.sql$' || true)

# metadata/ counts too. It is seeded into a customer's database by a Metadata_Sync migration,
# so a metadata change is as observable as a schema change — and the release gate already
# judges it that way. Judging it only at the gate meant a PR could pass the door and the
# release fail for the same files, with nobody to attribute it to.
METADATA=$(substantive_metadata_changes "$BASE" "$HEAD_REF" || true)

SURFACE=""
[ -n "$MIGRATIONS" ] && SURFACE="migrations"
[ -n "$METADATA" ] && SURFACE="${SURFACE:+$SURFACE and }metadata"

if [ -z "$SURFACE" ]; then
  echo "No migration changes — any bump level is fine"
  exit 0
fi

CHANGED=$(printf '%s\n%s\n' "$MIGRATIONS" "$METADATA" | sed '/^$/d')

if [ "${MIGRATION_CHANGESET_EXEMPT:-false}" = "true" ]; then
  echo "::warning::migration changeset OVERRIDDEN by the 'migration-changeset-exempt' label. This PR changes $SURFACE and needs no minor changeset only if nothing it touches differs from the last release (a revert of unreleased work). rr: minor bump re-checks that at release. Changed:"
  echo "$CHANGED" | sed 's/^/  /'
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### migration changeset: overridden by label"
      echo
      echo "\`migration-changeset-exempt\` was applied. This PR changes $SURFACE without a minor changeset:"
      echo
      echo "$CHANGED" | sed 's/^/- `/; s/$/`/'
      echo
      echo "rr: minor bump still judges the net change since the last release."
    } >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 0
fi

REVERT_HINT="If this PR only reverts unreleased migration or metadata work, so nothing differs from the last release, add the 'migration-changeset-exempt' label instead."

# --diff-filter=d: a changeset this PR DELETES (a revert removes the original's) is not one it
# carries. Counting it made the error below claim the PR's changeset "only requests a patch".
CHANGESETS=$(git diff --name-only --diff-filter=d "$BASE" "$HEAD_REF" | grep -E '^\.changeset/.*\.md$' | grep -v 'README.md' || true)
if [ -z "$CHANGESETS" ]; then
  echo "::error::This PR changes $SURFACE but carries no changeset. A schema or seeded-metadata change is a feature: run 'pnpm exec changeset' and pick minor. $REVERT_HINT Changed:"
  echo "$CHANGED" | sed 's/^/  /'
  exit 1
fi

for f in $CHANGESETS; do
  if [ -f "$f" ] && has_sufficient_bump "$f"; then
    echo "Found a minor/major changeset: $f"
    exit 0
  fi
done

echo "::error::This PR changes $SURFACE, and its changeset(s) only request a patch. A consumer upgrading on a patch would not expect the schema or seeded metadata to change — raise one to minor. $REVERT_HINT Changesets in this PR:"
echo "$CHANGESETS" | sed 's/^/  /'
exit 1
