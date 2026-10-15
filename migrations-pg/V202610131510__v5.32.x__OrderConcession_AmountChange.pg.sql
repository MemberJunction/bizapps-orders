-- =============================================================================================
-- PostgreSQL counterpart of V202610131510__v5.32.x__OrderConcession_AmountChange.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) output, finished by hand:
--   * Tables, columns, constraints, indexes, views, data and grants are the converter's.
--   * CodeGen's CRUD procedures (spCreate/spUpdate/spDelete) and its __mj_UpdatedAt triggers are
--     NOT here: the converter cannot translate T-SQL procedures or triggers, and this repository
--     has no PostgreSQL baseline to run MJ CodeGen against. A PostgreSQL host runs `mj codegen`
--     after installing, which generates them natively. The converter's notes for them remain,
--     fully commented out.
--   * spRecalcOrderHeaderTotals: written by hand in PL/pgSQL from this migration's T-SQL.
--   * trg_OrderConcession_RollupTotals: written by hand in PL/pgSQL from this migration's T-SQL.
--   * 2 skipped statements translated by hand (CodeGen's name-field map updates and column description
--     updates, which the converter drops), at the end of the file.
--   * 11 string values restored verbatim from the T-SQL: the converter re-indents text inside string
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
-- V202610131510 — A booked term's amount lowered through an approved concession (#506)
-- =============================================================================
-- Orders.AmendArrangement could preview a lower amount on a booked term but could not
-- record one. The change is a Price concession on the term: valued as the reduction,
-- routed through the ConcessionLimit rule, and applied when approved.
--
-- This first part covers a reduction the order's instalments not yet invoiced can absorb
-- in full: nothing already invoiced is credited, so no credit memo is issued. The
-- instalments are lowered, which takes the reduction off what the order still bills.
--
-- What this file does, in order:
--   1. OrderConcession gains the amount change's fields: the term's new amount, the
--      invoiced instalment the reduction is about, and the gross the approved change
--      took off the uninvoiced instalments.
--   2. ReasonCategory gains Dispute, so a reduction agreed on a disputed charge is
--      reported apart from retention concessions and referral credits.
--   3. SubscriptionEvent gains AmountChanged, the event an applied change logs.
--   4. spRecalcOrderHeaderTotals takes approved schedule reductions off the order's
--      balance: the order still has its booked lines, but owes less.
--   5. trg_OrderConcession_RollupTotals recalculates the order when a concession's
--      status or schedule reduction changes.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. OrderConcession: the amount change
-- -----------------------------------------------------------------------------
-- An amount change is a Price concession naming its term and line and the term's new, lower
-- amount. ScheduleReduction is written once the change is approved, and only then.
ALTER TABLE __mj_BizAppsOrders."OrderConcession"
 ADD COLUMN IF NOT EXISTS "NewAmount" DECIMAL(18,2) NULL,
 ADD COLUMN IF NOT EXISTS "AppliesToPaymentScheduleID" UUID NULL
        CONSTRAINT "FK_OrderConcession_AppliesToPaymentSchedule" REFERENCES __mj_BizAppsOrders."OrderHeaderPaymentSchedule"("ID"),
 ADD COLUMN IF NOT EXISTS "ScheduleReduction" DECIMAL(18,2) NULL,
 ADD CONSTRAINT "CK_OrderConcession_AmountChange" CHECK (
        "NewAmount" IS NULL OR (
            "DeliveryForm" = 'Price'
            AND "SubscriptionTermID" IS NOT NULL
            AND "OrderLineID" IS NOT NULL
            AND "NewAmount" > 0
        )
    ) NOT VALID,
 ADD CONSTRAINT "CK_OrderConcession_AmountChangeOnly" CHECK (
        "NewAmount" IS NOT NULL OR ("AppliesToPaymentScheduleID" IS NULL AND "ScheduleReduction" IS NULL)
    ) NOT VALID,
 ADD CONSTRAINT "CK_OrderConcession_ScheduleReduction" CHECK (
        "ScheduleReduction" IS NULL OR ("ScheduleReduction" > 0 AND "Status" = 'Approved')
    ) NOT VALID;

-- -----------------------------------------------------------------------------
-- 2. ReasonCategory: Dispute
-- -----------------------------------------------------------------------------
ALTER TABLE __mj_BizAppsOrders."OrderConcession" DROP CONSTRAINT "CK_OrderConcession_ReasonCategory";

