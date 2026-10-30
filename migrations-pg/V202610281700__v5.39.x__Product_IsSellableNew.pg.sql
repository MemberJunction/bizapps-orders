-- =============================================================================================
-- PostgreSQL counterpart of V202610281700__v5.39.x__Product_IsSellableNew.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres --schema __mj_BizAppsOrders` (MJ CLI 6.1.6) output,
-- finished by hand:
--   * Columns, defaults, indexes, views, data, comments and grants are the converter's.
--   * CodeGen's CRUD procedures (spCreate/spUpdate/spDelete) and its __mj_UpdatedAt triggers are
--     NOT here: the converter cannot translate T-SQL procedures or triggers, and this repository
--     has no PostgreSQL baseline to run MJ CodeGen against. A PostgreSQL host runs `mj codegen`
--     after installing, which generates them natively. The converter's notes for them remain,
--     fully commented out.
--   * The two EntityField inserts write TRUE/FALSE where the converter left the T-SQL's 0/1:
--     those columns are BOOLEAN, and PostgreSQL does not cast an integer to one on insert.
-- Schema names are written unquoted, as the converter emits them, so they fold to the lowercase
-- schema a PostgreSQL install uses.
-- =============================================================================================

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
-- V202610281700 — Product.IsSellableNew: products kept for history, not for a
--                 new sale
-- =============================================================================
-- Some Active products exist only so that past or recurring business has
-- somewhere to land: the per-company catch-all products a Business Central
-- import books invoice lines to, and the products converted subscriptions
-- renew on. Nobody should pick them for a new sale, but they must stay Active:
-- pricing refuses any line whose product is not Active, on every later save of
-- the order, so retiring them would stop existing orders, imports and renewals
-- from saving (bc-aidp-next-golive#360).
--
-- IsSellableNew = 0 takes a product out of the add-product pickers (orders'
-- catalog options, and sales' deal line editor) and nothing else. Pricing,
-- renewals and imports do not read it.
--
-- Existing rows: every product defaults to 1, so nothing leaves a picker until
-- a host sets the flag on its own products.
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
--
-- CodeGen output for this app is folded below the banner at the end of this file.
-- =============================================================================

ALTER TABLE __mj_BizAppsOrders."Product"
 ADD COLUMN IF NOT EXISTS "IsSellableNew" BOOLEAN NOT NULL CONSTRAINT "DF_Product_IsSellableNew" DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Product_ProductTypeID" ON __mj_BizAppsOrders."Product" ("ProductTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Product_ProductCategoryID" ON __mj_BizAppsOrders."Product" ("ProductCategoryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Product_CompanyID" ON __mj_BizAppsOrders."Product" ("CompanyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Product_SuccessorProductID" ON __mj_BizAppsOrders."Product" ("SuccessorProductID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Product_RevenueRecognitionTypeID" ON __mj_BizAppsOrders."Product" ("RevenueRecognitionTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Product_SubscriptionTypeID" ON __mj_BizAppsOrders."Product" ("SubscriptionTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Product_SubscriptionFamilyID" ON __mj_BizAppsOrders."Product" ("SubscriptionFamilyID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_BizAppsOrders';
  v_target_name CONSTANT TEXT := 'vwEventProducts';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwEventProducts"
AS SELECT
    e.*,
    ${mjSchema}_isa_p1."Name",
    ${mjSchema}_isa_p1."SKU",
    ${mjSchema}_isa_p1."ProductTypeID",
    ${mjSchema}_isa_p1."ProductCategoryID",
    ${mjSchema}_isa_p1."CompanyID",
    ${mjSchema}_isa_p1."Status",
    ${mjSchema}_isa_p1."SuccessorProductID",
    ${mjSchema}_isa_p1."AvailableFrom",
    ${mjSchema}_isa_p1."AvailableTo",
    ${mjSchema}_isa_p1."RevenueRecognitionTypeID",
    ${mjSchema}_isa_p1."StandaloneSellingPrice",
    ${mjSchema}_isa_p1."SubscriptionTypeID",
    ${mjSchema}_isa_p1."IsTaxable",
    ${mjSchema}_isa_p1."Description",
    ${mjSchema}_isa_p1."TaxCategory",
    ${mjSchema}_isa_p1."EntitlementGrantTiming",
    ${mjSchema}_isa_p1."EntitlementQuantityMode",
    ${mjSchema}_isa_p1."EntitlementValidityMode",
    ${mjSchema}_isa_p1."PricingDriverClass",
    ${mjSchema}_isa_p1."MaxQuantityPerLine",
    ${mjSchema}_isa_p1."SubscriptionFamilyID",
    ${mjSchema}_isa_p1."RenewalIncreasePercent",
    ${mjSchema}_isa_p1."RequiresSaleApproval",
    ${mjSchema}_isa_p1."IsSellableNew",
    "mjBizAppsCommonAddress_VenueAddressID"."DisplayName" AS "VenueAddress"
FROM
    __mj_BizAppsOrders."EventProduct" AS e
INNER JOIN
    __mj_BizAppsOrders."Product" AS ${mjSchema}_isa_p1
  ON
    e."ID" = ${mjSchema}_isa_p1."ID"
LEFT OUTER JOIN
    ${mjSchema}_BizAppsCommon."Address" AS "mjBizAppsCommonAddress_VenueAddressID"
  ON
    e."VenueAddressID" = "mjBizAppsCommonAddress_VenueAddressID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwProducts';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwProducts"
AS SELECT
    p.*,
    "mjBizAppsOrdersProductType_ProductTypeID"."Name" AS "ProductType",
    "mjBizAppsOrdersProductCategory_ProductCategoryID"."Name" AS "ProductCategory",
    "MJCompany_CompanyID"."Name" AS "Company",
    "mjBizAppsOrdersProduct_SuccessorProductID"."Name" AS "SuccessorProduct",
    "mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID"."Name" AS "RevenueRecognitionType",
    "mjBizAppsOrdersSubscriptionType_SubscriptionTypeID"."Name" AS "SubscriptionType",
    "mjBizAppsOrdersSubscriptionFamily_SubscriptionFamilyID"."Name" AS "SubscriptionFamily"
FROM
    __mj_BizAppsOrders."Product" AS p
INNER JOIN
    __mj_BizAppsOrders."ProductType" AS "mjBizAppsOrdersProductType_ProductTypeID"
  ON
    p."ProductTypeID" = "mjBizAppsOrdersProductType_ProductTypeID"."ID"
INNER JOIN
    __mj_BizAppsOrders."ProductCategory" AS "mjBizAppsOrdersProductCategory_ProductCategoryID"
  ON
    p."ProductCategoryID" = "mjBizAppsOrdersProductCategory_ProductCategoryID"."ID"
INNER JOIN
    ${mjSchema}."Company" AS "MJCompany_CompanyID"
  ON
    p."CompanyID" = "MJCompany_CompanyID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."Product" AS "mjBizAppsOrdersProduct_SuccessorProductID"
  ON
    p."SuccessorProductID" = "mjBizAppsOrdersProduct_SuccessorProductID"."ID"
INNER JOIN
    __mj_BizAppsOrders."RevenueRecognitionType" AS "mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID"
  ON
    p."RevenueRecognitionTypeID" = "mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."SubscriptionType" AS "mjBizAppsOrdersSubscriptionType_SubscriptionTypeID"
  ON
    p."SubscriptionTypeID" = "mjBizAppsOrdersSubscriptionType_SubscriptionTypeID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."SubscriptionFamily" AS "mjBizAppsOrdersSubscriptionFamily_SubscriptionFamilyID"
  ON
    p."SubscriptionFamilyID" = "mjBizAppsOrdersSubscriptionFamily_SubscriptionFamilyID"."ID"$vsql$;
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
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreateEventProduct]
--     @ID UUID = NULL,
--     @EventStartsAt datetimeoffset,
--     @EventEndsAt_Clear bit = 0,
--     @EventEndsAt datetimeoffset = NULL,...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdateEventProduct]
--     @ID UUID,
--     @EventStartsAt datetimeoffset = NULL,
--     @EventEndsAt_Clear bit = 0,
--     @EventEndsAt datetimeoffset = NULL,...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeleteEventProduct]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[EventProduct]
--     WHERE
--         [ID] =...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreateProduct]
--     @ID UUID = NULL,
--     @Name VARCHAR(200),
--     @SKU_Clear bit = 0,
--     @SKU VARCHAR(80) = NULL,
--     @ProductTypeID uniqueidentif...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdateProduct]
--     @ID UUID,
--     @Name VARCHAR(200) = NULL,
--     @SKU_Clear bit = 0,
--     @SKU VARCHAR(80) = NULL,
--     @ProductTypeID uniqueidentif...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeleteProduct]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[Product]
--     WHERE
--         [ID] = @ID
-- 
-- 
--    ...


-- ===================== Triggers =====================

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdateEventProduct
ON "__mj_BizAppsOrders"."EventProduct"
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        "__mj_BizAppsOrders"."EventProduct"
    SE

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdateProduct
ON "__mj_BizAppsOrders"."Product"
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        "__mj_BizAppsOrders"."Product"
    SET
        __mj_


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = '2e8f1b22-5d95-44d2-8ed6-4d579aed5d9d' OR ("EntityID" = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND "Name" = 'IsSellableNew')
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
        '2e8f1b22-5d95-44d2-8ed6-4d579aed5d9d',
        'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', -- "Entity": "MJ_BizApps_Orders": "Products"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5'),
        'IsSellableNew',
        'Is Sellable New',
        '0 = kept for existing orders, imports and renewals, and not offered by the add-product pickers for a new sale. Pricing ignores it.',
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

INSERT INTO ${mjSchema}."EntityField" (
                  "ID", "EntityID", "Name", "Type", "AllowsNull",
                  "Length", "Precision", "Scale",
                  "Sequence", "IsVirtual", "AllowUpdateAPI",
                  "IsPrimaryKey", "IsUnique",
                  "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES (
                  '1abf1396-a79f-4d48-b605-2b42224f1cc2', 'B090A662-A97A-4748-B109-2FA716C14651', 'IsSellableNew',
                  'bit', FALSE,
                  1, 1, 0,
                  (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'B090A662-A97A-4748-B109-2FA716C14651'), TRUE, TRUE, FALSE, FALSE,
                  NOW(), NOW());

/* Update entity timestamp for MJ_BizApps_Orders: Event Products after IS-A field sync */

UPDATE ${mjSchema}."Entity" SET "__mj_UpdatedAt"=NOW() WHERE "ID"='B090A662-A97A-4748-B109-2FA716C14651';

/* SQL text to update display name for field IsSellableNew */

UPDATE ${mjSchema}."EntityField" SET "__mj_UpdatedAt"=NOW(), "DisplayName" = 'Is Sellable New' WHERE "ID" = '1ABF1396-A79F-4D48-B605-2B42224F1CC2';

/* Base View SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: vwEventProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Event Products
-----               SCHEMA:      __mj_BizAppsOrders
-----               BASE TABLE:  EventProduct
-----               PRIMARY KEY: ID
------------------------------------------------------------

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'Catalog Lifecycle',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '2E8F1B22-5D95-44D2-8ED6-4D579AED5D9D';


-- ===================== Grants =====================

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwEventProducts" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwEventProducts" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwEventProducts" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwEventProducts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: Permissions for vwEventProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwEventProducts" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwEventProducts" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwEventProducts" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwEventProducts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: spCreateEventProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventProduct
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateEventProduct" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateEventProduct" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateEventProduct" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Event Products */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateEventProduct" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateEventProduct" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateEventProduct" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: spUpdateEventProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventProduct
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateEventProduct" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateEventProduct" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateEventProduct" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateEventProduct" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateEventProduct" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateEventProduct" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: spDeleteEventProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventProduct
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteEventProduct" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteEventProduct" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteEventProduct" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Event Products */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteEventProduct" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteEventProduct" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteEventProduct" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- Entity: MJ_BizApps_Orders: Products
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProductTypeID in table Product;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwProducts" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwProducts" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwProducts" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwProducts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: Permissions for vwProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwProducts" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwProducts" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwProducts" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwProducts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: spCreateProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Product
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateProduct" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateProduct" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateProduct" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Products */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateProduct" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateProduct" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateProduct" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: spUpdateProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Product
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateProduct" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateProduct" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateProduct" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateProduct" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateProduct" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateProduct" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: spDeleteProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Product
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteProduct" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteProduct" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteProduct" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Products */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteProduct" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteProduct" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteProduct" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Products.IsSellableNew;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."Product"."IsSellableNew" IS '0 = kept for existing orders, imports and renewals, and not offered by the add-product pickers for a new sale. Pricing ignores it.';


-- ===================== Other =====================

-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
-- =============================================================================


/* SQL text to insert 1 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Event Products */

/* spUpdate Permissions for MJ_BizApps_Orders: Products */
