-- =============================================================================
-- ExternalPayment and PaymentProviderSyncState — the payment poller's ledger and watermark.
--
-- golive #148: poll Bill.com for receivable payments and create exactly one Payment per cleared
-- payment. ExternalPayment records EVERY rail payment the poller has seen and what it did with it —
-- Captured (with the PaymentHeader it made), Held (not yet cleared, or an unknown status), Unmatched
-- (an invoice we did not issue), Ignored, Refused, or ReversalNeeded (captured, and the rail now says void).
-- The audit trail and the exceptions worklist are the same table. The D19 idempotency guarantee is
-- PaymentHeader.IdempotencyKey ('billcom:0rp…') and its unique index; this row is the cheap lookup
-- in front of it and the answer to "why was this payment not applied".
--
-- PaymentProviderSyncState is the poll watermark per provider row per rail object. Orders-owned
-- because the MJ sync engine's watermark is keyed by entity map, which this integration does not use.
--
-- Plain DDL, GO-separated, one sp_addextendedproperty per description (the #219/#220 shape).
-- No __mj_CreatedAt/__mj_UpdatedAt, no FK indexes — CodeGen owns both.
-- =============================================================================

CREATE TABLE [${flyway:defaultSchema}].[ExternalPayment] (
    [ID]                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ExternalPayment_ID] DEFAULT (newsequentialid()),
    [PaymentProviderID]   UNIQUEIDENTIFIER NOT NULL,
    [ExternalPaymentRef]  NVARCHAR(100)    NOT NULL,
    [ExternalCustomerRef] NVARCHAR(100)    NULL,
    [Amount]              DECIMAL(18,2)    NOT NULL,
    [UnappliedAmount]     DECIMAL(18,2)    NOT NULL CONSTRAINT [DF_ExternalPayment_UnappliedAmount] DEFAULT (0),
    [PaymentDate]         DATE             NULL,
    [ExternalStatus]      NVARCHAR(40)     NULL,
    [ExternalUpdatedAt]   DATETIMEOFFSET   NULL,
    [Disposition]         NVARCHAR(20)     NOT NULL,
    [DispositionReason]   NVARCHAR(500)    NULL,
    [PaymentHeaderID]     UNIQUEIDENTIFIER NULL,
    [Payload]             NVARCHAR(MAX)    NULL,
    [FirstSeenAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_ExternalPayment_FirstSeenAt] DEFAULT (SYSDATETIMEOFFSET()),
    [LastSeenAt]          DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_ExternalPayment_LastSeenAt]  DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT [PK_ExternalPayment] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_ExternalPayment_PaymentProvider] FOREIGN KEY ([PaymentProviderID]) REFERENCES [${flyway:defaultSchema}].[PaymentProvider]([ID]),
    CONSTRAINT [FK_ExternalPayment_PaymentHeader]   FOREIGN KEY ([PaymentHeaderID])   REFERENCES [${flyway:defaultSchema}].[PaymentHeader]([ID]),
    CONSTRAINT [UQ_ExternalPayment_Ref] UNIQUE ([PaymentProviderID], [ExternalPaymentRef]),
    CONSTRAINT [CK_ExternalPayment_Disposition] CHECK ([Disposition] IN (N'Captured', N'Held', N'Unmatched', N'Refused', N'Ignored', N'ReversalNeeded')),
    -- A captured payment always knows which PaymentHeader it made.
    CONSTRAINT [CK_ExternalPayment_CapturedHasHeader] CHECK ([Disposition] <> N'Captured' OR [PaymentHeaderID] IS NOT NULL)
);
GO

CREATE TABLE [${flyway:defaultSchema}].[PaymentProviderSyncState] (
    [ID]                UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_PaymentProviderSyncState_ID] DEFAULT (newsequentialid()),
    [PaymentProviderID] UNIQUEIDENTIFIER NOT NULL,
    [ObjectName]        NVARCHAR(100)    NOT NULL,
    [Watermark]         NVARCHAR(100)    NULL,
    [LastPolledAt]      DATETIMEOFFSET   NULL,
    [LastSucceededAt]   DATETIMEOFFSET   NULL,
    [LastError]         NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_PaymentProviderSyncState] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_PaymentProviderSyncState_PaymentProvider] FOREIGN KEY ([PaymentProviderID]) REFERENCES [${flyway:defaultSchema}].[PaymentProvider]([ID]),
    CONSTRAINT [UQ_PaymentProviderSyncState] UNIQUE ([PaymentProviderID], [ObjectName])
);
GO

