---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-server': patch
---

Two checks of Orders against the payment gateway. A webhook endpoint drift check finds each live provider's endpoint at the gateway (the one whose URL ends in the provider's id) and reports one that is missing, disabled, or does not send every event kind the driver handles; it runs once at server start and as the `Orders.CheckPaymentWebhookEndpoints` Action, and drift is logged as an error and fails the run. A charge reconciliation, the `Orders.ReconcilePaymentProviderCharges` remote operation and Action, matches the gateway's charges and refunds for a window of business days to Orders' intents and captured payments and reports a charge with no payment, a payment with no charge, and a refunded charge whose payment carries fewer refunds; with `Preview` false each is raised as a `PROVIDER_CHARGE_MISMATCH` finance exception. It corrects nothing. Both scheduled jobs ship disabled, the reconciliation in preview. New driver calls: `ListCharges`, `RetrieveCharge`, `ListWebhookEndpoints`, `ListsCharges`. A restricted gateway key needs read access to webhook endpoints, charges and refunds.
