-- =============================================================================================
-- PostgreSQL counterpart of V202610131515__v5.32.x__OrderLine_ReversalScheduleReduction.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) output, finished by hand:
--   * Tables, columns, constraints, indexes, views, data and grants are the converter's.
--   * CodeGen's CRUD procedures (spCreate/spUpdate/spDelete) and its __mj_UpdatedAt triggers are
--     NOT here: the converter cannot translate T-SQL procedures or triggers, and this repository
--     has no PostgreSQL baseline to run MJ CodeGen against. A PostgreSQL host runs `mj codegen`
--     after installing, which generates them natively. The converter's notes for them remain,
--     fully commented out.
--   * spRecalcOrderHeaderTotals: written by hand in PL/pgSQL from this migration's T-SQL.
--   * trg_OrderLine_RollupTotals: written by hand in PL/pgSQL from this migration's T-SQL.
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
-- V202610131515 — A return against an order billed by instalment (#661)
-- =============================================================================
-- A return is a separate order whose lines point at the lines they take back. When the
-- origin order is billed by instalment, booking the return credits the customer with a
-- credit memo: the returned units' share of what was invoiced and not yet earned. What
-- the returned units had not yet been invoiced for has to come off the origin's
-- instalments not yet invoiced, and nothing recorded either amount.
--
-- What this file does, in order:
--   1. OrderLine gains, on a returning line whose origin is billed by instalment, the
--      amount taken off the origin's instalments not yet invoiced, and the credit memo
--      the return booked.
--   2. spRecalcOrderHeaderTotals: the origin's balance is net of what its returns took
--      off its instalments, and the return's balance is the credit memo it booked
--      rather than the full value of its lines. TotalGross stays the booked lines.
--   3. trg_OrderLine_RollupTotals also recalculates the origin order when a returning
--      line's schedule reduction is written.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. OrderLine: what a return against an instalment-billed order took and credited
-- -----------------------------------------------------------------------------
ALTER TABLE __mj_BizAppsOrders."OrderLine"
 ADD COLUMN IF NOT EXISTS "ScheduleReduction" DECIMAL(18,2) NULL,
 ADD COLUMN IF NOT EXISTS "CreditMemoAmount" DECIMAL(18,2) NULL,
 ADD CONSTRAINT "CK_OrderLine_ScheduleReduction" CHECK (
        "ScheduleReduction" IS NULL OR ("ScheduleReduction" >= 0 AND "ReversesOrderLineID" IS NOT NULL)
    ) NOT VALID,
 ADD CONSTRAINT "CK_OrderLine_CreditMemoAmount" CHECK (
        "CreditMemoAmount" IS NULL OR ("CreditMemoAmount" >= 0 AND "ReversesOrderLineID" IS NOT NULL)
    ) NOT VALID;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EventOrderLine_PersonID" ON __mj_BizAppsOrders."EventOrderLine" ("PersonID");

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
    __mj_isa_p1."CoverageOverlapReason",
    __mj_isa_p1."ScheduleReduction",
    __mj_isa_p1."CreditMemoAmount",
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6f429df9-d734-4488-83a8-9e7323fab524' OR ("EntityID" = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND "Name" = 'ScheduleReduction')
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
        '6f429df9-d734-4488-83a8-9e7323fab524',
        '66D82C24-9C9F-4CD6-B019-53C20274AB00', -- "Entity": "MJ_BizApps_Orders": Order "Lines"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '66D82C24-9C9F-4CD6-B019-53C20274AB00'),
        'ScheduleReduction',
        'Schedule Reduction',
        'On a returning line whose origin is billed by instalment: the returned units'' share of what the origin line''s instalments had not yet invoiced, tax included. It is taken off those instalments, and the origin''s balance and schedule check subtract it from the origin''s lines. Set by the server when the return is confirmed. NULL on every other line.',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f23d9c05-c40b-483f-b8d6-1d8124bc3c6d' OR ("EntityID" = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND "Name" = 'CreditMemoAmount')
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
        'f23d9c05-c40b-483f-b8d6-1d8124bc3c6d',
        '66D82C24-9C9F-4CD6-B019-53C20274AB00', -- "Entity": "MJ_BizApps_Orders": Order "Lines"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '66D82C24-9C9F-4CD6-B019-53C20274AB00'),
        'CreditMemoAmount',
        'Credit Memo Amount',
        'On a returning line whose origin is billed by instalment: the credit memo the return booked, the returned units'' share of what was invoiced and not yet earned. Zero when nothing was credited. The return order''s balance is this, not the value of its lines. Set by the server when the return is confirmed. NULL on every other line.',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7baab6d0-d09b-427f-8038-66d66fa251b8' OR ("EntityID" = '90A1060F-35D6-44A7-9076-A9053BBF60E6' AND "Name" = 'ScheduleReduction')
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
        '7baab6d0-d09b-427f-8038-66d66fa251b8',
        '90A1060F-35D6-44A7-9076-A9053BBF60E6', -- "Entity": "MJ_BizApps_Orders": "Event" Order "Lines"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '90A1060F-35D6-44A7-9076-A9053BBF60E6'),
        'ScheduleReduction',
        'Schedule Reduction',
        NULL,
        'decimal',
        9,
        18,
        2,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '70f42909-7de7-44cc-ba82-fdb03e13d161' OR ("EntityID" = '90A1060F-35D6-44A7-9076-A9053BBF60E6' AND "Name" = 'CreditMemoAmount')
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
        '70f42909-7de7-44cc-ba82-fdb03e13d161',
        '90A1060F-35D6-44A7-9076-A9053BBF60E6', -- "Entity": "MJ_BizApps_Orders": "Event" Order "Lines"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '90A1060F-35D6-44A7-9076-A9053BBF60E6'),
        'CreditMemoAmount',
        'Credit Memo Amount',
        NULL,
        'decimal',
        9,
        18,
        2,
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

