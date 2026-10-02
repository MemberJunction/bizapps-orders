-- =============================================================================
-- V202610011700 — Payment terms on a confirmed order change only through an
-- approved concession (#309)
-- =============================================================================
-- A confirmed order's PaymentTermsTypeID stayed editable, and nothing approved a
-- change to it. Payment terms are a commercial concession: they move when the cash
-- arrives without changing the price.
--
-- What this file does, in order:
--   1. OrderConcession gains a Terms delivery form, carrying the prior and new
--      payment terms. Its value is the change in days to payment, held in
--      AddedDays; it has no currency value.
--   2. Redefines trg_OrderHeader_ImmutableAfterConfirm to add 51018: on a
--      confirmed order, PaymentTermsTypeID changes only to match the order's
--      latest approved Terms concession, prior terms to new. Every check the
--      trigger already runs (51014, 51013, 51015, 51017) is carried forward
--      unchanged from V202609291302.
--
-- DueDate stays writable on a confirmed order; MJ record-change tracking records
-- every change to it.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. OrderConcession: the Terms form
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD
    [PriorPaymentTermsTypeID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_OrderConcession_PriorPaymentTermsType] FOREIGN KEY
        REFERENCES [${flyway:defaultSchema}].[PaymentTermsType]([ID]);
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD
    [NewPaymentTermsTypeID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_OrderConcession_NewPaymentTermsType] FOREIGN KEY
        REFERENCES [${flyway:defaultSchema}].[PaymentTermsType]([ID]);
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] DROP CONSTRAINT [CK_OrderConcession_DeliveryForm];
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD CONSTRAINT [CK_OrderConcession_DeliveryForm]
    CHECK ([DeliveryForm] IN ('Price','Duration','Scope','Seats','Terms'));
GO

