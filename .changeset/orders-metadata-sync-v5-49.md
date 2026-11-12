---
"@mj-biz-apps/orders-entities": minor
---

Release seed for the Subscriptions tab: `V…__v5.49.x__Metadata_Sync` creates the Orders.ChangeSubscriptionProduct, Orders.SetRenewalSettings and Orders.GetRenewalWorklist remote operations (create-only, guarded on ID or OperationKey), updates Orders.SpawnRenewals' type definitions, and updates the Orders application's description and nav items to add the Subscriptions tab. Rows resolve by OperationKey or name, the shipped ID first, and the Subscriptions category by its ID first. It has a Postgres counterpart.
