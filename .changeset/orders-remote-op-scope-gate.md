---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-entities': patch
---

Thirteen Orders operation classes now extend their generated base and so carry its `RequiredScope`: Advance Order State, Amend Arrangement, Apply Account Credit, Cancel Subscription, Check Entitlement, Detect Overlapping Subscriptions, List Entitlements, Preview Price, Price Order, Record Access Override Decision, Refund Payment, Request Access Override and Spawn Renewals. Before this, MJAPI skipped the API-key scope check for them and any valid key could call them. The generated base for Amend Arrangement now carries `orders:subscriptions:write`, the scope its metadata declares. Cancel Subscription's `Decision` dates are typed as ISO strings, the form they already took on the wire.
