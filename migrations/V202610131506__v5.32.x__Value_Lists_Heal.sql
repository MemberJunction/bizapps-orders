-- =============================================================================
-- V202610131506 — CodeGen heal: value lists for CHECK-constrained status columns
-- (bizapps-orders#491)
-- =============================================================================
-- The migrations that added these columns carry their CHECK constraints but not
-- the value lists CodeGen derives from them:
--   * External Invoices.Status         (CK_ExternalInvoice_Status)
--   * External Payments.Disposition    (CK_ExternalPayment_Disposition)
-- A database built from migrations therefore has ValueListType 'None' and no
-- EntityFieldValue rows for them, while the committed entity classes type each
-- column as a union of its allowed values. CodeGen adds the rows on its first
-- run on such a host, so until then the database and the code disagree.
--
-- This file has no hand-authored DDL. Everything below the banner is CodeGen's
-- own output from a run on a database built from migrations alone.
-- =============================================================================




















































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen 6.1.5 (this repo's CLI) against a database built from
--   migrations alone. Contains the value lists for External Payments.Disposition
--   and External Invoices.Status. The EntityField IDs are the ones their
--   migrations inserted.
--
--   Left out, because this change does not touch them: the run's rebuild of the
--   Order Headers view and procs, and two sequence updates on Event Order
--   Lines.AttendanceStatus values, whose row IDs differ on every database.
--
-- =============================================================================


/* SQL text to insert entity field value with ID c7de496c-3aa1-4032-84fb-6b080fd69983 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c7de496c-3aa1-4032-84fb-6b080fd69983', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 1, 'Captured', 'Captured', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 877eccdf-4a54-4d9e-9ccc-75875bcdcb3b */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('877eccdf-4a54-4d9e-9ccc-75875bcdcb3b', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 2, 'Held', 'Held', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a344c7bc-bfb5-4721-8161-d69c17cefb18 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a344c7bc-bfb5-4721-8161-d69c17cefb18', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 3, 'Ignored', 'Ignored', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c65ee29e-8878-43bb-b584-9c1ea89e24e9 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c65ee29e-8878-43bb-b584-9c1ea89e24e9', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 4, 'Reapplied', 'Reapplied', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d03c23dc-f91d-4fea-b9e8-16b024f010bc */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d03c23dc-f91d-4fea-b9e8-16b024f010bc', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 5, 'Refused', 'Refused', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9d29e943-550f-44ce-86dc-da3667dd1f0a */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9d29e943-550f-44ce-86dc-da3667dd1f0a', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 6, 'ReversalNeeded', 'ReversalNeeded', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 50fbb213-0c8c-4d6a-839e-6144fd4b02ec */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('50fbb213-0c8c-4d6a-839e-6144fd4b02ec', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 7, 'Unmatched', 'Unmatched', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BB6560E3-6E78-4B6D-A11B-F7D45253C370 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='BB6560E3-6E78-4B6D-A11B-F7D45253C370';

/* SQL text to insert entity field value with ID ab6c8285-7864-4131-8ffc-371ffae39d0c */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ab6c8285-7864-4131-8ffc-371ffae39d0c', '04045555-8BEB-481C-8E8F-BAA92CB0F67A', 1, 'Canceled', 'Canceled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 338c8c2e-1ad7-43d0-9ec8-604f9b13cd36 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('338c8c2e-1ad7-43d0-9ec8-604f9b13cd36', '04045555-8BEB-481C-8E8F-BAA92CB0F67A', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3a1ecb83-d843-4a42-8a8f-a61bda8f328f */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3a1ecb83-d843-4a42-8a8f-a61bda8f328f', '04045555-8BEB-481C-8E8F-BAA92CB0F67A', 3, 'Sending', 'Sending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b93e4b80-8054-45c0-8359-83dba2e752f0 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b93e4b80-8054-45c0-8359-83dba2e752f0', '04045555-8BEB-481C-8E8F-BAA92CB0F67A', 4, 'Sent', 'Sent', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 04045555-8BEB-481C-8E8F-BAA92CB0F67A */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='04045555-8BEB-481C-8E8F-BAA92CB0F67A';
