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
