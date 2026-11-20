-- =============================================================================================
-- PostgreSQL counterpart of V202610131507__v5.32.x__CodeGen_Drift_Heal.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) output, finished by hand:
--   * Tables, columns, constraints, indexes, views, data and grants are the converter's.
--   * CodeGen's CRUD procedures (spCreate/spUpdate/spDelete) and its __mj_UpdatedAt triggers are
--     NOT here: the converter cannot translate T-SQL procedures or triggers, and this repository
--     has no PostgreSQL baseline to run MJ CodeGen against. A PostgreSQL host runs `mj codegen`
--     after installing, which generates them natively. The converter's notes for them remain,
--     fully commented out.
--   * 68 string values restored verbatim from the T-SQL: the converter re-indents text inside string
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
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '58DE02DB-C86F-4D7A-9670-14BB3BBCF1C2'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('712b9b34-903a-40aa-83ab-50ab9dda1a5e', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Attempts]>=(0))', 'public ValidateAttemptsNonNegative(result: ValidationResult) {
	if (this.Attempts < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Attempts",
			"Attempts cannot be negative. It must be 0 or greater.",
			this.Attempts,
			ValidationErrorType.Failure
		));
	}
}', 'The number of attempts must be zero or greater to prevent negative attempt counts from being recorded.', 'ValidateAttemptsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '58DE02DB-C86F-4D7A-9670-14BB3BBCF1C2');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'C96F379A-3E15-4DE5-BA94-4ECC90960C6D'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('95c19f10-bfd5-417c-9391-f1caef3ecd08', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([OwnerPersonID] IS NOT NULL OR [OwnerOrganizationID] IS NOT NULL)', 'public ValidateAtLeastOneOwnerSpecified(result: ValidationResult) {
	if (this.OwnerPersonID == null && this.OwnerOrganizationID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"OwnerPersonID",
			"An owner must be specified. Either Owner Person or Owner Organization must be set.",
			this.OwnerPersonID,
			ValidationErrorType.Failure
		));
	}
}', 'An owner must be assigned to each record. Either an Owner Person or an Owner Organization must be specified.', 'ValidateAtLeastOneOwnerSpecified', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'C96F379A-3E15-4DE5-BA94-4ECC90960C6D');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '43597C3A-8C6D-4A9A-9159-2C9F33264287'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('14a88a6e-535a-43b8-8930-4e43c3b75572', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([StartedAt] IS NULL OR [EndedAt] IS NULL OR [EndedAt]>[StartedAt])', 'public ValidateEndedAtAfterStartedAt(result: ValidationResult) {
	if (this.StartedAt != null && this.EndedAt != null && this.EndedAt <= this.StartedAt) {
		result.Errors.push(new ValidationErrorInfo(
			"EndedAt",
			"End date must be after start date.",
			this.EndedAt,
			ValidationErrorType.Failure
		));
	}
}', 'Ensures that the end date occurs after the start date when both dates are provided.', 'ValidateEndedAtAfterStartedAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '43597C3A-8C6D-4A9A-9159-2C9F33264287');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('607dddc9-d058-4925-a64a-8001f9186620', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([EndedAt] IS NULL OR [StartedAt] IS NULL OR [EndedAt]>[StartedAt])', 'public ValidateEndedAtAfterStartedAt(result: ValidationResult) {
	if (this.EndedAt != null && this.StartedAt != null && this.EndedAt <= this.StartedAt) {
		result.Errors.push(new ValidationErrorInfo(
			"EndedAt",
			"End date must be after the start date.",
			this.EndedAt,
			ValidationErrorType.Failure
		));
	}
}', 'End date must be after the start date when both dates are specified.', 'ValidateEndedAtAfterStartedAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'ADB3DCD5-ECAF-4805-9690-F8EDAFB17ABB'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('c8f2a137-2dbe-4513-804e-7bb4de68c86f', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '(len(ltrim(rtrim([Reason])))>(0))', 'public ValidateReasonNotEmpty(result: ValidationResult) {
	if (this.Reason != null && this.Reason.trim().length === 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Reason",
			"Reason must contain text and cannot be blank or consist only of whitespace.",
			this.Reason,
			ValidationErrorType.Failure
		));
	}
}', 'Reason must contain text and cannot be left blank or consist only of whitespace', 'ValidateReasonNotEmpty', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'ADB3DCD5-ECAF-4805-9690-F8EDAFB17ABB');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'FCD8DC48-D198-430C-A684-67F3A36A96A7'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('5c8e067a-cce8-4750-b01b-1e830f98f3c2', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ApprovalTaskID] IS NULL AND [ApprovalTaskRaisedAt] IS NULL OR [ApprovalTaskID] IS NOT NULL AND [ApprovalTaskRaisedAt] IS NOT NULL)', 'public ValidateApprovalTaskIDAndApprovalTaskRaisedAt(result: ValidationResult) {
	if ((this.ApprovalTaskID != null && this.ApprovalTaskRaisedAt == null) || (this.ApprovalTaskID == null && this.ApprovalTaskRaisedAt != null)) {
		result.Errors.push(new ValidationErrorInfo(
			"ApprovalTaskID",
			"Approval Task ID and Approval Task Raised At date/time must either both be set or both be empty.",
			this.ApprovalTaskID,
			ValidationErrorType.Failure
		));
	}
}', 'Approval Task ID and Approval Task Raised At must either both be provided or both be left blank to maintain approval task tracking consistency.', 'ValidateApprovalTaskIDAndApprovalTaskRaisedAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'FCD8DC48-D198-430C-A684-67F3A36A96A7');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'FCD8DC48-D198-430C-A684-67F3A36A96A7'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('16bed85a-6104-4bcf-ae43-6bfd4340c94c', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Status]=''Requested'' AND [DecidedByUserID] IS NULL AND [DecidedAt] IS NULL OR [Status]=''Withdrawn'' AND [DecidedAt] IS NOT NULL OR ([Status]=''Expired'' OR [Status]=''Rejected'' OR [Status]=''Approved'') AND [DecidedByUserID] IS NOT NULL AND [DecidedAt] IS NOT NULL)', 'public ValidateStatusAndDecisionFields(result: ValidationResult) {
	if (this.Status != null) {
		let isValid = false;

		if (this.Status === "Requested") {
			isValid = this.DecidedByUserID == null && this.DecidedAt == null;
		} else if (this.Status === "Withdrawn") {
			isValid = this.DecidedAt != null;
		} else if (this.Status === "Expired" || this.Status === "Rejected" || this.Status === "Approved") {
			isValid = this.DecidedByUserID != null && this.DecidedAt != null;
		}

		if (!isValid) {
			result.Errors.push(new ValidationErrorInfo(
				"Status",
				"Decision details (DecidedByUserID and DecidedAt) do not align with the current Status. Requested status cannot have decision details; Withdrawn requires a decision date; and Approved, Rejected, or Expired statuses require both a decider and a decision date.",
				this.Status,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Ensures that decision details (the deciding user and decision timestamp) strictly match the record''s status: ''Requested'' records must not have decision details set; ''Withdrawn'' records must have a decision timestamp; and ''Approved'', ''Rejected'', or ''Expired'' records must have both a decision user and timestamp.', 'ValidateStatusAndDecisionFields', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'FCD8DC48-D198-430C-A684-67F3A36A96A7');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '9E638C8F-6447-45D9-9137-B24E1047BCE5'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('09ec6b56-31fe-4390-96ef-199bbcd24272', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Status]=''Revoked'' AND [RevokedAt] IS NOT NULL OR [Status]<>''Revoked'' AND [RevokedAt] IS NULL)', 'public ValidateRevokedAtComparedToStatus(result: ValidationResult) {
	if (this.Status === "Revoked" && this.RevokedAt == null) {
		result.Errors.push(new ValidationErrorInfo(
			"RevokedAt",
			"A revocation timestamp must be provided when the status is Revoked.",
			this.RevokedAt,
			ValidationErrorType.Failure
		));
	} else if (this.Status !== "Revoked" && this.RevokedAt != null) {
		result.Errors.push(new ValidationErrorInfo(
			"RevokedAt",
			"A revocation timestamp cannot be set unless the status is Revoked.",
			this.RevokedAt,
			ValidationErrorType.Failure
		));
	}
}', 'When an item''s status is set to Revoked, a revocation timestamp must be recorded. Conversely, items with any other status cannot have a revocation timestamp.', 'ValidateRevokedAtComparedToStatus', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9E638C8F-6447-45D9-9137-B24E1047BCE5');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '9E638C8F-6447-45D9-9137-B24E1047BCE5'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('e1a9aec7-f141-40c8-a19f-65d1fb7eb929', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Status]<>''Active'' OR [SuspendedAt] IS NULL AND [SuspensionReason] IS NULL)', 'public ValidateSuspensionFieldsForActiveStatus(result: ValidationResult) {
	if (this.Status === ''Active'' && (this.SuspendedAt != null || this.SuspensionReason != null)) {
		result.Errors.push(new ValidationErrorInfo(
			"Status",
			"An active record cannot have a suspension date or suspension reason.",
			this.Status,
			ValidationErrorType.Failure
		));
	}
}', 'Active records cannot have a suspension date or suspension reason specified.', 'ValidateSuspensionFieldsForActiveStatus', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9E638C8F-6447-45D9-9137-B24E1047BCE5');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '60EE008E-71D4-48CF-847B-A4341BF14A3D'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('845e4c71-d60f-48f4-9a6d-25c4d4a0ef77', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Capacity] IS NULL OR [Capacity]>(0))', 'public ValidateCapacityGreaterThanZero(result: ValidationResult) {
	if (this.Capacity != null && this.Capacity <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Capacity",
			"Capacity must be greater than zero.",
			this.Capacity,
			ValidationErrorType.Failure
		));
	}
}', 'Capacity, if specified, must be greater than zero.', 'ValidateCapacityGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '60EE008E-71D4-48CF-847B-A4341BF14A3D');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '6F739DCD-46E0-44A1-9A94-51E4E6E849FF'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('4e9044a8-c77a-4ab8-9577-ac9869647bea', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([BillToOrganizationID] IS NULL AND [BillToPersonID] IS NOT NULL OR [BillToOrganizationID] IS NOT NULL AND [BillToPersonID] IS NULL)', 'public ValidateBillToOrganizationOrPerson(result: ValidationResult) {
	const hasOrg = this.BillToOrganizationID != null;
	const hasPerson = this.BillToPersonID != null;

	if ((hasOrg && hasPerson) || (!hasOrg && !hasPerson)) {
		result.Errors.push(new ValidationErrorInfo(
			"BillToOrganizationID",
			"Exactly one billing target must be specified: either a Billing Organization or a Billing Person.",
			this.BillToOrganizationID,
			ValidationErrorType.Failure
		));
	}
}', 'Exactly one billing contact must be provided: either a billing organization or a billing person, but not both or neither.', 'ValidateBillToOrganizationOrPerson', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '6F739DCD-46E0-44A1-9A94-51E4E6E849FF');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'F781673F-148C-4E2F-A922-E0DF531F46FA'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('b87c9463-e2f9-4d03-bb86-53572206162c', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Amount]>(0))', 'public ValidateAmountGreaterThanZero(result: ValidationResult) {
	if (this.Amount != null && this.Amount <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Amount",
			"Amount must be greater than zero.",
			this.Amount,
			ValidationErrorType.Failure
		));
	}
}', 'Amount must be greater than zero to ensure valid transaction values.', 'ValidateAmountGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'F781673F-148C-4E2F-A922-E0DF531F46FA');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '9915A9E7-6BC6-4518-BAEA-206B18C86622'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('9469334c-3b24-421d-bfe5-44dfd5a2ae7f', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Status]<>N''Sent'' OR [ExternalInvoiceRef] IS NOT NULL AND [SentAt] IS NOT NULL)', 'public ValidateSentStatusRequirements(result: ValidationResult) {
	if (this.Status === ''Sent'') {
		if (this.ExternalInvoiceRef == null || this.SentAt == null) {
			result.Errors.push(new ValidationErrorInfo(
				"Status",
				"Invoices marked as ''Sent'' must include both an External Invoice Reference and a Sent At date.",
				this.Status,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Invoices with a status of ''Sent'' must have both an external invoice reference and a sent timestamp.', 'ValidateSentStatusRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9915A9E7-6BC6-4518-BAEA-206B18C86622');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('0ddde9bd-eea8-4829-90d5-dd92d0a98fa0', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Disposition]<>N''Captured'' OR [PaymentHeaderID] IS NOT NULL)', 'public ValidatePaymentHeaderRequiredForCapturedDisposition(result: ValidationResult) {
	if (this.Disposition === "Captured" && this.PaymentHeaderID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"PaymentHeaderID",
			"A payment header is required when the payment disposition is Captured.",
			this.PaymentHeaderID,
			ValidationErrorType.Failure
		));
	}
}', 'Captured payments must be associated with a payment header.', 'ValidatePaymentHeaderRequiredForCapturedDisposition', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'BF3B92DA-2C31-4C81-87BA-6CE08FC5B85D');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '8936D4D1-EB07-4EE8-A7AC-24131A1C48A8'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('16918738-bb84-4a98-b92e-64cb863d99c8', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([PromotionID] IS NOT NULL OR len(ltrim(isnull([Reason],'''')))>(0))', 'public ValidatePromotionIDOrReasonRequired(result: ValidationResult) {
	if (this.PromotionID == null && (this.Reason == null || this.Reason.trim().length === 0)) {
		result.Errors.push(new ValidationErrorInfo(
			"Reason",
			"Either a promotion must be selected or a reason must be provided.",
			this.Reason,
			ValidationErrorType.Failure
		));
	}
}', 'A promotion must be selected, or a valid reason must be provided.', 'ValidatePromotionIDOrReasonRequired', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '8936D4D1-EB07-4EE8-A7AC-24131A1C48A8');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0C5914C4-3FDE-497F-B0BC-8CBB2D8D55DB'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('d49af123-abfc-40d9-b475-834857d7d445', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([RenewalIncreasePercent] IS NULL OR [RenewalIncreasePercent]>=(0) AND [RenewalIncreasePercent]<=(100))', 'public ValidateRenewalIncreasePercentRange(result: ValidationResult) {
	if (this.RenewalIncreasePercent != null && (this.RenewalIncreasePercent < 0 || this.RenewalIncreasePercent > 100)) {
		result.Errors.push(new ValidationErrorInfo(
			"RenewalIncreasePercent",
			"Renewal increase percentage must be between 0 and 100.",
			this.RenewalIncreasePercent,
			ValidationErrorType.Failure
		));
	}
}', 'Renewal increase percentage must be between 0 and 100, or left blank.', 'ValidateRenewalIncreasePercentRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '0C5914C4-3FDE-497F-B0BC-8CBB2D8D55DB');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '8FDB348F-D2BA-4F56-97CD-6101D43665B0'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('d141222c-6e7a-495c-87ed-272c6f7e87b9', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Amount]>(0))', 'public ValidateAmountGreaterThanZero(result: ValidationResult) {
	if (this.Amount != null && this.Amount <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Amount",
			"Amount must be greater than zero.",
			this.Amount,
			ValidationErrorType.Failure
		));
	}
}', 'Amount must be greater than zero to ensure valid financial calculations and prevent zero or negative installment amounts.', 'ValidateAmountGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '8FDB348F-D2BA-4F56-97CD-6101D43665B0');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('6a58bafc-20eb-45e3-a968-de137595c2c8', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Status]=N''Canceled'' OR [Status]=N''Scheduled'' OR [DocumentNumber] IS NOT NULL AND [InvoicedAt] IS NOT NULL)', 'public ValidateInvoicingDetailsByStatus(result: ValidationResult) {
	if (this.Status !== ''Canceled'' && this.Status !== ''Scheduled'') {
		if (this.DocumentNumber == null || this.InvoicedAt == null) {
			result.Errors.push(new ValidationErrorInfo(
				"DocumentNumber",
				"Document Number and Invoiced At date are required when status is not Canceled or Scheduled.",
				this.DocumentNumber,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Invoices that are not in Canceled or Scheduled status must have both a Document Number and an Invoiced At timestamp to maintain complete invoicing records.', 'ValidateInvoicingDetailsByStatus', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '4BEC4999-721D-423A-B88B-2076F475BB39'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('cecd0a4e-3a17-4007-84eb-4867e760541d', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([BillToAddressSnapshot] IS NULL OR isjson([BillToAddressSnapshot])=(1))', 'public ValidateBillToAddressSnapshotIsValidJson(result: ValidationResult) {
	if (this.BillToAddressSnapshot != null && this.BillToAddressSnapshot.trim() !== "") {
		try {
			JSON.parse(this.BillToAddressSnapshot);
		} catch (e) {
			result.Errors.push(new ValidationErrorInfo(
				"BillToAddressSnapshot",
				"Bill-To Address Snapshot must be a valid JSON formatted string.",
				this.BillToAddressSnapshot,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Ensures that if a billing address snapshot is provided, it contains valid JSON-formatted data.', 'ValidateBillToAddressSnapshotIsValidJson', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '4BEC4999-721D-423A-B88B-2076F475BB39');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '8B137EE1-FA08-498E-A222-EAABBE9B79D0'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('c1c6d6d1-dc3f-47ad-b8ba-2dcb7fbdf400', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([InitialPaymentAmount]>=(0))', 'public ValidateInitialPaymentAmountNonNegative(result: ValidationResult) {
	if (this.InitialPaymentAmount != null && this.InitialPaymentAmount < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"InitialPaymentAmount",
			"Initial payment amount must be greater than or equal to 0.",
			this.InitialPaymentAmount,
			ValidationErrorType.Failure
		));
	}
}', 'Initial payment amount cannot be negative. This ensures that all payment values recorded are valid positive amounts or zero.', 'ValidateInitialPaymentAmountNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '8B137EE1-FA08-498E-A222-EAABBE9B79D0');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'F9F37487-78B3-4E0C-8F74-046EFBA959A8'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('40304d8b-39da-4955-8963-b68cae30b97c', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ShipToAddressSnapshot] IS NULL OR isjson([ShipToAddressSnapshot])=(1))', 'public ValidateShipToAddressSnapshotIsValidJson(result: ValidationResult) {
	if (this.ShipToAddressSnapshot != null && this.ShipToAddressSnapshot.trim() !== "") {
		try {
			JSON.parse(this.ShipToAddressSnapshot);
		} catch (e) {
			result.Errors.push(new ValidationErrorInfo(
				"ShipToAddressSnapshot",
				"Ship To Address Snapshot must be a valid JSON string.",
				this.ShipToAddressSnapshot,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If a shipping address snapshot is provided, it must be formatted as valid JSON data.', 'ValidateShipToAddressSnapshotIsValidJson', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'F9F37487-78B3-4E0C-8F74-046EFBA959A8');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'FCFACC31-40B4-41D4-954B-C46A74DCFF73'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('3c7a3b2c-d9b3-462e-ba68-94c62efbe6c9', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([SourceEntityID] IS NULL AND [SourceRecordID] IS NULL OR [SourceEntityID] IS NOT NULL AND [SourceRecordID] IS NOT NULL)', 'public ValidateSourceEntityAndRecordPair(result: ValidationResult) {
	const hasEntity = this.SourceEntityID != null;
	const hasRecord = this.SourceRecordID != null;

	if ((hasEntity && !hasRecord) || (!hasEntity && hasRecord)) {
		result.Errors.push(new ValidationErrorInfo(
			"SourceEntityID",
			"Source Entity and Source Record must either both be provided or both be left blank.",
			this.SourceEntityID,
			ValidationErrorType.Failure
		));
	}
}', 'Source entity and source record must either both be provided or both be left empty to ensure source references remain complete.', 'ValidateSourceEntityAndRecordPair', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'FCFACC31-40B4-41D4-954B-C46A74DCFF73');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'F12A0445-D789-469A-9BB7-5570C5EB22FB'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('c128b2c3-bb55-4349-9a4b-42598b6fc9bb', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([PercentComplete]>=(0) AND [PercentComplete]<=(1))', 'public ValidatePercentCompleteRange(result: ValidationResult) {
	if (this.PercentComplete != null && (this.PercentComplete < 0 || this.PercentComplete > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"PercentComplete",
			"Percent complete must be a value between 0 and 1.",
			this.PercentComplete,
			ValidationErrorType.Failure
		));
	}
}', 'Percent complete must be a decimal value between 0 and 1 inclusive, representing a percentage from 0% to 100%.', 'ValidatePercentCompleteRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'F12A0445-D789-469A-9BB7-5570C5EB22FB');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '9F5508E8-9F4F-4F5D-B991-C98BF0043498'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('535a3311-3986-44a8-8a7e-4265c588d04e', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([SupersedesMeasurementID]<>[ID])', '	public ValidateSupersedesMeasurementIDNotEqualToID(result: ValidationResult) {
		if (this.SupersedesMeasurementID != null && this.SupersedesMeasurementID === this.ID) {
			result.Errors.push(new ValidationErrorInfo(
				"SupersedesMeasurementID",
				"A measurement cannot supersede itself. Select a different measurement or leave the field empty.",
				this.SupersedesMeasurementID,
				ValidationErrorType.Failure
			));
		}
	}', 'A measurement record cannot supersede itself. The superseded measurement must refer to a different measurement.', 'ValidateSupersedesMeasurementIDNotEqualToID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9F5508E8-9F4F-4F5D-B991-C98BF0043498');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '3F5506C2-C477-4F74-A152-F581E0E5C89E'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('2fcf6580-9498-41bb-9ea9-da731fb075d1', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DiscountAmount]>=(0))', 'public ValidateDiscountAmountGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.DiscountAmount != null && this.DiscountAmount < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"DiscountAmount",
			"Discount amount cannot be negative.",
			this.DiscountAmount,
			ValidationErrorType.Failure
		));
	}
}', 'Discount amount must be zero or greater to prevent invalid negative values from being applied.', 'ValidateDiscountAmountGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '3F5506C2-C477-4F74-A152-F581E0E5C89E');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '0A8DE5AA-338D-4963-A8E5-B50D814364F8'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('79144842-674d-4193-acff-10f04b3d76b7', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ShipToAddressSnapshot] IS NULL OR isjson([ShipToAddressSnapshot])=(1))', 'public ValidateShipToAddressSnapshotFormat(result: ValidationResult) {
	if (this.ShipToAddressSnapshot != null && this.ShipToAddressSnapshot.trim() !== "") {
		try {
			JSON.parse(this.ShipToAddressSnapshot);
		} catch (e) {
			result.Errors.push(new ValidationErrorInfo(
				"ShipToAddressSnapshot",
				"Ship to address snapshot must be formatted as a valid JSON string.",
				this.ShipToAddressSnapshot,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If a ship-to address snapshot is provided, it must be formatted as a valid JSON string.', 'ValidateShipToAddressSnapshotFormat', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '0A8DE5AA-338D-4963-A8E5-B50D814364F8');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '66D82C24-9C9F-4CD6-B019-53C20274AB00'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('4af8024f-20a9-4f95-a5de-87e180982101', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DimensionID] IS NULL AND [DimensionValueID] IS NULL OR [DimensionID] IS NOT NULL AND [DimensionValueID] IS NOT NULL)', 'public ValidateDimensionAndDimensionValuePairing(result: ValidationResult) {
	if ((this.DimensionID == null && this.DimensionValueID != null) || (this.DimensionID != null && this.DimensionValueID == null)) {
		result.Errors.push(new ValidationErrorInfo(
			"DimensionID",
			"Dimension and Dimension Value must both be specified together or both left blank.",
			this.DimensionID,
			ValidationErrorType.Failure
		));
	}
}', 'Dimension and Dimension Value must either both be specified or both be left blank.', 'ValidateDimensionAndDimensionValuePairing', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '66D82C24-9C9F-4CD6-B019-53C20274AB00');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '66D82C24-9C9F-4CD6-B019-53C20274AB00'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('f900b746-bded-47cc-87c5-c716db3b816c', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([IsRollupParent]=(0) OR [DiscountAmount]=(0) AND [ChargeAmount]=(0) AND [LineTax]=(0))', 'public ValidateIsRollupParentAmounts(result: ValidationResult) {
	if (this.IsRollupParent && (this.DiscountAmount !== 0 || this.ChargeAmount !== 0 || this.LineTax !== 0)) {
		result.Errors.push(new ValidationErrorInfo(
			"IsRollupParent",
			"Rollup parent order lines cannot have discount amounts, charge amounts, or line taxes applied directly.",
			this.IsRollupParent,
			ValidationErrorType.Failure
		));
	}
}', 'Rollup parent order lines cannot have direct discount amounts, charge amounts, or line taxes applied to them.', 'ValidateIsRollupParentAmounts', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '66D82C24-9C9F-4CD6-B019-53C20274AB00');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '19A9392E-65BA-4338-9E65-89EC10682FE4'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('30ca6250-d312-4390-92c1-ce393b8a31b9', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([NextSequenceNumber]>(0))', 'public ValidateNextSequenceNumberGreaterThanZero(result: ValidationResult) {
	if (this.NextSequenceNumber != null && this.NextSequenceNumber <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"NextSequenceNumber",
			"Next sequence number must be greater than 0.",
			this.NextSequenceNumber,
			ValidationErrorType.Failure
		));
	}
}', 'The next sequence number must be a positive number greater than zero to ensure proper sequence tracking.', 'ValidateNextSequenceNumberGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '19A9392E-65BA-4338-9E65-89EC10682FE4');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'AC09EE3B-5509-4B95-8E81-3A46411DA720'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('ff18e0b2-c6ce-45b2-b745-408e0929b115', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Attempts]>=(0))', 'public ValidateAttemptsNonNegative(result: ValidationResult) {
	if (this.Attempts != null && this.Attempts < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Attempts",
			"Attempts count cannot be negative.",
			this.Attempts,
			ValidationErrorType.Failure
		));
	}
}', 'The number of attempts must be zero or a positive number.', 'ValidateAttemptsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'AC09EE3B-5509-4B95-8E81-3A46411DA720');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'AAA87268-A880-44BA-AFFE-173A89FC1EEA'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('4b9bfc16-bf46-4d24-81b4-ef1b960f4d47', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Status]=''Delivered'' AND [DeliveredAt] IS NOT NULL OR [Status]<>''Delivered'' AND [DeliveredAt] IS NULL)', 'public ValidateDeliveredAtByStatus(result: ValidationResult) {
	if (this.Status === "Delivered" && this.DeliveredAt == null) {
		result.Errors.push(new ValidationErrorInfo(
			"DeliveredAt",
			"DeliveredAt timestamp must be provided when Status is ''Delivered''.",
			this.DeliveredAt,
			ValidationErrorType.Failure
		));
	} else if (this.Status !== "Delivered" && this.DeliveredAt != null) {
		result.Errors.push(new ValidationErrorInfo(
			"DeliveredAt",
			"DeliveredAt timestamp must be empty when Status is not ''Delivered''.",
			this.DeliveredAt,
			ValidationErrorType.Failure
		));
	}
}', 'Ensures that a delivery timestamp is recorded when an event status is ''Delivered'', and remains clear when the status is anything else.', 'ValidateDeliveredAtByStatus', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'AAA87268-A880-44BA-AFFE-173A89FC1EEA');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '154DCE03-C019-43B0-B293-1E6D93E303A2'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('87163298-b7f1-48e7-bae7-9c0d82e57058', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([EventType]=''OrderConfirmed'' AND [OrderHeaderID] IS NOT NULL OR [EventType]=''GrantStatusChanged'' AND [EntitlementGrantID] IS NOT NULL)', 'public ValidateEventTypeAndAssociatedIDs(result: ValidationResult) {
	const isOrderConfirmedValid = this.EventType === "OrderConfirmed" && this.OrderHeaderID != null;
	const isGrantStatusChangedValid = this.EventType === "GrantStatusChanged" && this.EntitlementGrantID != null;

	if (!isOrderConfirmedValid && !isGrantStatusChangedValid) {
		result.Errors.push(new ValidationErrorInfo(
			"EventType",
			"Events of type ''OrderConfirmed'' require an OrderHeaderID, and events of type ''GrantStatusChanged'' require an EntitlementGrantID.",
			this.EventType,
			ValidationErrorType.Failure
		));
	}
}', 'Events must be associated with the required reference ID for their type: OrderConfirmed events must include an OrderHeaderID, and GrantStatusChanged events must include an EntitlementGrantID.', 'ValidateEventTypeAndAssociatedIDs', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '154DCE03-C019-43B0-B293-1E6D93E303A2');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '7BF1E9A2-0623-43AD-B0F3-D8F2943A5DA2'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('c084cd62-6d16-4e8b-a1a9-d37123a6e417', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ExpiryMonth] IS NULL OR [ExpiryMonth]>=(1) AND [ExpiryMonth]<=(12))', 'public ValidateExpiryMonthRange(result: ValidationResult) {
	if (this.ExpiryMonth != null && (this.ExpiryMonth < 1 || this.ExpiryMonth > 12)) {
		result.Errors.push(new ValidationErrorInfo(
			"ExpiryMonth",
			"Expiry month must be between 1 and 12.",
			this.ExpiryMonth,
			ValidationErrorType.Failure
		));
	}
}', 'Expiry month must be a valid month number between 1 and 12 when provided.', 'ValidateExpiryMonthRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '7BF1E9A2-0623-43AD-B0F3-D8F2943A5DA2');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'CE97BF15-F7C6-4C50-A744-A89C714A4DDD'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('b1a8af2f-1e07-4605-9854-7fab1e0f88c3', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ReversesPaymentHeaderID] IS NULL AND [ReversalSource] IS NULL OR [ReversesPaymentHeaderID] IS NOT NULL AND [ReversalSource] IS NOT NULL)', 'public ValidateReversesPaymentHeaderIDAndReversalSource(result: ValidationResult) {
	if ((this.ReversesPaymentHeaderID == null && this.ReversalSource != null) || (this.ReversesPaymentHeaderID != null && this.ReversalSource == null)) {
		result.Errors.push(new ValidationErrorInfo(
			"ReversesPaymentHeaderID",
			"Both Reverses Payment Header ID and Reversal Source must be provided together when recording a payment reversal.",
			this.ReversesPaymentHeaderID,
			ValidationErrorType.Failure
		));
	}
}', 'When reversing a payment, both the reversed payment header ID and the reversal source must be specified together, or both must be left empty.', 'ValidateReversesPaymentHeaderIDAndReversalSource', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CE97BF15-F7C6-4C50-A744-A89C714A4DDD');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '1409B137-9DD6-4546-AE57-57303BCC0D68'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('70fef1ed-cb6e-4330-8642-ed385da36752', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([NetDays]>=(0))', 'public ValidateNetDaysGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.NetDays != null && this.NetDays < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"NetDays",
			"Net days must be greater than or equal to 0.",
			this.NetDays,
			ValidationErrorType.Failure
		));
	}
}', 'Net days must be greater than or equal to zero to ensure valid payment term durations.', 'ValidateNetDaysGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '1409B137-9DD6-4546-AE57-57303BCC0D68');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'B09B73AA-FC79-4382-88A3-02576657EFF3'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('26680c7a-6b03-41de-90d1-15f8cec22ee4', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([OrganizationID] IS NOT NULL AND [PersonID] IS NULL OR [OrganizationID] IS NULL AND [PersonID] IS NOT NULL)', 'public ValidateOrganizationIDOrPersonIDExclusivity(result: ValidationResult) {
	const hasOrg = this.OrganizationID != null;
	const hasPerson = this.PersonID != null;

	if (hasOrg === hasPerson) {
		result.Errors.push(new ValidationErrorInfo(
			"OrganizationID",
			"Either an Organization or a Person must be specified, but not both.",
			this.OrganizationID,
			ValidationErrorType.Failure
		));
	}
}', 'Requires that either an organization or a person is specified, but not both or neither.', 'ValidateOrganizationIDOrPersonIDExclusivity', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'B09B73AA-FC79-4382-88A3-02576657EFF3');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '9467356C-A3E3-4ACA-B611-348F801FA605'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('a00c99c6-e47a-4870-a3e6-1a53b79096d3', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([RenewalIncreasePercent] IS NULL OR [RenewalIncreasePercent]>=(0) AND [RenewalIncreasePercent]<=(100))', 'public ValidateRenewalIncreasePercentRange(result: ValidationResult) {
	if (this.RenewalIncreasePercent != null && (this.RenewalIncreasePercent < 0 || this.RenewalIncreasePercent > 100)) {
		result.Errors.push(new ValidationErrorInfo(
			"RenewalIncreasePercent",
			"Renewal increase percentage must be between 0 and 100.",
			this.RenewalIncreasePercent,
			ValidationErrorType.Failure
		));
	}
}', 'Renewal increase percentage must be between 0 and 100 when provided.', 'ValidateRenewalIncreasePercentRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '9467356C-A3E3-4ACA-B611-348F801FA605');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '450F19FA-C9AA-4AF2-9F69-5F039B471542'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('2a8c9fb4-3d9b-4d8e-b4b7-66045a15fdd8', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([AccessLeadHours] IS NULL OR [AccessLeadHours]>=(0))', 'public ValidateAccessLeadHours(result: ValidationResult) {
	if (this.AccessLeadHours != null && this.AccessLeadHours < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"AccessLeadHours",
			"Access lead hours must be greater than or equal to 0.",
			this.AccessLeadHours,
			ValidationErrorType.Failure
		));
	}
}', 'Access lead hours must be zero or a positive number when specified.', 'ValidateAccessLeadHours', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '450F19FA-C9AA-4AF2-9F69-5F039B471542');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '9D092635-F655-4EB3-B462-85BEDDF6C7E5'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('efda92cd-a86b-4458-bb6a-27494f2f394f', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ChoiceGroupKey] IS NULL AND [ChoiceOptionValue] IS NULL OR [ChoiceGroupKey] IS NOT NULL AND [ChoiceOptionValue] IS NOT NULL)', 'public ValidateChoiceGroupKeyAndChoiceOptionValueCoexistence(result: ValidationResult) {
	const hasGroupKey = this.ChoiceGroupKey != null && this.ChoiceGroupKey !== "";
	const hasOptionValue = this.ChoiceOptionValue != null && this.ChoiceOptionValue !== "";

	if (hasGroupKey !== hasOptionValue) {
		result.Errors.push(new ValidationErrorInfo(
			"ChoiceGroupKey",
			"Choice Group Key and Choice Option Value must either both be provided or both be left empty.",
			this.ChoiceGroupKey,
			ValidationErrorType.Failure
		));
	}
}', 'Choice group key and choice option value must either both be specified or both be left blank.', 'ValidateChoiceGroupKeyAndChoiceOptionValueCoexistence', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9D092635-F655-4EB3-B462-85BEDDF6C7E5');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '9D092635-F655-4EB3-B462-85BEDDF6C7E5'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('13aa5cca-162b-49a8-91d7-1eb9969249b4', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ValidityMode]<>''FixedDuration'' OR [ValidityDurationDays]>(0))', 'public ValidateValidityDurationDaysForFixedDuration(result: ValidationResult) {
	if (this.ValidityMode === ''FixedDuration'' && this.ValidityDurationDays != null && this.ValidityDurationDays <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"ValidityDurationDays",
			"Validity duration in days must be greater than 0 when validity mode is set to FixedDuration.",
			this.ValidityDurationDays,
			ValidationErrorType.Failure
		));
	}
}', 'When the validity mode is set to FixedDuration, the validity duration in days must be greater than zero.', 'ValidateValidityDurationDaysForFixedDuration', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9D092635-F655-4EB3-B462-85BEDDF6C7E5');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'DEC44BA1-0803-4DD2-8E56-CF36530AA6C3'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('48ee15ae-3188-40f6-9d45-b5962dd16ed7', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Applicability] IS NULL OR isjson([Applicability])=(1))', 'public ValidateApplicabilityJsonFormat(result: ValidationResult) {
	if (this.Applicability != null && this.Applicability.trim() !== "") {
		try {
			JSON.parse(this.Applicability);
		} catch (e) {
			result.Errors.push(new ValidationErrorInfo(
				"Applicability",
				"Applicability must be a valid JSON formatted string.",
				this.Applicability,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Applicability settings must be in a valid JSON format when provided.', 'ValidateApplicabilityJsonFormat', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'DEC44BA1-0803-4DD2-8E56-CF36530AA6C3');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '58018ECE-83EF-4E05-A9D0-2F7E47F9AF25'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('8a280627-b1b3-494b-a20c-0173714f2f2a', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ProductID] IS NOT NULL AND [ProductCategoryID] IS NULL OR [ProductID] IS NULL AND [ProductCategoryID] IS NOT NULL)', 'public ValidateProductOrCategoryExclusivity(result: ValidationResult) {
	const hasProduct = this.ProductID != null;
	const hasCategory = this.ProductCategoryID != null;

	if ((hasProduct && hasCategory) || (!hasProduct && !hasCategory)) {
		result.Errors.push(new ValidationErrorInfo(
			"ProductID",
			"Exactly one of Product or Product Category must be specified.",
			this.ProductID,
			ValidationErrorType.Failure
		));
	}
}', 'Each entry must be assigned to either a Product or a Product Category, but cannot be assigned to both or left unassigned.', 'ValidateProductOrCategoryExclusivity', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '58018ECE-83EF-4E05-A9D0-2F7E47F9AF25');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '2874EADB-83B8-4769-B5CB-79DC5D735B67'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('ebceadab-ce46-4e92-980d-f4c2d775aa6b', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([MaxQuantityPerLine] IS NULL OR [MaxQuantityPerLine]>=(1))', 'public ValidateMaxQuantityPerLineMinimum(result: ValidationResult) {
	if (this.MaxQuantityPerLine != null && this.MaxQuantityPerLine < 1) {
		result.Errors.push(new ValidationErrorInfo(
			"MaxQuantityPerLine",
			"Maximum quantity per line must be at least 1.",
			this.MaxQuantityPerLine,
			ValidationErrorType.Failure
		));
	}
}', 'Maximum quantity per line must be at least 1 if specified.', 'ValidateMaxQuantityPerLineMinimum', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '2874EADB-83B8-4769-B5CB-79DC5D735B67');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '572E3F4C-854E-48BC-B67D-5612876F22D1'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('51ceeb89-2f78-49cf-891a-60de635781fa', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([RenewalIncreasePercent] IS NULL OR [RenewalIncreasePercent]>=(0) AND [RenewalIncreasePercent]<=(100))', 'public ValidateRenewalIncreasePercentRange(result: ValidationResult) {
	if (this.RenewalIncreasePercent != null && (this.RenewalIncreasePercent < 0 || this.RenewalIncreasePercent > 100)) {
		result.Errors.push(new ValidationErrorInfo(
			"RenewalIncreasePercent",
			"Renewal increase percentage must be between 0 and 100.",
			this.RenewalIncreasePercent,
			ValidationErrorType.Failure
		));
	}
}', 'Renewal increase percentage must be between 0 and 100.', 'ValidateRenewalIncreasePercentRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '572E3F4C-854E-48BC-B67D-5612876F22D1');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '2AD377E1-E237-443C-B41B-CE5064361326'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('76d684be-d430-4d81-b82e-c229d0a4b6b1', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ProductID] IS NOT NULL AND [ProductCategoryID] IS NULL OR [ProductID] IS NULL AND [ProductCategoryID] IS NOT NULL)', 'public ValidateProductIDOrProductCategoryID(result: ValidationResult) {
	const hasProductID = this.ProductID != null;
	const hasProductCategoryID = this.ProductCategoryID != null;

	if (hasProductID === hasProductCategoryID) {
		result.Errors.push(new ValidationErrorInfo(
			"ProductID",
			"Specify either a Product or a Product Category, but not both or neither.",
			this.ProductID,
			ValidationErrorType.Failure
		));
	}
}', 'A record must be associated with either a product or a product category, but cannot have both or neither.', 'ValidateProductIDOrProductCategoryID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '2AD377E1-E237-443C-B41B-CE5064361326');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '91095F10-0D83-4181-B999-8BB91F0ACF97'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('8347a9ea-1447-4629-89af-fd60b087fb6b', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([DaysPerReferral]>(0))', 'public ValidateDaysPerReferralGreaterThanZero(result: ValidationResult) {
	if (this.DaysPerReferral != null && this.DaysPerReferral <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"DaysPerReferral",
			"Days per referral must be greater than 0.",
			this.DaysPerReferral,
			ValidationErrorType.Failure
		));
	}
}', 'Days per referral must be a positive number greater than zero.', 'ValidateDaysPerReferralGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '91095F10-0D83-4181-B999-8BB91F0ACF97');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'A5D859FB-5DB7-46AA-8AD1-BA281609CA10'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('d9e08716-2583-43aa-8286-c3e0dc41ff48', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([MaxConcessionPctOfContract]>=(0) AND [MaxConcessionPctOfContract]<=(1))', 'public ValidateMaxConcessionPctOfContractRange(result: ValidationResult) {
	if (this.MaxConcessionPctOfContract != null && (this.MaxConcessionPctOfContract < 0 || this.MaxConcessionPctOfContract > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"MaxConcessionPctOfContract",
			"Maximum concession percentage of contract must be between 0 and 1 (0% to 100%).",
			this.MaxConcessionPctOfContract,
			ValidationErrorType.Failure
		));
	}
}', 'Maximum concession percentage of contract must be between 0 and 1 (representing 0% to 100%).', 'ValidateMaxConcessionPctOfContractRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'A5D859FB-5DB7-46AA-8AD1-BA281609CA10');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '20E2A800-FC7A-4A79-8D16-DF9646F13B1E'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('ad9f190d-3d33-4cbe-9534-3fab2d06c0ad', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([MaxConcessionValue]>=(0))', 'public ValidateMaxConcessionValueMinimum(result: ValidationResult) {
	if (this.MaxConcessionValue != null && this.MaxConcessionValue < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"MaxConcessionValue",
			"Max Concession Value must be greater than or equal to 0.",
			this.MaxConcessionValue,
			ValidationErrorType.Failure
		));
	}
}', 'Max concession value must be a non-negative amount.', 'ValidateMaxConcessionValueMinimum', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '20E2A800-FC7A-4A79-8D16-DF9646F13B1E');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'B7B46B1E-48DD-409E-8C4B-2549C02DB7EB'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('343d629f-34f2-47e2-a837-ad40dd04a0f3', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([MaxTermExtensionDays]>=(0))', 'public ValidateMaxTermExtensionDaysMinimum(result: ValidationResult) {
	if (this.MaxTermExtensionDays != null && this.MaxTermExtensionDays < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"MaxTermExtensionDays",
			"Maximum term extension days must be greater than or equal to 0.",
			this.MaxTermExtensionDays,
			ValidationErrorType.Failure
		));
	}
}', 'Maximum term extension days must be greater than or equal to 0.', 'ValidateMaxTermExtensionDaysMinimum', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'B7B46B1E-48DD-409E-8C4B-2549C02DB7EB');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'A64AE7A5-F507-4295-BC11-D402A8D50BE6'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('8ece5e81-8236-4d1f-961b-3834c91c5ba2', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([InitialAmount]>(0))', 'public ValidateInitialAmountGreaterThanZero(result: ValidationResult) {
	if (this.InitialAmount != null && this.InitialAmount <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"InitialAmount",
			"Initial amount must be greater than zero.",
			this.InitialAmount,
			ValidationErrorType.Failure
		));
	}
}', 'Initial amount must be greater than zero to ensure valid financial record initialization.', 'ValidateInitialAmountGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'A64AE7A5-F507-4295-BC11-D402A8D50BE6');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'D267EFA5-B6D5-4E29-B104-FB8CE0956253'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('cf8a2f3c-399a-4459-86d9-4427ceda8631', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([Amount]<>(0))', 'public ValidateAmountNotZero(result: ValidationResult) {
	if (this.Amount === 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Amount",
			"Transaction amount cannot be zero.",
			this.Amount,
			ValidationErrorType.Failure
		));
	}
}', 'Transaction amount cannot be zero.', 'ValidateAmountNotZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'D267EFA5-B6D5-4E29-B104-FB8CE0956253');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '502F8C1A-3AAD-4B69-815E-FC34A41B899D'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('51354843-8b47-4310-abe4-cce7cc0b4647', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '(len(ltrim(rtrim([Code])))>(0))', 'public ValidateCodeNotEmpty(result: ValidationResult) {
	if (this.Code != null && this.Code.trim().length === 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Code",
			"Code cannot be empty or contain only whitespace.",
			this.Code,
			ValidationErrorType.Failure
		));
	}
}', 'Code cannot be empty or consist solely of whitespace characters to ensure every entity has a valid identifier.', 'ValidateCodeNotEmpty', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '502F8C1A-3AAD-4B69-815E-FC34A41B899D');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '774CDE66-B6FB-40E0-9BC2-5444C0D63A0C'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('c7e9d300-3e9f-4559-91c8-d4a8efca74ad', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '(len(ltrim(rtrim([Name])))>(0))', 'public ValidateNameNotEmpty(result: ValidationResult) {
	if (this.Name != null && this.Name.trim().length === 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Name",
			"Name cannot be blank or contain only whitespace.",
			this.Name,
			ValidationErrorType.Failure
		));
	}
}', 'Name cannot be empty or consist only of whitespace characters.', 'ValidateNameNotEmpty', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '774CDE66-B6FB-40E0-9BC2-5444C0D63A0C');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'CADD3073-B726-4DAE-970F-F44CA09D70D4'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('0cbf2f9c-b6d0-47b1-b2a3-bae9d793243a', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([TermNumber]>(0))', 'public ValidateTermNumberGreaterThanZero(result: ValidationResult) {
	if (this.TermNumber !== null && this.TermNumber <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"TermNumber",
			"Term number must be greater than 0.",
			this.TermNumber,
			ValidationErrorType.Failure
		));
	}
}', 'Term number must be greater than zero to ensure valid sequence tracking for subscription terms.', 'ValidateTermNumberGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'CADD3073-B726-4DAE-970F-F44CA09D70D4');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '4BCD5F45-B2BB-494E-9880-18FCB644C952'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('698f51e1-efa7-44bb-9b38-afc1349629bb', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([RenewalIncreasePercent] IS NULL OR [RenewalIncreasePercent]>=(0) AND [RenewalIncreasePercent]<=(100))', 'public ValidateRenewalIncreasePercentRange(result: ValidationResult) {
	if (this.RenewalIncreasePercent != null && (this.RenewalIncreasePercent < 0 || this.RenewalIncreasePercent > 100)) {
		result.Errors.push(new ValidationErrorInfo(
			"RenewalIncreasePercent",
			"Renewal increase percentage must be between 0 and 100.",
			this.RenewalIncreasePercent,
			ValidationErrorType.Failure
		));
	}
}', 'Renewal increase percentage must be between 0 and 100 when specified.', 'ValidateRenewalIncreasePercentRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '4BCD5F45-B2BB-494E-9880-18FCB644C952');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = 'E9B55146-3351-440C-AD47-FD4DE05BDA05'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('13633f46-2f16-41ee-8f5c-173f72899101', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([MigratesFromSubscriptionID] IS NULL OR [MigratesFromSubscriptionID]<>[ID])', 'public ValidateMigratesFromSubscriptionIDNotEqualToID(result: ValidationResult) {
	if (this.MigratesFromSubscriptionID != null && this.MigratesFromSubscriptionID === this.ID) {
		result.Errors.push(new ValidationErrorInfo(
			"MigratesFromSubscriptionID",
			"A subscription cannot migrate from itself.",
			this.MigratesFromSubscriptionID,
			ValidationErrorType.Failure
		));
	}
}', 'A subscription cannot migrate from itself; the source subscription must be a different subscription.', 'ValidateMigratesFromSubscriptionIDNotEqualToID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E9B55146-3351-440C-AD47-FD4DE05BDA05');
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
/* Generated Validation Functions for MJ_BizApps_Orders: Checkout Session Steps */
-- CHECK constraint for MJ_BizApps_Orders: Checkout Session Steps: Field: Attempts was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function;


-- ===================== Other =====================

/* spUpdate Permissions for MJ_BizApps_Orders: Order Headers */
