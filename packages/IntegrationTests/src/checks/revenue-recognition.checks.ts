/**
 * revenue-recognition.checks.ts — the `revenue-recognition` bundle (RR1–RR7).
 *
 * D14's central claim: recognition is not a nightly job, it is FORWARD-DATED LEDGER. At booking we
 * write every future release entry immediately, so the ledger already contains the whole schedule
 * and nothing has to wake up later to earn revenue. These checks hold that claim to the numbers.
 *
 * WHAT IT PROVES
 *   RR1  a straight-line deferred line writes ONE booking entry plus N forward-dated releases
 *   RR2  the releases sum EXACTLY to the line amount (rounding remainder front-loaded, not dropped)
 *   RR3  the releases are genuinely future-dated relative to the booking
 *   RR4  each release is Dr Deferred Revenue / Cr Sales — the deferral round-trip closes
 *   RR5  OrderLine.JournalEntryID points at the BOOKING entry, never at a release
 *   RR6  an AllBackEnd (event) line recognizes 100% on the END date, in one entry
 *   RR7  an UpFront line credits Sales directly and writes NO release entries at all
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 */
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

interface EntryRow {
    ID: string;
    EntryType: string;
    EffectiveDate: string;
    D: number;
}

/** Every journal entry whose origin is one of this order's lines, booking + releases alike. */
async function entriesForOrder(ctx: IntegrationCheckContext, orderID: string): Promise<EntryRow[]> {
    return TxQuery<EntryRow>(
        ctx,
        `SELECT je.ID, (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) AS EntryType, je.EffectiveDate,
                (SELECT SUM(DebitAmount) FROM ${ACCT_SCHEMA}.JournalEntryLine WHERE JournalEntryID = je.ID) AS D
         FROM ${ACCT_SCHEMA}.vwJournalEntries je
         WHERE je.LinkedRecordID IN (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}')
            OR je.LinkedRecordID IN (
                 SELECT st.ID FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
                 JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
                 WHERE ol.OrderHeaderID = '${orderID}')
         ORDER BY je.EffectiveDate`,
    );
}

/** A 12-month, $1,200 straight-line deferred line — the canonical rev-rec case. */
async function confirmStraightLine(ctx: IntegrationCheckContext) {
    const f = Fx();
    const result = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        OrderDate: new Date('2026-07-01T00:00:00Z'),
        Lines: [
            {
                ProductID: f.Products.DeferredA,
                Quantity: 1,
                UnitPrice: 1200,
                ServicePeriodStart: '2026-07-01',
                ServicePeriodEnd: '2027-06-30',
            },
        ],
    });
    Assert(result.Saved, `confirm failed: ${result.Message}`);
    return result;
}

