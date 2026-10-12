-- =============================================================================
-- V202610091700 — Concession approval tiers on SalesRule (#308)
-- =============================================================================
-- A concession outside the requester's SalesAuthority is decided by a holder of
-- one role: the ApprovalRequiredRoleID of the active ConcessionLimit rule. One
-- inside it is approved on save. Two things a policy may require could not be
-- configured:
--
--   - two approval tiers: one approver below a set of thresholds, a more senior
--     approver at or above them; and
--   - a sign-off below the thresholds: a second person approves a concession
--     even when the requester's own authority covers it.
--
-- What this file does: SalesRule gains, for ConcessionLimit rules only,
--   1. ConcessionTier — the rule's rank. Several active ConcessionLimit rules
--      are tiers; a concession goes to the highest tier whose thresholds it
--      meets. NULL ranks as 0.
--   2. MinConcessionValue, MinConcessionPctOfContract, MinTermExtensionDays —
--      the thresholds that route a concession to the tier, the counterparts of
--      SalesAuthority's MaxConcessionValue, MaxConcessionPctOfContract and
--      MaxTermExtensionDays. Meeting any one set threshold routes it there. A
--      rule with none set takes every concession, which is how the single
--      ConcessionLimit rule behaved before this migration.
--   3. RequiresDecisionWithinAuthority — the tier decides a concession routed
--      to it even when the requester's authority covers it, and the requester
--      cannot decide it themselves.
--
-- The tier that decides a concession is already stamped on it:
-- OrderConcession.SalesRuleID names the rule, and each tier is its own rule.
--
-- Defaults leave every existing row as it was: no tier, no thresholds, no
-- sign-off. A CHECK keeps the new columns empty on other rule types.
--
-- RUN CODEGEN AFTER THIS so the base view, CRUD procs and entity subclass pick
-- up the columns.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[SalesRule] ADD
    [ConcessionTier] INT NULL
        CONSTRAINT [CK_SalesRule_ConcessionTier] CHECK ([ConcessionTier] >= 0),
    [MinConcessionValue] DECIMAL(18,2) NULL
        CONSTRAINT [CK_SalesRule_MinConcessionValue] CHECK ([MinConcessionValue] >= 0),
    [MinConcessionPctOfContract] DECIMAL(7,4) NULL
        CONSTRAINT [CK_SalesRule_MinConcessionPctOfContract] CHECK ([MinConcessionPctOfContract] >= 0 AND [MinConcessionPctOfContract] <= 1),
    [MinTermExtensionDays] INT NULL
        CONSTRAINT [CK_SalesRule_MinTermExtensionDays] CHECK ([MinTermExtensionDays] >= 0),
    [RequiresDecisionWithinAuthority] BIT NOT NULL
        CONSTRAINT [DF_SalesRule_RequiresDecisionWithinAuthority] DEFAULT (0),
    CONSTRAINT [CK_SalesRule_ConcessionTierColumns] CHECK (
        [RuleType] = 'ConcessionLimit'
        OR ([ConcessionTier] IS NULL
            AND [MinConcessionValue] IS NULL
            AND [MinConcessionPctOfContract] IS NULL
            AND [MinTermExtensionDays] IS NULL
            AND [RequiresDecisionWithinAuthority] = 0)
    );
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ConcessionLimit rules only: this tier''s rank. A concession goes to the highest-ranked active ConcessionLimit rule whose thresholds it meets; two active rules may not share a rank. NULL ranks as 0.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesRule',
    @level2type = N'COLUMN', @level2name = N'ConcessionTier';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ConcessionLimit rules only: a concession valued at or above this, in currency, meets this tier. NULL sets no value threshold.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesRule',
    @level2type = N'COLUMN', @level2name = N'MinConcessionValue';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ConcessionLimit rules only: a concession whose order''s concessions, as a share of its net total (0.05 = 5%), are at or above this meets this tier. NULL sets no share threshold.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesRule',
    @level2type = N'COLUMN', @level2name = N'MinConcessionPctOfContract';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ConcessionLimit rules only: a concession that changes a term''s dates by this many days or more meets this tier. NULL sets no term-date threshold.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesRule',
    @level2type = N'COLUMN', @level2name = N'MinTermExtensionDays';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ConcessionLimit rules only: when 1, a concession routed to this tier is Pending even when the requester''s SalesAuthority covers it, and the requester cannot decide it. When 0, a concession within authority is Approved on save.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesRule',
    @level2type = N'COLUMN', @level2name = N'RequiresDecisionWithinAuthority';
GO



















































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen 6.1.5 against a database built from migrations alone,
--   with the hand-authored DDL above applied. Contains the five new field
--   registrations on Sales Rules, their categories, the rebuilt view, CRUD procs
--   and grants, and the validators for the new CHECK constraints.
--
--   Left out, because this change does not touch them: the run's rebuild of the
--   Order Headers view and procs and its address latitude/longitude field rows,
--   value-list rows for other entities, validators regenerated for other
--   entities, and the unchanged FK index. Also left out: the run's rewrite of the
--   Sales Rules FieldCategoryInfo / FieldCategoryIcons settings, which replaced
--   the four existing categories with the new one (MemberJunction/MJ#5369);
--   the existing settings stay as they are.
--
-- =============================================================================

/* SQL text to insert 5 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1254bd51-591a-44cb-adc2-53c22d0431d5' OR (EntityID = '389EA03A-52CC-4BCA-859C-82356777E76E' AND Name = 'ConcessionTier')) BEGIN
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
            '1254bd51-591a-44cb-adc2-53c22d0431d5',
            '389EA03A-52CC-4BCA-859C-82356777E76E', -- Entity: MJ_BizApps_Orders: Sales Rules
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '389EA03A-52CC-4BCA-859C-82356777E76E'),
            'ConcessionTier',
            'Concession Tier',
            'ConcessionLimit rules only: this tier''s rank. A concession goes to the highest-ranked active ConcessionLimit rule whose thresholds it meets; two active rules may not share a rank. NULL ranks as 0.',
            'int',
            4,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '70308f40-68f5-4f8c-bd2b-9472a600d999' OR (EntityID = '389EA03A-52CC-4BCA-859C-82356777E76E' AND Name = 'MinConcessionValue')) BEGIN
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
            '70308f40-68f5-4f8c-bd2b-9472a600d999',
            '389EA03A-52CC-4BCA-859C-82356777E76E', -- Entity: MJ_BizApps_Orders: Sales Rules
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '389EA03A-52CC-4BCA-859C-82356777E76E'),
            'MinConcessionValue',
            'Min Concession Value',
            'ConcessionLimit rules only: a concession valued at or above this, in currency, meets this tier. NULL sets no value threshold.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '55707b49-fceb-49d5-9a71-669181bb135b' OR (EntityID = '389EA03A-52CC-4BCA-859C-82356777E76E' AND Name = 'MinConcessionPctOfContract')) BEGIN
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
            '55707b49-fceb-49d5-9a71-669181bb135b',
            '389EA03A-52CC-4BCA-859C-82356777E76E', -- Entity: MJ_BizApps_Orders: Sales Rules
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '389EA03A-52CC-4BCA-859C-82356777E76E'),
            'MinConcessionPctOfContract',
            'Min Concession Pct Of Contract',
            'ConcessionLimit rules only: a concession whose order''s concessions, as a share of its net total (0.05 = 5%), are at or above this meets this tier. NULL sets no share threshold.',
            'decimal',
            5,
            7,
            4,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8e1f8bce-86ac-43ec-b16c-1b060e9b0f07' OR (EntityID = '389EA03A-52CC-4BCA-859C-82356777E76E' AND Name = 'MinTermExtensionDays')) BEGIN
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
            '8e1f8bce-86ac-43ec-b16c-1b060e9b0f07',
            '389EA03A-52CC-4BCA-859C-82356777E76E', -- Entity: MJ_BizApps_Orders: Sales Rules
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '389EA03A-52CC-4BCA-859C-82356777E76E'),
            'MinTermExtensionDays',
            'Min Term Extension Days',
            'ConcessionLimit rules only: a concession that changes a term''s dates by this many days or more meets this tier. NULL sets no term-date threshold.',
            'int',
            4,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3e51cf5e-b6c5-49d7-93a0-e2f9e2468fb0' OR (EntityID = '389EA03A-52CC-4BCA-859C-82356777E76E' AND Name = 'RequiresDecisionWithinAuthority')) BEGIN
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
            '3e51cf5e-b6c5-49d7-93a0-e2f9e2468fb0',
            '389EA03A-52CC-4BCA-859C-82356777E76E', -- Entity: MJ_BizApps_Orders: Sales Rules
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '389EA03A-52CC-4BCA-859C-82356777E76E'),
            'RequiresDecisionWithinAuthority',
            'Requires Decision Within Authority',
            'ConcessionLimit rules only: when 1, a concession routed to this tier is Pending even when the requester''s SalesAuthority covers it, and the requester cannot decide it. When 0, a concession within authority is Approved on save.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

/* Base View SQL for MJ_BizApps_Orders: Sales Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Rules
-- Item: vwSalesRules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Sales Rules
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SalesRule
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSalesRules]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSalesRules];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSalesRules]
AS
SELECT
    s.*,
    MJRole_ApprovalRequiredRoleID.[Name] AS [ApprovalRequiredRole]
FROM
    [${flyway:defaultSchema}].[SalesRule] AS s
LEFT OUTER JOIN
    [${mjSchema}].[Role] AS MJRole_ApprovalRequiredRoleID
  ON
    [s].[ApprovalRequiredRoleID] = MJRole_ApprovalRequiredRoleID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSalesRules] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSalesRules] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSalesRules] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwSalesRules] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Sales Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Rules
-- Item: Permissions for vwSalesRules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwSalesRules] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSalesRules] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSalesRules] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwSalesRules] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Sales Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Rules
-- Item: spCreateSalesRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SalesRule
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSalesRule]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSalesRule];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSalesRule]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @RuleType nvarchar(40),
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
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SalesRule]
            (
                [ID],
                [Name],
                [RuleType],
                [Scope],
                [ScopeReferenceID],
                [PredicateJson],
                [ApprovalRequiredRoleID],
                [IsActive],
                [ConcessionTier],
                [MinConcessionValue],
                [MinConcessionPctOfContract],
                [MinTermExtensionDays],
                [RequiresDecisionWithinAuthority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @RuleType,
                ISNULL(@Scope, 'Global'),
                CASE WHEN @ScopeReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeReferenceID, NULL) END,
                CASE WHEN @PredicateJson_Clear = 1 THEN NULL ELSE ISNULL(@PredicateJson, NULL) END,
                CASE WHEN @ApprovalRequiredRoleID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalRequiredRoleID, NULL) END,
                ISNULL(@IsActive, 1),
                CASE WHEN @ConcessionTier_Clear = 1 THEN NULL ELSE ISNULL(@ConcessionTier, NULL) END,
                CASE WHEN @MinConcessionValue_Clear = 1 THEN NULL ELSE ISNULL(@MinConcessionValue, NULL) END,
                CASE WHEN @MinConcessionPctOfContract_Clear = 1 THEN NULL ELSE ISNULL(@MinConcessionPctOfContract, NULL) END,
                CASE WHEN @MinTermExtensionDays_Clear = 1 THEN NULL ELSE ISNULL(@MinTermExtensionDays, NULL) END,
                ISNULL(@RequiresDecisionWithinAuthority, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SalesRule]
            (
                [Name],
                [RuleType],
                [Scope],
                [ScopeReferenceID],
                [PredicateJson],
                [ApprovalRequiredRoleID],
                [IsActive],
                [ConcessionTier],
                [MinConcessionValue],
                [MinConcessionPctOfContract],
                [MinTermExtensionDays],
                [RequiresDecisionWithinAuthority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @RuleType,
                ISNULL(@Scope, 'Global'),
                CASE WHEN @ScopeReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeReferenceID, NULL) END,
                CASE WHEN @PredicateJson_Clear = 1 THEN NULL ELSE ISNULL(@PredicateJson, NULL) END,
                CASE WHEN @ApprovalRequiredRoleID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalRequiredRoleID, NULL) END,
                ISNULL(@IsActive, 1),
                CASE WHEN @ConcessionTier_Clear = 1 THEN NULL ELSE ISNULL(@ConcessionTier, NULL) END,
                CASE WHEN @MinConcessionValue_Clear = 1 THEN NULL ELSE ISNULL(@MinConcessionValue, NULL) END,
                CASE WHEN @MinConcessionPctOfContract_Clear = 1 THEN NULL ELSE ISNULL(@MinConcessionPctOfContract, NULL) END,
                CASE WHEN @MinTermExtensionDays_Clear = 1 THEN NULL ELSE ISNULL(@MinTermExtensionDays, NULL) END,
                ISNULL(@RequiresDecisionWithinAuthority, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSalesRules] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateSalesRule] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateSalesRule] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSalesRule] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Sales Rules */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateSalesRule] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateSalesRule] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSalesRule] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Sales Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Rules
