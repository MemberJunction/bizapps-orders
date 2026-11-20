#!/usr/bin/env bash
#
# Guards the one hole in the release shape. `changeset version` consumes the changesets inside
# the version PR's own diff, and that diff merges into `main` — so until the back-merge lands,
# the line `main` follows still holds those changeset files and the pre-release version number.
# A push to the line in that window regenerates a Version Packages PR proposing the number that
# just shipped.
#
# publish.yml does catch the result (zero published, but packages/ differs from the tag, so it
# fails loudly) — but that is after the merge. This fails on the PR, before anyone decides.
#
# The test is simply whether the last release is an ancestor of what is about to ship: if the
# back-merge landed, it is. Robust to any cause of staleness, not just a parked PR.
set -euo pipefail

. "$(dirname "$0")/lib/last-release.sh"
LAST_TAG=$(last_release_tag)
if [ -z "$LAST_TAG" ]; then
  echo "No v* tag yet — nothing to be behind"
  exit 0
fi

if git merge-base --is-ancestor "$LAST_TAG" HEAD 2>/dev/null; then
  echo "$LAST_TAG is an ancestor of this tree — the last release has been carried home"
  exit 0
fi

echo "::error::The last release ($LAST_TAG) is NOT in this tree. The back-merge from 'main' into the line has not landed, so the line still holds the changesets that release consumed and the version number before it. Merging this would propose a version that is already on npm: publish would ship nothing. Land the release-back-merge/$LAST_TAG PR into the line first, then let this PR refresh."
exit 1
