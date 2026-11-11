---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
---

Deleting a Draft or Quoted order now checks whose order it is (#1021). New authorizations `MJ.BizApps.Orders.Order.Delete` (any order; granted to Finance and Developer) and its child `MJ.BizApps.Orders.Order.DeleteOwn` (only an order the user created, read from the order's `Create` record change; granted to Account Director). Entity permissions still decide whether a role may delete order rows at all. An order with no recorded creator needs the any-order grant. Until the release metadata installs the authorizations, no one but the system user can delete an order. Sales' deal delete, which deletes the deal's order as the system user, is unaffected. `OrderDeleteRefusal` and `UserOrderDeleteScope` are exported from `@mj-biz-apps/orders-entities` so screens can hide a delete the server will refuse.

An Order Concession saved directly (the generated form or the API) that lowers an agreed amount now needs `MJ.BizApps.Orders.Order.Reverse`, as `Orders.AmendArrangement` already did (#1060). Before, a role with Create on Order Concessions and no finance grant could book the amount change and its credit memo.

New one-off script `scripts/backfill-webhook-records.mjs` (#945) restores the `PaymentIntent.ProviderEventID` stamps and Applied `PaymentWebhookDelivery` rows lost before #940, taking each event id from the intent's record-change history. Dry run by default; `--apply` writes in one transaction and a re-run writes nothing.
