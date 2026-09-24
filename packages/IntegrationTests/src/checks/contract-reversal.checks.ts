/**
 * contract-reversal.checks.ts — the `contract-reversal` bundle (RV1–RV6).
 *
 * REVERSING A SCHEDULED ORDER IS NOT MIRRORING ITS BOOKING ENTRY (D92 §6). A company billed by
 * instalment never posted one — its value reaches the ledger an instalment at a time — so a
 * reversal that mirrored booking would credit the customer for invoices they never received.
 * Three rules replace it, and the order they apply in is the design:
 *
 *   withdraw  the instalments nobody has been billed for, once the whole order is reversed; no entry
 *   credit    what WAS billed and not yet earned, as `Dr Deferred / Cr AR`, prorated by quantity
 *   refuse    what was earned and not yet billed, rather than stranding it in Unbilled Receivable
 *
 * WHAT IT PROVES
 *   RV1  Andrew's Scenario 1 (with a discount, so net and gross differ): reversed at month five, the
 *        memo is the 900 billed-and-unearned, only the seven releases still to come are mirrored,
 *        the two unissued instalments are withdrawn and the origin's BilledToDate falls by the memo
 *   RV2  a reversal on an order with NO schedule books what it always did — the regression fence
 *   RV3  a line that earned more than it billed refuses the reversal and says which line and how much
 *   RV4  cancelled before the first invoice: four instalments withdrawn and NO entry — nothing to credit
 *   RV5  fully delivered and fully billed: no memo and no entry — nothing is owed back
 *   RV6  4 of 10 then the other 6: memos of 360 and 540, the schedule withdrawn only by the second
 *   RV7  the same two reversals on different dates, with instalment 3 issued between: the second
 *        memo is 1,620, because the months the first one already mirrored back are not earned twice
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 */
import { Metadata } from '@memberjunction/core';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import { OrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import {
    ACCT_SCHEMA,
    CreateOrdersFixture,
    createViaEntity,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    TeardownOrdersFixture,
    TxOne,
    TxQuery,
} from '../fixture.js';
import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY } from '../entity-names.js';
import { BuildOrder, ConfirmOrder } from '../order-builder.js';
import { issue } from './payment-schedule.checks.js';

/** The order date every fixture here uses, so "due on the order date" is unambiguous. */
const ORDER_DATE = '2026-07-01';

interface ScheduleRow {
    ID: string;
    InstallmentNumber: number;
    Amount: number;
    Status: string;
    DocumentNumber: string | null;
}

const schedule = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<ScheduleRow>(
        ctx,
        `SELECT ID, InstallmentNumber, Amount, Status, DocumentNumber
           FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID='${orderID}' ORDER BY InstallmentNumber`,
    );

const lineTotals = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<{ ID: string; LineNumber: number; BilledToDate: number; RecognizedToDate: number }>(
        ctx,
        `SELECT ID, LineNumber, BilledToDate, RecognizedToDate
           FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}' ORDER BY LineNumber`,
    );

/** Every journal line an order's lines produced, by account code. */
const entryLines = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<{ Code: string; Name: string; Debit: number; Credit: number; Description: string }>(
        ctx,
        `SELECT gl.Code, gl.Name, jel.DebitAmount AS Debit, jel.CreditAmount AS Credit, je.Description
           FROM ${ORDERS_SCHEMA}.OrderLine ol
           JOIN ${ACCT_SCHEMA}.vwJournalEntries je ON je.ID = ol.JournalEntryID
           JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
           JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
          WHERE ol.OrderHeaderID = '${orderID}'`,
    );

/** The account a role resolves to for a company, read rather than hardcoded. */
async function accountCodeForRole(ctx: IntegrationCheckContext, role: string, companyID: string): Promise<string> {
    const f = Fx();
    const row = await TxOne<{ Code: string }>(
        ctx,
        `SELECT gl.Code
           FROM ${ACCT_SCHEMA}.GLAccountLink lk
           JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = lk.GLAccountID
           JOIN ${ACCT_SCHEMA}.GLAccountRole r ON r.ID = lk.GLAccountRoleID
          WHERE r.Name = '${role}' AND lk.Status = 'Active'
            AND lk.EntityID = '${f.CompanyEntityID}' AND lk.RecordID = '${companyID}'`,
    );
    Assert(row != null, `the fixture must link a '${role}' account for company ${companyID}`);
    return row!.Code;
}

