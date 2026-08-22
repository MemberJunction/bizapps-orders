-- =====================================================================================
-- Checkout Widgets, Distributions, and Anonymous Sessions
-- =====================================================================================
-- Introduces metadata-backed CheckoutWidget, public CheckoutWidgetDistribution,
-- and ephemeral CheckoutSession entities for the embeddable checkout edge.
--
-- Adds Origin and SourceCheckoutWidgetID to OrderHeader to distinguish widget-originated
-- orders from staff/API orders.
-- =====================================================================================

-- 1. CheckoutWidget
IF OBJECT_ID('[__mj_BizAppsOrders].[CheckoutWidget]', 'U') IS NULL
BEGIN
    CREATE TABLE [__mj_BizAppsOrders].[CheckoutWidget] (
        [ID]                     UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_CheckoutWidget_ID] DEFAULT (newsequentialid()),
        [Name]                   NVARCHAR(100)    NOT NULL,
        [Description]            NVARCHAR(MAX)    NULL,
        [CompanyID]              UNIQUEIDENTIFIER NOT NULL,
        [Status]                 NVARCHAR(20)     NOT NULL CONSTRAINT [DF_CheckoutWidget_Status] DEFAULT (N'Draft'),
        [Configuration]          NVARCHAR(MAX)    NULL,
        [CustomCSS]              NVARCHAR(MAX)    NULL,
        [CustomJS]               NVARCHAR(MAX)    NULL,
        [__mj_CreatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_CheckoutWidget___mj_CreatedAt] DEFAULT (sysdatetimeoffset()),
        [__mj_UpdatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_CheckoutWidget___mj_UpdatedAt] DEFAULT (sysdatetimeoffset()),

        CONSTRAINT [PK_CheckoutWidget] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [FK_CheckoutWidget_Company] FOREIGN KEY ([CompanyID])
            REFERENCES [__mj].[Company]([ID]),
        CONSTRAINT [CK_CheckoutWidget_Status] CHECK ([Status] IN (N'Draft', N'Active', N'Disabled'))
    );
END
GO

-- 2. CheckoutWidgetDistribution
IF OBJECT_ID('[__mj_BizAppsOrders].[CheckoutWidgetDistribution]', 'U') IS NULL
BEGIN
    CREATE TABLE [__mj_BizAppsOrders].[CheckoutWidgetDistribution] (
        [ID]                     UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_CheckoutWidgetDistribution_ID] DEFAULT (newsequentialid()),
        [CheckoutWidgetID]       UNIQUEIDENTIFIER NOT NULL,
        [Slug]                   NVARCHAR(255)    NOT NULL,
        [MagicLinkInviteID]      UNIQUEIDENTIFIER NULL,
        [Status]                 NVARCHAR(20)     NOT NULL CONSTRAINT [DF_CheckoutWidgetDistribution_Status] DEFAULT (N'Active'),
        [RevokedAt]              DATETIMEOFFSET   NULL,
        [RevocationReason]       NVARCHAR(500)    NULL,
        [EmbedSnippet]           NVARCHAR(MAX)    NULL,
        [__mj_CreatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_CheckoutWidgetDistribution___mj_CreatedAt] DEFAULT (sysdatetimeoffset()),
        [__mj_UpdatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_CheckoutWidgetDistribution___mj_UpdatedAt] DEFAULT (sysdatetimeoffset()),

        CONSTRAINT [PK_CheckoutWidgetDistribution] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [UQ_CheckoutWidgetDistribution_Slug] UNIQUE ([Slug]),
        CONSTRAINT [FK_CheckoutWidgetDistribution_Widget] FOREIGN KEY ([CheckoutWidgetID])
            REFERENCES [__mj_BizAppsOrders].[CheckoutWidget]([ID]),
        CONSTRAINT [FK_CheckoutWidgetDistribution_MagicLinkInvite] FOREIGN KEY ([MagicLinkInviteID])
            REFERENCES [__mj].[MagicLinkInvite]([ID]),
        CONSTRAINT [CK_CheckoutWidgetDistribution_Status] CHECK ([Status] IN (N'Active', N'Revoked'))
    );
END
GO

-- 3. CheckoutSession
IF OBJECT_ID('[__mj_BizAppsOrders].[CheckoutSession]', 'U') IS NULL
BEGIN
    CREATE TABLE [__mj_BizAppsOrders].[CheckoutSession] (
        [ID]                     UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_CheckoutSession_ID] DEFAULT (newsequentialid()),
        [CheckoutWidgetID]       UNIQUEIDENTIFIER NOT NULL,
        [DistributionID]         UNIQUEIDENTIFIER NULL,
        [ClientSessionKey]       NVARCHAR(100)    NOT NULL,
        [Email]                  NVARCHAR(255)    NULL,
        [PersonID]               UNIQUEIDENTIFIER NULL,
        [DraftOrderID]           UNIQUEIDENTIFIER NULL,
        [PaymentIntentID]        UNIQUEIDENTIFIER NULL,
        [Status]                 NVARCHAR(20)     NOT NULL CONSTRAINT [DF_CheckoutSession_Status] DEFAULT (N'Open'),
        [ExpiresAt]              DATETIMEOFFSET   NOT NULL,
        [MetadataJSON]           NVARCHAR(MAX)    NULL,
        [__mj_CreatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_CheckoutSession___mj_CreatedAt] DEFAULT (sysdatetimeoffset()),
        [__mj_UpdatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_CheckoutSession___mj_UpdatedAt] DEFAULT (sysdatetimeoffset()),

        CONSTRAINT [PK_CheckoutSession] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [FK_CheckoutSession_Widget] FOREIGN KEY ([CheckoutWidgetID])
            REFERENCES [__mj_BizAppsOrders].[CheckoutWidget]([ID]),
        CONSTRAINT [FK_CheckoutSession_Distribution] FOREIGN KEY ([DistributionID])
            REFERENCES [__mj_BizAppsOrders].[CheckoutWidgetDistribution]([ID]),
        CONSTRAINT [FK_CheckoutSession_Person] FOREIGN KEY ([PersonID])
            REFERENCES [__mj_BizAppsCommon].[Person]([ID]),
        CONSTRAINT [FK_CheckoutSession_OrderHeader] FOREIGN KEY ([DraftOrderID])
            REFERENCES [__mj_BizAppsOrders].[OrderHeader]([ID]),
        CONSTRAINT [FK_CheckoutSession_PaymentIntent] FOREIGN KEY ([PaymentIntentID])
            REFERENCES [__mj_BizAppsOrders].[PaymentIntent]([ID]),
        CONSTRAINT [CK_CheckoutSession_Status] CHECK ([Status] IN (N'Open', N'Processing', N'Confirmed', N'Abandoned', N'Expired'))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CheckoutSession_ClientSessionKey_Status' AND object_id = OBJECT_ID('[__mj_BizAppsOrders].[CheckoutSession]'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_CheckoutSession_ClientSessionKey_Status]
        ON [__mj_BizAppsOrders].[CheckoutSession]([ClientSessionKey], [Status]);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CheckoutSession_CheckoutWidgetID_Status' AND object_id = OBJECT_ID('[__mj_BizAppsOrders].[CheckoutSession]'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_CheckoutSession_CheckoutWidgetID_Status]
        ON [__mj_BizAppsOrders].[CheckoutSession]([CheckoutWidgetID], [Status]);
END
GO

-- 4. OrderHeader extensions
IF COL_LENGTH('__mj_BizAppsOrders.OrderHeader', 'Origin') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[OrderHeader]
        ADD [Origin] NVARCHAR(50) NOT NULL CONSTRAINT [DF_OrderHeader_Origin] DEFAULT (N'Direct');
END
GO

IF COL_LENGTH('__mj_BizAppsOrders.OrderHeader', 'SourceCheckoutWidgetID') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[OrderHeader]
        ADD [SourceCheckoutWidgetID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_OrderHeader_CheckoutWidget] FOREIGN KEY REFERENCES [__mj_BizAppsOrders].[CheckoutWidget]([ID]);
END
GO

-- -------------------------------------------------------------------------------------
-- Extended Properties
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Metadata configuration for an embeddable checkout widget instance. Specifies selling company, product lines, layout rules, theme variables, and security policies.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'CheckoutWidget';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Public distribution endpoint for a CheckoutWidget, wrapping an anonymous scoped magic link invite and vanity slug with instant revocation capability.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'CheckoutWidgetDistribution';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Server-side state tracking for an anonymous or authenticated checkout attempt, linking client session key to draft orders and payment intents.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'CheckoutSession';
GO

















































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Orders: Checkout Widgets */

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
         'cc67c1c1-7a85-4342-ada2-82fddde138ee',
         'MJ_BizApps_Orders: Checkout Widgets',
         'Checkout Widgets',
         'Metadata configuration for an embeddable checkout widget instance. Specifies selling company, product lines, layout rules, theme variables, and security policies.',
         NULL,
         'CheckoutWidget',
         'vwCheckoutWidgets',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Checkout Widgets to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'cc67c1c1-7a85-4342-ada2-82fddde138ee', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Checkout Widgets for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cc67c1c1-7a85-4342-ada2-82fddde138ee', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Checkout Widgets for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cc67c1c1-7a85-4342-ada2-82fddde138ee', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Checkout Widgets for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cc67c1c1-7a85-4342-ada2-82fddde138ee', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Orders: Checkout Widget Distributions */

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
         '1669524b-bd0b-41ce-9ac5-93f3d6f8db7a',
         'MJ_BizApps_Orders: Checkout Widget Distributions',
         'Checkout Widget Distributions',
         'Public distribution endpoint for a CheckoutWidget, wrapping an anonymous scoped magic link invite and vanity slug with instant revocation capability.',
         NULL,
         'CheckoutWidgetDistribution',
         'vwCheckoutWidgetDistributions',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Checkout Widget Distributions to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '1669524b-bd0b-41ce-9ac5-93f3d6f8db7a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Checkout Widget Distributions for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1669524b-bd0b-41ce-9ac5-93f3d6f8db7a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Checkout Widget Distributions for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1669524b-bd0b-41ce-9ac5-93f3d6f8db7a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Checkout Widget Distributions for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1669524b-bd0b-41ce-9ac5-93f3d6f8db7a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Orders: Checkout Sessions */

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
         'c2f418c4-8239-4486-b036-0bc4eae4d24e',
         'MJ_BizApps_Orders: Checkout Sessions',
         'Checkout Sessions',
         'Server-side state tracking for an anonymous or authenticated checkout attempt, linking client session key to draft orders and payment intents.',
         NULL,
         'CheckoutSession',
         'vwCheckoutSessions',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Checkout Sessions to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'c2f418c4-8239-4486-b036-0bc4eae4d24e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Checkout Sessions for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c2f418c4-8239-4486-b036-0bc4eae4d24e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Checkout Sessions for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c2f418c4-8239-4486-b036-0bc4eae4d24e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Checkout Sessions for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c2f418c4-8239-4486-b036-0bc4eae4d24e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsCommittees,${mjSchema}_BizAppsSecureMessaging';

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CheckoutSession */
DECLARE @constraintName NVARCHAR(255);

