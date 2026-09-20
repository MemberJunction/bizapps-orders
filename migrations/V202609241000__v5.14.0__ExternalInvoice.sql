-- =============================================================================
-- ExternalInvoice and ExternalCustomer — the Bill.com invoice and customer mapping.
--
-- golive #146 says the integration "must keep its own authoritative invoice↔order mapping and must
-- not rely on ExternalDocumentNumber". This is that mapping. One row per billing unit per attempt:
--   (PaymentProviderID, OrderHeaderID, CompanyID, OrderHeaderPaymentScheduleID | NULL)
-- where the provider row names the rail and the company, and the schedule row is NULL for an order
-- billed as a whole. The row is written BEFORE the rail is called (Status = 'Sending') so a crash
-- between the rail's create and our commit leaves a visible claim rather than an orphaned invoice,
-- and the filtered unique index UQ_ExternalInvoice_LiveUnit is what makes a second send of the same
-- unit fail here instead of at Bill.com (design §5.1 step 7, §7).
--
-- The schedule row's ExternalSystem / ExternalInvoiceRef / SentAt (PR #220) are ALSO written, as the
-- #239/#242 contract promises; this table is the authoritative home because a schedule-less order
-- has no row there, and because a cancelled invoice must survive as history (design D-B2).
--
-- The FK to OrderHeaderPaymentSchedule is added only when that table exists (PR #220), so this
-- migration is correct on a database with or without it; a later migration adds the FK if #220
-- lands after this file has run.
--
-- No __mj_CreatedAt/__mj_UpdatedAt, no FK indexes — CodeGen owns both. Idempotent.
-- =============================================================================

IF OBJECT_ID('${flyway:defaultSchema}.ExternalInvoice') IS NULL
BEGIN
    CREATE TABLE [${flyway:defaultSchema}].[ExternalInvoice] (
        [ID]                           UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ExternalInvoice_ID] DEFAULT (newsequentialid()),
        [PaymentProviderID]            UNIQUEIDENTIFIER NOT NULL,
        [OrderHeaderID]                UNIQUEIDENTIFIER NOT NULL,
        [CompanyID]                    UNIQUEIDENTIFIER NOT NULL,
        [OrderHeaderPaymentScheduleID] UNIQUEIDENTIFIER NULL,
        [DocumentNumber]               NVARCHAR(40)     NOT NULL,
        [Amount]                       DECIMAL(18,2)    NOT NULL,
        [DueDate]                      DATE             NULL,
        [Status]                       NVARCHAR(20)     NOT NULL CONSTRAINT [DF_ExternalInvoice_Status] DEFAULT (N'Sending'),
        [ExternalCustomerRef]          NVARCHAR(100)    NULL,
        [ExternalInvoiceRef]           NVARCHAR(100)    NULL,
        [ExternalTotal]                DECIMAL(18,2)    NULL,
        [ExternalDueAmount]            DECIMAL(18,2)    NULL,
        [ExternalStatus]               NVARCHAR(40)     NULL,
        [SentAt]                       DATETIMEOFFSET   NULL,
        [CanceledAt]                   DATETIMEOFFSET   NULL,
        [CancelReason]                 NVARCHAR(500)    NULL,
        [LastSyncedAt]                 DATETIMEOFFSET   NULL,
        [LastError]                    NVARCHAR(MAX)    NULL,
        [IssuedByUserID]               UNIQUEIDENTIFIER NULL,
        -- SQL Server cannot index an expression, so the unit key for the live-unit index is persisted.
        [UnitScheduleKey] AS ISNULL([OrderHeaderPaymentScheduleID], CAST('00000000-0000-0000-0000-000000000000' AS UNIQUEIDENTIFIER)) PERSISTED,
        CONSTRAINT [PK_ExternalInvoice] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [FK_ExternalInvoice_PaymentProvider] FOREIGN KEY ([PaymentProviderID]) REFERENCES [${flyway:defaultSchema}].[PaymentProvider]([ID]),
        CONSTRAINT [FK_ExternalInvoice_OrderHeader]     FOREIGN KEY ([OrderHeaderID])     REFERENCES [${flyway:defaultSchema}].[OrderHeader]([ID]),
        CONSTRAINT [FK_ExternalInvoice_Company]         FOREIGN KEY ([CompanyID])         REFERENCES [__mj].[Company]([ID]),
        CONSTRAINT [FK_ExternalInvoice_IssuedByUser]    FOREIGN KEY ([IssuedByUserID])    REFERENCES [__mj].[User]([ID]),
        CONSTRAINT [CK_ExternalInvoice_Status] CHECK ([Status] IN (N'Sending', N'Sent', N'Canceled', N'Failed')),
        CONSTRAINT [CK_ExternalInvoice_Amount] CHECK ([Amount] > 0),
        -- A Sent row always knows what the customer holds and when it was sent.
        CONSTRAINT [CK_ExternalInvoice_SentHasRef] CHECK ([Status] <> N'Sent' OR ([ExternalInvoiceRef] IS NOT NULL AND [SentAt] IS NOT NULL))
    );

    -- One rail invoice id maps to one row per provider.
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_ExternalInvoice_Ref]
        ON [${flyway:defaultSchema}].[ExternalInvoice] ([PaymentProviderID], [ExternalInvoiceRef])
        WHERE [ExternalInvoiceRef] IS NOT NULL;

    -- At most one live (Sending/Sent) invoice per unit per rail: the D19 idempotency guard for issuance.
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_ExternalInvoice_LiveUnit]
        ON [${flyway:defaultSchema}].[ExternalInvoice] ([PaymentProviderID], [OrderHeaderID], [CompanyID], [UnitScheduleKey])
        WHERE [Status] IN (N'Sending', N'Sent');
