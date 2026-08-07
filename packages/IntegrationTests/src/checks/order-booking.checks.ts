/**
 * order-booking.checks.ts — the `order-booking` bundle (OB1–OB12).
 *
 * The core promise of this app: confirming an order writes correct, balanced double-entry into
 * accounting's ledger, atomically. Graduated from `test-harnesses/booking-live.mjs` tests 1–2.
 *
 * WHAT IT PROVES
 *   OB1  a confirmed order books ONE journal entry PER LINE (D10)
 *   OB2  each entry is single-company, resolved through product → category → company (D5/D12)
 *   OB3  the D25 origin pair points at the ORDER LINE that caused the entry
 *   OB4  every entry balances
 *   OB5  a deferred product credits Deferred Revenue, not Sales (D11/D14)
 *   OB6  a discount with no linked contra account NETS INTO the sales credit (D11 fallback)
 *   OB7  an unresolvable GL account REJECTS the confirm (all-or-none, D12)
 *   OB8  …and leaves no journal entries behind
 *   OB9  …and leaves the order unconfirmed
 *   OB10 the booking debits reconcile against the order's own totals
 *   OB11 a confirm with NO CUSTOMER is refused, and books nothing
 *   OB12 a confirm with NO LINES is refused
 *
 * Deterministic (no model calls). Every check runs inside a rolled-back transaction.
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
    CreateProductPrice,
    Fx,
    InRolledBackTransaction,
    NormID,
    ORDERS_SCHEMA,
    SameID,
    TeardownOrdersFixture,
    TxOne,
    TxQuery,
} from '../fixture.js';
import { ConfirmOrder } from '../order-builder.js';

/** The three-line multi-company order OB1–OB6 all read from — built once per check, inside its tx. */
async function confirmMultiCompanyOrder(ctx: IntegrationCheckContext) {
    const f = Fx();
    const result = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        Lines: [
            { ProductID: f.Products.WidgetA, Quantity: 2, UnitPrice: 100 },
            {
                ProductID: f.Products.EventA,
                Quantity: 1,
                UnitPrice: 1200,
                ServicePeriodStart: '2026-08-01',
                ServicePeriodEnd: '2026-08-31',
            },
            { ProductID: f.Products.WidgetB, Quantity: 3, UnitPrice: 50, DiscountPct: 0.1 },
        ],
    });
    Assert(result.Saved, `confirm failed: ${result.Message}`);
    return result;
}

interface LineJoinRow {
    OrderLineID: string;
    CompanyID: string;
    JournalEntryID: string | null;
    JECompany: string;
    LinkedRecordID: string;
    EntryType: string;
}

/** Every order line joined to the journal entry it produced. */
async function lineEntries(ctx: IntegrationCheckContext, orderID: string) {
    return TxQuery<LineJoinRow>(
        ctx,
        `SELECT ol.ID AS OrderLineID, p.CompanyID, ol.JournalEntryID,
                je.CompanyID AS JECompany, je.LinkedRecordID, (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) AS EntryType
         FROM ${ORDERS_SCHEMA}.OrderLine ol
         JOIN ${ORDERS_SCHEMA}.Product p ON p.ID = ol.ProductID
         LEFT JOIN ${ACCT_SCHEMA}.vwJournalEntries je ON je.ID = ol.JournalEntryID
         WHERE ol.OrderHeaderID = '${orderID}'`,
    );
}

