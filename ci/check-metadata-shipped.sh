#!/usr/bin/env bash
#
# The installer runs migrations. It never reads metadata/. So a metadata change reaches a
# customer ONLY through a hand-written `*__Metadata_Sync.sql` migration — the convention this
# repo already follows. Nothing verified that one was written, so metadata could change, pass
# every check, bump the version, publish, and reach nobody.
#
# This is a GATE check, not a door one, deliberately: a feature PR may legitimately land
# metadata before its sync migration is written. What must be true is that by release time,
# every substantive metadata change since the last release has one.
set -euo pipefail

. "$(dirname "$0")/lib/release-surface.sh"

LAST_TAG=$(git tag --list 'v*' --sort=-v:refname | head -1)
if [ -z "$LAST_TAG" ]; then
  echo "No v* tag yet — nothing to compare against"
  exit 0
fi

METADATA=$(substantive_metadata_changes "$LAST_TAG" HEAD || true)
if [ -z "$METADATA" ]; then
  echo "No substantive metadata change since $LAST_TAG — nothing to ship"
  exit 0
fi

SYNC=$(git --no-pager diff --name-only --diff-filter=A "$LAST_TAG" HEAD -- migrations/ \
       | grep -iE 'metadata_sync.*\.sql$' || true)
if [ -n "$SYNC" ]; then
  echo "Metadata changed since $LAST_TAG and a sync migration ships it:"
  printf '%s\n' "$SYNC" | sed 's/^/  /'
  exit 0
fi

echo "::error::metadata/ changed since $LAST_TAG but no Metadata_Sync migration was added. The installer runs migrations and never reads metadata/, so these changes would publish and reach nobody. Add a '*__Metadata_Sync.sql' migration (and its .pg.sql counterpart). Metadata changed:"
printf '%s\n' "$METADATA" | sed 's/^/  /'
exit 1
