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
-- V202611111208 — A concession is withdrawn, not deleted (golive #403)
-- =============================================================================
-- Withdrawing a concession used to delete it, so the order lost the record of what was
-- offered and when it was taken back. A role allowed to record concessions but not to
-- delete them (Create and Read only) could not withdraw one at all, and a raised line
-- discount left the earlier concession counted alongside the new one.
--
-- A withdrawn concession now stays on the order with Status Withdrawn, stamped with who
-- withdrew it and when. It counts toward nothing: not the order's concession share, not
-- the confirm check, not the order's totals (those read Approved concessions only).
--
-- What this file does, in order:
--   1. OrderConcession gains WithdrawnByUserID and WithdrawnAt, set exactly when the
--      concession is Withdrawn.
--   2. Status gains Withdrawn.
--   3. The decision constraint accepts a Withdrawn concession without a decision: one
--      withdrawn while Pending was never decided. One withdrawn after approval keeps the
--      approver and the date it was approved.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. OrderConcession: who withdrew it, and when
-- -----------------------------------------------------------------------------
ALTER TABLE __mj_BizAppsOrders."OrderConcession"
 ADD COLUMN IF NOT EXISTS "WithdrawnByUserID" UUID NULL
        CONSTRAINT "FK_OrderConcession_WithdrawnByUser" REFERENCES __mj."User"("ID"),
 ADD COLUMN IF NOT EXISTS "WithdrawnAt" TIMESTAMPTZ NULL,
 ADD CONSTRAINT "CK_OrderConcession_Withdrawal" CHECK (
        ("Status" = 'Withdrawn' AND "WithdrawnByUserID" IS NOT NULL AND "WithdrawnAt" IS NOT NULL)
        OR ("Status" <> 'Withdrawn' AND "WithdrawnByUserID" IS NULL AND "WithdrawnAt" IS NULL)
    ) NOT VALID;

-- -----------------------------------------------------------------------------
-- 2. Status: Withdrawn
-- -----------------------------------------------------------------------------
ALTER TABLE __mj_BizAppsOrders."OrderConcession" DROP CONSTRAINT "CK_OrderConcession_Status";

-- -----------------------------------------------------------------------------
-- 3. Decision: a Withdrawn concession may have none
-- -----------------------------------------------------------------------------
ALTER TABLE __mj_BizAppsOrders."OrderConcession" DROP CONSTRAINT "CK_OrderConcession_Decision";

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
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = '21e70036-bcb9-4b25-972f-f7948f9bb6b7' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'WithdrawnByUserID')
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
        '21e70036-bcb9-4b25-972f-f7948f9bb6b7',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'WithdrawnByUserID',
        'Withdrawn By User ID',
        'The user who withdrew the concession. Set only when Status is Withdrawn.',
        'UUID',
        16,
        0,
        0,
        1,
        NULL,
        0,
        1,
        0,
        0,
        'E1238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        0,
        0,
        1,
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
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = '509b8c54-8452-42f6-9fd8-cbc9c0a088ca' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'WithdrawnAt')
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
        '509b8c54-8452-42f6-9fd8-cbc9c0a088ca',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'WithdrawnAt',
        'Withdrawn At',
        'When the concession was withdrawn. Set only when Status is Withdrawn.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
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

-- Status value list: Withdrawn. Keyed on the field's entity and name, not the authoring database's EntityField ID.
INSERT INTO ${mjSchema}."EntityFieldValue"
       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
SELECT 'cb4ec4f9-6295-4403-be07-7c5a38504b1e', f."ID",
       (SELECT COALESCE(MAX(x."Sequence"), 0) + 1 FROM ${mjSchema}."EntityFieldValue" x WHERE x."EntityFieldID" = f."ID"),
       'Withdrawn', 'Withdrawn', NOW(), NOW()
  FROM ${mjSchema}."EntityField" f
  JOIN ${mjSchema}."Entity" e ON e."ID" = f."EntityID"
 WHERE LOWER(e."SchemaName") = LOWER('${flyway:defaultSchema}')
   AND e."BaseTable" = 'OrderConcession'
   AND f."Name" = 'Status';


