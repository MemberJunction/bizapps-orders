-- =============================================================================
-- Wave 4.3b: Single-write __mj_UpdatedAt backfill
--   1. Sets [__mj_UpdatedAt] = GETUTCDATE() directly inside spUpdate* procedures
--      so BaseEntity.Save() performs a single write to the base table.
--   2. Wraps trgUpdate* __mj_UpdatedAt triggers in IF NOT UPDATE([__mj_UpdatedAt])
--      so direct SQL UPDATEs that omit __mj_UpdatedAt still get stamped, while
--      spUpdate* (and explicit callers) skip the redundant second write.
-- =============================================================================























































------------------------------------------------------------
----- UPDATE PROCEDURE FOR ChargeType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateChargeType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateChargeType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateChargeType]
    @ID uniqueidentifier,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Category nvarchar(20) = NULL,
    @Basis nvarchar(30) = NULL,
    @Sequence int = NULL,
    @AllowsOverride bit = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ChargeType]
    SET
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Category] = ISNULL(@Category, [Category]),
        [Basis] = ISNULL(@Basis, [Basis]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [AllowsOverride] = ISNULL(@AllowsOverride, [AllowsOverride]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwChargeTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwChargeTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateChargeType] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateChargeType] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ChargeType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateChargeType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateChargeType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateChargeType
ON [${flyway:defaultSchema}].[ChargeType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[ChargeType]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[ChargeType] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

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
    @MetadataJSON nvarchar(MAX) = NULL,
    @AutoRenewConsentAt_Clear bit = 0,
    @AutoRenewConsentAt datetimeoffset = NULL,
    @AutoRenewConsentText_Clear bit = 0,
    @AutoRenewConsentText nvarchar(MAX) = NULL
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
        [MetadataJSON] = CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, [MetadataJSON]) END,
        [AutoRenewConsentAt] = CASE WHEN @AutoRenewConsentAt_Clear = 1 THEN NULL ELSE ISNULL(@AutoRenewConsentAt, [AutoRenewConsentAt]) END,
        [AutoRenewConsentText] = CASE WHEN @AutoRenewConsentText_Clear = 1 THEN NULL ELSE ISNULL(@AutoRenewConsentText, [AutoRenewConsentText]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutSession] TO [cdp_Developer], [cdp_Integration];
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
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[CheckoutSession]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[CheckoutSession] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

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
        [SucceededAt] = CASE WHEN @SucceededAt_Clear = 1 THEN NULL ELSE ISNULL(@SucceededAt, [SucceededAt]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutSessionStep] TO [cdp_Developer], [cdp_Integration];
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
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[CheckoutSessionStep]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[CheckoutSessionStep] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

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
        [CustomJS] = CASE WHEN @CustomJS_Clear = 1 THEN NULL ELSE ISNULL(@CustomJS, [CustomJS]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutWidget] TO [cdp_Developer], [cdp_Integration];
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
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[CheckoutWidget]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[CheckoutWidget] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

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
        [EmbedSnippet] = CASE WHEN @EmbedSnippet_Clear = 1 THEN NULL ELSE ISNULL(@EmbedSnippet, [EmbedSnippet]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutWidgetDistribution] TO [cdp_Developer], [cdp_Integration];
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
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[CheckoutWidgetDistribution]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[CheckoutWidgetDistribution] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CustomerPaymentMethod
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCustomerPaymentMethod]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCustomerPaymentMethod];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCustomerPaymentMethod]
    @ID uniqueidentifier,
    @OwnerPersonID_Clear bit = 0,
    @OwnerPersonID uniqueidentifier = NULL,
    @OwnerOrganizationID_Clear bit = 0,
    @OwnerOrganizationID uniqueidentifier = NULL,
    @PaymentDetailID uniqueidentifier = NULL,
    @Nickname_Clear bit = 0,
    @Nickname nvarchar(100) = NULL,
    @IsDefault bit = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CustomerPaymentMethod]
    SET
        [OwnerPersonID] = CASE WHEN @OwnerPersonID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerPersonID, [OwnerPersonID]) END,
        [OwnerOrganizationID] = CASE WHEN @OwnerOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerOrganizationID, [OwnerOrganizationID]) END,
        [PaymentDetailID] = ISNULL(@PaymentDetailID, [PaymentDetailID]),
        [Nickname] = CASE WHEN @Nickname_Clear = 1 THEN NULL ELSE ISNULL(@Nickname, [Nickname]) END,
        [IsDefault] = ISNULL(@IsDefault, [IsDefault]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCustomerPaymentMethods] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCustomerPaymentMethods]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCustomerPaymentMethod] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCustomerPaymentMethod] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CustomerPaymentMethod table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCustomerPaymentMethod]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCustomerPaymentMethod];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCustomerPaymentMethod
ON [${flyway:defaultSchema}].[CustomerPaymentMethod]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[CustomerPaymentMethod]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[CustomerPaymentMethod] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CustomerPaymentTerms
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCustomerPaymentTerms]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCustomerPaymentTerms];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCustomerPaymentTerms]
    @ID uniqueidentifier,
    @OrganizationID_Clear bit = 0,
    @OrganizationID uniqueidentifier = NULL,
    @PersonID_Clear bit = 0,
    @PersonID uniqueidentifier = NULL,
    @PaymentTermsTypeID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Status nvarchar(10) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CustomerPaymentTerms]
    SET
        [OrganizationID] = CASE WHEN @OrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@OrganizationID, [OrganizationID]) END,
        [PersonID] = CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, [PersonID]) END,
        [PaymentTermsTypeID] = ISNULL(@PaymentTermsTypeID, [PaymentTermsTypeID]),
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCustomerPaymentTerms] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCustomerPaymentTerms]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCustomerPaymentTerms] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCustomerPaymentTerms] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CustomerPaymentTerms table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCustomerPaymentTerms]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCustomerPaymentTerms];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCustomerPaymentTerms
ON [${flyway:defaultSchema}].[CustomerPaymentTerms]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[CustomerPaymentTerms]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[CustomerPaymentTerms] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CustomerTaxExemption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCustomerTaxExemption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCustomerTaxExemption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCustomerTaxExemption]
    @ID uniqueidentifier,
    @OrganizationID_Clear bit = 0,
    @OrganizationID uniqueidentifier = NULL,
    @PersonID_Clear bit = 0,
    @PersonID uniqueidentifier = NULL,
    @TaxJurisdictionID_Clear bit = 0,
    @TaxJurisdictionID uniqueidentifier = NULL,
    @TaxCategory_Clear bit = 0,
    @TaxCategory nvarchar(50) = NULL,
    @ExemptionType nvarchar(30) = NULL,
    @CertificateRef_Clear bit = 0,
    @CertificateRef nvarchar(200) = NULL,
    @CertificateIssuedAt_Clear bit = 0,
    @CertificateIssuedAt date = NULL,
    @CertificateExpiresAt_Clear bit = 0,
    @CertificateExpiresAt date = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Status nvarchar(10) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CustomerTaxExemption]
    SET
        [OrganizationID] = CASE WHEN @OrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@OrganizationID, [OrganizationID]) END,
        [PersonID] = CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, [PersonID]) END,
        [TaxJurisdictionID] = CASE WHEN @TaxJurisdictionID_Clear = 1 THEN NULL ELSE ISNULL(@TaxJurisdictionID, [TaxJurisdictionID]) END,
        [TaxCategory] = CASE WHEN @TaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@TaxCategory, [TaxCategory]) END,
        [ExemptionType] = ISNULL(@ExemptionType, [ExemptionType]),
        [CertificateRef] = CASE WHEN @CertificateRef_Clear = 1 THEN NULL ELSE ISNULL(@CertificateRef, [CertificateRef]) END,
        [CertificateIssuedAt] = CASE WHEN @CertificateIssuedAt_Clear = 1 THEN NULL ELSE ISNULL(@CertificateIssuedAt, [CertificateIssuedAt]) END,
        [CertificateExpiresAt] = CASE WHEN @CertificateExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@CertificateExpiresAt, [CertificateExpiresAt]) END,
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCustomerTaxExemptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCustomerTaxExemptions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCustomerTaxExemption] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCustomerTaxExemption] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CustomerTaxExemption table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCustomerTaxExemption]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCustomerTaxExemption];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCustomerTaxExemption
ON [${flyway:defaultSchema}].[CustomerTaxExemption]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[CustomerTaxExemption]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[CustomerTaxExemption] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DimensionDefault
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDimensionDefault]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDimensionDefault];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDimensionDefault]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @RecordID nvarchar(400) = NULL,
    @DimensionID uniqueidentifier = NULL,
    @DimensionValueID uniqueidentifier = NULL,
    @Status nvarchar(10) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DimensionDefault]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [RecordID] = ISNULL(@RecordID, [RecordID]),
        [DimensionID] = ISNULL(@DimensionID, [DimensionID]),
        [DimensionValueID] = ISNULL(@DimensionValueID, [DimensionValueID]),
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDimensionDefaults] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDimensionDefaults]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDimensionDefault] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDimensionDefault] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DimensionDefault table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDimensionDefault]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDimensionDefault];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDimensionDefault
ON [${flyway:defaultSchema}].[DimensionDefault]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[DimensionDefault]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[DimensionDefault] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntitlementAccessOverride
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntitlementAccessOverride]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntitlementAccessOverride];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntitlementAccessOverride]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @OverrideType nvarchar(20) = NULL,
    @Reason nvarchar(1000) = NULL,
    @EffectiveThrough date = NULL,
    @Status nvarchar(20) = NULL,
    @RequestedByUserID uniqueidentifier = NULL,
    @RequestedAt datetimeoffset = NULL,
    @ApprovalTaskID_Clear bit = 0,
    @ApprovalTaskID uniqueidentifier = NULL,
    @ApprovalTaskRaisedAt_Clear bit = 0,
    @ApprovalTaskRaisedAt datetimeoffset = NULL,
    @DecidedByUserID_Clear bit = 0,
    @DecidedByUserID uniqueidentifier = NULL,
    @DecidedAt_Clear bit = 0,
    @DecidedAt datetimeoffset = NULL,
    @DecisionNotes_Clear bit = 0,
    @DecisionNotes nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntitlementAccessOverride]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [OverrideType] = ISNULL(@OverrideType, [OverrideType]),
        [Reason] = ISNULL(@Reason, [Reason]),
        [EffectiveThrough] = ISNULL(@EffectiveThrough, [EffectiveThrough]),
        [Status] = ISNULL(@Status, [Status]),
        [RequestedByUserID] = ISNULL(@RequestedByUserID, [RequestedByUserID]),
        [RequestedAt] = ISNULL(@RequestedAt, [RequestedAt]),
        [ApprovalTaskID] = CASE WHEN @ApprovalTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskID, [ApprovalTaskID]) END,
        [ApprovalTaskRaisedAt] = CASE WHEN @ApprovalTaskRaisedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskRaisedAt, [ApprovalTaskRaisedAt]) END,
        [DecidedByUserID] = CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, [DecidedByUserID]) END,
        [DecidedAt] = CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, [DecidedAt]) END,
        [DecisionNotes] = CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, [DecisionNotes]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntitlementAccessOverrides] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntitlementAccessOverrides]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntitlementAccessOverride] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntitlementAccessOverride] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntitlementAccessOverride table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntitlementAccessOverride]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntitlementAccessOverride];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntitlementAccessOverride
ON [${flyway:defaultSchema}].[EntitlementAccessOverride]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[EntitlementAccessOverride]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[EntitlementAccessOverride] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

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
        [SuspensionReason] = CASE WHEN @SuspensionReason_Clear = 1 THEN NULL ELSE ISNULL(@SuspensionReason, [SuspensionReason]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntitlementGrant] TO [cdp_Developer], [cdp_Integration];
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
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[EntitlementGrant]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[EntitlementGrant] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventOrderLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEventOrderLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEventOrderLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEventOrderLine]
    @ID uniqueidentifier,
    @CheckInAt_Clear bit = 0,
    @CheckInAt datetimeoffset = NULL,
    @PersonID uniqueidentifier = NULL,
    @DietaryPreferences_Clear bit = 0,
    @DietaryPreferences nvarchar(500) = NULL,
    @Allergies_Clear bit = 0,
    @Allergies nvarchar(500) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(2000) = NULL,
    @AttendanceStatus nvarchar(20) = NULL,
    @BadgePrintedAt_Clear bit = 0,
    @BadgePrintedAt datetimeoffset = NULL,
    @BadgeName_Clear bit = 0,
    @BadgeName nvarchar(200) = NULL,
    @BadgeCompany_Clear bit = 0,
    @BadgeCompany nvarchar(200) = NULL,
    @BadgeTitle_Clear bit = 0,
    @BadgeTitle nvarchar(200) = NULL,
    @TicketTier_Clear bit = 0,
    @TicketTier nvarchar(50) = NULL,
    @TableAssignment_Clear bit = 0,
    @TableAssignment nvarchar(100) = NULL,
    @SpecialRequests_Clear bit = 0,
    @SpecialRequests nvarchar(2000) = NULL,
    @CheckInNotes_Clear bit = 0,
    @CheckInNotes nvarchar(2000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EventOrderLine]
    SET
        [CheckInAt] = CASE WHEN @CheckInAt_Clear = 1 THEN NULL ELSE ISNULL(@CheckInAt, [CheckInAt]) END,
        [PersonID] = ISNULL(@PersonID, [PersonID]),
        [DietaryPreferences] = CASE WHEN @DietaryPreferences_Clear = 1 THEN NULL ELSE ISNULL(@DietaryPreferences, [DietaryPreferences]) END,
        [Allergies] = CASE WHEN @Allergies_Clear = 1 THEN NULL ELSE ISNULL(@Allergies, [Allergies]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [AttendanceStatus] = ISNULL(@AttendanceStatus, [AttendanceStatus]),
        [BadgePrintedAt] = CASE WHEN @BadgePrintedAt_Clear = 1 THEN NULL ELSE ISNULL(@BadgePrintedAt, [BadgePrintedAt]) END,
        [BadgeName] = CASE WHEN @BadgeName_Clear = 1 THEN NULL ELSE ISNULL(@BadgeName, [BadgeName]) END,
        [BadgeCompany] = CASE WHEN @BadgeCompany_Clear = 1 THEN NULL ELSE ISNULL(@BadgeCompany, [BadgeCompany]) END,
        [BadgeTitle] = CASE WHEN @BadgeTitle_Clear = 1 THEN NULL ELSE ISNULL(@BadgeTitle, [BadgeTitle]) END,
        [TicketTier] = CASE WHEN @TicketTier_Clear = 1 THEN NULL ELSE ISNULL(@TicketTier, [TicketTier]) END,
        [TableAssignment] = CASE WHEN @TableAssignment_Clear = 1 THEN NULL ELSE ISNULL(@TableAssignment, [TableAssignment]) END,
        [SpecialRequests] = CASE WHEN @SpecialRequests_Clear = 1 THEN NULL ELSE ISNULL(@SpecialRequests, [SpecialRequests]) END,
        [CheckInNotes] = CASE WHEN @CheckInNotes_Clear = 1 THEN NULL ELSE ISNULL(@CheckInNotes, [CheckInNotes]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEventOrderLines] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEventOrderLines]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventOrderLine] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventOrderLine] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventOrderLine table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEventOrderLine]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEventOrderLine];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEventOrderLine
