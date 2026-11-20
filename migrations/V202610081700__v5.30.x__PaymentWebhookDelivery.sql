-- =============================================================================
-- V202610081700 — PaymentWebhookDelivery: one row per verified gateway delivery
-- (bizapps-orders#474)
-- =============================================================================
-- A verified webhook that Orders decided not to apply (an event kind it does not
-- act on, an intent it did not open, an event with no id) left only a log line.
-- Nothing in the database showed that the event arrived, so monitoring could not
-- see a payment taken outside the checkout, and a duplicate could be detected
-- only against the last event stamped on the intent.
--
-- What this file does:
--   PaymentWebhookDelivery: one row per (provider, gateway event id), written
--   after the signature check and before the response, with what the handler
--   decided and why. A redelivery of the same event updates that row
--   (LastReceivedAt, DeliveryCount, the latest Outcome) rather than adding one.
--
-- ONLY VERIFIED DELIVERIES ARE RECORDED. The route is unauthenticated, so a row
-- for a request whose signature failed would let any caller write to this table.
--
-- ProviderEventID IS NULLABLE: a verified body that could not be read, or that
-- carried no event id, is still recorded (Outcome Rejected). The unique key is
-- filtered to rows that have an id, the same pattern as
-- UQ_PaymentIntent_ProviderEventID.
-- =============================================================================

CREATE TABLE [${flyway:defaultSchema}].[PaymentWebhookDelivery] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PaymentProviderID] UNIQUEIDENTIFIER NOT NULL,
    [ProviderEventID] NVARCHAR(100) NULL,
    [EventKind] NVARCHAR(100) NULL,
    [PaymentIntentID] UNIQUEIDENTIFIER NULL,
    [ProviderIntentID] NVARCHAR(100) NULL,
    [ProviderChargeID] NVARCHAR(100) NULL,
    [Outcome] NVARCHAR(20) NOT NULL,
    [ReasonCode] NVARCHAR(40) NULL,
    [Reason] NVARCHAR(1000) NULL,
    [OccurredAt] DATETIMEOFFSET NULL,
    [FirstReceivedAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    [LastReceivedAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    [DeliveryCount] INT NOT NULL DEFAULT 1,
    CONSTRAINT PK_PaymentWebhookDelivery PRIMARY KEY ([ID]),
    CONSTRAINT FK_PaymentWebhookDelivery_PaymentProvider FOREIGN KEY ([PaymentProviderID])
        REFERENCES [${flyway:defaultSchema}].[PaymentProvider]([ID]),
    CONSTRAINT FK_PaymentWebhookDelivery_PaymentIntent FOREIGN KEY ([PaymentIntentID])
        REFERENCES [${flyway:defaultSchema}].[PaymentIntent]([ID]),
    CONSTRAINT CK_PaymentWebhookDelivery_Outcome CHECK ([Outcome] IN ('Applied','AlreadyApplied','Ignored','Rejected','Failed'))
);
GO

CREATE UNIQUE NONCLUSTERED INDEX UQ_PaymentWebhookDelivery_Provider_Event
    ON [${flyway:defaultSchema}].[PaymentWebhookDelivery] ([PaymentProviderID], [ProviderEventID])
    WHERE [ProviderEventID] IS NOT NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'One row per verified webhook delivery from a payment gateway, with what Orders decided to do with it and why. Written after the signature check; a delivery whose signature failed is not recorded. A redelivery of the same event updates its row.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The configured payment provider whose webhook endpoint received the delivery.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery',
    @level2type = N'COLUMN', @level2name = N'PaymentProviderID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The gateway''s own event id (for Stripe, evt_...). Unique per provider. Null only when the verified body could not be read or carried no id.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery',
    @level2type = N'COLUMN', @level2name = N'ProviderEventID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The gateway''s event type, unmapped (for example payment_intent.succeeded or charge.refunded).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery',
    @level2type = N'COLUMN', @level2name = N'EventKind';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The payment intent Orders opened that this event is about. Null when the event names an intent Orders did not open, or no intent at all.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery',
    @level2type = N'COLUMN', @level2name = N'PaymentIntentID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The gateway''s intent id as the event reported it (for Stripe, pi_...), kept even when Orders has no intent with that id.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery',
    @level2type = N'COLUMN', @level2name = N'ProviderIntentID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The gateway''s charge id as the event reported it (for Stripe, ch_... or py_...), when it named one.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery',
    @level2type = N'COLUMN', @level2name = N'ProviderChargeID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'What Orders did with the latest delivery of this event. Applied: recorded against the intent. AlreadyApplied: a repeat or out-of-order event, answered without changing anything. Ignored: an event kind Orders does not act on, or an intent it did not open. Rejected: verified but unreadable or without an id. Failed: Orders could not record a valid event and asked the gateway to retry.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery',
    @level2type = N'COLUMN', @level2name = N'Outcome';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short machine-readable reason for the outcome, for filtering: kind_not_handled, unknown_intent, no_event_id, unreadable, duplicate, out_of_order, apply_failed. Null when the event was applied.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery',
    @level2type = N'COLUMN', @level2name = N'ReasonCode';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The reason for the outcome, in words.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery',
    @level2type = N'COLUMN', @level2name = N'Reason';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the gateway says the event happened (Stripe''s created time). Null when the event did not say.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery',
    @level2type = N'COLUMN', @level2name = N'OccurredAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When Orders first received this event.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery',
    @level2type = N'COLUMN', @level2name = N'FirstReceivedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When Orders last received this event. Differs from FirstReceivedAt when the gateway redelivered it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery',
    @level2type = N'COLUMN', @level2name = N'LastReceivedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How many times the gateway delivered this event.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentWebhookDelivery',
    @level2type = N'COLUMN', @level2name = N'DeliveryCount';
GO




















































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen 6.1.5 (this repo's CLI) against a database built from
--   migrations alone, with the hand-authored DDL above applied. Contains the new
--   MJ_BizApps_Orders: Payment Webhook Deliveries entity: metadata, fields, the
--   Outcome value list, relationships from Payment Intents and Payment
--   Providers, permissions, view, CRUD procs and FK indexes.
--
--   Left out, because this change does not touch them: the run's rebuild of the
--   Order Headers view and procs, and value-list rows for External
--   Invoices.Status, External Payments.Disposition and Event Order
--   Lines.AttendanceStatus.
--
--   Run without an AI key, so no AI-chosen DefaultInView flags or field
--   categories were written for the new entity.
--
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Orders: Payment Webhook Deliveries */

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
         'd344c546-4b63-422c-8636-64b29893f2fe',
         'MJ_BizApps_Orders: Payment Webhook Deliveries',
         'Payment Webhook Deliveries',
         'One row per verified webhook delivery from a payment gateway, with what Orders decided to do with it and why. Written after the signature check; a delivery whose signature failed is not recorded. A redelivery of the same event updates its row.',
         NULL,
         'PaymentWebhookDelivery',
         'vwPaymentWebhookDeliveries',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Payment Webhook Deliveries to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'd344c546-4b63-422c-8636-64b29893f2fe', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Payment Webhook Deliveries for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d344c546-4b63-422c-8636-64b29893f2fe' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d344c546-4b63-422c-8636-64b29893f2fe' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Payment Webhook Deliveries for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d344c546-4b63-422c-8636-64b29893f2fe' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d344c546-4b63-422c-8636-64b29893f2fe' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Payment Webhook Deliveries for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d344c546-4b63-422c-8636-64b29893f2fe' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d344c546-4b63-422c-8636-64b29893f2fe' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PaymentWebhookDelivery */
ALTER TABLE [${flyway:defaultSchema}].[PaymentWebhookDelivery] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PaymentWebhookDelivery */
UPDATE [${flyway:defaultSchema}].[PaymentWebhookDelivery] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PaymentWebhookDelivery */
ALTER TABLE [${flyway:defaultSchema}].[PaymentWebhookDelivery] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PaymentWebhookDelivery */
ALTER TABLE [${flyway:defaultSchema}].[PaymentWebhookDelivery] ADD CONSTRAINT [DF___mj_BizAppsOrders_PaymentWebhookDelivery___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PaymentWebhookDelivery */
ALTER TABLE [${flyway:defaultSchema}].[PaymentWebhookDelivery] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PaymentWebhookDelivery */
UPDATE [${flyway:defaultSchema}].[PaymentWebhookDelivery] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PaymentWebhookDelivery */
ALTER TABLE [${flyway:defaultSchema}].[PaymentWebhookDelivery] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PaymentWebhookDelivery */
ALTER TABLE [${flyway:defaultSchema}].[PaymentWebhookDelivery] ADD CONSTRAINT [DF___mj_BizAppsOrders_PaymentWebhookDelivery___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 16 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'af5a63bc-87b6-4aee-9471-f727f548853d' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'ID')) BEGIN
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
            'af5a63bc-87b6-4aee-9471-f727f548853d',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6ff0cc5d-1b79-4743-becb-93e5f2126863' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'PaymentProviderID')) BEGIN
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
            '6ff0cc5d-1b79-4743-becb-93e5f2126863',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'PaymentProviderID',
            'Payment Provider ID',
            'The configured payment provider whose webhook endpoint received the delivery.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c664d31a-9723-4653-b271-9dd4403952e3' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'ProviderEventID')) BEGIN
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
            'c664d31a-9723-4653-b271-9dd4403952e3',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'ProviderEventID',
            'Provider Event ID',
            'The gateway''s own event id (for Stripe, evt_...). Unique per provider. Null only when the verified body could not be read or carried no id.',
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
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0f7bf1cf-58aa-485c-98fa-707ee4b1afb9' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'EventKind')) BEGIN
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
            '0f7bf1cf-58aa-485c-98fa-707ee4b1afb9',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'EventKind',
            'Event Kind',
            'The gateway''s event type, unmapped (for example payment_intent.succeeded or charge.refunded).',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '97f4bafa-ec6d-4fe5-a330-80b098d3998c' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'PaymentIntentID')) BEGIN
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
            '97f4bafa-ec6d-4fe5-a330-80b098d3998c',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'PaymentIntentID',
            'Payment Intent ID',
            'The payment intent Orders opened that this event is about. Null when the event names an intent Orders did not open, or no intent at all.',
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
            '7D7C4D5F-E410-4803-9762-A060C536C098',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '26bfeade-1d14-4411-82e9-04c262636dee' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'ProviderIntentID')) BEGIN
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
            '26bfeade-1d14-4411-82e9-04c262636dee',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'ProviderIntentID',
            'Provider Intent ID',
            'The gateway''s intent id as the event reported it (for Stripe, pi_...), kept even when Orders has no intent with that id.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '015b302f-0ddc-48be-b3d6-b9485c0c20d5' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'ProviderChargeID')) BEGIN
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
            '015b302f-0ddc-48be-b3d6-b9485c0c20d5',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'ProviderChargeID',
            'Provider Charge ID',
            'The gateway''s charge id as the event reported it (for Stripe, ch_... or py_...), when it named one.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '64af75f2-8846-4f4b-91e6-06a1cdfc53da' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'Outcome')) BEGIN
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
            '64af75f2-8846-4f4b-91e6-06a1cdfc53da',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'Outcome',
            'Outcome',
            'What Orders did with the latest delivery of this event. Applied: recorded against the intent. AlreadyApplied: a repeat or out-of-order event, answered without changing anything. Ignored: an event kind Orders does not act on, or an intent it did not open. Rejected: verified but unreadable or without an id. Failed: Orders could not record a valid event and asked the gateway to retry.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cfa0be17-7c09-497b-bba0-c7c86293d7fc' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'ReasonCode')) BEGIN
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
            'cfa0be17-7c09-497b-bba0-c7c86293d7fc',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'ReasonCode',
            'Reason Code',
            'Short machine-readable reason for the outcome, for filtering: kind_not_handled, unknown_intent, no_event_id, unreadable, duplicate, out_of_order, apply_failed. Null when the event was applied.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e6076320-5994-45cf-b197-1658c2e41281' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'Reason')) BEGIN
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
            'e6076320-5994-45cf-b197-1658c2e41281',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'Reason',
            'Reason',
            'The reason for the outcome, in words.',
            'nvarchar',
            2000,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bf67bc17-70a7-423b-ac3d-f146f6156af5' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'OccurredAt')) BEGIN
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
            'bf67bc17-70a7-423b-ac3d-f146f6156af5',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'OccurredAt',
            'Occurred At',
            'When the gateway says the event happened (Stripe''s created time). Null when the event did not say.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '51e65a25-0a7c-412c-9f47-502d6359a289' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'FirstReceivedAt')) BEGIN
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
            '51e65a25-0a7c-412c-9f47-502d6359a289',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'FirstReceivedAt',
            'First Received At',
            'When Orders first received this event.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c8418ec5-3f3c-44dd-9e53-704fc023c956' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'LastReceivedAt')) BEGIN
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
            'c8418ec5-3f3c-44dd-9e53-704fc023c956',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'LastReceivedAt',
            'Last Received At',
            'When Orders last received this event. Differs from FirstReceivedAt when the gateway redelivered it.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9e214ab9-331f-4bd1-bb7d-62e578405763' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'DeliveryCount')) BEGIN
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
            '9e214ab9-331f-4bd1-bb7d-62e578405763',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'DeliveryCount',
            'Delivery Count',
            'How many times the gateway delivered this event.',
            'int',
            4,
            10,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd9971b6a-fd45-456f-afe8-815f2fb1001c' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = '__mj_CreatedAt')) BEGIN
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
            'd9971b6a-fd45-456f-afe8-815f2fb1001c',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ab5b1023-eb4c-4a9e-a1a3-2466df680f18' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'ab5b1023-eb4c-4a9e-a1a3-2466df680f18',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
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

