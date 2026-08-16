/**
 * fulfillment — the shipping queue and the flip that closes an order (D15).
 *
 * WHAT FULFILMENT IS, AND IS NOT
 * A logistics fact. NO journal entry fires on Posted → Fulfilled: revenue was settled at booking and
 * releases on its own schedule. "Revenue on delivery" is the intuition everyone brings, and acting
 * on it would let a warehouse delay silently restate a closed period — so FU8 asserts the ledger is
 * untouched, which is the check that would catch anyone wiring the two together.
 *
 * THE CASE THIS IS BUILT AROUND
 * A MIXED order: one physical line, one subscription. Testing "are all lines Fulfilled?" passes
 * every single-kind order and holds every mixed one open forever, because the subscription line
 * never flips — it has nothing to flip. FU5 is that case, from the direction that fails.
 *
 * WHAT IT PROVES
 *   FU1   a confirmed order with a physical line appears in the queue
 *   FU2   an order with nothing to ship never appears (auto-advance, D15)
 *   FU3   flipping the last line advances the order to Fulfilled
 *   FU4   a partly-worked order stays put and reports what remains
 *   FU5   a MIXED order advances once its shippable lines are done
 *   FU6   a second flip of the same line is refused, with a reason
 *   FU7   refusals are per line — good scans in the same batch still land
 *   FU8   fulfilment writes NO journal entry
 *   FU9   AllOrNothing refuses the batch and changes nothing
 *   FU10  a reversal line is not shippable and never queues
 *   FU11  a bundle's rollup parent never queues; its children do
 *   FU12  a fulfilled order leaves the queue
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: FulfillmentBehavior · GetFulfillmentQueueOperation · FulfillOrderLinesOperation
 *   PURE: packages/CoreEntitiesServer/src/__tests__/FulfillmentBehavior.test.ts
 *   DOC:  plans/archive/bizapps-orders-master.md D15
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
  CreateBundleItem,
  CreateOrdersFixture,
  CreateProductPrice,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
  upsertViaEntity,
} from "../fixture.js";
import { PRODUCT_TYPE_ENTITY } from "../entity-names.js";
import { ConfirmOrder } from "../order-builder.js";

interface QueueOrder {
  OrderHeaderID: string;
  OrderNumber: string;
  FulfillableCount: number;
  Lines: Array<{ OrderLineID: string; ProductName: string; FulfillmentStatus: string; Quantity: number }>;
}

interface QueueOutput {
  Success: boolean;
  Message?: string;
  Orders: QueueOrder[];
  OrderCount: number;
  AwaitingLineCount: number;
}

interface FlipOutput {
  Success: boolean;
  Message?: string;
  Lines: Array<{ OrderLineID: string; Fulfilled: boolean; Refusal?: string | null; RefusalReason?: string | null }>;
  Orders: Array<{
    OrderHeaderID: string;
    StatusBefore: string;
    StatusAfter: string;
    AdvancedToFulfilled: boolean;
    RemainingLineCount: number;
  }>;
  FulfilledCount: number;
  RefusedCount: number;
  AdvancedCount: number;
}

async function run<T>(ctx: IntegrationCheckContext, key: string, input: Record<string, unknown>): Promise<T> {
  const op = MJGlobal.Instance.ClassFactory.CreateInstance<
    BaseRemotableOperation<Record<string, unknown>, T>
  >(BaseRemotableOperation, key);
  Assert(op != null, `'${key}' is not registered`);
  const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
  Assert(result.Success, `the operation did not execute: ${result.ErrorMessage ?? "unknown"}`);
  return result.Output as T;
}

const queue = (ctx: IntegrationCheckContext, input: Record<string, unknown> = {}) =>
  run<QueueOutput>(ctx, "Orders.GetFulfillmentQueue", input);

const flip = (ctx: IntegrationCheckContext, input: Record<string, unknown>) =>
  run<FlipOutput>(ctx, "Orders.FulfillOrderLines", input);

/**
 * Make the fixture's plain product require fulfilment.
 *
 * The fixture's Simple type does NOT require it — most of the suite is about money, not logistics —
 * so this bundle flips the type for its own run. Through the object model, and reverted by the
 * enclosing rollback like everything else.
 */
