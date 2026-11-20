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
CREATE SCHEMA IF NOT EXISTS __mj_BizAppsOrders;
SET search_path TO __mj_BizAppsOrders, public;

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
-- V202611170400 — SalesAuthorityMixTier: a rep's share limit raised by the
-- order's product mix (golive #281)
-- =============================================================================
-- A rep's SalesAuthority holds one limit on an order's concessions as a share of
-- its net total (MaxConcessionPctOfContract). The pricing policy lets some reps
-- grant more on a deal that spans several product families: for example 10% with
-- two and 15% with three. A product family is a ProductType.
--
-- Each row raises its authority's share limit on an order whose lines span at
-- least MinProductTypes distinct product types. The highest tier met applies; a
-- tier at or below the authority's own limit changes nothing, and an authority
-- with no share limit stays unlimited. Bundle components and reversals are not
-- counted. The count is taken when a concession is recorded and again at confirm.
--
-- RUN CODEGEN AFTER THIS so the new entity, its view, CRUD procs and subclass
-- are generated.
-- =============================================================================

CREATE TABLE __mj_BizAppsOrders."SalesAuthorityMixTier" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SalesAuthorityID" UUID NOT NULL,
 "MinProductTypes" INTEGER NOT NULL,
 "MaxConcessionPctOfContract" DECIMAL(7,4) NOT NULL,
 CONSTRAINT "PK_SalesAuthorityMixTier" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_SalesAuthorityMixTier_SalesAuthority" FOREIGN KEY ("SalesAuthorityID")
 REFERENCES __mj_BizAppsOrders."SalesAuthority"("ID"),
 CONSTRAINT "UQ_SalesAuthorityMixTier_Authority_MinProductTypes" UNIQUE ("SalesAuthorityID", "MinProductTypes"),
 CONSTRAINT "CK_SalesAuthorityMixTier_MinProductTypes" CHECK ("MinProductTypes" >= 2),
 CONSTRAINT "CK_SalesAuthorityMixTier_MaxConcessionPctOfContract" CHECK ("MaxConcessionPctOfContract" >= 0 AND "MaxConcessionPctOfContract" <= 1)
);

ALTER TABLE __mj_BizAppsOrders."SalesAuthorityMixTier"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsOrders.SalesAuthorityMixTier */
ALTER TABLE __mj_BizAppsOrders."SalesAuthorityMixTier"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SalesAuthorityMixTier_SalesAuthorityID" ON __mj_BizAppsOrders."SalesAuthorityMixTier" ("SalesAuthorityID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_BizAppsOrders';
  v_target_name CONSTANT TEXT := 'vwSalesAuthorityMixTiers';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwSalesAuthorityMixTiers"
AS SELECT
    s.*
FROM
    __mj_BizAppsOrders."SalesAuthorityMixTier" AS s$vsql$;
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
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreateSalesAuthorityMixTier]
--     @ID UUID = NULL,
--     @SalesAuthorityID UUID,
--     @MinProductTypes INTEGER,
--     @MaxConcessionPctOfContract...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdateSalesAuthorityMixTier]
--     @ID UUID,
--     @SalesAuthorityID UUID = NULL,
--     @MinProductTypes INTEGER = NULL,
--     @MaxConcessionPctOfC...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeleteSalesAuthorityMixTier]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[SalesAuthorityMixTier]
--     WH...


-- ===================== Triggers =====================

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdateSalesAuthorityMixTier
ON "__mj_BizAppsOrders"."SalesAuthorityMixTier"
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        "__mj_BizAppsOrders".[Sa


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

INSERT INTO ${mjSchema}."Entity" (
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
         "AllowCaching",
         "TrackRecordChanges",
         "AuditRecordAccess",
         "AuditViewRuns",
         "AllowAllRowsAPI",
         "AllowCreateAPI",
         "AllowUpdateAPI",
         "AllowDeleteAPI",
         "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         'e49f94da-17ac-428c-8956-c3a760fc71d7',
         'MJ_BizApps_Orders: Sales Authority Mix Tiers',
         'Sales Authority Mix Tiers',
         'A tier of a rep''s Sales Authority that raises its share limit (MaxConcessionPctOfContract) on an order whose lines span several product types, a product type being a product family. The highest tier the order meets applies. Bundle components and reversals are not counted.',
         NULL,
         'SalesAuthorityMixTier',
         'vwSalesAuthorityMixTiers',
         '__mj_BizAppsOrders',
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
         , NOW()
         , NOW()
      );

/* SQL generated to add entity MJ_BizApps_Orders: Sales Authority Mix Tiers to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */

INSERT INTO ${mjSchema}."ApplicationEntity"
                                    ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                    ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'e49f94da-17ac-428c-8956-c3a760fc71d7', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM ${mjSchema}."ApplicationEntity" WHERE "ApplicationID" = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Sales Authority Mix Tiers for role UI */

INSERT INTO ${mjSchema}."EntityPermission"
                ("EntityID", "RoleID", "Type", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt")
              SELECT CAST('e49f94da-17ac-428c-8956-c3a760fc71d7' AS UUID), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID), 'Allow', 1, 0, 0, 0, NOW(), NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM ${mjSchema}."EntityPermission"
                WHERE "EntityID" = CAST('e49f94da-17ac-428c-8956-c3a760fc71d7' AS UUID) AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID) AND "Type" = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Sales Authority Mix Tiers for role Developer */

