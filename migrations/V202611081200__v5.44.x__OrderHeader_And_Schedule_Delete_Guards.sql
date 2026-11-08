-- =============================================================================
-- V202611062330 — OrderHeader and OrderHeaderPaymentSchedule delete guards
-- =============================================================================
-- 1. trg_OrderHeader_ImmutableAfterConfirm becomes AFTER UPDATE, DELETE and
--    adds 51019: a Confirmed order header cannot be deleted. Draft, Quoted and
--    Voided headers can still be deleted.
-- 2. trg_OrderHeaderPaymentSchedule_Immutable (51020) also refuses deleting a
--    company's last non-Canceled payment schedule row once its order is
--    Confirmed, so a scheduled company cannot be left unbilled after confirm.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- trg_OrderHeader_ImmutableAfterConfirm
-- -----------------------------------------------------------------------------
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_OrderHeader_ImmutableAfterConfirm]
ON [${flyway:defaultSchema}].[OrderHeader]
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- 51019: DELETE. Block if any deleted header is Confirmed.
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted WHERE Status = 'Confirmed')
        BEGIN
            THROW 51019, 'OrderHeader cannot be deleted once it is Confirmed (the order is booked under journal entries). Use a reversal order.', 1;
        END;
        RETURN;
    END;

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
        THROW 51017, 'OrderHeader.ConfirmedByUserID cannot be changed once the order is booked: it records who confirmed the order, and is written only by the booking save.', 1;
    END;

    -- 51018: payment terms are a commercial concession. The approval applies the
    -- change in its own transaction: the concession is saved Approved, then the
    -- header is updated, so the concession is visible here. Matching the LATEST
    -- approved Terms concession, not any, keeps an old approval from being
    -- replayed: once a later change is approved, an earlier one no longer matches.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.Status = 'Confirmed'
          AND EXISTS (SELECT i.PaymentTermsTypeID EXCEPT SELECT d.PaymentTermsTypeID)
          AND NOT EXISTS (
              SELECT 1
              FROM (
                  SELECT TOP 1 c.PriorPaymentTermsTypeID, c.NewPaymentTermsTypeID
                  FROM [${flyway:defaultSchema}].[OrderConcession] c
                  WHERE c.OrderHeaderID = d.ID
                    AND c.DeliveryForm = 'Terms'
                    AND c.Status = 'Approved'
                  ORDER BY c.DecidedAt DESC, c.ID DESC
              ) latest
              WHERE EXISTS (SELECT latest.PriorPaymentTermsTypeID INTERSECT SELECT d.PaymentTermsTypeID)
                AND latest.NewPaymentTermsTypeID = i.PaymentTermsTypeID
          )
    )
    BEGIN
        THROW 51018, 'OrderHeader.PaymentTermsTypeID cannot be changed once the order is Confirmed except by an approved Terms concession. Use Orders.AmendArrangement.', 1;
    END;
END;
GO


-- -----------------------------------------------------------------------------
-- trg_OrderHeaderPaymentSchedule_Immutable
-- -----------------------------------------------------------------------------
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_OrderHeaderPaymentSchedule_Immutable]
ON [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- DELETE: only a Scheduled row may go, and never the last non-Canceled row
    -- for its company on a Confirmed order.
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted WHERE Status <> 'Scheduled')
        BEGIN
            THROW 51020, 'An instalment cannot be deleted once it is Invoiced (the customer holds its number). Cancel or write it off instead.', 1;
        END;

        IF EXISTS (
            SELECT 1
            FROM deleted d
            JOIN [${flyway:defaultSchema}].[OrderHeader] o ON o.ID = d.OrderHeaderID
            WHERE o.Status = 'Confirmed'
              AND NOT EXISTS (
                  SELECT 1
                  FROM [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] s
                  WHERE s.OrderHeaderID = d.OrderHeaderID
                    AND s.CompanyID = d.CompanyID
                    AND s.Status <> 'Canceled'
              )
        )
        BEGIN
            THROW 51020, 'A company''s last payment schedule row cannot be deleted once the order is Confirmed (doing so would leave that company unbilled). Re-shape the schedule on a surviving row instead.', 1;
        END;

        RETURN;
    END;

    -- UPDATE past Scheduled: the commitment and its identity are frozen, and it never returns.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.Status <> 'Scheduled'
          AND (
            i.OrderHeaderID     <> d.OrderHeaderID     OR
            i.CompanyID         <> d.CompanyID         OR
            i.InstallmentNumber <> d.InstallmentNumber OR
            i.DueDate           <> d.DueDate           OR
            i.Amount            <> d.Amount            OR
            ISNULL(i.DocumentNumber, '') <> ISNULL(d.DocumentNumber, '') OR
            ISNULL(i.InvoicedAt, '1900-01-01') <> ISNULL(d.InvoicedAt, '1900-01-01') OR
            ISNULL(i.InvoicedByUserID, '00000000-0000-0000-0000-000000000000') <> ISNULL(d.InvoicedByUserID, '00000000-0000-0000-0000-000000000000') OR
            i.Status = 'Scheduled'
          )
    )
    BEGIN
        THROW 51021, 'An Invoiced instalment is frozen: its amount, due date, number and identity cannot change, and it cannot return to Scheduled. Corrections go through a credit memo.', 1;
    END;

    -- Identity is set once, never cleared or replaced — at any status.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE (d.DocumentNumber IS NOT NULL AND (i.DocumentNumber IS NULL OR i.DocumentNumber <> d.DocumentNumber))
           OR (d.JournalEntryID IS NOT NULL AND (i.JournalEntryID IS NULL OR i.JournalEntryID <> d.JournalEntryID))
    )
    BEGIN
        THROW 51022, 'OrderHeaderPaymentSchedule.DocumentNumber and JournalEntryID cannot be cleared or replaced once set.', 1;
    END;
END;
GO