async function makeShippable(ctx: IntegrationCheckContext): Promise<void> {
  const f = Fx();
  await upsertViaEntity(ctx, PRODUCT_TYPE_ENTITY, f.ProductTypeIDs.Simple, { RequiresFulfillment: true });
}

const linesOf = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<{ ID: string; ProductID: string; FulfillmentStatus: string | null; IsRollupParent: boolean }>(
    ctx,
    `SELECT ID, ProductID, FulfillmentStatus, IsRollupParent FROM ${ORDERS_SCHEMA}.OrderLine
      WHERE OrderHeaderID='${orderID}' ORDER BY LineNumber`,
  );

const statusOf = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ Status: string }>(ctx, `SELECT Status FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${orderID}'`);

/** Confirm an order of `spec` lines. */
async function sell(ctx: IntegrationCheckContext, spec: Array<[string, number]>) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: spec.map(([product, price]) => ({ ProductID: f.Products[product], Quantity: 1, UnitPrice: price })),
  });
  Assert(result.Saved, `confirm failed: ${result.Message}`);
  return result;
}

const mine = (out: QueueOutput, orderID: string) =>
  out.Orders.find((o) => o.OrderHeaderID.toLowerCase() === orderID.toLowerCase());

export const FulfillmentChecks: NamedCheck[] = [
  {
    Id: "fulfillment.FU1",
    Name: "FU1: a confirmed order with a physical line appears in the queue",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await makeShippable(ctx);
        const order = await sell(ctx, [["WidgetA", 100]]);

        const out = await queue(ctx);
        const row = mine(out, order.Order.ID as string);
        Assert(row != null, `the order should be queued: ${JSON.stringify(out.Orders.map((o) => o.OrderNumber))}`);
        AssertEqual(row!.Lines.length, 1, "one line to ship");
        AssertEqual(row!.FulfillableCount, 1, "and one fulfillable line in total");
        AssertEqual(row!.Lines[0].FulfillmentStatus, "Pending", "still pending");
      }),
  },
  {
    Id: "fulfillment.FU2",
    Name: "FU2: an order with nothing to ship never appears (D15 auto-advance)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Deliberately NOT calling makeShippable — the Simple type requires no fulfilment.
        const order = await sell(ctx, [["WidgetA", 100]]);
        const out = await queue(ctx);
        Assert(
          mine(out, order.Order.ID as string) == null,
          "an order with nothing to ship must not sit in a queue waiting for a person",
        );
      }),
  },
  {
    Id: "fulfillment.FU3",
    Name: "FU3: flipping the last line advances the order to Fulfilled",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await makeShippable(ctx);
        const order = await sell(ctx, [["WidgetA", 100]]);
        const [line] = await linesOf(ctx, order.Order.ID as string);

        const out = await flip(ctx, { OrderLineIDs: [line.ID] });
        AssertEqual(out.FulfilledCount, 1, "the line shipped");
        AssertEqual(out.AdvancedCount, 1, "and the order closed out");
        AssertEqual(out.Orders[0].StatusAfter, "Fulfilled", "status advanced");
        AssertEqual(out.Orders[0].RemainingLineCount, 0, "nothing left");

        AssertEqual((await statusOf(ctx, order.Order.ID as string)).Status, "Fulfilled", "and it stuck");
      }),
  },
  {
    Id: "fulfillment.FU4",
    Name: "FU4: a partly-worked order stays put and reports what remains",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await makeShippable(ctx);
        const order = await sell(ctx, [["WidgetA", 100], ["WidgetA", 50]]);
        const lines = await linesOf(ctx, order.Order.ID as string);

        const out = await flip(ctx, { OrderLineIDs: [lines[0].ID] });
        AssertEqual(out.FulfilledCount, 1, "one shipped");
        AssertEqual(out.AdvancedCount, 0, "the order does NOT advance");
        AssertEqual(out.Orders[0].RemainingLineCount, 1, "and it says how many are left");

        const status = await statusOf(ctx, order.Order.ID as string);
        Assert(status.Status !== "Fulfilled", `still open, got ${status.Status}`);
      }),
  },
  {
    Id: "fulfillment.FU5",
    Name: "FU5: a MIXED order advances once its SHIPPABLE lines are done",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await makeShippable(ctx);
        // WidgetA ships; SubRolling is a subscription and never will.
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            { ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 100 },
            { ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 },
          ],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        const lines = await linesOf(ctx, result.Order.ID as string);
        const shippable = lines.filter((l) => l.ProductID.toLowerCase() === f.Products.WidgetA.toLowerCase());
        AssertEqual(shippable.length, 1, "one shippable line");

        const out = await flip(ctx, { OrderLineIDs: [shippable[0].ID] });
        // THE ASSERTION THAT MATTERS. "Every line Fulfilled" would be false here forever — the
        // subscription line has nothing to flip — and the order would never close.
        AssertEqual(out.AdvancedCount, 1, `a mixed order must advance: ${JSON.stringify(out.Orders)}`);
        AssertEqual((await statusOf(ctx, result.Order.ID as string)).Status, "Fulfilled", "and it stuck");
      }),
  },
  {
    Id: "fulfillment.FU6",
    Name: "FU6: a second flip of the same line is refused, with a reason",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await makeShippable(ctx);
        const order = await sell(ctx, [["WidgetA", 100]]);
        const [line] = await linesOf(ctx, order.Order.ID as string);

        await flip(ctx, { OrderLineIDs: [line.ID] });
        const again = await flip(ctx, { OrderLineIDs: [line.ID] });

        AssertEqual(again.FulfilledCount, 0, "nothing shipped twice");
        AssertEqual(again.RefusedCount, 1, "and it was refused");
        AssertEqual(again.Lines[0].Refusal, "AlreadyFulfilled", "for the right reason");
        Assert(
          (again.Lines[0].RefusalReason ?? "").includes(line.ID),
          `the reason should name the line: ${again.Lines[0].RefusalReason}`,
        );
      }),
  },
  {
    Id: "fulfillment.FU7",
    Name: "FU7: refusals are per line — good scans in the same batch still land",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await makeShippable(ctx);
        const order = await sell(ctx, [["WidgetA", 100], ["WidgetA", 50]]);
        const lines = await linesOf(ctx, order.Order.ID as string);

        await flip(ctx, { OrderLineIDs: [lines[0].ID] }); // already shipped
        const batch = await flip(ctx, { OrderLineIDs: [lines[0].ID, lines[1].ID] });

        // A picker who scans one already-shipped item should not lose the other nine scans.
        AssertEqual(batch.FulfilledCount, 1, "the good scan landed");
        AssertEqual(batch.RefusedCount, 1, "the repeat was refused");
        AssertEqual(batch.AdvancedCount, 1, "and the order still closed out");
      }),
  },
  {
    Id: "fulfillment.FU8",
    Name: "FU8: fulfilment writes NO journal entry (D15)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await makeShippable(ctx);
        const order = await sell(ctx, [["WidgetA", 100]]);
        const [line] = await linesOf(ctx, order.Order.ID as string);

        const before = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ACCT_SCHEMA}.JournalEntry je
            WHERE je.LinkedRecordID IN
                  (SELECT CAST(ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}')`,
        );
        await flip(ctx, { OrderLineIDs: [line.ID] });
        const after = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ACCT_SCHEMA}.JournalEntry je
            WHERE je.LinkedRecordID IN
                  (SELECT CAST(ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}')`,
        );

        // Revenue was settled at booking and releases on its own schedule. If shipping moved the
        // ledger, a warehouse delay could restate a closed period.
        AssertEqual(Number(after.N), Number(before.N), "shipping must not touch the ledger");
      }),
  },
  {
    Id: "fulfillment.FU9",
    Name: "FU9: AllOrNothing refuses the batch and changes nothing",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await makeShippable(ctx);
        const order = await sell(ctx, [["WidgetA", 100], ["WidgetA", 50]]);
        const lines = await linesOf(ctx, order.Order.ID as string);

        await flip(ctx, { OrderLineIDs: [lines[0].ID] });
        const batch = await flip(ctx, {
          OrderLineIDs: [lines[0].ID, lines[1].ID],
          AllOrNothing: true,
        });

        AssertEqual(batch.Success, false, "the batch is refused");
        AssertEqual(batch.FulfilledCount, 0, "and nothing moved");

        const after = await linesOf(ctx, order.Order.ID as string);
        const stillPending = after.filter((l) => (l.FulfillmentStatus ?? "Pending") === "Pending");
        AssertEqual(stillPending.length, 1, "the untouched line is still pending");
      }),
  },
  {
    Id: "fulfillment.FU10",
    Name: "FU10: a reversal line is not shippable and never queues",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await makeShippable(ctx);
        const sale = await sell(ctx, [["WidgetA", 100]]);
        const [sold] = await linesOf(ctx, sale.Order.ID as string);
        await flip(ctx, { OrderLineIDs: [sold.ID] });

        const ret = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            { ProductID: f.Products.WidgetA, Quantity: -1, UnitPrice: 100, ReversesOrderLineID: sold.ID },
          ],
        });
        Assert(ret.Saved, `return failed: ${ret.Message}`);

        // Goods coming BACK are tracked on the line they reverse. Queuing a credit for shipping
        // would put work in front of a picker that does not exist.
        const out = await queue(ctx);
        Assert(mine(out, ret.Order.ID as string) == null, "a credit memo is not shippable work");

        const [credit] = await linesOf(ctx, ret.Order.ID as string);
        const refused = await flip(ctx, { OrderLineIDs: [credit.ID] });
        AssertEqual(refused.Lines[0].Refusal, "IsReversal", "and flipping one is refused by name");
      }),
  },
  {
    Id: "fulfillment.FU11",
    Name: "FU11: a bundle's rollup parent never queues; its children do",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await makeShippable(ctx);
        await CreateProductPrice(ctx, f.Products.BundlePartX, 75);
        await CreateProductPrice(ctx, f.Products.BundlePartY, 25);
        await CreateBundleItem(ctx, f.Products.BundleA, f.Products.BundlePartX, { SortOrder: 10 });
        await CreateBundleItem(ctx, f.Products.BundleA, f.Products.BundlePartY, { SortOrder: 20 });

        const order = await sell(ctx, [["BundleA", 100]]);
        const lines = await linesOf(ctx, order.Order.ID as string);
        const parent = lines.find((l) => l.IsRollupParent)!;

        const out = await queue(ctx);
        const row = mine(out, order.Order.ID as string);
        Assert(row != null, "the components are shippable work");
        Assert(
          !row!.Lines.some((l) => l.OrderLineID.toLowerCase() === parent.ID.toLowerCase()),
          "the parent carries no goods of its own and must not be queued",
        );
        AssertEqual(row!.Lines.length, 2, "the two components are");

        const refused = await flip(ctx, { OrderLineIDs: [parent.ID] });
        AssertEqual(refused.Lines[0].Refusal, "IsRollupParent", "and flipping the parent is refused by name");
      }),
  },
  {
    Id: "fulfillment.FU12",
    Name: "FU12: a fulfilled order leaves the queue",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await makeShippable(ctx);
        const order = await sell(ctx, [["WidgetA", 100]]);
        const [line] = await linesOf(ctx, order.Order.ID as string);

        Assert(mine(await queue(ctx), order.Order.ID as string) != null, "queued before");
        await flip(ctx, { OrderLineIDs: [line.ID] });
        Assert(
          mine(await queue(ctx), order.Order.ID as string) == null,
          "a queue is work TO DO — finished orders must leave it, or a real backlog gets missed",
        );
      }),
  },
];

for (const check of FulfillmentChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("fulfillment", {
  Setup: async (ctx) => { await CreateOrdersFixture(ctx); },
  Teardown: TeardownOrdersFixture,
});