SELECT @constraintName = d.name
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}'
AND t.name = 'CheckoutSession'
AND c.name = '__mj_CreatedAt';

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[CheckoutSession] DROP CONSTRAINT ' + @constraintName);
END;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CheckoutSession */
ALTER TABLE [${flyway:defaultSchema}].[CheckoutSession] ADD CONSTRAINT [DF___mj_BizAppsOrders_CheckoutSession___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CheckoutSession */
DECLARE @constraintName NVARCHAR(255);

SELECT @constraintName = d.name
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}'
AND t.name = 'CheckoutSession'
AND c.name = '__mj_UpdatedAt';

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[CheckoutSession] DROP CONSTRAINT ' + @constraintName);
END;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CheckoutSession */
ALTER TABLE [${flyway:defaultSchema}].[CheckoutSession] ADD CONSTRAINT [DF___mj_BizAppsOrders_CheckoutSession___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CheckoutWidget */
DECLARE @constraintName NVARCHAR(255);

SELECT @constraintName = d.name
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}'
AND t.name = 'CheckoutWidget'
AND c.name = '__mj_CreatedAt';

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[CheckoutWidget] DROP CONSTRAINT ' + @constraintName);
END;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CheckoutWidget */
ALTER TABLE [${flyway:defaultSchema}].[CheckoutWidget] ADD CONSTRAINT [DF___mj_BizAppsOrders_CheckoutWidget___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CheckoutWidget */
DECLARE @constraintName NVARCHAR(255);

SELECT @constraintName = d.name
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}'
AND t.name = 'CheckoutWidget'
AND c.name = '__mj_UpdatedAt';

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[CheckoutWidget] DROP CONSTRAINT ' + @constraintName);
END;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CheckoutWidget */
ALTER TABLE [${flyway:defaultSchema}].[CheckoutWidget] ADD CONSTRAINT [DF___mj_BizAppsOrders_CheckoutWidget___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CheckoutWidgetDistribution */
DECLARE @constraintName NVARCHAR(255);

SELECT @constraintName = d.name
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}'
AND t.name = 'CheckoutWidgetDistribution'
AND c.name = '__mj_CreatedAt';

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[CheckoutWidgetDistribution] DROP CONSTRAINT ' + @constraintName);
END;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CheckoutWidgetDistribution */
ALTER TABLE [${flyway:defaultSchema}].[CheckoutWidgetDistribution] ADD CONSTRAINT [DF___mj_BizAppsOrders_CheckoutWidgetDistribution___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CheckoutWidgetDistribution */
DECLARE @constraintName NVARCHAR(255);

SELECT @constraintName = d.name
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}'
AND t.name = 'CheckoutWidgetDistribution'
AND c.name = '__mj_UpdatedAt';

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[CheckoutWidgetDistribution] DROP CONSTRAINT ' + @constraintName);
END;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CheckoutWidgetDistribution */
ALTER TABLE [${flyway:defaultSchema}].[CheckoutWidgetDistribution] ADD CONSTRAINT [DF___mj_BizAppsOrders_CheckoutWidgetDistribution___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];

/* SQL text to insert 35 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '93826808-278b-4b1c-8aed-4fb1aad8cad0' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'ID')) BEGIN
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
            '93826808-278b-4b1c-8aed-4fb1aad8cad0',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1517ccb9-df12-4cde-97ed-cafa81ae6740' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'CheckoutWidgetID')) BEGIN
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
            '1517ccb9-df12-4cde-97ed-cafa81ae6740',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 2,
            'CheckoutWidgetID',
            'Checkout Widget ID',
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
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'aafc239e-b376-4bdb-b986-1f03242f89b3' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'DistributionID')) BEGIN
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
            'aafc239e-b376-4bdb-b986-1f03242f89b3',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 3,
            'DistributionID',
            'Distribution ID',
            NULL,
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
            '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3697e76f-d0e3-4c29-9b30-bc6b6a716415' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'ClientSessionKey')) BEGIN
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
            '3697e76f-d0e3-4c29-9b30-bc6b6a716415',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 4,
            'ClientSessionKey',
            'Client Session Key',
            NULL,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'af065da5-e102-47bc-ab9d-f385907162a3' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'Email')) BEGIN
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
            'af065da5-e102-47bc-ab9d-f385907162a3',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 5,
            'Email',
            'Email',
            NULL,
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7356a873-5e65-4dfb-8c3f-7f33ceb09ad9' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'PersonID')) BEGIN
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
            '7356a873-5e65-4dfb-8c3f-7f33ceb09ad9',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 6,
            'PersonID',
            'Person ID',
            NULL,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '71f2b4a3-da78-416d-80de-10cce8aecc99' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'DraftOrderID')) BEGIN
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
            '71f2b4a3-da78-416d-80de-10cce8aecc99',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 7,
            'DraftOrderID',
            'Draft Order ID',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '288c4ae5-236b-4255-8f5a-6ac066bbad86' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'PaymentIntentID')) BEGIN
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
            '288c4ae5-236b-4255-8f5a-6ac066bbad86',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 8,
            'PaymentIntentID',
            'Payment Intent ID',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '823ebb60-20f6-49ed-afce-805f0ea9e715' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'Status')) BEGIN
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
            '823ebb60-20f6-49ed-afce-805f0ea9e715',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 9,
            'Status',
            'Status',
            NULL,
            'nvarchar',
            40,
            0,
            0,
            0,
            'Open',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '587061bd-2cec-4632-a0f5-56efe59c7e22' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'ExpiresAt')) BEGIN
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
            '587061bd-2cec-4632-a0f5-56efe59c7e22',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 10,
            'ExpiresAt',
            'Expires At',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '44532023-ece5-43bf-b661-339759952587' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'MetadataJSON')) BEGIN
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
            '44532023-ece5-43bf-b661-339759952587',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 11,
            'MetadataJSON',
            'Metadata JSON',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c0fdfd2c-f698-47b2-8542-778193aae8be' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = '__mj_CreatedAt')) BEGIN
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
            'c0fdfd2c-f698-47b2-8542-778193aae8be',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 12,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '158bf59f-1ae9-4834-be4e-d74cf625b86d' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '158bf59f-1ae9-4834-be4e-d74cf625b86d',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 13,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8d7be84e-b659-40a9-ba13-6e2ba67a2c4c' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = 'Origin')) BEGIN
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
            '8d7be84e-b659-40a9-ba13-6e2ba67a2c4c',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B') + 35,
            'Origin',
            'Origin',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'Direct',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8950ccfc-62ac-4ec5-818f-79a693f64b22' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = 'SourceCheckoutWidgetID')) BEGIN
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
            '8950ccfc-62ac-4ec5-818f-79a693f64b22',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B') + 36,
            'SourceCheckoutWidgetID',
            'Source Checkout Widget ID',
            NULL,
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
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bc69e71f-6662-4354-8246-238a1e0019bf' OR (EntityID = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE' AND Name = 'ID')) BEGIN
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
            'bc69e71f-6662-4354-8246-238a1e0019bf',
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', -- Entity: MJ_BizApps_Orders: Checkout Widgets
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd78ec519-d7ff-4cc2-b4ba-be4813f6be84' OR (EntityID = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE' AND Name = 'Name')) BEGIN
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
            'd78ec519-d7ff-4cc2-b4ba-be4813f6be84',
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', -- Entity: MJ_BizApps_Orders: Checkout Widgets
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE') + 2,
            'Name',
            'Name',
            NULL,
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
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '846e2235-db8e-4569-ada6-b85abfa8d0b4' OR (EntityID = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE' AND Name = 'Description')) BEGIN
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
            '846e2235-db8e-4569-ada6-b85abfa8d0b4',
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', -- Entity: MJ_BizApps_Orders: Checkout Widgets
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE') + 3,
            'Description',
            'Description',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ccd8e741-390b-419b-96ac-44846b5e2313' OR (EntityID = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE' AND Name = 'CompanyID')) BEGIN
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
            'ccd8e741-390b-419b-96ac-44846b5e2313',
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', -- Entity: MJ_BizApps_Orders: Checkout Widgets
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE') + 4,
            'CompanyID',
            'Company ID',
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
            'D4238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fd3c0816-de9b-4917-a4b6-79ba623e424e' OR (EntityID = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE' AND Name = 'Status')) BEGIN
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
            'fd3c0816-de9b-4917-a4b6-79ba623e424e',
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', -- Entity: MJ_BizApps_Orders: Checkout Widgets
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE') + 5,
            'Status',
            'Status',
            NULL,
            'nvarchar',
            40,
            0,
            0,
            0,
            'Draft',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '26ae0f68-b8eb-4ea6-8e1b-092c97e0fef3' OR (EntityID = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE' AND Name = 'Configuration')) BEGIN
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
            '26ae0f68-b8eb-4ea6-8e1b-092c97e0fef3',
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', -- Entity: MJ_BizApps_Orders: Checkout Widgets
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE') + 6,
            'Configuration',
            'Configuration',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'dc778073-da9c-4562-ae4f-ed1022eb7b0e' OR (EntityID = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE' AND Name = 'CustomCSS')) BEGIN
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
            'dc778073-da9c-4562-ae4f-ed1022eb7b0e',
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', -- Entity: MJ_BizApps_Orders: Checkout Widgets
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE') + 7,
            'CustomCSS',
            'Custom CSS',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c4d79df8-b1e9-4afa-8da6-d2d7fc98ab1c' OR (EntityID = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE' AND Name = 'CustomJS')) BEGIN
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
            'c4d79df8-b1e9-4afa-8da6-d2d7fc98ab1c',
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', -- Entity: MJ_BizApps_Orders: Checkout Widgets
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE') + 8,
            'CustomJS',
            'Custom JS',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b8c0f3a4-4850-427d-92f7-773b26d3d482' OR (EntityID = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE' AND Name = '__mj_CreatedAt')) BEGIN
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
            'b8c0f3a4-4850-427d-92f7-773b26d3d482',
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', -- Entity: MJ_BizApps_Orders: Checkout Widgets
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE') + 9,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6f06a872-b33c-461e-b69a-b10258dcaabe' OR (EntityID = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '6f06a872-b33c-461e-b69a-b10258dcaabe',
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', -- Entity: MJ_BizApps_Orders: Checkout Widgets
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE') + 10,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd5472478-fca9-4ec2-b22a-d9d504cdbd4e' OR (EntityID = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A' AND Name = 'ID')) BEGIN
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
            'd5472478-fca9-4ec2-b22a-d9d504cdbd4e',
            '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', -- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd94503ee-a4e0-43d2-8b00-46be65c031b9' OR (EntityID = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A' AND Name = 'CheckoutWidgetID')) BEGIN
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
            'd94503ee-a4e0-43d2-8b00-46be65c031b9',
            '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', -- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A') + 2,
            'CheckoutWidgetID',
            'Checkout Widget ID',
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
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c7389584-15b6-4b84-ab23-44c92ab838b5' OR (EntityID = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A' AND Name = 'Slug')) BEGIN
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
            'c7389584-15b6-4b84-ab23-44c92ab838b5',
            '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', -- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A') + 3,
            'Slug',
            'Slug',
            NULL,
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2be7be95-f324-4441-92bb-6009907417a1' OR (EntityID = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A' AND Name = 'MagicLinkInviteID')) BEGIN
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
            '2be7be95-f324-4441-92bb-6009907417a1',
            '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', -- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A') + 4,
            'MagicLinkInviteID',
            'Magic Link Invite ID',
            NULL,
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
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5e447721-46ff-4e66-83b8-41cf888d58e0' OR (EntityID = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A' AND Name = 'Status')) BEGIN
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
            '5e447721-46ff-4e66-83b8-41cf888d58e0',
            '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', -- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A') + 5,
            'Status',
            'Status',
            NULL,
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e1ccef7a-0818-4bcc-9341-15370a38ea90' OR (EntityID = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A' AND Name = 'RevokedAt')) BEGIN
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
            'e1ccef7a-0818-4bcc-9341-15370a38ea90',
            '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', -- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A') + 6,
            'RevokedAt',
            'Revoked At',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0c535e75-02ba-4742-8cc6-35a77e225c09' OR (EntityID = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A' AND Name = 'RevocationReason')) BEGIN
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
            '0c535e75-02ba-4742-8cc6-35a77e225c09',
            '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', -- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A') + 7,
            'RevocationReason',
            'Revocation Reason',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '77878c88-1fe4-4a7e-bf2e-7246e7a74f09' OR (EntityID = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A' AND Name = 'EmbedSnippet')) BEGIN
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
            '77878c88-1fe4-4a7e-bf2e-7246e7a74f09',
            '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', -- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A') + 8,
            'EmbedSnippet',
            'Embed Snippet',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '983abc20-7c6c-4e67-aa4b-2abf4b58fb78' OR (EntityID = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A' AND Name = '__mj_CreatedAt')) BEGIN
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
            '983abc20-7c6c-4e67-aa4b-2abf4b58fb78',
            '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', -- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A') + 9,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0bf1f537-43c1-4919-be88-ce0950194f76' OR (EntityID = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '0bf1f537-43c1-4919-be88-ce0950194f76',
            '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', -- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A') + 10,
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

/* SQL text to update existing entity fields from schema */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsCommittees,${mjSchema}_BizAppsSecureMessaging';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsCommittees,${mjSchema}_BizAppsSecureMessaging';

