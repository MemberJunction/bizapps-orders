/**
 * composition — one realistic order carrying EVERYTHING at once.
 *
 * WHY THIS BUNDLE EXISTS. Every other bundle tests one layer. That proves each stage in isolation
 * and says nothing about the pipeline, which has ordering constraints BETWEEN stages:
 *
 *     price → line promotions → order promotions (allocated) → charges → tax → GL
 *
 * Discounts must be fully allocated before tax computes, or tax is charged on money the customer
 * never owed. Charges must allocate to lines before booking, or the journal entry misses them. Both
 * of those were real defects, found only when the stages were finally combined.
 *
 * So these checks build the order a real customer places — two companies' products, a line
 * promotion, an order promotion, shipping, layered tax, a partial payment — and assert the three
 * things that must hold no matter how the stages interact:
 *
 *   1. every ledger entry BALANCES, per company
 *   2. every allocation SUMS to its parent exactly
 *   3. the price components RECONSTRUCT the line total
 *
 * CONNECTS TO:
 *   CODE: OrderEntityServer.Save — the whole pipeline
 *   DOC:  plans/pricing-charges-and-promotions.md §1 (the pipeline)
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
  ACCT_SCHEMA,
  CreateOrdersFixture,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { ConfirmOrder } from "../order-builder.js";
// Shared rather than duplicated: the intercompany pairs are COMMITTED reference data (the engine
// caches them in-process, so a per-check version would leave a warm cache pointing at rolled-back
// rows). CX7/CX8 pay a two-company order, which needs them.
import { CreateIntercompanyFixture, TeardownIntercompanyFixture } from "./intercompany.checks.js";
import { CreatePayment } from "../payment-builder.js";
import type { LooseEntity } from "../payment-builder.js";

async function addPrice(ctx: IntegrationCheckContext, productID: string, amount: number): Promise<void> {
  await TxQuery(ctx,
    `INSERT INTO ${ORDERS_SCHEMA}.ProductPrice
       (ID, ProductID, PricingModel, FeeType, Amount, EffectiveFrom, Priority, Status)
     VALUES ('${randomUUID()}','${productID}','PerUnit','Standard',${amount},'2020-01-01',0,'Active')`);
}

async function addPromotion(
  ctx: IntegrationCheckContext,
  opts: { kind?: string; value: number; appliesAt?: string; targetProductID?: string | null },
): Promise<string> {
  const code = `CX${randomUUID().slice(0, 6).toUpperCase()}`;
  const id = randomUUID();
  const t = await TxOne<{ ID: string }>(ctx,
    `SELECT ID FROM ${ORDERS_SCHEMA}.PromotionType WHERE Code='${opts.kind ?? "PercentOff"}'`);
  await TxQuery(ctx,
    `INSERT INTO ${ORDERS_SCHEMA}.Promotion (ID, Code, Name, PromotionTypeID, Value, AppliesAt, Status)
     VALUES ('${id}','${code}','${code}','${t.ID}',${opts.value},'${opts.appliesAt ?? "Either"}','Active');
     INSERT INTO ${ORDERS_SCHEMA}.PromotionCode (ID, PromotionID, Code, Status)
     VALUES ('${randomUUID()}','${id}','${code}','Active')`);
  if (opts.targetProductID) {
    await TxQuery(ctx,
      `INSERT INTO ${ORDERS_SCHEMA}.PromotionTarget (ID, PromotionID, ProductID, IncludeDescendants)
       VALUES ('${randomUUID()}','${id}','${opts.targetProductID}',1)`);
  }
  return code;
}

/** Grant CoA nexus wherever the fixture did not, so tax is about the pipeline and not the gate. */
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

