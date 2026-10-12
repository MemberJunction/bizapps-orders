#!/usr/bin/env bash
# A release that changes the shipped SCHEMA or METADATA must be at least a minor.
#
# Two sources, one rule. `migrations/` is the schema; `metadata/` is the seed data and
# configuration MetadataSync pushes into a customer's database. Both alter what a consumer
# gets when they upgrade, so neither belongs in a patch.
#
# One implementation, called from every place this is gated, so the rule cannot drift
# between them. It asserts a property of the RELEASE, not of a contributing PR: changesets
# aggregate, so a single minor in the release window already makes the release a minor, and
# a small follow-up migration arriving with a patch changeset is not a mistake.
#
# Expects to run in a checkout with tags fetched, at the commit whose version should be
# judged — i.e. somewhere the version is already RESOLVED (a Version Packages PR, or a
# release PR), not on a branch where changesets are still pending.
#
# There is deliberately no exemption label. The only case it ever served was a re-captured
# baseline — a migration file rewritten without shipping anything new — and under this
# pipeline over-bumping is close to free, because a version number is minted and published
# in the same breath and skipping one is structurally impossible. Taking the minor is the
# cheaper answer than an escape hatch people have to reason about.
set -euo pipefail

# The "what changed that matters" logic is shared with the door check — see the header there.
. "$(dirname "$0")/lib/release-surface.sh"

# --- metadata: tell a real edit apart from bookkeeping -------------------------------------
#
# Every MetadataSync record carries a `sync` block that `mj sync push` rewrites on every run:
#
#     "sync": { "lastModified": "2026-09-07T14:18:30.894Z", "checksum": "6c752d9c..." }
#
# A raw `git diff --name-only metadata/` therefore fires on commits that changed nothing a
# consumer can observe — bizapps-common 388db6a ("refresh .entities.json checksums after geo
# pin push") is exactly that: fourteen changed lines, all of them `sync`. A check that demands
# a minor for those is a check people learn to route around with the exempt label, which costs
# us the times it is right.
#
# So compare STRUCTURE with `sync` dropped at every depth, not text. Parsing also means a
# reserialization — key order, indentation, a trailing newline — is not a change either.
# `sync` is the only key dropped: `fields` and `primaryKey` are both substantive, and a new
# `primaryKey` is a new record.

# Echoes the metadata files that changed substantively between two refs, one per line, and
# explains each decision on stderr so a CI log says WHY a file counted rather than just that it
# did. Three outcomes per file:
#
#   added / deleted   a normal, substantive change — a metadata record appearing or disappearing
#                     is exactly what this rule exists to catch. Reported as such, not as an error.
#   unreadable        genuinely could not be parsed. Counted as changed, loudly, naming the ref
#                     and the reason: guessing "unchanged" on a file you failed to read is worse
#                     than asking a human.
#   compared          both sides parsed; counted only if they differ once every `sync` block is
#                     stripped, so a rewritten checksum or a reserialized file is not a change.

LAST_TAG=$(git tag --list 'v*' --sort=-v:refname | head -1)
if [ -z "$LAST_TAG" ]; then
  echo "No v* tag yet — nothing to compare against"
  exit 0
fi

MIGRATIONS=$(git --no-pager diff --name-only "$LAST_TAG" HEAD -- migrations/ || true)
METADATA=$(substantive_metadata_changes "$LAST_TAG" HEAD)

RAW_METADATA=$(git --no-pager diff --name-only "$LAST_TAG" HEAD -- metadata/ || true)
if [ -n "$RAW_METADATA" ] && [ -z "$METADATA" ]; then
  echo "metadata/ changed since $LAST_TAG, but nothing substantive — sync bookkeeping or reserialization only, not counted:"
  echo "$RAW_METADATA" | sed 's/^/  /'
fi

if [ -z "$MIGRATIONS" ] && [ -z "$METADATA" ]; then
  echo "No schema or metadata changes since $LAST_TAG — any bump level is fine"
  exit 0
fi

CHANGED=""
[ -n "$MIGRATIONS" ] && CHANGED="migrations/"
[ -n "$METADATA" ] && CHANGED="${CHANGED:+$CHANGED and }metadata/"

VERSION=$(jq -r .version packages/Entities/package.json)
PREV=${LAST_TAG#v}

if [ "$VERSION" = "$PREV" ]; then
  echo "::error::$CHANGED changed since $LAST_TAG but the version is still $VERSION. Nothing has been versioned yet — merge the Version Packages PR on next first."
  printf '%s\n%s\n' "$MIGRATIONS" "$METADATA" | grep -v '^$' | sed 's/^/  /'
  exit 1
fi

IFS='.' read -r PMAJ PMIN _ <<< "$PREV"
IFS='.' read -r NMAJ NMIN _ <<< "$VERSION"
if [ "$NMAJ" -gt "$PMAJ" ] || { [ "$NMAJ" -eq "$PMAJ" ] && [ "$NMIN" -gt "$PMIN" ]; }; then
  echo "$PREV -> $VERSION is a minor or major bump, and $CHANGED changed — ok"
  exit 0
fi

echo "::error::This release bumps $PREV -> $VERSION, a patch, but $CHANGED changed since $LAST_TAG. A consumer upgrading on a patch would not expect the schema or the seeded metadata to change. Raise a minor changeset on next; the Version Packages PR regenerates itself at the corrected number, and merging that is the release. Changed:"
printf '%s\n%s\n' "$MIGRATIONS" "$METADATA" | grep -v '^$' | sed 's/^/  /'
exit 1
