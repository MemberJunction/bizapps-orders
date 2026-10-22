-- =============================================================================
-- V202610032200 — the progress-measurement guard ignores the nested
-- __mj_UpdatedAt update
-- =============================================================================
-- OrderLineProgressMeasurement has two AFTER UPDATE triggers and SQL Server
-- gives them no fixed firing order: trg_OrderLineProgressMeasurement_Immutable
-- (51030 / 51031) and CodeGen's trgUpdateOrderLineProgressMeasurement, which
-- stamps __mj_UpdatedAt with a nested UPDATE of the same rows.
--
-- When the __mj_UpdatedAt trigger fires first, its nested UPDATE fires the
-- guard again. In that nested call `deleted` holds the rows as the outer
-- statement left them, so a Draft row just promoted to Posted already reads
-- Posted, and the guard raises 51030 (posted rows are immutable) instead of
-- 51031 (Draft cannot be promoted). The write is still refused, but with the
-- wrong rule, and which error a caller sees depends on trigger order.
--
-- The guard now returns at once when it is running inside the __mj_UpdatedAt
-- trigger. That nested statement only re-stamps rows the outer statement
-- changed, and the outer call of the guard checks those rows itself, so no
-- write goes unchecked and the outer call raises the right error in either
-- order.
--
-- sp_settriggerorder is not used: CREATE OR ALTER on either trigger (CodeGen
-- regenerates its own on every run) clears the setting.
--
-- The rest of the body is V202609260300's, unchanged.
-- =============================================================================

CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_OrderLineProgressMeasurement_Immutable]
ON [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
AFTER UPDATE, DELETE
AS
BEGIN
    -- The __mj_UpdatedAt trigger's nested UPDATE: the outer call checks these rows.
    IF TRIGGER_NESTLEVEL(OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderLineProgressMeasurement]')) > 0 RETURN;

    SET NOCOUNT ON;
    -- Zero-row statements (CodeGen's __mj_UpdatedAt backfill) must not touch anything.
    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;

    -- BACKWARD: a row that was already Posted cannot be changed or deleted.
    IF EXISTS (SELECT 1 FROM deleted WHERE Status = 'Posted')
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51030, 'A posted progress observation is immutable: it cannot be changed or deleted. Record a new observation for the current period instead — the catch-up absorbs the correction.', 1;
    END;

    -- FORWARD: nothing may promote a Draft observation to Posted. The operation
    -- writes its row Posted from the outset, in the same transaction as the
    -- journal entry, so a Draft row becoming Posted means a recognition amount
    -- and a journal entry id were asserted by something that posted neither.
    IF EXISTS (
        SELECT 1
          FROM inserted i
          JOIN deleted d ON d.ID = i.ID
         WHERE d.Status = 'Draft' AND i.Status = 'Posted'
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51031, 'A progress observation cannot be promoted from Draft to Posted. Posting is what Orders.RecordProgress does, in the same transaction as the journal entry it writes — a row flipped by hand would claim revenue the ledger never saw.', 1;
    END;
END;
GO
