/**
 * subscription-renewal.checks.ts — the `subscription-renewal` bundle (SR1–SR21).
 *
 * `Orders.SpawnRenewals` closes the subscription lifecycle: `AutoRenew` and `RenewalLeadDays` were
 * columns with no consumer, so a subscription reached the end of its term and simply stopped.
 *
 * The behaviour under test is a SCHEDULED JOB, which raises stakes ordinary code does not have —
 * it runs unattended, repeatedly, against live customers. So most of these checks are about what it
 * must NOT do: not renew a cancelled subscription, not renew one the customer opted out of, not
 * renew twice, not renew early.
 *
 * WHAT IT PROVES
 *   SR1   a subscription expiring inside its lead window gets a confirmed renewal order
 *   SR2   the renewal appends a CONTIGUOUS term N+1 to the SAME subscription
 *   SR3   the renewal order books, and the new term recognizes over its own window
 *   SR4   a subscription not yet inside its lead window is left alone
 *   SR5   AutoRenew = false is never renewed
 *   SR6   a canceled subscription is never renewed
 *   SR7   running the job twice does not renew twice (idempotency)
 *   SR8   a RejectDuplicate type still renews itself
 *   SR9   Subscription.RenewalLeadDays overrides the type's default
 *   SR10  Preview reports what is due without placing anything
 *   SR11  the renewal LINE links back via RenewsSubscriptionID and logs a lifecycle event
 *   SR12  the Action the scheduler dispatches reaches the operation and places the renewal
 *   SR13  Preview arrives from a scheduler as the STRING "true" and still writes nothing
 *   SR14  the schedule points at this Action, and ships disabled and set to preview
 *   SR15  the renewal carries one Invoiced schedule row per company, due on the invoice day plus the
 *         customer's terms capped at the term start, and AR is dated the business day it was
 *         invoiced, never on the new term's first day (#305)
 *   SR16  a renewal of a product recognised at sale books Dr Unbilled / Cr Sales, then the invoice
 *         moves it to AR (Dr AR / Cr Unbilled)
 *   SR17  the same renewal with no Unbilled Receivable account linked is skipped with the reason,
 *         and nothing is booked
 *   SR18  a subscription renews again at the end of the term its first renewal booked
 *   SR19  a renewal drafted by hand for this cycle holds the job off
 *   SR20  a voided renewal order does not hold the job off
 *   SR21  cancelling after the renewal is booked and invoiced reverses the renewal in full: the
 *         reversal points at the renewal order, and its credit memo takes the invoiced amount
 *         back off AR (#406)
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 */
import { BaseAction } from '@memberjunction/actions';
import type { RunActionParams } from '@memberjunction/actions-base';
import { BaseRemotableOperation } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';
import { OrdersEngine, Today } from '@mj-biz-apps/orders-entities';
import {
    ACCT_SCHEMA,
    CreateOrdersFixture,
    CreateProductPrice,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    SameID,
    TeardownOrdersFixture,
    TxMaybeOne,
    TxOne,
    TxQuery,
    upsertViaEntity,
} from '../fixture.js';
import { GL_ACCOUNT_LINK_ENTITY, PRODUCT_ENTITY } from '../entity-names.js';
import { BuildOrder, ConfirmOrder } from '../order-builder.js';

/** Chart of accounts the fixture books against (same codes as payment-schedule.checks.ts). */
const AR_CODE = '11201';
const DEFERRED_CODE = '21301';
const SALES_CODE = '40100';
const UNBILLED_CODE = '11300';

/** Bought Jan 1 so an annual term ends Dec 31 — every date below reads off that. */
const JAN_1 = new Date('2026-01-01T00:00:00Z');

interface RenewalOutput {
    Success: boolean;
    Message?: string;
    Candidates: Array<{
        SubscriptionID: string;
        SubscriptionNumber: string;
        CurrentTermEnd: string;
        LeadDays: number;
        OrderID?: string;
        OrderNumber?: string;
        SkippedReason?: string;
    }>;
    Placed: number;
    Skipped: number;
}

async function spawnRenewals(
    ctx: IntegrationCheckContext,
    input: Record<string, unknown>,
): Promise<RenewalOutput> {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<
        BaseRemotableOperation<Record<string, unknown>, RenewalOutput>
    >(BaseRemotableOperation, 'Orders.SpawnRenewals');
    Assert(op != null, "'Orders.SpawnRenewals' is not registered");

    const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
    Assert(
        result.Success,
        `the operation did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown'}`,
    );
    Assert(result.Output != null, 'the operation returned no payload');
    return result.Output as RenewalOutput;
}

/** Buy a subscription on Jan 1 and return its ID and first term. */
async function buySubscription(ctx: IntegrationCheckContext, productKey: string, price: number) {
    const f = Fx();
    const result = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        OrderDate: JAN_1,
        BillToOrganizationID: f.Customers.OrganizationID,
        Lines: [{ ProductID: f.Products[productKey], Quantity: 1, UnitPrice: price }],
    });
    Assert(result.Saved, `confirm failed: ${result.Message}`);

    const term = await TxOne<{ ID: string; SubscriptionID: string; EndDate: string; TermNumber: number }>(
        ctx,
        `SELECT st.ID, st.SubscriptionID, st.EndDate, st.TermNumber
         FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
         JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
         WHERE ol.OrderHeaderID = '${result.Order.ID}'`,
    );
    return { OrderID: result.Order.ID as string, SubscriptionID: term.SubscriptionID, Term: term };
}

