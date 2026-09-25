-- Payment-gated access: hold new access until the first payment, and cut renewals off when they
-- go unpaid (bc-aidp-next-golive#223).
--
-- A NEW GRANT TIMING, OnFirstPayment. It states the payment-and-access rule as one policy, resolved
-- down the same product -> category -> product type walk the other timings use:
--   · a NEW purchase is written Suspended and becomes Active once the first amount due has been paid
--     (the first instalment of each company's schedule, or the whole order when it has none);
--   · a RENEWAL is Active at confirm — the customer already has the service — and is suspended once
--     the renewal order is a configured number of days past due (the Orders application setting
--     RenewalAccessCutoffDaysPastDue).
-- Nothing is switched to it here. Which products carry it is configuration.
--
-- THREE COLUMNS ON EntitlementGrant.
--   GrantTimingApplied  which timing produced the grant, recorded at confirm. Access is re-decided
--                       every time the order's cash moves, and that has to read the rule the grant
--                       was written under rather than re-walk a catalog that may have changed since.
--                       NULL on grants written before this column existed.
--   SuspendedAt,        when and why the grant was last suspended. Same reasoning as RevokedAt and
--   SuspensionReason    RevocationReason: a suspension is an event, and "why can't I get in?" is the
--                       support question it answers. The reason also tells the re-decision which
--                       suspensions are its own to lift — a PastDue or AwaitingPayment grant clears
--                       when the cash arrives; anything else is left for a person.
--
-- ONE COLUMN ON PaymentHeader: ReversalSource. A refund the seller decides on (Orders.RefundPayment)
-- and a debit the bank takes back (ACH settlement) write the same reversal, and access has to tell
-- them apart: a bank return takes access away with the cash, a refund does not. Without this, a
-- customer who returned one line of a paid order and was refunded for it lost access to the rest.
-- Existing reversals are backfilled from the description settlement writes ("Return of ...").

ALTER TABLE __mj_BizAppsOrders.ProductType DROP CONSTRAINT CK_ProductType_EntGrantTiming;
ALTER TABLE __mj_BizAppsOrders.ProductType ADD CONSTRAINT CK_ProductType_EntGrantTiming
    CHECK (DefaultEntitlementGrantTiming IN ('OnConfirm','OnPaidInFull','OnFirstPayment','OnActivation'));

ALTER TABLE __mj_BizAppsOrders.ProductCategory DROP CONSTRAINT CK_ProductCategory_EntGrantTiming;
ALTER TABLE __mj_BizAppsOrders.ProductCategory ADD CONSTRAINT CK_ProductCategory_EntGrantTiming
    CHECK (DefaultEntitlementGrantTiming IS NULL OR DefaultEntitlementGrantTiming IN ('OnConfirm','OnPaidInFull','OnFirstPayment','OnActivation'));

ALTER TABLE __mj_BizAppsOrders.Product DROP CONSTRAINT CK_Product_EntGrantTiming;
ALTER TABLE __mj_BizAppsOrders.Product ADD CONSTRAINT CK_Product_EntGrantTiming
    CHECK (EntitlementGrantTiming IS NULL OR EntitlementGrantTiming IN ('OnConfirm','OnPaidInFull','OnFirstPayment','OnActivation'));
GO

ALTER TABLE __mj_BizAppsOrders.EntitlementGrant ADD
    GrantTimingApplied NVARCHAR(20) NULL,
    SuspendedAt DATETIMEOFFSET NULL,
    SuspensionReason NVARCHAR(20) NULL,
    CONSTRAINT CK_EntitlementGrant_GrantTimingApplied CHECK (GrantTimingApplied IS NULL OR GrantTimingApplied IN ('OnConfirm','OnPaidInFull','OnFirstPayment','OnActivation')),
    CONSTRAINT CK_EntitlementGrant_SuspensionReason CHECK (SuspensionReason IS NULL OR SuspensionReason IN ('AwaitingPayment','PastDue','AwaitingActivation')),
    -- An Active grant carries no suspension: lifting one clears both columns, so an Active row
    -- cannot read as "suspended". A grant revoked or expired while suspended keeps them, as the
    -- record of what it was when it ended. Suspended rows written before this migration have
    -- neither, which is why a suspension is not required to carry them.
    CONSTRAINT CK_EntitlementGrant_Suspension CHECK (Status <> 'Active' OR (SuspendedAt IS NULL AND SuspensionReason IS NULL));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The grant timing that produced this grant (OnConfirm, OnPaidInFull, OnFirstPayment, OnActivation), resolved at confirm from product, category and product type. Access is re-decided from this when the order''s payments change. NULL on grants written before the column existed.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementGrant',
    @level2type = N'COLUMN', @level2name = N'GrantTimingApplied';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the grant was last suspended. Set together with SuspensionReason and cleared when the grant becomes Active again.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementGrant',
    @level2type = N'COLUMN', @level2name = N'SuspendedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Why the grant is suspended: AwaitingPayment (a new purchase whose first payment has not been received), PastDue (a renewal past the configured cutoff), or AwaitingActivation. AwaitingPayment and PastDue are lifted automatically when payment arrives.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementGrant',
    @level2type = N'COLUMN', @level2name = N'SuspensionReason';
GO

-- The pairing CHECK is added after the backfill, since existing reversals carry no source until then.
ALTER TABLE __mj_BizAppsOrders.PaymentHeader ADD
    ReversalSource NVARCHAR(20) NULL,
    CONSTRAINT CK_PaymentHeader_ReversalSource CHECK (ReversalSource IS NULL OR ReversalSource IN ('Refund','BankReturn'));
GO

UPDATE __mj_BizAppsOrders.PaymentHeader
SET ReversalSource = CASE WHEN Description LIKE 'Return of %' THEN 'BankReturn' ELSE 'Refund' END
WHERE ReversesPaymentHeaderID IS NOT NULL;
GO

-- Every reversal says who took the money back, and nothing else carries a source.
ALTER TABLE __mj_BizAppsOrders.PaymentHeader ADD CONSTRAINT CK_PaymentHeader_ReversalSourcePaired
    CHECK ((ReversesPaymentHeaderID IS NULL AND ReversalSource IS NULL) OR (ReversesPaymentHeaderID IS NOT NULL AND ReversalSource IS NOT NULL));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Who took the money back on a reversal: Refund (the seller chose to, via Orders.RefundPayment) or BankReturn (the bank reversed a debit). Set on every reversal and on nothing else. A bank return removes payment-gated access; a refund does not.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'PaymentHeader',
    @level2type = N'COLUMN', @level2name = N'ReversalSource';
GO


















































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen against the hand-authored DDL above, with the
--   ${flyway:defaultSchema} / ${mjSchema} placeholders it already substitutes.
--
--   Only the sections for this change: the three new MJ_BizApps_Orders: Entitlement
--   Grants fields and their value lists, OnFirstPayment added to the three grant-timing
--   value lists, and the regenerated vwEntitlementGrants and its CRUD procedures; then
--   PaymentHeader.ReversalSource with its value list, and the regenerated vwPaymentHeaders
--   and its CRUD procedures. A CodeGen run re-emits objects this change never touched;
--   those are left out.
--
--   Each EntityField Sequence is an apply-time MAX(Sequence) + 1 rather than the literal
--   CodeGen emits, and CodeGen's +100000 renumbering block is removed with it (MJ's
--   migration rule; gate: check-migration-entityfield-sequence.mjs).
--
-- =============================================================================

/* SQL text to insert 3 new entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bdb7b969-a58a-4273-931d-9bd37ac0693e' OR (EntityID = '9E638C8F-6447-45D9-9137-B24E1047BCE5' AND Name = 'GrantTimingApplied')) BEGIN
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
            'bdb7b969-a58a-4273-931d-9bd37ac0693e',
            '9E638C8F-6447-45D9-9137-B24E1047BCE5', -- Entity: MJ_BizApps_Orders: Entitlement Grants
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9E638C8F-6447-45D9-9137-B24E1047BCE5') + 1,
            'GrantTimingApplied',
            'Grant Timing Applied',
            'The grant timing that produced this grant (OnConfirm, OnPaidInFull, OnFirstPayment, OnActivation), resolved at confirm from product, category and product type. Access is re-decided from this when the order''s payments change. NULL on grants written before the column existed.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2f8abe8d-75f4-46a9-8c89-2182d700197e' OR (EntityID = '9E638C8F-6447-45D9-9137-B24E1047BCE5' AND Name = 'SuspendedAt')) BEGIN
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
            '2f8abe8d-75f4-46a9-8c89-2182d700197e',
            '9E638C8F-6447-45D9-9137-B24E1047BCE5', -- Entity: MJ_BizApps_Orders: Entitlement Grants
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9E638C8F-6447-45D9-9137-B24E1047BCE5') + 1,
            'SuspendedAt',
            'Suspended At',
            'When the grant was last suspended. Set together with SuspensionReason and cleared when the grant becomes Active again.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7482d14d-fc11-4db7-a5f2-820f7186e8d9' OR (EntityID = '9E638C8F-6447-45D9-9137-B24E1047BCE5' AND Name = 'SuspensionReason')) BEGIN
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
            '7482d14d-fc11-4db7-a5f2-820f7186e8d9',
            '9E638C8F-6447-45D9-9137-B24E1047BCE5', -- Entity: MJ_BizApps_Orders: Entitlement Grants
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9E638C8F-6447-45D9-9137-B24E1047BCE5') + 1,
            'SuspensionReason',
            'Suspension Reason',
            'Why the grant is suspended: AwaitingPayment (a new purchase whose first payment has not been received), PastDue (a renewal past the configured cutoff), or AwaitingActivation. AwaitingPayment and PastDue are lifted automatically when payment arrives.',
            'nvarchar',
            40,
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

/* SQL text to insert entity field value with ID 1bcbbcdc-a30d-45f0-808f-7f140a46d177 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1bcbbcdc-a30d-45f0-808f-7f140a46d177', '7463B605-D458-49D6-8D62-93DA1059275A', 3, 'OnFirstPayment', 'OnFirstPayment', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='79BF8603-ADFA-428E-BA66-ECC12D27CCC1';

/* SQL text to insert entity field value with ID af507517-6e99-415a-8f80-283b3348374e */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('af507517-6e99-415a-8f80-283b3348374e', '50759908-3245-4A3C-92F9-3ADC9185135F', 3, 'OnFirstPayment', 'OnFirstPayment', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='7401AF38-56A0-4126-BA28-E083E85A2E6A';

/* SQL text to insert entity field value with ID 27f70916-1308-4fe9-9405-7c3627579197 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('27f70916-1308-4fe9-9405-7c3627579197', '8C84CEBF-0851-4EA5-9C3F-83B663CB303F', 3, 'OnFirstPayment', 'OnFirstPayment', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='2D38E15B-B472-4920-8A84-6BBFE4698CD9';

/* SQL text to insert entity field value with ID 1e7ab2aa-b70f-497b-9879-a05e215bb53c */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1e7ab2aa-b70f-497b-9879-a05e215bb53c', 'BDB7B969-A58A-4273-931D-9BD37AC0693E', 1, 'OnActivation', 'OnActivation', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e3dbb1ef-b090-42ae-9680-fd505649ffec */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e3dbb1ef-b090-42ae-9680-fd505649ffec', 'BDB7B969-A58A-4273-931D-9BD37AC0693E', 2, 'OnConfirm', 'OnConfirm', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 87cb0b01-bf14-49cd-a5fa-fb95f49863e3 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('87cb0b01-bf14-49cd-a5fa-fb95f49863e3', 'BDB7B969-A58A-4273-931D-9BD37AC0693E', 3, 'OnFirstPayment', 'OnFirstPayment', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c788497f-571f-4cd6-8ecf-d0dc058c0b4d */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c788497f-571f-4cd6-8ecf-d0dc058c0b4d', 'BDB7B969-A58A-4273-931D-9BD37AC0693E', 4, 'OnPaidInFull', 'OnPaidInFull', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BDB7B969-A58A-4273-931D-9BD37AC0693E */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='BDB7B969-A58A-4273-931D-9BD37AC0693E';

/* SQL text to insert entity field value with ID 202a0a57-9301-4b9a-8902-111fa479e242 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('202a0a57-9301-4b9a-8902-111fa479e242', '7482D14D-FC11-4DB7-A5F2-820F7186E8D9', 1, 'AwaitingActivation', 'AwaitingActivation', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8bd376d9-cad7-41c3-9ac3-c720aebdb794 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8bd376d9-cad7-41c3-9ac3-c720aebdb794', '7482D14D-FC11-4DB7-A5F2-820F7186E8D9', 2, 'AwaitingPayment', 'AwaitingPayment', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 14f514bb-980a-43be-9cbb-527a28f40c45 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('14f514bb-980a-43be-9cbb-527a28f40c45', '7482D14D-FC11-4DB7-A5F2-820F7186E8D9', 3, 'PastDue', 'PastDue', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 7482D14D-FC11-4DB7-A5F2-820F7186E8D9 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='7482D14D-FC11-4DB7-A5F2-820F7186E8D9';

/* Base View SQL for MJ_BizApps_Orders: Entitlement Grants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Grants
-- Item: vwEntitlementGrants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Entitlement Grants
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntitlementGrant
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntitlementGrants]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntitlementGrants];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntitlementGrants]
AS
SELECT
    e.*,
    mjBizAppsOrdersProductEntitlement_ProductEntitlementID.[Name] AS [ProductEntitlement],
    mjBizAppsOrdersSubscription_SubscriptionID.[SubscriptionNumber] AS [Subscription],
    mjBizAppsCommonPerson_BeneficiaryPersonID.[DisplayName] AS [BeneficiaryPerson],
    mjBizAppsCommonOrganization_BeneficiaryOrganizationID.[Name] AS [BeneficiaryOrganization]
FROM
    [${flyway:defaultSchema}].[EntitlementGrant] AS e
INNER JOIN
    [${flyway:defaultSchema}].[ProductEntitlement] AS mjBizAppsOrdersProductEntitlement_ProductEntitlementID
  ON
    [e].[ProductEntitlementID] = mjBizAppsOrdersProductEntitlement_ProductEntitlementID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Subscription] AS mjBizAppsOrdersSubscription_SubscriptionID
  ON
    [e].[SubscriptionID] = mjBizAppsOrdersSubscription_SubscriptionID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_BeneficiaryPersonID
  ON
    [e].[BeneficiaryPersonID] = mjBizAppsCommonPerson_BeneficiaryPersonID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_BeneficiaryOrganizationID
  ON
    [e].[BeneficiaryOrganizationID] = mjBizAppsCommonOrganization_BeneficiaryOrganizationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntitlementGrants] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Entitlement Grants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Grants
-- Item: Permissions for vwEntitlementGrants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntitlementGrants] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Entitlement Grants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Grants
-- Item: spCreateEntitlementGrant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntitlementGrant
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntitlementGrant]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntitlementGrant];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntitlementGrant]
    @ID uniqueidentifier = NULL,
    @ProductEntitlementID uniqueidentifier,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @SubscriptionID_Clear bit = 0,
    @SubscriptionID uniqueidentifier = NULL,
    @BeneficiaryPersonID_Clear bit = 0,
    @BeneficiaryPersonID uniqueidentifier = NULL,
    @BeneficiaryOrganizationID_Clear bit = 0,
    @BeneficiaryOrganizationID uniqueidentifier = NULL,
    @Quantity_Clear bit = 0,
    @Quantity decimal(18, 4) = NULL,
    @ValidFrom_Clear bit = 0,
    @ValidFrom datetimeoffset = NULL,
    @ValidTo_Clear bit = 0,
    @ValidTo datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @ProvisionedAt_Clear bit = 0,
    @ProvisionedAt datetimeoffset = NULL,
    @ValidityModeApplied_Clear bit = 0,
    @ValidityModeApplied nvarchar(20) = NULL,
    @SubscriptionTermID_Clear bit = 0,
    @SubscriptionTermID uniqueidentifier = NULL,
    @RevokedAt_Clear bit = 0,
    @RevokedAt datetimeoffset = NULL,
    @RevocationReason_Clear bit = 0,
    @RevocationReason nvarchar(300) = NULL,
    @GrantTimingApplied_Clear bit = 0,
    @GrantTimingApplied nvarchar(20) = NULL,
    @SuspendedAt_Clear bit = 0,
    @SuspendedAt datetimeoffset = NULL,
    @SuspensionReason_Clear bit = 0,
    @SuspensionReason nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntitlementGrant]
            (
                [ID],
                [ProductEntitlementID],
                [OrderLineID],
                [SubscriptionID],
                [BeneficiaryPersonID],
                [BeneficiaryOrganizationID],
                [Quantity],
                [ValidFrom],
                [ValidTo],
                [Status],
                [ProvisionedAt],
                [ValidityModeApplied],
                [SubscriptionTermID],
                [RevokedAt],
                [RevocationReason],
                [GrantTimingApplied],
                [SuspendedAt],
                [SuspensionReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ProductEntitlementID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                CASE WHEN @SubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionID, NULL) END,
                CASE WHEN @BeneficiaryPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryPersonID, NULL) END,
                CASE WHEN @BeneficiaryOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryOrganizationID, NULL) END,
                CASE WHEN @Quantity_Clear = 1 THEN NULL ELSE ISNULL(@Quantity, NULL) END,
                CASE WHEN @ValidFrom_Clear = 1 THEN NULL ELSE ISNULL(@ValidFrom, NULL) END,
                CASE WHEN @ValidTo_Clear = 1 THEN NULL ELSE ISNULL(@ValidTo, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @ProvisionedAt_Clear = 1 THEN NULL ELSE ISNULL(@ProvisionedAt, NULL) END,
                CASE WHEN @ValidityModeApplied_Clear = 1 THEN NULL ELSE ISNULL(@ValidityModeApplied, NULL) END,
                CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, NULL) END,
                CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, NULL) END,
                CASE WHEN @RevocationReason_Clear = 1 THEN NULL ELSE ISNULL(@RevocationReason, NULL) END,
                CASE WHEN @GrantTimingApplied_Clear = 1 THEN NULL ELSE ISNULL(@GrantTimingApplied, NULL) END,
                CASE WHEN @SuspendedAt_Clear = 1 THEN NULL ELSE ISNULL(@SuspendedAt, NULL) END,
                CASE WHEN @SuspensionReason_Clear = 1 THEN NULL ELSE ISNULL(@SuspensionReason, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntitlementGrant]
            (
                [ProductEntitlementID],
                [OrderLineID],
                [SubscriptionID],
                [BeneficiaryPersonID],
                [BeneficiaryOrganizationID],
                [Quantity],
                [ValidFrom],
                [ValidTo],
                [Status],
                [ProvisionedAt],
                [ValidityModeApplied],
                [SubscriptionTermID],
                [RevokedAt],
                [RevocationReason],
                [GrantTimingApplied],
                [SuspendedAt],
                [SuspensionReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ProductEntitlementID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                CASE WHEN @SubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionID, NULL) END,
                CASE WHEN @BeneficiaryPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryPersonID, NULL) END,
                CASE WHEN @BeneficiaryOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryOrganizationID, NULL) END,
                CASE WHEN @Quantity_Clear = 1 THEN NULL ELSE ISNULL(@Quantity, NULL) END,
                CASE WHEN @ValidFrom_Clear = 1 THEN NULL ELSE ISNULL(@ValidFrom, NULL) END,
                CASE WHEN @ValidTo_Clear = 1 THEN NULL ELSE ISNULL(@ValidTo, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @ProvisionedAt_Clear = 1 THEN NULL ELSE ISNULL(@ProvisionedAt, NULL) END,
                CASE WHEN @ValidityModeApplied_Clear = 1 THEN NULL ELSE ISNULL(@ValidityModeApplied, NULL) END,
                CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, NULL) END,
                CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, NULL) END,
                CASE WHEN @RevocationReason_Clear = 1 THEN NULL ELSE ISNULL(@RevocationReason, NULL) END,
                CASE WHEN @GrantTimingApplied_Clear = 1 THEN NULL ELSE ISNULL(@GrantTimingApplied, NULL) END,
                CASE WHEN @SuspendedAt_Clear = 1 THEN NULL ELSE ISNULL(@SuspendedAt, NULL) END,
                CASE WHEN @SuspensionReason_Clear = 1 THEN NULL ELSE ISNULL(@SuspensionReason, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntitlementGrants] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntitlementGrant] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Entitlement Grants */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntitlementGrant] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Entitlement Grants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Grants
-- Item: spUpdateEntitlementGrant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntitlementGrant
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntitlementGrant]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntitlementGrant];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntitlementGrant]
    @ID uniqueidentifier,
    @ProductEntitlementID uniqueidentifier = NULL,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @SubscriptionID_Clear bit = 0,
    @SubscriptionID uniqueidentifier = NULL,
    @BeneficiaryPersonID_Clear bit = 0,
    @BeneficiaryPersonID uniqueidentifier = NULL,
    @BeneficiaryOrganizationID_Clear bit = 0,
    @BeneficiaryOrganizationID uniqueidentifier = NULL,
    @Quantity_Clear bit = 0,
    @Quantity decimal(18, 4) = NULL,
    @ValidFrom_Clear bit = 0,
    @ValidFrom datetimeoffset = NULL,
    @ValidTo_Clear bit = 0,
    @ValidTo datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @ProvisionedAt_Clear bit = 0,
    @ProvisionedAt datetimeoffset = NULL,
    @ValidityModeApplied_Clear bit = 0,
    @ValidityModeApplied nvarchar(20) = NULL,
    @SubscriptionTermID_Clear bit = 0,
    @SubscriptionTermID uniqueidentifier = NULL,
    @RevokedAt_Clear bit = 0,
    @RevokedAt datetimeoffset = NULL,
    @RevocationReason_Clear bit = 0,
    @RevocationReason nvarchar(300) = NULL,
    @GrantTimingApplied_Clear bit = 0,
    @GrantTimingApplied nvarchar(20) = NULL,
    @SuspendedAt_Clear bit = 0,
    @SuspendedAt datetimeoffset = NULL,
    @SuspensionReason_Clear bit = 0,
    @SuspensionReason nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntitlementGrant]
    SET
        [ProductEntitlementID] = ISNULL(@ProductEntitlementID, [ProductEntitlementID]),
        [OrderLineID] = CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, [OrderLineID]) END,
        [SubscriptionID] = CASE WHEN @SubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionID, [SubscriptionID]) END,
        [BeneficiaryPersonID] = CASE WHEN @BeneficiaryPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryPersonID, [BeneficiaryPersonID]) END,
        [BeneficiaryOrganizationID] = CASE WHEN @BeneficiaryOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryOrganizationID, [BeneficiaryOrganizationID]) END,
        [Quantity] = CASE WHEN @Quantity_Clear = 1 THEN NULL ELSE ISNULL(@Quantity, [Quantity]) END,
        [ValidFrom] = CASE WHEN @ValidFrom_Clear = 1 THEN NULL ELSE ISNULL(@ValidFrom, [ValidFrom]) END,
        [ValidTo] = CASE WHEN @ValidTo_Clear = 1 THEN NULL ELSE ISNULL(@ValidTo, [ValidTo]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ProvisionedAt] = CASE WHEN @ProvisionedAt_Clear = 1 THEN NULL ELSE ISNULL(@ProvisionedAt, [ProvisionedAt]) END,
        [ValidityModeApplied] = CASE WHEN @ValidityModeApplied_Clear = 1 THEN NULL ELSE ISNULL(@ValidityModeApplied, [ValidityModeApplied]) END,
        [SubscriptionTermID] = CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, [SubscriptionTermID]) END,
        [RevokedAt] = CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, [RevokedAt]) END,
        [RevocationReason] = CASE WHEN @RevocationReason_Clear = 1 THEN NULL ELSE ISNULL(@RevocationReason, [RevocationReason]) END,
        [GrantTimingApplied] = CASE WHEN @GrantTimingApplied_Clear = 1 THEN NULL ELSE ISNULL(@GrantTimingApplied, [GrantTimingApplied]) END,
        [SuspendedAt] = CASE WHEN @SuspendedAt_Clear = 1 THEN NULL ELSE ISNULL(@SuspendedAt, [SuspendedAt]) END,
        [SuspensionReason] = CASE WHEN @SuspensionReason_Clear = 1 THEN NULL ELSE ISNULL(@SuspensionReason, [SuspensionReason]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntitlementGrants] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntitlementGrants]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntitlementGrant] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntitlementGrant table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntitlementGrant]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntitlementGrant];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntitlementGrant
ON [${flyway:defaultSchema}].[EntitlementGrant]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntitlementGrant]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntitlementGrant] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Entitlement Grants */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntitlementGrant] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Entitlement Grants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Grants
-- Item: spDeleteEntitlementGrant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntitlementGrant
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntitlementGrant]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntitlementGrant];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntitlementGrant]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntitlementGrant]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntitlementGrant] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Entitlement Grants */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntitlementGrant] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 1 new entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bcc208d2-c19a-4221-b430-01f60417374d' OR (EntityID = 'CE97BF15-F7C6-4C50-A744-A89C714A4DDD' AND Name = 'ReversalSource')) BEGIN
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
            'bcc208d2-c19a-4221-b430-01f60417374d',
            'CE97BF15-F7C6-4C50-A744-A89C714A4DDD', -- Entity: MJ_BizApps_Orders: Payment Headers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'CE97BF15-F7C6-4C50-A744-A89C714A4DDD') + 1,
            'ReversalSource',
            'Reversal Source',
            'Who took the money back on a reversal: Refund (the seller chose to, via Orders.RefundPayment) or BankReturn (the bank reversed a debit). Set on every reversal and on nothing else. A bank return removes payment-gated access; a refund does not.',
            'nvarchar',
            40,
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


