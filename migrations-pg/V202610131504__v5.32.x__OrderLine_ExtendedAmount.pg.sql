-- =============================================================================================
-- PostgreSQL counterpart of V202610131504__v5.32.x__OrderLine_ExtendedAmount.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) output, finished by hand:
--   * Tables, columns, constraints, indexes, views, data and grants are the converter's.
--   * CodeGen's CRUD procedures (spCreate/spUpdate/spDelete) and its __mj_UpdatedAt triggers are
--     NOT here: the converter cannot translate T-SQL procedures or triggers, and this repository
--     has no PostgreSQL baseline to run MJ CodeGen against. A PostgreSQL host runs `mj codegen`
--     after installing, which generates them natively. The converter's notes for them remain,
--     fully commented out.
--   * trg_OrderLine_ImmutableAfterConfirm: written by hand in PL/pgSQL from this migration's T-SQL.
--   * CodeGen's hierarchy functions for Order Lines are left to `mj codegen` as well; the
--     converter's table-valued-function output is kept, commented out.
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
-- V202610131504 — OrderLine.ExtendedAmount: the exact amount a price rule set
--                 for the line, before discount (MemberJunction/bizapps-orders#579)
-- =============================================================================
-- A Flat price does not always divide by the quantity. Flat 100.00 at quantity 3
-- stores a unit price of 33.33, and 3 x 33.33 = 99.99. The price rule knows the
-- line is worth 100.00, but that figure was held only in memory while the order
-- was being priced, so everything that read the line afterwards re-derived it
-- from quantity x unit price:
--
--   - the invoice listed the line at 99.99 and printed the missing cent as an
--     Adjustment row (or, at quantity 7, 100.03 and a Discount row);
--   - a draft line saved again without being re-priced recomputed its own total
--     as 99.99;
--   - the journal entry's gross/discount split could be a cent off when a
--     percentage discount applied.
--
-- The column stores that figure. NULL means no rule priced the line (a stated
-- unit price, where quantity x unit price IS the amount).
--
-- Backfill: an unbooked line a rule priced, with no discount, has a net that IS
-- its pre-discount amount, so that net is copied in. Those are the lines whose
-- total is recomputed when they are saved again; without the figure a Flat draft
-- would drop to 99.99 at confirm. Only where net and Quantity x UnitPrice differ
-- by rounding: a unit price rounded to cents is off by at most half a cent per
-- unit, so a larger gap is a discount the columns do not show, and that line is
-- left alone. Booked lines are left NULL: their totals are never recomputed, and
-- the invoice applies the same rounding test when it lists them.
--
-- The line freeze trigger (51003) then covers the column on Confirmed orders.
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
--
-- CodeGen output for this app is folded below the banner at the end of this file.
-- =============================================================================

ALTER TABLE __mj_BizAppsOrders."OrderLine"
 ADD COLUMN IF NOT EXISTS "ExtendedAmount" DECIMAL(18, 2) NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_OrderHeaderID" ON __mj_BizAppsOrders."OrderLine" ("OrderHeaderID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_ProductID" ON __mj_BizAppsOrders."OrderLine" ("ProductID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_CompanyID" ON __mj_BizAppsOrders."OrderLine" ("CompanyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_ProductPriceID" ON __mj_BizAppsOrders."OrderLine" ("ProductPriceID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_ShipToAddressID" ON __mj_BizAppsOrders."OrderLine" ("ShipToAddressID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_ShipToOrganizationID" ON __mj_BizAppsOrders."OrderLine" ("ShipToOrganizationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_ShipToPersonID" ON __mj_BizAppsOrders."OrderLine" ("ShipToPersonID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_ReversesOrderLineID" ON __mj_BizAppsOrders."OrderLine" ("ReversesOrderLineID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_SourceBundleProductID" ON __mj_BizAppsOrders."OrderLine" ("SourceBundleProductID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_ParentOrderLineID" ON __mj_BizAppsOrders."OrderLine" ("ParentOrderLineID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_SubscriptionID" ON __mj_BizAppsOrders."OrderLine" ("SubscriptionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_JournalEntryID" ON __mj_BizAppsOrders."OrderLine" ("JournalEntryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_DimensionID" ON __mj_BizAppsOrders."OrderLine" ("DimensionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderLine_DimensionValueID" ON __mj_BizAppsOrders."OrderLine" ("DimensionValueID");


-- ===================== Helper Functions (fn*) =====================
-- CodeGen's hierarchy functions for Order Lines.ParentOrderLineID. The converter cannot translate
-- T-SQL table-valued functions; `mj codegen` generates them natively on a PostgreSQL host. The
-- converter's output is kept below, commented out.

-- CREATE FUNCTION __mj_BizAppsOrders."fnOrderLineParentOrderLineID_GetHierarchyMeta"
-- (
--     p_RecordID UUID,
--     p_ParentID UUID
-- )
-- RETURNS TABLE
-- AS
-- RETURN
-- (
--     WITH CTE_Ancestors AS (
--         SELECT
--             "ID",
--             "ParentOrderLineID",
--             0 AS "Depth",
--             CAST('/' || CAST("ID" AS VARCHAR(36)) || '/' AS TEXT) AS "Path"
--         FROM
--             __mj_BizAppsOrders."OrderLine"
--         WHERE
--             "ID" = p_RecordID

--         UNION ALL

--         SELECT
--             p."ID",
--             p."ParentOrderLineID",
--             c."Depth" + 1 AS "Depth",
--             CAST('/' || CAST(p."ID" AS VARCHAR(36)) || c."Path" AS TEXT) AS "Path"
--         FROM
--             __mj_BizAppsOrders."OrderLine" p
--         INNER JOIN
--             CTE_Ancestors c ON p."ID" = c."ParentOrderLineID"
--         WHERE
--             c."Depth" < 100
--     )
--     SELECT         a."ID" AS "RootID",
--         (SELECT MAX("Depth") FROM CTE_Ancestors) AS "Depth",
--         (SELECT "Path" FROM CTE_Ancestors ORDER BY "Depth" DESC
-- LIMIT 1) AS "Path",
--         CAST(CASE WHEN EXISTS (SELECT 1 FROM __mj_BizAppsOrders."OrderLine" WHERE "ParentOrderLineID" = p_RecordID) THEN 0 ELSE 1 END AS BOOLEAN) AS "IsLeaf",
--         (SELECT COUNT(1) FROM __mj_BizAppsOrders."OrderLine" WHERE "ParentOrderLineID" = p_RecordID) AS "ChildCount"
--     FROM
--         CTE_Ancestors a
--     WHERE
--         a."ParentOrderLineID" IS NULL OR p_ParentID IS NULL
--     ORDER BY
--         a."Depth" DESC

-- LIMIT 1);

-- CREATE FUNCTION __mj_BizAppsOrders."fnOrderLineParentOrderLineID_GetDescendants"
-- (
--     p_RootID UUID,
--     p_MaxDepth INTEGER = NULL
-- )
-- RETURNS TABLE
-- AS
-- RETURN
-- (
--     WITH CTE_Descendants AS (
--         SELECT
--             "ID",
--             "ParentOrderLineID",
--             0 AS "RelativeDepth",
--             CAST('/' || CAST("ID" AS VARCHAR(36)) || '/' AS TEXT) AS "Path"
--         FROM
--             __mj_BizAppsOrders."OrderLine"
--         WHERE
--             "ID" = p_RootID

--         UNION ALL

--         SELECT
--             c."ID",
--             c."ParentOrderLineID",
--             p."RelativeDepth" || 1 AS "RelativeDepth",
--             CAST(p."Path" || CAST(c."ID" AS VARCHAR(36)) || '/' AS TEXT) AS "Path"
--         FROM
--             __mj_BizAppsOrders."OrderLine" c
--         INNER JOIN
--             CTE_Descendants p ON c."ParentOrderLineID" = p."ID"
--         WHERE
--             (p_MaxDepth IS NULL OR p."RelativeDepth" < p_MaxDepth)
--             AND p."RelativeDepth" < 100
--     )
--     SELECT
--         d."ID" AS "ID",
--         d."RelativeDepth" AS "Depth",
--         d."Path",
--         CAST(CASE WHEN EXISTS (SELECT 1 FROM __mj_BizAppsOrders."OrderLine" WHERE "ParentOrderLineID" = d."ID") THEN 0 ELSE 1 END AS BOOLEAN) AS "IsLeaf",
--         (SELECT COUNT(1) FROM __mj_BizAppsOrders."OrderLine" WHERE "ParentOrderLineID" = d."ID") AS "ChildCount"
--     FROM
--         CTE_Descendants d
-- );

-- CREATE FUNCTION __mj_BizAppsOrders."fnOrderLineParentOrderLineID_GetAncestors"
-- (
--     p_RecordID UUID
-- )
-- RETURNS TABLE
-- AS
-- RETURN
-- (
--     WITH CTE_Ancestors AS (
--         SELECT
--             "ID",
--             "ParentOrderLineID",
--             0 AS "LevelUp",
--             CAST('/' || CAST("ID" AS VARCHAR(36)) || '/' AS TEXT) AS "Path"
--         FROM
--             __mj_BizAppsOrders."OrderLine"
--         WHERE
--             "ID" = p_RecordID

--         UNION ALL

--         SELECT
--             p."ID",
--             p."ParentOrderLineID",
--             c."LevelUp" + 1 AS "LevelUp",
--             CAST('/' || CAST(p."ID" AS VARCHAR(36)) || c."Path" AS TEXT) AS "Path"
--         FROM
--             __mj_BizAppsOrders."OrderLine" p
--         INNER JOIN
--             CTE_Ancestors c ON p."ID" = c."ParentOrderLineID"
--         WHERE
--             c."LevelUp" < 100
--     )
--     SELECT
--         a."ID" AS "ID",
--         a."LevelUp",
--         a."Path"
--     FROM
--         CTE_Ancestors a
-- );

-- CREATE FUNCTION __mj_BizAppsOrders."fnOrderLineParentOrderLineID_GetRootID"
-- (
--     p_RecordID UUID,
--     p_ParentID UUID
-- )
-- RETURNS TABLE
-- AS
-- RETURN
-- (
--     WITH CTE_RootParent AS (
--         SELECT
--             "ID",
--             "ParentOrderLineID",
--             "ID" AS "RootParentID",
--             0 AS "Depth"
--         FROM
--             __mj_BizAppsOrders."OrderLine"
--         WHERE
--             "ID" = COALESCE(p_ParentID, p_RecordID)

--         UNION ALL

--         SELECT
--             c."ID",
--             c."ParentOrderLineID",
--             c."ID" AS "RootParentID",
--             p."Depth" + 1 AS "Depth"
--         FROM
--             __mj_BizAppsOrders."OrderLine" c
--         INNER JOIN
--             CTE_RootParent p ON c."ID" = p."ParentOrderLineID"
--         WHERE
--             p."Depth" < 100
--     )
--     SELECT         "RootParentID" AS RootID
--     FROM
--         CTE_RootParent
--     WHERE
--         "ParentOrderLineID" IS NULL
--     ORDER BY
--         "RootParentID"

-- LIMIT 1);


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_BizAppsOrders';
  v_target_name CONSTANT TEXT := 'vwEventOrderLines';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwEventOrderLines"
AS SELECT
    e.*,
    __mj_isa_p1."OrderHeaderID",
    __mj_isa_p1."ProductID",
    __mj_isa_p1."CompanyID",
    __mj_isa_p1."LineNumber",
    __mj_isa_p1."Quantity",
    __mj_isa_p1."UnitPrice",
    __mj_isa_p1."ProductPriceID",
    __mj_isa_p1."DiscountPct",
    __mj_isa_p1."DiscountAmount",
    __mj_isa_p1."LineTotalNet",
    __mj_isa_p1."ChargeAmount",
    __mj_isa_p1."LineTax",
    __mj_isa_p1."LineTotalGross",
    __mj_isa_p1."ShipToAddressID",
    __mj_isa_p1."ShipToOrganizationID",
    __mj_isa_p1."ShipToPersonID",
    __mj_isa_p1."RenewsSubscriptionID",
    __mj_isa_p1."ServicePeriodStart",
    __mj_isa_p1."ServicePeriodEnd",
    __mj_isa_p1."FulfillmentStatus",
    __mj_isa_p1."ReversesOrderLineID",
    __mj_isa_p1."SourceBundleProductID",
    __mj_isa_p1."ParentOrderLineID",
    __mj_isa_p1."IsRollupParent",
    __mj_isa_p1."IsQuantityOverridden",
    __mj_isa_p1."SubscriptionID",
    __mj_isa_p1."Description",
    __mj_isa_p1."JournalEntryID",
    __mj_isa_p1."PriceOverridden",
    __mj_isa_p1."PriceOverrideReason",
    __mj_isa_p1."DimensionID",
    __mj_isa_p1."DimensionValueID",
    __mj_isa_p1."BilledToDate",
    __mj_isa_p1."RecognizedToDate",
    __mj_isa_p1."ShipToAddressSnapshot",
    __mj_isa_p1."SubscriptionAction",
    __mj_isa_p1."AcknowledgesCoverageOverlap",
    __mj_isa_p1."ExtendedAmount",
    "mjBizAppsCommonPerson_PersonID"."DisplayName" AS "Person"
FROM
    __mj_BizAppsOrders."EventOrderLine" AS e
INNER JOIN
    __mj_BizAppsOrders."OrderLine" AS __mj_isa_p1
  ON
    e."ID" = __mj_isa_p1."ID"
INNER JOIN
    __mj_BizAppsCommon."Person" AS "mjBizAppsCommonPerson_PersonID"
  ON
    e."PersonID" = "mjBizAppsCommonPerson_PersonID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwOrderLines';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwOrderLines"
AS SELECT
    o.*,
    "mjBizAppsOrdersOrderHeader_OrderHeaderID"."OrderNumber" AS "OrderHeader",
    "mjBizAppsOrdersProduct_ProductID"."Name" AS "Product",
    "MJCompany_CompanyID"."Name" AS "Company",
    "mjBizAppsOrdersProductPrice_ProductPriceID"."Name" AS "ProductPrice",
    "mjBizAppsCommonOrganization_ShipToOrganizationID"."Name" AS "ShipToOrganization",
    "mjBizAppsCommonPerson_ShipToPersonID"."DisplayName" AS "ShipToPerson",
    "mjBizAppsOrdersProduct_SourceBundleProductID"."Name" AS "SourceBundleProduct",
    "mjBizAppsOrdersSubscription_SubscriptionID"."SubscriptionNumber" AS "Subscription",
    "mjBizAppsAccountingJournalEntry_JournalEntryID"."EntryNumber" AS "JournalEntry",
    "mjBizAppsAccountingDimension_DimensionID"."Name" AS "Dimension",
    "mjBizAppsAccountingDimensionValue_DimensionValueID"."Name" AS "DimensionValue",
    "hier_ParentOrderLineID"."RootID" AS "RootParentOrderLineID",
    "hier_ParentOrderLineID"."Depth" AS "ParentOrderLineIDDepth",
    "hier_ParentOrderLineID"."Path" AS "ParentOrderLineIDPath",
    "hier_ParentOrderLineID"."IsLeaf" AS "ParentOrderLineIDIsLeaf",
    "hier_ParentOrderLineID"."ChildCount" AS "ParentOrderLineIDChildCount"
FROM
    __mj_BizAppsOrders."OrderLine" AS o
INNER JOIN
    __mj_BizAppsOrders."OrderHeader" AS "mjBizAppsOrdersOrderHeader_OrderHeaderID"
  ON
    o."OrderHeaderID" = "mjBizAppsOrdersOrderHeader_OrderHeaderID"."ID"
INNER JOIN
    __mj_BizAppsOrders."Product" AS "mjBizAppsOrdersProduct_ProductID"
  ON
    o."ProductID" = "mjBizAppsOrdersProduct_ProductID"."ID"
INNER JOIN
    __mj."Company" AS "MJCompany_CompanyID"
  ON
    o."CompanyID" = "MJCompany_CompanyID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."ProductPrice" AS "mjBizAppsOrdersProductPrice_ProductPriceID"
  ON
    o."ProductPriceID" = "mjBizAppsOrdersProductPrice_ProductPriceID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsCommon."Organization" AS "mjBizAppsCommonOrganization_ShipToOrganizationID"
  ON
    o."ShipToOrganizationID" = "mjBizAppsCommonOrganization_ShipToOrganizationID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsCommon."Person" AS "mjBizAppsCommonPerson_ShipToPersonID"
  ON
    o."ShipToPersonID" = "mjBizAppsCommonPerson_ShipToPersonID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."Product" AS "mjBizAppsOrdersProduct_SourceBundleProductID"
  ON
    o."SourceBundleProductID" = "mjBizAppsOrdersProduct_SourceBundleProductID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."Subscription" AS "mjBizAppsOrdersSubscription_SubscriptionID"
  ON
    o."SubscriptionID" = "mjBizAppsOrdersSubscription_SubscriptionID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsAccounting."JournalEntry" AS "mjBizAppsAccountingJournalEntry_JournalEntryID"
  ON
    o."JournalEntryID" = "mjBizAppsAccountingJournalEntry_JournalEntryID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsAccounting."Dimension" AS "mjBizAppsAccountingDimension_DimensionID"
  ON
    o."DimensionID" = "mjBizAppsAccountingDimension_DimensionID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsAccounting."DimensionValue" AS "mjBizAppsAccountingDimensionValue_DimensionValueID"
  ON
    o."DimensionValueID" = "mjBizAppsAccountingDimensionValue_DimensionValueID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj_BizAppsOrders."fnOrderLineParentOrderLineID_GetHierarchyMeta"(o."ID", o."ParentOrderLineID")) AS "hier_ParentOrderLineID"
    ON TRUE$vsql$;
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
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreateEventOrderLine]
--     @ID UUID = NULL,
--     @CheckInAt_Clear bit = 0,
--     @CheckInAt datetimeoffset = NULL,
--     @PersonID UUID,
--     ...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdateEventOrderLine]
--     @ID UUID,
--     @CheckInAt_Clear bit = 0,
--     @CheckInAt datetimeoffset = NULL,
--     @PersonID UUID = NULL,
--     ...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeleteEventOrderLine]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[EventOrderLine]
--     WHERE
--         [I...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreateOrderLine]
--     @ID UUID = NULL,
--     @OrderHeaderID UUID,
--     @ProductID UUID,
--     @CompanyID UUID,
--     @L...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdateOrderLine]
--     @ID UUID,
--     @OrderHeaderID UUID = NULL,
--     @ProductID UUID = NULL,
--     @CompanyID UUID ...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeleteOrderLine]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[OrderLine]
--     WHERE
--         [ID] = @ID
-- 
-- ...


