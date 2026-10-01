-- =============================================================================
-- V202609291308 — Outbound events: an outbox for order confirmations and grant changes (bizapps-orders#293)
-- =============================================================================
-- Orders told no one when an order confirmed or an entitlement grant changed;
-- consumers had to poll. A CRM needs a deal per purchase and renewal, and a
-- downstream system that keeps its own copy of access needs to provision and
-- revoke.
--
-- OutboundEvent is a transactional outbox: the event is written in the same
-- transaction as the change that caused it, so it exists exactly when that
-- change committed. Its ID is the stable event id consumers dedupe on.
--
-- OutboundDelivery is one row per event per consumer, created with the event for
-- every consumer registered then. A dispatcher sends Pending rows after commit,
-- never inside the booking transaction, retrying with backoff until Delivered
-- or, past its deadline, DeadLettered. LeaseUntil lets one pass claim a row so
-- two passes do not send it at once. GatesAccess marks the consumers whose
-- delivery decides whether a buyer's access is ready.
--
-- CodeGen output for these tables is folded below the banner at the end of this file.
-- =============================================================================
CREATE TABLE [${flyway:defaultSchema}].[OutboundEvent] (
    [ID]                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_OutboundEvent_ID] DEFAULT (newsequentialid()),
    [EventType]          NVARCHAR(40)     NOT NULL,
    [OrderHeaderID]      UNIQUEIDENTIFIER NULL,
    [EntitlementGrantID] UNIQUEIDENTIFIER NULL,
    [PayloadJSON]        NVARCHAR(MAX)    NOT NULL,
    [OccurredAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_OutboundEvent_OccurredAt] DEFAULT (sysdatetimeoffset()),
    CONSTRAINT [PK_OutboundEvent] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_OutboundEvent_OrderHeader] FOREIGN KEY ([OrderHeaderID])
        REFERENCES [${flyway:defaultSchema}].[OrderHeader]([ID]),
    CONSTRAINT [FK_OutboundEvent_EntitlementGrant] FOREIGN KEY ([EntitlementGrantID])
        REFERENCES [${flyway:defaultSchema}].[EntitlementGrant]([ID]),
    CONSTRAINT [CK_OutboundEvent_EventType] CHECK ([EventType] IN ('OrderConfirmed', 'GrantStatusChanged')),
    -- An order event names its order; a grant event names its grant (and its order, for lookups by order).
    CONSTRAINT [CK_OutboundEvent_Subject] CHECK (
        ([EventType] = 'OrderConfirmed' AND [OrderHeaderID] IS NOT NULL)
        OR ([EventType] = 'GrantStatusChanged' AND [EntitlementGrantID] IS NOT NULL))
);
GO

CREATE TABLE [${flyway:defaultSchema}].[OutboundDelivery] (
    [ID]              UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_OutboundDelivery_ID] DEFAULT (newsequentialid()),
    [OutboundEventID] UNIQUEIDENTIFIER NOT NULL,
    [ConsumerKey]     NVARCHAR(100)    NOT NULL,
    [GatesAccess]     BIT              NOT NULL CONSTRAINT [DF_OutboundDelivery_GatesAccess] DEFAULT (0),
    [Status]          NVARCHAR(20)     NOT NULL CONSTRAINT [DF_OutboundDelivery_Status] DEFAULT ('Pending'),
    [Attempts]        INT              NOT NULL CONSTRAINT [DF_OutboundDelivery_Attempts] DEFAULT (0),
    [NextAttemptAt]   DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_OutboundDelivery_NextAttemptAt] DEFAULT (sysdatetimeoffset()),
    [DeadlineAt]      DATETIMEOFFSET   NOT NULL,
    [LeaseUntil]      DATETIMEOFFSET   NULL,
    [LastAttemptAt]   DATETIMEOFFSET   NULL,
    [LastError]       NVARCHAR(2000)   NULL,
    [DeliveredAt]     DATETIMEOFFSET   NULL,
    CONSTRAINT [PK_OutboundDelivery] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_OutboundDelivery_OutboundEvent] FOREIGN KEY ([OutboundEventID])
        REFERENCES [${flyway:defaultSchema}].[OutboundEvent]([ID]),
    CONSTRAINT [UQ_OutboundDelivery_Event_Consumer] UNIQUE ([OutboundEventID], [ConsumerKey]),
    CONSTRAINT [CK_OutboundDelivery_Status] CHECK ([Status] IN ('Pending', 'Delivered', 'DeadLettered')),
    CONSTRAINT [CK_OutboundDelivery_Attempts] CHECK ([Attempts] >= 0),
    CONSTRAINT [CK_OutboundDelivery_Delivered] CHECK (
        ([Status] = 'Delivered' AND [DeliveredAt] IS NOT NULL)
        OR ([Status] <> 'Delivered' AND [DeliveredAt] IS NULL))
);
GO

