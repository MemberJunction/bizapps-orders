-- =============================================================================
-- Rebuild vwEventOrderLines so it produces the two OrderLine columns added by
-- V202609191200 (DimensionID / DimensionValueID).
--
-- WHY THIS IS A SEPARATE MIGRATION AND NOT OPTIONAL. `EventOrderLine` IS-A `OrderLine`:
-- vwEventOrderLines joins the child table to the parent and lists every inherited column
-- EXPLICITLY. CodeGen registers the two new columns as inherited fields on the Event Order Lines
-- entity but does not rebuild this view, so the entity would DECLARE two fields its base view
-- cannot produce. Every read of it then fails with "column ... does not exist", and a grid renders
-- that as "no data" rather than an error — Event Order Lines looks empty while its table is full.
--
-- This is the same failure V202609050900 fixed for PriceOverridden / PriceOverrideReason, and the
-- rule it encoded: adding a column to a table with IS-A children means rebuilding the children's
-- base views too. vwEventOrderLines remains the only IS-A child of OrderLine.
--
-- Definition is V202609050900's verbatim, plus the two new columns.
-- =============================================================================

DROP VIEW [${flyway:defaultSchema}].[vwEventOrderLines];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEventOrderLines]
AS
SELECT
    e.*,
    __mj_isa_p1.[OrderHeaderID],
    __mj_isa_p1.[ProductID],
    __mj_isa_p1.[CompanyID],
    __mj_isa_p1.[LineNumber],
    __mj_isa_p1.[Quantity],
    __mj_isa_p1.[UnitPrice],
    __mj_isa_p1.[ProductPriceID],
    __mj_isa_p1.[DiscountPct],
    __mj_isa_p1.[DiscountAmount],
    __mj_isa_p1.[LineTotalNet],
    __mj_isa_p1.[ChargeAmount],
    __mj_isa_p1.[LineTax],
    __mj_isa_p1.[LineTotalGross],
    __mj_isa_p1.[ShipToAddressID],
    __mj_isa_p1.[ShipToOrganizationID],
    __mj_isa_p1.[ShipToPersonID],
    __mj_isa_p1.[RenewsSubscriptionID],
    __mj_isa_p1.[ServicePeriodStart],
    __mj_isa_p1.[ServicePeriodEnd],
    __mj_isa_p1.[FulfillmentStatus],
    __mj_isa_p1.[ReversesOrderLineID],
    __mj_isa_p1.[SourceBundleProductID],
    __mj_isa_p1.[ParentOrderLineID],
    __mj_isa_p1.[IsRollupParent],
    __mj_isa_p1.[IsQuantityOverridden],
    __mj_isa_p1.[SubscriptionID],
    __mj_isa_p1.[Description],
    __mj_isa_p1.[JournalEntryID],
    __mj_isa_p1.[PriceOverridden],
    __mj_isa_p1.[PriceOverrideReason],
    __mj_isa_p1.[DimensionID],
    __mj_isa_p1.[DimensionValueID],
    mjBizAppsCommonPerson_PersonID.[DisplayName] AS [Person]
FROM
    [${flyway:defaultSchema}].[EventOrderLine] AS e
INNER JOIN
    [${flyway:defaultSchema}].[OrderLine] AS __mj_isa_p1
  ON
    [e].[ID] = __mj_isa_p1.[ID]
INNER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_PersonID
  ON
    [e].[PersonID] = mjBizAppsCommonPerson_PersonID.[ID]
GO