/* SQL text to insert entity field value with ID 1b86595a-a79c-4954-b1bc-9a155484fa6d */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1b86595a-a79c-4954-b1bc-9a155484fa6d', 'BCC208D2-C19A-4221-B430-01F60417374D', 1, 'BankReturn', 'BankReturn', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c478e3d6-ce18-468c-b59c-d74b61aa43fe */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c478e3d6-ce18-468c-b59c-d74b61aa43fe', 'BCC208D2-C19A-4221-B430-01F60417374D', 2, 'Refund', 'Refund', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BCC208D2-C19A-4221-B430-01F60417374D */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='BCC208D2-C19A-4221-B430-01F60417374D';


/* Base View SQL for MJ_BizApps_Orders: Payment Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Headers
-- Item: vwPaymentHeaders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Headers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PaymentHeader
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPaymentHeaders]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPaymentHeaders];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPaymentHeaders]
AS
SELECT
    p.*,
    MJCompany_ReceivingCompanyID.[Name] AS [ReceivingCompany],
    mjBizAppsCommonPerson_BillToPersonID.[DisplayName] AS [BillToPerson],
    mjBizAppsCommonOrganization_BillToOrganizationID.[Name] AS [BillToOrganization],
    mjBizAppsOrdersPaymentType_PaymentTypeID.[Name] AS [PaymentType],
    mjBizAppsOrdersPaymentProvider_PaymentProviderID.[Name] AS [PaymentProvider],
    mjBizAppsOrdersPaymentIntent_PaymentIntentID.[ProviderIntentID] AS [PaymentIntent],
    mjBizAppsOrdersPaymentDetail_PaymentDetailID.[Last4] AS [PaymentDetail],
    mjBizAppsOrdersPaymentHeader_ReversesPaymentHeaderID.[PaymentNumber] AS [ReversesPaymentHeader],
    mjBizAppsAccountingJournalEntry_JournalEntryID.[EntryNumber] AS [JournalEntry]
FROM
    [${flyway:defaultSchema}].[PaymentHeader] AS p
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_ReceivingCompanyID
  ON
    [p].[ReceivingCompanyID] = MJCompany_ReceivingCompanyID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_BillToPersonID
  ON
    [p].[BillToPersonID] = mjBizAppsCommonPerson_BillToPersonID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_BillToOrganizationID
  ON
    [p].[BillToOrganizationID] = mjBizAppsCommonOrganization_BillToOrganizationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[PaymentType] AS mjBizAppsOrdersPaymentType_PaymentTypeID
  ON
    [p].[PaymentTypeID] = mjBizAppsOrdersPaymentType_PaymentTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentProvider] AS mjBizAppsOrdersPaymentProvider_PaymentProviderID
  ON
    [p].[PaymentProviderID] = mjBizAppsOrdersPaymentProvider_PaymentProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentIntent] AS mjBizAppsOrdersPaymentIntent_PaymentIntentID
  ON
    [p].[PaymentIntentID] = mjBizAppsOrdersPaymentIntent_PaymentIntentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentDetail] AS mjBizAppsOrdersPaymentDetail_PaymentDetailID
  ON
    [p].[PaymentDetailID] = mjBizAppsOrdersPaymentDetail_PaymentDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentHeader] AS mjBizAppsOrdersPaymentHeader_ReversesPaymentHeaderID
  ON
    [p].[ReversesPaymentHeaderID] = mjBizAppsOrdersPaymentHeader_ReversesPaymentHeaderID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsAccounting].[JournalEntry] AS mjBizAppsAccountingJournalEntry_JournalEntryID
  ON
    [p].[JournalEntryID] = mjBizAppsAccountingJournalEntry_JournalEntryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Headers
-- Item: Permissions for vwPaymentHeaders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Payment Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Headers
-- Item: spCreatePaymentHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentHeader
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePaymentHeader]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentHeader];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentHeader]
    @ID uniqueidentifier = NULL,
    @PaymentNumber nvarchar(40),
    @ReceivingCompanyID uniqueidentifier,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @PaymentDate date,
    @PaymentTypeID uniqueidentifier,
    @Amount decimal(18, 2),
    @ProcessingFeeAmount decimal(18, 2) = NULL,
    @NetAmount_Clear bit = 0,
    @NetAmount decimal(18, 2) = NULL,
    @PaymentProviderID_Clear bit = 0,
    @PaymentProviderID uniqueidentifier = NULL,
    @PaymentIntentID_Clear bit = 0,
    @PaymentIntentID uniqueidentifier = NULL,
    @PaymentDetailID_Clear bit = 0,
    @PaymentDetailID uniqueidentifier = NULL,
    @ProviderChargeID_Clear bit = 0,
    @ProviderChargeID nvarchar(100) = NULL,
    @ProviderRefundID_Clear bit = 0,
    @ProviderRefundID nvarchar(100) = NULL,
    @ReversesPaymentHeaderID_Clear bit = 0,
    @ReversesPaymentHeaderID uniqueidentifier = NULL,
    @ReversalReason_Clear bit = 0,
    @ReversalReason nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @JournalEntryID_Clear bit = 0,
    @JournalEntryID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @IdempotencyKey_Clear bit = 0,
    @IdempotencyKey nvarchar(200) = NULL,
    @ReversalSource_Clear bit = 0,
    @ReversalSource nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PaymentHeader]
            (
                [ID],
                [PaymentNumber],
                [ReceivingCompanyID],
                [BillToPersonID],
                [BillToOrganizationID],
                [PaymentDate],
                [PaymentTypeID],
                [Amount],
                [ProcessingFeeAmount],
                [NetAmount],
                [PaymentProviderID],
                [PaymentIntentID],
                [PaymentDetailID],
                [ProviderChargeID],
                [ProviderRefundID],
                [ReversesPaymentHeaderID],
                [ReversalReason],
                [Status],
                [JournalEntryID],
                [Description],
                [Notes],
                [IdempotencyKey],
                [ReversalSource]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentNumber,
                @ReceivingCompanyID,
                CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, NULL) END,
                CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, NULL) END,
                @PaymentDate,
                @PaymentTypeID,
                @Amount,
                ISNULL(@ProcessingFeeAmount, 0),
                CASE WHEN @NetAmount_Clear = 1 THEN NULL ELSE ISNULL(@NetAmount, NULL) END,
                CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, NULL) END,
                CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, NULL) END,
                CASE WHEN @PaymentDetailID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentDetailID, NULL) END,
                CASE WHEN @ProviderChargeID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderChargeID, NULL) END,
                CASE WHEN @ProviderRefundID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderRefundID, NULL) END,
                CASE WHEN @ReversesPaymentHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesPaymentHeaderID, NULL) END,
                CASE WHEN @ReversalReason_Clear = 1 THEN NULL ELSE ISNULL(@ReversalReason, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @IdempotencyKey_Clear = 1 THEN NULL ELSE ISNULL(@IdempotencyKey, NULL) END,
                CASE WHEN @ReversalSource_Clear = 1 THEN NULL ELSE ISNULL(@ReversalSource, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PaymentHeader]
            (
                [PaymentNumber],
                [ReceivingCompanyID],
                [BillToPersonID],
                [BillToOrganizationID],
                [PaymentDate],
                [PaymentTypeID],
                [Amount],
                [ProcessingFeeAmount],
                [NetAmount],
                [PaymentProviderID],
                [PaymentIntentID],
                [PaymentDetailID],
                [ProviderChargeID],
                [ProviderRefundID],
                [ReversesPaymentHeaderID],
                [ReversalReason],
                [Status],
                [JournalEntryID],
                [Description],
                [Notes],
                [IdempotencyKey],
                [ReversalSource]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentNumber,
                @ReceivingCompanyID,
                CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, NULL) END,
                CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, NULL) END,
                @PaymentDate,
                @PaymentTypeID,
                @Amount,
                ISNULL(@ProcessingFeeAmount, 0),
                CASE WHEN @NetAmount_Clear = 1 THEN NULL ELSE ISNULL(@NetAmount, NULL) END,
                CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, NULL) END,
                CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, NULL) END,
                CASE WHEN @PaymentDetailID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentDetailID, NULL) END,
                CASE WHEN @ProviderChargeID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderChargeID, NULL) END,
                CASE WHEN @ProviderRefundID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderRefundID, NULL) END,
                CASE WHEN @ReversesPaymentHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesPaymentHeaderID, NULL) END,
                CASE WHEN @ReversalReason_Clear = 1 THEN NULL ELSE ISNULL(@ReversalReason, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @IdempotencyKey_Clear = 1 THEN NULL ELSE ISNULL(@IdempotencyKey, NULL) END,
                CASE WHEN @ReversalSource_Clear = 1 THEN NULL ELSE ISNULL(@ReversalSource, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPaymentHeaders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentHeader] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Payment Headers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentHeader] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Payment Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Headers
-- Item: spUpdatePaymentHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentHeader
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentHeader]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentHeader];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentHeader]
    @ID uniqueidentifier,
    @PaymentNumber nvarchar(40) = NULL,
    @ReceivingCompanyID uniqueidentifier = NULL,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @PaymentDate date = NULL,
    @PaymentTypeID uniqueidentifier = NULL,
    @Amount decimal(18, 2) = NULL,
    @ProcessingFeeAmount decimal(18, 2) = NULL,
    @NetAmount_Clear bit = 0,
    @NetAmount decimal(18, 2) = NULL,
    @PaymentProviderID_Clear bit = 0,
    @PaymentProviderID uniqueidentifier = NULL,
    @PaymentIntentID_Clear bit = 0,
    @PaymentIntentID uniqueidentifier = NULL,
    @PaymentDetailID_Clear bit = 0,
    @PaymentDetailID uniqueidentifier = NULL,
    @ProviderChargeID_Clear bit = 0,
    @ProviderChargeID nvarchar(100) = NULL,
    @ProviderRefundID_Clear bit = 0,
    @ProviderRefundID nvarchar(100) = NULL,
    @ReversesPaymentHeaderID_Clear bit = 0,
    @ReversesPaymentHeaderID uniqueidentifier = NULL,
    @ReversalReason_Clear bit = 0,
    @ReversalReason nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @JournalEntryID_Clear bit = 0,
    @JournalEntryID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @IdempotencyKey_Clear bit = 0,
    @IdempotencyKey nvarchar(200) = NULL,
    @ReversalSource_Clear bit = 0,
    @ReversalSource nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentHeader]
    SET
        [PaymentNumber] = ISNULL(@PaymentNumber, [PaymentNumber]),
        [ReceivingCompanyID] = ISNULL(@ReceivingCompanyID, [ReceivingCompanyID]),
        [BillToPersonID] = CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, [BillToPersonID]) END,
        [BillToOrganizationID] = CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, [BillToOrganizationID]) END,
        [PaymentDate] = ISNULL(@PaymentDate, [PaymentDate]),
        [PaymentTypeID] = ISNULL(@PaymentTypeID, [PaymentTypeID]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [ProcessingFeeAmount] = ISNULL(@ProcessingFeeAmount, [ProcessingFeeAmount]),
        [NetAmount] = CASE WHEN @NetAmount_Clear = 1 THEN NULL ELSE ISNULL(@NetAmount, [NetAmount]) END,
        [PaymentProviderID] = CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, [PaymentProviderID]) END,
        [PaymentIntentID] = CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, [PaymentIntentID]) END,
        [PaymentDetailID] = CASE WHEN @PaymentDetailID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentDetailID, [PaymentDetailID]) END,
        [ProviderChargeID] = CASE WHEN @ProviderChargeID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderChargeID, [ProviderChargeID]) END,
        [ProviderRefundID] = CASE WHEN @ProviderRefundID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderRefundID, [ProviderRefundID]) END,
        [ReversesPaymentHeaderID] = CASE WHEN @ReversesPaymentHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesPaymentHeaderID, [ReversesPaymentHeaderID]) END,
        [ReversalReason] = CASE WHEN @ReversalReason_Clear = 1 THEN NULL ELSE ISNULL(@ReversalReason, [ReversalReason]) END,
        [Status] = ISNULL(@Status, [Status]),
        [JournalEntryID] = CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, [JournalEntryID]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END,
        [IdempotencyKey] = CASE WHEN @IdempotencyKey_Clear = 1 THEN NULL ELSE ISNULL(@IdempotencyKey, [IdempotencyKey]) END,
        [ReversalSource] = CASE WHEN @ReversalSource_Clear = 1 THEN NULL ELSE ISNULL(@ReversalSource, [ReversalSource]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentHeaders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentHeaders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentHeader] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentHeader table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentHeader]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentHeader];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentHeader
ON [${flyway:defaultSchema}].[PaymentHeader]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentHeader]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PaymentHeader] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Headers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentHeader] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Payment Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Headers
-- Item: spDeletePaymentHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentHeader
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePaymentHeader]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentHeader];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentHeader]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PaymentHeader]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentHeader] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Payment Headers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentHeader] TO [cdp_Developer], [cdp_Integration];
