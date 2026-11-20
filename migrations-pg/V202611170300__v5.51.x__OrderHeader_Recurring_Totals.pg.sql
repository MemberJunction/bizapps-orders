-- =============================================================================================
-- PostgreSQL counterpart of V202611170300__v5.51.x__OrderHeader_Recurring_Totals.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres` (MJ CLI 6.2.1) output, finished by hand:
--   * Columns, indexes, views, data, grants and comments are the converter's.
--   * CodeGen's CRUD procedures and its __mj_UpdatedAt trigger are NOT here: the converter cannot
--     translate T-SQL procedures or triggers. A PostgreSQL host runs `mj codegen` after installing,
--     which generates them natively. The converter's notes for them remain, commented out.
--   * fnOrderHeaderRecurringMonthly: written by hand in SQL from this migration's T-SQL.
--   * spRecalcOrderHeaderTotals: written by hand in PL/pgSQL from this migration's T-SQL.
--   * The backfill UPDATE: written by hand (the converter passed OUTER APPLY through).
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
-- V202611170300 — Recurring monthly and annual totals on the order header (golive #485)
-- =============================================================================
-- A deal's MRR and ARR were typed by hand and nothing calculated them, because the sales app
-- never computes NUMERIC(19,4): only orders may. Orders had no recurring total to offer. This adds one,
-- maintained by the same rollup that maintains TotalGross, so the deal can copy it the way it
-- copies TotalGross into its Amount.
--
-- What counts:
--   * Only lines whose product has a subscription type. One-time products add nothing.
--   * Each such line's net amount (after discount, before tax) spread over the months it covers:
--     its stated service period when it has both dates, otherwise its subscription type's term
--     (DefaultTermMonths, or the billing cadence's months when the type states none). A period
--     that is not a whole number of months counts the remaining days as a fraction of the month
--     they fall in, the same arithmetic as MonthsCovered in subscription-term-length.ts.
--   * Bundle rollup parents are skipped; their children carry the amounts.
--   * RecurringAnnualTotal is twelve times RecurringMonthlyTotal.
-- An order with no recurring lines holds 0, as TotalGross holds 0 for an order whose lines sum
-- to nothing.
--
-- What this file does, in order:
--   1. OrderHeader gains RecurringMonthlyTotal and RecurringAnnualTotal.
--   2. fnOrderHeaderRecurringMonthly: one order's monthly recurring amount.
--   3. spRecalcOrderHeaderTotals — as V202610131515 left it, plus the two new columns.
--   4. Every existing order's two new columns are filled. Only those two columns are written.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. OrderHeader: the recurring totals
-- -----------------------------------------------------------------------------
ALTER TABLE __mj_BizAppsOrders."OrderHeader"
 ADD COLUMN IF NOT EXISTS "RecurringMonthlyTotal" DECIMAL(18,2) NULL,
 ADD COLUMN IF NOT EXISTS "RecurringAnnualTotal" DECIMAL(18,2) NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_CompanyID" ON __mj_BizAppsOrders."OrderHeader" ("CompanyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_BillToPersonID" ON __mj_BizAppsOrders."OrderHeader" ("BillToPersonID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_BillToOrganizationID" ON __mj_BizAppsOrders."OrderHeader" ("BillToOrganizationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_SalesRepUserID" ON __mj_BizAppsOrders."OrderHeader" ("SalesRepUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_BillToAddressID" ON __mj_BizAppsOrders."OrderHeader" ("BillToAddressID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_ShipToAddressID" ON __mj_BizAppsOrders."OrderHeader" ("ShipToAddressID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_ShipToOrganizationID" ON __mj_BizAppsOrders."OrderHeader" ("ShipToOrganizationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_ShipToPersonID" ON __mj_BizAppsOrders."OrderHeader" ("ShipToPersonID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_PaymentTermsTypeID" ON __mj_BizAppsOrders."OrderHeader" ("PaymentTermsTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_InitialPaymentTypeID" ON __mj_BizAppsOrders."OrderHeader" ("InitialPaymentTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_InitialPaymentDetailID" ON __mj_BizAppsOrders."OrderHeader" ("InitialPaymentDetailID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_PostedByUserID" ON __mj_BizAppsOrders."OrderHeader" ("PostedByUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_ReversesOrderHeaderID" ON __mj_BizAppsOrders."OrderHeader" ("ReversesOrderHeaderID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_ApprovalTaskID" ON __mj_BizAppsOrders."OrderHeader" ("ApprovalTaskID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_SourceCheckoutWidgetID" ON __mj_BizAppsOrders."OrderHeader" ("SourceCheckoutWidgetID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_ConfirmedByUserID" ON __mj_BizAppsOrders."OrderHeader" ("ConfirmedByUserID");


-- ===================== Helper Functions (fn*) =====================

-- -----------------------------------------------------------------------------
-- 2. fnOrderHeaderRecurringMonthly — one order's monthly recurring amount, unrounded.
-- fnOrderHeaderRecurringMonthly: written by hand in SQL (the converter passes T-SQL inline
-- table-valued functions through untranslated). A scalar function here; the T-SQL is an inline TVF.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj_BizAppsOrders."fnOrderHeaderRecurringMonthly"(p_order_header_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $fn$
    SELECT SUM(ol."LineTotalNet" / m.months)
    FROM __mj_BizAppsOrders."OrderLine" ol
    JOIN __mj_BizAppsOrders."Product" pr ON pr."ID" = ol."ProductID"
    JOIN __mj_BizAppsOrders."SubscriptionType" st ON st."ID" = pr."SubscriptionTypeID"
    -- The day after the period ends, so the span is start (inclusive) to this (exclusive).
    CROSS JOIN LATERAL (
        SELECT CASE WHEN ol."ServicePeriodStart" IS NOT NULL AND ol."ServicePeriodEnd" >= ol."ServicePeriodStart"
                    THEN ol."ServicePeriodEnd" + 1 END AS after_end
    ) e
    -- Calendar months between the two, as DATEDIFF(MONTH) counts them.
    CROSS JOIN LATERAL (
        SELECT ((date_part('year', e.after_end) - date_part('year', ol."ServicePeriodStart")) * 12
              + (date_part('month', e.after_end) - date_part('month', ol."ServicePeriodStart")))::int AS whole0
    ) d
    -- Whole months from the start that fit before after_end. Adding an interval clamps month ends
    -- (Jan 31 + 1 month = Feb 28/29), as DATEADD does.
    CROSS JOIN LATERAL (
        SELECT CASE WHEN (ol."ServicePeriodStart" + d.whole0 * interval '1 month')::date > e.after_end
                    THEN d.whole0 - 1 ELSE d.whole0 END AS whole
    ) w
    CROSS JOIN LATERAL (
        SELECT CASE
                   WHEN e.after_end IS NOT NULL THEN
                       w.whole
                       + (e.after_end - (ol."ServicePeriodStart" + w.whole * interval '1 month')::date)::numeric
                         / ((ol."ServicePeriodStart" + (w.whole + 1) * interval '1 month')::date
                            - (ol."ServicePeriodStart" + w.whole * interval '1 month')::date)
                   ELSE COALESCE(st."DefaultTermMonths",
                                 CASE st."BillingCadence"
                                     WHEN 'Monthly' THEN 1
                                     WHEN 'Quarterly' THEN 3
                                     WHEN 'Annual' THEN 12
                                     ELSE GREATEST(1, ROUND(COALESCE(st."CustomCycleDays", 30) / 30.0))
                                 END)
               END::numeric AS months
    ) m
    WHERE ol."OrderHeaderID" = p_order_header_id
      AND ol."IsRollupParent" = FALSE
      AND ol."LineTotalNet" IS NOT NULL
      AND m.months > 0;
$fn$;


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_BizAppsOrders';
  v_target_name CONSTANT TEXT := 'vwOrderHeadersGenerated';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwOrderHeadersGenerated"
AS SELECT
    o.*,
    "MJCompany_CompanyID"."Name" AS "Company",
    "mjBizAppsCommonPerson_BillToPersonID"."DisplayName" AS "BillToPerson",
    "mjBizAppsCommonOrganization_BillToOrganizationID"."Name" AS "BillToOrganization",
    "MJUser_SalesRepUserID"."Name" AS "SalesRepUser",
    "mjBizAppsCommonAddress_BillToAddressID"."DisplayName" AS "BillToAddress",
    "mjBizAppsCommonAddress_ShipToAddressID"."DisplayName" AS "ShipToAddress",
    "mjBizAppsCommonOrganization_ShipToOrganizationID"."Name" AS "ShipToOrganization",
    "mjBizAppsCommonPerson_ShipToPersonID"."DisplayName" AS "ShipToPerson",
    "mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID"."Name" AS "PaymentTermsType",
    "mjBizAppsOrdersPaymentType_InitialPaymentTypeID"."Name" AS "InitialPaymentType",
    "mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID"."Last4" AS "InitialPaymentDetail",
    "MJUser_PostedByUserID"."Name" AS "PostedByUser",
    "mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID"."OrderNumber" AS "ReversesOrderHeader",
    "mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID"."Name" AS "SourceCheckoutWidget",
    "MJUser_ConfirmedByUserID"."Name" AS "ConfirmedByUser",
    __mj_emb_BillToAddressID."Latitude" AS "__mj_Latitude_BillToAddressID",
    __mj_emb_BillToAddressID."Longitude" AS "__mj_Longitude_BillToAddressID",
    __mj_emb_ShipToAddressID."Latitude" AS "__mj_Latitude_ShipToAddressID",
    __mj_emb_ShipToAddressID."Longitude" AS "__mj_Longitude_ShipToAddressID"
FROM
    __mj_BizAppsOrders."OrderHeader" AS o
INNER JOIN
    ${mjSchema}."Company" AS "MJCompany_CompanyID"
  ON
    o."CompanyID" = "MJCompany_CompanyID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsCommon."Person" AS "mjBizAppsCommonPerson_BillToPersonID"
  ON
    o."BillToPersonID" = "mjBizAppsCommonPerson_BillToPersonID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsCommon."Organization" AS "mjBizAppsCommonOrganization_BillToOrganizationID"
  ON
    o."BillToOrganizationID" = "mjBizAppsCommonOrganization_BillToOrganizationID"."ID"
LEFT OUTER JOIN
    ${mjSchema}."User" AS "MJUser_SalesRepUserID"
  ON
    o."SalesRepUserID" = "MJUser_SalesRepUserID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsCommon."Address" AS "mjBizAppsCommonAddress_BillToAddressID"
  ON
    o."BillToAddressID" = "mjBizAppsCommonAddress_BillToAddressID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsCommon."Address" AS "mjBizAppsCommonAddress_ShipToAddressID"
  ON
    o."ShipToAddressID" = "mjBizAppsCommonAddress_ShipToAddressID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsCommon."Organization" AS "mjBizAppsCommonOrganization_ShipToOrganizationID"
  ON
    o."ShipToOrganizationID" = "mjBizAppsCommonOrganization_ShipToOrganizationID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsCommon."Person" AS "mjBizAppsCommonPerson_ShipToPersonID"
  ON
    o."ShipToPersonID" = "mjBizAppsCommonPerson_ShipToPersonID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."PaymentTermsType" AS "mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID"
  ON
    o."PaymentTermsTypeID" = "mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."PaymentType" AS "mjBizAppsOrdersPaymentType_InitialPaymentTypeID"
  ON
    o."InitialPaymentTypeID" = "mjBizAppsOrdersPaymentType_InitialPaymentTypeID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."PaymentDetail" AS "mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID"
  ON
    o."InitialPaymentDetailID" = "mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID"."ID"
LEFT OUTER JOIN
    ${mjSchema}."User" AS "MJUser_PostedByUserID"
  ON
    o."PostedByUserID" = "MJUser_PostedByUserID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."OrderHeader" AS "mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID"
  ON
    o."ReversesOrderHeaderID" = "mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."CheckoutWidget" AS "mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID"
  ON
    o."SourceCheckoutWidgetID" = "mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID"."ID"
LEFT OUTER JOIN
    ${mjSchema}."User" AS "MJUser_ConfirmedByUserID"
  ON
    o."ConfirmedByUserID" = "MJUser_ConfirmedByUserID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsCommon."Address" AS __mj_emb_BillToAddressID
  ON
    o."BillToAddressID" = __mj_emb_BillToAddressID."ID"
LEFT OUTER JOIN
    __mj_BizAppsCommon."Address" AS __mj_emb_ShipToAddressID
  ON
    o."ShipToAddressID" = __mj_emb_ShipToAddressID."ID"$vsql$;
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
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreateOrderHeader]
--     @ID UUID = NULL,
--     @OrderNumber VARCHAR(40),
--     @OrderType VARCHAR(20) = NULL,
--     @OrderDate date,
--     @Status nvarcha...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdateOrderHeader]
--     @ID UUID,
--     @OrderNumber VARCHAR(40) = NULL,
--     @OrderType VARCHAR(20) = NULL,
--     @OrderDate date = NULL,
--     @Status ...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeleteOrderHeader]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[OrderHeader]
--     WHERE
--         [ID] = @...


-- ===================== Triggers =====================

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdateOrderHeader
-- ON "__mj_BizAppsOrders"."OrderHeader"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders"."OrderHeader"
--     SET
 


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- -----------------------------------------------------------------------------
-- 4. Fill the two new columns on every existing order. Only these two columns are written.
-- -----------------------------------------------------------------------------
UPDATE __mj_BizAppsOrders."OrderHeader" o
SET "RecurringMonthlyTotal" = ROUND(COALESCE(__mj_BizAppsOrders."fnOrderHeaderRecurringMonthly"(o."ID"), 0), 2),
    "RecurringAnnualTotal"  = ROUND(COALESCE(__mj_BizAppsOrders."fnOrderHeaderRecurringMonthly"(o."ID"), 0), 2) * 12;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = '36aae6b7-0d4d-4694-8c67-43461916a23e' OR ("EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND "Name" = 'RecurringMonthlyTotal')
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
        '36aae6b7-0d4d-4694-8c67-43461916a23e',
        'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- "Entity": "MJ_BizApps_Orders": Order "Headers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
        'RecurringMonthlyTotal',
        'Recurring Monthly Total',
        'The order''s recurring revenue per month: each subscription line''s net amount divided by the months it covers (its service period, or its subscription type''s term when it has none). One-time lines add nothing. Maintained by spRecalcOrderHeaderTotals whenever a line changes; never set by hand.',
        'decimal',
        9,
        18,
        2,
        1,
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
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = 'a047bff6-7c25-4196-8e30-2ce0f838f426' OR ("EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND "Name" = 'RecurringAnnualTotal')
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
        'a047bff6-7c25-4196-8e30-2ce0f838f426',
        'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- "Entity": "MJ_BizApps_Orders": Order "Headers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
        'RecurringAnnualTotal',
        'Recurring Annual Total',
        'The order''s recurring revenue per year: twelve times RecurringMonthlyTotal. Maintained by spRecalcOrderHeaderTotals whenever a line changes; never set by hand.',
        'decimal',
        9,
        18,
        2,
        1,
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
        0,
        0,
        0,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;


-- ===================== Grants =====================

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderHeader" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderHeader" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderHeader" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Order Headers */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderHeader" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderHeader" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderHeader" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: spUpdateOrderHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderHeader
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderHeader" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderHeader" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderHeader" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderHeader" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderHeader" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderHeader" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: spDeleteOrderHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderHeader
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderHeader" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderHeader" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderHeader" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Order Headers */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderHeader" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderHeader" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderHeader" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Refresh custom base views for modified entities so schema changes are picked up */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeader"."RecurringMonthlyTotal" IS 'The order''s recurring revenue per month: each subscription line''s net amount divided by the months it covers (its service period, or its subscription type''s term when it has none). One-time lines add nothing. Maintained by spRecalcOrderHeaderTotals whenever a line changes; never set by hand.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeader"."RecurringAnnualTotal" IS 'The order''s recurring revenue per year: twelve times RecurringMonthlyTotal. Maintained by spRecalcOrderHeaderTotals whenever a line changes; never set by hand.';


-- ===================== Other =====================

-- -----------------------------------------------------------------------------
-- 3. spRecalcOrderHeaderTotals — as V202610131515 left it, plus
--    RecurringMonthlyTotal and RecurringAnnualTotal.
-- spRecalcOrderHeaderTotals: written by hand in plpgsql (the converter passes T-SQL procedures and triggers through untranslated)
-- -----------------------------------------------------------------------------
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
            END,
        "RecurringMonthlyTotal" = ROUND(COALESCE(rc."Monthly", 0), 2),
        "RecurringAnnualTotal"  = ROUND(COALESCE(rc."Monthly", 0), 2) * 12
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
    CROSS JOIN LATERAL (
        SELECT __mj_BizAppsOrders."fnOrderHeaderRecurringMonthly"(ids.id) AS "Monthly"
    ) rc
    WHERE o."ID" = ids.id;

    PERFORM __mj_BizAppsOrders."spRecalcOrderHeaderPaymentSchedule"(p_order_header_ids);
END;
$fn$;

-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above, generated against a database
-- built from this repo's migrations: the two new Order Headers fields,
-- vwOrderHeaders and the Order Headers CRUD procs.
-- =============================================================================


/* SQL text to insert 2 new entity field(s) */

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: Permissions for vwOrderHeaders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

/* spUpdate Permissions for MJ_BizApps_Orders: Order Headers */
