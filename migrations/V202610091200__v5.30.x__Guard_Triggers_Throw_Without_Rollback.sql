-- =============================================================================
-- V202610091200 — guard triggers refuse a write with THROW alone
-- =============================================================================
-- Each guard trigger below refused a write with ROLLBACK TRANSACTION followed
-- by THROW. MemberJunction saves and deletes through the generated CRUD
-- procedure as INSERT INTO @ResultTable EXEC sp..., and SQL Server does not
-- allow a ROLLBACK statement anywhere inside an INSERT-EXEC, including in a
-- trigger the procedure fires. The ROLLBACK itself then fails with error 3915,
-- "Cannot use the ROLLBACK statement within an INSERT-EXEC statement", and the
-- caller never sees the trigger's own error, which names the rule it broke.
--
-- A trigger runs with XACT_ABORT ON, so THROW on its own ends the batch and
-- rolls back the whole transaction: the refused statement and any earlier work
-- in the same transaction are undone, the same outcome the ROLLBACK gave, and
-- the trigger's error number and message reach the caller unchanged. That
-- holds for a direct UPDATE or DELETE, inside or outside a caller's
-- transaction, and through INSERT-EXEC. One difference: a caller that wraps the
-- write in TRY/CATCH now finds the transaction doomed (XACT_STATE() = -1) rather
-- than already ended, and rolls it back itself, as it must after any error with
-- XACT_ABORT ON. No procedure in this schema catches errors around these writes.
--
-- Each trigger is recreated from the migration that last defined it, with only
-- the ROLLBACK TRANSACTION lines removed. Every check keeps its condition,
-- error number and message, and runs in the same order:
--
--   trg_OrderHeader_ImmutableAfterConfirm        V202610011700
--   trg_OrderLine_ImmutableAfterConfirm          V202609291302
--   trg_PaymentHeader_ImmutableAfterCapture      V202607061432
--   trg_PaymentLine_ImmutableAfterCapture        V202607061432
--   trg_PaymentDetail_Immutable                  V202607061432
--   trg_OrderHeaderPaymentSchedule_Immutable     V202609211200
--   trg_OrderLineProgressMeasurement_Immutable   V202610032200
--   trg_EntitlementAccessOverride_Record         V202609291306
--
-- The baseline wrote the schema name literally; these use the placeholder.
--
-- A later migration that guards a table should refuse with THROW alone. A
-- ROLLBACK in a trigger turns the guard's message into error 3915 for every
-- save made through MemberJunction.
-- =============================================================================
GO


-- -----------------------------------------------------------------------------
-- trg_OrderHeader_ImmutableAfterConfirm
-- -----------------------------------------------------------------------------
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
-- trg_OrderLine_ImmutableAfterConfirm
-- -----------------------------------------------------------------------------
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
        THROW 51008, 'OrderLine.JournalEntryID cannot be cleared or replaced once set. Corrections happen via a reversal order, not by re-pointing the booked journal entry.', 1;
    END;
END;
GO


