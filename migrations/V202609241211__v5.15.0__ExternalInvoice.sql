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
-- The schedule row's ExternalSystem / ExternalInvoiceRef / SentAt (V202609211200, PR #220) are ALSO
-- written, as the #239/#242 contract promises; this table is the authoritative home because a
-- schedule-less order has no row there, and because a cancelled invoice must survive as history
-- (design D-B2). This file sorts after V202609211200, so the FK to OrderHeaderPaymentSchedule is plain.
--
-- Plain DDL, GO-separated, one sp_addextendedproperty per description — the shape of #219/#220 as
-- Amith asked; migrations run once in order, and a cursor would break the PostgreSQL conversion.
-- No __mj_CreatedAt/__mj_UpdatedAt, no FK indexes — CodeGen owns both.
-- =============================================================================

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
    CONSTRAINT [FK_ExternalInvoice_OrderHeaderPaymentSchedule] FOREIGN KEY ([OrderHeaderPaymentScheduleID]) REFERENCES [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]([ID]),
    CONSTRAINT [FK_ExternalInvoice_IssuedByUser]    FOREIGN KEY ([IssuedByUserID])    REFERENCES [__mj].[User]([ID]),
    CONSTRAINT [CK_ExternalInvoice_Status] CHECK ([Status] IN (N'Sending', N'Sent', N'Canceled', N'Failed')),
    CONSTRAINT [CK_ExternalInvoice_Amount] CHECK ([Amount] > 0),
    -- A Sent row always knows what the customer holds and when it was sent.
    CONSTRAINT [CK_ExternalInvoice_SentHasRef] CHECK ([Status] <> N'Sent' OR ([ExternalInvoiceRef] IS NOT NULL AND [SentAt] IS NOT NULL))
);
GO

-- One rail invoice id maps to one row per provider.
CREATE UNIQUE NONCLUSTERED INDEX [UQ_ExternalInvoice_Ref]
    ON [${flyway:defaultSchema}].[ExternalInvoice] ([PaymentProviderID], [ExternalInvoiceRef])
    WHERE [ExternalInvoiceRef] IS NOT NULL;
GO

-- At most one live (Sending/Sent) invoice per unit per rail: the D19 idempotency guard for issuance.
CREATE UNIQUE NONCLUSTERED INDEX [UQ_ExternalInvoice_LiveUnit]
    ON [${flyway:defaultSchema}].[ExternalInvoice] ([PaymentProviderID], [OrderHeaderID], [CompanyID], [UnitScheduleKey])
    WHERE [Status] IN (N'Sending', N'Sent');
GO

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
    CONSTRAINT [CK_ExternalCustomer_OneParty] CHECK (([BillToOrganizationID] IS NULL AND [BillToPersonID] IS NOT NULL) OR ([BillToOrganizationID] IS NOT NULL AND [BillToPersonID] IS NULL)),
    CONSTRAINT [UQ_ExternalCustomer_Ref] UNIQUE ([PaymentProviderID], [ExternalCustomerRef])
);
GO

CREATE UNIQUE NONCLUSTERED INDEX [UQ_ExternalCustomer_Org]
    ON [${flyway:defaultSchema}].[ExternalCustomer] ([PaymentProviderID], [BillToOrganizationID])
    WHERE [BillToOrganizationID] IS NOT NULL;
GO
CREATE UNIQUE NONCLUSTERED INDEX [UQ_ExternalCustomer_Person]
    ON [${flyway:defaultSchema}].[ExternalCustomer] ([PaymentProviderID], [BillToPersonID])
    WHERE [BillToPersonID] IS NOT NULL;
GO

-- -----------------------------------------------------------------------------
-- Descriptions
-- -----------------------------------------------------------------------------
EXEC sp_addextendedproperty N'MS_Description', N'One attempt to place a billing unit — (order, selling company, instalment or none) — on an external AR rail such as Bill.com. Written as Sending before the rail is called, then Sent with the rail''s invoice id, or Failed with the reason, or Canceled. The authoritative invoice-to-order mapping the payment poller matches on; never matched by ExternalDocumentNumber.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice';
EXEC sp_addextendedproperty N'MS_Description', N'The provider row that names the rail and the company whose Bill.com organisation this invoice lives in.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'PaymentProviderID';
EXEC sp_addextendedproperty N'MS_Description', N'The order this unit bills.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'OrderHeaderID';
EXEC sp_addextendedproperty N'MS_Description', N'The selling company of the DOCUMENT (one per company on a split order), not necessarily the order header''s company.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'CompanyID';
EXEC sp_addextendedproperty N'MS_Description', N'The instalment this unit is, when the order is billed on a schedule. NULL for an order billed as a whole.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'OrderHeaderPaymentScheduleID';
EXEC sp_addextendedproperty N'MS_Description', N'Our frozen document number, sent as the rail''s invoice number: ORD-1234, ORD-1234-2, ORD-1234-B2.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'DocumentNumber';
EXEC sp_addextendedproperty N'MS_Description', N'What the unit bills, which the rail''s lines must total to the cent.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'Amount';
EXEC sp_addextendedproperty N'MS_Description', N'Due date sent to the rail; NULL means on receipt.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'DueDate';
EXEC sp_addextendedproperty N'MS_Description', N'Sending (claim written, rail not yet confirmed), Sent (rail holds it), Canceled (archived on the rail), Failed (rail refused or the total did not tie).', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'Status';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s customer id the invoice was issued to (Bill.com 0cu…).', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'ExternalCustomerRef';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s invoice id (Bill.com 00e…). NULL while Sending or Failed.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'ExternalInvoiceRef';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s total on read-back after create; must equal Amount or the send is failed and the rail invoice archived.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'ExternalTotal';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s last-seen amount still due, net of applied and scheduled payments.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'ExternalDueAmount';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s last-seen invoice status, verbatim.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'ExternalStatus';
EXEC sp_addextendedproperty N'MS_Description', N'When the rail confirmed the invoice. The audit fact: unsent is SentAt IS NULL.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'SentAt';
EXEC sp_addextendedproperty N'MS_Description', N'When the rail invoice was archived from here.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'CanceledAt';
EXEC sp_addextendedproperty N'MS_Description', N'Why it was cancelled, as typed by the person who did it.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'CancelReason';
EXEC sp_addextendedproperty N'MS_Description', N'When ExternalTotal/ExternalDueAmount/ExternalStatus were last refreshed from the rail.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'LastSyncedAt';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s or our last refusal, for a Failed or stuck Sending row.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'LastError';
EXEC sp_addextendedproperty N'MS_Description', N'Who asked for the send (a person, or the scheduler''s context user).', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'IssuedByUserID';
EXEC sp_addextendedproperty N'MS_Description', N'Persisted computed: OrderHeaderPaymentScheduleID or the zero GUID, so the live-unit unique index can include a nullable key.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalInvoice', N'COLUMN', N'UnitScheduleKey';
GO