/* SQL text to insert entity field value with ID 135403bc-19f7-4c20-afe3-2c450dc43db2 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('135403bc-19f7-4c20-afe3-2c450dc43db2', 'FD3C0816-DE9B-4917-A4B6-79BA623E424E', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 34281422-bea7-4f16-9d20-eaa89dc75d67 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('34281422-bea7-4f16-9d20-eaa89dc75d67', 'FD3C0816-DE9B-4917-A4B6-79BA623E424E', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a6a523eb-a5c1-45cf-9704-f02a95df6199 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a6a523eb-a5c1-45cf-9704-f02a95df6199', 'FD3C0816-DE9B-4917-A4B6-79BA623E424E', 3, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID FD3C0816-DE9B-4917-A4B6-79BA623E424E */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='FD3C0816-DE9B-4917-A4B6-79BA623E424E';

/* SQL text to insert entity field value with ID 3a25e8a5-be01-4aaf-bf47-580eaa1a90a6 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3a25e8a5-be01-4aaf-bf47-580eaa1a90a6', '5E447721-46FF-4E66-83B8-41CF888D58E0', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6e46983c-b106-456f-ba2e-7742338713eb */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6e46983c-b106-456f-ba2e-7742338713eb', '5E447721-46FF-4E66-83B8-41CF888D58E0', 2, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5E447721-46FF-4E66-83B8-41CF888D58E0 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='5E447721-46FF-4E66-83B8-41CF888D58E0';

/* SQL text to insert entity field value with ID 6112f2e5-f056-4cc6-897d-df14ad6a473e */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6112f2e5-f056-4cc6-897d-df14ad6a473e', '823EBB60-20F6-49ED-AFCE-805F0EA9E715', 1, 'Abandoned', 'Abandoned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 838a25e7-ce95-4805-ab77-0af026a7c7dd */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('838a25e7-ce95-4805-ab77-0af026a7c7dd', '823EBB60-20F6-49ED-AFCE-805F0EA9E715', 2, 'Confirmed', 'Confirmed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2f1035af-94ea-4c1e-9be2-37a1f0b5c2d9 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2f1035af-94ea-4c1e-9be2-37a1f0b5c2d9', '823EBB60-20F6-49ED-AFCE-805F0EA9E715', 3, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f4e2e851-6cdd-423e-90bd-c63324036d71 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f4e2e851-6cdd-423e-90bd-c63324036d71', '823EBB60-20F6-49ED-AFCE-805F0EA9E715', 4, 'Open', 'Open', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 52333379-0d6a-47bf-8f63-93ea82ea7f5f */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('52333379-0d6a-47bf-8f63-93ea82ea7f5f', '823EBB60-20F6-49ED-AFCE-805F0EA9E715', 5, 'Processing', 'Processing', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 823EBB60-20F6-49ED-AFCE-805F0EA9E715 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='823EBB60-20F6-49ED-AFCE-805F0EA9E715';


/* Create Entity Relationship: MJ_BizApps_Orders: Order Headers -> MJ_BizApps_Orders: Checkout Sessions (One To Many via DraftOrderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '2f9d7709-3468-4516-9cb7-906859177cde'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2f9d7709-3468-4516-9cb7-906859177cde', 'FC529BC8-FF09-44A9-B454-26EAFDAC791B', 'C2F418C4-8239-4486-B036-0BC4EAE4D24E', 'DraftOrderID', 'One To Many', 1, 1, 10, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Companies -> MJ_BizApps_Orders: Checkout Widgets (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '8d76016f-864e-4ae0-a2e3-3b37740480e4'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8d76016f-864e-4ae0-a2e3-3b37740480e4', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', 'CompanyID', 'One To Many', 1, 1, 27, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Checkout Widgets -> MJ_BizApps_Orders: Checkout Sessions (One To Many via CheckoutWidgetID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '8fd70927-56b1-41e7-83ff-7ed093a788a1'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8fd70927-56b1-41e7-83ff-7ed093a788a1', 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', 'C2F418C4-8239-4486-B036-0BC4EAE4D24E', 'CheckoutWidgetID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Orders: Checkout Widgets -> MJ_BizApps_Orders: Order Headers (One To Many via SourceCheckoutWidgetID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'c7abf113-490d-4f28-beed-125117be376c'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c7abf113-490d-4f28-beed-125117be376c', 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', 'FC529BC8-FF09-44A9-B454-26EAFDAC791B', 'SourceCheckoutWidgetID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Checkout Widgets -> MJ_BizApps_Orders: Checkout Widget Distributions (One To Many via CheckoutWidgetID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'e43d013b-df11-43e5-81bf-75790dd2be15'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e43d013b-df11-43e5-81bf-75790dd2be15', 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', 'CheckoutWidgetID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Orders: Checkout Widget Distributions -> MJ_BizApps_Orders: Checkout Sessions (One To Many via DistributionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '6dfa0509-deeb-4507-929c-4676dbe32c9a'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6dfa0509-deeb-4507-929c-4676dbe32c9a', '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', 'C2F418C4-8239-4486-B036-0BC4EAE4D24E', 'DistributionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Orders: Payment Intents -> MJ_BizApps_Orders: Checkout Sessions (One To Many via PaymentIntentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'a5655ced-c201-43aa-8043-c464d66c4155'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a5655ced-c201-43aa-8043-c464d66c4155', '7D7C4D5F-E410-4803-9762-A060C536C098', 'C2F418C4-8239-4486-B036-0BC4EAE4D24E', 'PaymentIntentID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Magic Link Invites -> MJ_BizApps_Orders: Checkout Widget Distributions (One To Many via MagicLinkInviteID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'fdc45a9e-07bd-49f8-9586-0b2dbdf5185a'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fdc45a9e-07bd-49f8-9586-0b2dbdf5185a', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', 'MagicLinkInviteID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Common: People -> MJ_BizApps_Orders: Checkout Sessions (One To Many via PersonID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'b0f19ca1-0665-4361-a36b-7e167630c2c2'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b0f19ca1-0665-4361-a36b-7e167630c2c2', '7A94ADA9-7880-4FAE-97D8-DB0E934C3F5F', 'C2F418C4-8239-4486-B036-0BC4EAE4D24E', 'PersonID', 'One To Many', 1, 1, 25, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsCommittees,${mjSchema}_BizAppsSecureMessaging';

/* Index for Foreign Keys for CheckoutSession */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Sessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CheckoutWidgetID in table CheckoutSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutSession_CheckoutWidgetID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutSession_CheckoutWidgetID ON [${flyway:defaultSchema}].[CheckoutSession] ([CheckoutWidgetID]);

-- Index for foreign key DistributionID in table CheckoutSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutSession_DistributionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutSession_DistributionID ON [${flyway:defaultSchema}].[CheckoutSession] ([DistributionID]);

-- Index for foreign key PersonID in table CheckoutSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutSession_PersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutSession_PersonID ON [${flyway:defaultSchema}].[CheckoutSession] ([PersonID]);

-- Index for foreign key DraftOrderID in table CheckoutSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutSession_DraftOrderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutSession_DraftOrderID ON [${flyway:defaultSchema}].[CheckoutSession] ([DraftOrderID]);

-- Index for foreign key PaymentIntentID in table CheckoutSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutSession_PaymentIntentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutSession_PaymentIntentID ON [${flyway:defaultSchema}].[CheckoutSession] ([PaymentIntentID]);

/* SQL text to update entity field related entity name field map for entity field ID 1517CCB9-DF12-4CDE-97ED-CAFA81AE6740 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1517CCB9-DF12-4CDE-97ED-CAFA81AE6740', @RelatedEntityNameFieldMap='CheckoutWidget';

/* Index for Foreign Keys for CheckoutWidgetDistribution */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CheckoutWidgetID in table CheckoutWidgetDistribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutWidgetDistribution_CheckoutWidgetID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutWidgetDistribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutWidgetDistribution_CheckoutWidgetID ON [${flyway:defaultSchema}].[CheckoutWidgetDistribution] ([CheckoutWidgetID]);

-- Index for foreign key MagicLinkInviteID in table CheckoutWidgetDistribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutWidgetDistribution_MagicLinkInviteID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutWidgetDistribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutWidgetDistribution_MagicLinkInviteID ON [${flyway:defaultSchema}].[CheckoutWidgetDistribution] ([MagicLinkInviteID]);

/* SQL text to update entity field related entity name field map for entity field ID D94503EE-A4E0-43D2-8B00-46BE65C031B9 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D94503EE-A4E0-43D2-8B00-46BE65C031B9', @RelatedEntityNameFieldMap='CheckoutWidget';

/* Index for Foreign Keys for CheckoutWidget */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Widgets
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table CheckoutWidget
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutWidget_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutWidget]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutWidget_CompanyID ON [${flyway:defaultSchema}].[CheckoutWidget] ([CompanyID]);

