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
#      then this app's metadata/ (tasks' actions and task types arrive with tasks' migrations)
#   8. integration-suite users: a human user, and the Account Director role for the Owner
#
# Usage: scripts/rebuild-db.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
# Load .env without overriding variables already set in the environment, as mj.config.cjs's dotenv
# does: a caller's `DB_DATABASE=other scripts/rebuild-db.sh` must target the same database the CLI
# will. The file is still sourced (same quoting, comments and expansion); values set beforehand are
# saved first and restored after.
load_env_defaults() {
    local key saved=""
    for key in $(sed -n 's/^[[:space:]]*\(export[[:space:]][[:space:]]*\)\{0,1\}\([A-Za-z_][A-Za-z0-9_]*\)=.*/\2/p' "$1"); do
        if [ -n "${!key+x}" ]; then
            saved="${saved}${key}=$(printf '%q' "${!key}")
"
        fi
    done
    set -a; . "$1"; set +a
    eval "$saved"
}
load_env_defaults ./.env

# The LTS release (npm dist-tag lts-6.1). It must satisfy every repo's mjVersionRange; accounting's
# starts at 6.1.0-edge.7, and common's migrations call core procedures with parameters older tags lack.
# It must also match the @memberjunction/* version the lockfile and mj-app.json require (6.1.5), so
# the schema is the one the installed packages expect. Bump this when the lts-6.1 dist-tag moves.
# `mj migrate -t` takes a git ref of the MJ repo, not an npm dist-tag, so `-t lts-6.1` cannot
# resolve; the lts/6.1 branch would, but its tip can carry migrations no published release has yet.
MJ_VERSION="${MJ_CORE_VERSION:-v6.1.5}"
COMMON_REPO="${BIZAPPS_COMMON_REPO:-$ROOT/../bizapps-common}"
ACCOUNTING_REPO="${BIZAPPS_ACCOUNTING_REPO:-$ROOT/../bizapps-accounting}"
TASKS_REPO="${BIZAPPS_TASKS_REPO:-$ROOT/../bizapps-tasks}"
INTEGRATION_USER_EMAIL="${INTEGRATION_USER_EMAIL:-integration.user@example.com}"
MJ="node $ROOT/node_modules/@memberjunction/cli/bin/run.js"
SQLCMD="sqlcmd -S ${DB_HOST},${DB_PORT:-1433} -U ${DB_USERNAME} -P ${DB_PASSWORD} -C -N o"

say() { printf '\n\033[1m=== %s ===\033[0m\n' "$1"; }

# bizapps-tasks must be at 1.8 or later, checked before anything is dropped. This app's migrations
# call tasks procedures with parameters tasks 1.7 added (spUpdateTaskType @IsApproval), and step 7
# relies on tasks' own 1.8 metadata-sync migration for its actions, credential types and task types
# instead of pushing them (#766). The 1.8 metadata-sync migration is the marker.
TASKS_MIN_MIGRATION=202610142252
TASKS_NEWEST=$(ls "$TASKS_REPO/migrations" 2>/dev/null | sed -n 's/^V\([0-9]\{12\}\)__.*\.sql$/\1/p' | sort | tail -1)
if [ -z "$TASKS_NEWEST" ] || [ "$TASKS_NEWEST" -lt "$TASKS_MIN_MIGRATION" ]; then
    printf 'bizapps-tasks at %s is older than 1.8 (needs migration V%s); check out tasks 1.8 or later.\n' \
        "$TASKS_REPO" "$TASKS_MIN_MIGRATION" >&2
    exit 1
fi

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
# Orders' approval task types name a tasks action, which tasks' 1.8 metadata-sync migration seeds.
# Accounting needs the tables too: its TasksAppApprovalGate resolves 'MJ_BizApps_Tasks: Task Types' /
# 'Task Links' / 'Task Decisions' / 'Task Decision Outcomes' through the metadata layer, so without
# them every accounting approval path fails at runtime with an entity that does not exist.
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
# Accounting's roles and authorizations come along so the suite can clear a finance exception, which
# requires MJ.BizApps.Accounting.FinanceExceptions.Clear (held by the Finance role).
# Tasks' actions, their category and credential type, and tasks' own task types are NOT pushed:
# tasks 1.8 seeds them in its metadata-sync migration (step 4), and pushing the same folders again
# fails on UQ_CredentialType_Name and UQ_Action_Name_CategoryID_ParentID (#766). This app's task
# types look up 'Post Task Assignment to Teams' by name, and accounting's TasksAppApprovalGate looks
# up 'Approval Request'; both exist once step 4 has run.
#
# Only these folders are pushed from the dependencies. Pushing their whole metadata/ fails on a fresh
# database: https://github.com/MemberJunction/bizapps-accounting/issues/222 (ML folders out of order)
# and https://github.com/MemberJunction/bizapps-common/issues/196 (Tag records without DisplayName).
$MJ sync push --ci --dir "$COMMON_REPO/metadata" --include query-categories
$MJ sync push --ci --dir "$ACCOUNTING_REPO/metadata" --include currencies,gl-account-roles,roles,authorizations,authorization-roles
# The push writes primary keys and sync blocks for this throwaway database back into the metadata
# files. Those values mean nothing anywhere else, so the checkout is put back afterwards. Only when
# metadata/ was clean before the push: otherwise the restore would also discard uncommitted edits.
METADATA_DIRTY=$(git -C "$ROOT" status --porcelain -- metadata)
$MJ sync push --ci --dir "$ROOT/metadata"
if [ -z "$METADATA_DIRTY" ]; then
    git -C "$ROOT" checkout -- metadata
    git -C "$ROOT" clean -fq -- metadata    # files the push created; ignored files (sql_logging/) stay
else
    printf 'metadata/ had uncommitted changes before the push; not restoring it. Review its diff.\n' >&2
fi

say "8/8  Integration-suite users"
# The suite runs as the Owner (System) and needs two things a fresh database does not have:
#   - a human user, whom the world loader stamps as each company's ApprovalCFOUserID. Explorer
#     creates one at first sign-in; a database built here has only System and Anonymous.
#   - the price-override grant. Its fixtures place lines at stated prices, and only Account
#     Director holds MJ.BizApps.Orders.Price.OverrideAny.
#   - the Finance role, which holds the authorization to clear a finance exception
#     (payment-providers PV19-PV20 resolve one).
$SQLCMD -b -d "${DB_DATABASE}" -Q "
    SET NOCOUNT ON;
    INSERT INTO __mj.[User] (Name, FirstName, LastName, Email, Type, IsActive, LinkedRecordType)
    VALUES (N'${INTEGRATION_USER_EMAIL}', N'Integration', N'User', N'${INTEGRATION_USER_EMAIL}', N'User', 1, N'None');
    INSERT INTO __mj.UserRole (UserID, RoleID)
    SELECT u.ID, r.ID FROM __mj.[User] u CROSS JOIN __mj.Role r
    WHERE u.Type = N'Owner' AND r.Name = N'Account Director';
    IF @@ROWCOUNT <> 1 THROW 50000, 'expected one Owner and one Account Director role', 1;
    INSERT INTO __mj.UserRole (UserID, RoleID)
    SELECT u.ID, r.ID FROM __mj.[User] u CROSS JOIN __mj.Role r
    WHERE u.Type = N'Owner' AND r.Name = N'Finance';
    IF @@ROWCOUNT <> 1 THROW 50000, 'expected one Owner and one Finance role', 1;"

say "Done"
cat <<'NEXT'
Next, in order:
  pnpm run build
  RUN_MUTATION_TESTS=1 node test-harnesses/integration.mjs
NEXT
