-- =============================================================================================
-- PostgreSQL counterpart of V202610131505__v5.32.x__PaymentProviderPrice.sql
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
-- V202610131505 — PaymentProviderPrice: which Orders product a gateway price sells
-- (bizapps-orders#481)
-- =============================================================================
-- A card payment can reach the gateway with no order behind it: the buyer paid a
-- payment link or a hosted checkout nobody keyed an order for. Orders creates the
-- order from the payment, and the product it carries is chosen by the gateway
-- price the checkout sold. This table holds that choice, per payment provider.
--
-- A price with no row here is not guessed: the charge stays a finance exception
-- for a person to resolve. An empty table therefore creates no orders, which is
-- how a host turns the automatic path on: by mapping its prices.
--
-- ProviderPriceID is the gateway's own id (for Stripe, price_...). Unique per
-- provider; two providers can be two accounts with their own ids.
-- =============================================================================

CREATE TABLE __mj_BizAppsOrders."PaymentProviderPrice" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PaymentProviderID" UUID NOT NULL,
 "ProviderPriceID" VARCHAR(255) NOT NULL,
 "ProductID" UUID NOT NULL,
 "Description" VARCHAR(255) NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT "PK_PaymentProviderPrice" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_PaymentProviderPrice_PaymentProvider" FOREIGN KEY ("PaymentProviderID")
 REFERENCES __mj_BizAppsOrders."PaymentProvider"("ID"),
 CONSTRAINT "FK_PaymentProviderPrice_Product" FOREIGN KEY ("ProductID")
 REFERENCES __mj_BizAppsOrders."Product"("ID"),
 CONSTRAINT "UQ_PaymentProviderPrice_Provider_Price" UNIQUE ("PaymentProviderID", "ProviderPriceID")
);

ALTER TABLE __mj_BizAppsOrders."PaymentProviderPrice"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsOrders.PaymentProviderPrice */
ALTER TABLE __mj_BizAppsOrders."PaymentProviderPrice"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_PaymentProviderPrice_PaymentProviderID" ON __mj_BizAppsOrders."PaymentProviderPrice" ("PaymentProviderID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_PaymentProviderPrice_ProductID" ON __mj_BizAppsOrders."PaymentProviderPrice" ("ProductID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_BizAppsOrders';
  v_target_name CONSTANT TEXT := 'vwPaymentProviderPrices';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwPaymentProviderPrices"
AS SELECT
    p.*,
    "mjBizAppsOrdersPaymentProvider_PaymentProviderID"."Name" AS "PaymentProvider",
    "mjBizAppsOrdersProduct_ProductID"."Name" AS "Product"
FROM
    __mj_BizAppsOrders."PaymentProviderPrice" AS p
INNER JOIN
    __mj_BizAppsOrders."PaymentProvider" AS "mjBizAppsOrdersPaymentProvider_PaymentProviderID"
  ON
    p."PaymentProviderID" = "mjBizAppsOrdersPaymentProvider_PaymentProviderID"."ID"
INNER JOIN
    __mj_BizAppsOrders."Product" AS "mjBizAppsOrdersProduct_ProductID"
  ON
    p."ProductID" = "mjBizAppsOrdersProduct_ProductID"."ID"$vsql$;
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
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreatePaymentProviderPrice]
--     @ID UUID = NULL,
--     @PaymentProviderID UUID,
--     @ProviderPriceID VARCHAR(255),
--     @ProductID unique...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdatePaymentProviderPrice]
--     @ID UUID,
--     @PaymentProviderID UUID = NULL,
--     @ProviderPriceID VARCHAR(255) = NULL,
--     @ProductID...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeletePaymentProviderPrice]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[PaymentProviderPrice]
--     WHER...


