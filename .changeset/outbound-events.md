---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-integration-tests': patch
---

Outbound events: Orders tells registered `OrdersOutboundConsumer` subclasses when a sale confirms (renewals included; not returns, cancellations, amendments or credits) and when an entitlement grant is created or its status changes. Events are recorded in the same transaction as the change (a transactional outbox) and sent after it by the new `Orders — Dispatch Outbound Events` scheduled job and, for a completed checkout, right after `/complete`. Delivery is at least once with a stable event id, retried with backoff (a `Deliver` call is bounded at 30 seconds) and dead-lettered after 24 hours. A new `EntitlementGrantEntityServer` records grant changes whoever makes them. With no consumer registered, nothing is recorded. See `docs/outbound-events.md`.
