/**
 * payment-schedule — instalments on the order header (AIDP-24 · golive #239 · plan D85–D88).
 *
 * WHY IT EXISTS
 * An order used to carry one DueDate and one invoice for its whole value. A three-year contract
 * billed annually therefore either became three orders or lost its 2029 obligation entirely.
 * `OrderHeaderPaymentSchedule` gives each instalment a row: an authored date and amount, its own
 * AmountPaid / Balance rollup, a lifecycle (editable while Scheduled, frozen once Invoiced) and,
 * once invoiced, a frozen document number the customer's AP department can match on.
 *
 * THE CHECKS THAT EARN THEIR KEEP
 *   · PS2 — an order with NO schedule books exactly what it booked before, ages on its header
 *     date and prints the plain order number. Every existing order lives behind this one.
 *   · PS1 — a schedule that does not tie refuses the CONFIRM and says by how much. Leniency here
 *     silently under-bills, which is the failure the invoice module already names.
 *   · PS7 — a payment aimed at instalment 2 leaves instalment 1 unpaid while the header still
 *     rolls up correctly. Two rollups, one truth.
 *
 * WHAT IT PROVES
 *   PS1   a schedule that does not tie refuses the confirm, naming the shortfall
 *   PS2   an order with no schedule books today's entry, ages on its header date, numbers as the order
 *   PS3   CompanyID is stamped from the lines, whatever the caller passed
 *   PS4   issuing freezes the number and stamps InvoicedAt; issuing again changes nothing
 *   PS5   a frozen DocumentNumber survives an edit to a sibling Scheduled row
 *   PS6   an Invoiced row refuses an amount or date change; a Scheduled row accepts one
 *   PS7   a payment aimed at instalment 2 leaves instalment 1 unpaid; header rollups correct
 *   PS8   an unnamed payment cascades oldest-due-first across the instalments
 *   PS9   overdue when ANY unpaid instalment is past due; not overdue when none is
 *   PS10  the billing worklist lists a Scheduled instalment in its window and drops it once issued
 *   PS11  issuing refuses when the schedule no longer ties, and when the order is still a Draft
 *   PS12  a payment aimed at another order's instalment is refused
 *   PS13  the per-instalment document demands the instalment against the full order value
 *   PS-A  confirm ISSUES the instalment already due, books Dr AR / Cr Deferred for its share only
 *   PS-B  a schedule due entirely later books no receivable at confirm
 *   PS-C  invoicing a later instalment posts rule 1 and advances BilledToDate
 *   PS-D  every instalment issued sums, per account, to what a non-scheduled order books
 *   PS-E  invoicing twice does not post twice
 *   PS-F  a prepaid instalment on a line with an Unbilled balance posts Dr Customer Deposits / Cr Unbilled
 *   PS-G  Scenario 3: an UpFront line earns in full at confirm, the unbilled part to the contract asset
 *   PS-H  a line carrying an Unbilled balance is invoiced against Unbilled FIRST, then Deferred
 *   PS-I  a discount spanning a due AND a future instalment is booked ONCE, at recognition
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: OrderEntityServer.verifyScheduleTies · OrderHeaderPaymentScheduleEntityServer
 *         OrderJournalEntryFactory.BuildValueEntryLines · ScheduledCompanyIDs · EmitInstalmentInvoiceEntry
 *         IssueInstalmentInvoiceOperation · GetBillingWorklistOperation · PaymentLineEntityServer
 *         InvoiceBuilder (PaymentScheduleID) · overdue.ts (NextDueDate)
 *   DB:   V202609211200__v5.13.0__OrderHeaderPaymentSchedule.sql
 */
