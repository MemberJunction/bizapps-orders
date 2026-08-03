#!/usr/bin/env bash
#
# Rebuild the local development database from scratch.
#
# WHY THIS EXISTS: the standing pre-production practice is that schema changes EDIT THE BASELINE
# MIGRATION IN PLACE rather than adding fix-up migrations (README "Database Support"). That is only
# safe if rebuilding from zero is routine — otherwise the baseline drifts from what anyone actually
# has installed. This script is that routine.
#
# WHAT IT DOES
#   1. drop + recreate the database
#   2. MJ core schema at the pinned version
#   3. bizapps-common   — applied with sqlcmd because its migrations are written against
#                         ${flyway:defaultSchema} meaning __mj (it extends core), which `mj migrate`
#                         would rewrite to the app schema
#   4. bizapps-accounting — `mj migrate --schema`, pointed at the sibling checkout
#   5. this app's migrations
#   6. accounting's seed metadata (currencies, GL account roles) — booking needs both
#
# AFTER THIS, still by hand (they need judgement, not automation):
#   npm run mj:codegen                     # regenerate entity metadata + SQL objects
#   scripts/append-codegen.sh              # append the generated SQL below the migration's banner
#   npm run mj -- sync push --dir metadata # seed the lookup tables
#
# Usage: scripts/rebuild-db.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
set -a; . ./.env; set +a

MJ_VERSION="${MJ_CORE_VERSION:-v5.50.0}"
COMMON_REPO="${BIZAPPS_COMMON_REPO:-$ROOT/../bizapps-common}"
ACCOUNTING_REPO="${BIZAPPS_ACCOUNTING_REPO:-$ROOT/../bizapps-accounting}"
MJ="node $ROOT/node_modules/@memberjunction/cli/bin/run.js"
SQLCMD="sqlcmd -S ${DB_HOST},${DB_PORT:-1433} -U ${DB_USERNAME} -P ${DB_PASSWORD} -C -N o"

say() { printf '\n\033[1m=== %s ===\033[0m\n' "$1"; }

say "1/6  Recreating ${DB_DATABASE}"
$SQLCMD -d master -Q "
    IF DB_ID('${DB_DATABASE}') IS NOT NULL
    BEGIN
        ALTER DATABASE [${DB_DATABASE}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
        DROP DATABASE [${DB_DATABASE}];
    END
    CREATE DATABASE [${DB_DATABASE}];"

say "2/6  MJ core @ ${MJ_VERSION}"
$MJ migrate -t "${MJ_VERSION}"

say "3/6  bizapps-common"
# These migrations target ${flyway:defaultSchema} = __mj (common EXTENDS core rather than living in
# its own schema), so they are applied directly with the substitution done here. `mj migrate` would
# rewrite the placeholder to this app's schema and put common's tables in the wrong place.
for f in "$COMMON_REPO"/migrations/*.sql; do
    printf '  %s\n' "$(basename "$f")"
    sed 's/\${flyway:defaultSchema}/__mj/g; s/\${mjSchema}/__mj/g' "$f" \
        | $SQLCMD -d "${DB_DATABASE}" -i /dev/stdin
done

say "4/6  bizapps-accounting"
$MJ migrate --schema __mj_BizAppsAccounting --dir "$ACCOUNTING_REPO/migrations"

# TRIM THE GENERATED HALF BEFORE APPLYING. Once CodeGen output lives in the baseline, a rebuild
# produces a database whose entity metadata is ALREADY current — so the next CodeGen run has nothing
# to do and emits only a delta, which append-codegen.sh then refuses (rightly) as a partial. The
# cycle is only self-consistent if the rebuild applies the hand-authored DDL alone and CodeGen
# regenerates the rest from scratch. This is what makes "edit the baseline in place" safe.
say "5/6  bizapps-orders (hand-authored DDL only)"
MARKER='CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE'
ORDERS_MIGRATION=$(grep -rl "$MARKER" "$ROOT/migrations"/*.sql | head -1)
if [[ -n "$ORDERS_MIGRATION" ]]; then
    MARKER_LINE=$(grep -n "$MARKER" "$ORDERS_MIGRATION" | head -1 | cut -d: -f1)
    BANNER_END=$(awk -v s="$MARKER_LINE" 'NR>=s && /^-- =+$/ { print NR; exit }' "$ORDERS_MIGRATION")
    GENERATED_LINES=$(( $(wc -l < "$ORDERS_MIGRATION") - BANNER_END ))
    if (( GENERATED_LINES > 0 )); then
        printf '  trimming %s lines of generated output (CodeGen will regenerate them)\n' "$GENERATED_LINES"
        head -n "$BANNER_END" "$ORDERS_MIGRATION" > "$ORDERS_MIGRATION.tmp"
        mv "$ORDERS_MIGRATION.tmp" "$ORDERS_MIGRATION"
        # RECORD WHAT WE TRIMMED, so append-codegen.sh has something to compare against.
        # Its shrink guard exists to catch a partial/incremental CodeGen run being appended over a
        # full one — but it compares the incoming output against what is CURRENTLY below the banner,
        # and by this point that is zero. In the normal flow (rebuild → codegen → append) the guard
        # could therefore never fire, which is the one flow it was written for.
        printf '%s\n' "$GENERATED_LINES" > "$ROOT/migrations/codegen/.previous-generated-lines"
    fi
fi

# STALE EMITS ARE DEBRIS, AND THEY ACCUMULATE INTO THE BASELINE. append-codegen.sh concatenates
# EVERY file in migrations/codegen/, so runs left over from previous rebuilds are appended again on
# the next one. That is not hypothetical: the baseline reached 309k lines carrying EIGHT stacked
# copies of every view and procedure before anyone noticed, because each copy is valid SQL and the
# last one wins. Clearing here means the emits appended are exactly the ones this rebuild produced.
find "$ROOT/migrations/codegen" -maxdepth 1 -name '*.sql' -delete 2>/dev/null || true

# --schema is REQUIRED, not optional. Without it `mj migrate` uses the CORE schema's flyway history,
# which already carries a SQL_BASELINE from step 2 — so flyway skips this app's `B` baseline
# entirely and reports "0 applied" while creating nothing.
$MJ migrate --schema __mj_BizAppsOrders --dir "$ROOT/migrations"

say "6/6  Dependency seed metadata"
# Accounting's currencies and GL account roles are seed METADATA, not migration DDL — booking needs
# both (a company profile names a functional currency; the resolver looks up roles by name), so a
# rebuild that stops at the migrations produces a database where every confirm fails at fixture time.
$MJ sync push --dir "$ACCOUNTING_REPO/metadata"

say "Done"
cat <<'NEXT'
Next, in order:
  npm run mj:codegen
  scripts/append-codegen.sh
  npm run mj -- sync push --dir metadata
  npm run build
  node test-harnesses/integration.mjs
NEXT
