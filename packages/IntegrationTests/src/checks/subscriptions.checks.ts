/**
 * subscriptions.checks.ts — the `subscriptions` bundle (SB1–SB15).
 *
 * D45/D46: subscription rules are DATA. `SubscriptionType`'s columns decide when a term starts, how
 * long it runs, whether a partial period is prorated, what a repeat purchase does, and how the
 * revenue is sliced — and `SubscriptionBehavior` reads them. These checks drive the four seeded
 * types through a real confirm and assert the resulting `Subscription` / `SubscriptionTerm` rows and
 * ledger, because a rules engine that is only unit-tested proves the arithmetic and not the wiring.
 *
 * WHAT IT PROVES
 *   SB1   buying a subscription product materializes a Subscription + a term-1 SubscriptionTerm
 *   SB2   the term freezes the recognition type at purchase (later rule edits can't restate it)
 *   SB3   an immediate annual term runs purchase → purchase + 12 months − 1 day
 *   SB4   a Jan-1-anchored purchase produces a PARTIAL first term ending Dec 31
 *   SB5   …prorated: the term amount is reduced by the fraction of the year actually covered
 *   SB6   a ChargeFull anchored type takes the whole price for the partial window
 *   SB7   ConcurrencyMode=ExtendExisting appends term 2 starting the day the old one ends
 *   SB8   ConcurrencyMode=RejectDuplicate rejects the whole confirm on a second purchase
 *   SB9   SubscriberScope=Organization rejects an order that has no customer organization
 *   SB10  recognition entries anchor to the SUBSCRIPTION TERM, not the order line (D46)
 *   SB11  RecognitionCadence=Quarterly yields 4 slices a year, not 12
 *   SB12  a term start STATED on the line is honored, and the type computes the end from it
 *   SB13  a stated start in the future defers the term and every recognition entry with it
 *   SB14  each subscription line on one order carries its own term start
 *   SB15  a renewal ignores a stated start and continues where existing coverage ends
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
    SameID,
    TeardownOrdersFixture,
    TxOne,
    TxQuery,
} from '../fixture.js';
import { ConfirmOrder, type OrderSpec } from '../order-builder.js';

/** Mid-year on purpose: every anchored type must then produce a PARTIAL first term. */
const JULY_1 = new Date('2026-07-01T00:00:00');

/**
 * The booking date the term-start checks turn on (D-TERMSTART): late in the month, so a term
 * derived from it is visibly wrong whenever the agreement says coverage starts on the 1st.
 */
const BOOKED_AUG_27 = new Date('2026-08-27T00:00:00');

interface TermRow {
    ID: string;
    SubscriptionID: string;
    TermNumber: number;
    StartDate: string;
    EndDate: string;
    Amount: number;
    IsProrated: boolean;
    ProrationFactor: number | null;
    RevenueRecognitionTypeID: string;
    Status: string;
}

/** Confirm a one-line subscription order for the organization customer. */
async function buySubscription(
    ctx: IntegrationCheckContext,
    productKey: string,
    price: number,
    overrides: Partial<OrderSpec> = {},
) {
    const f = Fx();
    const result = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        OrderDate: JULY_1,
        BillToOrganizationID: f.Customers.OrganizationID,
        Lines: [{ ProductID: f.Products[productKey], Quantity: 1, UnitPrice: price }],
        ...overrides,
    });
    return result;
}

/** The terms bought by a given order, newest term last. */
async function termsForOrder(ctx: IntegrationCheckContext, orderID: string): Promise<TermRow[]> {
    return TxQuery<TermRow>(
        ctx,
        `SELECT st.* FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
         JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
         WHERE ol.OrderHeaderID = '${orderID}'
         ORDER BY st.TermNumber`,
    );
}

const isoDate = (v: string | Date) => new Date(v).toISOString().slice(0, 10);

interface EntryRow {
    EntryType: string;
    EffectiveDate: string;
}

/**
 * Every journal entry this order produced — the booking entry, whose origin is the line, and the
 * recognition entries, whose origin is the term (D46). Both are needed together here: the point
 * of a stated term start is that these two sets carry DIFFERENT dates.
 */
async function entriesForOrder(ctx: IntegrationCheckContext, orderID: string): Promise<EntryRow[]> {
    return TxQuery<EntryRow>(
        ctx,
        `SELECT (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) AS EntryType,
                je.EffectiveDate
         FROM ${ACCT_SCHEMA}.vwJournalEntries je
         WHERE je.LinkedRecordID IN (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}')
            OR je.LinkedRecordID IN (
                 SELECT st.ID FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
                 JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
                 WHERE ol.OrderHeaderID = '${orderID}')
         ORDER BY je.EffectiveDate`,
    );
}

