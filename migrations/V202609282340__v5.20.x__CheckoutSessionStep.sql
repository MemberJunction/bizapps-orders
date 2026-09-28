-- =============================================================================
-- V202609282340 — Checkout step record (bizapps-orders#326)
-- =============================================================================
-- After payment a checkout confirms the order (booking and entitlement grants,
-- one transaction) and captures the payment. A failure in either is logged, but
-- nothing records per session which steps ran, how often they were tried, or how
-- the last try ended.
--
-- CheckoutSessionStep is that record: one row per session per step. The service
-- writes it outside the step's own transaction, so a rolled-back Confirm still
-- leaves its failure behind. A Failed row, or a Running row nobody finished, is
-- what an operator reviews and replays.
--
-- StepName lists only the steps that run today. GuestOrder claim minting is not
-- one of them: it is dormant until MJ publishes the identity-claim engine. A new
-- post-payment step adds its name to CK_CheckoutSessionStep_StepName in its own
-- migration.
--
-- CodeGen output for this table is folded below the banner at the end of this file.
-- =============================================================================

CREATE TABLE [${flyway:defaultSchema}].[CheckoutSessionStep] (
    [ID]                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_CheckoutSessionStep_ID] DEFAULT (newsequentialid()),
    [CheckoutSessionID]    UNIQUEIDENTIFIER NOT NULL,
    [StepName]             NVARCHAR(50)     NOT NULL,
    [Status]               NVARCHAR(20)     NOT NULL CONSTRAINT [DF_CheckoutSessionStep_Status] DEFAULT (N'Running'),
    [Attempts]             INT              NOT NULL CONSTRAINT [DF_CheckoutSessionStep_Attempts] DEFAULT (0),
    [LastError]            NVARCHAR(MAX)    NULL,
    [Retryable]            BIT              NULL,
    [LastAttemptSource]    NVARCHAR(20)     NOT NULL,
    [LastReplayedByUserID] UNIQUEIDENTIFIER NULL,
    [FirstAttemptAt]       DATETIMEOFFSET   NOT NULL,
    [LastAttemptAt]        DATETIMEOFFSET   NOT NULL,
    [SucceededAt]          DATETIMEOFFSET   NULL,

    CONSTRAINT [PK_CheckoutSessionStep] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_CheckoutSessionStep_CheckoutSession] FOREIGN KEY ([CheckoutSessionID])
        REFERENCES [${flyway:defaultSchema}].[CheckoutSession]([ID]),
    CONSTRAINT [FK_CheckoutSessionStep_LastReplayedByUser] FOREIGN KEY ([LastReplayedByUserID])
        REFERENCES [__mj].[User]([ID]),
    CONSTRAINT [UQ_CheckoutSessionStep_Session_Step] UNIQUE ([CheckoutSessionID], [StepName]),
    CONSTRAINT [CK_CheckoutSessionStep_StepName] CHECK ([StepName] IN (N'Confirm', N'Capture')),
    CONSTRAINT [CK_CheckoutSessionStep_Status] CHECK ([Status] IN (N'Running', N'Succeeded', N'Failed')),
    CONSTRAINT [CK_CheckoutSessionStep_LastAttemptSource] CHECK ([LastAttemptSource] IN (N'Checkout', N'Webhook', N'Replay')),
    CONSTRAINT [CK_CheckoutSessionStep_Attempts] CHECK ([Attempts] >= 0)
);
GO