EXEC sp_addextendedproperty N'MS_Description', N'A bill-to party''s customer record on an external AR rail, per provider row (a Bill.com organisation is per company). Exactly one of BillToOrganizationID / BillToPersonID.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalCustomer';
EXEC sp_addextendedproperty N'MS_Description', N'The provider row (rail + company) this customer record belongs to.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalCustomer', N'COLUMN', N'PaymentProviderID';
EXEC sp_addextendedproperty N'MS_Description', N'The organisation this rail customer represents, when the bill-to is an organisation.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalCustomer', N'COLUMN', N'BillToOrganizationID';
EXEC sp_addextendedproperty N'MS_Description', N'The person this rail customer represents, when the bill-to is a person.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalCustomer', N'COLUMN', N'BillToPersonID';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s customer id (Bill.com 0cu…). Our party id is also sent as the rail''s account number so the link is recoverable from that side.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalCustomer', N'COLUMN', N'ExternalCustomerRef';
EXEC sp_addextendedproperty N'MS_Description', N'When the rail customer was last created or refreshed from here.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalCustomer', N'COLUMN', N'LastSyncedAt';
GO

-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the External Invoices and External Customers entities, their fields, relationships,
-- base views, CRUD procedures and permissions. Produced by MJ CodeGen 6.1 against
-- MJ_BizAppsSales_QA on 2026-09-21 and carved to this migration's objects (the same run also
-- regenerated Event Products / Order Lines objects from unrelated drift; those are not here).
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Orders: External Invoices */

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
         '9915a9e7-6bc6-4518-baea-206b18c86622',
         'MJ_BizApps_Orders: External Invoices',
         'External Invoices',
         'One attempt to place a billing unit — (order, selling company, instalment or none) — on an external AR rail such as Bill.com. Written as Sending before the rail is called, then Sent with the rail''s invoice id, or Failed with the reason, or Canceled. The authoritative invoice-to-order mapping the payment poller matches on; never matched by ExternalDocumentNumber.',
         NULL,
         'ExternalInvoice',
         'vwExternalInvoices',
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

/* SQL generated to add new entity MJ_BizApps_Orders: External Invoices to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '9915a9e7-6bc6-4518-baea-206b18c86622', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: External Invoices for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9915a9e7-6bc6-4518-baea-206b18c86622', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: External Invoices for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9915a9e7-6bc6-4518-baea-206b18c86622', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: External Invoices for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9915a9e7-6bc6-4518-baea-206b18c86622', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Orders: External Customers */

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
         '6f739dcd-46e0-44a1-9a94-51e4e6e849ff',
         'MJ_BizApps_Orders: External Customers',
         'External Customers',
         'A bill-to party''s customer record on an external AR rail, per provider row (a Bill.com organisation is per company). Exactly one of BillToOrganizationID / BillToPersonID.',
         NULL,
         'ExternalCustomer',
         'vwExternalCustomers',
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

