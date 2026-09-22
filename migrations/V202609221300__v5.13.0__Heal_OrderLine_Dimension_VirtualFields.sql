-- =============================================================================
-- V202609221300 — heal: register OrderLine's two dimension NAME fields
-- (bc-aidp-next-golive#236, the gap left by V202609191200)
-- =============================================================================
-- V202609191200 added OrderLine.DimensionID / DimensionValueID and regenerated vwOrderLines to
-- join accounting's vocabulary, so the view gained FOUR columns: the two real ones and the two
-- denormalized names, Dimension and DimensionValue. Its folded CodeGen output registered
-- EntityField rows for the real columns only.
--
-- The consequence is not subtle. vwOrderLines has 51 columns and EntityField declares 49 for Order
-- Lines, MJ's save-capture falls back to view column order when the counts disagree, and every
-- OrderLine INSERT then fails with "Column name or number of supplied values does not match table
-- definition". Order confirm stops working, and with it most of the integration suite.
--
-- It stayed invisible because every developer database has had CodeGen run against it, and CodeGen
-- creates these rows as a side effect. A host never runs CodeGen for an app schema (mj.config.cjs
-- carries it in excludeSchemas), which is the reason V202609191200 folded its generated SQL into
-- the migration in the first place. These two rows simply were not in the block it emitted.
--
-- DATA, NOT DDL. Nothing here creates or alters a database object — the view already has the
-- columns; what is missing is the metadata that describes them. So there is no CodeGen output for
-- this file and no banner below it, and the values are transcribed from what CodeGen itself wrote
-- when it was run by hand against the shared AIDP database on 2026-09-22.
--
-- Idempotent on (EntityID, Name) as well as on the hardcoded id, so it is safe on a database where
-- someone has already run CodeGen — which is every developer's. Sequence is the apply-time
-- MAX + 1 expression rather than the literal CodeGen emits: the literal was only ever free on the
-- database CodeGen ran against, and UQ_EntityField_EntityID_Sequence is unique.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- MJ_BizApps_Orders: Order Lines — Dimension (name of DimensionID's dimension)
-- -----------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityField]
    WHERE ID = 'cc469f7f-7963-4c6c-a677-c86ecd1485a6'
       OR (EntityID = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND Name = 'Dimension')
)
BEGIN
    INSERT INTO [${mjSchema}].[EntityField] (
        [ID], [EntityID], [Sequence], [Name], [DisplayName],
        [Type], [Length], [Precision], [Scale], [AllowsNull],
        [AutoIncrement], [AllowUpdateAPI], [IsVirtual], [IsComputed],
        [IsNameField], [IncludeInUserSearchAPI], [IncludeRelatedEntityNameFieldInBaseView],
        [DefaultInView], [IsPrimaryKey], [IsUnique], [RelatedEntityDisplayType],
        [__mj_CreatedAt], [__mj_UpdatedAt]
    ) VALUES (
        'cc469f7f-7963-4c6c-a677-c86ecd1485a6',
        '66D82C24-9C9F-4CD6-B019-53C20274AB00',
        (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '66D82C24-9C9F-4CD6-B019-53C20274AB00'),
        'Dimension', 'Dimension',
        'nvarchar', 200, 0, 0, 1,
        0, 0, 1, 0,
        0, 0, 0,
        0, 0, 0, 'Search',
        GETUTCDATE(), GETUTCDATE()
    );
END;
GO

-- -----------------------------------------------------------------------------
-- MJ_BizApps_Orders: Order Lines — DimensionValue (name of DimensionValueID's value)
-- -----------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityField]
    WHERE ID = '1fccd536-ec24-4f01-aa33-7e09a3e7a390'
       OR (EntityID = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND Name = 'DimensionValue')
)
BEGIN
    INSERT INTO [${mjSchema}].[EntityField] (
        [ID], [EntityID], [Sequence], [Name], [DisplayName],
        [Type], [Length], [Precision], [Scale], [AllowsNull],
        [AutoIncrement], [AllowUpdateAPI], [IsVirtual], [IsComputed],
        [IsNameField], [IncludeInUserSearchAPI], [IncludeRelatedEntityNameFieldInBaseView],
        [DefaultInView], [IsPrimaryKey], [IsUnique], [RelatedEntityDisplayType],
        [__mj_CreatedAt], [__mj_UpdatedAt]
    ) VALUES (
        '1fccd536-ec24-4f01-aa33-7e09a3e7a390',
        '66D82C24-9C9F-4CD6-B019-53C20274AB00',
        (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '66D82C24-9C9F-4CD6-B019-53C20274AB00'),
        'DimensionValue', 'Dimension Value',
        'nvarchar', 400, 0, 0, 1,
        0, 0, 1, 0,
        0, 0, 0,
        0, 0, 0, 'Search',
        GETUTCDATE(), GETUTCDATE()
    );
END;
GO

-- -----------------------------------------------------------------------------
-- Update the entity timestamp, as the V202609101800 heal does.
-- -----------------------------------------------------------------------------
UPDATE [${mjSchema}].[Entity]
SET [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] = '66D82C24-9C9F-4CD6-B019-53C20274AB00'; -- MJ_BizApps_Orders: Order Lines
GO
