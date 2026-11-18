-- =============================================================================
-- V202611181100 — Payment timing on a new sale needs approval (golive #268, #1097)
-- =============================================================================
-- Finance's rule: a new sale is invoiced at confirm and due on receipt, a renewal is
-- due on the first day of its new term, and agreed instalments follow the order's
-- payment schedule. A new sale that departs from it needed approval, and nothing
-- asked: a service start months out, an instalment due after the service starts,
-- or Net terms on a new sale all confirmed unchecked.
--
-- What this file does, in order:
--   1. OrderConcession gains the Timing delivery form. A Timing concession names the
--      order only and records, in TimingFacts, the order's payment timing as it stood
--      when it was recorded: the new-sale service starts, the payment terms and the
--      instalment due dates. Once approved it covers the order while those facts are
--      unchanged. It has no currency value.
--   2. SalesRule.RuleType gains PaymentTiming. The active PaymentTiming rule's
--      ApprovalRequiredRoleID decides Timing concessions. With no active rule the
--      confirm check for payment timing is off.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. OrderConcession: the Timing form
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD
    [TimingFacts] NVARCHAR(2000) NULL,
    CONSTRAINT [CK_OrderConcession_Timing] CHECK (
        ([DeliveryForm] = 'Timing'
            AND [TimingFacts] IS NOT NULL
            AND [OrderLineID] IS NULL
            AND [SubscriptionTermID] IS NULL
            AND [AddedDays] IS NULL
            AND [AddedQuantity] IS NULL
            AND [ComputedValue] = 0)
        OR ([DeliveryForm] <> 'Timing' AND [TimingFacts] IS NULL)
    );
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] DROP CONSTRAINT [CK_OrderConcession_DeliveryForm];
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD CONSTRAINT [CK_OrderConcession_DeliveryForm]
    CHECK ([DeliveryForm] IN ('Price','Duration','Scope','Seats','Terms','Shift','Shorten','Timing'));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a Timing concession, the order''s payment timing when the concession was recorded: the service start of each line that is not a renewal, the payment terms, and each live instalment''s due date and amount. An approved Timing concession covers the order at confirm only while the order still has exactly these facts. NULL on every other form.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'TimingFacts';
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'How the value was given: Price (a lower price than the price engine''s, or a booked term''s amount lowered when NewAmount is set), Duration (a term extended at no charge), Scope (a product added at no charge), Seats (quantity added at no charge), Terms (a confirmed order''s payment terms changed), Shift (a booked term''s start and end moved by the same number of days), Shorten (a booked term started later or ended earlier), Timing (a new sale''s payment timing departs from due on receipt at confirm: a delayed service start, an instalment due after the service starts, or payment terms other than due on receipt).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'DeliveryForm';
GO

-- -----------------------------------------------------------------------------
-- 2. SalesRule.RuleType: PaymentTiming
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[SalesRule] DROP CONSTRAINT [CK_SalesRule_RuleType];
GO

ALTER TABLE [${flyway:defaultSchema}].[SalesRule] ADD CONSTRAINT [CK_SalesRule_RuleType]
    CHECK ([RuleType] IN ('DiscountLimit','ConcessionLimit','PaymentTiming','PaymentTermsRequired','ProductAuthorization','CreditLimit','Custom'));
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'DiscountLimit | ConcessionLimit | PaymentTiming | PaymentTermsRequired | ProductAuthorization | CreditLimit | Custom. ConcessionLimit names the role that approves a concession outside a rep''s SalesAuthority. PaymentTiming names the role that approves a new sale''s payment timing when it departs from due on receipt at confirm (a Timing concession); with no active PaymentTiming rule that confirm check is off.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesRule',
    @level2type = N'COLUMN', @level2name = N'RuleType';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above, generated against a database
-- built from this repo's migrations: the new Order Concessions field TimingFacts,
-- the Timing and PaymentTiming value-list values, Order Concessions' foreign-key
-- indexes, vwOrderConcessions, the CRUD procs and permissions. CodeGen ran with
-- no AI key, so it wrote no validator for CK_OrderConcession_Timing.
-- =============================================================================


/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '012a444a-a880-482b-b883-544da8846052' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'TimingFacts')) BEGIN
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
            '012a444a-a880-482b-b883-544da8846052',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'TimingFacts',
            'Timing Facts',
            'For a Timing concession, the order''s payment timing when the concession was recorded: the service start of each line that is not a renewal, the payment terms, and each live instalment''s due date and amount. An approved Timing concession covers the order at confirm only while the order still has exactly these facts. NULL on every other form.',
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


