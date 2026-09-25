-- =============================================================================
-- V202609252200 — Concession guardrails: value a concession however it is delivered
-- (bc-aidp-next-golive#222)
-- =============================================================================
-- The sales guardrails valued a concession only as a percentage off price. A
-- concession delivered as added duration, added seats or an added product at no
-- charge computes to 0% and cleared every check, while the same value taken as a
-- price reduction escalated.
--
-- What this file does, in order:
--   1. SalesAuthority gains two non-percentage limits: an absolute concession value
--      and a term-extension length.
--   2. SalesRule.RuleType gains 'ConcessionLimit' — the rule naming the role that
--      may approve a concession outside a rep's authority.
--   3. OrderConcession — one row per concession, carrying its computed value, the
--      form it was delivered in, why it was granted, and the approval decision.
--      An order may not be confirmed, and its documents may not be sent, while a
--      concession on it is Pending.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SalesAuthority: limits a percentage cannot express
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[SalesAuthority] ADD
    [MaxConcessionValue]   DECIMAL(18,2) NULL
        CONSTRAINT [CK_SalesAuthority_MaxConcessionValue] CHECK ([MaxConcessionValue] >= 0),
    [MaxTermExtensionDays] INT           NULL
        CONSTRAINT [CK_SalesAuthority_MaxTermExtensionDays] CHECK ([MaxTermExtensionDays] >= 0);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Largest concession value, in currency, this rep may grant unaided, whatever form it takes. For a manual discount NULL leaves only MaxDiscountPct in force; for a concession delivered as duration, seats or scope NULL means no authority, so it goes to approval.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesAuthority',
    @level2type = N'COLUMN', @level2name = N'MaxConcessionValue';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Term extension, in days, at or above which a no-charge extension needs approval; shorter ones this rep may grant unaided. NULL means no authority to extend, so every extension goes to approval.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesAuthority',
    @level2type = N'COLUMN', @level2name = N'MaxTermExtensionDays';
GO

-- -----------------------------------------------------------------------------
-- 2. SalesRule.RuleType: ConcessionLimit
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[SalesRule] DROP CONSTRAINT [CK_SalesRule_RuleType];
GO

ALTER TABLE [${flyway:defaultSchema}].[SalesRule] ADD CONSTRAINT [CK_SalesRule_RuleType]
    CHECK ([RuleType] IN ('DiscountLimit','ConcessionLimit','PaymentTermsRequired','ProductAuthorization','CreditLimit','Custom'));
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'DiscountLimit | ConcessionLimit | PaymentTermsRequired | ProductAuthorization | CreditLimit | Custom. ConcessionLimit names the role that approves a concession outside a rep''s SalesAuthority.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesRule',
    @level2type = N'COLUMN', @level2name = N'RuleType';
GO

-- -----------------------------------------------------------------------------
-- 3. OrderConcession
-- -----------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[OrderConcession] (
    [ID]                           UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_OrderConcession_ID] DEFAULT (newsequentialid()),
    [OrderHeaderID]                UNIQUEIDENTIFIER NOT NULL,
    -- What the concession attaches to. A price, scope or seat concession names a line; a
    -- duration concession names the term it extends.
    [OrderLineID]                  UNIQUEIDENTIFIER NULL,
    [SubscriptionTermID]           UNIQUEIDENTIFIER NULL,
    [DeliveryForm]                 NVARCHAR(20)     NOT NULL,
    [ReasonCategory]               NVARCHAR(20)     NOT NULL,
    [Reason]                       NVARCHAR(MAX)    NOT NULL,
    -- The quantity given away, in the unit of its form. Duration: days. Seats: quantity.
    -- Price and Scope carry neither; their value comes from the line's price.
    [AddedDays]                    INT              NULL,
    [AddedQuantity]                DECIMAL(18,4)    NULL,
    -- Computed server-side at the arrangement's own rate, never authored.
    [ComputedValue]                DECIMAL(18,2)    NOT NULL,
    [Status]                       NVARCHAR(20)     NOT NULL CONSTRAINT [DF_OrderConcession_Status] DEFAULT (N'Pending'),
    [RequestedByUserID]            UNIQUEIDENTIFIER NOT NULL,
    -- Set when the requester's own authority covered the concession.
    [AuthorizedBySalesAuthorityID] UNIQUEIDENTIFIER NULL,
    -- Set when the concession needed approval: the rule whose role decides it.
    [SalesRuleID]                  UNIQUEIDENTIFIER NULL,
    [DecidedByUserID]              UNIQUEIDENTIFIER NULL,
    [DecidedAt]                    DATETIMEOFFSET   NULL,
    [DecisionNotes]                NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_OrderConcession] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_OrderConcession_OrderHeader] FOREIGN KEY ([OrderHeaderID])
        REFERENCES [${flyway:defaultSchema}].[OrderHeader]([ID]),
    CONSTRAINT [FK_OrderConcession_OrderLine] FOREIGN KEY ([OrderLineID])
        REFERENCES [${flyway:defaultSchema}].[OrderLine]([ID]),
    CONSTRAINT [FK_OrderConcession_SubscriptionTerm] FOREIGN KEY ([SubscriptionTermID])
        REFERENCES [${flyway:defaultSchema}].[SubscriptionTerm]([ID]),
    CONSTRAINT [FK_OrderConcession_RequestedByUser] FOREIGN KEY ([RequestedByUserID])
        REFERENCES [__mj].[User]([ID]),
    CONSTRAINT [FK_OrderConcession_SalesAuthority] FOREIGN KEY ([AuthorizedBySalesAuthorityID])
        REFERENCES [${flyway:defaultSchema}].[SalesAuthority]([ID]),
    CONSTRAINT [FK_OrderConcession_SalesRule] FOREIGN KEY ([SalesRuleID])
        REFERENCES [${flyway:defaultSchema}].[SalesRule]([ID]),
    CONSTRAINT [FK_OrderConcession_DecidedByUser] FOREIGN KEY ([DecidedByUserID])
        REFERENCES [__mj].[User]([ID]),
    CONSTRAINT [CK_OrderConcession_DeliveryForm] CHECK ([DeliveryForm] IN ('Price','Duration','Scope','Seats')),
    CONSTRAINT [CK_OrderConcession_ReasonCategory] CHECK ([ReasonCategory] IN ('Retention','Referral','Other')),
    CONSTRAINT [CK_OrderConcession_Status] CHECK ([Status] IN ('Pending','Approved','Rejected')),
    CONSTRAINT [CK_OrderConcession_ComputedValue] CHECK ([ComputedValue] >= 0),
    CONSTRAINT [CK_OrderConcession_Duration] CHECK ([DeliveryForm] <> 'Duration' OR ([SubscriptionTermID] IS NOT NULL AND [AddedDays] > 0)),
    CONSTRAINT [CK_OrderConcession_Seats] CHECK ([DeliveryForm] <> 'Seats' OR ([OrderLineID] IS NOT NULL AND [AddedQuantity] > 0)),
    CONSTRAINT [CK_OrderConcession_LineForm] CHECK ([DeliveryForm] NOT IN ('Price','Scope') OR [OrderLineID] IS NOT NULL),
    CONSTRAINT [CK_OrderConcession_Decision] CHECK ([Status] = 'Pending' OR ([DecidedByUserID] IS NOT NULL AND [DecidedAt] IS NOT NULL))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A concession granted on an order, valued the same way whatever form it takes: a price reduction, a term extended at no charge, seats or a product added at no charge. Within the requester''s SalesAuthority it is Approved on save; outside it, Pending until a holder of the ConcessionLimit rule''s role decides it. An order with a Pending concession cannot be confirmed and its documents cannot be sent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The order the concession is granted on. For a term extension, the order whose line bought the term.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'OrderHeaderID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The line a Price, Scope or Seats concession applies to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'OrderLineID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The subscription term a Duration concession extends.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'SubscriptionTermID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How the value was given: Price (a lower price than the price engine''s), Duration (a term extended at no charge), Scope (a product added at no charge), Seats (quantity added at no charge).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'DeliveryForm';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Why it was granted: Retention, Referral or Other. Retention concessions and referral credits have different economics and are reported separately.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'ReasonCategory';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The requester''s explanation of the concession.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'Reason';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Days added to the term at no charge. Required for Duration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'AddedDays';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Quantity added to the line at no charge. Required for Seats.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'AddedQuantity';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'What the concession is worth, in currency, at the arrangement''s own rate. Computed on save from the line or term; never authored.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'ComputedValue';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Pending | Approved | Rejected. Set to Approved on save when the requester''s SalesAuthority covers the concession; otherwise decided by a holder of the ConcessionLimit rule''s role.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user who recorded the concession. Their SalesAuthority is what it is checked against.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'RequestedByUserID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The SalesAuthority that covered the concession when it was approved without escalation. Stamped so a later change to the limit does not change how past concessions read.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'AuthorizedBySalesAuthorityID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The ConcessionLimit rule whose role must decide this concession. Set when it exceeded the requester''s authority.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'SalesRuleID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Who approved or rejected it. For a concession within the requester''s authority, the requester.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'DecidedByUserID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When it was approved or rejected.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'DecidedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The approver''s note on the decision.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'DecisionNotes';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above: the Order Concessions entity
