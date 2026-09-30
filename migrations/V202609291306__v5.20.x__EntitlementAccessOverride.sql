-- Recorded, approved exceptions to payment-gated access (bizapps-orders#268).
--
-- OnFirstPayment holds a new purchase until its first payment and cuts a renewal off once it is past
-- the configured cutoff. Until now the only way round either was to edit EntitlementGrant.Status by
-- hand: nothing recorded who allowed it or why, and the next payment or the nightly pass re-decided
-- the grant and reversed it.
--
-- AN OVERRIDE IS ITS OWN ROW, on one order. It names the one suspension it lifts (WaivePaymentHold
-- lifts AwaitingPayment; DeferCutoff lifts PastDue), carries a required reason and a required last
-- day, and takes effect only once its Tasks approval has been decided in its favour. The payment
-- re-decision reads approved, unexpired overrides on the grant's own order and treats the grant as
-- Active; when the override runs out the payment rule's answer stands again. Scope is the order: it
-- does not reach a later renewal or a revised order, each of which is a different order.
--
-- LIFECYCLE. Requested -> Approved | Rejected | Withdrawn; Approved -> Expired, set by the nightly
-- pass once it has re-decided the grants after EffectiveThrough. Who decided, and when, is recorded
-- on the row. Who MAY decide is not settled here (bizapps-orders#360).
CREATE TABLE __mj_BizAppsOrders.EntitlementAccessOverride (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderHeaderID UNIQUEIDENTIFIER NOT NULL,
    OverrideType NVARCHAR(20) NOT NULL,
    Reason NVARCHAR(1000) NOT NULL,
    EffectiveThrough DATE NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Requested',
    RequestedByUserID UNIQUEIDENTIFIER NOT NULL,
    RequestedAt DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    ApprovalTaskID UNIQUEIDENTIFIER NULL,
    ApprovalTaskRaisedAt DATETIMEOFFSET NULL,
    DecidedByUserID UNIQUEIDENTIFIER NULL,
    DecidedAt DATETIMEOFFSET NULL,
    DecisionNotes NVARCHAR(1000) NULL,
    CONSTRAINT PK_EntitlementAccessOverride PRIMARY KEY (ID),
    CONSTRAINT FK_EntitlementAccessOverride_OrderHeader FOREIGN KEY (OrderHeaderID) REFERENCES __mj_BizAppsOrders.OrderHeader(ID),
    CONSTRAINT FK_EntitlementAccessOverride_RequestedByUser FOREIGN KEY (RequestedByUserID) REFERENCES __mj.[User](ID),
    CONSTRAINT FK_EntitlementAccessOverride_DecidedByUser FOREIGN KEY (DecidedByUserID) REFERENCES __mj.[User](ID),
    CONSTRAINT FK_EntitlementAccessOverride_ApprovalTask FOREIGN KEY (ApprovalTaskID) REFERENCES __mj_BizAppsTasks.Task(ID),
    CONSTRAINT CK_EntitlementAccessOverride_OverrideType CHECK (OverrideType IN ('WaivePaymentHold','DeferCutoff')),
    CONSTRAINT CK_EntitlementAccessOverride_Status CHECK (Status IN ('Requested','Approved','Rejected','Withdrawn','Expired')),
    CONSTRAINT CK_EntitlementAccessOverride_Reason CHECK (LEN(LTRIM(RTRIM(Reason))) > 0),
    -- The task and the moment it was raised are written together or not at all.
    CONSTRAINT CK_EntitlementAccessOverride_ApprovalTaskPaired CHECK ((ApprovalTaskID IS NULL AND ApprovalTaskRaisedAt IS NULL) OR (ApprovalTaskID IS NOT NULL AND ApprovalTaskRaisedAt IS NOT NULL)),
    -- An open request carries no decision. A closed one says when; one that was decided (rather than
    -- withdrawn) also says by whom.
    CONSTRAINT CK_EntitlementAccessOverride_Decision CHECK (
        (Status = 'Requested' AND DecidedByUserID IS NULL AND DecidedAt IS NULL)
        OR (Status = 'Withdrawn' AND DecidedAt IS NOT NULL)
        OR (Status IN ('Approved','Rejected','Expired') AND DecidedByUserID IS NOT NULL AND DecidedAt IS NOT NULL))
);
GO
-- THE RECORD IS THE POINT, so the database keeps it:
--   51023 — what was requested (order, type, reason, last day, requester) never changes;
--   51024 — status moves only Requested -> Approved | Rejected | Withdrawn, and Approved -> Expired;
--   51025 — the approval task, once stamped, and the decision, once made, are not rewritten.
-- That a decision came through the approval task is checked in application code
-- (EntitlementAccessOverrideEntityServer), which can read the task; this trigger holds what direct
-- SQL could otherwise undo. The timestamps are compared to the millisecond: a save writes back the
-- value it read, and a client holds a DATETIMEOFFSET only to the millisecond, so the seven-digit
-- default would otherwise read as a change on every save.
CREATE TRIGGER __mj_BizAppsOrders.trg_EntitlementAccessOverride_Record
ON __mj_BizAppsOrders.EntitlementAccessOverride
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i.ID = d.ID
        WHERE i.OrderHeaderID <> d.OrderHeaderID
           OR i.OverrideType <> d.OverrideType
           OR i.Reason <> d.Reason
           OR i.EffectiveThrough <> d.EffectiveThrough
           OR i.RequestedByUserID <> d.RequestedByUserID
           OR ABS(DATEDIFF_BIG(MICROSECOND, i.RequestedAt, d.RequestedAt)) >= 1000
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51023, 'An access override''s request (order, type, reason, EffectiveThrough, requester) cannot be changed. Request a new override instead.', 1;
    END;
    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i.ID = d.ID
        WHERE i.Status <> d.Status
          AND NOT (d.Status = 'Requested' AND i.Status IN ('Approved','Rejected','Withdrawn'))
          AND NOT (d.Status = 'Approved' AND i.Status = 'Expired')
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51024, 'An access override''s status moves only from Requested to Approved, Rejected or Withdrawn, and from Approved to Expired.', 1;
    END;
    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i.ID = d.ID
        WHERE (d.ApprovalTaskID IS NOT NULL AND (i.ApprovalTaskID IS NULL OR i.ApprovalTaskID <> d.ApprovalTaskID))
           OR (d.DecidedAt IS NOT NULL AND (i.DecidedAt IS NULL OR ABS(DATEDIFF_BIG(MICROSECOND, i.DecidedAt, d.DecidedAt)) >= 1000))
           OR (d.DecidedByUserID IS NOT NULL AND (i.DecidedByUserID IS NULL OR i.DecidedByUserID <> d.DecidedByUserID))
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51025, 'An access override''s approval task and decision cannot be rewritten once recorded.', 1;
    END;
END;
GO
-- One open override of each type per order: a second request waits for the first to close.
CREATE UNIQUE INDEX UX_EntitlementAccessOverride_OpenPerOrder
    ON __mj_BizAppsOrders.EntitlementAccessOverride (OrderHeaderID, OverrideType)
    WHERE Status IN ('Requested','Approved');
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'An approved exception to payment-gated access on one order: WaivePaymentHold lifts the hold on a new purchase awaiting its first payment, DeferCutoff lifts the past-due cutoff on a renewal. In force only once approved through Tasks, and only through EffectiveThrough.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementAccessOverride';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The order the override applies to. It does not carry to a later renewal or a revised order, which are different orders.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementAccessOverride',
    @level2type = N'COLUMN', @level2name = N'OrderHeaderID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'WaivePaymentHold (lifts AwaitingPayment) or DeferCutoff (lifts PastDue).',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementAccessOverride',
    @level2type = N'COLUMN', @level2name = N'OverrideType';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Why the exception is needed. Required.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementAccessOverride',
    @level2type = N'COLUMN', @level2name = N'Reason';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The last day the override holds, inclusive. Required. After it the payment rule decides the grants again.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementAccessOverride',
    @level2type = N'COLUMN', @level2name = N'EffectiveThrough';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Requested (awaiting approval), Approved (in force through EffectiveThrough), Rejected, Withdrawn (the approval task closed without a decision that could be applied), or Expired (EffectiveThrough has passed and the grants have been re-decided).',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementAccessOverride',
    @level2type = N'COLUMN', @level2name = N'Status';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user who requested the override.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementAccessOverride',
    @level2type = N'COLUMN', @level2name = N'RequestedByUserID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the override was requested.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementAccessOverride',
    @level2type = N'COLUMN', @level2name = N'RequestedAt';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Tasks approval request for this override.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementAccessOverride',
    @level2type = N'COLUMN', @level2name = N'ApprovalTaskID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the approval task was raised. Set together with ApprovalTaskID.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementAccessOverride',
    @level2type = N'COLUMN', @level2name = N'ApprovalTaskRaisedAt';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user whose decision on the approval task approved or rejected the override.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementAccessOverride',
    @level2type = N'COLUMN', @level2name = N'DecidedByUserID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the override was approved, rejected or withdrawn.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementAccessOverride',
    @level2type = N'COLUMN', @level2name = N'DecidedAt';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The notes recorded with the decision, or why a closed approval task was not applied.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'EntitlementAccessOverride',
    @level2type = N'COLUMN', @level2name = N'DecisionNotes';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the EntitlementAccessOverride entity (its metadata,
-- view, CRUD procs and permissions) is folded here.
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Orders: Entitlement Access Overrides */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'fcd8dc48-d198-430c-a684-67f3a36a96a7',
         'MJ_BizApps_Orders: Entitlement Access Overrides',
         'Entitlement Access Overrides',
         'An approved exception to payment-gated access on one order: WaivePaymentHold lifts the hold on a new purchase awaiting its first payment, DeferCutoff lifts the past-due cutoff on a renewal. In force only once approved through Tasks, and only through EffectiveThrough.',
         NULL,
         'EntitlementAccessOverride',
         'vwEntitlementAccessOverrides',
         '${flyway:defaultSchema}',
         1,
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_Orders: Entitlement Access Overrides to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'fcd8dc48-d198-430c-a684-67f3a36a96a7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Entitlement Access Overrides for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fcd8dc48-d198-430c-a684-67f3a36a96a7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Entitlement Access Overrides for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fcd8dc48-d198-430c-a684-67f3a36a96a7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Entitlement Access Overrides for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fcd8dc48-d198-430c-a684-67f3a36a96a7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntitlementAccessOverride */
ALTER TABLE [${flyway:defaultSchema}].[EntitlementAccessOverride] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntitlementAccessOverride */
UPDATE [${flyway:defaultSchema}].[EntitlementAccessOverride] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntitlementAccessOverride */
ALTER TABLE [${flyway:defaultSchema}].[EntitlementAccessOverride] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntitlementAccessOverride */
ALTER TABLE [${flyway:defaultSchema}].[EntitlementAccessOverride] ADD CONSTRAINT [DF___mj_BizAppsOrders_EntitlementAccessOverride___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntitlementAccessOverride */
ALTER TABLE [${flyway:defaultSchema}].[EntitlementAccessOverride] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntitlementAccessOverride */
UPDATE [${flyway:defaultSchema}].[EntitlementAccessOverride] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntitlementAccessOverride */
ALTER TABLE [${flyway:defaultSchema}].[EntitlementAccessOverride] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntitlementAccessOverride */
ALTER TABLE [${flyway:defaultSchema}].[EntitlementAccessOverride] ADD CONSTRAINT [DF___mj_BizAppsOrders_EntitlementAccessOverride___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 16 new entity field(s) */
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd7992347-1800-4ae9-9c1f-c7cf67532f6d' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'ID')) BEGIN
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
            'd7992347-1800-4ae9-9c1f-c7cf67532f6d',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '96d042a1-08bb-4644-9e2d-d1ec6da6169f' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'OrderHeaderID')) BEGIN
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
            '96d042a1-08bb-4644-9e2d-d1ec6da6169f',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'OrderHeaderID',
            'Order Header ID',
            'The order the override applies to. It does not carry to a later renewal or a revised order, which are different orders.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3e03c872-2a07-4939-8c01-39c5365d9346' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'OverrideType')) BEGIN
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
            '3e03c872-2a07-4939-8c01-39c5365d9346',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'OverrideType',
            'Override Type',
            'WaivePaymentHold (lifts AwaitingPayment) or DeferCutoff (lifts PastDue).',
            'nvarchar',
            40,
            0,
            0,
            0,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'adb3dcd5-ecaf-4805-9690-f8edafb17abb' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'Reason')) BEGIN
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
            'adb3dcd5-ecaf-4805-9690-f8edafb17abb',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'Reason',
            'Reason',
            'Why the exception is needed. Required.',
            'nvarchar',
            2000,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0f655045-e355-4ce5-b1fd-0773b4d5cd46' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'EffectiveThrough')) BEGIN
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
            '0f655045-e355-4ce5-b1fd-0773b4d5cd46',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'EffectiveThrough',
            'Effective Through',
            'The last day the override holds, inclusive. Required. After it the payment rule decides the grants again.',
            'date',
            3,
            10,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3d0fc519-4cfb-4e8d-b82a-13380af14a58' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'Status')) BEGIN
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
            '3d0fc519-4cfb-4e8d-b82a-13380af14a58',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'Status',
            'Status',
            'Requested (awaiting approval), Approved (in force through EffectiveThrough), Rejected, Withdrawn (the approval task closed without a decision that could be applied), or Expired (EffectiveThrough has passed and the grants have been re-decided).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Requested',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1e9f7737-7207-42cb-81c7-7434a1c8cdbf' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'RequestedByUserID')) BEGIN
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
            '1e9f7737-7207-42cb-81c7-7434a1c8cdbf',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'RequestedByUserID',
            'Requested By User ID',
            'The user who requested the override.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b7993e8d-8857-42e2-bdc7-68e9aaba98ea' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'RequestedAt')) BEGIN
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
            'b7993e8d-8857-42e2-bdc7-68e9aaba98ea',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'RequestedAt',
            'Requested At',
            'When the override was requested.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cae96769-15e4-4910-857e-e5b89b5d8a90' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'ApprovalTaskID')) BEGIN
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
            'cae96769-15e4-4910-857e-e5b89b5d8a90',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'ApprovalTaskID',
            'Approval Task ID',
            'The Tasks approval request for this override.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'B348FFA2-B1A7-4AC2-B6FD-F4E0C0697466',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b8dcba40-d253-4cd6-93d8-e4431b2adb64' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'ApprovalTaskRaisedAt')) BEGIN
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
            'b8dcba40-d253-4cd6-93d8-e4431b2adb64',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'ApprovalTaskRaisedAt',
            'Approval Task Raised At',
            'When the approval task was raised. Set together with ApprovalTaskID.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8b9e0057-3a4f-46a5-bd27-711074043502' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'DecidedByUserID')) BEGIN
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
            '8b9e0057-3a4f-46a5-bd27-711074043502',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'DecidedByUserID',
            'Decided By User ID',
            'The user whose decision on the approval task approved or rejected the override.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '60eeede2-2743-4823-bcac-b78822cdaf19' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'DecidedAt')) BEGIN
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
            '60eeede2-2743-4823-bcac-b78822cdaf19',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'DecidedAt',
            'Decided At',
            'When the override was approved, rejected or withdrawn.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a3fde641-ff23-42a0-8053-eb145ba6cf8a' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'DecisionNotes')) BEGIN
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
            'a3fde641-ff23-42a0-8053-eb145ba6cf8a',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'DecisionNotes',
            'Decision Notes',
            'The notes recorded with the decision, or why a closed approval task was not applied.',
            'nvarchar',
            2000,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7bf210a5-bcda-4495-8180-913bbb87a01c' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = '__mj_CreatedAt')) BEGIN
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
            '7bf210a5-bcda-4495-8180-913bbb87a01c',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9bfbf8d6-ae8e-4de3-9e3a-32d538e20ad3' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '9bfbf8d6-ae8e-4de3-9e3a-32d538e20ad3',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