/* Value lists: OrderConcession.DeliveryForm gains Timing, SalesRule.RuleType gains PaymentTiming.
   Keyed on each field's entity and name, not the authoring database's EntityField IDs, which
   exist only on the database CodeGen ran against. Each insert skips a value already present. */
DECLARE @DeliveryFormFieldID UNIQUEIDENTIFIER = (
    SELECT f.[ID]
      FROM [${mjSchema}].[EntityField] f
      JOIN [${mjSchema}].[Entity]      e ON e.[ID] = f.[EntityID]
     WHERE e.[SchemaName] = '${flyway:defaultSchema}'
       AND e.[BaseTable]  = 'OrderConcession'
       AND f.[Name]       = 'DeliveryForm');

DECLARE @RuleTypeFieldID UNIQUEIDENTIFIER = (
    SELECT f.[ID]
      FROM [${mjSchema}].[EntityField] f
      JOIN [${mjSchema}].[Entity]      e ON e.[ID] = f.[EntityID]
     WHERE e.[SchemaName] = '${flyway:defaultSchema}'
       AND e.[BaseTable]  = 'SalesRule'
       AND f.[Name]       = 'RuleType');

IF @DeliveryFormFieldID IS NULL OR @RuleTypeFieldID IS NULL
    THROW 50000, 'OrderConcession.DeliveryForm or SalesRule.RuleType EntityField not found - CodeGen must run before this migration.', 1;

INSERT INTO [${mjSchema}].[EntityFieldValue]
       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
SELECT '06aefed8-be86-42ee-857f-87a5703a58ca', @DeliveryFormFieldID, 8, 'Timing', 'Timing', GETUTCDATE(), GETUTCDATE()
 WHERE NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] x
                    WHERE x.[EntityFieldID] = @DeliveryFormFieldID AND x.[Value] = 'Timing');

INSERT INTO [${mjSchema}].[EntityFieldValue]
       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
SELECT '6590ba62-4eec-41e8-b434-b73a6ca1eb29', @RuleTypeFieldID, 6, 'PaymentTiming', 'PaymentTiming', GETUTCDATE(), GETUTCDATE()
 WHERE NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] x
                    WHERE x.[EntityFieldID] = @RuleTypeFieldID AND x.[Value] = 'PaymentTiming');

/* PaymentTiming sorts before ProductAuthorization, which moves from 6 to 7. */
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 7
 WHERE [EntityFieldID] = @RuleTypeFieldID AND [Value] = 'ProductAuthorization';


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

-- Index for foreign key ReferralProgramID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_ReferralProgramID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_ReferralProgramID ON [${flyway:defaultSchema}].[OrderConcession] ([ReferralProgramID]);

-- Index for foreign key AppliesToPaymentScheduleID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_AppliesToPaymentScheduleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_AppliesToPaymentScheduleID ON [${flyway:defaultSchema}].[OrderConcession] ([AppliesToPaymentScheduleID]);