INSERT INTO ${mjSchema}."EntityPermission"
                ("EntityID", "RoleID", "Type", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt")
              SELECT CAST('e49f94da-17ac-428c-8956-c3a760fc71d7' AS UUID), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID), 'Allow', 1, 1, 1, 1, NOW(), NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM ${mjSchema}."EntityPermission"
                WHERE "EntityID" = CAST('e49f94da-17ac-428c-8956-c3a760fc71d7' AS UUID) AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID) AND "Type" = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Sales Authority Mix Tiers for role Integration */

INSERT INTO ${mjSchema}."EntityPermission"
                ("EntityID", "RoleID", "Type", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt")
              SELECT CAST('e49f94da-17ac-428c-8956-c3a760fc71d7' AS UUID), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID), 'Allow', 1, 1, 1, 1, NOW(), NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM ${mjSchema}."EntityPermission"
                WHERE "EntityID" = CAST('e49f94da-17ac-428c-8956-c3a760fc71d7' AS UUID) AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID) AND "Type" = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsOrders."SalesAuthorityMixTier" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsOrders."SalesAuthorityMixTier" */
UPDATE "__mj_BizAppsOrders"."SalesAuthorityMixTier" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsOrders.SalesAuthorityMixTier */
ALTER TABLE __mj_BizAppsOrders."SalesAuthorityMixTier" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsOrders."SalesAuthorityMixTier"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsOrders."SalesAuthorityMixTier" */
UPDATE "__mj_BizAppsOrders"."SalesAuthorityMixTier" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsOrders.SalesAuthorityMixTier */
ALTER TABLE __mj_BizAppsOrders."SalesAuthorityMixTier" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsOrders."SalesAuthorityMixTier"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = '0dd392e9-972d-4b8b-b7e4-db40f21340fd' OR ("EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND "Name" = 'ID')
    ) THEN
        INSERT INTO ${mjSchema}."EntityField"
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
        '0dd392e9-972d-4b8b-b7e4-db40f21340fd',
        'E49F94DA-17AC-428C-8956-C3A760FC71D7', -- "Entity": "MJ_BizApps_Orders": "Sales" "Authority" "Mix" "Tiers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7'),
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        0,
        'gen_random_uuid()',
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = 'c2990e7c-ea73-402a-ab00-cdee47e1f2d0' OR ("EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND "Name" = 'SalesAuthorityID')
    ) THEN
        INSERT INTO ${mjSchema}."EntityField"
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
        'c2990e7c-ea73-402a-ab00-cdee47e1f2d0',
        'E49F94DA-17AC-428C-8956-C3A760FC71D7', -- "Entity": "MJ_BizApps_Orders": "Sales" "Authority" "Mix" "Tiers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7'),
        'SalesAuthorityID',
        'Sales Authority ID',
        'The Sales Authority whose share limit this tier raises.',
        'UUID',
        16,
        0,
        0,
        0,
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
        1,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = '23d7b025-7fa8-4966-8343-cb65f8fa97a3' OR ("EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND "Name" = 'MinProductTypes')
    ) THEN
        INSERT INTO ${mjSchema}."EntityField"
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
        '23d7b025-7fa8-4966-8343-cb65f8fa97a3',
        'E49F94DA-17AC-428C-8956-C3A760FC71D7', -- "Entity": "MJ_BizApps_Orders": "Sales" "Authority" "Mix" "Tiers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7'),
        'MinProductTypes',
        'Min Product Types',
        'The fewest distinct product types the order''s lines must span for this tier to apply. Two or more, unique per authority.',
        'INTEGER',
        4,
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
        1,
        0,
        1,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = 'e8ebcd08-ff4a-4a60-b3fb-2de98af8744f' OR ("EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND "Name" = 'MaxConcessionPctOfContract')
    ) THEN
        INSERT INTO ${mjSchema}."EntityField"
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
        'e8ebcd08-ff4a-4a60-b3fb-2de98af8744f',
        'E49F94DA-17AC-428C-8956-C3A760FC71D7', -- "Entity": "MJ_BizApps_Orders": "Sales" "Authority" "Mix" "Tiers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7'),
        'MaxConcessionPctOfContract',
        'Max Concession Pct Of Contract',
        'The share limit, as a fraction from 0 to 1, on an order that meets this tier: the order''s concessions as a share of its net total at or above it need approval, as for SalesAuthority.MaxConcessionPctOfContract. Only raises that limit; a value at or below it changes nothing.',
        'decimal',
        5,
        7,
        4,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = 'e3cbb803-822c-4dd0-a9f3-542cce94360c' OR ("EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO ${mjSchema}."EntityField"
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
        'e3cbb803-822c-4dd0-a9f3-542cce94360c',
        'E49F94DA-17AC-428C-8956-C3A760FC71D7', -- "Entity": "MJ_BizApps_Orders": "Sales" "Authority" "Mix" "Tiers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7'),
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        0,
        'NOW()',
        0,
        0,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = '7e632b65-c80d-47ea-9540-5c2d088f78b4' OR ("EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO ${mjSchema}."EntityField"
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
        '7e632b65-c80d-47ea-9540-5c2d088f78b4',
        'E49F94DA-17AC-428C-8956-C3A760FC71D7', -- "Entity": "MJ_BizApps_Orders": "Sales" "Authority" "Mix" "Tiers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7'),
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        0,
        'NOW()',
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityRelationship" WHERE "ID" = 'a1abea7f-a61a-4121-ac08-76f00ec7cbb2' OR ("EntityID" = '29E748BF-E356-4AC1-BCE5-71E05279BAF8' AND "RelatedEntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND "RelatedEntityJoinField" = 'SalesAuthorityID')
    ) THEN
        INSERT INTO ${mjSchema}."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('a1abea7f-a61a-4121-ac08-76f00ec7cbb2', '29E748BF-E356-4AC1-BCE5-71E05279BAF8', 'E49F94DA-17AC-428C-8956-C3A760FC71D7', 'SalesAuthorityID', 'One To Many', 1, 1, 3, NOW(), NOW());
    END IF;
