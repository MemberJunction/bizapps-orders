-- =============================================================================================
-- PostgreSQL counterpart of V202610131502__v5.32.x__SalesRule_ConcessionTiers.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) output, finished by hand:
--   * Tables, columns, constraints, indexes, views, data and grants are the converter's.
--   * CodeGen's CRUD procedures (spCreate/spUpdate/spDelete) and its __mj_UpdatedAt triggers are
--     NOT here: the converter cannot translate T-SQL procedures or triggers, and this repository
--     has no PostgreSQL baseline to run MJ CodeGen against. A PostgreSQL host runs `mj codegen`
--     after installing, which generates them natively. The converter's notes for them remain,
--     fully commented out.
--   * 10 string values restored verbatim from the T-SQL: the converter re-indents text inside string
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
-- V202610131502 — Concession approval tiers on SalesRule (#308)
-- =============================================================================
-- A concession outside the requester's SalesAuthority is decided by a holder of
-- one role: the ApprovalRequiredRoleID of the active ConcessionLimit rule. One
-- inside it is approved on save. Two things a policy may require could not be
-- configured:
--
--   - two approval tiers: one approver below a set of thresholds, a more senior
--     approver at or above them; and
--   - a sign-off below the thresholds: a second person approves a concession
--     even when the requester's own authority covers it.
--
-- What this file does: SalesRule gains, for ConcessionLimit rules only,
--   1. ConcessionTier — the rule's rank. Several active ConcessionLimit rules
--      are tiers; a concession goes to the highest tier whose thresholds it
--      meets. NULL ranks as 0.
--   2. MinConcessionValue, MinConcessionPctOfContract, MinTermExtensionDays —
--      the thresholds that route a concession to the tier, the counterparts of
--      SalesAuthority's MaxConcessionValue, MaxConcessionPctOfContract and
--      MaxTermExtensionDays. Meeting any one set threshold routes it there. A
--      rule with none set takes every concession, which is how the single
--      ConcessionLimit rule behaved before this migration.
--   3. RequiresDecisionWithinAuthority — the tier decides a concession routed
--      to it even when the requester's authority covers it, and the requester
--      cannot decide it themselves.
--
-- The tier that decides a concession is already stamped on it:
-- OrderConcession.SalesRuleID names the rule, and each tier is its own rule.
--
-- Defaults leave every existing row as it was: no tier, no thresholds, no
-- sign-off. A CHECK keeps the new columns empty on other rule types.
--
-- RUN CODEGEN AFTER THIS so the base view, CRUD procs and entity subclass pick
-- up the columns.
-- =============================================================================

ALTER TABLE __mj_BizAppsOrders."SalesRule"
 ADD COLUMN IF NOT EXISTS "ConcessionTier" INTEGER NULL
        CONSTRAINT "CK_SalesRule_ConcessionTier" CHECK ("ConcessionTier" >= 0),
 ADD COLUMN IF NOT EXISTS "MinConcessionValue" DECIMAL(18,2) NULL
        CONSTRAINT "CK_SalesRule_MinConcessionValue" CHECK ("MinConcessionValue" >= 0),
 ADD COLUMN IF NOT EXISTS "MinConcessionPctOfContract" DECIMAL(7,4) NULL
        CONSTRAINT "CK_SalesRule_MinConcessionPctOfContract" CHECK ("MinConcessionPctOfContract" >= 0 AND "MinConcessionPctOfContract" <= 1),
 ADD COLUMN IF NOT EXISTS "MinTermExtensionDays" INTEGER NULL
        CONSTRAINT "CK_SalesRule_MinTermExtensionDays" CHECK ("MinTermExtensionDays" >= 0),
 ADD COLUMN IF NOT EXISTS "RequiresDecisionWithinAuthority" BOOLEAN NOT NULL
        CONSTRAINT "DF_SalesRule_RequiresDecisionWithinAuthority" DEFAULT (FALSE),
 ADD CONSTRAINT "CK_SalesRule_ConcessionTierColumns" CHECK (
        "RuleType" = 'ConcessionLimit'
        OR ("ConcessionTier" IS NULL
            AND "MinConcessionValue" IS NULL
            AND "MinConcessionPctOfContract" IS NULL
            AND "MinTermExtensionDays" IS NULL
            AND "RequiresDecisionWithinAuthority" = 0)
    ) NOT VALID;


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_BizAppsOrders';
  v_target_name CONSTANT TEXT := 'vwSalesRules';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwSalesRules"
AS SELECT
    s.*,
    "MJRole_ApprovalRequiredRoleID"."Name" AS "ApprovalRequiredRole"
FROM
    __mj_BizAppsOrders."SalesRule" AS s
LEFT OUTER JOIN
    __mj."Role" AS "MJRole_ApprovalRequiredRoleID"
  ON
    s."ApprovalRequiredRoleID" = "MJRole_ApprovalRequiredRoleID"."ID"$vsql$;
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
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spCreateSalesRule]
--     @ID UUID = NULL,
--     @Name VARCHAR(200),
--     @RuleType VARCHAR(40),
--     @Scope VARCHAR(40) = NULL,
--     @ScopeReferenceID_Cl...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spUpdateSalesRule]
--     @ID UUID,
--     @Name VARCHAR(200) = NULL,
--     @RuleType VARCHAR(40) = NULL,
--     @Scope VARCHAR(40) = NULL,
--     @ScopeReferen...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsOrders].[spDeleteSalesRule]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsOrders].[SalesRule]
--     WHERE
--         [ID] = @ID
-- 
-- ...