/** All terms on a subscription, oldest first. */
const termsOf = (ctx: IntegrationCheckContext, subscriptionID: string) =>
    TxQuery<{ ID: string; TermNumber: number; StartDate: string; EndDate: string; Amount: number }>(
        ctx,
        `SELECT ID, TermNumber, StartDate, EndDate, Amount FROM ${ORDERS_SCHEMA}.SubscriptionTerm
         WHERE SubscriptionID = '${subscriptionID}' ORDER BY TermNumber`,
    );

const isoDate = (v: string | Date) => new Date(v).toISOString().slice(0, 10);

/** A date `days` before the given one — used to sit just inside or outside a lead window. */
function daysBefore(date: string, days: number): string {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
}

/** A renewal of this subscription saved as a Draft, dated the day after the term ends. */
async function draftRenewal(ctx: IntegrationCheckContext, subscriptionID: string, termEnd: string) {
    const f = Fx();
    const built = await BuildOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        OrderDate: new Date(daysBefore(termEnd, -1)),
        BillToOrganizationID: f.Customers.OrganizationID,
        Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200, RenewsSubscriptionID: subscriptionID }],
    });
    Assert(await built.Order.Save(), `saving the draft renewal failed: ${built.Order.LatestResult?.CompleteMessage}`);
    return built.Order;
}

/** `Orders.CancelSubscription`, resolved through the ClassFactory as any caller does. */
async function cancelSubscription(
    ctx: IntegrationCheckContext,
    input: Record<string, unknown>,
): Promise<{ Success: boolean; Message?: string; TotalRefundAmount?: number; ReversalOrderID?: string }> {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<
        BaseRemotableOperation<Record<string, unknown>, { Success: boolean; Message?: string; TotalRefundAmount?: number; ReversalOrderID?: string }>
    >(BaseRemotableOperation, 'Orders.CancelSubscription');
    Assert(op != null, "'Orders.CancelSubscription' is not registered");
    const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
    Assert(result.Success, `the operation did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown'}`);
    Assert(result.Output != null, 'the operation returned no payload');
    return result.Output!;
}

/** The key both the Action metadata and the `@RegisterClass` decorator name. */
const ACTION_DRIVER_CLASS = 'Orders.SpawnRenewals';

/**
 * Run the renewal Action the way the scheduler runs it — resolved from the ClassFactory under the
 * key the metadata names, with every parameter a STRING, because that is what a `ScheduledJob`
 * Configuration stores. Importing the class instead would prove the code works and prove nothing
 * about whether the scheduler can find it or survive its own encoding.
 */
async function spawnRenewalsViaAction(
    ctx: IntegrationCheckContext,
    inputs: Record<string, string>,
): Promise<{ Success: boolean; ResultCode?: string; Message?: string; Placed: number; Skipped: number; Candidates: RenewalOutput['Candidates'] }> {
    // TryCreateInstance, not CreateInstance. `CreateInstance` does not return null for an
    // unregistered key — it hands back `new BaseAction()`, because `abstract` is erased at runtime
    // and BaseAction carries no @RequiresSubclass marker. A `!= null` assert can therefore never
    // fire, and a missing Load anchor would surface as a TypeError from `.Run()` about
    // InternalRunAction rather than as the one sentence that names the cause.
    const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseAction>(BaseAction, ACTION_DRIVER_CLASS);
    Assert(
        resolved.Resolved && resolved.Instance != null,
        `'${ACTION_DRIVER_CLASS}' is not registered — the Load anchor is missing from the server bootstrap${resolved.Reason ? `: ${resolved.Reason}` : ''}`,
    );
    const action = resolved.Instance!;

    const params = {
        ContextUser: ctx.User,
        Provider: ctx.Provider,
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: 'Input' as const })),
        Filters: [],
    } as unknown as RunActionParams;

    const result = await action.Run(params);
    const output = <T,>(name: string): T | undefined =>
        params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase())?.Value as T | undefined;

    return {
        Success: result.Success,
        ResultCode: result.ResultCode,
        Message: result.Message,
        Placed: Number(output<number>('Placed') ?? 0),
        Skipped: Number(output<number>('Skipped') ?? 0),
        Candidates: output<RenewalOutput['Candidates']>('Candidates') ?? [],
    };
}

export const SubscriptionRenewalChecks: NamedCheck[] = [
    {
        Id: 'subscription-renewal.SR1',
        Name: 'SR1: a subscription inside its lead window gets a renewal order',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // AnnualRolling: 90 lead days. Term runs 2026-01-01 → 2026-12-31.
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                const out = await spawnRenewals(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                AssertEqual(out.Candidates.length, 1, 'candidates');
                AssertEqual(Number(out.Candidates[0].LeadDays), 90, "lead days from the type's default");
                Assert(
                    /^ORD-\d{6}$/.test(out.Candidates[0].OrderNumber ?? ''),
                    `the renewal gets a real order number, got '${out.Candidates[0].OrderNumber}'`,
                );
            }),
    },
    {
        Id: 'subscription-renewal.SR2',
        Name: 'SR2: the renewal appends a contiguous term to the same subscription',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'the subscription now has two terms');
                AssertEqual(Number(terms[1].TermNumber), 2, 'the new term number');

                // Contiguous: coverage must not gap, or the customer is uninsured for a day.
                AssertEqual(
                    isoDate(terms[1].StartDate),
                    isoDate(daysBefore(terms[0].EndDate, -1)),
                    'term 2 starts the day after term 1 ends',
                );
                AssertEqual(isoDate(terms[1].EndDate), '2027-12-31', 'a full further year');
                AssertEqual(Number(terms[1].Amount), 1200, 'renewed at the price last paid');
            }),
    },
    {
        Id: 'subscription-renewal.SR3',
        Name: 'SR3: the renewal books and recognizes over the new term',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const renewalOrderID = out.Candidates[0].OrderID!;

                // Billed by its one-row schedule (#305, D92): the value entry is the instalment's
                // invoice, raised inside the confirm, not a booking entry on the line.
                const billing = await TxOne<{ EntryType: string; D: number }>(
                    ctx,
                    `SELECT (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) AS EntryType,
                            (SELECT SUM(DebitAmount) FROM ${ACCT_SCHEMA}.JournalEntryLine WHERE JournalEntryID = je.ID) AS D
                     FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule ps
                     JOIN ${ACCT_SCHEMA}.vwJournalEntries je ON je.ID = ps.JournalEntryID
                     WHERE ps.OrderHeaderID = '${renewalOrderID}'`,
                );
                AssertEqual(billing.EntryType, 'InstalmentInvoice', 'the renewal is billed by its instalment invoice');
                AssertEqual(Number(billing.D), 1200, 'billed amount');

                // Recognition anchors to the NEW term and is dated into its window (D14/D46) —
                // invoicing ahead of the period must not recognize ahead of it.
                const terms = await termsOf(ctx, SubscriptionID);
                const releases = await TxQuery<{ EffectiveDate: string; D: number }>(
                    ctx,
                    `SELECT je.EffectiveDate,
                            (SELECT SUM(DebitAmount) FROM ${ACCT_SCHEMA}.JournalEntryLine WHERE JournalEntryID = je.ID) AS D
                     FROM ${ACCT_SCHEMA}.vwJournalEntries je
                     WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'RevenueRecognition' AND je.LinkedRecordID = '${terms[1].ID}'`,
                );
                AssertEqual(releases.length, 12, 'monthly releases over the renewed year');
                AssertEqual(
                    Math.round(releases.reduce((t, r) => t + Number(r.D), 0) * 100) / 100,
                    1200,
                    'releases sum to the renewed term',
                );
                Assert(
                    releases.every((r) => isoDate(r.EffectiveDate) >= isoDate(terms[1].StartDate)),
                    'no release may fall before the term it earns',
                );
            }),
    },
    {
        Id: 'subscription-renewal.SR4',
        Name: 'SR4: a subscription outside its lead window is left alone',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                // 150 days out, with a 90-day lead — renewing here would invoice two months early.
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 150) });
                AssertEqual(out.Placed, 0, `nothing should be placed yet: ${out.Message}`);
                AssertEqual(out.Candidates.length, 0, 'not even a candidate');

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 1, 'still one term');
            }),
    },
    {
        Id: 'subscription-renewal.SR5',
        Name: 'SR5: a subscription with AutoRenew off is never renewed',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.Subscription SET AutoRenew = 0 WHERE ID = '${SubscriptionID}'`,
                );

                // AutoRenew is the consent switch: without it the system has no standing authority
                // to bill again, so the term simply ends.
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 0, `opted out, so nothing may be placed: ${out.Message}`);
                AssertEqual(out.Candidates.length, 0, 'not a candidate at all');
            }),
    },
    {
        Id: 'subscription-renewal.SR6',
        Name: 'SR6: a canceled subscription is never renewed',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.Subscription SET Status = 'Canceled' WHERE ID = '${SubscriptionID}'`,
                );

                // Resurrecting a cancelled subscription by an unattended job is the single worst
                // thing this operation could do.
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 0, `a canceled subscription must not renew: ${out.Message}`);
                AssertEqual(out.Candidates.length, 0, 'not a candidate at all');
            }),
    },
    {
        Id: 'subscription-renewal.SR7',
        Name: 'SR7: running the job twice does not renew twice',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const asOf = daysBefore(Term.EndDate, 10);

                const first = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(first.Placed, 1, `first pass places one: ${first.Message}`);

                // A scheduled job runs every day. Double-billing a customer because yesterday's pass
                // already renewed them is the failure this guards.
                const second = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(second.Placed, 0, `second pass must place nothing: ${second.Message}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'still exactly two terms');

                const orders = await TxQuery(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${SubscriptionID}'`,
                );
                AssertEqual(orders.length, 1, 'exactly one renewal line exists');
            }),
    },
    {
        Id: 'subscription-renewal.SR8',
        Name: 'SR8: a RejectDuplicate type still renews itself',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // SubFiscal is ConcurrencyMode=RejectDuplicate. That rule answers "may this
                // subscriber hold a SECOND concurrent subscription?" — a renewal is not a second
                // one, it is this one continuing. Without the IsRenewal bypass the type would
                // refuse to renew itself, every cycle, silently.
                // SubFiscal's engine price, so the stated 900 is not a concession the confirm gate holds.
                await CreateProductPrice(ctx, Fx().Products.SubFiscal, 900);
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubFiscal', 900);

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `a RejectDuplicate type must still renew: ${out.Message}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'the renewal extended rather than being refused');

                const subs = await TxQuery(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${SubscriptionID}'`,
                );
                AssertEqual(subs.length, 1, 'and did not create a second subscription');
            }),
    },
    {
        Id: 'subscription-renewal.SR9',
        Name: "SR9: the subscription's own lead days override the type's default",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                // The type says 90; this subscription says 150 — the NULL-means-inherit rule the
                // schema documents, exercised in its non-NULL direction. 120 days out is OUTSIDE
                // the type's window and INSIDE the override's, so only the override can explain a
                // renewal here.
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.Subscription SET RenewalLeadDays = 150 WHERE ID = '${SubscriptionID}'`,
                );

                const asOf = daysBefore(Term.EndDate, 120);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(out.Placed, 1, `120 days out is inside a 150-day window: ${out.Message}`);
                AssertEqual(Number(out.Candidates[0].LeadDays), 150, 'the override was applied, not the default');
            }),
    },
    {
        Id: 'subscription-renewal.SR10',
        Name: 'SR10: Preview reports what is due without placing anything',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                const out = await spawnRenewals(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                    Preview: true,
                });
                AssertEqual(out.Placed, 0, 'a preview places nothing');
                AssertEqual(out.Candidates.length, 1, 'but still reports what is due');
                Assert(out.Candidates[0].OrderID == null, 'no order id on a preview');

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 1, 'no term was created');
                const orders = await TxQuery(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${SubscriptionID}'`,
                );
                AssertEqual(orders.length, 0, 'no order was placed');
            }),
    },
    {
        Id: 'subscription-renewal.SR11',
        Name: 'SR11: the renewal order links back to the subscription and logs an event',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);

                // A system-placed order must be traceable to what caused it — otherwise an
                // unexplained invoice appears on the customer's account with no origin.
                // The marker lives on the LINE now (D61) — renewal is a per-line act, so one order
                // could renew several subscriptions and a header-level pointer could not say so.
                const order = await TxOne<{ RenewsSubscriptionID: string; OrderType: string; Notes: string }>(
                    ctx,
                    `SELECT ol.RenewsSubscriptionID, o.OrderType, o.Notes
                     FROM ${ORDERS_SCHEMA}.OrderHeader o
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.OrderHeaderID = o.ID
                     WHERE o.ID = '${out.Candidates[0].OrderID}'`,
                );
                Assert(SameID(order.RenewsSubscriptionID, SubscriptionID), 'the line names the subscription it renews');
                AssertEqual(order.OrderType, 'Sale', 'a renewal is an ordinary sale');
                Assert(/renewal/i.test(order.Notes ?? ''), `the note explains its origin: ${order.Notes}`);

                const event = await TxOne<{ EventType: string; EventData: string; RelatedOrderHeaderID: string }>(
                    ctx,
                    `SELECT EventType, EventData, RelatedOrderHeaderID FROM ${ORDERS_SCHEMA}.SubscriptionEvent
                     WHERE SubscriptionID = '${SubscriptionID}' AND EventType = 'RenewalOrderSpawned'`,
                );
                Assert(
                    SameID(event.RelatedOrderHeaderID, out.Candidates[0].OrderID),
                    'the event links to the order it spawned',
                );
                const data = JSON.parse(event.EventData) as Record<string, unknown>;
                AssertEqual(Number(data.LeadDays), 90, `the event records the lead time applied: ${event.EventData}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR12',
        Name: 'SR12: the Action the scheduler dispatches places the renewal',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                // SR1 already proves the operation renews. What is unproven until here is the only
                // thing the schedule actually depends on: that the Action reaches it. The operation
                // has been correct and uncalled since it was written — a shim that silently does
                // nothing would reproduce exactly the symptom this bundle exists to prevent.
                const out = await spawnRenewalsViaAction(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                });
                Assert(out.Success, `the action did not run: ${out.ResultCode} ${out.Message}`);
                AssertEqual(out.Placed, 1, `expected one renewal through the action: ${out.Message}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'and the term it bought is on the subscription');
            }),
    },
    {
        Id: 'subscription-renewal.SR13',
        Name: 'SR13: Preview survives the scheduler storing it as the string "true"',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                // A ScheduledJob stores every parameter as text, so a job configured for preview
                // hands the action the STRING "true" — and "false" is a truthy string. Read as a
                // plain boolean, a job set to preview bills real customers, and it does it on the
                // one run nobody expected to write anything.
                const out = await spawnRenewalsViaAction(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                    Preview: 'true',
                });
                Assert(out.Success, `the action did not run: ${out.ResultCode} ${out.Message}`);
                AssertEqual(out.ResultCode, 'PREVIEWED', 'and it reports the run as a preview');
                AssertEqual(out.Placed, 0, 'a preview places nothing');
                AssertEqual(out.Candidates.length, 1, 'but still reports what is due');

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 1, 'no term was created');

                // The other half of the trap: "false" must not read as truthy either.
                const live = await spawnRenewalsViaAction(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                    Preview: 'false',
                });
                AssertEqual(live.Placed, 1, `"false" means place them: ${live.Message}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR14',
        Name: 'SR14: the schedule points at the action, and ships disabled and set to preview',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const action = await TxMaybeOne<{ ID: string; DriverClass: string; Status: string }>(
                    ctx,
                    `SELECT ID, DriverClass, Status FROM __mj.Action WHERE Name = 'Spawn Renewals'`,
                );
                Assert(action != null, 'the action row exists — push the app metadata if not');
                AssertEqual(action!.Status, 'Active', 'and it is active');
                AssertEqual(action!.DriverClass, ACTION_DRIVER_CLASS, 'pointing at the registered key');

                const job = await TxMaybeOne<{ Configuration: string; Status: string; CronExpression: string }>(
                    ctx,
                    `SELECT Configuration, Status, CronExpression FROM __mj.ScheduledJob WHERE Name = N'Orders — Spawn Renewals (daily)'`,
                );
                Assert(job != null, 'the scheduled job row exists — push the app metadata if not');

                // The failure this catches is the expensive one: a job whose Configuration names an
                // ActionID that no longer exists runs every night, fails every night, and renews
                // nobody — which looks exactly like the subscriptions not being due yet.
                const config = JSON.parse(job!.Configuration ?? '{}') as { ActionID?: string; Params?: Array<{ ActionParamID: string; Value: string }> };
                Assert(
                    config.ActionID != null && SameID(config.ActionID, action!.ID),
                    `the job's Configuration names this action: ${job!.Configuration}`,
                );

                // Shipping it live would start billing customers on whatever day this metadata
                // reached a host, with nobody having read the list first. Going live is a decision,
                // not a deployment.
                AssertEqual(job!.Status, 'Disabled', 'and it ships disabled');

                const previewParam = await TxMaybeOne<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM __mj.ActionParam WHERE ActionID = '${action!.ID}' AND Name = 'Preview'`,
                );
                Assert(previewParam != null, 'the Preview parameter is declared');
                const configured = config.Params?.find((p) => SameID(p.ActionParamID, previewParam!.ID));
                AssertEqual(String(configured?.Value), 'true', `and the job is configured for preview: ${job!.Configuration}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR15',
        Name: 'SR15: the renewal is invoiced on the pass day through a one-row schedule, and AR is not dated on the term start',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Net 30 for the seller, and a pass 60 days out, so invoice day + 30 lands before
                // the term start and the cap does not decide the date (#305 review item 1).
                await setCompanyDefaultTerms(ctx, 'Net30');
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const asOf = daysBefore(Term.EndDate, 60);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const orderID = out.Candidates[0].OrderID!;
                const header = await TxOne<{ OrderDate: string; DueDate: string }>(
                    ctx,
                    `SELECT CONVERT(varchar(10), OrderDate, 23) AS OrderDate, CONVERT(varchar(10), DueDate, 23) AS DueDate
                     FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`,
                );
                AssertEqual(header.DueDate, daysBefore(header.OrderDate, -30), 'precondition: the order resolved Net 30');

                const companies = await TxQuery<{ CompanyID: string }>(
                    ctx,
                    `SELECT DISTINCT CompanyID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`,
                );
                const rows = await TxQuery<{ CompanyID: string; InstallmentNumber: number; DueDate: string; Amount: number; Status: string; DocumentNumber: string | null; InvoicedAt: string | null }>(
                    ctx,
                    `SELECT CompanyID, InstallmentNumber, CONVERT(varchar(10), DueDate, 23) AS DueDate, Amount, Status,
                            DocumentNumber, CONVERT(varchar(40), InvoicedAt, 127) AS InvoicedAt
                     FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${orderID}'`,
                );
                AssertEqual(rows.length, companies.length, 'exactly one schedule row per company on the renewal');
                const row = rows[0];
                Assert(SameID(row.CompanyID, companies[0].CompanyID), 'the row bills the line company');
                AssertEqual(Number(row.InstallmentNumber), 1, 'a single instalment');
                AssertEqual(Number(row.Amount), 1200, 'for the whole renewal');
                AssertEqual(row.DueDate, daysBefore(asOf, -30), 'due on the invoice day plus the customer terms');
                AssertEqual(row.Status, 'Invoiced', 'issued inside the confirm');
                Assert(!!row.DocumentNumber, 'with an invoice number');
                Assert(row.InvoicedAt != null, 'and an invoice timestamp');

                // Every AR line the order raised, from confirm (line entries) and from the instalment.
                const ar = await TxQuery<{ EffectiveDate: string; DebitAmount: number; CreditAmount: number }>(
                    ctx,
                    `SELECT CONVERT(varchar(10), je.EffectiveDate, 23) AS EffectiveDate, jel.DebitAmount, jel.CreditAmount
                     FROM ${ACCT_SCHEMA}.vwJournalEntries je
                     JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
                     JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                     WHERE gl.Code = '${AR_CODE}'
                       AND (je.ID IN (SELECT JournalEntryID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}')
                         OR je.ID IN (SELECT JournalEntryID FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${orderID}'))`,
                );
                // The BUSINESS day the instalment was issued (#209), which is what the entry is
                // dated by — not the UTC day of the InvoicedAt instant.
                const invoiceDay = Today();
                const orderDay = isoDate(daysBefore(Term.EndDate, -1));
                AssertEqual(
                    Math.round(ar.reduce((t, l) => t + Number(l.DebitAmount ?? 0) - Number(l.CreditAmount ?? 0), 0) * 100) / 100,
                    1200,
                    `the renewal is a receivable of its whole value: ${JSON.stringify(ar)}`,
                );
                Assert(ar.every((l) => l.EffectiveDate === invoiceDay), `all AR is dated the invoice day ${invoiceDay}: ${JSON.stringify(ar)}`);
                Assert(invoiceDay !== orderDay, `the check needs the invoice day and the order date apart (${invoiceDay})`);
                Assert(!ar.some((l) => l.EffectiveDate === orderDay), `no AR on the order date ${orderDay}`);

                // D92 rule 1: nothing is recognised yet, so the invoice credits Deferred for all of it.
                const deferred = await TxOne<{ C: number }>(
                    ctx,
                    `SELECT SUM(ISNULL(jel.CreditAmount, 0) - ISNULL(jel.DebitAmount, 0)) AS C
                     FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule ps
                     JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = ps.JournalEntryID
                     JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                     WHERE ps.OrderHeaderID = '${orderID}' AND gl.Code = '${DEFERRED_CODE}'`,
                );
                AssertEqual(Number(deferred.C), 1200, 'the invoice credits Deferred Revenue for the whole renewal');

                // THE CAP. A second subscription renewed 10 days out: invoice day + 30 would be past
                // the term start, so the row is due on the order date instead — and still issued.
                // A different product: a second SubRolling for the same buyer stacks onto the first.
                const second = await buySubscription(ctx, 'SubCalendar', 1200);
                const lateAsOf = daysBefore(second.Term.EndDate, 10);
                const late = await spawnRenewals(ctx, { SubscriptionID: second.SubscriptionID, AsOfDate: lateAsOf });
                AssertEqual(late.Placed, 1, `expected the second renewal: ${late.Message} ${late.Candidates[0]?.SkippedReason ?? ''}`);
                const capped = await TxOne<{ DueDate: string; Status: string; OrderDate: string }>(
                    ctx,
                    `SELECT CONVERT(varchar(10), ps.DueDate, 23) AS DueDate, ps.Status, CONVERT(varchar(10), oh.OrderDate, 23) AS OrderDate
                     FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule ps
                     JOIN ${ORDERS_SCHEMA}.OrderHeader oh ON oh.ID = ps.OrderHeaderID
                     WHERE ps.OrderHeaderID = '${late.Candidates[0].OrderID}'`,
                );
                AssertEqual(capped.DueDate, capped.OrderDate, 'capped at the order date');
                Assert(daysBefore(lateAsOf, -30) > capped.OrderDate, 'the check needs invoice day + 30 past the term start');
                AssertEqual(capped.Status, 'Invoiced', 'and confirm still issued it');
            }),
    },
    {
        Id: 'subscription-renewal.SR16',
        Name: 'SR16: a renewal of a product recognised at sale books to Unbilled, then the invoice moves it to AR',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await withUpFrontRecognition(ctx, Fx().Products.SubRolling, () =>
                    spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) }),
                );
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const orderID = out.Candidates[0].OrderID!;

                const booking = await ledgerOf(ctx, `SELECT JournalEntryID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`);
                AssertEqual(netOn(booking, UNBILLED_CODE), 1200, `confirm debits Unbilled 1,200: ${JSON.stringify(booking)}`);
                AssertEqual(netOn(booking, SALES_CODE), -1200, 'and credits Sales 1,200');
                AssertEqual(netOn(booking, AR_CODE), 0, 'with no AR at confirm');

                const invoice = await ledgerOf(ctx, `SELECT JournalEntryID FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${orderID}'`);
                AssertEqual(netOn(invoice, AR_CODE), 1200, `the invoice debits AR 1,200: ${JSON.stringify(invoice)}`);
                AssertEqual(netOn(invoice, UNBILLED_CODE), -1200, 'and credits Unbilled 1,200');
                AssertEqual(netOn(invoice, DEFERRED_CODE), 0, 'with nothing deferred');
            }),
    },
    {
        Id: 'subscription-renewal.SR17',
        Name: 'SR17: with no Unbilled Receivable linked, that renewal is skipped with the reason and nothing is booked',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await withUnbilledUnlinked(ctx, () =>
                    withUpFrontRecognition(ctx, Fx().Products.SubRolling, () =>
                        spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) }),
                    ),
                );
                AssertEqual(out.Placed, 0, `nothing is placed: ${out.Message}`);
                AssertEqual(out.Skipped, 1, 'the subscription is reported as skipped');
                const reason = out.Candidates[0].SkippedReason ?? '';
                Assert(reason.includes('Unbilled Receivable'), `the reason names the missing account: ${reason}`);
                Assert(reason.includes(out.Candidates[0].SubscriptionNumber), `and the subscription: ${reason}`);

                const renewalLines = await TxOne<{ N: number }>(
                    ctx,
                    `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${SubscriptionID}'`,
                );
                AssertEqual(Number(renewalLines.N), 0, 'no renewal order survives');
                AssertEqual((await termsOf(ctx, SubscriptionID)).length, 1, 'and no new term');
            }),
    },
    {
        Id: 'subscription-renewal.SR18',
        Name: 'SR18: a subscription renews again at the end of the term its first renewal booked',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                const first = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(first.Placed, 1, `first cycle places one: ${first.Message}`);
                const second = (await termsOf(ctx, SubscriptionID))[1];
                Assert(second != null, 'the first renewal booked term 2');

                // The first renewal's line still names the subscription. It must not read as this
                // cycle's renewal, or every subscription stops after renewing once.
                const next = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(second.EndDate, 10) });
                AssertEqual(next.Placed, 1, `second cycle places one: ${next.Message} ${next.Candidates[0]?.SkippedReason ?? ''}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 3, 'three terms');
                AssertEqual(terms[2].TermNumber, 3, 'the new term is term 3');
                AssertEqual(
                    isoDate(terms[2].StartDate),
                    isoDate(daysBefore(second.EndDate, -1)),
                    'term 3 starts the day after term 2 ends',
                );

                const again = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(second.EndDate, 10) });
                AssertEqual(again.Placed, 0, `re-running the second cycle places nothing: ${again.Message}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR19',
        Name: 'SR19: a renewal drafted by hand for this cycle holds the job off',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const draft = await draftRenewal(ctx, SubscriptionID, Term.EndDate);

                // A person is already renewing this cycle. A second, automatic order would bill
                // the customer twice once theirs is confirmed.
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 0, `a drafted renewal must hold the job off: ${out.Message}`);
                Assert(
                    /already exists/.test(out.Candidates[0]?.SkippedReason ?? ''),
                    `and says why: ${out.Candidates[0]?.SkippedReason}`,
                );
                AssertEqual((await termsOf(ctx, SubscriptionID)).length, 1, 'no term was added');
                Assert(draft.ID != null, 'the draft is still there');
            }),
    },
    {
        Id: 'subscription-renewal.SR20',
        Name: 'SR20: a voided renewal order does not hold the job off',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const draft = await draftRenewal(ctx, SubscriptionID, Term.EndDate);
                draft.Status = 'Voided';
                Assert(await draft.Save(), `voiding the draft failed: ${draft.LatestResult?.CompleteMessage}`);

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `a voided renewal renews nothing, so the job places one: ${out.Message}`);
                AssertEqual((await termsOf(ctx, SubscriptionID)).length, 2, 'term 2 was added');
            }),
    },
    {
        Id: 'subscription-renewal.SR21',
        Name: 'SR21: cancelling after the renewal is booked and invoiced reverses the renewal in full',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // AnnualRolling: EndOfTerm, NoRefund. Term 1 rides out; term 2 never starts.
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 30) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const renewalID = out.Candidates[0].OrderID!;
                const renewalLine = await TxOne<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${renewalID}'`,
                );
                const invoiced = await TxOne<{ Status: string }>(
                    ctx,
                    `SELECT Status FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${renewalID}'`,
                );
                AssertEqual(invoiced.Status, 'Invoiced', 'precondition: the renewal is billed by its one-row schedule');

                const cancelled = await cancelSubscription(ctx, { SubscriptionID, RequestDate: daysBefore(Term.EndDate, 21) });
                Assert(cancelled.Success, `the cancel must succeed: ${cancelled.Message}`);
                AssertEqual(cancelled.TotalRefundAmount, 1200, 'the whole renewal comes back');

                const terms = await TxQuery<{ TermNumber: number; Status: string }>(
                    ctx,
                    `SELECT TermNumber, Status FROM ${ORDERS_SCHEMA}.SubscriptionTerm
                     WHERE SubscriptionID = '${SubscriptionID}' ORDER BY TermNumber`,
                );
                AssertEqual(terms.map((t) => t.Status).join(','), 'Completed,Canceled', 'term 1 rides out, term 2 is canceled');

                const reversal = await TxOne<{ Status: string; ReversesOrderHeaderID: string | null }>(
                    ctx,
                    `SELECT Status, ReversesOrderHeaderID FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${cancelled.ReversalOrderID}'`,
                );
                AssertEqual(reversal.Status, 'Confirmed', 'the reversal is booked');
                Assert(SameID(reversal.ReversesOrderHeaderID ?? '', renewalID), 'and points at the renewal order');
                const lines = await TxQuery<{ ReversesOrderLineID: string; Quantity: number }>(
                    ctx,
                    `SELECT ReversesOrderLineID, Quantity FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${cancelled.ReversalOrderID}'`,
                );
                AssertEqual(lines.length, 1, 'one reversal line');
                Assert(SameID(lines[0].ReversesOrderLineID, renewalLine.ID), 'reversing the renewal line');
                AssertEqual(Number(lines[0].Quantity), -1, 'in full');

                // The invoiced 1,200 is credited back off AR by the reversal's credit memo.
                const ledger = await ledgerOf(
                    ctx,
                    `SELECT je.ID FROM ${ACCT_SCHEMA}.vwJournalEntries je
                     WHERE je.LinkedRecordID IN (SELECT CAST(ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.OrderLine
                                                 WHERE OrderHeaderID = '${cancelled.ReversalOrderID}')`,
                );
                AssertEqual(netOn(ledger, AR_CODE), -1200, `the credit memo credits AR the invoiced amount: ${JSON.stringify(ledger)}`);
                const billed = await TxOne<{ BilledToDate: number }>(
                    ctx,
                    `SELECT BilledToDate FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${renewalLine.ID}'`,
                );
                AssertEqual(Number(billed.BilledToDate), 0, 'the renewal line is no longer billed');
            }),
    },
];

/** Give the fixture's selling company a default terms row by code (rolled back with the check). */
async function setCompanyDefaultTerms(ctx: IntegrationCheckContext, code: string): Promise<void> {
    const companyID = Fx().CoA.ID;
    await TxQuery(
        ctx,
        `DECLARE @t UNIQUEIDENTIFIER = (SELECT ID FROM ${ORDERS_SCHEMA}.PaymentTermsType WHERE Code = '${code}');
         IF EXISTS (SELECT 1 FROM ${ORDERS_SCHEMA}.OrderCompanyPolicy WHERE ID = '${companyID}')
           UPDATE ${ORDERS_SCHEMA}.OrderCompanyPolicy SET DefaultPaymentTermsTypeID = @t WHERE ID = '${companyID}';
         ELSE
           INSERT INTO ${ORDERS_SCHEMA}.OrderCompanyPolicy (ID, DefaultPaymentTermsTypeID) VALUES ('${companyID}', @t);`,
    );
}

/**
 * Run `body` with a product recognised at sale. Through the object model with the catalog engine
 * reloaded, because booking reads products from `OrdersEngine`'s cache; put back the same way
 * before the transaction rolls back, or the cache would carry it into the next check.
 */
async function withUpFrontRecognition<T>(ctx: IntegrationCheckContext, productID: string, body: () => Promise<T>): Promise<T> {
    const was = await TxOne<{ RevenueRecognitionTypeID: string | null }>(
        ctx,
        `SELECT RevenueRecognitionTypeID FROM ${ORDERS_SCHEMA}.Product WHERE ID = '${productID}'`,
    );
    const upFront = Fx().RevRecTypeIDs.get('UpFront');
    Assert(upFront != null, "RevRec type 'UpFront' missing from the fixture");
    await upsertViaEntity(ctx, PRODUCT_ENTITY, productID, { RevenueRecognitionTypeID: upFront });
    await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
    try {
        return await body();
    } finally {
        await upsertViaEntity(ctx, PRODUCT_ENTITY, productID, { RevenueRecognitionTypeID: was.RevenueRecognitionTypeID });
        await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
    }
}

/** Run `body` with the selling company's Unbilled Receivable link disabled, restored the same way. */
async function withUnbilledUnlinked<T>(ctx: IntegrationCheckContext, body: () => Promise<T>): Promise<T> {
    const links = await TxQuery<{ ID: string }>(
        ctx,
        `SELECT l.ID FROM ${ACCT_SCHEMA}.GLAccountLink l
         JOIN ${ACCT_SCHEMA}.GLAccountRole r ON r.ID = l.GLAccountRoleID
         JOIN ${ACCT_SCHEMA}.GLAccount a ON a.ID = l.GLAccountID
         WHERE r.Name = 'Unbilled Receivable' AND a.CompanyID = '${Fx().CoA.ID}' AND l.Status = 'Active'`,
    );
    Assert(links.length > 0, 'precondition: the fixture links an Unbilled Receivable account');
    for (const l of links) await upsertViaEntity(ctx, GL_ACCOUNT_LINK_ENTITY, l.ID, { Status: 'Disabled' });
    await AccountingEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
    try {
        return await body();
    } finally {
        for (const l of links) await upsertViaEntity(ctx, GL_ACCOUNT_LINK_ENTITY, l.ID, { Status: 'Active' });
        await AccountingEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
    }
}

/** The GL lines of every journal entry `entryIDsSql` selects. */
const ledgerOf = (ctx: IntegrationCheckContext, entryIDsSql: string) =>
    TxQuery<{ Code: string; DebitAmount: number; CreditAmount: number }>(
        ctx,
        `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
         FROM ${ACCT_SCHEMA}.JournalEntryLine jel
         JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
         WHERE jel.JournalEntryID IN (${entryIDsSql})`,
    );

/** Debits less credits on one account. */
const netOn = (lines: Array<{ Code: string; DebitAmount: number; CreditAmount: number }>, code: string): number =>
    Math.round(
        lines.filter((l) => l.Code === code).reduce((t, l) => t + Number(l.DebitAmount ?? 0) - Number(l.CreditAmount ?? 0), 0) * 100,
    ) / 100;

for (const check of SubscriptionRenewalChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('subscription-renewal', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});
