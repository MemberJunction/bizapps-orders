/**
 * charges — shipping, handling and tax as ONE mechanism (D71).
 *
 * Tax being a charge is the design's load-bearing move: multi-layer tax stops being a special case
 * and becomes several charges with later sequence numbers, so ordering, allocation, the override
 * trail and the GL treatment are written once.
 *
 * THE ONES THAT EARN THEIR KEEP
 *   CH3/CH4 — `Basis`. The SAME order taxes to a different number depending on whether shipping is
 *   in the base. That is jurisdiction-dependent, so it has to be configuration; these prove the
 *   field actually changes the answer.
 *
 *   CH6 — every charge reaches the LINES. Tax and GL are per line, and on a multi-company order the
 *   allocation decides whose books carry it.
 *
 *   CH8 — a waived charge keeps what the rules computed. "Shipping was waived" and "shipping was
 *   free" must stay distinguishable, or nobody can audit discretion.
 *
 *   CH10 — the charge reaches the JOURNAL ENTRY and it BALANCES. Tax was in the AR debit with no
 *   credit for as long as booking has existed; it had simply never been non-zero.
 *
 * CONNECTS TO:
 *   CODE: ChargeBehavior · ChargeEngine · OrderJournalEntryFactory.chargeCreditsFor
 *   DOC:  plans/pricing-charges-and-promotions.md §5
 */
import { randomUUID } from "crypto";
import {
  Assert,
  AssertEqual,
  IntegrationCheckRegistry,
  type IntegrationCheckContext,
  type NamedCheck,
} from "@memberjunction/testing-integration";
import {
  CreateProductPrice,
  CreateOrdersFixture,
  createViaEntity,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { PROMOTION_CODE_ENTITY, PROMOTION_ENTITY } from "../entity-names.js";
import { BuildOrder, ConfirmOrder } from "../order-builder.js";
import type { OrderEntityServer, RequestedCharge } from "@mj-biz-apps/orders-core-entities-server";

const ACCOUNTING = "__mj_BizAppsAccounting";

async function addPrice(ctx: IntegrationCheckContext, productID: string, amount: number): Promise<void> {
  // Delegates to the shared builder so the price goes through `ProductPriceEntityServer` and its
  // ambiguity guard, rather than around it. Idempotent per product — see CreateProductPrice.
  await CreateProductPrice(ctx, productID, amount);
}

async function confirmWithCharges(
  ctx: IntegrationCheckContext,
  lines: Array<{ ProductID: string; Quantity: number }>,
  charges: RequestedCharge[],
): Promise<{ Saved: boolean; Message: string; Order: OrderEntityServer }> {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: lines,
    Charges: charges,
  });
  return { Saved: result.Saved, Message: result.Message, Order: result.Order };
}

/** A charge type's ID by code — staging a row needs the ID, not the code. */
async function chargeTypeIdFor(ctx: IntegrationCheckContext, code: string): Promise<string> {
  const row = await TxOne<{ ID: string }>(
    ctx,
    `SELECT ID FROM ${ORDERS_SCHEMA}.ChargeType WHERE Code='${code}'`,
  );
  Assert(!!row?.ID, `the fixture must have a '${code}' charge type`);
  return row.ID;
}

const lineSums = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ Net: number; Tax: number; Charge: number; Gross: number }>(
    ctx,
    `SELECT ISNULL(SUM(LineTotalNet),0) AS Net, ISNULL(SUM(LineTax),0) AS Tax,
            ISNULL(SUM(ChargeAmount),0) AS Charge, ISNULL(SUM(LineTotalGross),0) AS Gross
       FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}'`,
  );

