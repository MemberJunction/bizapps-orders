-- =============================================================================================
-- PostgreSQL counterpart of V202610131514__v5.32.x__OrderConcession_CreditMemo.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) output, finished by hand:
--   * Tables, columns, constraints, indexes, views, data and grants are the converter's.
--   * CodeGen's CRUD procedures (spCreate/spUpdate/spDelete) and its __mj_UpdatedAt triggers are
--     NOT here: the converter cannot translate T-SQL procedures or triggers, and this repository
--     has no PostgreSQL baseline to run MJ CodeGen against. A PostgreSQL host runs `mj codegen`
--     after installing, which generates them natively. The converter's notes for them remain,
--     fully commented out.
--   * spRecalcOrderHeaderPaymentSchedule: written by hand in PL/pgSQL from this migration's T-SQL.
--   * spRecalcOrderHeaderTotals: written by hand in PL/pgSQL from this migration's T-SQL.
--   * trg_OrderConcession_RollupTotals: written by hand in PL/pgSQL from this migration's T-SQL.
--   * 1 skipped statements translated by hand (CodeGen's name-field map updates and column description
--     updates, which the converter drops), at the end of the file.
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
-- V202610131514 — An amount change that needs a credit memo (#662)
-- =============================================================================
-- An approved amount change takes its reduction, with its tax, off the order's
-- instalments not yet invoiced. Until now a reduction they could not absorb in
-- full was refused: part of it lands on an invoice already sent, the order is
-- billed as a whole, or the customer asked for a refund. Each needs a credit memo.
--
-- The approved amount change is that credit memo. It records what it credits and
-- its document number, and its approval posts the memo's entry. The NUMERIC(19,4) then
-- lands where the existing rollups already look:
--   - the order's balance falls by the memo, as it falls by a schedule reduction,
--     so an order already paid goes into credit (a negative balance is the
--     customer's credit, D68);
--   - an invoiced instalment the memo credits keeps its amount, since the
--     customer holds that invoice, and its open balance falls by the credit.
--
-- What this file does, in order:
--   1. OrderConcession gains the credit memo (its amount and document number) and
--      whether the customer asked for a refund.
--   2. OrderHeaderPaymentSchedule gains AmountCredited.
--   3. spRecalcOrderHeaderPaymentSchedule nets AmountCredited out of each row's
--      open amount, so cash never settles what a credit memo already credited.
--   4. spRecalcOrderHeaderTotals takes approved credit memos off the order's
--      balance, beside approved schedule reductions.
--   5. trg_OrderConcession_RollupTotals recalculates the order when a concession
--      carrying a credit memo is written.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. OrderConcession: the credit memo and the refund request
-- -----------------------------------------------------------------------------
-- CreditMemoAmount and CreditMemoNumber are written together, once the change is approved, and
-- only on an amount change. RefundRequested is the caller's, recorded with the change.
ALTER TABLE __mj_BizAppsOrders."OrderConcession"
 ADD COLUMN IF NOT EXISTS "CreditMemoAmount" DECIMAL(18,2) NULL,
 ADD COLUMN IF NOT EXISTS "CreditMemoNumber" VARCHAR(50) NULL,
 ADD COLUMN IF NOT EXISTS "RefundRequested" BOOLEAN NOT NULL
        CONSTRAINT "DF_OrderConcession_RefundRequested" DEFAULT (FALSE),
 ADD CONSTRAINT "CK_OrderConcession_CreditMemo" CHECK (
        ("CreditMemoAmount" IS NULL AND "CreditMemoNumber" IS NULL)
        OR (
            "CreditMemoAmount" > 0
            AND "CreditMemoNumber" IS NOT NULL
            AND "NewAmount" IS NOT NULL
            AND "Status" = 'Approved'
        )
    ) NOT VALID,
 ADD CONSTRAINT "CK_OrderConcession_RefundRequested" CHECK (
        "RefundRequested" = 0 OR "NewAmount" IS NOT NULL
    ) NOT VALID;

-- A document number is given to one credit memo only: the customer and their AP system match on it.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_OrderConcession_CreditMemoNumber"
    ON __mj_BizAppsOrders."OrderConcession" ("CreditMemoNumber")
    WHERE "CreditMemoNumber" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. OrderHeaderPaymentSchedule: AmountCredited
-- -----------------------------------------------------------------------------
-- An invoiced instalment's amount is frozen (trg_OrderHeaderPaymentSchedule_Immutable): the
-- customer holds the invoice. A credit memo against it is recorded beside the amount instead.
ALTER TABLE __mj_BizAppsOrders."OrderHeaderPaymentSchedule"
 ADD COLUMN IF NOT EXISTS "AmountCredited" DECIMAL(18,2) NOT NULL
        CONSTRAINT "DF_OrderHeaderPaymentSchedule_AmountCredited" DEFAULT (0),
 ADD CONSTRAINT "CK_OrderHeaderPaymentSchedule_AmountCredited" CHECK (
        "AmountCredited" >= 0 AND "AmountCredited" <= "Amount"
    ) NOT VALID;

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

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeaderPaymentSchedule_OrderHeaderID" ON __mj_BizAppsOrders."OrderHeaderPaymentSchedule" ("OrderHeaderID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeaderPaymentSchedule_CompanyID" ON __mj_BizAppsOrders."OrderHeaderPaymentSchedule" ("CompanyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeaderPaymentSchedule_InvoicedByUserID" ON __mj_BizAppsOrders."OrderHeaderPaymentSchedule" ("InvoicedByUserID");


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
  v_target_name CONSTANT TEXT := 'vwOrderHeaderPaymentSchedules';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwOrderHeaderPaymentSchedules"
AS SELECT
    o.*,
    "mjBizAppsOrdersOrderHeader_OrderHeaderID"."OrderNumber" AS "OrderHeader",
    "MJCompany_CompanyID"."Name" AS "Company",
    "MJUser_InvoicedByUserID"."Name" AS "InvoicedByUser"
FROM
    __mj_BizAppsOrders."OrderHeaderPaymentSchedule" AS o
INNER JOIN
    __mj_BizAppsOrders."OrderHeader" AS "mjBizAppsOrdersOrderHeader_OrderHeaderID"
  ON
    o."OrderHeaderID" = "mjBizAppsOrdersOrderHeader_OrderHeaderID"."ID"
INNER JOIN
    __mj."Company" AS "MJCompany_CompanyID"
  ON
    o."CompanyID" = "MJCompany_CompanyID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_InvoicedByUserID"
  ON
    o."InvoicedByUserID" = "MJUser_InvoicedByUserID"."ID"$vsql$;
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
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreateOrderHeaderPaymentSchedule]
--     @ID UUID = NULL,
--     @OrderHeaderID UUID,
--     @CompanyID UUID,
--     @InstallmentNumber...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdateOrderHeaderPaymentSchedule]
--     @ID UUID,
--     @OrderHeaderID UUID = NULL,
--     @CompanyID UUID = NULL,
--     @Installmen...

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
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeleteOrderHeaderPaymentSchedule]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[OrderHeaderPaymentSchedu...


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
-- CREATE TRIGGER [__mj_BizAppsOrders".trgUpdateOrderHeaderPaymentSchedule
-- ON "__mj_BizAppsOrders"."OrderHeaderPaymentSchedule"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         [__mj_BizAppsO


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

UPDATE s
    SET "AmountPaid" = f."Paid",
        "Balance"    = f."Balance",
        "Status"     = f."NewStatus"
    FROM "__mj_BizAppsOrders"."OrderHeaderPaymentSchedule" s
    JOIN final f ON f."ID" = s."ID"
    -- Only rows whose figures actually move, so an unchanged row is not rewritten (and its
    -- immutability trigger not re-run) every time a sibling changes.
    WHERE s."AmountPaid" <> f."Paid"
       OR COALESCE(s."Balance", -1) <> f."Balance"
       OR s."Status" <> f."NewStatus";
END;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a1561299-24be-4ac5-8e9f-7d96b3d94b56' OR ("EntityID" = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560' AND "Name" = 'AmountCredited')
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
        'a1561299-24be-4ac5-8e9f-7d96b3d94b56',
        'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', -- "Entity": "MJ_BizApps_Orders": Order "Header" "Payment" "Schedules"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560'),
        'AmountCredited',
        'Amount Credited',
        'What credit memos have credited on this instalment''s invoice. Balance is Amount less AmountCredited less AmountPaid.',
        'decimal',
        9,
        18,
        2,
        FALSE,
        '(0)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c12f6199-8011-4816-9e6e-fb851cf83b7a' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'CreditMemoAmount')
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
        'c12f6199-8011-4816-9e6e-fb851cf83b7a',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'CreditMemoAmount',
        'Credit Memo Amount',
        'For an approved amount change, the reduction and its tax credited on a credit memo: the part the instalments not yet invoiced could not absorb. The order''s balance subtracts it. Set by the server when the change is approved.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '54840cfb-d02e-4015-974e-bb757ed561d7' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'CreditMemoNumber')
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
        '54840cfb-d02e-4015-974e-bb757ed561d7',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'CreditMemoNumber',
        'Credit Memo Number',
        'The credit memo''s document number: the order number, then CM and the memo''s sequence on that order. Set with CreditMemoAmount and never reused.',
        'TEXT',
        100,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dbd0b20a-d4f5-4c41-a101-37ab111ed6f4' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'RefundRequested')
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
        'dbd0b20a-d4f5-4c41-a101-37ab111ed6f4',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'RefundRequested',
        'Refund Requested',
        'For an amount change about a paid invoice: the customer asked for the credit back rather than off the next instalment. The approval records the credit; finance refunds it from the order''s payments.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '33fe42bf-97a0-4cae-81d2-e959f8299384' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ReferralProgram')
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
        '33fe42bf-97a0-4cae-81d2-e959f8299384',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'ReferralProgram',
        'Referral Program',
        NULL,
        'TEXT',
        400,
        0,
        0,
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
/* Base View SQL for MJ_BizApps_Orders: Order Header Payment Schedules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
-- Item: vwOrderHeaderPaymentSchedules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Header Payment Schedules
-----               SCHEMA:      __mj_BizAppsOrders
-----               BASE TABLE:  OrderHeaderPaymentSchedule
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderHeaderPaymentSchedules" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderHeaderPaymentSchedules" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderHeaderPaymentSchedules" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwOrderHeaderPaymentSchedules" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Order Header Payment Schedules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
-- Item: Permissions for vwOrderHeaderPaymentSchedules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderHeaderPaymentSchedules" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderHeaderPaymentSchedules" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderHeaderPaymentSchedules" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwOrderHeaderPaymentSchedules" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Orders: Order Header Payment Schedules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
-- Item: spCreateOrderHeaderPaymentSchedule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderHeaderPaymentSchedule
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderHeaderPaymentSchedule" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderHeaderPaymentSchedule" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderHeaderPaymentSchedule" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Order Header Payment Schedules */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderHeaderPaymentSchedule" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderHeaderPaymentSchedule" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateOrderHeaderPaymentSchedule" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Order Header Payment Schedules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
-- Item: spUpdateOrderHeaderPaymentSchedule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderHeaderPaymentSchedule
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderHeaderPaymentSchedule" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderHeaderPaymentSchedule" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderHeaderPaymentSchedule" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderHeaderPaymentSchedule" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderHeaderPaymentSchedule" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateOrderHeaderPaymentSchedule" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ_BizApps_Orders: Order Header Payment Schedules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Header Payment Schedules
-- Item: spDeleteOrderHeaderPaymentSchedule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderHeaderPaymentSchedule
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderHeaderPaymentSchedule" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderHeaderPaymentSchedule" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderHeaderPaymentSchedule" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Order Header Payment Schedules */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderHeaderPaymentSchedule" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderHeaderPaymentSchedule" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteOrderHeaderPaymentSchedule" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert 1 new entity field(s) */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."CreditMemoAmount" IS 'For an approved amount change, the reduction and its tax credited on a credit memo: the part the instalments not yet invoiced could not absorb. The order''s balance subtracts it. Set by the server when the change is approved.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."CreditMemoNumber" IS 'The credit memo''s document number: the order number, then CM and the memo''s sequence on that order. Set with CreditMemoAmount and never reused.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."RefundRequested" IS 'For an amount change about a paid invoice: the customer asked for the credit back rather than off the next instalment. The approval records the credit; finance refunds it from the order''s payments.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeaderPaymentSchedule"."AmountCredited" IS 'What credit memos have credited on this instalment''s invoice. Balance is Amount less AmountCredited less AmountPaid.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeaderPaymentSchedule"."Balance" IS 'Trigger-maintained: Amount - AmountCredited - AmountPaid, computed in the same statement as AmountPaid. Never authored.';