/* SQL text to insert entity field value with ID 5d4c455f-8d8d-4dcc-8fdd-439738baad16 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5d4c455f-8d8d-4dcc-8fdd-439738baad16', 'F04330BA-4A37-4674-A2FE-237CE04E2C52', 1, 'Fulfilled', 'Fulfilled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3875ad27-8bac-47fe-90f2-f3d4fefff227 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3875ad27-8bac-47fe-90f2-f3d4fefff227', 'F04330BA-4A37-4674-A2FE-237CE04E2C52', 2, 'NotApplicable', 'NotApplicable', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a24d12a8-2732-4895-8550-83ad3789f8c5 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a24d12a8-2732-4895-8550-83ad3789f8c5', 'F04330BA-4A37-4674-A2FE-237CE04E2C52', 3, 'PartiallyFulfilled', 'PartiallyFulfilled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 37332b77-ab7d-4410-bee9-ad3d7611c6a4 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('37332b77-ab7d-4410-bee9-ad3d7611c6a4', 'F04330BA-4A37-4674-A2FE-237CE04E2C52', 4, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d657350e-e67d-4e8a-9aeb-a67eebc1bdeb */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d657350e-e67d-4e8a-9aeb-a67eebc1bdeb', 'F04330BA-4A37-4674-A2FE-237CE04E2C52', 5, 'Returned', 'Returned', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F04330BA-4A37-4674-A2FE-237CE04E2C52 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='F04330BA-4A37-4674-A2FE-237CE04E2C52';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=1 WHERE ID='9F13F050-8186-4E3E-8FF5-137439A028B7';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=2 WHERE ID='89A2C186-2F24-49FB-9B44-B0D393FC8D02';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=3 WHERE ID='E0C691D7-876D-463C-89F5-460BC533911B';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=1 WHERE ID='8B25A930-5396-4C6C-A6B2-B98B57B45B40';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=2 WHERE ID='9E2B729E-F73D-489B-B5F6-A2AC40DC6752';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='4552341E-F7AD-4C47-BE41-AD38A1EDAA6D';