-- -----------------------------------------------------------------------------
-- Descriptions
-- -----------------------------------------------------------------------------
EXEC sp_addextendedproperty N'MS_Description', N'Every receivable payment the poller has seen on an external AR rail (Bill.com), and what it did with it. Captured rows name the PaymentHeader they created; Held, Unmatched and ReversalNeeded rows are the exceptions worklist. The idempotency guarantee itself is PaymentHeader.IdempotencyKey; this is the lookup in front of it and the audit trail.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment';
EXEC sp_addextendedproperty N'MS_Description', N'The provider row (rail + company) the payment was read from.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'PaymentProviderID';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s payment id (Bill.com 0rp…). Unique per provider.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'ExternalPaymentRef';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s customer id the payment came from.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'ExternalCustomerRef';
EXEC sp_addextendedproperty N'MS_Description', N'The payment''s gross amount as the rail reports it.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'Amount';
EXEC sp_addextendedproperty N'MS_Description', N'The part the rail has not applied to any invoice (over-payment or unlinked). Stays on the rail as the customer''s credit.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'UnappliedAmount';
EXEC sp_addextendedproperty N'MS_Description', N'When the rail says funds moved.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'PaymentDate';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s status string, verbatim, as last seen.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'ExternalStatus';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s updatedTime as last seen — the watermark candidate.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'ExternalUpdatedAt';
EXEC sp_addextendedproperty N'MS_Description', N'Captured, Held (pending or unknown status), Unmatched (an invoice we did not issue), Refused (Orders.CapturePayment refused it — a split-company order, an ambiguous payer, a configuration fault), Ignored (nothing to do, or set aside by a person), ReversalNeeded (captured, and the rail now reports it reversed).', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'Disposition';
EXEC sp_addextendedproperty N'MS_Description', N'Why, in words a person can act on.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'DispositionReason';
EXEC sp_addextendedproperty N'MS_Description', N'The Orders payment created for a Captured row.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'PaymentHeaderID';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s record as received, JSON, for the audit trail.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'Payload';
EXEC sp_addextendedproperty N'MS_Description', N'First poll that saw this payment.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'FirstSeenAt';
EXEC sp_addextendedproperty N'MS_Description', N'Most recent poll that saw this payment.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'ExternalPayment', N'COLUMN', N'LastSeenAt';
GO

EXEC sp_addextendedproperty N'MS_Description', N'Poll watermark and last-run outcome per provider row per rail object (e.g. receivable-payments). Advanced only after a pass completes without a fault.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState';
EXEC sp_addextendedproperty N'MS_Description', N'The provider row (rail + company) this watermark belongs to.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState', N'COLUMN', N'PaymentProviderID';
EXEC sp_addextendedproperty N'MS_Description', N'The rail object polled, e.g. receivable-payments.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState', N'COLUMN', N'ObjectName';
EXEC sp_addextendedproperty N'MS_Description', N'The rail''s max updatedTime seen on the last clean pass (ISO). The next pass reads from one day before it; dedupe is by payment id.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState', N'COLUMN', N'Watermark';
EXEC sp_addextendedproperty N'MS_Description', N'When the last pass started.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState', N'COLUMN', N'LastPolledAt';
EXEC sp_addextendedproperty N'MS_Description', N'When the last pass completed without a fault.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState', N'COLUMN', N'LastSucceededAt';
EXEC sp_addextendedproperty N'MS_Description', N'The fault that stopped the last pass, if any.', N'SCHEMA', N'${flyway:defaultSchema}', N'TABLE', N'PaymentProviderSyncState', N'COLUMN', N'LastError';
GO

-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the External Payments and Payment Provider Sync States entities, their fields, relationships,
-- base views, CRUD procedures and permissions. Produced by MJ CodeGen 6.1 against
-- MJ_BizAppsSales_QA on 2026-09-21 and carved to this migration's objects (the same run also
-- regenerated Event Products / Order Lines objects from unrelated drift; those are not here).
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Orders: External Payments */

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
         'bf3b92da-2c31-4c81-87ba-6ce08fc5b85d',
         'MJ_BizApps_Orders: External Payments',
         'External Payments',
         'Every receivable payment the poller has seen on an external AR rail (Bill.com), and what it did with it. Captured rows name the PaymentHeader they created; Held, Unmatched and ReversalNeeded rows are the exceptions worklist. The idempotency guarantee itself is PaymentHeader.IdempotencyKey; this is the lookup in front of it and the audit trail.',
         NULL,
         'ExternalPayment',
         'vwExternalPayments',
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

/* SQL generated to add new entity MJ_BizApps_Orders: External Payments to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'bf3b92da-2c31-4c81-87ba-6ce08fc5b85d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: External Payments for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bf3b92da-2c31-4c81-87ba-6ce08fc5b85d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: External Payments for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bf3b92da-2c31-4c81-87ba-6ce08fc5b85d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: External Payments for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bf3b92da-2c31-4c81-87ba-6ce08fc5b85d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Orders: Payment Provider Sync States */

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
         'cc876ff9-d182-498d-8d34-e109adf56a0e',
         'MJ_BizApps_Orders: Payment Provider Sync States',
         'Payment Provider Sync States',
         'Poll watermark and last-run outcome per provider row per rail object (e.g. receivable-payments). Advanced only after a pass completes without a fault.',
         NULL,
         'PaymentProviderSyncState',
         'vwPaymentProviderSyncStates',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Payment Provider Sync States to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'cc876ff9-d182-498d-8d34-e109adf56a0e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Payment Provider Sync States for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cc876ff9-d182-498d-8d34-e109adf56a0e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Payment Provider Sync States for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cc876ff9-d182-498d-8d34-e109adf56a0e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Payment Provider Sync States for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cc876ff9-d182-498d-8d34-e109adf56a0e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalPayment */
ALTER TABLE [${flyway:defaultSchema}].[ExternalPayment] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalPayment */
UPDATE [${flyway:defaultSchema}].[ExternalPayment] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalPayment */
ALTER TABLE [${flyway:defaultSchema}].[ExternalPayment] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalPayment */
ALTER TABLE [${flyway:defaultSchema}].[ExternalPayment] ADD CONSTRAINT [DF___mj_BizAppsOrders_ExternalPayment___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalPayment */
ALTER TABLE [${flyway:defaultSchema}].[ExternalPayment] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalPayment */
UPDATE [${flyway:defaultSchema}].[ExternalPayment] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalPayment */
ALTER TABLE [${flyway:defaultSchema}].[ExternalPayment] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalPayment */
ALTER TABLE [${flyway:defaultSchema}].[ExternalPayment] ADD CONSTRAINT [DF___mj_BizAppsOrders_ExternalPayment___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PaymentProviderSyncState */
ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderSyncState] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PaymentProviderSyncState */
UPDATE [${flyway:defaultSchema}].[PaymentProviderSyncState] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PaymentProviderSyncState */
ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderSyncState] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PaymentProviderSyncState */
ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderSyncState] ADD CONSTRAINT [DF___mj_BizAppsOrders_PaymentProviderSyncState___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PaymentProviderSyncState */
ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderSyncState] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PaymentProviderSyncState */
UPDATE [${flyway:defaultSchema}].[PaymentProviderSyncState] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PaymentProviderSyncState */
ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderSyncState] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PaymentProviderSyncState */
ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderSyncState] ADD CONSTRAINT [DF___mj_BizAppsOrders_PaymentProviderSyncState___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D'
                AND [Sequence] >= 100000
         );

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '035c9d20-ea33-4144-aba6-369d1d66f935' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'ID')) BEGIN
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
            '035c9d20-ea33-4144-aba6-369d1d66f935',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            1,
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c11aa055-85e2-4d56-bbd4-fd90b86756d0' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'PaymentProviderID')) BEGIN
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
            'c11aa055-85e2-4d56-bbd4-fd90b86756d0',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            2,
            'PaymentProviderID',
            'Payment Provider ID',
            'The provider row (rail + company) the payment was read from.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4b274763-06f1-410c-9a8f-60ef285da244' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'ExternalPaymentRef')) BEGIN
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
            '4b274763-06f1-410c-9a8f-60ef285da244',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            3,
            'ExternalPaymentRef',
            'External Payment Ref',
            'The rail''s payment id (Bill.com 0rp…). Unique per provider.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '45ab2005-2ad6-4099-b9f5-4cbbc8c23bfa' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'ExternalCustomerRef')) BEGIN
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
            '45ab2005-2ad6-4099-b9f5-4cbbc8c23bfa',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            4,
            'ExternalCustomerRef',
            'External Customer Ref',
            'The rail''s customer id the payment came from.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3abdcb7e-5549-4ede-9e47-3e6789e96f9d' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'Amount')) BEGIN
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
            '3abdcb7e-5549-4ede-9e47-3e6789e96f9d',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            5,
            'Amount',
            'Amount',
            'The payment''s gross amount as the rail reports it.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0eac9798-4fe1-4d59-96f9-37410f441fe0' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'UnappliedAmount')) BEGIN
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
            '0eac9798-4fe1-4d59-96f9-37410f441fe0',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            6,
            'UnappliedAmount',
            'Unapplied Amount',
            'The part the rail has not applied to any invoice (over-payment or unlinked). Stays on the rail as the customer''s credit.',
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

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b1755b9b-a887-440a-b13f-391b7ba33328' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'PaymentDate')) BEGIN
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
            'b1755b9b-a887-440a-b13f-391b7ba33328',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            7,
            'PaymentDate',
            'Payment Date',
            'When the rail says funds moved.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7b26fe6c-e304-4b63-89e5-6ff4afc6dc5f' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'ExternalStatus')) BEGIN
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
            '7b26fe6c-e304-4b63-89e5-6ff4afc6dc5f',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            8,
            'ExternalStatus',
            'External Status',
            'The rail''s status string, verbatim, as last seen.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd515c784-70d5-4a2f-8941-e355391b399f' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'ExternalUpdatedAt')) BEGIN
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
            'd515c784-70d5-4a2f-8941-e355391b399f',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            9,
            'ExternalUpdatedAt',
            'External Updated At',
            'The rail''s updatedTime as last seen — the watermark candidate.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bb6560e3-6e78-4b6d-a11b-f7d45253c370' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'Disposition')) BEGIN
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
            'bb6560e3-6e78-4b6d-a11b-f7d45253c370',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            10,
            'Disposition',
            'Disposition',
            'Captured, Held (pending or unknown status), Unmatched (an invoice we did not issue), Refused (Orders.CapturePayment refused it — a split-company order, an ambiguous payer, a configuration fault), Ignored (nothing to do, or set aside by a person), ReversalNeeded (captured, and the rail now reports it reversed).',
            'nvarchar',
            40,
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '64dd727b-80b2-4a3f-bc00-fe12e54fea56' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'DispositionReason')) BEGIN
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
            '64dd727b-80b2-4a3f-bc00-fe12e54fea56',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            11,
            'DispositionReason',
            'Disposition Reason',
            'Why, in words a person can act on.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b1761381-eccc-45e1-ba4e-55165eb9286d' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'PaymentHeaderID')) BEGIN
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
            'b1761381-eccc-45e1-ba4e-55165eb9286d',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            12,
            'PaymentHeaderID',
            'Payment Header ID',
            'The Orders payment created for a Captured row.',
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
            'CE97BF15-F7C6-4C50-A744-A89C714A4DDD',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '10bfebe2-6343-47ad-85a9-c8adae725f7a' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'Payload')) BEGIN
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
            '10bfebe2-6343-47ad-85a9-c8adae725f7a',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            13,
            'Payload',
            'Payload',
            'The rail''s record as received, JSON, for the audit trail.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7c9456d8-4266-44b5-a113-241b7b656478' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'FirstSeenAt')) BEGIN
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
            '7c9456d8-4266-44b5-a113-241b7b656478',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            14,
            'FirstSeenAt',
            'First Seen At',
            'First poll that saw this payment.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '62938db4-026e-4bee-9059-3695bcb5dfb2' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'LastSeenAt')) BEGIN
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
            '62938db4-026e-4bee-9059-3695bcb5dfb2',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            15,
            'LastSeenAt',
            'Last Seen At',
            'Most recent poll that saw this payment.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1864dcf1-a508-49c6-b0c1-c55252a49813' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = '__mj_CreatedAt')) BEGIN
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
            '1864dcf1-a508-49c6-b0c1-c55252a49813',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            16,
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3507a4cd-b05f-42e3-a45b-afaeff763dd1' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '3507a4cd-b05f-42e3-a45b-afaeff763dd1',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            17,
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
       WHERE [EntityID] = 'CC876FF9-D182-498D-8D34-E109ADF56A0E'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = 'CC876FF9-D182-498D-8D34-E109ADF56A0E'
                AND [Sequence] >= 100000
         );

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '542954ce-513f-4691-8848-6f92754c387b' OR (EntityID = 'CC876FF9-D182-498D-8D34-E109ADF56A0E' AND Name = 'ID')) BEGIN
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
            '542954ce-513f-4691-8848-6f92754c387b',
            'CC876FF9-D182-498D-8D34-E109ADF56A0E', -- Entity: MJ_BizApps_Orders: Payment Provider Sync States
            1,
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b993912b-46ea-435e-8e9f-9b527f583596' OR (EntityID = 'CC876FF9-D182-498D-8D34-E109ADF56A0E' AND Name = 'PaymentProviderID')) BEGIN
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
            'b993912b-46ea-435e-8e9f-9b527f583596',
            'CC876FF9-D182-498D-8D34-E109ADF56A0E', -- Entity: MJ_BizApps_Orders: Payment Provider Sync States
            2,
            'PaymentProviderID',
            'Payment Provider ID',
            'The provider row (rail + company) this watermark belongs to.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c7b2055e-556b-45cb-a2d7-571029515688' OR (EntityID = 'CC876FF9-D182-498D-8D34-E109ADF56A0E' AND Name = 'ObjectName')) BEGIN
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
            'c7b2055e-556b-45cb-a2d7-571029515688',
            'CC876FF9-D182-498D-8D34-E109ADF56A0E', -- Entity: MJ_BizApps_Orders: Payment Provider Sync States
            3,
            'ObjectName',
            'Object Name',
            'The rail object polled, e.g. receivable-payments.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1af06c51-62e2-4949-9489-c1ffc7be79e7' OR (EntityID = 'CC876FF9-D182-498D-8D34-E109ADF56A0E' AND Name = 'Watermark')) BEGIN
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
            '1af06c51-62e2-4949-9489-c1ffc7be79e7',
            'CC876FF9-D182-498D-8D34-E109ADF56A0E', -- Entity: MJ_BizApps_Orders: Payment Provider Sync States
            4,
            'Watermark',
            'Watermark',
            'The rail''s max updatedTime seen on the last clean pass (ISO). The next pass reads from one day before it; dedupe is by payment id.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a3f1ccbd-a2a5-44d9-960e-01a6066da070' OR (EntityID = 'CC876FF9-D182-498D-8D34-E109ADF56A0E' AND Name = 'LastPolledAt')) BEGIN
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
            'a3f1ccbd-a2a5-44d9-960e-01a6066da070',
            'CC876FF9-D182-498D-8D34-E109ADF56A0E', -- Entity: MJ_BizApps_Orders: Payment Provider Sync States
            5,
            'LastPolledAt',
            'Last Polled At',
            'When the last pass started.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0ffa66f4-0dfb-4cb5-8810-03bb01e0cf34' OR (EntityID = 'CC876FF9-D182-498D-8D34-E109ADF56A0E' AND Name = 'LastSucceededAt')) BEGIN
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
            '0ffa66f4-0dfb-4cb5-8810-03bb01e0cf34',
            'CC876FF9-D182-498D-8D34-E109ADF56A0E', -- Entity: MJ_BizApps_Orders: Payment Provider Sync States
            6,
            'LastSucceededAt',
            'Last Succeeded At',
            'When the last pass completed without a fault.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ebc0273e-bd40-4b9d-9ee7-be1a16c65774' OR (EntityID = 'CC876FF9-D182-498D-8D34-E109ADF56A0E' AND Name = 'LastError')) BEGIN
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
            'ebc0273e-bd40-4b9d-9ee7-be1a16c65774',
            'CC876FF9-D182-498D-8D34-E109ADF56A0E', -- Entity: MJ_BizApps_Orders: Payment Provider Sync States
            7,
            'LastError',
            'Last Error',
            'The fault that stopped the last pass, if any.',
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ca825ef3-9533-4c16-8785-fdd4363b5a89' OR (EntityID = 'CC876FF9-D182-498D-8D34-E109ADF56A0E' AND Name = '__mj_CreatedAt')) BEGIN
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
            'ca825ef3-9533-4c16-8785-fdd4363b5a89',
            'CC876FF9-D182-498D-8D34-E109ADF56A0E', -- Entity: MJ_BizApps_Orders: Payment Provider Sync States
            8,
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2c099c9f-16c7-47b9-941c-05df22899ede' OR (EntityID = 'CC876FF9-D182-498D-8D34-E109ADF56A0E' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '2c099c9f-16c7-47b9-941c-05df22899ede',
            'CC876FF9-D182-498D-8D34-E109ADF56A0E', -- Entity: MJ_BizApps_Orders: Payment Provider Sync States
            9,
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

