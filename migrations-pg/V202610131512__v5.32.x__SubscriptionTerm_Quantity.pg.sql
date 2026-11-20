-- =============================================================================================
-- PostgreSQL counterpart of V202610131512__v5.32.x__SubscriptionTerm_Quantity.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) output, finished by hand:
--   * Tables, columns, constraints, indexes, views, data and grants are the converter's.
--   * CodeGen's CRUD procedures (spCreate/spUpdate/spDelete) and its __mj_UpdatedAt triggers are
--     NOT here: the converter cannot translate T-SQL procedures or triggers, and this repository
--     has no PostgreSQL baseline to run MJ CodeGen against. A PostgreSQL host runs `mj codegen`
--     after installing, which generates them natively. The converter's notes for them remain,
--     fully commented out.
--   * SubscriptionTerm.Quantity backfill: written by hand in PL/pgSQL from this migration's T-SQL.
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
-- V202610131512 — SubscriptionTerm.Quantity: how many seats a term covers
--                 (MemberJunction/bizapps-orders#589)
-- =============================================================================
-- A subscription line bought at quantity 10 bills ten times the rate and creates
-- one subscription with one term. Nothing recorded the 10. The order line could
-- not stand in for it either: a prorated first period is priced by scaling the
-- line's quantity (10 seats at a factor of 0.5 store Quantity 5), so after
-- booking the seat count existed nowhere. Entitlement grants and renewals read
-- the scaled number, so a half-length first period granted and renewed 5 seats.
--
-- The count lives on the TERM, not the subscription: each term is one purchase,
-- so a renewal at a different seat count is a new term with its own count and
-- the earlier terms keep theirs. A subscription's current seat count is its
-- active term's.
--
-- Existing terms are backfilled from the line that bought them, undoing the
-- proration scaling and rounding to whole seats (the same rounding renewals
-- already applied), never below 1.
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
--
-- CodeGen output for this app is folded below the banner at the end of this file.
-- =============================================================================

ALTER TABLE __mj_BizAppsOrders."SubscriptionTerm"
 ADD COLUMN IF NOT EXISTS "Quantity" INTEGER NOT NULL CONSTRAINT "DF_SubscriptionTerm_Quantity" DEFAULT 1;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SubscriptionTerm_SubscriptionID" ON __mj_BizAppsOrders."SubscriptionTerm" ("SubscriptionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SubscriptionTerm_OrderLineID" ON __mj_BizAppsOrders."SubscriptionTerm" ("OrderLineID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SubscriptionTerm_RevenueRecognitionTypeID" ON __mj_BizAppsOrders."SubscriptionTerm" ("RevenueRecognitionTypeID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_BizAppsOrders';
  v_target_name CONSTANT TEXT := 'vwSubscriptionTerms';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwSubscriptionTerms"
AS SELECT
    s.*,
    "mjBizAppsOrdersSubscription_SubscriptionID"."SubscriptionNumber" AS "Subscription",
    "mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID"."Name" AS "RevenueRecognitionType"
FROM
    __mj_BizAppsOrders."SubscriptionTerm" AS s
INNER JOIN
    __mj_BizAppsOrders."Subscription" AS "mjBizAppsOrdersSubscription_SubscriptionID"
  ON
    s."SubscriptionID" = "mjBizAppsOrdersSubscription_SubscriptionID"."ID"
INNER JOIN
    __mj_BizAppsOrders."RevenueRecognitionType" AS "mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID"
  ON
    s."RevenueRecognitionTypeID" = "mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID"."ID"$vsql$;
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
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreateSubscriptionTerm]
--     @ID UUID = NULL,
--     @SubscriptionID UUID,
--     @TermNumber INTEGER,
--     @OrderLineID UUID,
--     @Sta...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdateSubscriptionTerm]
--     @ID UUID,
--     @SubscriptionID UUID = NULL,
--     @TermNumber INTEGER = NULL,
--     @OrderLineID UUID = ...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeleteSubscriptionTerm]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[SubscriptionTerm]
--     WHERE
--       ...


