-- =============================================================================
-- Rebuild vwEventOrderLines so it produces the two OrderLine columns added in 5.7.0.
--
-- THE BUG. `EventOrderLine` IS-A `OrderLine`: vwEventOrderLines joins the child table to the
-- parent and lists every inherited column EXPLICITLY (`__mj_isa_p1.[...]`). V202609041400 added
-- `PriceOverridden` / `PriceOverrideReason` to OrderLine and V202609041600 rebuilt vwOrderLines
-- -- but nothing rebuilt the CHILD view, so it still carries the pre-5.7.0 parent column list.
--
-- WHY CODEGEN DOES NOT HEAL IT. CodeGen reconciles metadata and duly registered both columns as
-- inherited fields on the Event Order Lines entity. It cannot regenerate the view: a host's
-- mj.config.cjs carries this app's schema in `excludeSchemas` (that is written back on every
-- `mj app install`/`upgrade`), because the BizApps apps own their own views through migrations.
-- So the entity ends up DECLARING two fields its base view cannot produce, and CodeGen's
-- field-resolution check reports exactly that:
--
--     MJ_BizApps_Orders: Event Order Lines → vwEventOrderLines does not produce
--     "PriceOverridden" (virtual) / "PriceOverrideReason" (virtual)
--
-- WHY IT MATTERS MORE THAN IT LOOKS. Every read of the entity fails with "column ... does not
-- exist". A grid renders that as **"no data"** rather than an error, so Event Order Lines appears
-- empty while its table is full -- silent, and easy to mistake for "there are no event lines".
--
-- THE RULE THIS ENCODES. Adding a column to a table that has IS-A children means rebuilding the
-- children's base views too, not just the parent's. In this schema `vwEventOrderLines` is the
-- only IS-A child of OrderLine (`vwEventProducts` descends from Product), so this one view is the
-- whole fix -- verified against the live schema, where these were the only two unreadable fields
-- across every `__mj_BizApps*` entity.
--
-- Definition is V202608251540's verbatim, plus the two columns; the cross-schema Person join now
-- uses the `${mjSchema}_BizAppsCommon` form that the newer migrations in this repo use.
-- =============================================================================

IF OBJECT_ID('[${flyway:defaultSchema}].[vwEventOrderLines]', 'V') IS NOT NULL
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