/* SQL text to insert entity field value with ID 8656c644-ab00-45e7-8c50-39907fd36e74 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8656c644-ab00-45e7-8c50-39907fd36e74', '64AF75F2-8846-4F4B-91E6-06A1CDFC53DA', 1, 'AlreadyApplied', 'AlreadyApplied', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9baa6a9e-5d9d-4c3a-a522-495910ecc7b6 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9baa6a9e-5d9d-4c3a-a522-495910ecc7b6', '64AF75F2-8846-4F4B-91E6-06A1CDFC53DA', 2, 'Applied', 'Applied', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2c6f41b0-048a-4f2c-b049-afd6f09d649b */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2c6f41b0-048a-4f2c-b049-afd6f09d649b', '64AF75F2-8846-4F4B-91E6-06A1CDFC53DA', 3, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3a33c4dd-c6d5-4a51-9ab6-bc16454efada */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3a33c4dd-c6d5-4a51-9ab6-bc16454efada', '64AF75F2-8846-4F4B-91E6-06A1CDFC53DA', 4, 'Ignored', 'Ignored', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cd1b41e7-bb2c-4181-ba06-4e6a56c7bd55 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cd1b41e7-bb2c-4181-ba06-4e6a56c7bd55', '64AF75F2-8846-4F4B-91E6-06A1CDFC53DA', 5, 'Rejected', 'Rejected', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 64AF75F2-8846-4F4B-91E6-06A1CDFC53DA */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='64AF75F2-8846-4F4B-91E6-06A1CDFC53DA';


