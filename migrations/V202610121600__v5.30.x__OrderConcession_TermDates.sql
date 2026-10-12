-- =============================================================================
-- V202610121600 — Shifting or shortening a booked term (#507)
-- =============================================================================
-- An amendment could only move a booked term's end later (a Duration concession).
-- Moving its start and end together (a shift) or giving the customer less time (a
-- shortening) had no record to carry it, so both were corrected by hand.
--
-- What this file does, in order:
--   1. OrderConcession gains two delivery forms, Shift and Shorten, and the term's
--      dates before and after the change. A Shift moves start and end by the same
--      number of days. A Shorten starts no earlier and ends no later than before.
--      The dates are recorded only on those two forms.
--   2. SubscriptionEvent gains two event types, Rescheduled and Shortened, logged
--      when an approved Shift or Shorten is applied to its term.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. OrderConcession: the Shift and Shorten forms
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD
    [PriorStartDate] DATE NULL,
    [PriorEndDate] DATE NULL,
    [NewStartDate] DATE NULL,
    [NewEndDate] DATE NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] DROP CONSTRAINT [CK_OrderConcession_DeliveryForm];
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD CONSTRAINT [CK_OrderConcession_DeliveryForm]
    CHECK ([DeliveryForm] IN ('Price','Duration','Scope','Seats','Terms','Shift','Shorten'));
GO