export const RevenueRecognitionChecks: NamedCheck[] = [
    {
        Id: 'revenue-recognition.RR1',
        Name: 'RR1: a straight-line deferred line writes one booking entry plus twelve releases',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmStraightLine(ctx);
                const entries = await entriesForOrder(ctx, Order.ID as string);
                AssertEqual(entries.filter((e) => e.EntryType === 'OrderBooking').length, 1, 'booking entries');
                AssertEqual(
                    entries.filter((e) => e.EntryType === 'RevenueRecognition').length,
                    12,
                    'forward-dated release entries for a 12-month period',
                );
            }),
    },
    {
        Id: 'revenue-recognition.RR2',
        Name: 'RR2: the releases sum exactly to the line amount',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmStraightLine(ctx);
                const releases = (await entriesForOrder(ctx, Order.ID as string)).filter(
                    (e) => e.EntryType === 'RevenueRecognition',
                );
                const total = Math.round(releases.reduce((t, r) => t + Number(r.D), 0) * 100) / 100;
                AssertEqual(total, 1200, 'sum of the release entries');
                // Each slice is a real amount — a schedule with a zero slice means the allocator
                // mis-divided even though the total happens to reconcile.
                Assert(
                    releases.every((r) => Number(r.D) > 0),
                    `every slice must be non-zero: ${JSON.stringify(releases.map((r) => Number(r.D)))}`,
                );
            }),
    },
    {
        Id: 'revenue-recognition.RR3',
        Name: 'RR3: releases are forward-dated — the ledger already holds the schedule',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmStraightLine(ctx);
                const entries = await entriesForOrder(ctx, Order.ID as string);
                const booking = entries.find((e) => e.EntryType === 'OrderBooking');
                const releases = entries.filter((e) => e.EntryType === 'RevenueRecognition');
                Assert(booking != null, 'no booking entry');

                const bookedOn = new Date(booking!.EffectiveDate).getTime();
                const dates = releases.map((r) => new Date(r.EffectiveDate).getTime()).sort((a, b) => a - b);
                AssertEqual(dates.length, 12, 'release count');
                Assert(
                    dates[dates.length - 1] > bookedOn,
                    'the last release must fall after the booking date — otherwise nothing was deferred',
                );
                // Distinct dates: 12 entries all on the same day would be a schedule in name only.
                AssertEqual(new Set(dates).size, 12, 'distinct release dates');
            }),
    },
    {
        Id: 'revenue-recognition.RR4',
        Name: 'RR4: each release debits Deferred Revenue and credits Sales',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmStraightLine(ctx);
                const lines = await TxQuery<{ Code: string; DebitAmount: number; CreditAmount: number }>(
                    ctx,
                    `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
                     FROM ${ACCT_SCHEMA}.vwJournalEntries je
                     JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
                     JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                     WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'RevenueRecognition'
                       AND je.LinkedRecordID IN (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${Order.ID}')`,
                );
                AssertEqual(lines.length, 24, 'two ledger lines per release × 12');

                const debits = lines.filter((l) => Number(l.DebitAmount) > 0);
                const credits = lines.filter((l) => Number(l.CreditAmount) > 0);
                Assert(
                    debits.every((l) => l.Code === '21301'),
                    `releases must DEBIT Deferred Revenue: ${JSON.stringify([...new Set(debits.map((l) => l.Code))])}`,
                );
                Assert(
                    credits.every((l) => l.Code === '40100'),
                    `releases must CREDIT Sales: ${JSON.stringify([...new Set(credits.map((l) => l.Code))])}`,
                );

                // The round trip closes: what booking put INTO deferred, the releases take back out.
                const released = debits.reduce((t, l) => t + Number(l.DebitAmount), 0);
                AssertEqual(Math.round(released * 100) / 100, 1200, 'total drawn out of Deferred Revenue');
            }),
    },
    {
        Id: 'revenue-recognition.RR5',
        Name: 'RR5: the order line points at the booking entry, not at a release',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmStraightLine(ctx);
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
        Id: 'revenue-recognition.RR6',
        Name: 'RR6: an event line recognizes 100% on its end date, in a single entry',
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

                const releases = (await entriesForOrder(ctx, result.Order.ID as string)).filter(
                    (e) => e.EntryType === 'RevenueRecognition',
                );
                AssertEqual(releases.length, 1, 'AllBackEnd release count');
                AssertEqual(Number(releases[0].D), 500, 'the whole amount is earned at once');
                AssertEqual(
                    new Date(releases[0].EffectiveDate).toISOString().slice(0, 10),
                    '2026-09-30',
                    'earned on the END date — nothing is earned until the event happens',
                );
            }),
    },
    {
        Id: 'revenue-recognition.RR7',
        Name: 'RR7: an up-front line credits Sales directly and writes no releases',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 250 }],
                });
                Assert(result.Saved, `confirm failed: ${result.Message}`);

                const entries = await entriesForOrder(ctx, result.Order.ID as string);
                AssertEqual(entries.filter((e) => e.EntryType === 'RevenueRecognition').length, 0, 'releases');
                AssertEqual(entries.length, 1, 'total entries for an up-front line');

                const credit = await TxOne<{ Code: string; CreditAmount: number }>(
                    ctx,
                    `SELECT gl.Code, jel.CreditAmount
                     FROM ${ACCT_SCHEMA}.JournalEntryLine jel
                     JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                     WHERE jel.JournalEntryID = '${entries[0].ID}' AND jel.CreditAmount > 0`,
                );
                AssertEqual(credit.Code, '40100', 'up-front revenue credits');
                AssertEqual(Number(credit.CreditAmount), 250, 'credit amount');
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