/** One sale line on a scheduled order. `unitPrice × quantity` is list; the schedule ties to net. */
interface SaleSpec {
    productID: string;
    unitPrice: number;
    quantity?: number;
    discountPct?: number;
    instalments: { InstallmentNumber: number; DueDate: string; Amount: number }[];
    /** A deferred driver earns across a window and refuses to book without one. */
    servicePeriod?: { Start: string; End: string };
}

/**
 * A confirmed order for one line, with the instalments asked for. Confirm issues every instalment
 * due on or before the order date (D92), so a fixture chooses what starts life billed.
 */
async function confirmedOrder(ctx: IntegrationCheckContext, spec: SaleSpec) {
    const f = Fx();
    const draft = await BuildOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        BillToOrganizationID: f.Customers.OrganizationID,
        OrderDate: new Date(`${ORDER_DATE}T00:00:00Z`),
        Lines: [
            {
                ProductID: spec.productID,
                Quantity: spec.quantity ?? 1,
                UnitPrice: spec.unitPrice,
                ...(spec.discountPct ? { DiscountPct: spec.discountPct } : {}),
                ServicePeriodStart: spec.servicePeriod?.Start,
                ServicePeriodEnd: spec.servicePeriod?.End,
            },
        ],
    });
    Assert(await draft.Order.Save(), `draft must save: ${draft.Order.LatestResult?.CompleteMessage ?? ''}`);
    const orderID = draft.Order.ID as string;

    const ids: string[] = [];
    for (const row of spec.instalments) {
        ids.push(
            await createViaEntity(ctx, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, {
                OrderHeaderID: orderID,
                CompanyID: f.CoA.ID,
                InstallmentNumber: row.InstallmentNumber,
                DueDate: new Date(`${row.DueDate}T00:00:00Z`),
                Amount: row.Amount,
            }),
        );
    }

    const md = new Metadata();
    const order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, ctx.User);
    Assert(await order.Load(orderID), 'header reload must succeed');
    order.Status = 'Confirmed';
    const saved = await order.Save();
    return { orderID, ids, order, saved, message: order.LatestResult?.CompleteMessage ?? '' };
}

/** The reversing order, confirmed. Returns the attempt so a check can assert a refusal. */
async function reverse(
    ctx: IntegrationCheckContext,
    originLineID: string,
    productID: string,
    over: { quantity?: number; orderDate?: string; servicePeriod?: { Start: string; End: string } } = {},
) {
    const f = Fx();
    return ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        OrderType: 'Return',
        BillToOrganizationID: f.Customers.OrganizationID,
        OrderDate: new Date(`${over.orderDate ?? ORDER_DATE}T00:00:00Z`),
        Lines: [
            {
                ProductID: productID,
                Quantity: -(over.quantity ?? 1),
                ReversesOrderLineID: originLineID,
                // The window does not prorate: unwinding a year's subscription unwinds the year.
                ServicePeriodStart: over.servicePeriod?.Start,
                ServicePeriodEnd: over.servicePeriod?.End,
            },
        ],
    });
}

/** Every entry an order's lines produced, other than staged recognition, with its account lines. */
const valueLines = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<{ Code: string; Debit: number; Credit: number; Description: string }>(
        ctx,
        `SELECT gl.Code, jel.DebitAmount AS Debit, jel.CreditAmount AS Credit, je.Description
           FROM ${ACCT_SCHEMA}.vwJournalEntries je
           JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
           JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
          WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) <> 'RevenueRecognition'
            AND je.LinkedRecordID IN
                (SELECT CAST(ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}')`,
    );

