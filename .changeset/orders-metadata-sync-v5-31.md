---
'@mj-biz-apps/orders-entities': minor
---

The 5.31 Metadata_Sync ships what metadata/ changed since the 5.29 seed, since 5.30 shipped without one: payment reconciliation (the Orders.ReconcilePaymentProviderCharges operation, the Reconcile Payment Provider Charges and Check Payment Webhook Endpoints actions, and their daily and hourly jobs, created Disabled), the AccessOverrideFallbackApproverRole setting, Account Director and Finance on the access-override authorization, the Payment Webhook Deliveries "Not Applied" view, form sections on 287 fields, the Party Order Lifetime and Party Orders Overview SQL, and the updated Capture Payment, Check Entitlement, List Entitlements and Amend Arrangement contracts. It has a Postgres counterpart. The seed is idempotent and safe on a host that already ran `mj sync push`. The ML training pipelines under metadata/ are not included.
