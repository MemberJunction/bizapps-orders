/**
 * arithmetic-edges — awkward money through the REAL pipeline.
 *
 * WHY THIS BUNDLE EXISTS SEPARATELY FROM THE UNIT TESTS. `ArithmeticEdges.test.ts` throws twelve
 * awkward totals at nine awkward weight shapes and proves the allocators themselves. It found a
 * genuine defect that way (a largest-remainder rewrite came out of it). What it cannot prove is that
 * the pipeline HANDS them the right numbers: the allocator can be perfect while the caller passes a
 * pre-rounded basis, sums a column the database stored at a different scale, or reconciles against
 * a total computed a second way.
 *
 * That gap is where money actually goes missing. So these checks put the same hostile numbers
 * through `Save()` and read the result back OUT OF THE DATABASE — which is where the scale of every
 * column (money 2dp, quantity 4dp, tax rate 6dp) finally applies.
 *
 * THE INVARIANT UNDER ALL OF THEM: every allocated total equals its parent EXACTLY, at 2dp, with no
 * share of the wrong sign. Not "within a cent" — a cent that does not reconcile is a cent somebody
 * has to find later, and the whole point of largest-remainder allocation is that it never leaves one.
 *
 * CONNECTS TO:
 *   UNIT: packages/CoreEntitiesServer/src/__tests__/ArithmeticEdges.test.ts (the allocators alone)
 *   CODE: PricingBehavior.AllocateProRata, ChargeBehavior.ComputeCharges
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
  CreatePromotion,
  ACCT_SCHEMA,
  CreateOrdersFixture,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { ConfirmOrder, type LineSpec } from "../order-builder.js";

async function addPrice(ctx: IntegrationCheckContext, productID: string, amount: number): Promise<void> {
  // Delegates to the shared builder so the price goes through `ProductPriceEntityServer` and its
  // ambiguity guard, rather than around it. Idempotent per product — see CreateProductPrice.
  await CreateProductPrice(ctx, productID, amount);
}

async function addPromotion(
  ctx: IntegrationCheckContext,
  opts: { kind?: string; value: number; appliesAt?: string },
): Promise<string> {
  // Delegates to the shared builder so the Promotion, its PromotionCode and any target all
  // go through their entity servers rather than around them.
  return CreatePromotion(ctx, {
    Kind: opts.kind,
    Value: opts.value,
    // This bundle's own default, preserved. The shared builder defaults to 'Either',
    // and letting that win applied order-level promotions PER LINE — 13 lines turned a
    // 0.07 discount into 0.91, which still reconciled internally and was still wrong.
    AppliesAt: (opts as { appliesAt?: string }).appliesAt ?? "Order",
    TargetProductID: (opts as { targetProductID?: string | null }).targetProductID ?? null,
  });
}

async function grantNexus(ctx: IntegrationCheckContext, keys: string[]): Promise<void> {
  const f = Fx();
  for (const key of keys) {
    const jid = f.Tax.JurisdictionIDs.get(key);
    if (!jid) continue;
    await TxQuery(ctx,
      `IF NOT EXISTS (SELECT 1 FROM ${ACCT_SCHEMA}.CompanyTaxNexus
                       WHERE CompanyID='${f.CoA.ID}' AND TaxJurisdictionID='${jid}')
       INSERT INTO ${ACCT_SCHEMA}.CompanyTaxNexus
         (ID, CompanyID, TaxJurisdictionID, NexusType, RegisteredFrom, Status)
       VALUES ('${randomUUID()}','${f.CoA.ID}','${jid}','Economic','2020-01-01','Active')`);
  }
}

/** N identical lines of the fixture's plain revenue product. */
const lines = (productID: string, count: number, quantity = 1, unitPrice?: number): LineSpec[] =>
  Array.from({ length: count }, () => ({ ProductID: productID, Quantity: quantity, UnitPrice: unitPrice }));

/**
 * The SHARES an order-level promotion was split into.
 *
 * READ THIS BEFORE CHANGING THE QUERY. An order-level promotion is allocated DOWN TO LINES: each
 * share becomes its own `OrderAdjustment` carrying an `OrderLineID`, plus one
 * `OrderAdjustmentAllocation` of the same amount. So two obvious queries prove nothing —
 * `WHERE OrderLineID IS NULL` matches no rows at all (this bundle and composition's CX4 both did
 * that, and both passed a deliberately broken allocator), and "allocations sum to their adjustment"
 * is true by construction because there is exactly one of each.
 *
 * What DOES exercise the allocator is the sum across every share of one promotion. And note that
 * `PromotionEngine` skips a part that is `<= 0`, so a negative share is dropped rather than stored —
 * which means a broken allocator shows up here as a SUM that no longer matches, not as a negative row.
 */