/* SQL text to update entity field related entity name field map for entity field ID CCD8E741-390B-419B-96AC-44846B5E2313 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CCD8E741-390B-419B-96AC-44846B5E2313', @RelatedEntityNameFieldMap='Company';

/* SQL text to update entity field related entity name field map for entity field ID 7356A873-5E65-4DFB-8C3F-7F33CEB09AD9 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7356A873-5E65-4DFB-8C3F-7F33CEB09AD9', @RelatedEntityNameFieldMap='Person';

/* Base View SQL for MJ_BizApps_Orders: Checkout Widgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Widgets
-- Item: vwCheckoutWidgets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Checkout Widgets
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CheckoutWidget
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCheckoutWidgets]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCheckoutWidgets];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCheckoutWidgets]
AS
SELECT
    c.*,
    MJCompany_CompanyID.[Name] AS [Company]
FROM
    [${flyway:defaultSchema}].[CheckoutWidget] AS c
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [c].[CompanyID] = MJCompany_CompanyID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCheckoutWidgets] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Checkout Widgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Widgets
-- Item: Permissions for vwCheckoutWidgets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCheckoutWidgets] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Checkout Widgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Widgets
-- Item: spCreateCheckoutWidget
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CheckoutWidget
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCheckoutWidget]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCheckoutWidget];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCheckoutWidget]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CompanyID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @CustomCSS_Clear bit = 0,
    @CustomCSS nvarchar(MAX) = NULL,
    @CustomJS_Clear bit = 0,
    @CustomJS nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CheckoutWidget]
            (
                [ID],
                [Name],
                [Description],
                [CompanyID],
                [Status],
                [Configuration],
                [CustomCSS],
                [CustomJS]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @CompanyID,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @CustomCSS_Clear = 1 THEN NULL ELSE ISNULL(@CustomCSS, NULL) END,
                CASE WHEN @CustomJS_Clear = 1 THEN NULL ELSE ISNULL(@CustomJS, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CheckoutWidget]
            (
                [Name],
                [Description],
                [CompanyID],
                [Status],
                [Configuration],
                [CustomCSS],
                [CustomJS]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @CompanyID,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @CustomCSS_Clear = 1 THEN NULL ELSE ISNULL(@CustomCSS, NULL) END,
                CASE WHEN @CustomJS_Clear = 1 THEN NULL ELSE ISNULL(@CustomJS, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCheckoutWidgets] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCheckoutWidget] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Checkout Widgets */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCheckoutWidget] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Checkout Widgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Widgets
-- Item: spUpdateCheckoutWidget
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CheckoutWidget
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCheckoutWidget]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCheckoutWidget];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCheckoutWidget]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CompanyID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @CustomCSS_Clear bit = 0,
    @CustomCSS nvarchar(MAX) = NULL,
    @CustomJS_Clear bit = 0,
    @CustomJS nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CheckoutWidget]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [Status] = ISNULL(@Status, [Status]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [CustomCSS] = CASE WHEN @CustomCSS_Clear = 1 THEN NULL ELSE ISNULL(@CustomCSS, [CustomCSS]) END,
        [CustomJS] = CASE WHEN @CustomJS_Clear = 1 THEN NULL ELSE ISNULL(@CustomJS, [CustomJS]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCheckoutWidgets] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCheckoutWidgets]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutWidget] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CheckoutWidget table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCheckoutWidget]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCheckoutWidget];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCheckoutWidget
ON [${flyway:defaultSchema}].[CheckoutWidget]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CheckoutWidget]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CheckoutWidget] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Checkout Widgets */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutWidget] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Checkout Widgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Widgets
-- Item: spDeleteCheckoutWidget
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CheckoutWidget
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCheckoutWidget]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCheckoutWidget];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCheckoutWidget]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CheckoutWidget]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCheckoutWidget] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Checkout Widgets */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCheckoutWidget] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Checkout Widget Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
-- Item: vwCheckoutWidgetDistributions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Checkout Widget Distributions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CheckoutWidgetDistribution
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCheckoutWidgetDistributions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCheckoutWidgetDistributions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCheckoutWidgetDistributions]
AS
SELECT
    c.*,
    mjBizAppsOrdersCheckoutWidget_CheckoutWidgetID.[Name] AS [CheckoutWidget]
FROM
    [${flyway:defaultSchema}].[CheckoutWidgetDistribution] AS c
INNER JOIN
    [${flyway:defaultSchema}].[CheckoutWidget] AS mjBizAppsOrdersCheckoutWidget_CheckoutWidgetID
  ON
    [c].[CheckoutWidgetID] = mjBizAppsOrdersCheckoutWidget_CheckoutWidgetID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCheckoutWidgetDistributions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Checkout Widget Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
-- Item: Permissions for vwCheckoutWidgetDistributions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCheckoutWidgetDistributions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Checkout Widget Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
-- Item: spCreateCheckoutWidgetDistribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CheckoutWidgetDistribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCheckoutWidgetDistribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCheckoutWidgetDistribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCheckoutWidgetDistribution]
    @ID uniqueidentifier = NULL,
    @CheckoutWidgetID uniqueidentifier,
    @Slug nvarchar(255),
    @MagicLinkInviteID_Clear bit = 0,
    @MagicLinkInviteID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @RevokedAt_Clear bit = 0,
    @RevokedAt datetimeoffset = NULL,
    @RevocationReason_Clear bit = 0,
    @RevocationReason nvarchar(500) = NULL,
    @EmbedSnippet_Clear bit = 0,
    @EmbedSnippet nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CheckoutWidgetDistribution]
            (
                [ID],
                [CheckoutWidgetID],
                [Slug],
                [MagicLinkInviteID],
                [Status],
                [RevokedAt],
                [RevocationReason],
                [EmbedSnippet]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CheckoutWidgetID,
                @Slug,
                CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, NULL) END,
                CASE WHEN @RevocationReason_Clear = 1 THEN NULL ELSE ISNULL(@RevocationReason, NULL) END,
                CASE WHEN @EmbedSnippet_Clear = 1 THEN NULL ELSE ISNULL(@EmbedSnippet, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CheckoutWidgetDistribution]
            (
                [CheckoutWidgetID],
                [Slug],
                [MagicLinkInviteID],
                [Status],
                [RevokedAt],
                [RevocationReason],
                [EmbedSnippet]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CheckoutWidgetID,
                @Slug,
                CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, NULL) END,
                CASE WHEN @RevocationReason_Clear = 1 THEN NULL ELSE ISNULL(@RevocationReason, NULL) END,
                CASE WHEN @EmbedSnippet_Clear = 1 THEN NULL ELSE ISNULL(@EmbedSnippet, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCheckoutWidgetDistributions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCheckoutWidgetDistribution] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Checkout Widget Distributions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCheckoutWidgetDistribution] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Checkout Widget Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
-- Item: spUpdateCheckoutWidgetDistribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CheckoutWidgetDistribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCheckoutWidgetDistribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCheckoutWidgetDistribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCheckoutWidgetDistribution]
    @ID uniqueidentifier,
    @CheckoutWidgetID uniqueidentifier = NULL,
    @Slug nvarchar(255) = NULL,
    @MagicLinkInviteID_Clear bit = 0,
    @MagicLinkInviteID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @RevokedAt_Clear bit = 0,
    @RevokedAt datetimeoffset = NULL,
    @RevocationReason_Clear bit = 0,
    @RevocationReason nvarchar(500) = NULL,
    @EmbedSnippet_Clear bit = 0,
    @EmbedSnippet nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CheckoutWidgetDistribution]
    SET
        [CheckoutWidgetID] = ISNULL(@CheckoutWidgetID, [CheckoutWidgetID]),
        [Slug] = ISNULL(@Slug, [Slug]),
        [MagicLinkInviteID] = CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, [MagicLinkInviteID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [RevokedAt] = CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, [RevokedAt]) END,
        [RevocationReason] = CASE WHEN @RevocationReason_Clear = 1 THEN NULL ELSE ISNULL(@RevocationReason, [RevocationReason]) END,
        [EmbedSnippet] = CASE WHEN @EmbedSnippet_Clear = 1 THEN NULL ELSE ISNULL(@EmbedSnippet, [EmbedSnippet]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCheckoutWidgetDistributions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCheckoutWidgetDistributions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutWidgetDistribution] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CheckoutWidgetDistribution table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCheckoutWidgetDistribution]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCheckoutWidgetDistribution];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCheckoutWidgetDistribution
ON [${flyway:defaultSchema}].[CheckoutWidgetDistribution]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CheckoutWidgetDistribution]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CheckoutWidgetDistribution] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Checkout Widget Distributions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutWidgetDistribution] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Checkout Widget Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
-- Item: spDeleteCheckoutWidgetDistribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CheckoutWidgetDistribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCheckoutWidgetDistribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCheckoutWidgetDistribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCheckoutWidgetDistribution]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CheckoutWidgetDistribution]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCheckoutWidgetDistribution] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Checkout Widget Distributions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCheckoutWidgetDistribution] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 71F2B4A3-DA78-416D-80DE-10CCE8AECC99 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='71F2B4A3-DA78-416D-80DE-10CCE8AECC99', @RelatedEntityNameFieldMap='DraftOrder';

