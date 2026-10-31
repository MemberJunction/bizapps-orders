---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-ng": minor
---

Revenue-band pricing: an offering priced by the buyer's revenue is one product with a price row per band, instead of one product per band. A band row's Applicability tests the new `BillToOrganizationRevenue.AnnualRevenue` source, filled from the host's registered `BaseOrganizationRevenueProvider`; the price trail names the band and the revenue figure used. When the revenue is unknown, pricing refuses with `RevenueBandRequiredError` and `ListApplicablePrices` offers every band (`IsRevenueBand`, `BandUndecided`); the order line's price picker shows those bands to any user editing the order, and picking one is not an override. The product price "When" builder offers the revenue field. New exports: `BaseOrganizationRevenueProvider`, `LoadOrganizationRevenue`, `IsRevenueBandApplicability`, `ORGANIZATION_REVENUE_SOURCE`, `ProductHasRevenueBands`, `IsLineOnUndecidedBand`.
