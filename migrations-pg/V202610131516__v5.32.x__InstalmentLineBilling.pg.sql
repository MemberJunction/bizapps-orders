-- =============================================================================================
-- PostgreSQL counterpart of V202610131516__v5.32.x__InstalmentLineBilling.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) output, finished by hand:
--   * Tables, columns, constraints, indexes, views, data and grants are the converter's.
--   * CodeGen's CRUD procedures (spCreate/spUpdate/spDelete) and its __mj_UpdatedAt triggers are
--     NOT here: the converter cannot translate T-SQL procedures or triggers, and this repository
--     has no PostgreSQL baseline to run MJ CodeGen against. A PostgreSQL host runs `mj codegen`
--     after installing, which generates them natively. The converter's notes for them remain,
--     fully commented out.
--   * 1 skipped statements translated by hand (CodeGen's name-field map updates and column description
--     updates, which the converter drops), at the end of the file.
--   * 2 string values restored verbatim from the T-SQL: the converter re-indents text inside string
--     literals, which would change stored validator code, constraint text and settings JSON.
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
-- V202610131516 — What each instalment invoice billed each line (#681)
-- =============================================================================
-- An instalment invoice slices its amount across the order's lines: each line's
-- net, whatever of its tax and charges no charge allocation covers, and each
-- charge type allocated to it. Only the net reached the database, as the line's
-- running BilledToDate, so the next invoice worked out what earlier invoices had
-- billed by slicing them again against the lines as they stand now. Once an
-- amount change or a return lowers a line, that re-slicing differs from what was
-- actually billed, and the remaining instalments bill each line the wrong share.
--
-- What this file does:
-- 1. InstalmentLineBilling: one row per invoiced instalment, line and part,
-- holding the amount that invoice billed for it. Written in the same
-- transaction as the invoice's journal entry and BilledToDate.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. InstalmentLineBilling
-- -----------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders."InstalmentLineBilling" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "OrderHeaderPaymentScheduleID" UUID NOT NULL,
 "OrderLineID" UUID NOT NULL,
 "Part" VARCHAR(20) NOT NULL,
 "ChargeTypeID" UUID NULL,
 "Amount" DECIMAL(18,2) NOT NULL,
 CONSTRAINT "PK_InstalmentLineBilling" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_InstalmentLineBilling_OrderHeaderPaymentSchedule" FOREIGN KEY ("OrderHeaderPaymentScheduleID")
 REFERENCES __mj_BizAppsOrders."OrderHeaderPaymentSchedule"("ID"),
 CONSTRAINT "FK_InstalmentLineBilling_OrderLine" FOREIGN KEY ("OrderLineID")
 REFERENCES __mj_BizAppsOrders."OrderLine"("ID"),
 CONSTRAINT "FK_InstalmentLineBilling_ChargeType" FOREIGN KEY ("ChargeTypeID")
 REFERENCES __mj_BizAppsOrders."ChargeType"("ID"),
 CONSTRAINT "UQ_InstalmentLineBilling_Schedule_Line_Part_ChargeType"
 UNIQUE ("OrderHeaderPaymentScheduleID", "OrderLineID", "Part", "ChargeTypeID"),
 CONSTRAINT "CK_InstalmentLineBilling_Part" CHECK ("Part" IN ('Net', 'Unallocated', 'Charge')),
 CONSTRAINT "CK_InstalmentLineBilling_ChargeType" CHECK (
 ("Part" = 'Charge' AND "ChargeTypeID" IS NOT NULL) OR ("Part" <> 'Charge' AND "ChargeTypeID" IS NULL)
 )
);

ALTER TABLE __mj_BizAppsOrders."InstalmentLineBilling"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsOrders.InstalmentLineBilling */
ALTER TABLE __mj_BizAppsOrders."InstalmentLineBilling"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_InstalmentLineBilling_OrderHeaderPaym_c8b28848" ON __mj_BizAppsOrders."InstalmentLineBilling" ("OrderHeaderPaymentScheduleID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_InstalmentLineBilling_OrderLineID" ON __mj_BizAppsOrders."InstalmentLineBilling" ("OrderLineID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_InstalmentLineBilling_ChargeTypeID" ON __mj_BizAppsOrders."InstalmentLineBilling" ("ChargeTypeID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_BizAppsOrders';
  v_target_name CONSTANT TEXT := 'vwInstalmentLineBillings';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwInstalmentLineBillings"
