-- A refund is requested by one person and approved by another (bc-aidp-next-golive#355, #320).
--
-- Until now Orders had no record of a refund being asked for, so the only check possible was whether
-- the person issuing a refund was allowed to approve it: whoever issued it approved it themselves.
-- A REFUND REQUEST IS ITS OWN ROW, on one captured payment. It names the amount and a required
-- reason, raises a Tasks approval assigned to approvers other than the requester, and once approved
-- lets its requester issue exactly that refund. The refund itself is still Orders.RefundPayment,
-- run by the requester after approval, so a gateway failure is seen by the person issuing it rather
-- than buried in the approval step.
--
-- Only while the RefundApprovalThreshold setting is set. With it empty no request is needed, as before.
--
-- LIFECYCLE. Requested -> Approved | Rejected | Withdrawn; Approved -> Issued | Withdrawn.
-- Issued names the refund payment it became. Who decided, and when, is recorded on the row.
CREATE TABLE __mj_BizAppsOrders.RefundRequest (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PaymentHeaderID UNIQUEIDENTIFIER NOT NULL,
    Amount DECIMAL(18,2) NOT NULL,
    Reason NVARCHAR(1000) NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Requested',
    RequestedByUserID UNIQUEIDENTIFIER NOT NULL,
    RequestedAt DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    ApprovalTaskID UNIQUEIDENTIFIER NULL,
    ApprovalTaskRaisedAt DATETIMEOFFSET NULL,
    DecidedByUserID UNIQUEIDENTIFIER NULL,
    DecidedAt DATETIMEOFFSET NULL,
    DecisionNotes NVARCHAR(1000) NULL,
    RefundPaymentHeaderID UNIQUEIDENTIFIER NULL,
    IssuedAt DATETIMEOFFSET NULL,
    CONSTRAINT PK_RefundRequest PRIMARY KEY (ID),
    CONSTRAINT FK_RefundRequest_PaymentHeader FOREIGN KEY (PaymentHeaderID) REFERENCES __mj_BizAppsOrders.PaymentHeader(ID),
    CONSTRAINT FK_RefundRequest_RefundPaymentHeader FOREIGN KEY (RefundPaymentHeaderID) REFERENCES __mj_BizAppsOrders.PaymentHeader(ID),
    CONSTRAINT FK_RefundRequest_RequestedByUser FOREIGN KEY (RequestedByUserID) REFERENCES __mj.[User](ID),
    CONSTRAINT FK_RefundRequest_DecidedByUser FOREIGN KEY (DecidedByUserID) REFERENCES __mj.[User](ID),
    CONSTRAINT FK_RefundRequest_ApprovalTask FOREIGN KEY (ApprovalTaskID) REFERENCES __mj_BizAppsTasks.Task(ID),
    CONSTRAINT CK_RefundRequest_Amount CHECK (Amount > 0),
    CONSTRAINT CK_RefundRequest_Status CHECK (Status IN ('Requested','Approved','Rejected','Withdrawn','Issued')),
    CONSTRAINT CK_RefundRequest_Reason CHECK (LEN(LTRIM(RTRIM(Reason))) > 0),
    -- The task and the moment it was raised are written together or not at all.
    CONSTRAINT CK_RefundRequest_ApprovalTaskPaired CHECK ((ApprovalTaskID IS NULL AND ApprovalTaskRaisedAt IS NULL) OR (ApprovalTaskID IS NOT NULL AND ApprovalTaskRaisedAt IS NOT NULL)),
    -- An open request carries no decision. A withdrawn one says when; an approved, rejected or
    -- issued one also says by whom. Only an issued one names its refund payment.
    CONSTRAINT CK_RefundRequest_Decision CHECK (
        (Status = 'Requested' AND DecidedByUserID IS NULL AND DecidedAt IS NULL)
        OR (Status = 'Withdrawn' AND DecidedAt IS NOT NULL)
        OR (Status IN ('Approved','Rejected','Issued') AND DecidedByUserID IS NOT NULL AND DecidedAt IS NOT NULL)),
    CONSTRAINT CK_RefundRequest_Issued CHECK (
        (Status = 'Issued' AND RefundPaymentHeaderID IS NOT NULL AND IssuedAt IS NOT NULL)
        OR (Status <> 'Issued' AND RefundPaymentHeaderID IS NULL AND IssuedAt IS NULL))
);
GO
-- THE RECORD IS THE POINT, so the database keeps it:
--   51031 — what was requested (payment, amount, reason, requester) never changes;
--   51032 — status moves only Requested -> Approved | Rejected | Withdrawn, and Approved -> Issued | Withdrawn;
--   51033 — the approval task, once stamped, and the decision, once made, are not rewritten.
-- That a decision came through the approval task, by an assignee who is not the requester, is
-- checked in application code (RefundRequestEntityServer), which can read the task. Timestamps are
-- compared to the millisecond, since a client holds a DATETIMEOFFSET only to the millisecond.
CREATE TRIGGER __mj_BizAppsOrders.trg_RefundRequest_Record
ON __mj_BizAppsOrders.RefundRequest
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i.ID = d.ID
        WHERE i.PaymentHeaderID <> d.PaymentHeaderID
           OR i.Amount <> d.Amount
           OR i.Reason <> d.Reason
           OR i.RequestedByUserID <> d.RequestedByUserID
           OR ABS(DATEDIFF_BIG(MICROSECOND, i.RequestedAt, d.RequestedAt)) >= 1000
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51031, 'A refund request''s payment, amount, reason and requester cannot be changed. Request a new refund instead.', 1;
    END;
    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i.ID = d.ID
        WHERE i.Status <> d.Status
          AND NOT (d.Status = 'Requested' AND i.Status IN ('Approved','Rejected','Withdrawn'))
          AND NOT (d.Status = 'Approved' AND i.Status IN ('Issued','Withdrawn'))
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51032, 'A refund request''s status moves only from Requested to Approved, Rejected or Withdrawn, and from Approved to Issued or Withdrawn.', 1;
    END;
    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i.ID = d.ID
        WHERE (d.ApprovalTaskID IS NOT NULL AND (i.ApprovalTaskID IS NULL OR i.ApprovalTaskID <> d.ApprovalTaskID))
           OR (d.DecidedByUserID IS NOT NULL AND (i.DecidedByUserID IS NULL OR i.DecidedByUserID <> d.DecidedByUserID))
           OR (d.Status IN ('Approved','Rejected') AND (i.DecidedAt IS NULL OR ABS(DATEDIFF_BIG(MICROSECOND, i.DecidedAt, d.DecidedAt)) >= 1000))
           OR (d.RefundPaymentHeaderID IS NOT NULL AND (i.RefundPaymentHeaderID IS NULL OR i.RefundPaymentHeaderID <> d.RefundPaymentHeaderID))
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51033, 'A refund request''s approval task, decision and refund payment cannot be rewritten once recorded.', 1;
    END;
END;
GO
-- One open request per payment: a second waits for the first to be issued or closed.
CREATE UNIQUE INDEX UX_RefundRequest_OpenPerPayment
    ON __mj_BizAppsOrders.RefundRequest (PaymentHeaderID)
    WHERE Status IN ('Requested','Approved');
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A request to refund a captured payment, approved through Tasks by someone other than the requester before the requester may issue it. Needed only while the RefundApprovalThreshold setting is set.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The captured payment to refund.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest',
    @level2type = N'COLUMN', @level2name = N'PaymentHeaderID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The amount to refund. The refund issued against an approved request must be this amount.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest',
    @level2type = N'COLUMN', @level2name = N'Amount';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Why the refund is needed. Required.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest',
    @level2type = N'COLUMN', @level2name = N'Reason';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Requested (awaiting approval), Approved (the requester may issue it), Rejected, Withdrawn (closed without being issued), or Issued (the refund was made).',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest',
    @level2type = N'COLUMN', @level2name = N'Status';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user who requested the refund, and the only one who may issue it once approved.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest',
    @level2type = N'COLUMN', @level2name = N'RequestedByUserID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the refund was requested.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest',
    @level2type = N'COLUMN', @level2name = N'RequestedAt';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Tasks approval request for this refund.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest',
    @level2type = N'COLUMN', @level2name = N'ApprovalTaskID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the approval task was raised. Set together with ApprovalTaskID.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest',
    @level2type = N'COLUMN', @level2name = N'ApprovalTaskRaisedAt';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user whose decision on the approval task approved or rejected the request.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest',
    @level2type = N'COLUMN', @level2name = N'DecidedByUserID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the request was approved, rejected or withdrawn.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest',
    @level2type = N'COLUMN', @level2name = N'DecidedAt';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The notes recorded with the decision, or why a request closed without being issued.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest',
    @level2type = N'COLUMN', @level2name = N'DecisionNotes';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The refund payment issued against this request. Set when the request is Issued.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest',
    @level2type = N'COLUMN', @level2name = N'RefundPaymentHeaderID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the refund was issued.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'RefundRequest',
    @level2type = N'COLUMN', @level2name = N'IssuedAt';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the RefundRequest entity (its metadata,
-- view, CRUD procs and permissions) is folded here.
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Orders: Refund Requests */

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
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'e9aca8ab-5ef2-491f-b801-34b6af03fce7',
         'MJ_BizApps_Orders: Refund Requests',
         'Refund Requests',
         'A request to refund a captured payment, approved through Tasks by someone other than the requester before the requester may issue it. Needed only while the RefundApprovalThreshold setting is set.',
         NULL,
         'RefundRequest',
         'vwRefundRequests',
         '${flyway:defaultSchema}',
         1,
         1,
         0,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ_BizApps_Orders: Refund Requests to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'e9aca8ab-5ef2-491f-b801-34b6af03fce7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Refund Requests for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('e9aca8ab-5ef2-491f-b801-34b6af03fce7' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('e9aca8ab-5ef2-491f-b801-34b6af03fce7' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Refund Requests for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('e9aca8ab-5ef2-491f-b801-34b6af03fce7' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('e9aca8ab-5ef2-491f-b801-34b6af03fce7' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Refund Requests for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('e9aca8ab-5ef2-491f-b801-34b6af03fce7' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('e9aca8ab-5ef2-491f-b801-34b6af03fce7' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RefundRequest */
ALTER TABLE [${flyway:defaultSchema}].[RefundRequest] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RefundRequest */
UPDATE [${flyway:defaultSchema}].[RefundRequest] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RefundRequest */
ALTER TABLE [${flyway:defaultSchema}].[RefundRequest] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RefundRequest */
ALTER TABLE [${flyway:defaultSchema}].[RefundRequest] ADD CONSTRAINT [DF___mj_BizAppsOrders_RefundRequest___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RefundRequest */
ALTER TABLE [${flyway:defaultSchema}].[RefundRequest] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RefundRequest */
UPDATE [${flyway:defaultSchema}].[RefundRequest] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RefundRequest */
ALTER TABLE [${flyway:defaultSchema}].[RefundRequest] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RefundRequest */
ALTER TABLE [${flyway:defaultSchema}].[RefundRequest] ADD CONSTRAINT [DF___mj_BizAppsOrders_RefundRequest___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 16 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bceb5f20-ce62-4773-9bb9-102bf5b1616c' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'ID')) BEGIN
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
            'bceb5f20-ce62-4773-9bb9-102bf5b1616c',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '12cebcb9-5e73-4b9d-80fd-15ce566cacb1' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'PaymentHeaderID')) BEGIN
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
            '12cebcb9-5e73-4b9d-80fd-15ce566cacb1',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'PaymentHeaderID',
            'Payment Header ID',
            'The captured payment to refund.',
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
            'CE97BF15-F7C6-4C50-A744-A89C714A4DDD',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2a3b2bb0-0496-486b-b9fc-fcfdc06be43d' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'Amount')) BEGIN
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
            '2a3b2bb0-0496-486b-b9fc-fcfdc06be43d',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'Amount',
            'Amount',
            'The amount to refund. The refund issued against an approved request must be this amount.',
            'decimal',
            9,
            18,
            2,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a1c2bc58-5290-42ad-83ce-513c47eb0b97' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'Reason')) BEGIN
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
            'a1c2bc58-5290-42ad-83ce-513c47eb0b97',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'Reason',
            'Reason',
            'Why the refund is needed. Required.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f88327f5-0e07-4502-b5c1-d7f50f51b7be' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'Status')) BEGIN
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
            'f88327f5-0e07-4502-b5c1-d7f50f51b7be',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'Status',
            'Status',
            'Requested (awaiting approval), Approved (the requester may issue it), Rejected, Withdrawn (closed without being issued), or Issued (the refund was made).',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1f1e28ce-08a5-4d3b-8421-39b89b78bf2f' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'RequestedByUserID')) BEGIN
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
            '1f1e28ce-08a5-4d3b-8421-39b89b78bf2f',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'RequestedByUserID',
            'Requested By User ID',
            'The user who requested the refund, and the only one who may issue it once approved.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '92028fba-cd3b-4601-994a-5c3d39466020' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'RequestedAt')) BEGIN
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
            '92028fba-cd3b-4601-994a-5c3d39466020',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'RequestedAt',
            'Requested At',
            'When the refund was requested.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'afcf6745-02cd-4d86-ad51-2d2f6e267703' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'ApprovalTaskID')) BEGIN
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
            'afcf6745-02cd-4d86-ad51-2d2f6e267703',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'ApprovalTaskID',
            'Approval Task ID',
            'The Tasks approval request for this refund.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fc654ee9-ecf9-4896-8335-5e03f1de9ef8' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'ApprovalTaskRaisedAt')) BEGIN
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
            'fc654ee9-ecf9-4896-8335-5e03f1de9ef8',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3a220ea0-5829-41b7-8635-9e9628e4181b' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'DecidedByUserID')) BEGIN
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
            '3a220ea0-5829-41b7-8635-9e9628e4181b',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'DecidedByUserID',
            'Decided By User ID',
            'The user whose decision on the approval task approved or rejected the request.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ecac464a-8701-4d41-805e-f2ba64f4919b' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'DecidedAt')) BEGIN
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
            'ecac464a-8701-4d41-805e-f2ba64f4919b',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'DecidedAt',
            'Decided At',
            'When the request was approved, rejected or withdrawn.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '620f771e-5697-486b-a02b-0c436fcfeba8' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'DecisionNotes')) BEGIN
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
            '620f771e-5697-486b-a02b-0c436fcfeba8',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'DecisionNotes',
            'Decision Notes',
            'The notes recorded with the decision, or why a request closed without being issued.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4add4239-5aae-4386-bf8d-6402ed69e42b' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'RefundPaymentHeaderID')) BEGIN
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
            '4add4239-5aae-4386-bf8d-6402ed69e42b',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'RefundPaymentHeaderID',
            'Refund Payment Header ID',
            'The refund payment issued against this request. Set when the request is Issued.',
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
            'CE97BF15-F7C6-4C50-A744-A89C714A4DDD',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f5d23d2c-af7c-401c-a111-6fbbdb1e7a64' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'IssuedAt')) BEGIN
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
            'f5d23d2c-af7c-401c-a111-6fbbdb1e7a64',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'IssuedAt',
            'Issued At',
            'When the refund was issued.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2f585a2e-c6dd-4fc6-a789-ce4a3bfd0c33' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = '__mj_CreatedAt')) BEGIN
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
            '2f585a2e-c6dd-4fc6-a789-ce4a3bfd0c33',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0af1ccb3-1c8b-4809-986c-7237071a8596' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '0af1ccb3-1c8b-4809-986c-7237071a8596',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
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