/** The staged recognition entries an order's lines produced: one row per entry, by date. */
const releases = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<{ D: string; Amount: number }>(
        ctx,
        `SELECT CONVERT(varchar(10), je.EffectiveDate, 23) AS D, SUM(ISNULL(jel.DebitAmount, 0)) AS Amount
           FROM ${ACCT_SCHEMA}.vwJournalEntries je
           JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
          WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'RevenueRecognition'
            AND je.LinkedRecordID IN
                (SELECT CAST(ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}')
          GROUP BY je.ID, je.EffectiveDate
          ORDER BY D`,
    );

const cents = (n: number) => Math.round(Number(n) * 100) / 100;
const sum = (rows: { Amount: number }[]) => cents(rows.reduce((s, r) => s + Number(r.Amount), 0));

/**
 * Andrew's Scenario 1 at a tenth off: 12,000 list, 10,800 net, a year from the order date, billed
 * 2,700 a quarter in advance. Net ≠ gross on purpose: a memo worked on gross would be 1,000, not 900.
 */
const SCENARIO_1 = (quantity = 1): SaleSpec => ({
    productID: Fx().Products.DeferredA,
    unitPrice: 12_000 / quantity,
    quantity,
    discountPct: 0.1,
    servicePeriod: { Start: '2026-07-01', End: '2027-06-30' },
    instalments: [
        { InstallmentNumber: 1, DueDate: '2026-07-01', Amount: 2700 },
        { InstallmentNumber: 2, DueDate: '2026-10-01', Amount: 2700 },
        { InstallmentNumber: 3, DueDate: '2027-01-01', Amount: 2700 },
        { InstallmentNumber: 4, DueDate: '2027-04-01', Amount: 2700 },
    ],
});

/** Month five of Scenario 1: five 900 releases earned, two instalments billed. */
const MONTH_FIVE = '2026-11-15';

/**
 * Scenario 1 confirmed with instalment 2 issued: 5,400 billed, and five months earned by the
 * reversal date. Asserts the starting position so a later failure cannot be a fixture drift.
 */
async function scenarioOneAtMonthFive(ctx: IntegrationCheckContext, quantity = 1) {
    const sale = await confirmedOrder(ctx, SCENARIO_1(quantity));
    Assert(sale.saved, `confirm: ${sale.message}`);
    Assert((await issue(ctx, sale.ids[1])).Success, 'issue instalment 2');
    const [origin] = await lineTotals(ctx, sale.orderID);
    AssertEqual(Number(origin.BilledToDate), 5400, 'two instalments billed, on net');
    return { ...sale, originLineID: origin.ID };
}

