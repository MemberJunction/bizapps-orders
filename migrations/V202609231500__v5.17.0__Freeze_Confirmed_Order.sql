-- =============================================================================
-- V202609231500 — Freeze the selling company, order date and parties on a
-- confirmed order (bc-aidp-next-golive#262)
-- =============================================================================
-- Tax obligations are counted per selling company, per state and per date, from
-- confirmed orders, and the audit lookback is years. Before this migration the
-- database froze a booked line's money and nothing else:
--
--   · OrderLine.CompanyID was re-stamped from the product's CURRENT company on
--     every line save, so moving a product to another company and then touching
--     an old confirmed line moved that sale — and its invoice — to the new one.
--   · OrderHeader.OrderDate, CompanyID, the bill-to party, OrderType and
--     ReversesOrderHeaderID were frozen in application code only, or not at all.
--   · Status could leave Confirmed by direct SQL; only OrderStatusBehavior.ts
--     refused it.
--
-- Once any of these is overwritten there is no record on the order of what the
-- sale actually was, so the rule belongs at the database, where direct SQL and
-- bulk paths cannot go around it.
--
-- What this file does:
--   1. trg_OrderLine_ImmutableAfterConfirm (51003) also freezes CompanyID.
--   2. trg_OrderHeader_ImmutableAfterConfirm (new):
--        51013 — the booked header's identity columns cannot change;
--        51014 — Status cannot leave Confirmed.
--
-- THE BILL-TO PARTY IS SET-ONCE, NOT STRICTLY FROZEN. A guest checkout confirms
-- an order with no bill-to person, and the guest-order claim fills it in when the
-- buyer signs in afterwards. Filling an empty party records who bought; it does not
-- rewrite a sale. Replacing or clearing a party that is already set is refused.
--
-- Every other column on a confirmed header stays writable: the rollup totals,
-- DueDate, the initial-payment fields the confirm path stamps, fulfilment, notes
-- and the ship-to party are maintained after booking by design.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. trg_OrderLine_ImmutableAfterConfirm — add CompanyID to 51003
-- -----------------------------------------------------------------------------
-- The body is unchanged apart from the CompanyID comparison. CompanyID is NOT NULL,
-- so a plain comparison is exact.
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
END;
GO


-- -----------------------------------------------------------------------------
-- 2. trg_OrderHeader_ImmutableAfterConfirm — new
-- -----------------------------------------------------------------------------
-- Judged by the PRIOR status (deleted.Status), so the confirming UPDATE itself —
-- Draft or Quoted to Confirmed, with the date and parties settled in the same
-- write — passes, and every later write is checked.
--
-- Nullable columns are compared with the EXISTS / EXCEPT idiom, which treats two
-- NULLs as equal and a NULL against a value as a change.
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_OrderHeader_ImmutableAfterConfirm]
ON [${flyway:defaultSchema}].[OrderHeader]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM deleted WHERE Status = 'Confirmed') RETURN;

    -- Status never leaves Confirmed. Corrections go through a reversal order.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.Status = 'Confirmed'
          AND i.Status <> 'Confirmed'
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51014, 'OrderHeader.Status cannot leave Confirmed (the order is booked under journal entries). Use a reversal order.', 1;
    END;

    -- The booked sale: who sold, to whom, when, and what kind of order it is.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.Status = 'Confirmed'
          AND (
            i.OrderDate <> d.OrderDate OR
            i.CompanyID <> d.CompanyID OR
            i.OrderType <> d.OrderType OR
            EXISTS (SELECT i.ReversesOrderHeaderID EXCEPT SELECT d.ReversesOrderHeaderID) OR
            -- Bill-to: set-once. An empty party may be filled; a set one may not change.
            (d.BillToOrganizationID IS NOT NULL
                AND EXISTS (SELECT i.BillToOrganizationID EXCEPT SELECT d.BillToOrganizationID)) OR
            (d.BillToPersonID IS NOT NULL
                AND EXISTS (SELECT i.BillToPersonID EXCEPT SELECT d.BillToPersonID))
          )
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51013, 'OrderHeader OrderDate, CompanyID, OrderType, ReversesOrderHeaderID and a set bill-to party cannot be changed once the order is Confirmed. Use a reversal order.', 1;
    END;
END;
GO
