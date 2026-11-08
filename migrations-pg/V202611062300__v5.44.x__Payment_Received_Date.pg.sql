-- =============================================================================================
-- PostgreSQL counterpart of V202611062300__v5.44.x__Payment_Received_Date.sql
-- =============================================================================================
-- Written by hand in PL/pgSQL from the T-SQL (the converter passes T-SQL triggers through
-- untranslated). The column is added as the T-SQL adds it; the trigger function is replaced whole
-- from V202610091200 with PaymentDate taken out of 51005 and the new check 51033, and the triggers
-- already bound to it (update and delete) pick it up unchanged. See the T-SQL file for why
-- (bc-aidp-next-golive#448). LinkedRecordID is compared in lower case, the form a uuid takes as text.
-- The CodeGen half below the banner is `mj sql-convert --from tsql --to postgres --schema
-- __mj_BizAppsOrders` (MJ CLI 6.1.6) output of the T-SQL file's, finished by hand as for
-- V202611061740: CodeGen's CRUD procedures and its __mj_UpdatedAt trigger are not here (the
-- converter cannot translate them; a PostgreSQL host runs `mj codegen`, which generates them
-- natively) and its notes for them are fully commented out, and the EntityField insert writes
-- TRUE/FALSE for its BOOLEAN columns.
-- =============================================================================================

ALTER TABLE __mj_BizAppsOrders."OrderHeader"
    ADD COLUMN "InitialPaymentReceivedDate" DATE NULL;

COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeader"."InitialPaymentReceivedDate" IS
    'The day the initial payment''s money arrived, when it differs from the order''s date (for example a wire received before the order was entered). The payment created at confirm is dated from this day, and from OrderDate when it is NULL. Read only at confirm; changing it afterwards does not move the payment, whose date finance corrects on the payment itself.';

CREATE OR REPLACE FUNCTION __mj_BizAppsOrders."fn_trg_PaymentHeader_ImmutableAfterCapture"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- DELETE: block once captured+ (Pending/Failed payments may be deleted)
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM deleted WHERE "Status" IN ('Captured','Refunded','Disputed')) THEN
            RAISE EXCEPTION 'Payment cannot be deleted once Captured. Use a reversal payment (Refund/Chargeback) instead.'
                USING DETAIL = 'error 51004';
        END IF;
        RETURN NULL;
    END IF;

    -- UPDATE: frozen financial fields once the PREVIOUS status was Captured+
    -- (the capture transition itself may set them in the same statement).
    -- PaymentDate is checked separately below (51033).
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."Status" IN ('Captured','Refunded','Disputed')
          AND (
            i."Amount"               <> d."Amount"               OR
            i."ProcessingFeeAmount"  <> d."ProcessingFeeAmount"  OR
            COALESCE(i."NetAmount", 0) <> COALESCE(d."NetAmount", 0) OR
            i."PaymentTypeID"        <> d."PaymentTypeID"        OR
            i."ReceivingCompanyID"   <> d."ReceivingCompanyID"   OR
            COALESCE(i."BillToOrganizationID", '00000000-0000-0000-0000-000000000000') <> COALESCE(d."BillToOrganizationID", '00000000-0000-0000-0000-000000000000')
         OR COALESCE(i."BillToPersonID", '00000000-0000-0000-0000-000000000000') <> COALESCE(d."BillToPersonID", '00000000-0000-0000-0000-000000000000')
          )
    ) THEN
        RAISE EXCEPTION 'Payment financial fields (Amount/Fees/PaymentType/ReceivingCompanyID/Customer) are frozen once Captured. Use a reversal payment.'
            USING DETAIL = 'error 51005';
    END IF;

    -- PaymentDate: a captured payment's date moves only while every journal entry
    -- booked from it or its allocations is still Pending and in no batch.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."Status" IN ('Captured','Refunded','Disputed')
          AND i."PaymentDate" <> d."PaymentDate"
          AND EXISTS (
              SELECT 1
              FROM __mj_BizAppsAccounting."JournalEntry" je
              WHERE (je."Status" <> 'Pending' OR je."JournalEntryBatchID" IS NOT NULL)
                AND (lower(je."LinkedRecordID") = d."ID"::text
                     OR lower(je."LinkedRecordID") IN (
                         SELECT pl."ID"::text
                         FROM __mj_BizAppsOrders."PaymentLine" pl
                         WHERE pl."PaymentHeaderID" = d."ID"))
          )
    ) THEN
        RAISE EXCEPTION 'Payment.PaymentDate cannot change once any of the payment''s journal entries is batched or posted. Cancel the batch first, or use a reversal payment.'
            USING DETAIL = 'error 51033';
    END IF;

    -- JournalEntryID: never cleared or replaced once set (any status)
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."JournalEntryID" IS NOT NULL
          AND (i."JournalEntryID" IS NULL OR i."JournalEntryID" <> d."JournalEntryID")
    ) THEN
        RAISE EXCEPTION 'Payment.JournalEntryID cannot be cleared or replaced once set. Corrections happen via a reversal payment.'
            USING DETAIL = 'error 51006';
    END IF;

    -- Status may not regress out of a terminal/locked state
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE (d."Status" = 'Captured'  AND i."Status" IN ('Pending','Failed'))
           OR (d."Status" = 'Refunded'  AND i."Status" <> 'Refunded')
           OR (d."Status" = 'Disputed'  AND i."Status" NOT IN ('Disputed','Refunded'))
    ) THEN
        RAISE EXCEPTION 'Payment.Status cannot regress (Captured may only advance to Refunded/Disputed; Refunded is terminal).'
            USING DETAIL = 'error 51007';
    END IF;

    RETURN NULL;
END;
$fn$;


