/**
 * subscription-cancellation.checks.ts — the `subscription-cancellation` bundle (SC1–SC13).
 *
 * `Orders.CancelSubscription` is where the `SubscriptionType` cancellation columns finally do
 * something. The user picks a DATE; the operation applies `CancellationMode` /
 * `CancellationRefundMode` / `CancellationWindowDays` / `GracePeriodDays`, derives the reversal
 * fraction itself, and emits the reversal order atomically (design §5).
 *
 * WHAT IT PROVES
 *   SC1   Preview computes the decision and writes NOTHING
 *   SC2   EndOfTerm + NoRefund ends coverage at the term end, reverses nothing, completes the term
 *   SC3   Prorate refunds the unused fraction and reverses exactly that much revenue
 *   SC4   the reversal order's journal entries MIRROR the original booking (D16)
 *   SC5   the reversal line does NOT create a second subscription
 *   SC6   the term is stamped Canceled with its effective date
 *   SC7   the subscription is stamped Canceled, AutoRenew off, EndDate = access-through (grace)
 *   SC8   a lifecycle SubscriptionEvent is logged, carrying the decision
 *   SC9   cancelling twice is refused rather than double-reversing
 *   SC10  an unknown subscription fails as OUTPUT, not as a thrown fault
 *   SC11  a later term sold and invoiced on the same order is canceled, and under NoRefund its
 *         invoiced amount is kept: nothing is reversed (#406, #560)
 *   SC12  a cancel whose access ends later (the type's 30-day grace) moves the standing grants' end to
 *         the end of the access-through day, still Active, so a copy of access ends when Orders does
 *   SC13  control: an Immediate cancel still revokes the grants at once, their dates untouched
 *   SC14  an end-of-term cancel made ON the term's last day keeps the grants Active to 00:00 business time
 *         after it, in Chicago and in Auckland (it used to revoke from 00:00 UTC on that day)
 *   SC15  control, same last day in Chicago: an Immediate cancel revokes at once
 *   SC16  an Immediate cancel requested for two days from now does not revoke now: access runs through that day
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 */
import { BaseRemotableOperation, Metadata } from '@memberjunction/core';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import { TermDayEnd } from '@mj-biz-apps/orders-core-entities-server';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import { MJGlobal } from '@memberjunction/global';
import {
    ACCT_SCHEMA,
    CreateOrdersFixture,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    SameID,
    TeardownOrdersFixture,
    TxOne,
    TxQuery,
    WithBusinessZone,
} from '../fixture.js';
import { ConfirmOrder } from '../order-builder.js';

const JULY_1 = new Date('2026-07-01T00:00:00Z');

interface CancelOutput {
    Success: boolean;
    Message?: string;
    Decision?: {
        EffectiveDate: string;
        AccessThroughDate: string;
        RefundAmount: number;
        ReversalFraction: number;
        TermStatus: string;
        Explanation: string;
    };
    SubscriptionTermID?: string;
    LaterTerms?: { SubscriptionTermID: string; TermNumber: number; Decision: { RefundAmount: number; TermStatus: string } }[];
    TotalRefundAmount?: number;
    ReversalOrderID?: string;
    ReversalOrderNumber?: string;
}

/** Resolve and invoke the operation the same way any caller would — through the ClassFactory. */
async function cancel(
    ctx: IntegrationCheckContext,
    input: Record<string, unknown>,
): Promise<CancelOutput> {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<
        BaseRemotableOperation<Record<string, unknown>, CancelOutput>
    >(BaseRemotableOperation, 'Orders.CancelSubscription');
    Assert(op != null, "'Orders.CancelSubscription' is not registered");

    const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });

    // Two layers, and both matter. The ENVELOPE reports transport/authorization faults; the
    // PAYLOAD reports the domain outcome. A logical refusal ("already canceled") is a successful
    // execution carrying `Success: false` — conflating the two would make SC9/SC10 unwritable.
    Assert(
        result.Success,
        `the operation did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown'}`,
    );
    Assert(result.Output != null, 'the operation returned no payload');
    return result.Output as CancelOutput;
}