-- -----------------------------------------------------------------------------
-- trg_PaymentHeader_ImmutableAfterCapture
-- -----------------------------------------------------------------------------
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_PaymentHeader_ImmutableAfterCapture]
ON [${flyway:defaultSchema}].[PaymentHeader]
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- DELETE: block once captured+ (Pending/Failed payments may be deleted)
    IF NOT EXISTS (SELECT 1 FROM inserted)
       AND EXISTS (SELECT 1 FROM deleted WHERE Status IN ('Captured','Refunded','Disputed'))
    BEGIN
        THROW 51004, 'Payment cannot be deleted once Captured. Use a reversal payment (Refund/Chargeback) instead.', 1;
    END;

    -- UPDATE: frozen financial fields once the PREVIOUS status was Captured+
    -- (the capture transition itself may set them in the same statement).
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.Status IN ('Captured','Refunded','Disputed')
          AND (
            i.Amount               <> d.Amount               OR
            i.ProcessingFeeAmount  <> d.ProcessingFeeAmount  OR
            ISNULL(i.NetAmount, 0) <> ISNULL(d.NetAmount, 0) OR
            i.PaymentTypeID        <> d.PaymentTypeID        OR
            i.PaymentDate          <> d.PaymentDate          OR
            i.ReceivingCompanyID   <> d.ReceivingCompanyID   OR
            ISNULL(i.BillToOrganizationID, '00000000-0000-0000-0000-000000000000') <> ISNULL(d.BillToOrganizationID, '00000000-0000-0000-0000-000000000000')
         OR ISNULL(i.BillToPersonID, '00000000-0000-0000-0000-000000000000') <> ISNULL(d.BillToPersonID, '00000000-0000-0000-0000-000000000000')
          )
    )
    BEGIN
        THROW 51005, 'Payment financial fields (Amount/Fees/PaymentType/PaymentDate/ReceivingCompanyID/Customer) are frozen once Captured. Use a reversal payment.', 1;
    END;

    -- JournalEntryID: never cleared or replaced once set (any status)
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.JournalEntryID IS NOT NULL
          AND (i.JournalEntryID IS NULL OR i.JournalEntryID <> d.JournalEntryID)
    )
    BEGIN
        THROW 51006, 'Payment.JournalEntryID cannot be cleared or replaced once set. Corrections happen via a reversal payment.', 1;
    END;

    -- Status may not regress out of a terminal/locked state
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE (d.Status = 'Captured'  AND i.Status IN ('Pending','Failed'))
           OR (d.Status = 'Refunded'  AND i.Status <> 'Refunded')
           OR (d.Status = 'Disputed'  AND i.Status NOT IN ('Disputed','Refunded'))
    )
    BEGIN
        THROW 51007, 'Payment.Status cannot regress (Captured may only advance to Refunded/Disputed; Refunded is terminal).', 1;
    END;
END;
GO


-- -----------------------------------------------------------------------------
-- trg_PaymentLine_ImmutableAfterCapture
-- -----------------------------------------------------------------------------
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_PaymentLine_ImmutableAfterCapture]
ON [${flyway:defaultSchema}].[PaymentLine]
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- DELETE: block if any deleted line belongs to a Captured+ payment
    IF NOT EXISTS (SELECT 1 FROM inserted)
       AND EXISTS (
           SELECT 1
           FROM deleted d
           JOIN [${flyway:defaultSchema}].[PaymentHeader] p ON p.ID = d.PaymentHeaderID
           WHERE p.Status IN ('Captured','Refunded','Disputed')
       )
    BEGIN
        THROW 51010, 'PaymentLine cannot be deleted once its payment is Captured (the allocation is booked under a journal entry). Use a reversal payment or an account-credit transfer.', 1;
    END;

    -- UPDATE: block changes to what the allocation MEANS on a Captured+ payment.
    -- BookedAt is deliberately absent: it is stamped by the booking pass itself,
    -- inside the same transaction that captures.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        JOIN [${flyway:defaultSchema}].[PaymentHeader] p ON p.ID = d.PaymentHeaderID
        WHERE p.Status IN ('Captured','Refunded','Disputed')
          AND (
            i.Amount        <> d.Amount        OR
            i.OrderHeaderID <> d.OrderHeaderID OR
            ISNULL(i.OrderLineID, '00000000-0000-0000-0000-000000000000')
              <> ISNULL(d.OrderLineID, '00000000-0000-0000-0000-000000000000')
          )
    )
    BEGIN
        THROW 51011, 'PaymentLine allocation fields (Amount/OrderHeaderID/OrderLineID) are frozen once the payment is Captured. Use a reversal payment or an account-credit transfer.', 1;
    END;

    -- BookedAt: NULL→value once, never cleared or replaced (any status). Same rule
    -- as OrderLine.JournalEntryID, and for the same reason — it is the idempotency
    -- key that stops a second set of entries being written for the same allocation.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.BookedAt IS NOT NULL
          AND (i.BookedAt IS NULL OR i.BookedAt <> d.BookedAt)
    )
    BEGIN
        THROW 51012, 'PaymentLine.BookedAt cannot be cleared or replaced once set — it is what stops the allocation being booked twice.', 1;
    END;
END;
GO