/* SQL text to insert entity field value with ID 1421bf56-4ae3-4fb6-b357-e457e5eafd91 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1421bf56-4ae3-4fb6-b357-e457e5eafd91', '3E03C872-2A07-4939-8C01-39C5365D9346', 1, 'DeferCutoff', 'DeferCutoff', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2a398881-4514-4eee-a128-b10ddf177c9d */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2a398881-4514-4eee-a128-b10ddf177c9d', '3E03C872-2A07-4939-8C01-39C5365D9346', 2, 'WaivePaymentHold', 'WaivePaymentHold', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3E03C872-2A07-4939-8C01-39C5365D9346 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='3E03C872-2A07-4939-8C01-39C5365D9346';

/* SQL text to insert entity field value with ID 66b46739-ba58-4ce3-85cd-ed32af3824e9 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('66b46739-ba58-4ce3-85cd-ed32af3824e9', '3D0FC519-4CFB-4E8D-B82A-13380AF14A58', 1, 'Approved', 'Approved', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9dab040e-961b-4174-a04e-8ea7e63ae937 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9dab040e-961b-4174-a04e-8ea7e63ae937', '3D0FC519-4CFB-4E8D-B82A-13380AF14A58', 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 325c44e1-1814-48f2-98d3-64d53c350f37 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('325c44e1-1814-48f2-98d3-64d53c350f37', '3D0FC519-4CFB-4E8D-B82A-13380AF14A58', 3, 'Rejected', 'Rejected', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c2bc92e9-6207-4572-a536-383313ec6ee7 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c2bc92e9-6207-4572-a536-383313ec6ee7', '3D0FC519-4CFB-4E8D-B82A-13380AF14A58', 4, 'Requested', 'Requested', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1df2ee06-7192-42b8-aba6-b39431918862 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1df2ee06-7192-42b8-aba6-b39431918862', '3D0FC519-4CFB-4E8D-B82A-13380AF14A58', 5, 'Withdrawn', 'Withdrawn', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3D0FC519-4CFB-4E8D-B82A-13380AF14A58 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='3D0FC519-4CFB-4E8D-B82A-13380AF14A58';


/* Create Entity Relationship: MJ_BizApps_Orders: Order Headers -> MJ_BizApps_Orders: Entitlement Access Overrides (One To Many via OrderHeaderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'a52d4efc-460e-43a0-8cff-97eceb9a7ef5'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a52d4efc-460e-43a0-8cff-97eceb9a7ef5', 'FC529BC8-FF09-44A9-B454-26EAFDAC791B', 'FCD8DC48-D198-430C-A684-67F3A36A96A7', 'OrderHeaderID', 'One To Many', 1, 1, 12, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Entitlement Access Overrides (One To Many via DecidedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '6231ae22-c8cd-4449-a9e0-2de2aa8564a2'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6231ae22-c8cd-4449-a9e0-2de2aa8564a2', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'FCD8DC48-D198-430C-A684-67F3A36A96A7', 'DecidedByUserID', 'One To Many', 1, 1, 124, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Entitlement Access Overrides (One To Many via RequestedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '4b6ce2b3-87e0-46b3-adc5-46ff7becca04'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4b6ce2b3-87e0-46b3-adc5-46ff7becca04', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'FCD8DC48-D198-430C-A684-67F3A36A96A7', 'RequestedByUserID', 'One To Many', 1, 1, 125, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Tasks: Tasks -> MJ_BizApps_Orders: Entitlement Access Overrides (One To Many via ApprovalTaskID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '07782c70-850e-468e-8f4c-bb749c8224c2'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('07782c70-850e-468e-8f4c-bb749c8224c2', 'B348FFA2-B1A7-4AC2-B6FD-F4E0C0697466', 'FCD8DC48-D198-430C-A684-67F3A36A96A7', 'ApprovalTaskID', 'One To Many', 1, 1, 12, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for EntitlementAccessOverride */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderHeaderID in table EntitlementAccessOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntitlementAccessOverride_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntitlementAccessOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntitlementAccessOverride_OrderHeaderID ON [${flyway:defaultSchema}].[EntitlementAccessOverride] ([OrderHeaderID]);