/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Order Concessions (One To Many via WithdrawnByUserID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityRelationship" WHERE "ID" = 'd519e990-c8ec-452a-9314-3cd817d34dab'
    ) THEN
        INSERT INTO ${mjSchema}."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('d519e990-c8ec-452a-9314-3cd817d34dab', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178', 'WithdrawnByUserID', 'One To Many', 1, 1, 136, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = '5220adc5-c966-4fd6-82bf-e4b521dbd9eb' OR ("EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'WithdrawnByUser')
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
        '5220adc5-c966-4fd6-82bf-e4b521dbd9eb',
        '0E13E45B-0FF1-4B09-8919-CE576829E178', -- "Entity": "MJ_BizApps_Orders": Order "Concessions"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
        'WithdrawnByUser',
        'Withdrawn By User',
        NULL,
        'TEXT',
        200,
        0,
        0,
        1,
        NULL,
        0,
        0,
        1,
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
SET 
   "Category" = 'Approval',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Withdrawn By User'
WHERE 
   "ID" = '21E70036-BCB9-4B25-972F-F7948F9BB6B7';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.WithdrawnAt

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'Approval',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '509B8C54-8452-42F6-9FD8-CBC9C0A088CA';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.WithdrawnByUser

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'Approval',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Withdrawn By User Name'
WHERE 
   "ID" = '5220ADC5-C966-4FD6-82BF-E4B521DBD9EB';