-- The dispatcher's query: due Pending rows, oldest first.
CREATE INDEX [IX_OutboundDelivery_Due] ON [${flyway:defaultSchema}].[OutboundDelivery] ([Status], [NextAttemptAt]);
GO
CREATE INDEX [IX_OutboundEvent_OrderHeaderID] ON [${flyway:defaultSchema}].[OutboundEvent] ([OrderHeaderID]);
GO

-- Descriptions: MS_Description is what CodeGen carries into EntityField.Description.
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'An event Orders tells registered consumers about: an order confirmed, or an entitlement grant''s status changed. Written in the same transaction as the change, so it exists exactly when the change committed. Its ID is the stable event id consumers dedupe on.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundEvent';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'OrderConfirmed (first confirmation of an order, renewals included) or GrantStatusChanged (a grant created, or its Status changed).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundEvent', @level2type = N'COLUMN', @level2name = N'EventType';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The order the event is about. Set on both event types, so deliveries can be read by order.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundEvent', @level2type = N'COLUMN', @level2name = N'OrderHeaderID';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The grant a GrantStatusChanged event is about. NULL for OrderConfirmed.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundEvent', @level2type = N'COLUMN', @level2name = N'EntitlementGrantID';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The event as consumers receive it, fixed when the event was recorded.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundEvent', @level2type = N'COLUMN', @level2name = N'PayloadJSON';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the change that caused the event was saved.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundEvent', @level2type = N'COLUMN', @level2name = N'OccurredAt';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One outbound event to one registered consumer: whether it has been delivered, and when it will be tried next.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundDelivery';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The event being delivered.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundDelivery', @level2type = N'COLUMN', @level2name = N'OutboundEventID';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The registration key of the consumer (an OrdersOutboundConsumer subclass).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundDelivery', @level2type = N'COLUMN', @level2name = N'ConsumerKey';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'True when this consumer''s delivery decides whether the buyer''s access is ready, as declared by the consumer when the event was recorded.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundDelivery', @level2type = N'COLUMN', @level2name = N'GatesAccess';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Pending until the consumer accepts it (Delivered), or until DeadlineAt passes without success (DeadLettered). Setting a DeadLettered row back to Pending sends it again.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundDelivery', @level2type = N'COLUMN', @level2name = N'Status';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'How many times delivery has been tried.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundDelivery', @level2type = N'COLUMN', @level2name = N'Attempts';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The earliest time the dispatcher tries this row again.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundDelivery', @level2type = N'COLUMN', @level2name = N'NextAttemptAt';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'After this time a failed attempt dead-letters the row instead of scheduling another.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundDelivery', @level2type = N'COLUMN', @level2name = N'DeadlineAt';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Set while a dispatcher pass holds the row, so another pass does not send it at the same time. A lease that runs out frees the row.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundDelivery', @level2type = N'COLUMN', @level2name = N'LeaseUntil';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When delivery was last tried.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundDelivery', @level2type = N'COLUMN', @level2name = N'LastAttemptAt';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The consumer''s error from the last failed attempt.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundDelivery', @level2type = N'COLUMN', @level2name = N'LastError';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the consumer accepted the event.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OutboundDelivery', @level2type = N'COLUMN', @level2name = N'DeliveredAt';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the Outbound Events and Outbound Deliveries entities
-- (their metadata, views, CRUD procs and permissions) is folded here.
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Orders: Outbound Events */

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
         '154dce03-c019-43b0-b293-1e6d93e303a2',
         'MJ_BizApps_Orders: Outbound Events',
         'Outbound Events',
         'An event Orders tells registered consumers about: an order confirmed, or an entitlement grant''s status changed. Written in the same transaction as the change, so it exists exactly when the change committed. Its ID is the stable event id consumers dedupe on.',
         NULL,
         'OutboundEvent',
         'vwOutboundEvents',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Outbound Events to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '154dce03-c019-43b0-b293-1e6d93e303a2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Outbound Events for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('154dce03-c019-43b0-b293-1e6d93e303a2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Outbound Events for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('154dce03-c019-43b0-b293-1e6d93e303a2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Outbound Events for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('154dce03-c019-43b0-b293-1e6d93e303a2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Orders: Outbound Deliveries */

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
         'aaa87268-a880-44ba-affe-173a89fc1eea',
         'MJ_BizApps_Orders: Outbound Deliveries',
         'Outbound Deliveries',
         'One outbound event to one registered consumer: whether it has been delivered, and when it will be tried next.',
         NULL,
         'OutboundDelivery',
         'vwOutboundDeliveries',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Outbound Deliveries to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'aaa87268-a880-44ba-affe-173a89fc1eea', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Outbound Deliveries for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('aaa87268-a880-44ba-affe-173a89fc1eea', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Outbound Deliveries for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('aaa87268-a880-44ba-affe-173a89fc1eea', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Outbound Deliveries for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('aaa87268-a880-44ba-affe-173a89fc1eea', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OutboundDelivery */
ALTER TABLE [${flyway:defaultSchema}].[OutboundDelivery] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OutboundDelivery */
UPDATE [${flyway:defaultSchema}].[OutboundDelivery] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OutboundDelivery */
ALTER TABLE [${flyway:defaultSchema}].[OutboundDelivery] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OutboundDelivery */
ALTER TABLE [${flyway:defaultSchema}].[OutboundDelivery] ADD CONSTRAINT [DF___mj_BizAppsOrders_OutboundDelivery___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OutboundDelivery */
ALTER TABLE [${flyway:defaultSchema}].[OutboundDelivery] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OutboundDelivery */
UPDATE [${flyway:defaultSchema}].[OutboundDelivery] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OutboundDelivery */
ALTER TABLE [${flyway:defaultSchema}].[OutboundDelivery] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OutboundDelivery */
ALTER TABLE [${flyway:defaultSchema}].[OutboundDelivery] ADD CONSTRAINT [DF___mj_BizAppsOrders_OutboundDelivery___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OutboundEvent */
ALTER TABLE [${flyway:defaultSchema}].[OutboundEvent] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OutboundEvent */
UPDATE [${flyway:defaultSchema}].[OutboundEvent] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OutboundEvent */
ALTER TABLE [${flyway:defaultSchema}].[OutboundEvent] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OutboundEvent */
ALTER TABLE [${flyway:defaultSchema}].[OutboundEvent] ADD CONSTRAINT [DF___mj_BizAppsOrders_OutboundEvent___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OutboundEvent */
ALTER TABLE [${flyway:defaultSchema}].[OutboundEvent] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OutboundEvent */
UPDATE [${flyway:defaultSchema}].[OutboundEvent] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OutboundEvent */
ALTER TABLE [${flyway:defaultSchema}].[OutboundEvent] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OutboundEvent */
ALTER TABLE [${flyway:defaultSchema}].[OutboundEvent] ADD CONSTRAINT [DF___mj_BizAppsOrders_OutboundEvent___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 24 new entity field(s) */
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0c4f145b-1be7-43a9-a249-ff21a33a88cc' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = 'ID')) BEGIN
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
            '0c4f145b-1be7-43a9-a249-ff21a33a88cc',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '643b7dac-385e-4317-95e8-9809178ec56f' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = 'OutboundEventID')) BEGIN
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
            '643b7dac-385e-4317-95e8-9809178ec56f',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
            'OutboundEventID',
            'Outbound Event ID',
            'The event being delivered.',
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
            '154DCE03-C019-43B0-B293-1E6D93E303A2',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ac24c30f-d824-4a61-9f49-d5d070fe2f3d' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = 'ConsumerKey')) BEGIN
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
            'ac24c30f-d824-4a61-9f49-d5d070fe2f3d',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
            'ConsumerKey',
            'Consumer Key',
            'The registration key of the consumer (an OrdersOutboundConsumer subclass).',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2803e64c-9b43-4656-9972-cff51a9e88fc' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = 'GatesAccess')) BEGIN
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
            '2803e64c-9b43-4656-9972-cff51a9e88fc',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
            'GatesAccess',
            'Gates Access',
            'True when this consumer''s delivery decides whether the buyer''s access is ready, as declared by the consumer when the event was recorded.',
            'bit',
            1,
            1,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3b537734-19c4-4cb6-950e-d345f52f8859' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = 'Status')) BEGIN
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
            '3b537734-19c4-4cb6-950e-d345f52f8859',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
            'Status',
            'Status',
            'Pending until the consumer accepts it (Delivered), or until DeadlineAt passes without success (DeadLettered). Setting a DeadLettered row back to Pending sends it again.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ac09ee3b-5509-4b95-8e81-3a46411da720' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = 'Attempts')) BEGIN
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
            'ac09ee3b-5509-4b95-8e81-3a46411da720',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
            'Attempts',
            'Attempts',
            'How many times delivery has been tried.',
            'int',
            4,
            10,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '394eb226-6e67-4505-aa04-6bee4e5dba66' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = 'NextAttemptAt')) BEGIN
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
            '394eb226-6e67-4505-aa04-6bee4e5dba66',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
            'NextAttemptAt',
            'Next Attempt At',
            'The earliest time the dispatcher tries this row again.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6f6ef4df-ee3b-472b-87de-6e7a18309663' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = 'DeadlineAt')) BEGIN
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
            '6f6ef4df-ee3b-472b-87de-6e7a18309663',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
            'DeadlineAt',
            'Deadline At',
            'After this time a failed attempt dead-letters the row instead of scheduling another.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0dbf1e50-f802-4d14-9eef-9b7833d54d46' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = 'LeaseUntil')) BEGIN
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
            '0dbf1e50-f802-4d14-9eef-9b7833d54d46',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
            'LeaseUntil',
            'Lease Until',
            'Set while a dispatcher pass holds the row, so another pass does not send it at the same time. A lease that runs out frees the row.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '837513b0-8a6c-4cb6-a798-a0c3af9dc787' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = 'LastAttemptAt')) BEGIN
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
            '837513b0-8a6c-4cb6-a798-a0c3af9dc787',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
            'LastAttemptAt',
            'Last Attempt At',
            'When delivery was last tried.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f70649c5-167c-4229-b8f7-5e473550d24d' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = 'LastError')) BEGIN
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
            'f70649c5-167c-4229-b8f7-5e473550d24d',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
            'LastError',
            'Last Error',
            'The consumer''s error from the last failed attempt.',
            'nvarchar',
            4000,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a26d9f45-3051-46d9-84af-e98f517f38bb' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = 'DeliveredAt')) BEGIN
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
            'a26d9f45-3051-46d9-84af-e98f517f38bb',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
            'DeliveredAt',
            'Delivered At',
            'When the consumer accepted the event.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8d7ecac6-1e9d-4b38-9bea-ca294c6e8edf' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = '__mj_CreatedAt')) BEGIN
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
            '8d7ecac6-1e9d-4b38-9bea-ca294c6e8edf',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3e14432f-0450-4a7c-a15b-88ff2fd89ba2' OR (EntityID = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '3e14432f-0450-4a7c-a15b-88ff2fd89ba2',
            'AAA87268-A880-44BA-AFFE-173A89FC1EEA', -- Entity: MJ_BizApps_Orders: Outbound Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA') + 1,
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
       WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '45faf85b-9332-4901-a126-4cb7360af518' OR (EntityID = '154DCE03-C019-43B0-B293-1E6D93E303A2' AND Name = 'ID')) BEGIN
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
            '45faf85b-9332-4901-a126-4cb7360af518',
            '154DCE03-C019-43B0-B293-1E6D93E303A2', -- Entity: MJ_BizApps_Orders: Outbound Events
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '65bc9df4-88ec-46f9-be8c-e66740b7ead1' OR (EntityID = '154DCE03-C019-43B0-B293-1E6D93E303A2' AND Name = 'EventType')) BEGIN
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
            '65bc9df4-88ec-46f9-be8c-e66740b7ead1',
            '154DCE03-C019-43B0-B293-1E6D93E303A2', -- Entity: MJ_BizApps_Orders: Outbound Events
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2') + 1,
            'EventType',
            'Event Type',
            'OrderConfirmed (first confirmation of an order, renewals included) or GrantStatusChanged (a grant created, or its Status changed).',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9bfafdd3-0a5c-4590-b607-e2e35a2f3f93' OR (EntityID = '154DCE03-C019-43B0-B293-1E6D93E303A2' AND Name = 'OrderHeaderID')) BEGIN
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
            '9bfafdd3-0a5c-4590-b607-e2e35a2f3f93',
            '154DCE03-C019-43B0-B293-1E6D93E303A2', -- Entity: MJ_BizApps_Orders: Outbound Events
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2') + 1,
            'OrderHeaderID',
            'Order Header ID',
            'The order the event is about. Set on both event types, so deliveries can be read by order.',
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
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ee61066f-863f-4fc6-9594-ee89db28b3e4' OR (EntityID = '154DCE03-C019-43B0-B293-1E6D93E303A2' AND Name = 'EntitlementGrantID')) BEGIN
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
            'ee61066f-863f-4fc6-9594-ee89db28b3e4',
            '154DCE03-C019-43B0-B293-1E6D93E303A2', -- Entity: MJ_BizApps_Orders: Outbound Events
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2') + 1,
            'EntitlementGrantID',
            'Entitlement Grant ID',
            'The grant a GrantStatusChanged event is about. NULL for OrderConfirmed.',
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
            '9E638C8F-6447-45D9-9137-B24E1047BCE5',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3d43f3ec-a59b-46b2-a3b8-e33396b89f6f' OR (EntityID = '154DCE03-C019-43B0-B293-1E6D93E303A2' AND Name = 'PayloadJSON')) BEGIN
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
            '3d43f3ec-a59b-46b2-a3b8-e33396b89f6f',
            '154DCE03-C019-43B0-B293-1E6D93E303A2', -- Entity: MJ_BizApps_Orders: Outbound Events
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2') + 1,
            'PayloadJSON',
            'Payload JSON',
            'The event as consumers receive it, fixed when the event was recorded.',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5a29e6a1-9759-4f95-ae82-ec04bc39e7cf' OR (EntityID = '154DCE03-C019-43B0-B293-1E6D93E303A2' AND Name = 'OccurredAt')) BEGIN
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
            '5a29e6a1-9759-4f95-ae82-ec04bc39e7cf',
            '154DCE03-C019-43B0-B293-1E6D93E303A2', -- Entity: MJ_BizApps_Orders: Outbound Events
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2') + 1,
            'OccurredAt',
            'Occurred At',
            'When the change that caused the event was saved.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '822e5b82-cd3d-40ee-b90b-c511fcf47d05' OR (EntityID = '154DCE03-C019-43B0-B293-1E6D93E303A2' AND Name = '__mj_CreatedAt')) BEGIN
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
            '822e5b82-cd3d-40ee-b90b-c511fcf47d05',
            '154DCE03-C019-43B0-B293-1E6D93E303A2', -- Entity: MJ_BizApps_Orders: Outbound Events
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '934254a7-7dac-4602-a594-b51ced16c148' OR (EntityID = '154DCE03-C019-43B0-B293-1E6D93E303A2' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '934254a7-7dac-4602-a594-b51ced16c148',
            '154DCE03-C019-43B0-B293-1E6D93E303A2', -- Entity: MJ_BizApps_Orders: Outbound Events
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2') + 1,
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

/* SQL text to insert entity field value with ID 35292864-11ba-4cbc-b2a0-ebb99648be81 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('35292864-11ba-4cbc-b2a0-ebb99648be81', '65BC9DF4-88EC-46F9-BE8C-E66740B7EAD1', 1, 'GrantStatusChanged', 'GrantStatusChanged', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c0696744-57fd-4a5f-9465-4b613070b9f3 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c0696744-57fd-4a5f-9465-4b613070b9f3', '65BC9DF4-88EC-46F9-BE8C-E66740B7EAD1', 2, 'OrderConfirmed', 'OrderConfirmed', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 65BC9DF4-88EC-46F9-BE8C-E66740B7EAD1 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='65BC9DF4-88EC-46F9-BE8C-E66740B7EAD1';

/* SQL text to insert entity field value with ID b7b0f014-3f0d-4064-9784-e47b4ebc7785 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b7b0f014-3f0d-4064-9784-e47b4ebc7785', '3B537734-19C4-4CB6-950E-D345F52F8859', 1, 'DeadLettered', 'DeadLettered', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID eda62deb-83d4-40d5-ad85-5e021d40bc51 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('eda62deb-83d4-40d5-ad85-5e021d40bc51', '3B537734-19C4-4CB6-950E-D345F52F8859', 2, 'Delivered', 'Delivered', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d857a56f-039d-4c21-b061-f4381dc700b1 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d857a56f-039d-4c21-b061-f4381dc700b1', '3B537734-19C4-4CB6-950E-D345F52F8859', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3B537734-19C4-4CB6-950E-D345F52F8859 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='3B537734-19C4-4CB6-950E-D345F52F8859';


/* Create Entity Relationship: MJ_BizApps_Orders: Outbound Events -> MJ_BizApps_Orders: Outbound Deliveries (One To Many via OutboundEventID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'ade11250-42a5-4068-aea0-b8474ac854a3'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ade11250-42a5-4068-aea0-b8474ac854a3', '154DCE03-C019-43B0-B293-1E6D93E303A2', 'AAA87268-A880-44BA-AFFE-173A89FC1EEA', 'OutboundEventID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Order Headers -> MJ_BizApps_Orders: Outbound Events (One To Many via OrderHeaderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'cc4e582d-cd7a-4571-bbdd-c6598d88203c'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('cc4e582d-cd7a-4571-bbdd-c6598d88203c', 'FC529BC8-FF09-44A9-B454-26EAFDAC791B', '154DCE03-C019-43B0-B293-1E6D93E303A2', 'OrderHeaderID', 'One To Many', 1, 1, 15, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Entitlement Grants -> MJ_BizApps_Orders: Outbound Events (One To Many via EntitlementGrantID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'f4cfb126-6867-4b07-a95c-211efa84ad22'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f4cfb126-6867-4b07-a95c-211efa84ad22', '9E638C8F-6447-45D9-9137-B24E1047BCE5', '154DCE03-C019-43B0-B293-1E6D93E303A2', 'EntitlementGrantID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for OutboundDelivery */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Outbound Deliveries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OutboundEventID in table OutboundDelivery
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OutboundDelivery_OutboundEventID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OutboundDelivery]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OutboundDelivery_OutboundEventID ON [${flyway:defaultSchema}].[OutboundDelivery] ([OutboundEventID]);