-- ===================== Triggers =====================

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdateEventOrderLine
-- ON "__mj_BizAppsOrders"."EventOrderLine"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders"."EventOrderLine"


-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdateOrderLine
-- ON "__mj_BizAppsOrders"."OrderLine"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders"."OrderLine"
--     SET
       


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

UPDATE "__mj_BizAppsOrders"."OrderLine"
SET "ExtendedAmount" = "LineTotalNet"
WHERE "JournalEntryID" IS NULL
  AND "ProductPriceID" IS NOT NULL
  AND "IsRollupParent" = 0
  AND "DiscountPct" = 0
  AND "DiscountAmount" = 0
  AND ABS("Quantity" * "UnitPrice" - "LineTotalNet") <= 0.005 * ABS("Quantity");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ae880ab1-46bd-4078-aab8-51f60300da08' OR ("EntityID" = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND "Name" = 'ExtendedAmount')
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
        'ae880ab1-46bd-4078-aab8-51f60300da08',
        '66D82C24-9C9F-4CD6-B019-53C20274AB00', -- "Entity": "MJ_BizApps_Orders": Order "Lines"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '66D82C24-9C9F-4CD6-B019-53C20274AB00'),
        'ExtendedAmount',
        'Extended Amount',
        'The amount the price rule set for this line before any discount, exactly as the rule computed it. A Flat price that does not divide by the quantity cannot be rebuilt from Quantity x UnitPrice (Flat 100.00 at quantity 3 has a unit price of 33.33), so the line total, the invoice and the journal entry read this instead. NULL when no rule priced the line, such as a stated unit price; Quantity x UnitPrice is then the amount.',
        'decimal',
        9,
        18,
        2,
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
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