-- Index for foreign key RequestedByUserID in table EntitlementAccessOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntitlementAccessOverride_RequestedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntitlementAccessOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntitlementAccessOverride_RequestedByUserID ON [${flyway:defaultSchema}].[EntitlementAccessOverride] ([RequestedByUserID]);

-- Index for foreign key ApprovalTaskID in table EntitlementAccessOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntitlementAccessOverride_ApprovalTaskID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntitlementAccessOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntitlementAccessOverride_ApprovalTaskID ON [${flyway:defaultSchema}].[EntitlementAccessOverride] ([ApprovalTaskID]);

-- Index for foreign key DecidedByUserID in table EntitlementAccessOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntitlementAccessOverride_DecidedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntitlementAccessOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntitlementAccessOverride_DecidedByUserID ON [${flyway:defaultSchema}].[EntitlementAccessOverride] ([DecidedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 96D042A1-08BB-4644-9E2D-D1EC6DA6169F */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='96D042A1-08BB-4644-9E2D-D1EC6DA6169F', @RelatedEntityNameFieldMap='OrderHeader';

/* SQL text to update entity field related entity name field map for entity field ID 1E9F7737-7207-42CB-81C7-7434A1C8CDBF */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1E9F7737-7207-42CB-81C7-7434A1C8CDBF', @RelatedEntityNameFieldMap='RequestedByUser';

/* SQL text to update entity field related entity name field map for entity field ID CAE96769-15E4-4910-857E-E5B89B5D8A90 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CAE96769-15E4-4910-857E-E5B89B5D8A90', @RelatedEntityNameFieldMap='ApprovalTask';

/* SQL text to update entity field related entity name field map for entity field ID 8B9E0057-3A4F-46A5-BD27-711074043502 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8B9E0057-3A4F-46A5-BD27-711074043502', @RelatedEntityNameFieldMap='DecidedByUser';

/* Base View SQL for MJ_BizApps_Orders: Entitlement Access Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
-- Item: vwEntitlementAccessOverrides
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Entitlement Access Overrides
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntitlementAccessOverride
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntitlementAccessOverrides]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntitlementAccessOverrides];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntitlementAccessOverrides]
AS
SELECT
    e.*,
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader],
    MJUser_RequestedByUserID.[Name] AS [RequestedByUser],
    mjBizAppsTasksTask_ApprovalTaskID.[Name] AS [ApprovalTask],
    MJUser_DecidedByUserID.[Name] AS [DecidedByUser]
FROM
    [${flyway:defaultSchema}].[EntitlementAccessOverride] AS e
INNER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [e].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
INNER JOIN
    [${mjSchema}].[User] AS MJUser_RequestedByUserID
  ON
    [e].[RequestedByUserID] = MJUser_RequestedByUserID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsTasks].[Task] AS mjBizAppsTasksTask_ApprovalTaskID
  ON
    [e].[ApprovalTaskID] = mjBizAppsTasksTask_ApprovalTaskID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_DecidedByUserID
  ON
    [e].[DecidedByUserID] = MJUser_DecidedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntitlementAccessOverrides] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Entitlement Access Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
-- Item: Permissions for vwEntitlementAccessOverrides
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntitlementAccessOverrides] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Entitlement Access Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
-- Item: spCreateEntitlementAccessOverride
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntitlementAccessOverride
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntitlementAccessOverride]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntitlementAccessOverride];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntitlementAccessOverride]
    @ID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier,
    @OverrideType nvarchar(20),
    @Reason nvarchar(1000),
    @EffectiveThrough date,
    @Status nvarchar(20) = NULL,
    @RequestedByUserID uniqueidentifier,
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
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntitlementAccessOverride]
            (
                [ID],
                [OrderHeaderID],
                [OverrideType],
                [Reason],
                [EffectiveThrough],
                [Status],
                [RequestedByUserID],
                [RequestedAt],
                [ApprovalTaskID],
                [ApprovalTaskRaisedAt],
                [DecidedByUserID],
                [DecidedAt],
                [DecisionNotes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderHeaderID,
                @OverrideType,
                @Reason,
                @EffectiveThrough,
                ISNULL(@Status, 'Requested'),
                @RequestedByUserID,
                ISNULL(@RequestedAt, sysdatetimeoffset()),
                CASE WHEN @ApprovalTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskID, NULL) END,
                CASE WHEN @ApprovalTaskRaisedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskRaisedAt, NULL) END,
                CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, NULL) END,
                CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, NULL) END,
                CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntitlementAccessOverride]
            (
                [OrderHeaderID],
                [OverrideType],
                [Reason],
                [EffectiveThrough],
                [Status],
                [RequestedByUserID],
                [RequestedAt],
                [ApprovalTaskID],
                [ApprovalTaskRaisedAt],
                [DecidedByUserID],
                [DecidedAt],
                [DecisionNotes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderHeaderID,
                @OverrideType,
                @Reason,
                @EffectiveThrough,
                ISNULL(@Status, 'Requested'),
                @RequestedByUserID,
                ISNULL(@RequestedAt, sysdatetimeoffset()),
                CASE WHEN @ApprovalTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskID, NULL) END,
                CASE WHEN @ApprovalTaskRaisedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskRaisedAt, NULL) END,
                CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, NULL) END,
                CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, NULL) END,
                CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntitlementAccessOverrides] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntitlementAccessOverride] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Entitlement Access Overrides */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntitlementAccessOverride] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Entitlement Access Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
-- Item: spUpdateEntitlementAccessOverride
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

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
        [DecisionNotes] = CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, [DecisionNotes]) END
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
    UPDATE
        [${flyway:defaultSchema}].[EntitlementAccessOverride]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntitlementAccessOverride] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Entitlement Access Overrides */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntitlementAccessOverride] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Entitlement Access Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