-- -----------------------------------------------------------------------------
-- trg_PaymentDetail_Immutable
-- -----------------------------------------------------------------------------
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_PaymentDetail_Immutable]
ON [${flyway:defaultSchema}].[PaymentDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i.ID = d.ID
        WHERE ISNULL(i.PaymentTypeID,'00000000-0000-0000-0000-000000000000') <> ISNULL(d.PaymentTypeID,'00000000-0000-0000-0000-000000000000')
           OR ISNULL(i.CompanyID,'00000000-0000-0000-0000-000000000000')     <> ISNULL(d.CompanyID,'00000000-0000-0000-0000-000000000000')
           OR ISNULL(i.ProviderCustomerRef,'')   <> ISNULL(d.ProviderCustomerRef,'')
           OR ISNULL(i.ProviderInstrumentRef,'') <> ISNULL(d.ProviderInstrumentRef,'')
           OR ISNULL(i.Brand,'')          <> ISNULL(d.Brand,'')
           OR ISNULL(i.Last4,'')          <> ISNULL(d.Last4,'')
           OR ISNULL(i.ExpiryMonth,-1)    <> ISNULL(d.ExpiryMonth,-1)
           OR ISNULL(i.ExpiryYear,-1)     <> ISNULL(d.ExpiryYear,-1)
           OR ISNULL(i.BankName,'')       <> ISNULL(d.BankName,'')
           OR ISNULL(i.RoutingLast4,'')   <> ISNULL(d.RoutingLast4,'')
           OR ISNULL(i.AccountLast4,'')   <> ISNULL(d.AccountLast4,'')
           OR ISNULL(i.ReferenceNumber,'') <> ISNULL(d.ReferenceNumber,'')
           OR ISNULL(i.StoredValueAccountID,'00000000-0000-0000-0000-000000000000') <> ISNULL(d.StoredValueAccountID,'00000000-0000-0000-0000-000000000000')
    )
    BEGIN
        THROW 51009, 'PaymentDetail instrument fields are immutable once created. A payment instrument is a point-in-time snapshot; create a NEW PaymentDetail row instead of editing this one.', 1;
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

    -- DELETE: only a Scheduled row may go.
    IF NOT EXISTS (SELECT 1 FROM inserted)
       AND EXISTS (SELECT 1 FROM deleted WHERE Status <> 'Scheduled')
    BEGIN
        THROW 51020, 'An instalment cannot be deleted once it is Invoiced (the customer holds its number). Cancel or write it off instead.', 1;
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


-- -----------------------------------------------------------------------------
-- trg_OrderLineProgressMeasurement_Immutable
-- -----------------------------------------------------------------------------
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
        THROW 51031, 'A progress observation cannot be promoted from Draft to Posted. Posting is what Orders.RecordProgress does, in the same transaction as the journal entry it writes — a row flipped by hand would claim revenue the ledger never saw.', 1;
    END;
END;
GO


-- -----------------------------------------------------------------------------
-- trg_EntitlementAccessOverride_Record
-- -----------------------------------------------------------------------------
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_EntitlementAccessOverride_Record]
ON [${flyway:defaultSchema}].[EntitlementAccessOverride]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i.ID = d.ID
        WHERE i.OrderHeaderID <> d.OrderHeaderID
           OR i.OverrideType <> d.OverrideType
           OR i.Reason <> d.Reason
           OR i.EffectiveThrough <> d.EffectiveThrough
           OR i.RequestedByUserID <> d.RequestedByUserID
           OR ABS(DATEDIFF_BIG(MICROSECOND, i.RequestedAt, d.RequestedAt)) >= 1000
    )
    BEGIN
        THROW 51023, 'An access override''s request (order, type, reason, EffectiveThrough, requester) cannot be changed. Request a new override instead.', 1;
    END;
    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i.ID = d.ID
        WHERE i.Status <> d.Status
          AND NOT (d.Status = 'Requested' AND i.Status IN ('Approved','Rejected','Withdrawn'))
          AND NOT (d.Status = 'Approved' AND i.Status = 'Expired')
    )
    BEGIN
        THROW 51024, 'An access override''s status moves only from Requested to Approved, Rejected or Withdrawn, and from Approved to Expired.', 1;
    END;
    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i.ID = d.ID
        WHERE (d.ApprovalTaskID IS NOT NULL AND (i.ApprovalTaskID IS NULL OR i.ApprovalTaskID <> d.ApprovalTaskID))
           OR (d.DecidedAt IS NOT NULL AND (i.DecidedAt IS NULL OR ABS(DATEDIFF_BIG(MICROSECOND, i.DecidedAt, d.DecidedAt)) >= 1000))
           OR (d.DecidedByUserID IS NOT NULL AND (i.DecidedByUserID IS NULL OR i.DecidedByUserID <> d.DecidedByUserID))
    )
    BEGIN
        THROW 51025, 'An access override''s approval task and decision cannot be rewritten once recorded.', 1;
    END;
END;
GO