-- ===================== Triggers =====================

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsOrders].trgUpdateSalesRule
-- ON "__mj_BizAppsOrders"."SalesRule"
-- AFTER UPDATE
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     UPDATE
--         "__mj_BizAppsOrders"."SalesRule"
--     SET
       


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1254bd51-591a-44cb-adc2-53c22d0431d5' OR ("EntityID" = '389EA03A-52CC-4BCA-859C-82356777E76E' AND "Name" = 'ConcessionTier')
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
        '1254bd51-591a-44cb-adc2-53c22d0431d5',
        '389EA03A-52CC-4BCA-859C-82356777E76E', -- "Entity": "MJ_BizApps_Orders": "Sales" "Rules"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '389EA03A-52CC-4BCA-859C-82356777E76E'),
        'ConcessionTier',
        'Concession Tier',
        'ConcessionLimit rules only: this tier''s rank. A concession goes to the highest-ranked active ConcessionLimit rule whose thresholds it meets; two active rules may not share a rank. NULL ranks as 0.',
        'INTEGER',
        4,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '70308f40-68f5-4f8c-bd2b-9472a600d999' OR ("EntityID" = '389EA03A-52CC-4BCA-859C-82356777E76E' AND "Name" = 'MinConcessionValue')
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
        '70308f40-68f5-4f8c-bd2b-9472a600d999',
        '389EA03A-52CC-4BCA-859C-82356777E76E', -- "Entity": "MJ_BizApps_Orders": "Sales" "Rules"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '389EA03A-52CC-4BCA-859C-82356777E76E'),
        'MinConcessionValue',
        'Min Concession Value',
        'ConcessionLimit rules only: a concession valued at or above this, in currency, meets this tier. NULL sets no value threshold.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '55707b49-fceb-49d5-9a71-669181bb135b' OR ("EntityID" = '389EA03A-52CC-4BCA-859C-82356777E76E' AND "Name" = 'MinConcessionPctOfContract')
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
        '55707b49-fceb-49d5-9a71-669181bb135b',
        '389EA03A-52CC-4BCA-859C-82356777E76E', -- "Entity": "MJ_BizApps_Orders": "Sales" "Rules"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '389EA03A-52CC-4BCA-859C-82356777E76E'),
        'MinConcessionPctOfContract',
        'Min Concession Pct Of Contract',
        'ConcessionLimit rules only: a concession whose order''s concessions, as a share of its net total (0.05 = 5%), are at or above this meets this tier. NULL sets no share threshold.',
        'decimal',
        5,
        7,
        4,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8e1f8bce-86ac-43ec-b16c-1b060e9b0f07' OR ("EntityID" = '389EA03A-52CC-4BCA-859C-82356777E76E' AND "Name" = 'MinTermExtensionDays')
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
        '8e1f8bce-86ac-43ec-b16c-1b060e9b0f07',
        '389EA03A-52CC-4BCA-859C-82356777E76E', -- "Entity": "MJ_BizApps_Orders": "Sales" "Rules"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '389EA03A-52CC-4BCA-859C-82356777E76E'),
        'MinTermExtensionDays',
        'Min Term Extension Days',
        'ConcessionLimit rules only: a concession that changes a term''s dates by this many days or more meets this tier. NULL sets no term-date threshold.',
        'INTEGER',
        4,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3e51cf5e-b6c5-49d7-93a0-e2f9e2468fb0' OR ("EntityID" = '389EA03A-52CC-4BCA-859C-82356777E76E' AND "Name" = 'RequiresDecisionWithinAuthority')
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
        '3e51cf5e-b6c5-49d7-93a0-e2f9e2468fb0',
        '389EA03A-52CC-4BCA-859C-82356777E76E', -- "Entity": "MJ_BizApps_Orders": "Sales" "Rules"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '389EA03A-52CC-4BCA-859C-82356777E76E'),
        'RequiresDecisionWithinAuthority',
        'Requires Decision Within Authority',
        'ConcessionLimit rules only: when 1, a concession routed to this tier is Pending even when the requester''s SalesAuthority covers it, and the requester cannot decide it. When 0, a concession within authority is Approved on save.',
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

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Limits',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '1254BD51-591A-44CB-ADC2-53C22D0431D5';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Rules.MinConcessionValue

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Limits',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Minimum Concession Value'
WHERE 
   "ID" = '70308F40-68F5-4F8C-BD2B-9472A600D999';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Rules.MinConcessionPctOfContract

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Limits',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Minimum Concession % of Contract'
WHERE 
   "ID" = '55707B49-FCEB-49D5-9A71-669181BB135B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Rules.MinTermExtensionDays

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Limits',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Minimum Term Extension (Days)'
WHERE 
   "ID" = '8E1F8BCE-86AC-43EC-B16C-1B060E9B0F07';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Rules.RequiresDecisionWithinAuthority