-- ===================== Other =====================

-- -----------------------------------------------------------------------------
-- 3. spRecalcOrderHeaderPaymentSchedule — as V202609260100 left it, with each row's
--    room and balance net of AmountCredited.
-- -----------------------------------------------------------------------------

-- spRecalcOrderHeaderPaymentSchedule: written by hand in plpgsql (the converter passes T-SQL procedures and triggers through untranslated)
CREATE OR REPLACE FUNCTION __mj_BizAppsOrders."spRecalcOrderHeaderPaymentSchedule"(p_order_header_ids uuid[])
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
    WITH ids AS (
        SELECT DISTINCT unnest(p_order_header_ids) AS id
    ),
    named AS (
        SELECT pl."OrderHeaderPaymentScheduleID" AS "ScheduleID", SUM(pl."Amount") AS "Paid"
        FROM __mj_BizAppsOrders."PaymentLine" pl
        JOIN __mj_BizAppsOrders."PaymentHeader" ph ON ph."ID" = pl."PaymentHeaderID"
        JOIN ids ON ids.id = pl."OrderHeaderID"
        WHERE pl."OrderHeaderPaymentScheduleID" IS NOT NULL
          AND ph."Status" IN ('Captured','Refunded','Disputed')
        GROUP BY pl."OrderHeaderPaymentScheduleID"
    ),
    unnamed AS (
        SELECT pl."OrderHeaderID", SUM(pl."Amount") AS "Paid"
        FROM __mj_BizAppsOrders."PaymentLine" pl
        JOIN __mj_BizAppsOrders."PaymentHeader" ph ON ph."ID" = pl."PaymentHeaderID"
        JOIN ids ON ids.id = pl."OrderHeaderID"
        WHERE pl."OrderHeaderPaymentScheduleID" IS NULL
          AND ph."Status" IN ('Captured','Refunded','Disputed')
        GROUP BY pl."OrderHeaderID"
    ),
    room AS (
        SELECT s."ID",
               s."OrderHeaderID",
               s."Amount" - s."AmountCredited" AS "Owed",
               s."Status",
               COALESCE(n."Paid", 0) AS "Named",
               -- What unnamed cash may still settle on this row once its named payments are counted:
               -- what it bills, less what a credit memo credited, less what is already paid against it
               -- by name. BILLED FIRST, then oldest-due-first: a row that has been invoiced (it has a
               -- DocumentNumber) takes cash before a merely Scheduled one. Canceled rows absorb nothing.
               CASE WHEN s."Status" = 'Canceled' THEN 0
                    ELSE CASE WHEN s."Amount" - s."AmountCredited" - COALESCE(n."Paid", 0) > 0
                              THEN s."Amount" - s."AmountCredited" - COALESCE(n."Paid", 0) ELSE 0 END
               END AS "Room",
               SUM(CASE WHEN s."Status" = 'Canceled' THEN 0
                        ELSE CASE WHEN s."Amount" - s."AmountCredited" - COALESCE(n."Paid", 0) > 0
                                  THEN s."Amount" - s."AmountCredited" - COALESCE(n."Paid", 0) ELSE 0 END
                   END) OVER (PARTITION BY s."OrderHeaderID"
                              ORDER BY CASE WHEN s."DocumentNumber" IS NOT NULL THEN 0 ELSE 1 END,
                                       s."DueDate", s."InstallmentNumber", s."CompanyID"
                              ROWS UNBOUNDED PRECEDING) AS "RoomThrough",
               COALESCE(u."Paid", 0) AS "Unnamed"
        FROM __mj_BizAppsOrders."OrderHeaderPaymentSchedule" s
        JOIN ids ON ids.id = s."OrderHeaderID"
        LEFT JOIN named n ON n."ScheduleID" = s."ID"
        LEFT JOIN unnamed u ON u."OrderHeaderID" = s."OrderHeaderID"
    ),
    computed AS (
        SELECT "ID", "Status", "Owed",
               "Named" + CASE WHEN "Unnamed" >= "RoomThrough" THEN "Room"
                              WHEN "Unnamed" > "RoomThrough" - "Room" THEN "Unnamed" - ("RoomThrough" - "Room")
                              ELSE 0 END AS "Paid"
        FROM room
    ),
    final AS (
        SELECT "ID",
               "Paid",
               "Owed" - "Paid" AS "Balance",
               CASE WHEN "Status" IN ('Scheduled','Canceled','WrittenOff') THEN "Status"
                    WHEN "Owed" - "Paid" <= 0 THEN 'Paid'
                    ELSE 'Invoiced'
               END AS "NewStatus"
        FROM computed
    )
    UPDATE __mj_BizAppsOrders."OrderHeaderPaymentSchedule" s
    SET "AmountPaid" = f."Paid",
        "Balance"    = f."Balance",
        "Status"     = f."NewStatus"
    FROM final f
    WHERE f."ID" = s."ID"
      -- Only rows whose figures actually move, so an unchanged row is not rewritten (and its
      -- immutability trigger not re-run) every time a sibling changes.
      AND (s."AmountPaid" <> f."Paid"
        OR COALESCE(s."Balance", -1) <> f."Balance"
        OR s."Status" <> f."NewStatus");
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 4. spRecalcOrderHeaderTotals — as V202610131510 left it, with the balance net of
--    approved credit memos too. TotalGross stays the booked lines.
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
        "Balance"    = COALESCE(l."LineTotal", 0) - COALESCE(r."Reduced", 0) - COALESCE(p."Paid", 0),
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
        SELECT SUM(ol."LineTotalGross") AS "LineTotal"
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
-- 5. trg_OrderConcession_RollupTotals — as V202610131510 created it, firing for a
--    credit memo as well as a schedule reduction.
-- -----------------------------------------------------------------------------
-- trg_OrderConcession_RollupTotals: written by hand in plpgsql (the converter passes T-SQL procedures and triggers through untranslated)
CREATE OR REPLACE FUNCTION __mj_BizAppsOrders."fn_trg_OrderConcession_RollupTotals"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    ids uuid[];
BEGIN
    -- Zero-row statements change nothing: a statement-level trigger fires for them too.
    IF TG_OP IN ('INSERT','UPDATE') THEN
        SELECT array_agg(DISTINCT "OrderHeaderID") INTO ids FROM (
            SELECT "OrderHeaderID" FROM inserted WHERE "ScheduleReduction" IS NOT NULL OR "CreditMemoAmount" IS NOT NULL
        ) x;
    END IF;
    IF TG_OP IN ('UPDATE','DELETE') THEN
        SELECT array_agg(DISTINCT "OrderHeaderID") INTO ids FROM (
            SELECT unnest(ids) AS "OrderHeaderID"
            UNION
            SELECT "OrderHeaderID" FROM deleted WHERE "ScheduleReduction" IS NOT NULL OR "CreditMemoAmount" IS NOT NULL
        ) x WHERE "OrderHeaderID" IS NOT NULL;
    END IF;

    IF ids IS NULL OR cardinality(ids) = 0 THEN
        RETURN NULL;
    END IF;
    PERFORM __mj_BizAppsOrders."spRecalcOrderHeaderTotals"(ids);
    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_OrderConcession_RollupTotals_Insert" ON __mj_BizAppsOrders."OrderConcession";
