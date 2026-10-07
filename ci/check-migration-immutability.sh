#!/usr/bin/env bash
# A migration that has shipped is frozen.
#
# Flyway records a checksum for every migration it applies. Edit an applied file and every
# database that already ran it fails validation on the next migrate — while a database built
# from scratch happily applies the new text. The two diverge silently, and the fix is manual
# repair on each existing installation. So: once a migration is on `main`, it is published,
# and the only legal change to `migrations/` is a NEW file.
#
# Compares against the MERGE BASE with the ref it is given (three-dot), not that ref`s tip —
# and the reason is WHICH ref. This is called with `origin/main`, which on a PR into `next` is
# not the PR`s own base. Two-dot against main would report everything that differs between
# main and this branch — including migrations sitting on `next` awaiting release — as though
# this PR had edited them. Three-dot asks the narrower question the rule cares about: has
# anything that was ALREADY on main at the branch point been changed?
#
# (Against the PR`s own base the two forms coincide: on a pull_request event HEAD is GitHub`s
# merge ref, whose base parent is the base tip. The distinction is about the ref, not the dots.)
#
# ONE CONSEQUENCE, once an exemption is used. After someone edits a shipped migration on `next`
# under `migration-immutability-exempt`, that edit sits inside the three-dot range of EVERY
# later PR into `next`, so they all fail this check until the next release moves main forward.
# Release promptly after an exemption, or expect to label the follow-ups too. (Baseline is
# clean today: `git diff --diff-filter=MDR origin/main...origin/next -- migrations/` is empty.)
#
# MIGRATION_IMMUTABILITY_EXEMPT=true (the `migration-immutability-exempt` label) overrides it —
# but does NOT silence it: the offending files are still listed, in the log and the job summary.
# An override is a decision someone made, and it should be legible to whoever reviews the PR.
set -euo pipefail

BASE="${1:-origin/main}"

if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "::error::Cannot resolve '$BASE'. This check needs the base branch fetched (fetch-depth: 0)."
  exit 1
fi

# M=modified, D=deleted, R=renamed. Additions (A) are the whole point and are never flagged.
TOUCHED=$(git diff --name-only --diff-filter=MDR "$BASE"...HEAD -- migrations/ migrations-pg/ || true)

if [ -z "$TOUCHED" ]; then
  echo "No already-released migration was modified, deleted or renamed — ok"
  exit 0
fi

# The override is deliberately NOT a skip. A skip leaves no trace of what was edited, which
# is the opposite of what an exception needs: the whole value of overriding a gate is that a
# human decided to, on the record. So the list is computed either way and reported either way
# — into the log AND the job summary, where a reviewer sees it without opening the run.
if [ "${MIGRATION_IMMUTABILITY_EXEMPT:-false}" = "true" ]; then
  echo "::warning::Migration immutability OVERRIDDEN via the 'migration-immutability-exempt' label. These already-released migrations were modified, deleted or renamed:"
  echo "$TOUCHED" | sed 's/^/  /'
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### ⚠ Migration immutability overridden"
      echo
      echo "The \`migration-immutability-exempt\` label was applied. Already-released migrations changed:"
      echo
      echo "$TOUCHED" | sed 's/^/- `/;s/$/`/'
      echo
      echo "This is only safe if the migration has not been applied anywhere yet. If it has, every"
      echo "database that already ran it keeps the OLD schema and fails Flyway validation, while a"
      echo "fresh database gets the new text — add a forward migration instead."
    } >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 0
fi

echo "::error::A migration already on $BASE was modified, deleted or renamed. Flyway checksums the file at apply time, so editing it breaks validation on every database that already ran it, while a fresh database silently gets the new text. Add a NEW migration that makes the correction instead. If the migration has genuinely never been applied anywhere — caught within minutes, nothing deployed, nobody pulled it — label the PR 'migration-immutability-exempt'. Offending files:"
echo "$TOUCHED" | sed 's/^/  /'
exit 1
