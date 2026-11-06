-- =============================================================================
-- V202611052330 — A payment dated the day its money arrived (bc-aidp-next-golive#448)
-- =============================================================================
-- A wire received on 30 October and entered on 2 November was dated the day it
-- was entered, its cash entry took that date, and a batch posted 30 October left
-- it out. Two corrections, one per place a payment is entered:
--
--   1. OrderHeader.InitialPaymentReceivedDate. The order's initial payment is
--      dated from it when set, and from OrderDate when it is NULL (the day it
--      was dated from before this column existed). OrderEntityServer reads it
--      once, when it creates the payment at confirm.
--
--   2. A captured payment's PaymentDate may change while none of its journal
--      entries is batched. trg_PaymentHeader_ImmutableAfterCapture (51005) froze
--      PaymentDate with the rest of a captured payment's money. It is restated
--      whole from V202610091200 with PaymentDate taken out of 51005, and a new
--      check, 51033, refuses a PaymentDate change once any entry booked from the
--      payment (its own, or one of its allocations') is Batched, GLPosted or in a
--      batch. The application moves those entries to the new day in the same
--      transaction through Accounting.RedatePendingJournalEntries, which applies
--      the same rule and the closed-books dates; 51033 is the floor under it.
--      Every other check is carried forward unchanged.
--
-- Entries are matched on LinkedRecordID, the ID of the payment or allocation
-- that booked them. It is NVARCHAR, so the IDs are compared as text; SQL Server
-- writes a UNIQUEIDENTIFIER in upper case, and the column's collation is case
-- insensitive.
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[OrderHeader]
    ADD [InitialPaymentReceivedDate] DATE NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The day the initial payment''s money arrived, when it differs from the order''s date (for example a wire received before the order was entered). The payment created at confirm is dated from this day, and from OrderDate when it is NULL. Read only at confirm; changing it afterwards does not move the payment, whose date finance corrects on the payment itself.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderHeader',
    @level2type = N'COLUMN', @level2name = N'InitialPaymentReceivedDate';
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
    -- PaymentDate is checked separately below (51033).
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
            i.ReceivingCompanyID   <> d.ReceivingCompanyID   OR
            ISNULL(i.BillToOrganizationID, '00000000-0000-0000-0000-000000000000') <> ISNULL(d.BillToOrganizationID, '00000000-0000-0000-0000-000000000000')
         OR ISNULL(i.BillToPersonID, '00000000-0000-0000-0000-000000000000') <> ISNULL(d.BillToPersonID, '00000000-0000-0000-0000-000000000000')
          )
    )
    BEGIN
        THROW 51005, 'Payment financial fields (Amount/Fees/PaymentType/ReceivingCompanyID/Customer) are frozen once Captured. Use a reversal payment.', 1;
    END;

    -- PaymentDate: a captured payment's date moves only while every journal entry
    -- booked from it or its allocations is still Pending and in no batch.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.Status IN ('Captured','Refunded','Disputed')
          AND i.PaymentDate <> d.PaymentDate
          AND EXISTS (
              SELECT 1
              FROM [__mj_BizAppsAccounting].[JournalEntry] je
              WHERE (je.Status <> 'Pending' OR je.JournalEntryBatchID IS NOT NULL)
                AND (je.LinkedRecordID = CONVERT(NVARCHAR(36), d.ID)
                     OR je.LinkedRecordID IN (
                         SELECT CONVERT(NVARCHAR(36), pl.ID)
                         FROM [${flyway:defaultSchema}].[PaymentLine] pl
                         WHERE pl.PaymentHeaderID = d.ID))
          )
    )
    BEGIN
        THROW 51033, 'Payment.PaymentDate cannot change once any of the payment''s journal entries is batched or posted. Cancel the batch first, or use a reversal payment.', 1;
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

-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Not generated yet. Before merge: apply this migration, run CodeGen, and fold
--   its output in with scripts/append-codegen.sh. It registers the
--   InitialPaymentReceivedDate EntityField on MJ_BizApps_Orders: Order Headers and
--   rebuilds vwOrderHeaders and the OrderHeader CRUD procedures.
--
-- =============================================================================