CREATE TRIGGER "trg_OrderConcession_RollupTotals_Insert"
    AFTER INSERT ON __mj_BizAppsOrders."OrderConcession"
    REFERENCING NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION __mj_BizAppsOrders."fn_trg_OrderConcession_RollupTotals"();

DROP TRIGGER IF EXISTS "trg_OrderConcession_RollupTotals" ON __mj_BizAppsOrders."OrderConcession";
CREATE TRIGGER "trg_OrderConcession_RollupTotals"
    AFTER UPDATE ON __mj_BizAppsOrders."OrderConcession"
    REFERENCING OLD TABLE AS deleted NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION __mj_BizAppsOrders."fn_trg_OrderConcession_RollupTotals"();

DROP TRIGGER IF EXISTS "trg_OrderConcession_RollupTotals_Delete" ON __mj_BizAppsOrders."OrderConcession";
CREATE TRIGGER "trg_OrderConcession_RollupTotals_Delete"
    AFTER DELETE ON __mj_BizAppsOrders."OrderConcession"
    REFERENCING OLD TABLE AS deleted
    FOR EACH STATEMENT
    EXECUTE FUNCTION __mj_BizAppsOrders."fn_trg_OrderConcession_RollupTotals"();


-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above: the four new fields
-- (Order Concessions CreditMemoAmount, CreditMemoNumber and RefundRequested; Order
-- Header Payment Schedules AmountCredited), vwOrderConcessions and
-- vwOrderHeaderPaymentSchedules, their CRUD procs, FK indexes and permissions.
-- The regenerated vwOrderConcessions carries ReferralProgram, the referral
-- program's name, so its field row comes too. Carved from the run: Event Order
-- Lines' ExtendedAmount field and view, Subscription Terms' Quantity field and
-- view, and value-list resequencing, which a database built from migrations lacks
-- whatever this change does.
-- =============================================================================

/* SQL text to insert 4 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Order Concessions */

/* spUpdate Permissions for MJ_BizApps_Orders: Order Header Payment Schedules */

-- ===================== Skipped by the converter, translated by hand =====================
-- CodeGen's related-entity name-field map updates and changed column descriptions.
COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeaderPaymentSchedule"."Balance" IS 'Trigger-maintained: Amount - AmountCredited - AmountPaid, computed in the same statement as AmountPaid. Never authored.';
