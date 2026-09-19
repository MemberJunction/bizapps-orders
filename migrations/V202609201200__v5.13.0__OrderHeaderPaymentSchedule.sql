-- =============================================================================
-- V202609191200 — OrderHeaderPaymentSchedule: instalments on the order header
-- (bc-aidp-next-golive#239 · orders PR #201 plan Parts A/C/D · D85–D88)
-- =============================================================================
-- An order can now be billed in instalments. Each row is an authored commitment —
-- a date and an amount the customer agreed to — that carries its own invoice
-- identity once invoiced (D87), its own AmountPaid / Balance rollup, and its own
-- lifecycle: editable while Scheduled, frozen once Invoiced (D88).
--
-- AN ORDER WITH NO ROWS BEHAVES EXACTLY AS BEFORE. Nothing here changes the
-- ledger, the document, the ageing or the payment path for such an order; the
-- code synthesises one implicit instalment (the header's DueDate and Balance).
--
-- What this file does, in order:
--   1. The table, its constraints, its column descriptions.
--   2. PaymentLine.OrderHeaderPaymentScheduleID — a payment aimed at one instalment.
--   3. spRecalcOrderHeaderPaymentSchedule — AmountPaid / Balance / Status per row.
--      Named payments count against their row; unnamed ones cascade oldest-due-first.
--   4. spRecalcOrderHeaderTotals — the existing header rollup, extended by ONE line
--      so every path that already recalculates the header (OrderLine, PaymentLine and
--      PaymentHeader triggers) recalculates the schedule too. No new payment triggers.
--   5. Triggers on the schedule table: rollup and immutability. The tie invariant
--      (per-company sum equals the lines' gross) is enforced in code at confirm and
--      at invoicing — see 5.2 for why not by trigger.
--   6. vwOrderHeaders gains NextDueDate — the earliest unpaid instalment's due date,
--      or the header's DueDate when there is no schedule — and IsOverdue reads it.
--      The predicate is OverdueSQL('g', 'nd.NextDueDate') from
--      packages/Entities/src/overdue.ts. Never retype it.
--
-- Every rollup trigger early-returns on a zero-row statement. SQL Server fires AFTER
-- triggers for statements affecting no rows, CodeGen's __mj_UpdatedAt backfill is one,
-- and touching a table-type variable there deadlocks inside the migration's own
-- transaction. The guard is copied verbatim from trg_PaymentLine_RollupTotals.
--
-- CodeGen output for this app is folded below the banner at the end of this file.
-- It was CARVED from the run rather than folded whole, because the shared dev
-- database it ran against had drifted from `next` (older core geo virtual fields,
-- missing LLM-generated validators, FulfillmentStatus value-list rows). Kept: the
-- new entity and everything CodeGen emits for it, the PaymentLine column and its
-- regenerated view/CRUD (diffed against the last committed text: only the new
-- column differs), and the NextDueDate virtual field on Order Headers. Dropped:
-- the Order Headers view/CRUD regeneration and the unrelated value-list churn.
-- Every EntityField Sequence is written by hand as `MAX(Sequence) + 1` (the IsOverdue
-- precedent, V202608131542) rather than the literal CodeGen emits. A literal was only
-- ever free on the database CodeGen ran against, and it collides with
-- UQ_EntityField_EntityID_Sequence on any other; the changes.yml gate enforces this.
-- CodeGen's `+100000` bump blocks are removed with them, since nothing here inserts a
-- literal that could need renumbering out of the way.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The table
-- -----------------------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]', 'U') IS NULL
BEGIN
    CREATE TABLE [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] (
        [ID]                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_OrderHeaderPaymentSchedule_ID] DEFAULT (newsequentialid()),
        [OrderHeaderID]      UNIQUEIDENTIFIER NOT NULL,
        -- Stamped server-side from the lines the row bills, never authored (D86).
        [CompanyID]          UNIQUEIDENTIFIER NOT NULL,
        [InstallmentNumber]  INT              NOT NULL,
        [DueDate]            DATE             NOT NULL,
        [Amount]             DECIMAL(18,2)    NOT NULL,
        [Status]             NVARCHAR(20)     NOT NULL CONSTRAINT [DF_OrderHeaderPaymentSchedule_Status] DEFAULT (N'Scheduled'),

        -- Invoice identity, frozen at invoicing (D87). There is still no Invoice table.
        [DocumentNumber]     NVARCHAR(40)     NULL,
        [InvoicedAt]         DATETIMEOFFSET   NULL,
        [InvoicedByUserID]   UNIQUEIDENTIFIER NULL,
        -- The AR reclass entry (Unbilled -> AR). Soft reference, like OrderLine.JournalEntryID.
        -- Written by AIDP-25 (#240); NULL until then.
        [JournalEntryID]     UNIQUEIDENTIFIER NULL,

        -- What the customer actually holds (D88, plan §8). Written by the outbound
        -- delivery integration; unsent is SentAt IS NULL.
        [ExternalSystem]     NVARCHAR(40)     NULL,
        [ExternalInvoiceRef] NVARCHAR(100)    NULL,
        [SentAt]             DATETIMEOFFSET   NULL,

        -- Trigger-maintained, same statement, same shape as OrderHeader (D41).
        [AmountPaid]         DECIMAL(18,2)    NOT NULL CONSTRAINT [DF_OrderHeaderPaymentSchedule_AmountPaid] DEFAULT (0),
        [Balance]            DECIMAL(18,2)    NULL,
        [Description]        NVARCHAR(500)    NULL,
        [Notes]              NVARCHAR(MAX)    NULL,

        CONSTRAINT [PK_OrderHeaderPaymentSchedule] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [FK_OrderHeaderPaymentSchedule_OrderHeader] FOREIGN KEY ([OrderHeaderID])
            REFERENCES [${flyway:defaultSchema}].[OrderHeader]([ID]),
        CONSTRAINT [FK_OrderHeaderPaymentSchedule_Company] FOREIGN KEY ([CompanyID])
            REFERENCES [__mj].[Company]([ID]),
        CONSTRAINT [FK_OrderHeaderPaymentSchedule_InvoicedByUser] FOREIGN KEY ([InvoicedByUserID])
            REFERENCES [__mj].[User]([ID]),
        CONSTRAINT [UQ_OrderHeaderPaymentSchedule_Installment] UNIQUE ([OrderHeaderID], [CompanyID], [InstallmentNumber]),
        CONSTRAINT [CK_OrderHeaderPaymentSchedule_Status]
            CHECK ([Status] IN (N'Scheduled', N'Invoiced', N'Paid', N'Canceled', N'WrittenOff')),
        CONSTRAINT [CK_OrderHeaderPaymentSchedule_Amount] CHECK ([Amount] > 0),
        -- D87 as structure rather than convention: nothing past Scheduled without an identity.
        -- Canceled is the one exception — a Scheduled row may be cancelled before it is ever invoiced.
        CONSTRAINT [CK_OrderHeaderPaymentSchedule_InvoicedHasIdentity]
            CHECK ([Status] IN (N'Scheduled', N'Canceled') OR ([DocumentNumber] IS NOT NULL AND [InvoicedAt] IS NOT NULL))
    );
END
GO

-- A frozen document number is what the customer's AP department matches on. Two rows
-- must never carry the same one.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_OrderHeaderPaymentSchedule_DocumentNumber')
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX [UX_OrderHeaderPaymentSchedule_DocumentNumber]
        ON [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] ([DocumentNumber])
        WHERE [DocumentNumber] IS NOT NULL;
END
GO

-- Column descriptions: MS_Description is what CodeGen carries into EntityField.Description.
IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]') AND minor_id = 0 AND name = 'MS_Description')
    EXEC sp_addextendedproperty @name = N'MS_Description',
        @value = N'One instalment of an order''s billing schedule (D85). Editable while Scheduled provided the per-company sum still ties to the order; immutable once Invoiced (D88). An order with no rows is billed as one implicit instalment on its DueDate.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'OrderHeaderPaymentSchedule';
GO

DECLARE @descriptions TABLE (Col SYSNAME, Txt NVARCHAR(1000));
INSERT INTO @descriptions (Col, Txt) VALUES
    ('CompanyID',          N'The selling company this instalment bills for. Stamped server-side from the order''s lines (D86), never authored; a multi-company order carries one schedule per company.'),
    ('InstallmentNumber',  N'1-based position within the order and company. Unique per (order, company). Part of the frozen document number, so it must not be renumbered after invoicing.'),
    ('DueDate',            N'When this instalment is due. Re-datable while Scheduled; frozen once Invoiced. The earliest unpaid row''s DueDate is the order''s NextDueDate, which ageing reads.'),
    ('Amount',             N'The instalment amount. Per (order, company) the non-Canceled rows must sum to that company''s LineTotalGross once the order is Confirmed; enforced at confirm and again at invoicing.'),
    ('Status',             N'Scheduled | Invoiced | Paid | Canceled | WrittenOff. Scheduled -> Invoiced is Orders.IssueInstalmentInvoice; Invoiced <-> Paid follows the rollup; WrittenOff and Canceled are explicit and never overwritten.'),
    ('DocumentNumber',     N'The invoice number the customer holds, frozen by Orders.IssueInstalmentInvoice and never recomputed (D87). NULL while Scheduled. Format: ORD-1234-2, or ORD-1234-B2 on a company-split order.'),
    ('InvoicedAt',         N'When the instalment was invoiced. NULL while Scheduled. Set once, never cleared.'),
    ('InvoicedByUserID',   N'Who issued the instalment invoice.'),
    ('JournalEntryID',     N'The AR reclass journal entry (Unbilled Receivable -> Accounts Receivable) booked when the instalment was invoiced. Soft reference into accounting. NULL until the reclass entry ships (AIDP-25).'),
    ('ExternalSystem',     N'The outbound system that holds the invoice (e.g. BillCom). Written by the delivery integration, not by Orders.'),
    ('ExternalInvoiceRef', N'The external system''s own invoice id, so "what is this invoice''s Bill.com id" is answerable from the database.'),
    ('SentAt',             N'When the invoice was delivered to the customer. NULL means unsent — the audit fact behind reversing an unsent invoice.'),
    ('AmountPaid',         N'Trigger-maintained: payments named to this row plus the oldest-due-first share of payments applied to the order as a whole. Never authored.'),
    ('Balance',            N'Trigger-maintained: Amount - AmountPaid, computed in the same statement as AmountPaid. Never authored.'),
    ('Description',        N'What this instalment is for, as it should print on the invoice (e.g. "Year 2 of 3").'),
    ('Notes',              N'Free text. Editable at any status.');

DECLARE @col SYSNAME, @txt NVARCHAR(1000);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT Col, Txt FROM @descriptions;
OPEN cur;
FETCH NEXT FROM cur INTO @col, @txt;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM sys.extended_properties
        WHERE major_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]')
          AND minor_id = COLUMNPROPERTY(OBJECT_ID('[${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]'), @col, 'ColumnId')
          AND name = 'MS_Description'
    )
        EXEC sp_addextendedproperty @name = N'MS_Description', @value = @txt,
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'OrderHeaderPaymentSchedule',
            @level2type = N'COLUMN', @level2name = @col;
    FETCH NEXT FROM cur INTO @col, @txt;