const promotionShares = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<{ PromotionID: string; Shares: number; Total: number; Smallest: number }>(
    ctx,
    `SELECT PromotionID, COUNT(*) AS Shares, SUM(Amount) AS Total, MIN(Amount) AS Smallest
       FROM ${ORDERS_SCHEMA}.OrderAdjustment
      WHERE OrderHeaderID = '${orderID}' AND PromotionID IS NOT NULL
      GROUP BY PromotionID`,
  );

/** Charges DO have one parent and many allocations, so this parity question is the real one. */
const chargeParity = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<{ ID: string; Amount: number; Allocated: number; Negatives: number }>(
    ctx,
    `SELECT c.ID, c.Amount,
            ISNULL((SELECT SUM(cl.Amount) FROM ${ORDERS_SCHEMA}.OrderChargeAllocation cl
                     WHERE cl.OrderChargeID = c.ID), 0) AS Allocated,
            ISNULL((SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderChargeAllocation cl
                     WHERE cl.OrderChargeID = c.ID AND SIGN(cl.Amount) = -SIGN(c.Amount)), 0) AS Negatives
       FROM ${ORDERS_SCHEMA}.OrderCharge c
      WHERE c.OrderHeaderID = '${orderID}'`,
  );

const totals = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ Net: number; Tax: number; Charge: number; Gross: number; Header: number; Lines: number }>(
    ctx,
    `SELECT ISNULL(SUM(l.LineTotalNet),0) AS Net, ISNULL(SUM(l.LineTax),0) AS Tax,
            ISNULL(SUM(l.ChargeAmount),0) AS Charge, ISNULL(SUM(l.LineTotalGross),0) AS Gross,
            COUNT(*) AS Lines,
            (SELECT TotalGross FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${orderID}') AS Header
       FROM ${ORDERS_SCHEMA}.OrderLine l WHERE l.OrderHeaderID='${orderID}'`,
  );

/**
 * Assert this order's money reconciles: promotion shares sum to what they should, charge
 * allocations sum to their charge, and nothing went the wrong way.
 *
 * `expectDiscount` is REQUIRED where a discount is involved. Every assertion here is inside a loop,
 * so an order that produced no rows satisfies all of them by having nothing to check — which is
 * exactly how this helper once passed a broken allocator.
 */
async function assertAllocationsReconcile(
  ctx: IntegrationCheckContext,
  orderID: string,
  expect: { Discount?: number; Charges?: number } = {},
): Promise<void> {
  const shares = await promotionShares(ctx, orderID);
  const charges = await chargeParity(ctx, orderID);

  if (expect.Discount != null) {
    AssertEqual(shares.length, 1, "the promotion this check needs must have produced adjustments");
    const only = shares[0];
    AssertEqual(
      Math.round(Number(only.Total) * 100) / 100,
      expect.Discount,
      "every share of the promotion sums to the discount it computed — a share lost to rounding is " +
        "money the customer was promised and did not receive",
    );
    Assert(
      Number(only.Smallest) > 0,
      `no share may be zero or negative (smallest was ${only.Smallest}) — round-then-patch makes ` +
        `one line absorb the drift, which can invert it`,
    );
  }

  if (expect.Charges != null) {
    AssertEqual(charges.length, expect.Charges, "the charges this check needs must exist");
  }
  for (const c of charges) {
    AssertEqual(Number(c.Allocated), Number(c.Amount), `charge ${c.ID}: allocations must sum to the charge EXACTLY`);
    AssertEqual(Number(c.Negatives), 0, `charge ${c.ID}: no share may have the opposite sign to its parent`);
  }
}

