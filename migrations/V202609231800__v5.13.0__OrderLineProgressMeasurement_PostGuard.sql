-- V202609231800 — the immutability trigger also looks FORWARD (golive #241, Jeremy on PR #227)
-- =============================================================================
-- Trigger 51030 asked only "was this row already Posted?", which covers editing
-- or deleting a posted observation and nothing else. Jeremy's review names the
-- two paths it misses: a row INSERTED with Status already 'Posted', and a row
-- moved from 'Draft' to 'Posted' outside Orders.RecordProgress. Either writes a
-- posted observation carrying a RecognitionAmount and a JournalEntryID that
-- nothing had to honour — the subledger would then show revenue recognised that
-- the ledger never saw, and neither report would contradict the other.
--
-- WHAT A TRIGGER CAN AND CANNOT SEE. It cannot see its caller, so it cannot ask
-- "did the operation do this?". That splits the two paths:
--
--   Draft -> Posted by UPDATE is refused OUTRIGHT here, because no legitimate
--   path performs it. Orders.RecordProgress inserts the row already Posted,
--   inside the transaction that wrote the journal entry, so this rule has no
--   false positive to worry about and needs no knowledge of the caller.
--
--   INSERT with Status 'Posted' is exactly what the operation itself does, so
--   the trigger cannot distinguish it and this migration does not try. That
--   path is guarded one layer up, in OrderLineProgressMeasurementEntityServer,
--   which CAN see whether the operation registered the row it is saving.
--
-- The residual gap is stated rather than papered over: a raw INSERT of a Posted
-- row, issued outside the entity layer, is indistinguishable at the trigger from
-- the operation's own write and is not caught. Closing it would mean the
-- operation inserting Draft and flipping to Posted, which buys nothing — the
-- flip would then be the indistinguishable statement instead.
-- =============================================================================

CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_OrderLineProgressMeasurement_Immutable]
ON [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
AFTER UPDATE, DELETE
AS
BEGIN
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
