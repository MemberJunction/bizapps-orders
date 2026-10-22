-- =============================================================================================
-- PostgreSQL counterpart of V202610131503__v5.32.x__ReferralProgram.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) output, finished by hand:
--   * Tables, columns, constraints, indexes, views, data and grants are the converter's.
--   * CodeGen's CRUD procedures (spCreate/spUpdate/spDelete) and its __mj_UpdatedAt triggers are
--     NOT here: the converter cannot translate T-SQL procedures or triggers, and this repository
--     has no PostgreSQL baseline to run MJ CodeGen against. A PostgreSQL host runs `mj codegen`
--     after installing, which generates them natively. The converter's notes for them remain,
--     fully commented out.
--   * 2 skipped statements translated by hand (CodeGen's name-field map updates and column description
--     updates, which the converter drops), at the end of the file.
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


-- ===================== DDL: Tables, PKs, Indexes =====================

-- =============================================================================
-- V202610131503 — ReferralProgram, and the concessions it approves
-- (golive #268)
-- =============================================================================
-- A referral program grants a customer extra subscription time for a referral.
-- The time is added to the next term, on the renewal order, as a Duration
-- concession: extending the current term would re-cut recognition already
-- scheduled and could change a renewal invoice already sent, and a customer who
-- does not renew does not receive it.
--
-- A program states how many days one referral earns. A Duration concession that
-- names an active program, extends a term bought by a renewal line, and adds no
-- more than the program's days is approved by the program itself: no Sales
-- Authority and no approver. Anything else names the program for the record
-- and is routed like any other concession.
--
-- RUN CODEGEN AFTER THIS so the new entity, the OrderConcession field and their
-- views, CRUD procs and subclasses are generated.
-- =============================================================================

CREATE TABLE __mj_BizAppsOrders."ReferralProgram" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "CompanyID" UUID NOT NULL,
 "Name" VARCHAR(200) NOT NULL,
 "Description" TEXT NULL,
 "DaysPerReferral" INTEGER NOT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT "PK_ReferralProgram" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_ReferralProgram_Company" FOREIGN KEY ("CompanyID") REFERENCES __mj."Company"("ID"),
 CONSTRAINT "UQ_ReferralProgram_Company_Name" UNIQUE ("CompanyID", "Name"),
 CONSTRAINT "CK_ReferralProgram_DaysPerReferral" CHECK ("DaysPerReferral" > 0)
);

ALTER TABLE __mj_BizAppsOrders."OrderConcession"
 ADD COLUMN IF NOT EXISTS "ReferralProgramID" UUID NULL
    CONSTRAINT "FK_OrderConcession_ReferralProgram" REFERENCES __mj_BizAppsOrders."ReferralProgram"("ID");

ALTER TABLE __mj_BizAppsOrders."ReferralProgram"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsOrders.ReferralProgram */
ALTER TABLE __mj_BizAppsOrders."ReferralProgram"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderConcession_OrderHeaderID" ON __mj_BizAppsOrders."OrderConcession" ("OrderHeaderID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderConcession_OrderLineID" ON __mj_BizAppsOrders."OrderConcession" ("OrderLineID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderConcession_SubscriptionTermID" ON __mj_BizAppsOrders."OrderConcession" ("SubscriptionTermID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderConcession_RequestedByUserID" ON __mj_BizAppsOrders."OrderConcession" ("RequestedByUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderConcession_AuthorizedBySalesAuthorityID" ON __mj_BizAppsOrders."OrderConcession" ("AuthorizedBySalesAuthorityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderConcession_SalesRuleID" ON __mj_BizAppsOrders."OrderConcession" ("SalesRuleID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderConcession_DecidedByUserID" ON __mj_BizAppsOrders."OrderConcession" ("DecidedByUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderConcession_PriorPaymentTermsTypeID" ON __mj_BizAppsOrders."OrderConcession" ("PriorPaymentTermsTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderConcession_NewPaymentTermsTypeID" ON __mj_BizAppsOrders."OrderConcession" ("NewPaymentTermsTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderConcession_ReferralProgramID" ON __mj_BizAppsOrders."OrderConcession" ("ReferralProgramID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ReferralProgram_CompanyID" ON __mj_BizAppsOrders."ReferralProgram" ("CompanyID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_BizAppsOrders';
  v_target_name CONSTANT TEXT := 'vwOrderConcessions';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwOrderConcessions"
