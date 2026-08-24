/**
 * advance-order-state — `Orders.AdvanceOrderState` (D17).
 *
 * WHAT IT IS FOR
 * Back-office entry of something that has ALREADY happened: a counter sale, a shipment that went out
 * before anyone opened the system, a migration. The order lands in its final state without a human
 * clicking through the ladder.
 *
 * WHAT CHANGED, AND WHY THIS BUNDLE SHRANK IN SCOPE
 * This was `create-in-state`, covering an operation that took an `OrderDraft`, CREATED the order by
 * delegating to `Orders.ConfirmOrder`, and then advanced it. Composing and booking an order is now
 * `order.Save()` through MJ's entity graph — the checks for that live in `order-booking` and
 * `composition`, exercised through the same `ConfirmOrder` builder every other bundle uses. What is
 * left here is the part a save cannot do, and it is the part worth guarding.
 *
 * THE ONE THAT MATTERS
 * ADV8. The tempting implementation is a single UPDATE setting `Status = 'Fulfilled'`. It is faster,
 * it passes any check that reads the order's own fields, and applied to an order that never
 * confirmed it produces something that looks complete with **no ledger behind it** — the failure
 * nothing downstream can detect, because the order reconciles perfectly against itself and the
 * revenue simply never existed. ADV8 asserts the operation refuses to touch such an order at all.
 *
 * WHAT IT PROVES
 *   ADV1   Confirmed advances to Posted, and books exactly once
 *   ADV2   the ledger survives the climb — entries exist, per line, and balance
 *   ADV3   Fulfilled marks the fulfillable LINES, not just the header
 *   ADV4   an order with nothing to ship reaches Fulfilled anyway (D15)
 *   ADV5   the transition trail records every step taken
 *   ADV6   Draft, Quoted and Confirmed are refused — those are reached by saving the order
 *   ADV7   Voided is refused
 *   ADV8   an unbooked order is refused outright, and is not moved
 *   ADV9   a Reason is recorded on the order that skipped the usual path
 *   ADV10  advancing writes NO additional journal entry (D15)
 *   ADV11  re-advancing an order that is already there succeeds and changes nothing
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: AdvanceOrderStateOperation · FulfillmentBehavior · OrderEntityServer.Save
 *   DOC:  plans/archive/bizapps-orders-master.md D17, D15
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
  CreateProductPrice,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
  upsertViaEntity,
} from "../fixture.js";
import { BuildOrder, ConfirmOrder, type OrderSpec } from "../order-builder.js";
import { PRODUCT_TYPE_ENTITY } from "../entity-names.js";

interface AdvanceOutput {
  Success: boolean;
  Message?: string | null;
  OrderHeaderID?: string | null;
  OrderNumber?: string | null;
  Status?: string | null;
  RequestedStatus?: string | null;
  Transitions?: Array<{ From: string; To: string; Applied: boolean; Reason?: string | null }>;
  EntryCount?: number;
  AllBalanced?: boolean;
  UnfulfilledLineCount?: number;
  Blockers?: Array<{ Code: string; Message: string }>;
}

async function advance(
  ctx: IntegrationCheckContext,
  input: Record<string, unknown>,
): Promise<AdvanceOutput> {
  const op = MJGlobal.Instance.ClassFactory.CreateInstance<
    BaseRemotableOperation<Record<string, unknown>, AdvanceOutput>
  >(BaseRemotableOperation, "Orders.AdvanceOrderState");
  Assert(op != null, "'Orders.AdvanceOrderState' is not registered");
  const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
  Assert(result.Success, `the operation did not execute: ${result.ErrorMessage ?? "unknown"}`);
  return result.Output as AdvanceOutput;
}

/** A one-line order spec against the fixture's plain product. */
function spec(price = 200, productKey = "WidgetA"): OrderSpec {
  const f = Fx();
  return {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: [{ ProductID: f.Products[productKey], Quantity: 1, UnitPrice: price }],
  };
}

/**
 * Book an order and return its ID — the state every check here starts from.
 *
 * Going through the ENTITY rather than a remote operation is the point: this is the path the browser
 * takes now, so the orders these checks advance are the orders the application actually produces.
 */
async function booked(ctx: IntegrationCheckContext, price = 200): Promise<string> {
  const built = await ConfirmOrder(ctx.User, spec(price));
  Assert(built.Saved, `the fixture order must confirm: ${built.Message}`);
  return built.Order.ID as string;
}

/** Make the fixture's plain type require fulfilment, so there is something to ship. */
async function makeShippable(ctx: IntegrationCheckContext): Promise<void> {
  await upsertViaEntity(ctx, PRODUCT_TYPE_ENTITY, Fx().ProductTypeIDs.Simple, {
    RequiresFulfillment: true,
  });
}