/* Generated Validation Functions for MJ_BizApps_Orders: Order Concessions */
-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ValidateCreditMemoDetails'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('e88ec23e-0665-47de-9e0e-71aa3add89ac', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([CreditMemoAmount] IS NULL AND [CreditMemoNumber] IS NULL OR [CreditMemoAmount]>(0) AND [CreditMemoNumber] IS NOT NULL AND [NewAmount] IS NOT NULL AND [Status]=''Approved'')', 'public ValidateCreditMemoDetails(result: ValidationResult) {
        const hasNoCreditMemo = this.CreditMemoAmount == null && this.CreditMemoNumber == null;
        const hasValidCreditMemo = this.CreditMemoAmount != null && this.CreditMemoAmount > 0 &&
        this.CreditMemoNumber != null && this.CreditMemoNumber.trim() !== "" &&
        this.NewAmount != null && this.Status === "Approved";
        
        if (!hasNoCreditMemo && !hasValidCreditMemo) {
        result.Errors.push(new ValidationErrorInfo(
        "CreditMemoAmount",
        "Credit memo amount and number must both be empty, or if specifying a credit memo, the amount must be greater than zero, credit memo number and new amount must be provided, and status must be Approved.",
        this.CreditMemoAmount,
        ValidationErrorType.Failure
        ));
        }
        }', 'Credit memo details (amount and number) must either both be blank, or if a credit memo is issued, the amount must be greater than zero, a memo number and new amount must be provided, and the status must be Approved.', 'ValidateCreditMemoDetails', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ValidateDecisionFieldsForStatus'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('febdd350-e56c-48b3-bb76-81f5483fa34b', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Status]=''Withdrawn'' OR [Status]=''Pending'' OR [DecidedByUserID] IS NOT NULL AND [DecidedAt] IS NOT NULL)', 'public ValidateDecisionFieldsForStatus(result: ValidationResult) {
        if (this.Status !== "Withdrawn" && this.Status !== "Pending") {
        if (this.DecidedByUserID == null || this.DecidedAt == null) {
        result.Errors.push(new ValidationErrorInfo(
        "Status",
        "DecidedByUserID and DecidedAt are required when Status is not Withdrawn or Pending.",
        this.Status,
        ValidationErrorType.Failure
        ));
        }
        }
        }', 'If a record''s status is neither ''Withdrawn'' nor ''Pending'', it must include both the user who made the decision and the date/time when the decision was made.', 'ValidateDecisionFieldsForStatus', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ValidateDeliveryFormAndDates'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('4d539d45-92ba-4062-9d83-7ffd5a6ad900', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '(NOT ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [PriorStartDate] IS NULL AND [PriorEndDate] IS NULL AND [NewStartDate] IS NULL AND [NewEndDate] IS NULL OR ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [SubscriptionTermID] IS NOT NULL AND [PriorStartDate] IS NOT NULL AND [PriorEndDate] IS NOT NULL AND [NewStartDate] IS NOT NULL AND [NewEndDate] IS NOT NULL AND [NewEndDate]>=[NewStartDate] AND [AddedQuantity] IS NULL AND [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL AND ([DeliveryForm]=''Shift'' AND datediff(day,[PriorStartDate],[NewStartDate])=datediff(day,[PriorEndDate],[NewEndDate]) AND [NewStartDate]<>[PriorStartDate] OR [DeliveryForm]=''Shorten'' AND [NewStartDate]>=[PriorStartDate] AND [NewEndDate]<=[PriorEndDate] AND ([NewStartDate]<>[PriorStartDate] OR [NewEndDate]<>[PriorEndDate])))', 'public ValidateDeliveryFormAndDates(result: ValidationResult) {
        const deliveryForm = this.DeliveryForm;
        const isShift = deliveryForm === "Shift";
        const isShorten = deliveryForm === "Shorten";
        
        if (!isShift && !isShorten) {
        if (this.PriorStartDate != null || this.PriorEndDate != null || this.NewStartDate != null || this.NewEndDate != null) {
        result.Errors.push(new ValidationErrorInfo(
        "DeliveryForm",
        "Start and end dates must not be specified when DeliveryForm is not ''Shift'' or ''Shorten''.",
        deliveryForm,
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
        "Prior and new start and end dates are required when DeliveryForm is ''Shift'' or ''Shorten''.",
        deliveryForm,
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
        
        if (this.NewStartDate != null && this.NewEndDate != null && new Date(this.NewEndDate).getTime() < new Date(this.NewStartDate).getTime()) {
        result.Errors.push(new ValidationErrorInfo(
        "NewEndDate",
        "NewEndDate must be greater than or equal to NewStartDate.",
        this.NewEndDate,
        ValidationErrorType.Failure
        ));
        }
        
        if (this.PriorStartDate != null && this.PriorEndDate != null && this.NewStartDate != null && this.NewEndDate != null) {
        const pStart = new Date(this.PriorStartDate).getTime();
        const pEnd = new Date(this.PriorEndDate).getTime();
        const nStart = new Date(this.NewStartDate).getTime();
        const nEnd = new Date(this.NewEndDate).getTime();
        const msPerDay = 1000 * 60 * 60 * 24;
        
        if (isShift) {
        const startDays = Math.round((nStart - pStart) / msPerDay);
        const endDays = Math.round((nEnd - pEnd) / msPerDay);
        if (startDays !== endDays) {
        result.Errors.push(new ValidationErrorInfo(
        "NewStartDate",
        "For a ''Shift'' delivery form, start date and end date must shift by the exact same number of days.",
        this.NewStartDate,
        ValidationErrorType.Failure
        ));
        }
        if (nStart === pStart) {
        result.Errors.push(new ValidationErrorInfo(
        "NewStartDate",
        "For a ''Shift'' delivery form, NewStartDate must differ from PriorStartDate.",
        this.NewStartDate,
        ValidationErrorType.Failure
        ));
        }
        }
        
        if (isShorten) {
        if (nStart < pStart || nEnd > pEnd) {
        result.Errors.push(new ValidationErrorInfo(
        "DeliveryForm",
        "For a ''Shorten'' delivery form, the new date range must be within the prior date range.",
        deliveryForm,
        ValidationErrorType.Failure
        ));
        }
        if (nStart === pStart && nEnd === pEnd) {
        result.Errors.push(new ValidationErrorInfo(
        "DeliveryForm",
        "For a ''Shorten'' delivery form, at least one of the start or end dates must change.",
        deliveryForm,
        ValidationErrorType.Failure
        ));
        }
        }
        }
        }
        }', 'Validates date rules and field restrictions based on the delivery form. When the delivery form is ''Shift'' or ''Shorten'', prior and new start and end dates are required alongside a subscription term, while restricting quantity and payment terms changes. Shift requires equal movement of start and end dates to a new date, while Shorten requires reducing the date range within original boundaries.', 'ValidateDeliveryFormAndDates', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ValidateDeliveryFormDurationRequirements'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('10166b56-d9f4-40cf-87c4-5efdbc717569', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Duration'' OR [SubscriptionTermID] IS NOT NULL AND [AddedDays]>(0))', 'public ValidateDeliveryFormDurationRequirements(result: ValidationResult) {
        if (this.DeliveryForm === ''Duration'' && (this.SubscriptionTermID == null || this.AddedDays == null || this.AddedDays <= 0)) {
        result.Errors.push(new ValidationErrorInfo(
        "DeliveryForm",
        "When the delivery form is ''Duration'', a subscription term must be specified and the added days must be greater than zero.",
        this.DeliveryForm,
        ValidationErrorType.Failure
        ));
        }
        }', 'When the delivery form is set to ''Duration'', a valid subscription term must be selected and the number of added days must be greater than zero.', 'ValidateDeliveryFormDurationRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ValidateNewAmountAndScheduleReductionDetails'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('467ea661-28dd-4796-bc55-9b7c291ad9b0', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([NewAmount] IS NOT NULL OR [AppliesToPaymentScheduleID] IS NULL AND [ScheduleReduction] IS NULL)', 'public ValidateNewAmountAndScheduleReductionDetails(result: ValidationResult) {
        if (this.NewAmount == null && (this.AppliesToPaymentScheduleID != null || this.ScheduleReduction != null)) {
        result.Errors.push(new ValidationErrorInfo(
        "NewAmount",
        "A new amount must be provided when specifying a payment schedule or schedule reduction.",
        this.NewAmount,
        ValidationErrorType.Failure
        ));
        }
        }', 'Ensures that if a payment schedule or schedule reduction is specified, a new amount must also be provided.', 'ValidateNewAmountAndScheduleReductionDetails', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ValidateNewAmountRequirements'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('09e316c8-0bc8-4548-b482-c915c04c54ee', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([NewAmount] IS NULL OR [DeliveryForm]=''Price'' AND [SubscriptionTermID] IS NOT NULL AND [OrderLineID] IS NOT NULL AND [NewAmount]>(0))', 'public ValidateNewAmountRequirements(result: ValidationResult) {
        if (this.NewAmount != null) {
        if (this.DeliveryForm !== ''Price'' || this.SubscriptionTermID == null || this.OrderLineID == null || this.NewAmount <= 0) {
        result.Errors.push(new ValidationErrorInfo(
        "NewAmount",
        "When a New Amount is specified, the Delivery Form must be ''Price'', a Subscription Term and Order Line must be assigned, and the amount must be greater than zero.",
        this.NewAmount,
        ValidationErrorType.Failure
        ));
        }
        }
        }', 'If a new amount is specified, the delivery form must be set to ''Price'', and both a subscription term and order line must be associated with the record along with the new amount being greater than zero.', 'ValidateNewAmountRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ValidateNewAmountWhenRefundRequested'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('44ed7ee8-0e32-4884-8f2a-27777fe81c5c', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([RefundRequested]=FALSE OR [NewAmount] IS NOT NULL)', 'public ValidateNewAmountWhenRefundRequested(result: ValidationResult) {
        if (this.RefundRequested && this.NewAmount == null) {
        result.Errors.push(new ValidationErrorInfo(
        "NewAmount",
        "A new amount must be provided when a refund is requested.",
        this.NewAmount,
        ValidationErrorType.Failure
        ));
        }
        }', 'If a refund is requested, a new amount must be specified.', 'ValidateNewAmountWhenRefundRequested', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ValidateOrderLineIDRequiredForDeliveryForm'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('6df3d267-8ded-4f8a-a42a-9e01f7b37d0c', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '(NOT ([DeliveryForm]=''Scope'' OR [DeliveryForm]=''Price'') OR [OrderLineID] IS NOT NULL)', 'public ValidateOrderLineIDRequiredForDeliveryForm(result: ValidationResult) {
        if ((this.DeliveryForm === ''Scope'' || this.DeliveryForm === ''Price'') && this.OrderLineID == null) {
        result.Errors.push(new ValidationErrorInfo(
        "OrderLineID",
        "An Order Line is required when Delivery Form is set to Scope or Price.",
        this.OrderLineID,
        ValidationErrorType.Failure
        ));
        }
        }', 'If the delivery form is set to Scope or Price, an order line must be specified.', 'ValidateOrderLineIDRequiredForDeliveryForm', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ValidatePaymentTermsTypesForDeliveryForm'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('aa4c65e4-0291-4dbe-abff-4bcbeea7f0f7', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DeliveryForm]=''Terms'' OR [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL)', 'public ValidatePaymentTermsTypesForDeliveryForm(result: ValidationResult) {
        if (this.DeliveryForm !== ''Terms'') {
        if (this.PriorPaymentTermsTypeID != null || this.NewPaymentTermsTypeID != null) {
        result.Errors.push(new ValidationErrorInfo(
        "DeliveryForm",
        "Prior and new payment terms types can only be provided when DeliveryForm is ''Terms''.",
        this.DeliveryForm,
        ValidationErrorType.Failure
        ));
        }
        }
        }', 'Payment terms types (prior or new) can only be specified when the delivery form is set to ''Terms''.', 'ValidatePaymentTermsTypesForDeliveryForm', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ValidateScheduleReductionStatus'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('b4c794c6-b4a9-4cca-8e54-d0e9a1941943', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ScheduleReduction] IS NULL OR [ScheduleReduction]>(0) AND [Status]=''Approved'')', 'public ValidateScheduleReductionStatus(result: ValidationResult) {
        if (this.ScheduleReduction != null && (this.ScheduleReduction <= 0 || this.Status !== ''Approved'')) {
        result.Errors.push(new ValidationErrorInfo(
        "ScheduleReduction",
        "Schedule reduction must be greater than 0 and can only be applied when the status is Approved.",
        this.ScheduleReduction,
        ValidationErrorType.Failure
        ));
        }
        }', 'If a schedule reduction is specified, it must be greater than zero and the record status must be set to ''Approved''.', 'ValidateScheduleReductionStatus', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ValidateSeatsDeliveryFormRequirements'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('5c3dc371-9f60-44b0-a304-66f85c4cd40d', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Seats'' OR [OrderLineID] IS NOT NULL AND [AddedQuantity]>(0))', 'public ValidateSeatsDeliveryFormRequirements(result: ValidationResult) {
        if (this.DeliveryForm === ''Seats'') {
        if (this.OrderLineID == null || this.AddedQuantity == null || this.AddedQuantity <= 0) {
        result.Errors.push(new ValidationErrorInfo(
        "DeliveryForm",
        "When DeliveryForm is set to ''Seats'', an Order Line must be specified and Added Quantity must be greater than 0.",
        this.DeliveryForm,
        ValidationErrorType.Failure
        ));
        }
        }
        }', 'When the delivery form is ''Seats'', an associated order line must be provided and the added quantity must be greater than zero.', 'ValidateSeatsDeliveryFormRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ValidateTermsDeliveryFormFields'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('5d54edf4-f8e2-4f68-b3b3-d932c8372748', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Terms'' OR [NewPaymentTermsTypeID] IS NOT NULL AND ([PriorPaymentTermsTypeID] IS NULL OR [PriorPaymentTermsTypeID]<>[NewPaymentTermsTypeID]) AND [AddedDays] IS NOT NULL AND [OrderLineID] IS NULL AND [SubscriptionTermID] IS NULL AND [AddedQuantity] IS NULL)', 'public ValidateTermsDeliveryFormFields(result: ValidationResult) {
        if (this.DeliveryForm === ''Terms'') {
        if (
        this.NewPaymentTermsTypeID == null ||
        (this.PriorPaymentTermsTypeID != null && this.PriorPaymentTermsTypeID === this.NewPaymentTermsTypeID) ||
        this.AddedDays == null ||
        this.OrderLineID != null ||
        this.SubscriptionTermID != null ||
        this.AddedQuantity != null
        ) {
        result.Errors.push(new ValidationErrorInfo(
        "DeliveryForm",
        "When DeliveryForm is ''Terms'', a new payment terms type and added days are required (with new terms differing from prior terms), while order line, subscription term, and added quantity must be empty.",
        this.DeliveryForm,
        ValidationErrorType.Failure
        ));
        }
        }
        }', 'When the delivery form is set to ''Terms'', a new payment terms type and added days are required (and new terms must differ from prior terms), while order line, subscription term, and added quantity must be empty.', 'ValidateTermsDeliveryFormFields', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND "Name" = 'ValidateWithdrawalDetailsByStatus'
    ) THEN
        INSERT INTO ${mjSchema}."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('f8f0c7d4-638f-4d92-8556-725c95b2147c', (SELECT "ID" FROM ${mjSchema}."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Status]=''Withdrawn'' AND [WithdrawnByUserID] IS NOT NULL AND [WithdrawnAt] IS NOT NULL OR [Status]<>''Withdrawn'' AND [WithdrawnByUserID] IS NULL AND [WithdrawnAt] IS NULL)', 'public ValidateWithdrawalDetailsByStatus(result: ValidationResult) {
        if (this.Status === "Withdrawn") {
        if (this.WithdrawnByUserID == null || this.WithdrawnAt == null) {
        result.Errors.push(new ValidationErrorInfo(
        "WithdrawnByUserID",
        "When Status is ''Withdrawn'', both the user who withdrew it and the withdrawal timestamp must be provided.",
        this.WithdrawnByUserID,
        ValidationErrorType.Failure
        ));
        }
        } else {
        if (this.WithdrawnByUserID != null || this.WithdrawnAt != null) {
        result.Errors.push(new ValidationErrorInfo(
        "WithdrawnByUserID",
        "Withdrawal details can only be specified when Status is ''Withdrawn''.",
        this.WithdrawnByUserID,
        ValidationErrorType.Failure
        ));
        }
        }
        }', 'If an item''s status is Withdrawn, it must include both the user who withdrew it and the withdrawal timestamp; for any other status, both withdrawal fields must be empty.', 'ValidateWithdrawalDetailsByStatus', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178');
    END IF;