/* Create Entity Relationship: MJ_BizApps_Orders: Payment Headers -> MJ_BizApps_Orders: External Payments (One To Many via PaymentHeaderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '0c7b3128-adb5-4888-8ef5-216942e7504b'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0c7b3128-adb5-4888-8ef5-216942e7504b', 'CE97BF15-F7C6-4C50-A744-A89C714A4DDD', 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', 'PaymentHeaderID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;

/* Create Entity Relationship: MJ_BizApps_Orders: Payment Providers -> MJ_BizApps_Orders: Payment Provider Sync States (One To Many via PaymentProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '15d08ba2-9836-4411-9d53-fa520ad6ae60'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('15d08ba2-9836-4411-9d53-fa520ad6ae60', 'FDC49E63-B229-40BB-9ABC-F384D7750123', 'CC876FF9-D182-498D-8D34-E109ADF56A0E', 'PaymentProviderID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;

/* Create Entity Relationship: MJ_BizApps_Orders: Payment Providers -> MJ_BizApps_Orders: External Payments (One To Many via PaymentProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'cb2dcd4b-d2cb-4fc6-a33e-6b346052c748'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('cb2dcd4b-d2cb-4fc6-a33e-6b346052c748', 'FDC49E63-B229-40BB-9ABC-F384D7750123', 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', 'PaymentProviderID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ExternalPayment */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Payments
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PaymentProviderID in table ExternalPayment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExternalPayment_PaymentProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExternalPayment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExternalPayment_PaymentProviderID ON [${flyway:defaultSchema}].[ExternalPayment] ([PaymentProviderID]);

