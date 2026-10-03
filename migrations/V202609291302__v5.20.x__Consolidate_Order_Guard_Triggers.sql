-- =============================================================================
-- V202609291302 — One guard trigger per order table (bc-aidp-next-golive#288)
-- =============================================================================
-- The rules that freeze a confirmed order were spread over five update triggers,
-- each added by a different migration:
--
--   OrderHeader  trg_OrderHeader_ImmutableAfterConfirm           51013, 51014
--                trg_OrderHeader_AddressFrozenAfterConfirm       51015
--                trg_OrderHeader_ConfirmedByFrozenAfterBooking   51017
--   OrderLine    trg_OrderLine_ImmutableAfterConfirm             51002, 51003, 51008
--                trg_OrderLine_AddressFrozenAfterConfirm         51016
--
-- Every write to either table ran all of them, in no set order, so which rule
-- refused a write that broke two of them was not defined, and reading the full
-- rule for a booked order meant finding every trigger on the table.
--
-- What this file does:
--   1. Drops trg_OrderHeader_AddressFrozenAfterConfirm,
--      trg_OrderHeader_ConfirmedByFrozenAfterBooking and
--      trg_OrderLine_AddressFrozenAfterConfirm.
--   2. Redefines trg_OrderHeader_ImmutableAfterConfirm and
--      trg_OrderLine_ImmutableAfterConfirm to run all of the checks, in the order
--      listed in each trigger's header. Each check keeps its error number, its
--      message and the condition it had in its own trigger.
--
-- The two surviving triggers keep their names, which the integration fixture and
-- test harnesses disable by name. Disabling one now disables all of that table's
-- checks.
--
-- REDEFINING EITHER TRIGGER RESTATES ALL OF ITS CHECKS. CREATE OR ALTER replaces
-- the whole body, so a later migration that changes one check must carry every
-- other check forward unchanged. Two redefinitions dropped 51008 this way
-- (restored by V202609291301). The list in each trigger's header is the checklist.
--
-- The CodeGen timestamp triggers (trgUpdateOrderHeader, trgUpdateOrderLine) and
-- trg_OrderLine_RollupTotals are not guards and stay separate.
-- =============================================================================

DROP TRIGGER [${flyway:defaultSchema}].[trg_OrderHeader_AddressFrozenAfterConfirm];
GO

DROP TRIGGER [${flyway:defaultSchema}].[trg_OrderHeader_ConfirmedByFrozenAfterBooking];
GO

DROP TRIGGER [${flyway:defaultSchema}].[trg_OrderLine_AddressFrozenAfterConfirm];
GO


-- -----------------------------------------------------------------------------
-- trg_OrderHeader_ImmutableAfterConfirm
-- -----------------------------------------------------------------------------
-- Checks, in the order they run:
--   51014  Status cannot leave Confirmed.
--   51013  A confirmed order's OrderDate, CompanyID, OrderType,
--          ReversesOrderHeaderID and a set bill-to party cannot change.
--   51015  On a confirmed order a set bill-to or ship-to address cannot change,
--          and an empty one is filled only together with its snapshot. A written
--          address snapshot never changes, on any status.
--   51017  Once ConfirmedAt is set, ConfirmedByUserID cannot change.
--
-- Each check is judged by the PRIOR row (deleted), so the confirming or booking
-- UPDATE itself passes and every later write is checked. 51013-51015 key on the
-- prior Status. 51017 keys on the prior ConfirmedAt, not Status: an order the
-- data conversion created Confirmed with no ConfirmedAt is booked by its next
-- save, and that save must be allowed to write ConfirmedByUserID.
--
-- Nullable columns are compared with EXISTS / EXCEPT, which treats two NULLs as
-- equal and a NULL against a value as a change.
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_OrderHeader_ImmutableAfterConfirm]
ON [${flyway:defaultSchema}].[OrderHeader]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Every check below needs a prior row that is Confirmed, booked, or carries
    -- a snapshot. A write to draft orders only stops here.
    IF NOT EXISTS (
        SELECT 1
        FROM deleted
        WHERE Status = 'Confirmed'
           OR ConfirmedAt IS NOT NULL
           OR BillToAddressSnapshot IS NOT NULL
           OR ShipToAddressSnapshot IS NOT NULL
    ) RETURN;

    -- 51014: Status never leaves Confirmed. Corrections go through a reversal order.
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

    -- 51013: the booked sale: who sold, to whom, when, and what kind of order it is.
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

    -- 51015: the order keeps the address it was sold to. The snapshot conditions
    -- do not depend on status: a written snapshot is final even if the order's
    -- status were moved by direct SQL.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE (
                d.Status = 'Confirmed'
                AND (
                    (d.BillToAddressID IS NOT NULL
                        AND EXISTS (SELECT i.BillToAddressID EXCEPT SELECT d.BillToAddressID)) OR
                    (d.ShipToAddressID IS NOT NULL
                        AND EXISTS (SELECT i.ShipToAddressID EXCEPT SELECT d.ShipToAddressID)) OR
                    (d.BillToAddressID IS NULL AND i.BillToAddressID IS NOT NULL
                        AND i.BillToAddressSnapshot IS NULL) OR
                    (d.ShipToAddressID IS NULL AND i.ShipToAddressID IS NOT NULL
                        AND i.ShipToAddressSnapshot IS NULL)
                )
              )
           OR (d.BillToAddressSnapshot IS NOT NULL
                AND EXISTS (SELECT i.BillToAddressSnapshot EXCEPT SELECT d.BillToAddressSnapshot))
           OR (d.ShipToAddressSnapshot IS NOT NULL
                AND EXISTS (SELECT i.ShipToAddressSnapshot EXCEPT SELECT d.ShipToAddressSnapshot))
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51015, 'OrderHeader bill-to and ship-to addresses cannot be replaced once the order is Confirmed, and an empty one can be filled only together with its snapshot; the order keeps the address it was sold to. Use a reversal order.', 1;
    END;

    -- 51017: who confirmed the order is written once, by the booking save. An
    -- order booked before the column existed keeps NULL.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.ConfirmedAt IS NOT NULL
          AND EXISTS (SELECT i.ConfirmedByUserID EXCEPT SELECT d.ConfirmedByUserID)
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51017, 'OrderHeader.ConfirmedByUserID cannot be changed once the order is booked: it records who confirmed the order, and is written only by the booking save.', 1;
    END;
