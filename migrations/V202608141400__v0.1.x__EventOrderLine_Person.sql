-- EventOrderLine attendee is a Person, not free-text name/email.
-- Check-in stays optional (door scan, not entry).
--
-- PersonID is required for NEW rows. Existing EventOrderLine rows (if any)
-- keep a NULL until they are edited — we cannot invent a Person for them.
-- RUN CODEGEN AFTER THIS.

IF COL_LENGTH('__mj_BizAppsOrders.EventOrderLine', 'PersonID') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[EventOrderLine] ADD [PersonID] UNIQUEIDENTIFIER NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_EventOrderLine_Person'
      AND parent_object_id = OBJECT_ID('[__mj_BizAppsOrders].[EventOrderLine]')
)
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[EventOrderLine]
        ADD CONSTRAINT FK_EventOrderLine_Person
        FOREIGN KEY ([PersonID]) REFERENCES [__mj_BizAppsCommon].[Person]([ID]);
END
GO

IF COL_LENGTH('__mj_BizAppsOrders.EventOrderLine', 'AttendeeName') IS NOT NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[EventOrderLine] DROP COLUMN [AttendeeName];
END
GO

IF COL_LENGTH('__mj_BizAppsOrders.EventOrderLine', 'AttendeeEmail') IS NOT NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[EventOrderLine] DROP COLUMN [AttendeeEmail];
END
GO

-- Empty table (or every row already has a person): make Person required.
IF COL_LENGTH('__mj_BizAppsOrders.EventOrderLine', 'PersonID') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM [__mj_BizAppsOrders].[EventOrderLine] WHERE [PersonID] IS NULL)
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[EventOrderLine]
        ALTER COLUMN [PersonID] UNIQUEIDENTIFIER NOT NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('[__mj_BizAppsOrders].[EventOrderLine]')
      AND minor_id = COLUMNPROPERTY(OBJECT_ID('[__mj_BizAppsOrders].[EventOrderLine]'), 'PersonID', 'ColumnId')
      AND name = 'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'FK to __mj_BizAppsCommon.Person — the attendee. Required for a new event line; check-in is separate and optional.',
        @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
        @level1type = N'TABLE',  @level1name = N'EventOrderLine',
        @level2type = N'COLUMN', @level2name = N'PersonID';
END
GO