INSERT INTO __mj."EntityField" (
                  "ID", "EntityID", "Name", "Type", "AllowsNull",
                  "Length", "Precision", "Scale",
                  "Sequence", "IsVirtual", "AllowUpdateAPI",
                  "IsPrimaryKey", "IsUnique",
                  "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES (
                  'e16deefe-61e5-49e9-8137-6c908986258f', '90A1060F-35D6-44A7-9076-A9053BBF60E6', 'ExtendedAmount',
                  'decimal', TRUE,
                  9, 18, 2,
                  (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '90A1060F-35D6-44A7-9076-A9053BBF60E6'), TRUE, TRUE, FALSE, FALSE,
                  NOW(), NOW());

/* Update entity timestamp for MJ_BizApps_Orders: Event Order Lines after IS-A field sync */

UPDATE __mj."Entity" SET "__mj_UpdatedAt"=NOW() WHERE "ID"='90A1060F-35D6-44A7-9076-A9053BBF60E6';

/* SQL text to update display name for field ExtendedAmount */

UPDATE __mj."EntityField" SET "__mj_UpdatedAt"=NOW(), "DisplayName" = 'Extended Amount' WHERE "ID" = 'E16DEEFE-61E5-49E9-8137-6C908986258F';

/* Base View SQL for MJ_BizApps_Orders: Event Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Order Lines
-- Item: vwEventOrderLines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Event Order Lines
-----               SCHEMA:      __mj_BizAppsOrders
-----               BASE TABLE:  EventOrderLine
-----               PRIMARY KEY: ID
------------------------------------------------------------

UPDATE __mj."EntityField"
SET 
   "Category" = 'Pricing and Financials',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = 'AE880AB1-46BD-4078-AAB8-51F60300DA08';


-- ===================== Grants =====================

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwEventOrderLines" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwEventOrderLines" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwEventOrderLines" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwEventOrderLines" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Event Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Order Lines
-- Item: Permissions for vwEventOrderLines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwEventOrderLines" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwEventOrderLines" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwEventOrderLines" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwEventOrderLines" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Orders: Event Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Order Lines
-- Item: spCreateEventOrderLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventOrderLine
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateEventOrderLine" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateEventOrderLine" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateEventOrderLine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Event Order Lines */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateEventOrderLine" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateEventOrderLine" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateEventOrderLine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Event Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Order Lines
-- Item: spUpdateEventOrderLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventOrderLine
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateEventOrderLine" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateEventOrderLine" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateEventOrderLine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateEventOrderLine" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateEventOrderLine" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateEventOrderLine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Orders: Event Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Order Lines
-- Item: spDeleteEventOrderLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventOrderLine
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteEventOrderLine" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteEventOrderLine" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteEventOrderLine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Event Order Lines */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteEventOrderLine" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteEventOrderLine" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteEventOrderLine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for OrderLine */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderHeaderID in table OrderLine;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderLines" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderLines" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderLines" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwOrderLines" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: Permissions for vwOrderLines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderLines" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderLines" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderLines" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwOrderLines" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Orders: Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: spCreateOrderLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderLine
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderLine" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderLine" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderLine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Order Lines */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderLine" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderLine" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderLine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: spUpdateOrderLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderLine
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderLine" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderLine" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderLine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderLine" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderLine" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderLine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Orders: Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: spDeleteOrderLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderLine
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderLine" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderLine" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderLine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Order Lines */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderLine" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderLine" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderLine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set category for the new field */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ExtendedAmount;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."OrderLine"."ExtendedAmount" IS 'The amount the price rule set for this line before any discount, exactly as the rule computed it. A Flat price that does not divide by the quantity cannot be rebuilt from Quantity x UnitPrice (Flat 100.00 at quantity 3 has a unit price of 33.33), so the line total, the invoice and the journal entry read this instead. NULL when no rule priced the line, such as a stated unit price; Quantity x UnitPrice is then the amount.';


