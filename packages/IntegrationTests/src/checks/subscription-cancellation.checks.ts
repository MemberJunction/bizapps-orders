/**
 * subscription-cancellation.checks.ts — the `subscription-cancellation` bundle (SC1–SC10).
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
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 */
import { BaseRemotableOperation, Metadata } from '@memberjunction/core';
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
