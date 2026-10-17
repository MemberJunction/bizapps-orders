/**
 * service-period-lock — a service period may be set on the order of a CLOSED deal (golive#322).
 *
 * The deal lock refuses order-line edits while the deal is closed, and its refusal names what it is
 * protecting: "what was sold". Service dates are the coverage WINDOW, not the thing — and because
 * `ConfirmEligibility` will not confirm a line whose product requires a service period until it has
 * BOTH a start and an end, while Sales can state only a term START on a deal line, the end could only
 * be set on the order. With the lock covering every field, an ordinary Won deal could not have its
 * order confirmed without reopening the deal.
 *
 * The exemption is FILLING a blank date, not changing one. A date that was never set has nowhere else
 * it could have come from; a date that is already there had a source, and moving it changes the window
 * that was agreed at the close. So SP1 fills and lands, SP4 moves and is refused.
 *
 * The unit suite pins the DECISION — which saves consult the veto and which skip it. What only a live
 * database can show is that the exempt save actually lands: that `ValidateAsync` lets it through, the
 * row changes, and nothing downstream rolls it back. That is the half a stubbed save cannot prove.
 *
 *   SP1   a dates-only edit on an unbooked order goes through with a REFUSING veto registered,
 *         and the stored row really changed
 *   SP2   the same edit carrying a quantity change is refused — that IS changing what was sold
 *   SP3   a dates-only edit is refused once the order is booked, where the period is the settled term
 *   SP4   a dates-only edit that MOVES dates the line already carried is refused, and the row holds
 *   SP5   the reported shape: the START is already set, only the END is filled, and that goes through
 *
 * CONNECTS TO:
 *   CODE: OrderLineEntityServer.refuseVetoedEdit / changesOnlyTheServicePeriod
 */
import {
  Assert,
  AssertEqual,
  IntegrationCheckRegistry,
  type IntegrationCheckContext,
  type NamedCheck,
} from "@memberjunction/testing-integration";
import { RegisterOrderLineEditVeto, type mjBizAppsOrdersOrderLineEntity } from "@mj-biz-apps/orders-entities";
import {
  CreateOrdersFixture,
  CreateProductPrice,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxQuery,
} from "../fixture.js";
import { BuildOrder, ConfirmOrder, type OrderSpec } from "../order-builder.js";
import { ORDER_LINE_ENTITY } from "../entity-names.js";

/** What a closed deal's veto says. The words are Sales'; only the refusal matters here. */
const FROZEN = "This deal is closed. Set the status back to Open before changing what was sold.";

const START = "2026-10-01";
const END = "2027-09-30";

function spec(): OrderSpec {
  const f = Fx();
  return {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: [{ ProductID: f.Products["WidgetA"], Quantity: 1 }],
  };
}

/** Runs `body` with a veto that refuses EVERYTHING, then takes it back off. */
async function underAClosedDeal<T>(body: () => Promise<T>): Promise<T> {
  RegisterOrderLineEditVeto({ MayEdit: async () => FROZEN });
  try {
    return await body();
  } finally {
    RegisterOrderLineEditVeto(null);
  }
}

async function storedPeriod(ctx: IntegrationCheckContext, id: string): Promise<{ s: string | null; e: string | null }> {
  const rows = await TxQuery<{ s: string | null; e: string | null }>(
    ctx,
    `SELECT CONVERT(VARCHAR(10), ServicePeriodStart, 23) AS s, CONVERT(VARCHAR(10), ServicePeriodEnd, 23) AS e
       FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${id}'`,
  );
  return { s: rows[0]?.s ?? null, e: rows[0]?.e ?? null };
}