/** Buy a subscription and return its ID plus the term, so a check can cancel it. */
async function buyAndFindSubscription(ctx: IntegrationCheckContext, productKey: string, price: number) {
    const f = Fx();
    const result = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        OrderDate: JULY_1,
        BillToOrganizationID: f.Customers.OrganizationID,
        Lines: [{ ProductID: f.Products[productKey], Quantity: 1, UnitPrice: price }],
    });
    Assert(result.Saved, `confirm failed: ${result.Message}`);

    const term = await TxOne<{
        ID: string;
        SubscriptionID: string;
        StartDate: string;
        EndDate: string;
        Amount: number;
    }>(
        ctx,
        `SELECT st.ID, st.SubscriptionID, st.StartDate, st.EndDate, st.Amount
         FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
         JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
         WHERE ol.OrderHeaderID = '${result.Order.ID}'`,
    );
    return { OrderID: result.Order.ID as string, Term: term, SubscriptionID: term.SubscriptionID };
}

const isoDate = (v: string | Date) => new Date(v).toISOString().slice(0, 10);

/** Buy a subscription product on a given day; returns its subscription and term. */
async function buyOn(ctx: IntegrationCheckContext, productKey: string, price: number, day: Date) {
    const f = Fx();
    const result = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        OrderDate: day,
        BillToOrganizationID: f.Customers.OrganizationID,
        Lines: [{ ProductID: f.Products[productKey], Quantity: 1, UnitPrice: price }],
    });
    Assert(result.Saved, `confirm failed: ${result.Message}`);
    const term = await TxOne<{ ID: string; SubscriptionID: string }>(
        ctx,
        `SELECT st.ID, st.SubscriptionID FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
         JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID WHERE ol.OrderHeaderID = '${result.Order.ID}'`,
    );
    return { OrderID: result.Order.ID as string, SubscriptionID: term.SubscriptionID };
}

/**
 * A 12-month SubRolling term that ENDS on the business zone's today: bought on the day after today, a year
 * ago. The cancel then runs on the term's last day at whatever instant the suite runs, which is exactly the
 * window where an end-of-term cancel used to revoke at once (from 00:00 UTC on that day).
 */
async function buyEndingToday(ctx: IntegrationCheckContext): Promise<{ SubscriptionID: string; LastDay: string }> {
    const lastDay = BusinessTimeZoneEngine.Instance.Today();
    const bought = new Date(`${lastDay}T00:00:00Z`);
    bought.setUTCFullYear(bought.getUTCFullYear() - 1);
    bought.setUTCDate(bought.getUTCDate() + 1);
    const { SubscriptionID } = await buyOn(ctx, 'SubRolling', 1200, bought);
    const term = await TxOne<{ EndDate: Date }>(
        ctx,
        `SELECT TOP 1 EndDate FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE SubscriptionID = '${SubscriptionID}' ORDER BY TermNumber DESC`,
    );
    AssertEqual(isoDate(term.EndDate), lastDay, `precondition: the term's last day is today in ${BusinessTimeZoneEngine.Instance.Zone}`);
    return { SubscriptionID, LastDay: lastDay };
}

const grantsOf = (ctx: IntegrationCheckContext, subscriptionID: string) =>
    TxQuery<{ ID: string; Status: string; ValidTo: Date | null }>(
        ctx,
        `SELECT ID, Status, ValidTo FROM ${ORDERS_SCHEMA}.EntitlementGrant
          WHERE SubscriptionID = '${subscriptionID}' AND ValidityModeApplied = 'SubscriptionTerm'`,
    );