END
CLOSE cur; DEALLOCATE cur;
GO

-- -----------------------------------------------------------------------------
-- 2. PaymentLine.OrderHeaderPaymentScheduleID — direct a payment at one instalment.
--    NULL is the ordinary case and means "against the order", which the rollup
--    below applies oldest-due-first. trg_PaymentLine_ImmutableAfterCapture is
--    not relaxed: a mis-aimed payment is corrected by reversal, not by re-pointing.
-- -----------------------------------------------------------------------------
IF COL_LENGTH('${flyway:defaultSchema}.PaymentLine', 'OrderHeaderPaymentScheduleID') IS NULL
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[PaymentLine]
        ADD [OrderHeaderPaymentScheduleID] UNIQUEIDENTIFIER NULL
            CONSTRAINT [FK_PaymentLine_OrderHeaderPaymentSchedule]
            REFERENCES [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]([ID]);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentLine]')
      AND minor_id = COLUMNPROPERTY(OBJECT_ID('[${flyway:defaultSchema}].[PaymentLine]'), 'OrderHeaderPaymentScheduleID', 'ColumnId')
      AND name = 'MS_Description'
)
    EXEC sp_addextendedproperty @name = N'MS_Description',
        @value = N'The instalment this allocation settles, when the payer said which one ("this is for the 2027 payment"). NULL applies the money to the order as a whole, oldest instalment first. Frozen with the rest of the allocation once the payment is Captured.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'PaymentLine',
        @level2type = N'COLUMN', @level2name = N'OrderHeaderPaymentScheduleID';
GO