-- Descriptions: MS_Description is what CodeGen carries into EntityField.Description.
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'One post-payment step of one checkout session: whether it ran, how many times, and how the last attempt ended. Written outside the step''s own transaction, so a rolled-back step still records its failure. A Failed row, or a Running row left unfinished, needs review; Orders.ReplayCheckoutStep re-drives it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSessionStep';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The checkout session this step belongs to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSessionStep',
    @level2type = N'COLUMN', @level2name = N'CheckoutSessionID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Which post-payment step. Confirm: the order confirms, booking and creating entitlement grants in one transaction. Capture: the payment is booked against the order.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSessionStep',
    @level2type = N'COLUMN', @level2name = N'StepName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Running: an attempt started and has not reported back; one left Running long after LastAttemptAt was interrupted. Succeeded: the step is done, and replaying it does nothing. Failed: the last attempt failed; LastError says why.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSessionStep',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How many times the step has been attempted, from any source.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSessionStep',
    @level2type = N'COLUMN', @level2name = N'Attempts';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The error from the last failed attempt. Cleared when the step succeeds.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSessionStep',
    @level2type = N'COLUMN', @level2name = N'LastError';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the last failure can succeed on a later attempt without anything changing (1), or needs a fix to the data first (0). NULL when the step has not failed or the step does not classify its failures.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSessionStep',
    @level2type = N'COLUMN', @level2name = N'Retryable';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'What started the last attempt. Checkout: the buyer''s complete call. Webhook: a payment-provider event. Replay: an operator, through Orders.ReplayCheckoutStep.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSessionStep',
    @level2type = N'COLUMN', @level2name = N'LastAttemptSource';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The operator who last replayed this step. NULL if it was never replayed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSessionStep',
    @level2type = N'COLUMN', @level2name = N'LastReplayedByUserID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the step was first attempted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSessionStep',
    @level2type = N'COLUMN', @level2name = N'FirstAttemptAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the most recent attempt started.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSessionStep',
    @level2type = N'COLUMN', @level2name = N'LastAttemptAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the step succeeded. NULL until it does.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSessionStep',
    @level2type = N'COLUMN', @level2name = N'SucceededAt';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the CheckoutSessionStep entity (its metadata,
-- view, CRUD procs and permissions) is folded here.
-- (Every Sequence is written as MAX + 1 rather than CodeGen's literal, so it cannot collide with UQ_EntityField_EntityID_Sequence on another database.)
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Orders: Checkout Session Steps */

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
         '609e4679-d662-4ecd-9c54-722b8acb1724',
         'MJ_BizApps_Orders: Checkout Session Steps',
         'Checkout Session Steps',
         'One post-payment step of one checkout session: whether it ran, how many times, and how the last attempt ended. Written outside the step''s own transaction, so a rolled-back step still records its failure. A Failed row, or a Running row left unfinished, needs review; Orders.ReplayCheckoutStep re-drives it.',
         NULL,
         'CheckoutSessionStep',
         'vwCheckoutSessionSteps',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Checkout Session Steps to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '609e4679-d662-4ecd-9c54-722b8acb1724', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Checkout Session Steps for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('609e4679-d662-4ecd-9c54-722b8acb1724', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Checkout Session Steps for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('609e4679-d662-4ecd-9c54-722b8acb1724', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Checkout Session Steps for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('609e4679-d662-4ecd-9c54-722b8acb1724', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CheckoutSessionStep */
ALTER TABLE [${flyway:defaultSchema}].[CheckoutSessionStep] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CheckoutSessionStep */
UPDATE [${flyway:defaultSchema}].[CheckoutSessionStep] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CheckoutSessionStep */
ALTER TABLE [${flyway:defaultSchema}].[CheckoutSessionStep] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CheckoutSessionStep */
ALTER TABLE [${flyway:defaultSchema}].[CheckoutSessionStep] ADD CONSTRAINT [DF___mj_BizAppsOrders_CheckoutSessionStep___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CheckoutSessionStep */
ALTER TABLE [${flyway:defaultSchema}].[CheckoutSessionStep] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CheckoutSessionStep */
UPDATE [${flyway:defaultSchema}].[CheckoutSessionStep] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CheckoutSessionStep */
ALTER TABLE [${flyway:defaultSchema}].[CheckoutSessionStep] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CheckoutSessionStep */
ALTER TABLE [${flyway:defaultSchema}].[CheckoutSessionStep] ADD CONSTRAINT [DF___mj_BizAppsOrders_CheckoutSessionStep___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 15 new entity field(s) */
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd8af2354-54a9-4ca4-ab4d-6e5c0f8909e7' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'ID')) BEGIN
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
            'd8af2354-54a9-4ca4-ab4d-6e5c0f8909e7',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '329f3bf4-b525-4c53-98e8-fa0096511a3a' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'CheckoutSessionID')) BEGIN
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
            '329f3bf4-b525-4c53-98e8-fa0096511a3a',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
            'CheckoutSessionID',
            'Checkout Session ID',
            'The checkout session this step belongs to.',
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
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '77945a3a-1c62-402e-80f6-a9316c938656' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'StepName')) BEGIN
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
            '77945a3a-1c62-402e-80f6-a9316c938656',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
            'StepName',
            'Step Name',
            'Which post-payment step. Confirm: the order confirms, booking and creating entitlement grants in one transaction. Capture: the payment is booked against the order.',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'edf84a26-1f31-4059-a391-64dad41689ac' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'Status')) BEGIN
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
            'edf84a26-1f31-4059-a391-64dad41689ac',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
            'Status',
            'Status',
            'Running: an attempt started and has not reported back; one left Running long after LastAttemptAt was interrupted. Succeeded: the step is done, and replaying it does nothing. Failed: the last attempt failed; LastError says why.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Running',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '58de02db-c86f-4d7a-9670-14bb3bbcf1c2' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'Attempts')) BEGIN
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
            '58de02db-c86f-4d7a-9670-14bb3bbcf1c2',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
            'Attempts',
            'Attempts',
            'How many times the step has been attempted, from any source.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '03c10ea4-5087-4f9b-8dbf-9e69445491d7' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'LastError')) BEGIN
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
            '03c10ea4-5087-4f9b-8dbf-9e69445491d7',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
            'LastError',
            'Last Error',
            'The error from the last failed attempt. Cleared when the step succeeds.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '22287b93-c5ea-4a2f-a574-c62cfe8ec2bb' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'Retryable')) BEGIN
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
            '22287b93-c5ea-4a2f-a574-c62cfe8ec2bb',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
            'Retryable',
            'Retryable',
            'Whether the last failure can succeed on a later attempt without anything changing (1), or needs a fix to the data first (0). NULL when the step has not failed or the step does not classify its failures.',
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0ff6aa9d-ed28-471a-8a1a-78c36b32dbd7' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'LastAttemptSource')) BEGIN
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
            '0ff6aa9d-ed28-471a-8a1a-78c36b32dbd7',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
            'LastAttemptSource',
            'Last Attempt Source',
            'What started the last attempt. Checkout: the buyer''s complete call. Webhook: a payment-provider event. Replay: an operator, through Orders.ReplayCheckoutStep.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9af253fc-2492-423e-99f6-9f2630df3983' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'LastReplayedByUserID')) BEGIN
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
            '9af253fc-2492-423e-99f6-9f2630df3983',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
            'LastReplayedByUserID',
            'Last Replayed By User ID',
            'The operator who last replayed this step. NULL if it was never replayed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3a1ac70b-1969-444c-ab9f-68887fd487da' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'FirstAttemptAt')) BEGIN
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
            '3a1ac70b-1969-444c-ab9f-68887fd487da',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
            'FirstAttemptAt',
            'First Attempt At',
            'When the step was first attempted.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '060a80a0-2f49-4a0d-aaf4-eae033e0cc98' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'LastAttemptAt')) BEGIN
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
            '060a80a0-2f49-4a0d-aaf4-eae033e0cc98',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
            'LastAttemptAt',
            'Last Attempt At',
            'When the most recent attempt started.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9750abeb-28be-4880-8083-113b8d670d43' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'SucceededAt')) BEGIN
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
            '9750abeb-28be-4880-8083-113b8d670d43',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
            'SucceededAt',
            'Succeeded At',
            'When the step succeeded. NULL until it does.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '370134ae-d216-469a-a987-558ac3e8bde8' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = '__mj_CreatedAt')) BEGIN
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
            '370134ae-d216-469a-a987-558ac3e8bde8',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '55031eba-9553-40a7-b8f4-f1e20e31c499' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '55031eba-9553-40a7-b8f4-f1e20e31c499',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
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