/* SQL generated to add new entity MJ_BizApps_Orders: External Customers to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '6f739dcd-46e0-44a1-9a94-51e4e6e849ff', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: External Customers for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6f739dcd-46e0-44a1-9a94-51e4e6e849ff', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: External Customers for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6f739dcd-46e0-44a1-9a94-51e4e6e849ff', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: External Customers for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6f739dcd-46e0-44a1-9a94-51e4e6e849ff', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalInvoice */
ALTER TABLE [${flyway:defaultSchema}].[ExternalInvoice] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalInvoice */
UPDATE [${flyway:defaultSchema}].[ExternalInvoice] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalInvoice */
ALTER TABLE [${flyway:defaultSchema}].[ExternalInvoice] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalInvoice */
ALTER TABLE [${flyway:defaultSchema}].[ExternalInvoice] ADD CONSTRAINT [DF___mj_BizAppsOrders_ExternalInvoice___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalInvoice */
ALTER TABLE [${flyway:defaultSchema}].[ExternalInvoice] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalInvoice */
UPDATE [${flyway:defaultSchema}].[ExternalInvoice] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalInvoice */
ALTER TABLE [${flyway:defaultSchema}].[ExternalInvoice] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalInvoice */
ALTER TABLE [${flyway:defaultSchema}].[ExternalInvoice] ADD CONSTRAINT [DF___mj_BizAppsOrders_ExternalInvoice___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalCustomer */
ALTER TABLE [${flyway:defaultSchema}].[ExternalCustomer] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalCustomer */
UPDATE [${flyway:defaultSchema}].[ExternalCustomer] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalCustomer */
ALTER TABLE [${flyway:defaultSchema}].[ExternalCustomer] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalCustomer */
ALTER TABLE [${flyway:defaultSchema}].[ExternalCustomer] ADD CONSTRAINT [DF___mj_BizAppsOrders_ExternalCustomer___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalCustomer */
ALTER TABLE [${flyway:defaultSchema}].[ExternalCustomer] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalCustomer */
UPDATE [${flyway:defaultSchema}].[ExternalCustomer] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalCustomer */
ALTER TABLE [${flyway:defaultSchema}].[ExternalCustomer] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalCustomer */
ALTER TABLE [${flyway:defaultSchema}].[ExternalCustomer] ADD CONSTRAINT [DF___mj_BizAppsOrders_ExternalCustomer___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'
                AND [Sequence] >= 100000
         );

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ce276fdd-52e5-4815-9276-f3a04ab9f00b' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'ID')) BEGIN
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
            'ce276fdd-52e5-4815-9276-f3a04ab9f00b',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9e809314-31b4-4cbc-aa9d-9f0d0124df2f' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'PaymentProviderID')) BEGIN
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
            '9e809314-31b4-4cbc-aa9d-9f0d0124df2f',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'PaymentProviderID',
            'Payment Provider ID',
            'The provider row that names the rail and the company whose Bill.com organisation this invoice lives in.',
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
            'FDC49E63-B229-40BB-9ABC-F384D7750123',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5fc63d77-4729-442d-ad25-90d14a7d1391' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'OrderHeaderID')) BEGIN
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
            '5fc63d77-4729-442d-ad25-90d14a7d1391',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'OrderHeaderID',
            'Order Header ID',
            'The order this unit bills.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6f96fd6f-a78c-4737-9cda-4ee4477f8401' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'CompanyID')) BEGIN
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
            '6f96fd6f-a78c-4737-9cda-4ee4477f8401',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'CompanyID',
            'Company ID',
            'The selling company of the DOCUMENT (one per company on a split order), not necessarily the order header''s company.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1621d258-49c4-4858-bd6a-02922e68a0bb' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'OrderHeaderPaymentScheduleID')) BEGIN
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
            '1621d258-49c4-4858-bd6a-02922e68a0bb',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'OrderHeaderPaymentScheduleID',
            'Order Header Payment Schedule ID',
            'The instalment this unit is, when the order is billed on a schedule. NULL for an order billed as a whole.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '024c4a3e-67e5-466b-9878-0f8b5edc9210' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'DocumentNumber')) BEGIN
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
            '024c4a3e-67e5-466b-9878-0f8b5edc9210',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'DocumentNumber',
            'Document Number',
            'Our frozen document number, sent as the rail''s invoice number: ORD-1234, ORD-1234-2, ORD-1234-B2.',
            'nvarchar',
            80,
            0,
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f781673f-148c-4e2f-a922-e0df531f46fa' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'Amount')) BEGIN
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
            'f781673f-148c-4e2f-a922-e0df531f46fa',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'Amount',
            'Amount',
            'What the unit bills, which the rail''s lines must total to the cent.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '71b500ee-e27d-42f6-9680-c556f1c81afe' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'DueDate')) BEGIN
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
            '71b500ee-e27d-42f6-9680-c556f1c81afe',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'DueDate',
            'Due Date',
            'Due date sent to the rail; NULL means on receipt.',
            'date',
            3,
            10,
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '04045555-8beb-481c-8e8f-baa92cb0f67a' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'Status')) BEGIN
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
            '04045555-8beb-481c-8e8f-baa92cb0f67a',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'Status',
            'Status',
            'Sending (claim written, rail not yet confirmed), Sent (rail holds it), Canceled (archived on the rail), Failed (rail refused or the total did not tie).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Sending',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '612c2c7f-b1eb-4e94-9078-b1ca309af9aa' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'ExternalCustomerRef')) BEGIN
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
            '612c2c7f-b1eb-4e94-9078-b1ca309af9aa',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'ExternalCustomerRef',
            'External Customer Ref',
            'The rail''s customer id the invoice was issued to (Bill.com 0cu…).',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e182224a-b405-4f47-91d6-969364ca4f9c' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'ExternalInvoiceRef')) BEGIN
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
            'e182224a-b405-4f47-91d6-969364ca4f9c',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'ExternalInvoiceRef',
            'External Invoice Ref',
            'The rail''s invoice id (Bill.com 00e…). NULL while Sending or Failed.',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '81415963-a6c5-47ee-9689-10c462ba2c6e' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'ExternalTotal')) BEGIN
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
            '81415963-a6c5-47ee-9689-10c462ba2c6e',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'ExternalTotal',
            'External Total',
            'The rail''s total on read-back after create; must equal Amount or the send is failed and the rail invoice archived.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '61a74a6f-ba24-4769-a481-e5773d476170' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'ExternalDueAmount')) BEGIN
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
            '61a74a6f-ba24-4769-a481-e5773d476170',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'ExternalDueAmount',
            'External Due Amount',
            'The rail''s last-seen amount still due, net of applied and scheduled payments.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '469f260a-d91d-45d7-bad8-219183a5cc5d' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'ExternalStatus')) BEGIN
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
            '469f260a-d91d-45d7-bad8-219183a5cc5d',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'ExternalStatus',
            'External Status',
            'The rail''s last-seen invoice status, verbatim.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6a3d86d4-b963-4cbc-83e8-ce6d99ccd22c' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'SentAt')) BEGIN
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
            '6a3d86d4-b963-4cbc-83e8-ce6d99ccd22c',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'SentAt',
            'Sent At',
            'When the rail confirmed the invoice. The audit fact: unsent is SentAt IS NULL.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a15a8f35-3f1d-46a5-bb76-1e3173979d67' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'CanceledAt')) BEGIN
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
            'a15a8f35-3f1d-46a5-bb76-1e3173979d67',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'CanceledAt',
            'Canceled At',
            'When the rail invoice was archived from here.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4a2be14e-6c87-40ce-a2b1-671f63a11817' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'CancelReason')) BEGIN
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
            '4a2be14e-6c87-40ce-a2b1-671f63a11817',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'CancelReason',
            'Cancel Reason',
            'Why it was cancelled, as typed by the person who did it.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1c71a129-63ef-4bf0-acdb-f558109d3af6' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'LastSyncedAt')) BEGIN
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
            '1c71a129-63ef-4bf0-acdb-f558109d3af6',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'LastSyncedAt',
            'Last Synced At',
            'When ExternalTotal/ExternalDueAmount/ExternalStatus were last refreshed from the rail.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cafff742-284c-4f1f-a255-464e4cdc6a27' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'LastError')) BEGIN
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
            'cafff742-284c-4f1f-a255-464e4cdc6a27',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'LastError',
            'Last Error',
            'The rail''s or our last refusal, for a Failed or stuck Sending row.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7e5cb204-fe7d-4b9e-929f-e78151ad24c0' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'IssuedByUserID')) BEGIN
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
            '7e5cb204-fe7d-4b9e-929f-e78151ad24c0',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'IssuedByUserID',
            'Issued By User ID',
            'Who asked for the send (a person, or the scheduler''s context user).',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ff5f3f80-d1c0-4766-a675-97aa2237b4a5' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'UnitScheduleKey')) BEGIN
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
            'ff5f3f80-d1c0-4766-a675-97aa2237b4a5',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'UnitScheduleKey',
            'Unit Schedule Key',
            'Persisted computed: OrderHeaderPaymentScheduleID or the zero GUID, so the live-unit unique index can include a nullable key.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            1,
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5879fbb6-cbe9-4452-9dc4-4d8528a54bde' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = '__mj_CreatedAt')) BEGIN
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
            '5879fbb6-cbe9-4452-9dc4-4d8528a54bde',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3a726b9d-abef-43e4-b540-5bbf49875a81' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '3a726b9d-abef-43e4-b540-5bbf49875a81',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
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

UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'
                AND [Sequence] >= 100000
         );

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0421e11b-407c-4569-adb9-e80dbce7eb2a' OR (EntityID = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF' AND Name = 'ID')) BEGIN
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
            '0421e11b-407c-4569-adb9-e80dbce7eb2a',
            '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', -- Entity: MJ_BizApps_Orders: External Customers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'),
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4c518b9a-fd9e-4ed2-9601-957c397f15f0' OR (EntityID = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF' AND Name = 'PaymentProviderID')) BEGIN
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
            '4c518b9a-fd9e-4ed2-9601-957c397f15f0',
            '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', -- Entity: MJ_BizApps_Orders: External Customers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'),
            'PaymentProviderID',
            'Payment Provider ID',
            'The provider row (rail + company) this customer record belongs to.',
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
            'FDC49E63-B229-40BB-9ABC-F384D7750123',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ef41cd36-ee22-4f9e-8269-fd84915f7dc0' OR (EntityID = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF' AND Name = 'BillToOrganizationID')) BEGIN
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
            'ef41cd36-ee22-4f9e-8269-fd84915f7dc0',
            '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', -- Entity: MJ_BizApps_Orders: External Customers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'),
            'BillToOrganizationID',
            'Bill To Organization ID',
            'The organisation this rail customer represents, when the bill-to is an organisation.',
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
            'C70448F9-9792-41D7-A82C-784B66429D54',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '10bb21cd-9b64-4967-ba53-1f400ff40bd5' OR (EntityID = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF' AND Name = 'BillToPersonID')) BEGIN
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
            '10bb21cd-9b64-4967-ba53-1f400ff40bd5',
            '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', -- Entity: MJ_BizApps_Orders: External Customers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'),
            'BillToPersonID',
            'Bill To Person ID',
            'The person this rail customer represents, when the bill-to is a person.',
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
            '7A94ADA9-7880-4FAE-97D8-DB0E934C3F5F',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c03c2f02-4be7-45c7-87b8-06fd581ddaf8' OR (EntityID = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF' AND Name = 'ExternalCustomerRef')) BEGIN
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
            'c03c2f02-4be7-45c7-87b8-06fd581ddaf8',
            '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', -- Entity: MJ_BizApps_Orders: External Customers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'),
            'ExternalCustomerRef',
            'External Customer Ref',
            'The rail''s customer id (Bill.com 0cu…). Our party id is also sent as the rail''s account number so the link is recoverable from that side.',
            'nvarchar',
            200,
            0,
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd8612a81-9a94-4bbd-a361-598d4cb28cc4' OR (EntityID = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF' AND Name = 'LastSyncedAt')) BEGIN
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
            'd8612a81-9a94-4bbd-a361-598d4cb28cc4',
            '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', -- Entity: MJ_BizApps_Orders: External Customers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'),
            'LastSyncedAt',
            'Last Synced At',
            'When the rail customer was last created or refreshed from here.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8e3e42f9-cf4e-406e-95b0-d891eaed1291' OR (EntityID = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF' AND Name = '__mj_CreatedAt')) BEGIN
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
            '8e3e42f9-cf4e-406e-95b0-d891eaed1291',
            '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', -- Entity: MJ_BizApps_Orders: External Customers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'),
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5694acf1-e333-41ca-88b7-268938257676' OR (EntityID = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '5694acf1-e333-41ca-88b7-268938257676',
            '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', -- Entity: MJ_BizApps_Orders: External Customers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'),
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

/* Create Entity Relationship: MJ_BizApps_Orders: Order Headers -> MJ_BizApps_Orders: External Invoices (One To Many via OrderHeaderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '3b897ec1-b9be-4dfa-9ffd-d97f96b39529'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3b897ec1-b9be-4dfa-9ffd-d97f96b39529', 'FC529BC8-FF09-44A9-B454-26EAFDAC791B', '9915A9E7-6BC6-4518-BAEA-206B18C86622', 'OrderHeaderID', 'One To Many', 1, 1, 13, GETUTCDATE(), GETUTCDATE())
   END;

/* Create Entity Relationship: MJ: Companies -> MJ_BizApps_Orders: External Invoices (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '6daf1ef6-7ea9-4580-abeb-8b105afaaf22'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6daf1ef6-7ea9-4580-abeb-8b105afaaf22', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '9915A9E7-6BC6-4518-BAEA-206B18C86622', 'CompanyID', 'One To Many', 1, 1, 34, GETUTCDATE(), GETUTCDATE())
   END;

/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: External Invoices (One To Many via IssuedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'ea7003bd-1cdc-4c2f-b5d2-0afa1e3bb8d2'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ea7003bd-1cdc-4c2f-b5d2-0afa1e3bb8d2', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '9915A9E7-6BC6-4518-BAEA-206B18C86622', 'IssuedByUserID', 'One To Many', 1, 1, 121, GETUTCDATE(), GETUTCDATE())
   END;

/* Create Entity Relationship: MJ_BizApps_Common: Organizations -> MJ_BizApps_Orders: External Customers (One To Many via BillToOrganizationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'd623803d-26f2-4fae-840c-2828f99ce370'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d623803d-26f2-4fae-840c-2828f99ce370', 'C70448F9-9792-41D7-A82C-784B66429D54', '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', 'BillToOrganizationID', 'One To Many', 1, 1, 19, GETUTCDATE(), GETUTCDATE())
   END;

/* Create Entity Relationship: MJ_BizApps_Orders: Order Header Payment Schedules -> MJ_BizApps_Orders: External Invoices (One To Many via OrderHeaderPaymentScheduleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'fee38149-060f-468a-8a9c-1b092bc38ca0'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fee38149-060f-468a-8a9c-1b092bc38ca0', 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', '9915A9E7-6BC6-4518-BAEA-206B18C86622', 'OrderHeaderPaymentScheduleID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Create Entity Relationship: MJ_BizApps_Common: People -> MJ_BizApps_Orders: External Customers (One To Many via BillToPersonID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '50147e56-5f00-46b3-9367-445f56811bc5'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('50147e56-5f00-46b3-9367-445f56811bc5', '7A94ADA9-7880-4FAE-97D8-DB0E934C3F5F', '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', 'BillToPersonID', 'One To Many', 1, 1, 27, GETUTCDATE(), GETUTCDATE())
   END;

/* Create Entity Relationship: MJ_BizApps_Orders: Payment Providers -> MJ_BizApps_Orders: External Customers (One To Many via PaymentProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'e6e456e0-3901-48b5-90e5-8a1278e5e12f'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e6e456e0-3901-48b5-90e5-8a1278e5e12f', 'FDC49E63-B229-40BB-9ABC-F384D7750123', '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', 'PaymentProviderID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Create Entity Relationship: MJ_BizApps_Orders: Payment Providers -> MJ_BizApps_Orders: External Invoices (One To Many via PaymentProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '44aff4c5-41e2-422f-8828-9a7b7f324077'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('44aff4c5-41e2-422f-8828-9a7b7f324077', 'FDC49E63-B229-40BB-9ABC-F384D7750123', '9915A9E7-6BC6-4518-BAEA-206B18C86622', 'PaymentProviderID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ExternalCustomer */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Customers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PaymentProviderID in table ExternalCustomer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExternalCustomer_PaymentProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExternalCustomer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExternalCustomer_PaymentProviderID ON [${flyway:defaultSchema}].[ExternalCustomer] ([PaymentProviderID]);

-- Index for foreign key BillToOrganizationID in table ExternalCustomer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExternalCustomer_BillToOrganizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExternalCustomer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExternalCustomer_BillToOrganizationID ON [${flyway:defaultSchema}].[ExternalCustomer] ([BillToOrganizationID]);

-- Index for foreign key BillToPersonID in table ExternalCustomer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExternalCustomer_BillToPersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExternalCustomer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExternalCustomer_BillToPersonID ON [${flyway:defaultSchema}].[ExternalCustomer] ([BillToPersonID]);

/* SQL text to update entity field related entity name field map for entity field ID 4C518B9A-FD9E-4ED2-9601-957C397F15F0 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4C518B9A-FD9E-4ED2-9601-957C397F15F0', @RelatedEntityNameFieldMap='PaymentProvider';

/* Index for Foreign Keys for ExternalInvoice */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Invoices
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PaymentProviderID in table ExternalInvoice
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExternalInvoice_PaymentProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExternalInvoice]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExternalInvoice_PaymentProviderID ON [${flyway:defaultSchema}].[ExternalInvoice] ([PaymentProviderID]);