UPDATE __mj."EntityField"
                  SET "IsVirtual" = TRUE,
                      "Type"='decimal',
                      "Length"=9,
                      "Precision"=18,
                      "Scale"=2,
                      "AllowsNull" = TRUE,
                      "AllowUpdateAPI" = TRUE
                  WHERE "ID"='7BAAB6D0-D09B-427F-8038-66D66FA251B8';

/* Update IS-A parent field CreditMemoAmount on MJ_BizApps_Orders: Event Order Lines */

UPDATE __mj."EntityField"
                  SET "IsVirtual" = TRUE,
                      "Type"='decimal',
                      "Length"=9,
                      "Precision"=18,
                      "Scale"=2,
                      "AllowsNull" = TRUE,
                      "AllowUpdateAPI" = TRUE
                  WHERE "ID"='70F42909-7DE7-44CC-BA82-FDB03E13D161';

/* Update entity timestamp for MJ_BizApps_Orders: Event Order Lines after IS-A field sync */

UPDATE __mj."Entity" SET "__mj_UpdatedAt"=NOW() WHERE "ID"='90A1060F-35D6-44A7-9076-A9053BBF60E6';

/* Index for Foreign Keys for EventOrderLine */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Order Lines
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PersonID in table EventOrderLine


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
-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."OrderLine"."ScheduleReduction" IS 'On a returning line whose origin is billed by instalment: the returned units'' share of what the origin line''s instalments had not yet invoiced, tax included. It is taken off those instalments, and the origin''s balance and schedule check subtract it from the origin''s lines. Set by the server when the return is confirmed. NULL on every other line.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderLine"."CreditMemoAmount" IS 'On a returning line whose origin is billed by instalment: the credit memo the return booked, the returned units'' share of what was invoiced and not yet earned. Zero when nothing was credited. The return order''s balance is this, not the value of its lines. Set by the server when the return is confirmed. NULL on every other line.';


-- ===================== Other =====================

