---
'@mj-biz-apps/orders-actions': minor
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-ng': minor
'@mj-biz-apps/orders-server': minor
---

Post-go-live Orders updates: `OrderHeader.EngagementLeadUserID` with separation-of-duties rules for recording and superseding progress, plus entity metadata fixes (migration `V202611181200`); Stripe test/live mode and key checks, schedule reductions that keep invoiced slices, and renewal charging with saved instruments; checkout widget and session fixes; a Returns page confirmation, customer search and configurable return reasons; concession tiers measured on the extended amount, with cached product lookups; order form per-line Ship-To, draft discount removal, datepickers and live total; remaining grids moved to `mj-view-workspace`; company scope on Receivables; and a Dimension Defaults panel on Product, Product Category and Product Type forms.