-- Index for foreign key PaymentHeaderID in table ExternalPayment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExternalPayment_PaymentHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExternalPayment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExternalPayment_PaymentHeaderID ON [${flyway:defaultSchema}].[ExternalPayment] ([PaymentHeaderID]);

/* SQL text to update entity field related entity name field map for entity field ID C11AA055-85E2-4D56-BBD4-FD90B86756D0 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C11AA055-85E2-4D56-BBD4-FD90B86756D0', @RelatedEntityNameFieldMap='PaymentProvider';

/* SQL text to update entity field related entity name field map for entity field ID B1761381-ECCC-45E1-BA4E-55165EB9286D */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B1761381-ECCC-45E1-BA4E-55165EB9286D', @RelatedEntityNameFieldMap='PaymentHeader';

/* Base View SQL for MJ_BizApps_Orders: External Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Payments
-- Item: vwExternalPayments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: External Payments
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ExternalPayment
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwExternalPayments]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwExternalPayments];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwExternalPayments]
AS
SELECT
    e.*,
    mjBizAppsOrdersPaymentProvider_PaymentProviderID.[Name] AS [PaymentProvider],
    mjBizAppsOrdersPaymentHeader_PaymentHeaderID.[PaymentNumber] AS [PaymentHeader]
FROM
    [${flyway:defaultSchema}].[ExternalPayment] AS e
INNER JOIN
    [${flyway:defaultSchema}].[PaymentProvider] AS mjBizAppsOrdersPaymentProvider_PaymentProviderID
  ON
    [e].[PaymentProviderID] = mjBizAppsOrdersPaymentProvider_PaymentProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentHeader] AS mjBizAppsOrdersPaymentHeader_PaymentHeaderID
  ON
    [e].[PaymentHeaderID] = mjBizAppsOrdersPaymentHeader_PaymentHeaderID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwExternalPayments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: External Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Payments
-- Item: Permissions for vwExternalPayments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwExternalPayments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: External Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Payments
-- Item: spCreateExternalPayment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ExternalPayment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateExternalPayment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateExternalPayment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateExternalPayment]
    @ID uniqueidentifier = NULL,
    @PaymentProviderID uniqueidentifier,
    @ExternalPaymentRef nvarchar(100),
    @ExternalCustomerRef_Clear bit = 0,
    @ExternalCustomerRef nvarchar(100) = NULL,
    @Amount decimal(18, 2),
    @UnappliedAmount decimal(18, 2) = NULL,
    @PaymentDate_Clear bit = 0,
    @PaymentDate date = NULL,
    @ExternalStatus_Clear bit = 0,
    @ExternalStatus nvarchar(40) = NULL,
    @ExternalUpdatedAt_Clear bit = 0,
    @ExternalUpdatedAt datetimeoffset = NULL,
    @Disposition nvarchar(20),
    @DispositionReason_Clear bit = 0,
    @DispositionReason nvarchar(500) = NULL,
    @PaymentHeaderID_Clear bit = 0,
    @PaymentHeaderID uniqueidentifier = NULL,
    @Payload_Clear bit = 0,
    @Payload nvarchar(MAX) = NULL,
    @FirstSeenAt datetimeoffset = NULL,
    @LastSeenAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ExternalPayment]
            (
                [ID],
                [PaymentProviderID],
                [ExternalPaymentRef],
                [ExternalCustomerRef],
                [Amount],
                [UnappliedAmount],
                [PaymentDate],
                [ExternalStatus],
                [ExternalUpdatedAt],
                [Disposition],
                [DispositionReason],
                [PaymentHeaderID],
                [Payload],
                [FirstSeenAt],
                [LastSeenAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentProviderID,
                @ExternalPaymentRef,
                CASE WHEN @ExternalCustomerRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalCustomerRef, NULL) END,
                @Amount,
                ISNULL(@UnappliedAmount, 0),
                CASE WHEN @PaymentDate_Clear = 1 THEN NULL ELSE ISNULL(@PaymentDate, NULL) END,
                CASE WHEN @ExternalStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExternalStatus, NULL) END,
                CASE WHEN @ExternalUpdatedAt_Clear = 1 THEN NULL ELSE ISNULL(@ExternalUpdatedAt, NULL) END,
                @Disposition,
                CASE WHEN @DispositionReason_Clear = 1 THEN NULL ELSE ISNULL(@DispositionReason, NULL) END,
                CASE WHEN @PaymentHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentHeaderID, NULL) END,
                CASE WHEN @Payload_Clear = 1 THEN NULL ELSE ISNULL(@Payload, NULL) END,
                ISNULL(@FirstSeenAt, sysdatetimeoffset()),
                ISNULL(@LastSeenAt, sysdatetimeoffset())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ExternalPayment]
            (
                [PaymentProviderID],
                [ExternalPaymentRef],
                [ExternalCustomerRef],
                [Amount],
                [UnappliedAmount],
                [PaymentDate],
                [ExternalStatus],
                [ExternalUpdatedAt],
                [Disposition],
                [DispositionReason],
                [PaymentHeaderID],
                [Payload],
                [FirstSeenAt],
                [LastSeenAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentProviderID,
                @ExternalPaymentRef,
                CASE WHEN @ExternalCustomerRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalCustomerRef, NULL) END,
                @Amount,
                ISNULL(@UnappliedAmount, 0),
                CASE WHEN @PaymentDate_Clear = 1 THEN NULL ELSE ISNULL(@PaymentDate, NULL) END,
                CASE WHEN @ExternalStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExternalStatus, NULL) END,
                CASE WHEN @ExternalUpdatedAt_Clear = 1 THEN NULL ELSE ISNULL(@ExternalUpdatedAt, NULL) END,
                @Disposition,
                CASE WHEN @DispositionReason_Clear = 1 THEN NULL ELSE ISNULL(@DispositionReason, NULL) END,
                CASE WHEN @PaymentHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentHeaderID, NULL) END,
                CASE WHEN @Payload_Clear = 1 THEN NULL ELSE ISNULL(@Payload, NULL) END,
                ISNULL(@FirstSeenAt, sysdatetimeoffset()),
                ISNULL(@LastSeenAt, sysdatetimeoffset())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwExternalPayments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalPayment] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: External Payments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalPayment] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: External Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Payments
-- Item: spUpdateExternalPayment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExternalPayment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateExternalPayment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalPayment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalPayment]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @ExternalPaymentRef nvarchar(100) = NULL,
    @ExternalCustomerRef_Clear bit = 0,
    @ExternalCustomerRef nvarchar(100) = NULL,
    @Amount decimal(18, 2) = NULL,
    @UnappliedAmount decimal(18, 2) = NULL,
    @PaymentDate_Clear bit = 0,
    @PaymentDate date = NULL,
    @ExternalStatus_Clear bit = 0,
    @ExternalStatus nvarchar(40) = NULL,
    @ExternalUpdatedAt_Clear bit = 0,
    @ExternalUpdatedAt datetimeoffset = NULL,
    @Disposition nvarchar(20) = NULL,
    @DispositionReason_Clear bit = 0,
    @DispositionReason nvarchar(500) = NULL,
    @PaymentHeaderID_Clear bit = 0,
    @PaymentHeaderID uniqueidentifier = NULL,
    @Payload_Clear bit = 0,
    @Payload nvarchar(MAX) = NULL,
    @FirstSeenAt datetimeoffset = NULL,
    @LastSeenAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalPayment]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [ExternalPaymentRef] = ISNULL(@ExternalPaymentRef, [ExternalPaymentRef]),
        [ExternalCustomerRef] = CASE WHEN @ExternalCustomerRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalCustomerRef, [ExternalCustomerRef]) END,
        [Amount] = ISNULL(@Amount, [Amount]),
        [UnappliedAmount] = ISNULL(@UnappliedAmount, [UnappliedAmount]),
        [PaymentDate] = CASE WHEN @PaymentDate_Clear = 1 THEN NULL ELSE ISNULL(@PaymentDate, [PaymentDate]) END,
        [ExternalStatus] = CASE WHEN @ExternalStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExternalStatus, [ExternalStatus]) END,
        [ExternalUpdatedAt] = CASE WHEN @ExternalUpdatedAt_Clear = 1 THEN NULL ELSE ISNULL(@ExternalUpdatedAt, [ExternalUpdatedAt]) END,
        [Disposition] = ISNULL(@Disposition, [Disposition]),
        [DispositionReason] = CASE WHEN @DispositionReason_Clear = 1 THEN NULL ELSE ISNULL(@DispositionReason, [DispositionReason]) END,
        [PaymentHeaderID] = CASE WHEN @PaymentHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentHeaderID, [PaymentHeaderID]) END,
        [Payload] = CASE WHEN @Payload_Clear = 1 THEN NULL ELSE ISNULL(@Payload, [Payload]) END,
        [FirstSeenAt] = ISNULL(@FirstSeenAt, [FirstSeenAt]),
        [LastSeenAt] = ISNULL(@LastSeenAt, [LastSeenAt])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwExternalPayments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwExternalPayments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalPayment] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalPayment table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateExternalPayment]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateExternalPayment];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateExternalPayment
ON [${flyway:defaultSchema}].[ExternalPayment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalPayment]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ExternalPayment] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: External Payments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalPayment] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: External Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: External Payments
-- Item: spDeleteExternalPayment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ExternalPayment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteExternalPayment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteExternalPayment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteExternalPayment]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ExternalPayment]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExternalPayment] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: External Payments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExternalPayment] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for PaymentProviderSyncState */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Sync States
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PaymentProviderID in table PaymentProviderSyncState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentProviderSyncState_PaymentProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentProviderSyncState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentProviderSyncState_PaymentProviderID ON [${flyway:defaultSchema}].[PaymentProviderSyncState] ([PaymentProviderID]);

