---
"@mj-biz-apps/orders-entities": minor
---

Finance may type any unit price on an order line (MJ.BizApps.Orders.Price.OverrideAny), as Account Director can. Products with a single $0 price, such as the converted-pricing Betty products, had no way to set a price for anyone outside Account Director, so Finance users entering a new sale saw no price pencil. Metadata only; the release's Metadata_Sync migration carries the new authorization-role row.
