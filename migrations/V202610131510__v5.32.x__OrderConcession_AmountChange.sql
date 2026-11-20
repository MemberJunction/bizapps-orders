-- =============================================================================
-- V202610131510 — A booked term's amount lowered through an approved concession (#506)
-- =============================================================================
-- Orders.AmendArrangement could preview a lower amount on a booked term but could not
-- record one. The change is a Price concession on the term: valued as the reduction,
-- routed through the ConcessionLimit rule, and applied when approved.
--
-- This first part covers a reduction the order's instalments not yet invoiced can absorb
-- in full: nothing already invoiced is credited, so no credit memo is issued. The
-- instalments are lowered, which takes the reduction off what the order still bills.
--
-- What this file does, in order:
--   1. OrderConcession gains the amount change's fields: the term's new amount, the
--      invoiced instalment the reduction is about, and the gross the approved change
--      took off the uninvoiced instalments.
--   2. ReasonCategory gains Dispute, so a reduction agreed on a disputed charge is
--      reported apart from retention concessions and referral credits.
--   3. SubscriptionEvent gains AmountChanged, the event an applied change logs.
--   4. spRecalcOrderHeaderTotals takes approved schedule reductions off the order's
--      balance: the order still has its booked lines, but owes less.
--   5. trg_OrderConcession_RollupTotals recalculates the order when a concession's
--      status or schedule reduction changes.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. OrderConcession: the amount change
-- -----------------------------------------------------------------------------
-- An amount change is a Price concession naming its term and line and the term's new, lower
-- amount. ScheduleReduction is written once the change is approved, and only then.
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD
    [NewAmount] DECIMAL(18,2) NULL,
    [AppliesToPaymentScheduleID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_OrderConcession_AppliesToPaymentSchedule] FOREIGN KEY
        REFERENCES [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]([ID]),
    [ScheduleReduction] DECIMAL(18,2) NULL,
    CONSTRAINT [CK_OrderConcession_AmountChange] CHECK (
        [NewAmount] IS NULL OR (
            [DeliveryForm] = 'Price'
            AND [SubscriptionTermID] IS NOT NULL
            AND [OrderLineID] IS NOT NULL
            AND [NewAmount] > 0
        )
    ),
    CONSTRAINT [CK_OrderConcession_AmountChangeOnly] CHECK (
        [NewAmount] IS NOT NULL OR ([AppliesToPaymentScheduleID] IS NULL AND [ScheduleReduction] IS NULL)
    ),
    CONSTRAINT [CK_OrderConcession_ScheduleReduction] CHECK (
        [ScheduleReduction] IS NULL OR ([ScheduleReduction] > 0 AND [Status] = 'Approved')
    );
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For an amount change, the term''s new amount: net of discount, before tax, and lower than its amount when recorded. NULL for every other concession.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'NewAmount';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For an amount change about one invoice, the invoiced instalment it is about. NULL spreads the reduction over the instalments not yet invoiced.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'AppliesToPaymentScheduleID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For an approved amount change, the reduction and its tax taken off the order''s instalments not yet invoiced. The order''s balance and its schedule check subtract it from the booked lines. Set by the server when the change is applied.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'ScheduleReduction';
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'How the value was given: Price (a lower price than the price engine''s, or a booked term''s amount lowered when NewAmount is set), Duration (a term extended at no charge), Scope (a product added at no charge), Seats (quantity added at no charge), Terms (a confirmed order''s payment terms changed), Shift (a booked term''s start and end moved by the same number of days), Shorten (a booked term started later or ended earlier).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'DeliveryForm';
GO

-- -----------------------------------------------------------------------------
-- 2. ReasonCategory: Dispute
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] DROP CONSTRAINT [CK_OrderConcession_ReasonCategory];
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD CONSTRAINT [CK_OrderConcession_ReasonCategory]
    CHECK ([ReasonCategory] IN ('Retention','Referral','Dispute','Other'));
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'Why it was granted: Retention, Referral, Dispute (a reduction agreed on a disputed charge) or Other. Each has different economics and is reported separately.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'ReasonCategory';
GO

-- -----------------------------------------------------------------------------
-- 3. SubscriptionEvent: AmountChanged
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[SubscriptionEvent] DROP CONSTRAINT [CK_SubscriptionEvent_EventType];
GO

