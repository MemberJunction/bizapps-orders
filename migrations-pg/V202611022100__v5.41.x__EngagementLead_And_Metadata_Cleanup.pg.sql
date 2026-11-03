-- =============================================================================================
-- PostgreSQL counterpart of V202611022100__v5.41.x__EngagementLead_And_Metadata_Cleanup.sql
-- =============================================================================================
-- Schema names are written unquoted, as the converter emits them, so they fold to the lowercase
-- schema a PostgreSQL install uses. View rebuild blocks compare lower(n.nspname) against
-- lower(v_target_schema) so dependent views are preserved and restored across CASCADE (#993).
-- =============================================================================================

SET standard_conforming_strings = on;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS __mj_bizappsorders;
SET search_path TO __mj_bizappsorders, public;

SET standard_conforming_strings = on;

-- ===================== DDL: Tables, PKs, Indexes =====================

ALTER TABLE __mj_BizAppsOrders."OrderHeader"
 ADD COLUMN IF NOT EXISTS "EngagementLeadUserID" UUID NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_OrderHeader_EngagementLead'
    ) THEN
        ALTER TABLE __mj_BizAppsOrders."OrderHeader"
        ADD CONSTRAINT "FK_OrderHeader_EngagementLead"
        FOREIGN KEY ("EngagementLeadUserID")
        REFERENCES __mj."User"("ID") DEFERRABLE INITIALLY IMMEDIATE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_OrderHeader_EngagementLeadUserID"
    ON __mj_BizAppsOrders."OrderHeader" ("EngagementLeadUserID");

DROP INDEX IF EXISTS __mj_BizAppsOrders."IX_OutboundEvent_OrderHeaderID";

-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_bizappsorders';
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
    __mj_emb_BillToAddressID."Latitude" AS "__mj_Latitude_BillToAddressID",
    __mj_emb_BillToAddressID."Longitude" AS "__mj_Longitude_BillToAddressID",
    __mj_emb_ShipToAddressID."Latitude" AS "__mj_Latitude_ShipToAddressID",
    __mj_emb_ShipToAddressID."Longitude" AS "__mj_Longitude_ShipToAddressID",
    "MJUser_EngagementLeadUserID"."Name" AS "EngagementLeadUser"
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
    o."ShipToAddressID" = __mj_emb_ShipToAddressID."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_EngagementLeadUserID"
  ON
    o."EngagementLeadUserID" = "MJUser_EngagementLeadUserID"."ID"$vsql$;
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
  WHERE lower(n.nspname) = lower(v_target_schema) AND c.relname = v_target_name AND c.relkind = 'v';
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
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', lower(v_target_schema), v_target_name);
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
  v_target_schema CONSTANT TEXT := '__mj_bizappsorders';
  v_target_name CONSTANT TEXT := 'vwOrderLines';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsOrders."vwOrderLines"
AS SELECT
    o.*,
    "mjBizAppsOrdersOrderHeader_OrderHeaderID"."OrderNumber" AS "OrderHeader",
    "mjBizAppsOrdersProduct_ProductID"."Name" AS "Product",
    "MJCompany_CompanyID"."Name" AS "Company",
    "mjBizAppsOrdersProductPrice_ProductPriceID"."Name" AS "ProductPrice",
    "mjBizAppsCommonOrganization_ShipToOrganizationID"."Name" AS "ShipToOrganization",
    "mjBizAppsCommonPerson_ShipToPersonID"."DisplayName" AS "ShipToPerson",
    "mjBizAppsOrdersProduct_SourceBundleProductID"."Name" AS "SourceBundleProduct",
    "mjBizAppsOrdersSubscription_SubscriptionID"."SubscriptionNumber" AS "Subscription",
    "mjBizAppsAccountingJournalEntry_JournalEntryID"."EntryNumber" AS "JournalEntry",
    "mjBizAppsAccountingDimension_DimensionID"."Name" AS "Dimension",
    "mjBizAppsAccountingDimensionValue_DimensionValueID"."Name" AS "DimensionValue",
    "hier_ParentOrderLineID"."RootID" AS "RootParentOrderLineID",
    "hier_ParentOrderLineID"."Depth" AS "ParentOrderLineIDDepth",
    "hier_ParentOrderLineID"."Path" AS "ParentOrderLineIDPath",
    "hier_ParentOrderLineID"."IsLeaf" AS "ParentOrderLineIDIsLeaf",
    "hier_ParentOrderLineID"."ChildCount" AS "ParentOrderLineIDChildCount",
    "mjBizAppsCommonAddress_ShipToAddressID"."DisplayName" AS "ShipToAddress"
