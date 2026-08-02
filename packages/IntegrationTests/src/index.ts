/**
 * @mj-biz-apps/orders-integration-tests — BizApps Orders' integration-check content.
 *
 * PRIVATE, never published. Importing this module registers every check bundle on the shared
 * `IntegrationCheckRegistry` (from `@memberjunction/testing-integration`) as an import side effect —
 * that is the package's entire runtime job. The MJ testing CLI loads it via `mj.config.cjs`:
 *
 *     testing: { checkModules: ['@mj-biz-apps/orders-integration-tests'] }
 *
 * …and `IntegrationTestDriver` then expands each `MJ: Tests` record's `Configuration.checks[].type`
 * into that bundle's ordered checks. The same registry backs `test-harnesses/integration.mjs`, so
 * there is no drift between "what `mj test` runs" and "what the standalone runner runs".
 *
 * BUNDLES
 *   order-booking        OB1–OB9   confirm → one balanced JE per line, atomically
 *   revenue-recognition  RR1–RR7   forward-dated release schedules (D14/D43)
 *   subscriptions        SB1–SB12  SubscriptionType rules → Subscription + terms (D45/D46)
 *   subscription-cancellation SC1–SC10  Orders.CancelSubscription: policy → reversal (design §5)
 *   subscription-renewal      SR1–SR11  Orders.SpawnRenewals: the scheduled continuation (D55)
 *   payments-rollups     RU1–RU9   rollup triggers, numbering, initial payment (D30/D39/D42)
 *   payment-ledger       PL1–PL12  the CASH leg: capture/refund journal entries, AR reconciliation (D17/D18)
 *   line-subscriber      LS1–LS8   per-line ship-to and BenefitModel dedupe scope (D61/D62)
 *   account-credit       AC1–AC11  the allocation invariant, over-payment, credit as tender (D68)
 *   pricing              PC1–PC16  price resolution, the resolver walk, and the dry run (D69)
 *   promotions           PR1–PR15  offers, codes, stacking, allocation, authorized manual discounts (D70)
 *   charges              CH1–CH12  shipping, handling and TAX as one mechanism (D71)
 *   tax                  TX1–TX15  rate resolution by address, nexus, taxability and exemptions (D73)
 *   composition          CX1–CX10  one realistic order carrying EVERY stage at once
 *   returns              RT1–RT12  money going BACK — the direction nothing was designed for (D16/D74)
 *   arithmetic-edges     AE1–AE12  the unit suite's hostile numbers, through the real pipeline
 *   concurrency          CN1–CN6   document numbering under contention, on a second connection (D30)
 *   events               EV1–EV10  event products and one-time deferred revenue
 *   volume               VL1–VL13  populations, repeated purchases, and a SECOND MJ session
 *   entitlements         EN1–EN15  what a purchase confers, and for how long (D27/D76)
 *   payment-providers    PV1–PV12  the gateway seam against a real database (D19/D37)
 *   ach-settlement       AS1–AS17  money that arrives days late, and can leave again (D77/D78/D80)
 *
 * Note that `events` and `line-subscriber` are listed out of order above because that is the order
 * they were written in; the runner's order is presentational — each bundle owns its own fixture.
 *
 * Every check is `RequiresMutation` — this suite exists to write to the database. They are safe to
 * run repeatedly because each one rolls its transaction back; see `fixture.ts` for the model.
 *
 * To look at real rows rather than rolled-back ones, see `docs/reviewing-the-data.md`.
 */
// ─── Register the code under test ──────────────────────────────────────────────────────────────
//
// `mj test` loads ONLY the modules named in `testing.checkModules` — it has no reason to know about
// this app's server packages. Without these imports the ClassFactory never sees `OrderEntityServer`,
// every confirm runs against the plain generated entity, and the suite silently measures nothing:
// checks that expect a REJECTION still pass, because a save with no booking logic fails too.
// So the check package owns the registration.
import '@mj-biz-apps/accounting-server';
import '@mj-biz-apps/orders-server';
import { LoadBizAppsAccountingServer } from '@mj-biz-apps/accounting-server';
import { LoadBizAppsOrdersServer } from '@mj-biz-apps/orders-server';

LoadBizAppsAccountingServer();
LoadBizAppsOrdersServer();

export * from './fixture.js';
export * from './order-builder.js';
export * from './payment-builder.js';
export * from './checks/order-booking.checks.js';
export * from './checks/revenue-recognition.checks.js';
export * from './checks/subscriptions.checks.js';
export * from './checks/subscription-cancellation.checks.js';
export * from './checks/subscription-renewal.checks.js';
export * from './checks/line-subscriber.checks.js';
export * from './checks/payments-rollups.checks.js';
export * from './checks/payment-ledger.checks.js';
export * from './checks/intercompany.checks.js';
export * from './checks/events.checks.js';
export * from './checks/account-credit.checks.js';
export * from './checks/pricing.checks.js';
export * from './checks/promotions.checks.js';
export * from './checks/charges.checks.js';
export * from './checks/tax.checks.js';
export * from './checks/composition.checks.js';
export * from './checks/returns.checks.js';
export * from './checks/gift-cards.checks.js';
export * from './checks/bundles.checks.js';
export * from './checks/fulfillment.checks.js';
export * from './checks/capture-payment.checks.js';
export * from './checks/invoicing.checks.js';
export * from './checks/create-in-state.checks.js';
export * from './checks/arithmetic-edges.checks.js';
export * from './checks/concurrency.checks.js';
export * from './checks/volume.checks.js';
export * from './checks/entitlements.checks.js';
export * from './checks/payment-providers.checks.js';
export * from './checks/ach-settlement.checks.js';

/**
 * Tree-shake guard. Importing this module registers the bundles; calling this makes that
 * dependency explicit for a bundler that would otherwise drop a side-effect-only import.
 */
export function LoadOrdersIntegrationTests(): void {
    // intentionally empty
}