/* Create Entity Relationship: MJ_BizApps_Orders: Payment Intents -> MJ_BizApps_Orders: Payment Webhook Deliveries (One To Many via PaymentIntentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '0b1cc7c6-ce07-438e-bab4-b1acc4d3717e'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0b1cc7c6-ce07-438e-bab4-b1acc4d3717e', '7D7C4D5F-E410-4803-9762-A060C536C098', 'D344C546-4B63-422C-8636-64B29893F2FE', 'PaymentIntentID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Payment Providers -> MJ_BizApps_Orders: Payment Webhook Deliveries (One To Many via PaymentProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '9e6f9517-7ab1-438e-8165-2110c69fdf6d'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9e6f9517-7ab1-438e-8165-2110c69fdf6d', 'FDC49E63-B229-40BB-9ABC-F384D7750123', 'D344C546-4B63-422C-8636-64B29893F2FE', 'PaymentProviderID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;
/* Index for Foreign Keys for PaymentWebhookDelivery */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PaymentProviderID in table PaymentWebhookDelivery
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentWebhookDelivery_PaymentProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentWebhookDelivery]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentWebhookDelivery_PaymentProviderID ON [${flyway:defaultSchema}].[PaymentWebhookDelivery] ([PaymentProviderID]);

-- Index for foreign key PaymentIntentID in table PaymentWebhookDelivery
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentWebhookDelivery_PaymentIntentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentWebhookDelivery]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentWebhookDelivery_PaymentIntentID ON [${flyway:defaultSchema}].[PaymentWebhookDelivery] ([PaymentIntentID]);