-- ===================== Triggers =====================

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdatePaymentProviderPrice
-- ON "__mj_BizAppsOrders"."PaymentProviderPrice"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders".[Paym


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
         'af2eaf51-4097-425f-baae-db3773f5ef03',
         'MJ_BizApps_Orders: Payment Provider Prices',
         'Payment Provider Prices',
         'Which Orders product a payment gateway''s price sells, per payment provider. An order created from a charge that matched no order carries the product its checkout''s price maps to here; a price with no active row creates no order and stays a finance exception.',
         NULL,
         'PaymentProviderPrice',
         'vwPaymentProviderPrices',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Payment Provider Prices to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'af2eaf51-4097-425f-baae-db3773f5ef03', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Payment Provider Prices for role UI */

INSERT INTO __mj."EntityPermission"
                ("EntityID", "RoleID", "Type", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt")
              SELECT CAST('af2eaf51-4097-425f-baae-db3773f5ef03' AS UUID), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID), 'Allow', 1, 0, 0, 0, NOW(), NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM __mj."EntityPermission"
                WHERE "EntityID" = CAST('af2eaf51-4097-425f-baae-db3773f5ef03' AS UUID) AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID) AND "Type" = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Payment Provider Prices for role Developer */

INSERT INTO __mj."EntityPermission"
                ("EntityID", "RoleID", "Type", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt")
              SELECT CAST('af2eaf51-4097-425f-baae-db3773f5ef03' AS UUID), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID), 'Allow', 1, 1, 1, 1, NOW(), NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM __mj."EntityPermission"
                WHERE "EntityID" = CAST('af2eaf51-4097-425f-baae-db3773f5ef03' AS UUID) AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID) AND "Type" = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Payment Provider Prices for role Integration */

