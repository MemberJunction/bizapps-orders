/**
 * revenue-recognition.checks.ts — the `revenue-recognition` bundle (RR1–RR10).
 *
 * D14's claim used to be that recognition is not a job but FORWARD-DATED LEDGER: booking wrote every
 * future release entry immediately, so the ledger already held the whole schedule. D92 §8 gives that
 * up. It was a real property, and the reason for dropping it is that it made the ledger assert
 * revenue for months nobody had reached — a term amended or a line reversed in month three left nine
 * entries already standing against months four to twelve.
 *
 * So the claim these checks now hold is a different one, and a stronger one: **the schedule did not
 * change, only the moment it is written.** `Orders.PostDueRecognition` asks each driver what is
 * earned through a date and posts the difference from the line's `RecognizedToDate`, and that has to
 * produce the same amounts on the same dates the staging produced. RR2 states that equivalence
 * directly.
 *
 * WHAT IT PROVES
 *   RR1   confirm stages NOTHING — a deferred line books once and no recognition entry exists yet
 *   RR2   the pass run month by month reproduces the schedule, date for date and cent for cent
 *   RR3   the amounts sum EXACTLY to the line, odd cent included
 *   RR4   billed in ADVANCE: rule 2 relieves Deferred Revenue and never opens the contract asset
 *   RR5   billed in ARREARS: rule 2 opens Unbilled Receivable, because nothing has been billed yet
 *   RR6   OrderLine.JournalEntryID still points at the BOOKING entry
 *   RR7   an event line earns nothing until its end date, then all of it, in one pass
 *   RR8   an up-front line earns at confirm and the pass never considers it
 *   RR9   Preview writes nothing — no entries, and RecognizedToDate does not move
 *   RR10  running the pass twice for the same date posts nothing the second time
 *
 * RR4 and RR5 are the pair worth reading together: the same operation on the same driver, differing
 * only in whether the line has been billed yet. That is what decides the contra account, and it is
 * what a check on either one alone cannot show — a defect where `BilledToDate` had two writers on
 * different bases survived precisely because nothing compared the two cases.
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 */
import { BaseRemotableOperation } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import {
    ACCT_SCHEMA,
    CreateOrdersFixture,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    TeardownOrdersFixture,
    TxOne,
    TxQuery,
} from '../fixture.js';
import { ConfirmOrder } from '../order-builder.js';
import { scheduledOrder, type Instalment } from './payment-schedule.checks.js';

const SALES = '40100';
const DEFERRED = '21301';
/** The contract asset: revenue earned ahead of billing (D92 rule 2). */
const UNBILLED = '11300';

const cents = (n: number) => Math.round(n * 100) / 100;

interface PostLine {
    OrderLineID: string;
    EarnedThrough: number;
    RecognizedBefore: number;
    Amount: number;
    JournalEntryID?: string | null;
    FailedReason?: string;
}

interface PostOutput {
    Success: boolean;
    Message?: string;
    Preview: boolean;
    AsOf?: string;
    Considered?: number;
    Posted?: number;
    Failed?: number;
    Lines?: PostLine[];
}

/** Run the monthly pass for ONE order, so a check cannot be moved by another fixture's lines. */
async function postDue(ctx: IntegrationCheckContext, orderID: string, asOf: string, preview = false): Promise<PostOutput> {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation<unknown, PostOutput>>(
        BaseRemotableOperation,
        'Orders.PostDueRecognition',
    );
    Assert(op != null, `'Orders.PostDueRecognition' is not registered`);
    const result = await op!.Execute({ AsOf: asOf, Preview: preview, OrderHeaderID: orderID }, { provider: ctx.Provider, user: ctx.User });
    Assert(result.Success, `PostDueRecognition did not execute: ${result.ErrorMessage ?? 'unknown'}`);
    Assert(result.Output!.Success, `PostDueRecognition reported failure: ${result.Output!.Message}`);
    return result.Output!;
}

interface EntryRow {
    ID: string;
    EntryType: string;
    EffectiveDate: string;
    /** Signed movement on Sales: positive when Sales is CREDITED, i.e. revenue earned. */
    Revenue: number;
}