ALTER TABLE [${flyway:defaultSchema}].[SubscriptionEvent] ADD CONSTRAINT [CK_SubscriptionEvent_EventType]
    CHECK ([EventType] IN ('Created','Activated','TrialStarted','TrialEnded','PaymentSucceeded','PaymentFailed','Paused','Resumed','CancellationRequested','Canceled','Migrated','Extended','RenewalOrderSpawned','Rescheduled','Shortened','AmountChanged'));
GO

-- -----------------------------------------------------------------------------
-- 4. spRecalcOrderHeaderTotals — as V202609211200 left it, with the balance net of
--    approved schedule reductions. TotalGross stays the booked lines.
-- -----------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spRecalcOrderHeaderTotals]
    @OrderHeaderIDs [${flyway:defaultSchema}].[OrderHeaderIDList] READONLY
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE o
    SET TotalGross = ISNULL(l.LineTotal, 0),
        AmountPaid = ISNULL(p.Paid, 0),
        Balance    = ISNULL(l.LineTotal, 0) - ISNULL(r.Reduced, 0) - ISNULL(p.Paid, 0),
        FulfillmentStatus =
            CASE
                WHEN o.Status IN ('Draft', 'Quoted', 'Voided') THEN 'Pending'
                WHEN ISNULL(f.RequiresFulfillmentCount, 0) = 0 THEN 'NotApplicable'
                WHEN f.FulfilledCount = f.RequiresFulfillmentCount THEN 'Fulfilled'
                WHEN f.FulfilledCount > 0 THEN 'PartiallyFulfilled'
                ELSE 'Pending'
            END
    FROM [${flyway:defaultSchema}].[OrderHeader] o
    JOIN @OrderHeaderIDs ids ON ids.ID = o.ID
    OUTER APPLY (
        SELECT SUM(ol.LineTotalGross) AS LineTotal
        FROM [${flyway:defaultSchema}].[OrderLine] ol WHERE ol.OrderHeaderID = o.ID
    ) l
    OUTER APPLY (
        SELECT SUM(c.ScheduleReduction) AS Reduced
        FROM [${flyway:defaultSchema}].[OrderConcession] c
        WHERE c.OrderHeaderID = o.ID AND c.Status = 'Approved' AND c.ScheduleReduction IS NOT NULL
    ) r
    OUTER APPLY (
        SELECT SUM(pl.Amount) AS Paid
        FROM [${flyway:defaultSchema}].[PaymentLine] pl
        JOIN [${flyway:defaultSchema}].[PaymentHeader] ph ON ph.ID = pl.PaymentHeaderID
        WHERE pl.OrderHeaderID = o.ID AND ph.Status IN ('Captured','Refunded','Disputed')
    ) p
    OUTER APPLY (
        SELECT
            COUNT(CASE WHEN pt.RequiresFulfillment = 1 AND ol.ReversesOrderLineID IS NULL THEN 1 END) AS RequiresFulfillmentCount,
            COUNT(CASE WHEN pt.RequiresFulfillment = 1 AND ol.ReversesOrderLineID IS NULL AND ol.FulfillmentStatus = 'Fulfilled' THEN 1 END) AS FulfilledCount
        FROM [${flyway:defaultSchema}].[OrderLine] ol
        JOIN [${flyway:defaultSchema}].[Product] pr ON pr.ID = ol.ProductID
        JOIN [${flyway:defaultSchema}].[ProductType] pt ON pt.ID = pr.ProductTypeID
        WHERE ol.OrderHeaderID = o.ID
    ) f;

    EXEC [${flyway:defaultSchema}].[spRecalcOrderHeaderPaymentSchedule] @OrderHeaderIDs;
END;
GO

-- -----------------------------------------------------------------------------
-- 5. trg_OrderConcession_RollupTotals
-- -----------------------------------------------------------------------------
CREATE TRIGGER [${flyway:defaultSchema}].[trg_OrderConcession_RollupTotals]
ON [${flyway:defaultSchema}].[OrderConcession]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- Zero-row statements return first, as on the other rollup triggers: CodeGen's backfills run
    -- them inside the migration, where touching the table type deadlocks.
    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;

    DECLARE @ids [${flyway:defaultSchema}].[OrderHeaderIDList];
    INSERT INTO @ids (ID)
        SELECT OrderHeaderID FROM inserted WHERE ScheduleReduction IS NOT NULL
        UNION
        SELECT OrderHeaderID FROM deleted WHERE ScheduleReduction IS NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM @ids) RETURN;
    EXEC [${flyway:defaultSchema}].[spRecalcOrderHeaderTotals] @ids;