-- A Terms concession names the order only, its new terms, and the change in days. The prior terms may be
-- NULL: an order with no terms was due on receipt.
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD CONSTRAINT [CK_OrderConcession_Terms]
    CHECK ([DeliveryForm] <> 'Terms' OR (
        [NewPaymentTermsTypeID] IS NOT NULL
        AND ([PriorPaymentTermsTypeID] IS NULL OR [PriorPaymentTermsTypeID] <> [NewPaymentTermsTypeID])
        AND [AddedDays] IS NOT NULL
        AND [OrderLineID] IS NULL
        AND [SubscriptionTermID] IS NULL
        AND [AddedQuantity] IS NULL
    ));
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD CONSTRAINT [CK_OrderConcession_TermsOnly]
    CHECK ([DeliveryForm] = 'Terms' OR ([PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL));
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'How the value was given: Price (a lower price than the price engine''s), Duration (a term extended at no charge), Scope (a product added at no charge), Seats (quantity added at no charge), Terms (a confirmed order''s payment terms changed).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'DeliveryForm';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a Terms concession, the order''s payment terms before the change. NULL when the order had none and was due on receipt.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'PriorPaymentTermsTypeID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a Terms concession, the payment terms the order moves to when it is approved.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'NewPaymentTermsTypeID';
GO



-- -----------------------------------------------------------------------------
-- 2. trg_OrderHeader_ImmutableAfterConfirm: 51018
-- -----------------------------------------------------------------------------
-- Checks, in the order they run:
--   51014  Status cannot leave Confirmed.
--   51013  A confirmed order's OrderDate, CompanyID, OrderType,
--          ReversesOrderHeaderID and a set bill-to party cannot change.
--   51015  On a confirmed order a set bill-to or ship-to address cannot change,
--          and an empty one is filled only together with its snapshot. A written
--          address snapshot never changes, on any status.
--   51017  Once ConfirmedAt is set, ConfirmedByUserID cannot change.
--   51018  On a confirmed order PaymentTermsTypeID changes only to match the
--          order's latest approved Terms concession, prior terms to new.
--
-- Each check is judged by the PRIOR row (deleted), so the confirming or booking
-- UPDATE itself passes and every later write is checked. 51013-51015 and 51018
-- key on the prior Status. 51017 keys on the prior ConfirmedAt, not Status: an order the
-- data conversion created Confirmed with no ConfirmedAt is booked by its next
-- save, and that save must be allowed to write ConfirmedByUserID.
--
-- Nullable columns are compared with EXISTS / EXCEPT, which treats two NULLs as
-- equal and a NULL against a value as a change.
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_OrderHeader_ImmutableAfterConfirm]
ON [${flyway:defaultSchema}].[OrderHeader]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Every check below needs a prior row that is Confirmed, booked, or carries
    -- a snapshot. A write to draft orders only stops here.
    IF NOT EXISTS (
        SELECT 1
        FROM deleted
        WHERE Status = 'Confirmed'
           OR ConfirmedAt IS NOT NULL
           OR BillToAddressSnapshot IS NOT NULL
           OR ShipToAddressSnapshot IS NOT NULL
    ) RETURN;

    -- 51014: Status never leaves Confirmed. Corrections go through a reversal order.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.Status = 'Confirmed'
          AND i.Status <> 'Confirmed'
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51014, 'OrderHeader.Status cannot leave Confirmed (the order is booked under journal entries). Use a reversal order.', 1;
    END;

    -- 51013: the booked sale: who sold, to whom, when, and what kind of order it is.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.Status = 'Confirmed'
          AND (
            i.OrderDate <> d.OrderDate OR
            i.CompanyID <> d.CompanyID OR
            i.OrderType <> d.OrderType OR
            EXISTS (SELECT i.ReversesOrderHeaderID EXCEPT SELECT d.ReversesOrderHeaderID) OR
            -- Bill-to: set-once. An empty party may be filled; a set one may not change.
            (d.BillToOrganizationID IS NOT NULL
                AND EXISTS (SELECT i.BillToOrganizationID EXCEPT SELECT d.BillToOrganizationID)) OR
            (d.BillToPersonID IS NOT NULL
                AND EXISTS (SELECT i.BillToPersonID EXCEPT SELECT d.BillToPersonID))
          )
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51013, 'OrderHeader OrderDate, CompanyID, OrderType, ReversesOrderHeaderID and a set bill-to party cannot be changed once the order is Confirmed. Use a reversal order.', 1;
    END;

    -- 51015: the order keeps the address it was sold to. The snapshot conditions
    -- do not depend on status: a written snapshot is final even if the order's
    -- status were moved by direct SQL.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE (
                d.Status = 'Confirmed'
                AND (
                    (d.BillToAddressID IS NOT NULL
                        AND EXISTS (SELECT i.BillToAddressID EXCEPT SELECT d.BillToAddressID)) OR
                    (d.ShipToAddressID IS NOT NULL
                        AND EXISTS (SELECT i.ShipToAddressID EXCEPT SELECT d.ShipToAddressID)) OR
                    (d.BillToAddressID IS NULL AND i.BillToAddressID IS NOT NULL
                        AND i.BillToAddressSnapshot IS NULL) OR
                    (d.ShipToAddressID IS NULL AND i.ShipToAddressID IS NOT NULL
                        AND i.ShipToAddressSnapshot IS NULL)
                )
              )
           OR (d.BillToAddressSnapshot IS NOT NULL
                AND EXISTS (SELECT i.BillToAddressSnapshot EXCEPT SELECT d.BillToAddressSnapshot))
           OR (d.ShipToAddressSnapshot IS NOT NULL
                AND EXISTS (SELECT i.ShipToAddressSnapshot EXCEPT SELECT d.ShipToAddressSnapshot))
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51015, 'OrderHeader bill-to and ship-to addresses cannot be replaced once the order is Confirmed, and an empty one can be filled only together with its snapshot; the order keeps the address it was sold to. Use a reversal order.', 1;
    END;

    -- 51017: who confirmed the order is written once, by the booking save. An
    -- order booked before the column existed keeps NULL.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.ConfirmedAt IS NOT NULL
          AND EXISTS (SELECT i.ConfirmedByUserID EXCEPT SELECT d.ConfirmedByUserID)
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51017, 'OrderHeader.ConfirmedByUserID cannot be changed once the order is booked: it records who confirmed the order, and is written only by the booking save.', 1;
    END;

    -- 51018: payment terms are a commercial concession. The approval applies the
    -- change in its own transaction: the concession is saved Approved, then the
    -- header is updated, so the concession is visible here. Matching the LATEST
    -- approved Terms concession, not any, keeps an old approval from being
    -- replayed: once a later change is approved, an earlier one no longer matches.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.Status = 'Confirmed'
          AND EXISTS (SELECT i.PaymentTermsTypeID EXCEPT SELECT d.PaymentTermsTypeID)
          AND NOT EXISTS (
              SELECT 1
              FROM (
                  SELECT TOP 1 c.PriorPaymentTermsTypeID, c.NewPaymentTermsTypeID
                  FROM [${flyway:defaultSchema}].[OrderConcession] c
                  WHERE c.OrderHeaderID = d.ID
                    AND c.DeliveryForm = 'Terms'
                    AND c.Status = 'Approved'
                  ORDER BY c.DecidedAt DESC, c.ID DESC
              ) latest
              WHERE EXISTS (SELECT latest.PriorPaymentTermsTypeID INTERSECT SELECT d.PaymentTermsTypeID)
                AND latest.NewPaymentTermsTypeID = i.PaymentTermsTypeID
          )
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51018, 'OrderHeader.PaymentTermsTypeID cannot be changed once the order is Confirmed except by an approved Terms concession. Use Orders.AmendArrangement.', 1;
    END;
END;
GO



















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above: the two new Order Concessions
-- fields and their virtual name fields, the Terms value-list value, the Payment
-- Terms Types relationships, FK indexes, vwOrderConcessions, CRUD procs and
-- permissions. Carved from the run: blocks for entities this change does not
-- touch were dropped. Every EntityField Sequence is an apply-time MAX(Sequence)+1
-- rather than CodeGen's literal, and the +100000 bump blocks are removed with them.
-- =============================================================================

/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1bce78d4-8042-4548-a878-3a964cec4b41' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'PriorPaymentTermsTypeID')) BEGIN
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
            '1bce78d4-8042-4548-a878-3a964cec4b41',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'PriorPaymentTermsTypeID',
            'Prior Payment Terms Type ID',
            'For a Terms concession, the order''s payment terms before the change. NULL when the order had none and was due on receipt.',
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
            'F6B29704-686E-47BF-B01C-61F7B99BDFFD',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '420e6c20-2630-432e-95bd-10ec30ab51c9' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'NewPaymentTermsTypeID')) BEGIN
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
            '420e6c20-2630-432e-95bd-10ec30ab51c9',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'NewPaymentTermsTypeID',
            'New Payment Terms Type ID',
            'For a Terms concession, the payment terms the order moves to when it is approved.',
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
            'F6B29704-686E-47BF-B01C-61F7B99BDFFD',
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

/* SQL text to insert entity field value with ID c892eb79-8175-40e7-aa5d-28ac06c13214 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c892eb79-8175-40e7-aa5d-28ac06c13214', '8662A268-9580-42FD-9D59-A91BE9237AE9', 5, 'Terms', 'Terms', GETUTCDATE(), GETUTCDATE());


/* Create Entity Relationship: MJ_BizApps_Orders: Payment Terms Types -> MJ_BizApps_Orders: Order Concessions (One To Many via PriorPaymentTermsTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'b65b0ef9-3c70-4cfb-8cd7-2aa52336daf0'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b65b0ef9-3c70-4cfb-8cd7-2aa52336daf0', 'F6B29704-686E-47BF-B01C-61F7B99BDFFD', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'PriorPaymentTermsTypeID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Orders: Payment Terms Types -> MJ_BizApps_Orders: Order Concessions (One To Many via NewPaymentTermsTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '4385a5d2-2da8-4095-8908-bd1f420232f4'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4385a5d2-2da8-4095-8908-bd1f420232f4', 'F6B29704-686E-47BF-B01C-61F7B99BDFFD', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'NewPaymentTermsTypeID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID 1BCE78D4-8042-4548-A878-3A964CEC4B41 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1BCE78D4-8042-4548-A878-3A964CEC4B41', @RelatedEntityNameFieldMap='PriorPaymentTermsType';

/* SQL text to update entity field related entity name field map for entity field ID 420E6C20-2630-432E-95BD-10EC30AB51C9 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='420E6C20-2630-432E-95BD-10EC30AB51C9', @RelatedEntityNameFieldMap='NewPaymentTermsType';

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
    @NewPaymentTermsTypeID uniqueidentifier = NULL
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
                [NewPaymentTermsTypeID]
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
                CASE WHEN @NewPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@NewPaymentTermsTypeID, NULL) END
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
                [NewPaymentTermsTypeID]
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
                CASE WHEN @NewPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@NewPaymentTermsTypeID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderConcessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Concessions */

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
    @NewPaymentTermsTypeID uniqueidentifier = NULL
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
        [NewPaymentTermsTypeID] = CASE WHEN @NewPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@NewPaymentTermsTypeID, [NewPaymentTermsTypeID]) END
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Concessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '163fd39e-c1a4-4bcc-aeae-382967131c2a' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'PriorPaymentTermsType')) BEGIN
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
            '163fd39e-c1a4-4bcc-aeae-382967131c2a',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'PriorPaymentTermsType',
            'Prior Payment Terms Type',
            NULL,
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '170a0156-edfa-452c-a627-95b51bdb832b' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'NewPaymentTermsType')) BEGIN
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
            '170a0156-edfa-452c-a627-95b51bdb832b',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'NewPaymentTermsType',
            'New Payment Terms Type',
            NULL,
            'nvarchar',
            400,
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