END;
GO


-- -----------------------------------------------------------------------------
-- trg_OrderLine_ImmutableAfterConfirm
-- -----------------------------------------------------------------------------
-- Checks, in the order they run:
--   51002  DELETE: a line of a Confirmed order cannot be deleted.
--   51003  UPDATE: a line's money columns and CompanyID cannot change while its
--          order is Confirmed.
--   51016  UPDATE: on a Confirmed order a line's set ship-to address cannot
--          change, and an empty one is filled only together with its snapshot.
--          A written snapshot never changes, on any status.
--   51008  UPDATE: a line's JournalEntryID, once set, is never cleared or
--          replaced, on any status.
--
-- A line has no status of its own; the header's current status decides. The
-- confirm path writes a draft order's existing lines while the header is still
-- Draft, and inserts a new order's lines after the header, so neither write is
-- an UPDATE under a Confirmed header.
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_OrderLine_ImmutableAfterConfirm]
ON [${flyway:defaultSchema}].[OrderLine]
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- 51002: DELETE. Block if any deleted line belongs to a Confirmed order.
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM deleted d
            JOIN [${flyway:defaultSchema}].[OrderHeader] o ON o.ID = d.OrderHeaderID
            WHERE o.Status = 'Confirmed'
        )
        BEGIN
            ROLLBACK TRANSACTION;
            THROW 51002, 'OrderLine cannot be deleted once its order is Confirmed (the line is booked under a journal entry). Use a reversal order.', 1;
        END;
        RETURN;
    END;

    -- 51003: UPDATE. The frozen columns on lines of Confirmed orders.
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

    -- 51016: UPDATE. The line keeps the ship-to address it was sold to.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        JOIN [${flyway:defaultSchema}].[OrderHeader] o ON o.ID = d.OrderHeaderID
        WHERE (
                o.Status = 'Confirmed'
                AND (
                    (d.ShipToAddressID IS NOT NULL
                        AND EXISTS (SELECT i.ShipToAddressID EXCEPT SELECT d.ShipToAddressID)) OR
                    (d.ShipToAddressID IS NULL AND i.ShipToAddressID IS NOT NULL
                        AND i.ShipToAddressSnapshot IS NULL)
                )
              )
           OR (d.ShipToAddressSnapshot IS NOT NULL
                AND EXISTS (SELECT i.ShipToAddressSnapshot EXCEPT SELECT d.ShipToAddressSnapshot))
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51016, 'OrderLine ship-to address cannot be replaced once its order is Confirmed, and an empty one can be filled only together with its snapshot; the line keeps the address it was sold to. Use a reversal order.', 1;
    END;

    -- 51008: UPDATE. JournalEntryID is the per-line booking record: NULL→value
    -- once, never cleared or replaced (any status). Corrections go through a
    -- reversal order, not by re-pointing the booked entry.
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