AS SELECT
    o.*,
    "mjBizAppsOrdersOrderHeader_OrderHeaderID"."OrderNumber" AS "OrderHeader",
    "MJUser_RequestedByUserID"."Name" AS "RequestedByUser",
    "mjBizAppsOrdersSalesRule_SalesRuleID"."Name" AS "SalesRule",
    "MJUser_DecidedByUserID"."Name" AS "DecidedByUser",
    "mjBizAppsOrdersPaymentTermsType_PriorPaymentTermsTypeID"."Name" AS "PriorPaymentTermsType",
    "mjBizAppsOrdersPaymentTermsType_NewPaymentTermsTypeID"."Name" AS "NewPaymentTermsType",
    "mjBizAppsOrdersReferralProgram_ReferralProgramID"."Name" AS "ReferralProgram"
FROM
    __mj_BizAppsOrders."OrderConcession" AS o
INNER JOIN
    __mj_BizAppsOrders."OrderHeader" AS "mjBizAppsOrdersOrderHeader_OrderHeaderID"
  ON
    o."OrderHeaderID" = "mjBizAppsOrdersOrderHeader_OrderHeaderID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_RequestedByUserID"
  ON
    o."RequestedByUserID" = "MJUser_RequestedByUserID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."SalesRule" AS "mjBizAppsOrdersSalesRule_SalesRuleID"
  ON
    o."SalesRuleID" = "mjBizAppsOrdersSalesRule_SalesRuleID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_DecidedByUserID"
  ON
    o."DecidedByUserID" = "MJUser_DecidedByUserID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."PaymentTermsType" AS "mjBizAppsOrdersPaymentTermsType_PriorPaymentTermsTypeID"
  ON
    o."PriorPaymentTermsTypeID" = "mjBizAppsOrdersPaymentTermsType_PriorPaymentTermsTypeID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."PaymentTermsType" AS "mjBizAppsOrdersPaymentTermsType_NewPaymentTermsTypeID"
  ON
    o."NewPaymentTermsTypeID" = "mjBizAppsOrdersPaymentTermsType_NewPaymentTermsTypeID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."ReferralProgram" AS "mjBizAppsOrdersReferralProgram_ReferralProgramID"
  ON
    o."ReferralProgramID" = "mjBizAppsOrdersReferralProgram_ReferralProgramID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_BizAppsOrders';
  v_target_name CONSTANT TEXT := 'vwReferralPrograms';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwReferralPrograms"
AS SELECT
    r.*,
    "MJCompany_CompanyID"."Name" AS "Company"
FROM
    __mj_BizAppsOrders."ReferralProgram" AS r
INNER JOIN
    __mj."Company" AS "MJCompany_CompanyID"
  ON
    r."CompanyID" = "MJCompany_CompanyID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreateOrderConcession]
--     @ID UUID = NULL,
--     @OrderHeaderID UUID,
--     @OrderLineID_Clear bit = 0,
--     @OrderLineID UUID ...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdateOrderConcession]
--     @ID UUID,
--     @OrderHeaderID UUID = NULL,
--     @OrderLineID_Clear bit = 0,
--     @OrderLineID UUID ...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeleteOrderConcession]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[OrderConcession]
--     WHERE
--         ...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreateReferralProgram]
--     @ID UUID = NULL,
--     @CompanyID UUID,
--     @Name VARCHAR(200),
--     @Description_Clear bit = 0,
--     @Descript...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdateReferralProgram]
--     @ID UUID,
--     @CompanyID UUID = NULL,
--     @Name VARCHAR(200) = NULL,
--     @Description_Clear bit = 0,
--     @D...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeleteReferralProgram]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[ReferralProgram]
--     WHERE
--         ...