INSERT INTO __mj."EntityPermission"
                ("EntityID", "RoleID", "Type", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt")
              SELECT CAST('af2eaf51-4097-425f-baae-db3773f5ef03' AS UUID), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID), 'Allow', 1, 1, 1, 1, NOW(), NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM __mj."EntityPermission"
                WHERE "EntityID" = CAST('af2eaf51-4097-425f-baae-db3773f5ef03' AS UUID) AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID) AND "Type" = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsOrders.PaymentProviderPrice */

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsOrders.PaymentProviderPrice */
UPDATE "__mj_BizAppsOrders"."PaymentProviderPrice" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsOrders.PaymentProviderPrice */
ALTER TABLE __mj_BizAppsOrders."PaymentProviderPrice" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsOrders."PaymentProviderPrice"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsOrders.PaymentProviderPrice */
UPDATE "__mj_BizAppsOrders"."PaymentProviderPrice" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsOrders.PaymentProviderPrice */
ALTER TABLE __mj_BizAppsOrders."PaymentProviderPrice" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsOrders."PaymentProviderPrice"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '836ecb5f-95c1-4260-91e8-46cca6e08c8b' OR ("EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND "Name" = 'ID')
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
        '836ecb5f-95c1-4260-91e8-46cca6e08c8b',
        'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- "Entity": "MJ_BizApps_Orders": "Payment" "Provider" "Prices"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f595189a-d5cf-49a2-82c1-4fe3297464f2' OR ("EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND "Name" = 'PaymentProviderID')
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
        'f595189a-d5cf-49a2-82c1-4fe3297464f2',
        'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- "Entity": "MJ_BizApps_Orders": "Payment" "Provider" "Prices"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
        'PaymentProviderID',
        'Payment Provider ID',
        'The payment provider (gateway account) the price belongs to.',
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
        'FDC49E63-B229-40BB-9ABC-F384D7750123',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aa927408-489b-430a-8ae8-721ba1580480' OR ("EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND "Name" = 'ProviderPriceID')
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
        'aa927408-489b-430a-8ae8-721ba1580480',
        'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- "Entity": "MJ_BizApps_Orders": "Payment" "Provider" "Prices"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
        'ProviderPriceID',
        'Provider Price ID',
        'The gateway''s own price id (for Stripe, price_...). Unique per provider.',
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'daaa6c0d-c1e9-47e8-9ae8-1f6be49ed1f6' OR ("EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND "Name" = 'ProductID')
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
        'daaa6c0d-c1e9-47e8-9ae8-1f6be49ed1f6',
        'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- "Entity": "MJ_BizApps_Orders": "Payment" "Provider" "Prices"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
        'ProductID',
        'Product ID',
        'The Orders product an order created from a charge for this price carries.',
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
        'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8296bcb4-de8c-4cda-ae7b-0c0dd665f914' OR ("EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND "Name" = 'Description')
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
        '8296bcb4-de8c-4cda-ae7b-0c0dd665f914',
        'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- "Entity": "MJ_BizApps_Orders": "Payment" "Provider" "Prices"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
        'Description',
        'Description',
        'What the price is, in the gateway''s or finance''s words, for the people maintaining the map. Not read by code.',
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ffe2e43c-2888-45ad-930f-c6755256cb6c' OR ("EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND "Name" = 'IsActive')
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
        'ffe2e43c-2888-45ad-930f-c6755256cb6c',
        'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- "Entity": "MJ_BizApps_Orders": "Payment" "Provider" "Prices"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
        'IsActive',
        'Is Active',
        'Whether the map is used. An inactive row creates no orders, as if the price were unmapped.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5c45488a-e027-47a7-971a-a6367ebe0229' OR ("EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND "Name" = '__mj_CreatedAt')
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
        '5c45488a-e027-47a7-971a-a6367ebe0229',
        'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- "Entity": "MJ_BizApps_Orders": "Payment" "Provider" "Prices"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6951e480-5ae9-4abc-a934-96d04622dc42' OR ("EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND "Name" = '__mj_UpdatedAt')
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
        '6951e480-5ae9-4abc-a934-96d04622dc42',
        'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- "Entity": "MJ_BizApps_Orders": "Payment" "Provider" "Prices"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
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
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'de1ec163-4ff5-4582-8716-6e920a7fb704'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('de1ec163-4ff5-4582-8716-6e920a7fb704', 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', 'ProductID', 'One To Many', TRUE, TRUE, 11, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '67f535c9-b9b4-4104-99d1-deab4c423e03'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('67f535c9-b9b4-4104-99d1-deab4c423e03', 'FDC49E63-B229-40BB-9ABC-F384D7750123', 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', 'PaymentProviderID', 'One To Many', TRUE, TRUE, 10, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5c0d159d-f563-454b-b9ce-776e16487970' OR ("EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND "Name" = 'PaymentProvider')
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
        '5c0d159d-f563-454b-b9ce-776e16487970',
        'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- "Entity": "MJ_BizApps_Orders": "Payment" "Provider" "Prices"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
        'PaymentProvider',
        'Payment Provider',
        NULL,
        'TEXT',
        400,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4a8e2f8d-c3e6-4ae8-a942-0cc51e042308' OR ("EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND "Name" = 'Product')
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
        '4a8e2f8d-c3e6-4ae8-a942-0cc51e042308',
        'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- "Entity": "MJ_BizApps_Orders": "Payment" "Provider" "Prices"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
        'Product',
        'Product',
        NULL,
        'TEXT',
        400,
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

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'AA927408-489B-430A-8AE8-721BA1580480'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'FFE2E43C-2888-45AD-930F-C6755256CB6C'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '5C0D159D-F563-454B-B9CE-776E16487970'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '4A8E2F8D-C3E6-4AE8-A942-0CC51E042308'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = FALSE
            WHERE "ID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.PaymentProviderID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Gateway Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Payment Provider'
WHERE 
   "ID" = 'F595189A-D5CF-49A2-82C1-4FE3297464F2';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.PaymentProvider

UPDATE __mj."EntityField"
SET 
   "Category" = 'Gateway Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Payment Provider Name'
WHERE 
   "ID" = '5C0D159D-F563-454B-B9CE-776E16487970';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.ProviderPriceID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Gateway Configuration',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = 'AA927408-489B-430A-8AE8-721BA1580480';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.ProductID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Product'
WHERE 
   "ID" = 'DAAA6C0D-C1E9-47E8-9AE8-1F6BE49ED1F6';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.Product

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Product Name'
WHERE 
   "ID" = '4A8E2F8D-C3E6-4AE8-A942-0CC51E042308';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.Description

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '8296BCB4-DE8C-4CDA-AE7B-0C0DD665F914';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.IsActive

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = 'FFE2E43C-2888-45AD-930F-C6755256CB6C';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '5C45488A-E027-47A7-971A-A6367EBE0229';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '6951E480-5AE9-4ABC-A934-96D04622DC42';

/* Set entity icon to fa fa-money-bill-wave */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-money-bill-wave', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03';

/* Insert FieldCategoryInfo setting for entity */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND "Name" = 'FieldCategoryInfo'
    ) THEN
        INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('3a954a6e-9041-5def-b5a2-9e3f8f17fb84', 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', 'FieldCategoryInfo', '{
  "Gateway Configuration": {
    "description": "Settings related to the external payment gateway and price identifiers",
    "icon": "fa fa-credit-card"
  },
  "Mapping Details": {
    "description": "Configuration for mapping external gateway prices to internal products",
    "icon": "fa fa-exchange-alt"
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
        SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND "Name" = 'FieldCategoryIcons'
    ) THEN
        INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('b67c009f-beb8-57a2-92cf-021eaf244e20', 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', 'FieldCategoryIcons', '{
  "Gateway Configuration": "fa fa-credit-card",
  "Mapping Details": "fa fa-exchange-alt",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
    END IF;
END $$;

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03';


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwPaymentProviderPrices" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: Permissions for vwPaymentProviderPrices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwPaymentProviderPrices" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: spCreatePaymentProviderPrice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentProviderPrice
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProviderPrice" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Payment Provider Prices */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProviderPrice" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: spUpdatePaymentProviderPrice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentProviderPrice
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProviderPrice" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProviderPrice" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: spDeletePaymentProviderPrice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentProviderPrice
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderPrice" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Payment Provider Prices */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderPrice" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert 2 new entity field(s) */


-- ===================== Comments =====================

COMMENT ON TABLE __mj_BizAppsOrders."PaymentProviderPrice" IS 'Which Orders product a payment gateway''s price sells, per payment provider. An order created from a charge that matched no order carries the product its checkout''s price maps to here; a price with no active row creates no order and stays a finance exception.';

COMMENT ON COLUMN __mj_BizAppsOrders."PaymentProviderPrice"."PaymentProviderID" IS 'The payment provider (gateway account) the price belongs to.';

COMMENT ON COLUMN __mj_BizAppsOrders."PaymentProviderPrice"."ProviderPriceID" IS 'The gateway''s own price id (for Stripe, price_...). Unique per provider.';

COMMENT ON COLUMN __mj_BizAppsOrders."PaymentProviderPrice"."ProductID" IS 'The Orders product an order created from a charge for this price carries.';

COMMENT ON COLUMN __mj_BizAppsOrders."PaymentProviderPrice"."Description" IS 'What the price is, in the gateway''s or finance''s words, for the people maintaining the map. Not read by code.';

COMMENT ON COLUMN __mj_BizAppsOrders."PaymentProviderPrice"."IsActive" IS 'Whether the map is used. An inactive row creates no orders, as if the price were unmapped.';


-- ===================== Other =====================

-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL (the Payment Provider Prices entity, its fields and
-- relationships, the base view and CRUD procs) is folded here by scripts/append-codegen.sh.
-- =============================================================================


/* SQL generated to create new entity MJ_BizApps_Orders: Payment Provider Prices */

/* SQL text to insert 8 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Provider Prices */

-- ===================== Skipped by the converter, translated by hand =====================
-- CodeGen's related-entity name-field map updates and changed column descriptions.
SELECT __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"('F595189A-D5CF-49A2-82C1-4FE3297464F2'::uuid, 'PaymentProvider');
SELECT __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"('DAAA6C0D-C1E9-47E8-9AE8-1F6BE49ED1F6'::uuid, 'Product');