ON [${flyway:defaultSchema}].[EventOrderLine]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[EventOrderLine]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[EventOrderLine] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventProduct
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEventProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEventProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEventProduct]
    @ID uniqueidentifier,
    @EventStartsAt datetimeoffset = NULL,
    @EventEndsAt_Clear bit = 0,
    @EventEndsAt datetimeoffset = NULL,
    @VenueName_Clear bit = 0,
    @VenueName nvarchar(300) = NULL,
    @VenueAddressID_Clear bit = 0,
    @VenueAddressID uniqueidentifier = NULL,
    @Capacity_Clear bit = 0,
    @Capacity int = NULL,
    @RequiresAttendeeInfo bit = NULL,
    @EventFormat nvarchar(20) = NULL,
    @VirtualMeetingUrl_Clear bit = 0,
    @VirtualMeetingUrl nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EventProduct]
    SET
        [EventStartsAt] = ISNULL(@EventStartsAt, [EventStartsAt]),
        [EventEndsAt] = CASE WHEN @EventEndsAt_Clear = 1 THEN NULL ELSE ISNULL(@EventEndsAt, [EventEndsAt]) END,
        [VenueName] = CASE WHEN @VenueName_Clear = 1 THEN NULL ELSE ISNULL(@VenueName, [VenueName]) END,
        [VenueAddressID] = CASE WHEN @VenueAddressID_Clear = 1 THEN NULL ELSE ISNULL(@VenueAddressID, [VenueAddressID]) END,
        [Capacity] = CASE WHEN @Capacity_Clear = 1 THEN NULL ELSE ISNULL(@Capacity, [Capacity]) END,
        [RequiresAttendeeInfo] = ISNULL(@RequiresAttendeeInfo, [RequiresAttendeeInfo]),
        [EventFormat] = ISNULL(@EventFormat, [EventFormat]),
        [VirtualMeetingUrl] = CASE WHEN @VirtualMeetingUrl_Clear = 1 THEN NULL ELSE ISNULL(@VirtualMeetingUrl, [VirtualMeetingUrl]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEventProducts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEventProducts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventProduct table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEventProduct]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEventProduct];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEventProduct
ON [${flyway:defaultSchema}].[EventProduct]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[EventProduct]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[EventProduct] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExternalCustomer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateExternalCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalCustomer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalCustomer]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @ExternalCustomerRef nvarchar(100) = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalCustomer]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [BillToOrganizationID] = CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, [BillToOrganizationID]) END,
        [BillToPersonID] = CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, [BillToPersonID]) END,
        [ExternalCustomerRef] = ISNULL(@ExternalCustomerRef, [ExternalCustomerRef]),
        [LastSyncedAt] = CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, [LastSyncedAt]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwExternalCustomers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwExternalCustomers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalCustomer] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalCustomer] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalCustomer table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateExternalCustomer]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateExternalCustomer];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateExternalCustomer
ON [${flyway:defaultSchema}].[ExternalCustomer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[ExternalCustomer]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[ExternalCustomer] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExternalInvoice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateExternalInvoice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalInvoice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalInvoice]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier = NULL,
    @OrderHeaderPaymentScheduleID_Clear bit = 0,
    @OrderHeaderPaymentScheduleID uniqueidentifier = NULL,
    @DocumentNumber nvarchar(40) = NULL,
    @Amount decimal(18, 2) = NULL,
    @DueDate_Clear bit = 0,
    @DueDate date = NULL,
    @Status nvarchar(20) = NULL,
    @ExternalCustomerRef_Clear bit = 0,
    @ExternalCustomerRef nvarchar(100) = NULL,
    @ExternalInvoiceRef_Clear bit = 0,
    @ExternalInvoiceRef nvarchar(100) = NULL,
    @ExternalTotal_Clear bit = 0,
    @ExternalTotal decimal(18, 2) = NULL,
    @ExternalDueAmount_Clear bit = 0,
    @ExternalDueAmount decimal(18, 2) = NULL,
    @ExternalStatus_Clear bit = 0,
    @ExternalStatus nvarchar(40) = NULL,
    @SentAt_Clear bit = 0,
    @SentAt datetimeoffset = NULL,
    @CanceledAt_Clear bit = 0,
    @CanceledAt datetimeoffset = NULL,
    @CancelReason_Clear bit = 0,
    @CancelReason nvarchar(500) = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(MAX) = NULL,
    @IssuedByUserID_Clear bit = 0,
    @IssuedByUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalInvoice]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [OrderHeaderPaymentScheduleID] = CASE WHEN @OrderHeaderPaymentScheduleID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderPaymentScheduleID, [OrderHeaderPaymentScheduleID]) END,
        [DocumentNumber] = ISNULL(@DocumentNumber, [DocumentNumber]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [DueDate] = CASE WHEN @DueDate_Clear = 1 THEN NULL ELSE ISNULL(@DueDate, [DueDate]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ExternalCustomerRef] = CASE WHEN @ExternalCustomerRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalCustomerRef, [ExternalCustomerRef]) END,
        [ExternalInvoiceRef] = CASE WHEN @ExternalInvoiceRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalInvoiceRef, [ExternalInvoiceRef]) END,
        [ExternalTotal] = CASE WHEN @ExternalTotal_Clear = 1 THEN NULL ELSE ISNULL(@ExternalTotal, [ExternalTotal]) END,
        [ExternalDueAmount] = CASE WHEN @ExternalDueAmount_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDueAmount, [ExternalDueAmount]) END,
        [ExternalStatus] = CASE WHEN @ExternalStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExternalStatus, [ExternalStatus]) END,
        [SentAt] = CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, [SentAt]) END,
        [CanceledAt] = CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, [CanceledAt]) END,
        [CancelReason] = CASE WHEN @CancelReason_Clear = 1 THEN NULL ELSE ISNULL(@CancelReason, [CancelReason]) END,
        [LastSyncedAt] = CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, [LastSyncedAt]) END,
        [LastError] = CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, [LastError]) END,
        [IssuedByUserID] = CASE WHEN @IssuedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@IssuedByUserID, [IssuedByUserID]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwExternalInvoices] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwExternalInvoices]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalInvoice] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalInvoice] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalInvoice table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateExternalInvoice]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateExternalInvoice];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateExternalInvoice
ON [${flyway:defaultSchema}].[ExternalInvoice]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[ExternalInvoice]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[ExternalInvoice] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExternalPayment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateExternalPayment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalPayment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalPayment]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @ExternalPaymentRef nvarchar(100) = NULL,
    @ExternalCustomerRef_Clear bit = 0,
    @ExternalCustomerRef nvarchar(100) = NULL,
    @Amount decimal(18, 2) = NULL,
    @UnappliedAmount decimal(18, 2) = NULL,
    @PaymentDate_Clear bit = 0,
    @PaymentDate date = NULL,
    @ExternalStatus_Clear bit = 0,
    @ExternalStatus nvarchar(40) = NULL,
    @ExternalUpdatedAt_Clear bit = 0,
    @ExternalUpdatedAt datetimeoffset = NULL,
    @Disposition nvarchar(20) = NULL,
    @DispositionReason_Clear bit = 0,
    @DispositionReason nvarchar(500) = NULL,
    @PaymentHeaderID_Clear bit = 0,
    @PaymentHeaderID uniqueidentifier = NULL,
    @Payload_Clear bit = 0,
    @Payload nvarchar(MAX) = NULL,
    @FirstSeenAt datetimeoffset = NULL,
    @LastSeenAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalPayment]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [ExternalPaymentRef] = ISNULL(@ExternalPaymentRef, [ExternalPaymentRef]),
        [ExternalCustomerRef] = CASE WHEN @ExternalCustomerRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalCustomerRef, [ExternalCustomerRef]) END,
        [Amount] = ISNULL(@Amount, [Amount]),
        [UnappliedAmount] = ISNULL(@UnappliedAmount, [UnappliedAmount]),
        [PaymentDate] = CASE WHEN @PaymentDate_Clear = 1 THEN NULL ELSE ISNULL(@PaymentDate, [PaymentDate]) END,
        [ExternalStatus] = CASE WHEN @ExternalStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExternalStatus, [ExternalStatus]) END,
        [ExternalUpdatedAt] = CASE WHEN @ExternalUpdatedAt_Clear = 1 THEN NULL ELSE ISNULL(@ExternalUpdatedAt, [ExternalUpdatedAt]) END,
        [Disposition] = ISNULL(@Disposition, [Disposition]),
        [DispositionReason] = CASE WHEN @DispositionReason_Clear = 1 THEN NULL ELSE ISNULL(@DispositionReason, [DispositionReason]) END,
        [PaymentHeaderID] = CASE WHEN @PaymentHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentHeaderID, [PaymentHeaderID]) END,
        [Payload] = CASE WHEN @Payload_Clear = 1 THEN NULL ELSE ISNULL(@Payload, [Payload]) END,
        [FirstSeenAt] = ISNULL(@FirstSeenAt, [FirstSeenAt]),
        [LastSeenAt] = ISNULL(@LastSeenAt, [LastSeenAt]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwExternalPayments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwExternalPayments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalPayment] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalPayment] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalPayment table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateExternalPayment]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateExternalPayment];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateExternalPayment
ON [${flyway:defaultSchema}].[ExternalPayment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[ExternalPayment]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[ExternalPayment] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR InstalmentLineBilling
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateInstalmentLineBilling]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateInstalmentLineBilling];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateInstalmentLineBilling]
    @ID uniqueidentifier,
    @OrderHeaderPaymentScheduleID uniqueidentifier = NULL,
    @OrderLineID uniqueidentifier = NULL,
    @Part nvarchar(20) = NULL,
    @ChargeTypeID_Clear bit = 0,
    @ChargeTypeID uniqueidentifier = NULL,
    @Amount decimal(18, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[InstalmentLineBilling]
    SET
        [OrderHeaderPaymentScheduleID] = ISNULL(@OrderHeaderPaymentScheduleID, [OrderHeaderPaymentScheduleID]),
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [Part] = ISNULL(@Part, [Part]),
        [ChargeTypeID] = CASE WHEN @ChargeTypeID_Clear = 1 THEN NULL ELSE ISNULL(@ChargeTypeID, [ChargeTypeID]) END,
        [Amount] = ISNULL(@Amount, [Amount]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwInstalmentLineBillings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwInstalmentLineBillings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInstalmentLineBilling] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInstalmentLineBilling] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the InstalmentLineBilling table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateInstalmentLineBilling]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateInstalmentLineBilling];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateInstalmentLineBilling
ON [${flyway:defaultSchema}].[InstalmentLineBilling]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[InstalmentLineBilling]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[InstalmentLineBilling] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderAdjustment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderAdjustment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderAdjustment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderAdjustment]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @PromotionID_Clear bit = 0,
    @PromotionID uniqueidentifier = NULL,
    @PromotionCodeID_Clear bit = 0,
    @PromotionCodeID uniqueidentifier = NULL,
    @Amount decimal(19, 4) = NULL,
    @Sequence int = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @AppliedByUserID_Clear bit = 0,
    @AppliedByUserID uniqueidentifier = NULL,
    @AppliedAt datetimeoffset = NULL,
    @AuthorizedBySalesAuthorityID_Clear bit = 0,
    @AuthorizedBySalesAuthorityID uniqueidentifier = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt_Clear bit = 0,
    @ApprovedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderAdjustment]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [OrderLineID] = CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, [OrderLineID]) END,
        [PromotionID] = CASE WHEN @PromotionID_Clear = 1 THEN NULL ELSE ISNULL(@PromotionID, [PromotionID]) END,
        [PromotionCodeID] = CASE WHEN @PromotionCodeID_Clear = 1 THEN NULL ELSE ISNULL(@PromotionCodeID, [PromotionCodeID]) END,
        [Amount] = ISNULL(@Amount, [Amount]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Reason] = CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, [Reason]) END,
        [AppliedByUserID] = CASE WHEN @AppliedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AppliedByUserID, [AppliedByUserID]) END,
        [AppliedAt] = ISNULL(@AppliedAt, [AppliedAt]),
        [AuthorizedBySalesAuthorityID] = CASE WHEN @AuthorizedBySalesAuthorityID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizedBySalesAuthorityID, [AuthorizedBySalesAuthorityID]) END,
        [ApprovedByUserID] = CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, [ApprovedByUserID]) END,
        [ApprovedAt] = CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, [ApprovedAt]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderAdjustments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderAdjustments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderAdjustment] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderAdjustment] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderAdjustment table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderAdjustment]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderAdjustment];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderAdjustment
ON [${flyway:defaultSchema}].[OrderAdjustment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderAdjustment]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderAdjustment] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderAdjustmentAllocation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderAdjustmentAllocation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderAdjustmentAllocation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderAdjustmentAllocation]
    @ID uniqueidentifier,
    @OrderAdjustmentID uniqueidentifier = NULL,
    @OrderLineID uniqueidentifier = NULL,
    @Amount decimal(19, 4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderAdjustmentAllocation]
    SET
        [OrderAdjustmentID] = ISNULL(@OrderAdjustmentID, [OrderAdjustmentID]),
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderAdjustmentAllocations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderAdjustmentAllocations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderAdjustmentAllocation] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderAdjustmentAllocation] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderAdjustmentAllocation table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderAdjustmentAllocation]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderAdjustmentAllocation];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderAdjustmentAllocation
ON [${flyway:defaultSchema}].[OrderAdjustmentAllocation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderAdjustmentAllocation]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderAdjustmentAllocation] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderCharge
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderCharge]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderCharge];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderCharge]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @ChargeTypeID uniqueidentifier = NULL,
    @Amount decimal(19, 4) = NULL,
    @BasisAmount_Clear bit = 0,
    @BasisAmount decimal(19, 4) = NULL,
    @Rate_Clear bit = 0,
    @Rate decimal(9, 6) = NULL,
    @Sequence int = NULL,
    @TaxJurisdictionID_Clear bit = 0,
    @TaxJurisdictionID uniqueidentifier = NULL,
    @TaxRateID_Clear bit = 0,
    @TaxRateID uniqueidentifier = NULL,
    @CalculationSource nvarchar(50) = NULL,
    @IsOverridden bit = NULL,
    @ComputedAmount_Clear bit = 0,
    @ComputedAmount decimal(19, 4) = NULL,
    @OverrideReason_Clear bit = 0,
    @OverrideReason nvarchar(MAX) = NULL,
    @OverriddenByUserID_Clear bit = 0,
    @OverriddenByUserID uniqueidentifier = NULL,
    @OverriddenAt_Clear bit = 0,
    @OverriddenAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderCharge]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [ChargeTypeID] = ISNULL(@ChargeTypeID, [ChargeTypeID]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [BasisAmount] = CASE WHEN @BasisAmount_Clear = 1 THEN NULL ELSE ISNULL(@BasisAmount, [BasisAmount]) END,
        [Rate] = CASE WHEN @Rate_Clear = 1 THEN NULL ELSE ISNULL(@Rate, [Rate]) END,
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [TaxJurisdictionID] = CASE WHEN @TaxJurisdictionID_Clear = 1 THEN NULL ELSE ISNULL(@TaxJurisdictionID, [TaxJurisdictionID]) END,
        [TaxRateID] = CASE WHEN @TaxRateID_Clear = 1 THEN NULL ELSE ISNULL(@TaxRateID, [TaxRateID]) END,
        [CalculationSource] = ISNULL(@CalculationSource, [CalculationSource]),
        [IsOverridden] = ISNULL(@IsOverridden, [IsOverridden]),
        [ComputedAmount] = CASE WHEN @ComputedAmount_Clear = 1 THEN NULL ELSE ISNULL(@ComputedAmount, [ComputedAmount]) END,
        [OverrideReason] = CASE WHEN @OverrideReason_Clear = 1 THEN NULL ELSE ISNULL(@OverrideReason, [OverrideReason]) END,
        [OverriddenByUserID] = CASE WHEN @OverriddenByUserID_Clear = 1 THEN NULL ELSE ISNULL(@OverriddenByUserID, [OverriddenByUserID]) END,
        [OverriddenAt] = CASE WHEN @OverriddenAt_Clear = 1 THEN NULL ELSE ISNULL(@OverriddenAt, [OverriddenAt]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderCharges] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderCharges]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCharge] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCharge] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderCharge table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderCharge]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderCharge];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderCharge
ON [${flyway:defaultSchema}].[OrderCharge]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderCharge]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderCharge] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderChargeAllocation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderChargeAllocation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderChargeAllocation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderChargeAllocation]
    @ID uniqueidentifier,
    @OrderChargeID uniqueidentifier = NULL,
    @OrderLineID uniqueidentifier = NULL,
    @Amount decimal(19, 4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderChargeAllocation]
    SET
        [OrderChargeID] = ISNULL(@OrderChargeID, [OrderChargeID]),
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderChargeAllocations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderChargeAllocations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderChargeAllocation] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderChargeAllocation] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderChargeAllocation table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderChargeAllocation]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderChargeAllocation];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderChargeAllocation
ON [${flyway:defaultSchema}].[OrderChargeAllocation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderChargeAllocation]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderChargeAllocation] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderCheckoutAnswer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderCheckoutAnswer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderCheckoutAnswer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderCheckoutAnswer]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @QuestionKey nvarchar(100) = NULL,
    @QuestionLabel nvarchar(500) = NULL,
    @Answer nvarchar(1000) = NULL,
    @OtherText_Clear bit = 0,
    @OtherText nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderCheckoutAnswer]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [QuestionKey] = ISNULL(@QuestionKey, [QuestionKey]),
        [QuestionLabel] = ISNULL(@QuestionLabel, [QuestionLabel]),
        [Answer] = ISNULL(@Answer, [Answer]),
        [OtherText] = CASE WHEN @OtherText_Clear = 1 THEN NULL ELSE ISNULL(@OtherText, [OtherText]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderCheckoutAnswers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderCheckoutAnswers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCheckoutAnswer] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCheckoutAnswer] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderCheckoutAnswer table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderCheckoutAnswer]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderCheckoutAnswer];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderCheckoutAnswer
ON [${flyway:defaultSchema}].[OrderCheckoutAnswer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderCheckoutAnswer]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderCheckoutAnswer] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderCompanyPolicy
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy]
    @ID uniqueidentifier,
    @AllowPromotionStacking bit = NULL,
    @StackingMode nvarchar(20) = NULL,
    @RefuseUnpricedLines bit = NULL,
    @DefaultPriceListID_Clear bit = 0,
    @DefaultPriceListID uniqueidentifier = NULL,
    @DefaultPaymentTermsTypeID_Clear bit = 0,
    @DefaultPaymentTermsTypeID uniqueidentifier = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderCompanyPolicy]
    SET
        [AllowPromotionStacking] = ISNULL(@AllowPromotionStacking, [AllowPromotionStacking]),
        [StackingMode] = ISNULL(@StackingMode, [StackingMode]),
        [RefuseUnpricedLines] = ISNULL(@RefuseUnpricedLines, [RefuseUnpricedLines]),
        [DefaultPriceListID] = CASE WHEN @DefaultPriceListID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultPriceListID, [DefaultPriceListID]) END,
        [DefaultPaymentTermsTypeID] = CASE WHEN @DefaultPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultPaymentTermsTypeID, [DefaultPaymentTermsTypeID]) END,
        [PricingDriverClass] = CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, [PricingDriverClass]) END,
        [RenewalIncreasePercent] = CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, [RenewalIncreasePercent]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderCompanyPolicies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderCompanyPolicies]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderCompanyPolicy table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderCompanyPolicy]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderCompanyPolicy];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderCompanyPolicy
ON [${flyway:defaultSchema}].[OrderCompanyPolicy]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderCompanyPolicy]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderCompanyPolicy] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

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
        [WithdrawnAt] = CASE WHEN @WithdrawnAt_Clear = 1 THEN NULL ELSE ISNULL(@WithdrawnAt, [WithdrawnAt]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] TO [cdp_Developer], [cdp_Integration];
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
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderConcession]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderConcession] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

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
    @SourceCheckoutWidgetID uniqueidentifier = NULL,
    @FulfillmentStatus nvarchar(20) = NULL,
    @BillToAddressSnapshot_Clear bit = 0,
    @BillToAddressSnapshot nvarchar(MAX) = NULL,
    @ShipToAddressSnapshot_Clear bit = 0,
    @ShipToAddressSnapshot nvarchar(MAX) = NULL,
    @ConfirmedByUserID_Clear bit = 0,
    @ConfirmedByUserID uniqueidentifier = NULL,
    @IPCountry_Clear bit = 0,
    @IPCountry char(2) = NULL,
    @CardIssuingCountry_Clear bit = 0,
    @CardIssuingCountry char(2) = NULL,
    @InitialPaymentReceivedDate_Clear bit = 0,
    @InitialPaymentReceivedDate date = NULL
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
        [SourceCheckoutWidgetID] = CASE WHEN @SourceCheckoutWidgetID_Clear = 1 THEN NULL ELSE ISNULL(@SourceCheckoutWidgetID, [SourceCheckoutWidgetID]) END,
        [FulfillmentStatus] = ISNULL(@FulfillmentStatus, [FulfillmentStatus]),
        [BillToAddressSnapshot] = CASE WHEN @BillToAddressSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@BillToAddressSnapshot, [BillToAddressSnapshot]) END,
        [ShipToAddressSnapshot] = CASE WHEN @ShipToAddressSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressSnapshot, [ShipToAddressSnapshot]) END,
        [ConfirmedByUserID] = CASE WHEN @ConfirmedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedByUserID, [ConfirmedByUserID]) END,
        [IPCountry] = CASE WHEN @IPCountry_Clear = 1 THEN NULL ELSE ISNULL(@IPCountry, [IPCountry]) END,
        [CardIssuingCountry] = CASE WHEN @CardIssuingCountry_Clear = 1 THEN NULL ELSE ISNULL(@CardIssuingCountry, [CardIssuingCountry]) END,
        [InitialPaymentReceivedDate] = CASE WHEN @InitialPaymentReceivedDate_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentReceivedDate, [InitialPaymentReceivedDate]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderHeader] TO [cdp_Developer], [cdp_Integration];
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
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderHeader]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderHeader] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderHeaderPaymentSchedule
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderHeaderPaymentSchedule]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderHeaderPaymentSchedule];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderHeaderPaymentSchedule]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier = NULL,
    @InstallmentNumber int = NULL,
    @DueDate date = NULL,
    @Amount decimal(18, 2) = NULL,
    @Status nvarchar(20) = NULL,
    @DocumentNumber_Clear bit = 0,
    @DocumentNumber nvarchar(40) = NULL,
    @InvoicedAt_Clear bit = 0,
    @InvoicedAt datetimeoffset = NULL,
    @InvoicedByUserID_Clear bit = 0,
    @InvoicedByUserID uniqueidentifier = NULL,
    @JournalEntryID_Clear bit = 0,
    @JournalEntryID uniqueidentifier = NULL,
    @ExternalSystem_Clear bit = 0,
    @ExternalSystem nvarchar(40) = NULL,
    @ExternalInvoiceRef_Clear bit = 0,
    @ExternalInvoiceRef nvarchar(100) = NULL,
    @SentAt_Clear bit = 0,
    @SentAt datetimeoffset = NULL,
    @AmountPaid decimal(18, 2) = NULL,
    @Balance_Clear bit = 0,
    @Balance decimal(18, 2) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(500) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @AmountCredited decimal(18, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [InstallmentNumber] = ISNULL(@InstallmentNumber, [InstallmentNumber]),
        [DueDate] = ISNULL(@DueDate, [DueDate]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [Status] = ISNULL(@Status, [Status]),
        [DocumentNumber] = CASE WHEN @DocumentNumber_Clear = 1 THEN NULL ELSE ISNULL(@DocumentNumber, [DocumentNumber]) END,
        [InvoicedAt] = CASE WHEN @InvoicedAt_Clear = 1 THEN NULL ELSE ISNULL(@InvoicedAt, [InvoicedAt]) END,
        [InvoicedByUserID] = CASE WHEN @InvoicedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@InvoicedByUserID, [InvoicedByUserID]) END,
        [JournalEntryID] = CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, [JournalEntryID]) END,
        [ExternalSystem] = CASE WHEN @ExternalSystem_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSystem, [ExternalSystem]) END,
        [ExternalInvoiceRef] = CASE WHEN @ExternalInvoiceRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalInvoiceRef, [ExternalInvoiceRef]) END,
        [SentAt] = CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, [SentAt]) END,
        [AmountPaid] = ISNULL(@AmountPaid, [AmountPaid]),
        [Balance] = CASE WHEN @Balance_Clear = 1 THEN NULL ELSE ISNULL(@Balance, [Balance]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END,
        [AmountCredited] = ISNULL(@AmountCredited, [AmountCredited]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderHeaderPaymentSchedules] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderHeaderPaymentSchedules]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderHeaderPaymentSchedule] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderHeaderPaymentSchedule] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderHeaderPaymentSchedule table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderHeaderPaymentSchedule]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderHeaderPaymentSchedule];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderHeaderPaymentSchedule
ON [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLine]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @ProductID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier = NULL,
    @LineNumber int = NULL,
    @Quantity decimal(18, 4) = NULL,
    @UnitPrice decimal(19, 4) = NULL,
    @ProductPriceID_Clear bit = 0,
    @ProductPriceID uniqueidentifier = NULL,
    @DiscountPct decimal(7, 4) = NULL,
    @DiscountAmount decimal(19, 4) = NULL,
    @LineTotalNet_Clear bit = 0,
    @LineTotalNet decimal(18, 2) = NULL,
    @ChargeAmount decimal(18, 2) = NULL,
    @LineTax decimal(18, 2) = NULL,
    @LineTotalGross_Clear bit = 0,
    @LineTotalGross decimal(18, 2) = NULL,
    @ShipToAddressID_Clear bit = 0,
    @ShipToAddressID uniqueidentifier = NULL,
    @ShipToOrganizationID_Clear bit = 0,
    @ShipToOrganizationID uniqueidentifier = NULL,
    @ShipToPersonID_Clear bit = 0,
    @ShipToPersonID uniqueidentifier = NULL,
    @RenewsSubscriptionID_Clear bit = 0,
    @RenewsSubscriptionID uniqueidentifier = NULL,
    @ServicePeriodStart_Clear bit = 0,
    @ServicePeriodStart date = NULL,
    @ServicePeriodEnd_Clear bit = 0,
    @ServicePeriodEnd date = NULL,
    @FulfillmentStatus_Clear bit = 0,
    @FulfillmentStatus nvarchar(20) = NULL,
    @ReversesOrderLineID_Clear bit = 0,
    @ReversesOrderLineID uniqueidentifier = NULL,
    @SourceBundleProductID_Clear bit = 0,
    @SourceBundleProductID uniqueidentifier = NULL,
    @ParentOrderLineID_Clear bit = 0,
    @ParentOrderLineID uniqueidentifier = NULL,
    @IsRollupParent bit = NULL,
    @IsQuantityOverridden bit = NULL,
    @SubscriptionID_Clear bit = 0,
    @SubscriptionID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(500) = NULL,
    @JournalEntryID_Clear bit = 0,
    @JournalEntryID uniqueidentifier = NULL,
    @PriceOverridden bit = NULL,
    @PriceOverrideReason_Clear bit = 0,
    @PriceOverrideReason nvarchar(MAX) = NULL,
    @DimensionID_Clear bit = 0,
    @DimensionID uniqueidentifier = NULL,
    @DimensionValueID_Clear bit = 0,
    @DimensionValueID uniqueidentifier = NULL,
    @BilledToDate decimal(18, 2) = NULL,
    @RecognizedToDate decimal(18, 2) = NULL,
    @ShipToAddressSnapshot_Clear bit = 0,
    @ShipToAddressSnapshot nvarchar(MAX) = NULL,
    @SubscriptionAction_Clear bit = 0,
    @SubscriptionAction nvarchar(20) = NULL,
    @AcknowledgesCoverageOverlap bit = NULL,
    @ExtendedAmount_Clear bit = 0,
    @ExtendedAmount decimal(18, 2) = NULL,
    @CoverageOverlapReason_Clear bit = 0,
    @CoverageOverlapReason nvarchar(1000) = NULL,
    @ScheduleReduction_Clear bit = 0,
    @ScheduleReduction decimal(18, 2) = NULL,
    @CreditMemoAmount_Clear bit = 0,
    @CreditMemoAmount decimal(18, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLine]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [ProductID] = ISNULL(@ProductID, [ProductID]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [LineNumber] = ISNULL(@LineNumber, [LineNumber]),
        [Quantity] = ISNULL(@Quantity, [Quantity]),
        [UnitPrice] = ISNULL(@UnitPrice, [UnitPrice]),
        [ProductPriceID] = CASE WHEN @ProductPriceID_Clear = 1 THEN NULL ELSE ISNULL(@ProductPriceID, [ProductPriceID]) END,
        [DiscountPct] = ISNULL(@DiscountPct, [DiscountPct]),
        [DiscountAmount] = ISNULL(@DiscountAmount, [DiscountAmount]),
        [LineTotalNet] = CASE WHEN @LineTotalNet_Clear = 1 THEN NULL ELSE ISNULL(@LineTotalNet, [LineTotalNet]) END,
        [ChargeAmount] = ISNULL(@ChargeAmount, [ChargeAmount]),
        [LineTax] = ISNULL(@LineTax, [LineTax]),
        [LineTotalGross] = CASE WHEN @LineTotalGross_Clear = 1 THEN NULL ELSE ISNULL(@LineTotalGross, [LineTotalGross]) END,
        [ShipToAddressID] = CASE WHEN @ShipToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressID, [ShipToAddressID]) END,
        [ShipToOrganizationID] = CASE WHEN @ShipToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToOrganizationID, [ShipToOrganizationID]) END,
        [ShipToPersonID] = CASE WHEN @ShipToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToPersonID, [ShipToPersonID]) END,
        [RenewsSubscriptionID] = CASE WHEN @RenewsSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@RenewsSubscriptionID, [RenewsSubscriptionID]) END,
        [ServicePeriodStart] = CASE WHEN @ServicePeriodStart_Clear = 1 THEN NULL ELSE ISNULL(@ServicePeriodStart, [ServicePeriodStart]) END,
        [ServicePeriodEnd] = CASE WHEN @ServicePeriodEnd_Clear = 1 THEN NULL ELSE ISNULL(@ServicePeriodEnd, [ServicePeriodEnd]) END,
        [FulfillmentStatus] = CASE WHEN @FulfillmentStatus_Clear = 1 THEN NULL ELSE ISNULL(@FulfillmentStatus, [FulfillmentStatus]) END,
        [ReversesOrderLineID] = CASE WHEN @ReversesOrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesOrderLineID, [ReversesOrderLineID]) END,
        [SourceBundleProductID] = CASE WHEN @SourceBundleProductID_Clear = 1 THEN NULL ELSE ISNULL(@SourceBundleProductID, [SourceBundleProductID]) END,
        [ParentOrderLineID] = CASE WHEN @ParentOrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@ParentOrderLineID, [ParentOrderLineID]) END,
        [IsRollupParent] = ISNULL(@IsRollupParent, [IsRollupParent]),
        [IsQuantityOverridden] = ISNULL(@IsQuantityOverridden, [IsQuantityOverridden]),
        [SubscriptionID] = CASE WHEN @SubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionID, [SubscriptionID]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [JournalEntryID] = CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, [JournalEntryID]) END,
        [PriceOverridden] = ISNULL(@PriceOverridden, [PriceOverridden]),
        [PriceOverrideReason] = CASE WHEN @PriceOverrideReason_Clear = 1 THEN NULL ELSE ISNULL(@PriceOverrideReason, [PriceOverrideReason]) END,
        [DimensionID] = CASE WHEN @DimensionID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionID, [DimensionID]) END,
        [DimensionValueID] = CASE WHEN @DimensionValueID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionValueID, [DimensionValueID]) END,
        [BilledToDate] = ISNULL(@BilledToDate, [BilledToDate]),
        [RecognizedToDate] = ISNULL(@RecognizedToDate, [RecognizedToDate]),
        [ShipToAddressSnapshot] = CASE WHEN @ShipToAddressSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressSnapshot, [ShipToAddressSnapshot]) END,
        [SubscriptionAction] = CASE WHEN @SubscriptionAction_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionAction, [SubscriptionAction]) END,
        [AcknowledgesCoverageOverlap] = ISNULL(@AcknowledgesCoverageOverlap, [AcknowledgesCoverageOverlap]),
        [ExtendedAmount] = CASE WHEN @ExtendedAmount_Clear = 1 THEN NULL ELSE ISNULL(@ExtendedAmount, [ExtendedAmount]) END,
        [CoverageOverlapReason] = CASE WHEN @CoverageOverlapReason_Clear = 1 THEN NULL ELSE ISNULL(@CoverageOverlapReason, [CoverageOverlapReason]) END,
        [ScheduleReduction] = CASE WHEN @ScheduleReduction_Clear = 1 THEN NULL ELSE ISNULL(@ScheduleReduction, [ScheduleReduction]) END,
        [CreditMemoAmount] = CASE WHEN @CreditMemoAmount_Clear = 1 THEN NULL ELSE ISNULL(@CreditMemoAmount, [CreditMemoAmount]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderLines] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderLines]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLine] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLine] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderLine table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderLine]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderLine];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderLine
ON [${flyway:defaultSchema}].[OrderLine]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderLine]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderLine] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderLineChoice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderLineChoice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineChoice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineChoice]
    @ID uniqueidentifier,
    @OrderLineID uniqueidentifier = NULL,
    @GroupKey nvarchar(100) = NULL,
    @GroupLabel nvarchar(500) = NULL,
    @OptionValue nvarchar(100) = NULL,
    @OptionLabel nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLineChoice]
    SET
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [GroupKey] = ISNULL(@GroupKey, [GroupKey]),
        [GroupLabel] = ISNULL(@GroupLabel, [GroupLabel]),
        [OptionValue] = ISNULL(@OptionValue, [OptionValue]),
        [OptionLabel] = ISNULL(@OptionLabel, [OptionLabel]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderLineChoices] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderLineChoices]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineChoice] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineChoice] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderLineChoice table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderLineChoice]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderLineChoice];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderLineChoice
ON [${flyway:defaultSchema}].[OrderLineChoice]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderLineChoice]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderLineChoice] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderLineDimension
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderLineDimension]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineDimension];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineDimension]
    @ID uniqueidentifier,
    @OrderLineID uniqueidentifier = NULL,
    @DimensionID uniqueidentifier = NULL,
    @DimensionValueID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLineDimension]
    SET
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [DimensionID] = ISNULL(@DimensionID, [DimensionID]),
        [DimensionValueID] = ISNULL(@DimensionValueID, [DimensionValueID]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderLineDimensions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderLineDimensions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineDimension] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineDimension] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderLineDimension table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderLineDimension]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderLineDimension];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderLineDimension
ON [${flyway:defaultSchema}].[OrderLineDimension]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderLineDimension]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderLineDimension] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderLinePriceComponent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderLinePriceComponent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLinePriceComponent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLinePriceComponent]
    @ID uniqueidentifier,
    @OrderLineID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @ComponentType nvarchar(20) = NULL,
    @Label nvarchar(200) = NULL,
    @Amount decimal(19, 4) = NULL,
    @RunningTotal decimal(19, 4) = NULL,
    @SourceEntityID_Clear bit = 0,
    @SourceEntityID uniqueidentifier = NULL,
    @SourceRecordID_Clear bit = 0,
    @SourceRecordID nvarchar(400) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLinePriceComponent]
    SET
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [ComponentType] = ISNULL(@ComponentType, [ComponentType]),
        [Label] = ISNULL(@Label, [Label]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [RunningTotal] = ISNULL(@RunningTotal, [RunningTotal]),
        [SourceEntityID] = CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, [SourceEntityID]) END,
        [SourceRecordID] = CASE WHEN @SourceRecordID_Clear = 1 THEN NULL ELSE ISNULL(@SourceRecordID, [SourceRecordID]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderLinePriceComponents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderLinePriceComponents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLinePriceComponent] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLinePriceComponent] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderLinePriceComponent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderLinePriceComponent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderLinePriceComponent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderLinePriceComponent
ON [${flyway:defaultSchema}].[OrderLinePriceComponent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderLinePriceComponent]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderLinePriceComponent] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderLineProgressMeasurement
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderLineProgressMeasurement]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineProgressMeasurement];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineProgressMeasurement]
    @ID uniqueidentifier,
    @OrderLineID uniqueidentifier = NULL,
    @MeasurementDate date = NULL,
    @PercentComplete decimal(7, 4) = NULL,
    @MethodCode nvarchar(40) = NULL,
    @MeasureNumerator_Clear bit = 0,
    @MeasureNumerator decimal(18, 4) = NULL,
    @MeasureDenominator_Clear bit = 0,
    @MeasureDenominator decimal(18, 4) = NULL,
    @AttestedByUserID_Clear bit = 0,
    @AttestedByUserID uniqueidentifier = NULL,
    @SourceEntityID_Clear bit = 0,
    @SourceEntityID uniqueidentifier = NULL,
    @SourceRecordID_Clear bit = 0,
    @SourceRecordID nvarchar(400) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @RecognizedToDateBefore_Clear bit = 0,
    @RecognizedToDateBefore decimal(18, 2) = NULL,
    @RecognizedToDateAfter_Clear bit = 0,
    @RecognizedToDateAfter decimal(18, 2) = NULL,
    @RecognitionAmount_Clear bit = 0,
    @RecognitionAmount decimal(18, 2) = NULL,
    @JournalEntryID_Clear bit = 0,
    @JournalEntryID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @SupersedesMeasurementID_Clear bit = 0,
    @SupersedesMeasurementID uniqueidentifier = NULL,
    @ReversalJournalEntryID_Clear bit = 0,
    @ReversalJournalEntryID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
    SET
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [MeasurementDate] = ISNULL(@MeasurementDate, [MeasurementDate]),
        [PercentComplete] = ISNULL(@PercentComplete, [PercentComplete]),
        [MethodCode] = ISNULL(@MethodCode, [MethodCode]),
        [MeasureNumerator] = CASE WHEN @MeasureNumerator_Clear = 1 THEN NULL ELSE ISNULL(@MeasureNumerator, [MeasureNumerator]) END,
        [MeasureDenominator] = CASE WHEN @MeasureDenominator_Clear = 1 THEN NULL ELSE ISNULL(@MeasureDenominator, [MeasureDenominator]) END,
        [AttestedByUserID] = CASE WHEN @AttestedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AttestedByUserID, [AttestedByUserID]) END,
        [SourceEntityID] = CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, [SourceEntityID]) END,
        [SourceRecordID] = CASE WHEN @SourceRecordID_Clear = 1 THEN NULL ELSE ISNULL(@SourceRecordID, [SourceRecordID]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END,
        [RecognizedToDateBefore] = CASE WHEN @RecognizedToDateBefore_Clear = 1 THEN NULL ELSE ISNULL(@RecognizedToDateBefore, [RecognizedToDateBefore]) END,
        [RecognizedToDateAfter] = CASE WHEN @RecognizedToDateAfter_Clear = 1 THEN NULL ELSE ISNULL(@RecognizedToDateAfter, [RecognizedToDateAfter]) END,
        [RecognitionAmount] = CASE WHEN @RecognitionAmount_Clear = 1 THEN NULL ELSE ISNULL(@RecognitionAmount, [RecognitionAmount]) END,
        [JournalEntryID] = CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, [JournalEntryID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [SupersedesMeasurementID] = CASE WHEN @SupersedesMeasurementID_Clear = 1 THEN NULL ELSE ISNULL(@SupersedesMeasurementID, [SupersedesMeasurementID]) END,
        [ReversalJournalEntryID] = CASE WHEN @ReversalJournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@ReversalJournalEntryID, [ReversalJournalEntryID]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderLineProgressMeasurements] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderLineProgressMeasurements]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineProgressMeasurement] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineProgressMeasurement] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderLineProgressMeasurement table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderLineProgressMeasurement]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderLineProgressMeasurement];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderLineProgressMeasurement
ON [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderLineProgressMeasurement] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderSequence
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderSequence]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderSequence];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderSequence]
    @ID int,
    @NextSequenceNumber int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderSequence]
    SET
        [NextSequenceNumber] = ISNULL(@NextSequenceNumber, [NextSequenceNumber]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderSequences] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderSequences]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderSequence] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderSequence] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderSequence table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderSequence]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderSequence];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderSequence
ON [${flyway:defaultSchema}].[OrderSequence]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderSequence]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderSequence] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OutboundDelivery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOutboundDelivery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOutboundDelivery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOutboundDelivery]
    @ID uniqueidentifier,
    @OutboundEventID uniqueidentifier = NULL,
    @ConsumerKey nvarchar(100) = NULL,
    @GatesAccess bit = NULL,
    @Status nvarchar(20) = NULL,
    @Attempts int = NULL,
    @NextAttemptAt datetimeoffset = NULL,
    @DeadlineAt datetimeoffset = NULL,
    @LeaseUntil_Clear bit = 0,
    @LeaseUntil datetimeoffset = NULL,
    @LastAttemptAt_Clear bit = 0,
    @LastAttemptAt datetimeoffset = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(2000) = NULL,
    @DeliveredAt_Clear bit = 0,
    @DeliveredAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OutboundDelivery]
    SET
        [OutboundEventID] = ISNULL(@OutboundEventID, [OutboundEventID]),
        [ConsumerKey] = ISNULL(@ConsumerKey, [ConsumerKey]),
        [GatesAccess] = ISNULL(@GatesAccess, [GatesAccess]),
        [Status] = ISNULL(@Status, [Status]),
        [Attempts] = ISNULL(@Attempts, [Attempts]),
        [NextAttemptAt] = ISNULL(@NextAttemptAt, [NextAttemptAt]),
        [DeadlineAt] = ISNULL(@DeadlineAt, [DeadlineAt]),
        [LeaseUntil] = CASE WHEN @LeaseUntil_Clear = 1 THEN NULL ELSE ISNULL(@LeaseUntil, [LeaseUntil]) END,
        [LastAttemptAt] = CASE WHEN @LastAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAttemptAt, [LastAttemptAt]) END,
        [LastError] = CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, [LastError]) END,
        [DeliveredAt] = CASE WHEN @DeliveredAt_Clear = 1 THEN NULL ELSE ISNULL(@DeliveredAt, [DeliveredAt]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOutboundDeliveries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOutboundDeliveries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOutboundDelivery] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOutboundDelivery] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OutboundDelivery table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOutboundDelivery]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOutboundDelivery];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOutboundDelivery
ON [${flyway:defaultSchema}].[OutboundDelivery]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OutboundDelivery]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OutboundDelivery] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OutboundEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOutboundEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOutboundEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOutboundEvent]
    @ID uniqueidentifier,
    @EventType nvarchar(40) = NULL,
    @OrderHeaderID_Clear bit = 0,
    @OrderHeaderID uniqueidentifier = NULL,
    @EntitlementGrantID_Clear bit = 0,
    @EntitlementGrantID uniqueidentifier = NULL,
    @PayloadJSON nvarchar(MAX) = NULL,
    @OccurredAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OutboundEvent]
    SET
        [EventType] = ISNULL(@EventType, [EventType]),
        [OrderHeaderID] = CASE WHEN @OrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderID, [OrderHeaderID]) END,
        [EntitlementGrantID] = CASE WHEN @EntitlementGrantID_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementGrantID, [EntitlementGrantID]) END,
        [PayloadJSON] = ISNULL(@PayloadJSON, [PayloadJSON]),
        [OccurredAt] = ISNULL(@OccurredAt, [OccurredAt]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOutboundEvents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOutboundEvents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOutboundEvent] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOutboundEvent] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OutboundEvent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOutboundEvent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOutboundEvent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOutboundEvent
ON [${flyway:defaultSchema}].[OutboundEvent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OutboundEvent]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OutboundEvent] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentDetail]
    @ID uniqueidentifier,
    @CompanyID uniqueidentifier = NULL,
    @PaymentTypeID uniqueidentifier = NULL,
    @PaymentProviderID_Clear bit = 0,
    @PaymentProviderID uniqueidentifier = NULL,
    @SourceCustomerPaymentMethodID_Clear bit = 0,
    @SourceCustomerPaymentMethodID uniqueidentifier = NULL,
    @ProviderCustomerRef_Clear bit = 0,
    @ProviderCustomerRef nvarchar(100) = NULL,
    @ProviderInstrumentRef_Clear bit = 0,
    @ProviderInstrumentRef nvarchar(100) = NULL,
    @Brand_Clear bit = 0,
    @Brand nvarchar(40) = NULL,
    @Last4_Clear bit = 0,
    @Last4 char(4) = NULL,
    @ExpiryMonth_Clear bit = 0,
    @ExpiryMonth int = NULL,
    @ExpiryYear_Clear bit = 0,
    @ExpiryYear int = NULL,
    @HolderName_Clear bit = 0,
    @HolderName nvarchar(200) = NULL,
    @BankName_Clear bit = 0,
    @BankName nvarchar(200) = NULL,
    @RoutingLast4_Clear bit = 0,
    @RoutingLast4 char(4) = NULL,
    @AccountLast4_Clear bit = 0,
    @AccountLast4 char(4) = NULL,
    @BankAccountType_Clear bit = 0,
    @BankAccountType nvarchar(20) = NULL,
    @ReferenceNumber_Clear bit = 0,
    @ReferenceNumber nvarchar(100) = NULL,
    @InstrumentDate_Clear bit = 0,
    @InstrumentDate date = NULL,
    @StoredValueAccountID_Clear bit = 0,
    @StoredValueAccountID uniqueidentifier = NULL,
    @SourceOrderHeaderID_Clear bit = 0,
    @SourceOrderHeaderID uniqueidentifier = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentDetail]
    SET
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [PaymentTypeID] = ISNULL(@PaymentTypeID, [PaymentTypeID]),
        [PaymentProviderID] = CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, [PaymentProviderID]) END,
        [SourceCustomerPaymentMethodID] = CASE WHEN @SourceCustomerPaymentMethodID_Clear = 1 THEN NULL ELSE ISNULL(@SourceCustomerPaymentMethodID, [SourceCustomerPaymentMethodID]) END,
        [ProviderCustomerRef] = CASE WHEN @ProviderCustomerRef_Clear = 1 THEN NULL ELSE ISNULL(@ProviderCustomerRef, [ProviderCustomerRef]) END,
        [ProviderInstrumentRef] = CASE WHEN @ProviderInstrumentRef_Clear = 1 THEN NULL ELSE ISNULL(@ProviderInstrumentRef, [ProviderInstrumentRef]) END,
        [Brand] = CASE WHEN @Brand_Clear = 1 THEN NULL ELSE ISNULL(@Brand, [Brand]) END,
        [Last4] = CASE WHEN @Last4_Clear = 1 THEN NULL ELSE ISNULL(@Last4, [Last4]) END,
        [ExpiryMonth] = CASE WHEN @ExpiryMonth_Clear = 1 THEN NULL ELSE ISNULL(@ExpiryMonth, [ExpiryMonth]) END,
        [ExpiryYear] = CASE WHEN @ExpiryYear_Clear = 1 THEN NULL ELSE ISNULL(@ExpiryYear, [ExpiryYear]) END,
        [HolderName] = CASE WHEN @HolderName_Clear = 1 THEN NULL ELSE ISNULL(@HolderName, [HolderName]) END,
        [BankName] = CASE WHEN @BankName_Clear = 1 THEN NULL ELSE ISNULL(@BankName, [BankName]) END,
        [RoutingLast4] = CASE WHEN @RoutingLast4_Clear = 1 THEN NULL ELSE ISNULL(@RoutingLast4, [RoutingLast4]) END,
        [AccountLast4] = CASE WHEN @AccountLast4_Clear = 1 THEN NULL ELSE ISNULL(@AccountLast4, [AccountLast4]) END,
        [BankAccountType] = CASE WHEN @BankAccountType_Clear = 1 THEN NULL ELSE ISNULL(@BankAccountType, [BankAccountType]) END,
        [ReferenceNumber] = CASE WHEN @ReferenceNumber_Clear = 1 THEN NULL ELSE ISNULL(@ReferenceNumber, [ReferenceNumber]) END,
        [InstrumentDate] = CASE WHEN @InstrumentDate_Clear = 1 THEN NULL ELSE ISNULL(@InstrumentDate, [InstrumentDate]) END,
        [StoredValueAccountID] = CASE WHEN @StoredValueAccountID_Clear = 1 THEN NULL ELSE ISNULL(@StoredValueAccountID, [StoredValueAccountID]) END,
        [SourceOrderHeaderID] = CASE WHEN @SourceOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@SourceOrderHeaderID, [SourceOrderHeaderID]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentDetail] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentDetail] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentDetail
ON [${flyway:defaultSchema}].[PaymentDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PaymentDetail]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PaymentDetail] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

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
        [ReversalSource] = CASE WHEN @ReversalSource_Clear = 1 THEN NULL ELSE ISNULL(@ReversalSource, [ReversalSource]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentHeader] TO [cdp_Developer], [cdp_Integration];
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
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PaymentHeader]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PaymentHeader] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentIntent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentIntent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentIntent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentIntent]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @ProviderIntentID nvarchar(100) = NULL,
    @Status nvarchar(30) = NULL,
    @Amount decimal(18, 2) = NULL,
    @OrderHeaderID_Clear bit = 0,
    @OrderHeaderID uniqueidentifier = NULL,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @ProviderEventID_Clear bit = 0,
    @ProviderEventID nvarchar(100) = NULL,
    @LastEventAt_Clear bit = 0,
    @LastEventAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentIntent]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [ProviderIntentID] = ISNULL(@ProviderIntentID, [ProviderIntentID]),
        [Status] = ISNULL(@Status, [Status]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [OrderHeaderID] = CASE WHEN @OrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderID, [OrderHeaderID]) END,
        [BillToPersonID] = CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, [BillToPersonID]) END,
        [BillToOrganizationID] = CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, [BillToOrganizationID]) END,
        [ProviderEventID] = CASE WHEN @ProviderEventID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderEventID, [ProviderEventID]) END,
        [LastEventAt] = CASE WHEN @LastEventAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEventAt, [LastEventAt]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentIntents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentIntents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentIntent] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentIntent] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentIntent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentIntent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentIntent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentIntent
ON [${flyway:defaultSchema}].[PaymentIntent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PaymentIntent]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PaymentIntent] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentLine]
    @ID uniqueidentifier,
    @PaymentHeaderID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier = NULL,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @Amount decimal(18, 2) = NULL,
    @AllocatedAt datetimeoffset = NULL,
    @AllocatedByUserID_Clear bit = 0,
    @AllocatedByUserID uniqueidentifier = NULL,
    @BookedAt_Clear bit = 0,
    @BookedAt datetimeoffset = NULL,
    @OrderHeaderPaymentScheduleID_Clear bit = 0,
    @OrderHeaderPaymentScheduleID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentLine]
    SET
        [PaymentHeaderID] = ISNULL(@PaymentHeaderID, [PaymentHeaderID]),
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [OrderLineID] = CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, [OrderLineID]) END,
        [Amount] = ISNULL(@Amount, [Amount]),
        [AllocatedAt] = ISNULL(@AllocatedAt, [AllocatedAt]),
        [AllocatedByUserID] = CASE WHEN @AllocatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AllocatedByUserID, [AllocatedByUserID]) END,
        [BookedAt] = CASE WHEN @BookedAt_Clear = 1 THEN NULL ELSE ISNULL(@BookedAt, [BookedAt]) END,
        [OrderHeaderPaymentScheduleID] = CASE WHEN @OrderHeaderPaymentScheduleID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderPaymentScheduleID, [OrderHeaderPaymentScheduleID]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentLines] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentLines]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentLine] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentLine] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentLine table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentLine]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentLine];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentLine
ON [${flyway:defaultSchema}].[PaymentLine]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PaymentLine]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PaymentLine] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProvider]
    @ID uniqueidentifier,
    @PaymentProviderTypeID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier = NULL,
    @Name nvarchar(200) = NULL,
    @CredentialsRef_Clear bit = 0,
    @CredentialsRef nvarchar(200) = NULL,
    @IsLiveMode bit = NULL,
    @IsActive bit = NULL,
    @CompanyIntegrationID_Clear bit = 0,
    @CompanyIntegrationID uniqueidentifier = NULL,
    @BillsSubscriptions bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProvider]
    SET
        [PaymentProviderTypeID] = ISNULL(@PaymentProviderTypeID, [PaymentProviderTypeID]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [Name] = ISNULL(@Name, [Name]),
        [CredentialsRef] = CASE WHEN @CredentialsRef_Clear = 1 THEN NULL ELSE ISNULL(@CredentialsRef, [CredentialsRef]) END,
        [IsLiveMode] = ISNULL(@IsLiveMode, [IsLiveMode]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [CompanyIntegrationID] = CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, [CompanyIntegrationID]) END,
        [BillsSubscriptions] = ISNULL(@BillsSubscriptions, [BillsSubscriptions]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentProviders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentProviders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProvider] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProvider] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentProvider table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentProvider]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentProvider];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentProvider
ON [${flyway:defaultSchema}].[PaymentProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PaymentProvider]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PaymentProvider] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentProviderPrice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentProviderPrice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @ProviderPriceID nvarchar(255) = NULL,
    @ProductID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @IsActive bit = NULL,
    @UseForNewSubscriptions bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProviderPrice]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [ProviderPriceID] = ISNULL(@ProviderPriceID, [ProviderPriceID]),
        [ProductID] = ISNULL(@ProductID, [ProductID]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [UseForNewSubscriptions] = ISNULL(@UseForNewSubscriptions, [UseForNewSubscriptions]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentProviderPrices] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentProviderPrices]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentProviderPrice table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentProviderPrice]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentProviderPrice];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentProviderPrice
ON [${flyway:defaultSchema}].[PaymentProviderPrice]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PaymentProviderPrice]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PaymentProviderPrice] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentProviderSyncState
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentProviderSyncState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderSyncState];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderSyncState]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @ObjectName nvarchar(100) = NULL,
    @Watermark_Clear bit = 0,
    @Watermark nvarchar(100) = NULL,
    @LastPolledAt_Clear bit = 0,
    @LastPolledAt datetimeoffset = NULL,
    @LastSucceededAt_Clear bit = 0,
    @LastSucceededAt datetimeoffset = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProviderSyncState]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [ObjectName] = ISNULL(@ObjectName, [ObjectName]),
        [Watermark] = CASE WHEN @Watermark_Clear = 1 THEN NULL ELSE ISNULL(@Watermark, [Watermark]) END,
        [LastPolledAt] = CASE WHEN @LastPolledAt_Clear = 1 THEN NULL ELSE ISNULL(@LastPolledAt, [LastPolledAt]) END,
        [LastSucceededAt] = CASE WHEN @LastSucceededAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSucceededAt, [LastSucceededAt]) END,
        [LastError] = CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, [LastError]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentProviderSyncStates] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentProviderSyncStates]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderSyncState] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderSyncState] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentProviderSyncState table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentProviderSyncState]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentProviderSyncState];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentProviderSyncState
ON [${flyway:defaultSchema}].[PaymentProviderSyncState]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PaymentProviderSyncState]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PaymentProviderSyncState] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentProviderType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentProviderType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderType]
    @ID uniqueidentifier,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(200) = NULL,
    @SupportsTokenization bit = NULL,
    @SupportsRefund bit = NULL,
    @SupportsWebhooks bit = NULL,
    @Sequence int = NULL,
    @IsActive bit = NULL,
    @SupportsSubscriptionBilling bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProviderType]
    SET
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, [DriverClass]) END,
        [SupportsTokenization] = ISNULL(@SupportsTokenization, [SupportsTokenization]),
        [SupportsRefund] = ISNULL(@SupportsRefund, [SupportsRefund]),
        [SupportsWebhooks] = ISNULL(@SupportsWebhooks, [SupportsWebhooks]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [SupportsSubscriptionBilling] = ISNULL(@SupportsSubscriptionBilling, [SupportsSubscriptionBilling]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentProviderTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentProviderTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderType] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderType] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentProviderType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentProviderType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentProviderType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentProviderType
ON [${flyway:defaultSchema}].[PaymentProviderType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PaymentProviderType]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PaymentProviderType] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentSequence
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentSequence]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentSequence];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentSequence]
    @ID int,
    @NextSequenceNumber int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentSequence]
    SET
        [NextSequenceNumber] = ISNULL(@NextSequenceNumber, [NextSequenceNumber]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentSequences] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentSequences]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentSequence] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentSequence] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentSequence table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentSequence]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentSequence];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentSequence
ON [${flyway:defaultSchema}].[PaymentSequence]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PaymentSequence]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PaymentSequence] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentTermsType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentTermsType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentTermsType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentTermsType]
    @ID uniqueidentifier,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @NetDays int = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentTermsType]
    SET
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [NetDays] = ISNULL(@NetDays, [NetDays]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentTermsTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentTermsTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentTermsType] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentTermsType] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentTermsType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentTermsType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentTermsType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentTermsType
ON [${flyway:defaultSchema}].[PaymentTermsType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PaymentTermsType]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PaymentTermsType] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentType]
    @ID uniqueidentifier,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsReversal bit = NULL,
    @RequiresProvider bit = NULL,
    @RequiresInstrument bit = NULL,
    @RequiresReference bit = NULL,
    @DetailExtensionEntity_Clear bit = 0,
    @DetailExtensionEntity nvarchar(255) = NULL,
    @BookProcessingFeeInline bit = NULL,
    @Sequence int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentType]
    SET
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [IsReversal] = ISNULL(@IsReversal, [IsReversal]),
        [RequiresProvider] = ISNULL(@RequiresProvider, [RequiresProvider]),
        [RequiresInstrument] = ISNULL(@RequiresInstrument, [RequiresInstrument]),
        [RequiresReference] = ISNULL(@RequiresReference, [RequiresReference]),
        [DetailExtensionEntity] = CASE WHEN @DetailExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@DetailExtensionEntity, [DetailExtensionEntity]) END,
        [BookProcessingFeeInline] = ISNULL(@BookProcessingFeeInline, [BookProcessingFeeInline]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentType] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentType] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentType
ON [${flyway:defaultSchema}].[PaymentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PaymentType]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PaymentType] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentWebhookDelivery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentWebhookDelivery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentWebhookDelivery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentWebhookDelivery]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @ProviderEventID_Clear bit = 0,
    @ProviderEventID nvarchar(100) = NULL,
    @EventKind_Clear bit = 0,
    @EventKind nvarchar(100) = NULL,
    @PaymentIntentID_Clear bit = 0,
    @PaymentIntentID uniqueidentifier = NULL,
    @ProviderIntentID_Clear bit = 0,
    @ProviderIntentID nvarchar(100) = NULL,
    @ProviderChargeID_Clear bit = 0,
    @ProviderChargeID nvarchar(100) = NULL,
    @Outcome nvarchar(20) = NULL,
    @ReasonCode_Clear bit = 0,
    @ReasonCode nvarchar(40) = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(1000) = NULL,
    @OccurredAt_Clear bit = 0,
    @OccurredAt datetimeoffset = NULL,
    @FirstReceivedAt datetimeoffset = NULL,
    @LastReceivedAt datetimeoffset = NULL,
    @DeliveryCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentWebhookDelivery]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [ProviderEventID] = CASE WHEN @ProviderEventID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderEventID, [ProviderEventID]) END,
        [EventKind] = CASE WHEN @EventKind_Clear = 1 THEN NULL ELSE ISNULL(@EventKind, [EventKind]) END,
        [PaymentIntentID] = CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, [PaymentIntentID]) END,
        [ProviderIntentID] = CASE WHEN @ProviderIntentID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderIntentID, [ProviderIntentID]) END,
        [ProviderChargeID] = CASE WHEN @ProviderChargeID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderChargeID, [ProviderChargeID]) END,
        [Outcome] = ISNULL(@Outcome, [Outcome]),
        [ReasonCode] = CASE WHEN @ReasonCode_Clear = 1 THEN NULL ELSE ISNULL(@ReasonCode, [ReasonCode]) END,
        [Reason] = CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, [Reason]) END,
        [OccurredAt] = CASE WHEN @OccurredAt_Clear = 1 THEN NULL ELSE ISNULL(@OccurredAt, [OccurredAt]) END,
        [FirstReceivedAt] = ISNULL(@FirstReceivedAt, [FirstReceivedAt]),
        [LastReceivedAt] = ISNULL(@LastReceivedAt, [LastReceivedAt]),
        [DeliveryCount] = ISNULL(@DeliveryCount, [DeliveryCount]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentWebhookDeliveries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentWebhookDeliveries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentWebhookDelivery] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentWebhookDelivery] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentWebhookDelivery table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentWebhookDelivery]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentWebhookDelivery];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentWebhookDelivery
ON [${flyway:defaultSchema}].[PaymentWebhookDelivery]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PaymentWebhookDelivery]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PaymentWebhookDelivery] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PriceList
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePriceList]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePriceList];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePriceList]
    @ID uniqueidentifier,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @EffectiveFrom_Clear bit = 0,
    @EffectiveFrom date = NULL,
    @EffectiveTo_Clear bit = 0,
    @EffectiveTo date = NULL,
    @Status nvarchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PriceList]
    SET
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [EffectiveFrom] = CASE WHEN @EffectiveFrom_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveFrom, [EffectiveFrom]) END,
        [EffectiveTo] = CASE WHEN @EffectiveTo_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveTo, [EffectiveTo]) END,
        [Status] = ISNULL(@Status, [Status]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPriceLists] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPriceLists]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePriceList] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePriceList] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PriceList table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePriceList]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePriceList];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePriceList
ON [${flyway:defaultSchema}].[PriceList]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PriceList]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PriceList] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PriceListAssignment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePriceListAssignment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePriceListAssignment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePriceListAssignment]
    @ID uniqueidentifier,
    @PriceListID uniqueidentifier = NULL,
    @OrganizationID_Clear bit = 0,
    @OrganizationID uniqueidentifier = NULL,
    @PersonID_Clear bit = 0,
    @PersonID uniqueidentifier = NULL,
    @Priority int = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Status nvarchar(10) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PriceListAssignment]
    SET
        [PriceListID] = ISNULL(@PriceListID, [PriceListID]),
        [OrganizationID] = CASE WHEN @OrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@OrganizationID, [OrganizationID]) END,
        [PersonID] = CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, [PersonID]) END,
        [Priority] = ISNULL(@Priority, [Priority]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPriceListAssignments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPriceListAssignments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePriceListAssignment] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePriceListAssignment] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PriceListAssignment table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePriceListAssignment]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePriceListAssignment];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePriceListAssignment
ON [${flyway:defaultSchema}].[PriceListAssignment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PriceListAssignment]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PriceListAssignment] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PriceTier
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePriceTier]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePriceTier];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePriceTier]
    @ID uniqueidentifier,
    @ProductPriceID uniqueidentifier = NULL,
    @MinQuantity decimal(18, 4) = NULL,
    @MaxQuantity_Clear bit = 0,
    @MaxQuantity decimal(18, 4) = NULL,
    @Amount decimal(19, 4) = NULL,
    @SortOrder int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PriceTier]
    SET
        [ProductPriceID] = ISNULL(@ProductPriceID, [ProductPriceID]),
        [MinQuantity] = ISNULL(@MinQuantity, [MinQuantity]),
        [MaxQuantity] = CASE WHEN @MaxQuantity_Clear = 1 THEN NULL ELSE ISNULL(@MaxQuantity, [MaxQuantity]) END,
        [Amount] = ISNULL(@Amount, [Amount]),
        [SortOrder] = ISNULL(@SortOrder, [SortOrder]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPriceTiers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPriceTiers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePriceTier] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePriceTier] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PriceTier table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePriceTier]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePriceTier];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePriceTier
