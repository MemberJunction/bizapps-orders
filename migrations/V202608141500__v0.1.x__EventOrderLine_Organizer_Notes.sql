-- EventOrderLine: conference-organizer notes on the attendee.
-- Dietary preferences, allergies, and free-form comments. All optional.
-- Person + CheckInAt already exist (V202608141400). RUN CODEGEN AFTER THIS.

IF COL_LENGTH('__mj_BizAppsOrders.EventOrderLine', 'DietaryPreferences') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[EventOrderLine]
        ADD [DietaryPreferences] NVARCHAR(500) NULL;
END
GO

IF COL_LENGTH('__mj_BizAppsOrders.EventOrderLine', 'Allergies') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[EventOrderLine]
        ADD [Allergies] NVARCHAR(500) NULL;
END
GO

IF COL_LENGTH('__mj_BizAppsOrders.EventOrderLine', 'Comments') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[EventOrderLine]
        ADD [Comments] NVARCHAR(2000) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('[__mj_BizAppsOrders].[EventOrderLine]')
      AND minor_id = COLUMNPROPERTY(OBJECT_ID('[__mj_BizAppsOrders].[EventOrderLine]'), 'DietaryPreferences', 'ColumnId')
      AND name = 'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Dietary preferences for the attendee (vegetarian, kosher, etc.). Shown to conference organizers.',
        @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
        @level1type = N'TABLE',  @level1name = N'EventOrderLine',
        @level2type = N'COLUMN', @level2name = N'DietaryPreferences';
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('[__mj_BizAppsOrders].[EventOrderLine]')
      AND minor_id = COLUMNPROPERTY(OBJECT_ID('[__mj_BizAppsOrders].[EventOrderLine]'), 'Allergies', 'ColumnId')
      AND name = 'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Food or other allergies conference organizers should know about.',
        @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
        @level1type = N'TABLE',  @level1name = N'EventOrderLine',
        @level2type = N'COLUMN', @level2name = N'Allergies';
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('[__mj_BizAppsOrders].[EventOrderLine]')
      AND minor_id = COLUMNPROPERTY(OBJECT_ID('[__mj_BizAppsOrders].[EventOrderLine]'), 'Comments', 'ColumnId')
      AND name = 'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Free-form notes for conference organizers about this attendee.',
        @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
        @level1type = N'TABLE',  @level1name = N'EventOrderLine',
        @level2type = N'COLUMN', @level2name = N'Comments';
END
GO
