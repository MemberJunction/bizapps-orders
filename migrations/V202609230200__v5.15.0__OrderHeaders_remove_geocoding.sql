-- Order Headers: stop emitting the geocoding columns.
--
-- WHY THIS EXISTS
--
-- `Entity.SupportsGeoCoding` was set on MJ_BizApps_Orders: Order Headers at some
-- point, so CodeGen emitted `__mj_Latitude` / `__mj_Longitude` into the generated
-- inner view together with a LEFT OUTER JOIN to [__mj].[vwRecordGeoCodes]. The
-- generated TypeScript was later regenerated with the flag OFF, which dropped both
-- fields from the entity and GraphQL types -- but CodeGen only ADDS geo columns, it
-- never removes them, so the view kept them.
--
-- Between 5.13.0 and 5.14.0 the two halves therefore diverged:
--
--   5.13.0 generated code:  __mj_Latitude, __mj_Latitude_BillToAddressID, ...
--   5.14.0 generated code:                 __mj_Latitude_BillToAddressID, ...
--   view (both releases):   __mj_Latitude  <-- still there
--
-- A client builds its query from live __mj.EntityField metadata, which reflects the
-- VIEW, so it asks for `_mj__Latitude` (GraphQL reserves a leading `__`). The API
-- type, built from the generated code, does not have it:
--
--   Cannot query field "_mj__Latitude" on type "mjBizAppsOrdersOrderHeader_"
--
-- Single-record load and save on Order Headers both fail; grids keep working because
-- views do not go through the generated type. Reported as
-- MemberJunction/bc-aidp-next-golive#251, root-caused in bizapps-orders#238.
--
-- DIRECTION OF THE FIX
--
-- Order Headers has no use for geocoding -- the columns have never held a value
-- (120 rows on the reporting host, 0 with a latitude). So the view loses them rather
-- than the generated code regaining them.
--
-- Both statements below are required. Clearing the flag alone leaves the columns in
-- place (CodeGen does not drop them). Recreating the view alone lets the next CodeGen
-- run put them straight back.

-- 1) Stop CodeGen re-emitting the geo join on the next regeneration.
UPDATE [${mjSchema}].[Entity]
   SET [SupportsGeoCoding] = 0,
       [AutoUpdateSupportsGeoCoding] = 0,
       [__mj_UpdatedAt] = SYSDATETIMEOFFSET()
 WHERE [ID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'
   AND [SupportsGeoCoding] = 1;
GO

-- 2) Recreate the generated inner view without the two columns and the
--    vwRecordGeoCodes join. Byte-for-byte the CodeGen output from
--    V202609061900 minus the geo lines, so a later regeneration is a no-op.
CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwOrderHeadersGenerated]
AS
SELECT
    o.*,
    MJCompany_CompanyID.[Name] AS [Company],
    mjBizAppsCommonPerson_BillToPersonID.[DisplayName] AS [BillToPerson],
    mjBizAppsCommonOrganization_BillToOrganizationID.[Name] AS [BillToOrganization],
    MJUser_SalesRepUserID.[Name] AS [SalesRepUser],
    mjBizAppsCommonAddress_BillToAddressID.[Line1] AS [BillToAddress],
    mjBizAppsCommonAddress_ShipToAddressID.[Line1] AS [ShipToAddress],
    mjBizAppsCommonOrganization_ShipToOrganizationID.[Name] AS [ShipToOrganization],
    mjBizAppsCommonPerson_ShipToPersonID.[DisplayName] AS [ShipToPerson],
    mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID.[Name] AS [PaymentTermsType],
    mjBizAppsOrdersPaymentType_InitialPaymentTypeID.[Name] AS [InitialPaymentType],
    mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID.[Last4] AS [InitialPaymentDetail],
    MJUser_PostedByUserID.[Name] AS [PostedByUser],
    mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID.[OrderNumber] AS [ReversesOrderHeader],
    mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID.[Name] AS [SourceCheckoutWidget]
FROM
    [${flyway:defaultSchema}].[OrderHeader] AS o
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [o].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_BillToPersonID
  ON
    [o].[BillToPersonID] = mjBizAppsCommonPerson_BillToPersonID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_BillToOrganizationID
  ON
    [o].[BillToOrganizationID] = mjBizAppsCommonOrganization_BillToOrganizationID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_SalesRepUserID
  ON
    [o].[SalesRepUserID] = MJUser_SalesRepUserID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Address] AS mjBizAppsCommonAddress_BillToAddressID
  ON
    [o].[BillToAddressID] = mjBizAppsCommonAddress_BillToAddressID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Address] AS mjBizAppsCommonAddress_ShipToAddressID
  ON
    [o].[ShipToAddressID] = mjBizAppsCommonAddress_ShipToAddressID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_ShipToOrganizationID
  ON
    [o].[ShipToOrganizationID] = mjBizAppsCommonOrganization_ShipToOrganizationID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_ShipToPersonID
  ON
    [o].[ShipToPersonID] = mjBizAppsCommonPerson_ShipToPersonID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentTermsType] AS mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID
  ON
    [o].[PaymentTermsTypeID] = mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentType] AS mjBizAppsOrdersPaymentType_InitialPaymentTypeID
  ON
    [o].[InitialPaymentTypeID] = mjBizAppsOrdersPaymentType_InitialPaymentTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentDetail] AS mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID
  ON
    [o].[InitialPaymentDetailID] = mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_PostedByUserID
  ON
    [o].[PostedByUserID] = MJUser_PostedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID
  ON
    [o].[ReversesOrderHeaderID] = mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CheckoutWidget] AS mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID
  ON
    [o].[SourceCheckoutWidgetID] = mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID.[ID];
GO