-- Index for foreign key OrderHeaderID in table ExternalInvoice
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExternalInvoice_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExternalInvoice]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExternalInvoice_OrderHeaderID ON [${flyway:defaultSchema}].[ExternalInvoice] ([OrderHeaderID]);

-- Index for foreign key CompanyID in table ExternalInvoice
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExternalInvoice_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExternalInvoice]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExternalInvoice_CompanyID ON [${flyway:defaultSchema}].[ExternalInvoice] ([CompanyID]);

-- Index for foreign key OrderHeaderPaymentScheduleID in table ExternalInvoice
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExternalInvoice_OrderHeaderPaymentScheduleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExternalInvoice]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExternalInvoice_OrderHeaderPaymentScheduleID ON [${flyway:defaultSchema}].[ExternalInvoice] ([OrderHeaderPaymentScheduleID]);

-- Index for foreign key IssuedByUserID in table ExternalInvoice
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExternalInvoice_IssuedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExternalInvoice]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExternalInvoice_IssuedByUserID ON [${flyway:defaultSchema}].[ExternalInvoice] ([IssuedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 9E809314-31B4-4CBC-AA9D-9F0D0124DF2F */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9E809314-31B4-4CBC-AA9D-9F0D0124DF2F', @RelatedEntityNameFieldMap='PaymentProvider';

/* SQL text to update entity field related entity name field map for entity field ID EF41CD36-EE22-4F9E-8269-FD84915F7DC0 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EF41CD36-EE22-4F9E-8269-FD84915F7DC0', @RelatedEntityNameFieldMap='BillToOrganization';

/* SQL text to update entity field related entity name field map for entity field ID 5FC63D77-4729-442D-AD25-90D14A7D1391 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5FC63D77-4729-442D-AD25-90D14A7D1391', @RelatedEntityNameFieldMap='OrderHeader';

/* SQL text to update entity field related entity name field map for entity field ID 6F96FD6F-A78C-4737-9CDA-4EE4477F8401 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6F96FD6F-A78C-4737-9CDA-4EE4477F8401', @RelatedEntityNameFieldMap='Company';

/* SQL text to update entity field related entity name field map for entity field ID 10BB21CD-9B64-4967-BA53-1F400FF40BD5 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='10BB21CD-9B64-4967-BA53-1F400FF40BD5', @RelatedEntityNameFieldMap='BillToPerson';

/* SQL text to update entity field related entity name field map for entity field ID 7E5CB204-FE7D-4B9E-929F-E78151AD24C0 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7E5CB204-FE7D-4B9E-929F-E78151AD24C0', @RelatedEntityNameFieldMap='IssuedByUser';

/* Base View SQL for MJ_BizApps_Orders: External Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Customers
-- Item: vwExternalCustomers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: External Customers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ExternalCustomer
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwExternalCustomers]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwExternalCustomers];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwExternalCustomers]
AS
SELECT
    e.*,
    mjBizAppsOrdersPaymentProvider_PaymentProviderID.[Name] AS [PaymentProvider],
    mjBizAppsCommonOrganization_BillToOrganizationID.[Name] AS [BillToOrganization],
    mjBizAppsCommonPerson_BillToPersonID.[DisplayName] AS [BillToPerson]
FROM
    [${flyway:defaultSchema}].[ExternalCustomer] AS e
INNER JOIN
    [${flyway:defaultSchema}].[PaymentProvider] AS mjBizAppsOrdersPaymentProvider_PaymentProviderID
  ON
    [e].[PaymentProviderID] = mjBizAppsOrdersPaymentProvider_PaymentProviderID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_BillToOrganizationID
  ON
    [e].[BillToOrganizationID] = mjBizAppsCommonOrganization_BillToOrganizationID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_BillToPersonID
  ON
    [e].[BillToPersonID] = mjBizAppsCommonPerson_BillToPersonID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwExternalCustomers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: External Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Customers
-- Item: Permissions for vwExternalCustomers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwExternalCustomers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: External Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Customers
-- Item: spCreateExternalCustomer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ExternalCustomer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateExternalCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateExternalCustomer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateExternalCustomer]
    @ID uniqueidentifier = NULL,
    @PaymentProviderID uniqueidentifier,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @ExternalCustomerRef nvarchar(100),
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ExternalCustomer]
            (
                [ID],
                [PaymentProviderID],
                [BillToOrganizationID],
                [BillToPersonID],
                [ExternalCustomerRef],
                [LastSyncedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentProviderID,
                CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, NULL) END,
                CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, NULL) END,
                @ExternalCustomerRef,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ExternalCustomer]
            (
                [PaymentProviderID],
                [BillToOrganizationID],
                [BillToPersonID],
                [ExternalCustomerRef],
                [LastSyncedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentProviderID,
                CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, NULL) END,
                CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, NULL) END,
                @ExternalCustomerRef,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwExternalCustomers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalCustomer] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: External Customers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalCustomer] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: External Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Customers
-- Item: spUpdateExternalCustomer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExternalCustomer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateExternalCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalCustomer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalCustomer]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @ExternalCustomerRef nvarchar(100) = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalCustomer]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [BillToOrganizationID] = CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, [BillToOrganizationID]) END,
        [BillToPersonID] = CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, [BillToPersonID]) END,
        [ExternalCustomerRef] = ISNULL(@ExternalCustomerRef, [ExternalCustomerRef]),
        [LastSyncedAt] = CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, [LastSyncedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwExternalCustomers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwExternalCustomers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalCustomer] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalCustomer table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateExternalCustomer]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateExternalCustomer];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateExternalCustomer
ON [${flyway:defaultSchema}].[ExternalCustomer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalCustomer]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ExternalCustomer] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: External Customers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalCustomer] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: External Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Customers
-- Item: spDeleteExternalCustomer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ExternalCustomer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteExternalCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteExternalCustomer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteExternalCustomer]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ExternalCustomer]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExternalCustomer] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: External Customers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExternalCustomer] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: External Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Invoices
-- Item: vwExternalInvoices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: External Invoices
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ExternalInvoice
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwExternalInvoices]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwExternalInvoices];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwExternalInvoices]
AS
SELECT
    e.*,
    mjBizAppsOrdersPaymentProvider_PaymentProviderID.[Name] AS [PaymentProvider],
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader],
    MJCompany_CompanyID.[Name] AS [Company],
    MJUser_IssuedByUserID.[Name] AS [IssuedByUser]
FROM
    [${flyway:defaultSchema}].[ExternalInvoice] AS e
INNER JOIN
    [${flyway:defaultSchema}].[PaymentProvider] AS mjBizAppsOrdersPaymentProvider_PaymentProviderID
  ON
    [e].[PaymentProviderID] = mjBizAppsOrdersPaymentProvider_PaymentProviderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [e].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [e].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_IssuedByUserID
  ON
    [e].[IssuedByUserID] = MJUser_IssuedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwExternalInvoices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: External Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Invoices
-- Item: Permissions for vwExternalInvoices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwExternalInvoices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: External Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Invoices
-- Item: spCreateExternalInvoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ExternalInvoice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateExternalInvoice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateExternalInvoice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateExternalInvoice]
    @ID uniqueidentifier = NULL,
    @PaymentProviderID uniqueidentifier,
    @OrderHeaderID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @OrderHeaderPaymentScheduleID_Clear bit = 0,
    @OrderHeaderPaymentScheduleID uniqueidentifier = NULL,
    @DocumentNumber nvarchar(40),
    @Amount decimal(18, 2),
    @DueDate_Clear bit = 0,
    @DueDate date = NULL,
    @Status nvarchar(20) = NULL,
    @ExternalCustomerRef_Clear bit = 0,
    @ExternalCustomerRef nvarchar(100) = NULL,
    @ExternalInvoiceRef_Clear bit = 0,
    @ExternalInvoiceRef nvarchar(100) = NULL,
    @ExternalTotal_Clear bit = 0,
    @ExternalTotal decimal(18, 2) = NULL,
    @ExternalDueAmount_Clear bit = 0,
    @ExternalDueAmount decimal(18, 2) = NULL,
    @ExternalStatus_Clear bit = 0,
    @ExternalStatus nvarchar(40) = NULL,
    @SentAt_Clear bit = 0,
    @SentAt datetimeoffset = NULL,
    @CanceledAt_Clear bit = 0,
    @CanceledAt datetimeoffset = NULL,
    @CancelReason_Clear bit = 0,
    @CancelReason nvarchar(500) = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(MAX) = NULL,
    @IssuedByUserID_Clear bit = 0,
    @IssuedByUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ExternalInvoice]
            (
                [ID],
                [PaymentProviderID],
                [OrderHeaderID],
                [CompanyID],
                [OrderHeaderPaymentScheduleID],
                [DocumentNumber],
                [Amount],
                [DueDate],
                [Status],
                [ExternalCustomerRef],
                [ExternalInvoiceRef],
                [ExternalTotal],
                [ExternalDueAmount],
                [ExternalStatus],
                [SentAt],
                [CanceledAt],
                [CancelReason],
                [LastSyncedAt],
                [LastError],
                [IssuedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentProviderID,
                @OrderHeaderID,
                @CompanyID,
                CASE WHEN @OrderHeaderPaymentScheduleID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderPaymentScheduleID, NULL) END,
                @DocumentNumber,
                @Amount,
                CASE WHEN @DueDate_Clear = 1 THEN NULL ELSE ISNULL(@DueDate, NULL) END,
                ISNULL(@Status, 'Sending'),
                CASE WHEN @ExternalCustomerRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalCustomerRef, NULL) END,
                CASE WHEN @ExternalInvoiceRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalInvoiceRef, NULL) END,
                CASE WHEN @ExternalTotal_Clear = 1 THEN NULL ELSE ISNULL(@ExternalTotal, NULL) END,
                CASE WHEN @ExternalDueAmount_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDueAmount, NULL) END,
                CASE WHEN @ExternalStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExternalStatus, NULL) END,
                CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, NULL) END,
                CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, NULL) END,
                CASE WHEN @CancelReason_Clear = 1 THEN NULL ELSE ISNULL(@CancelReason, NULL) END,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END,
                CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, NULL) END,
                CASE WHEN @IssuedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@IssuedByUserID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ExternalInvoice]
            (
                [PaymentProviderID],
                [OrderHeaderID],
                [CompanyID],
                [OrderHeaderPaymentScheduleID],
                [DocumentNumber],
                [Amount],
                [DueDate],
                [Status],
                [ExternalCustomerRef],
                [ExternalInvoiceRef],
                [ExternalTotal],
                [ExternalDueAmount],
                [ExternalStatus],
                [SentAt],
                [CanceledAt],
                [CancelReason],
                [LastSyncedAt],
                [LastError],
                [IssuedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentProviderID,
                @OrderHeaderID,
                @CompanyID,
                CASE WHEN @OrderHeaderPaymentScheduleID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderPaymentScheduleID, NULL) END,
                @DocumentNumber,
                @Amount,
                CASE WHEN @DueDate_Clear = 1 THEN NULL ELSE ISNULL(@DueDate, NULL) END,
                ISNULL(@Status, 'Sending'),
                CASE WHEN @ExternalCustomerRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalCustomerRef, NULL) END,
                CASE WHEN @ExternalInvoiceRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalInvoiceRef, NULL) END,
                CASE WHEN @ExternalTotal_Clear = 1 THEN NULL ELSE ISNULL(@ExternalTotal, NULL) END,
                CASE WHEN @ExternalDueAmount_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDueAmount, NULL) END,
                CASE WHEN @ExternalStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExternalStatus, NULL) END,
                CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, NULL) END,
                CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, NULL) END,
                CASE WHEN @CancelReason_Clear = 1 THEN NULL ELSE ISNULL(@CancelReason, NULL) END,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END,
                CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, NULL) END,
                CASE WHEN @IssuedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@IssuedByUserID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwExternalInvoices] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalInvoice] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: External Invoices */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalInvoice] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: External Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Invoices
-- Item: spUpdateExternalInvoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExternalInvoice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateExternalInvoice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalInvoice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalInvoice]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier = NULL,
    @OrderHeaderPaymentScheduleID_Clear bit = 0,
    @OrderHeaderPaymentScheduleID uniqueidentifier = NULL,
    @DocumentNumber nvarchar(40) = NULL,
    @Amount decimal(18, 2) = NULL,
    @DueDate_Clear bit = 0,
    @DueDate date = NULL,
    @Status nvarchar(20) = NULL,
    @ExternalCustomerRef_Clear bit = 0,
    @ExternalCustomerRef nvarchar(100) = NULL,
    @ExternalInvoiceRef_Clear bit = 0,
    @ExternalInvoiceRef nvarchar(100) = NULL,
    @ExternalTotal_Clear bit = 0,
    @ExternalTotal decimal(18, 2) = NULL,
    @ExternalDueAmount_Clear bit = 0,
    @ExternalDueAmount decimal(18, 2) = NULL,
    @ExternalStatus_Clear bit = 0,
    @ExternalStatus nvarchar(40) = NULL,
    @SentAt_Clear bit = 0,
    @SentAt datetimeoffset = NULL,
    @CanceledAt_Clear bit = 0,
    @CanceledAt datetimeoffset = NULL,
    @CancelReason_Clear bit = 0,
    @CancelReason nvarchar(500) = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(MAX) = NULL,
    @IssuedByUserID_Clear bit = 0,
    @IssuedByUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalInvoice]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [OrderHeaderPaymentScheduleID] = CASE WHEN @OrderHeaderPaymentScheduleID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderPaymentScheduleID, [OrderHeaderPaymentScheduleID]) END,
        [DocumentNumber] = ISNULL(@DocumentNumber, [DocumentNumber]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [DueDate] = CASE WHEN @DueDate_Clear = 1 THEN NULL ELSE ISNULL(@DueDate, [DueDate]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ExternalCustomerRef] = CASE WHEN @ExternalCustomerRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalCustomerRef, [ExternalCustomerRef]) END,
        [ExternalInvoiceRef] = CASE WHEN @ExternalInvoiceRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalInvoiceRef, [ExternalInvoiceRef]) END,
        [ExternalTotal] = CASE WHEN @ExternalTotal_Clear = 1 THEN NULL ELSE ISNULL(@ExternalTotal, [ExternalTotal]) END,
        [ExternalDueAmount] = CASE WHEN @ExternalDueAmount_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDueAmount, [ExternalDueAmount]) END,
        [ExternalStatus] = CASE WHEN @ExternalStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExternalStatus, [ExternalStatus]) END,
        [SentAt] = CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, [SentAt]) END,
        [CanceledAt] = CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, [CanceledAt]) END,
        [CancelReason] = CASE WHEN @CancelReason_Clear = 1 THEN NULL ELSE ISNULL(@CancelReason, [CancelReason]) END,
        [LastSyncedAt] = CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, [LastSyncedAt]) END,
        [LastError] = CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, [LastError]) END,
        [IssuedByUserID] = CASE WHEN @IssuedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@IssuedByUserID, [IssuedByUserID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwExternalInvoices] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwExternalInvoices]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalInvoice] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalInvoice table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateExternalInvoice]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateExternalInvoice];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateExternalInvoice
ON [${flyway:defaultSchema}].[ExternalInvoice]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalInvoice]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ExternalInvoice] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: External Invoices */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalInvoice] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: External Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Invoices
-- Item: spDeleteExternalInvoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ExternalInvoice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteExternalInvoice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteExternalInvoice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteExternalInvoice]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ExternalInvoice]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExternalInvoice] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: External Invoices */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExternalInvoice] TO [cdp_Developer], [cdp_Integration];

UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'
                AND [Sequence] >= 100000
         );

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1390caee-9e1d-415a-b663-964f6d3020c5' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'PaymentProvider')) BEGIN
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
            '1390caee-9e1d-415a-b663-964f6d3020c5',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'PaymentProvider',
            'Payment Provider',
            NULL,
            'nvarchar',
            400,
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '74942eff-6fa3-4c69-8400-6860fa2c129d' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'OrderHeader')) BEGIN
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
            '74942eff-6fa3-4c69-8400-6860fa2c129d',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ea7652ed-6b8f-42ec-8e0c-a7fd11335542' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'Company')) BEGIN
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
            'ea7652ed-6b8f-42ec-8e0c-a7fd11335542',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a6207a06-05ac-4ea0-a916-8fd75930ae2f' OR (EntityID = '9915A9E7-6BC6-4518-BAEA-206B18C86622' AND Name = 'IssuedByUser')) BEGIN
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
            'a6207a06-05ac-4ea0-a916-8fd75930ae2f',
            '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- Entity: MJ_BizApps_Orders: External Invoices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9915A9E7-6BC6-4518-BAEA-206B18C86622'),
            'IssuedByUser',
            'Issued By User',
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

UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'
                AND [Sequence] >= 100000
         );

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2cee7a5e-f99d-4a0f-b40d-b2ed7b500fa3' OR (EntityID = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF' AND Name = 'PaymentProvider')) BEGIN
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
            '2cee7a5e-f99d-4a0f-b40d-b2ed7b500fa3',
            '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', -- Entity: MJ_BizApps_Orders: External Customers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'),
            'PaymentProvider',
            'Payment Provider',
            NULL,
            'nvarchar',
            400,
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '598290d9-9264-49e0-bcd6-61e68e814ab3' OR (EntityID = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF' AND Name = 'BillToOrganization')) BEGIN
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
            '598290d9-9264-49e0-bcd6-61e68e814ab3',
            '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', -- Entity: MJ_BizApps_Orders: External Customers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'),
            'BillToOrganization',
            'Bill To Organization',
            NULL,
            'nvarchar',
            510,
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1466fd5f-da1a-451e-9584-4afb25a35723' OR (EntityID = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF' AND Name = 'BillToPerson')) BEGIN
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
            '1466fd5f-da1a-451e-9584-4afb25a35723',
            '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', -- Entity: MJ_BizApps_Orders: External Customers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1
               FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'),
            'BillToPerson',
            'Bill To Person',
            NULL,
            'nvarchar',
            402,
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
