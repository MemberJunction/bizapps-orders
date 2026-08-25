---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
---

Checkout hardening wave: fix the blocking defects and ship the anonymous edge.

Defect fixes in CheckoutSessionService:
- The payer Person is now resolved (find-or-create by the session's captured email) at
  completion and stamped onto the session and the order's BillTo/ShipTo — previously every
  widget order failed OrderHeaderEntity.Validate() with no customer.
- A session acquires a payment intent through the new OpenPaymentIntentForSession (amount
  from the session's server-priced snapshot, provider from the widget's Configuration
  paymentProviderId); the completion gate now verifies the intent's STATE (Succeeded, as
  advanced by the signature-verified webhook) and that its amount covers the re-priced
  total — mere existence of an intent id no longer books an order.
- The GuestOrder claim mint uses the real IdentityClaimEngineServer import (the previous
  MJGlobal.ClassRegistry duck-type was dead code) and passes the entity GUID.
- EntitlementGrantClaimDriver.OnRevoke stamps RevokedAt + RevocationReason (the generated
  validation rule rejected Revoked-without-RevokedAt, so revocations silently no-oped) and
  failures are logged instead of swallowed; OnExpire logs failed saves.

Session hardening:
- ClientSessionKey is re-verified (constant-time) on every mutating call; ExpiresAt is
  enforced past initialization (expired sessions transition to Expired); completion is
  replay-safe (a Confirmed session returns its existing order) and never reverts to Open
  once the order has committed; server-side quantity/line caps apply when unconfigured;
  hand-rolled SQL escaping replaced with the sql-guards helpers; secret-shaped keys are
  stripped from the Configuration returned to anonymous callers; Person rows are no longer
  minted on the draft path; the platform-specific GETUTCDATE() filter is now portable.

The anonymous checkout edge (new):
- CheckoutServerExtension (DriverClass 'OrdersCheckoutEdge') mounts pre-auth REST routes
  POST /checkout/{initialize,draft,payment-intent,complete} via the serverExtensions
  mechanism, with fail-closed gates: body cap, per-IP(+slug) rate limiting, per-widget
  origin allowlist (Configuration.allowedOrigins) with scoped CORS grants, and optional
  Cloudflare Turnstile (Configuration.requireTurnstile + Settings.TurnstileSecretEnvVar).
  Writes run as the configured ServiceUserEmail principal (system-user fallback). The
  claim-driver Load anchors are now called from LoadBizAppsOrdersServer so the drivers
  survive tree-shaking.
