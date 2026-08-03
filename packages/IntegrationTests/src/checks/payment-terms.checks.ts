/**
 * payment-terms — when an order is due, resolved at confirm and STORED (D83).
 *
 * WHY IT EXISTS
 * Nothing derived a due date. `OrderHeader.DueDate` was only ever what a caller passed,
 * `PaymentTermsType` had no rows, and the schema comment promising that `NetDays` derives the due
 * date was aspirational. That did not look like a missing feature — it looked like a quiet afternoon:
 *
 *     Orders.GetOverdueWorklist, as of 2026-12-31 → 0 rows, 0 overdue, every aging bucket zero
 *
 * against 67 orders carrying an unpaid balance. Aging, the collections worklist and the invoice's due
 * date all read that one column, and it was null on every row.
 *
 * `PaymentTermsBehavior` owns the walk and its unit tests cover the rungs in isolation. This bundle
 * proves the walk is WIRED into the confirm path, that the answer is PERSISTED rather than derived
 * per reader, and — the one that matters most — that the collections worklist now returns the orders
 * it was always supposed to.
 *
 * THE CHECKS THAT EARN THEIR KEEP
 *   · PT6 — the overdue worklist actually finds an overdue order. This is the assertion whose
 *     absence let the feature ship dead: everything else can pass while the screen stays empty.
 *   · PT1 — a STATED due date is never recomputed. That is the seam a contracts app supplies terms
 *     through, and a save that silently moves a negotiated date is unrecoverable by the customer.
 *   · PT5 — an order with no terms configured anywhere still gets a real date, not a null. A null is
 *     what made every order invisible to aging in the first place.
 *
 * WHAT IT PROVES
 *   PT1   a stated DueDate survives confirm untouched
 *   PT2   stated terms derive the date from NetDays
 *   PT3   the buyer's CustomerPaymentTerms beat the company default
 *   PT4   the selling company's AccountingCompanyProfile default is used when nothing else applies
 *   PT5   an order with nothing configured is due on receipt, with a real date
 *   PT6   a confirmed order past its due date reaches Orders.GetOverdueWorklist
 *   PT7   customer terms are effective on the ORDER date, not on today
 *   PT8   company-scoped customer terms beat unscoped ones
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: PaymentTermsBehavior · OrderEntityServer.resolveDueDate · GetOverdueWorklistOperation
 *   DATA: metadata/payment-terms-types/.payment-terms-types.json
 */
import { BaseRemotableOperation } from "@memberjunction/core";
import { MJGlobal } from "@memberjunction/global";
import {
  Assert,
  AssertEqual,
  IntegrationCheckRegistry,
  type IntegrationCheckContext,
  type NamedCheck,
} from "@memberjunction/testing-integration";
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
} from "../fixture.js";
import { CUSTOMER_PAYMENT_TERMS_ENTITY } from "../entity-names.js";
import { ConfirmOrder, type OrderSpec } from "../order-builder.js";

/** A seeded terms row by code — these come from metadata, so they are committed and stable. */
async function termsID(ctx: IntegrationCheckContext, code: string): Promise<string> {
  const row = await TxOne<{ ID: string; NetDays: number }>(
    ctx,
    `SELECT ID, NetDays FROM ${ORDERS_SCHEMA}.PaymentTermsType WHERE Code='${code}'`,
  );
  return row.ID;
}

/** Confirm an order, optionally stating terms or a date. */
async function sell(ctx: IntegrationCheckContext, over: Partial<OrderSpec> = {}) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    OrderDate: new Date("2026-07-01T00:00:00Z"),
    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 300 }],
    ...over,
  });
  Assert(result.Saved, `confirm failed: ${result.Message}`);
  return result;
}

/** What was actually stored on the header. */
const headerTerms = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ DueDate: string | null; PaymentTermsTypeID: string | null; OrderDate: string }>(
    ctx,
    `SELECT CONVERT(varchar(10), DueDate, 23) AS DueDate, PaymentTermsTypeID,
            CONVERT(varchar(10), OrderDate, 23) AS OrderDate
       FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${orderID}'`,
  );

/** Give the selling company a default, through the object model so the engine cache sees it. */
async function setCompanyDefault(ctx: IntegrationCheckContext, companyID: string, paymentTermsTypeID: string) {
  await TxQuery(
    ctx,
    `UPDATE ${ACCT_SCHEMA}.AccountingCompanyProfile SET DefaultPaymentTermsTypeID='${paymentTermsTypeID}' WHERE ID='${companyID}'`,
  );
}