-- -----------------------------------------------------------------------------
-- 3. SubscriptionEvent: AmountChanged
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

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderConcession_AppliesToPaymentScheduleID" ON __mj_BizAppsOrders."OrderConcession" ("AppliesToPaymentScheduleID");


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
-- -- -----------------------------------------------------------------------------
-- 5. trg_OrderConcession_RollupTotals
-- -----------------------------------------------------------------------------

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdateOrderConcession
-- ON "__mj_BizAppsOrders"."OrderConcession"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders".[OrderConcessio


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9cf7d91a-59ca-44e0-912c-98081b2b2089' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'NewAmount')
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
        '9cf7d91a-59ca-44e0-912c-98081b2b2089',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'NewAmount',
        'New Amount',
        'For an amount change, the term''s new amount: net of discount, before tax, and lower than its amount when recorded. NULL for every other concession.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6b3f6ea7-3fbf-4150-888c-ed33252c9927' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'AppliesToPaymentScheduleID')
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
        '6b3f6ea7-3fbf-4150-888c-ed33252c9927',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'AppliesToPaymentScheduleID',
        'Applies To Payment Schedule ID',
        'For an amount change about one invoice, the invoiced instalment it is about. NULL spreads the reduction over the instalments not yet invoiced.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '70b2f621-69a2-49f5-9fcc-3f3e04d189b7' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ScheduleReduction')
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
        '70b2f621-69a2-49f5-9fcc-3f3e04d189b7',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'ScheduleReduction',
        'Schedule Reduction',
        'For an approved amount change, the reduction and its tax taken off the order''s instalments not yet invoiced. The order''s balance and its schedule check subtract it from the booked lines. Set by the server when the change is applied.',
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

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('15a49ff3-554f-4a1a-9baf-18e8fe7453b4', '44330A58-EAC2-4B6B-A834-F5C3E33BC8F2', 1, 'Dispute', 'Dispute', NOW(), NOW());

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=2 WHERE "ID"='078F1818-DDAC-4B38-990E-C07589AC37FE';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=3 WHERE "ID"='2AAA6755-5100-4990-8292-75CE81E0F2F0';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=4 WHERE "ID"='6CBB848E-A1B2-4D67-8947-32EB7ADC9205';

