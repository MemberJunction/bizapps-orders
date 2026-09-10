-- =============================================================================
-- PostgreSQL counterpart of V202609101800__v5.12.0__Heal_Missing_EntityFields.sql
-- Idempotent inserts guarded on natural key ("EntityID", "Name") or "ID"
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. MJ_BizApps_Orders: Price Tiers (ProductPrice)
-- -----------------------------------------------------------------------------
INSERT INTO "${mjSchema}"."EntityField" (
    "ID", "EntityID", "Sequence", "Name", "DisplayName",
    "Type", "Length", "Precision", "Scale", "AllowsNull",
    "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed",
    "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView",
    "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType",
    "RelatedEntityID", "RelatedEntityFieldName",
    "__mj_CreatedAt", "__mj_UpdatedAt"
)
SELECT
    '0342beb1-51ce-4284-b5cc-e0811d413335',
    '0342BEB0-51CE-4284-B5CC-E0811D413335',
    (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM "${mjSchema}"."EntityField" WHERE "EntityID" = '0342BEB0-51CE-4284-B5CC-E0811D413335'),
    'ProductPrice', 'Product Price',
    'nvarchar', 510, 0, 0, TRUE,
    FALSE, FALSE, TRUE, FALSE,
    FALSE, FALSE, FALSE,
    FALSE, FALSE, FALSE, 'Search',
    '58018ECE-83EF-4E05-A9D0-2F7E47F9AF25', 'Name',
    NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
WHERE NOT EXISTS (
    SELECT 1 FROM "${mjSchema}"."EntityField"
    WHERE "ID" = '0342beb1-51ce-4284-b5cc-e0811d413335'
       OR ("EntityID" = '0342BEB0-51CE-4284-B5CC-E0811D413335' AND "Name" = 'ProductPrice')
);

