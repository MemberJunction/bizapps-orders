-- =============================================================================
-- V202610121800 — SubscriptionTerm.Quantity: how many seats a term covers
--                 (MemberJunction/bizapps-orders#589)
-- =============================================================================
-- A subscription line bought at quantity 10 bills ten times the rate and creates
-- one subscription with one term. Nothing recorded the 10. The order line could
-- not stand in for it either: a prorated first period is priced by scaling the
-- line's quantity (10 seats at a factor of 0.5 store Quantity 5), so after
-- booking the seat count existed nowhere. Entitlement grants and renewals read
-- the scaled number, so a half-length first period granted and renewed 5 seats.
--
-- The count lives on the TERM, not the subscription: each term is one purchase,
-- so a renewal at a different seat count is a new term with its own count and
-- the earlier terms keep theirs. A subscription's current seat count is its
-- active term's.
--
-- Existing terms are backfilled from the line that bought them, undoing the
-- proration scaling and rounding to whole seats (the same rounding renewals
-- already applied), never below 1.
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
--
-- CodeGen output for this app is folded below the banner at the end of this file.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[SubscriptionTerm]
    ADD [Quantity] INT NOT NULL CONSTRAINT [DF_SubscriptionTerm_Quantity] DEFAULT 1;
GO

UPDATE t
SET t.[Quantity] = CASE
        WHEN seats.[Seats] < 1 THEN 1
        ELSE CAST(seats.[Seats] AS INT)
    END
FROM [${flyway:defaultSchema}].[SubscriptionTerm] t
INNER JOIN [${flyway:defaultSchema}].[OrderLine] l ON l.[ID] = t.[OrderLineID]
CROSS APPLY (
    SELECT ROUND(
        CASE
            WHEN t.[IsProrated] = 1 AND t.[ProrationFactor] > 0 THEN ABS(l.[Quantity]) / t.[ProrationFactor]
            ELSE ABS(l.[Quantity])
        END, 0) AS [Seats]
) seats;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How many seats this term covers: the quantity the order line bought, before any proration. A prorated first period scales the order line''s Quantity to price the short period, so the line cannot be read for the seat count; entitlement grants and renewals read this instead. Whole seats only, at least 1.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SubscriptionTerm',
    @level2type = N'COLUMN', @level2name = N'Quantity';
GO























































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen 6.1.5 for the combined PR (bizapps-orders#645) against a
--   database built from its migrations: the Quantity field and its category, and the
--   Subscription Terms view, CRUD procs, FK indexes and grants. Left out: validators
--   the run regenerated for other entities; they are not this change's.
--
-- =============================================================================


/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'af7f6119-3695-4c39-ad1a-9ee6f76c0d8f' OR (EntityID = '22E31028-E862-424B-8C10-C167B2C9E304' AND Name = 'Quantity')) BEGIN
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
            'af7f6119-3695-4c39-ad1a-9ee6f76c0d8f',
            '22E31028-E862-424B-8C10-C167B2C9E304', -- Entity: MJ_BizApps_Orders: Subscription Terms
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '22E31028-E862-424B-8C10-C167B2C9E304'),
            'Quantity',
            'Quantity',
            'How many seats this term covers: the quantity the order line bought, before any proration. A prorated first period scales the order line''s Quantity to price the short period, so the line cannot be read for the seat count; entitlement grants and renewals read this instead. Whole seats only, at least 1.',
            'int',
            4,
            10,
            0,
            0,
            '(1)',
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

/* Index for Foreign Keys for SubscriptionTerm */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SubscriptionID in table SubscriptionTerm
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubscriptionTerm_SubscriptionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SubscriptionTerm]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubscriptionTerm_SubscriptionID ON [${flyway:defaultSchema}].[SubscriptionTerm] ([SubscriptionID]);

-- Index for foreign key OrderLineID in table SubscriptionTerm
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubscriptionTerm_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SubscriptionTerm]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubscriptionTerm_OrderLineID ON [${flyway:defaultSchema}].[SubscriptionTerm] ([OrderLineID]);

-- Index for foreign key RevenueRecognitionTypeID in table SubscriptionTerm
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubscriptionTerm_RevenueRecognitionTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SubscriptionTerm]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubscriptionTerm_RevenueRecognitionTypeID ON [${flyway:defaultSchema}].[SubscriptionTerm] ([RevenueRecognitionTypeID]);