-- (entity + field metadata, value lists, relationships, vwOrderConcessions, CRUD
-- procs, permissions) and the regenerated Sales Authorities view and procs for its
-- two new columns. Carved from the run: blocks for entities this change does not
-- touch were dropped. Every EntityField Sequence is an apply-time MAX(Sequence)+1
-- rather than CodeGen's literal, and the +100000 bump blocks are removed with them.
-- =============================================================================


/* SQL generated to create new entity MJ_BizApps_Orders: Order Concessions */

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
         '0e13e45b-0ff1-4b09-8919-ce576829e178',
         'MJ_BizApps_Orders: Order Concessions',
         'Order Concessions',
         'A concession granted on an order, valued the same way whatever form it takes: a price reduction, a term extended at no charge, seats or a product added at no charge. Within the requester''s SalesAuthority it is Approved on save; outside it, Pending until a holder of the ConcessionLimit rule''s role decides it. An order with a Pending concession cannot be confirmed and its documents cannot be sent.',
         NULL,
         'OrderConcession',
         'vwOrderConcessions',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Order Concessions to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '0e13e45b-0ff1-4b09-8919-ce576829e178', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Concessions for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0e13e45b-0ff1-4b09-8919-ce576829e178', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Concessions for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0e13e45b-0ff1-4b09-8919-ce576829e178', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Concessions for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0e13e45b-0ff1-4b09-8919-ce576829e178', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderConcession */
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderConcession */
UPDATE [${flyway:defaultSchema}].[OrderConcession] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderConcession */
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderConcession */
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD CONSTRAINT [DF___mj_BizAppsOrders_OrderConcession___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderConcession */
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderConcession */
UPDATE [${flyway:defaultSchema}].[OrderConcession] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderConcession */
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderConcession */
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD CONSTRAINT [DF___mj_BizAppsOrders_OrderConcession___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 27 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '20e2a800-fc7a-4a79-8d16-df9646f13b1e' OR (EntityID = '29E748BF-E356-4AC1-BCE5-71E05279BAF8' AND Name = 'MaxConcessionValue')) BEGIN
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
            '20e2a800-fc7a-4a79-8d16-df9646f13b1e',
            '29E748BF-E356-4AC1-BCE5-71E05279BAF8', -- Entity: MJ_BizApps_Orders: Sales Authorities
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '29E748BF-E356-4AC1-BCE5-71E05279BAF8'),
            'MaxConcessionValue',
            'Max Concession Value',
            'Largest concession value, in currency, this rep may grant unaided, whatever form it takes. For a manual discount NULL leaves only MaxDiscountPct in force; for a concession delivered as duration, seats or scope NULL means no authority, so it goes to approval.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b7b46b1e-48dd-409e-8c4b-2549c02db7eb' OR (EntityID = '29E748BF-E356-4AC1-BCE5-71E05279BAF8' AND Name = 'MaxTermExtensionDays')) BEGIN
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
            'b7b46b1e-48dd-409e-8c4b-2549c02db7eb',
            '29E748BF-E356-4AC1-BCE5-71E05279BAF8', -- Entity: MJ_BizApps_Orders: Sales Authorities
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '29E748BF-E356-4AC1-BCE5-71E05279BAF8'),
            'MaxTermExtensionDays',
            'Max Term Extension Days',
            'Term extension, in days, at or above which a no-charge extension needs approval; shorter ones this rep may grant unaided. NULL means no authority to extend, so every extension goes to approval.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a20c25aa-d978-4cef-8b27-95682245805c' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'ID')) BEGIN
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
            'a20c25aa-d978-4cef-8b27-95682245805c',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '38bdc9f4-c2cc-4b06-9b54-31e4d47d84a8' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'OrderHeaderID')) BEGIN
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
            '38bdc9f4-c2cc-4b06-9b54-31e4d47d84a8',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'OrderHeaderID',
            'Order Header ID',
            'The order the concession is granted on. For a term extension, the order whose line bought the term.',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5bbed478-d09f-4f61-9dd2-8da443e62b23' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'OrderLineID')) BEGIN
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
            '5bbed478-d09f-4f61-9dd2-8da443e62b23',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'OrderLineID',
            'Order Line ID',
            'The line a Price, Scope or Seats concession applies to.',
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
            '66D82C24-9C9F-4CD6-B019-53C20274AB00',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4822fa36-4d5e-4059-8965-75701665aba4' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'SubscriptionTermID')) BEGIN
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
            '4822fa36-4d5e-4059-8965-75701665aba4',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'SubscriptionTermID',
            'Subscription Term ID',
            'The subscription term a Duration concession extends.',
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
            '22E31028-E862-424B-8C10-C167B2C9E304',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8662a268-9580-42fd-9d59-a91be9237ae9' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'DeliveryForm')) BEGIN
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
            '8662a268-9580-42fd-9d59-a91be9237ae9',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'DeliveryForm',
            'Delivery Form',
            'How the value was given: Price (a lower price than the price engine''s), Duration (a term extended at no charge), Scope (a product added at no charge), Seats (quantity added at no charge).',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '44330a58-eac2-4b6b-a834-f5c3e33bc8f2' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'ReasonCategory')) BEGIN
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
            '44330a58-eac2-4b6b-a834-f5c3e33bc8f2',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'ReasonCategory',
            'Reason Category',
            'Why it was granted: Retention, Referral or Other. Retention concessions and referral credits have different economics and are reported separately.',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3ea93a46-41b8-49c6-9e42-d6f3f881864a' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'Reason')) BEGIN
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
            '3ea93a46-41b8-49c6-9e42-d6f3f881864a',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'Reason',
            'Reason',
            'The requester''s explanation of the concession.',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '33e5fc7d-f200-44e6-80d0-ad4a023e157d' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'AddedDays')) BEGIN
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
            '33e5fc7d-f200-44e6-80d0-ad4a023e157d',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'AddedDays',
            'Added Days',
            'Days added to the term at no charge. Required for Duration.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c9119347-63b2-4f71-a984-267b47819349' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'AddedQuantity')) BEGIN
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
            'c9119347-63b2-4f71-a984-267b47819349',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'AddedQuantity',
            'Added Quantity',
            'Quantity added to the line at no charge. Required for Seats.',
            'decimal',
            9,
            18,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '69edf4f8-647f-439a-a1e6-78ceb645864f' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'ComputedValue')) BEGIN
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
            '69edf4f8-647f-439a-a1e6-78ceb645864f',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'ComputedValue',
            'Computed Value',
            'What the concession is worth, in currency, at the arrangement''s own rate. Computed on save from the line or term; never authored.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3c5f69b5-ead0-4b19-8b1b-dc59c4917f88' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'Status')) BEGIN
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
            '3c5f69b5-ead0-4b19-8b1b-dc59c4917f88',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'Status',
            'Status',
            'Pending | Approved | Rejected. Set to Approved on save when the requester''s SalesAuthority covers the concession; otherwise decided by a holder of the ConcessionLimit rule''s role.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3322e8da-ce42-4dee-b1d1-d2d3d1dd5f4e' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'RequestedByUserID')) BEGIN
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
            '3322e8da-ce42-4dee-b1d1-d2d3d1dd5f4e',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'RequestedByUserID',
            'Requested By User ID',
            'The user who recorded the concession. Their SalesAuthority is what it is checked against.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8076f38d-b3c5-4569-a233-489be654b4de' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'AuthorizedBySalesAuthorityID')) BEGIN
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
            '8076f38d-b3c5-4569-a233-489be654b4de',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'AuthorizedBySalesAuthorityID',
            'Authorized By Sales Authority ID',
            'The SalesAuthority that covered the concession when it was approved without escalation. Stamped so a later change to the limit does not change how past concessions read.',
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
            '29E748BF-E356-4AC1-BCE5-71E05279BAF8',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a2695b8d-7876-4e77-a6ea-55e0be5d1f21' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'SalesRuleID')) BEGIN
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
            'a2695b8d-7876-4e77-a6ea-55e0be5d1f21',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'SalesRuleID',
            'Sales Rule ID',
            'The ConcessionLimit rule whose role must decide this concession. Set when it exceeded the requester''s authority.',
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
            '389EA03A-52CC-4BCA-859C-82356777E76E',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2929259e-016a-4f0d-a2da-85ce8166bdcc' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'DecidedByUserID')) BEGIN
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
            '2929259e-016a-4f0d-a2da-85ce8166bdcc',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'DecidedByUserID',
            'Decided By User ID',
            'Who approved or rejected it. For a concession within the requester''s authority, the requester.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '23307600-c415-40d2-a972-fdbdf821b325' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'DecidedAt')) BEGIN
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
            '23307600-c415-40d2-a972-fdbdf821b325',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'DecidedAt',
            'Decided At',
            'When it was approved or rejected.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '011a8539-4724-4317-9ab8-006210b86154' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'DecisionNotes')) BEGIN
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
            '011a8539-4724-4317-9ab8-006210b86154',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'DecisionNotes',
            'Decision Notes',
            'The approver''s note on the decision.',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '84ab78e4-2b31-4bc9-bc1e-2965c533e7a0' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = '__mj_CreatedAt')) BEGIN
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
            '84ab78e4-2b31-4bc9-bc1e-2965c533e7a0',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c186a0b6-8272-46cd-8bf0-98628e965d5b' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'c186a0b6-8272-46cd-8bf0-98628e965d5b',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
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