-- -----------------------------------------------------------------------------
-- 2. MJ_BizApps_Orders: Product Categories (Hierarchy Fields)
-- -----------------------------------------------------------------------------
INSERT INTO "${mjSchema}"."EntityField" (
    "ID", "EntityID", "Sequence", "Name", "DisplayName",
    "Type", "Length", "Precision", "Scale", "AllowsNull",
    "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed",
    "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView",
    "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType",
    "__mj_CreatedAt", "__mj_UpdatedAt"
)
SELECT
    'b1c1740a-3286-4173-a65b-a660426071c7',
    'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3',
    (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM "${mjSchema}"."EntityField" WHERE "EntityID" = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3'),
    'RootParentProductCategoryID', 'Root Parent Product Category ID',
    'uniqueidentifier', 16, 0, 0, TRUE,
    FALSE, FALSE, TRUE, FALSE,
    FALSE, FALSE, FALSE,
    FALSE, FALSE, FALSE, 'Search',
    NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
WHERE NOT EXISTS (
    SELECT 1 FROM "${mjSchema}"."EntityField"
    WHERE "ID" = 'b1c1740a-3286-4173-a65b-a660426071c7'
       OR ("EntityID" = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3' AND "Name" = 'RootParentProductCategoryID')
);

INSERT INTO "${mjSchema}"."EntityField" (
    "ID", "EntityID", "Sequence", "Name", "DisplayName",
    "Type", "Length", "Precision", "Scale", "AllowsNull",
    "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed",
    "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView",
    "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType",
    "__mj_CreatedAt", "__mj_UpdatedAt"
)
SELECT
    'ee21b1dd-5c6e-4b95-830c-7853876615ce',
    'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3',
    (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM "${mjSchema}"."EntityField" WHERE "EntityID" = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3'),
    'ParentProductCategoryIDDepth', 'Parent Product Category ID Depth',
    'int', 4, 10, 0, TRUE,
    FALSE, FALSE, TRUE, FALSE,
    FALSE, FALSE, FALSE,
    FALSE, FALSE, FALSE, 'Search',
    NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
WHERE NOT EXISTS (
    SELECT 1 FROM "${mjSchema}"."EntityField"
    WHERE "ID" = 'ee21b1dd-5c6e-4b95-830c-7853876615ce'
       OR ("EntityID" = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3' AND "Name" = 'ParentProductCategoryIDDepth')
);

INSERT INTO "${mjSchema}"."EntityField" (
    "ID", "EntityID", "Sequence", "Name", "DisplayName",
    "Type", "Length", "Precision", "Scale", "AllowsNull",
    "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed",
    "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView",
    "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType",
    "__mj_CreatedAt", "__mj_UpdatedAt"
)
SELECT
    '6917dc9c-5bb4-44ba-9914-62744515a976',
    'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3',
    (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM "${mjSchema}"."EntityField" WHERE "EntityID" = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3'),
    'ParentProductCategoryIDPath', 'Parent Product Category ID Path',
    'nvarchar', -1, 0, 0, TRUE,
    FALSE, FALSE, TRUE, FALSE,
    FALSE, FALSE, FALSE,
    FALSE, FALSE, FALSE, 'Search',
    NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
WHERE NOT EXISTS (
    SELECT 1 FROM "${mjSchema}"."EntityField"
    WHERE "ID" = '6917dc9c-5bb4-44ba-9914-62744515a976'
       OR ("EntityID" = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3' AND "Name" = 'ParentProductCategoryIDPath')
);

INSERT INTO "${mjSchema}"."EntityField" (
    "ID", "EntityID", "Sequence", "Name", "DisplayName",
    "Type", "Length", "Precision", "Scale", "AllowsNull",
    "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed",
    "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView",
    "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType",
    "__mj_CreatedAt", "__mj_UpdatedAt"
)
SELECT
    '3d1548f2-80d3-487b-84d1-6f8718a1538d',
    'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3',
    (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM "${mjSchema}"."EntityField" WHERE "EntityID" = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3'),
    'ParentProductCategoryIDIsLeaf', 'Parent Product Category ID Is Leaf',
    'bit', 1, 1, 0, TRUE,
    FALSE, FALSE, TRUE, FALSE,
    FALSE, FALSE, FALSE,
    FALSE, FALSE, FALSE, 'Search',
    NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
WHERE NOT EXISTS (
    SELECT 1 FROM "${mjSchema}"."EntityField"
    WHERE "ID" = '3d1548f2-80d3-487b-84d1-6f8718a1538d'
       OR ("EntityID" = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3' AND "Name" = 'ParentProductCategoryIDIsLeaf')
);

INSERT INTO "${mjSchema}"."EntityField" (
    "ID", "EntityID", "Sequence", "Name", "DisplayName",
    "Type", "Length", "Precision", "Scale", "AllowsNull",
    "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed",
    "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView",
    "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType",
    "__mj_CreatedAt", "__mj_UpdatedAt"
)
SELECT
    'da111809-dfba-4dca-a744-6aae20534711',
    'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3',
    (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM "${mjSchema}"."EntityField" WHERE "EntityID" = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3'),
    'ParentProductCategoryIDChildCount', 'Parent Product Category ID Child Count',
    'int', 4, 10, 0, TRUE,
    FALSE, FALSE, TRUE, FALSE,
    FALSE, FALSE, FALSE,
    FALSE, FALSE, FALSE, 'Search',
    NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
WHERE NOT EXISTS (
    SELECT 1 FROM "${mjSchema}"."EntityField"
    WHERE "ID" = 'da111809-dfba-4dca-a744-6aae20534711'
       OR ("EntityID" = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3' AND "Name" = 'ParentProductCategoryIDChildCount')
);

-- -----------------------------------------------------------------------------
-- Update entity timestamps
-- -----------------------------------------------------------------------------
UPDATE "${mjSchema}"."Entity"
SET "__mj_UpdatedAt" = NOW() AT TIME ZONE 'UTC'
WHERE "ID" IN (
    '0342BEB0-51CE-4284-B5CC-E0811D413335',
    'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3'
);