END;
GO

-- The instalment FK, only where PR #220's table exists.
IF OBJECT_ID('${flyway:defaultSchema}.OrderHeaderPaymentSchedule') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ExternalInvoice_OrderHeaderPaymentSchedule')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[ExternalInvoice]
        ADD CONSTRAINT [FK_ExternalInvoice_OrderHeaderPaymentSchedule]
            FOREIGN KEY ([OrderHeaderPaymentScheduleID]) REFERENCES [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]([ID]);
END;
GO

IF OBJECT_ID('${flyway:defaultSchema}.ExternalCustomer') IS NULL
BEGIN
    CREATE TABLE [${flyway:defaultSchema}].[ExternalCustomer] (
        [ID]                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ExternalCustomer_ID] DEFAULT (newsequentialid()),
        [PaymentProviderID]    UNIQUEIDENTIFIER NOT NULL,
        [BillToOrganizationID] UNIQUEIDENTIFIER NULL,
        [BillToPersonID]       UNIQUEIDENTIFIER NULL,
        [ExternalCustomerRef]  NVARCHAR(100)    NOT NULL,
        [LastSyncedAt]         DATETIMEOFFSET   NULL,
        CONSTRAINT [PK_ExternalCustomer] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [FK_ExternalCustomer_PaymentProvider] FOREIGN KEY ([PaymentProviderID])    REFERENCES [${flyway:defaultSchema}].[PaymentProvider]([ID]),
        CONSTRAINT [FK_ExternalCustomer_Organization]    FOREIGN KEY ([BillToOrganizationID]) REFERENCES [__mj_BizAppsCommon].[Organization]([ID]),
        CONSTRAINT [FK_ExternalCustomer_Person]          FOREIGN KEY ([BillToPersonID])       REFERENCES [__mj_BizAppsCommon].[Person]([ID]),
        -- Exactly one party.
        CONSTRAINT [CK_ExternalCustomer_OneParty] CHECK (([BillToOrganizationID] IS NULL) <> ([BillToPersonID] IS NULL)),
        CONSTRAINT [UQ_ExternalCustomer_Ref] UNIQUE ([PaymentProviderID], [ExternalCustomerRef])
    );

    CREATE UNIQUE NONCLUSTERED INDEX [UQ_ExternalCustomer_Org]
        ON [${flyway:defaultSchema}].[ExternalCustomer] ([PaymentProviderID], [BillToOrganizationID])
        WHERE [BillToOrganizationID] IS NOT NULL;
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_ExternalCustomer_Person]
        ON [${flyway:defaultSchema}].[ExternalCustomer] ([PaymentProviderID], [BillToPersonID])
        WHERE [BillToPersonID] IS NOT NULL;
END;
GO

-- -----------------------------------------------------------------------------
-- Descriptions. One helper pattern, repeated, so a re-run adds nothing twice.
-- -----------------------------------------------------------------------------
DECLARE @s NVARCHAR(128) = N'${flyway:defaultSchema}';

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(@s + N'.ExternalInvoice') AND minor_id = 0 AND name = 'MS_Description')
    EXEC sp_addextendedproperty N'MS_Description', N'One attempt to place a billing unit — (order, selling company, instalment or none) — on an external AR rail such as Bill.com. Written as Sending before the rail is called, then Sent with the rail''s invoice id, or Failed with the reason, or Canceled. The authoritative invoice-to-order mapping the payment poller matches on; never matched by ExternalDocumentNumber.', N'SCHEMA', @s, N'TABLE', N'ExternalInvoice';

