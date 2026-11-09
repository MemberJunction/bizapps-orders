-- =============================================================================================
-- PostgreSQL counterpart of V202610131508__v5.32.x__OrderConcession_TermDates.sql
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
--   * 9 string values restored verbatim from the T-SQL: the converter re-indents text inside string
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
-- V202610131508 — Shifting or shortening a booked term (#507)
-- =============================================================================
-- An amendment could only move a booked term's end later (a Duration concession).
-- Moving its start and end together (a shift) or giving the customer less time (a
-- shortening) had no record to carry it, so both were corrected by hand.
--
-- What this file does, in order:
--   1. OrderConcession gains two delivery forms, Shift and Shorten, and the term's
--      dates before and after the change. A Shift moves start and end by the same
--      number of days. A Shorten starts no earlier and ends no later than before.
--      The dates are recorded only on those two forms.
--   2. SubscriptionEvent gains two event types, Rescheduled and Shortened, logged
--      when an approved Shift or Shorten is applied to its term.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. OrderConcession: the Shift and Shorten forms
-- -----------------------------------------------------------------------------
ALTER TABLE __mj_BizAppsOrders."OrderConcession"
 ADD COLUMN IF NOT EXISTS "PriorStartDate" DATE NULL,
 ADD COLUMN IF NOT EXISTS "PriorEndDate" DATE NULL,
 ADD COLUMN IF NOT EXISTS "NewStartDate" DATE NULL,
 ADD COLUMN IF NOT EXISTS "NewEndDate" DATE NULL;

ALTER TABLE __mj_BizAppsOrders."OrderConcession" DROP CONSTRAINT "CK_OrderConcession_DeliveryForm";

-- -----------------------------------------------------------------------------
-- 2. SubscriptionEvent: Rescheduled and Shortened
-- -----------------------------------------------------------------------------
ALTER TABLE __mj_BizAppsOrders."SubscriptionEvent" DROP CONSTRAINT "CK_SubscriptionEvent_EventType";

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

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_SourceCheckoutWidgetID" ON __mj_BizAppsOrders."OrderHeader" ("SourceCheckoutWidgetID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_ConfirmedByUserID" ON __mj_BizAppsOrders."OrderHeader" ("ConfirmedByUserID");


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
  v_target_name CONSTANT TEXT := 'vwOrderHeadersGenerated';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwOrderHeadersGenerated"
AS SELECT
    o.*,
    "MJCompany_CompanyID"."Name" AS "Company",
    "mjBizAppsCommonPerson_BillToPersonID"."DisplayName" AS "BillToPerson",
    "mjBizAppsCommonOrganization_BillToOrganizationID"."Name" AS "BillToOrganization",
    "MJUser_SalesRepUserID"."Name" AS "SalesRepUser",
    "mjBizAppsCommonAddress_BillToAddressID"."Line1" AS "BillToAddress",
    "mjBizAppsCommonAddress_ShipToAddressID"."Line1" AS "ShipToAddress",
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
    __mj."Company" AS "MJCompany_CompanyID"
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
    __mj."User" AS "MJUser_SalesRepUserID"
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
    __mj."User" AS "MJUser_PostedByUserID"
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
    __mj."User" AS "MJUser_ConfirmedByUserID"
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
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdateOrderConcession
-- ON "__mj_BizAppsOrders"."OrderConcession"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders"."OrderConcessio

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders".trgUpdateOrderHeader
-- ON "__mj_BizAppsOrders"."OrderHeader"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders"."OrderHeader"
--     SET
 


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '09ebbe39-5e50-4390-9f85-d391a8180564' OR ("EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND "Name" = '__mj_Latitude_BillToAddressID')
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
        '09ebbe39-5e50-4390-9f85-d391a8180564',
        'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- "Entity": "MJ_BizApps_Orders": Order "Headers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
        '__mj_Latitude_BillToAddressID',
        'Mj Latitude Bill To Address ID',
        NULL,
        'decimal',
        5,
        9,
        6,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '93d40c53-aaba-4ad1-b4a3-d1fa4c5dba32' OR ("EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND "Name" = '__mj_Longitude_BillToAddressID')
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
        '93d40c53-aaba-4ad1-b4a3-d1fa4c5dba32',
        'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- "Entity": "MJ_BizApps_Orders": Order "Headers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
        '__mj_Longitude_BillToAddressID',
        'Mj Longitude Bill To Address ID',
        NULL,
        'decimal',
        5,
        9,
        6,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1a494c12-70f6-4c02-b1fe-15461d79bac8' OR ("EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND "Name" = '__mj_Latitude_ShipToAddressID')
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
        '1a494c12-70f6-4c02-b1fe-15461d79bac8',
        'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- "Entity": "MJ_BizApps_Orders": Order "Headers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
        '__mj_Latitude_ShipToAddressID',
        'Mj Latitude Ship To Address ID',
        NULL,
        'decimal',
        5,
        9,
        6,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '27e4dafa-8e8d-420c-a298-7a4865061403' OR ("EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND "Name" = '__mj_Longitude_ShipToAddressID')
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
        '27e4dafa-8e8d-420c-a298-7a4865061403',
        'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- "Entity": "MJ_BizApps_Orders": Order "Headers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
        '__mj_Longitude_ShipToAddressID',
        'Mj Longitude Ship To Address ID',
        NULL,
        'decimal',
        5,
        9,
        6,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd6c1c5ee-a0bb-4071-90cf-ae36c1a73ef7' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'PriorStartDate')
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
        'd6c1c5ee-a0bb-4071-90cf-ae36c1a73ef7',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'PriorStartDate',
        'Prior Start Date',
        'For a Shift or Shorten concession, the term''s start date before the change.',
        'date',
        3,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '701f65bb-05b0-405c-9606-43c860ca24c7' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'PriorEndDate')
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
        '701f65bb-05b0-405c-9606-43c860ca24c7',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'PriorEndDate',
        'Prior End Date',
        'For a Shift or Shorten concession, the term''s end date before the change.',
        'date',
        3,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4d3b0414-af91-454f-a2e1-222c14448db8' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'NewStartDate')
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
        '4d3b0414-af91-454f-a2e1-222c14448db8',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'NewStartDate',
        'New Start Date',
        'For a Shift or Shorten concession, the term''s start date once it is approved and applied.',
        'date',
        3,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '964190f9-bdf5-43b6-85e3-7fc3a9179a75' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'NewEndDate')
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
        '964190f9-bdf5-43b6-85e3-7fc3a9179a75',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'NewEndDate',
        'New End Date',
        'For a Shift or Shorten concession, the term''s end date once it is approved and applied.',
        'date',
        3,
        10,
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
                                       ('6d3ef1ab-b80b-4f7b-bef3-c955612e723d', '8662A268-9580-42FD-9D59-A91BE9237AE9', 5, 'Shift', 'Shift', NOW(), NOW());

/* SQL text to insert entity field value with ID 1a0943a9-7cd5-453b-a039-e8b49f7e7e36 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('1a0943a9-7cd5-453b-a039-e8b49f7e7e36', '8662A268-9580-42FD-9D59-A91BE9237AE9', 6, 'Shorten', 'Shorten', NOW(), NOW());

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=7 WHERE "ID"='C892EB79-8175-40E7-AA5D-28AC06C13214';

/* SQL text to insert entity field value with ID 673968ea-dbe8-47d4-bfc1-92c3bf7f5238 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('673968ea-dbe8-47d4-bfc1-92c3bf7f5238', 'E2EDA043-B7D5-45C9-8606-AF585833EB10', 11, 'Rescheduled', 'Rescheduled', NOW(), NOW());

/* SQL text to insert entity field value with ID 706bba1b-51e8-4664-a471-7a99e3fc9808 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('706bba1b-51e8-4664-a471-7a99e3fc9808', 'E2EDA043-B7D5-45C9-8606-AF585833EB10', 13, 'Shortened', 'Shortened', NOW(), NOW());

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=12 WHERE "ID"='F51C8686-A10E-4655-A06C-466B469B89E6';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=14 WHERE "ID"='D9945CF3-A591-4C90-9384-287538F38E14';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=15 WHERE "ID"='8079E095-2576-49E6-8718-49D0AEC04981';

/* Index for Foreign Keys for OrderConcession */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderHeaderID in table OrderConcession

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '8662A268-9580-42FD-9D59-A91BE9237AE9'
               AND "AutoUpdateIsNameField" = TRUE;

/* Set categories for 4 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.__mj_Latitude_BillToAddressID

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Bill To Address Latitude',
   "ExtendedType" = 'GeoLatitude'
WHERE 
   "ID" = '09EBBE39-5E50-4390-9F85-D391A8180564';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.__mj_Longitude_BillToAddressID

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Bill To Address Longitude',
   "ExtendedType" = 'GeoLongitude'
WHERE 
   "ID" = '93D40C53-AABA-4AD1-B4A3-D1FA4C5DBA32';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.__mj_Latitude_ShipToAddressID

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Ship To Address Latitude',
   "ExtendedType" = 'GeoLatitude'
WHERE 
   "ID" = '1A494C12-70F6-4C02-B1FE-15461D79BAC8';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.__mj_Longitude_ShipToAddressID

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Ship To Address Longitude',
   "ExtendedType" = 'GeoLongitude'
WHERE 
   "ID" = '27E4DAFA-8E8D-420C-A298-7A4865061403';

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.ID

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = 'A20C25AA-D978-4CEF-8B27-95682245805C';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.PriorStartDate

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = 'D6C1C5EE-A0BB-4071-90CF-AE36C1A73EF7';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.PriorEndDate

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '701F65BB-05B0-405C-9606-43C860CA24C7';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.NewStartDate

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '4D3B0414-AF91-454F-A2E1-222C14448DB8';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.NewEndDate

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '964190F9-BDF5-43B6-85E3-7FC3A9179A75';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.OrderHeader

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '6B9DF5C7-1467-416F-B88B-764034221FB0';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.RequestedByUser

UPDATE __mj."EntityField"
SET 
   "Category" = 'Approval',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '66800E4E-C4AC-49C0-8DCA-DA365B318AA0';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.SalesRule

UPDATE __mj."EntityField"
SET 
   "Category" = 'Value and Limits',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '1C4C2B3F-D471-425F-9E38-C52D243DB6F8';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.DecidedByUser

UPDATE __mj."EntityField"
SET 
   "Category" = 'Approval',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '20092E3B-3270-4C69-8D59-2A0967BC32B3';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.PriorPaymentTermsType

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '163FD39E-C1A4-4BCC-AEAE-382967131C2A';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.NewPaymentTermsType

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '170A0156-EDFA-452C-A627-95B51BDB832B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.ReferralProgram

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '7AB01FC9-B230-4E64-8682-633D1619BEF1';

/* Set entity icon to fa fa-hand-holding-usd */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-hand-holding-usd', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '0E13E45B-0FF1-4B09-8919-CE576829E178';

/* Refresh custom base views for modified entities so schema changes are picked up */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '69EDF4F8-647F-439A-A1E6-78CEB645864F'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('97d510a2-fbf3-4e66-9a27-641bed07f338', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ComputedValue]>=(0))', 'public ValidateComputedValueGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.ComputedValue != null && this.ComputedValue < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"ComputedValue",
			"Computed value must be greater than or equal to 0.",
			this.ComputedValue,
			ValidationErrorType.Failure
		));
	}
}', 'Computed value must be greater than or equal to zero.', 'ValidateComputedValueGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '69EDF4F8-647F-439A-A1E6-78CEB645864F');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '8E9B946E-A25F-4071-B8B7-1FBDC5290D04'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('309c3dd5-7e34-40b1-a193-cb2086ba5629', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([CumulativeShare]>=(0))', 'public ValidateCumulativeShareNonNegative(result: ValidationResult) {
	if (this.CumulativeShare != null && this.CumulativeShare < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"CumulativeShare",
			"Cumulative share must be greater than or equal to 0.",
			this.CumulativeShare,
			ValidationErrorType.Failure
		));
	}
}', 'Cumulative share must be greater than or equal to zero to ensure positive or zero accumulation.', 'ValidateCumulativeShareNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '8E9B946E-A25F-4071-B8B7-1FBDC5290D04');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('b69394b8-1c6d-421b-ba0b-7fb6546d7141', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Status]=''Pending'' OR [DecidedByUserID] IS NOT NULL AND [DecidedAt] IS NOT NULL)', 'public ValidateDecisionInfoWhenNotPending(result: ValidationResult) {
	if (this.Status !== ''Pending'' && (this.DecidedByUserID == null || this.DecidedAt == null)) {
		result.Errors.push(new ValidationErrorInfo(
			"DecidedByUserID",
			"Both the deciding user and decision timestamp must be provided when status is not Pending.",
			this.DecidedByUserID,
			ValidationErrorType.Failure
		));
	}
}', 'When a record''s status is updated past ''Pending'', both the deciding user and the decision timestamp must be recorded.', 'ValidateDecisionInfoWhenNotPending', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('51d64ee0-540c-47dc-a088-44bcf4cbc449', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '(NOT ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [PriorStartDate] IS NULL AND [PriorEndDate] IS NULL AND [NewStartDate] IS NULL AND [NewEndDate] IS NULL OR ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [SubscriptionTermID] IS NOT NULL AND [PriorStartDate] IS NOT NULL AND [PriorEndDate] IS NOT NULL AND [NewStartDate] IS NOT NULL AND [NewEndDate] IS NOT NULL AND [NewEndDate]>=[NewStartDate] AND [AddedQuantity] IS NULL AND [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL AND ([DeliveryForm]=''Shift'' AND datediff(day,[PriorStartDate],[NewStartDate])=datediff(day,[PriorEndDate],[NewEndDate]) AND [NewStartDate]<>[PriorStartDate] OR [DeliveryForm]=''Shorten'' AND [NewStartDate]>=[PriorStartDate] AND [NewEndDate]<=[PriorEndDate] AND ([NewStartDate]<>[PriorStartDate] OR [NewEndDate]<>[PriorEndDate])))', 'public ValidateDeliveryFormAndDateAdjustments(result: ValidationResult): void {
	const isShift = this.DeliveryForm === "Shift";
	const isShorten = this.DeliveryForm === "Shorten";

	if (!isShift && !isShorten) {
		if (this.PriorStartDate != null || this.PriorEndDate != null || this.NewStartDate != null || this.NewEndDate != null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Start and end dates must be null when DeliveryForm is not ''Shift'' or ''Shorten''.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	} else {
		if (this.SubscriptionTermID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"SubscriptionTermID",
				"SubscriptionTermID is required when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.SubscriptionTermID,
				ValidationErrorType.Failure
			));
		}
		if (this.PriorStartDate == null || this.PriorEndDate == null || this.NewStartDate == null || this.NewEndDate == null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Prior and new start/end dates are required when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
		if (this.AddedQuantity != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AddedQuantity",
				"AddedQuantity must be null when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.AddedQuantity,
				ValidationErrorType.Failure
			));
		}
		if (this.PriorPaymentTermsTypeID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"PriorPaymentTermsTypeID",
				"PriorPaymentTermsTypeID must be null when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.PriorPaymentTermsTypeID,
				ValidationErrorType.Failure
			));
		}
		if (this.NewPaymentTermsTypeID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"NewPaymentTermsTypeID",
				"NewPaymentTermsTypeID must be null when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.NewPaymentTermsTypeID,
				ValidationErrorType.Failure
			));
		}

		if (this.PriorStartDate != null && this.PriorEndDate != null && this.NewStartDate != null && this.NewEndDate != null) {
			const priorStart = new Date(this.PriorStartDate).getTime();
			const priorEnd = new Date(this.PriorEndDate).getTime();
			const newStart = new Date(this.NewStartDate).getTime();
			const newEnd = new Date(this.NewEndDate).getTime();

			if (newEnd < newStart) {
				result.Errors.push(new ValidationErrorInfo(
					"NewEndDate",
					"New End Date must be greater than or equal to New Start Date.",
					this.NewEndDate,
					ValidationErrorType.Failure
				));
			}

			if (isShift) {
				const startDiffDays = Math.round((newStart - priorStart) / (1000 * 60 * 60 * 24));
				const endDiffDays = Math.round((newEnd - priorEnd) / (1000 * 60 * 60 * 24));

				if (newStart === priorStart) {
					result.Errors.push(new ValidationErrorInfo(
						"NewStartDate",
						"For ''Shift'' delivery form, New Start Date must differ from Prior Start Date.",
						this.NewStartDate,
						ValidationErrorType.Failure
					));
				}
				if (startDiffDays !== endDiffDays) {
					result.Errors.push(new ValidationErrorInfo(
						"DeliveryForm",
						"For ''Shift'' delivery form, the shift duration for start date and end date must be equal.",
						this.DeliveryForm,
						ValidationErrorType.Failure
					));
				}
			} else if (isShorten) {
				if (newStart < priorStart) {
					result.Errors.push(new ValidationErrorInfo(
						"NewStartDate",
						"For ''Shorten'' delivery form, New Start Date must be greater than or equal to Prior Start Date.",
						this.NewStartDate,
						ValidationErrorType.Failure
					));
				}
				if (newEnd > priorEnd) {
					result.Errors.push(new ValidationErrorInfo(
						"NewEndDate",
						"For ''Shorten'' delivery form, New End Date must be less than or equal to Prior End Date.",
						this.NewEndDate,
						ValidationErrorType.Failure
					));
				}
				if (newStart === priorStart && newEnd === priorEnd) {
					result.Errors.push(new ValidationErrorInfo(
						"DeliveryForm",
						"For ''Shorten'' delivery form, either New Start Date or New End Date must differ from prior dates.",
						this.DeliveryForm,
						ValidationErrorType.Failure
					));
				}
			}
		}
	}
}', 'Enforces date and field rules based on the delivery form. When the delivery form is neither ''Shift'' nor ''Shorten'', all start and end date fields must be null. When the delivery form is ''Shift'' or ''Shorten'', a subscription term is required, added quantities and payment terms must be omitted, and all start and end dates must be provided. For ''Shift'', the start date must change and both start and end dates must shift by the exact same number of days. For ''Shorten'', the new date range must fall within the prior date range and reduce the overall duration.', 'ValidateDeliveryFormAndDateAdjustments', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('6decc674-7999-48e6-becd-4a1d75027b42', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Duration'' OR [SubscriptionTermID] IS NOT NULL AND [AddedDays]>(0))', 'public ValidateDeliveryFormDurationRequirements(result: ValidationResult) {
	if (this.DeliveryForm === ''Duration'') {
		if (this.SubscriptionTermID == null || this.AddedDays == null || this.AddedDays <= 0) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"When DeliveryForm is ''Duration'', a Subscription Term must be specified and Added Days must be greater than 0.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When the delivery form is set to Duration, a valid subscription term must be provided and added days must be greater than zero.', 'ValidateDeliveryFormDurationRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('e87801cd-ff04-4092-adfd-1d92e620add1', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Terms'' OR [NewPaymentTermsTypeID] IS NOT NULL AND ([PriorPaymentTermsTypeID] IS NULL OR [PriorPaymentTermsTypeID]<>[NewPaymentTermsTypeID]) AND [AddedDays] IS NOT NULL AND [OrderLineID] IS NULL AND [SubscriptionTermID] IS NULL AND [AddedQuantity] IS NULL)', 'public ValidateDeliveryFormTermsRequirements(result: ValidationResult) {
	if (this.DeliveryForm === ''Terms'') {
		const isNewPaymentTermsMissing = this.NewPaymentTermsTypeID == null;
		const isSamePaymentTerms = this.PriorPaymentTermsTypeID != null && this.NewPaymentTermsTypeID != null && this.PriorPaymentTermsTypeID === this.NewPaymentTermsTypeID;
		const isAddedDaysMissing = this.AddedDays == null;
		const hasOrderLineID = this.OrderLineID != null;
		const hasSubscriptionTermID = this.SubscriptionTermID != null;
		const hasAddedQuantity = this.AddedQuantity != null;

		if (isNewPaymentTermsMissing || isSamePaymentTerms || isAddedDaysMissing || hasOrderLineID || hasSubscriptionTermID || hasAddedQuantity) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"When DeliveryForm is ''Terms'', new payment terms and added days are required, new payment terms must differ from prior payment terms, and OrderLineID, SubscriptionTermID, and AddedQuantity must be empty.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When delivery form is set to ''Terms'', new payment terms and added days must be specified, new payment terms must differ from prior payment terms, and order line, subscription term, and added quantity must be empty.', 'ValidateDeliveryFormTermsRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('706536d1-5310-4964-95ae-0cf3b563a4e4', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '(NOT ([DeliveryForm]=''Scope'' OR [DeliveryForm]=''Price'') OR [OrderLineID] IS NOT NULL)', 'public ValidateOrderLineIDRequiredForDeliveryForm(result: ValidationResult) {
	if ((this.DeliveryForm === ''Scope'' || this.DeliveryForm === ''Price'') && this.OrderLineID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"OrderLineID",
			"An Order Line must be specified when Delivery Form is ''Scope'' or ''Price''.",
			this.OrderLineID,
			ValidationErrorType.Failure
		));
	}
}', 'If the delivery form is ''Scope'' or ''Price'', an order line must be specified.', 'ValidateOrderLineIDRequiredForDeliveryForm', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('04355f90-94bc-44ba-adb3-df3cc2119659', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DeliveryForm]=''Terms'' OR [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL)', 'public ValidatePaymentTermsTypesByDeliveryForm(result: ValidationResult) {
	if (this.DeliveryForm !== "Terms" && (this.PriorPaymentTermsTypeID != null || this.NewPaymentTermsTypeID != null)) {
		result.Errors.push(new ValidationErrorInfo(
			"DeliveryForm",
			"Payment terms types can only be specified when the delivery form is ''Terms''.",
			this.DeliveryForm,
			ValidationErrorType.Failure
		));
	}
}', 'Payment terms types (prior or new) can only be specified when the delivery form is set to ''Terms''.', 'ValidatePaymentTermsTypesByDeliveryForm', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('e11328e2-59dd-4db5-a22c-99c7610c1cfc', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Seats'' OR [OrderLineID] IS NOT NULL AND [AddedQuantity]>(0))', 'public ValidateSeatsDeliveryFormRequirements(result: ValidationResult) {
	if (this.DeliveryForm === "Seats") {
		if (this.OrderLineID == null || this.AddedQuantity == null || this.AddedQuantity <= 0) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"When Delivery Form is ''Seats'', an Order Line must be associated and Added Quantity must be greater than 0.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When the delivery form is set to ''Seats'', an order line must be specified and the added quantity must be greater than zero.', 'ValidateSeatsDeliveryFormRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj_BizAppsOrders."OrderConcession"
 ADD CONSTRAINT "CK_OrderConcession_DeliveryForm"
    CHECK ("DeliveryForm" IN ('Price','Duration','Scope','Seats','Terms','Shift','Shorten')) NOT VALID;

-- A Shift or Shorten names its term and both pairs of dates. A Shift moves start and end by the same
-- non-zero number of days. A Shorten keeps the term inside its old dates and changes at least one of them.
ALTER TABLE __mj_BizAppsOrders."OrderConcession"
 ADD CONSTRAINT "CK_OrderConcession_TermDates"
    CHECK (
        ("DeliveryForm" NOT IN ('Shift','Shorten')
            AND "PriorStartDate" IS NULL AND "PriorEndDate" IS NULL
            AND "NewStartDate" IS NULL AND "NewEndDate" IS NULL)
        OR ("DeliveryForm" IN ('Shift','Shorten')
            AND "SubscriptionTermID" IS NOT NULL
            AND "PriorStartDate" IS NOT NULL AND "PriorEndDate" IS NOT NULL
            AND "NewStartDate" IS NOT NULL AND "NewEndDate" IS NOT NULL
            AND "NewEndDate" >= "NewStartDate"
            AND "AddedQuantity" IS NULL
            AND "PriorPaymentTermsTypeID" IS NULL AND "NewPaymentTermsTypeID" IS NULL
            AND (
                ("DeliveryForm" = 'Shift'
                    AND "DATEDIFF"(day, "PriorStartDate", "NewStartDate") = "DATEDIFF"(day, "PriorEndDate", "NewEndDate")
                    AND "NewStartDate" <> "PriorStartDate")
                OR ("DeliveryForm" = 'Shorten'
                    AND "NewStartDate" >= "PriorStartDate"
                    AND "NewEndDate" <= "PriorEndDate"
                    AND ("NewStartDate" <> "PriorStartDate" OR "NewEndDate" <> "PriorEndDate"))
            ))
    ) NOT VALID;

ALTER TABLE __mj_BizAppsOrders."SubscriptionEvent"
 ADD CONSTRAINT "CK_SubscriptionEvent_EventType"
    CHECK ("EventType" IN ('Created','Activated','TrialStarted','TrialEnded','PaymentSucceeded','PaymentFailed','Paused','Resumed','CancellationRequested','Canceled','Migrated','Extended','RenewalOrderSpawned','Rescheduled','Shortened')) NOT VALID;


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
/* Index for Foreign Keys for OrderHeader */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table OrderHeader;

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
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."DeliveryForm" IS 'How the value was given: Price (a lower price than the price engine''s), Duration (a term extended at no charge), Scope (a product added at no charge), Seats (quantity added at no charge), Terms (a confirmed order''s payment terms changed), Shift (a booked term''s start and end moved by the same number of days), Shorten (a booked term started later or ended earlier).';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."PriorStartDate" IS 'For a Shift or Shorten concession, the term''s start date before the change.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."PriorEndDate" IS 'For a Shift or Shorten concession, the term''s end date before the change.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."NewStartDate" IS 'For a Shift or Shorten concession, the term''s start date once it is approved and applied.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."NewEndDate" IS 'For a Shift or Shorten concession, the term''s end date once it is approved and applied.';


-- ===================== Other =====================

-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above, regenerated for the combined PR
-- (bizapps-orders#645) against a database built from its migrations: the four new
-- Order Concessions date fields and their categories, value-list values, FK indexes,
-- vwOrderConcessions, CRUD procs, permissions and Order Concessions' validators. The
-- run also emitted the Order Headers address geo fields (__mj_Latitude_/__mj_Longitude_
-- for BillToAddressID and ShipToAddressID), which no earlier migration creates, and the
-- Order Headers view and CRUD; they are kept here. Validators CodeGen regenerated for
-- other entities are in V202610131507__v5.32.x__CodeGen_Drift_Heal.sql.
-- =============================================================================


/* SQL text to insert 8 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Order Concessions */

/* spUpdate Permissions for MJ_BizApps_Orders: Order Headers */

-- ===================== Skipped by the converter, translated by hand =====================
-- CodeGen's related-entity name-field map updates and changed column descriptions.
COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."DeliveryForm" IS 'How the value was given: Price (a lower price than the price engine''s), Duration (a term extended at no charge), Scope (a product added at no charge), Seats (quantity added at no charge), Terms (a confirmed order''s payment terms changed), Shift (a booked term''s start and end moved by the same number of days), Shorten (a booked term started later or ended earlier).';