-- ===================== Triggers =====================

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdateOrderConcession
-- ON "__mj_BizAppsOrders"."OrderConcession"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders"."OrderConcessio

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders".trgUpdateReferralProgram
-- ON "__mj_BizAppsOrders"."ReferralProgram"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders".[ReferralProgra


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

INSERT INTO __mj."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI",
         "AllowCaching"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         'd5638cec-f932-4d1f-9dcb-ee747fa0af4e',
         'MJ_BizApps_Orders: Referral Programs',
         'Referral Programs',
         'A program that grants a customer extra subscription time for a referral. The time is applied on the renewal order, as a Duration concession on the renewed term, never to the current term, and lapses if the customer does not renew.',
         NULL,
         'ReferralProgram',
         'vwReferralPrograms',
         '__mj_BizAppsOrders',
         TRUE,
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );

/* SQL generated to add new entity MJ_BizApps_Orders: Referral Programs to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'd5638cec-f932-4d1f-9dcb-ee747fa0af4e', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Referral Programs for role UI */

INSERT INTO __mj."EntityPermission"
                ("EntityID", "RoleID", "Type", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt")
              SELECT CAST('d5638cec-f932-4d1f-9dcb-ee747fa0af4e' AS UUID), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID), 'Allow', 1, 0, 0, 0, NOW(), NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM __mj."EntityPermission"
                WHERE "EntityID" = CAST('d5638cec-f932-4d1f-9dcb-ee747fa0af4e' AS UUID) AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID) AND "Type" = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Referral Programs for role Developer */

INSERT INTO __mj."EntityPermission"
                ("EntityID", "RoleID", "Type", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt")
              SELECT CAST('d5638cec-f932-4d1f-9dcb-ee747fa0af4e' AS UUID), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID), 'Allow', 1, 1, 1, 1, NOW(), NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM __mj."EntityPermission"
                WHERE "EntityID" = CAST('d5638cec-f932-4d1f-9dcb-ee747fa0af4e' AS UUID) AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID) AND "Type" = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Referral Programs for role Integration */

