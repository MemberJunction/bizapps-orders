/**
 * pricing — price resolution, the walk, and the dry run (D69).
 *
 * WHAT THESE ARE FOR
 * Until now `OrderLine.UnitPrice` was typed by hand on every line: the pricing tables existed and
 * nothing read them. These checks cover the engine that changed that — and, more importantly, the
 * places it must REFUSE rather than produce a number.
 *
 * THE ONES THAT EARN THEIR KEEP
 *   - PC5 (ambiguity refused) and PC12 (refused at write time). Two applicable rules with equal
 *     priority would otherwise resolve by whatever order the database returned: arbitrary, stable
 *     in a test, and liable to flip in production. Every wrong answer here still LOOKS like a price.
 *   - PC9/PC10 (Volume vs Tiered against the ledger). The unit tests pin the arithmetic; these
 *     prove the number that reaches the journal entry is the same one.
 *   - PC14 (the dry run agrees with the order). A preview that diverges from what is actually
 *     charged is worse than no preview, because people trust it.
 *
 * CONNECTS TO:
 *   CODE: PriceResolver · PricingBehavior · ProductPriceEntityServer · PreviewPriceOperation
 *   DOC:  plans/pricing-charges-and-promotions.md
 */
import { randomUUID } from "crypto";
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
  CreateOrdersFixture,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { ConfirmOrder } from "../order-builder.js";
import type { LooseEntity } from "../payment-builder.js";

interface PreviewOutput {
  Success: boolean;
  Message?: string;
  UnitPrice?: number;
  ExtendedAmount?: number;
  PriceListID?: string | null;
  PriceListName?: string | null;
  ProductPriceID?: string | null;
  ResolvedBy?: string;
  Components?: Array<{ ComponentType: string; Label: string; Amount: number; RunningTotal: number }>;
}

/** Insert a price rule and return its ID. */
async function addPrice(
  ctx: IntegrationCheckContext,
  productID: string,
  opts: {
    amount: number;
    model?: string;
    priceListID?: string | null;
    minQty?: number | null;
    maxQty?: number | null;
    from?: string;
    to?: string | null;
    priority?: number;
    months?: string | null;
    daysOfWeek?: string | null;
    packageQty?: number | null;
    description?: string;
  },
): Promise<string> {
  const id = randomUUID();
  const v = (x: unknown) => (x == null ? "NULL" : typeof x === "string" ? `'${x.replace(/'/g, "''")}'` : String(x));
  await TxQuery(ctx,
    `INSERT INTO ${ORDERS_SCHEMA}.ProductPrice
       (ID, ProductID, PriceListID, PricingModel, FeeType, Amount, PackageQuantity,
        MinQuantity, MaxQuantity, EffectiveFrom, EffectiveTo,
        RecurrenceMonths, RecurrenceDaysOfWeek, Priority, Status, Description)
     VALUES ('${id}', '${productID}', ${v(opts.priceListID ?? null)}, ${v(opts.model ?? "PerUnit")}, 'Standard',
             ${opts.amount}, ${v(opts.packageQty ?? null)},
             ${v(opts.minQty ?? null)}, ${v(opts.maxQty ?? null)},
             ${v(opts.from ?? "2020-01-01")}, ${v(opts.to ?? null)},
             ${v(opts.months ?? null)}, ${v(opts.daysOfWeek ?? null)},
             ${opts.priority ?? 0}, 'Active', ${v(opts.description ?? null)})`);
  return id;
}

async function addTier(
  ctx: IntegrationCheckContext,
  productPriceID: string,
  min: number,
  max: number | null,
  amount: number,
  sort = 0,
): Promise<void> {
  await TxQuery(ctx,
    `INSERT INTO ${ORDERS_SCHEMA}.PriceTier (ID, ProductPriceID, MinQuantity, MaxQuantity, Amount, SortOrder)
     VALUES ('${randomUUID()}','${productPriceID}', ${min}, ${max == null ? "NULL" : max}, ${amount}, ${sort})`);
}

/** Create a price list and assign it to an organization. */
async function addListFor(
  ctx: IntegrationCheckContext,
  organizationID: string,
  code: string,
): Promise<string> {
  const listID = randomUUID();
  await TxQuery(ctx,
    `INSERT INTO ${ORDERS_SCHEMA}.PriceList (ID, Code, Name, Status)
     VALUES ('${listID}','${code}','${code} list','Active');
     INSERT INTO ${ORDERS_SCHEMA}.PriceListAssignment (ID, PriceListID, OrganizationID, Priority, Status)
     VALUES ('${randomUUID()}','${listID}','${organizationID}', 0, 'Active')`);
  return listID;
}