export const OrderBookingChecks: NamedCheck[] = [
    {
        Id: 'order-booking.OB1',
        Name: 'OB1: a confirmed order books one journal entry per line',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmMultiCompanyOrder(ctx);
                const rows = await lineEntries(ctx, Order.ID as string);
                AssertEqual(rows.length, 3, 'order line count');
                Assert(
                    rows.every((r) => r.JournalEntryID != null),
                    `some lines were never stamped with a journal entry: ${JSON.stringify(rows)}`,
                );
                Assert(
                    rows.every((r) => r.EntryType === 'OrderBooking'),
                    `every line's entry must be an OrderBooking entry: ${JSON.stringify(rows.map((r) => r.EntryType))}`,
                );
            }),
    },
    {
        Id: 'order-booking.OB2',
        Name: "OB2: each entry's company comes from its own line, not the order header",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { Order } = await confirmMultiCompanyOrder(ctx);
                const rows = await lineEntries(ctx, Order.ID as string);

                Assert(
                    rows.every((r) => SameID(r.JECompany, r.CompanyID)),
                    `journal entry company must match its line's product company: ${JSON.stringify(rows)}`,
                );
                // The order header is Co A, but one line's product belongs to Co B — if the header
                // were the source of truth this would be 1, and the multi-company promise a lie.
                const distinct = new Set(rows.map((r) => NormID(r.JECompany)));
                AssertEqual(distinct.size, 2, 'distinct companies across the entries');
                Assert(distinct.has(NormID(f.CoB.ID)), 'the Co B line did not book into Co B');
                Assert(distinct.has(NormID(f.CoA.ID)), 'the Co A lines did not book into Co A');
            }),
    },
    {
        Id: 'order-booking.OB3',
        Name: 'OB3: the polymorphic origin pair points at the order line that caused the entry',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmMultiCompanyOrder(ctx);
                const rows = await lineEntries(ctx, Order.ID as string);
                Assert(
                    rows.every((r) => SameID(r.LinkedRecordID, r.OrderLineID)),
                    `LinkedRecordID must be the OrderLineID: ${JSON.stringify(rows)}`,
                );

                const entityName = await TxOne<{ Name: string }>(
                    ctx,
                    `SELECT TOP 1 e.Name FROM ${ACCT_SCHEMA}.vwJournalEntries je
                     JOIN __mj.Entity e ON e.ID = je.LinkedEntityID
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.JournalEntryID = je.ID
                     WHERE ol.OrderHeaderID = '${Order.ID}'`,
                );
                AssertEqual(entityName.Name, ORDER_LINE_ENTITY, 'LinkedEntityID resolves to');
            }),
    },
    {
        Id: 'order-booking.OB4',
        Name: 'OB4: every journal entry balances',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirmMultiCompanyOrder(ctx);
                const balances = await TxQuery<{ JournalEntryID: string; D: number; C: number }>(
                    ctx,
                    `SELECT jel.JournalEntryID,
                            SUM(jel.DebitAmount) AS D, SUM(jel.CreditAmount) AS C
                     FROM ${ACCT_SCHEMA}.JournalEntryLine jel
                     -- QUALIFIED deliberately. OrderLine does have JournalEntryID so this one was
                     -- correct, but an unqualified name in a subquery silently binds to the OUTER
                     -- query when the inner table lacks the column, and the IN then matches
                     -- everything. That exact mistake made composition's CX8 sum the whole database.
                     WHERE jel.JournalEntryID IN (
                         SELECT ol.JournalEntryID FROM ${ORDERS_SCHEMA}.OrderLine ol
                         WHERE ol.OrderHeaderID = '${Order.ID}' AND ol.JournalEntryID IS NOT NULL)
                     GROUP BY jel.JournalEntryID`,
                );
                AssertEqual(balances.length, 3, 'entries with lines');
                Assert(
                    balances.every((b) => Number(b.D) === Number(b.C)),
                    `unbalanced entry: ${JSON.stringify(balances)}`,
                );
                Assert(
                    balances.every((b) => Number(b.D) > 0),
                    `an entry with zero debits is not a real entry: ${JSON.stringify(balances)}`,
                );
            }),
    },
    {
        Id: 'order-booking.OB10',
        Name: 'OB10: the booking debits reconcile against the ORDER\'s own totals',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // WHY THIS IS NOT OB4. OB4 proves each entry balances INTERNALLY — debits equal
                // credits. An entry can balance perfectly and be for the wrong AMOUNT: book 90
                // against a 100 line and Dr 90 / Cr 90 is still a balanced entry, still posted,
                // still plausible. Nothing in OB1-OB9 would notice, because every one of them asks
                // about the entry's shape rather than its size.
                //
                // The receivable is the anchor. What the order says the customer owes must equal
                // what the ledger says we are owed, or the two records of the same fact disagree —
                // which is the one thing a general ledger exists to prevent.
                const f = Fx();
                await CreateProductPrice(ctx, f.Products.WidgetA, 100);
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    BillToOrganizationID: f.Customers.OrganizationID,
                    ShipToAddressID: f.Tax.AddressIDs.get('SantaClara'),
                    Lines: [
                        { ProductID: f.Products.WidgetA, Quantity: 3, UnitPrice: 100 },
                        { ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 50, DiscountPct: 0.2 },
                    ],
                });
                Assert(result.Saved, `confirm failed: ${result.Message}`);

                const header = await TxOne<{ TotalGross: number }>(
                    ctx,
                    `SELECT TotalGross FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${result.Order.ID}'`,
                );

                // AR is debited for net + tax + charges on every line, so the receivable across the
                // order's booking entries IS the order's gross. Deliberately an order carrying a
                // discount AND tax: on a plain undiscounted line the wrong number and the right one
                // coincide, which is exactly why a defect here survives ordinary fixtures.
                const ar = await TxOne<{ Net: number }>(
                    ctx,
                    `SELECT ISNULL(SUM(jel.DebitAmount),0) - ISNULL(SUM(jel.CreditAmount),0) AS Net
                       FROM ${ACCT_SCHEMA}.JournalEntryLine jel
                       JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                      WHERE gl.Code = '11201'
                        AND jel.JournalEntryID IN (
                            SELECT ol.JournalEntryID FROM ${ORDERS_SCHEMA}.OrderLine ol
                             WHERE ol.OrderHeaderID = '${result.Order.ID}' AND ol.JournalEntryID IS NOT NULL)`,
                );

                AssertEqual(
                    Math.round(Number(ar.Net) * 100) / 100,
                    Math.round(Number(header.TotalGross) * 100) / 100,
                    'the receivable the ledger raised must equal what the order says is owed',
                );
                Assert(Number(header.TotalGross) > 0, 'and the order is actually worth something');
            }),
    },
    {
        Id: 'order-booking.OB5',
        Name: 'OB5: a deferred product credits Deferred Revenue instead of Sales',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { Order } = await confirmMultiCompanyOrder(ctx);
                const credits = await TxQuery<{ Code: string; CreditAmount: number }>(
                    ctx,
                    `SELECT gl.Code, jel.CreditAmount
                     FROM ${ORDERS_SCHEMA}.OrderLine ol
                     JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = ol.JournalEntryID
                     JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                     WHERE ol.OrderHeaderID = '${Order.ID}'
                       AND ol.ProductID = '${f.Products.EventA}'
                       AND jel.CreditAmount > 0`,
                );
                AssertEqual(credits.length, 1, 'credit lines on the deferred entry');
                AssertEqual(credits[0].Code, '21301', 'the deferred line credits account');
                AssertEqual(Number(credits[0].CreditAmount), 1200, 'deferred credit amount');
            }),
    },
    {
        Id: 'order-booking.OB6',
        Name: 'OB6: a discount with no contra account nets into the sales credit',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { Order } = await confirmMultiCompanyOrder(ctx);
                // 3 × $50 less 10% = $135. With no 'Sales Discounts' link on Co B, the $15 must
                // disappear INTO the sales credit rather than becoming its own contra line.
                const lines = await TxQuery<{ Code: string; DebitAmount: number; CreditAmount: number }>(
                    ctx,
                    `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
                     FROM ${ORDERS_SCHEMA}.OrderLine ol
                     JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = ol.JournalEntryID
                     JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                     WHERE ol.OrderHeaderID = '${Order.ID}' AND ol.ProductID = '${f.Products.WidgetB}'`,
                );
                AssertEqual(lines.length, 2, `discounted entry line count: ${JSON.stringify(lines)}`);

                const sales = lines.find((l) => l.Code === '40100');
                const ar = lines.find((l) => l.Code === '11201');
                Assert(sales != null, `no sales credit found: ${JSON.stringify(lines)}`);
                Assert(ar != null, `no AR debit found: ${JSON.stringify(lines)}`);
                AssertEqual(Number(sales!.CreditAmount), 135, 'sales credit is NET of the discount');
                AssertEqual(Number(ar!.DebitAmount), 135, 'AR debit');
            }),
    },
    {
        Id: 'order-booking.OB7',
        Name: 'OB7: an unresolvable GL account rejects the confirm',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // Co C has GL accounts but NO GLAccountLink rows, so the Sales role cannot resolve.
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    Lines: [
                        { ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 100 },
                        { ProductID: f.Products.WidgetC, Quantity: 1, UnitPrice: 100 },
                    ],
                });
                Assert(!result.Saved, 'confirm must be REJECTED when a line has no resolvable account');
                // Assert the REASON, not just the rejection. Any broken save also returns false —
                // including a run where the entity subclasses were never registered and no booking
                // logic ran at all — so a bare `!Saved` is a check that can pass while proving
                // nothing. The message must name the account resolution that actually failed.
                Assert(
                    /no gl account is linked for role/i.test(result.Message),
                    `the rejection should name the unresolvable GL role, got: ${result.Message}`,
                );
            }),
    },
    {
        Id: 'order-booking.OB8',
        Name: 'OB8: a rejected confirm leaves no journal entries behind',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const companies = [f.CoA.ID, f.CoB.ID, f.CoC.ID].map((c) => `'${c}'`).join(',');
                const before = await TxOne<{ N: number }>(
                    ctx,
                    `SELECT COUNT(*) AS N FROM ${ACCT_SCHEMA}.vwJournalEntries WHERE CompanyID IN (${companies})`,
                );

                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    Lines: [
                        // The GOOD line comes first, so it is booked before the bad one fails —
                        // if the rollback were partial, this is the entry that would survive.
                        { ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 100 },
                        { ProductID: f.Products.WidgetC, Quantity: 1, UnitPrice: 100 },
                    ],
                });
                Assert(!result.Saved, 'precondition: the confirm must have been rejected');
                Assert(
                    /no gl account is linked for role/i.test(result.Message),
                    `precondition: rejected for the RIGHT reason, got: ${result.Message}`,
                );

                const after = await TxOne<{ N: number }>(
                    ctx,
                    `SELECT COUNT(*) AS N FROM ${ACCT_SCHEMA}.vwJournalEntries WHERE CompanyID IN (${companies})`,
                );
                AssertEqual(Number(after.N), Number(before.N), 'journal entry count after a rejected confirm');
            }),
    },
    {
        Id: 'order-booking.OB9',
        Name: 'OB9: a rejected confirm leaves the order unconfirmed',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    Lines: [{ ProductID: f.Products.WidgetC, Quantity: 1, UnitPrice: 100 }],
                });
                Assert(!result.Saved, 'precondition: the confirm must have been rejected');
                Assert(
                    /no gl account is linked for role/i.test(result.Message),
                    `precondition: rejected for the RIGHT reason, got: ${result.Message}`,
                );

                const persisted = await TxQuery<{ Status: string }>(
                    ctx,
                    `SELECT Status FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${result.Order.ID}'`,
                );
                Assert(
                    persisted.length === 0 || persisted[0].Status !== 'Confirmed',
                    `a rejected order must not persist as Confirmed: ${JSON.stringify(persisted)}`,
                );
            }),
    },
    {
        Id: 'order-booking.OB11',
        Name: 'OB11: a confirm with NO CUSTOMER is refused, and books nothing',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // A confirmed order IS the receivable here — there is no separate invoice — so one
                // with neither a bill-to person nor a bill-to organization is a receivable owed by
                // nobody: it debits A/R, sits in the balance, and can never be aged or collected,
                // because every collections surface groups by the payer key that is null on it.
                //
                // This was reachable. Before the rule existed, this exact order confirmed and posted
                // Dr 11201 A/R 99 / Cr 40100 Sales 99. The order screen did block it, but a screen
                // is not a rule — the entity is.
                //
                // `null` on both payer fields is the deliberate opt-out from the fixture's default
                // buyer (see BuildOrder); every other check gets a customer precisely because a real
                // order always has one.
                const f = Fx();
                const before = await TxOne<{ N: number }>(
                    ctx,
                    `SELECT COUNT(*) AS N FROM ${ACCT_SCHEMA}.JournalEntry`,
                );

                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    BillToOrganizationID: null,
                    BillToPersonID: null,
                    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 99 }],
                });

                Assert(!result.Saved, 'a confirm with no customer must be refused');
                Assert(
                    /without a customer/i.test(result.Message),
                    `refused for the RIGHT reason, got: ${result.Message}`,
                );

                // Refused is not enough — it must also be all-or-none.
                const after = await TxOne<{ N: number }>(
                    ctx,
                    `SELECT COUNT(*) AS N FROM ${ACCT_SCHEMA}.JournalEntry`,
                );
                AssertEqual(
                    Number(after.N),
                    Number(before.N),
                    'journal entry count after a customer-less confirm',
                );
            }),
    },
    {
        Id: 'order-booking.OB12',
        Name: 'OB12: a confirm with NO LINES is refused',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // The rule this asserts was WRITTEN long before this check and never once ran.
                // `OrderEntityServer.ValidateAsync` was skipped entirely (BaseEntity opts out of
                // async validation by default), and even once enabled it asked
                // `willBookOnThisSave()`, which `Save()` had already falsified by stamping
                // `ConfirmedAt` three lines earlier. Two defects, each masking the other.
                //
                // So this check exists as much for the plumbing as for the rule: if either defect
                // returns, an order with nothing on it confirms again, and this is what says so.
                const f = Fx();
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [],
                });

                Assert(!result.Saved, 'a confirm with no lines must be refused');
                Assert(
                    /no lines/i.test(result.Message),
                    `refused for the RIGHT reason, got: ${result.Message}`,
                );

                const persisted = await TxQuery<{ Status: string }>(
                    ctx,
                    `SELECT Status FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${result.Order.ID}'`,
                );
                Assert(
                    persisted.length === 0 || persisted[0].Status !== 'Confirmed',
                    `an empty order must not persist as Confirmed: ${JSON.stringify(persisted)}`,
                );
            }),
    },
];

for (const check of OrderBookingChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('order-booking', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});
import {
  ORDER_LINE_ENTITY,
} from "../entity-names.js";