-- -----------------------------------------------------------------------------
-- 2. spRecalcOrderHeaderTotals — as V202610131514 left it (approved amount changes'
--    schedule reductions and credit memos), with
--    - the balance net of what returns took off this order's instalments, and
--    - each returning line that booked a credit memo counted at that memo.
-- -----------------------------------------------------------------------------

-- spRecalcOrderHeaderTotals: written by hand in plpgsql (the converter passes T-SQL procedures and triggers through untranslated)
CREATE OR REPLACE FUNCTION __mj_BizAppsOrders."spRecalcOrderHeaderTotals"(p_order_header_ids uuid[])
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
    UPDATE __mj_BizAppsOrders."OrderHeader" o
    SET "TotalGross" = COALESCE(l."LineTotal", 0),
        "AmountPaid" = COALESCE(p."Paid", 0),
        "Balance"    = COALESCE(l."LineTotal", 0) - COALESCE(l."MemoAdjustment", 0) - COALESCE(r."Reduced", 0)
                     - COALESCE(rv."Reduced", 0) - COALESCE(p."Paid", 0),
        "FulfillmentStatus" =
            CASE
                WHEN o."Status" IN ('Draft', 'Quoted', 'Voided') THEN 'Pending'
                WHEN COALESCE(f."RequiresFulfillmentCount", 0) = 0 THEN 'NotApplicable'
                WHEN f."FulfilledCount" = f."RequiresFulfillmentCount" THEN 'Fulfilled'
                WHEN f."FulfilledCount" > 0 THEN 'PartiallyFulfilled'
                ELSE 'Pending'
            END
    FROM (SELECT DISTINCT unnest(p_order_header_ids) AS id) ids
    LEFT JOIN LATERAL (
        SELECT SUM(ol."LineTotalGross") AS "LineTotal",
               SUM(CASE WHEN ol."CreditMemoAmount" IS NOT NULL
                        THEN COALESCE(ol."LineTotalGross", 0) + ol."CreditMemoAmount" END) AS "MemoAdjustment"
        FROM __mj_BizAppsOrders."OrderLine" ol WHERE ol."OrderHeaderID" = ids.id
    ) l ON TRUE
    LEFT JOIN LATERAL (
        SELECT SUM(COALESCE(c."ScheduleReduction", 0) + COALESCE(c."CreditMemoAmount", 0)) AS "Reduced"
        FROM __mj_BizAppsOrders."OrderConcession" c
        WHERE c."OrderHeaderID" = ids.id
          AND c."Status" = 'Approved'
          AND (c."ScheduleReduction" IS NOT NULL OR c."CreditMemoAmount" IS NOT NULL)
    ) r ON TRUE
    LEFT JOIN LATERAL (
        SELECT SUM(rl."ScheduleReduction") AS "Reduced"
        FROM __mj_BizAppsOrders."OrderLine" rl
        JOIN __mj_BizAppsOrders."OrderLine" origin ON origin."ID" = rl."ReversesOrderLineID"
        WHERE origin."OrderHeaderID" = ids.id AND rl."ScheduleReduction" IS NOT NULL
    ) rv ON TRUE
    LEFT JOIN LATERAL (
        SELECT SUM(pl."Amount") AS "Paid"
        FROM __mj_BizAppsOrders."PaymentLine" pl
        JOIN __mj_BizAppsOrders."PaymentHeader" ph ON ph."ID" = pl."PaymentHeaderID"
        WHERE pl."OrderHeaderID" = ids.id AND ph."Status" IN ('Captured','Refunded','Disputed')
    ) p ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            COUNT(CASE WHEN pt."RequiresFulfillment" AND ol."ReversesOrderLineID" IS NULL THEN 1 END) AS "RequiresFulfillmentCount",
            COUNT(CASE WHEN pt."RequiresFulfillment" AND ol."ReversesOrderLineID" IS NULL AND ol."FulfillmentStatus" = 'Fulfilled' THEN 1 END) AS "FulfilledCount"
        FROM __mj_BizAppsOrders."OrderLine" ol
        JOIN __mj_BizAppsOrders."Product" pr ON pr."ID" = ol."ProductID"
        JOIN __mj_BizAppsOrders."ProductType" pt ON pt."ID" = pr."ProductTypeID"
        WHERE ol."OrderHeaderID" = ids.id
    ) f ON TRUE
    WHERE o."ID" = ids.id;

    PERFORM __mj_BizAppsOrders."spRecalcOrderHeaderPaymentSchedule"(p_order_header_ids);
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 3. trg_OrderLine_RollupTotals — as the baseline left it, plus the origin order of
--    any returning line whose schedule reduction is written.
-- -----------------------------------------------------------------------------
-- trg_OrderLine_RollupTotals: written by hand in plpgsql (the converter passes T-SQL procedures and triggers through untranslated)
CREATE OR REPLACE FUNCTION __mj_BizAppsOrders."fn_trg_OrderLine_RollupTotals"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    ids uuid[];
BEGIN
    -- Zero-row statements change nothing: a statement-level trigger fires for them too.
    IF TG_OP IN ('INSERT','UPDATE') THEN
        SELECT array_agg(DISTINCT x."OrderHeaderID") INTO ids FROM (
            SELECT "OrderHeaderID" FROM inserted
            UNION
            SELECT origin."OrderHeaderID"
            FROM inserted i
            JOIN __mj_BizAppsOrders."OrderLine" origin ON origin."ID" = i."ReversesOrderLineID"
            WHERE i."ScheduleReduction" IS NOT NULL
        ) x;
    END IF;
    IF TG_OP IN ('UPDATE','DELETE') THEN
        SELECT array_agg(DISTINCT x."OrderHeaderID") INTO ids FROM (
            SELECT unnest(ids) AS "OrderHeaderID"
            UNION
            SELECT "OrderHeaderID" FROM deleted
            UNION
            SELECT origin."OrderHeaderID"
            FROM deleted d
            JOIN __mj_BizAppsOrders."OrderLine" origin ON origin."ID" = d."ReversesOrderLineID"
            WHERE d."ScheduleReduction" IS NOT NULL
        ) x WHERE x."OrderHeaderID" IS NOT NULL;
    END IF;

    IF ids IS NULL OR cardinality(ids) = 0 THEN
        RETURN NULL;
    END IF;
    PERFORM __mj_BizAppsOrders."spRecalcOrderHeaderTotals"(ids);
    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_OrderLine_RollupTotals_Insert" ON __mj_BizAppsOrders."OrderLine";
