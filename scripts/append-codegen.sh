#!/usr/bin/env bash
#
# Append CodeGen's SQL output below a new migration's CODEGEN OUTPUT banner.
#
# Schema changes are new V migrations (docs/database-migrations.md). Each one ends with a CODEGEN
# OUTPUT banner, and the SQL CodeGen emits for that change (entity/field metadata, base views, CRUD
# procs, permissions) goes below it, so a fresh `mj migrate` produces a working database rather than
# bare tables. `migrations/codegen/` is gitignored; this script is how that output reaches the
# migration.
#
# The cycle, per new migration:
#
#     pnpm run mj:migrate                                  # apply the new migration
#     pnpm run mj:codegen                                  # writes migrations/codegen/*.sql
#     scripts/append-codegen.sh migrations/V<new>.sql      # fold that output in below the banner
#
# Everything above the banner is hand-authored DDL and is preserved verbatim; everything below it is
# replaced with the current CodeGen output.
#
# The target is required, and a migration already on origin/next is refused: a merged migration is
# locked (docs/database-migrations.md), and rewriting its generated half would change its checksum
# for every database that already ran it. That includes the baseline.
#
# Usage: scripts/append-codegen.sh <migration-file> [--force]
set -euo pipefail

usage() { echo "usage: scripts/append-codegen.sh <migration-file> [--force]" >&2; exit 1; }
[[ $# -ge 1 && -n "$1" && "$1" != --* ]] || usage

# Resolve the argument against the caller's directory before moving to the repo root.
ARG_DIR=$(cd "$(dirname "$1")" 2>/dev/null && pwd -P) || { echo "no such migration: $1" >&2; exit 1; }
cd "$(dirname "$0")/.."
ROOT=$(pwd -P)
MIGRATION="${ARG_DIR#"$ROOT"/}/$(basename "$1")"
[[ "$ARG_DIR" == "$ROOT"/* ]] || { echo "not a file in this repo: $1" >&2; exit 1; }
GENERATED_DIR="migrations/codegen"
MARKER='CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE'

[[ -f "$MIGRATION" ]] || { echo "no such migration: $MIGRATION" >&2; exit 1; }

# GUARD: a migration on origin/next is locked. Appending to it would rewrite merged history.
git rev-parse --verify -q origin/next >/dev/null || {
    echo "cannot check whether $MIGRATION is merged: no origin/next ref — run 'git fetch origin next'" >&2
    exit 1
}
if git cat-file -e "origin/next:$MIGRATION" 2>/dev/null; then
    cat >&2 <<EOF
REFUSING: $MIGRATION is already on origin/next, so it is locked (docs/database-migrations.md).
Rewriting its generated half changes its checksum for every database that already ran it.

Put the change in a new V migration with its own CODEGEN OUTPUT banner and append to that:

    pnpm run mj:migrate && pnpm run mj:codegen && scripts/append-codegen.sh migrations/V<new>.sql
EOF
    exit 1
fi

grep -q "$MARKER" "$MIGRATION" || { echo "no CODEGEN OUTPUT banner in $MIGRATION" >&2; exit 1; }

shopt -s nullglob
GENERATED=("$GENERATED_DIR"/*.sql)
(( ${#GENERATED[@]} )) || { echo "no CodeGen output in $GENERATED_DIR — run 'pnpm run mj:codegen' first" >&2; exit 1; }

# Keep the hand-authored half plus the banner; drop whatever generated tail is already there.
BANNER_END=$(grep -n "$MARKER" "$MIGRATION" | head -1 | cut -d: -f1)
BANNER_END=$(awk -v s="$BANNER_END" 'NR>=s && /^-- =+$/ { print NR; exit }' "$MIGRATION")
[[ -n "$BANNER_END" ]] || { echo "could not find the end of the banner block" >&2; exit 1; }

# The SQL a database without this migration needs: everything above the banner, nothing below it.
REDO_CYCLE="    1. delete everything below the banner in $MIGRATION
    2. build a throwaway database without it: point .env at one, move the migration out of
       migrations/, run scripts/rebuild-db.sh (it drops the database .env names), move it back
    3. pnpm run mj:migrate && pnpm run mj:codegen && scripts/append-codegen.sh $MIGRATION"

# GUARD: CodeGen regenerates INCREMENTALLY. Run it again against a database whose entities are already
# current and it emits only a delta, and appending that delta replaces this migration's earlier output
# with a fragment. Compare against what is already below the banner and refuse a large shrink.
EXISTING_GENERATED=$(( $(wc -l < "$MIGRATION") - BANNER_END ))
INCOMING_GENERATED=$(cat "${GENERATED[@]}" | wc -l | tr -d ' ')
if (( EXISTING_GENERATED > 1000 )) && (( INCOMING_GENERATED * 2 < EXISTING_GENERATED )); then
    cat >&2 <<EOF
REFUSING: the incoming CodeGen output ($INCOMING_GENERATED lines) is less than half of what is
already below the banner ($EXISTING_GENERATED lines). That is what a second CodeGen run against a
database that already has this migration's entities looks like, and appending it would drop the
rest of the generated half.

If this is intentional, pass --force. Otherwise regenerate it in full:

$REDO_CYCLE
EOF
    [[ "${2:-}" == "--force" ]] || exit 1
    echo "  (--force given; proceeding anyway)" >&2
fi

# GUARD: A PARTIAL CODEGEN RUN PRODUCES A MIGRATION THAT INSTALLS A BROKEN DATABASE.
#
# CodeGen creates entity metadata, base views, CRUD procs AND permissions per entity. A run that dies
# partway — a request timeout on one entity is enough — leaves the rest without permission rows, and
# the NEXT run has nothing to do for the entities that already exist, so it never emits them. The
# appended SQL is then silently short: every table is there, every view is there, and two entities
# refuse every read with "does not have read permissions" the first time anybody touches them.
#
# That has happened once (Price List Assignments and Stored Value Transactions, after a 120s timeout
# creating StoredValueTransaction). The suite caught it, but only because those two entities happened
# to be on a covered path. Asking the database directly is cheap and catches it every time.
if [[ -f .env ]]; then
    set -a; . ./.env; set +a
    ORPHANS=$(sqlcmd -S "${DB_HOST},${DB_PORT:-1433}" -U "${DB_USERNAME}" -P "${DB_PASSWORD}" -C -N o -b \
        -d "${DB_DATABASE}" -h -1 -W -Q "SET NOCOUNT ON;
        SELECT COUNT(*) FROM __mj.Entity e
        WHERE e.SchemaName = '__mj_BizAppsOrders'
          AND NOT EXISTS (SELECT 1 FROM __mj.EntityPermission p WHERE p.EntityID = e.ID);" 2>/dev/null | tr -d ' \r\n')
    if [[ -n "$ORPHANS" && "$ORPHANS" != "0" ]]; then
        cat >&2 <<EOF
REFUSING: $ORPHANS entity/entities in __mj_BizAppsOrders have NO EntityPermission rows.

That is what a CodeGen run that died partway looks like. Appending now would bake a migration that
installs a database whose reads fail for those entities. Re-running CodeGen against this database
does not repair it, because it never re-emits entities that already exist. Regenerate from a
database that has not run this migration:

$REDO_CYCLE
EOF
        exit 1
    fi
fi

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
