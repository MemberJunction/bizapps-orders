---
"@mj-biz-apps/orders-entities": minor
---

Release seed for the order reversal authorization: `V…__v5.48.x__Metadata_Sync` creates `MJ.BizApps.Orders.Order.Reverse` and grants it to Finance and Developer, so a host that upgrades by migration can still cancel subscriptions, refund payments, move account credits and lower agreed amounts. Every record is create-only, guarded on its ID or natural key. It has a Postgres counterpart.