INSERT INTO __mj."EntityPermission"
                ("EntityID", "RoleID", "Type", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt")
              SELECT CAST('d5638cec-f932-4d1f-9dcb-ee747fa0af4e' AS UUID), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID), 'Allow', 1, 1, 1, 1, NOW(), NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM __mj."EntityPermission"
                WHERE "EntityID" = CAST('d5638cec-f932-4d1f-9dcb-ee747fa0af4e' AS UUID) AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID) AND "Type" = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsOrders.ReferralProgram */

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsOrders.ReferralProgram */
UPDATE "__mj_BizAppsOrders"."ReferralProgram" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsOrders.ReferralProgram */
ALTER TABLE __mj_BizAppsOrders."ReferralProgram" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsOrders."ReferralProgram"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsOrders.ReferralProgram */
UPDATE "__mj_BizAppsOrders"."ReferralProgram" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsOrders.ReferralProgram */
ALTER TABLE __mj_BizAppsOrders."ReferralProgram" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsOrders."ReferralProgram"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '880ae7a8-79ca-4e39-b8b1-d1f1bb7738ad' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ReferralProgramID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '880ae7a8-79ca-4e39-b8b1-d1f1bb7738ad',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'ReferralProgramID',
        'Referral Program ID',
        'For a Duration concession granted under a referral program, the program. Set by the requester when recording it; the program approves the concession when it is in program (see ReferralProgram.DaysPerReferral).',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2aa52adc-724a-42ef-b9ee-9100a9fd41bb' OR ("EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E' AND "Name" = 'ID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '2aa52adc-724a-42ef-b9ee-9100a9fd41bb',
        'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E', -- "Entity": "MJ_BizApps_Orders": "Referral" "Programs"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E'),
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '682ecd68-9a60-4edb-81a0-3305fc723fda' OR ("EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E' AND "Name" = 'CompanyID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '682ecd68-9a60-4edb-81a0-3305fc723fda',
        'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E', -- "Entity": "MJ_BizApps_Orders": "Referral" "Programs"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E'),
        'CompanyID',
        'Company ID',
        'The company that runs the program. A concession may name the program only on that company''s orders.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'D4238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '12ca09f6-7c3f-4999-9a8a-05c4bbc0c351' OR ("EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E' AND "Name" = 'Name')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '12ca09f6-7c3f-4999-9a8a-05c4bbc0c351',
        'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E', -- "Entity": "MJ_BizApps_Orders": "Referral" "Programs"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E'),
        'Name',
        'Name',
        'The program''s name, unique within its company.',
        'TEXT',
        400,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        TRUE,
        TRUE,
        FALSE,
        TRUE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3d0c49f4-dcb0-490e-b2a5-c326dc49bd56' OR ("EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E' AND "Name" = 'Description')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '3d0c49f4-dcb0-490e-b2a5-c326dc49bd56',
        'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E', -- "Entity": "MJ_BizApps_Orders": "Referral" "Programs"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E'),
        'Description',
        'Description',
        'The program''s terms as the customer was told them.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '91095f10-0d83-4181-b999-8bb91f0acf97' OR ("EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E' AND "Name" = 'DaysPerReferral')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '91095f10-0d83-4181-b999-8bb91f0acf97',
        'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E', -- "Entity": "MJ_BizApps_Orders": "Referral" "Programs"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E'),
        'DaysPerReferral',
        'Days Per Referral',
        'Days one referral earns. A Duration concession naming this program is approved by the program when it adds no more than this to a term bought by a renewal line; a larger one is routed for approval like any other concession. Must be a whole number above zero.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e6646651-5bda-4cc6-b646-370faa915786' OR ("EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E' AND "Name" = 'IsActive')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e6646651-5bda-4cc6-b646-370faa915786',
        'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E', -- "Entity": "MJ_BizApps_Orders": "Referral" "Programs"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E'),
        'IsActive',
        'Is Active',
        'Only an active program approves a concession. Deactivate a program rather than deleting it: approved concessions keep naming it.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '79f9a88b-86b6-49d6-a3b0-af387b3cf52b' OR ("EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '79f9a88b-86b6-49d6-a3b0-af387b3cf52b',
        'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E', -- "Entity": "MJ_BizApps_Orders": "Referral" "Programs"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E'),
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6df1a3e7-64a4-47ee-8a4e-c4491a2ba013' OR ("EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '6df1a3e7-64a4-47ee-8a4e-c4491a2ba013',
        'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E', -- "Entity": "MJ_BizApps_Orders": "Referral" "Programs"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E'),
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6a391a5f-8a82-4262-9f3a-bc8fc293ebba'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('6a391a5f-8a82-4262-9f3a-bc8fc293ebba', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E', 'CompanyID', 'One To Many', TRUE, TRUE, 33, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9397f741-3e6c-4ef2-a4f8-221e14d443e6'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('9397f741-3e6c-4ef2-a4f8-221e14d443e6', 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'ReferralProgramID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7ab01fc9-b230-4e64-8682-633d1619bef1' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ReferralProgram')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '7ab01fc9-b230-4e64-8682-633d1619bef1',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'ReferralProgram',
        'Referral Program',
        NULL,
        'TEXT',
        400,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b5f1e9f6-e643-4b45-a3c7-316cb9abeb3d' OR ("EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E' AND "Name" = 'Company')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'b5f1e9f6-e643-4b45-a3c7-316cb9abeb3d',
        'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E', -- "Entity": "MJ_BizApps_Orders": "Referral" "Programs"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E'),
        'Company',
        'Company',
        NULL,
        'TEXT',
        100,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;


