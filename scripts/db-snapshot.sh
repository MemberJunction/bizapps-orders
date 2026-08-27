#!/usr/bin/env bash
#
# Snapshot and restore the development database.
#
# WHY THIS EXISTS. Getting to a healthy database is expensive — `rebuild-db.sh` plus THREE CodeGen
# passes plus two metadata pushes is the better part of fifteen minutes, and the integration suite
# leaves the database in whatever state a failure stopped it in. Without a snapshot, every experiment
# that goes wrong costs a full rebuild, which is enough friction to discourage experiments that should
# be cheap.
#
# It is a SQL Server native backup, so it captures everything the suite depends on: schema, the MJ
# core metadata (entities, fields, the registrations CodeGen took three passes to converge on), the
# application metadata, and any seeded review data. Restoring puts all of it back in seconds.
#
# THE THREE-PASS THING IS NOT A JOKE. CodeGen registers related-entity display fields on a later pass
# than it creates the views that contain them, so a single pass leaves `EntityField` short of the view
# by exactly the number of those fields. The provider builds its result table variable from the field
# metadata and the stored proc returns the view, so the counts disagree and EVERY entity save fails
# with "Column name or number of supplied values does not match table definition" — an error that names
# nothing useful. Snapshotting a converged database is the cheapest defence against having to
# rediscover that.
#
# Usage:
#   scripts/db-snapshot.sh save [label]     # default label: "good"
#   scripts/db-snapshot.sh restore [label]
#   scripts/db-snapshot.sh list
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$ROOT/.env" ] && set -a && . "$ROOT/.env" && set +a

DB="${DB_DATABASE:?DB_DATABASE must be set}"
LABEL="${2:-good}"
# Inside the container's filesystem, not ours — SQL Server writes its own backups.
BACKUP_DIR="/var/opt/mssql/backup"
FILE="${BACKUP_DIR}/${DB}.${LABEL}.bak"

SQLCMD="sqlcmd -S ${DB_HOST},${DB_PORT:-1433} -U ${DB_USERNAME} -P ${DB_PASSWORD} -C -N o -b"

case "${1:-}" in
  save)
    echo "Snapshotting ${DB} → ${LABEL}"
    $SQLCMD -Q "EXEC xp_create_subdir '${BACKUP_DIR}';" >/dev/null 2>&1 || true
    $SQLCMD -Q "BACKUP DATABASE [${DB}] TO DISK = '${FILE}' WITH INIT, COPY_ONLY, COMPRESSION, NAME = '${DB} ${LABEL}';"
    echo "✓ saved: ${FILE}"
    ;;

  restore)
    echo "Restoring ${DB} ← ${LABEL}"
    # SINGLE_USER with ROLLBACK IMMEDIATE first: a restore fails while anything holds a connection,
    # and something always does — a finished suite run's pool, an editor, a stray probe script.
    $SQLCMD -d master -Q "ALTER DATABASE [${DB}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;"
    $SQLCMD -d master -Q "RESTORE DATABASE [${DB}] FROM DISK = '${FILE}' WITH REPLACE;"
    $SQLCMD -d master -Q "ALTER DATABASE [${DB}] SET MULTI_USER;"
    echo "✓ restored from ${FILE}"
    ;;

  list)
    $SQLCMD -Q "EXEC xp_dirtree '${BACKUP_DIR}', 1, 1;"
    ;;

  *)
    echo "usage: $(basename "$0") {save|restore|list} [label]" >&2
    exit 2
    ;;
esac