export const ChargeChecks: NamedCheck[] = [
  {
    Id: "charges.CH1",
    Name: "CH1: a flat shipping charge is added and reaches the order total",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);

        const order = await confirmWithCharges(
          ctx,
          [{ ProductID: f.Products.WidgetA, Quantity: 5 }],
          [{ Code: "Shipping", Amount: 25 }],
        );
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const sums = await lineSums(ctx, order.Order.ID as string);
        AssertEqual(Number(sums.Net), 500, "the goods");
        AssertEqual(Number(sums.Charge), 25, "shipping landed on the line");
        AssertEqual(Number(sums.Gross), 525, "and reached the gross");
      }),
  },
  {
    Id: "charges.CH2",
    Name: "CH2: a rate-based charge computes on its basis",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);

        const order = await confirmWithCharges(
          ctx,
          [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          [{ Code: "SalesTax", Rate: 0.086 }],
        );
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const sums = await lineSums(ctx, order.Order.ID as string);
        AssertEqual(Number(sums.Tax), 86, "8.6% of 1000, on LineTax not ChargeAmount");
        AssertEqual(Number(sums.Charge), 0, "tax does not land in the non-tax bucket");
      }),
  },
  {
    Id: "charges.CH3",
    Name: "CH3: LineNet basis taxes the goods only",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        // Force the tax type onto the goods-only basis for this check.
        await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.ChargeType SET Basis='LineNet' WHERE Code='SalesTax'`);

        const order = await confirmWithCharges(
          ctx,
          [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          [{ Code: "Shipping", Amount: 100 }, { Code: "SalesTax", Rate: 0.1 }],
        );
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        AssertEqual(Number((await lineSums(ctx, order.Order.ID as string)).Tax), 100, "10% of the 1000 goods");
      }),
  },
  {
    Id: "charges.CH4",
    Name: "CH4: LineNetPlusCharges basis taxes the shipping too — a DIFFERENT answer",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        // The seeded default. Whether shipping is taxable is jurisdiction-dependent, which is
        // exactly why it is configuration rather than code.
        await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.ChargeType SET Basis='LineNetPlusCharges' WHERE Code='SalesTax'`);

        const order = await confirmWithCharges(
          ctx,
          [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          [{ Code: "Shipping", Amount: 100 }, { Code: "SalesTax", Rate: 0.1 }],
        );
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        // 110, not the 100 CH3 produced from identical inputs.
        AssertEqual(Number((await lineSums(ctx, order.Order.ID as string)).Tax), 110, "10% of goods AND shipping");
      }),
  },
  {
    Id: "charges.CH5",
    Name: "CH5: charges apply in Sequence order, not the order they were requested",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);

        // Tax requested FIRST, but its sequence is 100 and shipping's is 10.
        const order = await confirmWithCharges(
          ctx,
          [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          [{ Code: "SalesTax", Rate: 0.1 }, { Code: "Shipping", Amount: 100 }],
        );
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        // If tax had run first it would have taxed 1000 and produced 100.
        AssertEqual(Number((await lineSums(ctx, order.Order.ID as string)).Tax), 110, "shipping applied before tax");
      }),
  },
  {
    Id: "charges.CH6",
    Name: "CH6: a charge is allocated across lines in proportion, to the penny",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 300);
        await addPrice(ctx, f.Products.WidgetB, 100);

        const order = await confirmWithCharges(
          ctx,
          [
            { ProductID: f.Products.WidgetA, Quantity: 1 },
            { ProductID: f.Products.WidgetB, Quantity: 1 },
          ],
          [{ Code: "Shipping", Amount: 100 }],
        );
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const rows = await TxOne<{ A: number; B: number; Allocations: number }>(
          ctx,
          `SELECT
             (SELECT ChargeAmount FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}' AND ProductID='${f.Products.WidgetA}') AS A,
             (SELECT ChargeAmount FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}' AND ProductID='${f.Products.WidgetB}') AS B,
             (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderChargeAllocation al
                JOIN ${ORDERS_SCHEMA}.OrderCharge c ON c.ID = al.OrderChargeID
               WHERE c.OrderHeaderID='${order.Order.ID}') AS Allocations`,
        );
        AssertEqual(Number(rows.A), 75, "300/400 of the shipping");
        AssertEqual(Number(rows.B), 25, "100/400 of it");
        AssertEqual(Number(rows.A) + Number(rows.B), 100, "the allocation sums to the charge exactly");
        AssertEqual(Number(rows.Allocations), 2, "one allocation row per line");
      }),
  },
  {
    Id: "charges.CH7",
    Name: "CH7: charges compute on the DISCOUNTED base, not list price",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);

        const tid = await TxOne<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.PromotionType WHERE Code='PercentOff'`);
        const code = `CH7${randomUUID().slice(0, 5).toUpperCase()}`;
        const promoID = await createViaEntity(ctx, PROMOTION_ENTITY, {
          Code: code,
          Name: code,
          PromotionTypeID: tid.ID,
          Value: 0.2,
          AppliesAt: "Either",
          Status: "Active",
        });
        await createViaEntity(ctx, PROMOTION_CODE_ENTITY, {
          PromotionID: promoID,
          Code: code,
          Status: "Active",
        });

        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          PromotionCodes: [code],
          Charges: [{ Code: "SalesTax", Rate: 0.1 }],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        const sums = await lineSums(ctx, result.Order.ID as string);
        AssertEqual(Number(sums.Net), 800, "1000 less the 20% promotion");
        // Tax on the discounted 800, NOT on the 1000 list — the customer is taxed on what they owe.
        AssertEqual(Number(sums.Tax), 80, "tax computed on the discounted base");
      }),
  },
  {
    Id: "charges.CH8",
    Name: "CH8: a waived charge records what the rules computed",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);

        const order = await confirmWithCharges(
          ctx,
          [{ ProductID: f.Products.WidgetA, Quantity: 5 }],
          [{ Code: "Shipping", Amount: 40, OverrideAmount: 0, OverrideReason: "waived — late delivery" }],
        );
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const row = await TxOne<{ Amount: number; ComputedAmount: number; IsOverridden: boolean; OverrideReason: string }>(
          ctx,
          `SELECT TOP 1 Amount, ComputedAmount, IsOverridden, OverrideReason
             FROM ${ORDERS_SCHEMA}.OrderCharge WHERE OrderHeaderID='${order.Order.ID}'`,
        );
        AssertEqual(Number(row.Amount), 0, "nothing was charged");
        // "Waived" and "free" must stay distinguishable, or discretion cannot be audited.
        AssertEqual(Number(row.ComputedAmount), 40, "but the rules said 40, and that is recorded");
        Assert(row.IsOverridden === true, "the override is flagged");
        Assert(/late delivery/.test(row.OverrideReason), "the reason is kept");
      }),
  },
  {
    Id: "charges.CH9",
    Name: "CH9: an override without a reason is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);

        const order = await confirmWithCharges(
          ctx,
          [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
          [{ Code: "Shipping", Amount: 40, OverrideAmount: 0 }],
        );
        Assert(!order.Saved, "an unexplained override must be refused");
        Assert(/reason/i.test(order.Message), `the refusal should mention the reason, got: ${order.Message}`);
      }),
  },
  {
    Id: "charges.CH10",
    Name: "CH10: charges reach the JOURNAL ENTRY and it balances",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);

        const order = await confirmWithCharges(
          ctx,
          [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          [{ Code: "Shipping", Amount: 100 }, { Code: "SalesTax", Rate: 0.1 }],
        );
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        // Tax sat in the AR debit with NO credit for as long as booking has existed — it had simply
        // never been non-zero. This is the check that would have caught it.
        const je = await TxOne<{ Debit: number; Credit: number; AR: number; Ship: number; Tax: number }>(
          ctx,
          `SELECT SUM(jel.DebitAmount) AS Debit, SUM(jel.CreditAmount) AS Credit,
                  SUM(CASE WHEN gl.Code='11201' THEN jel.DebitAmount ELSE 0 END) AS AR,
                  SUM(CASE WHEN gl.Code='40200' THEN jel.CreditAmount ELSE 0 END) AS Ship,
                  SUM(CASE WHEN gl.Code='21500' THEN jel.CreditAmount ELSE 0 END) AS Tax
             FROM ${ORDERS_SCHEMA}.OrderLine ol
             JOIN ${ACCOUNTING}.JournalEntryLine jel ON jel.JournalEntryID = ol.JournalEntryID
             JOIN ${ACCOUNTING}.GLAccount gl ON gl.ID = jel.GLAccountID
            WHERE ol.OrderHeaderID='${order.Order.ID}'`,
        );
        AssertEqual(Number(je.Debit), Number(je.Credit), "the entry balances with charges on it");
        AssertEqual(Number(je.AR), 1210, "AR carries goods + shipping + tax");
        AssertEqual(Number(je.Ship), 100, "shipping credited its own account");
        AssertEqual(Number(je.Tax), 110, "tax credited its own account");
      }),
  },
  {
    Id: "charges.CH11",
    Name: "CH11: a charge with no GL account is REFUSED, not silently omitted",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        // 'Surcharge' is seeded but deliberately left UNLINKED by the fixture — the same device as
        // company CoC, which exists to prove an unresolvable account refuses. Deleting a link inside
        // this transaction would not work: AccountingEngineBase caches links in-process and is
        // refreshed at fixture setup, so the deletion would be invisible to the resolver.
        //
        // Omitting an unbookable charge would balance the entry by leaving it out, and the customer
        // would be billed for something the ledger never recorded.
        const order = await confirmWithCharges(
          ctx,
          [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
          [{ Code: "Surcharge", Amount: 25 }],
        );
        Assert(!order.Saved, "a charge with nowhere to book must refuse the confirm");
        Assert(
          /no GL account|charge type/i.test(order.Message),
          `the refusal should name the missing link, got: ${order.Message}`,
        );
      }),
  },
  {
    Id: "charges.CH12",
    Name: "CH12: an unknown charge code is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const order = await confirmWithCharges(
          ctx,
          [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
          [{ Code: "NotAChargeType", Amount: 10 }],
        );
        Assert(!order.Saved, "an unknown charge type must be refused");
        Assert(
          /no charge type/i.test(order.Message),
          `the refusal should say so, got: ${order.Message}`,
        );
      }),
  },
  {
    Id: "charges.CH13",
    Name: "CH13: a charge STAGED on the collection reaches the ledger — the browser's route",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // THE ONE THIS BUNDLE WAS MISSING. Every other check hands the engine a `RequestedCharge`
        // through a server-side array, which a browser cannot reach. The browser stages a row on
        // `order.Charges` and saves the graph — and for a while that path existed with nothing on
        // the other end, so a shipping charge added on screen showed in the price preview and was
        // simply absent from the confirmed order.
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);

        const built = await BuildOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
        });

        const shipping = await chargeTypeIdFor(ctx, "Shipping");
        const staged = (await built.Order.Charges.Create()) as unknown as {
          ChargeTypeID: string;
          Amount: number;
        };
        staged.ChargeTypeID = shipping;
        staged.Amount = 12.5;

        built.Order.Status = "Confirmed";
        Assert(
          await built.Order.Save(),
          `the staged charge must confirm: ${built.Order.LatestResult?.CompleteMessage ?? "no reason given"}`,
        );

        // Written as a REAL charge row by the engine, with the basis it computed — not the
        // half-formed row the client staged.
        const row = await TxOne<{ N: number; Amount: number; Basis: number }>(
          ctx,
          `SELECT COUNT(*) AS N, ISNULL(SUM(Amount),0) AS Amount, ISNULL(SUM(BasisAmount),0) AS Basis
             FROM ${ORDERS_SCHEMA}.OrderCharge WHERE OrderHeaderID='${built.Order.ID}'
              AND ChargeTypeID='${shipping}'`,
        );
        AssertEqual(Number(row.N), 1, "exactly one shipping charge — staged once, written once");
        AssertEqual(Number(row.Amount), 12.5, "at the amount asked for");
        Assert(Number(row.Basis) > 0, "and with a basis the ENGINE computed, not the client");

        // And it reached the money, which is the whole point.
        const sums = await lineSums(ctx, built.Order.ID);
        AssertEqual(Number(sums.Charge), 12.5, "the charge is on the lines");
      }),
  },
  {
    Id: "charges.CH14",
    Name: "CH14: a staged charge is written ONCE, not once by the graph and again by the engine",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The failure this guards is double-billing. A staged row is a REQUEST — if the entity graph
        // also saved it as it arrived, the order would carry two shipping charges: the half-formed
        // one the client sent and the complete one the engine wrote. Both would look plausible and
        // the total would simply be wrong.
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);

        const built = await BuildOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
        });
        const shipping = await chargeTypeIdFor(ctx, "Shipping");
        const staged = (await built.Order.Charges.Create()) as unknown as {
          ChargeTypeID: string;
          Amount: number;
        };
        staged.ChargeTypeID = shipping;
        staged.Amount = 7;
        built.Order.Status = "Confirmed";
        Assert(await built.Order.Save(), "it saves");

        const all = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderCharge WHERE OrderHeaderID='${built.Order.ID}'`,
        );
        AssertEqual(Number(all.N), 1, "one charge row, not two");
      }),
  },
];

for (const check of ChargeChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("charges", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: TeardownOrdersFixture,
});
