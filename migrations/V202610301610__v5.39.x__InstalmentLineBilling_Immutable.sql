-- =============================================================================
-- V202610301610 — InstalmentLineBilling rows are written once (#713)
-- =============================================================================
-- InstalmentLineBilling records what each instalment invoice billed each line,
-- and later instalments are sliced against those rows. Nothing stopped an
-- UPDATE or DELETE of a row, so an edited row silently moved billing between
-- lines on every later instalment, and a lowered, deleted or added row made the
-- next instalment refuse to invoice.
--
-- What this file does:
--   1. trg_InstalmentLineBilling_Immutable: refuses any UPDATE or DELETE of a
--      row. RecordInstalmentLineBillings only inserts, so the server is
--      unaffected; a row is removed only by rolling back the transaction that
--      wrote it.
--
-- The guard refuses with THROW alone (V202610091200 explains why a ROLLBACK in
-- a trigger breaks every save made through MemberJunction). It returns early
-- inside CodeGen's trgUpdateInstalmentLineBilling, whose nested UPDATE stamps
-- __mj_UpdatedAt: the outer statement is checked by this trigger's own firing.
-- =============================================================================
GO


-- -----------------------------------------------------------------------------
-- 1. trg_InstalmentLineBilling_Immutable
-- -----------------------------------------------------------------------------
CREATE TRIGGER [${flyway:defaultSchema}].[trg_InstalmentLineBilling_Immutable]
ON [${flyway:defaultSchema}].[InstalmentLineBilling]
AFTER UPDATE, DELETE
AS
BEGIN
    -- The __mj_UpdatedAt trigger's nested UPDATE: the outer call checks these rows.
    IF TRIGGER_NESTLEVEL(OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateInstalmentLineBilling]')) > 0 RETURN;

    SET NOCOUNT ON;
    -- Zero-row statements (CodeGen's __mj_UpdatedAt backfill) must not touch anything.
    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;

    THROW 51032, 'InstalmentLineBilling rows record what an issued instalment invoice billed each line and cannot be changed or deleted. Later instalments are sliced against them; correct a line through an amount change or a reversal order instead.', 1;
END;
GO


-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- =============================================================================
