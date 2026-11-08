-- =============================================================================================
-- PostgreSQL counterpart of V202610131506__v5.32.x__Value_Lists_Heal.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) output, finished by hand:
--   * Tables, columns, constraints, indexes, views, data and grants are the converter's.
--   * CodeGen's CRUD procedures (spCreate/spUpdate/spDelete) and its __mj_UpdatedAt triggers are
--     NOT here: the converter cannot translate T-SQL procedures or triggers, and this repository
--     has no PostgreSQL baseline to run MJ CodeGen against. A PostgreSQL host runs `mj codegen`
--     after installing, which generates them natively. The converter's notes for them remain,
--     fully commented out.
-- Schema names are written unquoted, as the converter emits them, so they fold to the lowercase
-- schema a PostgreSQL install uses.
-- =============================================================================================

SET standard_conforming_strings = on;

-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
--
-- The schema name is emitted UNQUOTED, so PostgreSQL folds it to lowercase. That is deliberate and
-- self-consistent: everything downstream in a converted migration refers to it unquoted too, so
-- both definition and lookup land on the same folded name.
--
-- DOWNSTREAM NOTE for the build engineer: a PostgreSQL database that was populated by an EARLIER
-- converter — one that emitted a quoted, case-preserved name — already holds that mixed-case
-- schema: for a target named MySchema_Name, the quoted "MySchema_Name". Re-converting against
-- that database creates a SECOND, empty schema myschema_name rather than reusing the existing
-- one, because IF NOT EXISTS compares the folded name and finds no match. The repo's own committed
-- migrations-pg files are unaffected (the only quoted CREATE SCHEMAs there are the four pg_dump
-- baselines, which this path does not produce), so this is an open-app / downstream concern, not
-- one for this repo's Flyway history.
CREATE SCHEMA IF NOT EXISTS __mj_bizappsorders;
SET search_path TO __mj_bizappsorders, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('c7de496c-3aa1-4032-84fb-6b080fd69983', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 1, 'Captured', 'Captured', NOW(), NOW());

/* SQL text to insert entity field value with ID 877eccdf-4a54-4d9e-9ccc-75875bcdcb3b */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('877eccdf-4a54-4d9e-9ccc-75875bcdcb3b', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 2, 'Held', 'Held', NOW(), NOW());

/* SQL text to insert entity field value with ID a344c7bc-bfb5-4721-8161-d69c17cefb18 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('a344c7bc-bfb5-4721-8161-d69c17cefb18', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 3, 'Ignored', 'Ignored', NOW(), NOW());

/* SQL text to insert entity field value with ID c65ee29e-8878-43bb-b584-9c1ea89e24e9 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('c65ee29e-8878-43bb-b584-9c1ea89e24e9', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 4, 'Reapplied', 'Reapplied', NOW(), NOW());

/* SQL text to insert entity field value with ID d03c23dc-f91d-4fea-b9e8-16b024f010bc */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d03c23dc-f91d-4fea-b9e8-16b024f010bc', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 5, 'Refused', 'Refused', NOW(), NOW());

/* SQL text to insert entity field value with ID 9d29e943-550f-44ce-86dc-da3667dd1f0a */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('9d29e943-550f-44ce-86dc-da3667dd1f0a', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 6, 'ReversalNeeded', 'ReversalNeeded', NOW(), NOW());

/* SQL text to insert entity field value with ID 50fbb213-0c8c-4d6a-839e-6144fd4b02ec */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('50fbb213-0c8c-4d6a-839e-6144fd4b02ec', 'BB6560E3-6E78-4B6D-A11B-F7D45253C370', 7, 'Unmatched', 'Unmatched', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID BB6560E3-6E78-4B6D-A11B-F7D45253C370 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='BB6560E3-6E78-4B6D-A11B-F7D45253C370';

/* SQL text to insert entity field value with ID ab6c8285-7864-4131-8ffc-371ffae39d0c */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ab6c8285-7864-4131-8ffc-371ffae39d0c', '04045555-8BEB-481C-8E8F-BAA92CB0F67A', 1, 'Canceled', 'Canceled', NOW(), NOW());

/* SQL text to insert entity field value with ID 338c8c2e-1ad7-43d0-9ec8-604f9b13cd36 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('338c8c2e-1ad7-43d0-9ec8-604f9b13cd36', '04045555-8BEB-481C-8E8F-BAA92CB0F67A', 2, 'Failed', 'Failed', NOW(), NOW());

/* SQL text to insert entity field value with ID 3a1ecb83-d843-4a42-8a8f-a61bda8f328f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('3a1ecb83-d843-4a42-8a8f-a61bda8f328f', '04045555-8BEB-481C-8E8F-BAA92CB0F67A', 3, 'Sending', 'Sending', NOW(), NOW());

/* SQL text to insert entity field value with ID b93e4b80-8054-45c0-8359-83dba2e752f0 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('b93e4b80-8054-45c0-8359-83dba2e752f0', '04045555-8BEB-481C-8E8F-BAA92CB0F67A', 4, 'Sent', 'Sent', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 04045555-8BEB-481C-8E8F-BAA92CB0F67A */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='04045555-8BEB-481C-8E8F-BAA92CB0F67A';


-- ===================== Other =====================

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