export const SubscriptionChecks: NamedCheck[] = [
    {
        Id: 'subscriptions.SB1',
        Name: 'SB1: buying a subscription product materializes a Subscription and its first term',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const result = await buySubscription(ctx, 'SubRolling', 1200);
                Assert(result.Saved, `confirm failed: ${result.Message}`);

                const terms = await termsForOrder(ctx, result.Order.ID as string);
                AssertEqual(terms.length, 1, 'terms created');
                AssertEqual(Number(terms[0].TermNumber), 1, 'term number');
                AssertEqual(terms[0].Status, 'Active', 'term status');

                const sub = await TxOne<{
                    SubscriptionNumber: string;
                    Status: string;
                    CompanyID: string;
                    HolderOrganizationID: string;
                    SubscriptionTypeID: string;
                }>(
                    ctx,
                    `SELECT SubscriptionNumber, Status, CompanyID, HolderOrganizationID, SubscriptionTypeID
                     FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${terms[0].SubscriptionID}'`,
                );
                Assert(
                    /^SUB-\d{6}$/.test(sub.SubscriptionNumber),
                    `SubscriptionNumber must be SUB-{6 digits}, got '${sub.SubscriptionNumber}'`,
                );
                AssertEqual(sub.Status, 'Active', 'subscription status');
                Assert(
                    SameID(sub.CompanyID, f.CoA.ID),
                    "the subscription must belong to the PRODUCT's company (D6)",
                );
                Assert(SameID(sub.HolderOrganizationID, f.Customers.OrganizationID), 'subscriber');
            }),
    },
    {
        Id: 'subscriptions.SB2',
        Name: 'SB2: the term freezes the recognition type at purchase',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const result = await buySubscription(ctx, 'SubRolling', 1200);
                Assert(result.Saved, `confirm failed: ${result.Message}`);
                const terms = await termsForOrder(ctx, result.Order.ID as string);

                // The FROZEN copy must equal what the product said AT PURCHASE — this is what makes
                // a later product edit unable to retroactively restate booked revenue (D45).
                const product = await TxOne<{ RevenueRecognitionTypeID: string }>(
                    ctx,
                    `SELECT RevenueRecognitionTypeID FROM ${ORDERS_SCHEMA}.Product WHERE ID = '${f.Products.SubRolling}'`,
                );
                Assert(
                    SameID(terms[0].RevenueRecognitionTypeID, product.RevenueRecognitionTypeID),
                    'the term must freeze the product\'s recognition type as it was at purchase',
                );
                Assert(
                    SameID(terms[0].RevenueRecognitionTypeID, f.RevRecTypeIDs.get('EvenOverTime')),
                    'the rolling subscription must be straight-line',
                );
            }),
    },
    {
        Id: 'subscriptions.SB3',
        Name: 'SB3: an immediate annual term runs from the purchase date for twelve months',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const result = await buySubscription(ctx, 'SubRolling', 1200);
                Assert(result.Saved, `confirm failed: ${result.Message}`);
                const [term] = await termsForOrder(ctx, result.Order.ID as string);

                AssertEqual(isoDate(term.StartDate), '2026-07-01', 'term start (StartMode=Immediate)');
                AssertEqual(isoDate(term.EndDate), '2027-06-30', 'term end (12 months, inclusive)');
                AssertEqual(Number(term.Amount), 1200, 'nothing is prorated for a rolling type');
                Assert(!term.IsProrated, 'a rolling term is never prorated');
            }),
    },
    {
        Id: 'subscriptions.SB4',
        Name: 'SB4: a calendar-anchored purchase produces a partial first term ending at the anchor',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const result = await buySubscription(ctx, 'SubCalendar', 1200);
                Assert(result.Saved, `confirm failed: ${result.Message}`);
                const [term] = await termsForOrder(ctx, result.Order.ID as string);

                // Anchor is Jan 1. Bought Jul 1 → the stub term runs to Dec 31, and the NEXT term
                // will start on the anchor. That is the whole point of an anchored type.
                AssertEqual(isoDate(term.StartDate), '2026-07-01', 'partial term start');
                AssertEqual(isoDate(term.EndDate), '2026-12-31', 'partial term ends the day before the anchor');
            }),
    },
    {
        Id: 'subscriptions.SB5',
        Name: 'SB5: a prorated partial term bills the fraction, on the line as well as the term',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const result = await buySubscription(ctx, 'SubCalendar', 1200);
                Assert(result.Saved, `confirm failed: ${result.Message}`);
                const [term] = await termsForOrder(ctx, result.Order.ID as string);

                Assert(term.IsProrated, 'PartialPeriodMode=Prorate must mark the term prorated');
                // Jul 1 → Dec 31 inclusive is 184 days of a 365-day year.
                const expectedFactor = 184 / 365;
                const factor = Number(term.ProrationFactor);
                Assert(
                    Math.abs(factor - expectedFactor) < 1e-5,
                    `proration factor ${factor} should be ~${expectedFactor.toFixed(6)} (184/365 days)`,
                );

                // PRORATION MUST REACH THE ORDER LINE. If only the term recorded the reduction, the
                // customer would be invoiced the full 1200 for six months of coverage and the
                // booking entry would never reconcile with what the schedule recognizes.
                const line = await TxOne<{ Quantity: number; LineTotalNet: number }>(
                    ctx,
                    `SELECT Quantity, LineTotalNet FROM ${ORDERS_SCHEMA}.OrderLine
                     WHERE OrderHeaderID = '${result.Order.ID}'`,
                );
                Assert(
                    Math.abs(Number(line.Quantity) - factor) < 1e-3,
                    `the line quantity ${line.Quantity} must carry the proration (~${factor.toFixed(4)}), not stay at 1`,
                );

                // The three numbers that must agree or deferred revenue never clears to zero:
                // what was billed (line net), what the term says, and what the schedule recognizes.
                AssertEqual(Number(term.Amount), Number(line.LineTotalNet), 'term amount equals the line net');
                Assert(Number(term.Amount) < 1200, 'a prorated term must cost less than a full one');

                const released = await TxOne<{ Total: number }>(
                    ctx,
                    `SELECT SUM(jel.DebitAmount) AS Total
                     FROM ${ACCT_SCHEMA}.vwJournalEntries je
                     JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
                     WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'RevenueRecognition' AND je.LinkedRecordID = '${term.ID}'
                       AND jel.DebitAmount > 0`,
                );
                AssertEqual(
                    Math.round(Number(released.Total) * 100) / 100,
                    Number(term.Amount),
                    'the recognition schedule releases exactly the prorated amount',
                );
            }),
    },
    {
        Id: 'subscriptions.SB6',
        Name: 'SB6: a ChargeFull anchored type charges the whole price for the partial window',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Fiscal-year type: Jul 1 anchor, ChargeFull, organization-only.
                // Bought ON the anchor date, so the next anchor is a year out and the term is full.
                const result = await buySubscription(ctx, 'SubFiscal', 900);
                Assert(result.Saved, `confirm failed: ${result.Message}`);
                const [term] = await termsForOrder(ctx, result.Order.ID as string);

                Assert(!term.IsProrated, 'ChargeFull must never prorate');
                AssertEqual(Number(term.Amount), 900, 'the customer pays full freight');
                AssertEqual(isoDate(term.StartDate), '2026-07-01', 'term start');
                AssertEqual(isoDate(term.EndDate), '2027-06-30', 'a full fiscal year');
            }),
    },
    {
        Id: 'subscriptions.SB7',
        Name: 'SB7: a repeat purchase on an ExtendExisting type appends a contiguous second term',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const first = await buySubscription(ctx, 'SubRolling', 1200);
                Assert(first.Saved, `first confirm failed: ${first.Message}`);
                const [term1] = await termsForOrder(ctx, first.Order.ID as string);

                const second = await buySubscription(ctx, 'SubRolling', 1200);
                Assert(second.Saved, `second confirm failed: ${second.Message}`);
                const [term2] = await termsForOrder(ctx, second.Order.ID as string);

                Assert(
                    SameID(term2.SubscriptionID, term1.SubscriptionID),
                    'the second purchase must EXTEND the same subscription, not create another',
                );
                AssertEqual(Number(term2.TermNumber), 2, 'the new term number');

                // Contiguous, non-overlapping: term 2 starts the day after term 1 ends.
                const dayAfter = new Date(term1.EndDate);
                dayAfter.setDate(dayAfter.getDate() + 1);
                AssertEqual(
                    isoDate(term2.StartDate),
                    isoDate(dayAfter),
                    'term 2 starts the day after term 1 ends — no gap, no overlap',
                );
                AssertEqual(Number(term2.Amount), 1200, 'an extension is never prorated');
            }),
    },
    {
        Id: 'subscriptions.SB8',
        Name: 'SB8: a RejectDuplicate type refuses a second concurrent purchase',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const first = await buySubscription(ctx, 'SubFiscal', 900);
                Assert(first.Saved, `first confirm failed: ${first.Message}`);

                const second = await buySubscription(ctx, 'SubFiscal', 900);
                Assert(!second.Saved, 'the second purchase must be REJECTED by ConcurrencyMode=RejectDuplicate');
                Assert(
                    /second concurrent subscription/i.test(second.Message),
                    `the rejection should name the concurrency rule, got: ${second.Message}`,
                );

                // A rules rejection fails the WHOLE confirm — no order, no orphan term.
                const orphans = await TxQuery(
                    ctx,
                    `SELECT st.ID FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
                     WHERE ol.OrderHeaderID = '${second.Order.ID}'`,
                );
                AssertEqual(orphans.length, 0, 'terms left behind by the rejected confirm');

                const subs = await TxQuery(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.Subscription
                     WHERE ProductID = '${f.Products.SubFiscal}'
                       AND HolderOrganizationID = '${f.Customers.OrganizationID}'`,
                );
                AssertEqual(subs.length, 1, 'still exactly one subscription for this (customer, product)');
            }),
    },
    {
        Id: 'subscriptions.SB9',
        Name: 'SB9: an organization-only type rejects an order with no customer organization',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // SubFiscal is SubscriberScope=Organization; buy it for a PERSON instead.
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderDate: JULY_1,
                    BillToPersonID: f.Customers.PersonID,
                    Lines: [{ ProductID: f.Products.SubFiscal, Quantity: 1, UnitPrice: 900 }],
                });
                Assert(!result.Saved, 'an organization-only subscription must reject an individual buyer');
                Assert(
                    /organization-only/i.test(result.Message),
                    `the rejection should name the scope rule, got: ${result.Message}`,
                );
            }),
    },
    {
        Id: 'subscriptions.SB10',
        Name: 'SB10: recognition entries anchor to the subscription term, not the order line',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const result = await buySubscription(ctx, 'SubRolling', 1200);
                Assert(result.Saved, `confirm failed: ${result.Message}`);
                const [term] = await termsForOrder(ctx, result.Order.ID as string);

                const releases = await TxQuery<{ LinkedRecordID: string; LinkedEntity: string }>(
                    ctx,
                    `SELECT je.LinkedRecordID, e.Name AS LinkedEntity
                     FROM ${ACCT_SCHEMA}.vwJournalEntries je
                     JOIN __mj.Entity e ON e.ID = je.LinkedEntityID
                     WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'RevenueRecognition' AND je.LinkedRecordID = '${term.ID}'`,
                );
                AssertEqual(releases.length, 12, 'monthly releases anchored to the term');
                Assert(
                    releases.every((r) => r.LinkedEntity === SUBSCRIPTION_TERM_ENTITY),
                    `release origin entity: ${JSON.stringify([...new Set(releases.map((r) => r.LinkedEntity))])}`,
                );

                // The BOOKING entry still points at the order line — the sale is what an auditor
                // drills into; only the recognition follows the term (D46).
                const booking = await TxOne<{ LinkedEntity: string }>(
                    ctx,
                    `SELECT e.Name AS LinkedEntity
                     FROM ${ACCT_SCHEMA}.vwJournalEntries je
                     JOIN __mj.Entity e ON e.ID = je.LinkedEntityID
                     WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'OrderBooking'
                       AND je.LinkedRecordID IN (
                           SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${result.Order.ID}')`,
                );
                AssertEqual(booking.LinkedEntity, ORDER_LINE_ENTITY, 'booking entry origin');
            }),
    },
    {
        Id: 'subscriptions.SB11',
        Name: 'SB11: a quarterly recognition cadence yields four slices a year, not twelve',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // SubFiscal recognizes Quarterly over a 12-month term.
                const result = await buySubscription(ctx, 'SubFiscal', 900);
                Assert(result.Saved, `confirm failed: ${result.Message}`);
                const [term] = await termsForOrder(ctx, result.Order.ID as string);

                const releases = await TxQuery<{ D: number }>(
                    ctx,
                    `SELECT (SELECT SUM(DebitAmount) FROM ${ACCT_SCHEMA}.JournalEntryLine
                             WHERE JournalEntryID = je.ID) AS D
                     FROM ${ACCT_SCHEMA}.vwJournalEntries je
                     WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'RevenueRecognition' AND je.LinkedRecordID = '${term.ID}'`,
                );
                AssertEqual(releases.length, 4, 'quarterly slices over a 12-month term');
                AssertEqual(
                    Math.round(releases.reduce((t, r) => t + Number(r.D), 0) * 100) / 100,
                    900,
                    'quarterly slices still sum to the term amount',
                );

                // And the monthly type over the same span gives 12 — proving the count follows the
                // CADENCE COLUMN and is not a coincidence of the term length.
                const monthly = await buySubscription(ctx, 'SubRolling', 1200);
                Assert(monthly.Saved, `monthly confirm failed: ${monthly.Message}`);
                const [monthlyTerm] = await termsForOrder(ctx, monthly.Order.ID as string);
                const monthlyReleases = await TxQuery(
                    ctx,
                    `SELECT ID FROM ${ACCT_SCHEMA}.vwJournalEntries
                     WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = EntryTypeID) = 'RevenueRecognition' AND LinkedRecordID = '${monthlyTerm.ID}'`,
                );
                AssertEqual(monthlyReleases.length, 12, 'monthly slices over the same 12-month span');
            }),
    },
    {
        Id: 'subscriptions.SB12',
        Name: 'SB12: a term start stated on the line is honored, and the type computes the end from it',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // THE CASE THIS BUNDLE EXISTS FOR (D-TERMSTART). An order booked 8/27 selling a
                // membership the agreement says runs 8/1-7/31. Before this rule the term was forced
                // onto the order date and recognition began in the wrong month; the stated dates
                // were read by nobody and overwritten twice.
                //
                // Note the stated END is deliberately absurd: term length belongs to the type, and
                // a stated end has no rule to reconcile it against, so it must be ignored while the
                // stated START is obeyed.
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderDate: BOOKED_AUG_27,
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [
                        {
                            ProductID: f.Products.SubRolling,
                            Quantity: 1,
                            UnitPrice: 1200,
                            ServicePeriodStart: '2026-08-01',
                            ServicePeriodEnd: '2030-12-31',
                        },
                    ],
                });
                Assert(result.Saved, `confirm failed: ${result.Message}`);

                const [term] = await termsForOrder(ctx, result.Order.ID as string);
                AssertEqual(isoDate(term.StartDate), '2026-08-01', 'the term starts on the stated date');
                AssertEqual(isoDate(term.EndDate), '2027-07-31', 'twelve months measured from the stated start');

                // The line ends up holding the SETTLED term, which here begins on the very date
                // that was typed. The stated 2030 end is gone.
                const line = await TxOne<{ ServicePeriodStart: string; ServicePeriodEnd: string }>(
                    ctx,
                    `SELECT ServicePeriodStart, ServicePeriodEnd FROM ${ORDERS_SCHEMA}.OrderLine
                     WHERE OrderHeaderID = '${result.Order.ID}'`,
                );
                AssertEqual(isoDate(line.ServicePeriodStart), isoDate(term.StartDate), 'line start equals the term');
                AssertEqual(isoDate(line.ServicePeriodEnd), isoDate(term.EndDate), 'line end equals the term');

                // THE BOOKING DATE IS UNTOUCHED. This is the whole point of separating the two
                // facts: the sale was booked 8/27 and the ledger must still say so, while the
                // revenue is earned across the term that starts 8/1.
                const entries = await entriesForOrder(ctx, result.Order.ID as string);
                const booking = entries.find((e) => e.EntryType === 'OrderBooking');
                Assert(!!booking, 'the order booked a journal entry');
                AssertEqual(isoDate(booking!.EffectiveDate), '2026-08-27', 'booking entry keeps the ORDER date');

                const releases = entries.filter((e) => e.EntryType === 'RevenueRecognition');
                AssertEqual(releases.length, 12, 'monthly recognition across the term');
                AssertEqual(
                    isoDate(releases[0].EffectiveDate),
                    '2026-08-01',
                    'recognition starts in the month the TERM starts',
                );
            }),
    },
    {
        Id: 'subscriptions.SB13',
        Name: 'SB13: a stated term start in the future defers the term and every recognition entry',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // The other direction, and the one with a real accounting consequence: nothing may
                // be recognized before coverage begins. A term forced onto the 8/27 order date
                // would have earned August revenue for a membership that starts in September.
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderDate: BOOKED_AUG_27,
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [
                        {
                            ProductID: f.Products.SubRolling,
                            Quantity: 1,
                            UnitPrice: 1200,
                            ServicePeriodStart: '2026-09-01',
                        },
                    ],
                });
                Assert(result.Saved, `confirm failed: ${result.Message}`);

                const [term] = await termsForOrder(ctx, result.Order.ID as string);
                AssertEqual(isoDate(term.StartDate), '2026-09-01', 'term start');
                AssertEqual(isoDate(term.EndDate), '2027-08-31', 'term end');

                const entries = await entriesForOrder(ctx, result.Order.ID as string);
                const booking = entries.find((e) => e.EntryType === 'OrderBooking');
                AssertEqual(isoDate(booking!.EffectiveDate), '2026-08-27', 'booking entry keeps the ORDER date');

                const early = entries
                    .filter((e) => e.EntryType === 'RevenueRecognition')
                    .filter((e) => isoDate(e.EffectiveDate) < '2026-09-01');
                AssertEqual(early.length, 0, 'no revenue is recognized before coverage begins');
            }),
    },
    {
        Id: 'subscriptions.SB14',
        Name: 'SB14: each subscription line on one order carries its own term start',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // Per-LINE, not per-order. One order can sell two memberships that begin on
                // different dates, and a rule keyed to the order date cannot express that at all.
                // The third line states nothing and must still derive from the order date, so this
                // also proves the default and an override coexist on one confirm.
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderDate: BOOKED_AUG_27,
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [
                        {
                            ProductID: f.Products.SubRolling,
                            Quantity: 1,
                            UnitPrice: 1200,
                            ServicePeriodStart: '2026-08-01',
                        },
                        {
                            ProductID: f.Products.SubMonthly,
                            Quantity: 1,
                            UnitPrice: 100,
                            ServicePeriodStart: '2027-01-01',
                        },
                        { ProductID: f.Products.SubFiscal, Quantity: 1, UnitPrice: 900 },
                    ],
                });
                Assert(result.Saved, `confirm failed: ${result.Message}`);

                const rows = await TxQuery<{ ProductID: string; StartDate: string }>(
                    ctx,
                    `SELECT ol.ProductID, st.StartDate
                     FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
                     WHERE ol.OrderHeaderID = '${result.Order.ID}'`,
                );
                AssertEqual(rows.length, 3, 'one term per subscription line');

                const startFor = (productID: string) =>
                    isoDate(rows.find((r) => SameID(r.ProductID, productID))!.StartDate);
                AssertEqual(startFor(f.Products.SubRolling), '2026-08-01', 'line 1 honors its own start');
                AssertEqual(startFor(f.Products.SubMonthly), '2027-01-01', 'line 2 honors a different start');
                AssertEqual(
                    startFor(f.Products.SubFiscal),
                    '2026-08-27',
                    'line 3 states none and still derives from the order date',
                );
            }),
    },
    {
        Id: 'subscriptions.SB15',
        Name: 'SB15: a renewal still begins the day after existing coverage, whatever start it states',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const first = await buySubscription(ctx, 'SubRolling', 1200);
                Assert(first.Saved, `first confirm failed: ${first.Message}`);
                const [term1] = await termsForOrder(ctx, first.Order.ID as string);
                AssertEqual(isoDate(term1.EndDate), '2027-06-30', 'the term being renewed');

                // Coverage may neither overlap nor gap, so the extension has to start where the
                // existing term ends — a stated start cannot move it, and the confirm must NOT be
                // refused over a field the customer never sees.
                const renewal = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderDate: BOOKED_AUG_27,
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [
                        {
                            ProductID: f.Products.SubRolling,
                            Quantity: 1,
                            UnitPrice: 1200,
                            RenewsSubscriptionID: term1.SubscriptionID,
                            ServicePeriodStart: '2026-08-01',
                        },
                    ],
                });
                Assert(renewal.Saved, `renewal confirm failed: ${renewal.Message}`);

                const [term2] = await termsForOrder(ctx, renewal.Order.ID as string);
                AssertEqual(Number(term2.TermNumber), 2, 'the renewal is term 2 of the same subscription');
                Assert(SameID(term2.SubscriptionID, term1.SubscriptionID), 'same subscription');
                AssertEqual(isoDate(term2.StartDate), '2027-07-01', 'the day after existing coverage ends');
                AssertEqual(isoDate(term2.EndDate), '2028-06-30', 'a full term from there');
            }),
    },
];

for (const check of SubscriptionChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('subscriptions', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});
import {
  ORDER_LINE_ENTITY,
  SUBSCRIPTION_TERM_ENTITY,
} from "../entity-names.js";