AS SELECT
    i.*,
    "mjBizAppsOrdersChargeType_ChargeTypeID"."Name" AS "ChargeType"
FROM
    __mj_BizAppsOrders."InstalmentLineBilling" AS i
LEFT OUTER JOIN
    __mj_BizAppsOrders."ChargeType" AS "mjBizAppsOrdersChargeType_ChargeTypeID"
  ON
    i."ChargeTypeID" = "mjBizAppsOrdersChargeType_ChargeTypeID"."ID"$vsql$;
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
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreateInstalmentLineBilling]
--     @ID UUID = NULL,
--     @OrderHeaderPaymentScheduleID UUID,
--     @OrderLineID UUID,
--     @Part ...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdateInstalmentLineBilling]
--     @ID UUID,
--     @OrderHeaderPaymentScheduleID UUID = NULL,
--     @OrderLineID UUID = NULL,
--    ...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeleteInstalmentLineBilling]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[InstalmentLineBilling]
--     WH...


-- ===================== Triggers =====================

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdateInstalmentLineBilling
-- ON "__mj_BizAppsOrders"."InstalmentLineBilling"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders".[In


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
         '3ce400ff-48be-43cd-87cb-610e180e24e3',
         'MJ_BizApps_Orders: Instalment Line Billings',
         'Instalment Line Billings',
         'What one instalment invoice billed one order line, part by part: the line''s net, the tax and charges no charge allocation covers, and each allocated charge type. Written by the server when the instalment is invoiced, in the same transaction as its journal entry and the line''s BilledToDate, and never changed afterwards. Later invoices on the order read these rows as billed instead of slicing earlier instalments again.',
         NULL,
         'InstalmentLineBilling',
         'vwInstalmentLineBillings',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Instalment Line Billings to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '3ce400ff-48be-43cd-87cb-610e180e24e3', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Instalment Line Billings for role UI */

INSERT INTO __mj."EntityPermission"
                ("EntityID", "RoleID", "Type", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt")
              SELECT CAST('3ce400ff-48be-43cd-87cb-610e180e24e3' AS UUID), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID), 'Allow', 1, 0, 0, 0, NOW(), NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM __mj."EntityPermission"
                WHERE "EntityID" = CAST('3ce400ff-48be-43cd-87cb-610e180e24e3' AS UUID) AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID) AND "Type" = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Instalment Line Billings for role Developer */

INSERT INTO __mj."EntityPermission"
                ("EntityID", "RoleID", "Type", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt")
              SELECT CAST('3ce400ff-48be-43cd-87cb-610e180e24e3' AS UUID), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID), 'Allow', 1, 1, 1, 1, NOW(), NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM __mj."EntityPermission"
                WHERE "EntityID" = CAST('3ce400ff-48be-43cd-87cb-610e180e24e3' AS UUID) AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID) AND "Type" = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Instalment Line Billings for role Integration */

