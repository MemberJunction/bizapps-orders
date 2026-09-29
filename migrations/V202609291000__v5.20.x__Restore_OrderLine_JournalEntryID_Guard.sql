-- =============================================================================
-- V202609291000 — Restore the OrderLine.JournalEntryID guard (51008)
-- (bizapps-orders#262)
-- =============================================================================
-- The baseline gave trg_OrderLine_ImmutableAfterConfirm three checks: 51002 (no
-- delete on a Confirmed order), 51003 (frozen money columns) and 51008 (a line's
-- JournalEntryID, once set, is never cleared or replaced, on any status).
--
-- V202608241300 redefined the trigger to change the status it checks and carried
-- 51002 and 51003 only; V202609231500 redefined it again from that body. Since
-- then nothing at the database stopped a booked line's journal entry link from
-- being cleared or re-pointed by direct SQL, a bulk path, or a save that sends a
-- different value — leaving the booked entry with no line pointing at it, or the
-- line pointing at an entry it did not produce.
--
-- This file redefines the trigger with its current body (51002, and 51003 with
-- CompanyID) unchanged, and puts the 51008 block back as the baseline wrote it.
-- Order booking stamps the link NULL→value once, so no product path is refused.
-- =============================================================================

CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_OrderLine_ImmutableAfterConfirm]
ON [${flyway:defaultSchema}].[OrderLine]
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- DELETE: block if any deleted line belongs to a Confirmed order
    IF NOT EXISTS (SELECT 1 FROM inserted)
       AND EXISTS (
           SELECT 1
           FROM deleted d
           JOIN [${flyway:defaultSchema}].[OrderHeader] o ON o.ID = d.OrderHeaderID
           WHERE o.Status = 'Confirmed'
       )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51002, 'OrderLine cannot be deleted once its order is Confirmed (the line is booked under a journal entry). Use a reversal order.', 1;
    END;

    -- UPDATE: block changes to the frozen columns on lines of Confirmed orders
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        JOIN [${flyway:defaultSchema}].[OrderHeader] o ON o.ID = d.OrderHeaderID
        WHERE o.Status = 'Confirmed'
          AND (
            i.ProductID      <> d.ProductID      OR
            i.CompanyID      <> d.CompanyID      OR
            i.Quantity       <> d.Quantity       OR
            i.UnitPrice      <> d.UnitPrice      OR
            i.DiscountPct    <> d.DiscountPct    OR
            i.LineTax        <> d.LineTax        OR
            ISNULL(i.LineTotalNet,   0) <> ISNULL(d.LineTotalNet,   0) OR
            ISNULL(i.LineTotalGross, 0) <> ISNULL(d.LineTotalGross, 0)
          )
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51003, 'OrderLine financial columns and selling company cannot be changed once its order is Confirmed (the line is booked under a journal entry). Use a reversal order.', 1;
    END;

    -- JournalEntryID: the per-line booking record — NULL→value once, never cleared or
    -- replaced (any status). Set when the line's entry is booked at Confirm. Corrections go
    -- through a reversal order, not by re-pointing the booked entry.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.JournalEntryID IS NOT NULL
          AND (i.JournalEntryID IS NULL OR i.JournalEntryID <> d.JournalEntryID)
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51008, 'OrderLine.JournalEntryID cannot be cleared or replaced once set. Corrections happen via a reversal order, not by re-pointing the booked journal entry.', 1;
    END;
END;
GO
