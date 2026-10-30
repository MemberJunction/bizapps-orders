# Hearing the gateway and booking what it did (option E: E3 + E4 + E6)

**Status:** built in the PR on `feat/e3e4-provider-subscription-sync` (stacked on #972). Move to `archive/` with a status
line when it ships; `docs/HOW_THE_SYSTEM_WORKS.md` §8 ("Hearing the gateway…") already describes it as built.
Full design with the census, the alternatives and the cutover: Learning Hub repo,
`docs/aidp-stripe-checkout/go-live/design/E3E4.md`. Rulings: that repo's `go-live/DECISIONS.md` D13.

## The problem

Once a gateway bills a subscription (`ProviderSubscriptionID` set, #948/#972), the gateway renews it, fails to collect,
retries and ends it, and Orders heard none of it: a renewal's payment intent was `Ignored / unknown_intent`, every
renewal order on such a subscription was refused (E2b), and a portal cancel left `AutoRenew` on. Jane's SUB-000110 would
have reached 30 Oct 2027, been charged $599 by Stripe, and lost access in Orders and the Learning Hub.

## Before and after, per event

| What happens at the gateway | Before | After |
|---|---|---|
| Renewal paid ($599, 30 Oct 2027 00:00 business time) | nothing booked; access ends | renewal order (subscription's product, $599), payment keyed by the charge, term 2 = 31 Oct 2027 → 30 Oct 2028, events |
| …on another price ($399 Foundation, imported Professional) | — | product kept; $399 booked; `RenewalAmountUnusual` Task unless a coupon explains it |
| Charge fails, retry on day 3 | nothing | `PaymentFailed` per attempt; grants kept to the end of day 3 (≤ 45 days past coverage); no order until paid |
| …the retry collects | — | booked as above; term 2 still starts the day after term 1 |
| …the gateway gives up | nothing | cancelled at the end of term; nothing refunded |
| Portal cancel at period end / withdrawn | AutoRenew stays on | AutoRenew off / on, `CancellationRequested` events |
| Dashboard cancel now | nothing | cancelled Immediately on that day |
| Renewed after Orders cancelled it (Q5) | refused | the same subscription reactivated, booked, Task for support |
| Unknown `sub_…` on a price Orders sells | nothing | one `UnknownGatewaySubscription` Task; nothing booked until linked |
| Unknown `sub_…` on another price (legacy $175) | nothing | nothing (`not_ours`) |
| An imported subscriber's current year (payment with the charge, no intent) | — | never booked again; the next renewal is |
| Renewal invoice with tax | — | not booked; urgent `RenewalNotBooked` (net booked + gross captured would leave credit) |
| Account switch (`BillsSubscriptions`) off | — | still followed: the switch gates new hand-overs only |

## Rules (each pinned by a test)

1. The gateway's records are the truth; events trigger a re-read (`SyncProviderSubscription`).
2. Money first, then failures and the access they keep, then the end state (`PlanProviderSubscriptionSync`, pure).
3. Book on the subscription's product, at what was charged (Q3); never refuse money taken, except a taxed renewal, which a person books.
3a. A paid invoice is a renewal only when the period it bills starts on or after the latest term's last day (`StartsUnbookedPeriod`, shared with the cancel gate); a charge an Orders payment already records is booked.
4. No order until the gateway is paid; keep access through the retry window; end it when the gateway gives up (Q4, Q-N4).
5. Only the gateway's renewal order may renew a gateway-billed subscription (`SanctionGatewayRenewal`); every other
   order is still refused (E2b).
6. A plan change at the gateway raises a Task; the product is not switched (Q-N7). Disputes are out of scope (Q-N8).
7. Q-N5 (`CapturePayment` with a Draft allocation): not needed. The booking confirms before it captures, as
   `CreateOrderFromProviderPayment` does.

## Tests

Unit: `ProviderSubscriptionSyncPlan.test.ts`, `StripeProviderSync.test.ts`, `GatewayRenewal.test.ts`,
`PaymentWebhookSubscriptionEvents.test.ts`, `ProviderRenewalBooking.test.ts`, `ProviderSubscriptionSync.test.ts`. Integration:
`subscription-renewal` SR75–SR92-OT.