-- ===================== Triggers =====================

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdateSubscriptionTerm
-- ON "__mj_BizAppsOrders"."SubscriptionTerm"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders".[Subscription


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- Backfill written by hand: the converter keeps T-SQL's UPDATE-alias and CROSS APPLY form.
UPDATE __mj_BizAppsOrders."SubscriptionTerm" t
SET "Quantity" = CASE
        WHEN ROUND(CASE WHEN t."IsProrated" AND t."ProrationFactor" > 0 THEN ABS(l."Quantity") / t."ProrationFactor"
                        ELSE ABS(l."Quantity") END, 0) < 1 THEN 1
        ELSE CAST(ROUND(CASE WHEN t."IsProrated" AND t."ProrationFactor" > 0 THEN ABS(l."Quantity") / t."ProrationFactor"
                             ELSE ABS(l."Quantity") END, 0) AS INTEGER)
    END
FROM __mj_BizAppsOrders."OrderLine" l
WHERE l."ID" = t."OrderLineID";

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'af7f6119-3695-4c39-ad1a-9ee6f76c0d8f' OR ("EntityID" = '22E31028-E862-424B-8C10-C167B2C9E304' AND "Name" = 'Quantity')
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
        'af7f6119-3695-4c39-ad1a-9ee6f76c0d8f',
        '22E31028-E862-424B-8C10-C167B2C9E304', -- "Entity": "MJ_BizApps_Orders": "Subscription" "Terms"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '22E31028-E862-424B-8C10-C167B2C9E304'),
        'Quantity',
        'Quantity',
        'How many seats this term covers: the quantity the order line bought, before any proration. A prorated first period scales the order line''s Quantity to price the short period, so the line cannot be read for the seat count; entitlement grants and renewals read this instead. Whole seats only, at least 1.',
        'INTEGER',
        4,
        10,
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

UPDATE __mj."EntityField"
SET 
   "Category" = 'Subscription Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = 'AF7F6119-3695-4C39-AD1A-9EE6F76C0D8F';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.Subscription

UPDATE __mj."EntityField"
SET 
   "Category" = 'Subscription Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = 'CBB17833-A6EA-4EB8-B998-86EE50F3AD2B';


-- ===================== Grants =====================

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwSubscriptionTerms" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwSubscriptionTerms" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwSubscriptionTerms" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwSubscriptionTerms" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: Permissions for vwSubscriptionTerms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwSubscriptionTerms" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwSubscriptionTerms" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwSubscriptionTerms" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwSubscriptionTerms" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: spCreateSubscriptionTerm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SubscriptionTerm
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSubscriptionTerm" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSubscriptionTerm" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSubscriptionTerm" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Subscription Terms */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSubscriptionTerm" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSubscriptionTerm" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSubscriptionTerm" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: spUpdateSubscriptionTerm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SubscriptionTerm
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSubscriptionTerm" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSubscriptionTerm" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSubscriptionTerm" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSubscriptionTerm" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSubscriptionTerm" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSubscriptionTerm" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: spDeleteSubscriptionTerm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SubscriptionTerm
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSubscriptionTerm" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSubscriptionTerm" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSubscriptionTerm" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Subscription Terms */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSubscriptionTerm" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSubscriptionTerm" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSubscriptionTerm" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.Quantity;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."SubscriptionTerm"."Quantity" IS 'How many seats this term covers: the quantity the order line bought, before any proration. A prorated first period scales the order line''s Quantity to price the short period, so the line cannot be read for the seat count; entitlement grants and renewals read this instead. Whole seats only, at least 1.';


-- ===================== Other =====================

-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen 6.1.5 for the combined PR (bizapps-orders#645) against a
--   database built from its migrations: the Quantity field and its category, and the
--   Subscription Terms view, CRUD procs, FK indexes and grants. Left out: validators
--   the run regenerated for other entities; they are not this change's.
--
-- =============================================================================


/* SQL text to insert 1 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Subscription Terms */