/* SQL text to insert entity field value with ID 1292e72d-7fde-4fcd-9554-beb7bcba5817 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1292e72d-7fde-4fcd-9554-beb7bcba5817', '0A5E5AD8-EE0A-461B-A63D-987D7A3D8334', 1, 'ConcessionLimit', 'ConcessionLimit', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=2 WHERE ID='F37EDBEA-26CD-4370-872D-BA4FF692D622';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=3 WHERE ID='9C5839D0-AB1F-4788-B819-A6C647A5979A';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='EFE755DE-057A-4F16-8234-B3C5400EC12B';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='A3E5EFA9-D550-48ED-8099-2B199385FD4A';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=6 WHERE ID='6A07B005-0DBE-4B33-914D-ABAEB08949B6';

/* SQL text to insert entity field value with ID a12c2ade-22d4-4e99-b024-ccacc28a7564 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a12c2ade-22d4-4e99-b024-ccacc28a7564', '8662A268-9580-42FD-9D59-A91BE9237AE9', 1, 'Duration', 'Duration', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fb0399f6-33ca-4006-840e-c202b721b0bf */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fb0399f6-33ca-4006-840e-c202b721b0bf', '8662A268-9580-42FD-9D59-A91BE9237AE9', 2, 'Price', 'Price', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5a689ebd-c723-459e-be1d-db41b9564235 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5a689ebd-c723-459e-be1d-db41b9564235', '8662A268-9580-42FD-9D59-A91BE9237AE9', 3, 'Scope', 'Scope', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 23446e44-984c-4f67-9e2c-0bc35982741e */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('23446e44-984c-4f67-9e2c-0bc35982741e', '8662A268-9580-42FD-9D59-A91BE9237AE9', 4, 'Seats', 'Seats', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 8662A268-9580-42FD-9D59-A91BE9237AE9 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='8662A268-9580-42FD-9D59-A91BE9237AE9';

/* SQL text to insert entity field value with ID 078f1818-ddac-4b38-990e-c07589ac37fe */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('078f1818-ddac-4b38-990e-c07589ac37fe', '44330A58-EAC2-4B6B-A834-F5C3E33BC8F2', 1, 'Other', 'Other', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2aaa6755-5100-4990-8292-75ce81e0f2f0 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2aaa6755-5100-4990-8292-75ce81e0f2f0', '44330A58-EAC2-4B6B-A834-F5C3E33BC8F2', 2, 'Referral', 'Referral', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6cbb848e-a1b2-4d67-8947-32eb7adc9205 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6cbb848e-a1b2-4d67-8947-32eb7adc9205', '44330A58-EAC2-4B6B-A834-F5C3E33BC8F2', 3, 'Retention', 'Retention', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 44330A58-EAC2-4B6B-A834-F5C3E33BC8F2 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='44330A58-EAC2-4B6B-A834-F5C3E33BC8F2';

/* SQL text to insert entity field value with ID 554933d1-9c03-42cd-b5d6-98d78a62d5af */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('554933d1-9c03-42cd-b5d6-98d78a62d5af', '3C5F69B5-EAD0-4B19-8B1B-DC59C4917F88', 1, 'Approved', 'Approved', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fa054729-111e-4906-9acc-f1e3f88348ab */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fa054729-111e-4906-9acc-f1e3f88348ab', '3C5F69B5-EAD0-4B19-8B1B-DC59C4917F88', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 03f97b27-bb34-436b-987a-3735f8c71d53 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('03f97b27-bb34-436b-987a-3735f8c71d53', '3C5F69B5-EAD0-4B19-8B1B-DC59C4917F88', 3, 'Rejected', 'Rejected', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3C5F69B5-EAD0-4B19-8B1B-DC59C4917F88 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='3C5F69B5-EAD0-4B19-8B1B-DC59C4917F88';

/* Create Entity Relationship: MJ_BizApps_Orders: Order Headers -> MJ_BizApps_Orders: Order Concessions (One To Many via OrderHeaderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '0870e190-c76a-4270-affb-ec652050f605'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0870e190-c76a-4270-affb-ec652050f605', 'FC529BC8-FF09-44A9-B454-26EAFDAC791B', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'OrderHeaderID', 'One To Many', 1, 1, 12, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Order Lines -> MJ_BizApps_Orders: Order Concessions (One To Many via OrderLineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '91ac9aee-b70a-4498-b0f4-8d2608895a91'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('91ac9aee-b70a-4498-b0f4-8d2608895a91', '66D82C24-9C9F-4CD6-B019-53C20274AB00', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'OrderLineID', 'One To Many', 1, 1, 14, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Order Concessions (One To Many via RequestedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '6ce17cb3-5619-42f9-830b-65911dcbdfdd'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6ce17cb3-5619-42f9-830b-65911dcbdfdd', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'RequestedByUserID', 'One To Many', 1, 1, 118, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Order Concessions (One To Many via DecidedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '4b6e633f-f571-4ede-9ab6-ba62e18f99fd'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4b6e633f-f571-4ede-9ab6-ba62e18f99fd', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'DecidedByUserID', 'One To Many', 1, 1, 119, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Sales Authorities -> MJ_BizApps_Orders: Order Concessions (One To Many via AuthorizedBySalesAuthorityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '66927745-6214-4719-9347-05a02ed97be7'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('66927745-6214-4719-9347-05a02ed97be7', '29E748BF-E356-4AC1-BCE5-71E05279BAF8', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'AuthorizedBySalesAuthorityID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Sales Rules -> MJ_BizApps_Orders: Order Concessions (One To Many via SalesRuleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '8d644b18-5408-451b-998e-4fc1f17c7173'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8d644b18-5408-451b-998e-4fc1f17c7173', '389EA03A-52CC-4BCA-859C-82356777E76E', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'SalesRuleID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Subscription Terms -> MJ_BizApps_Orders: Order Concessions (One To Many via SubscriptionTermID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'a9314383-16cc-4c05-8e45-1a23e949889d'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a9314383-16cc-4c05-8e45-1a23e949889d', '22E31028-E862-424B-8C10-C167B2C9E304', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'SubscriptionTermID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for OrderConcession */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderHeaderID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_OrderHeaderID ON [${flyway:defaultSchema}].[OrderConcession] ([OrderHeaderID]);

-- Index for foreign key OrderLineID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_OrderLineID ON [${flyway:defaultSchema}].[OrderConcession] ([OrderLineID]);

-- Index for foreign key SubscriptionTermID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_SubscriptionTermID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_SubscriptionTermID ON [${flyway:defaultSchema}].[OrderConcession] ([SubscriptionTermID]);

-- Index for foreign key RequestedByUserID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_RequestedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_RequestedByUserID ON [${flyway:defaultSchema}].[OrderConcession] ([RequestedByUserID]);

-- Index for foreign key AuthorizedBySalesAuthorityID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_AuthorizedBySalesAuthorityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_AuthorizedBySalesAuthorityID ON [${flyway:defaultSchema}].[OrderConcession] ([AuthorizedBySalesAuthorityID]);

-- Index for foreign key SalesRuleID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_SalesRuleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_SalesRuleID ON [${flyway:defaultSchema}].[OrderConcession] ([SalesRuleID]);

-- Index for foreign key DecidedByUserID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_DecidedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_DecidedByUserID ON [${flyway:defaultSchema}].[OrderConcession] ([DecidedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 38BDC9F4-C2CC-4B06-9B54-31E4D47D84A8 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='38BDC9F4-C2CC-4B06-9B54-31E4D47D84A8', @RelatedEntityNameFieldMap='OrderHeader';

/* SQL text to update entity field related entity name field map for entity field ID 3322E8DA-CE42-4DEE-B1D1-D2D3D1DD5F4E */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3322E8DA-CE42-4DEE-B1D1-D2D3D1DD5F4E', @RelatedEntityNameFieldMap='RequestedByUser';

/* SQL text to update entity field related entity name field map for entity field ID A2695B8D-7876-4E77-A6EA-55E0BE5D1F21 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A2695B8D-7876-4E77-A6EA-55E0BE5D1F21', @RelatedEntityNameFieldMap='SalesRule';

/* SQL text to update entity field related entity name field map for entity field ID 2929259E-016A-4F0D-A2DA-85CE8166BDCC */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2929259E-016A-4F0D-A2DA-85CE8166BDCC', @RelatedEntityNameFieldMap='DecidedByUser';

/* Base View SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: vwOrderConcessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Concessions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderConcession
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderConcessions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderConcessions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderConcessions]
AS
SELECT
    o.*,
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader],
    MJUser_RequestedByUserID.[Name] AS [RequestedByUser],
    mjBizAppsOrdersSalesRule_SalesRuleID.[Name] AS [SalesRule],
    MJUser_DecidedByUserID.[Name] AS [DecidedByUser]
FROM
    [${flyway:defaultSchema}].[OrderConcession] AS o
INNER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [o].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
INNER JOIN
    [${mjSchema}].[User] AS MJUser_RequestedByUserID
  ON
    [o].[RequestedByUserID] = MJUser_RequestedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[SalesRule] AS mjBizAppsOrdersSalesRule_SalesRuleID
  ON
    [o].[SalesRuleID] = mjBizAppsOrdersSalesRule_SalesRuleID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_DecidedByUserID
  ON
    [o].[DecidedByUserID] = MJUser_DecidedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: Permissions for vwOrderConcessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: spCreateOrderConcession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderConcession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderConcession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderConcession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderConcession]
    @ID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @SubscriptionTermID_Clear bit = 0,
    @SubscriptionTermID uniqueidentifier = NULL,
    @DeliveryForm nvarchar(20),
    @ReasonCategory nvarchar(20),
    @Reason nvarchar(MAX),
    @AddedDays_Clear bit = 0,
    @AddedDays int = NULL,
    @AddedQuantity_Clear bit = 0,
    @AddedQuantity decimal(18, 4) = NULL,
    @ComputedValue decimal(18, 2),
    @Status nvarchar(20) = NULL,
    @RequestedByUserID uniqueidentifier,
    @AuthorizedBySalesAuthorityID_Clear bit = 0,
    @AuthorizedBySalesAuthorityID uniqueidentifier = NULL,
    @SalesRuleID_Clear bit = 0,
    @SalesRuleID uniqueidentifier = NULL,
    @DecidedByUserID_Clear bit = 0,
    @DecidedByUserID uniqueidentifier = NULL,
    @DecidedAt_Clear bit = 0,
    @DecidedAt datetimeoffset = NULL,
    @DecisionNotes_Clear bit = 0,
    @DecisionNotes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderConcession]
            (
                [ID],
                [OrderHeaderID],
                [OrderLineID],
                [SubscriptionTermID],
                [DeliveryForm],
                [ReasonCategory],
                [Reason],
                [AddedDays],
                [AddedQuantity],
                [ComputedValue],
                [Status],
                [RequestedByUserID],
                [AuthorizedBySalesAuthorityID],
                [SalesRuleID],
                [DecidedByUserID],
                [DecidedAt],
                [DecisionNotes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderHeaderID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, NULL) END,
                @DeliveryForm,
                @ReasonCategory,
                @Reason,
                CASE WHEN @AddedDays_Clear = 1 THEN NULL ELSE ISNULL(@AddedDays, NULL) END,
                CASE WHEN @AddedQuantity_Clear = 1 THEN NULL ELSE ISNULL(@AddedQuantity, NULL) END,
                @ComputedValue,
                ISNULL(@Status, 'Pending'),
                @RequestedByUserID,
                CASE WHEN @AuthorizedBySalesAuthorityID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizedBySalesAuthorityID, NULL) END,
                CASE WHEN @SalesRuleID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRuleID, NULL) END,
                CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, NULL) END,
                CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, NULL) END,
                CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderConcession]
            (
                [OrderHeaderID],
                [OrderLineID],
                [SubscriptionTermID],
                [DeliveryForm],
                [ReasonCategory],
                [Reason],
                [AddedDays],
                [AddedQuantity],
                [ComputedValue],
                [Status],
                [RequestedByUserID],
                [AuthorizedBySalesAuthorityID],
                [SalesRuleID],
                [DecidedByUserID],
                [DecidedAt],
                [DecisionNotes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderHeaderID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, NULL) END,
                @DeliveryForm,
                @ReasonCategory,
                @Reason,
                CASE WHEN @AddedDays_Clear = 1 THEN NULL ELSE ISNULL(@AddedDays, NULL) END,
                CASE WHEN @AddedQuantity_Clear = 1 THEN NULL ELSE ISNULL(@AddedQuantity, NULL) END,
                @ComputedValue,
                ISNULL(@Status, 'Pending'),
                @RequestedByUserID,
                CASE WHEN @AuthorizedBySalesAuthorityID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizedBySalesAuthorityID, NULL) END,
                CASE WHEN @SalesRuleID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRuleID, NULL) END,
                CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, NULL) END,
                CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, NULL) END,
                CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderConcessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Concessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: spUpdateOrderConcession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderConcession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderConcession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderConcession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderConcession]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @SubscriptionTermID_Clear bit = 0,
    @SubscriptionTermID uniqueidentifier = NULL,
    @DeliveryForm nvarchar(20) = NULL,
    @ReasonCategory nvarchar(20) = NULL,
    @Reason nvarchar(MAX) = NULL,
    @AddedDays_Clear bit = 0,
    @AddedDays int = NULL,
    @AddedQuantity_Clear bit = 0,
    @AddedQuantity decimal(18, 4) = NULL,
    @ComputedValue decimal(18, 2) = NULL,
    @Status nvarchar(20) = NULL,
    @RequestedByUserID uniqueidentifier = NULL,
    @AuthorizedBySalesAuthorityID_Clear bit = 0,
    @AuthorizedBySalesAuthorityID uniqueidentifier = NULL,
    @SalesRuleID_Clear bit = 0,
    @SalesRuleID uniqueidentifier = NULL,
    @DecidedByUserID_Clear bit = 0,
    @DecidedByUserID uniqueidentifier = NULL,
    @DecidedAt_Clear bit = 0,
    @DecidedAt datetimeoffset = NULL,
    @DecisionNotes_Clear bit = 0,
    @DecisionNotes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderConcession]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [OrderLineID] = CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, [OrderLineID]) END,
        [SubscriptionTermID] = CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, [SubscriptionTermID]) END,
        [DeliveryForm] = ISNULL(@DeliveryForm, [DeliveryForm]),
        [ReasonCategory] = ISNULL(@ReasonCategory, [ReasonCategory]),
        [Reason] = ISNULL(@Reason, [Reason]),
        [AddedDays] = CASE WHEN @AddedDays_Clear = 1 THEN NULL ELSE ISNULL(@AddedDays, [AddedDays]) END,
        [AddedQuantity] = CASE WHEN @AddedQuantity_Clear = 1 THEN NULL ELSE ISNULL(@AddedQuantity, [AddedQuantity]) END,
        [ComputedValue] = ISNULL(@ComputedValue, [ComputedValue]),
        [Status] = ISNULL(@Status, [Status]),
        [RequestedByUserID] = ISNULL(@RequestedByUserID, [RequestedByUserID]),
        [AuthorizedBySalesAuthorityID] = CASE WHEN @AuthorizedBySalesAuthorityID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizedBySalesAuthorityID, [AuthorizedBySalesAuthorityID]) END,
        [SalesRuleID] = CASE WHEN @SalesRuleID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRuleID, [SalesRuleID]) END,
        [DecidedByUserID] = CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, [DecidedByUserID]) END,
        [DecidedAt] = CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, [DecidedAt]) END,
        [DecisionNotes] = CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, [DecisionNotes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderConcessions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderConcessions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderConcession table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderConcession]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderConcession];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderConcession
ON [${flyway:defaultSchema}].[OrderConcession]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderConcession]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderConcession] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Concessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: spDeleteOrderConcession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderConcession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderConcession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderConcession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderConcession]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderConcession]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Concessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for SalesAuthority */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authorities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SalesRepUserID in table SalesAuthority
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SalesAuthority_SalesRepUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SalesAuthority]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SalesAuthority_SalesRepUserID ON [${flyway:defaultSchema}].[SalesAuthority] ([SalesRepUserID]);

/* Base View SQL for MJ_BizApps_Orders: Sales Authorities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authorities
-- Item: vwSalesAuthorities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Sales Authorities
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SalesAuthority
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSalesAuthorities]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSalesAuthorities];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSalesAuthorities]
AS
SELECT
    s.*,
    MJUser_SalesRepUserID.[Name] AS [SalesRepUser]
FROM
    [${flyway:defaultSchema}].[SalesAuthority] AS s
INNER JOIN
    [${mjSchema}].[User] AS MJUser_SalesRepUserID
  ON
    [s].[SalesRepUserID] = MJUser_SalesRepUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSalesAuthorities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Sales Authorities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authorities
-- Item: Permissions for vwSalesAuthorities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSalesAuthorities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Sales Authorities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authorities
-- Item: spCreateSalesAuthority
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SalesAuthority
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSalesAuthority]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSalesAuthority];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSalesAuthority]
    @ID uniqueidentifier = NULL,
    @SalesRepUserID uniqueidentifier,
    @MaxDiscountPct_Clear bit = 0,
    @MaxDiscountPct decimal(7, 4) = NULL,
    @MaxOrderValue_Clear bit = 0,
    @MaxOrderValue decimal(18, 2) = NULL,
    @AllowedPaymentTermsTypeIDs_Clear bit = 0,
    @AllowedPaymentTermsTypeIDs nvarchar(MAX) = NULL,
    @AllowedProductCategoryIDs_Clear bit = 0,
    @AllowedProductCategoryIDs nvarchar(MAX) = NULL,
    @IsActive bit = NULL,
    @MaxConcessionValue_Clear bit = 0,
    @MaxConcessionValue decimal(18, 2) = NULL,
    @MaxTermExtensionDays_Clear bit = 0,
    @MaxTermExtensionDays int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SalesAuthority]
            (
                [ID],
                [SalesRepUserID],
                [MaxDiscountPct],
                [MaxOrderValue],
                [AllowedPaymentTermsTypeIDs],
                [AllowedProductCategoryIDs],
                [IsActive],
                [MaxConcessionValue],
                [MaxTermExtensionDays]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SalesRepUserID,
                CASE WHEN @MaxDiscountPct_Clear = 1 THEN NULL ELSE ISNULL(@MaxDiscountPct, NULL) END,
                CASE WHEN @MaxOrderValue_Clear = 1 THEN NULL ELSE ISNULL(@MaxOrderValue, NULL) END,
                CASE WHEN @AllowedPaymentTermsTypeIDs_Clear = 1 THEN NULL ELSE ISNULL(@AllowedPaymentTermsTypeIDs, NULL) END,
                CASE WHEN @AllowedProductCategoryIDs_Clear = 1 THEN NULL ELSE ISNULL(@AllowedProductCategoryIDs, NULL) END,
                ISNULL(@IsActive, 1),
                CASE WHEN @MaxConcessionValue_Clear = 1 THEN NULL ELSE ISNULL(@MaxConcessionValue, NULL) END,
                CASE WHEN @MaxTermExtensionDays_Clear = 1 THEN NULL ELSE ISNULL(@MaxTermExtensionDays, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SalesAuthority]
            (
                [SalesRepUserID],
                [MaxDiscountPct],
                [MaxOrderValue],
                [AllowedPaymentTermsTypeIDs],
                [AllowedProductCategoryIDs],
                [IsActive],
                [MaxConcessionValue],
                [MaxTermExtensionDays]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SalesRepUserID,
                CASE WHEN @MaxDiscountPct_Clear = 1 THEN NULL ELSE ISNULL(@MaxDiscountPct, NULL) END,
                CASE WHEN @MaxOrderValue_Clear = 1 THEN NULL ELSE ISNULL(@MaxOrderValue, NULL) END,
                CASE WHEN @AllowedPaymentTermsTypeIDs_Clear = 1 THEN NULL ELSE ISNULL(@AllowedPaymentTermsTypeIDs, NULL) END,
                CASE WHEN @AllowedProductCategoryIDs_Clear = 1 THEN NULL ELSE ISNULL(@AllowedProductCategoryIDs, NULL) END,
                ISNULL(@IsActive, 1),
                CASE WHEN @MaxConcessionValue_Clear = 1 THEN NULL ELSE ISNULL(@MaxConcessionValue, NULL) END,
                CASE WHEN @MaxTermExtensionDays_Clear = 1 THEN NULL ELSE ISNULL(@MaxTermExtensionDays, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSalesAuthorities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSalesAuthority] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Sales Authorities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSalesAuthority] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Sales Authorities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authorities
-- Item: spUpdateSalesAuthority
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SalesAuthority
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSalesAuthority]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSalesAuthority];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSalesAuthority]
    @ID uniqueidentifier,
    @SalesRepUserID uniqueidentifier = NULL,
    @MaxDiscountPct_Clear bit = 0,
    @MaxDiscountPct decimal(7, 4) = NULL,
    @MaxOrderValue_Clear bit = 0,
    @MaxOrderValue decimal(18, 2) = NULL,
    @AllowedPaymentTermsTypeIDs_Clear bit = 0,
    @AllowedPaymentTermsTypeIDs nvarchar(MAX) = NULL,
    @AllowedProductCategoryIDs_Clear bit = 0,
    @AllowedProductCategoryIDs nvarchar(MAX) = NULL,
    @IsActive bit = NULL,
    @MaxConcessionValue_Clear bit = 0,
    @MaxConcessionValue decimal(18, 2) = NULL,
    @MaxTermExtensionDays_Clear bit = 0,
    @MaxTermExtensionDays int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SalesAuthority]
    SET
        [SalesRepUserID] = ISNULL(@SalesRepUserID, [SalesRepUserID]),
        [MaxDiscountPct] = CASE WHEN @MaxDiscountPct_Clear = 1 THEN NULL ELSE ISNULL(@MaxDiscountPct, [MaxDiscountPct]) END,
        [MaxOrderValue] = CASE WHEN @MaxOrderValue_Clear = 1 THEN NULL ELSE ISNULL(@MaxOrderValue, [MaxOrderValue]) END,
        [AllowedPaymentTermsTypeIDs] = CASE WHEN @AllowedPaymentTermsTypeIDs_Clear = 1 THEN NULL ELSE ISNULL(@AllowedPaymentTermsTypeIDs, [AllowedPaymentTermsTypeIDs]) END,
        [AllowedProductCategoryIDs] = CASE WHEN @AllowedProductCategoryIDs_Clear = 1 THEN NULL ELSE ISNULL(@AllowedProductCategoryIDs, [AllowedProductCategoryIDs]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [MaxConcessionValue] = CASE WHEN @MaxConcessionValue_Clear = 1 THEN NULL ELSE ISNULL(@MaxConcessionValue, [MaxConcessionValue]) END,
        [MaxTermExtensionDays] = CASE WHEN @MaxTermExtensionDays_Clear = 1 THEN NULL ELSE ISNULL(@MaxTermExtensionDays, [MaxTermExtensionDays]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSalesAuthorities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSalesAuthorities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesAuthority] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SalesAuthority table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSalesAuthority]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSalesAuthority];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSalesAuthority
ON [${flyway:defaultSchema}].[SalesAuthority]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SalesAuthority]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SalesAuthority] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Sales Authorities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesAuthority] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Sales Authorities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authorities
-- Item: spDeleteSalesAuthority
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SalesAuthority
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSalesAuthority]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSalesAuthority];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSalesAuthority]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SalesAuthority]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSalesAuthority] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Sales Authorities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSalesAuthority] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 5 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6b9df5c7-1467-416f-b88b-764034221fb0' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'OrderHeader')) BEGIN
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
            '6b9df5c7-1467-416f-b88b-764034221fb0',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '66800e4e-c4ac-49c0-8dca-da365b318aa0' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'RequestedByUser')) BEGIN
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
            '66800e4e-c4ac-49c0-8dca-da365b318aa0',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1c4c2b3f-d471-425f-9e38-c52d243db6f8' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'SalesRule')) BEGIN
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
            '1c4c2b3f-d471-425f-9e38-c52d243db6f8',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'SalesRule',
            'Sales Rule',
            NULL,
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '20092e3b-3270-4c69-8d59-2a0967bc32b3' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'DecidedByUser')) BEGIN
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
            '20092e3b-3270-4c69-8d59-2a0967bc32b3',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
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