export const SubscriptionCancellationChecks: NamedCheck[] = [
    {
        Id: 'subscription-cancellation.SC1',
        Name: 'SC1: Preview computes the decision without writing anything',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // SubCalendar: Jan-1 anchor, Prorate, ProrateUnused refunds, EndOfTerm.
                const { SubscriptionID } = await buyAndFindSubscription(ctx, 'SubCalendar', 1200);

                const before = await TxOne<{ N: number }>(
                    ctx,
                    `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.SubscriptionEvent
                     WHERE SubscriptionID='${SubscriptionID}' AND EventType='Canceled'`,
                );

                const out = await cancel(ctx, {
                    SubscriptionID,
                    RequestDate: '2026-09-01',
                    Preview: true,
                });
                Assert(out.Success, `preview failed: ${out.Message}`);
                Assert(out.Decision != null, 'a preview must still return the decision');
                Assert(
                    out.Decision!.Explanation.length > 0,
                    'the decision must explain which rule applied — this is what a confirmation screen shows',
                );

                // Nothing moved.
                const sub = await TxOne<{ Status: string }>(
                    ctx,
                    `SELECT Status FROM ${ORDERS_SCHEMA}.Subscription WHERE ID='${SubscriptionID}'`,
                );
                AssertEqual(sub.Status, 'Active', 'a preview must not change the subscription');
                const after = await TxOne<{ N: number }>(
                    ctx,
                    `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.SubscriptionEvent
                     WHERE SubscriptionID='${SubscriptionID}' AND EventType='Canceled'`,
                );
                AssertEqual(Number(after.N), Number(before.N), 'a preview must not log an event');
                Assert(out.ReversalOrderID == null, 'a preview must not emit a reversal order');
            }),
    },
    {
        Id: 'subscription-cancellation.SC2',
        Name: 'SC2: EndOfTerm with NoRefund runs the term out and reverses nothing',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // SubRolling: EndOfTerm + NoRefund. Coverage runs 2026-07-01 → 2027-06-30.
                const { SubscriptionID, Term } = await buyAndFindSubscription(ctx, 'SubRolling', 1200);

                const out = await cancel(ctx, { SubscriptionID, RequestDate: '2026-09-01' });
                Assert(out.Success, `cancel failed: ${out.Message}`);

                AssertEqual(
                    isoDate(out.Decision!.EffectiveDate),
                    isoDate(Term.EndDate),
                    'EndOfTerm means coverage runs to the term end, not to the request date',
                );
                AssertEqual(Number(out.Decision!.RefundAmount), 0, 'NoRefund refunds nothing');
                AssertEqual(Number(out.Decision!.ReversalFraction), 0, 'nothing refunded means nothing reversed');
                Assert(out.ReversalOrderID == null, 'no reversal order should exist when nothing is reversed');
                AssertEqual(
                    out.Decision!.TermStatus,
                    'Completed',
                    'a term ridden out to its end is Completed, not Canceled — the customer got what they paid for',
                );
            }),
    },
    {
        Id: 'subscription-cancellation.SC3',
        Name: 'SC3: ProrateUnused refunds the unused fraction and derives the reversal itself',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // SubCalendar: Jan-1 anchor + ProrateUnused. Bought 2026-07-01, so the (prorated)
                // term runs 07-01 → 12-31 = 184 days.
                const { SubscriptionID, Term } = await buyAndFindSubscription(ctx, 'SubCalendar', 1200);
                const termAmount = Number(Term.Amount);

                // Cancel at the start of October: Oct 1 → Dec 31 is 91 unused days of 184.
                const out = await cancel(ctx, { SubscriptionID, RequestDate: '2026-10-01' });
                Assert(out.Success, `cancel failed: ${out.Message}`);

                const expectedFraction = 91 / 184;
                Assert(
                    Math.abs(Number(out.Decision!.ReversalFraction) - expectedFraction) < 1e-3,
                    `reversal fraction ${out.Decision!.ReversalFraction} should be ~${expectedFraction.toFixed(4)} (91 of 184 days)`,
                );
                // Tolerance is a few cents by construction: the fraction is rounded to the
                // reversal line's 4dp scale before the refund is derived from it, so the refund can
                // legitimately differ from the exact day-count value by term × 0.00005.
                Assert(
                    Math.abs(Number(out.Decision!.RefundAmount) - termAmount * expectedFraction) < 0.05,
                    `refund ${out.Decision!.RefundAmount} should be ~${(termAmount * expectedFraction).toFixed(2)}`,
                );
                Assert(
                    Number(out.Decision!.RefundAmount) < termAmount,
                    'a partial cancellation must never refund more than the term cost',
                );
                Assert(out.ReversalOrderID != null, 'a refund must produce a reversal order');
                Assert(
                    /^ORD-\d{6}$/.test(out.ReversalOrderNumber ?? ''),
                    `the reversal order gets a real order number, got '${out.ReversalOrderNumber}'`,
                );
            }),
    },
    {
        Id: 'subscription-cancellation.SC4',
        Name: 'SC4: the reversal order books journal entries that mirror the original',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID } = await buyAndFindSubscription(ctx, 'SubCalendar', 1200);
                const out = await cancel(ctx, { SubscriptionID, RequestDate: '2026-10-01' });
                Assert(out.Success && out.ReversalOrderID != null, `cancel failed: ${out.Message}`);

                const lines = await TxQuery<{ Code: string; DebitAmount: number; CreditAmount: number }>(
                    ctx,
                    `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
                     FROM ${ORDERS_SCHEMA}.OrderLine ol
                     JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = ol.JournalEntryID
                     JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                     WHERE ol.OrderHeaderID = '${out.ReversalOrderID}'`,
                );
                Assert(lines.length >= 2, `the reversal must book a real entry, got ${lines.length} lines`);

                // Mirrored: the original debited AR and credited Deferred Revenue, so the reversal
                // does the opposite. Booking a reversal the same way round would DOUBLE the sale.
                const debits = lines.filter((l) => Number(l.DebitAmount) > 0);
                const credits = lines.filter((l) => Number(l.CreditAmount) > 0);
                Assert(
                    debits.some((l) => l.Code === '21301'),
                    `the reversal must DEBIT Deferred Revenue: ${JSON.stringify(lines)}`,
                );
                Assert(
                    credits.some((l) => l.Code === '11201'),
                    `the reversal must CREDIT Accounts Receivable: ${JSON.stringify(lines)}`,
                );

                const totalD = debits.reduce((t, l) => t + Number(l.DebitAmount), 0);
                const totalC = credits.reduce((t, l) => t + Number(l.CreditAmount), 0);
                AssertEqual(Math.round(totalD * 100) / 100, Math.round(totalC * 100) / 100, 'the reversal balances');
                Assert(
                    Math.abs(totalD - Number(out.Decision!.RefundAmount)) < 0.05,
                    `the reversed amount ${totalD} must equal the refund ${out.Decision!.RefundAmount}`,
                );
            }),
    },
    {
        Id: 'subscription-cancellation.SC5',
        Name: 'SC5: the reversal line does not create a second subscription',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { SubscriptionID } = await buyAndFindSubscription(ctx, 'SubCalendar', 1200);
                const out = await cancel(ctx, { SubscriptionID, RequestDate: '2026-10-01' });
                Assert(out.Success && out.ReversalOrderID != null, `cancel failed: ${out.Message}`);

                // The reversal line carries a SUBSCRIPTION product, so without an explicit guard the
                // materializer would treat it as a purchase and mint a second subscription and term.
                const subs = await TxQuery(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.Subscription
                     WHERE ProductID='${f.Products.SubCalendar}'
                       AND HolderOrganizationID='${f.Customers.OrganizationID}'`,
                );
                AssertEqual(subs.length, 1, 'cancelling must not mint a second subscription');

                const terms = await TxQuery(
                    ctx,
                    `SELECT st.ID FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
                     WHERE ol.OrderHeaderID = '${out.ReversalOrderID}'`,
                );
                AssertEqual(terms.length, 0, 'the reversal order must buy no term');
            }),
    },
    {
        Id: 'subscription-cancellation.SC6',
        Name: 'SC6: the term is stamped Canceled with its effective date',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buyAndFindSubscription(ctx, 'SubCalendar', 1200);
                const out = await cancel(ctx, { SubscriptionID, RequestDate: '2026-10-01' });
                Assert(out.Success, `cancel failed: ${out.Message}`);

                const stamped = await TxOne<{
                    Status: string;
                    CanceledAt: string | null;
                    CancellationEffectiveDate: string | null;
                }>(
                    ctx,
                    `SELECT Status, CanceledAt, CancellationEffectiveDate
                     FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE ID='${Term.ID}'`,
                );
                AssertEqual(stamped.Status, 'Canceled', 'term status');
                Assert(stamped.CanceledAt != null, 'CanceledAt must record WHEN the request happened');
                Assert(
                    stamped.CancellationEffectiveDate != null,
                    'CancellationEffectiveDate must record when coverage actually ends',
                );
                AssertEqual(
                    isoDate(stamped.CancellationEffectiveDate!),
                    isoDate(out.Decision!.EffectiveDate),
                    'the stored effective date matches the decision',
                );
            }),
    },
    {
        Id: 'subscription-cancellation.SC7',
        Name: 'SC7: the subscription is canceled with auto-renew off and grace reflected in EndDate',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // SubCalendar carries GracePeriodDays = 30.
                const { SubscriptionID } = await buyAndFindSubscription(ctx, 'SubCalendar', 1200);
                const out = await cancel(ctx, { SubscriptionID, RequestDate: '2026-10-01' });
                Assert(out.Success, `cancel failed: ${out.Message}`);

                const sub = await TxOne<{
                    Status: string;
                    AutoRenew: boolean;
                    EndDate: string;
                    CanceledAt: string | null;
                }>(
                    ctx,
                    `SELECT Status, AutoRenew, EndDate, CanceledAt
                     FROM ${ORDERS_SCHEMA}.Subscription WHERE ID='${SubscriptionID}'`,
                );
                AssertEqual(sub.Status, 'Canceled', 'subscription status');
                Assert(!sub.AutoRenew, 'a canceled subscription must not auto-renew');
                Assert(sub.CanceledAt != null, 'CanceledAt');

                // Grace extends ACCESS past the revenue cut-off — that is the whole point of the
                // column, and storing the revenue date here would silently revoke access early.
                AssertEqual(
                    isoDate(sub.EndDate),
                    isoDate(out.Decision!.AccessThroughDate),
                    'EndDate is the access-through date',
                );
                const graceDays = Math.round(
                    (new Date(out.Decision!.AccessThroughDate).getTime() -
                        new Date(out.Decision!.EffectiveDate).getTime()) /
                        86400000,
                );
                AssertEqual(graceDays, 30, "grace days applied from the type's GracePeriodDays");
            }),
    },
    {
        Id: 'subscription-cancellation.SC8',
        Name: 'SC8: a lifecycle event is logged carrying the decision',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID } = await buyAndFindSubscription(ctx, 'SubCalendar', 1200);
                const out = await cancel(ctx, { SubscriptionID, RequestDate: '2026-10-01', Reason: 'moved away' });
                Assert(out.Success, `cancel failed: ${out.Message}`);

                const event = await TxOne<{ EventType: string; EventData: string; RelatedOrderHeaderID: string }>(
                    ctx,
                    `SELECT EventType, EventData, RelatedOrderHeaderID
                     FROM ${ORDERS_SCHEMA}.SubscriptionEvent
                     WHERE SubscriptionID='${SubscriptionID}' AND EventType='Canceled'`,
                );
                const data = JSON.parse(event.EventData) as Record<string, unknown>;
                AssertEqual(data.Reason, 'moved away', 'the caller-supplied reason is preserved');
                Assert(data.RefundAmount != null, 'the event records what was refunded');
                Assert(data.Explanation != null, 'the event records which rule applied');
                Assert(
                    SameID(event.RelatedOrderHeaderID, out.ReversalOrderID),
                    'the event links to the reversal order it produced',
                );

                // The purchase logged its own event, so the log reads as a history and not a
                // single row — that is what makes the table worth having.
                const all = await TxQuery<{ EventType: string }>(
                    ctx,
                    `SELECT EventType FROM ${ORDERS_SCHEMA}.SubscriptionEvent
                     WHERE SubscriptionID='${SubscriptionID}' ORDER BY OccurredAt`,
                );
                Assert(
                    all.length >= 2,
                    `expected creation AND cancellation events, got ${JSON.stringify(all.map((e) => e.EventType))}`,
                );
                AssertEqual(all[0].EventType, 'Created', 'the first event is the creation');
            }),
    },
    {
        Id: 'subscription-cancellation.SC9',
        Name: 'SC9: cancelling an already-canceled subscription is refused, not double-reversed',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID } = await buyAndFindSubscription(ctx, 'SubCalendar', 1200);
                const first = await cancel(ctx, { SubscriptionID, RequestDate: '2026-10-01' });
                Assert(first.Success, `first cancel failed: ${first.Message}`);

                const second = await cancel(ctx, { SubscriptionID, RequestDate: '2026-10-15' });
                Assert(!second.Success, 'a second cancellation must be refused');
                Assert(
                    /already canceled/i.test(second.Message ?? ''),
                    `the refusal should say why, got: ${second.Message}`,
                );
                Assert(second.ReversalOrderID == null, 'a refused cancellation must not reverse anything');

                // Exactly one reversal exists — the guarantee that matters, since a second one
                // would credit the customer twice.
                const reversals = await TxQuery(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.OrderHeader
                     WHERE OrderType='Cancellation' AND ID='${first.ReversalOrderID}'`,
                );
                AssertEqual(reversals.length, 1, 'exactly one reversal order');
            }),
    },
    {
        Id: 'subscription-cancellation.SC10',
        Name: 'SC10: an unknown subscription fails in the output, not as a thrown fault',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Logical failures belong INSIDE the payload — the same contract accounting's
                // operations use. A caller should never need a try/catch for bad input.
                const out = await cancel(ctx, {
                    SubscriptionID: '00000000-0000-0000-0000-000000000000',
                    RequestDate: '2026-10-01',
                });
                Assert(!out.Success, 'an unknown subscription must not report success');
                Assert(
                    /no subscription found/i.test(out.Message ?? ''),
                    `the message should name the problem, got: ${out.Message}`,
                );
            }),
    },
    {
        Id: 'subscription-cancellation.SC11',
        Name: 'SC11: a later term sold and invoiced on the same order is canceled and, under NoRefund, kept',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // AnnualRolling: ExtendExisting, EndOfTerm, NoRefund. Two lines of it on one order
                // make term 1 (2026-07-01 → 2027-06-30) and term 2 (2027-07-01 → 2028-06-30) of one
                // subscription, both sold by this order, so neither term is a renewal.
                const f = Fx();
                const order = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderDate: JULY_1,
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [
                        { ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 },
                        { ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 },
                    ],
                });
                Assert(order.Saved, `confirm failed: ${order.Message}`);
                const sold = await TxQuery<{ ID: string; SubscriptionID: string; TermNumber: number; OrderLineID: string }>(
                    ctx,
                    `SELECT st.ID, st.SubscriptionID, st.TermNumber, st.OrderLineID
                     FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
                     WHERE ol.OrderHeaderID = '${order.Order.ID}' ORDER BY st.TermNumber`,
                );
                AssertEqual(sold.map((t) => t.TermNumber).join(','), '1,2', 'precondition: the order sold terms 1 and 2');
                Assert(SameID(sold[0].SubscriptionID, sold[1].SubscriptionID), 'precondition: of one subscription');
                const SubscriptionID = sold[0].SubscriptionID;

                const out = await cancel(ctx, { SubscriptionID, RequestDate: '2026-09-01' });
                Assert(out.Success, `cancel failed: ${out.Message}`);

                // Term 1 rides out under NoRefund. Term 2 never starts, and the order invoiced it in full
                // at confirm, so NoRefund keeps it too: it is canceled and nothing is reversed (#560,
                // provisional until the refund policy is confirmed there).
                AssertEqual(Number(out.Decision!.RefundAmount), 0, 'NoRefund keeps term 1');
                AssertEqual(out.LaterTerms?.length ?? 0, 1, 'term 2 is the one later term');
                AssertEqual(Number(out.LaterTerms![0].Decision.RefundAmount), 0, 'NoRefund keeps the invoiced term 2');
                AssertEqual(Number(out.TotalRefundAmount), 0, 'nothing is refunded');

                const terms = await TxQuery<{ TermNumber: number; Status: string }>(
                    ctx,
                    `SELECT TermNumber, Status FROM ${ORDERS_SCHEMA}.SubscriptionTerm
                     WHERE SubscriptionID = '${SubscriptionID}' ORDER BY TermNumber`,
                );
                AssertEqual(terms.map((t) => t.Status).join(','), 'Completed,Canceled', 'term 1 rides out, term 2 is canceled');

                AssertEqual(out.ReversalOrderID ?? null, null, 'nothing is reversed, so no reversal order is booked');
                const reversals = await TxQuery<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE ReversesOrderLineID = '${sold[1].OrderLineID}'`,
                );
                AssertEqual(reversals.length, 0, "nothing reverses term 2's line");
                const billed = await TxOne<{ BilledToDate: number }>(
                    ctx,
                    `SELECT BilledToDate FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${sold[1].OrderLineID}'`,
                );
                AssertEqual(Number(billed.BilledToDate), 1200, "term 2's invoiced amount stays billed, so it stays on AR");
            }),
    },
    {
        Id: 'subscription-cancellation.SC12',
        Name: "SC12: a cancel whose access ends later moves the standing grants' end to the end of the access-through day",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Bought today, so the access-through day (the type's rule plus SubCalendar's 30-day grace) is
                // in the future whatever day the suite runs.
                const today = new Date(`${BusinessTimeZoneEngine.Instance.Today()}T00:00:00Z`); // business today, as a date column holds it
                const { SubscriptionID } = await buyOn(ctx, 'SubCalendar', 1200, today);
                const out = await cancel(ctx, { SubscriptionID, RequestDate: isoDate(today) });
                Assert(out.Success, `cancel failed: ${out.Message}`);
                const accessThrough = isoDate(out.Decision!.AccessThroughDate);
                Assert(accessThrough > isoDate(today), `precondition: access ends later (${accessThrough})`);

                const grants = await TxQuery<{ ID: string; Status: string; ValidTo: Date | null }>(
                    ctx,
                    `SELECT ID, Status, ValidTo FROM ${ORDERS_SCHEMA}.EntitlementGrant WHERE SubscriptionID = '${SubscriptionID}'`,
                );
                Assert(grants.length > 0, 'precondition: the subscription granted access');
                const end = TermDayEnd(accessThrough, BusinessTimeZoneEngine.Instance.Zone).toISOString();
                for (const g of grants) {
                    AssertEqual(g.Status, 'Active', 'the grant stays in force until access ends');
                    AssertEqual(g.ValidTo ? new Date(g.ValidTo).toISOString() : null, end, `its end is the end of ${accessThrough} (grace included)`);
                }
            }),
    },
    {
        Id: 'subscription-cancellation.SC13',
        Name: 'SC13: control: an Immediate cancel still revokes the grants at once, their dates untouched',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const today = new Date(`${BusinessTimeZoneEngine.Instance.Today()}T00:00:00Z`); // business today, as a date column holds it
                const { SubscriptionID } = await buyOn(ctx, 'SubCalendar', 1200, today);
                const before = await TxQuery<{ ID: string; ValidTo: Date | null }>(
                    ctx,
                    `SELECT ID, ValidTo FROM ${ORDERS_SCHEMA}.EntitlementGrant WHERE SubscriptionID = '${SubscriptionID}'`,
                );
                const out = await cancel(ctx, { SubscriptionID, RequestDate: isoDate(today), Timing: 'Immediate' });
                Assert(out.Success, `cancel failed: ${out.Message}`);
                const after = await TxQuery<{ ID: string; Status: string; ValidTo: Date | null }>(
                    ctx,
                    `SELECT ID, Status, ValidTo FROM ${ORDERS_SCHEMA}.EntitlementGrant WHERE SubscriptionID = '${SubscriptionID}'`,
                );
                Assert(after.length > 0 && after.every((g) => g.Status === 'Revoked'), 'every grant is revoked at once');
                for (const g of after) {
                    const was = before.find((b) => SameID(b.ID, g.ID));
                    AssertEqual(
                        g.ValidTo ? new Date(g.ValidTo).toISOString() : null,
                        was?.ValidTo ? new Date(was.ValidTo).toISOString() : null,
                        'and its dates are left as they were',
                    );
                }
            }),
    },
    {
        Id: 'subscription-cancellation.SC14',
        Name: "SC14: an end-of-term cancel made on the term's last day keeps the grants to 00:00 business time after it (Chicago, Auckland)",
        RequiresMutation: true,
        Fn: async (ctx) => {
            for (const [iana, sqlName] of [
                ['America/Chicago', 'Central Standard Time'],
                ['Pacific/Auckland', 'New Zealand Standard Time'],
            ]) {
                await WithBusinessZone(ctx, iana, sqlName, async () => {
                    const { SubscriptionID, LastDay } = await buyEndingToday(ctx);
                    const out = await cancel(ctx, { SubscriptionID, RequestDate: LastDay, Timing: 'EndOfTerm' });
                    Assert(out.Success, `cancel failed: ${out.Message}`);
                    AssertEqual(isoDate(out.Decision!.AccessThroughDate), LastDay, `precondition: access runs through ${LastDay} (grace 0)`);
                    const end = TermDayEnd(LastDay, iana);
                    Assert(end.getTime() > Date.now(), `precondition: it is still ${LastDay} in ${iana}`);
                    const grants = await grantsOf(ctx, SubscriptionID);
                    Assert(grants.length > 0, 'precondition: the term granted access');
                    for (const g of grants) {
                        AssertEqual(g.Status, 'Active', `${iana}: the grant is still in force on the last day`);
                        AssertEqual(g.ValidTo ? new Date(g.ValidTo).toISOString() : null, end.toISOString(), `${iana}: it ends at 00:00 business time after ${LastDay}`);
                    }
                });
            }
        },
    },
    {
        Id: 'subscription-cancellation.SC15',
        Name: "SC15: control: on the same last day in Chicago, an Immediate cancel revokes the grants at once",
        RequiresMutation: true,
        Fn: async (ctx) =>
            WithBusinessZone(ctx, 'America/Chicago', 'Central Standard Time', async () => {
                const { SubscriptionID, LastDay } = await buyEndingToday(ctx);
                const out = await cancel(ctx, { SubscriptionID, RequestDate: LastDay, Timing: 'Immediate' });
                Assert(out.Success, `cancel failed: ${out.Message}`);
                const grants = await grantsOf(ctx, SubscriptionID);
                Assert(grants.length > 0 && grants.every((g) => g.Status === 'Revoked'), 'every term grant is revoked at once');
            }),
    },
    {
        Id: 'subscription-cancellation.SC16',
        Name: 'SC16: an Immediate cancel requested for two days from now leaves the grants Active, ending at 00:00 business time after that day',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const todayDay = BusinessTimeZoneEngine.Instance.Today();
                const today = new Date(`${todayDay}T00:00:00Z`);
                const { SubscriptionID } = await buyOn(ctx, 'SubCalendar', 1200, today);
                const later = new Date(today.getTime() + 2 * 86_400_000);
                const out = await cancel(ctx, { SubscriptionID, RequestDate: isoDate(later), Timing: 'Immediate' });
                Assert(out.Success, `cancel failed: ${out.Message}`);
                AssertEqual(isoDate(out.Decision!.AccessThroughDate), isoDate(later), 'precondition: access runs through the requested day');
                const end = TermDayEnd(isoDate(later), BusinessTimeZoneEngine.Instance.Zone).toISOString();
                const grants = await grantsOf(ctx, SubscriptionID);
                Assert(grants.length > 0, 'precondition: the term granted access');
                for (const g of grants) {
                    AssertEqual(g.Status, 'Active', 'not revoked now: the cancel was asked for a later day');
                    AssertEqual(g.ValidTo ? new Date(g.ValidTo).toISOString() : null, end, `it ends at 00:00 business time after ${isoDate(later)}`);
                }
            }),
    },
];

for (const check of SubscriptionCancellationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('subscription-cancellation', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
        // Touch Metadata so entity objects resolve before the first check — the operation builds
        // its reversal order through the entity API, exactly as any caller would.
        new Metadata();
    },
    Teardown: TeardownOrdersFixture,
});
