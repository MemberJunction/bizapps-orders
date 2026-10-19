-- =============================================================================
-- V202610181800 — OrderHeader.ApprovalTaskID references its task (#774)
-- =============================================================================
-- OrderHeader.ApprovalTaskID was left a soft reference because the tasks app was
-- not part of the install set: a foreign key would have made Orders impossible to
-- install without it. mj-app.json now requires mj-bizapps-tasks, and
-- EntitlementAccessOverride.ApprovalTaskID already references Task(ID), so the
-- column becomes a real foreign key. A dangling task id is refused, and CodeGen
-- emits the related-entity field.
--
-- The column is written by the concession approval flow, which points the order
-- at its open approval task (ConcessionApprovalTask.ts).
--
-- What this file does, in order:
--   1. Adds FK_OrderHeader_ApprovalTask to the tasks app's Task table.
--   2. Rewrites the column's description, which still called it a soft reference.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The foreign key
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[OrderHeader]
    ADD CONSTRAINT [FK_OrderHeader_ApprovalTask]
        FOREIGN KEY ([ApprovalTaskID]) REFERENCES [__mj_BizAppsTasks].[Task]([ID]);
GO


-- -----------------------------------------------------------------------------
-- 2. The column's description
-- -----------------------------------------------------------------------------
EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'The order''s most recent open approval task in the tasks app, raised for a Pending concession. A convenience pointer: Task Links carry the authoritative link between a task and the record it decides.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderHeader',
    @level2type = N'COLUMN', @level2name = N'ApprovalTaskID';
GO


-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above: the Order Headers entity's
-- ApprovalTaskID relationship, its FK index and the regenerated view and procs.
-- =============================================================================


/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=1 WHERE ID='87F5488B-1753-4D95-9AA7-9586656C10A4';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=2 WHERE ID='E78A28F1-213D-40CE-BA0C-27C872DDECE3';


/* Create Entity Relationship: MJ_BizApps_Tasks: Tasks -> MJ_BizApps_Orders: Order Headers (One To Many via ApprovalTaskID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '6e618377-1e77-4e5d-87dc-93fcf95df691'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6e618377-1e77-4e5d-87dc-93fcf95df691', 'B348FFA2-B1A7-4AC2-B6FD-F4E0C0697466', 'FC529BC8-FF09-44A9-B454-26EAFDAC791B', 'ApprovalTaskID', 'One To Many', 1, 1, 13, GETUTCDATE(), GETUTCDATE())
   END;