/** Does every journal entry on this order balance, and is there one per company? */
const ledger = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ Entries: number; Unbalanced: number; Companies: number }>(
    ctx,
    `WITH e AS (
        SELECT je.ID, gl.CompanyID,
               SUM(jel.DebitAmount) AS D, SUM(jel.CreditAmount) AS C
          FROM ${ORDERS_SCHEMA}.OrderLine ol
          JOIN ${ACCT_SCHEMA}.JournalEntry je ON je.ID = ol.JournalEntryID
          JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
          JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
         WHERE ol.OrderHeaderID = '${orderID}'
         GROUP BY je.ID, gl.CompanyID)
     SELECT COUNT(*) AS Entries,
            SUM(CASE WHEN ABS(ISNULL(D,0) - ISNULL(C,0)) > 0.005 THEN 1 ELSE 0 END) AS Unbalanced,
            COUNT(DISTINCT CompanyID) AS Companies
       FROM e`,
  );

const totals = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ Net: number; Discount: number; Tax: number; Charge: number; Gross: number; Header: number }>(
    ctx,
    `SELECT ISNULL(SUM(l.LineTotalNet),0) AS Net, ISNULL(SUM(l.DiscountAmount),0) AS Discount,
            ISNULL(SUM(l.LineTax),0) AS Tax, ISNULL(SUM(l.ChargeAmount),0) AS Charge,
            ISNULL(SUM(l.LineTotalGross),0) AS Gross,
            (SELECT TotalGross FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${orderID}') AS Header
       FROM ${ORDERS_SCHEMA}.OrderLine l WHERE l.OrderHeaderID='${orderID}'`,
  );

/** Build the everything-order: two companies, both promotion levels, shipping, tax. */
async function kitchenSink(ctx: IntegrationCheckContext) {
  const f = Fx();
  await grantNexus(ctx, ["CA", "CA-SANTACLARA"]);
  // WidgetA belongs to CoA and WidgetB to CoB, so two lines already span two companies — which is
  // the point: the intercompany legs and the per-company ledger have to survive every other stage.
  await addPrice(ctx, f.Products.WidgetA, 300);   // CoA
  await addPrice(ctx, f.Products.WidgetB, 100);   // CoB

  const linePromo = await addPromotion(ctx, { value: 0.1, targetProductID: f.Products.WidgetA });
  const orderPromo = await addPromotion(ctx, { kind: "AmountOff", value: 50, appliesAt: "Order" });

  return ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    ShipToAddressID: f.Tax.AddressIDs.get("SantaClara"),
    Lines: [
      { ProductID: f.Products.WidgetA, Quantity: 1 },
      { ProductID: f.Products.WidgetB, Quantity: 1 },
    ],
    PromotionCodes: [linePromo, orderPromo],
    Charges: [{ Code: "Shipping", Amount: 60 }],
  });
}

