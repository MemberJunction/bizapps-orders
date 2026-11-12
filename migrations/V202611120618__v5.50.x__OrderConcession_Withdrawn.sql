-- =============================================================================
-- V202611120618 — A concession is withdrawn, not deleted (golive #403)
-- =============================================================================
-- Withdrawing a concession used to delete it, so the order lost the record of what was
-- offered and when it was taken back. A role allowed to record concessions but not to
-- delete them (Create and Read only) could not withdraw one at all, and a raised line
-- discount left the earlier concession counted alongside the new one.
--
-- A withdrawn concession now stays on the order with Status Withdrawn, stamped with who
-- withdrew it and when. It counts toward nothing: not the order's concession share, not
-- the confirm check, not the order's totals (those read Approved concessions only).
--
-- What this file does, in order:
--   1. OrderConcession gains WithdrawnByUserID and WithdrawnAt, set exactly when the
--      concession is Withdrawn.
--   2. Status gains Withdrawn.
--   3. The decision constraint accepts a Withdrawn concession without a decision: one
--      withdrawn while Pending was never decided. One withdrawn after approval keeps the
--      approver and the date it was approved.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. OrderConcession: who withdrew it, and when
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD
    [WithdrawnByUserID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_OrderConcession_WithdrawnByUser] FOREIGN KEY
        REFERENCES [__mj].[User]([ID]),
    [WithdrawnAt] DATETIMEOFFSET NULL,
    CONSTRAINT [CK_OrderConcession_Withdrawal] CHECK (
        ([Status] = 'Withdrawn' AND [WithdrawnByUserID] IS NOT NULL AND [WithdrawnAt] IS NOT NULL)
        OR ([Status] <> 'Withdrawn' AND [WithdrawnByUserID] IS NULL AND [WithdrawnAt] IS NULL)
    );
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user who withdrew the concession. Set only when Status is Withdrawn.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'WithdrawnByUserID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the concession was withdrawn. Set only when Status is Withdrawn.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'WithdrawnAt';
GO

-- -----------------------------------------------------------------------------
-- 2. Status: Withdrawn
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] DROP CONSTRAINT [CK_OrderConcession_Status];
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD CONSTRAINT [CK_OrderConcession_Status]
    CHECK ([Status] IN ('Pending','Approved','Rejected','Withdrawn'));
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'Pending | Approved | Rejected | Withdrawn. Set to Approved on save when the requester''s SalesAuthority covers the concession; otherwise decided by a holder of the ConcessionLimit rule''s role. Withdrawn: taken back by its requester (or a user who may update concessions) while Pending, or while Approved on an order not yet confirmed and not tied to a booked term; it stays on the order as a record and counts toward nothing.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

-- -----------------------------------------------------------------------------
-- 3. Decision: a Withdrawn concession may have none
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] DROP CONSTRAINT [CK_OrderConcession_Decision];
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD CONSTRAINT [CK_OrderConcession_Decision]
    CHECK ([Status] IN ('Pending','Withdrawn') OR ([DecidedByUserID] IS NOT NULL AND [DecidedAt] IS NOT NULL));
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above, generated against a database
-- built from this repo's migrations: the two new Order Concessions fields, the
-- Withdrawn value-list value, vwOrderConcessions, the CRUD procs, permissions and
-- Order Concessions' validators.
-- =============================================================================


/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '21e70036-bcb9-4b25-972f-f7948f9bb6b7' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'WithdrawnByUserID')) BEGIN
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
            '21e70036-bcb9-4b25-972f-f7948f9bb6b7',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'WithdrawnByUserID',
            'Withdrawn By User ID',
            'The user who withdrew the concession. Set only when Status is Withdrawn.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '509b8c54-8452-42f6-9fd8-cbc9c0a088ca' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'WithdrawnAt')) BEGIN
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
            '509b8c54-8452-42f6-9fd8-cbc9c0a088ca',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'WithdrawnAt',
            'Withdrawn At',
            'When the concession was withdrawn. Set only when Status is Withdrawn.',
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