/* SQL text to insert entity field value with ID e78c5260-c816-4338-936d-8e6a36930835 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e78c5260-c816-4338-936d-8e6a36930835', '77945A3A-1C62-402E-80F6-A9316C938656', 1, 'Capture', 'Capture', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 08595161-b9b8-44df-b834-ac7e1feacc88 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('08595161-b9b8-44df-b834-ac7e1feacc88', '77945A3A-1C62-402E-80F6-A9316C938656', 2, 'Confirm', 'Confirm', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 77945A3A-1C62-402E-80F6-A9316C938656 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='77945A3A-1C62-402E-80F6-A9316C938656';

/* SQL text to insert entity field value with ID 2d2d7d23-8df3-4aec-8548-8bc2c9af129f */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2d2d7d23-8df3-4aec-8548-8bc2c9af129f', 'EDF84A26-1F31-4059-A391-64DAD41689AC', 1, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 69376f7a-0078-46f3-9e33-0264eb92c43c */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('69376f7a-0078-46f3-9e33-0264eb92c43c', 'EDF84A26-1F31-4059-A391-64DAD41689AC', 2, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 08b0357f-8aff-4ca0-849c-f7cb56ed9c94 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('08b0357f-8aff-4ca0-849c-f7cb56ed9c94', 'EDF84A26-1F31-4059-A391-64DAD41689AC', 3, 'Succeeded', 'Succeeded', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID EDF84A26-1F31-4059-A391-64DAD41689AC */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='EDF84A26-1F31-4059-A391-64DAD41689AC';