-- -----------------------------------------------------------------------------
-- 3. spRecalcOrderHeaderPaymentSchedule — AmountPaid / Balance / Status per row.
--
--    Named payments (OrderHeaderPaymentScheduleID set) count against their row.
--    Unnamed payments are the order-level total, cascaded oldest-due-first into
--    whatever room each row has left after its named payments. A window SUM gives
--    the running room, so the whole thing is one UPDATE.
--
--    Status mirrors spRecalcOrderHeaderTotals: derived between Invoiced and Paid,
--    and NEVER overwrites Scheduled (not yet invoiced, whatever was prepaid),
--    Canceled or WrittenOff, which are explicit acts.
-- -----------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spRecalcOrderHeaderPaymentSchedule]
    @OrderHeaderIDs [${flyway:defaultSchema}].[OrderHeaderIDList] READONLY
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH named AS (
        SELECT pl.OrderHeaderPaymentScheduleID AS ScheduleID, SUM(pl.Amount) AS Paid
        FROM [${flyway:defaultSchema}].[PaymentLine] pl
        JOIN [${flyway:defaultSchema}].[PaymentHeader] ph ON ph.ID = pl.PaymentHeaderID
        JOIN @OrderHeaderIDs ids ON ids.ID = pl.OrderHeaderID
        WHERE pl.OrderHeaderPaymentScheduleID IS NOT NULL
          AND ph.Status IN ('Captured','Refunded','Disputed')
        GROUP BY pl.OrderHeaderPaymentScheduleID
    ),
    unnamed AS (
        SELECT pl.OrderHeaderID, SUM(pl.Amount) AS Paid
        FROM [${flyway:defaultSchema}].[PaymentLine] pl
        JOIN [${flyway:defaultSchema}].[PaymentHeader] ph ON ph.ID = pl.PaymentHeaderID
        JOIN @OrderHeaderIDs ids ON ids.ID = pl.OrderHeaderID
        WHERE pl.OrderHeaderPaymentScheduleID IS NULL
          AND ph.Status IN ('Captured','Refunded','Disputed')
        GROUP BY pl.OrderHeaderID
    ),
    room AS (
        SELECT s.ID,
               s.OrderHeaderID,
               s.Amount,
               s.Status,
               ISNULL(n.Paid, 0) AS Named,
               -- What this row can still absorb from unnamed cash, and the running total of that
               -- through this row in oldest-due-first order. Canceled rows absorb nothing.
               CASE WHEN s.Status = 'Canceled' THEN 0
                    ELSE CASE WHEN s.Amount - ISNULL(n.Paid, 0) > 0 THEN s.Amount - ISNULL(n.Paid, 0) ELSE 0 END
               END AS Room,
               SUM(CASE WHEN s.Status = 'Canceled' THEN 0
                        ELSE CASE WHEN s.Amount - ISNULL(n.Paid, 0) > 0 THEN s.Amount - ISNULL(n.Paid, 0) ELSE 0 END
                   END) OVER (PARTITION BY s.OrderHeaderID
                              ORDER BY s.DueDate, s.InstallmentNumber, s.CompanyID
                              ROWS UNBOUNDED PRECEDING) AS RoomThrough,
               ISNULL(u.Paid, 0) AS Unnamed
        FROM [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] s
        JOIN @OrderHeaderIDs ids ON ids.ID = s.OrderHeaderID
        LEFT JOIN named n ON n.ScheduleID = s.ID
        LEFT JOIN unnamed u ON u.OrderHeaderID = s.OrderHeaderID
    ),
    computed AS (
        SELECT ID, Status, Amount,
               Named + CASE WHEN Unnamed >= RoomThrough THEN Room
                            WHEN Unnamed > RoomThrough - Room THEN Unnamed - (RoomThrough - Room)
                            ELSE 0 END AS Paid
        FROM room
    ),
    final AS (
        SELECT ID,
               Paid,
               Amount - Paid AS Balance,
               CASE WHEN Status IN ('Scheduled','Canceled','WrittenOff') THEN Status
                    WHEN Amount - Paid <= 0 THEN 'Paid'
                    ELSE 'Invoiced'
               END AS NewStatus
        FROM computed
    )
    UPDATE s
    SET AmountPaid = f.Paid,
        Balance    = f.Balance,
        Status     = f.NewStatus
    FROM [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] s
    JOIN final f ON f.ID = s.ID
    -- Only rows whose figures actually move, so an unchanged row is not rewritten (and its
    -- immutability trigger not re-run) every time a sibling changes.
    WHERE s.AmountPaid <> f.Paid
       OR ISNULL(s.Balance, -1) <> f.Balance
       OR s.Status <> f.NewStatus;
END;
GO

-- -----------------------------------------------------------------------------
-- 4. spRecalcOrderHeaderTotals — as V202608241300 left it, plus the last EXEC.
--    Every trigger that already keeps the header's money current (OrderLine,
--    PaymentLine, PaymentHeader) now keeps the schedule current through it.
-- -----------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spRecalcOrderHeaderTotals]
    @OrderHeaderIDs [${flyway:defaultSchema}].[OrderHeaderIDList] READONLY
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE o
    SET TotalGross = ISNULL(l.LineTotal, 0),
        AmountPaid = ISNULL(p.Paid, 0),
        Balance    = ISNULL(l.LineTotal, 0) - ISNULL(p.Paid, 0),
        FulfillmentStatus =
            CASE
                WHEN o.Status IN ('Draft', 'Quoted', 'Voided') THEN 'Pending'
                WHEN ISNULL(f.RequiresFulfillmentCount, 0) = 0 THEN 'NotApplicable'
                WHEN f.FulfilledCount = f.RequiresFulfillmentCount THEN 'Fulfilled'
                WHEN f.FulfilledCount > 0 THEN 'PartiallyFulfilled'
                ELSE 'Pending'
            END
    FROM [${flyway:defaultSchema}].[OrderHeader] o
    JOIN @OrderHeaderIDs ids ON ids.ID = o.ID
    OUTER APPLY (
        SELECT SUM(ol.LineTotalGross) AS LineTotal
        FROM [${flyway:defaultSchema}].[OrderLine] ol WHERE ol.OrderHeaderID = o.ID
    ) l
    OUTER APPLY (
        SELECT SUM(pl.Amount) AS Paid
        FROM [${flyway:defaultSchema}].[PaymentLine] pl
        JOIN [${flyway:defaultSchema}].[PaymentHeader] ph ON ph.ID = pl.PaymentHeaderID
        WHERE pl.OrderHeaderID = o.ID AND ph.Status IN ('Captured','Refunded','Disputed')
    ) p
    OUTER APPLY (
        SELECT
            COUNT(CASE WHEN pt.RequiresFulfillment = 1 AND ol.ReversesOrderLineID IS NULL THEN 1 END) AS RequiresFulfillmentCount,
            COUNT(CASE WHEN pt.RequiresFulfillment = 1 AND ol.ReversesOrderLineID IS NULL AND ol.FulfillmentStatus = 'Fulfilled' THEN 1 END) AS FulfilledCount
        FROM [${flyway:defaultSchema}].[OrderLine] ol
        JOIN [${flyway:defaultSchema}].[Product] pr ON pr.ID = ol.ProductID
        JOIN [${flyway:defaultSchema}].[ProductType] pt ON pt.ID = pr.ProductTypeID
        WHERE ol.OrderHeaderID = o.ID
    ) f;

    EXEC [${flyway:defaultSchema}].[spRecalcOrderHeaderPaymentSchedule] @OrderHeaderIDs;