-- ===================== Other =====================

-- -----------------------------------------------------------------------------
-- trg_OrderLine_ImmutableAfterConfirm: ExtendedAmount joins the frozen columns
-- -----------------------------------------------------------------------------
-- It is part of the line's money: the line total was computed from it, and the
-- invoice and journal entry read it. Restated whole from V202610091200 with one
-- added comparison (null-safe, as the column is nullable). After the backfill, so
-- the backfill is not checked against the column it fills.
-- trg_OrderLine_ImmutableAfterConfirm: written by hand in plpgsql (the converter passes T-SQL procedures and triggers through untranslated)
CREATE OR REPLACE FUNCTION __mj_BizAppsOrders."fn_trg_OrderLine_ImmutableAfterConfirm"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- 51002: DELETE. Block if any deleted line belongs to a Confirmed order.
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1
            FROM deleted d
            JOIN __mj_BizAppsOrders."OrderHeader" o ON o."ID" = d."OrderHeaderID"
            WHERE o."Status" = 'Confirmed'
        ) THEN
            RAISE EXCEPTION 'OrderLine cannot be deleted once its order is Confirmed (the line is booked under a journal entry). Use a reversal order.'
                USING DETAIL = 'error 51002';
        END IF;
        RETURN NULL;
    END IF;

    -- 51003: UPDATE. The frozen columns on lines of Confirmed orders.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        JOIN __mj_BizAppsOrders."OrderHeader" o ON o."ID" = d."OrderHeaderID"
        WHERE o."Status" = 'Confirmed'
          AND (
            i."ProductID"      <> d."ProductID"      OR
            i."CompanyID"      <> d."CompanyID"      OR
            i."Quantity"       <> d."Quantity"       OR
            i."UnitPrice"      <> d."UnitPrice"      OR
            i."DiscountPct"    <> d."DiscountPct"    OR
            i."LineTax"        <> d."LineTax"        OR
            COALESCE(i."LineTotalNet",   0) <> COALESCE(d."LineTotalNet",   0) OR
            COALESCE(i."LineTotalGross", 0) <> COALESCE(d."LineTotalGross", 0) OR
            i."ExtendedAmount" IS DISTINCT FROM d."ExtendedAmount"
          )
    ) THEN
        RAISE EXCEPTION 'OrderLine financial columns and selling company cannot be changed once its order is Confirmed (the line is booked under a journal entry). Use a reversal order.'
            USING DETAIL = 'error 51003';
    END IF;

    -- 51016: UPDATE. The line keeps the ship-to address it was sold to.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        JOIN __mj_BizAppsOrders."OrderHeader" o ON o."ID" = d."OrderHeaderID"
        WHERE (
                o."Status" = 'Confirmed'
                AND (
                    (d."ShipToAddressID" IS NOT NULL
                        AND i."ShipToAddressID" IS DISTINCT FROM d."ShipToAddressID") OR
                    (d."ShipToAddressID" IS NULL AND i."ShipToAddressID" IS NOT NULL
                        AND i."ShipToAddressSnapshot" IS NULL)
                )
              )
           OR (d."ShipToAddressSnapshot" IS NOT NULL
                AND i."ShipToAddressSnapshot" IS DISTINCT FROM d."ShipToAddressSnapshot")
    ) THEN
        RAISE EXCEPTION 'OrderLine ship-to address cannot be replaced once its order is Confirmed, and an empty one can be filled only together with its snapshot; the line keeps the address it was sold to. Use a reversal order.'
            USING DETAIL = 'error 51016';
    END IF;

    -- 51008: UPDATE. JournalEntryID is the per-line booking record: NULL→value
    -- once, never cleared or replaced (any status). Corrections go through a
    -- reversal order, not by re-pointing the booked entry.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."JournalEntryID" IS NOT NULL
          AND (i."JournalEntryID" IS NULL OR i."JournalEntryID" <> d."JournalEntryID")
    ) THEN
        RAISE EXCEPTION 'OrderLine.JournalEntryID cannot be cleared or replaced once set. Corrections happen via a reversal order, not by re-pointing the booked journal entry.'
            USING DETAIL = 'error 51008';
    END IF;

    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_OrderLine_ImmutableAfterConfirm" ON __mj_BizAppsOrders."OrderLine";
CREATE TRIGGER "trg_OrderLine_ImmutableAfterConfirm"
    AFTER UPDATE ON __mj_BizAppsOrders."OrderLine"
    REFERENCING OLD TABLE AS deleted NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION __mj_BizAppsOrders."fn_trg_OrderLine_ImmutableAfterConfirm"();

DROP TRIGGER IF EXISTS "trg_OrderLine_ImmutableAfterConfirm_Delete" ON __mj_BizAppsOrders."OrderLine";
CREATE TRIGGER "trg_OrderLine_ImmutableAfterConfirm_Delete"
    AFTER DELETE ON __mj_BizAppsOrders."OrderLine"
    REFERENCING OLD TABLE AS deleted
    FOR EACH STATEMENT
    EXECUTE FUNCTION __mj_BizAppsOrders."fn_trg_OrderLine_ImmutableAfterConfirm"();


-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL (OrderLine.ExtendedAmount, with its views and CRUD
-- procs) is folded here by scripts/append-codegen.sh.
-- =============================================================================


/* SQL text to insert 1 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Event Order Lines */

/* spUpdate Permissions for MJ_BizApps_Orders: Order Lines */
