#!/usr/bin/env bash
#
# Build a brand-new database from nothing: drop, then apply every migration as committed.
#
# Not a development loop. Schema changes are new migrations (docs/database-migrations.md); this is
# for standing up an empty database, such as one for the integration suite.
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
#   6. this app's migrations, as committed (they carry their CodeGen output)
#   7. seed metadata: common's query categories, accounting's currencies and GL account roles,
#      then this app's metadata/
#   8. integration-suite users: a human user, and the Account Director role for the Owner
#
# Usage: scripts/rebuild-db.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
set -a; . ./.env; set +a

# The LTS release (npm dist-tag lts-6.1). It must satisfy every repo's mjVersionRange; accounting's
# starts at 6.1.0-edge.7, and common's migrations call core procedures with parameters older tags lack.
# Bump this when the lts-6.1 dist-tag moves. `mj migrate -t` takes a git ref of the MJ repo, not an
# npm dist-tag, so `-t lts-6.1` cannot resolve; the lts/6.1 branch would, but its tip can carry
# migrations no published release has yet.
MJ_VERSION="${MJ_CORE_VERSION:-v6.1.4}"
COMMON_REPO="${BIZAPPS_COMMON_REPO:-$ROOT/../bizapps-common}"
ACCOUNTING_REPO="${BIZAPPS_ACCOUNTING_REPO:-$ROOT/../bizapps-accounting}"
TASKS_REPO="${BIZAPPS_TASKS_REPO:-$ROOT/../bizapps-tasks}"
INTEGRATION_USER_EMAIL="${INTEGRATION_USER_EMAIL:-integration.user@example.com}"
MJ="node $ROOT/node_modules/@memberjunction/cli/bin/run.js"
SQLCMD="sqlcmd -S ${DB_HOST},${DB_PORT:-1433} -U ${DB_USERNAME} -P ${DB_PASSWORD} -C -N o"

say() { printf '\n\033[1m=== %s ===\033[0m\n' "$1"; }

say "1/8  Recreating ${DB_DATABASE}"
$SQLCMD -d master -Q "
    IF DB_ID('${DB_DATABASE}') IS NOT NULL
    BEGIN
        ALTER DATABASE [${DB_DATABASE}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
        DROP DATABASE [${DB_DATABASE}];
    END
    CREATE DATABASE [${DB_DATABASE}];"

say "2/8  MJ core @ ${MJ_VERSION}"
$MJ migrate -t "${MJ_VERSION}"

say "3/8  bizapps-common"
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
#
# The substituted SQL goes through a temp file, not a pipe: the ODBC sqlcmd (mssql-tools18) does not
# read `-i /dev/stdin`. -I turns QUOTED_IDENTIFIER on, which the filtered indexes need (Msg 1934).
COMMON_SQL=$(mktemp)
trap 'rm -f "$COMMON_SQL"' EXIT
for f in "$COMMON_REPO"/migrations/*.sql; do
    printf '  %s\n' "$(basename "$f")"
    sed 's/\${flyway:defaultSchema}/__mj_BizAppsCommon/g; s/\${mjSchema}/__mj/g' "$f" > "$COMMON_SQL"
    $SQLCMD -b -I -d "${DB_DATABASE}" -i "$COMMON_SQL" \
        || { printf 'FAILED: %s\n' "$(basename "$f")" >&2; exit 1; }
done

say "4/8  bizapps-tasks"
# Orders never names a tasks entity, so this looks unnecessary from here. It is not: accounting's
# TasksAppApprovalGate resolves 'MJ_BizApps_Tasks: Task Types' / 'Task Links' / 'Task Decisions' /
# 'Task Decision Outcomes' through the metadata layer, so without these tables every accounting
# approval path fails at runtime with an entity that does not exist.
$MJ migrate --schema __mj_BizAppsTasks --dir "$TASKS_REPO/migrations"

say "5/8  bizapps-accounting"
$MJ migrate --schema __mj_BizAppsAccounting --dir "$ACCOUNTING_REPO/migrations"

say "6/8  bizapps-orders"
# --schema is REQUIRED, not optional. Without it `mj migrate` uses the CORE schema's flyway history,
# which already carries a SQL_BASELINE from step 2 — so flyway skips this app's `B` baseline
# entirely and reports "0 applied" while creating nothing.
$MJ migrate --schema __mj_BizAppsOrders --dir "$ROOT/migrations"

say "7/8  Seed metadata"
# Accounting's currencies and GL account roles are seed METADATA, not migration DDL — booking needs
# both (a company profile names a functional currency; the resolver looks up roles by name), so a
# rebuild that stops at the migrations produces a database where every confirm fails at fixture time.
# Common's query categories come first because this app's queries look up 'Party Signals' by name.
#
# Only these folders are pushed from the dependencies. Pushing their whole metadata/ fails on a fresh
# database: https://github.com/MemberJunction/bizapps-accounting/issues/222 (ML folders out of order)
# and https://github.com/MemberJunction/bizapps-common/issues/196 (Tag records without DisplayName).
$MJ sync push --ci --dir "$COMMON_REPO/metadata" --include query-categories
$MJ sync push --ci --dir "$ACCOUNTING_REPO/metadata" --include currencies,gl-account-roles
$MJ sync push --ci --dir "$ROOT/metadata"

say "8/8  Integration-suite users"
# The suite runs as the Owner (System) and needs two things a fresh database does not have:
#   - a human user, whom the world loader stamps as each company's ApprovalCFOUserID. Explorer
#     creates one at first sign-in; a database built here has only System and Anonymous.
#   - the price-override grant. Its fixtures place lines at stated prices, and only Account
#     Director holds MJ.BizApps.Orders.Price.OverrideAny.
$SQLCMD -b -d "${DB_DATABASE}" -Q "
    SET NOCOUNT ON;
    INSERT INTO __mj.[User] (Name, FirstName, LastName, Email, Type, IsActive, LinkedRecordType)
    VALUES (N'${INTEGRATION_USER_EMAIL}', N'Integration', N'User', N'${INTEGRATION_USER_EMAIL}', N'User', 1, N'None');
    INSERT INTO __mj.UserRole (UserID, RoleID)
    SELECT u.ID, r.ID FROM __mj.[User] u CROSS JOIN __mj.Role r
    WHERE u.Type = N'Owner' AND r.Name = N'Account Director';
    IF @@ROWCOUNT <> 1 THROW 50000, 'expected one Owner and one Account Director role', 1;"

say "Done"
cat <<'NEXT'
Next, in order:
  pnpm run build
  RUN_MUTATION_TESTS=1 node test-harnesses/integration.mjs
NEXT
