-- =============================================================================
-- Forward heal: Ensure IS-A parent fields exist on Event Products (EntityID B090A662-A97A-4748-B109-2FA716C14651)
-- Idempotent inserts guarded on natural key ([EntityID], [Name])
-- =============================================================================

IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityField]
    WHERE [EntityID] = 'B090A662-A97A-4748-B109-2FA716C14651'
      AND [Name] = 'PricingDriverClass'
)
BEGIN
    /* Create IS-A parent field PricingDriverClass on MJ_BizApps_Orders: Event Products */
    INSERT INTO [${mjSchema}].[EntityField] (
        [ID], [EntityID], [Name], [Type], [AllowsNull],
        [Length], [Precision], [Scale],
        [Sequence], [IsVirtual], [AllowUpdateAPI],
        [IsPrimaryKey], [IsUnique],
        [__mj_CreatedAt], [__mj_UpdatedAt]
    ) VALUES (
        '8eae6de6-0a09-4ed8-a1e0-c4ecc5bc0038', 'B090A662-A97A-4748-B109-2FA716C14651', 'PricingDriverClass',
        'nvarchar', 1,
        510, 0, 0,
        100018, 1, 1, 0, 0,
        GETUTCDATE(), GETUTCDATE()
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityField]
    WHERE [EntityID] = 'B090A662-A97A-4748-B109-2FA716C14651'
      AND [Name] = 'MaxQuantityPerLine'
)
BEGIN
    /* Create IS-A parent field MaxQuantityPerLine on MJ_BizApps_Orders: Event Products */
    INSERT INTO [${mjSchema}].[EntityField] (
        [ID], [EntityID], [Name], [Type], [AllowsNull],
        [Length], [Precision], [Scale],
        [Sequence], [IsVirtual], [AllowUpdateAPI],
        [IsPrimaryKey], [IsUnique],
        [__mj_CreatedAt], [__mj_UpdatedAt]
    ) VALUES (
        '282102e7-ac8b-4d20-b92e-c23b11052cd3', 'B090A662-A97A-4748-B109-2FA716C14651', 'MaxQuantityPerLine',
        'decimal', 1,
        9, 18, 4,
        100019, 1, 1, 0, 0,
        GETUTCDATE(), GETUTCDATE()
    );
END;
GO

/* Update entity timestamp for MJ_BizApps_Orders: Event Products after IS-A field sync */
UPDATE [${mjSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='B090A662-A97A-4748-B109-2FA716C14651';
GO
