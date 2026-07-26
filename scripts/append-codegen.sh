#!/usr/bin/env bash
#
# Append CodeGen's SQL output below the baseline migration's banner.
#
# WHY THIS IS A SCRIPT AND NOT A NOTE: the generated half of the baseline (entity/field metadata,
# base views, CRUD procs, permissions) is what makes a fresh `mj migrate` produce a WORKING database
# rather than bare tables. It has been lost once already by re-running CodeGen and forgetting this
# step, which is unrecoverable without another full rebuild.
#
# The migration is split at the CODEGEN OUTPUT banner: everything above it is hand-authored DDL and
# is preserved verbatim; everything below is replaced with the current CodeGen output.
#
# Usage: scripts/append-codegen.sh [migration-file]
set -euo pipefail

cd "$(dirname "$0")/.."
MIGRATION="${1:-migrations/V202607061432__v0.1.x__Tables_and_Objects.sql}"
GENERATED_DIR="migrations/codegen"
MARKER='CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE'

[[ -f "$MIGRATION" ]] || { echo "no such migration: $MIGRATION" >&2; exit 1; }
grep -q "$MARKER" "$MIGRATION" || { echo "no CODEGEN OUTPUT banner in $MIGRATION" >&2; exit 1; }

shopt -s nullglob
GENERATED=("$GENERATED_DIR"/*.sql)
(( ${#GENERATED[@]} )) || { echo "no CodeGen output in $GENERATED_DIR — run 'npm run mj:codegen' first" >&2; exit 1; }

# Keep the hand-authored half plus the banner; drop whatever generated tail is already there.
BANNER_END=$(grep -n "$MARKER" "$MIGRATION" | head -1 | cut -d: -f1)
BANNER_END=$(awk -v s="$BANNER_END" 'NR>=s && /^-- =+$/ { print NR; exit }' "$MIGRATION")
[[ -n "$BANNER_END" ]] || { echo "could not find the end of the banner block" >&2; exit 1; }

TMP=$(mktemp)
head -n "$BANNER_END" "$MIGRATION" > "$TMP"
printf '\n\n' >> "$TMP"
for f in "${GENERATED[@]}"; do
    printf '  + %s\n' "$(basename "$f")" >&2
    cat "$f" >> "$TMP"
    printf '\n' >> "$TMP"
done

mv "$TMP" "$MIGRATION"
printf '\n%s is now %s lines (%s hand-authored + banner, rest generated)\n' \
    "$MIGRATION" "$(wc -l < "$MIGRATION" | tr -d ' ')" "$BANNER_END"