END;
GO

-- -----------------------------------------------------------------------------
-- 5. Triggers on the schedule table
-- -----------------------------------------------------------------------------

-- 5.1 Rollup: a row added, re-amounted or removed changes its own Balance.
--     Writes to its own table do not re-fire this trigger (RECURSIVE_TRIGGERS is off).
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_OrderHeaderPaymentSchedule_RollupTotals]
ON [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- Nothing changed, nothing to recalculate. This is not just an optimization: SQL Server fires
    -- AFTER triggers even for statements that affect ZERO rows, and CodeGen's `__mj_CreatedAt` /
    -- `__mj_UpdatedAt` backfills are exactly that — `UPDATE ... WHERE col IS NULL` against an empty
    -- table, inside the migration's transaction. Touching a variable of a user-defined table type
    -- there DEADLOCKS, because the transaction that created the type still holds its metadata lock
    -- (see the baseline migration header note). Returning first means the type is never referenced
    -- during the migration at all.
    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;

    DECLARE @ids [${flyway:defaultSchema}].[OrderHeaderIDList];
    INSERT INTO @ids (ID)
        SELECT OrderHeaderID FROM inserted
        UNION
        SELECT OrderHeaderID FROM deleted;
    EXEC [${flyway:defaultSchema}].[spRecalcOrderHeaderPaymentSchedule] @ids;
END;
GO

-- 5.2 Immutability by lifecycle (D88).
--
--     A Scheduled row may be re-dated, re-amounted or removed. Anything past Scheduled
--     is frozen except the columns the rollup and the delivery integration own
--     (AmountPaid, Balance, Status advancing, SentAt, ExternalSystem, ExternalInvoiceRef)
--     and the annotations (Description, Notes). Identity columns are NULL -> value once.
--
--     THE TIE IS NOT A TRIGGER, deliberately, though plan §4.3 asked for one. Rows are
--     saved one at a time through the entity API, and splitting or re-amounting an
--     instalment on a confirmed order necessarily passes through a state where the sum
--     does not tie — a statement-level trigger would refuse every such edit. The tie is
--     enforced where booked money would otherwise have nowhere to go: at confirm
--     (OrderEntityServer refuses and names the shortfall) and at invoicing
--     (Orders.IssueInstalmentInvoice refuses to issue against a schedule that does not tie).
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
        ROLLBACK TRANSACTION;
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
        ROLLBACK TRANSACTION;
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
        ROLLBACK TRANSACTION;
        THROW 51022, 'OrderHeaderPaymentSchedule.DocumentNumber and JournalEntryID cannot be cleared or replaced once set.', 1;
    END;
END;
GO

-- -----------------------------------------------------------------------------
-- 6. vwOrderHeaders: NextDueDate, and IsOverdue judged on it.
--
--    NextDueDate is the earliest DueDate among unpaid, live instalments, or the
--    header's own DueDate when the order has none — the implicit single instalment,
--    so an order with no schedule reads exactly as it did.
--
--    THE PREDICATE IS OverdueSQL('g', 'nd.NextDueDate') FROM packages/Entities/src/overdue.ts.
--    overdue.test.ts asserts every clause of it survives here. Change the module, not this.
-- -----------------------------------------------------------------------------
CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwOrderHeaders]
AS
SELECT
    g.*,
    nd.NextDueDate,
    CASE WHEN g.Balance > 0 AND nd.NextDueDate IS NOT NULL AND nd.NextDueDate < CAST(GETUTCDATE() AS date) AND g.Status NOT IN ('Draft','Quoted','Voided')
         THEN 1 ELSE 0 END AS IsOverdue
FROM [${flyway:defaultSchema}].[vwOrderHeadersGenerated] g
CROSS APPLY (
    SELECT COALESCE(
        (SELECT MIN(s.DueDate)
           FROM [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] s
          WHERE s.OrderHeaderID = g.ID
            AND s.Status IN ('Scheduled','Invoiced')
            AND s.Balance > 0),
        g.DueDate) AS NextDueDate
) nd;
GO

GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL (entity + field metadata, vwOrderHeaderPaymentSchedules,
-- CRUD procs, permissions, the NextDueDate virtual field on Order Headers, and the
-- PaymentLine column) is folded here by scripts/append-codegen.sh.
-- =============================================================================