-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
-- =============================================================================


-- ===================== DDL: Tables, PKs, Indexes =====================

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

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_ApprovalTaskID" ON __mj_BizAppsOrders."OrderHeader" ("ApprovalTaskID");

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
    "mjBizAppsCommonAddress_BillToAddressID"."DisplayName" AS "BillToAddress",
    "mjBizAppsCommonAddress_ShipToAddressID"."DisplayName" AS "ShipToAddress",
    "mjBizAppsCommonOrganization_ShipToOrganizationID"."Name" AS "ShipToOrganization",
    "mjBizAppsCommonPerson_ShipToPersonID"."DisplayName" AS "ShipToPerson",
    "mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID"."Name" AS "PaymentTermsType",
    "mjBizAppsOrdersPaymentType_InitialPaymentTypeID"."Name" AS "InitialPaymentType",
    "mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID"."Last4" AS "InitialPaymentDetail",
    "MJUser_PostedByUserID"."Name" AS "PostedByUser",
    "mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID"."OrderNumber" AS "ReversesOrderHeader",
    "mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID"."Name" AS "SourceCheckoutWidget",
    "MJUser_ConfirmedByUserID"."Name" AS "ConfirmedByUser",
    ${mjSchema}_emb_BillToAddressID."Latitude" AS "${mjSchema}_Latitude_BillToAddressID",
    ${mjSchema}_emb_BillToAddressID."Longitude" AS "${mjSchema}_Longitude_BillToAddressID",
    ${mjSchema}_emb_ShipToAddressID."Latitude" AS "${mjSchema}_Latitude_ShipToAddressID",
    ${mjSchema}_emb_ShipToAddressID."Longitude" AS "${mjSchema}_Longitude_ShipToAddressID"
FROM
    __mj_BizAppsOrders."OrderHeader" AS o
INNER JOIN
    ${mjSchema}."Company" AS "MJCompany_CompanyID"
  ON
    o."CompanyID" = "MJCompany_CompanyID"."ID"
LEFT OUTER JOIN
    ${mjSchema}_BizAppsCommon."Person" AS "mjBizAppsCommonPerson_BillToPersonID"
  ON
    o."BillToPersonID" = "mjBizAppsCommonPerson_BillToPersonID"."ID"
LEFT OUTER JOIN
    ${mjSchema}_BizAppsCommon."Organization" AS "mjBizAppsCommonOrganization_BillToOrganizationID"
  ON
    o."BillToOrganizationID" = "mjBizAppsCommonOrganization_BillToOrganizationID"."ID"
LEFT OUTER JOIN
    ${mjSchema}."User" AS "MJUser_SalesRepUserID"
  ON
    o."SalesRepUserID" = "MJUser_SalesRepUserID"."ID"
LEFT OUTER JOIN
    ${mjSchema}_BizAppsCommon."Address" AS "mjBizAppsCommonAddress_BillToAddressID"
  ON
    o."BillToAddressID" = "mjBizAppsCommonAddress_BillToAddressID"."ID"
LEFT OUTER JOIN
    ${mjSchema}_BizAppsCommon."Address" AS "mjBizAppsCommonAddress_ShipToAddressID"
  ON
    o."ShipToAddressID" = "mjBizAppsCommonAddress_ShipToAddressID"."ID"
LEFT OUTER JOIN
    ${mjSchema}_BizAppsCommon."Organization" AS "mjBizAppsCommonOrganization_ShipToOrganizationID"
  ON
    o."ShipToOrganizationID" = "mjBizAppsCommonOrganization_ShipToOrganizationID"."ID"
LEFT OUTER JOIN
    ${mjSchema}_BizAppsCommon."Person" AS "mjBizAppsCommonPerson_ShipToPersonID"
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
    ${mjSchema}."User" AS "MJUser_PostedByUserID"
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
    ${mjSchema}."User" AS "MJUser_ConfirmedByUserID"
  ON
    o."ConfirmedByUserID" = "MJUser_ConfirmedByUserID"."ID"
LEFT OUTER JOIN
    ${mjSchema}_BizAppsCommon."Address" AS ${mjSchema}_emb_BillToAddressID
  ON
    o."BillToAddressID" = ${mjSchema}_emb_BillToAddressID."ID"
LEFT OUTER JOIN
    ${mjSchema}_BizAppsCommon."Address" AS ${mjSchema}_emb_ShipToAddressID
  ON
    o."ShipToAddressID" = ${mjSchema}_emb_ShipToAddressID."ID"$vsql$;
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
--


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ${mjSchema}."EntityField" WHERE "ID" = '853f1f38-bfbf-44ab-874c-14ea3b9c7fc7' OR ("EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND "Name" = 'InitialPaymentReceivedDate')
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
        '853f1f38-bfbf-44ab-874c-14ea3b9c7fc7',
        'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- "Entity": "MJ_BizApps_Orders": Order "Headers"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM ${mjSchema}."EntityField" WHERE "EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
        'InitialPaymentReceivedDate',
        'Initial Payment Received Date',
        'The day the initial payment''s money arrived, when it differs from the order''s date (for example a wire received before the order was entered). The payment created at confirm is dated from this day, and from OrderDate when it is NULL. Read only at confirm; changing it afterwards does not move the payment, whose date finance corrects on the payment itself.',
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

UPDATE ${mjSchema}."EntityField"
SET 
   "Category" = 'Financial Summary',
   "GeneratedFormSection" = 'Category'
WHERE 
   "ID" = '853F1F38-BFBF-44AB-874C-14EA3B9C7FC7';

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
/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentReceivedDate;


-- ===================== Other =====================

/* SQL text to insert 1 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Orders: Order Headers */