const entriesOf = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<{ EntryID: string; D: number; C: number }>(
    ctx,
    `SELECT je.ID AS EntryID, SUM(ISNULL(jel.DebitAmount,0)) AS D, SUM(ISNULL(jel.CreditAmount,0)) AS C
       FROM ${ACCT_SCHEMA}.vwJournalEntries je
       JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
      WHERE je.LinkedRecordID IN
            (SELECT CAST(ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}')
      GROUP BY je.ID`,
  );

const headerOf = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ Status: string; FulfillmentStatus: string; OrderDate: string; TotalGross: number; Description: string | null }>(
    ctx,
    `SELECT Status, FulfillmentStatus, OrderDate, TotalGross, Description FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${orderID}'`,
  );

export const AdvanceOrderStateChecks: NamedCheck[] = [
  {
    Id: "advance-order-state.ADV1",
    Name: "ADV1: Confirmed advances to Fulfilled, and books exactly once",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const id = await booked(ctx);
        const out = await advance(ctx, { OrderHeaderID: id, TargetStatus: "Fulfilled" });
        Assert(out.Success, `advance failed: ${out.Message} ${JSON.stringify(out.Blockers)}`);
        AssertEqual(out.Status, "Fulfilled", "reached Fulfilled");
        AssertEqual((await headerOf(ctx, id)).FulfillmentStatus, "Fulfilled", "and it stuck");

        // Booking fires on the FIRST lock transition. Advancing past it must not book again, or the
        // revenue would be counted twice and both entries would balance.
        const bookings = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ACCT_SCHEMA}.vwJournalEntries je
            WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'OrderBooking'
              AND je.LinkedRecordID IN
                  (SELECT CAST(ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${id}')`,
        );
        AssertEqual(Number(bookings.N), 1, "one booking entry for one line");
      }),
  },
  {
    Id: "advance-order-state.ADV2",
    Name: "ADV2: the ledger survives the climb — entries exist and balance",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const id = await booked(ctx, 350);
        const out = await advance(ctx, { OrderHeaderID: id, TargetStatus: "Fulfilled" });
        Assert(out.Success, `advance failed: ${out.Message} ${JSON.stringify(out.Blockers)}`);

        // The operation reports the ledger it did not write. Reporting zero because nobody looked is
        // indistinguishable from an order that never booked, which is the state ADV8 exists to refuse.
        const entries = await entriesOf(ctx, id);
        Assert(entries.length > 0, "the order booked at least one entry");
        Assert(
          entries.every((e) => Math.abs(Number(e.D) - Number(e.C)) < 0.005),
          `every entry balances: ${JSON.stringify(entries)}`,
        );
        AssertEqual(out.AllBalanced, true, "and the output says so");
        AssertEqual(Number(out.EntryCount ?? 0), entries.length, "with the real entry count");
      }),
  },
  {
    Id: "advance-order-state.ADV3",
    Name: "ADV3: Fulfilled marks the fulfillable LINES, not just the header",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await makeShippable(ctx);
        const id = await booked(ctx);
        const out = await advance(ctx, { OrderHeaderID: id, TargetStatus: "Fulfilled" });
        Assert(out.Success, `advance failed: ${out.Message} ${JSON.stringify(out.Transitions)}`);
        AssertEqual(out.Status, "Fulfilled", "the header advanced");

        // A header reading Fulfilled over Pending lines is a promise the system claims to have kept
        // and has no record of — and the queue would keep offering those lines forever.
        const pending = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderLine
            WHERE OrderHeaderID='${id}' AND ISNULL(FulfillmentStatus,'Pending')='Pending'`,
        );
        AssertEqual(Number(pending.N), 0, "and no line was left Pending");
        AssertEqual(Number(out.UnfulfilledLineCount ?? 0), 0, "reported as none outstanding");
      }),
  },
  {
    Id: "advance-order-state.ADV4",
    Name: "ADV4: an order with nothing to ship reaches Fulfilled anyway (D15)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Deliberately NOT calling makeShippable — the Simple type requires no fulfilment. Waiting
        // for a shipment that can never happen would strand every service and subscription order.
        const id = await booked(ctx);
        const out = await advance(ctx, { OrderHeaderID: id, TargetStatus: "Fulfilled" });
        Assert(out.Success, `advance failed: ${out.Message} ${JSON.stringify(out.Transitions)}`);
        AssertEqual(out.Status, "Fulfilled", "it advanced with nothing to ship");
      }),
  },
  {
    Id: "advance-order-state.ADV5",
    Name: "ADV5: the transition trail records every step taken",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const id = await booked(ctx);
        const out = await advance(ctx, { OrderHeaderID: id, TargetStatus: "Fulfilled" });
        Assert(out.Success, `advance failed: ${out.Message}`);

        const steps = out.Transitions ?? [];
        Assert(steps.length >= 1, `step is recorded: ${JSON.stringify(steps)}`);
        Assert(
          steps.some((t) => t.From === "Pending" && t.To === "Fulfilled" && t.Applied),
          "the Fulfilled step is recorded as applied",
        );
      }),
  },
  {
    Id: "advance-order-state.ADV6",
    Name: "ADV6: Draft, Quoted and Confirmed are refused — those are reached by saving",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const id = await booked(ctx);
        const before = (await headerOf(ctx, id)).Status;
        for (const target of ["Draft", "Quoted", "Confirmed", "Posted"]) {
          const out = await advance(ctx, { OrderHeaderID: id, TargetStatus: target });
          AssertEqual(out.Success, false, `${target} is refused`);
          Assert(
            (out.Blockers ?? []).some((b) => b.Code === "UNSUPPORTED_TARGET"),
            `named as unsupported: ${JSON.stringify(out.Blockers)}`,
          );
        }
        // Confirmed in particular: routing it here would move an order without running the booking
        // walk that a save runs on the way through.
        AssertEqual((await headerOf(ctx, id)).Status, before, "and the order did not move");
      }),
  },
  {
    Id: "advance-order-state.ADV7",
    Name: "ADV7: Voided is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const id = await booked(ctx);
        const out = await advance(ctx, { OrderHeaderID: id, TargetStatus: "Voided" });
        AssertEqual(out.Success, false, "refused");
        // Voiding is a separate decision about an existing order, not a rung on this ladder.
        AssertEqual((await headerOf(ctx, id)).Status, "Confirmed", "and the order did not move");
      }),
  },
  {
    Id: "advance-order-state.ADV8",
    Name: "ADV8: an unbooked order is refused outright, and is not moved",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // A Draft order that saved but never confirmed: it exists, it has lines, and it has NO
        // ledger. Advancing it would produce an order reading Fulfilled with revenue that never
        // existed — reconciling perfectly against itself, and detectable by nothing downstream.
        const built = await BuildOrder(ctx.User, spec());
        Assert(
          await built.Order.Save(),
          `the draft must save: ${built.Order.LatestResult?.CompleteMessage ?? "no reason given"}`,
        );
        const id = built.Order.ID as string;

        const out = await advance(ctx, { OrderHeaderID: id, TargetStatus: "Fulfilled" });
        AssertEqual(out.Success, false, "the advance is refused");
        Assert(
          (out.Blockers ?? []).some((b) => b.Code === "NOT_CONFIRMED"),
          `named as unconfirmed: ${JSON.stringify(out.Blockers)}`,
        );
        AssertEqual((await headerOf(ctx, id)).Status, "Draft", "and the order is still a Draft");
        AssertEqual((await entriesOf(ctx, id)).length, 0, "with no ledger invented for it");
      }),
  },
  {
    Id: "advance-order-state.ADV9",
    Name: "ADV9: a Reason is recorded on the order that skipped the usual path",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // An imported order looks identical to one a human clicked through. The row has to say which
        // it was, or nobody auditing it later can tell.
        const id = await booked(ctx);
        const out = await advance(ctx, {
          OrderHeaderID: id,
          TargetStatus: "Fulfilled",
          Reason: "Migrated from the counter system",
        });
        Assert(out.Success, `advance failed: ${out.Message}`);
        const header = await headerOf(ctx, id);
        Assert(
          (header.Description ?? "").includes("Migrated from the counter system"),
          `the reason is on the order: ${header.Description}`,
        );
      }),
  },
  {
    Id: "advance-order-state.ADV10",
    Name: "ADV10: advancing to Fulfilled writes NO additional journal entry (D15)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await makeShippable(ctx);
        const id = await booked(ctx);
        const afterConfirm = (await entriesOf(ctx, id)).length;
        Assert(afterConfirm > 0, "the confirm booked something to compare against");

        const out = await advance(ctx, { OrderHeaderID: id, TargetStatus: "Fulfilled" });
        Assert(out.Success, `advance failed: ${out.Message} ${JSON.stringify(out.Transitions)}`);

        // Fulfilment is a logistics fact — if reaching it added an entry, a warehouse delay could
        // restate a closed period. Same order, before and after, so nothing else can explain a change.
        AssertEqual((await entriesOf(ctx, id)).length, afterConfirm, "advancing books nothing extra");
      }),
  },
  {
    Id: "advance-order-state.ADV11",
    Name: "ADV11: re-advancing an order that is already there succeeds and changes nothing",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // A migration that dies half way gets re-run. Reporting a failure for the orders that already
        // landed would make a resumed import indistinguishable from a broken one.
        const id = await booked(ctx);
        Assert((await advance(ctx, { OrderHeaderID: id, TargetStatus: "Fulfilled" })).Success, "first advance");
        const entries = (await entriesOf(ctx, id)).length;

        const again = await advance(ctx, { OrderHeaderID: id, TargetStatus: "Fulfilled" });
        AssertEqual(again.Success, true, "the second advance is not an error");
        AssertEqual(again.Status, "Fulfilled", "and the order is where it was asked to be");
        AssertEqual((await entriesOf(ctx, id)).length, entries, "with no second booking");
      }),
  },
];

for (const check of AdvanceOrderStateChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("advance-order-state", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
    await CreateProductPrice(ctx, Fx().Products.WidgetA, 200);
  },
  Teardown: TeardownOrdersFixture,
});