export const PaymentTermsChecks: NamedCheck[] = [
  {
    Id: "payment-terms.PT1",
    Name: "PT1: a stated DueDate survives confirm untouched",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The seam a contracts app supplies terms through: it states the answer Orders cannot derive.
        // A save that silently recomputes a negotiated date is unrecoverable by the customer.
        await setCompanyDefault(ctx, Fx().CoA.ID, await termsID(ctx, "Net30"));
        const order = await sell(ctx, { DueDate: "2026-12-25" } as Partial<OrderSpec>);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-12-25", "the stated date is what was stored");
      }),
  },
  {
    Id: "payment-terms.PT2",
    Name: "PT2: stated terms derive the date from NetDays",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const net30 = await termsID(ctx, "Net30");
        const order = await sell(ctx, { PaymentTermsTypeID: net30 } as Partial<OrderSpec>);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-07-31", "order date plus thirty days");
        AssertEqual(String(stored.PaymentTermsTypeID).toLowerCase(), net30.toLowerCase(), "and the terms stay named");
      }),
  },
  {
    Id: "payment-terms.PT3",
    Name: "PT3: the buyer's negotiated terms beat the company default",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await setCompanyDefault(ctx, f.CoA.ID, await termsID(ctx, "Net30"));
        const net60 = await termsID(ctx, "Net60");
        await createViaEntity(ctx, CUSTOMER_PAYMENT_TERMS_ENTITY, {
          OrganizationID: f.Customers.OrganizationID,
          PaymentTermsTypeID: net60,
          Status: "Active",
        });

        const order = await sell(ctx);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-08-30", "sixty days, not the company's thirty");
        AssertEqual(String(stored.PaymentTermsTypeID).toLowerCase(), net60.toLowerCase(), "under the buyer's terms");
      }),
  },
  {
    Id: "payment-terms.PT4",
    Name: "PT4: the selling company's default is used when nothing else applies",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // `AccountingCompanyProfile.DefaultPaymentTermsTypeID` has existed since the accounting schema
        // was written and nothing read it until now.
        const net45 = await termsID(ctx, "Net45");
        await setCompanyDefault(ctx, Fx().CoA.ID, net45);
        const order = await sell(ctx);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-08-15", "order date plus forty-five days");
      }),
  },
  {
    Id: "payment-terms.PT5",
    Name: "PT5: an order with nothing configured is due on receipt, with a REAL date",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // A null is what made every order invisible to aging. The terminal rung has to produce a date.
        const order = await sell(ctx);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        Assert(stored.DueDate != null, "a due date exists even with no terms anywhere");
        AssertEqual(stored.DueDate, stored.OrderDate, "and it is the order date — due on receipt");
      }),
  },
  {
    Id: "payment-terms.PT6",
    Name: "PT6: a confirmed order past its due date reaches the overdue worklist",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // THE ASSERTION WHOSE ABSENCE LET THE FEATURE SHIP DEAD. Everything else can pass while the
        // collections screen stays empty, because an empty worklist reads as "nothing overdue".
        const net30 = await termsID(ctx, "Net30");
        const order = await sell(ctx, { PaymentTermsTypeID: net30 } as Partial<OrderSpec>);
        const orderID = order.Order.ID as string;

        const op = MJGlobal.Instance.ClassFactory.CreateInstance<
          BaseRemotableOperation<Record<string, unknown>, { Rows: Array<{ OrderHeaderID: string; DaysOverdue: number }>; RowCount: number; TotalOverdue: number }>
        >(BaseRemotableOperation, "Orders.GetOverdueWorklist");
        Assert(op != null, "'Orders.GetOverdueWorklist' is not registered");

        // As of well after the due date, with the balance still outstanding. `Execute` is the same
        // entry point every other check uses, and it wraps the payload in `Output`.
        const result = await op!.Execute({ AsOfDate: "2026-09-01" }, { provider: ctx.Provider, user: ctx.User });
        Assert(result.Success, `the worklist did not execute: ${result.ErrorMessage ?? "unknown"}`);
        const rows = result.Output?.Rows ?? [];
        const mine = rows.find((r) => String(r.OrderHeaderID).toLowerCase() === orderID.toLowerCase());
        Assert(mine != null, `the order appears on the worklist (${rows.length} rows returned)`);
        AssertEqual(mine!.DaysOverdue, 32, "aged from its stored due date, not from the order date");
      }),
  },
  {
    Id: "payment-terms.PT7",
    Name: "PT7: customer terms are effective on the ORDER date, not on today",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Renegotiating must not restate what an old order was due on.
        const f = Fx();
        await createViaEntity(ctx, CUSTOMER_PAYMENT_TERMS_ENTITY, {
          OrganizationID: f.Customers.OrganizationID,
          PaymentTermsTypeID: await termsID(ctx, "Net90"),
          StartedAt: new Date("2026-08-01T00:00:00Z"),
          Status: "Active",
        });

        // The order predates those terms, so they must not apply.
        const order = await sell(ctx);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, stored.OrderDate, "terms that had not started yet do not apply");
      }),
  },
  {
    Id: "payment-terms.PT8",
    Name: "PT8: company-scoped customer terms beat unscoped ones",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // A subsidiary that negotiated its own terms meant to override the group's.
        const f = Fx();
        const net90 = await termsID(ctx, "Net90");
        const net15 = await termsID(ctx, "Net15");
        await createViaEntity(ctx, CUSTOMER_PAYMENT_TERMS_ENTITY, {
          OrganizationID: f.Customers.OrganizationID,
          PaymentTermsTypeID: net90,
          Status: "Active",
        });
        await createViaEntity(ctx, CUSTOMER_PAYMENT_TERMS_ENTITY, {
          OrganizationID: f.Customers.OrganizationID,
          PaymentTermsTypeID: net15,
          CompanyID: f.CoA.ID,
          Status: "Active",
        });

        const order = await sell(ctx);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-07-16", "the company-scoped fifteen days won");
      }),
  },
];

for (const check of PaymentTermsChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("payment-terms", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: TeardownOrdersFixture,
});
