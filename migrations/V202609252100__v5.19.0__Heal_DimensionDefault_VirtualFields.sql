-- =============================================================================
-- V202609252100 — heal: register DimensionDefault's three name fields
-- (bc-aidp-next-golive#236, the gap left by V202609221500)
-- =============================================================================
-- V202609221500 created DimensionDefault and vwDimensionDefaults, which joins the three tables the
-- row points at and so exposes FOURTEEN columns: the table's eleven plus the denormalized names
-- Entity, Dimension and DimensionValue. Its folded CodeGen output registered EntityField rows for
-- the eleven table columns only. (The two virtual 'Dimension' / 'DimensionValue' rows it does emit
-- belong to MJ_BizApps_Orders: Order Lines, not to this entity.)
--
-- On any host built from migrations alone, vwDimensionDefaults has 14 columns against 11 registered
-- fields, and MJ's save-capture — INSERT INTO a table variable declared from the entity's fields,
-- EXEC spCreateDimensionDefault, whose last statement is SELECT * from the view — fails every
-- insert with "Column name or number of supplied values does not match table definition". No
-- product can be given a default dimension, so order lines are never tagged from one.
--
-- It stayed invisible for the same reason the OrderLine gap did (V202609230300): every developer
-- database has had CodeGen run against it, which creates these rows as a side effect, and a host
-- never runs CodeGen for an app schema.
--
-- DATA, NOT DDL. The view already has the columns; only the metadata describing them is missing,
-- so there is no CodeGen output for this file and no banner below it. The relationships and the
-- RelatedEntityNameFieldMap values V202609221500 did register are correct and are not touched.
--
-- Values follow what CodeGen writes for the same shape of column — an INNER JOINed, NOT NULL name
-- from a related entity, as on MJ_BizApps_Orders: Order Line Dimensions. Lengths are the view's own
-- byte lengths (Entity.Name nvarchar(255), Dimension.Name nvarchar(100), DimensionValue.Name
-- nvarchar(200)).
--
-- Guarded on (EntityID, Name) as well as on the id: UQ_EntityField_EntityID_Name would otherwise
-- fail this file on every database where CodeGen has already created the rows. Sequence is the
-- apply-time MAX + 1 because UQ_EntityField_EntityID_Sequence is unique and a literal is only ever
-- free on the database it was read from.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- MJ_BizApps_Orders: Dimension Defaults — Entity (name of EntityID's entity)
-- -----------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityField]
    WHERE ID = '1d32ee96-da54-4064-a629-795bcba96c51'
       OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = 'Entity')
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
        '1d32ee96-da54-4064-a629-795bcba96c51',
        'D80AAA3D-50F9-4410-96DE-DC8A609DCADD',
        (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
        'Entity', 'Entity',
        'nvarchar', 510, 0, 0, 0,
        0, 0, 1, 0,
        0, 0, 0,
        1, 0, 0, 'Search',
        GETUTCDATE(), GETUTCDATE()
    );
END;
GO

-- -----------------------------------------------------------------------------
-- MJ_BizApps_Orders: Dimension Defaults — Dimension (name of DimensionID's dimension)
-- -----------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityField]
    WHERE ID = 'b5d3594d-d32d-49e1-9c08-62f0d8e60f2b'
       OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = 'Dimension')
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
        'b5d3594d-d32d-49e1-9c08-62f0d8e60f2b',
        'D80AAA3D-50F9-4410-96DE-DC8A609DCADD',
        (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
        'Dimension', 'Dimension',
        'nvarchar', 200, 0, 0, 0,
        0, 0, 1, 0,
        0, 0, 0,
        1, 0, 0, 'Search',
        GETUTCDATE(), GETUTCDATE()
    );
END;
GO

-- -----------------------------------------------------------------------------
-- MJ_BizApps_Orders: Dimension Defaults — DimensionValue (name of DimensionValueID's value)
-- -----------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityField]
    WHERE ID = '4658bbb3-7e77-48cf-96a8-a8151b009a68'
       OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = 'DimensionValue')
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
        '4658bbb3-7e77-48cf-96a8-a8151b009a68',
        'D80AAA3D-50F9-4410-96DE-DC8A609DCADD',
        (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
        'DimensionValue', 'Dimension Value',
        'nvarchar', 400, 0, 0, 0,
        0, 0, 1, 0,
        0, 0, 0,
        1, 0, 0, 'Search',
        GETUTCDATE(), GETUTCDATE()
    );
END;
GO

-- -----------------------------------------------------------------------------
-- Update the entity timestamp so metadata caches refresh, as the V202609230300 heal does.
-- -----------------------------------------------------------------------------
UPDATE [${mjSchema}].[Entity]
SET [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'; -- MJ_BizApps_Orders: Dimension Defaults
GO