export const CompositionChecks: NamedCheck[] = [
  {
    Id: "composition.CX1",
    Name: "CX1: the everything-order confirms — every stage in one save",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await kitchenSink(ctx);
        Assert(order.Saved, `the realistic order must confirm: ${order.Message}`);
      }),
  },
  {
    Id: "composition.CX2",
    Name: "CX2: every journal entry balances, and there is one per company",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await kitchenSink(ctx);
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const l = await ledger(ctx, order.Order.ID as string);
        Assert(Number(l.Entries) > 0, "the order booked something");
        AssertEqual(Number(l.Unbalanced), 0, "no entry may be unbalanced once every stage has run");
        AssertEqual(Number(l.Companies), 2, "CoA and CoB each get their own entries (D6/D10)");
      }),
  },
  {
    Id: "composition.CX3",
    Name: "CX3: the line totals reconcile to the header total",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await kitchenSink(ctx);
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const t = await totals(ctx, order.Order.ID as string);
        // Net + tax + charges is the gross, and the header must agree with its own lines.
        AssertEqual(
          Number(t.Gross),
          Math.round((Number(t.Net) + Number(t.Tax) + Number(t.Charge)) * 100) / 100,
          "gross = net + tax + charges",
        );
        AssertEqual(Number(t.Header), Number(t.Gross), "the header agrees with the sum of its lines");
      }),
  },
  {
    Id: "composition.CX4",
    Name: "CX4: every order-level allocation sums to its parent, exactly",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await kitchenSink(ctx);
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        // THIS QUERY USED TO FILTER ON `OrderLineID IS NULL`, WHICH MATCHES NOTHING. An order-level
        // promotion is allocated DOWN TO LINES — every share becomes its own OrderAdjustment
        // carrying an OrderLineID — so the check summed an empty set to zero and passed whatever
        // the allocator did. It survived a deliberately broken allocator, which is how it was found.
        //
        // The invariant that does bite: every share of one promotion sums to the amount that
        // promotion computed. `PromotionEngine` drops a share of <= 0 rather than storing it, so a
        // broken allocator shows up as a SUM that no longer reconciles.
        const shares = await TxQuery<{ PromotionID: string; Shares: number; Total: number; Smallest: number }>(
          ctx,
          `SELECT PromotionID, COUNT(*) AS Shares, SUM(Amount) AS Total, MIN(Amount) AS Smallest
             FROM ${ORDERS_SCHEMA}.OrderAdjustment
            WHERE OrderHeaderID='${order.Order.ID}' AND PromotionID IS NOT NULL
            GROUP BY PromotionID`,
        );
        AssertEqual(shares.length, 2, "both the line promotion and the order promotion recorded shares");
        const byTotal = shares.map((r) => Math.round(Number(r.Total) * 100) / 100).sort((a, b) => a - b);
        // 10% of WidgetA's 300, and the flat 50 off the order.
        AssertEqual(byTotal[0], 30, "the line promotion's shares sum to 10% of the line it targeted");
        AssertEqual(byTotal[1], 50, "the order promotion's shares sum to the 50 it took off");
        for (const r of shares) {
          Assert(Number(r.Smallest) > 0, `no share may be zero or negative (got ${r.Smallest})`);
        }

        // Charges DO have one parent and many allocations, so parity is the right question there.
        const charges = await TxQuery<{ ID: string; Amount: number; Allocated: number }>(
          ctx,
          `SELECT c.ID, c.Amount,
                  ISNULL((SELECT SUM(cl.Amount) FROM ${ORDERS_SCHEMA}.OrderChargeAllocation cl
                           WHERE cl.OrderChargeID = c.ID), 0) AS Allocated
             FROM ${ORDERS_SCHEMA}.OrderCharge c WHERE c.OrderHeaderID='${order.Order.ID}'`,
        );
        Assert(charges.length > 0, "the shipping charge and the tax layers must be recorded");
        for (const c of charges) {
          AssertEqual(Number(c.Allocated), Number(c.Amount), `charge ${c.ID} allocates to the penny`);
        }
      }),
  },
  {
    Id: "composition.CX5",
    Name: "CX5: tax is computed AFTER discounts, not on list price",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await kitchenSink(ctx);
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const t = await totals(ctx, order.Order.ID as string);
        // Goods are 400; 30 comes off WidgetA and 50 off the order, so net is 320 and shipping 60.
        // Santa Clara is 9.125% of the taxable base — which must be the DISCOUNTED base.
        AssertEqual(Number(t.Discount), 80, "10% of WidgetA plus the 50 order-level promotion");
        AssertEqual(Number(t.Net), 320, "400 less 80");
        const onList = Math.round(400 * 0.09125 * 100) / 100;
        Assert(
          Number(t.Tax) < onList,
          `tax must be on the discounted base, not the 600 list (would be ${onList}, got ${t.Tax})`,
        );
      }),
  },
  {
    Id: "composition.CX6",
    Name: "CX6: the price components reconstruct each line's net",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await kitchenSink(ctx);
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        // The component trail is what answers "why is this line 270?" to a customer. If it does not
        // reconstruct the number, it is decoration.
        const rows = await TxQuery<{ ID: string; LineTotalNet: number; Base: number; Discount: number }>(
          ctx,
          `SELECT l.ID, l.LineTotalNet,
                  ISNULL((SELECT SUM(Amount) FROM ${ORDERS_SCHEMA}.OrderLinePriceComponent
                           WHERE OrderLineID=l.ID AND ComponentType='Base'),0) AS Base,
                  l.DiscountAmount AS Discount
             FROM ${ORDERS_SCHEMA}.OrderLine l WHERE l.OrderHeaderID='${order.Order.ID}'`,
        );
        Assert(rows.length === 2, `expected 2 lines, got ${rows.length}`);
        for (const r of rows) {
          AssertEqual(
            Number(r.LineTotalNet),
            Math.round((Number(r.Base) - Number(r.Discount)) * 100) / 100,
            `line ${r.ID}: base minus discount must equal the net`,
          );
        }
      }),
  },
  {
    Id: "composition.CX7",
    Name: "CX7: a partial payment against the everything-order books per company and leaves the rest open",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await kitchenSink(ctx);
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const before = await totals(ctx, order.Order.ID as string);
        const half = Math.round(Number(before.Gross) * 50) / 100;

        const paid = await CreatePayment(ctx.User, {
          PaymentNumber: `CX-${randomUUID().slice(0, 8).toUpperCase()}`,
          ReceivingCompanyID: f.CoA.ID,
          PaymentTypeID: f.PaymentTypeIDs.get("Cash")!,
          Amount: half,
          Allocations: [{ OrderHeaderID: order.Order.ID as string, Amount: half }],
        });
        Assert(paid.Saved, `payment failed: ${paid.Message}`);

        const after = await TxOne<{ Balance: number; PaymentStatus: string }>(
          ctx,
          `SELECT Balance, PaymentStatus FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${order.Order.ID}'`,
        );
        AssertEqual(
          Number(after.Balance),
          Math.round((Number(before.Gross) - half) * 100) / 100,
          "the balance is the gross less what was paid",
        );
        AssertEqual(after.PaymentStatus, "PartiallyPaid", "and it is not marked Paid");
      }),
  },
  {
    Id: "composition.CX8",
    Name: "CX8: cash on a two-company order raises intercompany legs and each company nets to zero",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await kitchenSink(ctx);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        const t = await totals(ctx, order.Order.ID as string);

        const paid = await CreatePayment(ctx.User, {
          PaymentNumber: `CX-${randomUUID().slice(0, 8).toUpperCase()}`,
          ReceivingCompanyID: f.CoA.ID,
          PaymentTypeID: f.PaymentTypeIDs.get("Cash")!,
          Amount: Number(t.Gross),
          Allocations: [{ OrderHeaderID: order.Order.ID as string, Amount: Number(t.Gross) }],
        });
        Assert(paid.Saved, `full payment failed: ${paid.Message}`);

        // The whole point of the intercompany design: CoA collected everything, but each company's
        // OWN receivable must clear — CoB's through Due From, not through CoA's cash.
        //
        // EVERY COLUMN IN THE SUBQUERIES BELOW IS QUALIFIED, and that is load-bearing. This read
        // `SELECT JournalEntryID FROM PaymentLine`, and PaymentLine HAS NO SUCH COLUMN — so SQL
        // Server bound the unqualified name to the OUTER query's `jel.JournalEntryID` instead of
        // failing. The subquery then returned the outer row's own value for every PaymentLine row,
        // the IN was always true, and this check summed accounts receivable across the ENTIRE
        // DATABASE rather than this one order.
        //
        // It passed for weeks. It could only ever pass, because the suite always ran against a
        // database holding nothing but its own rolled-back fixtures. Committing eight orders on
        // purpose is what exposed it: the stranded 2,929.97 it suddenly reported was the seeded
        // ledger's real receivable, correctly summed and entirely irrelevant.
        //
        // A payment's entry lives on `PaymentHeader.JournalEntryID`, not on its lines.
        const ar = await TxQuery<{ CompanyID: string; Net: number }>(
          ctx,
          `SELECT gl.CompanyID, SUM(jel.DebitAmount) - SUM(jel.CreditAmount) AS Net
             FROM ${ACCT_SCHEMA}.JournalEntryLine jel
             JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
            WHERE gl.Code = '11201'
              AND jel.JournalEntryID IN (
                    SELECT ol.JournalEntryID FROM ${ORDERS_SCHEMA}.OrderLine ol
                     WHERE ol.OrderHeaderID='${order.Order.ID}'
                    UNION
                    SELECT ph.JournalEntryID FROM ${ORDERS_SCHEMA}.PaymentHeader ph
                     WHERE ph.ID='${paid.Payment.ID}')
            GROUP BY gl.CompanyID`,
        );
        for (const row of ar) {
          AssertEqual(
            Math.round(Number(row.Net) * 100) / 100,
            0,
            `company ${row.CompanyID}: its own receivable must net to zero once paid`,
          );
        }
      }),
  },
  {
    Id: "composition.CX9",
    Name: "CX9: awkward numbers survive the whole pipeline",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await grantNexus(ctx, ["CA", "CA-SANTACLARA"]);
        // Prices and a discount chosen so every stage produces a repeating decimal.
        await addPrice(ctx, f.Products.WidgetA, 33.33);
        await addPrice(ctx, f.Products.WidgetB, 66.67);
        const promo = await addPromotion(ctx, { value: 1 / 3, appliesAt: "Order" });

        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          ShipToAddressID: f.Tax.AddressIDs.get("SantaClara"),
          Lines: [
            { ProductID: f.Products.WidgetA, Quantity: 3 },
            { ProductID: f.Products.WidgetB, Quantity: 7 },
          ],
          PromotionCodes: [promo],
          Charges: [{ Code: "Shipping", Amount: 0.07 }],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const t = await totals(ctx, order.Order.ID as string);
        AssertEqual(
          Number(t.Gross),
          Math.round((Number(t.Net) + Number(t.Tax) + Number(t.Charge)) * 100) / 100,
          "the totals still reconcile with repeating decimals throughout",
        );
        const l = await ledger(ctx, order.Order.ID as string);
        AssertEqual(Number(l.Unbalanced), 0, "and every entry still balances");

        // 7p of shipping across two lines is exactly the case that produced a NEGATIVE share
        // before the allocator was rewritten.
        const neg = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderChargeAllocation al
             JOIN ${ORDERS_SCHEMA}.OrderCharge c ON c.ID = al.OrderChargeID
            WHERE c.OrderHeaderID='${order.Order.ID}' AND al.Amount < 0`,
        );
        AssertEqual(Number(neg.N), 0, "no allocation may be negative");
      }),
  },
  {
    Id: "composition.CX10",
    Name: "CX10: a refused stage rolls back the WHOLE order, leaving no residue",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        // 'Surcharge' is seeded but deliberately unlinked, so booking must refuse — AFTER pricing,
        // promotions and charges have already written rows. Every one of them must disappear.
        const promo = await addPromotion(ctx, { value: 0.1 });
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 5 }],
          PromotionCodes: [promo],
          Charges: [{ Code: "Surcharge", Amount: 25 }],
        });
        Assert(!order.Saved, "an unbookable charge must refuse the confirm");

        const residue = await TxOne<{ Orders: number; Lines: number; Adj: number; Charges: number }>(
          ctx,
          `SELECT
             (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${order.Order.ID}') AS Orders,
             (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}') AS Lines,
             (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderAdjustment WHERE OrderHeaderID='${order.Order.ID}') AS Adj,
             (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderCharge WHERE OrderHeaderID='${order.Order.ID}') AS Charges`,
        );
        AssertEqual(Number(residue.Orders), 0, "no order header survives");
        AssertEqual(Number(residue.Lines), 0, "no lines survive");
        AssertEqual(Number(residue.Adj), 0, "no adjustments survive");
        AssertEqual(Number(residue.Charges), 0, "no charges survive");
      }),
  },
];

for (const check of CompositionChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("composition", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
    await CreateIntercompanyFixture(ctx);
  },
  Teardown: async (ctx) => {
    await TeardownIntercompanyFixture(ctx);
    await TeardownOrdersFixture(ctx);
  },
});