/* SQL text to insert entity field value with ID 329b5ca1-bf7f-4184-9166-16e2b65869e9 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('329b5ca1-bf7f-4184-9166-16e2b65869e9', '0FF6AA9D-ED28-471A-8A1A-78C36B32DBD7', 1, 'Checkout', 'Checkout', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 17957fb7-2f9d-4105-bc0d-fc0937bb5c5a */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('17957fb7-2f9d-4105-bc0d-fc0937bb5c5a', '0FF6AA9D-ED28-471A-8A1A-78C36B32DBD7', 2, 'Replay', 'Replay', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1fd6b4fd-773b-4fa0-991a-af9cc4e358b8 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1fd6b4fd-773b-4fa0-991a-af9cc4e358b8', '0FF6AA9D-ED28-471A-8A1A-78C36B32DBD7', 3, 'Webhook', 'Webhook', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0FF6AA9D-ED28-471A-8A1A-78C36B32DBD7 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='0FF6AA9D-ED28-471A-8A1A-78C36B32DBD7';

/* Create Entity Relationship: MJ_BizApps_Orders: Checkout Sessions -> MJ_BizApps_Orders: Checkout Session Steps (One To Many via CheckoutSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '46887cf8-4eb7-4afe-ad2a-c096d4ea2e16'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('46887cf8-4eb7-4afe-ad2a-c096d4ea2e16', 'C2F418C4-8239-4486-B036-0BC4EAE4D24E', '609E4679-D662-4ECD-9C54-722B8ACB1724', 'CheckoutSessionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Checkout Session Steps (One To Many via LastReplayedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '726a5f56-8a4c-4a70-8f5f-2c6dfb23096f'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('726a5f56-8a4c-4a70-8f5f-2c6dfb23096f', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '609E4679-D662-4ECD-9C54-722B8ACB1724', 'LastReplayedByUserID', 'One To Many', 1, 1, 123, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for CheckoutSessionStep */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Session Steps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CheckoutSessionID in table CheckoutSessionStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutSessionStep_CheckoutSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutSessionStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutSessionStep_CheckoutSessionID ON [${flyway:defaultSchema}].[CheckoutSessionStep] ([CheckoutSessionID]);

-- Index for foreign key LastReplayedByUserID in table CheckoutSessionStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutSessionStep_LastReplayedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutSessionStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutSessionStep_LastReplayedByUserID ON [${flyway:defaultSchema}].[CheckoutSessionStep] ([LastReplayedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 329F3BF4-B525-4C53-98E8-FA0096511A3A */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='329F3BF4-B525-4C53-98E8-FA0096511A3A', @RelatedEntityNameFieldMap='CheckoutSession';

/* SQL text to update entity field related entity name field map for entity field ID 9AF253FC-2492-423E-99F6-9F2630DF3983 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9AF253FC-2492-423E-99F6-9F2630DF3983', @RelatedEntityNameFieldMap='LastReplayedByUser';

/* Base View SQL for MJ_BizApps_Orders: Checkout Session Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Session Steps
-- Item: vwCheckoutSessionSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Checkout Session Steps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CheckoutSessionStep
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCheckoutSessionSteps]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCheckoutSessionSteps];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCheckoutSessionSteps]
AS
SELECT
    c.*,
    mjBizAppsOrdersCheckoutSession_CheckoutSessionID.[ClientSessionKey] AS [CheckoutSession],
    MJUser_LastReplayedByUserID.[Name] AS [LastReplayedByUser]
FROM
    [${flyway:defaultSchema}].[CheckoutSessionStep] AS c
INNER JOIN
    [${flyway:defaultSchema}].[CheckoutSession] AS mjBizAppsOrdersCheckoutSession_CheckoutSessionID
  ON
    [c].[CheckoutSessionID] = mjBizAppsOrdersCheckoutSession_CheckoutSessionID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_LastReplayedByUserID
  ON
    [c].[LastReplayedByUserID] = MJUser_LastReplayedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCheckoutSessionSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Checkout Session Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Session Steps
-- Item: Permissions for vwCheckoutSessionSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCheckoutSessionSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Checkout Session Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Session Steps
-- Item: spCreateCheckoutSessionStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CheckoutSessionStep
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCheckoutSessionStep]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCheckoutSessionStep];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCheckoutSessionStep]
    @ID uniqueidentifier = NULL,
    @CheckoutSessionID uniqueidentifier,
    @StepName nvarchar(50),
    @Status nvarchar(20) = NULL,
    @Attempts int = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(MAX) = NULL,
    @Retryable_Clear bit = 0,
    @Retryable bit = NULL,
    @LastAttemptSource nvarchar(20),
    @LastReplayedByUserID_Clear bit = 0,
    @LastReplayedByUserID uniqueidentifier = NULL,
    @FirstAttemptAt datetimeoffset,
    @LastAttemptAt datetimeoffset,
    @SucceededAt_Clear bit = 0,
    @SucceededAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CheckoutSessionStep]
            (
                [ID],
                [CheckoutSessionID],
                [StepName],
                [Status],
                [Attempts],
                [LastError],
                [Retryable],
                [LastAttemptSource],
                [LastReplayedByUserID],
                [FirstAttemptAt],
                [LastAttemptAt],
                [SucceededAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CheckoutSessionID,
                @StepName,
                ISNULL(@Status, 'Running'),
                ISNULL(@Attempts, 0),
                CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, NULL) END,
                CASE WHEN @Retryable_Clear = 1 THEN NULL ELSE ISNULL(@Retryable, NULL) END,
                @LastAttemptSource,
                CASE WHEN @LastReplayedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastReplayedByUserID, NULL) END,
                @FirstAttemptAt,
                @LastAttemptAt,
                CASE WHEN @SucceededAt_Clear = 1 THEN NULL ELSE ISNULL(@SucceededAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CheckoutSessionStep]
            (
                [CheckoutSessionID],
                [StepName],
                [Status],
                [Attempts],
                [LastError],
                [Retryable],
                [LastAttemptSource],
                [LastReplayedByUserID],
                [FirstAttemptAt],
                [LastAttemptAt],
                [SucceededAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CheckoutSessionID,
                @StepName,
                ISNULL(@Status, 'Running'),
                ISNULL(@Attempts, 0),
                CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, NULL) END,
                CASE WHEN @Retryable_Clear = 1 THEN NULL ELSE ISNULL(@Retryable, NULL) END,
                @LastAttemptSource,
                CASE WHEN @LastReplayedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastReplayedByUserID, NULL) END,
                @FirstAttemptAt,
                @LastAttemptAt,
                CASE WHEN @SucceededAt_Clear = 1 THEN NULL ELSE ISNULL(@SucceededAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCheckoutSessionSteps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCheckoutSessionStep] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Checkout Session Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCheckoutSessionStep] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Checkout Session Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Session Steps
-- Item: spUpdateCheckoutSessionStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CheckoutSessionStep
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCheckoutSessionStep]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCheckoutSessionStep];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCheckoutSessionStep]
    @ID uniqueidentifier,
    @CheckoutSessionID uniqueidentifier = NULL,
    @StepName nvarchar(50) = NULL,
    @Status nvarchar(20) = NULL,
    @Attempts int = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(MAX) = NULL,
    @Retryable_Clear bit = 0,
    @Retryable bit = NULL,
    @LastAttemptSource nvarchar(20) = NULL,
    @LastReplayedByUserID_Clear bit = 0,
    @LastReplayedByUserID uniqueidentifier = NULL,
    @FirstAttemptAt datetimeoffset = NULL,
    @LastAttemptAt datetimeoffset = NULL,
    @SucceededAt_Clear bit = 0,
    @SucceededAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CheckoutSessionStep]
    SET
        [CheckoutSessionID] = ISNULL(@CheckoutSessionID, [CheckoutSessionID]),
        [StepName] = ISNULL(@StepName, [StepName]),
        [Status] = ISNULL(@Status, [Status]),
        [Attempts] = ISNULL(@Attempts, [Attempts]),
        [LastError] = CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, [LastError]) END,
        [Retryable] = CASE WHEN @Retryable_Clear = 1 THEN NULL ELSE ISNULL(@Retryable, [Retryable]) END,
        [LastAttemptSource] = ISNULL(@LastAttemptSource, [LastAttemptSource]),
        [LastReplayedByUserID] = CASE WHEN @LastReplayedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastReplayedByUserID, [LastReplayedByUserID]) END,
        [FirstAttemptAt] = ISNULL(@FirstAttemptAt, [FirstAttemptAt]),
        [LastAttemptAt] = ISNULL(@LastAttemptAt, [LastAttemptAt]),
        [SucceededAt] = CASE WHEN @SucceededAt_Clear = 1 THEN NULL ELSE ISNULL(@SucceededAt, [SucceededAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCheckoutSessionSteps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCheckoutSessionSteps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutSessionStep] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CheckoutSessionStep table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCheckoutSessionStep]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCheckoutSessionStep];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCheckoutSessionStep
ON [${flyway:defaultSchema}].[CheckoutSessionStep]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CheckoutSessionStep]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CheckoutSessionStep] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Checkout Session Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutSessionStep] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Checkout Session Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Session Steps
-- Item: spDeleteCheckoutSessionStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CheckoutSessionStep
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCheckoutSessionStep]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCheckoutSessionStep];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCheckoutSessionStep]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CheckoutSessionStep]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCheckoutSessionStep] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Checkout Session Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCheckoutSessionStep] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 3 new entity field(s) */
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fa9b659e-8641-4b30-90ba-040bc27e2063' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'CheckoutSession')) BEGIN
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
            'fa9b659e-8641-4b30-90ba-040bc27e2063',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
            'CheckoutSession',
            'Checkout Session',
            NULL,
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7dcb05a1-a540-41c7-9173-2cfdb66a0065' OR (EntityID = '609E4679-D662-4ECD-9C54-722B8ACB1724' AND Name = 'LastReplayedByUser')) BEGIN
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
            '7dcb05a1-a540-41c7-9173-2cfdb66a0065',
            '609E4679-D662-4ECD-9C54-722B8ACB1724', -- Entity: MJ_BizApps_Orders: Checkout Session Steps
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '609E4679-D662-4ECD-9C54-722B8ACB1724') + 1,
            'LastReplayedByUser',
            'Last Replayed By User',
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
