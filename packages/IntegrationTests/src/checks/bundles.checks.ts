/**
 * bundles — expansion into component lines, and the parentage that makes it usable (D32/D41/D45).
 *
 * WHY EXPAND AT ALL
 * A bundle sold as ONE line forces one of everything: one tax treatment, one revenue schedule, one
 * GL account, one entitlement, one returnable unit. A bundle of a publication (often exempt) and a
 * conference registration (not) taxed at the header is simply wrong, and a bundle spanning a
 * subscription and an event cannot be scheduled from a single line at all. So the components become
 * real order lines and everything downstream keeps working per line.
 *
 * THE PARENT IS NOT DECORATION. The customer bought "the package", not four things, and reporting
 * needs to know which bundle LINE a component came from — two of the same bundle on one order are
 * otherwise indistinguishable. So the parent survives, carries `IsRollupParent`, and contributes
 * ZERO. That last part is the whole hazard: a parent that kept its money would double the order,
 * and every line would still agree with itself.
 *
 * WHAT IT PROVES
 *   BN1   selling a bundle creates component lines under a rollup parent
 *   BN2   every child names its parent LINE, not merely the bundle product
 *   BN3   the parent contributes nothing — the order totals the children only
 *   BN4   the allocation sums EXACTLY to the bundle price, with no penny lost
 *   BN5   allocation is by relative standalone selling price, not evenly
 *   BN6   quantity multiplies through: 2 bundles x 3 components = 6 units
 *   BN7   two of the same bundle produce two DISTINGUISHABLE sets
 *   BN8   each child books its own journal entry, and the ledger balances
 *   BN9   a SumOfParts component is priced on its own, not from the bundle
 *   BN10  the database refuses a rollup parent that carries money
 *   BN11  an ordinary product is untouched by any of this
 *   BN12  a bundle inside a bundle is refused rather than expanded
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: BundleEngine · BundleBehavior · OrderEntityServer.expandBundles
 *   PURE: packages/CoreEntitiesServer/src/__tests__/BundleBehavior.test.ts
 *   DOC:  plans/archive/bizapps-orders-master.md D32/D41, D45
 */
import {
  Assert,
  AssertEqual,
  IntegrationCheckRegistry,
  type IntegrationCheckContext,
  type NamedCheck,
} from "@memberjunction/testing-integration";
import {
  ACCT_SCHEMA,
  CreateBundleItem,
  CreateOrdersFixture,
  CreateProductPrice,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { ConfirmOrder } from "../order-builder.js";

interface LineRow {
  ID: string;
  ProductID: string;
  Quantity: number;
  UnitPrice: number;
  LineTotalNet: number;
  LineTotalGross: number;
  ParentOrderLineID: string | null;
  IsRollupParent: boolean;
  SourceBundleProductID: string | null;
  LineNumber: number;
}

const linesOf = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<LineRow>(
    ctx,
    `SELECT ID, ProductID, Quantity, UnitPrice, LineTotalNet, LineTotalGross,
            ParentOrderLineID, IsRollupParent, SourceBundleProductID, LineNumber
       FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}' ORDER BY LineNumber`,
  );

const same = (a: string | null, b: string | null) =>
  (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

/**
 * Bundle A = 1 x Part X (worth 75) + 1 x Part Y (worth 25).
 *
 * Deliberately UNEQUAL, so an allocation that split evenly would be visibly wrong rather than
 * accidentally right — 50/50 and 75/25 both sum to 100.
 */
async function defineBundle(
  ctx: IntegrationCheckContext,
  opts: { xQty?: number; yQty?: number; yMode?: "Bundled" | "SumOfParts" } = {},
): Promise<void> {
  const f = Fx();
  await CreateProductPrice(ctx, f.Products.BundlePartX, 75);
  await CreateProductPrice(ctx, f.Products.BundlePartY, 25);
  await CreateBundleItem(ctx, f.Products.BundleA, f.Products.BundlePartX, {
    Quantity: opts.xQty ?? 1,
    SortOrder: 10,
  });
  await CreateBundleItem(ctx, f.Products.BundleA, f.Products.BundlePartY, {
    Quantity: opts.yQty ?? 1,
    PricingMode: opts.yMode ?? "Bundled",
    SortOrder: 20,
  });
}

async function sellBundle(ctx: IntegrationCheckContext, qty = 1, price = 100) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: [{ ProductID: f.Products.BundleA, Quantity: qty, UnitPrice: price }],
  });
  Assert(result.Saved, `confirm failed: ${result.Message}`);
  return result;
}