CREATE TRIGGER "trg_OrderLine_RollupTotals_Insert"
    AFTER INSERT ON __mj_BizAppsOrders."OrderLine"
    REFERENCING NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION __mj_BizAppsOrders."fn_trg_OrderLine_RollupTotals"();

DROP TRIGGER IF EXISTS "trg_OrderLine_RollupTotals" ON __mj_BizAppsOrders."OrderLine";
CREATE TRIGGER "trg_OrderLine_RollupTotals"
    AFTER UPDATE ON __mj_BizAppsOrders."OrderLine"
    REFERENCING OLD TABLE AS deleted NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION __mj_BizAppsOrders."fn_trg_OrderLine_RollupTotals"();

DROP TRIGGER IF EXISTS "trg_OrderLine_RollupTotals_Delete" ON __mj_BizAppsOrders."OrderLine";
CREATE TRIGGER "trg_OrderLine_RollupTotals_Delete"
    AFTER DELETE ON __mj_BizAppsOrders."OrderLine"
    REFERENCING OLD TABLE AS deleted
    FOR EACH STATEMENT
    EXECUTE FUNCTION __mj_BizAppsOrders."fn_trg_OrderLine_RollupTotals"();


-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above: the two new fields on Order Lines
-- and on Event Order Lines (which inherits them), FK indexes, vwOrderLines,
-- vwEventOrderLines, the line hierarchy functions, CRUD procs and permissions.
-- =============================================================================


/* SQL text to insert 4 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Event Order Lines */

/* spUpdate Permissions for MJ_BizApps_Orders: Order Lines */