ON [${flyway:defaultSchema}].[PriceTier]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PriceTier]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PriceTier] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProduct]
    @ID uniqueidentifier,
    @Name nvarchar(200) = NULL,
    @SKU_Clear bit = 0,
    @SKU nvarchar(80) = NULL,
    @ProductTypeID uniqueidentifier = NULL,
    @ProductCategoryID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @SuccessorProductID_Clear bit = 0,
    @SuccessorProductID uniqueidentifier = NULL,
    @AvailableFrom_Clear bit = 0,
    @AvailableFrom date = NULL,
    @AvailableTo_Clear bit = 0,
    @AvailableTo date = NULL,
    @RevenueRecognitionTypeID uniqueidentifier = NULL,
    @StandaloneSellingPrice_Clear bit = 0,
    @StandaloneSellingPrice decimal(19, 4) = NULL,
    @SubscriptionTypeID_Clear bit = 0,
    @SubscriptionTypeID uniqueidentifier = NULL,
    @IsTaxable_Clear bit = 0,
    @IsTaxable bit = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TaxCategory_Clear bit = 0,
    @TaxCategory nvarchar(50) = NULL,
    @EntitlementGrantTiming_Clear bit = 0,
    @EntitlementGrantTiming nvarchar(20) = NULL,
    @EntitlementQuantityMode_Clear bit = 0,
    @EntitlementQuantityMode nvarchar(20) = NULL,
    @EntitlementValidityMode_Clear bit = 0,
    @EntitlementValidityMode nvarchar(20) = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @MaxQuantityPerLine_Clear bit = 0,
    @MaxQuantityPerLine decimal(18, 4) = NULL,
    @SubscriptionFamilyID_Clear bit = 0,
    @SubscriptionFamilyID uniqueidentifier = NULL,
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL,
    @RequiresSaleApproval_Clear bit = 0,
    @RequiresSaleApproval bit = NULL,
    @IsSellableNew bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Product]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [SKU] = CASE WHEN @SKU_Clear = 1 THEN NULL ELSE ISNULL(@SKU, [SKU]) END,
        [ProductTypeID] = ISNULL(@ProductTypeID, [ProductTypeID]),
        [ProductCategoryID] = ISNULL(@ProductCategoryID, [ProductCategoryID]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [Status] = ISNULL(@Status, [Status]),
        [SuccessorProductID] = CASE WHEN @SuccessorProductID_Clear = 1 THEN NULL ELSE ISNULL(@SuccessorProductID, [SuccessorProductID]) END,
        [AvailableFrom] = CASE WHEN @AvailableFrom_Clear = 1 THEN NULL ELSE ISNULL(@AvailableFrom, [AvailableFrom]) END,
        [AvailableTo] = CASE WHEN @AvailableTo_Clear = 1 THEN NULL ELSE ISNULL(@AvailableTo, [AvailableTo]) END,
        [RevenueRecognitionTypeID] = ISNULL(@RevenueRecognitionTypeID, [RevenueRecognitionTypeID]),
        [StandaloneSellingPrice] = CASE WHEN @StandaloneSellingPrice_Clear = 1 THEN NULL ELSE ISNULL(@StandaloneSellingPrice, [StandaloneSellingPrice]) END,
        [SubscriptionTypeID] = CASE WHEN @SubscriptionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTypeID, [SubscriptionTypeID]) END,
        [IsTaxable] = CASE WHEN @IsTaxable_Clear = 1 THEN NULL ELSE ISNULL(@IsTaxable, [IsTaxable]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [TaxCategory] = CASE WHEN @TaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@TaxCategory, [TaxCategory]) END,
        [EntitlementGrantTiming] = CASE WHEN @EntitlementGrantTiming_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementGrantTiming, [EntitlementGrantTiming]) END,
        [EntitlementQuantityMode] = CASE WHEN @EntitlementQuantityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementQuantityMode, [EntitlementQuantityMode]) END,
        [EntitlementValidityMode] = CASE WHEN @EntitlementValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementValidityMode, [EntitlementValidityMode]) END,
        [PricingDriverClass] = CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, [PricingDriverClass]) END,
        [MaxQuantityPerLine] = CASE WHEN @MaxQuantityPerLine_Clear = 1 THEN NULL ELSE ISNULL(@MaxQuantityPerLine, [MaxQuantityPerLine]) END,
        [SubscriptionFamilyID] = CASE WHEN @SubscriptionFamilyID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionFamilyID, [SubscriptionFamilyID]) END,
        [RenewalIncreasePercent] = CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, [RenewalIncreasePercent]) END,
        [RequiresSaleApproval] = CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, [RequiresSaleApproval]) END,
        [IsSellableNew] = ISNULL(@IsSellableNew, [IsSellableNew]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProducts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProducts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Product table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProduct]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProduct];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProduct
ON [${flyway:defaultSchema}].[Product]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[Product]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[Product] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductBundleItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductBundleItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductBundleItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductBundleItem]
    @ID uniqueidentifier,
    @BundleProductID uniqueidentifier = NULL,
    @ComponentProductID uniqueidentifier = NULL,
    @Quantity decimal(18, 4) = NULL,
    @PricingMode nvarchar(20) = NULL,
    @SortOrder int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductBundleItem]
    SET
        [BundleProductID] = ISNULL(@BundleProductID, [BundleProductID]),
        [ComponentProductID] = ISNULL(@ComponentProductID, [ComponentProductID]),
        [Quantity] = ISNULL(@Quantity, [Quantity]),
        [PricingMode] = ISNULL(@PricingMode, [PricingMode]),
        [SortOrder] = ISNULL(@SortOrder, [SortOrder]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductBundleItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductBundleItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductBundleItem] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductBundleItem] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductBundleItem table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductBundleItem]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductBundleItem];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductBundleItem
ON [${flyway:defaultSchema}].[ProductBundleItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[ProductBundleItem]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[ProductBundleItem] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductCategory]
    @ID uniqueidentifier,
    @CompanyID uniqueidentifier = NULL,
    @Code_Clear bit = 0,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @ParentProductCategoryID_Clear bit = 0,
    @ParentProductCategoryID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsActive bit = NULL,
    @DefaultIsTaxable_Clear bit = 0,
    @DefaultIsTaxable bit = NULL,
    @DefaultTaxCategory_Clear bit = 0,
    @DefaultTaxCategory nvarchar(50) = NULL,
    @DefaultEntitlementGrantTiming_Clear bit = 0,
    @DefaultEntitlementGrantTiming nvarchar(20) = NULL,
    @DefaultEntitlementQuantityMode_Clear bit = 0,
    @DefaultEntitlementQuantityMode nvarchar(20) = NULL,
    @DefaultEntitlementValidityMode_Clear bit = 0,
    @DefaultEntitlementValidityMode nvarchar(20) = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL,
    @RequiresSaleApproval_Clear bit = 0,
    @RequiresSaleApproval bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductCategory]
    SET
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [Code] = CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, [Code]) END,
        [Name] = ISNULL(@Name, [Name]),
        [ParentProductCategoryID] = CASE WHEN @ParentProductCategoryID_Clear = 1 THEN NULL ELSE ISNULL(@ParentProductCategoryID, [ParentProductCategoryID]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [DefaultIsTaxable] = CASE WHEN @DefaultIsTaxable_Clear = 1 THEN NULL ELSE ISNULL(@DefaultIsTaxable, [DefaultIsTaxable]) END,
        [DefaultTaxCategory] = CASE WHEN @DefaultTaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@DefaultTaxCategory, [DefaultTaxCategory]) END,
        [DefaultEntitlementGrantTiming] = CASE WHEN @DefaultEntitlementGrantTiming_Clear = 1 THEN NULL ELSE ISNULL(@DefaultEntitlementGrantTiming, [DefaultEntitlementGrantTiming]) END,
        [DefaultEntitlementQuantityMode] = CASE WHEN @DefaultEntitlementQuantityMode_Clear = 1 THEN NULL ELSE ISNULL(@DefaultEntitlementQuantityMode, [DefaultEntitlementQuantityMode]) END,
        [DefaultEntitlementValidityMode] = CASE WHEN @DefaultEntitlementValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@DefaultEntitlementValidityMode, [DefaultEntitlementValidityMode]) END,
        [PricingDriverClass] = CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, [PricingDriverClass]) END,
        [RenewalIncreasePercent] = CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, [RenewalIncreasePercent]) END,
        [RequiresSaleApproval] = CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, [RequiresSaleApproval]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductCategory] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductCategory] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductCategory
ON [${flyway:defaultSchema}].[ProductCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[ProductCategory]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[ProductCategory] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductEntitlement
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductEntitlement]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductEntitlement];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductEntitlement]
    @ID uniqueidentifier,
    @ProductID uniqueidentifier = NULL,
    @EntitlementType nvarchar(40) = NULL,
    @Code nvarchar(80) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(200) = NULL,
    @Quantity_Clear bit = 0,
    @Quantity decimal(18, 4) = NULL,
    @UnitOfMeasure_Clear bit = 0,
    @UnitOfMeasure nvarchar(40) = NULL,
    @IsActive bit = NULL,
    @ValidityMode_Clear bit = 0,
    @ValidityMode nvarchar(20) = NULL,
    @ValidityDurationDays_Clear bit = 0,
    @ValidityDurationDays int = NULL,
    @AccessLeadHours_Clear bit = 0,
    @AccessLeadHours int = NULL,
    @AccessLagHours_Clear bit = 0,
    @AccessLagHours int = NULL,
    @ChoiceGroupKey_Clear bit = 0,
    @ChoiceGroupKey nvarchar(100) = NULL,
    @ChoiceOptionValue_Clear bit = 0,
    @ChoiceOptionValue nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductEntitlement]
    SET
        [ProductID] = ISNULL(@ProductID, [ProductID]),
        [EntitlementType] = ISNULL(@EntitlementType, [EntitlementType]),
        [Code] = ISNULL(@Code, [Code]),
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [Quantity] = CASE WHEN @Quantity_Clear = 1 THEN NULL ELSE ISNULL(@Quantity, [Quantity]) END,
        [UnitOfMeasure] = CASE WHEN @UnitOfMeasure_Clear = 1 THEN NULL ELSE ISNULL(@UnitOfMeasure, [UnitOfMeasure]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [ValidityMode] = CASE WHEN @ValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@ValidityMode, [ValidityMode]) END,
        [ValidityDurationDays] = CASE WHEN @ValidityDurationDays_Clear = 1 THEN NULL ELSE ISNULL(@ValidityDurationDays, [ValidityDurationDays]) END,
        [AccessLeadHours] = CASE WHEN @AccessLeadHours_Clear = 1 THEN NULL ELSE ISNULL(@AccessLeadHours, [AccessLeadHours]) END,
        [AccessLagHours] = CASE WHEN @AccessLagHours_Clear = 1 THEN NULL ELSE ISNULL(@AccessLagHours, [AccessLagHours]) END,
        [ChoiceGroupKey] = CASE WHEN @ChoiceGroupKey_Clear = 1 THEN NULL ELSE ISNULL(@ChoiceGroupKey, [ChoiceGroupKey]) END,
        [ChoiceOptionValue] = CASE WHEN @ChoiceOptionValue_Clear = 1 THEN NULL ELSE ISNULL(@ChoiceOptionValue, [ChoiceOptionValue]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductEntitlements] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductEntitlements]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductEntitlement] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductEntitlement] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductEntitlement table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductEntitlement]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductEntitlement];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductEntitlement
ON [${flyway:defaultSchema}].[ProductEntitlement]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[ProductEntitlement]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[ProductEntitlement] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductPrice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductPrice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductPrice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductPrice]
    @ID uniqueidentifier,
    @ProductID_Clear bit = 0,
    @ProductID uniqueidentifier = NULL,
    @PriceListID_Clear bit = 0,
    @PriceListID uniqueidentifier = NULL,
    @PricingModel nvarchar(20) = NULL,
    @FeeType nvarchar(20) = NULL,
    @Amount decimal(19, 4) = NULL,
    @UnitOfMeasure_Clear bit = 0,
    @UnitOfMeasure nvarchar(40) = NULL,
    @PackageQuantity_Clear bit = 0,
    @PackageQuantity decimal(18, 4) = NULL,
    @MinQuantity_Clear bit = 0,
    @MinQuantity decimal(18, 4) = NULL,
    @MaxQuantity_Clear bit = 0,
    @MaxQuantity decimal(18, 4) = NULL,
    @EffectiveFrom date = NULL,
    @EffectiveTo_Clear bit = 0,
    @EffectiveTo date = NULL,
    @RecurrenceMonths_Clear bit = 0,
    @RecurrenceMonths nvarchar(40) = NULL,
    @RecurrenceDaysOfWeek_Clear bit = 0,
    @RecurrenceDaysOfWeek nvarchar(20) = NULL,
    @RecurrenceDayOfMonthMin_Clear bit = 0,
    @RecurrenceDayOfMonthMin tinyint = NULL,
    @RecurrenceDayOfMonthMax_Clear bit = 0,
    @RecurrenceDayOfMonthMax tinyint = NULL,
    @TimeOfDayStart_Clear bit = 0,
    @TimeOfDayStart time = NULL,
    @TimeOfDayEnd_Clear bit = 0,
    @TimeOfDayEnd time = NULL,
    @Priority int = NULL,
    @Status nvarchar(10) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Name nvarchar(100) = NULL,
    @ProductCategoryID_Clear bit = 0,
    @ProductCategoryID uniqueidentifier = NULL,
    @Applicability_Clear bit = 0,
    @Applicability nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductPrice]
    SET
        [ProductID] = CASE WHEN @ProductID_Clear = 1 THEN NULL ELSE ISNULL(@ProductID, [ProductID]) END,
        [PriceListID] = CASE WHEN @PriceListID_Clear = 1 THEN NULL ELSE ISNULL(@PriceListID, [PriceListID]) END,
        [PricingModel] = ISNULL(@PricingModel, [PricingModel]),
        [FeeType] = ISNULL(@FeeType, [FeeType]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [UnitOfMeasure] = CASE WHEN @UnitOfMeasure_Clear = 1 THEN NULL ELSE ISNULL(@UnitOfMeasure, [UnitOfMeasure]) END,
        [PackageQuantity] = CASE WHEN @PackageQuantity_Clear = 1 THEN NULL ELSE ISNULL(@PackageQuantity, [PackageQuantity]) END,
        [MinQuantity] = CASE WHEN @MinQuantity_Clear = 1 THEN NULL ELSE ISNULL(@MinQuantity, [MinQuantity]) END,
        [MaxQuantity] = CASE WHEN @MaxQuantity_Clear = 1 THEN NULL ELSE ISNULL(@MaxQuantity, [MaxQuantity]) END,
        [EffectiveFrom] = ISNULL(@EffectiveFrom, [EffectiveFrom]),
        [EffectiveTo] = CASE WHEN @EffectiveTo_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveTo, [EffectiveTo]) END,
        [RecurrenceMonths] = CASE WHEN @RecurrenceMonths_Clear = 1 THEN NULL ELSE ISNULL(@RecurrenceMonths, [RecurrenceMonths]) END,
        [RecurrenceDaysOfWeek] = CASE WHEN @RecurrenceDaysOfWeek_Clear = 1 THEN NULL ELSE ISNULL(@RecurrenceDaysOfWeek, [RecurrenceDaysOfWeek]) END,
        [RecurrenceDayOfMonthMin] = CASE WHEN @RecurrenceDayOfMonthMin_Clear = 1 THEN NULL ELSE ISNULL(@RecurrenceDayOfMonthMin, [RecurrenceDayOfMonthMin]) END,
        [RecurrenceDayOfMonthMax] = CASE WHEN @RecurrenceDayOfMonthMax_Clear = 1 THEN NULL ELSE ISNULL(@RecurrenceDayOfMonthMax, [RecurrenceDayOfMonthMax]) END,
        [TimeOfDayStart] = CASE WHEN @TimeOfDayStart_Clear = 1 THEN NULL ELSE ISNULL(@TimeOfDayStart, [TimeOfDayStart]) END,
        [TimeOfDayEnd] = CASE WHEN @TimeOfDayEnd_Clear = 1 THEN NULL ELSE ISNULL(@TimeOfDayEnd, [TimeOfDayEnd]) END,
        [Priority] = ISNULL(@Priority, [Priority]),
        [Status] = ISNULL(@Status, [Status]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Name] = ISNULL(@Name, [Name]),
        [ProductCategoryID] = CASE WHEN @ProductCategoryID_Clear = 1 THEN NULL ELSE ISNULL(@ProductCategoryID, [ProductCategoryID]) END,
        [Applicability] = CASE WHEN @Applicability_Clear = 1 THEN NULL ELSE ISNULL(@Applicability, [Applicability]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductPrices] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductPrices]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductPrice] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductPrice] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductPrice table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductPrice]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductPrice];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductPrice
ON [${flyway:defaultSchema}].[ProductPrice]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[ProductPrice]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[ProductPrice] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductType]
    @ID uniqueidentifier,
    @Code_Clear bit = 0,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @RequiresFulfillment bit = NULL,
    @DefaultRevenueRecognitionTypeID_Clear bit = 0,
    @DefaultRevenueRecognitionTypeID uniqueidentifier = NULL,
    @DefaultIsTaxable bit = NULL,
    @DefaultTaxCategory_Clear bit = 0,
    @DefaultTaxCategory nvarchar(50) = NULL,
    @DefaultSubscriptionTypeID_Clear bit = 0,
    @DefaultSubscriptionTypeID uniqueidentifier = NULL,
    @ProductExtensionEntity_Clear bit = 0,
    @ProductExtensionEntity nvarchar(255) = NULL,
    @OrderLineExtensionEntity_Clear bit = 0,
    @OrderLineExtensionEntity nvarchar(255) = NULL,
    @IsActive bit = NULL,
    @DefaultEntitlementGrantTiming nvarchar(20) = NULL,
    @DefaultEntitlementQuantityMode nvarchar(20) = NULL,
    @DefaultEntitlementValidityMode nvarchar(20) = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @RequiresSaleApproval_Clear bit = 0,
    @RequiresSaleApproval bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductType]
    SET
        [Code] = CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, [Code]) END,
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [RequiresFulfillment] = ISNULL(@RequiresFulfillment, [RequiresFulfillment]),
        [DefaultRevenueRecognitionTypeID] = CASE WHEN @DefaultRevenueRecognitionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultRevenueRecognitionTypeID, [DefaultRevenueRecognitionTypeID]) END,
        [DefaultIsTaxable] = ISNULL(@DefaultIsTaxable, [DefaultIsTaxable]),
        [DefaultTaxCategory] = CASE WHEN @DefaultTaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@DefaultTaxCategory, [DefaultTaxCategory]) END,
        [DefaultSubscriptionTypeID] = CASE WHEN @DefaultSubscriptionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultSubscriptionTypeID, [DefaultSubscriptionTypeID]) END,
        [ProductExtensionEntity] = CASE WHEN @ProductExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@ProductExtensionEntity, [ProductExtensionEntity]) END,
        [OrderLineExtensionEntity] = CASE WHEN @OrderLineExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineExtensionEntity, [OrderLineExtensionEntity]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [DefaultEntitlementGrantTiming] = ISNULL(@DefaultEntitlementGrantTiming, [DefaultEntitlementGrantTiming]),
        [DefaultEntitlementQuantityMode] = ISNULL(@DefaultEntitlementQuantityMode, [DefaultEntitlementQuantityMode]),
        [DefaultEntitlementValidityMode] = ISNULL(@DefaultEntitlementValidityMode, [DefaultEntitlementValidityMode]),
        [PricingDriverClass] = CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, [PricingDriverClass]) END,
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [RequiresSaleApproval] = CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, [RequiresSaleApproval]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductType] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductType] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductType
ON [${flyway:defaultSchema}].[ProductType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[ProductType]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[ProductType] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Promotion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePromotion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePromotion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePromotion]
    @ID uniqueidentifier,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @PromotionTypeID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @Value decimal(19, 4) = NULL,
    @AppliesAt nvarchar(10) = NULL,
    @AllowsStacking bit = NULL,
    @StackSequence int = NULL,
    @MaxRedemptions_Clear bit = 0,
    @MaxRedemptions int = NULL,
    @MaxRedemptionsPerCustomer_Clear bit = 0,
    @MaxRedemptionsPerCustomer int = NULL,
    @MinimumOrderAmount_Clear bit = 0,
    @MinimumOrderAmount decimal(19, 4) = NULL,
    @MinimumQuantity_Clear bit = 0,
    @MinimumQuantity decimal(18, 4) = NULL,
    @EffectiveFrom_Clear bit = 0,
    @EffectiveFrom datetimeoffset = NULL,
    @EffectiveTo_Clear bit = 0,
    @EffectiveTo datetimeoffset = NULL,
    @RecurrenceMonths_Clear bit = 0,
    @RecurrenceMonths nvarchar(40) = NULL,
    @RecurrenceDaysOfWeek_Clear bit = 0,
    @RecurrenceDaysOfWeek nvarchar(20) = NULL,
    @TimeOfDayStart_Clear bit = 0,
    @TimeOfDayStart time = NULL,
    @TimeOfDayEnd_Clear bit = 0,
    @TimeOfDayEnd time = NULL,
    @QualifierKey_Clear bit = 0,
    @QualifierKey nvarchar(100) = NULL,
    @Status nvarchar(10) = NULL,
    @AppliesToRenewals bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Promotion]
    SET
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [PromotionTypeID] = ISNULL(@PromotionTypeID, [PromotionTypeID]),
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [Value] = ISNULL(@Value, [Value]),
        [AppliesAt] = ISNULL(@AppliesAt, [AppliesAt]),
        [AllowsStacking] = ISNULL(@AllowsStacking, [AllowsStacking]),
        [StackSequence] = ISNULL(@StackSequence, [StackSequence]),
        [MaxRedemptions] = CASE WHEN @MaxRedemptions_Clear = 1 THEN NULL ELSE ISNULL(@MaxRedemptions, [MaxRedemptions]) END,
        [MaxRedemptionsPerCustomer] = CASE WHEN @MaxRedemptionsPerCustomer_Clear = 1 THEN NULL ELSE ISNULL(@MaxRedemptionsPerCustomer, [MaxRedemptionsPerCustomer]) END,
        [MinimumOrderAmount] = CASE WHEN @MinimumOrderAmount_Clear = 1 THEN NULL ELSE ISNULL(@MinimumOrderAmount, [MinimumOrderAmount]) END,
        [MinimumQuantity] = CASE WHEN @MinimumQuantity_Clear = 1 THEN NULL ELSE ISNULL(@MinimumQuantity, [MinimumQuantity]) END,
        [EffectiveFrom] = CASE WHEN @EffectiveFrom_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveFrom, [EffectiveFrom]) END,
        [EffectiveTo] = CASE WHEN @EffectiveTo_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveTo, [EffectiveTo]) END,
        [RecurrenceMonths] = CASE WHEN @RecurrenceMonths_Clear = 1 THEN NULL ELSE ISNULL(@RecurrenceMonths, [RecurrenceMonths]) END,
        [RecurrenceDaysOfWeek] = CASE WHEN @RecurrenceDaysOfWeek_Clear = 1 THEN NULL ELSE ISNULL(@RecurrenceDaysOfWeek, [RecurrenceDaysOfWeek]) END,
        [TimeOfDayStart] = CASE WHEN @TimeOfDayStart_Clear = 1 THEN NULL ELSE ISNULL(@TimeOfDayStart, [TimeOfDayStart]) END,
        [TimeOfDayEnd] = CASE WHEN @TimeOfDayEnd_Clear = 1 THEN NULL ELSE ISNULL(@TimeOfDayEnd, [TimeOfDayEnd]) END,
        [QualifierKey] = CASE WHEN @QualifierKey_Clear = 1 THEN NULL ELSE ISNULL(@QualifierKey, [QualifierKey]) END,
        [Status] = ISNULL(@Status, [Status]),
        [AppliesToRenewals] = ISNULL(@AppliesToRenewals, [AppliesToRenewals]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPromotions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPromotions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePromotion] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePromotion] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Promotion table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePromotion]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePromotion];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePromotion
ON [${flyway:defaultSchema}].[Promotion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[Promotion]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[Promotion] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PromotionCode
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePromotionCode]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePromotionCode];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePromotionCode]
    @ID uniqueidentifier,
    @PromotionID uniqueidentifier = NULL,
    @Code nvarchar(60) = NULL,
    @MaxRedemptions_Clear bit = 0,
    @MaxRedemptions int = NULL,
    @AssignedOrganizationID_Clear bit = 0,
    @AssignedOrganizationID uniqueidentifier = NULL,
    @AssignedPersonID_Clear bit = 0,
    @AssignedPersonID uniqueidentifier = NULL,
    @EffectiveFrom_Clear bit = 0,
    @EffectiveFrom datetimeoffset = NULL,
    @EffectiveTo_Clear bit = 0,
    @EffectiveTo datetimeoffset = NULL,
    @Status nvarchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PromotionCode]
    SET
        [PromotionID] = ISNULL(@PromotionID, [PromotionID]),
        [Code] = ISNULL(@Code, [Code]),
        [MaxRedemptions] = CASE WHEN @MaxRedemptions_Clear = 1 THEN NULL ELSE ISNULL(@MaxRedemptions, [MaxRedemptions]) END,
        [AssignedOrganizationID] = CASE WHEN @AssignedOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@AssignedOrganizationID, [AssignedOrganizationID]) END,
        [AssignedPersonID] = CASE WHEN @AssignedPersonID_Clear = 1 THEN NULL ELSE ISNULL(@AssignedPersonID, [AssignedPersonID]) END,
        [EffectiveFrom] = CASE WHEN @EffectiveFrom_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveFrom, [EffectiveFrom]) END,
        [EffectiveTo] = CASE WHEN @EffectiveTo_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveTo, [EffectiveTo]) END,
        [Status] = ISNULL(@Status, [Status]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPromotionCodes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPromotionCodes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePromotionCode] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePromotionCode] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PromotionCode table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePromotionCode]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePromotionCode];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePromotionCode
ON [${flyway:defaultSchema}].[PromotionCode]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PromotionCode]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PromotionCode] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PromotionTarget
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePromotionTarget]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePromotionTarget];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePromotionTarget]
    @ID uniqueidentifier,
    @PromotionID uniqueidentifier = NULL,
    @ProductID_Clear bit = 0,
    @ProductID uniqueidentifier = NULL,
    @ProductCategoryID_Clear bit = 0,
    @ProductCategoryID uniqueidentifier = NULL,
    @IncludeDescendants bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PromotionTarget]
    SET
        [PromotionID] = ISNULL(@PromotionID, [PromotionID]),
        [ProductID] = CASE WHEN @ProductID_Clear = 1 THEN NULL ELSE ISNULL(@ProductID, [ProductID]) END,
        [ProductCategoryID] = CASE WHEN @ProductCategoryID_Clear = 1 THEN NULL ELSE ISNULL(@ProductCategoryID, [ProductCategoryID]) END,
        [IncludeDescendants] = ISNULL(@IncludeDescendants, [IncludeDescendants]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPromotionTargets] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPromotionTargets]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePromotionTarget] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePromotionTarget] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PromotionTarget table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePromotionTarget]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePromotionTarget];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePromotionTarget
ON [${flyway:defaultSchema}].[PromotionTarget]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PromotionTarget]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PromotionTarget] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PromotionType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePromotionType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePromotionType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePromotionType]
    @ID uniqueidentifier,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Sequence int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PromotionType]
    SET
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPromotionTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPromotionTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePromotionType] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePromotionType] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PromotionType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePromotionType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePromotionType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePromotionType
ON [${flyway:defaultSchema}].[PromotionType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[PromotionType]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[PromotionType] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ReferralProgram
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateReferralProgram]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateReferralProgram];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateReferralProgram]
    @ID uniqueidentifier,
    @CompanyID uniqueidentifier = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DaysPerReferral int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReferralProgram]
    SET
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DaysPerReferral] = ISNULL(@DaysPerReferral, [DaysPerReferral]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwReferralPrograms] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwReferralPrograms]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReferralProgram] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReferralProgram] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ReferralProgram table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateReferralProgram]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateReferralProgram];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateReferralProgram
ON [${flyway:defaultSchema}].[ReferralProgram]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[ReferralProgram]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[ReferralProgram] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RevenueRecognitionType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRevenueRecognitionType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRevenueRecognitionType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRevenueRecognitionType]
    @ID uniqueidentifier,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(200) = NULL,
    @IsDeferred bit = NULL,
    @RequiresServicePeriod bit = NULL,
    @Sequence int = NULL,
    @IsActive bit = NULL,
    @ScheduleBasis nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RevenueRecognitionType]
    SET
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = ISNULL(@DriverClass, [DriverClass]),
        [IsDeferred] = ISNULL(@IsDeferred, [IsDeferred]),
        [RequiresServicePeriod] = ISNULL(@RequiresServicePeriod, [RequiresServicePeriod]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [ScheduleBasis] = ISNULL(@ScheduleBasis, [ScheduleBasis]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRevenueRecognitionTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRevenueRecognitionTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRevenueRecognitionType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RevenueRecognitionType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRevenueRecognitionType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRevenueRecognitionType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRevenueRecognitionType
ON [${flyway:defaultSchema}].[RevenueRecognitionType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[RevenueRecognitionType]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[RevenueRecognitionType] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SalesAuthority
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSalesAuthority]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSalesAuthority];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSalesAuthority]
    @ID uniqueidentifier,
    @SalesRepUserID uniqueidentifier = NULL,
    @MaxDiscountPct_Clear bit = 0,
    @MaxDiscountPct decimal(7, 4) = NULL,
    @MaxOrderValue_Clear bit = 0,
    @MaxOrderValue decimal(18, 2) = NULL,
    @AllowedPaymentTermsTypeIDs_Clear bit = 0,
    @AllowedPaymentTermsTypeIDs nvarchar(MAX) = NULL,
    @AllowedProductCategoryIDs_Clear bit = 0,
    @AllowedProductCategoryIDs nvarchar(MAX) = NULL,
    @IsActive bit = NULL,
    @MaxConcessionValue_Clear bit = 0,
    @MaxConcessionValue decimal(18, 2) = NULL,
    @MaxTermExtensionDays_Clear bit = 0,
    @MaxTermExtensionDays int = NULL,
    @MaxConcessionPctOfContract_Clear bit = 0,
    @MaxConcessionPctOfContract decimal(7, 4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SalesAuthority]
    SET
        [SalesRepUserID] = ISNULL(@SalesRepUserID, [SalesRepUserID]),
        [MaxDiscountPct] = CASE WHEN @MaxDiscountPct_Clear = 1 THEN NULL ELSE ISNULL(@MaxDiscountPct, [MaxDiscountPct]) END,
        [MaxOrderValue] = CASE WHEN @MaxOrderValue_Clear = 1 THEN NULL ELSE ISNULL(@MaxOrderValue, [MaxOrderValue]) END,
        [AllowedPaymentTermsTypeIDs] = CASE WHEN @AllowedPaymentTermsTypeIDs_Clear = 1 THEN NULL ELSE ISNULL(@AllowedPaymentTermsTypeIDs, [AllowedPaymentTermsTypeIDs]) END,
        [AllowedProductCategoryIDs] = CASE WHEN @AllowedProductCategoryIDs_Clear = 1 THEN NULL ELSE ISNULL(@AllowedProductCategoryIDs, [AllowedProductCategoryIDs]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [MaxConcessionValue] = CASE WHEN @MaxConcessionValue_Clear = 1 THEN NULL ELSE ISNULL(@MaxConcessionValue, [MaxConcessionValue]) END,
        [MaxTermExtensionDays] = CASE WHEN @MaxTermExtensionDays_Clear = 1 THEN NULL ELSE ISNULL(@MaxTermExtensionDays, [MaxTermExtensionDays]) END,
        [MaxConcessionPctOfContract] = CASE WHEN @MaxConcessionPctOfContract_Clear = 1 THEN NULL ELSE ISNULL(@MaxConcessionPctOfContract, [MaxConcessionPctOfContract]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSalesAuthorities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSalesAuthorities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesAuthority] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesAuthority] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SalesAuthority table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSalesAuthority]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSalesAuthority];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSalesAuthority
ON [${flyway:defaultSchema}].[SalesAuthority]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[SalesAuthority]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[SalesAuthority] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SalesRule
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSalesRule]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSalesRule];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSalesRule]
    @ID uniqueidentifier,
    @Name nvarchar(200) = NULL,
    @RuleType nvarchar(40) = NULL,
    @Scope nvarchar(40) = NULL,
    @ScopeReferenceID_Clear bit = 0,
    @ScopeReferenceID uniqueidentifier = NULL,
    @PredicateJson_Clear bit = 0,
    @PredicateJson nvarchar(MAX) = NULL,
    @ApprovalRequiredRoleID_Clear bit = 0,
    @ApprovalRequiredRoleID uniqueidentifier = NULL,
    @IsActive bit = NULL,
    @ConcessionTier_Clear bit = 0,
    @ConcessionTier int = NULL,
    @MinConcessionValue_Clear bit = 0,
    @MinConcessionValue decimal(18, 2) = NULL,
    @MinConcessionPctOfContract_Clear bit = 0,
    @MinConcessionPctOfContract decimal(7, 4) = NULL,
    @MinTermExtensionDays_Clear bit = 0,
    @MinTermExtensionDays int = NULL,
    @RequiresDecisionWithinAuthority bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SalesRule]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [RuleType] = ISNULL(@RuleType, [RuleType]),
        [Scope] = ISNULL(@Scope, [Scope]),
        [ScopeReferenceID] = CASE WHEN @ScopeReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeReferenceID, [ScopeReferenceID]) END,
        [PredicateJson] = CASE WHEN @PredicateJson_Clear = 1 THEN NULL ELSE ISNULL(@PredicateJson, [PredicateJson]) END,
        [ApprovalRequiredRoleID] = CASE WHEN @ApprovalRequiredRoleID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalRequiredRoleID, [ApprovalRequiredRoleID]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [ConcessionTier] = CASE WHEN @ConcessionTier_Clear = 1 THEN NULL ELSE ISNULL(@ConcessionTier, [ConcessionTier]) END,
        [MinConcessionValue] = CASE WHEN @MinConcessionValue_Clear = 1 THEN NULL ELSE ISNULL(@MinConcessionValue, [MinConcessionValue]) END,
        [MinConcessionPctOfContract] = CASE WHEN @MinConcessionPctOfContract_Clear = 1 THEN NULL ELSE ISNULL(@MinConcessionPctOfContract, [MinConcessionPctOfContract]) END,
        [MinTermExtensionDays] = CASE WHEN @MinTermExtensionDays_Clear = 1 THEN NULL ELSE ISNULL(@MinTermExtensionDays, [MinTermExtensionDays]) END,
        [RequiresDecisionWithinAuthority] = ISNULL(@RequiresDecisionWithinAuthority, [RequiresDecisionWithinAuthority]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSalesRules] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSalesRules]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesRule] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesRule] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SalesRule table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSalesRule]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSalesRule];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSalesRule
ON [${flyway:defaultSchema}].[SalesRule]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[SalesRule]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[SalesRule] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR StoredValueAccount
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateStoredValueAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateStoredValueAccount];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateStoredValueAccount]
    @ID uniqueidentifier,
    @Code nvarchar(60) = NULL,
    @IssuingCompanyID uniqueidentifier = NULL,
    @InitialAmount decimal(18, 2) = NULL,
    @CurrentBalance decimal(18, 2) = NULL,
    @Status nvarchar(20) = NULL,
    @IssuedFromOrderLineID_Clear bit = 0,
    @IssuedFromOrderLineID uniqueidentifier = NULL,
    @BeneficiaryPersonID_Clear bit = 0,
    @BeneficiaryPersonID uniqueidentifier = NULL,
    @BeneficiaryOrganizationID_Clear bit = 0,
    @BeneficiaryOrganizationID uniqueidentifier = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt date = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[StoredValueAccount]
    SET
        [Code] = ISNULL(@Code, [Code]),
        [IssuingCompanyID] = ISNULL(@IssuingCompanyID, [IssuingCompanyID]),
        [InitialAmount] = ISNULL(@InitialAmount, [InitialAmount]),
        [CurrentBalance] = ISNULL(@CurrentBalance, [CurrentBalance]),
        [Status] = ISNULL(@Status, [Status]),
        [IssuedFromOrderLineID] = CASE WHEN @IssuedFromOrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@IssuedFromOrderLineID, [IssuedFromOrderLineID]) END,
        [BeneficiaryPersonID] = CASE WHEN @BeneficiaryPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryPersonID, [BeneficiaryPersonID]) END,
        [BeneficiaryOrganizationID] = CASE WHEN @BeneficiaryOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryOrganizationID, [BeneficiaryOrganizationID]) END,
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwStoredValueAccounts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwStoredValueAccounts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateStoredValueAccount] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateStoredValueAccount] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the StoredValueAccount table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateStoredValueAccount]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateStoredValueAccount];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateStoredValueAccount
ON [${flyway:defaultSchema}].[StoredValueAccount]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[StoredValueAccount]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[StoredValueAccount] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR StoredValueTransaction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateStoredValueTransaction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateStoredValueTransaction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateStoredValueTransaction]
    @ID uniqueidentifier,
    @StoredValueAccountID uniqueidentifier = NULL,
    @TransactionType nvarchar(20) = NULL,
    @Amount decimal(18, 2) = NULL,
    @BalanceAfter decimal(18, 2) = NULL,
    @RelatedPaymentID_Clear bit = 0,
    @RelatedPaymentID uniqueidentifier = NULL,
    @RelatedOrderHeaderID_Clear bit = 0,
    @RelatedOrderHeaderID uniqueidentifier = NULL,
    @OccurredAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[StoredValueTransaction]
    SET
        [StoredValueAccountID] = ISNULL(@StoredValueAccountID, [StoredValueAccountID]),
        [TransactionType] = ISNULL(@TransactionType, [TransactionType]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [BalanceAfter] = ISNULL(@BalanceAfter, [BalanceAfter]),
        [RelatedPaymentID] = CASE WHEN @RelatedPaymentID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedPaymentID, [RelatedPaymentID]) END,
        [RelatedOrderHeaderID] = CASE WHEN @RelatedOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedOrderHeaderID, [RelatedOrderHeaderID]) END,
        [OccurredAt] = ISNULL(@OccurredAt, [OccurredAt]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwStoredValueTransactions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwStoredValueTransactions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateStoredValueTransaction] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateStoredValueTransaction] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the StoredValueTransaction table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateStoredValueTransaction]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateStoredValueTransaction];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateStoredValueTransaction
ON [${flyway:defaultSchema}].[StoredValueTransaction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[StoredValueTransaction]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[StoredValueTransaction] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Subscription
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSubscription]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscription];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscription]
    @ID uniqueidentifier,
    @SubscriptionNumber nvarchar(40) = NULL,
    @CompanyID uniqueidentifier = NULL,
    @OrderLineID uniqueidentifier = NULL,
    @SubscriptionTypeID uniqueidentifier = NULL,
    @ProductID uniqueidentifier = NULL,
    @HolderOrganizationID_Clear bit = 0,
    @HolderOrganizationID uniqueidentifier = NULL,
    @BeneficiaryPersonID_Clear bit = 0,
    @BeneficiaryPersonID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @StartDate date = NULL,
    @TrialEndDate_Clear bit = 0,
    @TrialEndDate date = NULL,
    @CanceledAt_Clear bit = 0,
    @CanceledAt datetimeoffset = NULL,
    @EndDate_Clear bit = 0,
    @EndDate date = NULL,
    @AutoRenew bit = NULL,
    @RenewalLeadDays_Clear bit = 0,
    @RenewalLeadDays int = NULL,
    @PaymentProviderID_Clear bit = 0,
    @PaymentProviderID uniqueidentifier = NULL,
    @ProviderSubscriptionID_Clear bit = 0,
    @ProviderSubscriptionID nvarchar(100) = NULL,
    @MigratesFromSubscriptionID_Clear bit = 0,
    @MigratesFromSubscriptionID uniqueidentifier = NULL,
    @MigratesToSubscriptionID_Clear bit = 0,
    @MigratesToSubscriptionID uniqueidentifier = NULL,
    @DefaultCustomerPaymentMethodID_Clear bit = 0,
    @DefaultCustomerPaymentMethodID uniqueidentifier = NULL,
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL,
    @CarryDiscountOnRenewal bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Subscription]
    SET
        [SubscriptionNumber] = ISNULL(@SubscriptionNumber, [SubscriptionNumber]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [SubscriptionTypeID] = ISNULL(@SubscriptionTypeID, [SubscriptionTypeID]),
        [ProductID] = ISNULL(@ProductID, [ProductID]),
        [HolderOrganizationID] = CASE WHEN @HolderOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@HolderOrganizationID, [HolderOrganizationID]) END,
        [BeneficiaryPersonID] = CASE WHEN @BeneficiaryPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryPersonID, [BeneficiaryPersonID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [StartDate] = ISNULL(@StartDate, [StartDate]),
        [TrialEndDate] = CASE WHEN @TrialEndDate_Clear = 1 THEN NULL ELSE ISNULL(@TrialEndDate, [TrialEndDate]) END,
        [CanceledAt] = CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, [CanceledAt]) END,
        [EndDate] = CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, [EndDate]) END,
        [AutoRenew] = ISNULL(@AutoRenew, [AutoRenew]),
        [RenewalLeadDays] = CASE WHEN @RenewalLeadDays_Clear = 1 THEN NULL ELSE ISNULL(@RenewalLeadDays, [RenewalLeadDays]) END,
        [PaymentProviderID] = CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, [PaymentProviderID]) END,
        [ProviderSubscriptionID] = CASE WHEN @ProviderSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderSubscriptionID, [ProviderSubscriptionID]) END,
        [MigratesFromSubscriptionID] = CASE WHEN @MigratesFromSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@MigratesFromSubscriptionID, [MigratesFromSubscriptionID]) END,
        [MigratesToSubscriptionID] = CASE WHEN @MigratesToSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@MigratesToSubscriptionID, [MigratesToSubscriptionID]) END,
        [DefaultCustomerPaymentMethodID] = CASE WHEN @DefaultCustomerPaymentMethodID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCustomerPaymentMethodID, [DefaultCustomerPaymentMethodID]) END,
        [RenewalIncreasePercent] = CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, [RenewalIncreasePercent]) END,
        [CarryDiscountOnRenewal] = ISNULL(@CarryDiscountOnRenewal, [CarryDiscountOnRenewal]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSubscriptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSubscriptions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscription] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscription] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Subscription table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSubscription]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSubscription];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSubscription
ON [${flyway:defaultSchema}].[Subscription]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[Subscription]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[Subscription] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SubscriptionEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSubscriptionEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionEvent]
    @ID uniqueidentifier,
    @SubscriptionID uniqueidentifier = NULL,
    @EventType nvarchar(40) = NULL,
    @OccurredAt datetimeoffset = NULL,
    @EventData_Clear bit = 0,
    @EventData nvarchar(MAX) = NULL,
    @ProviderEventID_Clear bit = 0,
    @ProviderEventID nvarchar(100) = NULL,
    @RelatedPaymentID_Clear bit = 0,
    @RelatedPaymentID uniqueidentifier = NULL,
    @RelatedOrderHeaderID_Clear bit = 0,
    @RelatedOrderHeaderID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SubscriptionEvent]
    SET
        [SubscriptionID] = ISNULL(@SubscriptionID, [SubscriptionID]),
        [EventType] = ISNULL(@EventType, [EventType]),
        [OccurredAt] = ISNULL(@OccurredAt, [OccurredAt]),
        [EventData] = CASE WHEN @EventData_Clear = 1 THEN NULL ELSE ISNULL(@EventData, [EventData]) END,
        [ProviderEventID] = CASE WHEN @ProviderEventID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderEventID, [ProviderEventID]) END,
        [RelatedPaymentID] = CASE WHEN @RelatedPaymentID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedPaymentID, [RelatedPaymentID]) END,
        [RelatedOrderHeaderID] = CASE WHEN @RelatedOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedOrderHeaderID, [RelatedOrderHeaderID]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSubscriptionEvents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSubscriptionEvents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionEvent] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionEvent] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SubscriptionEvent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSubscriptionEvent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSubscriptionEvent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSubscriptionEvent
ON [${flyway:defaultSchema}].[SubscriptionEvent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[SubscriptionEvent]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[SubscriptionEvent] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SubscriptionFamily
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSubscriptionFamily]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionFamily];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionFamily]
    @ID uniqueidentifier,
    @CompanyID uniqueidentifier = NULL,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SubscriptionFamily]
    SET
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSubscriptionFamilies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSubscriptionFamilies]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionFamily] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionFamily] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SubscriptionFamily table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSubscriptionFamily]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSubscriptionFamily];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSubscriptionFamily
ON [${flyway:defaultSchema}].[SubscriptionFamily]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[SubscriptionFamily]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[SubscriptionFamily] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SubscriptionSequence
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSubscriptionSequence]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionSequence];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionSequence]
    @ID int,
    @NextSequenceNumber int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SubscriptionSequence]
    SET
        [NextSequenceNumber] = ISNULL(@NextSequenceNumber, [NextSequenceNumber]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSubscriptionSequences] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSubscriptionSequences]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionSequence] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionSequence] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SubscriptionSequence table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSubscriptionSequence]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSubscriptionSequence];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSubscriptionSequence
ON [${flyway:defaultSchema}].[SubscriptionSequence]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[SubscriptionSequence]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[SubscriptionSequence] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

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
        [Quantity] = ISNULL(@Quantity, [Quantity]),
        [__mj_UpdatedAt] = GETUTCDATE()
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionTerm] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionTerm] TO [cdp_Developer], [cdp_Integration];
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
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[SubscriptionTerm]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[SubscriptionTerm] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SubscriptionType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSubscriptionType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionType]
    @ID uniqueidentifier,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(200) = NULL,
    @SubscriberScope nvarchar(20) = NULL,
    @BenefitModel nvarchar(30) = NULL,
    @StartMode nvarchar(20) = NULL,
    @DeferredStartDays_Clear bit = 0,
    @DeferredStartDays int = NULL,
    @AnchorMonth_Clear bit = 0,
    @AnchorMonth tinyint = NULL,
    @AnchorDay_Clear bit = 0,
    @AnchorDay tinyint = NULL,
    @PartialPeriodMode_Clear bit = 0,
    @PartialPeriodMode nvarchar(20) = NULL,
    @DefaultTermMonths_Clear bit = 0,
    @DefaultTermMonths int = NULL,
    @BillingCadence nvarchar(20) = NULL,
    @RecognitionCadence nvarchar(20) = NULL,
    @CustomCycleDays_Clear bit = 0,
    @CustomCycleDays int = NULL,
    @TrialDays int = NULL,
    @ConcurrencyMode nvarchar(20) = NULL,
    @ReactivationMode nvarchar(30) = NULL,
    @ReactivationWindowDays_Clear bit = 0,
    @ReactivationWindowDays int = NULL,
    @AutoRenewDefault bit = NULL,
    @RenewalLeadDays_Clear bit = 0,
    @RenewalLeadDays int = NULL,
    @CancellationMode nvarchar(20) = NULL,
    @CancellationRefundMode nvarchar(30) = NULL,
    @CancellationWindowDays_Clear bit = 0,
    @CancellationWindowDays int = NULL,
    @GracePeriodDays int = NULL,
    @Sequence int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SubscriptionType]
    SET
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, [DriverClass]) END,
        [SubscriberScope] = ISNULL(@SubscriberScope, [SubscriberScope]),
        [BenefitModel] = ISNULL(@BenefitModel, [BenefitModel]),
        [StartMode] = ISNULL(@StartMode, [StartMode]),
        [DeferredStartDays] = CASE WHEN @DeferredStartDays_Clear = 1 THEN NULL ELSE ISNULL(@DeferredStartDays, [DeferredStartDays]) END,
        [AnchorMonth] = CASE WHEN @AnchorMonth_Clear = 1 THEN NULL ELSE ISNULL(@AnchorMonth, [AnchorMonth]) END,
        [AnchorDay] = CASE WHEN @AnchorDay_Clear = 1 THEN NULL ELSE ISNULL(@AnchorDay, [AnchorDay]) END,
        [PartialPeriodMode] = CASE WHEN @PartialPeriodMode_Clear = 1 THEN NULL ELSE ISNULL(@PartialPeriodMode, [PartialPeriodMode]) END,
        [DefaultTermMonths] = CASE WHEN @DefaultTermMonths_Clear = 1 THEN NULL ELSE ISNULL(@DefaultTermMonths, [DefaultTermMonths]) END,
        [BillingCadence] = ISNULL(@BillingCadence, [BillingCadence]),
        [RecognitionCadence] = ISNULL(@RecognitionCadence, [RecognitionCadence]),
        [CustomCycleDays] = CASE WHEN @CustomCycleDays_Clear = 1 THEN NULL ELSE ISNULL(@CustomCycleDays, [CustomCycleDays]) END,
        [TrialDays] = ISNULL(@TrialDays, [TrialDays]),
        [ConcurrencyMode] = ISNULL(@ConcurrencyMode, [ConcurrencyMode]),
        [ReactivationMode] = ISNULL(@ReactivationMode, [ReactivationMode]),
        [ReactivationWindowDays] = CASE WHEN @ReactivationWindowDays_Clear = 1 THEN NULL ELSE ISNULL(@ReactivationWindowDays, [ReactivationWindowDays]) END,
        [AutoRenewDefault] = ISNULL(@AutoRenewDefault, [AutoRenewDefault]),
        [RenewalLeadDays] = CASE WHEN @RenewalLeadDays_Clear = 1 THEN NULL ELSE ISNULL(@RenewalLeadDays, [RenewalLeadDays]) END,
        [CancellationMode] = ISNULL(@CancellationMode, [CancellationMode]),
        [CancellationRefundMode] = ISNULL(@CancellationRefundMode, [CancellationRefundMode]),
        [CancellationWindowDays] = CASE WHEN @CancellationWindowDays_Clear = 1 THEN NULL ELSE ISNULL(@CancellationWindowDays, [CancellationWindowDays]) END,
        [GracePeriodDays] = ISNULL(@GracePeriodDays, [GracePeriodDays]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSubscriptionTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSubscriptionTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionType] TO [cdp_Developer], [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionType] TO [cdp_Developer], [cdp_Integration];
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SubscriptionType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSubscriptionType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSubscriptionType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSubscriptionType
ON [${flyway:defaultSchema}].[SubscriptionType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[SubscriptionType]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[SubscriptionType] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO
