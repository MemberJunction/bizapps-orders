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
 * BUNDLES — one line per server bundle. Check counts are not kept here: `EXPECTED_BUNDLES` in
 * `src/__tests__/registry-parity.test.ts` holds them, and that test fails when a bundle is added or
 * a check removed without updating it. A bundle's check file header says what each check covers.
 *
 *   catalog-world              commit ORD-WORLD (people, orgs, catalog, GL) from CSV
 *   order-booking              confirm → one balanced JE per line, atomically; Draft may have no lines
 *   revenue-recognition        forward-dated release schedules (D14/D43)
 *   subscriptions              SubscriptionType rules → Subscription + terms (D45/D46)
 *   subscription-cancellation  Orders.CancelSubscription: policy → reversal (design §5)
 *   subscription-renewal       Orders.SpawnRenewals: the scheduled continuation (D55), charging the renewal card and the update-card link (#289)
 *   payments-rollups           rollup triggers, numbering, initial payment (D30/D39/D42)
 *   payment-ledger             the CASH leg: capture/refund journal entries, AR reconciliation (D17/D18)
 *   intercompany               cash on a multi-company order lands on the books of the company that owns each line
 *   events                     event products and one-time deferred revenue
 *   line-subscriber            per-line ship-to and BenefitModel dedupe scope (D61/D62)
 *   account-credit             the allocation invariant, over-payment, credit as tender (D68)
 *   pricing                    price resolution, the resolver walk, and the dry run (D69)
 *   promotions                 offers, codes, stacking, allocation, authorized manual discounts (D70)
 *   charges                    shipping, handling and TAX as one mechanism (D71)
 *   tax                        rate resolution by address, nexus, taxability and exemptions (D73)
 *   composition                one realistic order carrying EVERY stage at once
 *   returns                    money going BACK — the direction nothing was designed for (D16/D74)
 *   gift-cards                 issuance on sale, and the liability it creates (D44)
 *   bundles                    expansion into component lines, and the parentage that makes it usable (D32/D41/D45)
 *   fulfillment                the shipping queue and the flip that closes an order (D15)
 *   capture-payment            capturing an authorized payment through Orders.CapturePayment
 *   invoicing                  Orders: Generate Invoice, the order rendered as the document sent to a customer
 *   order-status               the order lifecycle, enforced on the real save path
 *   payment-terms              when an order is due, resolved at confirm and stored (D83)
 *   advance-order-state        Orders.AdvanceOrderState: a confirmed order's FulfillmentStatus moved to Fulfilled (D17)
 *   arithmetic-edges           the unit suite's hostile numbers, through the real pipeline
 *   concurrency                document numbering under contention, on a second connection (D30)
 *   volume                     populations, repeated purchases, and a SECOND MJ session
 *   entitlements               what a purchase confers, for how long, when payment gates it, and access override requests (D27/D76, #223, #360)
 *   entitlement-read           Orders.CheckEntitlement / ListEntitlements in-process Execute
 *   outbound-events            the outbound hook (#293) against a real database
 *   payment-providers          the gateway seam against a real database (D19/D37), orders from unmatched charges and the reconciliation (#481, #567)
 *   ach-settlement             money that arrives days late, and can leave again (D77/D78/D80)
 *   embedded-payment-detail    PaymentDetail as an owner-held 1:1 embed (D38/D39)
 *   payment-schedule           instalments on the order: tie, issue, per-instalment rollup and ageing (D85–D88)
 *   payment-deposit            cash ahead of billing is a deposit, and only the operation issues (D91)
 *   contract-reversal          reversing a scheduled order: withdraw, credit back, or refuse (D92 §6)
 *   concessions                concessions valued in any form, approved before the customer sees them
 *   term-extension             a booked term extended at no charge, with recognition, access and renewal following
 *   amount-change              lowering a booked term's amount: preview, record, approve and apply; credit-memo cases refused (#506)
 *   term-shift                 a booked term's start and end moved together, with recognition, access and instalments following
 *   party-roster               the Party Signals contract the shared party pickers read
 *   progress-measurement       percentage-of-completion by attested catch-up, and rule 2 choosing its contra account (D90, D92)
 *   billcom-rail               the Bill.com invoice rail through its gateway seam: send, cancel, poll, webhook, job gate (#591)
 *
 * The `wire-*` bundles (wire-crud, wire-entitlements, wire-party-keep, wire-volume) run the same
 * kind of checks over the GraphQL client transport. They register from `client-index.ts`, not this
 * file, because this file loads the *EntityServer subclasses.
 *
 * The runner's order is presentational — each bundle owns its own fixture.
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
import { LoadGeneratedEntities as LoadCommonEntities } from '@mj-biz-apps/common-entities';

LoadBizAppsAccountingServer();
LoadBizAppsOrdersServer();
// People / Organizations / Addresses / Relationships — without this, ClassFactory falls back to
// a raw BaseEntity and Common's own Save path never runs (see line-subscriber.checks.ts).
LoadCommonEntities();

export * from './fixture.js';
export * from './order-builder.js';
export * from './payment-builder.js';
export * from './world/world.js';
export * from './checks/catalog-world.checks.js';
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
export * from './checks/order-status.checks.js';
export * from './checks/payment-terms.checks.js';
export * from './checks/advance-order-state.checks.js';
export * from './checks/arithmetic-edges.checks.js';
export * from './checks/concurrency.checks.js';
export * from './checks/volume.checks.js';
export * from './checks/entitlements.checks.js';
export * from './checks/entitlement-read.checks.js';
export * from './checks/payment-providers.checks.js';
export * from './checks/ach-settlement.checks.js';
export * from './checks/embedded-payment-detail.checks.js';
export * from './checks/payment-schedule.checks.js';
export * from './checks/payment-deposit.checks.js';
export * from './checks/contract-reversal.checks.js';
export * from './checks/party-roster.checks.js';
export * from './checks/progress-measurement.checks.js';
export * from './checks/outbound-events.checks.js';
export * from './checks/concessions.checks.js';
export * from './checks/term-extension.checks.js';
export * from './checks/amount-change.checks.js';
export * from './checks/term-shift.checks.js';
export * from './checks/billcom-rail.checks.js';

/**
 * Tree-shake guard. Importing this module registers the bundles; calling this makes that
 * dependency explicit for a bundler that would otherwise drop a side-effect-only import.
 */
export function LoadOrdersIntegrationTests(): void {
    // intentionally empty
}
