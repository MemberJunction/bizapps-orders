---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

Consolidated security hardening from reviews #770, #955, and #998:

- `Orders.CapturePayment` now requires the `orders:payments:write` API scope (previously `orders:write`), matching `Orders.ApplyAccountCredit`.
- `CapturePaymentOperation` rejects `IdempotencyKey` values longer than 200 characters (`IdempotencyKeyTooLong`) before querying or writing so database truncation cannot cause cross-caller collisions.
- `MJCheckoutWidgetComponent` now generates fallback checkout session keys exclusively from `crypto.randomUUID()` / `crypto.getRandomValues()` (failing closed rather than falling back to `Math.random`), and `CheckoutSessionService.InitializeSession` refuses keys shorter than 20 characters.
- `EscapeText` now delegates to `EscapeSQLString` (stripping null bytes at all server call sites); `OrderEntityServer` validates `ChargeTypeID` and `FromPersonID` with `RequireUUIDs`/`RequireUUID`; LIKE metacharacters (`[`, `%`, `_`) are escaped in `PaymentWebhookHandler`, `ProviderRenewalBooking`, and Angular's `orders-queries` `likeText`; remaining inline `.replace(/'/g, "''")` sites in Angular (`order-lines-editor`, `party-order-stats`, `orders-queries`) now use `EscapeSQLString`.
- `decomposition-ladder` renders `row.Why` as plain text (`{{ row.Why }}`) instead of `[innerHTML]`.