END;
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above, regenerated for the combined PR
-- (bizapps-orders#645) against a database built from its migrations: the three new
-- Order Concessions fields, the Dispute and AmountChanged value-list values, the
-- Order Header Payment Schedules relationship, FK indexes, vwOrderConcessions, CRUD
-- procs (with the referral, signed-amendment and term-date columns earlier migrations
-- added), permissions and Order Concessions' validators. Left out: validators the run
-- regenerated for other entities; they are not this change's.
-- =============================================================================


/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9cf7d91a-59ca-44e0-912c-98081b2b2089' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'NewAmount')) BEGIN
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
            '9cf7d91a-59ca-44e0-912c-98081b2b2089',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'NewAmount',
            'New Amount',
            'For an amount change, the term''s new amount: net of discount, before tax, and lower than its amount when recorded. NULL for every other concession.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6b3f6ea7-3fbf-4150-888c-ed33252c9927' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'AppliesToPaymentScheduleID')) BEGIN
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
            '6b3f6ea7-3fbf-4150-888c-ed33252c9927',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'AppliesToPaymentScheduleID',
            'Applies To Payment Schedule ID',
            'For an amount change about one invoice, the invoiced instalment it is about. NULL spreads the reduction over the instalments not yet invoiced.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '70b2f621-69a2-49f5-9fcc-3f3e04d189b7' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'ScheduleReduction')) BEGIN
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
            '70b2f621-69a2-49f5-9fcc-3f3e04d189b7',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'ScheduleReduction',
            'Schedule Reduction',
            'For an approved amount change, the reduction and its tax taken off the order''s instalments not yet invoiced. The order''s balance and its schedule check subtract it from the booked lines. Set by the server when the change is applied.',
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

/* SQL text to insert entity field value with ID 15a49ff3-554f-4a1a-9baf-18e8fe7453b4 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('15a49ff3-554f-4a1a-9baf-18e8fe7453b4', '44330A58-EAC2-4B6B-A834-F5C3E33BC8F2', 1, 'Dispute', 'Dispute', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=2 WHERE ID='078F1818-DDAC-4B38-990E-C07589AC37FE';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=3 WHERE ID='2AAA6755-5100-4990-8292-75CE81E0F2F0';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='6CBB848E-A1B2-4D67-8947-32EB7ADC9205';

/* SQL text to insert entity field value with ID ad091492-029b-4138-90bd-4bd8b67cc6c0 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ad091492-029b-4138-90bd-4bd8b67cc6c0', 'E2EDA043-B7D5-45C9-8606-AF585833EB10', 2, 'AmountChanged', 'AmountChanged', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=3 WHERE ID='AAFE86AB-C59F-4DBF-80C3-EBAA173FD6B7';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='CFE9AC5A-D2AE-4D6E-B696-9C2C9D8B6CD4';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='5644D706-A91A-4345-91D0-3AAAC31F9195';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=6 WHERE ID='D2964612-B74A-4DC8-B494-8E615404A3FA';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=7 WHERE ID='547A82EC-F15E-41E0-8FF7-DF40850CF51F';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=8 WHERE ID='CEF6095C-9F0E-4522-8F59-33D013F38114';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=9 WHERE ID='0C002CE3-4C41-4D06-A934-CA7E745C3F5B';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=10 WHERE ID='93F6F9C3-CCA0-4073-8E50-0377DEC3A69A';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=11 WHERE ID='56C03837-0A43-45A7-9061-F405D7D06374';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=12 WHERE ID='673968EA-DBE8-47D4-BFC1-92C3BF7F5238';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=13 WHERE ID='F51C8686-A10E-4655-A06C-466B469B89E6';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=14 WHERE ID='706BBA1B-51E8-4664-A471-7A99E3FC9808';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=15 WHERE ID='D9945CF3-A591-4C90-9384-287538F38E14';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=16 WHERE ID='8079E095-2576-49E6-8718-49D0AEC04981';


/* Create Entity Relationship: MJ_BizApps_Orders: Order Header Payment Schedules -> MJ_BizApps_Orders: Order Concessions (One To Many via AppliesToPaymentScheduleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'f8eb3ef8-738d-4ece-ac3a-699a6ac1e54d'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f8eb3ef8-738d-4ece-ac3a-699a6ac1e54d', 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'AppliesToPaymentScheduleID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
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
    mjBizAppsOrdersReferralProgram_ReferralProgramID.[Name] AS [ReferralProgram]
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
    @ScheduleReduction decimal(18, 2) = NULL
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
                [ScheduleReduction]
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
                CASE WHEN @ScheduleReduction_Clear = 1 THEN NULL ELSE ISNULL(@ScheduleReduction, NULL) END
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
                [ScheduleReduction]
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
                CASE WHEN @ScheduleReduction_Clear = 1 THEN NULL ELSE ISNULL(@ScheduleReduction, NULL) END
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
    @ScheduleReduction decimal(18, 2) = NULL
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
        [ScheduleReduction] = CASE WHEN @ScheduleReduction_Clear = 1 THEN NULL ELSE ISNULL(@ScheduleReduction, [ScheduleReduction]) END
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

/* Set categories for 3 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.NewAmount 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9CF7D91A-59CA-44E0-912C-98081B2B2089';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.AppliesToPaymentScheduleID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Applies To Payment Schedule'
WHERE 
   ID = '6B3F6EA7-3FBF-4150-888C-ED33252C9927';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.ScheduleReduction 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Value and Limits',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '70B2F621-69A2-49F5-9FCC-3F3E04D189B7';

/* Generated Validation Functions for MJ_BizApps_Orders: Order Concessions */
-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('50f4dde8-f816-4e5a-a7e1-b3d88431e203', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(NOT ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [PriorStartDate] IS NULL AND [PriorEndDate] IS NULL AND [NewStartDate] IS NULL AND [NewEndDate] IS NULL OR ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [SubscriptionTermID] IS NOT NULL AND [PriorStartDate] IS NOT NULL AND [PriorEndDate] IS NOT NULL AND [NewStartDate] IS NOT NULL AND [NewEndDate] IS NOT NULL AND [NewEndDate]>=[NewStartDate] AND [AddedQuantity] IS NULL AND [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL AND ([DeliveryForm]=''Shift'' AND datediff(day,[PriorStartDate],[NewStartDate])=datediff(day,[PriorEndDate],[NewEndDate]) AND [NewStartDate]<>[PriorStartDate] OR [DeliveryForm]=''Shorten'' AND [NewStartDate]>=[PriorStartDate] AND [NewEndDate]<=[PriorEndDate] AND ([NewStartDate]<>[PriorStartDate] OR [NewEndDate]<>[PriorEndDate])))', 'public ValidateDeliveryFormDateAndTermConstraints(result: ValidationResult) {
	const isShiftOrShorten = this.DeliveryForm === "Shorten" || this.DeliveryForm === "Shift";

	if (!isShiftOrShorten) {
		if (this.PriorStartDate != null || this.PriorEndDate != null || this.NewStartDate != null || this.NewEndDate != null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Prior and New Start/End dates must be empty when Delivery Form is not ''Shorten'' or ''Shift''.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	} else {
		if (this.SubscriptionTermID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"SubscriptionTermID",
				"Subscription Term is required when Delivery Form is ''Shorten'' or ''Shift''.",
				this.SubscriptionTermID,
				ValidationErrorType.Failure
			));
		}

		if (this.PriorStartDate == null || this.PriorEndDate == null || this.NewStartDate == null || this.NewEndDate == null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Prior and New Start/End dates are required when Delivery Form is ''Shorten'' or ''Shift''.",
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

			if (this.DeliveryForm === "Shift") {
				const startShiftDays = Math.round((newStart - priorStart) / (1000 * 60 * 60 * 24));
				const endShiftDays = Math.round((newEnd - priorEnd) / (1000 * 60 * 60 * 24));

				if (startShiftDays !== endShiftDays || newStart === priorStart) {
					result.Errors.push(new ValidationErrorInfo(
						"DeliveryForm",
						"When shifting delivery dates, the start and end dates must shift by the exact same number of days and cannot equal the prior start date.",
						this.DeliveryForm,
						ValidationErrorType.Failure
					));
				}
			} else if (this.DeliveryForm === "Shorten") {
				const isWithinPriorRange = newStart >= priorStart && newEnd <= priorEnd;
				const isShortened = newStart !== priorStart || newEnd !== priorEnd;

				if (!isWithinPriorRange || !isShortened) {
					result.Errors.push(new ValidationErrorInfo(
						"DeliveryForm",
						"When shortening delivery dates, the new dates must fall within the prior date range and must shorten either the start or end date.",
						this.DeliveryForm,
						ValidationErrorType.Failure
					));
				}
			}
		}

		if (this.AddedQuantity != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AddedQuantity",
				"Added Quantity must be empty when Delivery Form is ''Shorten'' or ''Shift''.",
				this.AddedQuantity,
				ValidationErrorType.Failure
			));
		}

		if (this.PriorPaymentTermsTypeID != null || this.NewPaymentTermsTypeID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Prior and New Payment Terms Types must be empty when Delivery Form is ''Shorten'' or ''Shift''.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Ensures that when a delivery form is set to ''Shorten'' or ''Shift'', required subscription terms and adjusted date ranges are specified properly—with shifts shifting both dates equally and shortenings reducing the schedule within existing boundaries—while prohibiting dates and payment term overrides for other delivery forms.', 'ValidateDeliveryFormDateAndTermConstraints', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('f3feb274-de9e-40c8-89f9-a7cc94885ff7', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Duration'' OR [SubscriptionTermID] IS NOT NULL AND [AddedDays]>(0))', 'public ValidateDeliveryFormDurationRequirements(result: ValidationResult): void {
	if (this.DeliveryForm === ''Duration'') {
		if (this.SubscriptionTermID == null || this.AddedDays == null || this.AddedDays <= 0) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"When the delivery form is set to ''Duration'', a valid subscription term must be selected and added days must be greater than 0.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When the delivery form is set to ''Duration'', a subscription term must be associated and the number of added days must be greater than zero.', 'ValidateDeliveryFormDurationRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('96316748-a9a3-46ee-a169-f2240c30d1c3', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Terms'' OR [NewPaymentTermsTypeID] IS NOT NULL AND ([PriorPaymentTermsTypeID] IS NULL OR [PriorPaymentTermsTypeID]<>[NewPaymentTermsTypeID]) AND [AddedDays] IS NOT NULL AND [OrderLineID] IS NULL AND [SubscriptionTermID] IS NULL AND [AddedQuantity] IS NULL)', 'public ValidateDeliveryFormTermsRequirements(result: ValidationResult): void {
	if (this.DeliveryForm === "Terms") {
		if (this.NewPaymentTermsTypeID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"NewPaymentTermsTypeID",
				"New payment terms type is required when delivery form is Terms.",
				this.NewPaymentTermsTypeID,
				ValidationErrorType.Failure
			));
		}
		if (this.PriorPaymentTermsTypeID != null && this.NewPaymentTermsTypeID != null && this.PriorPaymentTermsTypeID === this.NewPaymentTermsTypeID) {
			result.Errors.push(new ValidationErrorInfo(
				"NewPaymentTermsTypeID",
				"New payment terms type must be different from prior payment terms type.",
				this.NewPaymentTermsTypeID,
				ValidationErrorType.Failure
			));
		}
		if (this.AddedDays == null) {
			result.Errors.push(new ValidationErrorInfo(
				"AddedDays",
				"Added days is required when delivery form is Terms.",
				this.AddedDays,
				ValidationErrorType.Failure
			));
		}
		if (this.OrderLineID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"OrderLineID",
				"Order line ID must be empty when delivery form is Terms.",
				this.OrderLineID,
				ValidationErrorType.Failure
			));
		}
		if (this.SubscriptionTermID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"SubscriptionTermID",
				"Subscription term ID must be empty when delivery form is Terms.",
				this.SubscriptionTermID,
				ValidationErrorType.Failure
			));
		}
		if (this.AddedQuantity != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AddedQuantity",
				"Added quantity must be empty when delivery form is Terms.",
				this.AddedQuantity,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When the delivery form is set to ''Terms'', a new payment terms type and added days must be specified, the new payment terms must differ from prior payment terms, and order line, subscription term, and added quantity must be empty.', 'ValidateDeliveryFormTermsRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('d48d314b-0d54-4973-9e48-5628b776d6e4', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([NewAmount] IS NULL OR [DeliveryForm]=''Price'' AND [SubscriptionTermID] IS NOT NULL AND [OrderLineID] IS NOT NULL AND [NewAmount]>(0))', 'public ValidateNewAmountPriceRequirements(result: ValidationResult) {
	if (this.NewAmount != null) {
		if (this.NewAmount <= 0) {
			result.Errors.push(new ValidationErrorInfo(
				"NewAmount",
				"New amount must be greater than zero when provided.",
				this.NewAmount,
				ValidationErrorType.Failure
			));
		}
		if (this.DeliveryForm !== "Price") {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Delivery form must be ''Price'' when a new amount is provided.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
		if (this.SubscriptionTermID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"SubscriptionTermID",
				"Subscription term is required when a new amount is provided.",
				this.SubscriptionTermID,
				ValidationErrorType.Failure
			));
		}
		if (this.OrderLineID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"OrderLineID",
				"Order line is required when a new amount is provided.",
				this.OrderLineID,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If a new amount is specified, it must be greater than zero, the delivery form must be ''Price'', and both a subscription term and an order line must be associated.', 'ValidateNewAmountPriceRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('6159e726-90c4-4489-86e7-205f580f9300', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([NewAmount] IS NOT NULL OR [AppliesToPaymentScheduleID] IS NULL AND [ScheduleReduction] IS NULL)', 'public ValidateNewAmountRequirementForScheduleAdjustments(result: ValidationResult) {
	if (this.NewAmount == null && (this.AppliesToPaymentScheduleID != null || this.ScheduleReduction != null)) {
		result.Errors.push(new ValidationErrorInfo(
			"NewAmount",
			"A New Amount is required when specifying Applies To Payment Schedule or Schedule Reduction.",
			this.NewAmount,
			ValidationErrorType.Failure
		));
	}
}', 'When specifying payment schedule adjustments (Applies To Payment Schedule or Schedule Reduction), a New Amount must be provided.', 'ValidateNewAmountRequirementForScheduleAdjustments', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('6794f43e-cb3c-4a41-815c-a0cdcf8e0415', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(NOT ([DeliveryForm]=''Scope'' OR [DeliveryForm]=''Price'') OR [OrderLineID] IS NOT NULL)', 'public ValidateOrderLineIDForDeliveryForm(result: ValidationResult) {
	if ((this.DeliveryForm === ''Scope'' || this.DeliveryForm === ''Price'') && this.OrderLineID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"OrderLineID",
			"An Order Line is required when Delivery Form is set to ''Scope'' or ''Price''.",
			this.OrderLineID,
			ValidationErrorType.Failure
		));
	}
}', 'If the delivery form is ''Scope'' or ''Price'', an order line must be specified to maintain proper order tracking.', 'ValidateOrderLineIDForDeliveryForm', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('f29e9626-cc70-4ce9-9383-969c8ee6e594', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DeliveryForm]=''Terms'' OR [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL)', 'public ValidatePaymentTermsTypeFieldsForDeliveryForm(result: ValidationResult) {
	if (this.DeliveryForm !== ''Terms'' && (this.PriorPaymentTermsTypeID != null || this.NewPaymentTermsTypeID != null)) {
		result.Errors.push(new ValidationErrorInfo(
			"DeliveryForm",
			"Prior and New Payment Terms Types can only be specified when DeliveryForm is set to ''Terms''.",
			this.DeliveryForm,
			ValidationErrorType.Failure
		));
	}
}', 'Payment terms types can only be specified when the delivery form is ''Terms''. For all other delivery forms, prior and new payment terms must be left blank.', 'ValidatePaymentTermsTypeFieldsForDeliveryForm', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('0ee93519-7c19-4631-85f6-8376e0557d3a', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ScheduleReduction] IS NULL OR [ScheduleReduction]>(0) AND [Status]=''Approved'')', '	public ValidateScheduleReductionRequirement(result: ValidationResult) {
		if (this.ScheduleReduction != null && (this.ScheduleReduction <= 0 || this.Status !== ''Approved'')) {
			result.Errors.push(new ValidationErrorInfo(
				"ScheduleReduction",
				"A schedule reduction must be greater than zero and requires the status to be Approved.",
				this.ScheduleReduction,
				ValidationErrorType.Failure
			));
		}
	}', 'If a schedule reduction is specified, it must be greater than zero and can only be applied when the status is Approved.', 'ValidateScheduleReductionRequirement', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('f1ad9409-1fd2-4fe5-b9fe-c822ffd37360', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Seats'' OR [OrderLineID] IS NOT NULL AND [AddedQuantity]>(0))', 'public ValidateSeatsDeliveryFormRequirements(result: ValidationResult) {
	if (this.DeliveryForm === ''Seats'') {
		if (this.OrderLineID == null || this.AddedQuantity == null || this.AddedQuantity <= 0) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"When delivery form is ''Seats'', an order line must be specified and added quantity must be greater than zero.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When the delivery form is set to ''Seats'', an associated order line must be specified and the added quantity must be greater than zero.', 'ValidateSeatsDeliveryFormRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;


