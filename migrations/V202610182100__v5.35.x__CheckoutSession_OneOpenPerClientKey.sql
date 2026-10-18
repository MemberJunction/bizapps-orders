-- =============================================================================
-- V202610182100 — One open checkout session per widget and client key (#782)
-- =============================================================================
-- Session resume is a read-then-insert. Two InitializeSession calls for the
-- same widget and client key that overlap (a double-loaded page, a retried
-- request) both found nothing and both inserted, so one buyer had two open
-- sessions and later drafts and payment intents could attach to either.
--
-- A filtered unique index makes the second insert fail; the service then
-- re-reads and resumes the session the first call created.
--
-- The index covers sale sessions only (DraftOrderID IS NULL while open). A
-- pay-renewal session carries its renewal order in DraftOrderID from the
-- start, and the same client key may hold one of those beside a sale session.
--
-- What this file does, in order:
--   1. Expires all but the newest open sale session for each widget and
--      client key, so the index can be built on a database that already has
--      duplicates.
--   2. Creates the filtered unique index.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Close existing duplicates: keep the newest open sale session per key
-- -----------------------------------------------------------------------------
WITH ranked AS (
    SELECT
        [ID],
        ROW_NUMBER() OVER (
            PARTITION BY [CheckoutWidgetID], [ClientSessionKey]
            ORDER BY [__mj_CreatedAt] DESC, [ID] DESC
        ) AS rn
    FROM [${flyway:defaultSchema}].[CheckoutSession]
    WHERE [Status] = N'Open' AND [DraftOrderID] IS NULL
)
UPDATE s
SET [Status] = N'Expired'
FROM [${flyway:defaultSchema}].[CheckoutSession] s
JOIN ranked r ON r.[ID] = s.[ID]
WHERE r.rn > 1;
GO


-- -----------------------------------------------------------------------------
-- 2. One open sale session per widget and client key
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX [UX_CheckoutSession_OpenPerClientKey]
    ON [${flyway:defaultSchema}].[CheckoutSession] ([CheckoutWidgetID], [ClientSessionKey])
    WHERE [Status] = N'Open' AND [DraftOrderID] IS NULL;
GO


-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- =============================================================================
