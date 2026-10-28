-- =============================================================================================
-- PostgreSQL counterpart of V202610230200__v5.39.x__Provider_Billed_Subscriptions.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres --schema __mj_BizAppsOrders` (MJ CLI 6.1.6) output,
-- finished by hand:
--   * Columns, indexes, the CHECK constraint, views, data, grants and column comments are the
--     converter's.
--   * CodeGen's CRUD procedures (spCreate/spUpdate/spDelete) and its __mj_UpdatedAt triggers are
--     NOT here: the converter cannot translate T-SQL procedures or triggers. A PostgreSQL host runs
--     `mj codegen` after installing, which generates them natively. The converter's notes for them
--     remain, fully commented out (it left the trigger notes partly uncommented).
--   * Three statements corrected, each checked on PostgreSQL 16:
--       - the filtered index on PaymentProviderPrice compares BOOLEAN columns with `= TRUE`, not
--         `= 1` (PostgreSQL has no boolean = integer operator);
--       - the Stripe UPDATE sets `= TRUE`, not `= 1`, and names the schema unquoted, like the rest
--         of the file (quoted, it would name a different, case-preserved schema);
--       - the Subscription CHECK calls LTRIM/RTRIM unquoted (quoted, they name functions that do
--         not exist); it still refuses an id of only spaces.
--   * 1 string value restored verbatim from the T-SQL: the validator's Source and Code, which the
--     converter rewrote (`len` -> `LENGTH`, re-indented code). Every other string literal matches.
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
-- V202610230200 — Provider-billed subscriptions: a gateway that bills a
--                 subscription itself, and Orders' renewal jobs leaving it alone
-- =============================================================================
-- Orders renews a subscription itself: Spawn Renewals places the renewal order
-- and Charge Renewals charges the renewal card. A gateway such as Stripe can
-- instead bill the subscription on its own schedule and send its own receipts.
-- When it does, Orders must not also renew it, or the customer pays twice.
--
-- Three facts, each kept in one place:
--
--   PaymentProviderType.SupportsSubscriptionBilling  the gateway CAN bill a
--       subscription itself. A property of the gateway, beside the other
--       Supports* capabilities. Set for Stripe below.
--   PaymentProvider.BillsSubscriptions               this account DOES bill the
--       auto-renewing subscriptions sold through it. Off for every existing
--       account; a host turns it on per account. It governs creating new
--       gateway subscriptions only.
--   Subscription.ProviderSubscriptionID IS NOT NULL  the gateway named by
--       Subscription.PaymentProviderID bills this subscription (the column's
--       documented meaning). The renewal jobs skip on this alone, never on the
--       switch: turning an account's switch off later must not make Orders
--       charge subscriptions the gateway still bills.
--
-- The index makes a gateway subscription belong to at most one Orders
-- subscription per provider account, and gives the webhook and import lookups
-- by (provider, id) an index; the CHECK makes an id always name its provider
-- and refuses an empty one ('' or only spaces): the generated form stores ''
-- when the field is cleared, and an empty id would stop Orders renewing a
-- subscription that no gateway bills.
--
-- PaymentProviderPrice.UseForNewSubscriptions marks the one price a new gateway
-- subscription to a product is created on. A product may keep several active
-- prices (a legacy one beside the current one) so unmatched charges at either
-- still map to it; only one active row per provider and product may be flagged.
--
-- Existing rows: every new column defaults to 0 and the flag starts unset.
-- Orders itself never writes Subscription.ProviderSubscriptionID before this,
-- but the column has been writable through the API since v0.1, so a host that
-- imported gateway ids should check first; the CHECK and the index fail this
-- migration on violating rows, and every subscription with an id stops being
-- renewed by Orders. Pre-flight (expect 0 and 0):
--   SELECT COUNT(*) FROM Subscription WHERE ProviderSubscriptionID IS NOT NULL AND (PaymentProviderID IS NULL OR LENGTH(LTRIM(RTRIM(ProviderSubscriptionID))) = 0);
--   SELECT COUNT(*) FROM (SELECT PaymentProviderID, ProviderSubscriptionID FROM Subscription
--     WHERE ProviderSubscriptionID IS NOT NULL GROUP BY PaymentProviderID, ProviderSubscriptionID HAVING COUNT(*) > 1) d;
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
--
-- CodeGen output for this app is folded below the banner at the end of this file.
-- =============================================================================

ALTER TABLE __mj_BizAppsOrders."PaymentProviderType"
 ADD COLUMN IF NOT EXISTS "SupportsSubscriptionBilling" BOOLEAN NOT NULL CONSTRAINT "DF_PaymentProviderType_SupportsSubscriptionBilling" DEFAULT FALSE;

ALTER TABLE __mj_BizAppsOrders."PaymentProvider"
 ADD COLUMN IF NOT EXISTS "BillsSubscriptions" BOOLEAN NOT NULL CONSTRAINT "DF_PaymentProvider_BillsSubscriptions" DEFAULT FALSE;

CREATE UNIQUE  INDEX IF NOT EXISTS "UQ_Subscription_ProviderSubscriptionID"
    ON __mj_BizAppsOrders."Subscription" ("PaymentProviderID", "ProviderSubscriptionID")
    WHERE "ProviderSubscriptionID" IS NOT NULL;

ALTER TABLE __mj_BizAppsOrders."PaymentProviderPrice"
 ADD COLUMN IF NOT EXISTS "UseForNewSubscriptions" BOOLEAN NOT NULL CONSTRAINT "DF_PaymentProviderPrice_UseForNewSubscriptions" DEFAULT FALSE;

CREATE UNIQUE  INDEX IF NOT EXISTS "UQ_PaymentProviderPrice_NewSubscriptionProduct"
    ON __mj_BizAppsOrders."PaymentProviderPrice" ("PaymentProviderID", "ProductID")
    WHERE "UseForNewSubscriptions" = TRUE AND "IsActive" = TRUE;


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

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_BizAppsOrders';
  v_target_name CONSTANT TEXT := 'vwPaymentProviderTypes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwPaymentProviderTypes"
AS SELECT
    p.*
FROM
    __mj_BizAppsOrders."PaymentProviderType" AS p$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwPaymentProviders';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwPaymentProviders"
AS SELECT
    p.*,
    "mjBizAppsOrdersPaymentProviderType_PaymentProviderTypeID"."Name" AS "PaymentProviderType",
    "MJCompany_CompanyID"."Name" AS "Company",
    "MJCompanyIntegration_CompanyIntegrationID"."Name" AS "CompanyIntegration"
FROM
    __mj_BizAppsOrders."PaymentProvider" AS p
INNER JOIN
    __mj_BizAppsOrders."PaymentProviderType" AS "mjBizAppsOrdersPaymentProviderType_PaymentProviderTypeID"
  ON
    p."PaymentProviderTypeID" = "mjBizAppsOrdersPaymentProviderType_PaymentProviderTypeID"."ID"
INNER JOIN
    ${mjSchema}."Company" AS "MJCompany_CompanyID"
  ON
    p."CompanyID" = "MJCompany_CompanyID"."ID"
LEFT OUTER JOIN
    ${mjSchema}."CompanyIntegration" AS "MJCompanyIntegration_CompanyIntegrationID"
  ON
    p."CompanyIntegrationID" = "MJCompanyIntegration_CompanyIntegrationID"."ID"$vsql$;
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

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreatePaymentProviderType]
--     @ID UUID = NULL,
--     @Code VARCHAR(40),
--     @Name VARCHAR(200),
--     @Description_Clear bit = 0,
--     @Description n...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdatePaymentProviderType]
--     @ID UUID,
--     @Code VARCHAR(40) = NULL,
--     @Name VARCHAR(200) = NULL,
--     @Description_Clear bit = 0,
--     @Descri...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreatePaymentProvider]
--     @ID UUID = NULL,
--     @PaymentProviderTypeID UUID,
--     @CompanyID UUID,
--     @Name VARCHAR(200),
-- ...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdatePaymentProvider]
--     @ID UUID,
--     @PaymentProviderTypeID UUID = NULL,
--     @CompanyID UUID = NULL,
--     @Name TEXT...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeletePaymentProviderType]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[PaymentProviderType]
--     WHERE
-- ...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeletePaymentProvider]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[PaymentProvider]
--     WHERE
--         ...


-- ===================== Triggers =====================

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdatePaymentProviderPrice
-- ON "__mj_BizAppsOrders"."PaymentProviderPrice"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders"."Paym

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders".trgUpdatePaymentProviderType
-- ON "__mj_BizAppsOrders"."PaymentProviderType"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders"."Paymen

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders".trgUpdatePaymentProvider
-- ON "__mj_BizAppsOrders"."PaymentProvider"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders".[PaymentProvide


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- Stripe Billing bills subscriptions. Deliberately only the card type `Stripe`, not `StripeACH` (US bank
-- debits, which settle late): gateway subscriptions are designed and tested for cards only.
-- Every host already has the Stripe type row from an earlier
-- Metadata_Sync (which creates seed rows and never updates them), so only a migration can set it.
UPDATE __mj_BizAppsOrders."PaymentProviderType"
SET "SupportsSubscriptionBilling" = TRUE
WHERE "Code" = 'Stripe';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = '5a40a693-94ed-4b4d-bc89-dec6daa81237' OR ("EntityID" = 'C2778F51-CA0A-45CD-AD39-202307D83D9A' AND "Name" = 'SupportsSubscriptionBilling')
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
        '5a40a693-94ed-4b4d-bc89-dec6daa81237',
        'C2778F51-CA0A-45CD-AD39-202307D83D9A', -- "Entity": "MJ_BizApps_Orders": "Payment" "Provider" "Types"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'C2778F51-CA0A-45CD-AD39-202307D83D9A'),
        'SupportsSubscriptionBilling',
        'Supports Subscription Billing',
        'Whether the gateway can bill a subscription itself: charge the card each period and send its own receipts. Orders creates a gateway subscription only for a provider whose type supports it and whose account has BillsSubscriptions set.',
        'BOOLEAN',
        1,
        1,
        0,
        0,
        '(0)',
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
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = 'e909e2d2-28d6-4fee-a57d-5936abd4aead' OR ("EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND "Name" = 'UseForNewSubscriptions')
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
        'e909e2d2-28d6-4fee-a57d-5936abd4aead',
        'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- "Entity": "MJ_BizApps_Orders": "Payment" "Provider" "Prices"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
        'UseForNewSubscriptions',
        'Use For New Subscriptions',
        'The price a new gateway-billed subscription to this product is created on. At most one active row per provider and product. Other active rows still map charges to the product (unmatched charges) but are never used for new subscriptions.',
        'BOOLEAN',
        1,
        1,
        0,
        0,
        '(0)',
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
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = 'eaca66c1-67e6-41ef-8c8d-bf1372f50b5b' OR ("EntityID" = 'FDC49E63-B229-40BB-9ABC-F384D7750123' AND "Name" = 'BillsSubscriptions')
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
        'eaca66c1-67e6-41ef-8c8d-bf1372f50b5b',
        'FDC49E63-B229-40BB-9ABC-F384D7750123', -- "Entity": "MJ_BizApps_Orders": "Payment" "Providers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'FDC49E63-B229-40BB-9ABC-F384D7750123'),
        'BillsSubscriptions',
        'Bills Subscriptions',
        'Whether this account bills the auto-renewing subscriptions sold through it. When set and the type supports it, Orders creates a gateway subscription after the first payment, and the gateway charges each renewal. Turning it off stops new ones only: a subscription already billed by the gateway keeps being skipped by Orders'' renewal jobs.',
        'BOOLEAN',
        1,
        1,
        0,
        0,
        '(0)',
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

UPDATE ${mjSchema}."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E909E2D2-28D6-4FEE-A57D-5936ABD4AEAD'
               AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Types.SupportsSubscriptionBilling

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'Capabilities',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '5A40A693-94ED-4B4D-BC89-DEC6DAA81237';

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Providers.BillsSubscriptions

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'Provider Configuration',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = 'EACA66C1-67E6-41EF-8C8D-BF1372F50B5B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Providers.CompanyIntegration

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'Security and Integration',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = 'ACD8DA26-2200-49C6-81EB-4138C34FC6B8';

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.ID

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '836ECB5F-95C1-4260-91E8-46CCA6E08C8B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.UseForNewSubscriptions

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'Mapping Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = 'E909E2D2-28D6-4FEE-A57D-5936ABD4AEAD';

/* Generated Validation Functions for MJ_BizApps_Orders: Subscriptions */
-- CHECK constraint for MJ_BizApps_Orders: Subscriptions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'E9B55146-3351-440C-AD47-FD4DE05BDA05' AND "Name" = 'ValidateProviderSubscriptionIDAndPaymentProviderID'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('bfe29515-2383-4d26-bb51-88b7658a097a', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ProviderSubscriptionID] IS NULL OR [PaymentProviderID] IS NOT NULL AND len(ltrim(rtrim([ProviderSubscriptionID])))>(0))', 'public ValidateProviderSubscriptionIDAndPaymentProviderID(result: ValidationResult) {
	if (this.ProviderSubscriptionID != null) {
		if (this.ProviderSubscriptionID.trim().length === 0) {
			result.Errors.push(new ValidationErrorInfo(
				"ProviderSubscriptionID",
				"Provider Subscription ID cannot be blank when provided.",
				this.ProviderSubscriptionID,
				ValidationErrorType.Failure
			));
		}
		if (this.PaymentProviderID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"PaymentProviderID",
				"Payment Provider is required when a Provider Subscription ID is specified.",
				this.PaymentProviderID,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If a provider subscription ID is specified, it cannot be blank and a payment provider must also be assigned to the subscription.', 'ValidateProviderSubscriptionIDAndPaymentProviderID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E9B55146-3351-440C-AD47-FD4DE05BDA05');
    END IF;
END $$;


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj_BizAppsOrders."Subscription"
 ADD CONSTRAINT "CK_Subscription_ProviderSubscriptionHasProvider"
        CHECK ("ProviderSubscriptionID" IS NULL OR ("PaymentProviderID" IS NOT NULL AND LENGTH(LTRIM(RTRIM("ProviderSubscriptionID"))) > 0)) NOT VALID;


-- ===================== Grants =====================

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviderPrices" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviderPrices" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviderPrices" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
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

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviderPrices" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviderPrices" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviderPrices" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
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

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProviderPrice" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProviderPrice" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProviderPrice" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Payment Provider Prices */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProviderPrice" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProviderPrice" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProviderPrice" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProviderPrice" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProviderPrice" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProviderPrice" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProviderPrice" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderPrice" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderPrice" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderPrice" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Payment Provider Prices */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderPrice" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderPrice" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderPrice" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ_BizApps_Orders: Payment Provider Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Types
-- Item: vwPaymentProviderTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Provider Types
-----               SCHEMA:      __mj_BizAppsOrders
-----               BASE TABLE:  PaymentProviderType
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviderTypes" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviderTypes" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviderTypes" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwPaymentProviderTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Provider Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Types
-- Item: Permissions for vwPaymentProviderTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviderTypes" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviderTypes" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviderTypes" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwPaymentProviderTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Orders: Payment Provider Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Types
-- Item: spCreatePaymentProviderType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentProviderType
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProviderType" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProviderType" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProviderType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Payment Provider Types */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProviderType" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProviderType" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProviderType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Payment Provider Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Types
-- Item: spUpdatePaymentProviderType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentProviderType
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProviderType" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProviderType" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProviderType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProviderType" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProviderType" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProviderType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ_BizApps_Orders: Payment Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Providers
-- Item: vwPaymentProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Providers
-----               SCHEMA:      __mj_BizAppsOrders
-----               BASE TABLE:  PaymentProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviders" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviders" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviders" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwPaymentProviders" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Providers
-- Item: Permissions for vwPaymentProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviders" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviders" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwPaymentProviders" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwPaymentProviders" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Orders: Payment Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Providers
-- Item: spCreatePaymentProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentProvider
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProvider" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProvider" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Payment Providers */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProvider" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProvider" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreatePaymentProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Payment Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Providers
-- Item: spUpdatePaymentProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentProvider
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProvider" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProvider" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProvider" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProvider" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdatePaymentProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Orders: Payment Provider Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Types
-- Item: spDeletePaymentProviderType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentProviderType
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderType" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderType" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Payment Provider Types */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderType" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderType" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProviderType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Orders: Payment Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Providers
-- Item: spDeletePaymentProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentProvider
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProvider" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProvider" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Payment Providers */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProvider" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProvider" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeletePaymentProvider" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."PaymentProviderType"."SupportsSubscriptionBilling" IS 'Whether the gateway can bill a subscription itself: charge the card each period and send its own receipts. Orders creates a gateway subscription only for a provider whose type supports it and whose account has BillsSubscriptions set.';

COMMENT ON COLUMN __mj_BizAppsOrders."PaymentProvider"."BillsSubscriptions" IS 'Whether this account bills the auto-renewing subscriptions sold through it. When set and the type supports it, Orders creates a gateway subscription after the first payment, and the gateway charges each renewal. Turning it off stops new ones only: a subscription already billed by the gateway keeps being skipped by Orders'' renewal jobs.';

COMMENT ON COLUMN __mj_BizAppsOrders."PaymentProviderPrice"."UseForNewSubscriptions" IS 'The price a new gateway-billed subscription to this product is created on. At most one active row per provider and product. Other active rows still map charges to the product (unmatched charges) but are never used for new subscriptions.';

COMMENT ON COLUMN __mj_BizAppsOrders."Subscription"."ProviderSubscriptionID" IS 'The gateway''s id for a subscription it bills (for Stripe, sub_...). When set, the gateway named by PaymentProviderID charges every renewal and Orders'' renewal jobs skip the subscription; NULL means Orders renews it.';

COMMENT ON COLUMN __mj_BizAppsOrders."Subscription"."PaymentProviderID" IS 'The payment provider that bills this subscription. Required when ProviderSubscriptionID is set.';


-- ===================== Other =====================

-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
-- =============================================================================


/* SQL text to insert 3 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Provider Prices */

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Provider Types */

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Providers */