import { BaseRemotableOperation, Metadata } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import { OrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import { BuildInvoiceDocuments, type OrderHeaderPaymentScheduleEntityServer } from '@mj-biz-apps/orders-core-entities-server';
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
import type { RequestedCharge } from '@mj-biz-apps/orders-core-entities-server';
import { CreatePayment } from '../payment-builder.js';

/** One instalment as a check authors it. */
export interface Instalment {
    InstallmentNumber: number;
    DueDate: string;
    Amount: number;
    /** Deliberately wrong on purpose in PS3. Omitted otherwise — the server stamps it. */
    CompanyID?: string;
}

interface ScheduleRow {
    ID: string;
    InstallmentNumber: number;
    CompanyID: string;
    DueDate: string;
    Amount: number;
    AmountPaid: number;
    Balance: number;
    Status: string;
    DocumentNumber: string | null;
    InvoicedAt: string | null;
}

/** The schedule as stored, oldest first. Dates come back `YYYY-MM-DD` so a check compares days. */
export const schedule = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<ScheduleRow>(
        ctx,
        `SELECT ID, InstallmentNumber, CompanyID, CONVERT(varchar(10), DueDate, 23) AS DueDate, Amount, AmountPaid, Balance, Status,
                DocumentNumber, CONVERT(varchar(30), InvoicedAt, 127) AS InvoicedAt
           FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID='${orderID}' ORDER BY InstallmentNumber`,
    );

const header = (ctx: IntegrationCheckContext, orderID: string) =>
    TxOne<{ TotalGross: number; AmountPaid: number; Balance: number; Status: string; DueDate: string | null; NextDueDate: string | null; IsOverdue: number }>(
        ctx,
        `SELECT TotalGross, AmountPaid, Balance, Status, CONVERT(varchar(10), DueDate, 23) AS DueDate,
                CONVERT(varchar(10), NextDueDate, 23) AS NextDueDate, IsOverdue
           FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID='${orderID}'`,
    );

/** Add instalments to an order through the entity, the way a form or the importer would. */
async function addInstalments(ctx: IntegrationCheckContext, orderID: string, rows: Instalment[]): Promise<string[]> {
    const ids: string[] = [];
    for (const row of rows) {
        ids.push(
            await createViaEntity(ctx, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, {
                OrderHeaderID: orderID,
                // The server subclass stamps the company; a check that passes one is proving it is overwritten.
                CompanyID: row.CompanyID ?? Fx().CoA.ID,
                InstallmentNumber: row.InstallmentNumber,
                DueDate: new Date(`${row.DueDate}T00:00:00Z`),
                Amount: row.Amount,
            }),
        );
    }
    return ids;
}

/** A $300 draft order with a schedule, then confirmed. Returns the order and its rows. */
/**
 * A confirmed order with a payment schedule, for any check that needs one.
 *
 * EXPORTED so #227's Scenario 4 check builds its project from the same fixture rather than a
 * lookalike: two fixtures that drift are two different claims about what a scheduled order is.
 */
export async function scheduledOrder(
    ctx: IntegrationCheckContext,
    rows: Instalment[],
    over: {
        gross?: number;
        productID?: string;
        /**
         * Charges to put on the order before confirm, in `confirmWithCharges`' shape — e.g.
         * `[{ Code: 'SalesTax', Rate: 0.1 }]`.
         *
         * WITHOUT ONE, NET AND THE AR DEBIT ARE THE SAME NUMBER, and no check can tell which basis
         * `BilledToDate` is measured on. With a charge they separate: AR moves by net + charges,
         * the charge account moves by the charge, and both running totals move by net alone. Any
         * check about the totals' basis needs this; the schedule must then tie to the CHARGED gross.
         */
        charges?: RequestedCharge[];
        /**
         * A line-level discount, as a fraction. `gross` is then the LIST price and the line's net —
         * what the schedule must tie to — is `gross × (1 − discountPct)`.
         */
        discountPct?: number;
        /** `YYYY-MM-DD` coverage window, for a product whose recognition needs one (EvenOverTime). */
        servicePeriod?: { Start: string; End: string };
    } = {},
) {
    const f = Fx();
    const gross = over.gross ?? 300;
    const draft = await BuildOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        BillToOrganizationID: f.Customers.OrganizationID,
        OrderDate: new Date('2026-07-01T00:00:00Z'),
        // The LINE's product decides the company the schedule and the ledger book against, whatever
        // the header says — which is how a check reaches a second company's ledger.
        Lines: [
            {
                ProductID: over.productID ?? f.Products.WidgetA,
                Quantity: 1,
                UnitPrice: gross,
                ...(over.discountPct ? { DiscountPct: over.discountPct } : {}),
                ...(over.servicePeriod ? { ServicePeriodStart: over.servicePeriod.Start, ServicePeriodEnd: over.servicePeriod.End } : {}),
            },
        ],
        ...(over.charges ? { Charges: over.charges } : {}),
    });
    Assert(await draft.Order.Save(), `draft must save: ${draft.Order.LatestResult?.CompleteMessage ?? ''}`);
    const orderID = draft.Order.ID as string;
    const ids = await addInstalments(ctx, orderID, rows);
    const confirmed = await confirm(ctx, orderID);
    return { orderID, ids, order: confirmed.order, saved: confirmed.saved, message: confirmed.message };
}

/** Confirm a saved draft the way the form does: reload the header, flip Status, save. */
async function confirm(ctx: IntegrationCheckContext, orderID: string) {
    const md = new Metadata();
    const order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, ctx.User);
    Assert(await order.Load(orderID), 'header reload must succeed');
    order.Status = 'Confirmed';
    const saved = await order.Save();
    return { order, saved, message: order.LatestResult?.CompleteMessage ?? '' };
}