UPDATE __mj."EntityField"
SET 
   "Category" = 'Concession Limits',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '3E51CF5E-B6C5-49D7-93A0-E2F9E2468FB0';

/* Generated Validation Functions for MJ_BizApps_Orders: Sales Rules */
-- CHECK constraint for MJ_BizApps_Orders: Sales Rules: Field: ConcessionTier was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '1254BD51-591A-44CB-ADC2-53C22D0431D5'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('6bb6c116-a10e-4392-b085-a97ba79e55c9', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([ConcessionTier]>=(0))', 'public ValidateConcessionTierGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.ConcessionTier != null && this.ConcessionTier < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"ConcessionTier",
			"Concession tier must be greater than or equal to 0.",
			this.ConcessionTier,
			ValidationErrorType.Failure
		));
	}
}', 'Concession tier must be greater than or equal to 0 to ensure that negative tier values are not entered.', 'ValidateConcessionTierGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '1254BD51-591A-44CB-ADC2-53C22D0431D5');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '55707B49-FCEB-49D5-9A71-669181BB135B'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('98cc712a-33e0-4562-af92-1023bd978750', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([MinConcessionPctOfContract]>=(0) AND [MinConcessionPctOfContract]<=(1))', 'public ValidateMinConcessionPctOfContractRange(result: ValidationResult) {
	if (this.MinConcessionPctOfContract != null && (this.MinConcessionPctOfContract < 0 || this.MinConcessionPctOfContract > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"MinConcessionPctOfContract",
			"The minimum concession percentage of the contract must be between 0 and 1 (inclusive).",
			this.MinConcessionPctOfContract,
			ValidationErrorType.Failure
		));
	}
}', 'The minimum concession percentage of the contract must be a value between 0 and 1 (inclusive), representing a valid percentage from 0% to 100%.', 'ValidateMinConcessionPctOfContractRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '55707B49-FCEB-49D5-9A71-669181BB135B');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '70308F40-68F5-4F8C-BD2B-9472A600D999'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('bd6649a9-e847-44f5-8bb8-eee6cd082651', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([MinConcessionValue]>=(0))', 'public ValidateMinConcessionValueGreaterThanOrEqualToZero(result: ValidationResult) {
    if (this.MinConcessionValue != null && this.MinConcessionValue < 0) {
        result.Errors.push(new ValidationErrorInfo(
            "MinConcessionValue",
            "Minimum concession value must be greater than or equal to 0.",
            this.MinConcessionValue,
            ValidationErrorType.Failure
        ));
    }
}', 'The minimum concession value must be greater than or equal to zero to prevent negative concession amounts from being entered.', 'ValidateMinConcessionValueGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '70308F40-68F5-4F8C-BD2B-9472A600D999');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '8E1F8BCE-86AC-43EC-B16C-1B060E9B0F07'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('5f5cce95-d6b6-494a-a579-701f15631a89', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([MinTermExtensionDays]>=(0))', 'public ValidateMinTermExtensionDaysGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.MinTermExtensionDays != null && this.MinTermExtensionDays < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"MinTermExtensionDays",
			"Minimum term extension days must be greater than or equal to 0.",
			this.MinTermExtensionDays,
			ValidationErrorType.Failure
		));
	}
}', 'The minimum term extension days must be a non-negative number (0 or greater) to ensure valid extension periods.', 'ValidateMinTermExtensionDaysGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '8E1F8BCE-86AC-43EC-B16C-1B060E9B0F07');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."GeneratedCode" WHERE "CategoryID" = (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators') AND "LinkedEntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "LinkedRecordPrimaryKey" = '389EA03A-52CC-4BCA-859C-82356777E76E'
    ) THEN
        INSERT INTO __mj."GeneratedCode" ("ID", "CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
        VALUES ('15c650b2-fe41-4e4d-a278-512791b6a3ad', (SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([RuleType]=''ConcessionLimit'' OR [ConcessionTier] IS NULL AND [MinConcessionValue] IS NULL AND [MinConcessionPctOfContract] IS NULL AND [MinTermExtensionDays] IS NULL AND [RequiresDecisionWithinAuthority]=(0))', 'public ValidateConcessionFieldsByRuleType(result: ValidationResult) {
	if (this.RuleType !== "ConcessionLimit") {
		if (this.ConcessionTier != null ||
			this.MinConcessionValue != null ||
			this.MinConcessionPctOfContract != null ||
			this.MinTermExtensionDays != null ||
			this.RequiresDecisionWithinAuthority === true) {
			
			result.Errors.push(new ValidationErrorInfo(
				"RuleType",
				"Concession-specific fields and ''Requires Decision Within Authority'' can only be defined when Rule Type is ''ConcessionLimit''.",
				this.RuleType,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Ensures that concession-specific parameters (such as Concession Tier, Min Concession Value, Min Concession % of Contract, Min Term Extension Days, and Requires Decision Within Authority) are only specified when the Rule Type is ''ConcessionLimit''.', 'ValidateConcessionFieldsByRuleType', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '389EA03A-52CC-4BCA-859C-82356777E76E');
    END IF;
END $$;


-- ===================== Grants =====================

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwSalesRules" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwSalesRules" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwSalesRules" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwSalesRules" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Orders: Sales Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Rules
-- Item: Permissions for vwSalesRules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwSalesRules" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwSalesRules" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwSalesRules" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwSalesRules" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Orders: Sales Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Rules
-- Item: spCreateSalesRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SalesRule
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSalesRule" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSalesRule" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSalesRule" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Orders: Sales Rules */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSalesRule" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSalesRule" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spCreateSalesRule" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Orders: Sales Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Rules
-- Item: spUpdateSalesRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SalesRule
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSalesRule" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSalesRule" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSalesRule" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSalesRule" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSalesRule" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spUpdateSalesRule" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Orders: Sales Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Rules
-- Item: spDeleteSalesRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SalesRule
------------------------------------------------------------;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSalesRule" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSalesRule" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSalesRule" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Orders: Sales Rules */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSalesRule" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSalesRule" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsOrders."spDeleteSalesRule" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set categories for 5 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Rules.ConcessionTier;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."SalesRule"."ConcessionTier" IS 'ConcessionLimit rules only: this tier''s rank. A concession goes to the highest-ranked active ConcessionLimit rule whose thresholds it meets; two active rules may not share a rank. NULL ranks as 0.';

COMMENT ON COLUMN __mj_BizAppsOrders."SalesRule"."MinConcessionValue" IS 'ConcessionLimit rules only: a concession valued at or above this, in currency, meets this tier. NULL sets no value threshold.';

COMMENT ON COLUMN __mj_BizAppsOrders."SalesRule"."MinConcessionPctOfContract" IS 'ConcessionLimit rules only: a concession whose order''s concessions, as a share of its net total (0.05 = 5%), are at or above this meets this tier. NULL sets no share threshold.';

COMMENT ON COLUMN __mj_BizAppsOrders."SalesRule"."MinTermExtensionDays" IS 'ConcessionLimit rules only: a concession that changes a term''s dates by this many days or more meets this tier. NULL sets no term-date threshold.';

COMMENT ON COLUMN __mj_BizAppsOrders."SalesRule"."RequiresDecisionWithinAuthority" IS 'ConcessionLimit rules only: when 1, a concession routed to this tier is Pending even when the requester''s SalesAuthority covers it, and the requester cannot decide it. When 0, a concession within authority is Approved on save.';


-- ===================== Other =====================

-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen 6.1.5 against a database built from migrations alone,
--   with the hand-authored DDL above applied. Contains the five new field
--   registrations on Sales Rules, their categories, the rebuilt view, CRUD procs
--   and grants, and the validators for the new CHECK constraints.
--
--   Left out, because this change does not touch them: the run's rebuild of the
--   Order Headers view and procs and its address latitude/longitude field rows,
--   value-list rows for other entities, validators regenerated for other
--   entities, and the unchanged FK index. Also left out: the run's rewrite of the
--   Sales Rules FieldCategoryInfo / FieldCategoryIcons settings, which replaced
--   the four existing categories with the new one (MemberJunction/MJ#5369);
--   the existing settings stay as they are.
--
-- =============================================================================

/* SQL text to insert 5 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Sales Rules */