-- Item: spDeleteEntitlementAccessOverride
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntitlementAccessOverride
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntitlementAccessOverride]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntitlementAccessOverride];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntitlementAccessOverride]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntitlementAccessOverride]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntitlementAccessOverride] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Entitlement Access Overrides */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntitlementAccessOverride] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 5 new entity field(s) */
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2e1a9eeb-6793-4387-9afe-f2e55d86150f' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'OrderHeader')) BEGIN
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
            '2e1a9eeb-6793-4387-9afe-f2e55d86150f',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'OrderHeader',
            'Order Header',
            NULL,
            'nvarchar',
            80,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4af3234a-05dc-4efa-81f0-af5f73006c2a' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'RequestedByUser')) BEGIN
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
            '4af3234a-05dc-4efa-81f0-af5f73006c2a',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'RequestedByUser',
            'Requested By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'baff21c2-a6eb-42d9-a098-b843fe7f56d1' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'ApprovalTask')) BEGIN
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
            'baff21c2-a6eb-42d9-a098-b843fe7f56d1',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'ApprovalTask',
            'Approval Task',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'df411d46-57d5-409a-98c6-f74121fea4fc' OR (EntityID = 'FCD8DC48-D198-430C-A684-67F3A36A96A7' AND Name = 'DecidedByUser')) BEGIN
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
            'df411d46-57d5-409a-98c6-f74121fea4fc',
            'FCD8DC48-D198-430C-A684-67F3A36A96A7', -- Entity: MJ_BizApps_Orders: Entitlement Access Overrides
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FCD8DC48-D198-430C-A684-67F3A36A96A7') + 1,
            'DecidedByUser',
            'Decided By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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