/* Index for Foreign Keys for OutboundEvent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Outbound Events
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderHeaderID in table OutboundEvent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OutboundEvent_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OutboundEvent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OutboundEvent_OrderHeaderID ON [${flyway:defaultSchema}].[OutboundEvent] ([OrderHeaderID]);

-- Index for foreign key EntitlementGrantID in table OutboundEvent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OutboundEvent_EntitlementGrantID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OutboundEvent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OutboundEvent_EntitlementGrantID ON [${flyway:defaultSchema}].[OutboundEvent] ([EntitlementGrantID]);

/* SQL text to update entity field related entity name field map for entity field ID 9BFAFDD3-0A5C-4590-B607-E2E35A2F3F93 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9BFAFDD3-0A5C-4590-B607-E2E35A2F3F93', @RelatedEntityNameFieldMap='OrderHeader';

/* Base View SQL for MJ_BizApps_Orders: Outbound Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Outbound Deliveries
-- Item: vwOutboundDeliveries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Outbound Deliveries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OutboundDelivery
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOutboundDeliveries]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOutboundDeliveries];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOutboundDeliveries]
AS
SELECT
    o.*
FROM
    [${flyway:defaultSchema}].[OutboundDelivery] AS o
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOutboundDeliveries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Outbound Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Outbound Deliveries
-- Item: Permissions for vwOutboundDeliveries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOutboundDeliveries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Outbound Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Outbound Deliveries
-- Item: spCreateOutboundDelivery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OutboundDelivery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOutboundDelivery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOutboundDelivery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOutboundDelivery]
    @ID uniqueidentifier = NULL,
    @OutboundEventID uniqueidentifier,
    @ConsumerKey nvarchar(100),
    @GatesAccess bit = NULL,
    @Status nvarchar(20) = NULL,
    @Attempts int = NULL,
    @NextAttemptAt datetimeoffset = NULL,
    @DeadlineAt datetimeoffset,
    @LeaseUntil_Clear bit = 0,
    @LeaseUntil datetimeoffset = NULL,
    @LastAttemptAt_Clear bit = 0,
    @LastAttemptAt datetimeoffset = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(2000) = NULL,
    @DeliveredAt_Clear bit = 0,
    @DeliveredAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OutboundDelivery]
            (
                [ID],
                [OutboundEventID],
                [ConsumerKey],
                [GatesAccess],
                [Status],
                [Attempts],
                [NextAttemptAt],
                [DeadlineAt],
                [LeaseUntil],
                [LastAttemptAt],
                [LastError],
                [DeliveredAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OutboundEventID,
                @ConsumerKey,
                ISNULL(@GatesAccess, 0),
                ISNULL(@Status, 'Pending'),
                ISNULL(@Attempts, 0),
                ISNULL(@NextAttemptAt, sysdatetimeoffset()),
                @DeadlineAt,
                CASE WHEN @LeaseUntil_Clear = 1 THEN NULL ELSE ISNULL(@LeaseUntil, NULL) END,
                CASE WHEN @LastAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAttemptAt, NULL) END,
                CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, NULL) END,
                CASE WHEN @DeliveredAt_Clear = 1 THEN NULL ELSE ISNULL(@DeliveredAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OutboundDelivery]
            (
                [OutboundEventID],
                [ConsumerKey],
                [GatesAccess],
                [Status],
                [Attempts],
                [NextAttemptAt],
                [DeadlineAt],
                [LeaseUntil],
                [LastAttemptAt],
                [LastError],
                [DeliveredAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OutboundEventID,
                @ConsumerKey,
                ISNULL(@GatesAccess, 0),
                ISNULL(@Status, 'Pending'),
                ISNULL(@Attempts, 0),
                ISNULL(@NextAttemptAt, sysdatetimeoffset()),
                @DeadlineAt,
                CASE WHEN @LeaseUntil_Clear = 1 THEN NULL ELSE ISNULL(@LeaseUntil, NULL) END,
                CASE WHEN @LastAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAttemptAt, NULL) END,
                CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, NULL) END,
                CASE WHEN @DeliveredAt_Clear = 1 THEN NULL ELSE ISNULL(@DeliveredAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOutboundDeliveries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOutboundDelivery] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Outbound Deliveries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOutboundDelivery] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Outbound Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Outbound Deliveries
-- Item: spUpdateOutboundDelivery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OutboundDelivery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOutboundDelivery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOutboundDelivery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOutboundDelivery]
    @ID uniqueidentifier,
    @OutboundEventID uniqueidentifier = NULL,
    @ConsumerKey nvarchar(100) = NULL,
    @GatesAccess bit = NULL,
    @Status nvarchar(20) = NULL,
    @Attempts int = NULL,
    @NextAttemptAt datetimeoffset = NULL,
    @DeadlineAt datetimeoffset = NULL,
    @LeaseUntil_Clear bit = 0,
    @LeaseUntil datetimeoffset = NULL,
    @LastAttemptAt_Clear bit = 0,
    @LastAttemptAt datetimeoffset = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(2000) = NULL,
    @DeliveredAt_Clear bit = 0,
    @DeliveredAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OutboundDelivery]
    SET
        [OutboundEventID] = ISNULL(@OutboundEventID, [OutboundEventID]),
        [ConsumerKey] = ISNULL(@ConsumerKey, [ConsumerKey]),
        [GatesAccess] = ISNULL(@GatesAccess, [GatesAccess]),
        [Status] = ISNULL(@Status, [Status]),
        [Attempts] = ISNULL(@Attempts, [Attempts]),
        [NextAttemptAt] = ISNULL(@NextAttemptAt, [NextAttemptAt]),
        [DeadlineAt] = ISNULL(@DeadlineAt, [DeadlineAt]),
        [LeaseUntil] = CASE WHEN @LeaseUntil_Clear = 1 THEN NULL ELSE ISNULL(@LeaseUntil, [LeaseUntil]) END,
        [LastAttemptAt] = CASE WHEN @LastAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAttemptAt, [LastAttemptAt]) END,
        [LastError] = CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, [LastError]) END,
        [DeliveredAt] = CASE WHEN @DeliveredAt_Clear = 1 THEN NULL ELSE ISNULL(@DeliveredAt, [DeliveredAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOutboundDeliveries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOutboundDeliveries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOutboundDelivery] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OutboundDelivery table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOutboundDelivery]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOutboundDelivery];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOutboundDelivery
ON [${flyway:defaultSchema}].[OutboundDelivery]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OutboundDelivery]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OutboundDelivery] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Outbound Deliveries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOutboundDelivery] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Outbound Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Outbound Deliveries
-- Item: spDeleteOutboundDelivery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OutboundDelivery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOutboundDelivery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOutboundDelivery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOutboundDelivery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OutboundDelivery]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOutboundDelivery] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Outbound Deliveries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOutboundDelivery] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Outbound Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Outbound Events
-- Item: vwOutboundEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Outbound Events
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OutboundEvent
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOutboundEvents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOutboundEvents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOutboundEvents]
AS
SELECT
    o.*,
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader]
FROM
    [${flyway:defaultSchema}].[OutboundEvent] AS o
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [o].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOutboundEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Outbound Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Outbound Events
-- Item: Permissions for vwOutboundEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOutboundEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Outbound Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Outbound Events
-- Item: spCreateOutboundEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OutboundEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOutboundEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOutboundEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOutboundEvent]
    @ID uniqueidentifier = NULL,
    @EventType nvarchar(40),
    @OrderHeaderID_Clear bit = 0,
    @OrderHeaderID uniqueidentifier = NULL,
    @EntitlementGrantID_Clear bit = 0,
    @EntitlementGrantID uniqueidentifier = NULL,
    @PayloadJSON nvarchar(MAX),
    @OccurredAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OutboundEvent]
            (
                [ID],
                [EventType],
                [OrderHeaderID],
                [EntitlementGrantID],
                [PayloadJSON],
                [OccurredAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EventType,
                CASE WHEN @OrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderID, NULL) END,
                CASE WHEN @EntitlementGrantID_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementGrantID, NULL) END,
                @PayloadJSON,
                ISNULL(@OccurredAt, sysdatetimeoffset())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OutboundEvent]
            (
                [EventType],
                [OrderHeaderID],
                [EntitlementGrantID],
                [PayloadJSON],
                [OccurredAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EventType,
                CASE WHEN @OrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderID, NULL) END,
                CASE WHEN @EntitlementGrantID_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementGrantID, NULL) END,
                @PayloadJSON,
                ISNULL(@OccurredAt, sysdatetimeoffset())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOutboundEvents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOutboundEvent] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Outbound Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOutboundEvent] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Outbound Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Outbound Events
-- Item: spUpdateOutboundEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OutboundEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOutboundEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOutboundEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOutboundEvent]
    @ID uniqueidentifier,
    @EventType nvarchar(40) = NULL,
    @OrderHeaderID_Clear bit = 0,
    @OrderHeaderID uniqueidentifier = NULL,
    @EntitlementGrantID_Clear bit = 0,
    @EntitlementGrantID uniqueidentifier = NULL,
    @PayloadJSON nvarchar(MAX) = NULL,
    @OccurredAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OutboundEvent]
    SET
        [EventType] = ISNULL(@EventType, [EventType]),
        [OrderHeaderID] = CASE WHEN @OrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderID, [OrderHeaderID]) END,
        [EntitlementGrantID] = CASE WHEN @EntitlementGrantID_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementGrantID, [EntitlementGrantID]) END,
        [PayloadJSON] = ISNULL(@PayloadJSON, [PayloadJSON]),
        [OccurredAt] = ISNULL(@OccurredAt, [OccurredAt])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOutboundEvents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOutboundEvents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOutboundEvent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OutboundEvent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOutboundEvent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOutboundEvent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOutboundEvent
ON [${flyway:defaultSchema}].[OutboundEvent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OutboundEvent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OutboundEvent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Outbound Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOutboundEvent] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Outbound Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Outbound Events
-- Item: spDeleteOutboundEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OutboundEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOutboundEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOutboundEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOutboundEvent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OutboundEvent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOutboundEvent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Outbound Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOutboundEvent] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4310fff2-8baf-4ed8-a074-a3a22d39cf67' OR (EntityID = '154DCE03-C019-43B0-B293-1E6D93E303A2' AND Name = 'OrderHeader')) BEGIN
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
            '4310fff2-8baf-4ed8-a074-a3a22d39cf67',
            '154DCE03-C019-43B0-B293-1E6D93E303A2', -- Entity: MJ_BizApps_Orders: Outbound Events
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2') + 1,
            'OrderHeader',
            'Order Header',
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
