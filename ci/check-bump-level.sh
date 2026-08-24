#!/usr/bin/env bash
# A release carrying migrations must be at least a minor.
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
# BUMP_LEVEL_EXEMPT=true skips the check, for the cases that genuinely are not features:
# a re-captured baseline, a comment fix in a migration.
set -euo pipefail

if [ "${BUMP_LEVEL_EXEMPT:-false}" = "true" ]; then
  echo "Exempt via label — skipping the bump-level check"
  exit 0
fi

LAST_TAG=$(git tag --list 'v*' --sort=-v:refname | head -1)
if [ -z "$LAST_TAG" ]; then
  echo "No v* tag yet — nothing to compare against"
  exit 0
fi

MIGRATIONS=$(git --no-pager diff --name-only "$LAST_TAG" HEAD -- migrations/ || true)
if [ -z "$MIGRATIONS" ]; then
  echo "No migration changes since $LAST_TAG — any bump level is fine"
  exit 0
fi

VERSION=$(jq -r .version packages/Entities/package.json)
PREV=${LAST_TAG#v}

if [ "$VERSION" = "$PREV" ]; then
  echo "::error::migrations/ changed since $LAST_TAG but the version is still $VERSION. Nothing has been versioned yet — merge the Version Packages PR on next first."
  echo "$MIGRATIONS" | sed 's/^/  /'
  exit 1
fi

IFS='.' read -r PMAJ PMIN _ <<< "$PREV"
IFS='.' read -r NMAJ NMIN _ <<< "$VERSION"
if [ "$NMAJ" -gt "$PMAJ" ] || { [ "$NMAJ" -eq "$PMAJ" ] && [ "$NMIN" -gt "$PMIN" ]; }; then
  echo "$PREV -> $VERSION is a minor or major bump, and migrations changed — ok"
  exit 0
fi

echo "::error::This release bumps $PREV -> $VERSION, a patch, but migrations/ changed since $LAST_TAG. A consumer upgrading on a patch would not expect schema changes. Raise one changeset on next to minor and the Version Packages PR will regenerate itself; or label this PR 'bump-level-exempt' if the migration genuinely is not a feature. Migrations changed:"
echo "$MIGRATIONS" | sed 's/^/  /'
exit 1