/* SQL text to insert entity field value with ID ad091492-029b-4138-90bd-4bd8b67cc6c0 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ad091492-029b-4138-90bd-4bd8b67cc6c0', 'E2EDA043-B7D5-45C9-8606-AF585833EB10', 2, 'AmountChanged', 'AmountChanged', NOW(), NOW());

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=3 WHERE "ID"='AAFE86AB-C59F-4DBF-80C3-EBAA173FD6B7';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=4 WHERE "ID"='CFE9AC5A-D2AE-4D6E-B696-9C2C9D8B6CD4';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=5 WHERE "ID"='5644D706-A91A-4345-91D0-3AAAC31F9195';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=6 WHERE "ID"='D2964612-B74A-4DC8-B494-8E615404A3FA';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=7 WHERE "ID"='547A82EC-F15E-41E0-8FF7-DF40850CF51F';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=8 WHERE "ID"='CEF6095C-9F0E-4522-8F59-33D013F38114';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=9 WHERE "ID"='0C002CE3-4C41-4D06-A934-CA7E745C3F5B';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=10 WHERE "ID"='93F6F9C3-CCA0-4073-8E50-0377DEC3A69A';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=11 WHERE "ID"='56C03837-0A43-45A7-9061-F405D7D06374';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=12 WHERE "ID"='673968EA-DBE8-47D4-BFC1-92C3BF7F5238';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=13 WHERE "ID"='F51C8686-A10E-4655-A06C-466B469B89E6';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=14 WHERE "ID"='706BBA1B-51E8-4664-A471-7A99E3FC9808';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=15 WHERE "ID"='D9945CF3-A591-4C90-9384-287538F38E14';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=16 WHERE "ID"='8079E095-2576-49E6-8718-49D0AEC04981';


/* Create Entity Relationship: MJ_BizApps_Orders: Order Header Payment Schedules -> MJ_BizApps_Orders: Order Concessions (One To Many via AppliesToPaymentScheduleID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f8eb3ef8-738d-4ece-ac3a-699a6ac1e54d'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f8eb3ef8-738d-4ece-ac3a-699a6ac1e54d', 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'AppliesToPaymentScheduleID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Details',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '9CF7D91A-59CA-44E0-912C-98081B2B2089';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.AppliesToPaymentScheduleID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Applies To Payment Schedule'
WHERE 
   "ID" = '6B3F6EA7-3FBF-4150-888C-ED33252C9927';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.ScheduleReduction

UPDATE __mj."EntityField"
SET 
   "Category" = 'Value and Limits',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '70B2F621-69A2-49F5-9FCC-3F3E04D189B7';

/* Generated Validation Functions for MJ_BizApps_Orders: Order Concessions */
-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('50f4dde8-f816-4e5a-a7e1-b3d88431e203', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '(NOT ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [PriorStartDate] IS NULL AND [PriorEndDate] IS NULL AND [NewStartDate] IS NULL AND [NewEndDate] IS NULL OR ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [SubscriptionTermID] IS NOT NULL AND [PriorStartDate] IS NOT NULL AND [PriorEndDate] IS NOT NULL AND [NewStartDate] IS NOT NULL AND [NewEndDate] IS NOT NULL AND [NewEndDate]>=[NewStartDate] AND [AddedQuantity] IS NULL AND [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL AND ([DeliveryForm]=''Shift'' AND datediff(day,[PriorStartDate],[NewStartDate])=datediff(day,[PriorEndDate],[NewEndDate]) AND [NewStartDate]<>[PriorStartDate] OR [DeliveryForm]=''Shorten'' AND [NewStartDate]>=[PriorStartDate] AND [NewEndDate]<=[PriorEndDate] AND ([NewStartDate]<>[PriorStartDate] OR [NewEndDate]<>[PriorEndDate])))', 'public ValidateDeliveryFormDateAndTermConstraints(result: ValidationResult) {
	const isShiftOrShorten = this.DeliveryForm === "Shorten" || this.DeliveryForm === "Shift";

	if (!isShiftOrShorten) {
		if (this.PriorStartDate != null || this.PriorEndDate != null || this.NewStartDate != null || this.NewEndDate != null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Prior and New Start/End dates must be empty when Delivery Form is not ''Shorten'' or ''Shift''.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	} else {
		if (this.SubscriptionTermID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"SubscriptionTermID",
				"Subscription Term is required when Delivery Form is ''Shorten'' or ''Shift''.",
				this.SubscriptionTermID,
				ValidationErrorType.Failure
			));
		}

		if (this.PriorStartDate == null || this.PriorEndDate == null || this.NewStartDate == null || this.NewEndDate == null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Prior and New Start/End dates are required when Delivery Form is ''Shorten'' or ''Shift''.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		} else {
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

			if (this.DeliveryForm === "Shift") {
				const startShiftDays = Math.round((newStart - priorStart) / (1000 * 60 * 60 * 24));
				const endShiftDays = Math.round((newEnd - priorEnd) / (1000 * 60 * 60 * 24));

				if (startShiftDays !== endShiftDays || newStart === priorStart) {
					result.Errors.push(new ValidationErrorInfo(
						"DeliveryForm",
						"When shifting delivery dates, the start and end dates must shift by the exact same number of days and cannot equal the prior start date.",
						this.DeliveryForm,
						ValidationErrorType.Failure
					));
				}
			} else if (this.DeliveryForm === "Shorten") {
				const isWithinPriorRange = newStart >= priorStart && newEnd <= priorEnd;
				const isShortened = newStart !== priorStart || newEnd !== priorEnd;

				if (!isWithinPriorRange || !isShortened) {
					result.Errors.push(new ValidationErrorInfo(
						"DeliveryForm",
						"When shortening delivery dates, the new dates must fall within the prior date range and must shorten either the start or end date.",
						this.DeliveryForm,
						ValidationErrorType.Failure
					));
				}
			}
		}

		if (this.AddedQuantity != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AddedQuantity",
				"Added Quantity must be empty when Delivery Form is ''Shorten'' or ''Shift''.",
				this.AddedQuantity,
				ValidationErrorType.Failure
			));
		}

		if (this.PriorPaymentTermsTypeID != null || this.NewPaymentTermsTypeID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Prior and New Payment Terms Types must be empty when Delivery Form is ''Shorten'' or ''Shift''.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Ensures that when a delivery form is set to ''Shorten'' or ''Shift'', required subscription terms and adjusted date ranges are specified properly—with shifts shifting both dates equally and shortenings reducing the schedule within existing boundaries—while prohibiting dates and payment term overrides for other delivery forms.', 'ValidateDeliveryFormDateAndTermConstraints', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('f3feb274-de9e-40c8-89f9-a7cc94885ff7', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Duration'' OR [SubscriptionTermID] IS NOT NULL AND [AddedDays]>(0))', 'public ValidateDeliveryFormDurationRequirements(result: ValidationResult): void {
	if (this.DeliveryForm === ''Duration'') {
		if (this.SubscriptionTermID == null || this.AddedDays == null || this.AddedDays <= 0) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"When the delivery form is set to ''Duration'', a valid subscription term must be selected and added days must be greater than 0.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When the delivery form is set to ''Duration'', a subscription term must be associated and the number of added days must be greater than zero.', 'ValidateDeliveryFormDurationRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('96316748-a9a3-46ee-a169-f2240c30d1c3', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Terms'' OR [NewPaymentTermsTypeID] IS NOT NULL AND ([PriorPaymentTermsTypeID] IS NULL OR [PriorPaymentTermsTypeID]<>[NewPaymentTermsTypeID]) AND [AddedDays] IS NOT NULL AND [OrderLineID] IS NULL AND [SubscriptionTermID] IS NULL AND [AddedQuantity] IS NULL)', 'public ValidateDeliveryFormTermsRequirements(result: ValidationResult): void {
	if (this.DeliveryForm === "Terms") {
		if (this.NewPaymentTermsTypeID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"NewPaymentTermsTypeID",
				"New payment terms type is required when delivery form is Terms.",
				this.NewPaymentTermsTypeID,
				ValidationErrorType.Failure
			));
		}
		if (this.PriorPaymentTermsTypeID != null && this.NewPaymentTermsTypeID != null && this.PriorPaymentTermsTypeID === this.NewPaymentTermsTypeID) {
			result.Errors.push(new ValidationErrorInfo(
				"NewPaymentTermsTypeID",
				"New payment terms type must be different from prior payment terms type.",
				this.NewPaymentTermsTypeID,
				ValidationErrorType.Failure
			));
		}
		if (this.AddedDays == null) {
			result.Errors.push(new ValidationErrorInfo(
				"AddedDays",
				"Added days is required when delivery form is Terms.",
				this.AddedDays,
				ValidationErrorType.Failure
			));
		}
		if (this.OrderLineID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"OrderLineID",
				"Order line ID must be empty when delivery form is Terms.",
				this.OrderLineID,
				ValidationErrorType.Failure
			));
		}
		if (this.SubscriptionTermID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"SubscriptionTermID",
				"Subscription term ID must be empty when delivery form is Terms.",
				this.SubscriptionTermID,
				ValidationErrorType.Failure
			));
		}
		if (this.AddedQuantity != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AddedQuantity",
				"Added quantity must be empty when delivery form is Terms.",
				this.AddedQuantity,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When the delivery form is set to ''Terms'', a new payment terms type and added days must be specified, the new payment terms must differ from prior payment terms, and order line, subscription term, and added quantity must be empty.', 'ValidateDeliveryFormTermsRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('d48d314b-0d54-4973-9e48-5628b776d6e4', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([NewAmount] IS NULL OR [DeliveryForm]=''Price'' AND [SubscriptionTermID] IS NOT NULL AND [OrderLineID] IS NOT NULL AND [NewAmount]>(0))', 'public ValidateNewAmountPriceRequirements(result: ValidationResult) {
	if (this.NewAmount != null) {
		if (this.NewAmount <= 0) {
			result.Errors.push(new ValidationErrorInfo(
				"NewAmount",
				"New amount must be greater than zero when provided.",
				this.NewAmount,
				ValidationErrorType.Failure
			));
		}
		if (this.DeliveryForm !== "Price") {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Delivery form must be ''Price'' when a new amount is provided.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
		if (this.SubscriptionTermID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"SubscriptionTermID",
				"Subscription term is required when a new amount is provided.",
				this.SubscriptionTermID,
				ValidationErrorType.Failure
			));
		}
		if (this.OrderLineID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"OrderLineID",
				"Order line is required when a new amount is provided.",
				this.OrderLineID,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If a new amount is specified, it must be greater than zero, the delivery form must be ''Price'', and both a subscription term and an order line must be associated.', 'ValidateNewAmountPriceRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('6159e726-90c4-4489-86e7-205f580f9300', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([NewAmount] IS NOT NULL OR [AppliesToPaymentScheduleID] IS NULL AND [ScheduleReduction] IS NULL)', 'public ValidateNewAmountRequirementForScheduleAdjustments(result: ValidationResult) {
	if (this.NewAmount == null && (this.AppliesToPaymentScheduleID != null || this.ScheduleReduction != null)) {
		result.Errors.push(new ValidationErrorInfo(
			"NewAmount",
			"A New Amount is required when specifying Applies To Payment Schedule or Schedule Reduction.",
			this.NewAmount,
			ValidationErrorType.Failure
		));
	}
}', 'When specifying payment schedule adjustments (Applies To Payment Schedule or Schedule Reduction), a New Amount must be provided.', 'ValidateNewAmountRequirementForScheduleAdjustments', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('6794f43e-cb3c-4a41-815c-a0cdcf8e0415', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '(NOT ([DeliveryForm]=''Scope'' OR [DeliveryForm]=''Price'') OR [OrderLineID] IS NOT NULL)', 'public ValidateOrderLineIDForDeliveryForm(result: ValidationResult) {
	if ((this.DeliveryForm === ''Scope'' || this.DeliveryForm === ''Price'') && this.OrderLineID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"OrderLineID",
			"An Order Line is required when Delivery Form is set to ''Scope'' or ''Price''.",
			this.OrderLineID,
			ValidationErrorType.Failure
		));
	}
}', 'If the delivery form is ''Scope'' or ''Price'', an order line must be specified to maintain proper order tracking.', 'ValidateOrderLineIDForDeliveryForm', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('f29e9626-cc70-4ce9-9383-969c8ee6e594', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DeliveryForm]=''Terms'' OR [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL)', 'public ValidatePaymentTermsTypeFieldsForDeliveryForm(result: ValidationResult) {
	if (this.DeliveryForm !== ''Terms'' && (this.PriorPaymentTermsTypeID != null || this.NewPaymentTermsTypeID != null)) {
		result.Errors.push(new ValidationErrorInfo(
			"DeliveryForm",
			"Prior and New Payment Terms Types can only be specified when DeliveryForm is set to ''Terms''.",
			this.DeliveryForm,
			ValidationErrorType.Failure
		));
	}
}', 'Payment terms types can only be specified when the delivery form is ''Terms''. For all other delivery forms, prior and new payment terms must be left blank.', 'ValidatePaymentTermsTypeFieldsForDeliveryForm', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('0ee93519-7c19-4631-85f6-8376e0557d3a', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ScheduleReduction] IS NULL OR [ScheduleReduction]>(0) AND [Status]=''Approved'')', '	public ValidateScheduleReductionRequirement(result: ValidationResult) {
		if (this.ScheduleReduction != null && (this.ScheduleReduction <= 0 || this.Status !== ''Approved'')) {
			result.Errors.push(new ValidationErrorInfo(
				"ScheduleReduction",
				"A schedule reduction must be greater than zero and requires the status to be Approved.",
				this.ScheduleReduction,
				ValidationErrorType.Failure
			));
		}
	}', 'If a schedule reduction is specified, it must be greater than zero and can only be applied when the status is Approved.', 'ValidateScheduleReductionRequirement', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('f1ad9409-1fd2-4fe5-b9fe-c822ffd37360', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Seats'' OR [OrderLineID] IS NOT NULL AND [AddedQuantity]>(0))', 'public ValidateSeatsDeliveryFormRequirements(result: ValidationResult) {
	if (this.DeliveryForm === ''Seats'') {
		if (this.OrderLineID == null || this.AddedQuantity == null || this.AddedQuantity <= 0) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"When delivery form is ''Seats'', an order line must be specified and added quantity must be greater than zero.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When the delivery form is set to ''Seats'', an associated order line must be specified and the added quantity must be greater than zero.', 'ValidateSeatsDeliveryFormRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj_BizAppsOrders."OrderConcession"
 ADD CONSTRAINT "CK_OrderConcession_ReasonCategory"
    CHECK ("ReasonCategory" IN ('Retention','Referral','Dispute','Other')) NOT VALID;

ALTER TABLE __mj_BizAppsOrders."SubscriptionEvent"
 ADD CONSTRAINT "CK_SubscriptionEvent_EventType"
    CHECK ("EventType" IN ('Created','Activated','TrialStarted','TrialEnded','PaymentSucceeded','PaymentFailed','Paused','Resumed','CancellationRequested','Canceled','Migrated','Extended','RenewalOrderSpawned','Rescheduled','Shortened','AmountChanged')) NOT VALID;


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
/* Set categories for 3 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.NewAmount;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."NewAmount" IS 'For an amount change, the term''s new amount: net of discount, before tax, and lower than its amount when recorded. NULL for every other concession.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."AppliesToPaymentScheduleID" IS 'For an amount change about one invoice, the invoiced instalment it is about. NULL spreads the reduction over the instalments not yet invoiced.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."ScheduleReduction" IS 'For an approved amount change, the reduction and its tax taken off the order''s instalments not yet invoiced. The order''s balance and its schedule check subtract it from the booked lines. Set by the server when the change is applied.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."DeliveryForm" IS 'How the value was given: Price (a lower price than the price engine''s, or a booked term''s amount lowered when NewAmount is set), Duration (a term extended at no charge), Scope (a product added at no charge), Seats (quantity added at no charge), Terms (a confirmed order''s payment terms changed), Shift (a booked term''s start and end moved by the same number of days), Shorten (a booked term started later or ended earlier).';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."ReasonCategory" IS 'Why it was granted: Retention, Referral, Dispute (a reduction agreed on a disputed charge) or Other. Each has different economics and is reported separately.';


-- ===================== Other =====================

-- -----------------------------------------------------------------------------
-- 4. spRecalcOrderHeaderTotals — as V202609211200 left it, with the balance net of
--    approved schedule reductions. TotalGross stays the booked lines.
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
        SELECT SUM(c."ScheduleReduction") AS "Reduced"
        FROM __mj_BizAppsOrders."OrderConcession" c
        WHERE c."OrderHeaderID" = ids.id
          AND c."Status" = 'Approved'
          AND c."ScheduleReduction" IS NOT NULL
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

-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above, regenerated for the combined PR
-- (bizapps-orders#645) against a database built from its migrations: the three new
-- Order Concessions fields, the Dispute and AmountChanged value-list values, the
-- Order Header Payment Schedules relationship, FK indexes, vwOrderConcessions, CRUD
-- procs (with the referral, signed-amendment and term-date columns earlier migrations
-- added), permissions and Order Concessions' validators. Left out: validators the run
-- regenerated for other entities; they are not this change's.
-- =============================================================================


/* SQL text to insert 3 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Order Concessions */

-- trg_OrderConcession_RollupTotals: written by hand in plpgsql (the converter dropped this CREATE TRIGGER)
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
            SELECT "OrderHeaderID" FROM inserted WHERE "ScheduleReduction" IS NOT NULL
        ) x;
    END IF;
    IF TG_OP IN ('UPDATE','DELETE') THEN
        SELECT array_agg(DISTINCT "OrderHeaderID") INTO ids FROM (
            SELECT unnest(ids) AS "OrderHeaderID"
            UNION
            SELECT "OrderHeaderID" FROM deleted WHERE "ScheduleReduction" IS NOT NULL
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

-- ===================== Skipped by the converter, translated by hand =====================
-- CodeGen's related-entity name-field map updates and changed column descriptions.
COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."DeliveryForm" IS 'How the value was given: Price (a lower price than the price engine''s, or a booked term''s amount lowered when NewAmount is set), Duration (a term extended at no charge), Scope (a product added at no charge), Seats (quantity added at no charge), Terms (a confirmed order''s payment terms changed), Shift (a booked term''s start and end moved by the same number of days), Shorten (a booked term started later or ended earlier).';
COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."ReasonCategory" IS 'Why it was granted: Retention, Referral, Dispute (a reduction agreed on a disputed charge) or Other. Each has different economics and is reported separately.';
