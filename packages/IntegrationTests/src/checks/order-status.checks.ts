/**
 * order-status — the order lifecycle, enforced on the real save path.
 *
 * WHY IT EXISTS
 * `CK_OrderHeader_Status` enforced the legal SET of statuses and nothing enforced the legal MOVES.
 * `Fulfilled → Draft` saved. `Voided → Confirmed` saved. A voided order could come back to life,
 * keep the journal entries its reversal had already unwound, and be shipped — every row valid, the
 * constraint satisfied, and nothing looking.
 *
 * `OrderStatusBehavior` has the table and its own unit tests walk all thirty-six pairs. This bundle
 * proves the table is actually WIRED: that the refusal happens inside `OrderEntityServer.Save`,
 * which is the one path a workflow, a form, an operation and a fixture all go through, and that a
 * refused save leaves the row exactly as it was.
 *
 * THE CHECKS THAT EARN THEIR KEEP
 *   · OS4 — a refused transition ROLLS NOTHING BACK because it never started. The status on disk is
 *     unchanged and, critically, no second journal entry exists.
 *   · OS5 — Voided is final on the real path. This is the one that was exploitable: re-confirming a
 *     voided order would book against a reversal that already stands.
 *   · OS7 — the refusal reaches the caller as a MESSAGE. A bare `false` from a save is how the UI
 *     ends up showing "could not save" for a rule the user could have satisfied.
 *
 * WHAT IT PROVES
 *   OS1   every legal forward move is accepted on the real save path
 *   OS2   a booked order cannot be returned to an editable state
 *   OS3   any live order can be voided
 *   OS4   a refused move changes nothing on disk and books nothing
 *   OS5   Voided is terminal — no status can be reached from it
 *   OS6   a new order may be created directly in a booked status (D17)
 *   OS7   the refusal carries a reason a caller can read
 *   OS8   an unknown status is refused before the CHECK constraint sees it
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: OrderStatusBehavior · OrderEntityServer.passesStatusTransition
 *   DOC:  plans/bizapps-orders-master.md D8, D53
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
  CreateOrdersFixture,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { BuildOrder, ConfirmOrder } from "../order-builder.js";
import type { mjBizAppsOrdersOrderHeaderEntity } from "@mj-biz-apps/orders-entities";

/** Build a saved order sitting in `status`. */
async function orderIn(ctx: IntegrationCheckContext, status: mjBizAppsOrdersOrderHeaderEntity['Status']) {
  const f = Fx();
  const built = await BuildOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 200 }],
  });
  built.Order.Status = status;
  const saved = await built.Order.Save();
  Assert(saved, `could not create an order in ${status}: ${built.Order.LatestResult?.CompleteMessage}`);
  return built.Order;
}

/** Move a saved order, returning whether the save was accepted and what it said. */
// `status` is a plain string ON PURPOSE, unlike `orderIn` above: OS-refusal checks move an order to
// a status that does NOT exist ('Complete') to prove the engine names it rather than letting the CHECK
// constraint answer. Typing this to the entity's union would make the very case under test unwritable.
async function moveTo(
  order: { Status: string; Save(): Promise<boolean>; LatestResult?: { CompleteMessage?: string } },
  status: string,
) {
  order.Status = status;
  const saved = await order.Save();
  return { Saved: saved, Message: order.LatestResult?.CompleteMessage ?? "" };
}

const statusOf = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ Status: string }>(ctx, `SELECT Status FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${orderID}'`);

const entryCount = async (ctx: IntegrationCheckContext, orderID: string) => {
  const rows = await TxQuery<{ N: number }>(
    ctx,
    `SELECT COUNT(*) AS N FROM ${ACCT_SCHEMA}.JournalEntry je
     JOIN ${ORDERS_SCHEMA}.OrderLine l ON LOWER(je.LinkedRecordID) = LOWER(CAST(l.ID AS NVARCHAR(400)))
     WHERE l.OrderHeaderID = '${orderID}'`,
  );
  return Number(rows[0]?.N ?? 0);
};

