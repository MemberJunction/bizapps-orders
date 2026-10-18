-- =============================================================================================
-- PostgreSQL counterpart of V202610182100__v5.x__CheckoutSession_OneOpenPerClientKey.sql
-- =============================================================================================
-- Written by hand: `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) reordered the two
-- statements, added an existence guard to the index and emitted an UPDATE ... FROM ... JOIN that
-- PostgreSQL does not accept.
-- Schema names are written unquoted, as the converter emits them elsewhere, so they fold to the
-- lowercase schema a PostgreSQL install uses.
-- =============================================================================================

SET standard_conforming_strings = on;

CREATE SCHEMA IF NOT EXISTS __mj_bizappsorders;
SET search_path TO __mj_bizappsorders, public;

-- =============================================================================
-- V202610182100 — One open checkout session per widget and client key (#782)
-- =============================================================================
-- Session resume is a read-then-insert. Two InitializeSession calls for the
-- same widget and client key that overlap both found nothing and both inserted.
-- A partial unique index makes the second insert fail; the service then
-- re-reads and resumes the session the first call created.
--
-- The index covers sale sessions only (DraftOrderID IS NULL while open). A
-- pay-renewal session carries its renewal order in DraftOrderID from the start.
--
--   1. Expires all but the newest open sale session for each widget and client
--      key, so the index can be built on a database that already has duplicates.
--   2. Creates the partial unique index.
-- =============================================================================

-- 1. Close existing duplicates: keep the newest open sale session per key
WITH ranked AS (
    SELECT
        "ID",
        ROW_NUMBER() OVER (
            PARTITION BY "CheckoutWidgetID", "ClientSessionKey"
            ORDER BY "__mj_CreatedAt" DESC, "ID" DESC
        ) AS rn
    FROM __mj_BizAppsOrders."CheckoutSession"
    WHERE "Status" = 'Open' AND "DraftOrderID" IS NULL
)
UPDATE __mj_BizAppsOrders."CheckoutSession" s
SET "Status" = 'Expired'
FROM ranked r
WHERE r."ID" = s."ID" AND r.rn > 1;

-- 2. One open sale session per widget and client key
CREATE UNIQUE INDEX "UX_CheckoutSession_OpenPerClientKey"
    ON __mj_BizAppsOrders."CheckoutSession" ("CheckoutWidgetID", "ClientSessionKey")
    WHERE "Status" = 'Open' AND "DraftOrderID" IS NULL;