END $$;

UPDATE ${mjSchema}."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C2990E7C-EA73-402A-AB00-CDEE47E1F2D0'
               AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 6 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Authority Mix Tiers.ID

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '0DD392E9-972D-4B8B-B7E4-DB40F21340FD';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Authority Mix Tiers.SalesAuthorityID

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'Mix Tier Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Sales Authority'
WHERE 
   "ID" = 'C2990E7C-EA73-402A-AB00-CDEE47E1F2D0';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Authority Mix Tiers.MinProductTypes

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'Mix Tier Configuration',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '23D7B025-7FA8-4966-8343-CB65F8FA97A3';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Authority Mix Tiers.MaxConcessionPctOfContract

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'Mix Tier Configuration',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = 'E8EBCD08-FF4A-4A60-B3FB-2DE98AF8744F';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Authority Mix Tiers.__mj_CreatedAt

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = 'E3CBB803-822C-4DD0-A9F3-542CCE94360C';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Authority Mix Tiers.__mj_UpdatedAt

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '7E632B65-C80D-47EA-9540-5C2D088F78B4';

/* Set entity icon to fa fa-layer-group */

UPDATE ${mjSchema}."Entity"
               SET "Icon" = 'fa fa-layer-group', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7';

/* Insert FieldCategoryInfo setting for entity */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntitySetting" WHERE "EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND "Name" = 'FieldCategoryInfo'
    ) THEN
        INSERT INTO ${mjSchema}."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('beceff75-c3de-5432-9cc3-d2b07401bd35', 'E49F94DA-17AC-428C-8956-C3A760FC71D7', 'FieldCategoryInfo', '{
        "Mix Tier Configuration": {
        "description": "Configuration settings defining product type spans and concession limits for sales authority mix tiers",
        "icon": "fa fa-sliders-h"
        },
        "System Metadata": {
        "description": "System-managed audit and tracking fields",
        "icon": "fa fa-cog"
        }
        }', NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntitySetting" WHERE "EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND "Name" = 'FieldCategoryIcons'
    ) THEN
        INSERT INTO ${mjSchema}."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('c5df98e6-c164-53f9-bb0e-b2257de119d0', 'E49F94DA-17AC-428C-8956-C3A760FC71D7', 'FieldCategoryIcons', '{
        "Mix Tier Configuration": "fa fa-sliders-h",
        "System Metadata": "fa fa-cog"
        }', NOW(), NOW());
    END IF;
END $$;

UPDATE ${mjSchema}."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'E49F94DA-17AC-428C-8956-C3A760FC71D7';