-- Index for foreign key WithdrawnByUserID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_WithdrawnByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_WithdrawnByUserID ON [${flyway:defaultSchema}].[OrderConcession] ([WithdrawnByUserID]);

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
    mjBizAppsOrdersPaymentTermsType_NewPaymentTermsTypeID.[Name] AS [NewPaymentTermsType],
    mjBizAppsOrdersReferralProgram_ReferralProgramID.[Name] AS [ReferralProgram],
    MJUser_WithdrawnByUserID.[Name] AS [WithdrawnByUser]
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ReferralProgram] AS mjBizAppsOrdersReferralProgram_ReferralProgramID
  ON
    [o].[ReferralProgramID] = mjBizAppsOrdersReferralProgram_ReferralProgramID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_WithdrawnByUserID
  ON
    [o].[WithdrawnByUserID] = MJUser_WithdrawnByUserID.[ID]
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
    @ReferralProgramID_Clear bit = 0,
    @ReferralProgramID uniqueidentifier = NULL,
    @PriorStartDate_Clear bit = 0,
    @PriorStartDate date = NULL,
    @PriorEndDate_Clear bit = 0,
    @PriorEndDate date = NULL,
    @NewStartDate_Clear bit = 0,
    @NewStartDate date = NULL,
    @NewEndDate_Clear bit = 0,
    @NewEndDate date = NULL,
    @NewAmount_Clear bit = 0,
    @NewAmount decimal(18, 2) = NULL,
    @AppliesToPaymentScheduleID_Clear bit = 0,
    @AppliesToPaymentScheduleID uniqueidentifier = NULL,
    @ScheduleReduction_Clear bit = 0,
    @ScheduleReduction decimal(18, 2) = NULL,
    @CreditMemoAmount_Clear bit = 0,
    @CreditMemoAmount decimal(18, 2) = NULL,
    @CreditMemoNumber_Clear bit = 0,
    @CreditMemoNumber nvarchar(50) = NULL,
    @RefundRequested bit = NULL,
    @WithdrawnByUserID_Clear bit = 0,
    @WithdrawnByUserID uniqueidentifier = NULL,
    @WithdrawnAt_Clear bit = 0,
    @WithdrawnAt datetimeoffset = NULL,
    @TimingFacts_Clear bit = 0,
    @TimingFacts nvarchar(2000) = NULL
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
                [ReferralProgramID],
                [PriorStartDate],
                [PriorEndDate],
                [NewStartDate],
                [NewEndDate],
                [NewAmount],
                [AppliesToPaymentScheduleID],
                [ScheduleReduction],
                [CreditMemoAmount],
                [CreditMemoNumber],
                [RefundRequested],
                [WithdrawnByUserID],
                [WithdrawnAt],
                [TimingFacts]
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
                CASE WHEN @ReferralProgramID_Clear = 1 THEN NULL ELSE ISNULL(@ReferralProgramID, NULL) END,
                CASE WHEN @PriorStartDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorStartDate, NULL) END,
                CASE WHEN @PriorEndDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorEndDate, NULL) END,
                CASE WHEN @NewStartDate_Clear = 1 THEN NULL ELSE ISNULL(@NewStartDate, NULL) END,
                CASE WHEN @NewEndDate_Clear = 1 THEN NULL ELSE ISNULL(@NewEndDate, NULL) END,
                CASE WHEN @NewAmount_Clear = 1 THEN NULL ELSE ISNULL(@NewAmount, NULL) END,
                CASE WHEN @AppliesToPaymentScheduleID_Clear = 1 THEN NULL ELSE ISNULL(@AppliesToPaymentScheduleID, NULL) END,
                CASE WHEN @ScheduleReduction_Clear = 1 THEN NULL ELSE ISNULL(@ScheduleReduction, NULL) END,
                CASE WHEN @CreditMemoAmount_Clear = 1 THEN NULL ELSE ISNULL(@CreditMemoAmount, NULL) END,
                CASE WHEN @CreditMemoNumber_Clear = 1 THEN NULL ELSE ISNULL(@CreditMemoNumber, NULL) END,
                ISNULL(@RefundRequested, 0),
                CASE WHEN @WithdrawnByUserID_Clear = 1 THEN NULL ELSE ISNULL(@WithdrawnByUserID, NULL) END,
                CASE WHEN @WithdrawnAt_Clear = 1 THEN NULL ELSE ISNULL(@WithdrawnAt, NULL) END,
                CASE WHEN @TimingFacts_Clear = 1 THEN NULL ELSE ISNULL(@TimingFacts, NULL) END
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
                [ReferralProgramID],
                [PriorStartDate],
                [PriorEndDate],
                [NewStartDate],
                [NewEndDate],
                [NewAmount],
                [AppliesToPaymentScheduleID],
                [ScheduleReduction],
                [CreditMemoAmount],
                [CreditMemoNumber],
                [RefundRequested],
                [WithdrawnByUserID],
                [WithdrawnAt],
                [TimingFacts]
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
                CASE WHEN @ReferralProgramID_Clear = 1 THEN NULL ELSE ISNULL(@ReferralProgramID, NULL) END,
                CASE WHEN @PriorStartDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorStartDate, NULL) END,
                CASE WHEN @PriorEndDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorEndDate, NULL) END,
                CASE WHEN @NewStartDate_Clear = 1 THEN NULL ELSE ISNULL(@NewStartDate, NULL) END,
                CASE WHEN @NewEndDate_Clear = 1 THEN NULL ELSE ISNULL(@NewEndDate, NULL) END,
                CASE WHEN @NewAmount_Clear = 1 THEN NULL ELSE ISNULL(@NewAmount, NULL) END,
                CASE WHEN @AppliesToPaymentScheduleID_Clear = 1 THEN NULL ELSE ISNULL(@AppliesToPaymentScheduleID, NULL) END,
                CASE WHEN @ScheduleReduction_Clear = 1 THEN NULL ELSE ISNULL(@ScheduleReduction, NULL) END,
                CASE WHEN @CreditMemoAmount_Clear = 1 THEN NULL ELSE ISNULL(@CreditMemoAmount, NULL) END,
                CASE WHEN @CreditMemoNumber_Clear = 1 THEN NULL ELSE ISNULL(@CreditMemoNumber, NULL) END,
                ISNULL(@RefundRequested, 0),
                CASE WHEN @WithdrawnByUserID_Clear = 1 THEN NULL ELSE ISNULL(@WithdrawnByUserID, NULL) END,
                CASE WHEN @WithdrawnAt_Clear = 1 THEN NULL ELSE ISNULL(@WithdrawnAt, NULL) END,
                CASE WHEN @TimingFacts_Clear = 1 THEN NULL ELSE ISNULL(@TimingFacts, NULL) END
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
    @ReferralProgramID_Clear bit = 0,
    @ReferralProgramID uniqueidentifier = NULL,
    @PriorStartDate_Clear bit = 0,
    @PriorStartDate date = NULL,
    @PriorEndDate_Clear bit = 0,
    @PriorEndDate date = NULL,
    @NewStartDate_Clear bit = 0,
    @NewStartDate date = NULL,
    @NewEndDate_Clear bit = 0,
    @NewEndDate date = NULL,
    @NewAmount_Clear bit = 0,
    @NewAmount decimal(18, 2) = NULL,
    @AppliesToPaymentScheduleID_Clear bit = 0,
    @AppliesToPaymentScheduleID uniqueidentifier = NULL,
    @ScheduleReduction_Clear bit = 0,
    @ScheduleReduction decimal(18, 2) = NULL,
    @CreditMemoAmount_Clear bit = 0,
    @CreditMemoAmount decimal(18, 2) = NULL,
    @CreditMemoNumber_Clear bit = 0,
    @CreditMemoNumber nvarchar(50) = NULL,
    @RefundRequested bit = NULL,
    @WithdrawnByUserID_Clear bit = 0,
    @WithdrawnByUserID uniqueidentifier = NULL,
    @WithdrawnAt_Clear bit = 0,
    @WithdrawnAt datetimeoffset = NULL,
    @TimingFacts_Clear bit = 0,
    @TimingFacts nvarchar(2000) = NULL
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
        [ReferralProgramID] = CASE WHEN @ReferralProgramID_Clear = 1 THEN NULL ELSE ISNULL(@ReferralProgramID, [ReferralProgramID]) END,
        [PriorStartDate] = CASE WHEN @PriorStartDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorStartDate, [PriorStartDate]) END,
        [PriorEndDate] = CASE WHEN @PriorEndDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorEndDate, [PriorEndDate]) END,
        [NewStartDate] = CASE WHEN @NewStartDate_Clear = 1 THEN NULL ELSE ISNULL(@NewStartDate, [NewStartDate]) END,
        [NewEndDate] = CASE WHEN @NewEndDate_Clear = 1 THEN NULL ELSE ISNULL(@NewEndDate, [NewEndDate]) END,
        [NewAmount] = CASE WHEN @NewAmount_Clear = 1 THEN NULL ELSE ISNULL(@NewAmount, [NewAmount]) END,
        [AppliesToPaymentScheduleID] = CASE WHEN @AppliesToPaymentScheduleID_Clear = 1 THEN NULL ELSE ISNULL(@AppliesToPaymentScheduleID, [AppliesToPaymentScheduleID]) END,
        [ScheduleReduction] = CASE WHEN @ScheduleReduction_Clear = 1 THEN NULL ELSE ISNULL(@ScheduleReduction, [ScheduleReduction]) END,
        [CreditMemoAmount] = CASE WHEN @CreditMemoAmount_Clear = 1 THEN NULL ELSE ISNULL(@CreditMemoAmount, [CreditMemoAmount]) END,
        [CreditMemoNumber] = CASE WHEN @CreditMemoNumber_Clear = 1 THEN NULL ELSE ISNULL(@CreditMemoNumber, [CreditMemoNumber]) END,
        [RefundRequested] = ISNULL(@RefundRequested, [RefundRequested]),
        [WithdrawnByUserID] = CASE WHEN @WithdrawnByUserID_Clear = 1 THEN NULL ELSE ISNULL(@WithdrawnByUserID, [WithdrawnByUserID]) END,
        [WithdrawnAt] = CASE WHEN @WithdrawnAt_Clear = 1 THEN NULL ELSE ISNULL(@WithdrawnAt, [WithdrawnAt]) END,
        [TimingFacts] = CASE WHEN @TimingFacts_Clear = 1 THEN NULL ELSE ISNULL(@TimingFacts, [TimingFacts]) END
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