-- A Shift or Shorten names its term and both pairs of dates. A Shift moves start and end by the same
-- non-zero number of days. A Shorten keeps the term inside its old dates and changes at least one of them.
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD CONSTRAINT [CK_OrderConcession_TermDates]
    CHECK (
        ([DeliveryForm] NOT IN ('Shift','Shorten')
            AND [PriorStartDate] IS NULL AND [PriorEndDate] IS NULL
            AND [NewStartDate] IS NULL AND [NewEndDate] IS NULL)
        OR ([DeliveryForm] IN ('Shift','Shorten')
            AND [SubscriptionTermID] IS NOT NULL
            AND [PriorStartDate] IS NOT NULL AND [PriorEndDate] IS NOT NULL
            AND [NewStartDate] IS NOT NULL AND [NewEndDate] IS NOT NULL
            AND [NewEndDate] >= [NewStartDate]
            AND [AddedQuantity] IS NULL
            AND [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL
            AND (
                ([DeliveryForm] = 'Shift'
                    AND DATEDIFF(day, [PriorStartDate], [NewStartDate]) = DATEDIFF(day, [PriorEndDate], [NewEndDate])
                    AND [NewStartDate] <> [PriorStartDate])
                OR ([DeliveryForm] = 'Shorten'
                    AND [NewStartDate] >= [PriorStartDate]
                    AND [NewEndDate] <= [PriorEndDate]
                    AND ([NewStartDate] <> [PriorStartDate] OR [NewEndDate] <> [PriorEndDate]))
            ))
    );
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'How the value was given: Price (a lower price than the price engine''s), Duration (a term extended at no charge), Scope (a product added at no charge), Seats (quantity added at no charge), Terms (a confirmed order''s payment terms changed), Shift (a booked term''s start and end moved by the same number of days), Shorten (a booked term started later or ended earlier).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'DeliveryForm';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a Shift or Shorten concession, the term''s start date before the change.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'PriorStartDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a Shift or Shorten concession, the term''s end date before the change.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'PriorEndDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a Shift or Shorten concession, the term''s start date once it is approved and applied.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'NewStartDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a Shift or Shorten concession, the term''s end date once it is approved and applied.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'NewEndDate';
GO


-- -----------------------------------------------------------------------------
-- 2. SubscriptionEvent: Rescheduled and Shortened
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[SubscriptionEvent] DROP CONSTRAINT [CK_SubscriptionEvent_EventType];
GO

ALTER TABLE [${flyway:defaultSchema}].[SubscriptionEvent] ADD CONSTRAINT [CK_SubscriptionEvent_EventType]
    CHECK ([EventType] IN ('Created','Activated','TrialStarted','TrialEnded','PaymentSucceeded','PaymentFailed','Paused','Resumed','CancellationRequested','Canceled','Migrated','Extended','RenewalOrderSpawned','Rescheduled','Shortened'));
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above: the four new Order Concessions
-- date fields and their categories, the Shift and Shorten value-list values, the
-- Rescheduled and Shortened event types, FK indexes, vwOrderConcessions, CRUD procs,
-- permissions, and the validator for CK_OrderConcession_TermDates. Carved from the
-- run: the Order Headers view/CRUD regeneration (address geo-field drift), value
-- lists and validators CodeGen re-wrote for unrelated entities, re-written
-- validators for Order Concessions' existing constraints, and AI re-categorisation
-- of existing fields were left out.
-- =============================================================================


/* SQL text to insert 4 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4e66b734-3adf-4a0c-a6e4-334f3cb51d23' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'PriorStartDate')) BEGIN
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
            '4e66b734-3adf-4a0c-a6e4-334f3cb51d23',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'PriorStartDate',
            'Prior Start Date',
            'For a Shift or Shorten concession, the term''s start date before the change.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5018720f-c861-4d62-9843-c26856e2abe4' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'PriorEndDate')) BEGIN
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
            '5018720f-c861-4d62-9843-c26856e2abe4',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'PriorEndDate',
            'Prior End Date',
            'For a Shift or Shorten concession, the term''s end date before the change.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6b016df2-c805-41ab-9d10-389b15a40ff0' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'NewStartDate')) BEGIN
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
            '6b016df2-c805-41ab-9d10-389b15a40ff0',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'NewStartDate',
            'New Start Date',
            'For a Shift or Shorten concession, the term''s start date once it is approved and applied.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9e82c406-0561-4816-b656-b30966725506' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'NewEndDate')) BEGIN
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
            '9e82c406-0561-4816-b656-b30966725506',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'NewEndDate',
            'New End Date',
            'For a Shift or Shorten concession, the term''s end date once it is approved and applied.',
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

/* SQL text to insert entity field value with ID 1fae6d36-2850-4a3e-bd73-807aa6a19d2e */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1fae6d36-2850-4a3e-bd73-807aa6a19d2e', '8662A268-9580-42FD-9D59-A91BE9237AE9', 5, 'Shift', 'Shift', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 535fbb11-5225-441d-be52-51c789cf37d1 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('535fbb11-5225-441d-be52-51c789cf37d1', '8662A268-9580-42FD-9D59-A91BE9237AE9', 6, 'Shorten', 'Shorten', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=7 WHERE ID='C892EB79-8175-40E7-AA5D-28AC06C13214';

/* SQL text to insert entity field value with ID 8a0f6412-b6e5-4e65-b799-b46de71fa0be */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8a0f6412-b6e5-4e65-b799-b46de71fa0be', 'E2EDA043-B7D5-45C9-8606-AF585833EB10', 11, 'Rescheduled', 'Rescheduled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0bbb2c98-988a-4f07-8d32-4cfe3373a94e */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0bbb2c98-988a-4f07-8d32-4cfe3373a94e', 'E2EDA043-B7D5-45C9-8606-AF585833EB10', 13, 'Shortened', 'Shortened', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=12 WHERE ID='F51C8686-A10E-4655-A06C-466B469B89E6';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=14 WHERE ID='D9945CF3-A591-4C90-9384-287538F38E14';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=15 WHERE ID='8079E095-2576-49E6-8718-49D0AEC04981';

/* Index for Foreign Keys for OrderConcession */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderHeaderID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_OrderHeaderID ON [${flyway:defaultSchema}].[OrderConcession] ([OrderHeaderID]);

-- Index for foreign key OrderLineID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_OrderLineID ON [${flyway:defaultSchema}].[OrderConcession] ([OrderLineID]);

-- Index for foreign key SubscriptionTermID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_SubscriptionTermID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_SubscriptionTermID ON [${flyway:defaultSchema}].[OrderConcession] ([SubscriptionTermID]);

-- Index for foreign key RequestedByUserID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_RequestedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_RequestedByUserID ON [${flyway:defaultSchema}].[OrderConcession] ([RequestedByUserID]);

-- Index for foreign key AuthorizedBySalesAuthorityID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_AuthorizedBySalesAuthorityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_AuthorizedBySalesAuthorityID ON [${flyway:defaultSchema}].[OrderConcession] ([AuthorizedBySalesAuthorityID]);

-- Index for foreign key SalesRuleID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_SalesRuleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_SalesRuleID ON [${flyway:defaultSchema}].[OrderConcession] ([SalesRuleID]);

-- Index for foreign key DecidedByUserID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_DecidedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_DecidedByUserID ON [${flyway:defaultSchema}].[OrderConcession] ([DecidedByUserID]);

-- Index for foreign key PriorPaymentTermsTypeID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_PriorPaymentTermsTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_PriorPaymentTermsTypeID ON [${flyway:defaultSchema}].[OrderConcession] ([PriorPaymentTermsTypeID]);

-- Index for foreign key NewPaymentTermsTypeID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_NewPaymentTermsTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_NewPaymentTermsTypeID ON [${flyway:defaultSchema}].[OrderConcession] ([NewPaymentTermsTypeID]);

/* Base View SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: vwOrderConcessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Concessions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderConcession
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderConcessions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderConcessions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderConcessions]
AS
SELECT
    o.*,
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader],
    MJUser_RequestedByUserID.[Name] AS [RequestedByUser],
    mjBizAppsOrdersSalesRule_SalesRuleID.[Name] AS [SalesRule],
    MJUser_DecidedByUserID.[Name] AS [DecidedByUser],
    mjBizAppsOrdersPaymentTermsType_PriorPaymentTermsTypeID.[Name] AS [PriorPaymentTermsType],
    mjBizAppsOrdersPaymentTermsType_NewPaymentTermsTypeID.[Name] AS [NewPaymentTermsType]
FROM
    [${flyway:defaultSchema}].[OrderConcession] AS o
INNER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [o].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
INNER JOIN
    [${mjSchema}].[User] AS MJUser_RequestedByUserID
  ON
    [o].[RequestedByUserID] = MJUser_RequestedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[SalesRule] AS mjBizAppsOrdersSalesRule_SalesRuleID
  ON
    [o].[SalesRuleID] = mjBizAppsOrdersSalesRule_SalesRuleID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_DecidedByUserID
  ON
    [o].[DecidedByUserID] = MJUser_DecidedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentTermsType] AS mjBizAppsOrdersPaymentTermsType_PriorPaymentTermsTypeID
  ON
    [o].[PriorPaymentTermsTypeID] = mjBizAppsOrdersPaymentTermsType_PriorPaymentTermsTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentTermsType] AS mjBizAppsOrdersPaymentTermsType_NewPaymentTermsTypeID
  ON
    [o].[NewPaymentTermsTypeID] = mjBizAppsOrdersPaymentTermsType_NewPaymentTermsTypeID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: Permissions for vwOrderConcessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: spCreateOrderConcession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderConcession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderConcession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderConcession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderConcession]
    @ID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @SubscriptionTermID_Clear bit = 0,
    @SubscriptionTermID uniqueidentifier = NULL,
    @DeliveryForm nvarchar(20),
    @ReasonCategory nvarchar(20),
    @Reason nvarchar(MAX),
    @AddedDays_Clear bit = 0,
    @AddedDays int = NULL,
    @AddedQuantity_Clear bit = 0,
    @AddedQuantity decimal(18, 4) = NULL,
    @ComputedValue decimal(18, 2),
    @OrderNetTotal_Clear bit = 0,
    @OrderNetTotal decimal(18, 2) = NULL,
    @CumulativeShare_Clear bit = 0,
    @CumulativeShare decimal(9, 4) = NULL,
    @Status nvarchar(20) = NULL,
    @RequestedByUserID uniqueidentifier,
    @AuthorizedBySalesAuthorityID_Clear bit = 0,
    @AuthorizedBySalesAuthorityID uniqueidentifier = NULL,
    @SalesRuleID_Clear bit = 0,
    @SalesRuleID uniqueidentifier = NULL,
    @DecidedByUserID_Clear bit = 0,
    @DecidedByUserID uniqueidentifier = NULL,
    @DecidedAt_Clear bit = 0,
    @DecidedAt datetimeoffset = NULL,
    @DecisionNotes_Clear bit = 0,
    @DecisionNotes nvarchar(MAX) = NULL,
    @PriorPaymentTermsTypeID_Clear bit = 0,
    @PriorPaymentTermsTypeID uniqueidentifier = NULL,
    @NewPaymentTermsTypeID_Clear bit = 0,
    @NewPaymentTermsTypeID uniqueidentifier = NULL,
    @SignedAmendmentReference_Clear bit = 0,
    @SignedAmendmentReference nvarchar(500) = NULL,
    @PriorStartDate_Clear bit = 0,
    @PriorStartDate date = NULL,
    @PriorEndDate_Clear bit = 0,
    @PriorEndDate date = NULL,
    @NewStartDate_Clear bit = 0,
    @NewStartDate date = NULL,
    @NewEndDate_Clear bit = 0,
    @NewEndDate date = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderConcession]
            (
                [ID],
                [OrderHeaderID],
                [OrderLineID],
                [SubscriptionTermID],
                [DeliveryForm],
                [ReasonCategory],
                [Reason],
                [AddedDays],
                [AddedQuantity],
                [ComputedValue],
                [OrderNetTotal],
                [CumulativeShare],
                [Status],
                [RequestedByUserID],
                [AuthorizedBySalesAuthorityID],
                [SalesRuleID],
                [DecidedByUserID],
                [DecidedAt],
                [DecisionNotes],
                [PriorPaymentTermsTypeID],
                [NewPaymentTermsTypeID],
                [SignedAmendmentReference],
                [PriorStartDate],
                [PriorEndDate],
                [NewStartDate],
                [NewEndDate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderHeaderID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, NULL) END,
                @DeliveryForm,
                @ReasonCategory,
                @Reason,
                CASE WHEN @AddedDays_Clear = 1 THEN NULL ELSE ISNULL(@AddedDays, NULL) END,
                CASE WHEN @AddedQuantity_Clear = 1 THEN NULL ELSE ISNULL(@AddedQuantity, NULL) END,
                @ComputedValue,
                CASE WHEN @OrderNetTotal_Clear = 1 THEN NULL ELSE ISNULL(@OrderNetTotal, NULL) END,
                CASE WHEN @CumulativeShare_Clear = 1 THEN NULL ELSE ISNULL(@CumulativeShare, NULL) END,
                ISNULL(@Status, 'Pending'),
                @RequestedByUserID,
                CASE WHEN @AuthorizedBySalesAuthorityID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizedBySalesAuthorityID, NULL) END,
                CASE WHEN @SalesRuleID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRuleID, NULL) END,
                CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, NULL) END,
                CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, NULL) END,
                CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, NULL) END,
                CASE WHEN @PriorPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@PriorPaymentTermsTypeID, NULL) END,
                CASE WHEN @NewPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@NewPaymentTermsTypeID, NULL) END,
                CASE WHEN @SignedAmendmentReference_Clear = 1 THEN NULL ELSE ISNULL(@SignedAmendmentReference, NULL) END,
                CASE WHEN @PriorStartDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorStartDate, NULL) END,
                CASE WHEN @PriorEndDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorEndDate, NULL) END,
                CASE WHEN @NewStartDate_Clear = 1 THEN NULL ELSE ISNULL(@NewStartDate, NULL) END,
                CASE WHEN @NewEndDate_Clear = 1 THEN NULL ELSE ISNULL(@NewEndDate, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderConcession]
            (
                [OrderHeaderID],
                [OrderLineID],
                [SubscriptionTermID],
                [DeliveryForm],
                [ReasonCategory],
                [Reason],
                [AddedDays],
                [AddedQuantity],
                [ComputedValue],
                [OrderNetTotal],
                [CumulativeShare],
                [Status],
                [RequestedByUserID],
                [AuthorizedBySalesAuthorityID],
                [SalesRuleID],
                [DecidedByUserID],
                [DecidedAt],
                [DecisionNotes],
                [PriorPaymentTermsTypeID],
                [NewPaymentTermsTypeID],
                [SignedAmendmentReference],
                [PriorStartDate],
                [PriorEndDate],
                [NewStartDate],
                [NewEndDate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderHeaderID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, NULL) END,
                @DeliveryForm,
                @ReasonCategory,
                @Reason,
                CASE WHEN @AddedDays_Clear = 1 THEN NULL ELSE ISNULL(@AddedDays, NULL) END,
                CASE WHEN @AddedQuantity_Clear = 1 THEN NULL ELSE ISNULL(@AddedQuantity, NULL) END,
                @ComputedValue,
                CASE WHEN @OrderNetTotal_Clear = 1 THEN NULL ELSE ISNULL(@OrderNetTotal, NULL) END,
                CASE WHEN @CumulativeShare_Clear = 1 THEN NULL ELSE ISNULL(@CumulativeShare, NULL) END,
                ISNULL(@Status, 'Pending'),
                @RequestedByUserID,
                CASE WHEN @AuthorizedBySalesAuthorityID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizedBySalesAuthorityID, NULL) END,
                CASE WHEN @SalesRuleID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRuleID, NULL) END,
                CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, NULL) END,
                CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, NULL) END,
                CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, NULL) END,
                CASE WHEN @PriorPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@PriorPaymentTermsTypeID, NULL) END,
                CASE WHEN @NewPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@NewPaymentTermsTypeID, NULL) END,
                CASE WHEN @SignedAmendmentReference_Clear = 1 THEN NULL ELSE ISNULL(@SignedAmendmentReference, NULL) END,
                CASE WHEN @PriorStartDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorStartDate, NULL) END,
                CASE WHEN @PriorEndDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorEndDate, NULL) END,
                CASE WHEN @NewStartDate_Clear = 1 THEN NULL ELSE ISNULL(@NewStartDate, NULL) END,
                CASE WHEN @NewEndDate_Clear = 1 THEN NULL ELSE ISNULL(@NewEndDate, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderConcessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Concessions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: spUpdateOrderConcession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderConcession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderConcession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderConcession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderConcession]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @SubscriptionTermID_Clear bit = 0,
    @SubscriptionTermID uniqueidentifier = NULL,
    @DeliveryForm nvarchar(20) = NULL,
    @ReasonCategory nvarchar(20) = NULL,
    @Reason nvarchar(MAX) = NULL,
    @AddedDays_Clear bit = 0,
    @AddedDays int = NULL,
    @AddedQuantity_Clear bit = 0,
    @AddedQuantity decimal(18, 4) = NULL,
    @ComputedValue decimal(18, 2) = NULL,
    @OrderNetTotal_Clear bit = 0,
    @OrderNetTotal decimal(18, 2) = NULL,
    @CumulativeShare_Clear bit = 0,
    @CumulativeShare decimal(9, 4) = NULL,
    @Status nvarchar(20) = NULL,
    @RequestedByUserID uniqueidentifier = NULL,
    @AuthorizedBySalesAuthorityID_Clear bit = 0,
    @AuthorizedBySalesAuthorityID uniqueidentifier = NULL,
    @SalesRuleID_Clear bit = 0,
    @SalesRuleID uniqueidentifier = NULL,
    @DecidedByUserID_Clear bit = 0,
    @DecidedByUserID uniqueidentifier = NULL,
    @DecidedAt_Clear bit = 0,
    @DecidedAt datetimeoffset = NULL,
    @DecisionNotes_Clear bit = 0,
    @DecisionNotes nvarchar(MAX) = NULL,
    @PriorPaymentTermsTypeID_Clear bit = 0,
    @PriorPaymentTermsTypeID uniqueidentifier = NULL,
    @NewPaymentTermsTypeID_Clear bit = 0,
    @NewPaymentTermsTypeID uniqueidentifier = NULL,
    @SignedAmendmentReference_Clear bit = 0,
    @SignedAmendmentReference nvarchar(500) = NULL,
    @PriorStartDate_Clear bit = 0,
    @PriorStartDate date = NULL,
    @PriorEndDate_Clear bit = 0,
    @PriorEndDate date = NULL,
    @NewStartDate_Clear bit = 0,
    @NewStartDate date = NULL,
    @NewEndDate_Clear bit = 0,
    @NewEndDate date = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderConcession]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [OrderLineID] = CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, [OrderLineID]) END,
        [SubscriptionTermID] = CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, [SubscriptionTermID]) END,
        [DeliveryForm] = ISNULL(@DeliveryForm, [DeliveryForm]),
        [ReasonCategory] = ISNULL(@ReasonCategory, [ReasonCategory]),
        [Reason] = ISNULL(@Reason, [Reason]),
        [AddedDays] = CASE WHEN @AddedDays_Clear = 1 THEN NULL ELSE ISNULL(@AddedDays, [AddedDays]) END,
        [AddedQuantity] = CASE WHEN @AddedQuantity_Clear = 1 THEN NULL ELSE ISNULL(@AddedQuantity, [AddedQuantity]) END,
        [ComputedValue] = ISNULL(@ComputedValue, [ComputedValue]),
        [OrderNetTotal] = CASE WHEN @OrderNetTotal_Clear = 1 THEN NULL ELSE ISNULL(@OrderNetTotal, [OrderNetTotal]) END,
        [CumulativeShare] = CASE WHEN @CumulativeShare_Clear = 1 THEN NULL ELSE ISNULL(@CumulativeShare, [CumulativeShare]) END,
        [Status] = ISNULL(@Status, [Status]),
        [RequestedByUserID] = ISNULL(@RequestedByUserID, [RequestedByUserID]),
        [AuthorizedBySalesAuthorityID] = CASE WHEN @AuthorizedBySalesAuthorityID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizedBySalesAuthorityID, [AuthorizedBySalesAuthorityID]) END,
        [SalesRuleID] = CASE WHEN @SalesRuleID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRuleID, [SalesRuleID]) END,
        [DecidedByUserID] = CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, [DecidedByUserID]) END,
        [DecidedAt] = CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, [DecidedAt]) END,
        [DecisionNotes] = CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, [DecisionNotes]) END,
        [PriorPaymentTermsTypeID] = CASE WHEN @PriorPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@PriorPaymentTermsTypeID, [PriorPaymentTermsTypeID]) END,
        [NewPaymentTermsTypeID] = CASE WHEN @NewPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@NewPaymentTermsTypeID, [NewPaymentTermsTypeID]) END,
        [SignedAmendmentReference] = CASE WHEN @SignedAmendmentReference_Clear = 1 THEN NULL ELSE ISNULL(@SignedAmendmentReference, [SignedAmendmentReference]) END,
        [PriorStartDate] = CASE WHEN @PriorStartDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorStartDate, [PriorStartDate]) END,
        [PriorEndDate] = CASE WHEN @PriorEndDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorEndDate, [PriorEndDate]) END,
        [NewStartDate] = CASE WHEN @NewStartDate_Clear = 1 THEN NULL ELSE ISNULL(@NewStartDate, [NewStartDate]) END,
        [NewEndDate] = CASE WHEN @NewEndDate_Clear = 1 THEN NULL ELSE ISNULL(@NewEndDate, [NewEndDate]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderConcessions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderConcessions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderConcession table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderConcession]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderConcession];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderConcession
ON [${flyway:defaultSchema}].[OrderConcession]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderConcession]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderConcession] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Concessions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: spDeleteOrderConcession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderConcession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderConcession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderConcession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderConcession]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderConcession]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Concessions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* Set categories for 5 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A20C25AA-D978-4CEF-8B27-95682245805C';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.PriorStartDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4E66B734-3ADF-4A0C-A6E4-334F3CB51D23';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.PriorEndDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5018720F-C861-4D62-9843-C26856E2ABE4';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.NewStartDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6B016DF2-C805-41AB-9D10-389B15A40FF0';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.NewEndDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9E82C406-0561-4816-B656-B30966725506';

/* Generated Validation Functions for MJ_BizApps_Orders: Order Concessions */
-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('0383b320-8c41-4dc5-a138-bd4c8d5e0745', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(NOT ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [PriorStartDate] IS NULL AND [PriorEndDate] IS NULL AND [NewStartDate] IS NULL AND [NewEndDate] IS NULL OR ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [SubscriptionTermID] IS NOT NULL AND [PriorStartDate] IS NOT NULL AND [PriorEndDate] IS NOT NULL AND [NewStartDate] IS NOT NULL AND [NewEndDate] IS NOT NULL AND [NewEndDate]>=[NewStartDate] AND [AddedQuantity] IS NULL AND [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL AND ([DeliveryForm]=''Shift'' AND datediff(day,[PriorStartDate],[NewStartDate])=datediff(day,[PriorEndDate],[NewEndDate]) AND [NewStartDate]<>[PriorStartDate] OR [DeliveryForm]=''Shorten'' AND [NewStartDate]>=[PriorStartDate] AND [NewEndDate]<=[PriorEndDate] AND ([NewStartDate]<>[PriorStartDate] OR [NewEndDate]<>[PriorEndDate])))', 'public ValidateDeliveryFormDatesAndTerms(result: ValidationResult): void {
	const isShorten = this.DeliveryForm === ''Shorten'';
	const isShift = this.DeliveryForm === ''Shift'';

	if (!isShorten && !isShift) {
		if (this.PriorStartDate != null || this.PriorEndDate != null || this.NewStartDate != null || this.NewEndDate != null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Prior and new start and end dates must be empty when delivery form is not ''Shorten'' or ''Shift''.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	} else {
		if (this.SubscriptionTermID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"SubscriptionTermID",
				"Subscription Term ID is required when delivery form is ''Shorten'' or ''Shift''.",
				this.SubscriptionTermID,
				ValidationErrorType.Failure
			));
		}

		if (this.PriorStartDate == null || this.PriorEndDate == null || this.NewStartDate == null || this.NewEndDate == null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Prior and new start and end dates are required when delivery form is ''Shorten'' or ''Shift''.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		} else {
			const priorStart = new Date(this.PriorStartDate).getTime();
			const priorEnd = new Date(this.PriorEndDate).getTime();
			const newStart = new Date(this.NewStartDate).getTime();
			const newEnd = new Date(this.NewEndDate).getTime();

			if (newEnd < newStart) {
				result.Errors.push(new ValidationErrorInfo(
					"NewEndDate",
					"New End Date must be greater than or equal to New Start Date.",
					this.NewEndDate,
					ValidationErrorType.Failure
				));
			}

			if (isShift) {
				const startShiftDays = Math.round((newStart - priorStart) / (1000 * 60 * 60 * 24));
				const endShiftDays = Math.round((newEnd - priorEnd) / (1000 * 60 * 60 * 24));

				if (startShiftDays !== endShiftDays || newStart === priorStart) {
					result.Errors.push(new ValidationErrorInfo(
						"DeliveryForm",
						"For a ''Shift'' delivery form, start and end dates must be shifted by the exact same number of days and must differ from prior dates.",
						this.DeliveryForm,
						ValidationErrorType.Failure
					));
				}
			}

			if (isShorten) {
				if (newStart < priorStart || newEnd > priorEnd || (newStart === priorStart && newEnd === priorEnd)) {
					result.Errors.push(new ValidationErrorInfo(
						"DeliveryForm",
						"For a ''Shorten'' delivery form, the new date range must be within the prior date range and at least one date must be changed.",
						this.DeliveryForm,
						ValidationErrorType.Failure
					));
				}
			}
		}

		if (this.AddedQuantity != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AddedQuantity",
				"Added Quantity must be empty when delivery form is ''Shorten'' or ''Shift''.",
				this.AddedQuantity,
				ValidationErrorType.Failure
			));
		}

		if (this.PriorPaymentTermsTypeID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"PriorPaymentTermsTypeID",
				"Prior Payment Terms Type ID must be empty when delivery form is ''Shorten'' or ''Shift''.",
				this.PriorPaymentTermsTypeID,
				ValidationErrorType.Failure
			));
		}

		if (this.NewPaymentTermsTypeID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"NewPaymentTermsTypeID",
				"New Payment Terms Type ID must be empty when delivery form is ''Shorten'' or ''Shift''.",
				this.NewPaymentTermsTypeID,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Validates delivery modification rules for subscription dates. When delivery form is ''Shift'' or ''Shorten'', all start and end dates and subscription term are required while payment terms and added quantity must be empty. ''Shift'' requires both start and end dates to move by the exact same number of days. ''Shorten'' requires the new dates to fall within the original date range with at least one date modified. For other delivery forms, all date fields must remain empty.', 'ValidateDeliveryFormDatesAndTerms', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

