/**
 * payment-deposit.checks.ts — the `payment-deposit` bundle (PM1–PM12).
 *
 * CASH AHEAD OF BILLING IS NOT A PAYMENT ON ACCOUNT (D91). A scheduled company books no value at
 * confirm, so until an instalment is invoiced there is no receivable for cash to clear. Crediting
 * Accounts Receivable anyway drives it negative against a customer who has been billed nothing,
 * and quietly removes the obligation to deliver from the balance sheet. Money held for something
 * not yet billed is a deposit, and it sits in the Customer Deposits role until the instalment is
 * issued, when a separate pair of lines clears it against the new receivable (#234 review).
 *
 * WHAT IT PROVES
 *   PM1  unnamed cash settles an INVOICED instalment before a Scheduled one, whatever the dates
 *        say, and posts a receivable credit only
 *   PM2  cash beyond what has been invoiced posts the excess to Customer Deposits
 *   PM3  a payment naming a Scheduled instalment is a deposit in full, even with an invoice open
 *   PM4  advancing an instalment to Invoiced by hand is refused — only the operation issues
 *   PM5  an order with no schedule books exactly the entry it always did (the regression fence,
 *        the same shape check order-booking.OB18 is for booking)
 *   PM6  an INVOICED instalment sitting inside the billing worklist's window still does not appear
 *        on it — the list filters on having an invoice, not merely on dates
 *   PM7  refunding PM2's overpayment mirrors what it booked: Dr AR 100 / Dr Customer Deposits 50,
 *        and the schedule and the ledger both say instalment 1 owes 100 again
 *   PM8  the webhook's Pending → Captured promotion sees the schedule: the cash is a deposit
 *   PM9  two lines of one payment naming two invoiced instalments each settle their own invoice
 *   PM10 a deposit and its application land on the SAME account, resolved per product, with a
 *        shipping charge so the AR debit and the revenue part differ
 *   PM11 a deposit for a company with no Customer Deposits account is refused, naming both
 *   PM12 refunding PM3's named deposit mirrors it: Dr Customer Deposits / Cr Cash, and the named
 *        instalment goes back to zero paid
 *
 * PM1 is the cascade half and PM2/PM3 the ledger half of one rule; they are in one bundle because
 * a change that satisfies either alone is wrong.
 *
 * CONNECTS TO:
 *   SQL:    spRecalcOrderHeaderPaymentSchedule (V202609252100 — billed rows first)
 *   CODE:   PlanLineDeposits · DepositReleasedByCompany · PaymentAllocationFactory
 *           EmitInstalmentInvoiceEntry (deposit application) · OrderHeaderPaymentScheduleEntityServer
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 */
import { BaseEntity, BaseRemotableOperation, CompositeKey, Metadata } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import { OrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import type { OrderHeaderPaymentScheduleEntityServer } from '@mj-biz-apps/orders-core-entities-server';
import {
    ACCT_SCHEMA,
    CreateOrdersFixture,
    createViaEntity,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    TeardownOrdersFixture,
    TxMaybeOne,
    TxOne,
    TxQuery,
} from '../fixture.js';
import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, PAYMENT_HEADER_ENTITY } from '../entity-names.js';
import { BuildOrder } from '../order-builder.js';
import { CreatePayment, type AllocationSpec } from '../payment-builder.js';
import { scheduledOrder } from './payment-schedule.checks.js';

interface WorklistRow {
    OrderNumber: string;
    InstallmentNumber: number;
}

interface WorklistOutput {
    Success: boolean;
    Message?: string;
    Rows: WorklistRow[];
}

interface IssueOutput {
    Success: boolean;
    Message?: string;
    DocumentNumber?: string | null;
    JournalEntryID?: string | null;
}

interface RefundOutput {
    Success: boolean;
    Message?: string;
    RefundPaymentHeaderID?: string;
}

const CUSTOMER_DEPOSITS = 'Customer Deposits';

function operation<I, O>(key: string) {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation<I, O>>(BaseRemotableOperation, key);
    Assert(op != null, `'${key}' is not registered`);
    return op!;
}

