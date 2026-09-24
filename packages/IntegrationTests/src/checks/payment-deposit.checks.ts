/**
 * payment-deposit.checks.ts — the `payment-deposit` bundle (PM1–PM6).
 *
 * CASH AHEAD OF BILLING IS NOT A PAYMENT ON ACCOUNT (D91). A scheduled company books no value at
 * confirm, so until an instalment is invoiced there is no receivable for cash to clear. Crediting
 * Accounts Receivable anyway drives it negative against a customer who has been billed nothing,
 * and quietly removes the obligation to deliver from the balance sheet. Money held for something
 * not yet billed is a deposit, and this app keeps that obligation in Deferred Revenue.
 *
 * WHAT IT PROVES (the brief's PM-A…PM-E, in this repo's numbering)
 *   PM1  unnamed cash settles an INVOICED instalment before a Scheduled one, whatever the dates
 *        say, and posts a receivable credit only
 *   PM2  cash beyond what has been invoiced posts the excess to Deferred Revenue
 *   PM3  a payment naming a Scheduled instalment is a deposit in full, even with an invoice open
 *   PM4  advancing an instalment to Invoiced by hand is refused — only the operation issues
 *   PM5  an order with no schedule books exactly the entry it always did (the regression fence,
 *        the same shape check order-booking.OB18 is for booking)
 *   PM6  an INVOICED instalment sitting inside the billing worklist's window still does not appear
 *        on it — the list filters on having an invoice, not merely on dates
 *
 * PM1 is the cascade half and PM2/PM3 the ledger half of one rule; they are in one bundle because
 * a change that satisfies either alone is wrong.
 *
 * CONNECTS TO:
 *   SQL:    spRecalcOrderHeaderPaymentSchedule (V202609231600 — billed rows first)
 *   CODE:   SplitCashForCompany · PaymentAllocationFactory · OrderHeaderPaymentScheduleEntityServer
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
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
import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY } from '../entity-names.js';
import { BuildOrder } from '../order-builder.js';
import { CreatePayment } from '../payment-builder.js';

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
}

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
) {
    const f = Fx();
    const draft = await BuildOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        BillToOrganizationID: f.Customers.OrganizationID,
        OrderDate: new Date('2026-07-01T00:00:00Z'),
        Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: gross }],
    });
    Assert(await draft.Order.Save(), `draft must save: ${draft.Order.LatestResult?.CompleteMessage ?? ''}`);
    const orderID = draft.Order.ID as string;

    for (const row of instalments) {
        await createViaEntity(ctx, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, {
            OrderHeaderID: orderID,
            CompanyID: f.CoA.ID,
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
    const f = Fx();
    const cash = f.PaymentTypeIDs.get('Cash');
    Assert(cash != null, "PaymentType 'Cash' missing — push the orders app metadata");
    const result = await CreatePayment(ctx.User, {
        PaymentNumber: `PM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        ReceivingCompanyID: f.CoA.ID,
        PaymentTypeID: cash!,
        Amount: amount,
        Allocations: [{ OrderHeaderID: orderID, Amount: amount, OrderHeaderPaymentScheduleID: scheduleID ?? null }],
    });
    Assert(result.Saved, `payment must capture: ${result.Message}`);
    return result.Payment.ID as string;
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
                const deferred = await accountCodeForRole(ctx, 'Deferred Revenue', f.CoA.ID);
                AssertEqual(creditedTo(lines, ar), 200, 'the whole payment credits the receivable');
                AssertEqual(creditedTo(lines, deferred), 0, 'and nothing is held as a deposit');
            }),
    },
    {
        Id: 'payment-deposit.PM2',
        Name: 'PM2: cash beyond what has been invoiced is a customer deposit in Deferred Revenue',
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
                const deferred = await accountCodeForRole(ctx, 'Deferred Revenue', f.CoA.ID);
                AssertEqual(creditedTo(lines, ar), 100, 'AR is credited only what was invoiced');
                AssertEqual(creditedTo(lines, deferred), 50, 'the excess is a deposit');

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
                const deferred = await accountCodeForRole(ctx, 'Deferred Revenue', f.CoA.ID);
                AssertEqual(creditedTo(lines, ar), 0, 'none of it touches the receivable');
                AssertEqual(creditedTo(lines, deferred), 120, 'all of it is a deposit');

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

                // The shape, not just the totals: one cash debit, one AR credit, and no deposit line
                // anywhere. This is the fence — every order that exists today is this order.
                AssertEqual(creditedTo(lines, ar), 300, 'the whole payment credits AR');
                AssertEqual(creditedTo(lines, deferred), 0, 'and nothing is deferred');
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