FROM
    __mj_BizAppsOrders."OrderLine" AS o
INNER JOIN
    __mj_BizAppsOrders."OrderHeader" AS "mjBizAppsOrdersOrderHeader_OrderHeaderID"
  ON
    o."OrderHeaderID" = "mjBizAppsOrdersOrderHeader_OrderHeaderID"."ID"
INNER JOIN
    __mj_BizAppsOrders."Product" AS "mjBizAppsOrdersProduct_ProductID"
  ON
    o."ProductID" = "mjBizAppsOrdersProduct_ProductID"."ID"
INNER JOIN
    __mj."Company" AS "MJCompany_CompanyID"
  ON
    o."CompanyID" = "MJCompany_CompanyID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."ProductPrice" AS "mjBizAppsOrdersProductPrice_ProductPriceID"
  ON
    o."ProductPriceID" = "mjBizAppsOrdersProductPrice_ProductPriceID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsCommon."Organization" AS "mjBizAppsCommonOrganization_ShipToOrganizationID"
  ON
    o."ShipToOrganizationID" = "mjBizAppsCommonOrganization_ShipToOrganizationID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsCommon."Person" AS "mjBizAppsCommonPerson_ShipToPersonID"
  ON
    o."ShipToPersonID" = "mjBizAppsCommonPerson_ShipToPersonID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."Product" AS "mjBizAppsOrdersProduct_SourceBundleProductID"
  ON
    o."SourceBundleProductID" = "mjBizAppsOrdersProduct_SourceBundleProductID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsOrders."Subscription" AS "mjBizAppsOrdersSubscription_SubscriptionID"
  ON
    o."SubscriptionID" = "mjBizAppsOrdersSubscription_SubscriptionID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsAccounting."JournalEntry" AS "mjBizAppsAccountingJournalEntry_JournalEntryID"
  ON
    o."JournalEntryID" = "mjBizAppsAccountingJournalEntry_JournalEntryID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsAccounting."Dimension" AS "mjBizAppsAccountingDimension_DimensionID"
  ON
    o."DimensionID" = "mjBizAppsAccountingDimension_DimensionID"."ID"
LEFT OUTER JOIN
    __mj_BizAppsAccounting."DimensionValue" AS "mjBizAppsAccountingDimensionValue_DimensionValueID"
  ON
    o."DimensionValueID" = "mjBizAppsAccountingDimensionValue_DimensionValueID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj_BizAppsOrders."fnOrderLineParentOrderLineID_GetHierarchyMeta"(o."ID", o."ParentOrderLineID")) AS "hier_ParentOrderLineID"
    ON TRUE
LEFT OUTER JOIN
    __mj_BizAppsCommon."Address" AS "mjBizAppsCommonAddress_ShipToAddressID"
  ON
    o."ShipToAddressID" = "mjBizAppsCommonAddress_ShipToAddressID"."ID"$vsql$;
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
  WHERE lower(n.nspname) = lower(v_target_schema) AND c.relname = v_target_name AND c.relkind = 'v';
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
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', lower(v_target_schema), v_target_name);
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

-- ===================== Data (INSERT/UPDATE/DELETE) =====================

UPDATE __mj_BizAppsAccounting."JournalEntryType"
SET "Description" = 'Written when one instalment of an order''s payment schedule is invoiced (orders D92): the value entry the order would have booked at confirm, raised instead for that instalment''s share - debiting the receivable and crediting deferred revenue (or the contract asset where revenue was recognised first), with tax, charges and any discount in proportion. Distinct from Order Booking so a report can tell a booking from a bill, which matters once confirmation stops booking the whole contract. Seeded by bizapps-orders because the EVENT is an orders concept - accounting seeds only the ledger-mechanics types it originates itself.',
    "__mj_UpdatedAt" = NOW()