DECLARE @cols TABLE (Col SYSNAME, Txt NVARCHAR(1000));
INSERT INTO @cols VALUES
 (N'PaymentProviderID', N'The provider row that names the rail and the company whose Bill.com organisation this invoice lives in.'),
 (N'OrderHeaderID', N'The order this unit bills.'),
 (N'CompanyID', N'The selling company of the DOCUMENT (one per company on a split order), not necessarily the order header''s company.'),
 (N'OrderHeaderPaymentScheduleID', N'The instalment this unit is, when the order is billed on a schedule. NULL for an order billed as a whole.'),
 (N'DocumentNumber', N'Our frozen document number, sent as the rail''s invoice number: ORD-1234, ORD-1234-2, ORD-1234-B2.'),
 (N'Amount', N'What the unit bills, which the rail''s lines must total to the cent.'),
 (N'DueDate', N'Due date sent to the rail; NULL means on receipt.'),
 (N'Status', N'Sending (claim written, rail not yet confirmed), Sent (rail holds it), Canceled (archived on the rail), Failed (rail refused or the total did not tie).'),
 (N'ExternalCustomerRef', N'The rail''s customer id the invoice was issued to (Bill.com 0cu…).'),
 (N'ExternalInvoiceRef', N'The rail''s invoice id (Bill.com 00e…). NULL while Sending or Failed.'),
 (N'ExternalTotal', N'The rail''s total on read-back after create; must equal Amount or the send is failed and the rail invoice archived.'),
 (N'ExternalDueAmount', N'The rail''s last-seen amount still due, net of applied and scheduled payments.'),
 (N'ExternalStatus', N'The rail''s last-seen invoice status, verbatim.'),
 (N'SentAt', N'When the rail confirmed the invoice. The audit fact: unsent is SentAt IS NULL.'),
 (N'CanceledAt', N'When the rail invoice was archived from here.'),
 (N'CancelReason', N'Why it was cancelled, as typed by the person who did it.'),
 (N'LastSyncedAt', N'When ExternalTotal/ExternalDueAmount/ExternalStatus were last refreshed from the rail.'),
 (N'LastError', N'The rail''s or our last refusal, for a Failed or stuck Sending row.'),
 (N'IssuedByUserID', N'Who asked for the send (a person, or the scheduler''s context user).'),
 (N'UnitScheduleKey', N'Persisted computed: OrderHeaderPaymentScheduleID or the zero GUID, so the live-unit unique index can include a nullable key.');
DECLARE @c SYSNAME, @t NVARCHAR(1000);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT Col, Txt FROM @cols;
OPEN cur; FETCH NEXT FROM cur INTO @c, @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.extended_properties ep JOIN sys.columns col ON col.object_id = ep.major_id AND col.column_id = ep.minor_id
                   WHERE ep.name = 'MS_Description' AND ep.major_id = OBJECT_ID(@s + N'.ExternalInvoice') AND col.name = @c)
        EXEC sp_addextendedproperty N'MS_Description', @t, N'SCHEMA', @s, N'TABLE', N'ExternalInvoice', N'COLUMN', @c;
    FETCH NEXT FROM cur INTO @c, @t;
END;
CLOSE cur; DEALLOCATE cur;

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(@s + N'.ExternalCustomer') AND minor_id = 0 AND name = 'MS_Description')
    EXEC sp_addextendedproperty N'MS_Description', N'A bill-to party''s customer record on an external AR rail, per provider row (a Bill.com organisation is per company). Exactly one of BillToOrganizationID / BillToPersonID.', N'SCHEMA', @s, N'TABLE', N'ExternalCustomer';

DELETE FROM @cols;
INSERT INTO @cols VALUES
 (N'PaymentProviderID', N'The provider row (rail + company) this customer record belongs to.'),
 (N'BillToOrganizationID', N'The organisation this rail customer represents, when the bill-to is an organisation.'),
 (N'BillToPersonID', N'The person this rail customer represents, when the bill-to is a person.'),
 (N'ExternalCustomerRef', N'The rail''s customer id (Bill.com 0cu…). Our party id is also sent as the rail''s account number so the link is recoverable from that side.'),
 (N'LastSyncedAt', N'When the rail customer was last created or refreshed from here.');
OPEN cur; FETCH NEXT FROM cur INTO @c, @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.extended_properties ep JOIN sys.columns col ON col.object_id = ep.major_id AND col.column_id = ep.minor_id
                   WHERE ep.name = 'MS_Description' AND ep.major_id = OBJECT_ID(@s + N'.ExternalCustomer') AND col.name = @c)
        EXEC sp_addextendedproperty N'MS_Description', @t, N'SCHEMA', @s, N'TABLE', N'ExternalCustomer', N'COLUMN', @c;
    FETCH NEXT FROM cur INTO @c, @t;
END;
CLOSE cur; DEALLOCATE cur;
GO

-- CodeGen output (entities MJ_BizApps_Orders: External Invoices / External Customers, views, CRUD)
-- is folded below this banner once the migration has been applied to a development database and
-- `mj codegen` has run (docs/database-migrations.md). Until then the server addresses both entities
-- by name through GetEntityObject/RunView, which needs no generated getters.