/** Every entry whose origin is one of this order's lines or their terms, booking and recognition alike. */
const entriesForOrder = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<EntryRow>(
        ctx,
        `SELECT je.ID,
                (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) AS EntryType,
                CONVERT(varchar(10), je.EffectiveDate, 23) AS EffectiveDate,
                (SELECT SUM(ISNULL(jel.CreditAmount,0)) - SUM(ISNULL(jel.DebitAmount,0))
                   FROM ${ACCT_SCHEMA}.JournalEntryLine jel
                   JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                  WHERE jel.JournalEntryID = je.ID AND gl.Code = '${SALES}') AS Revenue
           FROM ${ACCT_SCHEMA}.vwJournalEntries je
          WHERE je.LinkedRecordID IN (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}')
             OR je.LinkedRecordID IN (
                  SELECT st.ID FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
                  JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
                  WHERE ol.OrderHeaderID = '${orderID}')
          ORDER BY je.EffectiveDate`,
    );

const recognitionEntries = async (ctx: IntegrationCheckContext, orderID: string) =>
    (await entriesForOrder(ctx, orderID)).filter((e) => e.EntryType === 'RevenueRecognition');

/** One entry's movement per account, debits less credits. */
const entryLegs = (ctx: IntegrationCheckContext, journalEntryID: string) =>
    TxQuery<{ Code: string; Net: number }>(
        ctx,
        `SELECT gl.Code, SUM(ISNULL(jel.DebitAmount,0)) - SUM(ISNULL(jel.CreditAmount,0)) AS Net
           FROM ${ACCT_SCHEMA}.JournalEntryLine jel
           JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
          WHERE jel.JournalEntryID = '${journalEntryID}'
          GROUP BY gl.Code`,
    );

const netOn = (legs: Array<{ Code: string; Net: number }>, code: string) =>
    cents(legs.filter((l) => l.Code === code).reduce((s, l) => s + Number(l.Net), 0));

const lineOf = (ctx: IntegrationCheckContext, orderID: string) =>
    TxOne<{ ID: string; RecognizedToDate: number; BilledToDate: number }>(
        ctx,
        `SELECT ID, RecognizedToDate, BilledToDate FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`,
    );

/** A 12-month, $1,200.01 straight-line deferred line, billed in full at confirm. The odd cent is the point. */
async function confirmStraightLine(ctx: IntegrationCheckContext) {
    const f = Fx();
    const result = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        OrderDate: new Date('2026-07-01T00:00:00Z'),
        Lines: [
            {
                ProductID: f.Products.DeferredA,
                Quantity: 1,
                UnitPrice: 1200.01,
                ServicePeriodStart: '2026-07-01',
                ServicePeriodEnd: '2027-06-30',
            },
        ],
    });
    Assert(result.Saved, `confirm failed: ${result.Message}`);
    return result;
}

/** The twelve month-ends of that service period — what the scheduled job passes as `AsOf`. */
const MONTH_ENDS = [
    '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31',
    '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31', '2027-06-30',
];

/** What the driver's schedule produces for that line — the twelve slices, remainder front-loaded. */
const EXPECTED_SLICES = [100.01, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];