-- ===================== Grants =====================

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderConcessions" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderConcessions" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderConcessions" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwOrderConcessions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: Permissions for vwOrderConcessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderConcessions" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderConcessions" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderConcessions" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwOrderConcessions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderConcession" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderConcession" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderConcession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Order Concessions */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderConcession" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderConcession" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderConcession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderConcession" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderConcession" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderConcession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderConcession" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderConcession" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderConcession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderConcession" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderConcession" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderConcession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Order Concessions */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderConcession" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderConcession" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderConcession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for ReferralProgram */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Referral Programs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table ReferralProgram;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwReferralPrograms" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Referral Programs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Referral Programs
-- Item: Permissions for vwReferralPrograms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwReferralPrograms" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Orders: Referral Programs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Referral Programs
-- Item: spCreateReferralProgram
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ReferralProgram
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateReferralProgram" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Referral Programs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateReferralProgram" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Referral Programs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Referral Programs
-- Item: spUpdateReferralProgram
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ReferralProgram
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateReferralProgram" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateReferralProgram" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Orders: Referral Programs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Referral Programs
-- Item: spDeleteReferralProgram
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReferralProgram
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteReferralProgram" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Referral Programs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteReferralProgram" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert 2 new entity field(s) */


-- ===================== Comments =====================

COMMENT ON TABLE __mj_BizAppsOrders."ReferralProgram" IS 'A program that grants a customer extra subscription time for a referral. The time is applied on the renewal order, as a Duration concession on the renewed term, never to the current term, and lapses if the customer does not renew.';

COMMENT ON COLUMN __mj_BizAppsOrders."ReferralProgram"."CompanyID" IS 'The company that runs the program. A concession may name the program only on that company''s orders.';

COMMENT ON COLUMN __mj_BizAppsOrders."ReferralProgram"."Name" IS 'The program''s name, unique within its company.';

COMMENT ON COLUMN __mj_BizAppsOrders."ReferralProgram"."Description" IS 'The program''s terms as the customer was told them.';

COMMENT ON COLUMN __mj_BizAppsOrders."ReferralProgram"."DaysPerReferral" IS 'Days one referral earns. A Duration concession naming this program is approved by the program when it adds no more than this to a term bought by a renewal line; a larger one is routed for approval like any other concession. Must be a whole number above zero.';

COMMENT ON COLUMN __mj_BizAppsOrders."ReferralProgram"."IsActive" IS 'Only an active program approves a concession. Deactivate a program rather than deleting it: approved concessions keep naming it.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."ReferralProgramID" IS 'For a Duration concession granted under a referral program, the program. Set by the requester when recording it; the program approves the concession when it is in program (see ReferralProgram.DaysPerReferral).';


-- ===================== Other =====================

-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen 6.1.5 against a database built from migrations alone,
--   with the hand-authored DDL above applied. Contains the new
--   MJ_BizApps_Orders: Referral Programs entity (metadata, fields,
--   relationships, application link, permissions, view, CRUD procs, FK index);
--   the ReferralProgramID field registration on Order Concessions with its FK
--   index; and the rebuilt Order Concessions view, CRUD procs and grants.
--
--   Left out, because this change does not touch them: the run's rebuild of the
--   Order Headers view and procs and its address latitude/longitude field rows,
--   and the unchanged Order Headers FK indexes.
--
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Orders: Referral Programs */

/* SQL text to insert 9 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Order Concessions */

/* spUpdate Permissions for MJ_BizApps_Orders: Referral Programs */

-- ===================== Skipped by the converter, translated by hand =====================
-- CodeGen's related-entity name-field map updates and changed column descriptions.
SELECT __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"('880AE7A8-79CA-4E39-B8B1-D1F1BB7738AD'::uuid, 'ReferralProgram');
SELECT __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"('682ECD68-9A60-4EDB-81A0-3305FC723FDA'::uuid, 'Company');
