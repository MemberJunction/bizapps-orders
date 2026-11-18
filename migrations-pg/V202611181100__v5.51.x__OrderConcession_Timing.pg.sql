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
-- V202611181100 — Payment timing on a new sale needs approval (golive #268, #1097)
-- =============================================================================
-- Finance's rule: a new sale is invoiced at confirm and due on receipt, a renewal is
-- due on the first day of its new term, and agreed instalments follow the order's
-- payment schedule. A new sale that departs from it needed approval, and nothing
-- asked: a service start months out, an instalment due after the service starts,
-- or Net terms on a new sale all confirmed unchecked.
--
-- What this file does, in order:
--   1. OrderConcession gains the Timing delivery form. A Timing concession names the
--      order only and records, in TimingFacts, the order's payment timing as it stood
--      when it was recorded: the new-sale service starts, the payment terms and the
--      instalment due dates. Once approved it covers the order while those facts are
--      unchanged. It has no currency value.
--   2. SalesRule.RuleType gains PaymentTiming. The active PaymentTiming rule's
--      ApprovalRequiredRoleID decides Timing concessions. With no active rule the
--      confirm check for payment timing is off.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. OrderConcession: the Timing form
-- -----------------------------------------------------------------------------
ALTER TABLE __mj_BizAppsOrders."OrderConcession"
 ADD COLUMN IF NOT EXISTS "TimingFacts" VARCHAR(2000) NULL,
 ADD CONSTRAINT "CK_OrderConcession_Timing" CHECK (
        ("DeliveryForm" = 'Timing'
            AND "TimingFacts" IS NOT NULL
            AND "OrderLineID" IS NULL
            AND "SubscriptionTermID" IS NULL
            AND "AddedDays" IS NULL
            AND "AddedQuantity" IS NULL
            AND "ComputedValue" = 0)
        OR ("DeliveryForm" <> 'Timing' AND "TimingFacts" IS NULL)
    ) NOT VALID;

ALTER TABLE __mj_BizAppsOrders."OrderConcession" DROP CONSTRAINT "CK_OrderConcession_DeliveryForm";

-- -----------------------------------------------------------------------------
-- 2. SalesRule.RuleType: PaymentTiming
-- -----------------------------------------------------------------------------
ALTER TABLE __mj_BizAppsOrders."SalesRule" DROP CONSTRAINT "CK_SalesRule_RuleType";

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

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderConcession_AppliesToPaymentScheduleID" ON __mj_BizAppsOrders."OrderConcession" ("AppliesToPaymentScheduleID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderConcession_WithdrawnByUserID" ON __mj_BizAppsOrders."OrderConcession" ("WithdrawnByUserID");


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
    "mjBizAppsOrdersReferralProgram_ReferralProgramID"."Name" AS "ReferralProgram",
    "MJUser_WithdrawnByUserID"."Name" AS "WithdrawnByUser"
FROM
    __mj_BizAppsOrders."OrderConcession" AS o
INNER JOIN
    __mj_BizAppsOrders."OrderHeader" AS "mjBizAppsOrdersOrderHeader_OrderHeaderID"
  ON
    o."OrderHeaderID" = "mjBizAppsOrdersOrderHeader_OrderHeaderID"."ID"
INNER JOIN
    ${mjSchema}."User" AS "MJUser_RequestedByUserID"
  ON
    o."RequestedByUserID" = "MJUser_RequestedByUserID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."SalesRule" AS "mjBizAppsOrdersSalesRule_SalesRuleID"
  ON
    o."SalesRuleID" = "mjBizAppsOrdersSalesRule_SalesRuleID"."ID"
LEFT OUTER JOIN
    ${mjSchema}."User" AS "MJUser_DecidedByUserID"
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
    o."ReferralProgramID" = "mjBizAppsOrdersReferralProgram_ReferralProgramID"."ID"
LEFT OUTER JOIN
    ${mjSchema}."User" AS "MJUser_WithdrawnByUserID"
  ON
    o."WithdrawnByUserID" = "MJUser_WithdrawnByUserID"."ID"$vsql$;
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


-- ===================== Triggers =====================

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdateOrderConcession
ON "__mj_BizAppsOrders"."OrderConcession"
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        "__mj_BizAppsOrders".[OrderConcessio


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = '012a444a-a880-482b-b883-544da8846052' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'TimingFacts')
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
        '012a444a-a880-482b-b883-544da8846052',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'TimingFacts',
        'Timing Facts',
        'For a Timing concession, the order''s payment timing when the concession was recorded: the service start of each line that is not a renewal, the payment terms, and each live instalment''s due date and amount. An approved Timing concession covers the order at confirm only while the order still has exactly these facts. NULL on every other form.',
        'TEXT',
        4000,
        0,
        0,
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

-- Value lists: OrderConcession.DeliveryForm gains Timing, SalesRule.RuleType gains PaymentTiming.
-- Keyed on each field's entity and name, not the authoring database's EntityField IDs.
INSERT INTO ${mjSchema}."EntityFieldValue"
       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
SELECT '06aefed8-be86-42ee-857f-87a5703a58ca', f."ID", 8, 'Timing', 'Timing', NOW(), NOW()
  FROM ${mjSchema}."EntityField" f
  JOIN ${mjSchema}."Entity" e ON e."ID" = f."EntityID"
 WHERE LOWER(e."SchemaName") = LOWER('${flyway:defaultSchema}')
   AND e."BaseTable" = 'OrderConcession'
   AND f."Name" = 'DeliveryForm'
   AND NOT EXISTS (SELECT 1 FROM ${mjSchema}."EntityFieldValue" x
                    WHERE x."EntityFieldID" = f."ID" AND x."Value" = 'Timing');

INSERT INTO ${mjSchema}."EntityFieldValue"
       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
SELECT '6590ba62-4eec-41e8-b434-b73a6ca1eb29', f."ID", 6, 'PaymentTiming', 'PaymentTiming', NOW(), NOW()
  FROM ${mjSchema}."EntityField" f
  JOIN ${mjSchema}."Entity" e ON e."ID" = f."EntityID"
 WHERE LOWER(e."SchemaName") = LOWER('${flyway:defaultSchema}')
   AND e."BaseTable" = 'SalesRule'
   AND f."Name" = 'RuleType'
   AND NOT EXISTS (SELECT 1 FROM ${mjSchema}."EntityFieldValue" x
                    WHERE x."EntityFieldID" = f."ID" AND x."Value" = 'PaymentTiming');

-- PaymentTiming sorts before ProductAuthorization, which moves from 6 to 7.
UPDATE ${mjSchema}."EntityFieldValue" v SET "Sequence" = 7
  FROM ${mjSchema}."EntityField" f
  JOIN ${mjSchema}."Entity" e ON e."ID" = f."EntityID"
 WHERE v."EntityFieldID" = f."ID"
   AND LOWER(e."SchemaName") = LOWER('${flyway:defaultSchema}')
   AND e."BaseTable" = 'SalesRule'
   AND f."Name" = 'RuleType'
   AND v."Value" = 'ProductAuthorization';


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


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj_BizAppsOrders."OrderConcession"
 ADD CONSTRAINT "CK_OrderConcession_DeliveryForm"
    CHECK ("DeliveryForm" IN ('Price','Duration','Scope','Seats','Terms','Shift','Shorten','Timing')) NOT VALID;

ALTER TABLE __mj_BizAppsOrders."SalesRule"
 ADD CONSTRAINT "CK_SalesRule_RuleType"
    CHECK ("RuleType" IN ('DiscountLimit','ConcessionLimit','PaymentTiming','PaymentTermsRequired','ProductAuthorization','CreditLimit','Custom')) NOT VALID;


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
-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."TimingFacts" IS 'For a Timing concession, the order''s payment timing when the concession was recorded: the service start of each line that is not a renewal, the payment terms, and each live instalment''s due date and amount. An approved Timing concession covers the order at confirm only while the order still has exactly these facts. NULL on every other form.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."DeliveryForm" IS 'How the value was given: Price (a lower price than the price engine''s, or a booked term''s amount lowered when NewAmount is set), Duration (a term extended at no charge), Scope (a product added at no charge), Seats (quantity added at no charge), Terms (a confirmed order''s payment terms changed), Shift (a booked term''s start and end moved by the same number of days), Shorten (a booked term started later or ended earlier), Timing (a new sale''s payment timing departs from due on receipt at confirm: a delayed service start, an instalment due after the service starts, or payment terms other than due on receipt).';

COMMENT ON COLUMN __mj_BizAppsOrders."SalesRule"."RuleType" IS 'DiscountLimit | ConcessionLimit | PaymentTiming | PaymentTermsRequired | ProductAuthorization | CreditLimit | Custom. ConcessionLimit names the role that approves a concession outside a rep''s SalesAuthority. PaymentTiming names the role that approves a new sale''s payment timing when it departs from due on receipt at confirm (a Timing concession)WITH no active PaymentTiming rule that confirm check is off.';


-- ===================== Other =====================

-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above, generated against a database
-- built from this repo's migrations: the new Order Concessions field TimingFacts,
-- the Timing and PaymentTiming value-list values, Order Concessions' foreign-key
-- indexes, vwOrderConcessions, the CRUD procs and permissions. CodeGen ran with
-- no AI key, so it wrote no validator for CK_OrderConcession_Timing.
-- =============================================================================


/* SQL text to insert 1 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Order Concessions */