/** The account a role resolves to for a company, read rather than hardcoded. */
async function accountCodeForRole(ctx: IntegrationCheckContext, role: string, companyID: string): Promise<string> {
    const f = Fx();
    const row = await TxMaybeOne<{ Code: string }>(
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

/** Every journal entry line the payment's allocations produced, found through D25 provenance. */
const allocationLines = (ctx: IntegrationCheckContext, paymentID: string) =>
    TxQuery<{ Code: string; DebitAmount: number; CreditAmount: number }>(
        ctx,
        `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
           FROM ${ORDERS_SCHEMA}.PaymentLine pl
           JOIN ${ACCT_SCHEMA}.vwJournalEntries je
             ON LOWER(je.LinkedRecordID) = LOWER(CAST(pl.ID AS NVARCHAR(400)))
           JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
           JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
          WHERE pl.PaymentHeaderID = '${paymentID}'`,
    );

/** Total credited to one account code across a payment's allocation entries. */
const creditedTo = (lines: { Code: string; CreditAmount: number }[], code: string): number =>
    Math.round(lines.filter((l) => l.Code === code).reduce((s, l) => s + Number(l.CreditAmount ?? 0), 0) * 100) / 100;

/** Total debited to one account code. */
const debitedTo = (lines: { Code: string; DebitAmount: number }[], code: string): number =>
    Math.round(lines.filter((l) => l.Code === code).reduce((s, l) => s + Number(l.DebitAmount ?? 0), 0) * 100) / 100;

/** Debits less credits on one account code. */
const netOn = (lines: { Code: string; DebitAmount: number; CreditAmount: number }[], code: string): number =>
    Math.round((debitedTo(lines, code) - creditedTo(lines, code)) * 100) / 100;

/** The lines of one instalment's billing entry. */
const instalmentEntryLines = (ctx: IntegrationCheckContext, scheduleID: string) =>
    TxQuery<{ Code: string; DebitAmount: number; CreditAmount: number }>(
        ctx,
        `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
           FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule ps
           JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = ps.JournalEntryID
           JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
          WHERE ps.ID = '${scheduleID}'`,
    );

/** The account a role resolves to at PRODUCT level, for the per-line walk (PM10). */
async function productAccountCode(ctx: IntegrationCheckContext, role: string, productID: string): Promise<string> {
    const row = await TxMaybeOne<{ Code: string }>(
        ctx,
        `SELECT gl.Code
           FROM ${ACCT_SCHEMA}.GLAccountLink lk
           JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = lk.GLAccountID
           JOIN ${ACCT_SCHEMA}.GLAccountRole r ON r.ID = lk.GLAccountRoleID
          WHERE r.Name = '${role}' AND lk.Status = 'Active' AND lk.RecordID = '${productID}'`,
    );
    Assert(row != null, `the fixture must link a product-level '${role}' account for ${productID}`);
    return row!.Code;
}

interface ScheduleRow {
    ID: string;
    InstallmentNumber: number;
    Amount: number;
    AmountPaid: number;
    Status: string;
    DocumentNumber: string | null;
}

const schedule = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<ScheduleRow>(
        ctx,
        `SELECT ID, InstallmentNumber, Amount, AmountPaid, Status, DocumentNumber
           FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID='${orderID}' ORDER BY InstallmentNumber`,
    );

/** A confirmed order for `gross`, with the given instalments when any are asked for. */
async function orderWith(
    ctx: IntegrationCheckContext,
    instalments: { InstallmentNumber: number; DueDate: string; Amount: number }[],
    gross = 300,
    over: { companyID?: string; productID?: string } = {},
) {
    const f = Fx();
    const companyID = over.companyID ?? f.CoA.ID;
    const draft = await BuildOrder(ctx.User, {
        CompanyID: companyID,
        BillToOrganizationID: f.Customers.OrganizationID,
        OrderDate: new Date('2026-07-01T00:00:00Z'),
        Lines: [{ ProductID: over.productID ?? f.Products.WidgetA, Quantity: 1, UnitPrice: gross }],
    });
    Assert(await draft.Order.Save(), `draft must save: ${draft.Order.LatestResult?.CompleteMessage ?? ''}`);
    const orderID = draft.Order.ID as string;

    for (const row of instalments) {
        await createViaEntity(ctx, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, {
            OrderHeaderID: orderID,
            CompanyID: companyID,
            InstallmentNumber: row.InstallmentNumber,
            DueDate: new Date(`${row.DueDate}T00:00:00Z`),
            Amount: row.Amount,
        });
    }

    const md = new Metadata();
    const order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, ctx.User);
    Assert(await order.Load(orderID), 'header reload must succeed');
    order.Status = 'Confirmed';
    Assert(await order.Save(), `confirm must succeed: ${order.LatestResult?.CompleteMessage ?? ''}`);
    return orderID;
}

async function issue(ctx: IntegrationCheckContext, scheduleID: string): Promise<IssueOutput> {
    const result = await operation<{ OrderHeaderPaymentScheduleID: string }, IssueOutput>('Orders.IssueInstalmentInvoice').Execute(
        { OrderHeaderPaymentScheduleID: scheduleID },
        { provider: ctx.Provider, user: ctx.User },
    );
    Assert(result.Success && result.Output?.Success === true, `issue failed: ${result.Output?.Message ?? result.ErrorMessage ?? ''}`);
    return result.Output!;
}

/** Every instalment the billing worklist offers for a window starting at `asOf`. */
async function billingWorklist(ctx: IntegrationCheckContext, asOf: string, windowDays: number): Promise<WorklistRow[]> {
    const result = await operation<{ AsOfDate: string; WindowDays: number }, WorklistOutput>('Orders.GetBillingWorklist').Execute(
        { AsOfDate: asOf, WindowDays: windowDays },
        { provider: ctx.Provider, user: ctx.User },
    );
    Assert(result.Success && result.Output?.Success === true, `GetBillingWorklist failed: ${result.Output?.Message ?? result.ErrorMessage ?? ''}`);
    return result.Output!.Rows;
}

/** Capture `amount` against the order, optionally naming one instalment. Returns the payment id. */
async function pay(ctx: IntegrationCheckContext, orderID: string, amount: number, scheduleID?: string): Promise<string> {
    const result = await payWith(ctx, [{ OrderHeaderID: orderID, Amount: amount, OrderHeaderPaymentScheduleID: scheduleID ?? null }]);
    Assert(result.Saved, `payment must capture: ${result.Message}`);
    return result.Payment.ID as string;
}

/** A payment carrying every allocation given, for the checks that need more than one line. */
async function payWith(
    ctx: IntegrationCheckContext,
    allocations: AllocationSpec[],
    over: { receiving?: string; status?: 'Captured' | 'Pending' } = {},
) {
    const f = Fx();
    const cash = f.PaymentTypeIDs.get('Cash');
    Assert(cash != null, "PaymentType 'Cash' missing — push the orders app metadata");
    return CreatePayment(ctx.User, {
        PaymentNumber: `PM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        ReceivingCompanyID: over.receiving ?? f.CoA.ID,
        PaymentTypeID: cash!,
        Amount: Math.round(allocations.reduce((s, a) => s + a.Amount, 0) * 100) / 100,
        Status: over.status ?? 'Captured',
        Allocations: allocations,
    });
}

async function refund(ctx: IntegrationCheckContext, paymentID: string): Promise<string> {
    const result = await operation<{ PaymentHeaderID: string }, RefundOutput>('Orders.RefundPayment').Execute(
        { PaymentHeaderID: paymentID },
        { provider: ctx.Provider, user: ctx.User },
    );
    Assert(result.Success && result.Output?.Success === true, `refund failed: ${result.Output?.Message ?? result.ErrorMessage ?? ''}`);
    Assert(!!result.Output!.RefundPaymentHeaderID, 'the refund names its reversing payment');
    return result.Output!.RefundPaymentHeaderID!;
}

const TWO = [
    { InstallmentNumber: 1, DueDate: '2026-07-15', Amount: 100 },
    { InstallmentNumber: 2, DueDate: '2026-10-15', Amount: 200 },
];

export const PaymentDepositChecks: NamedCheck[] = [
    {
        Id: 'payment-deposit.PM1',
        Name: 'PM1: unnamed cash settles the invoiced instalment first, and credits AR only',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const orderID = await orderWith(ctx, TWO);
                const rows = await schedule(ctx, orderID);

                // Issue the LATER instalment. Oldest-due-first would send the cash to instalment 1;
                // billed-first must send it to the one the customer actually holds an invoice for.
                await issue(ctx, rows[1].ID);
                const paymentID = await pay(ctx, orderID, 200);

                const after = await schedule(ctx, orderID);
                AssertEqual(Number(after[0].AmountPaid), 0, 'the un-invoiced instalment takes none of it');
                AssertEqual(Number(after[1].AmountPaid), 200, 'the invoiced instalment is settled in full');

                const lines = await allocationLines(ctx, paymentID);
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                const deposits = await accountCodeForRole(ctx, CUSTOMER_DEPOSITS, f.CoA.ID);
                AssertEqual(creditedTo(lines, ar), 200, 'the whole payment credits the receivable');
                AssertEqual(creditedTo(lines, deposits), 0, 'and nothing is held as a deposit');
            }),
    },
    {
        Id: 'payment-deposit.PM2',
        Name: 'PM2: cash beyond what has been invoiced is a customer deposit in Customer Deposits',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const orderID = await orderWith(ctx, TWO);
                const rows = await schedule(ctx, orderID);
                await issue(ctx, rows[0].ID);

                // 150 against a single 100 invoice: 100 settles it, 50 is money held for an
                // instalment nobody has been billed for yet.
                const paymentID = await pay(ctx, orderID, 150);

                const lines = await allocationLines(ctx, paymentID);
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                const deposits = await accountCodeForRole(ctx, CUSTOMER_DEPOSITS, f.CoA.ID);
                const deferred = await accountCodeForRole(ctx, 'Deferred Revenue', f.CoA.ID);
                AssertEqual(creditedTo(lines, ar), 100, 'AR is credited only what was invoiced');
                AssertEqual(creditedTo(lines, deposits), 50, 'the excess is a deposit');
                AssertEqual(creditedTo(lines, deferred), 0, 'and Deferred Revenue is not where deposits live');

                const debits = Math.round(lines.reduce((s, l) => s + Number(l.DebitAmount ?? 0), 0) * 100) / 100;
                const credits = Math.round(lines.reduce((s, l) => s + Number(l.CreditAmount ?? 0), 0) * 100) / 100;
                AssertEqual(debits, credits, 'and the entry still balances');
            }),
    },
    {
        Id: 'payment-deposit.PM3',
        Name: 'PM3: naming a Scheduled instalment is a deposit in full, even with an invoice open',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const orderID = await orderWith(ctx, TWO);
                const rows = await schedule(ctx, orderID);
                await issue(ctx, rows[0].ID);

                // The payer said what the money is for. Instalment 1's invoice stays open.
                const paymentID = await pay(ctx, orderID, 120, rows[1].ID);

                const lines = await allocationLines(ctx, paymentID);
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                const deposits = await accountCodeForRole(ctx, CUSTOMER_DEPOSITS, f.CoA.ID);
                AssertEqual(creditedTo(lines, ar), 0, 'none of it touches the receivable');
                AssertEqual(creditedTo(lines, deposits), 120, 'all of it is a deposit');

                const after = await schedule(ctx, orderID);
                AssertEqual(Number(after[0].AmountPaid), 0, 'the invoiced instalment is still unpaid');
                AssertEqual(Number(after[1].AmountPaid), 120, 'the named instalment holds the money');
            }),
    },
    {
        Id: 'payment-deposit.PM4',
        Name: 'PM4: advancing an instalment to Invoiced by hand is refused',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const orderID = await orderWith(ctx, TWO);
                const rows = await schedule(ctx, orderID);

                const md = new Metadata();
                const row = await md.GetEntityObject<OrderHeaderPaymentScheduleEntityServer>(
                    ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
                    ctx.User,
                );
                Assert(await row.Load(rows[0].ID), 'the instalment must load');
                row.Status = 'Invoiced';
                row.DocumentNumber = 'HAND-TYPED-1';
                row.InvoicedAt = new Date('2026-07-16T00:00:00Z');

                const saved = await row.Save();
                Assert(!saved, 'saving an invoice identity by hand must be refused');
                const message = row.LatestResult?.CompleteMessage ?? '';
                Assert(
                    message.includes('Orders.IssueInstalmentInvoice'),
                    `and the refusal must name the operation, got: ${message}`,
                );

                const after = await schedule(ctx, orderID);
                AssertEqual(after[0].Status, 'Scheduled', 'the row is untouched');
                AssertEqual(after[0].DocumentNumber, null, 'and carries no number');
            }),
    },
    {
        Id: 'payment-deposit.PM5',
        Name: 'PM5: an order with no schedule books the payment entry it always did',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const orderID = await orderWith(ctx, [], 300);
                const paymentID = await pay(ctx, orderID, 300);

                const lines = await allocationLines(ctx, paymentID);
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                const deferred = await accountCodeForRole(ctx, 'Deferred Revenue', f.CoA.ID);
                const deposits = await accountCodeForRole(ctx, CUSTOMER_DEPOSITS, f.CoA.ID);

                // The shape, not just the totals: one cash debit, one AR credit, and no deposit line
                // anywhere. This is the fence — every order that exists today is this order.
                AssertEqual(creditedTo(lines, ar), 300, 'the whole payment credits AR');
                AssertEqual(creditedTo(lines, deferred), 0, 'and nothing is deferred');
                AssertEqual(creditedTo(lines, deposits), 0, 'and nothing is held as a deposit');
                AssertEqual(
                    lines.filter((l) => Number(l.CreditAmount ?? 0) > 0).length,
                    1,
                    'exactly one credit line, as before the deposit rule existed',
                );
            }),
    },
    {
        Id: 'payment-deposit.PM6',
        Name: 'PM6: an invoiced instalment inside the window still does not appear on the billing worklist',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // THE LIST FILTERS ON HAVING AN INVOICE, NOT ON DATES, and only a row that is
                // invoiced AND inside the window can tell the two apart. payment-schedule.PS10
                // proves the include-then-drop cycle, but since D92 made confirm issue what is
                // already due, its issued row is also outside its window — so a regression that
                // started listing invoiced rows would pass it. This is that assertion, placed here
                // because this bundle is the one being run.
                const orderID = await orderWith(ctx, [
                    { InstallmentNumber: 1, DueDate: '2026-07-01', Amount: 100 }, // the order date: confirm issues it
                    { InstallmentNumber: 2, DueDate: '2027-07-01', Amount: 200 },
                ]);
                const rows = await schedule(ctx, orderID);
                AssertEqual(rows[0].Status, 'Invoiced', 'confirm issued the instalment due on the order date');
                Assert(rows[0].DocumentNumber != null, 'and froze its number');

                // 2026-06-20 + 30 days reaches 2026-07-20, so instalment 1 is eleven days out and
                // squarely inside the window. Nothing but the invoice keeps it off the list.
                const mine = await TxOne<{ OrderNumber: string }>(
                    ctx,
                    `SELECT OrderNumber FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${orderID}'`,
                );
                const offered = (await billingWorklist(ctx, '2026-06-20', 30)).filter((r) => r.OrderNumber === mine.OrderNumber);
                AssertEqual(offered.length, 0, 'an invoiced instalment is not offered for billing, however near its due date');
            }),
    },
    {
        Id: 'payment-deposit.PM7',
        Name: 'PM7: refunding an overpayment on a scheduled order mirrors what the payment booked',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Andrew's example from PM2: 150 against a single 100 invoice, then all 150 back.
                // The refund used to read the schedule AFTER the payment, see the invoice paid and
                // treat the whole refund as a deposit coming back. It must mirror the capture.
                const f = Fx();
                const orderID = await orderWith(ctx, TWO);
                const rows = await schedule(ctx, orderID);
                await issue(ctx, rows[0].ID);
                const paymentID = await pay(ctx, orderID, 150);

                const refundID = await refund(ctx, paymentID);
                const lines = await allocationLines(ctx, refundID);
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                const deposits = await accountCodeForRole(ctx, CUSTOMER_DEPOSITS, f.CoA.ID);
                const cash = await accountCodeForRole(ctx, 'Cash', f.CoA.ID);
                AssertEqual(debitedTo(lines, ar), 100, 'Dr AR 100: the invoice is owed again');
                AssertEqual(debitedTo(lines, deposits), 50, 'Dr Customer Deposits 50: the deposit goes back');
                AssertEqual(creditedTo(lines, cash), 150, 'Cr Cash 150');

                const after = await schedule(ctx, orderID);
                AssertEqual(Number(after[0].AmountPaid), 0, 'the schedule un-applies instalment 1');
                AssertEqual(Number(after[1].AmountPaid), 0, 'and holds nothing on instalment 2');

                // And the ledger agrees with it: the payment and its refund net to zero on both
                // accounts, so AR is back to the 100 the invoice raised.
                const both = [...(await allocationLines(ctx, paymentID)), ...lines];
                AssertEqual(netOn(both, ar), 0, 'the payment and refund net to nothing on AR');
                AssertEqual(netOn(both, deposits), 0, 'and to nothing on Customer Deposits');
            }),
    },
    {
        Id: 'payment-deposit.PM12',
        Name: 'PM12: refunding a payment that named a Scheduled instalment mirrors the deposit it booked',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // PM3's shape, then all of it back. The reversing lines must name instalment 2 as
                // the original did; unnamed, the cascade placed the -150 on no row, instalment 2
                // kept its 150, and the refund debited AR for money booked to Customer Deposits.
                const f = Fx();
                const orderID = await orderWith(ctx, TWO);
                const rows = await schedule(ctx, orderID);
                await issue(ctx, rows[0].ID);
                const paymentID = await pay(ctx, orderID, 150, rows[1].ID);

                const refundID = await refund(ctx, paymentID);
                const lines = await allocationLines(ctx, refundID);
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                const deposits = await accountCodeForRole(ctx, CUSTOMER_DEPOSITS, f.CoA.ID);
                const cash = await accountCodeForRole(ctx, 'Cash', f.CoA.ID);
                AssertEqual(debitedTo(lines, deposits), 150, 'Dr Customer Deposits 150: the deposit goes back');
                AssertEqual(debitedTo(lines, ar), 0, 'and AR is not touched');
                AssertEqual(creditedTo(lines, cash), 150, 'Cr Cash 150');

                const after = await schedule(ctx, orderID);
                AssertEqual(Number(after[1].AmountPaid), 0, 'the named instalment is back to zero paid');
                AssertEqual(Number(after[0].AmountPaid), 0, 'and the invoiced one was never paid');

                const both = [...(await allocationLines(ctx, paymentID)), ...lines];
                AssertEqual(netOn(both, ar), 0, 'the payment and refund net to nothing on AR');
                AssertEqual(netOn(both, deposits), 0, 'and to nothing on Customer Deposits');
            }),
    },
    {
        Id: 'payment-deposit.PM8',
        Name: 'PM8: the webhook promotion from Pending to Captured books a deposit, not a receivable',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // What PaymentSettlement.promote does: load the header by id — no lines in memory —
                // set Captured and save. The lines are already in the table from the Pending save.
                const f = Fx();
                const orderID = await orderWith(ctx, TWO);
                const pending = await payWith(ctx, [{ OrderHeaderID: orderID, Amount: 80 }], { status: 'Pending' });
                Assert(pending.Saved, `the pending payment must save: ${pending.Message}`);
                const paymentID = pending.Payment.ID as string;

                const md = new Metadata();
                const header = await md.GetEntityObject<BaseEntity>(PAYMENT_HEADER_ENTITY, CompositeKey.FromID(paymentID), ctx.User);
                header.Set('Status', 'Captured');
                Assert(await header.Save(), `the promotion must book: ${header.LatestResult?.CompleteMessage ?? ''}`);

                const lines = await allocationLines(ctx, paymentID);
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                const deposits = await accountCodeForRole(ctx, CUSTOMER_DEPOSITS, f.CoA.ID);
                AssertEqual(creditedTo(lines, deposits), 80, 'nothing is invoiced, so the whole capture is a deposit');
                AssertEqual(creditedTo(lines, ar), 0, 'and AR is not driven negative');
            }),
    },
    {
        Id: 'payment-deposit.PM9',
        Name: 'PM9: two lines naming two invoiced instalments each settle their own invoice',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // The later instalment is named FIRST. Consuming billed-rows-first would charge its
                // 200 against instalment 1, and the second line — naming instalment 1 — would find
                // no room and turn a real receivable into a deposit.
                const f = Fx();
                const orderID = await orderWith(ctx, TWO);
                const rows = await schedule(ctx, orderID);
                await issue(ctx, rows[0].ID);
                await issue(ctx, rows[1].ID);

                const result = await payWith(ctx, [
                    { OrderHeaderID: orderID, Amount: 200, OrderHeaderPaymentScheduleID: rows[1].ID },
                    { OrderHeaderID: orderID, Amount: 100, OrderHeaderPaymentScheduleID: rows[0].ID },
                ]);
                Assert(result.Saved, `payment must capture: ${result.Message}`);

                const lines = await allocationLines(ctx, result.Payment.ID as string);
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                const deposits = await accountCodeForRole(ctx, CUSTOMER_DEPOSITS, f.CoA.ID);
                AssertEqual(creditedTo(lines, ar), 300, 'both invoices are settled');
                AssertEqual(creditedTo(lines, deposits), 0, 'and nothing becomes a deposit');

                const after = await schedule(ctx, orderID);
                AssertEqual(Number(after[0].AmountPaid), 100, 'instalment 1 holds its own payment');
                AssertEqual(Number(after[1].AmountPaid), 200, 'and instalment 2 its own');
            }),
    },
    {
        Id: 'payment-deposit.PM10',
        Name: 'PM10: a deposit and its application land on the same per-product account, with a charge on the bill',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Andrew's worked example, with a product that carries its OWN Customer Deposits link
                // (EDIT-COURSE → 21410) and a shipping charge, so the AR debit (220) and the revenue
                // part (200) differ and a basis slip shows. Capture: Dr Cash 220 / Cr Deposits 220.
                // Issue: Dr AR 220 / Cr Deferred 200 / Cr Shipping 20, then Dr Deposits 220 / Cr AR 220.
                const f = Fx();
                const { orderID, ids, saved, message } = await scheduledOrder(
                    ctx,
                    [{ InstallmentNumber: 1, DueDate: '2027-07-01', Amount: 220 }],
                    {
                        productID: f.Products.DeferredA,
                        gross: 200,
                        charges: [{ Code: 'Shipping', Amount: 20 }],
                        servicePeriod: { Start: '2026-07-01', End: '2027-06-30' },
                    },
                );
                Assert(saved, `confirm: ${message}`);

                const productDeposits = await productAccountCode(ctx, CUSTOMER_DEPOSITS, f.Products.DeferredA);
                const companyDeposits = await accountCodeForRole(ctx, CUSTOMER_DEPOSITS, f.CoA.ID);
                Assert(productDeposits !== companyDeposits, 'the fixture must give the product its own deposits account');
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                const deferred = await accountCodeForRole(ctx, 'Deferred Revenue', f.CoA.ID);

                const paymentID = await pay(ctx, orderID, 220);
                const capture = await allocationLines(ctx, paymentID);
                AssertEqual(creditedTo(capture, productDeposits), 220, 'the deposit resolves through the product');
                AssertEqual(creditedTo(capture, companyDeposits), 0, 'not the company default');

                const issued = await issue(ctx, ids[0]);
                Assert(issued.JournalEntryID != null, 'a prepaid instalment still posts its bill');
                const bill = await instalmentEntryLines(ctx, ids[0]);
                AssertEqual(debitedTo(bill, ar), 220, 'the invoice posts at full value, charge included');
                AssertEqual(creditedTo(bill, deferred), 200, 'Deferred takes the revenue part only');
                AssertEqual(debitedTo(bill, productDeposits), 220, 'the application clears the same account the capture credited');
                AssertEqual(creditedTo(bill, ar), 220, 'and settles the receivable it raised');

                const everything = [...capture, ...bill];
                AssertEqual(netOn(everything, ar), 0, 'end state: AR zero');
                AssertEqual(netOn(everything, productDeposits), 0, 'Customer Deposits zero');
                AssertEqual(netOn(everything, deferred), -200, 'Deferred holds the 200 of revenue');
            }),
    },
    {
        Id: 'payment-deposit.PM11',
        Name: 'PM11: a deposit for a company with no Customer Deposits account is refused, naming the role and the company',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Harbor House is left unlinked on purpose. Jeremy can link the role to Deferred
                // Revenue if he wants fewer accounts, so there is no reason to fall back silently.
                // Harbor House links no Unbilled Receivable either, and since #258 a confirm that
                // recognises ahead of billing is refused for that. Its membership is deferred, so the
                // confirm books nothing and the refusal under test is the only one in play.
                const f = Fx();
                const membership = await TxOne<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE SKU='HH-MEM'`);
                const orderID = await orderWith(ctx, TWO, 300, { companyID: f.CoB.ID, productID: membership.ID });
                const result = await payWith(ctx, [{ OrderHeaderID: orderID, Amount: 50 }], { receiving: f.CoB.ID });

                Assert(!result.Saved, 'a deposit with nowhere to go must not capture');
                Assert(result.Message.includes(`'${CUSTOMER_DEPOSITS}'`), `the refusal names the role, got: ${result.Message}`);
                Assert(result.Message.toLowerCase().includes(String(f.CoB.ID).toLowerCase()), `and the company, got: ${result.Message}`);
                const stored = await TxMaybeOne<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE ID='${result.Payment.ID ?? '00000000-0000-0000-0000-000000000000'}'`,
                );
                AssertEqual(stored, null, 'and nothing was written');
            }),
    },
];

for (const check of PaymentDepositChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('payment-deposit', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
        const { AccountingEngineBase } = await import('@mj-biz-apps/accounting-engine-base');
        await AccountingEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
    },
    Teardown: TeardownOrdersFixture,
});