/* SQL text to update entity field related entity name field map for entity field ID 6FF0CC5D-1B79-4743-BECB-93E5F2126863 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6FF0CC5D-1B79-4743-BECB-93E5F2126863', @RelatedEntityNameFieldMap='PaymentProvider';

/* SQL text to update entity field related entity name field map for entity field ID 97F4BAFA-EC6D-4FE5-A330-80B098D3998C */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='97F4BAFA-EC6D-4FE5-A330-80B098D3998C', @RelatedEntityNameFieldMap='PaymentIntent';

/* Base View SQL for MJ_BizApps_Orders: Payment Webhook Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
-- Item: vwPaymentWebhookDeliveries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Webhook Deliveries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PaymentWebhookDelivery
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPaymentWebhookDeliveries]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPaymentWebhookDeliveries];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPaymentWebhookDeliveries]
AS
SELECT
    p.*,
    mjBizAppsOrdersPaymentProvider_PaymentProviderID.[Name] AS [PaymentProvider],
    mjBizAppsOrdersPaymentIntent_PaymentIntentID.[ProviderIntentID] AS [PaymentIntent]
FROM
    [${flyway:defaultSchema}].[PaymentWebhookDelivery] AS p
INNER JOIN
    [${flyway:defaultSchema}].[PaymentProvider] AS mjBizAppsOrdersPaymentProvider_PaymentProviderID
  ON
    [p].[PaymentProviderID] = mjBizAppsOrdersPaymentProvider_PaymentProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentIntent] AS mjBizAppsOrdersPaymentIntent_PaymentIntentID
  ON
    [p].[PaymentIntentID] = mjBizAppsOrdersPaymentIntent_PaymentIntentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentWebhookDeliveries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Webhook Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
-- Item: Permissions for vwPaymentWebhookDeliveries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentWebhookDeliveries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Payment Webhook Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
-- Item: spCreatePaymentWebhookDelivery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentWebhookDelivery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePaymentWebhookDelivery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentWebhookDelivery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentWebhookDelivery]
    @ID uniqueidentifier = NULL,
    @PaymentProviderID uniqueidentifier,
    @ProviderEventID_Clear bit = 0,
    @ProviderEventID nvarchar(100) = NULL,
    @EventKind_Clear bit = 0,
    @EventKind nvarchar(100) = NULL,
    @PaymentIntentID_Clear bit = 0,
    @PaymentIntentID uniqueidentifier = NULL,
    @ProviderIntentID_Clear bit = 0,
    @ProviderIntentID nvarchar(100) = NULL,
    @ProviderChargeID_Clear bit = 0,
    @ProviderChargeID nvarchar(100) = NULL,
    @Outcome nvarchar(20),
    @ReasonCode_Clear bit = 0,
    @ReasonCode nvarchar(40) = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(1000) = NULL,
    @OccurredAt_Clear bit = 0,
    @OccurredAt datetimeoffset = NULL,
    @FirstReceivedAt datetimeoffset = NULL,
    @LastReceivedAt datetimeoffset = NULL,
    @DeliveryCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PaymentWebhookDelivery]
            (
                [ID],
                [PaymentProviderID],
                [ProviderEventID],
                [EventKind],
                [PaymentIntentID],
                [ProviderIntentID],
                [ProviderChargeID],
                [Outcome],
                [ReasonCode],
                [Reason],
                [OccurredAt],
                [FirstReceivedAt],
                [LastReceivedAt],
                [DeliveryCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentProviderID,
                CASE WHEN @ProviderEventID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderEventID, NULL) END,
                CASE WHEN @EventKind_Clear = 1 THEN NULL ELSE ISNULL(@EventKind, NULL) END,
                CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, NULL) END,
                CASE WHEN @ProviderIntentID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderIntentID, NULL) END,
                CASE WHEN @ProviderChargeID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderChargeID, NULL) END,
                @Outcome,
                CASE WHEN @ReasonCode_Clear = 1 THEN NULL ELSE ISNULL(@ReasonCode, NULL) END,
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @OccurredAt_Clear = 1 THEN NULL ELSE ISNULL(@OccurredAt, NULL) END,
                ISNULL(@FirstReceivedAt, sysdatetimeoffset()),
                ISNULL(@LastReceivedAt, sysdatetimeoffset()),
                ISNULL(@DeliveryCount, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PaymentWebhookDelivery]
            (
                [PaymentProviderID],
                [ProviderEventID],
                [EventKind],
                [PaymentIntentID],
                [ProviderIntentID],
                [ProviderChargeID],
                [Outcome],
                [ReasonCode],
                [Reason],
                [OccurredAt],
                [FirstReceivedAt],
                [LastReceivedAt],
                [DeliveryCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentProviderID,
                CASE WHEN @ProviderEventID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderEventID, NULL) END,
                CASE WHEN @EventKind_Clear = 1 THEN NULL ELSE ISNULL(@EventKind, NULL) END,
                CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, NULL) END,
                CASE WHEN @ProviderIntentID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderIntentID, NULL) END,
                CASE WHEN @ProviderChargeID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderChargeID, NULL) END,
                @Outcome,
                CASE WHEN @ReasonCode_Clear = 1 THEN NULL ELSE ISNULL(@ReasonCode, NULL) END,
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @OccurredAt_Clear = 1 THEN NULL ELSE ISNULL(@OccurredAt, NULL) END,
                ISNULL(@FirstReceivedAt, sysdatetimeoffset()),
                ISNULL(@LastReceivedAt, sysdatetimeoffset()),
                ISNULL(@DeliveryCount, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPaymentWebhookDeliveries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentWebhookDelivery] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Payment Webhook Deliveries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentWebhookDelivery] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Payment Webhook Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
-- Item: spUpdatePaymentWebhookDelivery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentWebhookDelivery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentWebhookDelivery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentWebhookDelivery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentWebhookDelivery]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @ProviderEventID_Clear bit = 0,
    @ProviderEventID nvarchar(100) = NULL,
    @EventKind_Clear bit = 0,
    @EventKind nvarchar(100) = NULL,
    @PaymentIntentID_Clear bit = 0,
    @PaymentIntentID uniqueidentifier = NULL,
    @ProviderIntentID_Clear bit = 0,
    @ProviderIntentID nvarchar(100) = NULL,
    @ProviderChargeID_Clear bit = 0,
    @ProviderChargeID nvarchar(100) = NULL,
    @Outcome nvarchar(20) = NULL,
    @ReasonCode_Clear bit = 0,
    @ReasonCode nvarchar(40) = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(1000) = NULL,
    @OccurredAt_Clear bit = 0,
    @OccurredAt datetimeoffset = NULL,
    @FirstReceivedAt datetimeoffset = NULL,
    @LastReceivedAt datetimeoffset = NULL,
    @DeliveryCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentWebhookDelivery]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [ProviderEventID] = CASE WHEN @ProviderEventID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderEventID, [ProviderEventID]) END,
        [EventKind] = CASE WHEN @EventKind_Clear = 1 THEN NULL ELSE ISNULL(@EventKind, [EventKind]) END,
        [PaymentIntentID] = CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, [PaymentIntentID]) END,
        [ProviderIntentID] = CASE WHEN @ProviderIntentID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderIntentID, [ProviderIntentID]) END,
        [ProviderChargeID] = CASE WHEN @ProviderChargeID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderChargeID, [ProviderChargeID]) END,
        [Outcome] = ISNULL(@Outcome, [Outcome]),
        [ReasonCode] = CASE WHEN @ReasonCode_Clear = 1 THEN NULL ELSE ISNULL(@ReasonCode, [ReasonCode]) END,
        [Reason] = CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, [Reason]) END,
        [OccurredAt] = CASE WHEN @OccurredAt_Clear = 1 THEN NULL ELSE ISNULL(@OccurredAt, [OccurredAt]) END,
        [FirstReceivedAt] = ISNULL(@FirstReceivedAt, [FirstReceivedAt]),
        [LastReceivedAt] = ISNULL(@LastReceivedAt, [LastReceivedAt]),
        [DeliveryCount] = ISNULL(@DeliveryCount, [DeliveryCount])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentWebhookDeliveries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentWebhookDeliveries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentWebhookDelivery] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentWebhookDelivery table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentWebhookDelivery]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentWebhookDelivery];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentWebhookDelivery
ON [${flyway:defaultSchema}].[PaymentWebhookDelivery]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentWebhookDelivery]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PaymentWebhookDelivery] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Webhook Deliveries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentWebhookDelivery] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Payment Webhook Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
-- Item: spDeletePaymentWebhookDelivery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentWebhookDelivery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePaymentWebhookDelivery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentWebhookDelivery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentWebhookDelivery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PaymentWebhookDelivery]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentWebhookDelivery] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Payment Webhook Deliveries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentWebhookDelivery] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f4adfc7f-6546-4be1-9218-06d3be50dcf8' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'PaymentProvider')) BEGIN
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
            'f4adfc7f-6546-4be1-9218-06d3be50dcf8',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b540cbd8-2a10-45a2-98a5-3834b75dba44' OR (EntityID = 'D344C546-4B63-422C-8636-64B29893F2FE' AND Name = 'PaymentIntent')) BEGIN
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
            'b540cbd8-2a10-45a2-98a5-3834b75dba44',
            'D344C546-4B63-422C-8636-64B29893F2FE', -- Entity: MJ_BizApps_Orders: Payment Webhook Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D344C546-4B63-422C-8636-64B29893F2FE'),
            'PaymentIntent',
            'Payment Intent',
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