/* SQL text to sync entity unique keys (1 added, 0 updated, 0 removed) */
INSERT INTO [${mjSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('90dbf33f-dd9e-4e31-8496-6100cfedfa6f', 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', 'UX_RefundRequest_OpenPerPayment', 'PaymentHeaderID', '([Status] IN (''Requested'', ''Approved''))');

/* SQL text to sync 5 entity field value row(s) for entity field ID F88327F5-0E07-4502-B5C1-D7F50F51B7BE */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('93c78997-308d-4705-82fb-bcdfd995c00b', 'F88327F5-0E07-4502-B5C1-D7F50F51B7BE', 1, 'Approved', 'Approved', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('14a2b494-fb7b-4e76-8e5d-f282be3c42e7', 'F88327F5-0E07-4502-B5C1-D7F50F51B7BE', 2, 'Issued', 'Issued', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('097e9a2a-0f31-42ab-8440-9c30b113a9a9', 'F88327F5-0E07-4502-B5C1-D7F50F51B7BE', 3, 'Rejected', 'Rejected', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9d26423b-1b17-418a-95b5-0f14a3dfb987', 'F88327F5-0E07-4502-B5C1-D7F50F51B7BE', 4, 'Requested', 'Requested', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4fe0f832-e65f-4761-8cbd-cdeb461dc5ca', 'F88327F5-0E07-4502-B5C1-D7F50F51B7BE', 5, 'Withdrawn', 'Withdrawn', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F88327F5-0E07-4502-B5C1-D7F50F51B7BE */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='F88327F5-0E07-4502-B5C1-D7F50F51B7BE';

/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Refund Requests (One To Many via RequestedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '8692e828-ad43-4d6c-a85e-3effcf8e81eb' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND [RelatedEntityJoinField] = 'RequestedByUserID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8692e828-ad43-4d6c-a85e-3effcf8e81eb', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', 'RequestedByUserID', 'One To Many', 1, 1, 166, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Refund Requests (One To Many via DecidedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'bd8d35d9-31bd-42d4-90e9-c3eed4694fea' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND [RelatedEntityJoinField] = 'DecidedByUserID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bd8d35d9-31bd-42d4-90e9-c3eed4694fea', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', 'DecidedByUserID', 'One To Many', 1, 1, 167, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Payment Headers -> MJ_BizApps_Orders: Refund Requests (One To Many via PaymentHeaderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'a76a6740-9be9-4093-9344-e2317eca10a8' OR ([EntityID] = 'CE97BF15-F7C6-4C50-A744-A89C714A4DDD' AND [RelatedEntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND [RelatedEntityJoinField] = 'PaymentHeaderID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a76a6740-9be9-4093-9344-e2317eca10a8', 'CE97BF15-F7C6-4C50-A744-A89C714A4DDD', 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', 'PaymentHeaderID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Orders: Payment Headers -> MJ_BizApps_Orders: Refund Requests (One To Many via RefundPaymentHeaderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'c21444dc-5746-4c0f-ab29-b515bc28f476' OR ([EntityID] = 'CE97BF15-F7C6-4C50-A744-A89C714A4DDD' AND [RelatedEntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND [RelatedEntityJoinField] = 'RefundPaymentHeaderID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c21444dc-5746-4c0f-ab29-b515bc28f476', 'CE97BF15-F7C6-4C50-A744-A89C714A4DDD', 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', 'RefundPaymentHeaderID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Tasks: Tasks -> MJ_BizApps_Orders: Refund Requests (One To Many via ApprovalTaskID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '957a033c-15ca-416c-98e4-c1f7a9097f47' OR ([EntityID] = 'B348FFA2-B1A7-4AC2-B6FD-F4E0C0697466' AND [RelatedEntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND [RelatedEntityJoinField] = 'ApprovalTaskID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('957a033c-15ca-416c-98e4-c1f7a9097f47', 'B348FFA2-B1A7-4AC2-B6FD-F4E0C0697466', 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', 'ApprovalTaskID', 'One To Many', 1, 1, 24, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to update entity field related entity name field map for entity field ID 12CEBCB9-5E73-4B9D-80FD-15CE566CACB1 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='12CEBCB9-5E73-4B9D-80FD-15CE566CACB1', @RelatedEntityNameFieldMap='PaymentHeader';

/* SQL text to update entity field related entity name field map for entity field ID 1F1E28CE-08A5-4D3B-8421-39B89B78BF2F */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1F1E28CE-08A5-4D3B-8421-39B89B78BF2F', @RelatedEntityNameFieldMap='RequestedByUser';

/* SQL text to update entity field related entity name field map for entity field ID AFCF6745-02CD-4D86-AD51-2D2F6E267703 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='AFCF6745-02CD-4D86-AD51-2D2F6E267703', @RelatedEntityNameFieldMap='ApprovalTask';

/* SQL text to update entity field related entity name field map for entity field ID 3A220EA0-5829-41B7-8635-9E9628E4181B */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3A220EA0-5829-41B7-8635-9E9628E4181B', @RelatedEntityNameFieldMap='DecidedByUser';

/* SQL text to update entity field related entity name field map for entity field ID 4ADD4239-5AAE-4386-BF8D-6402ED69E42B */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4ADD4239-5AAE-4386-BF8D-6402ED69E42B', @RelatedEntityNameFieldMap='RefundPaymentHeader';

/* Index for Foreign Keys for RefundRequest */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Refund Requests
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PaymentHeaderID in table RefundRequest
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RefundRequest_PaymentHeaderID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RefundRequest]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RefundRequest]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'PaymentHeaderID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RefundRequest_PaymentHeaderID ON [${flyway:defaultSchema}].[RefundRequest] ([PaymentHeaderID]);

-- Index for foreign key RequestedByUserID in table RefundRequest
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RefundRequest_RequestedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RefundRequest]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RefundRequest]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'RequestedByUserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RefundRequest_RequestedByUserID ON [${flyway:defaultSchema}].[RefundRequest] ([RequestedByUserID]);

-- Index for foreign key ApprovalTaskID in table RefundRequest
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RefundRequest_ApprovalTaskID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RefundRequest]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RefundRequest]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ApprovalTaskID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RefundRequest_ApprovalTaskID ON [${flyway:defaultSchema}].[RefundRequest] ([ApprovalTaskID]);

-- Index for foreign key DecidedByUserID in table RefundRequest
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RefundRequest_DecidedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RefundRequest]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RefundRequest]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'DecidedByUserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RefundRequest_DecidedByUserID ON [${flyway:defaultSchema}].[RefundRequest] ([DecidedByUserID]);

-- Index for foreign key RefundPaymentHeaderID in table RefundRequest
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RefundRequest_RefundPaymentHeaderID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RefundRequest]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RefundRequest]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'RefundPaymentHeaderID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RefundRequest_RefundPaymentHeaderID ON [${flyway:defaultSchema}].[RefundRequest] ([RefundPaymentHeaderID]);

/* Base View SQL for MJ_BizApps_Orders: Refund Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Refund Requests
-- Item: vwRefundRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Refund Requests
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RefundRequest
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRefundRequests]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRefundRequests];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRefundRequests]
AS
SELECT
    r.*,
    mjBizAppsOrdersPaymentHeader_PaymentHeaderID.[PaymentNumber] AS [PaymentHeader],
    MJUser_RequestedByUserID.[Name] AS [RequestedByUser],
    mjBizAppsTasksTask_ApprovalTaskID.[Name] AS [ApprovalTask],
    MJUser_DecidedByUserID.[Name] AS [DecidedByUser],
    mjBizAppsOrdersPaymentHeader_RefundPaymentHeaderID.[PaymentNumber] AS [RefundPaymentHeader]
FROM
    [${flyway:defaultSchema}].[RefundRequest] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentHeader] AS mjBizAppsOrdersPaymentHeader_PaymentHeaderID
  ON
    [r].[PaymentHeaderID] = mjBizAppsOrdersPaymentHeader_PaymentHeaderID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_RequestedByUserID
  ON
    [r].[RequestedByUserID] = MJUser_RequestedByUserID.[ID]
LEFT OUTER JOIN
    [__mj_BizAppsTasks].[Task] AS mjBizAppsTasksTask_ApprovalTaskID
  ON
    [r].[ApprovalTaskID] = mjBizAppsTasksTask_ApprovalTaskID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_DecidedByUserID
  ON
    [r].[DecidedByUserID] = MJUser_DecidedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentHeader] AS mjBizAppsOrdersPaymentHeader_RefundPaymentHeaderID
  ON
    [r].[RefundPaymentHeaderID] = mjBizAppsOrdersPaymentHeader_RefundPaymentHeaderID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRefundRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Refund Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Refund Requests
-- Item: Permissions for vwRefundRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRefundRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Refund Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Refund Requests
-- Item: spCreateRefundRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RefundRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRefundRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRefundRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRefundRequest]
    @ID uniqueidentifier = NULL,
    @PaymentHeaderID uniqueidentifier,
    @Amount decimal(18, 2),
    @Reason nvarchar(1000),
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
    @DecisionNotes nvarchar(1000) = NULL,
    @RefundPaymentHeaderID_Clear bit = 0,
    @RefundPaymentHeaderID uniqueidentifier = NULL,
    @IssuedAt_Clear bit = 0,
    @IssuedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RefundRequest]
            (
                [ID],
                [PaymentHeaderID],
                [Amount],
                [Reason],
                [Status],
                [RequestedByUserID],
                [RequestedAt],
                [ApprovalTaskID],
                [ApprovalTaskRaisedAt],
                [DecidedByUserID],
                [DecidedAt],
                [DecisionNotes],
                [RefundPaymentHeaderID],
                [IssuedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentHeaderID,
                @Amount,
                @Reason,
                ISNULL(@Status, 'Requested'),
                @RequestedByUserID,
                ISNULL(@RequestedAt, sysdatetimeoffset()),
                CASE WHEN @ApprovalTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskID, NULL) END,
                CASE WHEN @ApprovalTaskRaisedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskRaisedAt, NULL) END,
                CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, NULL) END,
                CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, NULL) END,
                CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, NULL) END,
                CASE WHEN @RefundPaymentHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@RefundPaymentHeaderID, NULL) END,
                CASE WHEN @IssuedAt_Clear = 1 THEN NULL ELSE ISNULL(@IssuedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RefundRequest]
            (
                [PaymentHeaderID],
                [Amount],
                [Reason],
                [Status],
                [RequestedByUserID],
                [RequestedAt],
                [ApprovalTaskID],
                [ApprovalTaskRaisedAt],
                [DecidedByUserID],
                [DecidedAt],
                [DecisionNotes],
                [RefundPaymentHeaderID],
                [IssuedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentHeaderID,
                @Amount,
                @Reason,
                ISNULL(@Status, 'Requested'),
                @RequestedByUserID,
                ISNULL(@RequestedAt, sysdatetimeoffset()),
                CASE WHEN @ApprovalTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskID, NULL) END,
                CASE WHEN @ApprovalTaskRaisedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskRaisedAt, NULL) END,
                CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, NULL) END,
                CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, NULL) END,
                CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, NULL) END,
                CASE WHEN @RefundPaymentHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@RefundPaymentHeaderID, NULL) END,
                CASE WHEN @IssuedAt_Clear = 1 THEN NULL ELSE ISNULL(@IssuedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRefundRequests] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRefundRequest] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Refund Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRefundRequest] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Refund Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Refund Requests
-- Item: spUpdateRefundRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RefundRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRefundRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRefundRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRefundRequest]
    @ID uniqueidentifier,
    @PaymentHeaderID uniqueidentifier = NULL,
    @Amount decimal(18, 2) = NULL,
    @Reason nvarchar(1000) = NULL,
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
    @DecisionNotes nvarchar(1000) = NULL,
    @RefundPaymentHeaderID_Clear bit = 0,
    @RefundPaymentHeaderID uniqueidentifier = NULL,
    @IssuedAt_Clear bit = 0,
    @IssuedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RefundRequest]
    SET
        [PaymentHeaderID] = ISNULL(@PaymentHeaderID, [PaymentHeaderID]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [Reason] = ISNULL(@Reason, [Reason]),
        [Status] = ISNULL(@Status, [Status]),
        [RequestedByUserID] = ISNULL(@RequestedByUserID, [RequestedByUserID]),
        [RequestedAt] = ISNULL(@RequestedAt, [RequestedAt]),
        [ApprovalTaskID] = CASE WHEN @ApprovalTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskID, [ApprovalTaskID]) END,
        [ApprovalTaskRaisedAt] = CASE WHEN @ApprovalTaskRaisedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskRaisedAt, [ApprovalTaskRaisedAt]) END,
        [DecidedByUserID] = CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, [DecidedByUserID]) END,
        [DecidedAt] = CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, [DecidedAt]) END,
        [DecisionNotes] = CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, [DecisionNotes]) END,
        [RefundPaymentHeaderID] = CASE WHEN @RefundPaymentHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@RefundPaymentHeaderID, [RefundPaymentHeaderID]) END,
        [IssuedAt] = CASE WHEN @IssuedAt_Clear = 1 THEN NULL ELSE ISNULL(@IssuedAt, [IssuedAt]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRefundRequests] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRefundRequests]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRefundRequest] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RefundRequest table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRefundRequest]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRefundRequest];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRefundRequest
ON [${flyway:defaultSchema}].[RefundRequest]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[RefundRequest]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[RefundRequest] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Refund Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRefundRequest] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Refund Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Refund Requests
-- Item: spDeleteRefundRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RefundRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRefundRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRefundRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRefundRequest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RefundRequest]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRefundRequest] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Refund Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRefundRequest] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 5 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'df07f90c-c1f0-4525-9877-f6f051eed8e0' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'PaymentHeader')) BEGIN
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
            'df07f90c-c1f0-4525-9877-f6f051eed8e0',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'PaymentHeader',
            'Payment Header',
            NULL,
            'nvarchar',
            80,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ae2e1e40-493b-49cc-bc73-55bfe489af8d' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'RequestedByUser')) BEGIN
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
            'ae2e1e40-493b-49cc-bc73-55bfe489af8d',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'RequestedByUser',
            'Requested By User',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2a208a56-a701-4fca-951b-0ee9b2d1cd57' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'ApprovalTask')) BEGIN
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
            '2a208a56-a701-4fca-951b-0ee9b2d1cd57',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ae08488d-159e-4c95-bdc7-86d86dbc5b05' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'DecidedByUser')) BEGIN
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
            'ae08488d-159e-4c95-bdc7-86d86dbc5b05',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b5ce348f-dc66-4812-9f62-ac143f18f17e' OR (EntityID = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND Name = 'RefundPaymentHeader')) BEGIN
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
            'b5ce348f-dc66-4812-9f62-ac143f18f17e',
            'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', -- Entity: MJ_BizApps_Orders: Refund Requests
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7'),
            'RefundPaymentHeader',
            'Refund Payment Header',
            NULL,
            'nvarchar',
            80,
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

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '92028FBA-CD3B-4601-994A-5C3D39466020'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AE2E1E40-493B-49CC-BC73-55BFE489AF8D'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 21 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Refund Request Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BCEB5F20-CE62-4773-9BB9-102BF5B1616C';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.PaymentHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Refund Request Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Payment Header'
WHERE 
   ID = '12CEBCB9-5E73-4B9D-80FD-15CE566CACB1';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.Amount 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Refund Request Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2A3B2BB0-0496-486B-B9FC-FCFDC06BE43D';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.Reason 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Refund Request Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A1C2BC58-5290-42AD-83CE-513C47EB0B97';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Refund Request Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F88327F5-0E07-4502-B5C1-D7F50F51B7BE';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.RequestedByUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Refund Request Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requested By User'
WHERE 
   ID = '1F1E28CE-08A5-4D3B-8421-39B89B78BF2F';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.RequestedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Refund Request Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '92028FBA-CD3B-4601-994A-5C3D39466020';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.PaymentHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Refund Request Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Payment Header Details'
WHERE 
   ID = 'DF07F90C-C1F0-4525-9877-F6F051EED8E0';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.RequestedByUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Refund Request Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requested By User Details'
WHERE 
   ID = 'AE2E1E40-493B-49CC-BC73-55BFE489AF8D';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.ApprovalTaskID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Approval Workflow',
   GeneratedFormSection = 'Category',
   DisplayName = 'Approval Task'
WHERE 
   ID = 'AFCF6745-02CD-4D86-AD51-2D2F6E267703';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.ApprovalTaskRaisedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Approval Workflow',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FC654EE9-ECF9-4896-8335-5E03F1DE9EF8';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.DecidedByUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Approval Workflow',
   GeneratedFormSection = 'Category',
   DisplayName = 'Decided By User'
WHERE 
   ID = '3A220EA0-5829-41B7-8635-9E9628E4181B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.DecidedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Approval Workflow',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ECAC464A-8701-4D41-805E-F2BA64F4919B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.DecisionNotes 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Approval Workflow',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '620F771E-5697-486B-A02B-0C436FCFEBA8';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.ApprovalTask 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Approval Workflow',
   GeneratedFormSection = 'Category',
   DisplayName = 'Approval Task Details'
WHERE 
   ID = '2A208A56-A701-4FCA-951B-0EE9B2D1CD57';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.DecidedByUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Approval Workflow',
   GeneratedFormSection = 'Category',
   DisplayName = 'Decided By User Details'
WHERE 
   ID = 'AE08488D-159E-4C95-BDC7-86D86DBC5B05';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.RefundPaymentHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Issuance and Fulfillment',
   GeneratedFormSection = 'Category',
   DisplayName = 'Refund Payment Header'
WHERE 
   ID = '4ADD4239-5AAE-4386-BF8D-6402ED69E42B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.IssuedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Issuance and Fulfillment',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F5D23D2C-AF7C-401C-A111-6FBBDB1E7A64';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.RefundPaymentHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Issuance and Fulfillment',
   GeneratedFormSection = 'Category',
   DisplayName = 'Refund Payment Header Details'
WHERE 
   ID = 'B5CE348F-DC66-4812-9F62-AC143F18F17E';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2F585A2E-C6DD-4FC6-A789-CE4A3BFD0C33';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Refund Requests.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0AF1CCB3-1C8B-4809-986C-7237071A8596';

/* Set entity icon to fa fa-undo */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-undo', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a134c615-4a4f-59bd-9ffd-d50db78290cd', 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', 'FieldCategoryInfo', '{
  "Approval Workflow": {
    "description": "Task approval tracking, decision notes, and approval history",
    "icon": "fa fa-tasks"
  },
  "Issuance and Fulfillment": {
    "description": "Details regarding the actual issuance and fulfillment of the refund payment",
    "icon": "fa fa-check-circle"
  },
  "Refund Request Details": {
    "description": "Core refund request information including amount, reason, and requester details",
    "icon": "fa fa-file-invoice-dollar"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('54157806-91ac-5689-abaa-0bed31b43b81', 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7', 'FieldCategoryIcons', '{
  "Approval Workflow": "fa fa-tasks",
  "Issuance and Fulfillment": "fa fa-check-circle",
  "Refund Request Details": "fa fa-file-invoice-dollar",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7';

/* Generated Validation Functions for MJ_BizApps_Orders: Refund Requests */
-- CHECK constraint for MJ_BizApps_Orders: Refund Requests: Field: Amount was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '2A3B2BB0-0496-486B-B9FC-FCFDC06BE43D'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('8322a02d-9067-4ea4-a08a-31c1bfa2d5ef', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '([Amount]>(0))', 'public ValidateAmountGreaterThanZero(result: ValidationResult) {
	if (this.Amount != null && this.Amount <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Amount",
			"Amount must be greater than zero.",
			this.Amount,
			ValidationErrorType.Failure
		));
	}
}', 'Refund amount must be greater than zero.', 'ValidateAmountGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '2A3B2BB0-0496-486B-B9FC-FCFDC06BE43D')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Refund Requests: Field: Reason was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'A1C2BC58-5290-42AD-83CE-513C47EB0B97'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('49cd3477-3e77-4489-bc8e-0203770f0f65', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '(len(ltrim(rtrim([Reason])))>(0))', '	public ValidateReasonNotEmpty(result: ValidationResult) {
		if (this.Reason == null || this.Reason.trim().length === 0) {
			result.Errors.push(new ValidationErrorInfo(
				"Reason",
				"Reason cannot be blank or contain only whitespace.",
				this.Reason,
				ValidationErrorType.Failure
			));
		}
	}', 'Reason must not be empty or consist only of whitespace characters.', 'ValidateReasonNotEmpty', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'A1C2BC58-5290-42AD-83CE-513C47EB0B97')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Refund Requests @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND [Name] = 'ValidateApprovalTaskIDAndApprovalTaskRaisedAt'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('ef798f2d-75b6-4279-9245-d45e30446a10', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '([ApprovalTaskID] IS NULL AND [ApprovalTaskRaisedAt] IS NULL OR [ApprovalTaskID] IS NOT NULL AND [ApprovalTaskRaisedAt] IS NOT NULL)', 'public ValidateApprovalTaskIDAndApprovalTaskRaisedAt(result: ValidationResult) {
	const hasTaskID = this.ApprovalTaskID != null;
	const hasRaisedAt = this.ApprovalTaskRaisedAt != null;

	if (hasTaskID !== hasRaisedAt) {
		result.Errors.push(new ValidationErrorInfo(
			"ApprovalTaskID",
			"Approval Task ID and Approval Task Raised At must either both be set or both be empty.",
			this.ApprovalTaskID,
			ValidationErrorType.Failure
		));
	}
}', 'Approval task ID and approval task raised date must either both be provided or both be empty.', 'ValidateApprovalTaskIDAndApprovalTaskRaisedAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Refund Requests @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND [Name] = 'ValidateRefundIssuedFields'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('f80d6ecb-bf86-49fe-b34f-cdd24f0e88f4', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '([Status]=''Issued'' AND [RefundPaymentHeaderID] IS NOT NULL AND [IssuedAt] IS NOT NULL OR [Status]<>''Issued'' AND [RefundPaymentHeaderID] IS NULL AND [IssuedAt] IS NULL)', 'public ValidateRefundIssuedFields(result: ValidationResult): void {
	const isIssued = this.Status === ''Issued'';
	const hasRefundPaymentHeaderID = this.RefundPaymentHeaderID != null;
	const hasIssuedAt = this.IssuedAt != null;

	if (isIssued) {
		if (!hasRefundPaymentHeaderID || !hasIssuedAt) {
			result.Errors.push(new ValidationErrorInfo(
				"Status",
				"Refunds with status ''Issued'' must include both a Refund Payment Header ID and an Issued At timestamp.",
				this.Status,
				ValidationErrorType.Failure
			));
		}
	} else {
		if (hasRefundPaymentHeaderID || hasIssuedAt) {
			result.Errors.push(new ValidationErrorInfo(
				"Status",
				"Refund Payment Header ID and Issued At timestamp must only be set when the refund status is ''Issued''.",
				this.Status,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Refunds marked with a status of ''Issued'' must have both a refund payment header ID and an issued timestamp, while refunds in any other status cannot have either of these values set.', 'ValidateRefundIssuedFields', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Refund Requests @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7' AND [Name] = 'ValidateStatusDecisionDetails'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('755c463b-d58b-4db4-a357-43db79c0154b', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '([Status]=''Requested'' AND [DecidedByUserID] IS NULL AND [DecidedAt] IS NULL OR [Status]=''Withdrawn'' AND [DecidedAt] IS NOT NULL OR ([Status]=''Issued'' OR [Status]=''Rejected'' OR [Status]=''Approved'') AND [DecidedByUserID] IS NOT NULL AND [DecidedAt] IS NOT NULL)', 'public ValidateStatusDecisionDetails(result: ValidationResult) {
	if (this.Status == null) {
		return;
	}

	const isRequested = this.Status === ''Requested'' && this.DecidedByUserID == null && this.DecidedAt == null;
	const isWithdrawn = this.Status === ''Withdrawn'' && this.DecidedAt != null;
	const isDecided = (this.Status === ''Issued'' || this.Status === ''Rejected'' || this.Status === ''Approved'') &&
		this.DecidedByUserID != null &&
		this.DecidedAt != null;

	if (!isRequested && !isWithdrawn && !isDecided) {
		result.Errors.push(new ValidationErrorInfo(
			"Status",
			"Decision details must match the status: ''Requested'' requires no decision info, ''Withdrawn'' requires a decision date, and ''Issued'', ''Rejected'', or ''Approved'' require both a deciding user and decision date.",
			this.Status,
			ValidationErrorType.Failure
		));
	}
}', 'Ensures decision details match the refund status: Requested items cannot have decision details, Withdrawn items must include a decision date, and Issued, Rejected, or Approved items must include both the deciding user and decision date.', 'ValidateStatusDecisionDetails', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E9ACA8AB-5EF2-491F-B801-34B6AF03FCE7')
   END;
