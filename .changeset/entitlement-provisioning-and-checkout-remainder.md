---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
'@mj-biz-apps/orders-ng': minor
---

Entitlement provisioning framework (WS-2) + the checkout remainder (WS-1).

Entitlement provisioning (migration V202608261200):

- EntitlementProvisioningTarget lookup (Code/DriverClass/Configuration/Status) + nullable
  ProductEntitlement.ProvisioningTargetID + EntitlementGrant provisioning columns
  (ProvisioningStatus, ProvisionAttempts, LastProvisionAttemptAt, LastProvisionError,
  ProvisioningExternalRef) + append-only EntitlementProvisioningEvent log.
- BaseEntitlementProvisioningDriver (Provision/Revoke/Verify) with the
  resolve-and-refuse-the-base-class guard, a NoOp driver, and a metadata-seeded NoOp target.
  Concrete drivers ship with the deployment that owns the downstream system.
- Grants born Pending inside the booking transaction when their template names a target; the
  push runs post-commit and fire-and-forget from OrderEntityServer.Save; a claim redemption
  re-pushes once the real beneficiary is known; the Orders.ReconcileEntitlementProvisioning
  action (+ a Disabled-by-default scheduled job) sweeps Pending/Failed/RevokePending with
  exponential backoff and a bounded attempt ceiling. Every attempt writes an event row.
- EntitlementGrantEntityServer keeps the obligation in step with grant Status: Provisioned →
  RevokePending on revoke/expiry; never-provisioned goes straight to Revoked.

Checkout remainder:

- Webhook-driven completion: after the payment webhook lands a Succeeded intent,
  CompleteCheckoutForSettledIntent reverse-looks-up the Open session and drives the standard
  completion path (all gates intact) — a buyer who paid and closed the tab still gets booked.
- Coupons: promotionCodes flow through UpdateDraft (bounded, normalized), round-trip the
  session snapshot into CompleteCheckout's re-price, and UnusableCodes surface to the caller;
  ManualDiscounts stay empty from public paths. PromotionEngine's hand-rolled quote escaping
  replaced with EscapeSQLString (the codes are anonymous-caller input now).
- Receipt: invoice-renderer moved down into orders-core-entities-server; a completed checkout
  emails the buyer a receipt (config receiptEmail/receiptTemplateName), best-effort.
- Widget: select extension fields now ship their value-list options (List → select,
  ListOrUserEntry stays free-entry), fieldOverrides apply server-side, the quantity clamp
  matches the server default (100), and a new `completed` input renders successMessage and
  honors redirectUrl.
- Distributions: CheckoutWidgetDistributionEntityServer normalizes slugs, mints the anonymous
  magic-link invite on create when the widget Configuration asks for one (with its own
  issuer-authorization gate; token hash pinned byte-compatible with MJ's hashToken), and
  revokes the linked invite when a distribution is revoked.
- PersonAccountLinkClaimDriver stamps Person.LinkedUserID on redemption, deterministically and
  idempotently, refusing ambiguous or already-linked-elsewhere matches.

Also hand-corrects a CodeGen defect in generated entity_subclasses.ts (a self-referential
import specifier for the cross-app Address entity) that broke the package build chain.