INSERT INTO __mj."EntityPermission"
                ("EntityID", "RoleID", "Type", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt")
              SELECT CAST('3ce400ff-48be-43cd-87cb-610e180e24e3' AS UUID), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID), 'Allow', 1, 1, 1, 1, NOW(), NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM __mj."EntityPermission"
                WHERE "EntityID" = CAST('3ce400ff-48be-43cd-87cb-610e180e24e3' AS UUID) AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID) AND "Type" = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsOrders.InstalmentLineBilling */

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsOrders.InstalmentLineBilling */
UPDATE "__mj_BizAppsOrders"."InstalmentLineBilling" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsOrders.InstalmentLineBilling */
ALTER TABLE __mj_BizAppsOrders."InstalmentLineBilling" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsOrders."InstalmentLineBilling"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsOrders.InstalmentLineBilling */
UPDATE "__mj_BizAppsOrders"."InstalmentLineBilling" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsOrders.InstalmentLineBilling */
ALTER TABLE __mj_BizAppsOrders."InstalmentLineBilling" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsOrders."InstalmentLineBilling"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c6cbe13f-8990-4dde-8d96-6b5ef0ce4958' OR ("EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND "Name" = 'ID')
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
        'c6cbe13f-8990-4dde-8d96-6b5ef0ce4958',
        '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- "Entity": "MJ_BizApps_Orders": "Instalment" "Line" "Billings"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c214ddc8-090d-4efb-80ef-c34cd2d91f2d' OR ("EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND "Name" = 'OrderHeaderPaymentScheduleID')
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
        'c214ddc8-090d-4efb-80ef-c34cd2d91f2d',
        '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- "Entity": "MJ_BizApps_Orders": "Instalment" "Line" "Billings"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
        'OrderHeaderPaymentScheduleID',
        'Order Header Payment Schedule ID',
        'The invoiced instalment.',
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
        'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6e442307-859a-4f0a-a8b6-23b9c94fa69d' OR ("EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND "Name" = 'OrderLineID')
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
        '6e442307-859a-4f0a-a8b6-23b9c94fa69d',
        '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- "Entity": "MJ_BizApps_Orders": "Instalment" "Line" "Billings"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
        'OrderLineID',
        'Order Line ID',
        'The line the instalment billed.',
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
        '66D82C24-9C9F-4CD6-B019-53C20274AB00',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd3d719ce-8f97-4f8e-802f-1dd83ff868b2' OR ("EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND "Name" = 'Part')
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
        'd3d719ce-8f97-4f8e-802f-1dd83ff868b2',
        '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- "Entity": "MJ_BizApps_Orders": "Instalment" "Line" "Billings"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
        'Part',
        'Part',
        'Which amount of the line: Net (before tax and charges), Unallocated (tax and charges no charge allocation covers) or Charge (one allocated charge type, named by ChargeTypeID). An instalment has at most one row per line and part.',
        'TEXT',
        40,
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
        FALSE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b1b6feee-16b1-4b9d-a348-6bbef0d2c93c' OR ("EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND "Name" = 'ChargeTypeID')
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
        'b1b6feee-16b1-4b9d-a348-6bbef0d2c93c',
        '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- "Entity": "MJ_BizApps_Orders": "Instalment" "Line" "Billings"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
        'ChargeTypeID',
        'Charge Type ID',
        'For a Charge part, the charge type billed. NULL for Net and Unallocated.',
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
        '0D654D66-FC8D-4690-BF29-B497EFC6CBEC',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'af8fa0bb-b61b-49af-80c0-554cbb0445a6' OR ("EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND "Name" = 'Amount')
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
        'af8fa0bb-b61b-49af-80c0-554cbb0445a6',
        '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- "Entity": "MJ_BizApps_Orders": "Instalment" "Line" "Billings"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
        'Amount',
        'Amount',
        'What the instalment billed for this part, signed as the line is: negative on a line that reverses another.',
        'decimal',
        9,
        18,
        2,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5457e141-49ce-4ee9-9eb0-9976c838ee4b' OR ("EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND "Name" = '__mj_CreatedAt')
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
        '5457e141-49ce-4ee9-9eb0-9976c838ee4b',
        '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- "Entity": "MJ_BizApps_Orders": "Instalment" "Line" "Billings"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '142e2fc3-f343-480e-9773-40d7f2ed6d30' OR ("EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND "Name" = '__mj_UpdatedAt')
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
        '142e2fc3-f343-480e-9773-40d7f2ed6d30',
        '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- "Entity": "MJ_BizApps_Orders": "Instalment" "Line" "Billings"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
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

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('9afef5df-5461-4693-af16-bab0f83de299', 'D3D719CE-8F97-4F8E-802F-1DD83FF868B2', 1, 'Charge', 'Charge', NOW(), NOW());

/* SQL text to insert entity field value with ID 8ade639c-3fc1-4d28-989f-eb281993aec3 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('8ade639c-3fc1-4d28-989f-eb281993aec3', 'D3D719CE-8F97-4F8E-802F-1DD83FF868B2', 2, 'Net', 'Net', NOW(), NOW());

/* SQL text to insert entity field value with ID fac8d102-756c-4362-af65-9adfe6e05257 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('fac8d102-756c-4362-af65-9adfe6e05257', 'D3D719CE-8F97-4F8E-802F-1DD83FF868B2', 3, 'Unallocated', 'Unallocated', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID D3D719CE-8F97-4F8E-802F-1DD83FF868B2 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='D3D719CE-8F97-4F8E-802F-1DD83FF868B2';


/* Create Entity Relationship: MJ_BizApps_Orders: Order Lines -> MJ_BizApps_Orders: Instalment Line Billings (One To Many via OrderLineID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '3240a6c3-ae2d-4c6e-9243-6b8a4008c763'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('3240a6c3-ae2d-4c6e-9243-6b8a4008c763', '66D82C24-9C9F-4CD6-B019-53C20274AB00', '3CE400FF-48BE-43CD-87CB-610E180E24E3', 'OrderLineID', 'One To Many', TRUE, TRUE, 17, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'dea07446-259c-46c2-a0f8-0ea7198f6565'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('dea07446-259c-46c2-a0f8-0ea7198f6565', 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', '3CE400FF-48BE-43CD-87CB-610E180E24E3', 'OrderHeaderPaymentScheduleID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '45b20c6b-895e-495a-a883-a461e3000115'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('45b20c6b-895e-495a-a883-a461e3000115', '0D654D66-FC8D-4690-BF29-B497EFC6CBEC', '3CE400FF-48BE-43CD-87CB-610E180E24E3', 'ChargeTypeID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'da611380-baec-4964-95ea-3c745a708107' OR ("EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND "Name" = 'ChargeType')
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
        'da611380-baec-4964-95ea-3c745a708107',
        '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- "Entity": "MJ_BizApps_Orders": "Instalment" "Line" "Billings"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
        'ChargeType',
        'Charge Type',
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


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwInstalmentLineBillings" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Instalment Line Billings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Instalment Line Billings
-- Item: Permissions for vwInstalmentLineBillings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwInstalmentLineBillings" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Orders: Instalment Line Billings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Instalment Line Billings
-- Item: spCreateInstalmentLineBilling
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR InstalmentLineBilling
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateInstalmentLineBilling" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Instalment Line Billings */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateInstalmentLineBilling" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Instalment Line Billings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Instalment Line Billings
-- Item: spUpdateInstalmentLineBilling
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR InstalmentLineBilling
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateInstalmentLineBilling" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateInstalmentLineBilling" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Orders: Instalment Line Billings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Instalment Line Billings
-- Item: spDeleteInstalmentLineBilling
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR InstalmentLineBilling
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteInstalmentLineBilling" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Instalment Line Billings */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteInstalmentLineBilling" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert 1 new entity field(s) */


-- ===================== Comments =====================

COMMENT ON TABLE __mj_BizAppsOrders."InstalmentLineBilling" IS 'What one instalment invoice billed one order line, part by part: the line''s net, the tax and charges no charge allocation covers, and each allocated charge type. Written by the server when the instalment is invoiced, in the same transaction as its journal entry and the line''s BilledToDate, and never changed afterwards. Later invoices on the order read these rows as billed instead of slicing earlier instalments again.';

COMMENT ON COLUMN __mj_BizAppsOrders."InstalmentLineBilling"."OrderHeaderPaymentScheduleID" IS 'The invoiced instalment.';

COMMENT ON COLUMN __mj_BizAppsOrders."InstalmentLineBilling"."OrderLineID" IS 'The line the instalment billed.';

COMMENT ON COLUMN __mj_BizAppsOrders."InstalmentLineBilling"."Part" IS 'Which amount of the line: Net (before tax and charges), Unallocated (tax and charges no charge allocation covers) or Charge (one allocated charge type, named by ChargeTypeID). An instalment has at most one row per line and part.';

COMMENT ON COLUMN __mj_BizAppsOrders."InstalmentLineBilling"."ChargeTypeID" IS 'For a Charge part, the charge type billed. NULL for Net and Unallocated.';

COMMENT ON COLUMN __mj_BizAppsOrders."InstalmentLineBilling"."Amount" IS 'What the instalment billed for this part, signed as the line is: negative on a line that reverses another.';


-- ===================== Other =====================

-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above: the Instalment Line Billings
-- entity, its fields and relationships, FK indexes, its view, CRUD procs and
-- permissions.
-- =============================================================================


/* SQL generated to create new entity MJ_BizApps_Orders: Instalment Line Billings */

/* SQL text to insert 8 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Instalment Line Billings */

-- ===================== Skipped by the converter, translated by hand =====================
-- CodeGen's related-entity name-field map updates and changed column descriptions.
SELECT __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"('B1B6FEEE-16B1-4B9D-A348-6BBEF0D2C93C'::uuid, 'ChargeType');