export const ArithmeticEdgesChecks: NamedCheck[] = [
  {
    Id: "arithmetic-edges.AE1",
    Name: "AE1: an indivisible discount across 13 lines reconciles, with no negative share",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 10);
        // 7 pennies across 13 equal lines. Round-then-patch gives each line 1p, totals 13p against
        // a 7p discount, and makes the largest line absorb -6p — a NEGATIVE share of a discount.
        // This is the exact shape that broke `AllocateProRata`.
        const code = await addPromotion(ctx, { kind: "AmountOff", value: 0.07 });
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: lines(f.Products.WidgetA, 13),
          PromotionCodes: [code],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        await assertAllocationsReconcile(ctx, order.Order.ID as string, { Discount: 0.07 });
      }),
  },
  {
    Id: "arithmetic-edges.AE2",
    Name: "AE2: a repeating-decimal percentage discount still sums to the stated amount",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        // A third of 100, three times. Every intermediate repeats; only the total is clean.
        const code = await addPromotion(ctx, { value: 1 / 3 });
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: lines(f.Products.WidgetA, 3),
          PromotionCodes: [code],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        // 99.99, NOT 100. `Promotion.Value` is stored at 4dp, so "a third" is 0.3333 and a third of
        // 300 is 99.99 — the penny is lost in the COLUMN, before any allocation happens. The check
        // is that every share sums to what the promotion actually computed; expecting the ideal
        // 100 here would be asserting against arithmetic the schema cannot represent.
        await assertAllocationsReconcile(ctx, order.Order.ID as string, { Discount: 99.99 });

        const t = await totals(ctx, order.Order.ID as string);
        AssertEqual(Number(t.Header), Number(t.Gross), "the header agrees with the sum of its lines");
      }),
  },
  {
    Id: "arithmetic-edges.AE3",
    Name: "AE3: a single penny of charge lands on exactly one line",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 20);
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: lines(f.Products.WidgetA, 5),
          Charges: [{ Code: "Shipping", Amount: 0.01 }],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        await assertAllocationsReconcile(ctx, order.Order.ID as string, { Charges: 1 });

        // One penny, five lines. It cannot be split, so it must land WHOLE on one line — not be
        // rounded onto all five (5p from a 1p charge) or vanish from all five (0p).
        const spread = await TxOne<{ Rows: number; Total: number }>(ctx,
          `SELECT COUNT(*) AS Rows, ISNULL(SUM(cl.Amount),0) AS Total
             FROM ${ORDERS_SCHEMA}.OrderChargeAllocation cl
             JOIN ${ORDERS_SCHEMA}.OrderCharge c ON c.ID = cl.OrderChargeID
            WHERE c.OrderHeaderID='${order.Order.ID}' AND cl.Amount <> 0`);
        AssertEqual(Number(spread.Rows), 1, "a penny cannot be divided — exactly one line receives it");
        AssertEqual(Number(spread.Total), 0.01, "and it is still a penny");
      }),
  },
  {
    Id: "arithmetic-edges.AE4",
    Name: "AE4: tax on a repeating base sums to the charge, and does not compound",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await grantNexus(ctx, ["NY", "NY-NYC", "NY-MCTD"]);
        await addPrice(ctx, f.Products.WidgetA, 33.33);
        // NYC is three layers on one base: state 4% + city 4.5% + MCTD 0.375%. Applied to 33.33
        // three times, every layer repeats — and if any layer computes on a running total that
        // already includes an earlier layer, the result is tax on tax.
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          ShipToAddressID: f.Tax.AddressIDs.get("NYC"),
          Lines: lines(f.Products.WidgetA, 3),
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        // NINE: three jurisdiction layers on each of three lines. Tax is resolved per line (each
        // carries its own TargetLineID), so the layers multiply by the lines rather than spanning
        // them — which is what keeps a line's tax attributable to that line's ship-to.
        await assertAllocationsReconcile(ctx, order.Order.ID as string, { Charges: 9 });

        const t = await totals(ctx, order.Order.ID as string);
        Assert(Number(t.Tax) > 0, "NYC must actually tax this, or the check proves nothing");
        // Every layer on the SAME base: 99.99 × (4% + 4.5% + 0.375%) = 8.874…, penny-rounded.
        // Compounding instead gives a higher number that still reconciles internally.
        const base = 33.33 * 3;
        const flat = Math.round(base * (0.04 + 0.045 + 0.00375) * 100) / 100;
        Assert(
          Math.abs(Number(t.Tax) - flat) <= 0.03,
          `three layers must apply to the same base (expected about ${flat}, got ${t.Tax}) — ` +
            `a larger number means a layer compounded onto an earlier one`,
        );
      }),
  },
  {
    Id: "arithmetic-edges.AE5",
    Name: "AE5: many tiny lines and one large discount still reconcile",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 0.01);
        // 20 lines of a penny, against a discount larger than several of them. Each line's share
        // rounds to zero or to its whole value, which is where a proportional split stops being
        // proportional at all.
        const code = await addPromotion(ctx, { kind: "AmountOff", value: 0.1 });
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: lines(f.Products.WidgetA, 20),
          PromotionCodes: [code],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        await assertAllocationsReconcile(ctx, order.Order.ID as string, { Discount: 0.1 });
      }),
  },
  {
    Id: "arithmetic-edges.AE6",
    Name: "AE6: a large line does not lose precision on the way to the database",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const price = 999999.99;
        await addPrice(ctx, f.Products.WidgetA, price);
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 7 }],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const t = await totals(ctx, order.Order.ID as string);
        AssertEqual(Number(t.Net), Math.round(price * 7 * 100) / 100, "7 × 999999.99 survives the round trip");
        AssertEqual(Number(t.Header), Number(t.Gross), "and the header agrees");
      }),
  },
  {
    Id: "arithmetic-edges.AE7",
    Name: "AE7: a 4dp quantity against 2dp money reconciles to what was stored",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 119.99);
        // Quantity is DECIMAL(_,4) and money is 2dp. 0.5833 × 119.99 = 69.9861… — the line total
        // stored is the ROUNDED one, so a recomputation from the stored quantity must land on the
        // same penny rather than on the unrounded product.
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 0.5833 }],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const row = await TxOne<{ Qty: number; Price: number; Net: number }>(ctx,
          `SELECT Quantity AS Qty, UnitPrice AS Price, LineTotalNet AS Net
             FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}'`);
        AssertEqual(
          Number(row.Net),
          Math.round(Number(row.Qty) * Number(row.Price) * 100) / 100,
          "the stored total is what the STORED quantity and price produce",
        );
      }),
  },
  {
    Id: "arithmetic-edges.AE8",
    Name: "AE8: promotion, charge and tax on the same awkward numbers all reconcile at once",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await grantNexus(ctx, ["CA", "CA-SANTACLARA"]);
        await addPrice(ctx, f.Products.WidgetA, 33.33);
        const code = await addPromotion(ctx, { kind: "AmountOff", value: 7.77 });
        // Every stage handed a number that does not divide: 7 lines of 33.33, a 7.77 discount, a
        // 3.33 charge, and a 9.125% county rate on top. Each stage is proven alone elsewhere; this
        // asks whether the numbers they pass EACH OTHER survive.
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          ShipToAddressID: f.Tax.AddressIDs.get("SantaClara"),
          Lines: lines(f.Products.WidgetA, 7),
          PromotionCodes: [code],
          Charges: [{ Code: "Shipping", Amount: 3.33 }],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        await assertAllocationsReconcile(ctx, order.Order.ID as string, { Discount: 7.77 });

        const t = await totals(ctx, order.Order.ID as string);
        AssertEqual(
          Number(t.Gross),
          Math.round((Number(t.Net) + Number(t.Tax) + Number(t.Charge)) * 100) / 100,
          "gross = net + tax + charges, on numbers where every stage rounded",
        );
        AssertEqual(Number(t.Header), Number(t.Gross), "the header agrees with its lines");
      }),
  },
  {
    Id: "arithmetic-edges.AE9",
    Name: "AE9: the ledger balances on numbers where every stage rounded",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await grantNexus(ctx, ["CA", "CA-SANTACLARA"]);
        await addPrice(ctx, f.Products.WidgetA, 33.33);
        const code = await addPromotion(ctx, { kind: "AmountOff", value: 7.77 });
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          ShipToAddressID: f.Tax.AddressIDs.get("SantaClara"),
          Lines: lines(f.Products.WidgetA, 7),
          PromotionCodes: [code],
          Charges: [{ Code: "Shipping", Amount: 3.33 }],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        // A rounding difference of a penny between the debit side and the credit side is exactly
        // the failure a tolerance would hide, so this compares them EXACTLY.
        const l = await TxOne<{ Entries: number; Unbalanced: number }>(ctx,
          `WITH e AS (
              SELECT je.ID, SUM(jel.DebitAmount) AS D, SUM(jel.CreditAmount) AS C
                FROM ${ORDERS_SCHEMA}.OrderLine ol
                JOIN ${ACCT_SCHEMA}.JournalEntry je ON je.ID = ol.JournalEntryID
                JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
               WHERE ol.OrderHeaderID='${order.Order.ID}'
               GROUP BY je.ID)
           SELECT COUNT(*) AS Entries,
                  SUM(CASE WHEN ISNULL(D,0) <> ISNULL(C,0) THEN 1 ELSE 0 END) AS Unbalanced
             FROM e`);
        Assert(Number(l.Entries) > 0, "the order booked something");
        AssertEqual(Number(l.Unbalanced), 0, "every entry balances to the penny, not to a tolerance");
      }),
  },
  {
    Id: "arithmetic-edges.AE10",
    Name: "AE10: a reversal of an awkward line gives back exactly what was taken",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await grantNexus(ctx, ["CA", "CA-SANTACLARA"]);
        await addPrice(ctx, f.Products.WidgetA, 33.33);
        const sale = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          ShipToAddressID: f.Tax.AddressIDs.get("SantaClara"),
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 7 }],
        });
        Assert(sale.Saved, `the sale must confirm: ${sale.Message}`);
        const sold = await totals(ctx, sale.Order.ID as string);

        const ret = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          OrderType: "Return",
          BillToOrganizationID: f.Customers.OrganizationID,
          ShipToAddressID: f.Tax.AddressIDs.get("SantaClara"),
          Lines: [
            {
              ProductID: f.Products.WidgetA,
              Quantity: -7,
              ReversesOrderLineID: sale.Lines[0].ID as string,
            },
          ],
        });
        Assert(ret.Saved, `the return must confirm: ${ret.Message}`);
        const back = await totals(ctx, ret.Order.ID as string);

        // Rounding the refund independently of the sale leaves a penny stranded on the customer's
        // account, and every number involved here rounds.
        AssertEqual(Number(sold.Net) + Number(back.Net), 0, "the goods net to zero");
        AssertEqual(Number(sold.Tax) + Number(back.Tax), 0, "and so does the tax");
        AssertEqual(Number(sold.Gross) + Number(back.Gross), 0, "leaving the customer exactly whole");
      }),
  },
  {
    Id: "arithmetic-edges.AE11",
    Name: "AE11: the same awkward order twice produces byte-identical money",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await grantNexus(ctx, ["CA", "CA-SANTACLARA"]);
        await addPrice(ctx, f.Products.WidgetA, 33.33);
        const code = await addPromotion(ctx, { kind: "AmountOff", value: 7.77 });
        const spec = {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          ShipToAddressID: f.Tax.AddressIDs.get("SantaClara"),
          Lines: lines(f.Products.WidgetA, 7),
          PromotionCodes: [code],
          Charges: [{ Code: "Shipping", Amount: 3.33 }],
        };

        const first = await ConfirmOrder(ctx.User, spec);
        Assert(first.Saved, `confirm failed: ${first.Message}`);
        const second = await ConfirmOrder(ctx.User, spec);
        Assert(second.Saved, `confirm failed: ${second.Message}`);

        // Determinism is the property a preview depends on: `Orders.PreviewPrice` runs this same
        // pipeline, and a quote that differs from the invoice by a penny is worse than no quote.
        // Allocation is the plausible place to lose it — a tie broken by map iteration order gives
        // the odd penny to a different line each run.
        const shares = async (orderID: string) =>
          (await TxQuery<{ N: number; Net: number; Tax: number; Ch: number }>(ctx,
            `SELECT LineNumber AS N, LineTotalNet AS Net, LineTax AS Tax, ChargeAmount AS Ch
               FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}' ORDER BY LineNumber`))
            .map((r) => `${r.N}:${r.Net}/${r.Tax}/${r.Ch}`)
            .join("|");

        AssertEqual(
          await shares(second.Order.ID as string),
          await shares(first.Order.ID as string),
          "identical input must give identical per-line money, penny for penny",
        );
      }),
  },
  {
    Id: "arithmetic-edges.AE12",
    Name: "AE12: an over-large discount floors the line at zero rather than inventing a credit",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 10);
        // A discount worth more than the whole order. The line must floor at zero: a NEGATIVE sale
        // line reads as revenue in the journal entry, which is how a configuration mistake becomes
        // an accounting one.
        const code = await addPromotion(ctx, { kind: "AmountOff", value: 500 });
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: lines(f.Products.WidgetA, 3),
          PromotionCodes: [code],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const negatives = await TxOne<{ N: number }>(ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderLine
            WHERE OrderHeaderID='${order.Order.ID}' AND LineTotalNet < 0`);
        AssertEqual(Number(negatives.N), 0, "no SALE line may go negative, however large the discount");

        const t = await totals(ctx, order.Order.ID as string);
        AssertEqual(Number(t.Net), 0, "the order is floored at zero, not driven below it");
      }),
  },
];

for (const check of ArithmeticEdgesChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("arithmetic-edges", {
  Setup: async (ctx) => { await CreateOrdersFixture(ctx); },
  Teardown: TeardownOrdersFixture,
});
