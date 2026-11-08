-- =============================================================================================
-- PostgreSQL counterpart of V202610131511__v5.32.x__OrderHeader_VAT_Location_Evidence.sql
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


-- ===================== DDL: Tables, PKs, Indexes =====================

-- =============================================================================
-- V202610131511 — OrderHeader.IPCountry and OrderHeader.CardIssuingCountry: VAT location
-- evidence for self-serve checkout (MemberJunction/bizapps-orders#480)
-- =============================================================================
-- VAT on digital sales to buyers in the EU or UK expects two pieces of non-contradictory
-- location evidence. Self-serve checkout records one, the billing address the order references
-- (BillToAddressID). These two columns hold the others it can collect at the moment of sale:
--
--   IPCountry           ISO 3166-1 alpha-2 country of the buyer's IP address, resolved at
--                       checkout from a country header set by the proxy or CDN in front of the
--                       server. The code only: the IP address itself is never stored.
--   CardIssuingCountry  ISO 3166-1 alpha-2 country of the card's issuer, as the payment gateway
--                       reports it for the card that paid.
--
-- Both are nullable with no backfill: neither value can be recovered for a sale already made,
-- and a checkout whose IP country or card country cannot be resolved still completes.
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
--
-- CodeGen output for this app is folded below the banner at the end of this file. It regenerates
-- vwOrderHeadersGenerated with the Address geo embed joins (__mj_Latitude_/__mj_Longitude_ for
-- BillToAddressID and ShipToAddressID). V202610131507 already rebuilt that view with those columns,
-- and the four virtual EntityField rows for them are created by V202610131508's CodeGen output, the
-- next migration: CodeGen registers a view's new columns on the run after it rebuilds the view.
-- Without them a database
-- built from migrations would return view columns its entity metadata does not list, and every
-- Order Header save would fail (MemberJunction/bizapps-orders#491).
-- =============================================================================

ALTER TABLE __mj_BizAppsOrders."OrderHeader"
 ADD COLUMN IF NOT EXISTS "IPCountry" CHAR(2) NULL,
 ADD COLUMN IF NOT EXISTS "CardIssuingCountry" CHAR(2) NULL;

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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b943953a-7718-40d4-bfbb-fd00f0f220f8' OR ("EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND "Name" = 'IPCountry')
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
        'b943953a-7718-40d4-bfbb-fd00f0f220f8',
        'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- "Entity": "MJ_BizApps_Orders": Order "Headers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
        'IPCountry',
        'IP Country',
        'ISO 3166-1 alpha-2 country of the buyer''s IP address at self-serve checkout, read from the country header the proxy or CDN in front of the server sets. VAT location evidence alongside the billing address. The IP address itself is never stored. NULL when the order did not come through self-serve checkout, when no country header is configured, or when the country could not be resolved.',
        'char',
        2,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1f88b4f6-aa95-414e-bd1c-11e87be33284' OR ("EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND "Name" = 'CardIssuingCountry')
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
        '1f88b4f6-aa95-414e-bd1c-11e87be33284',
        'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- "Entity": "MJ_BizApps_Orders": Order "Headers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
        'CardIssuingCountry',
        'Card Issuing Country',
        'ISO 3166-1 alpha-2 country of the issuer of the card that paid at self-serve checkout, as the payment gateway reports it. VAT location evidence alongside the billing address. NULL when the order was not paid by card through self-serve checkout, or when the gateway did not report a country.',
        'char',
        2,
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
SET 
   "Category" = 'Accounting and Audit',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'GeoCountry'
WHERE 
   "ID" = 'B943953A-7718-40D4-BFBB-FD00F0F220F8';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.CardIssuingCountry

UPDATE __mj."EntityField"
SET 
   "Category" = 'Accounting and Audit',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'GeoCountry'
WHERE 
   "ID" = '1F88B4F6-AA95-414E-BD1C-11E87BE33284';

/* Refresh custom base views for modified entities so schema changes are picked up */


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
/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.IPCountry;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeader"."IPCountry" IS 'ISO 3166-1 alpha-2 country of the buyer''s IP address at self-serve checkout, read from the country header the proxy or CDN in front of the server sets. VAT location evidence alongside the billing address. The IP address itself is never stored. NULL when the order did not come through self-serve checkout, when no country header is configured, or when the country could not be resolved.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeader"."CardIssuingCountry" IS 'ISO 3166-1 alpha-2 country of the issuer of the card that paid at self-serve checkout, as the payment gateway reports it. VAT location evidence alongside the billing address. NULL when the order was not paid by card through self-serve checkout, or when the gateway did not report a country.';


-- ===================== Other =====================

-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL, regenerated for the combined PR (bizapps-orders#645) against a
-- database built from its migrations: the two OrderHeader fields and their categories, and the
-- Order Header views, CRUD procs, FK indexes and grants. Left out: validators the run
-- regenerated for other entities; they are not this change's.
-- =============================================================================


/* SQL text to insert 2 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Order Headers */