-- Item: spUpdateSalesRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

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
        [RequiresDecisionWithinAuthority] = ISNULL(@RequiresDecisionWithinAuthority, [RequiresDecisionWithinAuthority])
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesRule] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesRule] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesRule] TO [cdp_Developer], [cdp_Integration]
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
    UPDATE
        [${flyway:defaultSchema}].[SalesRule]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SalesRule] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Sales Rules */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesRule] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesRule] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesRule] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Sales Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Rules
-- Item: spDeleteSalesRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SalesRule
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSalesRule]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSalesRule];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSalesRule]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SalesRule]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteSalesRule] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteSalesRule] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSalesRule] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Sales Rules */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteSalesRule] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteSalesRule] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSalesRule] TO [cdp_Developer], [cdp_Integration];

/* Set categories for 5 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Rules.ConcessionTier 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Limits',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1254BD51-591A-44CB-ADC2-53C22D0431D5';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Rules.MinConcessionValue 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Limits',
   GeneratedFormSection = 'Category',
   DisplayName = 'Minimum Concession Value'
WHERE 
   ID = '70308F40-68F5-4F8C-BD2B-9472A600D999';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Rules.MinConcessionPctOfContract 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Limits',
   GeneratedFormSection = 'Category',
   DisplayName = 'Minimum Concession % of Contract'
WHERE 
   ID = '55707B49-FCEB-49D5-9A71-669181BB135B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Rules.MinTermExtensionDays 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Limits',
   GeneratedFormSection = 'Category',
   DisplayName = 'Minimum Term Extension (Days)'
WHERE 
   ID = '8E1F8BCE-86AC-43EC-B16C-1B060E9B0F07';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Rules.RequiresDecisionWithinAuthority 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Limits',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3E51CF5E-B6C5-49D7-93A0-E2F9E2468FB0';

/* Generated Validation Functions for MJ_BizApps_Orders: Sales Rules */
-- CHECK constraint for MJ_BizApps_Orders: Sales Rules: Field: ConcessionTier was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '1254BD51-591A-44CB-ADC2-53C22D0431D5'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('6bb6c116-a10e-4392-b085-a97ba79e55c9', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ConcessionTier]>=(0))', 'public ValidateConcessionTierGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.ConcessionTier != null && this.ConcessionTier < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"ConcessionTier",
			"Concession tier must be greater than or equal to 0.",
			this.ConcessionTier,
			ValidationErrorType.Failure
		));
	}
}', 'Concession tier must be greater than or equal to 0 to ensure that negative tier values are not entered.', 'ValidateConcessionTierGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '1254BD51-591A-44CB-ADC2-53C22D0431D5')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Sales Rules: Field: MinConcessionPctOfContract was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '55707B49-FCEB-49D5-9A71-669181BB135B'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('98cc712a-33e0-4562-af92-1023bd978750', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([MinConcessionPctOfContract]>=(0) AND [MinConcessionPctOfContract]<=(1))', 'public ValidateMinConcessionPctOfContractRange(result: ValidationResult) {
	if (this.MinConcessionPctOfContract != null && (this.MinConcessionPctOfContract < 0 || this.MinConcessionPctOfContract > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"MinConcessionPctOfContract",
			"The minimum concession percentage of the contract must be between 0 and 1 (inclusive).",
			this.MinConcessionPctOfContract,
			ValidationErrorType.Failure
		));
	}
}', 'The minimum concession percentage of the contract must be a value between 0 and 1 (inclusive), representing a valid percentage from 0% to 100%.', 'ValidateMinConcessionPctOfContractRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '55707B49-FCEB-49D5-9A71-669181BB135B')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Sales Rules: Field: MinConcessionValue was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '70308F40-68F5-4F8C-BD2B-9472A600D999'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('bd6649a9-e847-44f5-8bb8-eee6cd082651', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([MinConcessionValue]>=(0))', 'public ValidateMinConcessionValueGreaterThanOrEqualToZero(result: ValidationResult) {
    if (this.MinConcessionValue != null && this.MinConcessionValue < 0) {
        result.Errors.push(new ValidationErrorInfo(
            "MinConcessionValue",
            "Minimum concession value must be greater than or equal to 0.",
            this.MinConcessionValue,
            ValidationErrorType.Failure
        ));
    }
}', 'The minimum concession value must be greater than or equal to zero to prevent negative concession amounts from being entered.', 'ValidateMinConcessionValueGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '70308F40-68F5-4F8C-BD2B-9472A600D999')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Sales Rules: Field: MinTermExtensionDays was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '8E1F8BCE-86AC-43EC-B16C-1B060E9B0F07'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('5f5cce95-d6b6-494a-a579-701f15631a89', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([MinTermExtensionDays]>=(0))', 'public ValidateMinTermExtensionDaysGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.MinTermExtensionDays != null && this.MinTermExtensionDays < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"MinTermExtensionDays",
			"Minimum term extension days must be greater than or equal to 0.",
			this.MinTermExtensionDays,
			ValidationErrorType.Failure
		));
	}
}', 'The minimum term extension days must be a non-negative number (0 or greater) to ensure valid extension periods.', 'ValidateMinTermExtensionDaysGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '8E1F8BCE-86AC-43EC-B16C-1B060E9B0F07')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Sales Rules @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '389EA03A-52CC-4BCA-859C-82356777E76E'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('15c650b2-fe41-4e4d-a278-512791b6a3ad', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([RuleType]=''ConcessionLimit'' OR [ConcessionTier] IS NULL AND [MinConcessionValue] IS NULL AND [MinConcessionPctOfContract] IS NULL AND [MinTermExtensionDays] IS NULL AND [RequiresDecisionWithinAuthority]=(0))', 'public ValidateConcessionFieldsByRuleType(result: ValidationResult) {
	if (this.RuleType !== "ConcessionLimit") {
		if (this.ConcessionTier != null ||
			this.MinConcessionValue != null ||
			this.MinConcessionPctOfContract != null ||
			this.MinTermExtensionDays != null ||
			this.RequiresDecisionWithinAuthority === true) {
			
			result.Errors.push(new ValidationErrorInfo(
				"RuleType",
				"Concession-specific fields and ''Requires Decision Within Authority'' can only be defined when Rule Type is ''ConcessionLimit''.",
				this.RuleType,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Ensures that concession-specific parameters (such as Concession Tier, Min Concession Value, Min Concession % of Contract, Min Term Extension Days, and Requires Decision Within Authority) are only specified when the Rule Type is ''ConcessionLimit''.', 'ValidateConcessionFieldsByRuleType', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '389EA03A-52CC-4BCA-859C-82356777E76E')
   END;