/* SQL text to update entity field related entity name field map for entity field ID 288C4AE5-236B-4255-8F5A-6AC066BBAD86 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='288C4AE5-236B-4255-8F5A-6AC066BBAD86', @RelatedEntityNameFieldMap='PaymentIntent';

/* Base View SQL for MJ_BizApps_Orders: Checkout Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Sessions
-- Item: vwCheckoutSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Checkout Sessions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CheckoutSession
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCheckoutSessions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCheckoutSessions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCheckoutSessions]
AS
SELECT
    c.*,
    mjBizAppsOrdersCheckoutWidget_CheckoutWidgetID.[Name] AS [CheckoutWidget],
    mjBizAppsCommonPerson_PersonID.[DisplayName] AS [Person],
    mjBizAppsOrdersOrderHeader_DraftOrderID.[OrderNumber] AS [DraftOrder],
    mjBizAppsOrdersPaymentIntent_PaymentIntentID.[ProviderIntentID] AS [PaymentIntent]
FROM
    [${flyway:defaultSchema}].[CheckoutSession] AS c
INNER JOIN
    [${flyway:defaultSchema}].[CheckoutWidget] AS mjBizAppsOrdersCheckoutWidget_CheckoutWidgetID
  ON
    [c].[CheckoutWidgetID] = mjBizAppsOrdersCheckoutWidget_CheckoutWidgetID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_PersonID
  ON
    [c].[PersonID] = mjBizAppsCommonPerson_PersonID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_DraftOrderID
  ON
    [c].[DraftOrderID] = mjBizAppsOrdersOrderHeader_DraftOrderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentIntent] AS mjBizAppsOrdersPaymentIntent_PaymentIntentID
  ON
    [c].[PaymentIntentID] = mjBizAppsOrdersPaymentIntent_PaymentIntentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCheckoutSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Checkout Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Sessions
-- Item: Permissions for vwCheckoutSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCheckoutSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Checkout Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Sessions
-- Item: spCreateCheckoutSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CheckoutSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCheckoutSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCheckoutSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCheckoutSession]
    @ID uniqueidentifier = NULL,
    @CheckoutWidgetID uniqueidentifier,
    @DistributionID_Clear bit = 0,
    @DistributionID uniqueidentifier = NULL,
    @ClientSessionKey nvarchar(100),
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @PersonID_Clear bit = 0,
    @PersonID uniqueidentifier = NULL,
    @DraftOrderID_Clear bit = 0,
    @DraftOrderID uniqueidentifier = NULL,
    @PaymentIntentID_Clear bit = 0,
    @PaymentIntentID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ExpiresAt datetimeoffset,
    @MetadataJSON_Clear bit = 0,
    @MetadataJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CheckoutSession]
            (
                [ID],
                [CheckoutWidgetID],
                [DistributionID],
                [ClientSessionKey],
                [Email],
                [PersonID],
                [DraftOrderID],
                [PaymentIntentID],
                [Status],
                [ExpiresAt],
                [MetadataJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CheckoutWidgetID,
                CASE WHEN @DistributionID_Clear = 1 THEN NULL ELSE ISNULL(@DistributionID, NULL) END,
                @ClientSessionKey,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, NULL) END,
                CASE WHEN @DraftOrderID_Clear = 1 THEN NULL ELSE ISNULL(@DraftOrderID, NULL) END,
                CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, NULL) END,
                ISNULL(@Status, 'Open'),
                @ExpiresAt,
                CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CheckoutSession]
            (
                [CheckoutWidgetID],
                [DistributionID],
                [ClientSessionKey],
                [Email],
                [PersonID],
                [DraftOrderID],
                [PaymentIntentID],
                [Status],
                [ExpiresAt],
                [MetadataJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CheckoutWidgetID,
                CASE WHEN @DistributionID_Clear = 1 THEN NULL ELSE ISNULL(@DistributionID, NULL) END,
                @ClientSessionKey,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, NULL) END,
                CASE WHEN @DraftOrderID_Clear = 1 THEN NULL ELSE ISNULL(@DraftOrderID, NULL) END,
                CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, NULL) END,
                ISNULL(@Status, 'Open'),
                @ExpiresAt,
                CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCheckoutSessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCheckoutSession] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Checkout Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCheckoutSession] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Checkout Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Sessions
-- Item: spUpdateCheckoutSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CheckoutSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCheckoutSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCheckoutSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCheckoutSession]
    @ID uniqueidentifier,
    @CheckoutWidgetID uniqueidentifier = NULL,
    @DistributionID_Clear bit = 0,
    @DistributionID uniqueidentifier = NULL,
    @ClientSessionKey nvarchar(100) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @PersonID_Clear bit = 0,
    @PersonID uniqueidentifier = NULL,
    @DraftOrderID_Clear bit = 0,
    @DraftOrderID uniqueidentifier = NULL,
    @PaymentIntentID_Clear bit = 0,
    @PaymentIntentID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ExpiresAt datetimeoffset = NULL,
    @MetadataJSON_Clear bit = 0,
    @MetadataJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CheckoutSession]
    SET
        [CheckoutWidgetID] = ISNULL(@CheckoutWidgetID, [CheckoutWidgetID]),
        [DistributionID] = CASE WHEN @DistributionID_Clear = 1 THEN NULL ELSE ISNULL(@DistributionID, [DistributionID]) END,
        [ClientSessionKey] = ISNULL(@ClientSessionKey, [ClientSessionKey]),
        [Email] = CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, [Email]) END,
        [PersonID] = CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, [PersonID]) END,
        [DraftOrderID] = CASE WHEN @DraftOrderID_Clear = 1 THEN NULL ELSE ISNULL(@DraftOrderID, [DraftOrderID]) END,
        [PaymentIntentID] = CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, [PaymentIntentID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ExpiresAt] = ISNULL(@ExpiresAt, [ExpiresAt]),
        [MetadataJSON] = CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, [MetadataJSON]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCheckoutSessions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCheckoutSessions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutSession] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CheckoutSession table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCheckoutSession]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCheckoutSession];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCheckoutSession
ON [${flyway:defaultSchema}].[CheckoutSession]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CheckoutSession]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CheckoutSession] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Checkout Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Checkout Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Sessions
-- Item: spDeleteCheckoutSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CheckoutSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCheckoutSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCheckoutSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCheckoutSession]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CheckoutSession]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCheckoutSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Checkout Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCheckoutSession] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for OrderHeader */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_CompanyID ON [${flyway:defaultSchema}].[OrderHeader] ([CompanyID]);

-- Index for foreign key BillToPersonID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_BillToPersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_BillToPersonID ON [${flyway:defaultSchema}].[OrderHeader] ([BillToPersonID]);

-- Index for foreign key BillToOrganizationID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_BillToOrganizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_BillToOrganizationID ON [${flyway:defaultSchema}].[OrderHeader] ([BillToOrganizationID]);

-- Index for foreign key SalesRepUserID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_SalesRepUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_SalesRepUserID ON [${flyway:defaultSchema}].[OrderHeader] ([SalesRepUserID]);

-- Index for foreign key BillToAddressID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_BillToAddressID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_BillToAddressID ON [${flyway:defaultSchema}].[OrderHeader] ([BillToAddressID]);

-- Index for foreign key ShipToAddressID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_ShipToAddressID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_ShipToAddressID ON [${flyway:defaultSchema}].[OrderHeader] ([ShipToAddressID]);

-- Index for foreign key ShipToOrganizationID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_ShipToOrganizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_ShipToOrganizationID ON [${flyway:defaultSchema}].[OrderHeader] ([ShipToOrganizationID]);

-- Index for foreign key ShipToPersonID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_ShipToPersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_ShipToPersonID ON [${flyway:defaultSchema}].[OrderHeader] ([ShipToPersonID]);

-- Index for foreign key PaymentTermsTypeID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_PaymentTermsTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_PaymentTermsTypeID ON [${flyway:defaultSchema}].[OrderHeader] ([PaymentTermsTypeID]);

-- Index for foreign key InitialPaymentTypeID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_InitialPaymentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_InitialPaymentTypeID ON [${flyway:defaultSchema}].[OrderHeader] ([InitialPaymentTypeID]);

-- Index for foreign key InitialPaymentDetailID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_InitialPaymentDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_InitialPaymentDetailID ON [${flyway:defaultSchema}].[OrderHeader] ([InitialPaymentDetailID]);

-- Index for foreign key PostedByUserID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_PostedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_PostedByUserID ON [${flyway:defaultSchema}].[OrderHeader] ([PostedByUserID]);

-- Index for foreign key ReversesOrderHeaderID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_ReversesOrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_ReversesOrderHeaderID ON [${flyway:defaultSchema}].[OrderHeader] ([ReversesOrderHeaderID]);

-- Index for foreign key SourceCheckoutWidgetID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_SourceCheckoutWidgetID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_SourceCheckoutWidgetID ON [${flyway:defaultSchema}].[OrderHeader] ([SourceCheckoutWidgetID]);