/** Pay `amount` against an order, optionally aimed at one instalment. */
/** Pay against an order, optionally naming one instalment. Exported for the same reason. */
export async function pay(ctx: IntegrationCheckContext, orderID: string, amount: number, scheduleID?: string) {
    const f = Fx();
    const cash = f.PaymentTypeIDs.get('Cash');
    Assert(cash != null, "PaymentType 'Cash' missing — push the orders app metadata");
    const result = await CreatePayment(ctx.User, {
        PaymentNumber: `PS-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        ReceivingCompanyID: f.CoA.ID,
        PaymentTypeID: cash!,
        Amount: amount,
        Allocations: [{ OrderHeaderID: orderID, Amount: amount, OrderHeaderPaymentScheduleID: scheduleID ?? null }],
    });
    return result;
}

type IssueOutput = { Success: boolean; Message?: string; DocumentNumber?: string | null; InvoicedAt?: string | null; AlreadyInvoiced: boolean; JournalEntryID?: string | null };
type WorklistOutput = { Success: boolean; Message?: string; Rows: Array<{ OrderHeaderPaymentScheduleID: string; OrderNumber: string; InstallmentNumber: number; InstallmentCount: number; DaysUntilDue: number }> };
type OverdueOutput = { Rows: Array<{ OrderHeaderID: string; DaysOverdue: number }> };

function operation<I, O>(key: string) {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation<I, O>>(BaseRemotableOperation, key);
    Assert(op != null, `'${key}' is not registered`);
    return op!;
}

/** Issue one instalment through the real operation. Exported for the same reason. */
export async function issue(ctx: IntegrationCheckContext, scheduleID: string) {
    const result = await operation<{ OrderHeaderPaymentScheduleID: string }, IssueOutput>('Orders.IssueInstalmentInvoice').Execute(
        { OrderHeaderPaymentScheduleID: scheduleID },
        { provider: ctx.Provider, user: ctx.User },
    );
    Assert(result.Success, `IssueInstalmentInvoice did not execute: ${result.ErrorMessage ?? 'unknown'}`);
    return result.Output!;
}

async function billingWorklist(ctx: IntegrationCheckContext, asOf: string, windowDays: number) {
    const result = await operation<{ AsOfDate: string; WindowDays: number }, WorklistOutput>('Orders.GetBillingWorklist').Execute(
        { AsOfDate: asOf, WindowDays: windowDays },
        { provider: ctx.Provider, user: ctx.User },
    );
    Assert(result.Success && result.Output?.Success, `GetBillingWorklist failed: ${result.ErrorMessage ?? result.Output?.Message ?? 'unknown'}`);
    return result.Output!.Rows;
}

async function overdueAsOf(ctx: IntegrationCheckContext, asOf: string) {
    const result = await operation<{ AsOfDate: string }, OverdueOutput>('Orders.GetOverdueWorklist').Execute(
        { AsOfDate: asOf },
        { provider: ctx.Provider, user: ctx.User },
    );
    Assert(result.Success, `GetOverdueWorklist failed: ${result.ErrorMessage ?? 'unknown'}`);
    return result.Output!.Rows;
}

const has = (rows: Array<{ OrderHeaderID: string }>, orderID: string) =>
    rows.some((r) => String(r.OrderHeaderID).toLowerCase() === orderID.toLowerCase());

const AR_CODE = '11201';
const DEFERRED_CODE = '21301';
const SALES_CODE = '40100';
const UNBILLED_CODE = '11300';
/** Blue Cypress Press's company-level Customer Deposits account (world/data/gl-accounts.csv). */
const DEPOSITS_CODE = '21400';
/** Linked on ONE product (WORKSHOP → `Products.DiscountedA`), so only PS-I books a discount contra. */
const DISCOUNT_CODE = '41000';

interface LedgerLine {
    Code: string;
    DebitAmount: number;
    CreditAmount: number;
}

/** Every ledger line the order's BOOKING entries carry — the per-line entries confirm produced. */
const bookingLedger = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<LedgerLine>(
        ctx,
        `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
           FROM ${ORDERS_SCHEMA}.OrderLine ol
           JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = ol.JournalEntryID
           JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
          WHERE ol.OrderHeaderID = '${orderID}'`,
    );

/** The lines of ONE instalment's billing entry. */
const instalmentEntryLines = (ctx: IntegrationCheckContext, scheduleID: string) =>
    TxQuery<LedgerLine>(
        ctx,
        `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
           FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule ps
           JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = ps.JournalEntryID
           JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
          WHERE ps.ID = '${scheduleID}'`,
    );

/** Every ledger line the order's INSTALMENT BILLING entries carry, across all its schedule rows. */
const instalmentLedger = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<LedgerLine>(
        ctx,
        `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
           FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule ps
           JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = ps.JournalEntryID
           JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
          WHERE ps.OrderHeaderID = '${orderID}'`,
    );

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Net movement on one account across a set of lines: debits less credits. */
const netOn = (lines: LedgerLine[], code: string): number =>
    round2(
        lines
            .filter((l) => l.Code === code)
            .reduce((sum, l) => sum + Number(l.DebitAmount ?? 0) - Number(l.CreditAmount ?? 0), 0),
    );

/** What every journal entry must do, whatever else this ticket changed. */
function assertBalanced(lines: LedgerLine[], what: string): void {
    const debits = round2(lines.reduce((s, l) => s + Number(l.DebitAmount ?? 0), 0));
    const credits = round2(lines.reduce((s, l) => s + Number(l.CreditAmount ?? 0), 0));
    AssertEqual(debits, credits, `${what} must balance: ${JSON.stringify(lines)}`);
}

/** The two running totals per line, which are the whole of D92's balance-sheet position. */
const lineTotals = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<{ ID: string; LineNumber: number; BilledToDate: number; RecognizedToDate: number }>(
        ctx,
        `SELECT ID, LineNumber, BilledToDate, RecognizedToDate
           FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}' ORDER BY LineNumber`,
    );

/** Every ledger line the order touched, confirm and instalments together. */
const allLedger = async (ctx: IntegrationCheckContext, orderID: string): Promise<LedgerLine[]> => [
    ...(await bookingLedger(ctx, orderID)),
    ...(await instalmentLedger(ctx, orderID)),
];

/**
 * Three instalments, the first of which falls ON the order date.
 *
 * Under D92 confirm ISSUES that first row, so an order built from this lands with instalment 1
 * already `Invoiced`. Checks that need a row still `Scheduled` use {@link FUTURE} instead.
 */
const THREE = [
    { InstallmentNumber: 1, DueDate: '2026-07-01', Amount: 100 },
    { InstallmentNumber: 2, DueDate: '2027-07-01', Amount: 100 },
    { InstallmentNumber: 3, DueDate: '2028-07-01', Amount: 100 },
];

/**
 * Three instalments, none of them due at confirm — so confirm issues nothing and every row is
 * still `Scheduled` when the check starts.
 *
 * This is what every check about the instalment LIFECYCLE wants: freezing a number, re-amending a
 * row, aiming a payment, working the billing list. Before D92 `THREE` served that purpose because
 * confirm never issued anything; now it does, so the two fixtures say different things and the
 * choice between them is the check's own statement about when it wants billing to have happened.
 */
const FUTURE = [
    { InstallmentNumber: 1, DueDate: '2027-07-01', Amount: 100 },
    { InstallmentNumber: 2, DueDate: '2027-10-01', Amount: 100 },
    { InstallmentNumber: 3, DueDate: '2028-07-01', Amount: 100 },
];

export const PaymentScheduleChecks: NamedCheck[] = [
    {
        Id: 'payment-schedule.PS1',
        Name: 'PS1: a schedule that does not tie REFUSES the confirm, and names the shortfall',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { saved, message, orderID } = await scheduledOrder(ctx, [
                    { InstallmentNumber: 1, DueDate: '2026-07-01', Amount: 100 },
                    { InstallmentNumber: 2, DueDate: '2027-07-01', Amount: 150 },
                ]);
                Assert(!saved, 'a schedule 50.00 short must not confirm');
                Assert(message.includes('does not tie'), `the refusal explains itself: ${message}`);
                Assert(message.includes('50.00 unscheduled'), `the refusal names the shortfall: ${message}`);
                const row = await header(ctx, orderID);
                AssertEqual(row.Status, 'Draft', 'the confirm rolled back — nothing was booked');
            }),
    },
    {
        Id: 'payment-schedule.PS2',
        Name: 'PS2: an order with NO schedule books today\'s entry, ages on its header date, numbers as the order',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // THE REGRESSION FENCE. Nothing here may move for an order without a schedule.
                const f = Fx();
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    BillToOrganizationID: f.Customers.OrganizationID,
                    OrderDate: new Date('2026-07-01T00:00:00Z'),
                    DueDate: '2026-07-31',
                    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 300 }],
                } as Parameters<typeof ConfirmOrder>[1]);
                Assert(result.Saved, `confirm failed: ${result.Message}`);
                const orderID = result.Order.ID as string;

                const lines = await TxQuery<{ Code: string; DebitAmount: number; CreditAmount: number }>(
                    ctx,
                    `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
                       FROM ${ORDERS_SCHEMA}.OrderLine ol
                       JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = ol.JournalEntryID
                       JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                      WHERE ol.OrderHeaderID = '${orderID}'`,
                );
                const ar = lines.find((l) => l.Code === '11201');
                Assert(ar != null, `AR is debited at confirm, exactly as before: ${JSON.stringify(lines)}`);
                AssertEqual(Number(ar!.DebitAmount), 300, 'for the whole order value');

                const row = await header(ctx, orderID);
                AssertEqual(row.NextDueDate, '2026-07-31', 'NextDueDate IS the header DueDate when there is no schedule');
                AssertEqual(has(await overdueAsOf(ctx, '2026-09-01'), orderID), true, 'overdue after the header date');
                AssertEqual(has(await overdueAsOf(ctx, '2026-07-15'), orderID), false, 'not before it');

                const docs = await BuildInvoiceDocuments(orderID, ctx.Provider, ctx.User, { AsOf: '2026-07-01' });
                Assert(docs.Success, `document: ${docs.Message}`);
                AssertEqual(docs.Documents[0].DocumentNumber, result.Order.OrderNumber, 'the document is numbered as the order');
                AssertEqual(docs.Documents[0].AmountDue, 300, 'and demands the whole order');
                AssertEqual(docs.Documents[0].DueDate, '2026-07-31', 'on the header date');
            }),
    },
    {
        Id: 'payment-schedule.PS3',
        Name: 'PS3: CompanyID is stamped from the lines, whatever the caller passed',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { orderID, saved, message } = await scheduledOrder(ctx, [
                    { InstallmentNumber: 1, DueDate: '2026-07-01', Amount: 300, CompanyID: f.CoB.ID },
                ]);
                Assert(saved, `confirm: ${message}`);
                const [row] = await schedule(ctx, orderID);
                AssertEqual(String(row.CompanyID).toLowerCase(), f.CoA.ID.toLowerCase(), 'the line company, not the one the caller sent');
            }),
    },
    {
        Id: 'payment-schedule.PS4',
        Name: 'PS4: issuing freezes the number and stamps InvoicedAt; issuing AGAIN changes nothing',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { orderID, ids, order, saved, message } = await scheduledOrder(ctx, FUTURE);
                Assert(saved, `confirm: ${message}`);

                const first = await issue(ctx, ids[1]);
                Assert(first.Success, `issue: ${first.Message}`);
                AssertEqual(first.AlreadyInvoiced, false, 'first issue is the real one');
                AssertEqual(first.DocumentNumber, `${order.OrderNumber}-2`, 'ORD-x-2 for the second of three');

                const rows = await schedule(ctx, orderID);
                AssertEqual(rows[1].Status, 'Invoiced', 'the row advanced');
                AssertEqual(rows[1].DocumentNumber, `${order.OrderNumber}-2`, 'and carries the frozen number');
                Assert(rows[1].InvoicedAt != null, 'and when');
                AssertEqual(rows[0].Status, 'Scheduled', 'its siblings did not move');

                const again = await issue(ctx, ids[1]);
                Assert(again.Success, `second issue: ${again.Message}`);
                AssertEqual(again.AlreadyInvoiced, true, 'the second call reports what already happened');
                AssertEqual(again.DocumentNumber, first.DocumentNumber, 'with the same number');
                const after = await schedule(ctx, orderID);
                AssertEqual(after[1].InvoicedAt, rows[1].InvoicedAt, 'and did not re-stamp');
            }),
    },
    {
        Id: 'payment-schedule.PS5',
        Name: 'PS5: a frozen DocumentNumber survives a later edit to a sibling Scheduled row',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { orderID, ids, order, saved, message } = await scheduledOrder(ctx, THREE);
                Assert(saved, `confirm: ${message}`);
                const issued = await issue(ctx, ids[0]);
                Assert(issued.Success, issued.Message ?? '');

                // Re-date instalment 3, and move money between 2 and 3 — all still tying to 300.
                const md = new Metadata();
                const three = await md.GetEntityObject<OrderHeaderPaymentScheduleEntityServer>(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ctx.User);
                Assert(await three.Load(ids[2]), 'load row 3');
                three.DueDate = new Date('2028-12-31T00:00:00Z');
                three.Amount = 150;
                Assert(await three.Save(), `re-shape row 3: ${three.LatestResult?.CompleteMessage}`);
                const two = await md.GetEntityObject<OrderHeaderPaymentScheduleEntityServer>(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ctx.User);
                Assert(await two.Load(ids[1]), 'load row 2');
                two.Amount = 50;
                Assert(await two.Save(), `re-shape row 2: ${two.LatestResult?.CompleteMessage}`);

                const rows = await schedule(ctx, orderID);
                AssertEqual(rows[0].DocumentNumber, `${order.OrderNumber}-1`, 'the issued number did not move');
                AssertEqual(rows[2].DueDate, '2028-12-31', 'the sibling was re-dated');
                AssertEqual(Number(rows[1].Amount) + Number(rows[2].Amount), 200, 'and re-amounted');
                // And the next instalment still issues under its own position.
                const next = await issue(ctx, ids[1]);
                AssertEqual(next.DocumentNumber, `${order.OrderNumber}-2`, 'position, not order of issue');
            }),
    },
    {
        Id: 'payment-schedule.PS6',
        Name: 'PS6: an Invoiced row refuses an amount or date change; a Scheduled row accepts one',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { ids, saved, message } = await scheduledOrder(ctx, THREE);
                Assert(saved, `confirm: ${message}`);
                Assert((await issue(ctx, ids[0])).Success, 'issue row 1');

                // Raw SQL on purpose: the trigger is the floor that holds even when the entity layer is
                // bypassed. ONE attempt per check — the trigger enforces itself with ROLLBACK TRANSACTION,
                // which aborts the check's ambient transaction along with it (see account-credit AC9).
                // The Scheduled-row acceptance is PS5, which re-shapes siblings and reads them back.
                let refused = false;
                try {
                    await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule SET Amount = 101, DueDate = '2030-01-01' WHERE ID='${ids[0]}'`);
                } catch (e) {
                    refused = /frozen/i.test(String(e));
                }
                Assert(refused, "editing an Invoiced instalment's amount or date must be refused by the DB");
            }),
    },
    {
        Id: 'payment-schedule.PS7',
        Name: 'PS7: a payment aimed at instalment 2 leaves instalment 1 unpaid; the header rolls up correctly',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { orderID, ids, saved, message } = await scheduledOrder(ctx, FUTURE);
                Assert(saved, `confirm: ${message}`);
                Assert((await issue(ctx, ids[1])).Success, 'issue row 2');

                const paid = await pay(ctx, orderID, 100, ids[1]);
                Assert(paid.Saved, `payment: ${paid.Message}`);

                const rows = await schedule(ctx, orderID);
                AssertEqual(Number(rows[0].AmountPaid), 0, 'instalment 1 is untouched');
                AssertEqual(Number(rows[0].Balance), 100, 'and still owed');
                AssertEqual(Number(rows[1].AmountPaid), 100, 'instalment 2 took the money');
                AssertEqual(Number(rows[1].Balance), 0, 'and is settled');
                AssertEqual(rows[1].Status, 'Paid', 'so it reads Paid');
                AssertEqual(rows[0].Status, 'Scheduled', 'while 1 is still Scheduled');

                const h = await header(ctx, orderID);
                AssertEqual(Number(h.AmountPaid), 100, 'the header saw the same 100');
                AssertEqual(Number(h.Balance), 200, 'and still carries the rest');
            }),
    },
    {
        Id: 'payment-schedule.PS8',
        Name: 'PS8: an UNNAMED payment cascades oldest-due-first across the instalments',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { orderID, saved, message } = await scheduledOrder(ctx, THREE);
                Assert(saved, `confirm: ${message}`);
                const paid = await pay(ctx, orderID, 150);
                Assert(paid.Saved, `payment: ${paid.Message}`);

                const rows = await schedule(ctx, orderID);
                AssertEqual(rows.map((r) => Number(r.AmountPaid)).join(','), '100,50,0', 'oldest first, then the remainder');
                AssertEqual(rows.map((r) => Number(r.Balance)).join(','), '0,50,100', 'balances follow');
                const h = await header(ctx, orderID);
                AssertEqual(Number(h.Balance), 150, 'header balance agrees');
            }),
    },
    {
        Id: 'payment-schedule.PS9',
        Name: 'PS9: overdue when ANY unpaid instalment is past due, not overdue when none is',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Header terms say due on receipt (2026-07-01); the schedule says the first money is due
                // in 2027. The order must NOT age on the header date.
                const { orderID, saved, message } = await scheduledOrder(ctx, [
                    { InstallmentNumber: 1, DueDate: '2027-01-15', Amount: 100 },
                    { InstallmentNumber: 2, DueDate: '2028-01-15', Amount: 200 },
                ]);
                Assert(saved, `confirm: ${message}`);

                let h = await header(ctx, orderID);
                AssertEqual(h.NextDueDate, '2027-01-15', 'the next unpaid instalment is the due day');
                AssertEqual(has(await overdueAsOf(ctx, '2026-12-01'), orderID), false, 'not overdue while nothing is past due');
                AssertEqual(has(await overdueAsOf(ctx, '2027-02-01'), orderID), true, 'overdue once instalment 1 is');
                const [mine] = (await overdueAsOf(ctx, '2027-02-01')).filter((r) => String(r.OrderHeaderID).toLowerCase() === orderID.toLowerCase());
                AssertEqual(mine.DaysOverdue, 17, 'aged from the instalment date, not the header date');

                // Pay instalment 1 in full: the next unpaid one is now 2028, and the order is current again.
                const paid = await pay(ctx, orderID, 100);
                Assert(paid.Saved, `payment: ${paid.Message}`);
                h = await header(ctx, orderID);
                AssertEqual(h.NextDueDate, '2028-01-15', 'NextDueDate moved to the next unpaid instalment');
                AssertEqual(has(await overdueAsOf(ctx, '2027-02-01'), orderID), false, 'no longer overdue on that day');
            }),
    },
    {
        Id: 'payment-schedule.PS10',
        Name: 'PS10: the billing worklist lists a Scheduled instalment in its window, and drops it once issued',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { orderID, ids, order, saved, message } = await scheduledOrder(ctx, THREE);
                Assert(saved, `confirm: ${message}`);

                // D92 CHANGED WHAT THIS LIST CAN EVER CONTAIN, and that is the point of the check
                // now. Instalment 1 falls on the order date, so confirm issued it — a past-due row
                // with no invoice behind it is no longer reachable on a confirmed order, which is
                // precisely the gap this worklist existed to catch. What remains is the forward
                // window: row 2, sixteen days out. Before D92 this asserted '1,2'.
                const inWindow = await billingWorklist(ctx, '2027-06-15', 30);
                const mine = inWindow.filter((r) => r.OrderNumber === order.OrderNumber);
                AssertEqual(mine.map((r) => r.InstallmentNumber).join(','), '2', 'row 2 is 16 days out; 1 was issued at confirm and 3 is far off');
                AssertEqual(mine[0].InstallmentCount, 3, 'and it knows the row is 2 of 3');
                AssertEqual(mine[0].DaysUntilDue, 16, 'days until due, as a number');

                Assert((await issue(ctx, ids[1])).Success, 'issue row 2');
                const after = (await billingWorklist(ctx, '2027-06-15', 30)).filter((r) => r.OrderNumber === order.OrderNumber);
                AssertEqual(after.length, 0, 'an issued instalment has an invoice behind it and leaves the list');
                void orderID;
            }),
    },
    {
        Id: 'payment-schedule.PS11',
        Name: 'PS11: issuing refuses a schedule that no longer ties, and an order that is still a Draft',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const draft = await BuildOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 300 }],
                });
                Assert(await draft.Order.Save(), 'draft saves');
                const [id] = await addInstalments(ctx, draft.Order.ID as string, [{ InstallmentNumber: 1, DueDate: '2027-07-01', Amount: 300 }]);

                const onDraft = await issue(ctx, id);
                Assert(!onDraft.Success, 'a Draft order has no receivable to invoice');
                Assert(/Draft/.test(onDraft.Message ?? ''), `says why: ${onDraft.Message}`);

                Assert((await confirm(ctx, draft.Order.ID as string)).saved, 'now confirm it');
                // Knock the schedule out of tie by editing the (still Scheduled) row.
                const md = new Metadata();
                const row = await md.GetEntityObject<OrderHeaderPaymentScheduleEntityServer>(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ctx.User);
                Assert(await row.Load(id), 'load');
                row.Amount = 250;
                Assert(await row.Save(), `a Scheduled row may be re-amounted: ${row.LatestResult?.CompleteMessage}`);

                const short = await issue(ctx, id);
                Assert(!short.Success, 'a schedule 50.00 short must not issue');
                Assert((short.Message ?? '').includes('50.00 unscheduled'), `names the shortfall: ${short.Message}`);
            }),
    },
    {
        Id: 'payment-schedule.PS12',
        Name: "PS12: a payment aimed at ANOTHER order's instalment is refused",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const a = await scheduledOrder(ctx, THREE);
                Assert(a.saved, `confirm A: ${a.message}`);
                const b = await scheduledOrder(ctx, THREE);
                Assert(b.saved, `confirm B: ${b.message}`);

                const crossed = await pay(ctx, b.orderID, 100, a.ids[0]);
                Assert(!crossed.Saved, 'order B cannot settle an instalment of order A');
                Assert(/different order/.test(crossed.Message), `says why: ${crossed.Message}`);
            }),
    },
    {
        Id: 'payment-schedule.PS13',
        Name: 'PS13: the per-instalment document demands the instalment against the full order value',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { orderID, ids, order, saved, message } = await scheduledOrder(ctx, THREE);
                Assert(saved, `confirm: ${message}`);
                Assert((await issue(ctx, ids[1])).Success, 'issue row 2');
                Assert((await pay(ctx, orderID, 40, ids[1])).Saved, 'part-pay row 2');

                const built = await BuildInvoiceDocuments(orderID, ctx.Provider, ctx.User, { AsOf: '2027-06-15', PaymentScheduleID: ids[1] });
                Assert(built.Success, `document: ${built.Message}`);
                AssertEqual(built.Documents.length, 1, 'one document, for the row\'s company');
                const doc = built.Documents[0];
                AssertEqual(doc.DocumentNumber, `${order.OrderNumber}-2`, 'the frozen number');
                AssertEqual(doc.Gross, 300, 'the full order value');
                AssertEqual(doc.AmountPaid, 40, 'what was paid on THIS instalment');
                AssertEqual(doc.AmountDue, 60, 'the instalment less its payments');
                AssertEqual(doc.DueDate, '2027-07-01', "the instalment's due date, not the header's");
                AssertEqual(doc.Ladder.some((r) => r.Kind === 'Instalment' && r.Label === 'Instalment 2 of 3'), true, 'the ladder names the instalment');
            }),
    },
    {
        Id: 'payment-schedule.PS-A',
        Name: 'PS-A: confirm ISSUES the instalment already due and books only its share',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // D92's central claim. THREE's first instalment falls on the order date, so confirm
                // bills it — through the same act a person triggers later — and books nothing for
                // the two that are not due yet.
                const { orderID, saved, message } = await scheduledOrder(ctx, THREE);
                Assert(saved, `confirm: ${message}`);

                const rows = await schedule(ctx, orderID);
                AssertEqual(rows[0].Status, 'Invoiced', 'the instalment due today was issued by the confirm');
                Assert(rows[0].DocumentNumber != null, 'and took its document number');
                AssertEqual(rows[1].Status, 'Scheduled', 'the one due next year was not');
                AssertEqual(rows[2].Status, 'Scheduled', 'nor the one after');

                const all = await allLedger(ctx, orderID);
                assertBalanced(all, 'everything confirm booked');
                AssertEqual(netOn(all, AR_CODE), 100, 'only the due instalment is a receivable');

                const totals = await lineTotals(ctx, orderID);
                AssertEqual(Number(totals[0].BilledToDate), 100, "BilledToDate is the line's share of what was billed");
            }),
    },
    {
        Id: 'payment-schedule.PS-B',
        Name: 'PS-B: a schedule due entirely in the future books no receivable at confirm',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { orderID, saved, message } = await scheduledOrder(ctx, [
                    { InstallmentNumber: 1, DueDate: '2027-01-01', Amount: 150 },
                    { InstallmentNumber: 2, DueDate: '2027-07-01', Amount: 150 },
                ]);
                Assert(saved, `confirm: ${message}`);

                const rows = await schedule(ctx, orderID);
                AssertEqual(rows.every((r) => r.Status === 'Scheduled'), true, 'nothing was issued');
                const all = await allLedger(ctx, orderID);
                AssertEqual(netOn(all, AR_CODE), 0, 'and no receivable exists — nobody has been billed');
                AssertEqual(Number((await lineTotals(ctx, orderID))[0].BilledToDate), 0, 'BilledToDate stays zero');
            }),
    },
    {
        Id: 'payment-schedule.PS-C',
        Name: 'PS-C: invoicing a later instalment posts rule 1 and advances BilledToDate',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { orderID, ids, saved, message } = await scheduledOrder(ctx, THREE);
                Assert(saved, `confirm: ${message}`);
                const before = Number((await lineTotals(ctx, orderID))[0].BilledToDate);

                const issued = await issue(ctx, ids[1]);
                Assert(issued.Success, `issue row 2: ${issued.Message}`);
                Assert(issued.JournalEntryID != null, 'the billing entry is recorded on the row');

                const after = Number((await lineTotals(ctx, orderID))[0].BilledToDate);
                AssertEqual(after - before, 100, 'BilledToDate advanced by exactly this instalment');

                const all = await allLedger(ctx, orderID);
                assertBalanced(all, 'confirm plus the second instalment');
                AssertEqual(netOn(all, AR_CODE), 200, 'two instalments billed, two in AR');
            }),
    },
    {
        Id: 'payment-schedule.PS-D',
        Name: 'PS-D: every instalment issued sums, per account, to what a non-scheduled order books',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // THE EQUIVALENCE THAT MAKES D92 SAFE. Billing is spread over time, but once every
                // instalment is issued the ledger must hold exactly what an unscheduled order of the
                // same value holds, to the penny. This is what breaks if a slice rounds independently.
                const { orderID, ids, saved, message } = await scheduledOrder(ctx, THREE);
                Assert(saved, `confirm: ${message}`);
                for (const id of ids.slice(1)) Assert((await issue(ctx, id)).Success, `issue ${id}`);

                const all = await allLedger(ctx, orderID);
                assertBalanced(all, 'confirm plus every instalment');
                AssertEqual(netOn(all, AR_CODE), 300, 'the whole order value is a receivable once fully billed');
                AssertEqual(netOn(all, SALES_CODE), -300, 'and earned exactly once');
                AssertEqual(netOn(all, DEFERRED_CODE), 0, 'Deferred nets to zero');
                AssertEqual(netOn(all, UNBILLED_CODE), 0, 'and so does the contract asset');

                const totals = await lineTotals(ctx, orderID);
                AssertEqual(Number(totals[0].BilledToDate), 300, 'BilledToDate closes at the line value');
                AssertEqual(Number(totals[0].RecognizedToDate), 300, 'and so does RecognizedToDate');
            }),
    },
    {
        Id: 'payment-schedule.PS-E',
        Name: 'PS-E: invoicing twice does not post twice',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { orderID, ids, saved, message } = await scheduledOrder(ctx, THREE);
                Assert(saved, `confirm: ${message}`);
                const first = await issue(ctx, ids[1]);
                Assert(first.Success, `issue: ${first.Message}`);
                const billedOnce = Number((await lineTotals(ctx, orderID))[0].BilledToDate);

                const again = await issue(ctx, ids[1]);
                Assert(again.Success && again.AlreadyInvoiced, `issuing again is not an error: ${again.Message}`);
                AssertEqual(again.JournalEntryID, first.JournalEntryID, 'and returns the SAME entry');
                AssertEqual(
                    Number((await lineTotals(ctx, orderID))[0].BilledToDate),
                    billedOnce,
                    'BilledToDate did not advance a second time',
                );
            }),
    },
    {
        Id: 'payment-schedule.PS-F',
        Name: 'PS-F: a prepaid instalment on a line with an Unbilled balance posts Dr Customer Deposits / Cr Unbilled',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Carried over from #225's review. WidgetA is UpFront, so confirm earns all 300 and
                // bills 100: the line carries 200 of Unbilled. Instalment 2 is then prepaid. Issuing
                // it used to net the prepayment off the bill and post nothing, while BilledToDate
                // still moved — the Unbilled balance was never relieved. Now the bill posts at full
                // value (Dr AR / Cr Unbilled, rule 1) and the deposit clears against it (Dr Customer
                // Deposits / Cr AR), so the entry's net effect is Dr Customer Deposits / Cr Unbilled.
                // Andrew wrote it as Dr Deferred because deposits sat there before this PR; with the
                // role linked to Deferred Revenue the two read the same.
                const { orderID, ids, saved, message } = await scheduledOrder(ctx, THREE);
                Assert(saved, `confirm: ${message}`);
                Assert((await pay(ctx, orderID, 100, ids[1])).Saved, 'prepay instalment 2 before issuing it');

                const arBefore = netOn(await allLedger(ctx, orderID), AR_CODE);
                const billedBefore = Number((await lineTotals(ctx, orderID))[0].BilledToDate);
                const issued = await issue(ctx, ids[1]);
                Assert(issued.Success, `issue the prepaid row: ${issued.Message}`);
                Assert(issued.DocumentNumber != null, 'it takes a document number');
                Assert(issued.JournalEntryID != null, 'and now posts its billing entry');

                const bill = await instalmentEntryLines(ctx, ids[1]);
                assertBalanced(bill, 'the prepaid billing entry');
                AssertEqual(netOn(bill, UNBILLED_CODE), -100, 'Cr Unbilled 100: the contract asset is relieved');
                AssertEqual(netOn(bill, DEPOSITS_CODE), 100, 'Dr Customer Deposits 100: the prepayment is applied');
                AssertEqual(netOn(bill, AR_CODE), 0, 'the receivable it raises is settled in the same entry');
                AssertEqual(netOn(bill, DEFERRED_CODE), 0, 'and nothing is deferred');
                AssertEqual(netOn(await allLedger(ctx, orderID), AR_CODE), arBefore, 'so AR is where it was');
                AssertEqual(
                    Number((await lineTotals(ctx, orderID))[0].BilledToDate),
                    billedBefore + 100,
                    'BilledToDate moves by the instalment, as the entry now does too',
                );
            }),
    },
    {
        Id: 'payment-schedule.PS-G',
        Name: "PS-G: Scenario 3 — an UpFront line earns in full at confirm, the unbilled part to the contract asset",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Andrew's Scenario 3, at this order's scale: the product is delivered, so all 300
                // is earned; 100 is billed and the other 200 is earned money not yet invoiceable,
                // which is the one case where confirmation legitimately debits a contract asset.
                const { orderID, saved, message } = await scheduledOrder(ctx, THREE);
                Assert(saved, `confirm: ${message}`);

                const all = await allLedger(ctx, orderID);
                assertBalanced(all, 'the confirm entries');
                AssertEqual(netOn(all, SALES_CODE), -300, 'the whole line is earned at booking');
                AssertEqual(netOn(all, AR_CODE), 100, 'only the due instalment is billed');
                AssertEqual(netOn(all, UNBILLED_CODE), 200, 'the rest is a contract asset');
                AssertEqual(netOn(all, DEFERRED_CODE), 0, 'and nothing is left deferred');

                const totals = await lineTotals(ctx, orderID);
                AssertEqual(Number(totals[0].RecognizedToDate), 300, 'RecognizedToDate is the whole line');
                AssertEqual(Number(totals[0].BilledToDate), 100, 'BilledToDate is only what was invoiced');
            }),
    },
    {
        Id: 'payment-schedule.PS-H',
        Name: 'PS-H: a line carrying an Unbilled balance is invoiced against Unbilled FIRST, then Deferred',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // RULE 1's exception, and the reason the rule is ordered at all. After confirm this
                // line has Recognized 300 against Billed 100, so 200 sits in Unbilled. Invoicing the
                // next 100 must RELIEVE that contract asset rather than open new Deferred: crediting
                // Deferred would leave the asset standing while deferring revenue already earned —
                // two wrong balances, and the entry balancing anyway.
                const { orderID, ids, saved, message } = await scheduledOrder(ctx, THREE);
                Assert(saved, `confirm: ${message}`);
                AssertEqual(netOn(await allLedger(ctx, orderID), UNBILLED_CODE), 200, 'precondition: 200 unbilled');

                Assert((await issue(ctx, ids[1])).Success, 'issue instalment 2');

                const all = await allLedger(ctx, orderID);
                assertBalanced(all, 'confirm plus the second instalment');
                AssertEqual(netOn(all, UNBILLED_CODE), 100, 'the contract asset was relieved by the instalment');
                AssertEqual(netOn(all, DEFERRED_CODE), 0, 'and no new Deferred was opened');
                AssertEqual(netOn(all, AR_CODE), 200, 'two instalments billed');
            }),
    },
    {
        Id: 'payment-schedule.PS-I',
        Name: 'PS-I: a discount spanning a due AND a future instalment is booked ONCE, at recognition',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // ANDREW'S #225 COUNTER-EXAMPLE, at his numbers. List 1,000 less 10% is 900 net,
                // billed as two instalments of 450 — the first due at confirm, the second a year
                // out, so the SAME discount spans a due and a future instalment.
                //
                // The defect this check exists for: the instalment invoice used to credit Deferred
                // for GROSS and debit the discount slice, while the recognition entry credited
                // Sales gross and debited the discount again. Sales Discounts ended at 200 against
                // a real discount of 100, and the surplus sat stranded in Unbilled and Deferred.
                // Every entry balanced, so nothing else in this suite would have caught it.
                //
                // It needs a Sales Discounts LINK to be visible at all — without one the discount
                // nets into the revenue credit (D11) and both the right and the wrong model post
                // the same two lines. That link is seeded on this product alone.
                const f = Fx();
                const { orderID, ids, saved, message } = await scheduledOrder(
                    ctx,
                    [
                        { InstallmentNumber: 1, DueDate: '2026-07-01', Amount: 450 },
                        { InstallmentNumber: 2, DueDate: '2027-07-01', Amount: 450 },
                    ],
                    { productID: f.Products.DiscountedA, gross: 1000, discountPct: 0.1 },
                );
                Assert(saved, `confirm: ${message}`);

                // After confirm: the line is UpFront, so all 900 is earned and the discount is
                // booked once, here. Only instalment 1 is billed, so 450 of the earned revenue is
                // still a contract asset.
                const afterConfirm = await allLedger(ctx, orderID);
                assertBalanced(afterConfirm, 'the confirm entries');
                AssertEqual(netOn(afterConfirm, SALES_CODE), -1000, 'Sales is credited GROSS');
                AssertEqual(netOn(afterConfirm, DISCOUNT_CODE), 100, 'and the discount is debited once');
                AssertEqual(netOn(afterConfirm, AR_CODE), 450, 'only the due instalment is billed');
                AssertEqual(netOn(afterConfirm, UNBILLED_CODE), 450, 'the rest is a contract asset');
                AssertEqual(netOn(afterConfirm, DEFERRED_CODE), 0, 'and nothing is deferred');

                Assert((await issue(ctx, ids[1])).Success, 'issue the future instalment');

                // After the second instalment the order is fully billed and fully earned, so both
                // contra accounts must be flat. THE DISCOUNT HAS NOT MOVED — that is the check.
                const all = await allLedger(ctx, orderID);
                assertBalanced(all, 'confirm plus both instalments');
                AssertEqual(netOn(all, DISCOUNT_CODE), 100, 'the discount is still booked exactly once');
                AssertEqual(netOn(all, SALES_CODE), -1000, 'and Sales is still gross');
                AssertEqual(netOn(all, AR_CODE), 900, 'the customer owes net, not gross');
                AssertEqual(netOn(all, UNBILLED_CODE), 0, 'the contract asset is fully relieved');
                AssertEqual(netOn(all, DEFERRED_CODE), 0, 'and nothing is stranded in Deferred');

                const totals = await lineTotals(ctx, orderID);
                AssertEqual(Number(totals[0].BilledToDate), 900, 'BilledToDate is net, not gross');
                AssertEqual(Number(totals[0].RecognizedToDate), 900, 'and it has caught up to recognition');
            }),
    },
];

for (const check of PaymentScheduleChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('payment-schedule', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});