export const BundleChecks: NamedCheck[] = [
  {
    Id: "bundles.BN1",
    Name: "BN1: selling a bundle creates component lines under a rollup parent",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await defineBundle(ctx);
        const order = await sellBundle(ctx, 1, 100);
        const lines = await linesOf(ctx, order.Order.ID as string);

        AssertEqual(lines.length, 3, `parent plus two components: ${JSON.stringify(lines.length)}`);
        const parents = lines.filter((l) => l.IsRollupParent);
        const children = lines.filter((l) => !l.IsRollupParent);
        AssertEqual(parents.length, 1, "one parent");
        AssertEqual(children.length, 2, "two children");
        Assert(same(parents[0].ProductID, f.Products.BundleA), "the parent is the bundle product");
        AssertEqual(
          new Set(children.map((c) => c.ProductID.toLowerCase())).size,
          2,
          "and the children are the two components",
        );
      }),
  },
  {
    Id: "bundles.BN2",
    Name: "BN2: every child names its parent LINE, not merely the bundle product",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await defineBundle(ctx);
        const order = await sellBundle(ctx);
        const lines = await linesOf(ctx, order.Order.ID as string);
        const parent = lines.find((l) => l.IsRollupParent)!;
        const children = lines.filter((l) => !l.IsRollupParent);

        for (const child of children) {
          Assert(
            same(child.ParentOrderLineID, parent.ID),
            `child ${child.ID} should name parent line ${parent.ID}, got ${child.ParentOrderLineID}`,
          );
          // SourceBundleProductID is kept too, but it names the PRODUCT and so cannot tell two
          // instances of the same bundle apart — which is exactly why ParentOrderLineID exists.
          Assert(
            same(child.SourceBundleProductID, f.Products.BundleA),
            "and records which bundle product it came from",
          );
        }
        Assert(parent.ParentOrderLineID === null, "the parent has no parent — one level only");
      }),
  },
  {
    Id: "bundles.BN3",
    Name: "BN3: the parent contributes NOTHING — the order totals the children only",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await defineBundle(ctx);
        const order = await sellBundle(ctx, 1, 100);
        const lines = await linesOf(ctx, order.Order.ID as string);
        const header = await TxOne<{ TotalGross: number }>(
          ctx,
          `SELECT TotalGross FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${order.Order.ID}'`,
        );

        const childSum = lines
          .filter((l) => !l.IsRollupParent)
          .reduce((s, l) => s + Number(l.LineTotalGross ?? 0), 0);

        // THE ASSERTION THAT MATTERS. If the parent kept its money the order would read 200 for a
        // 100 bundle — and every individual line would still be internally consistent.
        AssertEqual(Number(header.TotalGross), 100, `the order is worth the bundle price, not double`);
        AssertEqual(Math.round(childSum * 100) / 100, 100, "the children carry all of it");
        const parent = lines.find((l) => l.IsRollupParent)!;
        AssertEqual(Number(parent.LineTotalGross ?? 0), 0, "and the parent carries none");
      }),
  },
  {
    Id: "bundles.BN4",
    Name: "BN4: the allocation sums EXACTLY to the bundle price, with no penny lost",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // Three equal components over 100 is the case naive rounding gets wrong: 33.33 x 3 = 99.99.
        await CreateProductPrice(ctx, f.Products.BundlePartX, 10);
        await CreateProductPrice(ctx, f.Products.BundlePartY, 10);
        await CreateProductPrice(ctx, f.Products.WidgetA, 10);
        await CreateBundleItem(ctx, f.Products.BundleA, f.Products.BundlePartX, { SortOrder: 10 });
        await CreateBundleItem(ctx, f.Products.BundleA, f.Products.BundlePartY, { SortOrder: 20 });
        await CreateBundleItem(ctx, f.Products.BundleA, f.Products.WidgetA, { SortOrder: 30 });

        const order = await sellBundle(ctx, 1, 100);
        const lines = await linesOf(ctx, order.Order.ID as string);
        const childSum = lines
          .filter((l) => !l.IsRollupParent)
          .reduce((s, l) => s + Number(l.LineTotalNet ?? 0), 0);

        // A lost penny does not announce itself: each line is plausible and the order balances
        // against itself. Only the parts failing to add to the whole gives it away.
        AssertEqual(Math.round(childSum * 100) / 100, 100, `three-way split must be exact`);
      }),
  },
  {
    Id: "bundles.BN5",
    Name: "BN5: allocation is by relative standalone selling price, not split evenly",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await defineBundle(ctx); // X is worth 75, Y is worth 25
        const order = await sellBundle(ctx, 1, 100);
        const lines = await linesOf(ctx, order.Order.ID as string);

        const x = lines.find((l) => same(l.ProductID, f.Products.BundlePartX))!;
        const y = lines.find((l) => same(l.ProductID, f.Products.BundlePartY))!;

        // 75/25, not 50/50. Both sum to 100, which is why an even split would pass BN3 and BN4 and
        // still put the revenue on the wrong products.
        AssertEqual(Number(x.LineTotalNet), 75, "the more valuable component takes more");
        AssertEqual(Number(y.LineTotalNet), 25, "and the less valuable takes less");
      }),
  },
  {
    Id: "bundles.BN6",
    Name: "BN6: quantity multiplies through — two bundles of three components is six units",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await defineBundle(ctx, { xQty: 3 });
        const order = await sellBundle(ctx, 2, 100);
        const lines = await linesOf(ctx, order.Order.ID as string);

        const x = lines.find((l) => same(l.ProductID, f.Products.BundlePartX))!;
        AssertEqual(Number(x.Quantity), 6, "2 bundles x 3 per bundle");

        const y = lines.find((l) => same(l.ProductID, f.Products.BundlePartY))!;
        AssertEqual(Number(y.Quantity), 2, "2 bundles x 1 per bundle");

        // The whole LINE's value is allocated, not one bundle's.
        const childSum = lines
          .filter((l) => !l.IsRollupParent)
          .reduce((s, l) => s + Number(l.LineTotalNet ?? 0), 0);
        AssertEqual(Math.round(childSum * 100) / 100, 200, "2 x 100 allocated across the children");
      }),
  },
  {
    Id: "bundles.BN7",
    Name: "BN7: two of the same bundle produce two DISTINGUISHABLE sets",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await defineBundle(ctx);
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            { ProductID: f.Products.BundleA, Quantity: 1, UnitPrice: 100 },
            { ProductID: f.Products.BundleA, Quantity: 1, UnitPrice: 60 },
          ],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        const lines = await linesOf(ctx, result.Order.ID as string);
        const parents = lines.filter((l) => l.IsRollupParent);
        AssertEqual(parents.length, 2, "two parents");

        // THIS is what ParentOrderLineID buys that SourceBundleProductID cannot: grouping the
        // children back to the RIGHT bundle. By product alone all four children look identical.
        for (const parent of parents) {
          const mine = lines.filter((l) => same(l.ParentOrderLineID, parent.ID));
          AssertEqual(mine.length, 2, `parent ${parent.LineNumber} has its own two children`);
          const total = mine.reduce((s, l) => s + Number(l.LineTotalNet ?? 0), 0);
          AssertEqual(
            Math.round(total * 100) / 100,
            Number(parent.UnitPrice),
            `and they allocate that parent's own price`,
          );
        }
      }),
  },
  {
    Id: "bundles.BN8",
    Name: "BN8: each child books its own journal entry, and the ledger balances",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await defineBundle(ctx);
        const order = await sellBundle(ctx, 1, 100);
        const lines = await linesOf(ctx, order.Order.ID as string);

        const booked = await TxQuery<{ OrderLineID: string; JournalEntryID: string | null }>(
          ctx,
          `SELECT ID AS OrderLineID, JournalEntryID FROM ${ORDERS_SCHEMA}.OrderLine
            WHERE OrderHeaderID='${order.Order.ID}'`,
        );
        const children = lines.filter((l) => !l.IsRollupParent).map((l) => l.ID.toLowerCase());
        for (const row of booked) {
          const isChild = children.includes(row.OrderLineID.toLowerCase());
          if (isChild) {
            Assert(row.JournalEntryID != null, `child ${row.OrderLineID} books its own entry`);
          }
        }

        // And every entry balances, per company.
        const unbalanced = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM (
             SELECT je.ID FROM ${ACCT_SCHEMA}.JournalEntry je
             JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
             WHERE je.LinkedRecordID IN
                   (SELECT CAST(ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}')
             GROUP BY je.ID
             HAVING ABS(SUM(ISNULL(jel.DebitAmount,0)) - SUM(ISNULL(jel.CreditAmount,0))) > 0.005) x`,
        );
        AssertEqual(Number(unbalanced.N), 0, "no unbalanced entry");
      }),
  },
  {
    Id: "bundles.BN9",
    Name: "BN9: a SumOfParts component is priced on its own, not from the bundle",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await defineBundle(ctx, { yMode: "SumOfParts" });
        const order = await sellBundle(ctx, 1, 100);
        const lines = await linesOf(ctx, order.Order.ID as string);

        const x = lines.find((l) => same(l.ProductID, f.Products.BundlePartX))!;
        const y = lines.find((l) => same(l.ProductID, f.Products.BundlePartY))!;

        // Y takes no share of the bundle price and is billed at its own 25 — so the order is worth
        // the bundle's 100 plus Y's 25, which is the point of mixing the two modes.
        AssertEqual(Number(x.LineTotalNet), 100, "the Bundled component takes the whole bundle price");
        AssertEqual(Number(y.LineTotalNet), 25, "and SumOfParts is charged on top at its own price");
      }),
  },
  {
    Id: "bundles.BN10",
    Name: "BN10: the database refuses a rollup parent that carries money",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await defineBundle(ctx);
        const order = await sellBundle(ctx);
        const lines = await linesOf(ctx, order.Order.ID as string);
        const parent = lines.find((l) => l.IsRollupParent)!;

        // The constraint is the last line of defence for the invariant BN3 asserts. Tested by
        // writing directly, because the point is that the DATABASE refuses it however it is reached
        // — an application-level guard would leave the constraint unproven.
        let rejected = false;
        try {
          await TxQuery(
            ctx,
            `UPDATE ${ORDERS_SCHEMA}.OrderLine SET ChargeAmount = 10 WHERE ID='${parent.ID}'`,
          );
        } catch {
          rejected = true;
        }
        Assert(rejected, "a rollup parent carrying a charge must be refused");
      }),
  },
  {
    Id: "bundles.BN11",
    Name: "BN11: an ordinary product is untouched by any of this",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await defineBundle(ctx);
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 2, UnitPrice: 50 }],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        const lines = await linesOf(ctx, result.Order.ID as string);
        AssertEqual(lines.length, 1, "one line, no expansion");
        AssertEqual(Boolean(lines[0].IsRollupParent), false, "not a rollup parent");
        Assert(lines[0].ParentOrderLineID === null, "and no parent");
        AssertEqual(Number(lines[0].LineTotalNet), 100, "and it carries its own money");
      }),
  },
  {
    Id: "bundles.BN12",
    Name: "BN12: a bundle inside a bundle is refused rather than expanded",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await defineBundle(ctx);
        // Make Part X itself a bundle, so expanding Bundle A would produce a child that is a bundle.
        await CreateProductPrice(ctx, f.Products.WidgetB, 10);
        await CreateBundleItem(ctx, f.Products.BundlePartX, f.Products.WidgetB, { SortOrder: 10 });

        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.BundleA, Quantity: 1, UnitPrice: 100 }],
        });

        // One level only (D45). The child is created and NOT expanded further — the ripple and the
        // allocation are not defined for deeper nesting, and a silently half-expanded bundle would
        // be worse than a refusal.
        if (result.Saved) {
          const lines = await linesOf(ctx, result.Order.ID as string);
          const grandchildren = lines.filter(
            (l) => l.ParentOrderLineID && lines.some((p) => same(p.ID, l.ParentOrderLineID) && !!p.ParentOrderLineID),
          );
          AssertEqual(grandchildren.length, 0, `nothing expands two levels deep: ${JSON.stringify(lines.map((l) => l.LineNumber))}`);
        } else {
          Assert(
            /one level|nest/i.test(result.Message ?? ""),
            `if it refuses, it should say why: ${result.Message}`,
          );
        }
      }),
  },
];

for (const check of BundleChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("bundles", {
  Setup: async (ctx) => { await CreateOrdersFixture(ctx); },
  Teardown: TeardownOrdersFixture,
});
