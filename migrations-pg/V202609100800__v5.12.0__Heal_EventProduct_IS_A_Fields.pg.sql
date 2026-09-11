-- =============================================================================
-- PostgreSQL counterpart of V202609100800__v5.12.0__Heal_EventProduct_IS_A_Fields.sql
-- Idempotent inserts guarded on natural key ("EntityID", "Name") in EntityField
-- =============================================================================

INSERT INTO "${mjSchema}"."EntityField" (
    "ID", "EntityID", "Name", "Type", "AllowsNull",
    "Length", "Precision", "Scale",
    "Sequence", "IsVirtual", "AllowUpdateAPI",
    "IsPrimaryKey", "IsUnique",
    "__mj_CreatedAt", "__mj_UpdatedAt"
)
SELECT
    '8eae6de6-0a09-4ed8-a1e0-c4ecc5bc0038', 'B090A662-A97A-4748-B109-2FA716C14651', 'PricingDriverClass',
    'nvarchar', TRUE,
    510, 0, 0,
    100018, TRUE, TRUE,
    FALSE, FALSE,
    NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
WHERE NOT EXISTS (
    SELECT 1 FROM "${mjSchema}"."EntityField"
    WHERE "EntityID" = 'B090A662-A97A-4748-B109-2FA716C14651'
      AND "Name" = 'PricingDriverClass'
);

INSERT INTO "${mjSchema}"."EntityField" (
    "ID", "EntityID", "Name", "Type", "AllowsNull",
    "Length", "Precision", "Scale",
    "Sequence", "IsVirtual", "AllowUpdateAPI",
    "IsPrimaryKey", "IsUnique",
    "__mj_CreatedAt", "__mj_UpdatedAt"
)
SELECT
    '282102e7-ac8b-4d20-b92e-c23b11052cd3', 'B090A662-A97A-4748-B109-2FA716C14651', 'MaxQuantityPerLine',
    'decimal', TRUE,
    9, 18, 4,
    100019, TRUE, TRUE,
    FALSE, FALSE,
    NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
WHERE NOT EXISTS (
    SELECT 1 FROM "${mjSchema}"."EntityField"
    WHERE "EntityID" = 'B090A662-A97A-4748-B109-2FA716C14651'
      AND "Name" = 'MaxQuantityPerLine'
);

UPDATE "${mjSchema}"."Entity"
SET "__mj_UpdatedAt" = NOW() AT TIME ZONE 'UTC'
WHERE "ID" = 'B090A662-A97A-4748-B109-2FA716C14651';