/* Base View SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: vwSubscriptionTerms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Subscription Terms
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SubscriptionTerm
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSubscriptionTerms]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSubscriptionTerms];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSubscriptionTerms]
AS
SELECT
    s.*,
    mjBizAppsOrdersSubscription_SubscriptionID.[SubscriptionNumber] AS [Subscription],
    mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID.[Name] AS [RevenueRecognitionType]
FROM
    [${flyway:defaultSchema}].[SubscriptionTerm] AS s
INNER JOIN
    [${flyway:defaultSchema}].[Subscription] AS mjBizAppsOrdersSubscription_SubscriptionID
  ON
    [s].[SubscriptionID] = mjBizAppsOrdersSubscription_SubscriptionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[RevenueRecognitionType] AS mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID
  ON
    [s].[RevenueRecognitionTypeID] = mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSubscriptionTerms] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSubscriptionTerms] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSubscriptionTerms] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwSubscriptionTerms] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: Permissions for vwSubscriptionTerms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwSubscriptionTerms] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSubscriptionTerms] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSubscriptionTerms] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwSubscriptionTerms] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: spCreateSubscriptionTerm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SubscriptionTerm
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSubscriptionTerm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSubscriptionTerm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSubscriptionTerm]
    @ID uniqueidentifier = NULL,
    @SubscriptionID uniqueidentifier,
    @TermNumber int,
    @OrderLineID uniqueidentifier,
    @StartDate date,
    @EndDate date,
    @Amount decimal(18, 2),
    @IsProrated bit = NULL,
    @ProrationFactor_Clear bit = 0,
    @ProrationFactor decimal(9, 6) = NULL,
    @RevenueRecognitionTypeID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @CanceledAt_Clear bit = 0,
    @CanceledAt datetimeoffset = NULL,
    @CancellationEffectiveDate_Clear bit = 0,
    @CancellationEffectiveDate date = NULL,
    @Quantity int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SubscriptionTerm]
            (
                [ID],
                [SubscriptionID],
                [TermNumber],
                [OrderLineID],
                [StartDate],
                [EndDate],
                [Amount],
                [IsProrated],
                [ProrationFactor],
                [RevenueRecognitionTypeID],
                [Status],
                [CanceledAt],
                [CancellationEffectiveDate],
                [Quantity]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SubscriptionID,
                @TermNumber,
                @OrderLineID,
                @StartDate,
                @EndDate,
                @Amount,
                ISNULL(@IsProrated, 0),
                CASE WHEN @ProrationFactor_Clear = 1 THEN NULL ELSE ISNULL(@ProrationFactor, NULL) END,
                @RevenueRecognitionTypeID,
                ISNULL(@Status, 'Scheduled'),
                CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, NULL) END,
                CASE WHEN @CancellationEffectiveDate_Clear = 1 THEN NULL ELSE ISNULL(@CancellationEffectiveDate, NULL) END,
                ISNULL(@Quantity, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SubscriptionTerm]
            (
                [SubscriptionID],
                [TermNumber],
                [OrderLineID],
                [StartDate],
                [EndDate],
                [Amount],
                [IsProrated],
                [ProrationFactor],
                [RevenueRecognitionTypeID],
                [Status],
                [CanceledAt],
                [CancellationEffectiveDate],
                [Quantity]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SubscriptionID,
                @TermNumber,
                @OrderLineID,
                @StartDate,
                @EndDate,
                @Amount,
                ISNULL(@IsProrated, 0),
                CASE WHEN @ProrationFactor_Clear = 1 THEN NULL ELSE ISNULL(@ProrationFactor, NULL) END,
                @RevenueRecognitionTypeID,
                ISNULL(@Status, 'Scheduled'),
                CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, NULL) END,
                CASE WHEN @CancellationEffectiveDate_Clear = 1 THEN NULL ELSE ISNULL(@CancellationEffectiveDate, NULL) END,
                ISNULL(@Quantity, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSubscriptionTerms] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscriptionTerm] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscriptionTerm] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscriptionTerm] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Subscription Terms */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscriptionTerm] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscriptionTerm] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscriptionTerm] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: spUpdateSubscriptionTerm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SubscriptionTerm
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSubscriptionTerm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionTerm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionTerm]
    @ID uniqueidentifier,
    @SubscriptionID uniqueidentifier = NULL,
    @TermNumber int = NULL,
    @OrderLineID uniqueidentifier = NULL,
    @StartDate date = NULL,
    @EndDate date = NULL,
    @Amount decimal(18, 2) = NULL,
    @IsProrated bit = NULL,
    @ProrationFactor_Clear bit = 0,
    @ProrationFactor decimal(9, 6) = NULL,
    @RevenueRecognitionTypeID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @CanceledAt_Clear bit = 0,
    @CanceledAt datetimeoffset = NULL,
    @CancellationEffectiveDate_Clear bit = 0,
    @CancellationEffectiveDate date = NULL,
    @Quantity int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SubscriptionTerm]
    SET
        [SubscriptionID] = ISNULL(@SubscriptionID, [SubscriptionID]),
        [TermNumber] = ISNULL(@TermNumber, [TermNumber]),
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [StartDate] = ISNULL(@StartDate, [StartDate]),
        [EndDate] = ISNULL(@EndDate, [EndDate]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [IsProrated] = ISNULL(@IsProrated, [IsProrated]),
        [ProrationFactor] = CASE WHEN @ProrationFactor_Clear = 1 THEN NULL ELSE ISNULL(@ProrationFactor, [ProrationFactor]) END,
        [RevenueRecognitionTypeID] = ISNULL(@RevenueRecognitionTypeID, [RevenueRecognitionTypeID]),
        [Status] = ISNULL(@Status, [Status]),
        [CanceledAt] = CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, [CanceledAt]) END,
        [CancellationEffectiveDate] = CASE WHEN @CancellationEffectiveDate_Clear = 1 THEN NULL ELSE ISNULL(@CancellationEffectiveDate, [CancellationEffectiveDate]) END,
        [Quantity] = ISNULL(@Quantity, [Quantity])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSubscriptionTerms] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSubscriptionTerms]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionTerm] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionTerm] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionTerm] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SubscriptionTerm table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSubscriptionTerm]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSubscriptionTerm];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSubscriptionTerm
ON [${flyway:defaultSchema}].[SubscriptionTerm]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SubscriptionTerm]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SubscriptionTerm] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Subscription Terms */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionTerm] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionTerm] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionTerm] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: spDeleteSubscriptionTerm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SubscriptionTerm
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSubscriptionTerm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSubscriptionTerm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSubscriptionTerm]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SubscriptionTerm]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscriptionTerm] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscriptionTerm] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscriptionTerm] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Subscription Terms */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscriptionTerm] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscriptionTerm] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscriptionTerm] TO [cdp_Developer], [cdp_Integration];

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.Quantity 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Subscription Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AF7F6119-3695-4C39-AD1A-9EE6F76C0D8F';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.Subscription 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Subscription Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CBB17833-A6EA-4EB8-B998-86EE50F3AD2B';