export const ServicePeriodLockChecks: NamedCheck[] = [
  {
    Id: "service-period-lock.SP1",
    Name: "SP1: a service period is set on a closed deal's order, and the row really changes",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const built = await BuildOrder(ctx.User, spec());
        Assert(
          await built.Order.Save(),
          `setup: the draft must save — ${built.Order.LatestResult?.CompleteMessage ?? "no reason given"}`,
        );
        const line = built.Lines[0];
        const lineID = line.Get("ID") as string;

        await underAClosedDeal(async () => {
          line.Set("ServicePeriodStart", START);
          line.Set("ServicePeriodEnd", END);
          Assert(
            await line.Save(),
            `the dates-only save must go through — ${line.LatestResult?.CompleteMessage ?? "no reason given"}`,
          );
        });

        // The verdict is not the proof. The ROW is.
        const after = await storedPeriod(ctx, lineID);
        AssertEqual(after.s, START, "the stored start moved");
        AssertEqual(after.e, END, "and the stored end with it");
      }),
  },
  {
    Id: "service-period-lock.SP2",
    Name: "SP2: the same save carrying a quantity change is refused, and nothing moves",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const built = await BuildOrder(ctx.User, spec());
        Assert(await built.Order.Save(), "setup: the draft must save");
        const line = built.Lines[0];
        const lineID = line.Get("ID") as string;

        await underAClosedDeal(async () => {
          line.Set("ServicePeriodStart", START);
          line.Set("ServicePeriodEnd", END);
          line.Set("Quantity", 2);
          const saved = await line.Save();
          AssertEqual(saved, false, "changing what was sold still meets the lock");
          Assert(
            (line.LatestResult?.CompleteMessage ?? "").includes("closed"),
            `and says so: ${line.LatestResult?.CompleteMessage ?? "(no message)"}`,
          );
        });

        const after = await storedPeriod(ctx, lineID);
        AssertEqual(after.s, null, "no part of a refused save may land");
        AssertEqual(after.e, null, "including the dates it carried");
      }),
  },
  {
    Id: "service-period-lock.SP3",
    Name: "SP3: once the order is booked the period is the settled term, and the lock applies again",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const booked = await ConfirmOrder(ctx.User, spec());
        Assert(booked.Saved, `setup: the order must book — ${booked.Message}`);

        /**
         * RELOADED, NOT REUSED, AND THAT IS THE CHECK.
         *
         * The confirm runs through Orders' own write paths, which call `MarkAsOrdersOwnWrite` and set
         * `BypassExternalEditVeto` on the line they touch. Reusing that object tests the bypass, not
         * the lock: the first version of this check passed a save that should have been refused. A
         * person editing the order gets a fresh entity, so this does too.
         */
        const lineID = booked.Lines[0].Get("ID") as string;
        const line = await ctx.Provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, ctx.User);
        Assert(await line.Load(lineID), "setup: the booked line must load fresh");

        await underAClosedDeal(async () => {
          line.Set("ServicePeriodStart", START);
          line.Set("ServicePeriodEnd", END);
          const saved = await line.Save();
          AssertEqual(saved, false, "a booked line is not exempt — recognition is derived from this period");
        });
      }),
  },
  {
    Id: "service-period-lock.SP4",
    Name: "SP4: moving dates the line already carried is refused, and the stored period holds",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const built = await BuildOrder(ctx.User, spec());
        Assert(await built.Order.Save(), "setup: the draft must save");
        const line = built.Lines[0];
        const lineID = line.Get("ID") as string;

        // Setup, with no veto registered: the line ends up genuinely CARRYING a period, which is the
        // state SP1 cannot reach — there the columns were blank and stayed the thing being filled.
        line.Set("ServicePeriodStart", START);
        line.Set("ServicePeriodEnd", END);
        Assert(await line.Save(), `setup: the first period must land — ${line.LatestResult?.CompleteMessage ?? ""}`);

        await underAClosedDeal(async () => {
          line.Set("ServicePeriodEnd", "2028-09-30");
          const saved = await line.Save();
          AssertEqual(saved, false, "a date that is already set is a change, not a fill");
          Assert(
            (line.LatestResult?.CompleteMessage ?? "").includes("closed"),
            `and the lock is what says no: ${line.LatestResult?.CompleteMessage ?? "(no message)"}`,
          );
        });

        const after = await storedPeriod(ctx, lineID);
        AssertEqual(after.s, START, "the agreed start is untouched");
        AssertEqual(after.e, END, "and the agreed end did not move");
      }),
  },
  {
    Id: "service-period-lock.SP5",
    Name: "SP5: a line already carrying the start has only its end filled, and that lands",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const built = await BuildOrder(ctx.User, spec());
        Assert(await built.Order.Save(), "setup: the draft must save");
        const line = built.Lines[0];
        const lineID = line.Get("ID") as string;

        /**
         * THE SHAPE THE REPORT DESCRIBES, which SP1 does not reach.
         *
         * Sales states a term START on a deal line and nothing more, so the line arrives at the order
         * with a start and a blank end. SP1 fills BOTH from blank; here one column already carries a
         * date. The rule has to read only the columns the save is CHANGING — a start sitting there
         * untouched must not disqualify the fill, or the exemption misses the case it was built for.
         */
        line.Set("ServicePeriodStart", START);
        Assert(await line.Save(), `setup: the start must land — ${line.LatestResult?.CompleteMessage ?? ""}`);

        await underAClosedDeal(async () => {
          line.Set("ServicePeriodEnd", END);
          Assert(
            await line.Save(),
            `filling the end alone must go through — ${line.LatestResult?.CompleteMessage ?? "no reason given"}`,
          );
        });

        const after = await storedPeriod(ctx, lineID);
        AssertEqual(after.e, END, "the end the rep filled is stored");
        AssertEqual(after.s, START, "and the start it already carried is untouched");
      }),
  },
];

IntegrationCheckRegistry.Instance.RegisterLifecycle("service-period-lock", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
    await CreateProductPrice(ctx, Fx().Products.WidgetA, 200);
  },
  Teardown: TeardownOrdersFixture,
});

for (const check of ServicePeriodLockChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}
