/**
 * contract-reversal.checks.ts — the `contract-reversal` bundle (RV1–RV3).
 *
 * REVERSING A SCHEDULED ORDER IS NOT MIRRORING ITS BOOKING ENTRY (D92 §6). A company billed by
 * instalment never posted one — its value reaches the ledger an instalment at a time — so a
 * reversal that mirrored booking would give nothing back. Three rules replace it, and the order
 * they apply in is the design:
 *
 *   withdraw  the instalments nobody has been billed for; no entry, nothing moved
 *   credit    what WAS billed and not yet earned, as `Dr Deferred / Cr AR`
 *   refuse    what was earned and not yet billed, rather than stranding it in Unbilled Receivable
 *
 * WHAT IT PROVES
 *   RV1  a reversal credits back exactly the billed-and-unearned balance, withdraws the unissued
 *        instalments, and leaves the issued one and its invoice alone
 *   RV2  a reversal on an order with NO schedule books what it always did — the regression fence
 *   RV3  a line that earned more than it billed refuses the reversal and says which line and how much
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

/**
 * A confirmed order for one line, with the instalments asked for.
 *
 * The first instalment is deliberately due ON the order date in every scheduled fixture here, so
 * confirm issues it (D92) and the order starts life with something billed — which is the only way
 * to have a billed-and-unearned balance for a reversal to credit back.
 */
async function confirmedOrder(
    ctx: IntegrationCheckContext,
    productID: string,
    gross: number,
    instalments: { InstallmentNumber: number; DueDate: string; Amount: number }[],
    /** A deferred driver earns across a window and refuses to book without one. */
    servicePeriod?: { Start: string; End: string },
) {
    const f = Fx();
    const draft = await BuildOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        BillToOrganizationID: f.Customers.OrganizationID,
        OrderDate: new Date(`${ORDER_DATE}T00:00:00Z`),
        Lines: [
            {
                ProductID: productID,
                Quantity: 1,
                UnitPrice: gross,
                ServicePeriodStart: servicePeriod?.Start,
                ServicePeriodEnd: servicePeriod?.End,
            },
        ],
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
    const saved = await order.Save();
    return { orderID, order, saved, message: order.LatestResult?.CompleteMessage ?? '' };
}

/** The reversing order, confirmed. Returns the attempt so a check can assert a refusal. */
async function reverse(
    ctx: IntegrationCheckContext,
    originLineID: string,
    productID: string,
    servicePeriod?: { Start: string; End: string },
) {
    const f = Fx();
    return ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        OrderType: 'Return',
        BillToOrganizationID: f.Customers.OrganizationID,
        OrderDate: new Date(`${ORDER_DATE}T00:00:00Z`),
        Lines: [
            {
                ProductID: productID,
                Quantity: -1,
                ReversesOrderLineID: originLineID,
                // The window does not prorate: unwinding a year's subscription unwinds the year.
                ServicePeriodStart: servicePeriod?.Start,
                ServicePeriodEnd: servicePeriod?.End,
            },
        ],
    });
}

/** The coverage window RV1's deferred line sells. */
const YEAR = { Start: '2026-07-01', End: '2027-06-30' };

export const ContractReversalChecks: NamedCheck[] = [
    {
        Id: 'contract-reversal.RV1',
        Name: 'RV1: a reversal credits back the billed-and-unearned balance and withdraws the unissued instalments',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // A DEFERRED line, so recognition is staged forward and nothing is earned yet at
                // confirm. Instalment 1 falls on the order date and is therefore issued by confirm:
                // 100 billed, 0 recognised, which is a Deferred balance of 100 to credit back.
                const { orderID, saved, message } = await confirmedOrder(
                    ctx,
                    f.Products.DeferredA,
                    300,
                    [
                        { InstallmentNumber: 1, DueDate: ORDER_DATE, Amount: 100 },
                        { InstallmentNumber: 2, DueDate: '2027-07-01', Amount: 200 },
                    ],
                    YEAR,
                );
                Assert(saved, `confirm: ${message}`);

                const rows = await schedule(ctx, orderID);
                AssertEqual(rows[0].Status, 'Invoiced', 'confirm issued the instalment due on the order date');
                const totals = await lineTotals(ctx, orderID);
                AssertEqual(Number(totals[0].BilledToDate), 100, 'and billed the line for it');
                AssertEqual(Number(totals[0].RecognizedToDate), 0, 'while a deferred line has earned nothing yet');

                const back = await reverse(ctx, totals[0].ID, f.Products.DeferredA, YEAR);
                Assert(back.Saved, `the reversal must confirm: ${back.Message}`);

                // The memo: Dr Deferred / Cr AR for the 100, and nothing else on the value entry.
                const ar = await accountCodeForRole(ctx, 'Accounts Receivable', f.CoA.ID);
                const memo = (await entryLines(ctx, back.Order.ID as string)).filter(
                    (l) => l.Description.includes('credit memo'),
                );
                AssertEqual(memo.length, 2, 'the credit memo is exactly two lines');

                // The debit is matched by the account's ROLE rather than a code this check guessed:
                // a deferred product resolves its own Deferred account through the product walk, so
                // the company-level link is the wrong thing to compare against.
                const debits = memo.filter((l) => Number(l.Debit ?? 0) > 0);
                AssertEqual(debits.length, 1, 'one debit leg');
                Assert(
                    /deferred/i.test(debits[0].Name),
                    `and it debits a Deferred Revenue account, got ${debits[0].Code} ${debits[0].Name}`,
                );
                AssertEqual(Number(debits[0].Debit), 100, 'for exactly what was billed and not earned');

                const credits = memo.filter((l) => Number(l.Credit ?? 0) > 0);
                AssertEqual(credits.length, 1, 'one credit leg');
                AssertEqual(credits[0].Code, ar, 'crediting the receivable');
                AssertEqual(Number(credits[0].Credit), 100, 'by the same amount, so the memo balances');
                Assert(
                    memo[0].Description.includes('reversing order'),
                    `the entry says what it unwinds, got: ${memo[0].Description}`,
                );

                // The schedule: the unissued instalment is withdrawn, the issued one is untouched.
                const after = await schedule(ctx, orderID);
                AssertEqual(after[0].Status, 'Invoiced', 'the instalment the customer holds an invoice for stands');
                Assert(after[0].DocumentNumber != null, 'with its number still frozen');
                AssertEqual(after[1].Status, 'Canceled', 'and the one nobody was billed for is withdrawn');
            }),
    },
    {
        Id: 'contract-reversal.RV2',
        Name: 'RV2: a reversal on an order with no schedule books exactly what it always did',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { orderID, saved, message } = await confirmedOrder(ctx, f.Products.WidgetA, 300, []);
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
                const { orderID, saved, message } = await confirmedOrder(ctx, f.Products.WidgetA, 300, [
                    { InstallmentNumber: 1, DueDate: ORDER_DATE, Amount: 100 },
                    { InstallmentNumber: 2, DueDate: '2027-07-01', Amount: 200 },
                ]);
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
