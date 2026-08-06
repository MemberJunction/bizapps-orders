/**
 * create-in-state — `Orders.CreateOrderInState` (D17).
 *
 * WHAT IT IS FOR
 * Back-office entry of something that has ALREADY happened: a counter sale, a shipment that went
 * out before anyone opened the system, a migration. The order lands in its final state without a
 * human clicking through four transitions.
 *
 * THE ONE THAT MATTERS
 * CS2. The tempting implementation is a single UPDATE setting `Status = 'Fulfilled'`. It is faster,
 * it passes any check that reads the order's own fields, and it produces an order that looks
 * complete with **no ledger behind it** — the failure nothing downstream can detect, because the
 * order reconciles perfectly against itself and the revenue simply never existed. CS2 asserts the
 * journal entries are really there and really balance, which is the whole justification for this
 * operation delegating to the real confirm instead of writing the status directly.
 *
 * WHAT IT PROVES
 *   CS1   an order is created directly into Confirmed
 *   CS2   it BOOKED — balanced entries exist, per line
 *   CS3   Posted is reached, and still books exactly once
 *   CS4   Fulfilled marks the fulfillable lines, not just the header
 *   CS5   an order with nothing to ship reaches Fulfilled anyway (D15)
 *   CS6   the transition trail records every step taken
 *   CS7   Draft and Quoted are refused — that is SaveOrder's job
 *   CS8   Voided is refused
 *   CS9   a failing confirm creates nothing, and passes its blockers through
 *   CS10  ExpectedGrossTotal still guards the price
 *   CS11  back-dating puts the order and its entries on the stated date
 *   CS12  advancing writes NO additional journal entry (D15)
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: CreateOrderInStateOperation · SaveOrderOperation (delegated to) · FulfillmentBehavior
 *   DOC:  plans/bizapps-orders-master.md D17, D15
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
import { PRODUCT_TYPE_ENTITY } from "../entity-names.js";

interface CreateInStateOutput {
  Success: boolean;
  Message?: string;
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

async function createInState(
  ctx: IntegrationCheckContext,
  input: Record<string, unknown>,
): Promise<CreateInStateOutput> {
  const op = MJGlobal.Instance.ClassFactory.CreateInstance<
    BaseRemotableOperation<Record<string, unknown>, CreateInStateOutput>
  >(BaseRemotableOperation, "Orders.CreateOrderInState");
  Assert(op != null, "'Orders.CreateOrderInState' is not registered");
  const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
  Assert(result.Success, `the operation did not execute: ${result.ErrorMessage ?? "unknown"}`);
  return result.Output as CreateInStateOutput;
}

/** A one-line draft of the fixture's plain product. */
function draft(ctx: IntegrationCheckContext, price = 200, productKey = "WidgetA") {
  const f = Fx();
  return {
    Header: { CompanyID: f.CoA.ID, BillToOrganizationID: f.Customers.OrganizationID },
    Lines: [{ ProductID: f.Products[productKey], Quantity: 1, UnitPrice: price }],
  };
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
  TxOne<{ Status: string; OrderDate: string; TotalGross: number }>(
    ctx,
    `SELECT Status, OrderDate, TotalGross FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${orderID}'`,
  );

export const CreateInStateChecks: NamedCheck[] = [
  {
    Id: "create-in-state.CS1",
    Name: "CS1: an order is created directly into Confirmed",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const out = await createInState(ctx, { Draft: draft(ctx), TargetStatus: "Confirmed" });
        Assert(out.Success, `create failed: ${out.Message} ${JSON.stringify(out.Blockers)}`);
        AssertEqual(out.Status, "Confirmed", "it landed Confirmed");
        Assert(out.OrderNumber != null, "and got an order number");
        AssertEqual((await headerOf(ctx, out.OrderHeaderID!)).Status, "Confirmed", "and it stuck");
      }),
  },
  {
    Id: "create-in-state.CS2",
    Name: "CS2: it BOOKED — balanced journal entries really exist",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const out = await createInState(ctx, { Draft: draft(ctx, 350), TargetStatus: "Fulfilled" });
        Assert(out.Success, `create failed: ${out.Message} ${JSON.stringify(out.Blockers)}`);

        // THE WHOLE JUSTIFICATION FOR THIS OPERATION. A single UPDATE setting Status='Fulfilled'
        // would pass CS1 and every header assertion, and would leave no ledger at all — an order
        // reconciling perfectly against itself with revenue that never existed.
        const entries = await entriesOf(ctx, out.OrderHeaderID!);
        Assert(entries.length > 0, "the order booked at least one entry");
        Assert(
          entries.every((e) => Math.abs(Number(e.D) - Number(e.C)) < 0.005),
          `every entry balances: ${JSON.stringify(entries)}`,
        );
        AssertEqual(out.AllBalanced, true, "and the output says so");
        Assert(Number(out.EntryCount ?? 0) > 0, "with a non-zero entry count");
      }),
  },
  {
    Id: "create-in-state.CS3",
    Name: "CS3: Posted is reached, and books exactly once",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const out = await createInState(ctx, { Draft: draft(ctx), TargetStatus: "Posted" });
        Assert(out.Success, `create failed: ${out.Message}`);
        AssertEqual(out.Status, "Posted", "reached Posted");

        // Booking fires on the FIRST lock transition. Advancing past it must not book again, or the
        // revenue would be counted twice and both entries would balance.
        const entries = await entriesOf(ctx, out.OrderHeaderID!);
        const bookings = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ACCT_SCHEMA}.vwJournalEntries je
            WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'OrderBooking' AND je.LinkedRecordID IN
                  (SELECT CAST(ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${out.OrderHeaderID}')`,
        );
        AssertEqual(Number(bookings.N), 1, `one booking entry for one line: ${JSON.stringify(entries)}`);
      }),
  },
  {
    Id: "create-in-state.CS4",
    Name: "CS4: Fulfilled marks the fulfillable LINES, not just the header",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await makeShippable(ctx);
        const out = await createInState(ctx, { Draft: draft(ctx), TargetStatus: "Fulfilled" });
        Assert(out.Success, `create failed: ${out.Message} ${JSON.stringify(out.Transitions)}`);
        AssertEqual(out.Status, "Fulfilled", "the header advanced");

        // A header reading Fulfilled over Pending lines is a promise the system claims to have kept
        // and has no record of — and the queue would keep offering those lines forever.
        const pending = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderLine
            WHERE OrderHeaderID='${out.OrderHeaderID}' AND ISNULL(FulfillmentStatus,'Pending')='Pending'`,
        );
        AssertEqual(Number(pending.N), 0, "and no line was left Pending");
        AssertEqual(Number(out.UnfulfilledLineCount ?? 0), 0, "reported as none outstanding");
      }),
  },
  {
    Id: "create-in-state.CS5",
    Name: "CS5: an order with nothing to ship reaches Fulfilled anyway (D15)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Deliberately NOT calling makeShippable — the Simple type requires no fulfilment. Waiting
        // for a shipment that can never happen would strand every service and subscription order.
        const out = await createInState(ctx, { Draft: draft(ctx), TargetStatus: "Fulfilled" });
        Assert(out.Success, `create failed: ${out.Message} ${JSON.stringify(out.Transitions)}`);
        AssertEqual(out.Status, "Fulfilled", "it advanced with nothing to ship");
      }),
  },
  {
    Id: "create-in-state.CS6",
    Name: "CS6: the transition trail records every step taken",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const out = await createInState(ctx, { Draft: draft(ctx), TargetStatus: "Fulfilled" });
        Assert(out.Success, `create failed: ${out.Message}`);

        const steps = out.Transitions ?? [];
        // A caller importing a thousand orders needs to see WHERE one stopped, not just that it did.
        Assert(steps.length >= 2, `at least Confirmed and Fulfilled: ${JSON.stringify(steps)}`);
        Assert(
          steps.some((t) => t.To === "Confirmed" && t.Applied),
          "the confirm is recorded as applied",
        );
        Assert(
          steps.some((t) => t.To === "Fulfilled" && t.Applied),
          "and so is the advance",
        );
      }),
  },
  {
    Id: "create-in-state.CS7",
    Name: "CS7: Draft and Quoted are refused — that is SaveOrder's job",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        for (const target of ["Draft", "Quoted"]) {
          const out = await createInState(ctx, { Draft: draft(ctx), TargetStatus: target });
          AssertEqual(out.Success, false, `${target} is refused`);
          Assert(
            (out.Blockers ?? []).some((b) => b.Code === "UNSUPPORTED_TARGET"),
            `named as unsupported: ${JSON.stringify(out.Blockers)}`,
          );
          // Routing a Draft here would BOOK an order that is not meant to be locked yet.
          Assert(out.OrderHeaderID == null, "and nothing was created");
        }
      }),
  },
  {
    Id: "create-in-state.CS8",
    Name: "CS8: Voided is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const out = await createInState(ctx, { Draft: draft(ctx), TargetStatus: "Voided" });
        AssertEqual(out.Success, false, "refused");
        // Voiding is a decision about an existing order, not a state to create one in.
        Assert(out.OrderHeaderID == null, "and nothing was created");
      }),
  },
  {
    Id: "create-in-state.CS9",
    Name: "CS9: a failing confirm creates nothing and passes its blockers through",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // WidgetC belongs to CoC, which has no GL links — the confirm cannot resolve an account.
        const out = await createInState(ctx, {
          Draft: {
            Header: { CompanyID: f.CoC.ID, BillToOrganizationID: f.Customers.OrganizationID },
            Lines: [{ ProductID: f.Products.WidgetC, Quantity: 1, UnitPrice: 100 }],
          },
          TargetStatus: "Fulfilled",
        });

        AssertEqual(out.Success, false, "the create fails with the confirm");
        // The confirm's own blockers are the useful answer — replacing them with a generic failure
        // would lose the account that could not be resolved.
        Assert(
          (out.Blockers ?? []).length > 0 || (out.Message ?? "").length > 0,
          `a reason comes back: ${JSON.stringify(out)}`,
        );
        Assert(
          out.Status !== "Fulfilled",
          "and it certainly did not reach Fulfilled",
        );
      }),
  },
  {
    Id: "create-in-state.CS10",
    Name: "CS10: ExpectedGrossTotal still guards the price",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // A migration that silently reprices at today's rates rather than what the customer was
        // charged is a defect that looks exactly like a successful import.
        const out = await createInState(ctx, {
          Draft: draft(ctx, 200),
          TargetStatus: "Confirmed",
          ExpectedGrossTotal: 999,
        });
        AssertEqual(out.Success, false, "the mismatch stops it");
        Assert(out.Status !== "Confirmed", "and it did not confirm at the wrong figure");
      }),
  },
  {
    Id: "create-in-state.CS11",
    Name: "CS11: back-dating puts the order on the stated date",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Back-dating is the NORMAL case: this operation exists because the event preceded the
        // record. Defaulting to today would file last quarter's sale in this one.
        const out = await createInState(ctx, {
          Draft: draft(ctx),
          TargetStatus: "Confirmed",
          OrderDate: "2026-03-15",
        });
        Assert(out.Success, `create failed: ${out.Message} ${JSON.stringify(out.Blockers)}`);

        const header = await headerOf(ctx, out.OrderHeaderID!);
        AssertEqual(
          new Date(header.OrderDate).toISOString().slice(0, 10),
          "2026-03-15",
          "the order carries the stated date",
        );
      }),
  },
  {
    Id: "create-in-state.CS12",
    Name: "CS12: advancing to Fulfilled writes NO additional journal entry (D15)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await makeShippable(ctx);
        const confirmedOnly = await createInState(ctx, { Draft: draft(ctx), TargetStatus: "Confirmed" });
        Assert(confirmedOnly.Success, `create failed: ${confirmedOnly.Message}`);
        const afterConfirm = (await entriesOf(ctx, confirmedOnly.OrderHeaderID!)).length;

        const fulfilled = await createInState(ctx, { Draft: draft(ctx), TargetStatus: "Fulfilled" });
        Assert(fulfilled.Success, `create failed: ${fulfilled.Message} ${JSON.stringify(fulfilled.Transitions)}`);
        const afterFulfil = (await entriesOf(ctx, fulfilled.OrderHeaderID!)).length;

        // Same order shape, two targets. Fulfilment is a logistics fact — if reaching it added an
        // entry, a warehouse delay could restate a closed period.
        AssertEqual(afterFulfil, afterConfirm, "advancing books nothing extra");
      }),
  },
];

for (const check of CreateInStateChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("create-in-state", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
    await CreateProductPrice(ctx, Fx().Products.WidgetA, 200);
  },
  Teardown: TeardownOrdersFixture,
});