/* Generated Validation Functions for MJ_BizApps_Orders: Sales Authority Mix Tiers */
-- CHECK constraint for MJ_BizApps_Orders: Sales Authority Mix Tiers: Field: MaxConcessionPctOfContract was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'E8EBCD08-FF4A-4A60-B3FB-2DE98AF8744F'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('4f8e3890-9e46-43cf-9d4d-fba8f4bc8d46', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', NOW(), 'TypeScript', 'Approved', '([MaxConcessionPctOfContract]>=(0) AND [MaxConcessionPctOfContract]<=(1))', 'public ValidateMaxConcessionPctOfContractRange(result: ValidationResult) {
        if (this.MaxConcessionPctOfContract != null && (this.MaxConcessionPctOfContract < 0 || this.MaxConcessionPctOfContract > 1)) {
        result.Errors.push(new ValidationErrorInfo(
        "MaxConcessionPctOfContract",
        "Maximum concession percentage of contract must be between 0 and 1.",
        this.MaxConcessionPctOfContract,
        ValidationErrorType.Failure
        ));
        }
        }', 'Maximum concession percentage of contract must be between 0 and 1 (inclusive), representing a percentage from 0% to 100%.', 'ValidateMaxConcessionPctOfContractRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'E8EBCD08-FF4A-4A60-B3FB-2DE98AF8744F');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '23D7B025-7FA8-4966-8343-CB65F8FA97A3'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('36c5f30f-8826-403c-92fa-4fe6ceb18bba', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', NOW(), 'TypeScript', 'Approved', '([MinProductTypes]>=(2))', 'public ValidateMinProductTypesMinimum(result: ValidationResult) {
        if (this.MinProductTypes != null && this.MinProductTypes < 2) {
        result.Errors.push(new ValidationErrorInfo(
        "MinProductTypes",
        "Minimum product types must be at least 2.",
        this.MinProductTypes,
        ValidationErrorType.Failure
        ));
        }
        }', 'Minimum product types must be at least 2.', 'ValidateMinProductTypesMinimum', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '23D7B025-7FA8-4966-8343-CB65F8FA97A3');
    END IF;
END $$;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwSalesAuthorityMixTiers" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Sales Authority Mix Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
-- Item: Permissions for vwSalesAuthorityMixTiers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwSalesAuthorityMixTiers" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Orders: Sales Authority Mix Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
-- Item: spCreateSalesAuthorityMixTier
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SalesAuthorityMixTier
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSalesAuthorityMixTier" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Sales Authority Mix Tiers */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSalesAuthorityMixTier" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Sales Authority Mix Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
-- Item: spUpdateSalesAuthorityMixTier
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SalesAuthorityMixTier
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSalesAuthorityMixTier" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSalesAuthorityMixTier" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Orders: Sales Authority Mix Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
-- Item: spDeleteSalesAuthorityMixTier
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SalesAuthorityMixTier
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSalesAuthorityMixTier" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Sales Authority Mix Tiers */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSalesAuthorityMixTier" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON TABLE __mj_BizAppsOrders."SalesAuthorityMixTier" IS 'A tier of a rep''s Sales Authority that raises its share limit (MaxConcessionPctOfContract) on an order whose lines span several product types, a product type being a product family. The highest tier the order meets applies. Bundle components and reversals are not counted.';

COMMENT ON COLUMN __mj_BizAppsOrders."SalesAuthorityMixTier"."SalesAuthorityID" IS 'The Sales Authority whose share limit this tier raises.';

COMMENT ON COLUMN __mj_BizAppsOrders."SalesAuthorityMixTier"."MinProductTypes" IS 'The fewest distinct product types the order''s lines must span for this tier to apply. Two or more, unique per authority.';

COMMENT ON COLUMN __mj_BizAppsOrders."SalesAuthorityMixTier"."MaxConcessionPctOfContract" IS 'The share limit, as a fraction from 0 to 1, on an order that meets this tier: the order''s concessions as a share of its net total at or above it need approval, as for SalesAuthority.MaxConcessionPctOfContract. Only raises that limit; a value at or below it changes nothing.';


-- ===================== Other =====================

-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen 6.2.1 against a database built from migrations alone,
--   with the hand-authored DDL above applied. Contains the new
--   MJ_BizApps_Orders: Sales Authority Mix Tiers entity (metadata, fields,
--   relationship from Sales Authorities, view, CRUD procs, trigger, validators).
--   The same run also re-emitted SQL for entities this migration does not
--   touch; that output is left out.
--
-- =============================================================================


/* SQL generated to create new entity MJ_BizApps_Orders: Sales Authority Mix Tiers */

/* SQL text to insert 6 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Sales Authority Mix Tiers */