/* SQL text to update entity field related entity name field map for entity field ID B993912B-46EA-435E-8E9F-9B527F583596 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B993912B-46EA-435E-8E9F-9B527F583596', @RelatedEntityNameFieldMap='PaymentProvider';

/* Base View SQL for MJ_BizApps_Orders: Payment Provider Sync States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Sync States
-- Item: vwPaymentProviderSyncStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Provider Sync States
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PaymentProviderSyncState
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPaymentProviderSyncStates]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPaymentProviderSyncStates];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPaymentProviderSyncStates]
AS
SELECT
    p.*,
    mjBizAppsOrdersPaymentProvider_PaymentProviderID.[Name] AS [PaymentProvider]
FROM
    [${flyway:defaultSchema}].[PaymentProviderSyncState] AS p
INNER JOIN
    [${flyway:defaultSchema}].[PaymentProvider] AS mjBizAppsOrdersPaymentProvider_PaymentProviderID
  ON
    [p].[PaymentProviderID] = mjBizAppsOrdersPaymentProvider_PaymentProviderID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderSyncStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Provider Sync States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Sync States
-- Item: Permissions for vwPaymentProviderSyncStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderSyncStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Payment Provider Sync States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Sync States
-- Item: spCreatePaymentProviderSyncState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentProviderSyncState
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePaymentProviderSyncState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentProviderSyncState];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentProviderSyncState]
    @ID uniqueidentifier = NULL,
    @PaymentProviderID uniqueidentifier,
    @ObjectName nvarchar(100),
    @Watermark_Clear bit = 0,
    @Watermark nvarchar(100) = NULL,
    @LastPolledAt_Clear bit = 0,
    @LastPolledAt datetimeoffset = NULL,
    @LastSucceededAt_Clear bit = 0,
    @LastSucceededAt datetimeoffset = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PaymentProviderSyncState]
            (
                [ID],
                [PaymentProviderID],
                [ObjectName],
                [Watermark],
                [LastPolledAt],
                [LastSucceededAt],
                [LastError]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentProviderID,
                @ObjectName,
                CASE WHEN @Watermark_Clear = 1 THEN NULL ELSE ISNULL(@Watermark, NULL) END,
                CASE WHEN @LastPolledAt_Clear = 1 THEN NULL ELSE ISNULL(@LastPolledAt, NULL) END,
                CASE WHEN @LastSucceededAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSucceededAt, NULL) END,
                CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PaymentProviderSyncState]
            (
                [PaymentProviderID],
                [ObjectName],
                [Watermark],
                [LastPolledAt],
                [LastSucceededAt],
                [LastError]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentProviderID,
                @ObjectName,
                CASE WHEN @Watermark_Clear = 1 THEN NULL ELSE ISNULL(@Watermark, NULL) END,
                CASE WHEN @LastPolledAt_Clear = 1 THEN NULL ELSE ISNULL(@LastPolledAt, NULL) END,
                CASE WHEN @LastSucceededAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSucceededAt, NULL) END,
                CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPaymentProviderSyncStates] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderSyncState] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Payment Provider Sync States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderSyncState] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Payment Provider Sync States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Sync States
-- Item: spUpdatePaymentProviderSyncState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentProviderSyncState
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentProviderSyncState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderSyncState];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderSyncState]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @ObjectName nvarchar(100) = NULL,
    @Watermark_Clear bit = 0,
    @Watermark nvarchar(100) = NULL,
    @LastPolledAt_Clear bit = 0,
    @LastPolledAt datetimeoffset = NULL,
    @LastSucceededAt_Clear bit = 0,
    @LastSucceededAt datetimeoffset = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProviderSyncState]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [ObjectName] = ISNULL(@ObjectName, [ObjectName]),
        [Watermark] = CASE WHEN @Watermark_Clear = 1 THEN NULL ELSE ISNULL(@Watermark, [Watermark]) END,
        [LastPolledAt] = CASE WHEN @LastPolledAt_Clear = 1 THEN NULL ELSE ISNULL(@LastPolledAt, [LastPolledAt]) END,
        [LastSucceededAt] = CASE WHEN @LastSucceededAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSucceededAt, [LastSucceededAt]) END,
        [LastError] = CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, [LastError]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentProviderSyncStates] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentProviderSyncStates]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderSyncState] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentProviderSyncState table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentProviderSyncState]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentProviderSyncState];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentProviderSyncState
ON [${flyway:defaultSchema}].[PaymentProviderSyncState]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProviderSyncState]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PaymentProviderSyncState] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Provider Sync States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderSyncState] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Payment Provider Sync States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Sync States
-- Item: spDeletePaymentProviderSyncState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentProviderSyncState
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePaymentProviderSyncState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentProviderSyncState];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentProviderSyncState]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PaymentProviderSyncState]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderSyncState] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Payment Provider Sync States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderSyncState] TO [cdp_Developer], [cdp_Integration];

UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D'
                AND [Sequence] >= 100000
         );

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b6b0bb4d-1c04-42d8-b4ea-44cc9ddeeaf5' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'PaymentProvider')) BEGIN
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
            'b6b0bb4d-1c04-42d8-b4ea-44cc9ddeeaf5',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            18,
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
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b4ccee7a-e75d-476e-a702-ddb040fec7e3' OR (EntityID = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D' AND Name = 'PaymentHeader')) BEGIN
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
            'b4ccee7a-e75d-476e-a702-ddb040fec7e3',
            'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D', -- Entity: MJ_BizApps_Orders: External Payments
            19,
            'PaymentHeader',
            'Payment Header',
            NULL,
            'nvarchar',
            80,
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
       WHERE [EntityID] = 'CC876FF9-D182-498D-8D34-E109ADF56A0E'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = 'CC876FF9-D182-498D-8D34-E109ADF56A0E'
                AND [Sequence] >= 100000
         );

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7eca88cf-09dc-4b95-a216-00d877fe4ed7' OR (EntityID = 'CC876FF9-D182-498D-8D34-E109ADF56A0E' AND Name = 'PaymentProvider')) BEGIN
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
            '7eca88cf-09dc-4b95-a216-00d877fe4ed7',
            'CC876FF9-D182-498D-8D34-E109ADF56A0E', -- Entity: MJ_BizApps_Orders: Payment Provider Sync States
            10,
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