export const ContractReversalChecks: NamedCheck[] = [
    {
        Id: 'contract-reversal.RV1',
        Name: "RV1: Andrew's Scenario 1 at month five credits the unearned 900, mirrors only the releases to come, and withdraws the rest",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { orderID, originLineID } = await scenarioOneAtMonthFive(ctx);

                const back = await reverse(ctx, originLineID, f.Products.DeferredA, {
                    orderDate: MONTH_FIVE,
                    servicePeriod: SCENARIO_1().servicePeriod,
                });
                Assert(back.Saved, `the reversal must confirm: ${back.Message}`);
                const backID = back.Order.ID as string;

                // The memo: 5,400 billed less 4,500 earned through 1 November. Net, not gross.
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                const memo = await valueLines(ctx, backID);
                AssertEqual(memo.length, 2, 'the reversal books one two-line entry, the credit memo');
                Assert(memo[0].Description.includes('credit memo'), `and it is the memo, got: ${memo[0].Description}`);
                Assert(memo[0].Description.includes('reversing order'), `naming what it unwinds, got: ${memo[0].Description}`);
                const credit = memo.find((l) => Number(l.Credit ?? 0) > 0)!;
                AssertEqual(credit.Code, ar, 'crediting the receivable');
                AssertEqual(cents(credit.Credit), 900, 'by the billed-and-unearned balance on NET — 1,000 would be gross');
                AssertEqual(cents(memo.find((l) => Number(l.Debit ?? 0) > 0)!.Debit), 900, 'debiting Deferred the same');

                // THE EARNED MONTHS STAY EARNED. Only releases dated after the reversal are mirrored,
                // and they are exactly the origin's releases still to come.
                const originFuture = (await releases(ctx, orderID)).filter((r) => r.D > MONTH_FIVE);
                const mirrored = await releases(ctx, backID);
                AssertEqual(originFuture.length, 7, 'the origin has seven releases after month five');
                AssertEqual(mirrored.length, 7, 'and the reversal mirrors those seven, not all twelve');
                AssertEqual(mirrored.map((r) => r.D).join(','), originFuture.map((r) => r.D).join(','), 'on the same dates');
                AssertEqual(sum(mirrored), 6300, 'for the 6,300 not yet earned');

                // The totals still summarise the ledger: the origin is un-billed by the memo, and the
                // reversing line bills nothing because AR moved by the memo alone.
                AssertEqual(Number((await lineTotals(ctx, orderID))[0].BilledToDate), 4500, 'origin billed falls by the memo');
                AssertEqual(Number((await lineTotals(ctx, backID))[0].BilledToDate), 0, 'the reversing line billed nothing');

                const after = await schedule(ctx, orderID);
                AssertEqual(after.map((r) => r.Status).join(','), 'Invoiced,Invoiced,Canceled,Canceled', 'the unissued two are withdrawn');
                Assert(after[0].DocumentNumber != null && after[1].DocumentNumber != null, 'the issued two keep their numbers');
            }),
    },
    {
        Id: 'contract-reversal.RV2',
        Name: 'RV2: a reversal on an order with no schedule books exactly what it always did',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { orderID, saved, message } = await confirmedOrder(ctx, { productID: f.Products.WidgetA, unitPrice: 300, instalments: [] });
                Assert(saved, `confirm: ${message}`);
                const totals = await lineTotals(ctx, orderID);

                const back = await reverse(ctx, totals[0].ID, f.Products.WidgetA);
                Assert(back.Saved, `the reversal must confirm: ${back.Message}`);

                // THE FENCE. No schedule means no memo: the reversal mirrors the booking entry, as
                // every return in this system has always done. A credit-memo line here would mean
                // the new path had leaked into the old one.
                const lines = await entryLines(ctx, back.Order.ID as string);
                AssertEqual(
                    lines.filter((l) => l.Description.includes('credit memo')).length,
                    0,
                    'an unscheduled reversal books no credit memo',
                );
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                AssertEqual(
                    lines.filter((l) => l.Code === ar).reduce((s, l) => s + Number(l.Credit ?? 0), 0),
                    300,
                    'it credits the receivable for the whole line, mirroring what booking debited',
                );
            }),
    },
    {
        Id: 'contract-reversal.RV3',
        Name: 'RV3: a line that earned more than it billed refuses the reversal, naming the line and the amount',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // An UP-FRONT line on a scheduled company earns in full at confirm (Andrew's
                // Scenario 3) while only the instalment due that day is billed — so it starts life
                // with 200 earned and not yet billable, which is a contract asset in Unbilled
                // Receivable. Reversing around it would leave that balance with no contract behind
                // it, so the reversal is refused rather than booked.
                const { orderID, saved, message } = await confirmedOrder(ctx, {
                    productID: f.Products.WidgetA,
                    unitPrice: 300,
                    instalments: [
                        { InstallmentNumber: 1, DueDate: ORDER_DATE, Amount: 100 },
                        { InstallmentNumber: 2, DueDate: '2027-07-01', Amount: 200 },
                    ],
                });
                Assert(saved, `confirm: ${message}`);

                const totals = await lineTotals(ctx, orderID);
                AssertEqual(Number(totals[0].BilledToDate), 100, 'confirm billed the instalment due that day');
                AssertEqual(Number(totals[0].RecognizedToDate), 300, 'and an up-front line earned the whole of it');

                const back = await reverse(ctx, totals[0].ID, f.Products.WidgetA);
                Assert(!back.Saved, 'a reversal that would strand an unbilled balance must be refused');
                Assert(
                    back.Message.includes('recognised that has not been billed'),
                    `and must say why, got: ${back.Message}`,
                );
                Assert(back.Message.includes('200.00'), `naming the amount, got: ${back.Message}`);

                // Nothing moved: the refusal happens before booking, not inside it.
                const after = await schedule(ctx, orderID);
                AssertEqual(after[1].Status, 'Scheduled', 'the unissued instalment was not withdrawn');
            }),
    },
    {
        Id: 'contract-reversal.RV4',
        Name: 'RV4: cancelled before the first invoice, four instalments are withdrawn and nothing is credited',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // Andrew's item 1. The service starts after the order date and so does every
                // instalment, so confirm bills nothing. A mirrored value entry here would credit
                // 10,800 to a customer who was never invoiced.
                const window = { Start: '2026-10-01', End: '2027-09-30' };
                const sale = await confirmedOrder(ctx, {
                    ...SCENARIO_1(),
                    servicePeriod: window,
                    instalments: [
                        { InstallmentNumber: 1, DueDate: '2026-10-01', Amount: 2700 },
                        { InstallmentNumber: 2, DueDate: '2027-01-01', Amount: 2700 },
                        { InstallmentNumber: 3, DueDate: '2027-04-01', Amount: 2700 },
                        { InstallmentNumber: 4, DueDate: '2027-07-01', Amount: 2700 },
                    ],
                });
                Assert(sale.saved, `confirm: ${sale.message}`);
                const [origin] = await lineTotals(ctx, sale.orderID);
                AssertEqual(Number(origin.BilledToDate), 0, 'nothing billed yet');

                const back = await reverse(ctx, origin.ID, f.Products.DeferredA, { servicePeriod: window });
                Assert(back.Saved, `the reversal must confirm: ${back.Message}`);
                const backID = back.Order.ID as string;

                AssertEqual((await valueLines(ctx, backID)).length, 0, 'no memo and no mirrored value entry');
                AssertEqual((await releases(ctx, backID)).length, 12, 'every release is still to come, so all twelve are mirrored');
                AssertEqual(
                    (await schedule(ctx, sale.orderID)).map((r) => r.Status).join(','),
                    'Canceled,Canceled,Canceled,Canceled',
                    'all four instalments are withdrawn',
                );
            }),
    },
    {
        Id: 'contract-reversal.RV5',
        Name: 'RV5: fully delivered and fully billed, a reversal credits nothing and books nothing',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // The other half of item 1. An up-front line earns in full at confirm, and its only
                // instalment is due that day, so it is billed in full too: nothing is owed back.
                const sale = await confirmedOrder(ctx, {
                    productID: f.Products.WidgetA,
                    unitPrice: 300,
                    instalments: [{ InstallmentNumber: 1, DueDate: ORDER_DATE, Amount: 300 }],
                });
                Assert(sale.saved, `confirm: ${sale.message}`);
                const [origin] = await lineTotals(ctx, sale.orderID);
                AssertEqual(Number(origin.BilledToDate), 300, 'billed in full');
                AssertEqual(Number(origin.RecognizedToDate), 300, 'and earned in full');

                const back = await reverse(ctx, origin.ID, f.Products.WidgetA);
                Assert(back.Saved, `the reversal must confirm: ${back.Message}`);
                AssertEqual((await valueLines(ctx, back.Order.ID as string)).length, 0, 'no memo and no refund of 300');
                AssertEqual((await schedule(ctx, sale.orderID))[0].Status, 'Invoiced', 'the invoice stands');
            }),
    },
    {
        Id: 'contract-reversal.RV6',
        Name: 'RV6: reversing 4 of 10 then the other 6 credits 360 then 540, and withdraws the schedule only at the end',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // Andrew's item 3. Same contract as RV1 as ten units of 1,200 list. The two memos must
                // sum to RV1's 900; before the fix each credited the whole line's balance.
                const { orderID, originLineID } = await scenarioOneAtMonthFive(ctx, 10);
                const opts = { orderDate: MONTH_FIVE, servicePeriod: SCENARIO_1().servicePeriod };
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                const memoOf = async (id: string) =>
                    cents((await valueLines(ctx, id)).filter((l) => l.Code === ar).reduce((s, l) => s + Number(l.Credit ?? 0), 0));

                const four = await reverse(ctx, originLineID, f.Products.DeferredA, { ...opts, quantity: 4 });
                Assert(four.Saved, `the first reversal must confirm: ${four.Message}`);
                AssertEqual(await memoOf(four.Order.ID as string), 360, 'four tenths of the 900');
                AssertEqual(Number((await lineTotals(ctx, orderID))[0].BilledToDate), 5040, 'the origin is un-billed by 360');
                AssertEqual(sum(await releases(ctx, four.Order.ID as string)), 2520, 'and four tenths of the 6,300 to come is mirrored');
                AssertEqual(
                    (await schedule(ctx, orderID)).map((r) => r.Status).join(','),
                    'Invoiced,Invoiced,Scheduled,Scheduled',
                    'six units remain, so the schedule is left alone',
                );

                const six = await reverse(ctx, originLineID, f.Products.DeferredA, { ...opts, quantity: 6 });
                Assert(six.Saved, `the second reversal must confirm: ${six.Message}`);
                AssertEqual(await memoOf(six.Order.ID as string), 540, 'what is left, not the whole 900 again');
                AssertEqual(Number((await lineTotals(ctx, orderID))[0].BilledToDate), 4500, 'the origin ends billed for what it earned');
                AssertEqual(Number((await lineTotals(ctx, six.Order.ID as string))[0].BilledToDate), 0, 'the reversing line billed nothing');
                AssertEqual(
                    (await schedule(ctx, orderID)).map((r) => r.Status).join(','),
                    'Invoiced,Invoiced,Canceled,Canceled',
                    'now the whole order is reversed, the unissued instalments are withdrawn',
                );
            }),
    },
    {
        Id: 'contract-reversal.RV7',
        Name: 'RV7: reversing 4 of 10 in November and the other 6 in February credits 360 then 1,620',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // Andrew's second pass. RV6 runs both reversals on one date, where the first one's
                // mirrors all fall after the second and nothing is double-counted. Here the first one's
                // December, January and February mirrors (3 x 360) sit before the second, so counting
                // the origin's releases alone as earned would credit 540 rather than 1,620.
                const { orderID, ids, originLineID } = await scenarioOneAtMonthFive(ctx, 10);
                const window = SCENARIO_1().servicePeriod;
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                const memoOf = async (id: string) =>
                    cents((await valueLines(ctx, id)).filter((l) => l.Code === ar).reduce((s, l) => s + Number(l.Credit ?? 0), 0));

                const four = await reverse(ctx, originLineID, f.Products.DeferredA, { orderDate: MONTH_FIVE, servicePeriod: window, quantity: 4 });
                Assert(four.Saved, `the first reversal must confirm: ${four.Message}`);
                AssertEqual(await memoOf(four.Order.ID as string), 360, 'four tenths of the 900');

                Assert((await issue(ctx, ids[2])).Success, 'issue instalment 3 on 1 January');
                AssertEqual(Number((await lineTotals(ctx, orderID))[0].BilledToDate), 7740, '5,040 plus the 2,700 instalment');

                const six = await reverse(ctx, originLineID, f.Products.DeferredA, { orderDate: '2027-02-15', servicePeriod: window, quantity: 6 });
                Assert(six.Saved, `the second reversal must confirm: ${six.Message}`);
                // 7,740 billed, less 7,200 staged through 1 February, plus the 1,080 the first
                // reversal already took back of it.
                AssertEqual(await memoOf(six.Order.ID as string), 1620, 'owed 1,620, not 540');
                AssertEqual(sum(await releases(ctx, six.Order.ID as string)), 2160, 'six tenths of the four releases after 15 February');
                AssertEqual(Number((await lineTotals(ctx, orderID))[0].BilledToDate), 6120, 'the origin ends billed for what it kept earned');
                AssertEqual(
                    (await schedule(ctx, orderID)).map((r) => r.Status).join(','),
                    'Invoiced,Invoiced,Invoiced,Canceled',
                    'the whole order is reversed, so the one unissued instalment is withdrawn',
                );
            }),
    },
];

for (const check of ContractReversalChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('contract-reversal', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
        const { AccountingEngineBase } = await import('@mj-biz-apps/accounting-engine-base');
        await AccountingEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
    },
    Teardown: TeardownOrdersFixture,
});