/* SQL generated to create new entity MJ_BizApps_Orders: Order Header Payment Schedules */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'ebff8eaf-1ede-4988-b32d-92cde85e5560',
         'MJ_BizApps_Orders: Order Header Payment Schedules',
         'Order Header Payment Schedules',
         'One instalment of an order''s billing schedule (D85). Editable while Scheduled provided the per-company sum still ties to the order; immutable once Invoiced (D88). An order with no rows is billed as one implicit instalment on its DueDate.',
         NULL,
         'OrderHeaderPaymentSchedule',
         'vwOrderHeaderPaymentSchedules',
         '${flyway:defaultSchema}',
         1,
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_Orders: Order Header Payment Schedules to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'ebff8eaf-1ede-4988-b32d-92cde85e5560', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Header Payment Schedules for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ebff8eaf-1ede-4988-b32d-92cde85e5560', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Header Payment Schedules for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ebff8eaf-1ede-4988-b32d-92cde85e5560', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Header Payment Schedules for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ebff8eaf-1ede-4988-b32d-92cde85e5560', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderHeaderPaymentSchedule */
ALTER TABLE [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderHeaderPaymentSchedule */
UPDATE [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderHeaderPaymentSchedule */
ALTER TABLE [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderHeaderPaymentSchedule */
ALTER TABLE [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] ADD CONSTRAINT [DF___mj_BizAppsOrders_OrderHeaderPaymentSchedule___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderHeaderPaymentSchedule */
ALTER TABLE [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderHeaderPaymentSchedule */
UPDATE [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderHeaderPaymentSchedule */
ALTER TABLE [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderHeaderPaymentSchedule */
ALTER TABLE [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] ADD CONSTRAINT [DF___mj_BizAppsOrders_OrderHeaderPaymentSchedule___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 25 new entity field(s) */
-- (Sequence bump for Payment Lines removed by hand: the new field is sequenced after MAX below, so existing rows keep their order.)

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '83359c17-0a6e-43e6-82c7-872a472a535c' OR (EntityID = '83A06268-2C96-400F-9CC8-21EEEF6654D1' AND Name = 'OrderHeaderPaymentScheduleID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '83359c17-0a6e-43e6-82c7-872a472a535c',
            '83A06268-2C96-400F-9CC8-21EEEF6654D1', -- Entity: MJ_BizApps_Orders: Payment Lines
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '83A06268-2C96-400F-9CC8-21EEEF6654D1') + 1,
            'OrderHeaderPaymentScheduleID',
            'Order Header Payment Schedule ID',
            'The instalment this allocation settles, when the payer said which one ("this is for the 2027 payment"). NULL applies the money to the order as a whole, oldest instalment first. Frozen with the rest of the allocation once the payment is Captured.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;
-- (CodeGen's +100000 Sequence bump for entity FC529BC8-FF09-44A9-B454-26EAFDAC791B removed by hand — see the migration header.)

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e8a34b4f-b280-4673-b278-95dff63db84b' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = 'NextDueDate')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e8a34b4f-b280-4673-b278-95dff63db84b',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B') + 1,
            'NextDueDate',
            'Next Due Date',
            NULL,
            'date',
            3,
            10,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;
-- (CodeGen's +100000 Sequence bump for entity EBFF8EAF-1EDE-4988-B32D-92CDE85E5560 removed by hand — see the migration header.)

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '852a46cf-86ab-44dc-a760-3261bac621dd' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'ID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '852a46cf-86ab-44dc-a760-3261bac621dd',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ae47353d-9455-4411-a5ea-e4e079a46bf2' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'OrderHeaderID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ae47353d-9455-4411-a5ea-e4e079a46bf2',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'OrderHeaderID',
            'Order Header ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f7cc31fd-84a4-46cc-a883-f1b303b43279' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'CompanyID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f7cc31fd-84a4-46cc-a883-f1b303b43279',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'CompanyID',
            'Company ID',
            'The selling company this instalment bills for. Stamped server-side from the order''s lines (D86), never authored; a multi-company order carries one schedule per company.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'D4238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd80d941c-6123-4dec-b62b-68f0fea25aff' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'InstallmentNumber')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd80d941c-6123-4dec-b62b-68f0fea25aff',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'InstallmentNumber',
            'Installment Number',
            '1-based position within the order and company. Unique per (order, company). Part of the frozen document number, so it must not be renumbered after invoicing.',
            'int',
            4,
            10,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '912ee21d-dcde-4f7f-99c9-f77f730293ee' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'DueDate')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '912ee21d-dcde-4f7f-99c9-f77f730293ee',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'DueDate',
            'Due Date',
            'When this instalment is due. Re-datable while Scheduled; frozen once Invoiced. The earliest unpaid row''s DueDate is the order''s NextDueDate, which ageing reads.',
            'date',
            3,
            10,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8fdb348f-d2ba-4f56-97cd-6101d43665b0' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'Amount')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8fdb348f-d2ba-4f56-97cd-6101d43665b0',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'Amount',
            'Amount',
            'The instalment amount. Per (order, company) the non-Canceled rows must sum to that company''s LineTotalGross once the order is Confirmed; enforced at confirm and again at invoicing.',
            'decimal',
            9,
            18,
            2,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c615094e-72cc-4d1d-9896-65e0a2fbb571' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'Status')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c615094e-72cc-4d1d-9896-65e0a2fbb571',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'Status',
            'Status',
            'Scheduled | Invoiced | Paid | Canceled | WrittenOff. Scheduled -> Invoiced is Orders.IssueInstalmentInvoice; Invoiced <-> Paid follows the rollup; WrittenOff and Canceled are explicit and never overwritten.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Scheduled',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4dfe941d-ef3b-4095-a2b3-1d0ffc1ff5de' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'DocumentNumber')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4dfe941d-ef3b-4095-a2b3-1d0ffc1ff5de',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'DocumentNumber',
            'Document Number',
            'The invoice number the customer holds, frozen by Orders.IssueInstalmentInvoice and never recomputed (D87). NULL while Scheduled. Format: ORD-1234-2, or ORD-1234-B2 on a company-split order.',
            'nvarchar',
            80,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '46490338-70c9-47b8-8a72-0d2383899051' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'InvoicedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '46490338-70c9-47b8-8a72-0d2383899051',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'InvoicedAt',
            'Invoiced At',
            'When the instalment was invoiced. NULL while Scheduled. Set once, never cleared.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2e77e9e8-9767-416a-8293-2bb58563314d' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'InvoicedByUserID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2e77e9e8-9767-416a-8293-2bb58563314d',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'InvoicedByUserID',
            'Invoiced By User ID',
            'Who issued the instalment invoice.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0b148b5c-b1cd-4469-9a78-55f470513be3' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'JournalEntryID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0b148b5c-b1cd-4469-9a78-55f470513be3',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'JournalEntryID',
            'Journal Entry ID',
            'The AR reclass journal entry (Unbilled Receivable -> Accounts Receivable) booked when the instalment was invoiced. Soft reference into accounting. NULL until the reclass entry ships (AIDP-25).',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fb9bd488-089e-4ac8-a0e7-e13f7daba0dd' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'ExternalSystem')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fb9bd488-089e-4ac8-a0e7-e13f7daba0dd',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'ExternalSystem',
            'External System',
            'The outbound system that holds the invoice (e.g. BillCom). Written by the delivery integration, not by Orders.',
            'nvarchar',
            80,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c4bdffb5-4313-4fc0-a112-c7a8332aa09f' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'ExternalInvoiceRef')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c4bdffb5-4313-4fc0-a112-c7a8332aa09f',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'ExternalInvoiceRef',
            'External Invoice Ref',
            'The external system''s own invoice id, so "what is this invoice''s Bill.com id" is answerable from the database.',
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '980ca142-a0bf-4e7e-abdd-0790fd0244f6' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'SentAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '980ca142-a0bf-4e7e-abdd-0790fd0244f6',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'SentAt',
            'Sent At',
            'When the invoice was delivered to the customer. NULL means unsent — the audit fact behind reversing an unsent invoice.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cdde420f-a6fc-4a91-a388-138a05146c2a' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'AmountPaid')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cdde420f-a6fc-4a91-a388-138a05146c2a',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'AmountPaid',
            'Amount Paid',
            'Trigger-maintained: payments named to this row plus the oldest-due-first share of payments applied to the order as a whole. Never authored.',
            'decimal',
            9,
            18,
            2,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6c91efe9-8bba-4eaa-bef4-08e0e3cb3f41' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'Balance')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6c91efe9-8bba-4eaa-bef4-08e0e3cb3f41',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'Balance',
            'Balance',
            'Trigger-maintained: Amount - AmountPaid, computed in the same statement as AmountPaid. Never authored.',
            'decimal',
            9,
            18,
            2,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ec720d5d-e3f1-4bc8-a4a7-9bdcc007e52e' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'Description')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ec720d5d-e3f1-4bc8-a4a7-9bdcc007e52e',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'Description',
            'Description',
            'What this instalment is for, as it should print on the invoice (e.g. "Year 2 of 3").',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e3a49faf-a26b-4cea-9fae-8dfd747066ca' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'Notes')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e3a49faf-a26b-4cea-9fae-8dfd747066ca',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'Notes',
            'Notes',
            'Free text. Editable at any status.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5fe9bd0f-e622-4c0a-a60e-890edb6d6c14' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5fe9bd0f-e622-4c0a-a60e-890edb6d6c14',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ec0254f1-5673-4e6e-a681-96e127c150cf' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ec0254f1-5673-4e6e-a681-96e127c150cf',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID 630369f3-035d-493b-94ca-0ae81fd10e78 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('630369f3-035d-493b-94ca-0ae81fd10e78', 'C615094E-72CC-4D1D-9896-65E0A2FBB571', 1, 'Canceled', 'Canceled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e17c56b3-fa21-4d9c-80b5-ed95b13905ae */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e17c56b3-fa21-4d9c-80b5-ed95b13905ae', 'C615094E-72CC-4D1D-9896-65E0A2FBB571', 2, 'Invoiced', 'Invoiced', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a84d66fb-81c8-496e-b3c9-1cdafbf5df16 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a84d66fb-81c8-496e-b3c9-1cdafbf5df16', 'C615094E-72CC-4D1D-9896-65E0A2FBB571', 3, 'Paid', 'Paid', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 939b15cd-097d-4077-a7b7-27df245b3a60 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('939b15cd-097d-4077-a7b7-27df245b3a60', 'C615094E-72CC-4D1D-9896-65E0A2FBB571', 4, 'Scheduled', 'Scheduled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 309389cc-613b-4baf-8a2e-d5f01999de32 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('309389cc-613b-4baf-8a2e-d5f01999de32', 'C615094E-72CC-4D1D-9896-65E0A2FBB571', 5, 'WrittenOff', 'WrittenOff', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C615094E-72CC-4D1D-9896-65E0A2FBB571 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='C615094E-72CC-4D1D-9896-65E0A2FBB571';


/* Create Entity Relationship: MJ_BizApps_Orders: Order Headers -> MJ_BizApps_Orders: Order Header Payment Schedules (One To Many via OrderHeaderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'dfc641b6-5076-45ef-b60c-402a8d5882aa'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dfc641b6-5076-45ef-b60c-402a8d5882aa', 'FC529BC8-FF09-44A9-B454-26EAFDAC791B', 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', 'OrderHeaderID', 'One To Many', 1, 1, 11, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Companies -> MJ_BizApps_Orders: Order Header Payment Schedules (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '00f42878-f4c8-4826-98e1-ceeb552e6f6b'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('00f42878-f4c8-4826-98e1-ceeb552e6f6b', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', 'CompanyID', 'One To Many', 1, 1, 30, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Order Header Payment Schedules (One To Many via InvoicedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '89e11df1-2f54-4879-8ac1-c87214603ff4'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('89e11df1-2f54-4879-8ac1-c87214603ff4', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', 'InvoicedByUserID', 'One To Many', 1, 1, 118, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Order Header Payment Schedules -> MJ_BizApps_Orders: Payment Lines (One To Many via OrderHeaderPaymentScheduleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'c939aeb5-f2b1-4a80-bf4e-e16232476970'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c939aeb5-f2b1-4a80-bf4e-e16232476970', 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', '83A06268-2C96-400F-9CC8-21EEEF6654D1', 'OrderHeaderPaymentScheduleID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for OrderHeaderPaymentSchedule */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderHeaderID in table OrderHeaderPaymentSchedule
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeaderPaymentSchedule_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeaderPaymentSchedule_OrderHeaderID ON [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] ([OrderHeaderID]);

-- Index for foreign key CompanyID in table OrderHeaderPaymentSchedule
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeaderPaymentSchedule_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeaderPaymentSchedule_CompanyID ON [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] ([CompanyID]);

-- Index for foreign key InvoicedByUserID in table OrderHeaderPaymentSchedule
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeaderPaymentSchedule_InvoicedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeaderPaymentSchedule_InvoicedByUserID ON [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] ([InvoicedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID AE47353D-9455-4411-A5EA-E4E079A46BF2 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='AE47353D-9455-4411-A5EA-E4E079A46BF2', @RelatedEntityNameFieldMap='OrderHeader';

/* SQL text to update entity field related entity name field map for entity field ID F7CC31FD-84A4-46CC-A883-F1B303B43279 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F7CC31FD-84A4-46CC-A883-F1B303B43279', @RelatedEntityNameFieldMap='Company';

/* SQL text to update entity field related entity name field map for entity field ID 2E77E9E8-9767-416A-8293-2BB58563314D */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2E77E9E8-9767-416A-8293-2BB58563314D', @RelatedEntityNameFieldMap='InvoicedByUser';

/* Base View SQL for MJ_BizApps_Orders: Order Header Payment Schedules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
-- Item: vwOrderHeaderPaymentSchedules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Header Payment Schedules
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderHeaderPaymentSchedule
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaderPaymentSchedules]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderHeaderPaymentSchedules];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderHeaderPaymentSchedules]
AS
SELECT
    o.*,
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader],
    MJCompany_CompanyID.[Name] AS [Company],
    MJUser_InvoicedByUserID.[Name] AS [InvoicedByUser]
FROM
    [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] AS o
INNER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [o].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [o].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_InvoicedByUserID
  ON
    [o].[InvoicedByUserID] = MJUser_InvoicedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderHeaderPaymentSchedules] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Header Payment Schedules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
-- Item: Permissions for vwOrderHeaderPaymentSchedules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderHeaderPaymentSchedules] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Order Header Payment Schedules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
-- Item: spCreateOrderHeaderPaymentSchedule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderHeaderPaymentSchedule
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderHeaderPaymentSchedule]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderHeaderPaymentSchedule];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderHeaderPaymentSchedule]
    @ID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @InstallmentNumber int,
    @DueDate date,
    @Amount decimal(18, 2),
    @Status nvarchar(20) = NULL,
    @DocumentNumber_Clear bit = 0,
    @DocumentNumber nvarchar(40) = NULL,
    @InvoicedAt_Clear bit = 0,
    @InvoicedAt datetimeoffset = NULL,
    @InvoicedByUserID_Clear bit = 0,
    @InvoicedByUserID uniqueidentifier = NULL,
    @JournalEntryID_Clear bit = 0,
    @JournalEntryID uniqueidentifier = NULL,
    @ExternalSystem_Clear bit = 0,
    @ExternalSystem nvarchar(40) = NULL,
    @ExternalInvoiceRef_Clear bit = 0,
    @ExternalInvoiceRef nvarchar(100) = NULL,
    @SentAt_Clear bit = 0,
    @SentAt datetimeoffset = NULL,
    @AmountPaid decimal(18, 2) = NULL,
    @Balance_Clear bit = 0,
    @Balance decimal(18, 2) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(500) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]
            (
                [ID],
                [OrderHeaderID],
                [CompanyID],
                [InstallmentNumber],
                [DueDate],
                [Amount],
                [Status],
                [DocumentNumber],
                [InvoicedAt],
                [InvoicedByUserID],
                [JournalEntryID],
                [ExternalSystem],
                [ExternalInvoiceRef],
                [SentAt],
                [AmountPaid],
                [Balance],
                [Description],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderHeaderID,
                @CompanyID,
                @InstallmentNumber,
                @DueDate,
                @Amount,
                ISNULL(@Status, 'Scheduled'),
                CASE WHEN @DocumentNumber_Clear = 1 THEN NULL ELSE ISNULL(@DocumentNumber, NULL) END,
                CASE WHEN @InvoicedAt_Clear = 1 THEN NULL ELSE ISNULL(@InvoicedAt, NULL) END,
                CASE WHEN @InvoicedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@InvoicedByUserID, NULL) END,
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END,
                CASE WHEN @ExternalSystem_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSystem, NULL) END,
                CASE WHEN @ExternalInvoiceRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalInvoiceRef, NULL) END,
                CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, NULL) END,
                ISNULL(@AmountPaid, 0),
                CASE WHEN @Balance_Clear = 1 THEN NULL ELSE ISNULL(@Balance, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]
            (
                [OrderHeaderID],
                [CompanyID],
                [InstallmentNumber],
                [DueDate],
                [Amount],
                [Status],
                [DocumentNumber],
                [InvoicedAt],
                [InvoicedByUserID],
                [JournalEntryID],
                [ExternalSystem],
                [ExternalInvoiceRef],
                [SentAt],
                [AmountPaid],
                [Balance],
                [Description],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderHeaderID,
                @CompanyID,
                @InstallmentNumber,
                @DueDate,
                @Amount,
                ISNULL(@Status, 'Scheduled'),
                CASE WHEN @DocumentNumber_Clear = 1 THEN NULL ELSE ISNULL(@DocumentNumber, NULL) END,
                CASE WHEN @InvoicedAt_Clear = 1 THEN NULL ELSE ISNULL(@InvoicedAt, NULL) END,
                CASE WHEN @InvoicedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@InvoicedByUserID, NULL) END,
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END,
                CASE WHEN @ExternalSystem_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSystem, NULL) END,
                CASE WHEN @ExternalInvoiceRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalInvoiceRef, NULL) END,
                CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, NULL) END,
                ISNULL(@AmountPaid, 0),
                CASE WHEN @Balance_Clear = 1 THEN NULL ELSE ISNULL(@Balance, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderHeaderPaymentSchedules] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderHeaderPaymentSchedule] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Header Payment Schedules */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderHeaderPaymentSchedule] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Header Payment Schedules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
-- Item: spUpdateOrderHeaderPaymentSchedule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderHeaderPaymentSchedule
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderHeaderPaymentSchedule]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderHeaderPaymentSchedule];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderHeaderPaymentSchedule]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier = NULL,
    @InstallmentNumber int = NULL,
    @DueDate date = NULL,
    @Amount decimal(18, 2) = NULL,
    @Status nvarchar(20) = NULL,
    @DocumentNumber_Clear bit = 0,
    @DocumentNumber nvarchar(40) = NULL,
    @InvoicedAt_Clear bit = 0,
    @InvoicedAt datetimeoffset = NULL,
    @InvoicedByUserID_Clear bit = 0,
    @InvoicedByUserID uniqueidentifier = NULL,
    @JournalEntryID_Clear bit = 0,
    @JournalEntryID uniqueidentifier = NULL,
    @ExternalSystem_Clear bit = 0,
    @ExternalSystem nvarchar(40) = NULL,
    @ExternalInvoiceRef_Clear bit = 0,
    @ExternalInvoiceRef nvarchar(100) = NULL,
    @SentAt_Clear bit = 0,
    @SentAt datetimeoffset = NULL,
    @AmountPaid decimal(18, 2) = NULL,
    @Balance_Clear bit = 0,
    @Balance decimal(18, 2) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(500) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [InstallmentNumber] = ISNULL(@InstallmentNumber, [InstallmentNumber]),
        [DueDate] = ISNULL(@DueDate, [DueDate]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [Status] = ISNULL(@Status, [Status]),
        [DocumentNumber] = CASE WHEN @DocumentNumber_Clear = 1 THEN NULL ELSE ISNULL(@DocumentNumber, [DocumentNumber]) END,
        [InvoicedAt] = CASE WHEN @InvoicedAt_Clear = 1 THEN NULL ELSE ISNULL(@InvoicedAt, [InvoicedAt]) END,
        [InvoicedByUserID] = CASE WHEN @InvoicedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@InvoicedByUserID, [InvoicedByUserID]) END,
        [JournalEntryID] = CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, [JournalEntryID]) END,
        [ExternalSystem] = CASE WHEN @ExternalSystem_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSystem, [ExternalSystem]) END,
        [ExternalInvoiceRef] = CASE WHEN @ExternalInvoiceRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalInvoiceRef, [ExternalInvoiceRef]) END,
        [SentAt] = CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, [SentAt]) END,
        [AmountPaid] = ISNULL(@AmountPaid, [AmountPaid]),
        [Balance] = CASE WHEN @Balance_Clear = 1 THEN NULL ELSE ISNULL(@Balance, [Balance]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderHeaderPaymentSchedules] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderHeaderPaymentSchedules]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderHeaderPaymentSchedule] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderHeaderPaymentSchedule table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderHeaderPaymentSchedule]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderHeaderPaymentSchedule];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderHeaderPaymentSchedule
ON [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Header Payment Schedules */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderHeaderPaymentSchedule] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Header Payment Schedules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
-- Item: spDeleteOrderHeaderPaymentSchedule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderHeaderPaymentSchedule
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderHeaderPaymentSchedule]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderHeaderPaymentSchedule];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderHeaderPaymentSchedule]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderHeaderPaymentSchedule] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Header Payment Schedules */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderHeaderPaymentSchedule] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for PaymentLine */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Lines
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PaymentHeaderID in table PaymentLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentLine_PaymentHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentLine_PaymentHeaderID ON [${flyway:defaultSchema}].[PaymentLine] ([PaymentHeaderID]);

-- Index for foreign key OrderHeaderID in table PaymentLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentLine_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentLine_OrderHeaderID ON [${flyway:defaultSchema}].[PaymentLine] ([OrderHeaderID]);

-- Index for foreign key OrderLineID in table PaymentLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentLine_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentLine_OrderLineID ON [${flyway:defaultSchema}].[PaymentLine] ([OrderLineID]);

-- Index for foreign key AllocatedByUserID in table PaymentLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentLine_AllocatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentLine_AllocatedByUserID ON [${flyway:defaultSchema}].[PaymentLine] ([AllocatedByUserID]);

-- Index for foreign key OrderHeaderPaymentScheduleID in table PaymentLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentLine_OrderHeaderPaymentScheduleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentLine_OrderHeaderPaymentScheduleID ON [${flyway:defaultSchema}].[PaymentLine] ([OrderHeaderPaymentScheduleID]);