export const RevenueRecognitionChecks: NamedCheck[] = [
    {
        Id: 'revenue-recognition.RR1',
        Name: 'RR1: confirm stages NOTHING — a deferred line books once and no recognition entry exists yet',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmStraightLine(ctx);
                const entries = await entriesForOrder(ctx, Order.ID as string);
                AssertEqual(entries.filter((e) => e.EntryType === 'OrderBooking').length, 1, 'booking entries');
                AssertEqual(
                    entries.filter((e) => e.EntryType === 'RevenueRecognition').length,
                    0,
                    'the ledger no longer holds the future — recognition is built at post time (D92 §8)',
                );
                AssertEqual(cents(Number((await lineOf(ctx, Order.ID as string)).RecognizedToDate)), 0, 'nothing recognised yet');
            }),
    },
    {
        Id: 'revenue-recognition.RR2',
        Name: "RR2: the pass run month by month reproduces the schedule, date for date and cent for cent",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmStraightLine(ctx);
                const orderID = Order.ID as string;
                for (const asOf of MONTH_ENDS) await postDue(ctx, orderID, asOf);

                const posted = (await recognitionEntries(ctx, orderID)).map((e) => ({
                    Date: e.EffectiveDate,
                    Amount: cents(Number(e.Revenue)),
                }));
                // THE EQUIVALENCE CLAIM, and the reason this PR can say only the moment moved. The
                // old staging wrote twelve entries with the rounding remainder in the first; the
                // pass has to produce the same twelve, or "the schedule did not change" is untrue.
                AssertEqual(posted.length, 12, 'one entry per month, as the staging wrote');
                AssertEqual(
                    JSON.stringify(posted.map((p) => p.Amount)),
                    JSON.stringify(EXPECTED_SLICES),
                    'the slices, in order, remainder front-loaded exactly as AllocateEvenly puts it',
                );
                AssertEqual(
                    JSON.stringify(posted.map((p) => p.Date)),
                    JSON.stringify(MONTH_ENDS),
                    'each entry is dated the period it closes, not the day the pass ran',
                );
            }),
    },
    {
        Id: 'revenue-recognition.RR3',
        Name: 'RR3: the amounts sum exactly to the line, odd cent included',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmStraightLine(ctx);
                const orderID = Order.ID as string;
                for (const asOf of MONTH_ENDS) await postDue(ctx, orderID, asOf);

                const total = cents((await recognitionEntries(ctx, orderID)).reduce((t, e) => t + Number(e.Revenue), 0));
                AssertEqual(total, 1200.01, 'the whole line is earned by the end of its service period');
                AssertEqual(
                    cents(Number((await lineOf(ctx, orderID)).RecognizedToDate)),
                    1200.01,
                    'and the running total agrees with the ledger it summarises',
                );
            }),
    },
    {
        Id: 'revenue-recognition.RR4',
        Name: 'RR4: billed in ADVANCE — rule 2 relieves Deferred Revenue and never opens the contract asset',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmStraightLine(ctx);
                const orderID = Order.ID as string;
                // Booking IS the billing event for a line with no schedule, so its whole value sits
                // in Deferred Revenue. If this reads 0, rule 2 will open a contract asset instead of
                // relieving deferred revenue on every ordinary subscription in the book.
                AssertEqual(cents(Number((await lineOf(ctx, orderID)).BilledToDate)), 1200.01, 'confirm billed the line in full');

                const out = await postDue(ctx, orderID, '2026-07-31');
                AssertEqual(out.Posted, 1, 'one line recognised');
                const legs = await entryLegs(ctx, out.Lines![0].JournalEntryID!);
                AssertEqual(netOn(legs, SALES), -100.01, 'Sales is credited with the month');
                AssertEqual(netOn(legs, DEFERRED), 100.01, 'and Deferred Revenue is relieved by it');
                AssertEqual(
                    netOn(legs, UNBILLED),
                    0,
                    'the contract asset is NOT touched: this line was billed before it was earned',
                );
            }),
    },
    {
        Id: 'revenue-recognition.RR5',
        Name: 'RR5: billed in ARREARS — rule 2 opens Unbilled Receivable, because nothing has been billed yet',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // A subscription on a schedule whose every instalment falls AFTER the order date, so
                // confirm issues none of them and books no receivable. The line earns from day one
                // regardless. That gap is what Unbilled Receivable is for, and under D92 it is the
                // only way the account legitimately arises.
                const later: Instalment[] = [
                    { InstallmentNumber: 1, DueDate: '2027-01-01', Amount: 600 },
                    { InstallmentNumber: 2, DueDate: '2027-04-01', Amount: 600 },
                ];
                const { orderID, saved, message } = await scheduledOrder(ctx, later, {
                    gross: 1200,
                    productID: Fx().Products.SubRolling,
                });
                Assert(saved, `confirm failed: ${message}`);
                AssertEqual(cents(Number((await lineOf(ctx, orderID)).BilledToDate)), 0, 'nothing was due at confirm, so nothing was billed');

                const out = await postDue(ctx, orderID, '2026-07-31');
                AssertEqual(out.Posted, 1, 'the line still earns while unbilled');
                const legs = await entryLegs(ctx, out.Lines![0].JournalEntryID!);
                const earned = -netOn(legs, SALES);
                Assert(earned > 0, `revenue must be credited: ${JSON.stringify(legs)}`);
                AssertEqual(netOn(legs, UNBILLED), earned, 'the whole debit opens the contract asset');
                AssertEqual(
                    netOn(legs, DEFERRED),
                    0,
                    'and nothing is taken out of Deferred Revenue, which holds nothing for this line',
                );
            }),
    },
    {
        Id: 'revenue-recognition.RR6',
        Name: 'RR6: the order line still points at the booking entry, not at a recognition entry',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmStraightLine(ctx);
                await postDue(ctx, Order.ID as string, '2026-07-31');
                const row = await TxOne<{ EntryType: string }>(
                    ctx,
                    `SELECT (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) AS EntryType
                       FROM ${ORDERS_SCHEMA}.OrderLine ol
                       JOIN ${ACCT_SCHEMA}.vwJournalEntries je ON je.ID = ol.JournalEntryID
                      WHERE ol.OrderHeaderID = '${Order.ID}'`,
                );
                AssertEqual(row.EntryType, 'OrderBooking', 'the entry the order line points at');
            }),
    },
    {
        Id: 'revenue-recognition.RR7',
        Name: 'RR7: an event line earns nothing until its end date, then all of it, in one pass',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderDate: new Date('2026-07-01T00:00:00Z'),
                    Lines: [
                        {
                            ProductID: f.Products.EventA,
                            Quantity: 1,
                            UnitPrice: 500,
                            ServicePeriodStart: '2026-09-01',
                            ServicePeriodEnd: '2026-09-30',
                        },
                    ],
                });
                Assert(result.Saved, `confirm failed: ${result.Message}`);
                const orderID = result.Order.ID as string;

                AssertEqual((await postDue(ctx, orderID, '2026-08-31')).Posted, 0, 'nothing is earned before the event happens');
                AssertEqual((await recognitionEntries(ctx, orderID)).length, 0, 'and no entry is written for a zero movement');

                const out = await postDue(ctx, orderID, '2026-09-30');
                AssertEqual(out.Posted, 1, 'the month of the event earns');
                const entries = await recognitionEntries(ctx, orderID);
                AssertEqual(entries.length, 1, 'in a single entry');
                AssertEqual(cents(Number(entries[0].Revenue)), 500, 'the whole amount at once');
                AssertEqual(entries[0].EffectiveDate, '2026-09-30', 'dated the period being closed');
            }),
    },
    {
        Id: 'revenue-recognition.RR8',
        Name: 'RR8: an up-front line earns at confirm and the pass never considers it',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 250 }],
                });
                Assert(result.Saved, `confirm failed: ${result.Message}`);
                const orderID = result.Order.ID as string;

                const entries = await entriesForOrder(ctx, orderID);
                AssertEqual(entries.length, 1, 'one booking entry and nothing else');
                AssertEqual(cents(Number(entries[0].Revenue)), 250, 'up-front revenue credits Sales at confirm');

                const out = await postDue(ctx, orderID, '2026-12-31');
                AssertEqual(out.Considered, 0, 'an UpFront type is not deferred, so the pass does not even consider the line');
                AssertEqual((await entriesForOrder(ctx, orderID)).length, 1, 'and wrote nothing');
            }),
    },
    {
        Id: 'revenue-recognition.RR9',
        Name: 'RR9: Preview writes nothing — no entries, and RecognizedToDate does not move',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmStraightLine(ctx);
                const orderID = Order.ID as string;

                const preview = await postDue(ctx, orderID, '2026-09-30', true);
                Assert(preview.Preview, 'the output says it was a preview');
                AssertEqual(preview.Posted, 0, 'a preview posts nothing');
                AssertEqual(preview.Lines?.length, 1, 'but it still reports what WOULD post');
                AssertEqual(cents(preview.Lines![0].Amount), 300.01, 'three months, remainder included');

                AssertEqual((await recognitionEntries(ctx, orderID)).length, 0, 'no entry was written');
                AssertEqual(cents(Number((await lineOf(ctx, orderID)).RecognizedToDate)), 0, 'and the running total did not move');
            }),
    },
    {
        Id: 'revenue-recognition.RR10',
        Name: 'RR10: running the pass twice for the same date posts nothing the second time',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmStraightLine(ctx);
                const orderID = Order.ID as string;

                const first = await postDue(ctx, orderID, '2026-09-30');
                AssertEqual(first.Posted, 1, 'the first pass recognises three months');
                const second = await postDue(ctx, orderID, '2026-09-30');
                // Not a guard — a consequence. The delta is earned-through less recognised-to-date,
                // and the first pass made those equal. Idempotence falls out of the subtraction,
                // which is what makes a re-run after a partial failure safe.
                AssertEqual(second.Posted, 0, 'the second finds a zero delta and writes nothing');
                AssertEqual(second.Lines?.length, 0, 'and reports no line, because a line with nothing to post is not listed');
                AssertEqual((await recognitionEntries(ctx, orderID)).length, 1, 'still one entry');
            }),
    },
];

for (const check of RevenueRecognitionChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('revenue-recognition', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});