WHERE "ID" = 'B2791781-FBBE-419F-9329-933E2223135B';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '32f0e917-9c14-4d4a-9d63-7410f302c941' OR ("EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND "Name" = 'EngagementLeadUserID')
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
            "RelatedEntityNameFieldMap",
            "Category",
            "GeneratedFormSection",
            "__mj_CreatedAt",
            "__mj_UpdatedAt"
        )
        VALUES
        (
            '32f0e917-9c14-4d4a-9d63-7410f302c941',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B',
            (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            'EngagementLeadUserID',
            'Engagement Lead',
            'The user responsible for delivering the order''s work (the engagement lead), distinct from SalesRepUserID (who sold it). Optional. Pre-fills AttestedByUserID when progress is recorded and lets the progress worklist filter by delivery owner.',
            'uniqueidentifier',
            16,
            0,
            0,
            TRUE,
            NULL,
            FALSE,
            TRUE,
            FALSE,
            FALSE,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            FALSE,
            FALSE,
            TRUE,
            FALSE,
            FALSE,
            FALSE,
            'Search',
            'EngagementLeadUser',
            'Customer Information',
            'Category',
            NOW(),
            NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '82c81b92-450b-4489-9311-623930a54f12' OR ("EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND "Name" = 'EngagementLeadUser')
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
            "Category",
            "GeneratedFormSection",
            "__mj_CreatedAt",
            "__mj_UpdatedAt"
        )
        VALUES
        (
            '82c81b92-450b-4489-9311-623930a54f12',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B',
            (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            'EngagementLeadUser',
            'Engagement Lead Name',
            NULL,
            'nvarchar',
            200,
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
            'Customer Information',
            'Category',
            NOW(),
            NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd92a4c71-8812-437e-9b55-642718c34011' OR ("EntityID" = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND "Name" = 'ShipToAddress')
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
            "Category",
            "GeneratedFormSection",
            "__mj_CreatedAt",
            "__mj_UpdatedAt"
        )
        VALUES
        (
            'd92a4c71-8812-437e-9b55-642718c34011',
            '66D82C24-9C9F-4CD6-B019-53C20274AB00',
            (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '66D82C24-9C9F-4CD6-B019-53C20274AB00'),
            'ShipToAddress',
            'Ship To Address Name',
            NULL,
            'nvarchar',
            800,
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
            'Shipping Details',
            'Category',
            NOW(),
            NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '61f9a24c-779d-4c88-9015-994b5d1249a3'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('61f9a24c-779d-4c88-9015-994b5d1249a3', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'FC529BC8-FF09-44A9-B454-26EAFDAC791B', 'EngagementLeadUserID', 'One To Many', TRUE, TRUE, 122, NOW(), NOW());
    END IF;
END $$;

UPDATE __mj."EntityField"
SET "RelatedEntityID" = '61B5C6FB-7317-46D1-8E05-F669B7BC6F3E',
    "RelatedEntityFieldName" = 'ID',
    "IncludeRelatedEntityNameFieldInBaseView" = TRUE,
    "RelatedEntityNameFieldMap" = 'ShipToAddress',
    "__mj_UpdatedAt" = NOW()
WHERE "ID" = 'B81F4205-3E9D-49C5-B76D-6EB25B0EFA26';

UPDATE __mj."EntityField"
SET "Length" = 800,
    "__mj_UpdatedAt" = NOW()
WHERE "ID" IN ('A5A7DFCD-E18F-4D44-800D-52CE4339331E', 'A60F3EE4-CDFB-411D-84AA-821FDFC51138');

UPDATE __mj."EntityField"
SET "Description" = 'The bill-to address as it was when the order was first confirmed: JSON with AddressID, Line1, Line2, Line3, City, StateProvince, PostalCode and Country. NULL until the order is confirmed. Written once and never changed (trg_OrderHeader_ImmutableAfterConfirm, 51015). Reporting and invoicing read this on a confirmed order instead of the live Address row.',
    "__mj_UpdatedAt" = NOW()
WHERE "ID" = '4BEC4999-721D-423A-B88B-2076F475BB39';

UPDATE __mj."EntityField"
SET "Description" = 'The ship-to address as it was when the order was first confirmed: JSON with AddressID, Line1, Line2, Line3, City, StateProvince, PostalCode and Country. NULL until the order is confirmed. Written once and never changed (trg_OrderHeader_ImmutableAfterConfirm, 51015). Reporting and invoicing read this on a confirmed order instead of the live Address row.',
    "__mj_UpdatedAt" = NOW()
WHERE "ID" = 'F9F37487-78B3-4E0C-8F74-046EFBA959A8';

UPDATE __mj."EntityField"
SET "Description" = 'The user whose save first confirmed (booked) this order, stamped from that save''s context user in the same write as ConfirmedAt. A booking made by an unattended process, such as a renewal job, records the user that process runs as. NULL until the order is confirmed, and NULL on orders confirmed before this column existed, whose confirmer is not known. Never changes once ConfirmedAt is set (trg_OrderHeader_ImmutableAfterConfirm, 51017).',
    "__mj_UpdatedAt" = NOW()
WHERE "ID" = '75B6D86F-A9E6-4802-95E1-713CFB4951D2';

UPDATE __mj."EntityField"
SET "Description" = 'The line''s own ship-to address as it was when the order was first confirmed, in the same JSON shape as OrderHeader.ShipToAddressSnapshot. NULL when the line has no ShipToAddressID of its own, or until the order is confirmed. Written once and never changed (trg_OrderLine_ImmutableAfterConfirm, 51016).',
    "__mj_UpdatedAt" = NOW()
WHERE "ID" = '0A8DE5AA-338D-4963-A8E5-B50D814364F8';

UPDATE __mj."EntityField"
SET "Description" = 'The order the event is about. Set on every OrderConfirmed event, and on a GrantStatusChanged event when the grant has an order line, so deliveries can be read by order.',
    "__mj_UpdatedAt" = NOW()
WHERE "EntityID" = '154DCE03-C019-43B0-B293-1E6D93E303A2' AND "Name" = 'OrderHeaderID';

UPDATE __mj."EntityField"
SET "Description" = 'Days a term''s start or end may move (extension, shortening or shift) before a concession needs approval; smaller moves this rep may grant unaided. NULL means no authority to move term dates, so every term-date concession goes to approval.',
    "__mj_UpdatedAt" = NOW()
WHERE "ID" = 'B7B46B1E-48DD-409E-8C4B-2549C02DB7EB';

UPDATE __mj."EntityField"
SET "Description" = 'Whether the discount on the term being renewed carries into the renewal. Off by default: a first-term discount lapses and the renewal starts from the undiscounted price. Set it for a discount agreed to continue, such as a multi-year concession. When the renewal moves to a successor product, the carried discount applies to the successor''s list price.',
    "__mj_UpdatedAt" = NOW()
WHERE "ID" = 'F2D0FF66-5730-4F55-987A-254FC1FC70FC';

UPDATE __mj."EntityField"
SET "Category" = 'Subscription and Entitlements',
    "GeneratedFormSection" = 'Category',
    "__mj_UpdatedAt" = NOW()
WHERE "ID" = '19744BA4-2E43-4DA1-B2CB-5C40DD122969';

UPDATE __mj."EntityField"
SET "Sequence" = "Sequence" + 200000
WHERE "EntityID" IN (
    '9915A9E7-6BC6-4518-BAEA-206B18C86622',
    '6F739DCD-46E0-44A1-9A94-51E4E6E849FF',
    '154DCE03-C019-43B0-B293-1E6D93E303A2',
    'FC529BC8-FF09-44A9-B454-26EAFDAC791B',
    '66D82C24-9C9F-4CD6-B019-53C20274AB00'
);

WITH RankedFields AS (
    SELECT "ID",
           ROW_NUMBER() OVER (
               PARTITION BY "EntityID"
               ORDER BY "IsVirtual" ASC, "Sequence" ASC, "ID" ASC
           ) AS "NewSeq"
    FROM __mj."EntityField"
    WHERE "EntityID" IN (
        '9915A9E7-6BC6-4518-BAEA-206B18C86622',
        '6F739DCD-46E0-44A1-9A94-51E4E6E849FF',
        '154DCE03-C019-43B0-B293-1E6D93E303A2',
        'FC529BC8-FF09-44A9-B454-26EAFDAC791B',
        '66D82C24-9C9F-4CD6-B019-53C20274AB00'
    )
)
UPDATE __mj."EntityField" ef
SET "Sequence" = rf."NewSeq"
FROM RankedFields rf
WHERE rf."ID" = ef."ID";

-- ===================== Grants =====================

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderHeaders" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderHeaders" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderHeaders" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwOrderHeaders" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderLines" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderLines" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj_BizAppsOrders."vwOrderLines" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj_BizAppsOrders."vwOrderLines" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;

-- ===================== Comments =====================

COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeader"."EngagementLeadUserID" IS 'The user responsible for delivering the order''s work (the engagement lead), distinct from SalesRepUserID (who sold it). Optional. Pre-fills AttestedByUserID when progress is recorded and lets the progress worklist filter by delivery owner.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeader"."BillToAddressSnapshot" IS 'The bill-to address as it was when the order was first confirmed: JSON with AddressID, Line1, Line2, Line3, City, StateProvince, PostalCode and Country. NULL until the order is confirmed. Written once and never changed (trg_OrderHeader_ImmutableAfterConfirm, 51015). Reporting and invoicing read this on a confirmed order instead of the live Address row.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeader"."ShipToAddressSnapshot" IS 'The ship-to address as it was when the order was first confirmed: JSON with AddressID, Line1, Line2, Line3, City, StateProvince, PostalCode and Country. NULL until the order is confirmed. Written once and never changed (trg_OrderHeader_ImmutableAfterConfirm, 51015). Reporting and invoicing read this on a confirmed order instead of the live Address row.';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeader"."ConfirmedByUserID" IS 'The user whose save first confirmed (booked) this order, stamped from that save''s context user in the same write as ConfirmedAt. A booking made by an unattended process, such as a renewal job, records the user that process runs as. NULL until the order is confirmed, and NULL on orders confirmed before this column existed, whose confirmer is not known. Never changes once ConfirmedAt is set (trg_OrderHeader_ImmutableAfterConfirm, 51017).';

COMMENT ON COLUMN __mj_BizAppsOrders."OrderLine"."ShipToAddressSnapshot" IS 'The line''s own ship-to address as it was when the order was first confirmed, in the same JSON shape as OrderHeader.ShipToAddressSnapshot. NULL when the line has no ShipToAddressID of its own, or until the order is confirmed. Written once and never changed (trg_OrderLine_ImmutableAfterConfirm, 51016).';

COMMENT ON COLUMN __mj_BizAppsOrders."OutboundEvent"."OrderHeaderID" IS 'The order the event is about. Set on every OrderConfirmed event, and on a GrantStatusChanged event when the grant has an order line, so deliveries can be read by order.';

COMMENT ON COLUMN __mj_BizAppsOrders."SalesAuthority"."MaxTermExtensionDays" IS 'Days a term''s start or end may move (extension, shortening or shift) before a concession needs approval; smaller moves this rep may grant unaided. NULL means no authority to move term dates, so every term-date concession goes to approval.';

COMMENT ON COLUMN __mj_BizAppsOrders."Subscription"."CarryDiscountOnRenewal" IS 'Whether the discount on the term being renewed carries into the renewal. Off by default: a first-term discount lapses and the renewal starts from the undiscounted price. Set it for a discount agreed to continue, such as a multi-year concession. When the renewal moves to a successor product, the carried discount applies to the successor''s list price.';