export const OrderStatusChecks: NamedCheck[] = [
  {
    Id: "order-status.OS1",
    Name: "OS1: every legal forward move is accepted on the real save path",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Draft → Quoted → Draft → Confirmed → Posted → Fulfilled, each through OrderEntityServer.
        const order = await orderIn(ctx, "Draft");
        for (const next of ["Quoted", "Draft", "Confirmed", "Posted", "Fulfilled"]) {
          const result = await moveTo(order as never, next);
          Assert(result.Saved, `${next} should be reachable: ${result.Message}`);
          AssertEqual((await statusOf(ctx, order.ID as string)).Status, next, `and persisted as ${next}`);
        }
      }),
  },
  {
    Id: "order-status.OS2",
    Name: "OS2: a booked order cannot be returned to an editable state",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Confirm books journal entries (D8). Going back to Draft would leave those entries standing
        // against an order somebody is now editing underneath them.
        const confirmed = await ConfirmOrder(ctx.User, {
          CompanyID: Fx().CoA.ID,
          BillToOrganizationID: Fx().Customers.OrganizationID,
          Lines: [{ ProductID: Fx().Products.WidgetA, Quantity: 1, UnitPrice: 200 }],
        });
        Assert(confirmed.Saved, `confirm failed: ${confirmed.Message}`);

        for (const editable of ["Draft", "Quoted"]) {
          const result = await moveTo(confirmed.Order as never, editable);
          AssertEqual(result.Saved, false, `Confirmed must not become ${editable}`);
          AssertEqual(
            (await statusOf(ctx, confirmed.Order.ID as string)).Status,
            "Confirmed",
            "and the row is untouched",
          );
        }
      }),
  },
  {
    Id: "order-status.OS3",
    Name: "OS3: any live order can be voided",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        for (const from of ["Draft", "Quoted"] as const) {
          const order = await orderIn(ctx, from);
          const result = await moveTo(order as never, "Voided");
          Assert(result.Saved, `${from} should be voidable: ${result.Message}`);
        }
      }),
  },
  {
    Id: "order-status.OS4",
    Name: "OS4: a refused move changes nothing on disk and books nothing",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const confirmed = await ConfirmOrder(ctx.User, {
          CompanyID: Fx().CoA.ID,
          BillToOrganizationID: Fx().Customers.OrganizationID,
          Lines: [{ ProductID: Fx().Products.WidgetA, Quantity: 1, UnitPrice: 350 }],
        });
        Assert(confirmed.Saved, `confirm failed: ${confirmed.Message}`);
        const orderID = confirmed.Order.ID as string;
        const before = await entryCount(ctx, orderID);
        Assert(before > 0, "the confirm booked something to begin with");

        const refused = await moveTo(confirmed.Order as never, "Draft");
        AssertEqual(refused.Saved, false, "the move is refused");

        // The refusal happens BEFORE the save opens a transaction, so there is nothing to roll back —
        // and nothing partially applied. Both halves are asserted because "refused" and "refused
        // cleanly" are different claims.
        AssertEqual((await statusOf(ctx, orderID)).Status, "Confirmed", "the status on disk is unchanged");
        AssertEqual(await entryCount(ctx, orderID), before, "and no second entry was booked");
      }),
  },
  {
    Id: "order-status.OS5",
    Name: "OS5: Voided is terminal on the real save path",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // THE ONE THAT WAS EXPLOITABLE. Re-confirming a voided order books against a reversal that
        // already stands — the customer is charged twice and both records look correct.
        const order = await orderIn(ctx, "Draft");
        Assert((await moveTo(order as never, "Voided")).Saved, "the order voids");

        for (const target of ["Draft", "Quoted", "Confirmed", "Posted", "Fulfilled"]) {
          const result = await moveTo(order as never, target);
          AssertEqual(result.Saved, false, `Voided must not become ${target}`);
          AssertEqual((await statusOf(ctx, order.ID as string)).Status, "Voided", "and stays voided");
        }
      }),
  },
  {
    Id: "order-status.OS6",
    Name: "OS6: a new order may be created directly in a booked status",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Back-office entry of something that already happened (D17). A guard that only understood
        // moves would refuse this, because a new row has no previous status to move FROM.
        const order = await orderIn(ctx, "Confirmed");
        AssertEqual((await statusOf(ctx, order.ID as string)).Status, "Confirmed", "created as Confirmed");
        Assert(await entryCount(ctx, order.ID as string) > 0, "and it booked, rather than being a status-only write");
      }),
  },
  {
    Id: "order-status.OS7",
    Name: "OS7: the refusal carries a reason a caller can read",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // A bare `false` from a save is how a UI ends up showing "could not save" for a rule the user
        // could have satisfied. The message has to name both ends and the way out.
        const order = await orderIn(ctx, "Draft");
        Assert((await moveTo(order as never, "Voided")).Saved, "the order voids");

        const refused = await moveTo(order as never, "Confirmed");
        AssertEqual(refused.Saved, false, "refused");
        Assert(/voided/i.test(refused.Message), `the message names the state it is in: ${refused.Message}`);
        Assert(/final/i.test(refused.Message), `and says it is final: ${refused.Message}`);
      }),
  },
  {
    Id: "order-status.OS8",
    Name: "OS8: an unknown status is refused before the CHECK constraint sees it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The constraint would catch it a moment later with a message naming a constraint rather than
        // a status, which tells the caller nothing about what they should have written.
        const order = await orderIn(ctx, "Draft");
        const refused = await moveTo(order as never, "Complete");
        AssertEqual(refused.Saved, false, "refused");
        Assert(
          /not an order status/i.test(refused.Message),
          `named as an unknown status rather than a constraint violation: ${refused.Message}`,
        );
        Assert(/Draft/.test(refused.Message), "and the legal values are listed");
      }),
  },
];

for (const check of OrderStatusChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("order-status", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: TeardownOrdersFixture,
});