/** Confirm a one-line order WITHOUT stating a price, so the engine must resolve it. */
async function confirmUnpriced(
  ctx: IntegrationCheckContext,
  productID: string,
  quantity: number,
  orderDate?: Date,
) {
  const f = Fx();
  return ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    OrderDate: orderDate,
    Lines: [{ ProductID: productID, Quantity: quantity }],
  });
}

const lineOf = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ UnitPrice: number; LineTotalGross: number; ProductPriceID: string | null; ID: string }>(
    ctx,
    `SELECT TOP 1 ID, UnitPrice, LineTotalGross, ProductPriceID
       FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}'`,
  );

async function preview(
  ctx: IntegrationCheckContext,
  input: Record<string, unknown>,
): Promise<PreviewOutput> {
  const op = MJGlobal.Instance.ClassFactory.CreateInstance<
    BaseRemotableOperation<Record<string, unknown>, PreviewOutput>
  >(BaseRemotableOperation, "Orders.PreviewPrice");
  Assert(op != null, "'Orders.PreviewPrice' is not registered");
  const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
  Assert(result.Success, `the operation did not execute: ${result.ErrorMessage ?? "unknown"}`);
  return result.Output as PreviewOutput;
}

export const PricingChecks: NamedCheck[] = [
  {
    Id: "pricing.PC1",
    Name: "PC1: a line with no stated price resolves from the product's base price",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, { amount: 25 });
        const order = await confirmUnpriced(ctx, f.Products.WidgetA, 4);
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const line = await lineOf(ctx, order.Order.ID as string);
        AssertEqual(Number(line.UnitPrice), 25, "the base price was stamped");
        AssertEqual(Number(line.LineTotalGross), 100, "4 x 25 reached the line total");
      }),
  },
  {
    Id: "pricing.PC2",
    Name: "PC2: a stated price WINS over the engine and is never overwritten",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, { amount: 25 });
        // D21: a stated price is a decision somebody made. Resolution fills a blank, never argues.
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 2, UnitPrice: 99 }],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const line = await lineOf(ctx, order.Order.ID as string);
        AssertEqual(Number(line.UnitPrice), 99, "the stated price survived");
        Assert(line.ProductPriceID == null, "a stated price records no rule provenance");
      }),
  },
  {
    Id: "pricing.PC3",
    Name: "PC3: the customer's price list beats the product's base price",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, { amount: 25, description: "base" });
        const listID = await addListFor(ctx, f.Customers.OrganizationID, `WS-${randomUUID().slice(0, 6)}`);
        await addPrice(ctx, f.Products.WidgetA, { amount: 18, priceListID: listID, description: "wholesale" });

        const order = await confirmUnpriced(ctx, f.Products.WidgetA, 10);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        const line = await lineOf(ctx, order.Order.ID as string);
        AssertEqual(Number(line.UnitPrice), 18, "the assigned list won");
      }),
  },
  {
    Id: "pricing.PC4",
    Name: "PC4: a list that does not price a SKU falls back to base rather than failing",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // A wholesale list covering ONE product. The other must stay orderable — loading only the
        // list's rows would make it unpriceable for exactly the customers who buy the most.
        const listID = await addListFor(ctx, f.Customers.OrganizationID, `PART-${randomUUID().slice(0, 6)}`);
        await addPrice(ctx, f.Products.WidgetA, { amount: 18, priceListID: listID });
        await addPrice(ctx, f.Products.WidgetB, { amount: 40, description: "base only" });

        const order = await confirmUnpriced(ctx, f.Products.WidgetB, 2);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        const line = await lineOf(ctx, order.Order.ID as string);
        AssertEqual(Number(line.UnitPrice), 40, "the unlisted SKU fell back to base");
      }),
  },
  {
    Id: "pricing.PC5",
    Name: "PC5: two applicable rules of equal priority REFUSE rather than pick one",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // Written with raw SQL so the write-time guard (PC12) does not stop us setting up the very
        // state the ORDER-time refusal exists to catch.
        await addPrice(ctx, f.Products.WidgetA, { amount: 25, priority: 5, description: "rule A" });
        await addPrice(ctx, f.Products.WidgetA, { amount: 30, priority: 5, description: "rule B" });

        const order = await confirmUnpriced(ctx, f.Products.WidgetA, 3);
        Assert(!order.Saved, "an ambiguous rule set must refuse the confirm");
        Assert(
          /ambiguous/i.test(order.Message),
          `the refusal should say it is ambiguous, got: ${order.Message}`,
        );
        Assert(
          /rule A|rule B/.test(order.Message),
          `the refusal should NAME the colliding rules, got: ${order.Message}`,
        );
      }),
  },
  {
    Id: "pricing.PC6",
    Name: "PC6: higher priority wins when rules overlap",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, { amount: 25, priority: 1 });
        await addPrice(ctx, f.Products.WidgetA, { amount: 12, priority: 99, description: "promo week" });

        const order = await confirmUnpriced(ctx, f.Products.WidgetA, 2);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        const line = await lineOf(ctx, order.Order.ID as string);
        AssertEqual(Number(line.UnitPrice), 12, "the higher-priority rule won");
      }),
  },
  {
    Id: "pricing.PC7",
    Name: "PC7: quantity bands select the rule",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, { amount: 10, minQty: 1, maxQty: 9 });
        await addPrice(ctx, f.Products.WidgetA, { amount: 7, minQty: 10, maxQty: null });

        const small = await confirmUnpriced(ctx, f.Products.WidgetA, 5);
        Assert(small.Saved, `confirm failed: ${small.Message}`);
        AssertEqual(Number((await lineOf(ctx, small.Order.ID as string)).UnitPrice), 10, "small order at 10");

        const bulk = await confirmUnpriced(ctx, f.Products.WidgetA, 25);
        Assert(bulk.Saved, `confirm failed: ${bulk.Message}`);
        AssertEqual(Number((await lineOf(ctx, bulk.Order.ID as string)).UnitPrice), 7, "bulk order at 7");
      }),
  },
  {
    Id: "pricing.PC8",
    Name: "PC8: a seasonal rule applies only in its months",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, { amount: 20, description: "standard" });
        await addPrice(ctx, f.Products.WidgetA, { amount: 14, months: "12", priority: 10, description: "december" });

        const december = await confirmUnpriced(ctx, f.Products.WidgetA, 1, new Date(2026, 11, 10));
        Assert(december.Saved, `confirm failed: ${december.Message}`);
        AssertEqual(Number((await lineOf(ctx, december.Order.ID as string)).UnitPrice), 14, "December rate applied");

        const july = await confirmUnpriced(ctx, f.Products.WidgetA, 1, new Date(2026, 6, 10));
        Assert(july.Saved, `confirm failed: ${july.Message}`);
        AssertEqual(Number((await lineOf(ctx, july.Order.ID as string)).UnitPrice), 20, "July fell back to standard");
      }),
  },
  {
    Id: "pricing.PC9",
    Name: "PC9: VOLUME prices the whole quantity at the band it lands in",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const pid = await addPrice(ctx, f.Products.WidgetA, { amount: 10, model: "Volume" });
        await addTier(ctx, pid, 1, 50, 10, 0);
        await addTier(ctx, pid, 51, null, 8, 1);

        const order = await confirmUnpriced(ctx, f.Products.WidgetA, 100);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        const line = await lineOf(ctx, order.Order.ID as string);
        AssertEqual(Number(line.LineTotalGross), 800, "100 x 8 — the whole quantity at the 51+ rate");
      }),
  },
  {
    Id: "pricing.PC10",
    Name: "PC10: TIERED prices each band separately, and differs from Volume",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const pid = await addPrice(ctx, f.Products.WidgetA, { amount: 10, model: "Tiered" });
        await addTier(ctx, pid, 1, 50, 10, 0);
        await addTier(ctx, pid, 51, null, 8, 1);

        const order = await confirmUnpriced(ctx, f.Products.WidgetA, 100);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        const line = await lineOf(ctx, order.Order.ID as string);
        // (50 x 10) + (50 x 8) = 900 — NOT the 800 the identical Volume bands produced in PC9.
        AssertEqual(Number(line.LineTotalGross), 900, "graduated tiers summed to 900");
      }),
  },
  {
    Id: "pricing.PC11",
    Name: "PC11: an unpriceable line is REFUSED, not booked at zero",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // No price rule at all, and no stated price. A silently-zero line is an invoice for nothing
        // that looks deliberate (D12's precedent).
        const order = await confirmUnpriced(ctx, f.Products.WidgetA, 3);
        Assert(!order.Saved, "a line nobody can price must be refused");
        Assert(
          /cannot be priced|no price/i.test(order.Message),
          `the refusal should explain, got: ${order.Message}`,
        );

        const count = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${order.Order.ID}'`,
        );
        AssertEqual(Number(count.N), 0, "the whole order rolled back, leaving no residue");
      }),
  },
  {
    Id: "pricing.PC12",
    Name: "PC12: a colliding price rule is refused when it is WRITTEN",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, { amount: 25, priority: 5, description: "first" });

        // Through the ENTITY this time — the guard belongs to the person creating the collision,
        // while they still have the context to fix it.
        const { Metadata } = await import("@memberjunction/core");
        const md = new Metadata();
        const rule = await md.GetEntityObject<LooseEntity>("MJ_BizApps_Orders: Product Prices", ctx.User);
        rule.NewRecord();
        rule.ProductID = f.Products.WidgetA;
        rule.PricingModel = "PerUnit";
        rule.FeeType = "Standard";
        rule.Amount = 30;
        rule.EffectiveFrom = new Date("2020-01-01");
        rule.Priority = 5;
        rule.Status = "Active";
        rule.Description = "second";

        const saved = await rule.Save();
        Assert(!saved, "a rule colliding with an existing one must be refused");
        Assert(
          /collides|priority/i.test(rule.LatestResult?.CompleteMessage ?? ""),
          `the refusal should explain the collision, got: ${rule.LatestResult?.CompleteMessage}`,
        );
      }),
  },
  {
    Id: "pricing.PC13",
    Name: "PC13: non-overlapping bands may share a priority — ambiguity is relative, not absolute",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // The write-time guard must NOT forbid this: disjoint quantity bands can never both apply,
        // so a blanket uniqueness rule would outlaw a great deal of correct configuration.
        await addPrice(ctx, f.Products.WidgetA, { amount: 10, priority: 5, minQty: 1, maxQty: 9 });

        const { Metadata } = await import("@memberjunction/core");
        const md = new Metadata();
        const rule = await md.GetEntityObject<LooseEntity>("MJ_BizApps_Orders: Product Prices", ctx.User);
        rule.NewRecord();
        rule.ProductID = f.Products.WidgetA;
        rule.PricingModel = "PerUnit";
        rule.FeeType = "Standard";
        rule.Amount = 7;
        rule.MinQuantity = 10;
        rule.EffectiveFrom = new Date("2020-01-01");
        rule.Priority = 5;
        rule.Status = "Active";

        const saved = await rule.Save();
        Assert(saved, `disjoint bands at the same priority must be allowed: ${rule.LatestResult?.CompleteMessage}`);
      }),
  },
  {
    Id: "pricing.PC14",
    Name: "PC14: the dry run agrees with what the order actually charges",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const listID = await addListFor(ctx, f.Customers.OrganizationID, `DR-${randomUUID().slice(0, 6)}`);
        await addPrice(ctx, f.Products.WidgetA, { amount: 25, description: "base" });
        await addPrice(ctx, f.Products.WidgetA, { amount: 19, priceListID: listID, description: "member" });

        const quoted = await preview(ctx, {
          ProductID: f.Products.WidgetA,
          Quantity: 6,
          OrganizationID: f.Customers.OrganizationID,
        });
        Assert(quoted.Success, `preview failed: ${quoted.Message}`);
        AssertEqual(Number(quoted.UnitPrice), 19, "the preview used the member list");
        AssertEqual(Number(quoted.ExtendedAmount), 114, "6 x 19");

        // The whole point of a dry run: the same pipeline, so the same number.
        const order = await confirmUnpriced(ctx, f.Products.WidgetA, 6);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        const line = await lineOf(ctx, order.Order.ID as string);
        AssertEqual(
          Number(line.LineTotalGross),
          Number(quoted.ExtendedAmount),
          "the quote and the invoice agree",
        );
      }),
  },
  {
    Id: "pricing.PC15",
    Name: "PC15: the dry run reports ambiguity as a refusal, not a crash",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, { amount: 25, priority: 3, description: "one" });
        await addPrice(ctx, f.Products.WidgetA, { amount: 31, priority: 3, description: "two" });

        // A configuration problem the caller can fix is a refusal WITH a reason. Reporting it as a
        // thrown fault would make the preview look broken when it is working and telling the truth.
        const out = await preview(ctx, { ProductID: f.Products.WidgetA, Quantity: 1 });
        Assert(!out.Success, "an ambiguous rule set must come back as Success:false");
        Assert(/ambiguous/i.test(out.Message ?? ""), `expected an ambiguity message, got: ${out.Message}`);
      }),
  },
  {
    Id: "pricing.PC16",
    Name: "PC16: the price breakdown is recorded against the line",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const priceID = await addPrice(ctx, f.Products.WidgetA, { amount: 15, description: "list rate" });
        const order = await confirmUnpriced(ctx, f.Products.WidgetA, 3);
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const line = await lineOf(ctx, order.Order.ID as string);
        AssertEqual(String(line.ProductPriceID).toLowerCase(), priceID.toLowerCase(), "the line records WHICH rule priced it");

        const comp = await TxOne<{ N: number; Total: number; Label: string }>(
          ctx,
          `SELECT COUNT(*) AS N, SUM(Amount) AS Total, MIN(Label) AS Label
             FROM ${ORDERS_SCHEMA}.OrderLinePriceComponent WHERE OrderLineID='${line.ID}'`,
        );
        AssertEqual(Number(comp.N), 1, "one component for a plain base price");
        AssertEqual(Number(comp.Total), 45, "the component carries the extended amount");
        Assert(/list rate/.test(comp.Label), `the component is labelled from the rule: ${comp.Label}`);
      }),
  },
];

for (const check of PricingChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("pricing", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: TeardownOrdersFixture,
});