END $$;


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj_BizAppsOrders."OrderConcession"
 ADD CONSTRAINT "CK_OrderConcession_Status"
    CHECK ("Status" IN ('Pending','Approved','Rejected','Withdrawn')) NOT VALID;

ALTER TABLE __mj_BizAppsOrders."OrderConcession"
 ADD CONSTRAINT "CK_OrderConcession_Decision"
    CHECK ("Status" IN ('Pending','Withdrawn') OR ("DecidedByUserID" IS NOT NULL AND "DecidedAt" IS NOT NULL)) NOT VALID;


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
/* SQL text to insert 1 new entity field(s) */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."WithdrawnByUserID" IS 'The user who withdrew the concession. Set only when Status is Withdrawn.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."WithdrawnAt" IS 'When the concession was withdrawn. Set only when Status is Withdrawn.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderConcession"."Status" IS 'Pending | Approved | Rejected | Withdrawn. Set to Approved on save when the requester''s SalesAuthority covers the concession; otherwise decided by a holder of the ConcessionLimit rule''s role. Withdrawn: taken back by its requester (or a user who may update concessions) while Pending, or while Approved on an order not yet confirmed and not tied to a booked term; it stays on the order as a record and counts toward nothing.';


-- ===================== Other =====================

-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above, generated against a database
-- built from this repo's migrations: the two new Order Concessions fields, the
-- Withdrawn value-list value, vwOrderConcessions, the CRUD procs, permissions and
-- Order Concessions' validators.
-- =============================================================================


/* SQL text to insert 2 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Order Concessions */
