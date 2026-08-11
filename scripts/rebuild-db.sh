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
#   4. bizapps-tasks    — accounting's CFO approval gate reads Task Types, Task Links, Task
#                         Decisions and Task Decision Outcomes by entity name, so accounting is not
#                         functional without these tables even though orders never names them
#   5. bizapps-accounting — `mj migrate --schema`, pointed at the sibling checkout
#   6. this app's migrations
#   7. accounting's seed metadata (currencies, GL account roles) — booking needs both
#
# AFTER THIS, still by hand (they need judgement, not automation):
#   pnpm run mj:codegen                     # regenerate entity metadata + SQL objects
#   scripts/append-codegen.sh              # append the generated SQL below the migration's banner
#   pnpm run mj -- sync push --dir metadata # seed the lookup tables
#
# Usage: scripts/rebuild-db.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
set -a; . ./.env; set +a

MJ_VERSION="${MJ_CORE_VERSION:-v6.1.0-edge.1}"
COMMON_REPO="${BIZAPPS_COMMON_REPO:-$ROOT/../bizapps-common}"
ACCOUNTING_REPO="${BIZAPPS_ACCOUNTING_REPO:-$ROOT/../bizapps-accounting}"
TASKS_REPO="${BIZAPPS_TASKS_REPO:-$ROOT/../bizapps-tasks}"
MJ="node $ROOT/node_modules/@memberjunction/cli/bin/run.js"
SQLCMD="sqlcmd -S ${DB_HOST},${DB_PORT:-1433} -U ${DB_USERNAME} -P ${DB_PASSWORD} -C -N o"

say() { printf '\n\033[1m=== %s ===\033[0m\n' "$1"; }

say "1/7  Recreating ${DB_DATABASE}"
$SQLCMD -d master -Q "
    IF DB_ID('${DB_DATABASE}') IS NOT NULL
    BEGIN
        ALTER DATABASE [${DB_DATABASE}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
        DROP DATABASE [${DB_DATABASE}];
    END
    CREATE DATABASE [${DB_DATABASE}];"

say "2/7  MJ core @ ${MJ_VERSION}"
$MJ migrate -t "${MJ_VERSION}"

say "3/7  bizapps-common"
# Applied directly rather than through `mj migrate` so the two placeholders can be substituted
# differently, which they must be:
#
#   ${flyway:defaultSchema}  ->  __mj_BizAppsCommon   common's OWN objects
#   ${mjSchema}              ->  __mj                 MJ core
#
# This previously mapped BOTH to __mj, on the stated reasoning that "common EXTENDS core rather than
# living in its own schema". That is backwards: the baseline hardcodes __mj_BizAppsCommon 552 times
# (CREATE TABLE __mj_BizAppsCommon.Person), and every placeholder use in the later migrations is a
# reference to one of those same tables — [${flyway:defaultSchema}].[Person], .[Relationship],
# .[Organization], .[vwRelationships].
#
# The consequence was not a loud failure. The baseline applied fine, so common looked installed; only
# the three follow-up migrations pointed at a nonexistent __mj.Person and failed. One of those adds
# Person.DisplayName, which tasks' baseline selects as mjBizAppsCommonPerson_PersonID.[DisplayName].
# So the visible error surfaced a repo later, as "Invalid column name 'DisplayName'" in bizapps-tasks,
# and accounting and orders never ran at all.
#
# Each file is checked individually because sqlcmd returns 0 for a failed batch unless -b is set, and
# a silent partial install here is exactly what cost the last rebuild.
for f in "$COMMON_REPO"/migrations/*.sql; do
    printf '  %s\n' "$(basename "$f")"
    sed 's/\${flyway:defaultSchema}/__mj_BizAppsCommon/g; s/\${mjSchema}/__mj/g' "$f" \
        | $SQLCMD -b -d "${DB_DATABASE}" -i /dev/stdin
done

say "4/7  bizapps-tasks"
# Orders never names a tasks entity, so this looks unnecessary from here. It is not: accounting's
# TasksAppApprovalGate resolves 'MJ_BizApps_Tasks: Task Types' / 'Task Links' / 'Task Decisions' /
# 'Task Decision Outcomes' through the metadata layer, so without these tables every accounting
# approval path fails at runtime with an entity that does not exist.
$MJ migrate --schema __mj_BizAppsTasks --dir "$TASKS_REPO/migrations"

say "5/7  bizapps-accounting"
$MJ migrate --schema __mj_BizAppsAccounting --dir "$ACCOUNTING_REPO/migrations"

# TRIM THE GENERATED HALF BEFORE APPLYING. Once CodeGen output lives in the baseline, a rebuild
# produces a database whose entity metadata is ALREADY current — so the next CodeGen run has nothing
# to do and emits only a delta, which append-codegen.sh then refuses (rightly) as a partial. The
# cycle is only self-consistent if the rebuild applies the hand-authored DDL alone and CodeGen
# regenerates the rest from scratch. This is what makes "edit the baseline in place" safe.
say "6/7  bizapps-orders (hand-authored DDL only)"
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

say "7/7  Dependency seed metadata"
# Accounting's currencies and GL account roles are seed METADATA, not migration DDL — booking needs
# both (a company profile names a functional currency; the resolver looks up roles by name), so a
# rebuild that stops at the migrations produces a database where every confirm fails at fixture time.
$MJ sync push --dir "$ACCOUNTING_REPO/metadata"

say "Done"
cat <<'NEXT'
Next, in order:
  pnpm run mj:codegen
  scripts/append-codegen.sh
  pnpm run mj -- sync push --dir metadata
  pnpm run build
  node test-harnesses/integration.mjs
NEXT