/* Status value list: Withdrawn. Keyed on the field's entity and name, not this database's EntityField ID */
DECLARE @OrderConcessionStatusFieldID UNIQUEIDENTIFIER = (
    SELECT f.[ID]
      FROM [${mjSchema}].[EntityField] f
      JOIN [${mjSchema}].[Entity]      e ON e.[ID] = f.[EntityID]
     WHERE e.[SchemaName] = '${flyway:defaultSchema}'
       AND e.[BaseTable]  = 'OrderConcession'
       AND f.[Name]       = 'Status');

IF @OrderConcessionStatusFieldID IS NULL
    THROW 50000, 'OrderConcession.Status EntityField not found - CodeGen must run before this migration.', 1;

INSERT INTO [${mjSchema}].[EntityFieldValue]
       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
SELECT 'cb4ec4f9-6295-4403-be07-7c5a38504b1e', @OrderConcessionStatusFieldID,
       (SELECT COALESCE(MAX(x.[Sequence]), 0) + 1 FROM [${mjSchema}].[EntityFieldValue] x WHERE x.[EntityFieldID] = @OrderConcessionStatusFieldID),
       'Withdrawn', 'Withdrawn', GETUTCDATE(), GETUTCDATE();


/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Order Concessions (One To Many via WithdrawnByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'd519e990-c8ec-452a-9314-3cd817d34dab'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d519e990-c8ec-452a-9314-3cd817d34dab', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'WithdrawnByUserID', 'One To Many', 1, 1, 136, GETUTCDATE(), GETUTCDATE())
   END;

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

/* SQL text to update entity field related entity name field map for entity field ID 21E70036-BCB9-4B25-972F-F7948F9BB6B7 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='21E70036-BCB9-4B25-972F-F7948F9BB6B7', @RelatedEntityNameFieldMap='WithdrawnByUser';

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
    @WithdrawnAt datetimeoffset = NULL
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
                [WithdrawnAt]
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
                CASE WHEN @WithdrawnAt_Clear = 1 THEN NULL ELSE ISNULL(@WithdrawnAt, NULL) END
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
                [WithdrawnAt]
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
                CASE WHEN @WithdrawnAt_Clear = 1 THEN NULL ELSE ISNULL(@WithdrawnAt, NULL) END
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
    @WithdrawnAt datetimeoffset = NULL
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
        [WithdrawnAt] = CASE WHEN @WithdrawnAt_Clear = 1 THEN NULL ELSE ISNULL(@WithdrawnAt, [WithdrawnAt]) END
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

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5220adc5-c966-4fd6-82bf-e4b521dbd9eb' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'WithdrawnByUser')) BEGIN
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
            '5220adc5-c966-4fd6-82bf-e4b521dbd9eb',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'WithdrawnByUser',
            'Withdrawn By User',
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

/* Set categories for 3 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.WithdrawnByUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Approval',
   GeneratedFormSection = 'Category',
   DisplayName = 'Withdrawn By User'
WHERE 
   ID = '21E70036-BCB9-4B25-972F-F7948F9BB6B7';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.WithdrawnAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Approval',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '509B8C54-8452-42F6-9FD8-CBC9C0A088CA';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.WithdrawnByUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Approval',
   GeneratedFormSection = 'Category',
   DisplayName = 'Withdrawn By User Name'
WHERE 
   ID = '5220ADC5-C966-4FD6-82BF-E4B521DBD9EB';

/* Generated Validation Functions for MJ_BizApps_Orders: Order Concessions */
-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND [Name] = 'ValidateCreditMemoDetails'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('e88ec23e-0665-47de-9e0e-71aa3add89ac', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([CreditMemoAmount] IS NULL AND [CreditMemoNumber] IS NULL OR [CreditMemoAmount]>(0) AND [CreditMemoNumber] IS NOT NULL AND [NewAmount] IS NOT NULL AND [Status]=''Approved'')', 'public ValidateCreditMemoDetails(result: ValidationResult) {
	const hasNoCreditMemo = this.CreditMemoAmount == null && this.CreditMemoNumber == null;
	const hasValidCreditMemo = this.CreditMemoAmount != null && this.CreditMemoAmount > 0 && 
		this.CreditMemoNumber != null && this.CreditMemoNumber.trim() !== "" && 
		this.NewAmount != null && this.Status === "Approved";

	if (!hasNoCreditMemo && !hasValidCreditMemo) {
		result.Errors.push(new ValidationErrorInfo(
			"CreditMemoAmount",
			"Credit memo amount and number must both be empty, or if specifying a credit memo, the amount must be greater than zero, credit memo number and new amount must be provided, and status must be Approved.",
			this.CreditMemoAmount,
			ValidationErrorType.Failure
		));
	}
}', 'Credit memo details (amount and number) must either both be blank, or if a credit memo is issued, the amount must be greater than zero, a memo number and new amount must be provided, and the status must be Approved.', 'ValidateCreditMemoDetails', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND [Name] = 'ValidateDecisionFieldsForStatus'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('febdd350-e56c-48b3-bb76-81f5483fa34b', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Status]=''Withdrawn'' OR [Status]=''Pending'' OR [DecidedByUserID] IS NOT NULL AND [DecidedAt] IS NOT NULL)', 'public ValidateDecisionFieldsForStatus(result: ValidationResult) {
	if (this.Status !== "Withdrawn" && this.Status !== "Pending") {
		if (this.DecidedByUserID == null || this.DecidedAt == null) {
			result.Errors.push(new ValidationErrorInfo(
				"Status",
				"DecidedByUserID and DecidedAt are required when Status is not Withdrawn or Pending.",
				this.Status,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If a record''s status is neither ''Withdrawn'' nor ''Pending'', it must include both the user who made the decision and the date/time when the decision was made.', 'ValidateDecisionFieldsForStatus', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND [Name] = 'ValidateDeliveryFormAndDates'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('4d539d45-92ba-4062-9d83-7ffd5a6ad900', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(NOT ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [PriorStartDate] IS NULL AND [PriorEndDate] IS NULL AND [NewStartDate] IS NULL AND [NewEndDate] IS NULL OR ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [SubscriptionTermID] IS NOT NULL AND [PriorStartDate] IS NOT NULL AND [PriorEndDate] IS NOT NULL AND [NewStartDate] IS NOT NULL AND [NewEndDate] IS NOT NULL AND [NewEndDate]>=[NewStartDate] AND [AddedQuantity] IS NULL AND [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL AND ([DeliveryForm]=''Shift'' AND datediff(day,[PriorStartDate],[NewStartDate])=datediff(day,[PriorEndDate],[NewEndDate]) AND [NewStartDate]<>[PriorStartDate] OR [DeliveryForm]=''Shorten'' AND [NewStartDate]>=[PriorStartDate] AND [NewEndDate]<=[PriorEndDate] AND ([NewStartDate]<>[PriorStartDate] OR [NewEndDate]<>[PriorEndDate])))', 'public ValidateDeliveryFormAndDates(result: ValidationResult) {
	const deliveryForm = this.DeliveryForm;
	const isShift = deliveryForm === "Shift";
	const isShorten = deliveryForm === "Shorten";

	if (!isShift && !isShorten) {
		if (this.PriorStartDate != null || this.PriorEndDate != null || this.NewStartDate != null || this.NewEndDate != null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Start and end dates must not be specified when DeliveryForm is not ''Shift'' or ''Shorten''.",
				deliveryForm,
				ValidationErrorType.Failure
			));
		}
	} else {
		if (this.SubscriptionTermID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"SubscriptionTermID",
				"SubscriptionTermID is required when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.SubscriptionTermID,
				ValidationErrorType.Failure
			));
		}
		if (this.PriorStartDate == null || this.PriorEndDate == null || this.NewStartDate == null || this.NewEndDate == null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Prior and new start and end dates are required when DeliveryForm is ''Shift'' or ''Shorten''.",
				deliveryForm,
				ValidationErrorType.Failure
			));
		}
		if (this.AddedQuantity != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AddedQuantity",
				"AddedQuantity must be null when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.AddedQuantity,
				ValidationErrorType.Failure
			));
		}
		if (this.PriorPaymentTermsTypeID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"PriorPaymentTermsTypeID",
				"PriorPaymentTermsTypeID must be null when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.PriorPaymentTermsTypeID,
				ValidationErrorType.Failure
			));
		}
		if (this.NewPaymentTermsTypeID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"NewPaymentTermsTypeID",
				"NewPaymentTermsTypeID must be null when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.NewPaymentTermsTypeID,
				ValidationErrorType.Failure
			));
		}

		if (this.NewStartDate != null && this.NewEndDate != null && new Date(this.NewEndDate).getTime() < new Date(this.NewStartDate).getTime()) {
			result.Errors.push(new ValidationErrorInfo(
				"NewEndDate",
				"NewEndDate must be greater than or equal to NewStartDate.",
				this.NewEndDate,
				ValidationErrorType.Failure
			));
		}

		if (this.PriorStartDate != null && this.PriorEndDate != null && this.NewStartDate != null && this.NewEndDate != null) {
			const pStart = new Date(this.PriorStartDate).getTime();
			const pEnd = new Date(this.PriorEndDate).getTime();
			const nStart = new Date(this.NewStartDate).getTime();
			const nEnd = new Date(this.NewEndDate).getTime();
			const msPerDay = 1000 * 60 * 60 * 24;

			if (isShift) {
				const startDays = Math.round((nStart - pStart) / msPerDay);
				const endDays = Math.round((nEnd - pEnd) / msPerDay);
				if (startDays !== endDays) {
					result.Errors.push(new ValidationErrorInfo(
						"NewStartDate",
						"For a ''Shift'' delivery form, start date and end date must shift by the exact same number of days.",
						this.NewStartDate,
						ValidationErrorType.Failure
					));
				}
				if (nStart === pStart) {
					result.Errors.push(new ValidationErrorInfo(
						"NewStartDate",
						"For a ''Shift'' delivery form, NewStartDate must differ from PriorStartDate.",
						this.NewStartDate,
						ValidationErrorType.Failure
					));
				}
			}

			if (isShorten) {
				if (nStart < pStart || nEnd > pEnd) {
					result.Errors.push(new ValidationErrorInfo(
						"DeliveryForm",
						"For a ''Shorten'' delivery form, the new date range must be within the prior date range.",
						deliveryForm,
						ValidationErrorType.Failure
					));
				}
				if (nStart === pStart && nEnd === pEnd) {
					result.Errors.push(new ValidationErrorInfo(
						"DeliveryForm",
						"For a ''Shorten'' delivery form, at least one of the start or end dates must change.",
						deliveryForm,
						ValidationErrorType.Failure
					));
				}
			}
		}
	}
}', 'Validates date rules and field restrictions based on the delivery form. When the delivery form is ''Shift'' or ''Shorten'', prior and new start and end dates are required alongside a subscription term, while restricting quantity and payment terms changes. Shift requires equal movement of start and end dates to a new date, while Shorten requires reducing the date range within original boundaries.', 'ValidateDeliveryFormAndDates', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND [Name] = 'ValidateDeliveryFormDurationRequirements'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('10166b56-d9f4-40cf-87c4-5efdbc717569', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Duration'' OR [SubscriptionTermID] IS NOT NULL AND [AddedDays]>(0))', 'public ValidateDeliveryFormDurationRequirements(result: ValidationResult) {
	if (this.DeliveryForm === ''Duration'' && (this.SubscriptionTermID == null || this.AddedDays == null || this.AddedDays <= 0)) {
		result.Errors.push(new ValidationErrorInfo(
			"DeliveryForm",
			"When the delivery form is ''Duration'', a subscription term must be specified and the added days must be greater than zero.",
			this.DeliveryForm,
			ValidationErrorType.Failure
		));
	}
}', 'When the delivery form is set to ''Duration'', a valid subscription term must be selected and the number of added days must be greater than zero.', 'ValidateDeliveryFormDurationRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND [Name] = 'ValidateNewAmountAndScheduleReductionDetails'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('467ea661-28dd-4796-bc55-9b7c291ad9b0', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([NewAmount] IS NOT NULL OR [AppliesToPaymentScheduleID] IS NULL AND [ScheduleReduction] IS NULL)', 'public ValidateNewAmountAndScheduleReductionDetails(result: ValidationResult) {
	if (this.NewAmount == null && (this.AppliesToPaymentScheduleID != null || this.ScheduleReduction != null)) {
		result.Errors.push(new ValidationErrorInfo(
			"NewAmount",
			"A new amount must be provided when specifying a payment schedule or schedule reduction.",
			this.NewAmount,
			ValidationErrorType.Failure
		));
	}
}', 'Ensures that if a payment schedule or schedule reduction is specified, a new amount must also be provided.', 'ValidateNewAmountAndScheduleReductionDetails', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND [Name] = 'ValidateNewAmountRequirements'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('09e316c8-0bc8-4548-b482-c915c04c54ee', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([NewAmount] IS NULL OR [DeliveryForm]=''Price'' AND [SubscriptionTermID] IS NOT NULL AND [OrderLineID] IS NOT NULL AND [NewAmount]>(0))', 'public ValidateNewAmountRequirements(result: ValidationResult) {
	if (this.NewAmount != null) {
		if (this.DeliveryForm !== ''Price'' || this.SubscriptionTermID == null || this.OrderLineID == null || this.NewAmount <= 0) {
			result.Errors.push(new ValidationErrorInfo(
				"NewAmount",
				"When a New Amount is specified, the Delivery Form must be ''Price'', a Subscription Term and Order Line must be assigned, and the amount must be greater than zero.",
				this.NewAmount,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If a new amount is specified, the delivery form must be set to ''Price'', and both a subscription term and order line must be associated with the record along with the new amount being greater than zero.', 'ValidateNewAmountRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND [Name] = 'ValidateNewAmountWhenRefundRequested'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('44ed7ee8-0e32-4884-8f2a-27777fe81c5c', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([RefundRequested]=(0) OR [NewAmount] IS NOT NULL)', 'public ValidateNewAmountWhenRefundRequested(result: ValidationResult) {
	if (this.RefundRequested && this.NewAmount == null) {
		result.Errors.push(new ValidationErrorInfo(
			"NewAmount",
			"A new amount must be provided when a refund is requested.",
			this.NewAmount,
			ValidationErrorType.Failure
		));
	}
}', 'If a refund is requested, a new amount must be specified.', 'ValidateNewAmountWhenRefundRequested', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND [Name] = 'ValidateOrderLineIDRequiredForDeliveryForm'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('6df3d267-8ded-4f8a-a42a-9e01f7b37d0c', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(NOT ([DeliveryForm]=''Scope'' OR [DeliveryForm]=''Price'') OR [OrderLineID] IS NOT NULL)', 'public ValidateOrderLineIDRequiredForDeliveryForm(result: ValidationResult) {
	if ((this.DeliveryForm === ''Scope'' || this.DeliveryForm === ''Price'') && this.OrderLineID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"OrderLineID",
			"An Order Line is required when Delivery Form is set to Scope or Price.",
			this.OrderLineID,
			ValidationErrorType.Failure
		));
	}
}', 'If the delivery form is set to Scope or Price, an order line must be specified.', 'ValidateOrderLineIDRequiredForDeliveryForm', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND [Name] = 'ValidatePaymentTermsTypesForDeliveryForm'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('aa4c65e4-0291-4dbe-abff-4bcbeea7f0f7', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DeliveryForm]=''Terms'' OR [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL)', 'public ValidatePaymentTermsTypesForDeliveryForm(result: ValidationResult) {
	if (this.DeliveryForm !== ''Terms'') {
		if (this.PriorPaymentTermsTypeID != null || this.NewPaymentTermsTypeID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Prior and new payment terms types can only be provided when DeliveryForm is ''Terms''.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Payment terms types (prior or new) can only be specified when the delivery form is set to ''Terms''.', 'ValidatePaymentTermsTypesForDeliveryForm', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND [Name] = 'ValidateScheduleReductionStatus'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('b4c794c6-b4a9-4cca-8e54-d0e9a1941943', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ScheduleReduction] IS NULL OR [ScheduleReduction]>(0) AND [Status]=''Approved'')', 'public ValidateScheduleReductionStatus(result: ValidationResult) {
	if (this.ScheduleReduction != null && (this.ScheduleReduction <= 0 || this.Status !== ''Approved'')) {
		result.Errors.push(new ValidationErrorInfo(
			"ScheduleReduction",
			"Schedule reduction must be greater than 0 and can only be applied when the status is Approved.",
			this.ScheduleReduction,
			ValidationErrorType.Failure
		));
	}
}', 'If a schedule reduction is specified, it must be greater than zero and the record status must be set to ''Approved''.', 'ValidateScheduleReductionStatus', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND [Name] = 'ValidateSeatsDeliveryFormRequirements'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('5c3dc371-9f60-44b0-a304-66f85c4cd40d', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Seats'' OR [OrderLineID] IS NOT NULL AND [AddedQuantity]>(0))', 'public ValidateSeatsDeliveryFormRequirements(result: ValidationResult) {
	if (this.DeliveryForm === ''Seats'') {
		if (this.OrderLineID == null || this.AddedQuantity == null || this.AddedQuantity <= 0) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"When DeliveryForm is set to ''Seats'', an Order Line must be specified and Added Quantity must be greater than 0.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When the delivery form is ''Seats'', an associated order line must be provided and the added quantity must be greater than zero.', 'ValidateSeatsDeliveryFormRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND [Name] = 'ValidateTermsDeliveryFormFields'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('5d54edf4-f8e2-4f68-b3b3-d932c8372748', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Terms'' OR [NewPaymentTermsTypeID] IS NOT NULL AND ([PriorPaymentTermsTypeID] IS NULL OR [PriorPaymentTermsTypeID]<>[NewPaymentTermsTypeID]) AND [AddedDays] IS NOT NULL AND [OrderLineID] IS NULL AND [SubscriptionTermID] IS NULL AND [AddedQuantity] IS NULL)', 'public ValidateTermsDeliveryFormFields(result: ValidationResult) {
	if (this.DeliveryForm === ''Terms'') {
		if (
			this.NewPaymentTermsTypeID == null ||
			(this.PriorPaymentTermsTypeID != null && this.PriorPaymentTermsTypeID === this.NewPaymentTermsTypeID) ||
			this.AddedDays == null ||
			this.OrderLineID != null ||
			this.SubscriptionTermID != null ||
			this.AddedQuantity != null
		) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"When DeliveryForm is ''Terms'', a new payment terms type and added days are required (with new terms differing from prior terms), while order line, subscription term, and added quantity must be empty.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When the delivery form is set to ''Terms'', a new payment terms type and added days are required (and new terms must differ from prior terms), while order line, subscription term, and added quantity must be empty.', 'ValidateTermsDeliveryFormFields', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND [Name] = 'ValidateWithdrawalDetailsByStatus'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('f8f0c7d4-638f-4d92-8556-725c95b2147c', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Status]=''Withdrawn'' AND [WithdrawnByUserID] IS NOT NULL AND [WithdrawnAt] IS NOT NULL OR [Status]<>''Withdrawn'' AND [WithdrawnByUserID] IS NULL AND [WithdrawnAt] IS NULL)', 'public ValidateWithdrawalDetailsByStatus(result: ValidationResult) {
	if (this.Status === "Withdrawn") {
		if (this.WithdrawnByUserID == null || this.WithdrawnAt == null) {
			result.Errors.push(new ValidationErrorInfo(
				"WithdrawnByUserID",
				"When Status is ''Withdrawn'', both the user who withdrew it and the withdrawal timestamp must be provided.",
				this.WithdrawnByUserID,
				ValidationErrorType.Failure
			));
		}
	} else {
		if (this.WithdrawnByUserID != null || this.WithdrawnAt != null) {
			result.Errors.push(new ValidationErrorInfo(
				"WithdrawnByUserID",
				"Withdrawal details can only be specified when Status is ''Withdrawn''.",
				this.WithdrawnByUserID,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If an item''s status is Withdrawn, it must include both the user who withdrew it and the withdrawal timestamp; for any other status, both withdrawal fields must be empty.', 'ValidateWithdrawalDetailsByStatus', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;