/* Base View SQL for MJ_BizApps_Orders: Payment Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Lines
-- Item: vwPaymentLines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Lines
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PaymentLine
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPaymentLines]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPaymentLines];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPaymentLines]
AS
SELECT
    p.*,
    mjBizAppsOrdersPaymentHeader_PaymentHeaderID.[PaymentNumber] AS [PaymentHeader],
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader],
    MJUser_AllocatedByUserID.[Name] AS [AllocatedByUser]
FROM
    [${flyway:defaultSchema}].[PaymentLine] AS p
INNER JOIN
    [${flyway:defaultSchema}].[PaymentHeader] AS mjBizAppsOrdersPaymentHeader_PaymentHeaderID
  ON
    [p].[PaymentHeaderID] = mjBizAppsOrdersPaymentHeader_PaymentHeaderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [p].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_AllocatedByUserID
  ON
    [p].[AllocatedByUserID] = MJUser_AllocatedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentLines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Lines
-- Item: Permissions for vwPaymentLines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentLines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Payment Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Lines
-- Item: spCreatePaymentLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePaymentLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentLine]
    @ID uniqueidentifier = NULL,
    @PaymentHeaderID uniqueidentifier,
    @OrderHeaderID uniqueidentifier,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @Amount decimal(18, 2),
    @AllocatedAt datetimeoffset,
    @AllocatedByUserID_Clear bit = 0,
    @AllocatedByUserID uniqueidentifier = NULL,
    @BookedAt_Clear bit = 0,
    @BookedAt datetimeoffset = NULL,
    @OrderHeaderPaymentScheduleID_Clear bit = 0,
    @OrderHeaderPaymentScheduleID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PaymentLine]
            (
                [ID],
                [PaymentHeaderID],
                [OrderHeaderID],
                [OrderLineID],
                [Amount],
                [AllocatedAt],
                [AllocatedByUserID],
                [BookedAt],
                [OrderHeaderPaymentScheduleID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentHeaderID,
                @OrderHeaderID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                @Amount,
                @AllocatedAt,
                CASE WHEN @AllocatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AllocatedByUserID, NULL) END,
                CASE WHEN @BookedAt_Clear = 1 THEN NULL ELSE ISNULL(@BookedAt, NULL) END,
                CASE WHEN @OrderHeaderPaymentScheduleID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderPaymentScheduleID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PaymentLine]
            (
                [PaymentHeaderID],
                [OrderHeaderID],
                [OrderLineID],
                [Amount],
                [AllocatedAt],
                [AllocatedByUserID],
                [BookedAt],
                [OrderHeaderPaymentScheduleID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentHeaderID,
                @OrderHeaderID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                @Amount,
                @AllocatedAt,
                CASE WHEN @AllocatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AllocatedByUserID, NULL) END,
                CASE WHEN @BookedAt_Clear = 1 THEN NULL ELSE ISNULL(@BookedAt, NULL) END,
                CASE WHEN @OrderHeaderPaymentScheduleID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderPaymentScheduleID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPaymentLines] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentLine] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Payment Lines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentLine] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Payment Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Lines
-- Item: spUpdatePaymentLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentLine]
    @ID uniqueidentifier,
    @PaymentHeaderID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier = NULL,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @Amount decimal(18, 2) = NULL,
    @AllocatedAt datetimeoffset = NULL,
    @AllocatedByUserID_Clear bit = 0,
    @AllocatedByUserID uniqueidentifier = NULL,
    @BookedAt_Clear bit = 0,
    @BookedAt datetimeoffset = NULL,
    @OrderHeaderPaymentScheduleID_Clear bit = 0,
    @OrderHeaderPaymentScheduleID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentLine]
    SET
        [PaymentHeaderID] = ISNULL(@PaymentHeaderID, [PaymentHeaderID]),
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [OrderLineID] = CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, [OrderLineID]) END,
        [Amount] = ISNULL(@Amount, [Amount]),
        [AllocatedAt] = ISNULL(@AllocatedAt, [AllocatedAt]),
        [AllocatedByUserID] = CASE WHEN @AllocatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AllocatedByUserID, [AllocatedByUserID]) END,
        [BookedAt] = CASE WHEN @BookedAt_Clear = 1 THEN NULL ELSE ISNULL(@BookedAt, [BookedAt]) END,
        [OrderHeaderPaymentScheduleID] = CASE WHEN @OrderHeaderPaymentScheduleID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderPaymentScheduleID, [OrderHeaderPaymentScheduleID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentLines] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentLines]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentLine] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentLine table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentLine]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentLine];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentLine
ON [${flyway:defaultSchema}].[PaymentLine]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentLine]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PaymentLine] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Lines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentLine] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Payment Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Lines
-- Item: spDeletePaymentLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePaymentLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentLine]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PaymentLine]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentLine] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Payment Lines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentLine] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 4 new entity field(s) */
-- (CodeGen's +100000 Sequence bump for entity EBFF8EAF-1EDE-4988-B32D-92CDE85E5560 removed by hand — see the migration header.)

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a3e2aab0-53c2-4b01-9ec7-724149ba8b75' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'OrderHeader')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a3e2aab0-53c2-4b01-9ec7-724149ba8b75',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'OrderHeader',
            'Order Header',
            NULL,
            'nvarchar',
            80,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c3812c66-52ed-42ac-b2ae-e43f3576809b' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'Company')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c3812c66-52ed-42ac-b2ae-e43f3576809b',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'Company',
            'Company',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'af2fe195-4bcb-401a-99b2-a17ffc9e59f3' OR (EntityID = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND Name = 'InvoicedByUser')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'af2fe195-4bcb-401a-99b2-a17ffc9e59f3',
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560') + 1,
            'InvoicedByUser',
            'Invoiced By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwOrderHeadersGenerated';
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'EXEC sp_refreshview ''${flyway:defaultSchema}.vwOrderHeaders'';';
END;