/* SQL text to update entity field related entity name field map for entity field ID 8950CCFC-62AC-4EC5-818F-79A693F64B22 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8950CCFC-62AC-4EC5-818F-79A693F64B22', @RelatedEntityNameFieldMap='SourceCheckoutWidget';

/* Base View SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: vwOrderHeadersGenerated
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Headers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderHeader
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeadersGenerated]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderHeadersGenerated];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderHeadersGenerated]
AS
SELECT
    o.*,
    MJCompany_CompanyID.[Name] AS [Company],
    mjBizAppsCommonPerson_BillToPersonID.[DisplayName] AS [BillToPerson],
    mjBizAppsCommonOrganization_BillToOrganizationID.[Name] AS [BillToOrganization],
    MJUser_SalesRepUserID.[Name] AS [SalesRepUser],
    mjBizAppsCommonAddress_BillToAddressID.[Line1] AS [BillToAddress],
    mjBizAppsCommonAddress_ShipToAddressID.[Line1] AS [ShipToAddress],
    mjBizAppsCommonOrganization_ShipToOrganizationID.[Name] AS [ShipToOrganization],
    mjBizAppsCommonPerson_ShipToPersonID.[DisplayName] AS [ShipToPerson],
    mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID.[Name] AS [PaymentTermsType],
    mjBizAppsOrdersPaymentType_InitialPaymentTypeID.[Name] AS [InitialPaymentType],
    mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID.[Last4] AS [InitialPaymentDetail],
    MJUser_PostedByUserID.[Name] AS [PostedByUser],
    mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID.[OrderNumber] AS [ReversesOrderHeader],
    mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID.[Name] AS [SourceCheckoutWidget],
    ${mjSchema}_rgc.[Latitude] AS [${mjSchema}_Latitude],
    ${mjSchema}_rgc.[Longitude] AS [${mjSchema}_Longitude]
FROM
    [${flyway:defaultSchema}].[OrderHeader] AS o
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [o].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_BillToPersonID
  ON
    [o].[BillToPersonID] = mjBizAppsCommonPerson_BillToPersonID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_BillToOrganizationID
  ON
    [o].[BillToOrganizationID] = mjBizAppsCommonOrganization_BillToOrganizationID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_SalesRepUserID
  ON
    [o].[SalesRepUserID] = MJUser_SalesRepUserID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Address] AS mjBizAppsCommonAddress_BillToAddressID
  ON
    [o].[BillToAddressID] = mjBizAppsCommonAddress_BillToAddressID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Address] AS mjBizAppsCommonAddress_ShipToAddressID
  ON
    [o].[ShipToAddressID] = mjBizAppsCommonAddress_ShipToAddressID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_ShipToOrganizationID
  ON
    [o].[ShipToOrganizationID] = mjBizAppsCommonOrganization_ShipToOrganizationID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_ShipToPersonID
  ON
    [o].[ShipToPersonID] = mjBizAppsCommonPerson_ShipToPersonID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentTermsType] AS mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID
  ON
    [o].[PaymentTermsTypeID] = mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentType] AS mjBizAppsOrdersPaymentType_InitialPaymentTypeID
  ON
    [o].[InitialPaymentTypeID] = mjBizAppsOrdersPaymentType_InitialPaymentTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentDetail] AS mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID
  ON
    [o].[InitialPaymentDetailID] = mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_PostedByUserID
  ON
    [o].[PostedByUserID] = MJUser_PostedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID
  ON
    [o].[ReversesOrderHeaderID] = mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CheckoutWidget] AS mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID
  ON
    [o].[SourceCheckoutWidgetID] = mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[vwRecordGeoCodes] AS ${mjSchema}_rgc
  ON
    ${mjSchema}_rgc.[EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'
    AND ${mjSchema}_rgc.[RecordID] = CAST([o].[ID] AS NVARCHAR(450))
    AND ${mjSchema}_rgc.[LocationType] = 'Primary'
GO
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]';
END;

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: Permissions for vwOrderHeaders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]';
END;

/* spCreate SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: spCreateOrderHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderHeader
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderHeader]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderHeader];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderHeader]
    @ID uniqueidentifier = NULL,
    @OrderNumber nvarchar(40),
    @OrderType nvarchar(20) = NULL,
    @OrderDate date,
    @Status nvarchar(20) = NULL,
    @CompanyID uniqueidentifier,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @SalesRepUserID_Clear bit = 0,
    @SalesRepUserID uniqueidentifier = NULL,
    @BillToAddressID_Clear bit = 0,
    @BillToAddressID uniqueidentifier = NULL,
    @ShipToAddressID_Clear bit = 0,
    @ShipToAddressID uniqueidentifier = NULL,
    @ShipToOrganizationID_Clear bit = 0,
    @ShipToOrganizationID uniqueidentifier = NULL,
    @ShipToPersonID_Clear bit = 0,
    @ShipToPersonID uniqueidentifier = NULL,
    @PaymentTermsTypeID_Clear bit = 0,
    @PaymentTermsTypeID uniqueidentifier = NULL,
    @TotalGross_Clear bit = 0,
    @TotalGross decimal(18, 2) = NULL,
    @AmountPaid decimal(18, 2) = NULL,
    @Balance_Clear bit = 0,
    @Balance decimal(18, 2) = NULL,
    @DueDate_Clear bit = 0,
    @DueDate date = NULL,
    @PaymentStatus nvarchar(20) = NULL,
    @ExternalDocumentNumber_Clear bit = 0,
    @ExternalDocumentNumber nvarchar(80) = NULL,
    @InitialPaymentTypeID_Clear bit = 0,
    @InitialPaymentTypeID uniqueidentifier = NULL,
    @InitialPaymentAmount decimal(18, 2) = NULL,
    @InitialPaymentDetailID_Clear bit = 0,
    @InitialPaymentDetailID uniqueidentifier = NULL,
    @PostedAt_Clear bit = 0,
    @PostedAt datetimeoffset = NULL,
    @PostedByUserID_Clear bit = 0,
    @PostedByUserID uniqueidentifier = NULL,
    @ReversesOrderHeaderID_Clear bit = 0,
    @ReversesOrderHeaderID uniqueidentifier = NULL,
    @ReversalReason_Clear bit = 0,
    @ReversalReason nvarchar(MAX) = NULL,
    @RequestedDeliveryDate_Clear bit = 0,
    @RequestedDeliveryDate date = NULL,
    @ApprovalTaskID_Clear bit = 0,
    @ApprovalTaskID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @ConfirmedAt_Clear bit = 0,
    @ConfirmedAt datetimeoffset = NULL,
    @Origin nvarchar(50) = NULL,
    @SourceCheckoutWidgetID_Clear bit = 0,
    @SourceCheckoutWidgetID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderHeader]
            (
                [ID],
                [OrderNumber],
                [OrderType],
                [OrderDate],
                [Status],
                [CompanyID],
                [BillToPersonID],
                [BillToOrganizationID],
                [SalesRepUserID],
                [BillToAddressID],
                [ShipToAddressID],
                [ShipToOrganizationID],
                [ShipToPersonID],
                [PaymentTermsTypeID],
                [TotalGross],
                [AmountPaid],
                [Balance],
                [DueDate],
                [PaymentStatus],
                [ExternalDocumentNumber],
                [InitialPaymentTypeID],
                [InitialPaymentAmount],
                [InitialPaymentDetailID],
                [PostedAt],
                [PostedByUserID],
                [ReversesOrderHeaderID],
                [ReversalReason],
                [RequestedDeliveryDate],
                [ApprovalTaskID],
                [Description],
                [Notes],
                [ConfirmedAt],
                [Origin],
                [SourceCheckoutWidgetID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderNumber,
                ISNULL(@OrderType, 'Sale'),
                @OrderDate,
                ISNULL(@Status, 'Draft'),
                @CompanyID,
                CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, NULL) END,
                CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, NULL) END,
                CASE WHEN @SalesRepUserID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRepUserID, NULL) END,
                CASE WHEN @BillToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@BillToAddressID, NULL) END,
                CASE WHEN @ShipToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressID, NULL) END,
                CASE WHEN @ShipToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToOrganizationID, NULL) END,
                CASE WHEN @ShipToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToPersonID, NULL) END,
                CASE WHEN @PaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentTermsTypeID, NULL) END,
                CASE WHEN @TotalGross_Clear = 1 THEN NULL ELSE ISNULL(@TotalGross, NULL) END,
                ISNULL(@AmountPaid, 0),
                CASE WHEN @Balance_Clear = 1 THEN NULL ELSE ISNULL(@Balance, NULL) END,
                CASE WHEN @DueDate_Clear = 1 THEN NULL ELSE ISNULL(@DueDate, NULL) END,
                ISNULL(@PaymentStatus, 'Unpaid'),
                CASE WHEN @ExternalDocumentNumber_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDocumentNumber, NULL) END,
                CASE WHEN @InitialPaymentTypeID_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentTypeID, NULL) END,
                ISNULL(@InitialPaymentAmount, 0),
                CASE WHEN @InitialPaymentDetailID_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentDetailID, NULL) END,
                CASE WHEN @PostedAt_Clear = 1 THEN NULL ELSE ISNULL(@PostedAt, NULL) END,
                CASE WHEN @PostedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@PostedByUserID, NULL) END,
                CASE WHEN @ReversesOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesOrderHeaderID, NULL) END,
                CASE WHEN @ReversalReason_Clear = 1 THEN NULL ELSE ISNULL(@ReversalReason, NULL) END,
                CASE WHEN @RequestedDeliveryDate_Clear = 1 THEN NULL ELSE ISNULL(@RequestedDeliveryDate, NULL) END,
                CASE WHEN @ApprovalTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @ConfirmedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedAt, NULL) END,
                ISNULL(@Origin, 'Direct'),
                CASE WHEN @SourceCheckoutWidgetID_Clear = 1 THEN NULL ELSE ISNULL(@SourceCheckoutWidgetID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderHeader]
            (
                [OrderNumber],
                [OrderType],
                [OrderDate],
                [Status],
                [CompanyID],
                [BillToPersonID],
                [BillToOrganizationID],
                [SalesRepUserID],
                [BillToAddressID],
                [ShipToAddressID],
                [ShipToOrganizationID],
                [ShipToPersonID],
                [PaymentTermsTypeID],
                [TotalGross],
                [AmountPaid],
                [Balance],
                [DueDate],
                [PaymentStatus],
                [ExternalDocumentNumber],
                [InitialPaymentTypeID],
                [InitialPaymentAmount],
                [InitialPaymentDetailID],
                [PostedAt],
                [PostedByUserID],
                [ReversesOrderHeaderID],
                [ReversalReason],
                [RequestedDeliveryDate],
                [ApprovalTaskID],
                [Description],
                [Notes],
                [ConfirmedAt],
                [Origin],
                [SourceCheckoutWidgetID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderNumber,
                ISNULL(@OrderType, 'Sale'),
                @OrderDate,
                ISNULL(@Status, 'Draft'),
                @CompanyID,
                CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, NULL) END,
                CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, NULL) END,
                CASE WHEN @SalesRepUserID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRepUserID, NULL) END,
                CASE WHEN @BillToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@BillToAddressID, NULL) END,
                CASE WHEN @ShipToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressID, NULL) END,
                CASE WHEN @ShipToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToOrganizationID, NULL) END,
                CASE WHEN @ShipToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToPersonID, NULL) END,
                CASE WHEN @PaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentTermsTypeID, NULL) END,
                CASE WHEN @TotalGross_Clear = 1 THEN NULL ELSE ISNULL(@TotalGross, NULL) END,
                ISNULL(@AmountPaid, 0),
                CASE WHEN @Balance_Clear = 1 THEN NULL ELSE ISNULL(@Balance, NULL) END,
                CASE WHEN @DueDate_Clear = 1 THEN NULL ELSE ISNULL(@DueDate, NULL) END,
                ISNULL(@PaymentStatus, 'Unpaid'),
                CASE WHEN @ExternalDocumentNumber_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDocumentNumber, NULL) END,
                CASE WHEN @InitialPaymentTypeID_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentTypeID, NULL) END,
                ISNULL(@InitialPaymentAmount, 0),
                CASE WHEN @InitialPaymentDetailID_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentDetailID, NULL) END,
                CASE WHEN @PostedAt_Clear = 1 THEN NULL ELSE ISNULL(@PostedAt, NULL) END,
                CASE WHEN @PostedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@PostedByUserID, NULL) END,
                CASE WHEN @ReversesOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesOrderHeaderID, NULL) END,
                CASE WHEN @ReversalReason_Clear = 1 THEN NULL ELSE ISNULL(@ReversalReason, NULL) END,
                CASE WHEN @RequestedDeliveryDate_Clear = 1 THEN NULL ELSE ISNULL(@RequestedDeliveryDate, NULL) END,
                CASE WHEN @ApprovalTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @ConfirmedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedAt, NULL) END,
                ISNULL(@Origin, 'Direct'),
                CASE WHEN @SourceCheckoutWidgetID_Clear = 1 THEN NULL ELSE ISNULL(@SourceCheckoutWidgetID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderHeaders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderHeader] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Headers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderHeader] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: spUpdateOrderHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderHeader
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderHeader]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderHeader];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderHeader]
    @ID uniqueidentifier,
    @OrderNumber nvarchar(40) = NULL,
    @OrderType nvarchar(20) = NULL,
    @OrderDate date = NULL,
    @Status nvarchar(20) = NULL,
    @CompanyID uniqueidentifier = NULL,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @SalesRepUserID_Clear bit = 0,
    @SalesRepUserID uniqueidentifier = NULL,
    @BillToAddressID_Clear bit = 0,
    @BillToAddressID uniqueidentifier = NULL,
    @ShipToAddressID_Clear bit = 0,
    @ShipToAddressID uniqueidentifier = NULL,
    @ShipToOrganizationID_Clear bit = 0,
    @ShipToOrganizationID uniqueidentifier = NULL,
    @ShipToPersonID_Clear bit = 0,
    @ShipToPersonID uniqueidentifier = NULL,
    @PaymentTermsTypeID_Clear bit = 0,
    @PaymentTermsTypeID uniqueidentifier = NULL,
    @TotalGross_Clear bit = 0,
    @TotalGross decimal(18, 2) = NULL,
    @AmountPaid decimal(18, 2) = NULL,
    @Balance_Clear bit = 0,
    @Balance decimal(18, 2) = NULL,
    @DueDate_Clear bit = 0,
    @DueDate date = NULL,
    @PaymentStatus nvarchar(20) = NULL,
    @ExternalDocumentNumber_Clear bit = 0,
    @ExternalDocumentNumber nvarchar(80) = NULL,
    @InitialPaymentTypeID_Clear bit = 0,
    @InitialPaymentTypeID uniqueidentifier = NULL,
    @InitialPaymentAmount decimal(18, 2) = NULL,
    @InitialPaymentDetailID_Clear bit = 0,
    @InitialPaymentDetailID uniqueidentifier = NULL,
    @PostedAt_Clear bit = 0,
    @PostedAt datetimeoffset = NULL,
    @PostedByUserID_Clear bit = 0,
    @PostedByUserID uniqueidentifier = NULL,
    @ReversesOrderHeaderID_Clear bit = 0,
    @ReversesOrderHeaderID uniqueidentifier = NULL,
    @ReversalReason_Clear bit = 0,
    @ReversalReason nvarchar(MAX) = NULL,
    @RequestedDeliveryDate_Clear bit = 0,
    @RequestedDeliveryDate date = NULL,
    @ApprovalTaskID_Clear bit = 0,
    @ApprovalTaskID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @ConfirmedAt_Clear bit = 0,
    @ConfirmedAt datetimeoffset = NULL,
    @Origin nvarchar(50) = NULL,
    @SourceCheckoutWidgetID_Clear bit = 0,
    @SourceCheckoutWidgetID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderHeader]
    SET
        [OrderNumber] = ISNULL(@OrderNumber, [OrderNumber]),
        [OrderType] = ISNULL(@OrderType, [OrderType]),
        [OrderDate] = ISNULL(@OrderDate, [OrderDate]),
        [Status] = ISNULL(@Status, [Status]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [BillToPersonID] = CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, [BillToPersonID]) END,
        [BillToOrganizationID] = CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, [BillToOrganizationID]) END,
        [SalesRepUserID] = CASE WHEN @SalesRepUserID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRepUserID, [SalesRepUserID]) END,
        [BillToAddressID] = CASE WHEN @BillToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@BillToAddressID, [BillToAddressID]) END,
        [ShipToAddressID] = CASE WHEN @ShipToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressID, [ShipToAddressID]) END,
        [ShipToOrganizationID] = CASE WHEN @ShipToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToOrganizationID, [ShipToOrganizationID]) END,
        [ShipToPersonID] = CASE WHEN @ShipToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToPersonID, [ShipToPersonID]) END,
        [PaymentTermsTypeID] = CASE WHEN @PaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentTermsTypeID, [PaymentTermsTypeID]) END,
        [TotalGross] = CASE WHEN @TotalGross_Clear = 1 THEN NULL ELSE ISNULL(@TotalGross, [TotalGross]) END,
        [AmountPaid] = ISNULL(@AmountPaid, [AmountPaid]),
        [Balance] = CASE WHEN @Balance_Clear = 1 THEN NULL ELSE ISNULL(@Balance, [Balance]) END,
        [DueDate] = CASE WHEN @DueDate_Clear = 1 THEN NULL ELSE ISNULL(@DueDate, [DueDate]) END,
        [PaymentStatus] = ISNULL(@PaymentStatus, [PaymentStatus]),
        [ExternalDocumentNumber] = CASE WHEN @ExternalDocumentNumber_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDocumentNumber, [ExternalDocumentNumber]) END,
        [InitialPaymentTypeID] = CASE WHEN @InitialPaymentTypeID_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentTypeID, [InitialPaymentTypeID]) END,
        [InitialPaymentAmount] = ISNULL(@InitialPaymentAmount, [InitialPaymentAmount]),
        [InitialPaymentDetailID] = CASE WHEN @InitialPaymentDetailID_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentDetailID, [InitialPaymentDetailID]) END,
        [PostedAt] = CASE WHEN @PostedAt_Clear = 1 THEN NULL ELSE ISNULL(@PostedAt, [PostedAt]) END,
        [PostedByUserID] = CASE WHEN @PostedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@PostedByUserID, [PostedByUserID]) END,
        [ReversesOrderHeaderID] = CASE WHEN @ReversesOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesOrderHeaderID, [ReversesOrderHeaderID]) END,
        [ReversalReason] = CASE WHEN @ReversalReason_Clear = 1 THEN NULL ELSE ISNULL(@ReversalReason, [ReversalReason]) END,
        [RequestedDeliveryDate] = CASE WHEN @RequestedDeliveryDate_Clear = 1 THEN NULL ELSE ISNULL(@RequestedDeliveryDate, [RequestedDeliveryDate]) END,
        [ApprovalTaskID] = CASE WHEN @ApprovalTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskID, [ApprovalTaskID]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END,
        [ConfirmedAt] = CASE WHEN @ConfirmedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedAt, [ConfirmedAt]) END,
        [Origin] = ISNULL(@Origin, [Origin]),
        [SourceCheckoutWidgetID] = CASE WHEN @SourceCheckoutWidgetID_Clear = 1 THEN NULL ELSE ISNULL(@SourceCheckoutWidgetID, [SourceCheckoutWidgetID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderHeaders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderHeaders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderHeader] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderHeader table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderHeader]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderHeader];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderHeader
ON [${flyway:defaultSchema}].[OrderHeader]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderHeader]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderHeader] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Headers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderHeader] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: spDeleteOrderHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderHeader
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderHeader]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderHeader];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderHeader]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderHeader]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderHeader] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Headers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderHeader] TO [cdp_Developer], [cdp_Integration];

/* SQL text to delete unneeded entity fields (4 scoped entities) */
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsCommittees,${mjSchema}_BizAppsSecureMessaging', @EntityIDs='CC67C1C1-7A85-4342-ADA2-82FDDDE138EE,1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A,C2F418C4-8239-4486-B036-0BC4EAE4D24E,FC529BC8-FF09-44A9-B454-26EAFDAC791B';

/* SQL text to insert 6 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ac58fbc0-c6e8-497c-9c8e-68dfd441a3a9' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'CheckoutWidget')) BEGIN
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
            'ac58fbc0-c6e8-497c-9c8e-68dfd441a3a9',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 14,
            'CheckoutWidget',
            'Checkout Widget',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3a4b8ae8-13f2-4179-af2e-d71e76eba7ac' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'Person')) BEGIN
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
            '3a4b8ae8-13f2-4179-af2e-d71e76eba7ac',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 15,
            'Person',
            'Person',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '12c32e4f-4b50-41f1-9ecf-c2adc89205a7' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'DraftOrder')) BEGIN
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
            '12c32e4f-4b50-41f1-9ecf-c2adc89205a7',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 16,
            'DraftOrder',
            'Draft Order',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f501fca4-ea01-4cc1-9a33-5ab33264a86c' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'PaymentIntent')) BEGIN
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
            'f501fca4-ea01-4cc1-9a33-5ab33264a86c',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 17,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'de54aa82-c170-4e38-a6f1-f7be3b4ef0ba' OR (EntityID = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE' AND Name = 'Company')) BEGIN
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
            'de54aa82-c170-4e38-a6f1-f7be3b4ef0ba',
            'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', -- Entity: MJ_BizApps_Orders: Checkout Widgets
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE') + 11,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b416642e-9e70-4d9a-ab2a-7c31016a9deb' OR (EntityID = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A' AND Name = 'CheckoutWidget')) BEGIN
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
            'b416642e-9e70-4d9a-ab2a-7c31016a9deb',
            '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', -- Entity: MJ_BizApps_Orders: Checkout Widget Distributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A') + 11,
            'CheckoutWidget',
            'Checkout Widget',
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

/* SQL text to update existing entity fields from schema (4 scoped entities) */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsCommittees,${mjSchema}_BizAppsSecureMessaging', @EntityIDs='CC67C1C1-7A85-4342-ADA2-82FDDDE138EE,1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A,C2F418C4-8239-4486-B036-0BC4EAE4D24E,FC529BC8-FF09-44A9-B454-26EAFDAC791B';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsCommittees,${mjSchema}_BizAppsSecureMessaging';

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'C7389584-15B6-4B84-AB23-44C92AB838B5'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C7389584-15B6-4B84-AB23-44C92AB838B5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5E447721-46FF-4E66-83B8-41CF888D58E0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '983ABC20-7C6C-4E67-AA4B-2ABF4B58FB78'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B416642E-9E70-4D9A-AB2A-7C31016A9DEB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C7389584-15B6-4B84-AB23-44C92AB838B5'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'C7389584-15B6-4B84-AB23-44C92AB838B5'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FD3C0816-DE9B-4917-A4B6-79BA623E424E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6F06A872-B33C-461E-B69A-B10258DCAABE'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DE54AA82-C170-4E38-A6F1-F7BE3B4EF0BA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'D78EC519-D7FF-4CC2-B4BA-BE4813F6BE84'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '3697E76F-D0E3-4C29-9B30-BC6B6A716415'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3697E76F-D0E3-4C29-9B30-BC6B6A716415'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AF065DA5-E102-47BC-AB9D-F385907162A3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '823EBB60-20F6-49ED-AFCE-805F0EA9E715'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '587061BD-2CEC-4632-A0F5-56EFE59C7E22'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C0FDFD2C-F698-47B2-8542-778193AAE8BE'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3697E76F-D0E3-4C29-9B30-BC6B6A716415'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AF065DA5-E102-47BC-AB9D-F385907162A3'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '3697E76F-D0E3-4C29-9B30-BC6B6A716415'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'AF065DA5-E102-47BC-AB9D-F385907162A3'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widget Distributions.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D5472478-FCA9-4EC2-B22A-D9D504CDBD4E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widget Distributions.CheckoutWidgetID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Distribution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Checkout Widget',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D94503EE-A4E0-43D2-8B00-46BE65C031B9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widget Distributions.CheckoutWidget 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Distribution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Checkout Widget Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B416642E-9E70-4D9A-AB2A-7C31016A9DEB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widget Distributions.Slug 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Distribution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Vanity Slug',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C7389584-15B6-4B84-AB23-44C92AB838B5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widget Distributions.MagicLinkInviteID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Distribution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Magic Link Invite',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2BE7BE95-F324-4441-92BB-6009907417A1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widget Distributions.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Lifecycle Management',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5E447721-46FF-4E66-83B8-41CF888D58E0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widget Distributions.RevokedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Lifecycle Management',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1CCEF7A-0818-4BCC-9341-15370A38EA90' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widget Distributions.RevocationReason 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Lifecycle Management',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C535E75-02BA-4742-8CC6-35A77E225C09' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widget Distributions.EmbedSnippet 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Integration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'HTML'
WHERE 
   ID = '77878C88-1FE4-4A7E-BF2E-7246E7A74F09' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widget Distributions.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '983ABC20-7C6C-4E67-AA4B-2ABF4B58FB78' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widget Distributions.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0BF1F537-43C1-4919-BE88-CE0950194F76' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-share-alt */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-share-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ecb4ccfa-574f-4dec-bb43-91fb7f0b77fc', '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', 'FieldCategoryInfo', '{"Distribution Details":{"icon":"fa fa-info-circle","description":"Core identifiers and configuration for the checkout widget distribution"},"Lifecycle Management":{"icon":"fa fa-power-off","description":"Information regarding the current status and revocation history"},"Integration":{"icon":"fa fa-code","description":"Technical integration assets for embedding the widget"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('23cd5aa4-120f-428b-888d-5a7b395e8b7e', '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A', 'FieldCategoryIcons', '{"Distribution Details":"fa fa-info-circle","Lifecycle Management":"fa fa-power-off","Integration":"fa fa-code","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '1669524B-BD0B-41CE-9AC5-93F3D6F8DB7A';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widgets.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC69E71F-6662-4354-8246-238A1E0019BF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widgets.Name 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Widget Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D78EC519-D7FF-4CC2-B4BA-BE4813F6BE84' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widgets.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Widget Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '846E2235-DB8E-4569-ADA6-B85ABFA8D0B4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widgets.CompanyID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Widget Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CCD8E741-390B-419B-96AC-44846B5E2313' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widgets.Company 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Widget Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DE54AA82-C170-4E38-A6F1-F7BE3B4EF0BA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widgets.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Widget Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD3C0816-DE9B-4917-A4B6-79BA623E424E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widgets.Configuration 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Customization and Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '26AE0F68-B8EB-4EA6-8E1B-092C97E0FEF3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widgets.CustomCSS 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Customization and Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'CSS'
WHERE 
   ID = 'DC778073-DA9C-4562-AE4F-ED1022EB7B0E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widgets.CustomJS 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Customization and Logic',
   GeneratedFormSection = 'Category',
   DisplayName = 'Custom JavaScript',
   ExtendedType = 'Code',
   CodeType = 'JavaScript'
WHERE 
   ID = 'C4D79DF8-B1E9-4AFA-8DA6-D2D7FC98AB1C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widgets.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B8C0F3A4-4850-427D-92F7-773B26D3D482' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Widgets.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6F06A872-B33C-461E-B69A-B10258DCAABE' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-shopping-cart */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-shopping-cart', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c2388590-d613-4907-8bf8-d9709f68d0a8', 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', 'FieldCategoryInfo', '{"Widget Configuration":{"icon":"fa fa-sliders-h","description":"General settings and identification for the checkout widget instance"},"Customization and Logic":{"icon":"fa fa-code","description":"Advanced configuration, custom styles, and script logic"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('29e2817e-37fc-4163-b1c1-41a400887e31', 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE', 'FieldCategoryIcons', '{"Widget Configuration":"fa fa-sliders-h","Customization and Logic":"fa fa-code","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'CC67C1C1-7A85-4342-ADA2-82FDDDE138EE';

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '93826808-278B-4B1C-8AED-4FB1AAD8CAD0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.CheckoutWidgetID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Checkout Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1517CCB9-DF12-4CDE-97ED-CAFA81AE6740' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.CheckoutWidget 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Checkout Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AC58FBC0-C6E8-497C-9C8E-68DFD441A3A9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.DistributionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Checkout Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AAFC239E-B376-4BDB-B986-1F03242F89B3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.ClientSessionKey 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Session Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3697E76F-D0E3-4C29-9B30-BC6B6A716415' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Session Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '823EBB60-20F6-49ED-AFCE-805F0EA9E715' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.ExpiresAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Session Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '587061BD-2CEC-4632-A0F5-56EFE59C7E22' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.Email 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Customer Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = 'AF065DA5-E102-47BC-AB9D-F385907162A3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.PersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Customer Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7356A873-5E65-4DFB-8C3F-7F33CEB09AD9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.Person 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Customer Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A4B8AE8-13F2-4179-AF2E-D71E76EBA7AC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.DraftOrderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Order and Payment',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '71F2B4A3-DA78-416D-80DE-10CCE8AECC99' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.DraftOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Order and Payment',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '12C32E4F-4B50-41F1-9ECF-C2ADC89205A7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.PaymentIntentID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Order and Payment',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '288C4AE5-236B-4255-8F5A-6AC066BBAD86' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.PaymentIntent 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Order and Payment',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F501FCA4-EA01-4CC1-9A33-5AB33264A86C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.MetadataJSON 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '44532023-ECE5-43BF-B661-339759952587' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C0FDFD2C-F698-47B2-8542-778193AAE8BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '158BF59F-1AE9-4834-BE4E-D74CF625B86D' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-shopping-bag */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-shopping-bag', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('d019a069-b7c8-411e-ad06-a90c7b166a3b', 'C2F418C4-8239-4486-B036-0BC4EAE4D24E', 'FieldCategoryInfo', '{"Checkout Configuration":{"icon":"fa fa-sliders-h","description":"Configuration settings for the checkout widget and distribution"},"Session Information":{"icon":"fa fa-clock","description":"Details regarding the active checkout session and its status"},"Customer Information":{"icon":"fa fa-user","description":"Information related to the customer attempting the checkout"},"Order and Payment":{"icon":"fa fa-credit-card","description":"Links to draft orders and payment intent tracking"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('dadb3ae0-a81e-4e6e-bfa5-81ec75cedffd', 'C2F418C4-8239-4486-B036-0BC4EAE4D24E', 'FieldCategoryIcons', '{"Checkout Configuration":"fa fa-sliders-h","Session Information":"fa fa-clock","Customer Information":"fa fa-user","Order and Payment":"fa fa-credit-card","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E';

/* Set categories for 52 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '142D7CE2-5C12-4A68-B7CC-797CBDA164C1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '84775F2D-188C-456A-BCA2-EEA35D5FA43A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B996B6F-9D47-4EC7-8052-83E346703058' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.${mjSchema}_Latitude 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoLatitude',
   CodeType = NULL
WHERE 
   ID = '538B312C-A6AD-48C6-A14C-80F7E7F50083' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.${mjSchema}_Longitude 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoLongitude',
   CodeType = NULL
WHERE 
   ID = '6608ACE8-21F5-4DCF-A2FB-0D8B315FBE9B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.OrderNumber 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '37ED0567-5213-4E33-9123-C88CF3E9A851' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.OrderType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C7C1BD22-6968-499B-9FFA-1931BEB97C0C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.OrderDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '41E3A5E2-F717-4220-AC33-8ABC132F8DD0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DFCEE14E-6200-4025-BF35-06E5A2FDDD8A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.CompanyID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '197A4A78-E556-465F-9B0E-FE0F68653B48' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ExternalDocumentNumber 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9BAFC41D-971D-471E-8613-51A4B801C7D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C69830AE-9EA4-48B1-9945-A05330D2DA28' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.Notes 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D0DA714F-FFE7-423E-ABB1-7CE8C45E0678' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.Company 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '54079149-DE80-4CEE-B857-AE5ADFFD41A6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.Origin 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Order Identification',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8D7BE84E-B659-40A9-BA13-6E2BA67A2C4C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.SourceCheckoutWidgetID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Order Identification',
   GeneratedFormSection = 'Category',
   DisplayName = 'Checkout Widget',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8950CCFC-62AC-4EC5-818F-79A693F64B22' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToPersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D0979EC-2802-4928-BD90-44FB6D6600D1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToOrganizationID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BEF24C48-4C7A-452B-BC9A-3BBCD887FC3E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.SalesRepUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '74C76DB8-0C37-4595-A951-6CD5935AAE2A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToPerson 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1ACD14D9-6F12-4283-BBC3-B766EA19648B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToOrganization 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '08B057B1-867E-4C67-B315-16949250187E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.SalesRepUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0F46D44-A139-4CBB-8737-8265D5052238' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToAddressID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4BA3B34B-6F09-44B9-A7E8-B6F56623A616' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToAddressID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7861C923-978D-4255-A7CB-FC5512BEFB32' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToOrganizationID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '756D6DD7-DE28-4ED6-87E9-368F97EAABA0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToPersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7C38B1D8-4DBC-4AC8-81D8-28358F36CE69' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.RequestedDeliveryDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8712EDC9-85C4-44A4-952C-A1FCDEF9CA53' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToAddress 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Billing Address Details',
   ExtendedType = 'GeoAddress',
   CodeType = NULL
WHERE 
   ID = 'A5A7DFCD-E18F-4D44-800D-52CE4339331E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToAddress 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Shipping Address Details',
   ExtendedType = 'GeoAddress',
   CodeType = NULL
WHERE 
   ID = 'A60F3EE4-CDFB-411D-84AA-821FDFC51138' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToOrganization 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1A791B97-599C-437C-9921-4029F59A4B0D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToPerson 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E69B1F32-0F13-49AF-B708-7BE54EBFEAB8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PaymentTermsTypeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C161939B-87E8-4435-A0B0-E5E38CD87E2B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.TotalGross 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7AEB02A2-1574-4FC4-ADF1-299328154295' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.AmountPaid 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '72D27F1D-B828-435B-87D4-31068B3CF518' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.Balance 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B66538B2-A77C-4B69-9B58-30D0D2016CC4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.DueDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '91DC0304-93EE-48A0-B77C-9F3945F8B4F8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PaymentStatus 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3B0238E-9B79-4AA6-98E1-B1EBD5E697ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentTypeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '65D58799-EB69-401E-8F7F-9C803CD620A2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentAmount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8B137EE1-FA08-498E-A222-EAABBE9B79D0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentDetailID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC65F413-7292-4064-A090-AF80299179DB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PaymentTermsType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Payment Terms Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '295A4FC0-4CA3-4FB2-A5C5-2F07F6DB58AC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADA5CE2D-FA56-41C5-B840-A42F65D55A5D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentDetail 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CF4CE14A-2F21-40A1-9C1D-47E967102C15' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.IsOverdue 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6652803C-6884-407D-9581-E04047EB978A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PostedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C8D32A33-B85D-4B11-BAE6-D4F0B1BAEC99' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PostedByUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Posted By User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DEE309B1-B116-4BB3-8F07-48F29E6E0C19' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ReversesOrderHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B2A17E9-D329-4F98-8553-49A3222BB5AF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ReversalReason 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '23D1E09A-DEF7-4BFF-B7F9-7C2CF9E1C9FE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ApprovalTaskID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '74D1CA28-83A1-44C0-8E7E-CED44F0F60D0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ConfirmedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '565015DD-BE0A-4024-BF1F-6CB2A147A5C9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PostedByUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Posted By User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DBBF93F-3FF6-40BD-8729-2B0C5B69CB43' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ReversesOrderHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C516B593-8828-431D-B100-C39F840D0C15' AND AutoUpdateCategory = 1;

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwOrderHeadersGenerated';
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'EXEC sp_refreshview ''${flyway:defaultSchema}.vwOrderHeaders'';';
END;
