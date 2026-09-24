/**
 * entitlements — what a purchase actually confers, and for how long (D27/D76).
 *
 * A `ProductEntitlement` is the template; an `EntitlementGrant` is the instance written inside the
 * booking transaction. Downstream apps POLL grants to provision access, so a grant is the machine-
 * readable answer to "what is this customer allowed to do?" — which makes a wrong one worse than a
 * missing one. A grant that exists says access was decided; a grant with the wrong window says it was
 * decided wrongly, and nothing downstream can tell the difference.
 *
 * WHAT THESE CHECKS ARE REALLY FOR. Four validity modes produce four windows from the same purchase,
 * and three of them can silently degrade into a fourth: `ResolveValidityWindow` falls back to
 * `Perpetual` when a mode's own inputs are missing, rather than failing the customer's order. That
 * fallback is right, and it is exactly the shape that hides a misconfiguration — a ticket that should
 * expire after the event, granting access forever. So several checks below assert
 * `ValidityModeApplied`, not just the dates: the record of WHICH rule ran is what distinguishes a
 * perpetual grant from a broken event grant.
 *
 * THE OTHER RECURRING TRAP: a grant is easy to create twice. It hangs off an order line, and lines get
 * re-saved. EN13 exists for that.
 *
 * CONNECTS TO:
 *   PURE:   packages/CoreEntitiesServer/src/EntitlementBehavior.ts (38 unit tests on the rules)
 *   SERVER: EntitlementEngine, OrderEntityServer.grantEntitlements
 *   DOC:    plans/archive/bizapps-orders-master.md D27, D76
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
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  PRODUCT_ENTITY,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
  upsertViaEntity,
} from "../fixture.js";
import { ConfirmOrder } from "../order-builder.js";
import { BaseRemotableOperation } from "@memberjunction/core";
import { MJGlobal } from "@memberjunction/global";
import { OrdersEngine } from "@mj-biz-apps/orders-entities";
import { EnforcePaymentGatedAccess, OrdersSettings } from "@mj-biz-apps/orders-core-entities-server";

/**
 * Price a product ONCE, however many times a check asks.
 *
 * Two rules of equal priority make pricing AMBIGUOUS, and the engine refuses rather than picking
 * whichever the database returned first (D69) — correctly, but it means a helper that prices on every
 * call breaks any check that buys twice. Guarding here beats making each check remember.
 */
async function addPrice(ctx: IntegrationCheckContext, productID: string, amount: number): Promise<void> {
  // Delegates to the shared builder so the price goes through `ProductPriceEntityServer` and its
  // ambiguity guard, rather than around it. Idempotent per product — see CreateProductPrice.
  await CreateProductPrice(ctx, productID, amount);
}

interface GrantRow {
  ID: string;
  Code: string;
  Type: string;
  Quantity: number | null;
  ValidFrom: Date | null;
  ValidTo: Date | null;
  Mode: string | null;
  Status: string;
  Person: string | null;
  Org: string | null;
  TermID: string | null;
  RevokedAt: Date | null;
  Reason: string | null;
}

/** Every grant an order produced, with the template code so a check can name what it is asserting. */
const grantsFor = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<GrantRow>(
    ctx,
    `SELECT g.ID, pe.Code, pe.EntitlementType AS Type, g.Quantity,
            g.ValidFrom, g.ValidTo, g.ValidityModeApplied AS Mode, g.Status,
            g.BeneficiaryPersonID AS Person, g.BeneficiaryOrganizationID AS Org,
            g.SubscriptionTermID AS TermID, g.RevokedAt, g.RevocationReason AS Reason
       FROM ${ORDERS_SCHEMA}.EntitlementGrant g
       JOIN ${ORDERS_SCHEMA}.ProductEntitlement pe ON pe.ID = g.ProductEntitlementID
       JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = g.OrderLineID
      WHERE ol.OrderHeaderID = '${orderID}'
      ORDER BY pe.Code`,
  );

/** Grants against an ORIGIN line, however they got there — used after a return. */
const grantsForLine = (ctx: IntegrationCheckContext, lineID: string) =>
  TxQuery<GrantRow>(
    ctx,
    `SELECT g.ID, pe.Code, pe.EntitlementType AS Type, g.Quantity,
            g.ValidFrom, g.ValidTo, g.ValidityModeApplied AS Mode, g.Status,
            g.BeneficiaryPersonID AS Person, g.BeneficiaryOrganizationID AS Org,
            g.SubscriptionTermID AS TermID, g.RevokedAt, g.RevocationReason AS Reason
       FROM ${ORDERS_SCHEMA}.EntitlementGrant g
       JOIN ${ORDERS_SCHEMA}.ProductEntitlement pe ON pe.ID = g.ProductEntitlementID
      WHERE g.OrderLineID = '${lineID}'
      ORDER BY pe.Code`,
  );

const byCode = (rows: GrantRow[]) => new Map(rows.map((r) => [r.Code, r]));
const days = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86400000);

/** Buy WidgetA, which carries TWO templates — a perpetual Feature and a 90-day seat count. */
async function buyWidget(ctx: IntegrationCheckContext, quantity = 1, over: Record<string, unknown> = {}) {
  const f = Fx();
  await addPrice(ctx, f.Products.WidgetA, 100);
  const order = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: [{ ProductID: f.Products.WidgetA, Quantity: quantity }],
    ...over,
  });
  Assert(order.Saved, `confirm failed: ${order.Message}`);
  return order;
}

// ─── Payment-gated access (bc-aidp-next-golive#223) ─────────────────────────────────────────────

interface GateRow {
  ID: string;
  Status: string;
  GrantTimingApplied: string | null;
  SuspensionReason: string | null;
  SuspendedAt: Date | null;
}

/** The access columns of every grant an order produced. */
const gatesFor = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<GateRow>(
    ctx,
    `SELECT g.ID, g.Status, g.GrantTimingApplied, g.SuspensionReason, g.SuspendedAt
       FROM ${ORDERS_SCHEMA}.EntitlementGrant g
       JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = g.OrderLineID
      WHERE ol.OrderHeaderID = '${orderID}'`,
  );

/**
 * Run `body` with a product's grant timing set THROUGH THE OBJECT MODEL, and the catalog engine
 * reloaded so the confirm path sees it.
 *
 * A raw `UPDATE Product` is not enough: the policy walk reads products from `OrdersEngine`'s cache,
 * so a row changed behind its back keeps its old timing. The timing is put back the same way before
 * the transaction rolls back, or the cache would carry this check's policy into the next one.
 */
async function withGrantTiming(
  ctx: IntegrationCheckContext,
  productID: string,
  timing: string,
  body: () => Promise<void>,
): Promise<void> {
  await upsertViaEntity(ctx, PRODUCT_ENTITY, productID, { EntitlementGrantTiming: timing });
  await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
  try {
    await body();
  } finally {
    await upsertViaEntity(ctx, PRODUCT_ENTITY, productID, { EntitlementGrantTiming: null });
    await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
  }
}

/** Capture cash against one order through `Orders.CapturePayment` — the path a finance user takes. */
async function payOrder(ctx: IntegrationCheckContext, orderID: string, amount: number): Promise<void> {
  const f = Fx();
  Assert(f.PaymentTypeIDs.get("Cash") != null, "PaymentType 'Cash' missing — push the orders app metadata");
  const op = MJGlobal.Instance.ClassFactory.CreateInstance<
    BaseRemotableOperation<Record<string, unknown>, { Success: boolean; Message?: string }>
  >(BaseRemotableOperation, "Orders.CapturePayment");
  Assert(op != null, "'Orders.CapturePayment' is not registered");
  const result = await op!.Execute(
    {
      Amount: amount,
      ReceivingCompanyID: f.CoA.ID,
      BillToOrganizationID: f.Customers.OrganizationID,
      TenderCode: "Cash",
      Allocations: [{ OrderHeaderID: orderID, Amount: amount }],
    },
    { provider: ctx.Provider, user: ctx.User },
  );
  Assert(result.Success && result.Output?.Success, `capture failed: ${result.ErrorMessage ?? result.Output?.Message ?? "unknown"}`);
}

/** Place the renewal of one subscription through `Orders.SpawnRenewals`, and return its order. */
async function renew(ctx: IntegrationCheckContext, subscriptionID: string, asOf: string): Promise<string> {
  const op = MJGlobal.Instance.ClassFactory.CreateInstance<
    BaseRemotableOperation<Record<string, unknown>, { Placed: number; Message?: string; Candidates: Array<{ OrderID?: string }> }>
  >(BaseRemotableOperation, "Orders.SpawnRenewals");
  Assert(op != null, "'Orders.SpawnRenewals' is not registered");
  const result = await op!.Execute({ SubscriptionID: subscriptionID, AsOfDate: asOf }, { provider: ctx.Provider, user: ctx.User });
  Assert(result.Success && result.Output?.Placed === 1, `expected one renewal: ${result.ErrorMessage ?? result.Output?.Message}`);
  return result.Output!.Candidates[0].OrderID!;
}

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const EntitlementsChecks: NamedCheck[] = [
  {
    Id: "entitlements.EN1",
    Name: "EN1: confirming an order writes the grants its products confer",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await buyWidget(ctx);
        const grants = await grantsFor(ctx, order.Order.ID as string);

        // WidgetA carries two templates, so two grants — and the count is asserted before anything
        // else, because every assertion after it would pass on an empty set.
        AssertEqual(grants.length, 2, "both of WidgetA's entitlements were granted");
        AssertEqual(
          grants.map((g) => g.Code).join(","),
          "WIDGET-FORUM,WIDGET-SUPPORT",
          "and they are the two templates the fixture attached",
        );
        Assert(
          grants.every((g) => g.Status === "Active"),
          "the fixture's type grants OnConfirm, so both start Active rather than waiting for payment",
        );
      }),
  },
  {
    Id: "entitlements.EN2",
    Name: "EN2: two entitlements on ONE product get DIFFERENT windows",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await buyWidget(ctx);
        const g = byCode(await grantsFor(ctx, order.Order.ID as string));

        // THE CASE THAT DECIDED WHERE ValidityMode LIVES. A course grants perpetual access to its
        // materials and ninety days in the forum; a policy resolved from the PRODUCT alone could only
        // give both the same window. So the template carries validity and the walk is the fallback.
        const support = g.get("WIDGET-SUPPORT");
        const forum = g.get("WIDGET-FORUM");
        Assert(support != null && forum != null, "both grants exist");
        AssertEqual(support!.Mode, "Perpetual", "the Feature is perpetual");
        AssertEqual(forum!.Mode, "FixedDuration", "the seat count is time-boxed");
        Assert(support!.ValidTo == null, "a perpetual grant has NO end — that is a fact, not a gap");
        Assert(forum!.ValidTo != null, "the time-boxed one does end");
        AssertEqual(
          days(new Date(forum!.ValidFrom!), new Date(forum!.ValidTo!)),
          90,
          "and it ends ninety days out, as its template says",
        );
      }),
  },
  {
    Id: "entitlements.EN3",
    Name: "EN3: PerUnit multiplies the template quantity by the line quantity",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Three of a 5-seat product is fifteen seats, which is what somebody buying three packs
        // expects. The uncountable sibling stays null rather than becoming a number.
        const order = await buyWidget(ctx, 3);
        const g = byCode(await grantsFor(ctx, order.Order.ID as string));
        AssertEqual(Number(g.get("WIDGET-FORUM")!.Quantity), 15, "3 x 5 seats");
        Assert(
          g.get("WIDGET-SUPPORT")!.Quantity == null,
          "a Feature has no quantity, and must not acquire one — zero would read as 'granted none of it'",
        );
      }),
  },
  {
    Id: "entitlements.EN4",
    Name: "EN4: Flat ignores the line quantity, and the PRODUCT can say so",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // Set the mode on the PRODUCT, overriding the type's PerUnit default. This is the walk being
        // exercised end to end rather than in a unit test: the column, the query, and the resolution.
        await TxQuery(ctx,
          `UPDATE ${ORDERS_SCHEMA}.Product SET EntitlementQuantityMode = 'Flat'
            WHERE ID = '${f.Products.WidgetA}'`);

        const order = await buyWidget(ctx, 4);
        const g = byCode(await grantsFor(ctx, order.Order.ID as string));
        AssertEqual(
          Number(g.get("WIDGET-FORUM")!.Quantity),
          5,
          "Flat grants the template quantity however many units were bought",
        );
      }),
  },
  {
    Id: "entitlements.EN5",
    Name: "EN5: an EVENT ticket's access follows the event, not the order date",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.EventTicket, 450);
        // Bought today for an event whose dates the fixture set independently. Anchoring the window to
        // the purchase would open access the moment the ticket was sold.
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          OrderDate: new Date("2026-01-15"),
          Lines: [{ ProductID: f.Products.EventTicket, Quantity: 1 }],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const g = byCode(await grantsFor(ctx, order.Order.ID as string));
        const access = g.get("TICKET-ACCESS");
        Assert(access != null, "the ticket granted access");
        AssertEqual(access!.Mode, "EventWindow", "and it did so as an event window, not as a fallback");

        // Lead and lag are separate decisions, so they are asserted separately: an hour early, a day
        // late, measured against the EVENT rather than the order.
        const from = new Date(access!.ValidFrom!);
        const to = new Date(access!.ValidTo!);
        AssertEqual(
          from.getTime(),
          f.Event.StartsAt.getTime() - 60 * 60 * 1000,
          "access opens one hour before the event starts",
        );
        AssertEqual(
          to.getTime(),
          f.Event.EndsAt.getTime() + 24 * 60 * 60 * 1000,
          "and closes twenty-four hours after it ends",
        );
        Assert(
          from.getTime() > new Date("2026-01-15").getTime(),
          "the window is in the FUTURE relative to the purchase — anchored to the event, not the sale",
        );
      }),
  },
  {
    Id: "entitlements.EN6",
    Name: "EN6: a SUBSCRIPTION grant follows its term and points at it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 }],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const g = byCode(await grantsFor(ctx, order.Order.ID as string));
        const seats = g.get("SUB-SEATS");
        Assert(seats != null, "the subscription granted its seats");
        AssertEqual(seats!.Mode, "SubscriptionTerm", "validity followed the term");
        Assert(seats!.TermID != null, "and the grant POINTS at that term — one grant per term (D76)");

        // The window must be the term's own, not the order date's. Compared against the row rather
        // than a computed guess, because the term may be anchored or prorated.
        const term = await TxOne<{ StartDate: Date; EndDate: Date }>(ctx,
          `SELECT StartDate, EndDate FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE ID='${seats!.TermID}'`);
        AssertEqual(
          new Date(seats!.ValidFrom!).toISOString().slice(0, 10),
          new Date(term.StartDate).toISOString().slice(0, 10),
          "the grant starts when the term starts",
        );
        AssertEqual(
          new Date(seats!.ValidTo!).toISOString().slice(0, 10),
          new Date(term.EndDate).toISOString().slice(0, 10),
          "and ends when it ends",
        );
      }),
  },
  {
    Id: "entitlements.EN7",
    Name: "EN7: a silent template falls to the WALK, and records where it landed",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // DeferredA's template states no ValidityMode, and its type is the Subscription type — whose
        // default is SubscriptionTerm. But a plain deferred line has no term, so the engine cannot
        // honour that and falls back to Perpetual. The fallback is correct; ADMITTING it is the point.
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            {
              ProductID: f.Products.DeferredA,
              Quantity: 1,
              UnitPrice: 240,
              ServicePeriodStart: "2026-01-01",
              ServicePeriodEnd: "2026-12-31",
            },
          ],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const g = byCode(await grantsFor(ctx, order.Order.ID as string));
        const access = g.get("DEFERRED-ACCESS");
        Assert(access != null, "the deferred product granted its access");
        AssertEqual(
          access!.Mode,
          "Perpetual",
          "asked to follow a term that does not exist, the grant records the mode it ACTUALLY applied — " +
            "a grant silently claiming SubscriptionTerm while lasting forever is how a misconfiguration " +
            "survives an audit",
        );
        Assert(access!.ValidTo == null, "and it has no end");
      }),
  },
  {
    Id: "entitlements.EN8",
    Name: "EN8: the beneficiary defaults to the buyer, and a LINE can name someone else",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();

        const forBuyer = await buyWidget(ctx, 1);
        const b = await grantsFor(ctx, forBuyer.Order.ID as string);
        Assert(
          b.every((g) => String(g.Org).toLowerCase() === f.Customers.OrganizationID.toLowerCase()),
          "with nothing else stated, the grant belongs to whoever is billed",
        );

        // A seat bought FOR a named colleague, a ticket for an attendee, a gift for a recipient — all
        // the same shape, and all expressed by the line's ship-to (D61).
        await addPrice(ctx, f.Products.WidgetA, 100);
        const forOther = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            { ProductID: f.Products.WidgetA, Quantity: 1, ShipToPersonID: f.Customers.PersonID },
          ],
        });
        Assert(forOther.Saved, `confirm failed: ${forOther.Message}`);
        const o = await grantsFor(ctx, forOther.Order.ID as string);
        Assert(o.length > 0, "the order granted something");
        Assert(
          o.every((g) => String(g.Person).toLowerCase() === f.Customers.PersonID.toLowerCase()),
          "the line's named person is the beneficiary, not the payer",
        );
      }),
  },
  {
    Id: "entitlements.EN9",
    Name: "EN9: OnPaidInFull starts SUSPENDED, and Active once the balance clears",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await TxQuery(ctx,
          `UPDATE ${ORDERS_SCHEMA}.Product SET EntitlementGrantTiming = 'OnPaidInFull'
            WHERE ID = '${f.Products.WidgetA}'`);

        const unpaid = await buyWidget(ctx, 1);
        const u = await grantsFor(ctx, unpaid.Order.ID as string);
        Assert(u.length > 0, "the grants exist even while unpaid");
        Assert(
          u.every((g) => g.Status === "Suspended"),
          "SUSPENDED, not absent: downstream apps poll grants, and access that is coming has to be " +
            "visible before the money arrives",
        );

        // Now the same product paid in full at confirm. The rollup triggers move Balance on the ROW,
        // so this also proves the engine re-reads it rather than trusting a stale in-memory value.
        const typeID = [...f.PaymentTypeIDs.entries()].find(([c]) => c !== "AccountCredit")?.[1];
        Assert(typeID != null, "a payment type is seeded");
        const paid = await buyWidget(ctx, 1, {
          InitialPaymentTypeID: typeID,
          InitialPaymentAmount: 100,
        });
        const p = await grantsFor(ctx, paid.Order.ID as string);
        Assert(p.length > 0, "the paid order granted something");
        Assert(
          p.every((g) => g.Status === "Active"),
          "paid in full at confirm, so access is live immediately",
        );
      }),
  },
  {
    Id: "entitlements.EN10",
    Name: "EN10: a full RETURN revokes the grants, with when and why",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const sale = await buyWidget(ctx, 2);
        const lineID = sale.Lines[0].ID as string;
        AssertEqual((await grantsForLine(ctx, lineID)).length, 2, "the sale granted two");

        const ret = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          OrderType: "Return",
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: -2, ReversesOrderLineID: lineID }],
        });
        Assert(ret.Saved, `the return must confirm: ${ret.Message}`);

        const after = await grantsForLine(ctx, lineID);
        AssertEqual(after.length, 2, "the grants are revoked in place, not deleted — history stays");
        Assert(
          after.every((g) => g.Status === "Revoked"),
          "everything came back, so all access goes",
        );
        // A revoked grant with no record of when or why is what makes an access dispute
        // unanswerable, and the database CHECK enforces the pairing.
        Assert(
          after.every((g) => g.RevokedAt != null && (g.Reason ?? "").length > 0),
          "and each one records when it was revoked and why",
        );
      }),
  },
  {
    Id: "entitlements.EN11",
    Name: "EN11: a PARTIAL return reduces the quantity but keeps the uncountable grant",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const sale = await buyWidget(ctx, 4); // 4 x 5 = 20 seats
        const lineID = sale.Lines[0].ID as string;
        AssertEqual(Number(byCode(await grantsForLine(ctx, lineID)).get("WIDGET-FORUM")!.Quantity), 20, "20 seats sold");

        const ret = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          OrderType: "Return",
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: -1, ReversesOrderLineID: lineID }],
        });
        Assert(ret.Saved, `the return must confirm: ${ret.Message}`);

        const g = byCode(await grantsForLine(ctx, lineID));
        AssertEqual(
          Number(g.get("WIDGET-FORUM")!.Quantity),
          15,
          "one of four units returned leaves three quarters of the seats",
        );
        AssertEqual(g.get("WIDGET-FORUM")!.Status, "Active", "and the grant stands rather than being revoked");
        // A Feature is not divisible. The customer still holds three of the four things that
        // conferred it, so taking it away would be wrong.
        AssertEqual(
          g.get("WIDGET-SUPPORT")!.Status,
          "Active",
          "an uncountable grant survives a partial return — the customer still holds some of it",
        );
      }),
  },
  {
    Id: "entitlements.EN12",
    Name: "EN12: a product with NO entitlements grants nothing, and costs one query",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // WidgetB carries no templates. Most real orders look like this, which is why the engine
        // returns after a single lookup — but the assertion that matters here is that no grant is
        // invented for a product that confers nothing.
        await addPrice(ctx, f.Products.WidgetB, 100);
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoB.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetB, Quantity: 3 }],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        AssertEqual((await grantsFor(ctx, order.Order.ID as string)).length, 0, "no templates, no grants");
      }),
  },
  {
    Id: "entitlements.EN13",
    Name: "EN13: re-saving a confirmed order does not grant twice",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await buyWidget(ctx, 1);
        const before = (await grantsFor(ctx, order.Order.ID as string)).length;
        AssertEqual(before, 2, "two grants to begin with");

        // The path a user takes when they add a note to something already confirmed. Booking keys off
        // `ConfirmedAt`, so the grant path must not run again — a second set of grants would hand the
        // customer twice the seats, and nothing on the order would show it.
        order.Order.Notes = "edited after confirm";
        Assert(
          await order.Order.Save(),
          `the re-save must succeed: ${order.Order.LatestResult?.CompleteMessage ?? "no reason"}`,
        );

        AssertEqual(
          (await grantsFor(ctx, order.Order.ID as string)).length,
          before,
          "still two — grants are not duplicated by an ordinary edit",
        );
        const notes = await TxOne<{ N: string | null }>(ctx,
          `SELECT Notes AS N FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${order.Order.ID}'`);
        AssertEqual(
          notes.N,
          "edited after confirm",
          "and the edit DID persist — otherwise this passes by having saved nothing",
        );
      }),
  },
  {
    Id: "entitlements.EN14",
    Name: "EN14: grants are written in the SAME transaction as the booking",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        await addPrice(ctx, f.Products.WidgetC, 100);

        // WidgetC belongs to CoC, which has no GL links, so this confirm cannot book. Access and the
        // receivable are the same decision: an order that granted access without booking revenue has
        // given something away, so the grants must go back with everything else.
        const doomed = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            { ProductID: f.Products.WidgetA, Quantity: 1 },
            { ProductID: f.Products.WidgetC, Quantity: 1 },
          ],
        });
        Assert(!doomed.Saved, "the order must fail — CoC has no GL links to resolve");

        const orphans = await TxOne<{ N: number }>(ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.EntitlementGrant g
             WHERE NOT EXISTS (SELECT 1 FROM ${ORDERS_SCHEMA}.OrderLine ol WHERE ol.ID = g.OrderLineID)`);
        AssertEqual(
          Number(orphans.N),
          0,
          "no grant survives a rolled-back confirm — a grant pointing at a line that does not exist " +
            "is access nobody can trace to a purchase",
        );
      }),
  },
  {
    Id: "entitlements.EN15",
    Name: "EN15: a PRORATED line rounds its seat count UP, never down",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubCalendar, { EntitlementQuantityMode: 'PerUnit' });
        // SubCalendar is Jan-1 anchored WITH proration, so buying it mid-year scales the line
        // quantity to a fraction — and the seat count is computed from that fraction. This is the
        // only place a fractional quantity arises naturally, which is why the unit test alone was
        // not enough: rounding DOWN survived the whole bundle until this check existed, because
        // every other check buys whole units and ceil and floor agree.
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          OrderDate: new Date("2026-07-01"),
          Lines: [{ ProductID: f.Products.SubCalendar, Quantity: 1, UnitPrice: 1200 }],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const line = await TxOne<{ Q: number }>(ctx,
          `SELECT Quantity AS Q FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}'`);
        Assert(
          Number(line.Q) > 0 && Number(line.Q) < 1,
          `the line must actually be prorated for this check to mean anything (quantity ${line.Q})`,
        );

        const g = byCode(await grantsFor(ctx, order.Order.ID as string));
        const seats = g.get("PRORATED-SEATS");
        Assert(seats != null, "the prorated subscription granted its seats");

        // 4 seats x a fraction, rounded UP. Asserted against the stored quantity rather than a
        // hard-coded number, because the proration factor depends on the anchor and the order date.
        const expected = Math.ceil(4 * Number(line.Q));
        AssertEqual(
          Number(seats!.Quantity),
          expected,
          `4 seats x ${line.Q} rounds UP to ${expected} — under-granting is the expensive direction, ` +
            `exactly as under-collecting is with tax`,
        );
        Assert(
          Number(seats!.Quantity) > 4 * Number(line.Q),
          "and it is strictly MORE than the exact fraction, which is what 'up' means",
        );
      }),
  },
  {
    Id: "entitlements.EN16",
    Name: "EN16: OnFirstPayment holds a new purchase until it is paid, and the payment releases it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await withGrantTiming(ctx, f.Products.WidgetA, "OnFirstPayment", async () => {
          const order = await buyWidget(ctx, 1);
          const orderID = order.Order.ID as string;
          const held = await gatesFor(ctx, orderID);
          Assert(held.length > 0, "the grants exist while unpaid, so what is coming is visible");
          Assert(
            held.every((g) => g.Status === "Suspended" && g.SuspensionReason === "AwaitingPayment" && g.SuspendedAt != null),
            "held for payment, and each one says so and says when",
          );
          Assert(
            held.every((g) => g.GrantTimingApplied === "OnFirstPayment"),
            "the grant records the rule it was written under, so a later payment re-decides by it",
          );

          const gross = Number((await TxOne<{ TotalGross: number }>(ctx,
            `SELECT TotalGross FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`)).TotalGross);
          await payOrder(ctx, orderID, gross);

          const live = await gatesFor(ctx, orderID);
          Assert(
            live.every((g) => g.Status === "Active" && g.SuspensionReason == null && g.SuspendedAt == null),
            "the payment that clears the first amount due makes access live, inside the same capture",
          );
        });
      }),
  },
  {
    Id: "entitlements.EN17",
    Name: "EN17: a part-payment keeps the hold; the payment that completes it releases it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await withGrantTiming(ctx, f.Products.WidgetA, "OnFirstPayment", async () => {
          const order = await buyWidget(ctx, 1);
          const orderID = order.Order.ID as string;
          const gross = Number((await TxOne<{ TotalGross: number }>(ctx,
            `SELECT TotalGross FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`)).TotalGross);

          await payOrder(ctx, orderID, Math.round(gross * 40) / 100);
          Assert(
            (await gatesFor(ctx, orderID)).every((g) => g.Status === "Suspended" && g.SuspensionReason === "AwaitingPayment"),
            "40% of the first amount due is not the first payment",
          );

          await payOrder(ctx, orderID, Math.round((gross - Math.round(gross * 40) / 100) * 100) / 100);
          Assert(
            (await gatesFor(ctx, orderID)).every((g) => g.Status === "Active"),
            "the rest arrives, and access goes live",
          );
        });
      }),
  },
  {
    Id: "entitlements.EN18",
    Name: "EN18: an OnFirstPayment RENEWAL keeps access at confirm, is cut off at the cutoff, and payment restores it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await withGrantTiming(ctx, f.Products.SubRolling, "OnFirstPayment", async () => {
          const paymentTypeID = f.PaymentTypeIDs.get("Cash");
          Assert(paymentTypeID != null, "PaymentType 'Cash' missing — push the orders app metadata");
          const first = await ConfirmOrder(ctx.User, {
            CompanyID: f.CoA.ID,
            OrderDate: new Date("2026-01-01T00:00:00Z"),
            BillToOrganizationID: f.Customers.OrganizationID,
            Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1 }],
          });
          Assert(first.Saved, `confirm failed: ${first.Message}`);
          const term = await TxOne<{ SubscriptionID: string; EndDate: Date; Gross: number }>(ctx,
            `SELECT st.SubscriptionID, st.EndDate, oh.TotalGross AS Gross
               FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
               JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
               JOIN ${ORDERS_SCHEMA}.OrderHeader oh ON oh.ID = ol.OrderHeaderID
              WHERE ol.OrderHeaderID = '${first.Order.ID}'`);
          await payOrder(ctx, first.Order.ID as string, Number(term.Gross));

          const renewalID = await renew(ctx, term.SubscriptionID, addDays(new Date(term.EndDate).toISOString(), -10));
          const renewed = await gatesFor(ctx, renewalID);
          Assert(renewed.length > 0, "the renewal grants the next term");
          Assert(
            renewed.every((g) => g.Status === "Active" && g.GrantTimingApplied === "OnFirstPayment"),
            "a renewal is not held for payment: the customer already has the service",
          );

          const due = await TxOne<{ NextDueDate: Date | null; Balance: number }>(ctx,
            `SELECT NextDueDate, Balance FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID = '${renewalID}'`);
          Assert(due.NextDueDate != null, "the renewal carries a due date, or nothing can be measured from it");
          const dueDay = new Date(due.NextDueDate!).toISOString().slice(0, 10);
          await OrdersSettings.Load(ctx.Provider, ctx.User);
          const cutoff = OrdersSettings.RenewalAccessCutoffDaysPastDue;
          Assert(cutoff != null && cutoff > 0, "the cutoff setting is on, with a positive number of days");

          const before = await EnforcePaymentGatedAccess({ AsOfDate: addDays(dueDay, cutoff! - 1) }, ctx.Provider, ctx.User);
          Assert(before.Success, `the pass ran: ${before.Message}`);
          Assert(
            (await gatesFor(ctx, renewalID)).every((g) => g.Status === "Active"),
            "the day before the cutoff, access stands",
          );

          const preview = await EnforcePaymentGatedAccess({ AsOfDate: addDays(dueDay, cutoff!), Preview: true }, ctx.Provider, ctx.User);
          Assert(
            preview.Changes.some((c) => c.OrderID.toLowerCase() === renewalID.toLowerCase() && c.ToReason === "PastDue"),
            "a preview on the cutoff day reports the suspension",
          );
          Assert(
            (await gatesFor(ctx, renewalID)).every((g) => g.Status === "Active"),
            "and writes nothing",
          );

          const cut = await EnforcePaymentGatedAccess({ AsOfDate: addDays(dueDay, cutoff!) }, ctx.Provider, ctx.User);
          Assert(cut.Success, `the pass ran: ${cut.Message}`);
          Assert(
            (await gatesFor(ctx, renewalID)).every((g) => g.Status === "Suspended" && g.SuspensionReason === "PastDue"),
            "on the cutoff day the renewal's access is suspended, and says why",
          );

          await payOrder(ctx, renewalID, Number(due.Balance));
          Assert(
            (await gatesFor(ctx, renewalID)).every((g) => g.Status === "Active" && g.SuspensionReason == null),
            "paying the renewal restores access in the same capture",
          );
        });
      }),
  },
  {
    Id: "entitlements.EN19",
    Name: "EN19: an OnConfirm product is untouched by payment gating",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await buyWidget(ctx, 1);
        const orderID = order.Order.ID as string;
        const grants = await gatesFor(ctx, orderID);
        Assert(grants.length > 0, "the order granted something");
        Assert(
          grants.every((g) => g.Status === "Active" && g.GrantTimingApplied === "OnConfirm" && g.SuspensionReason == null),
          "the default timing is live at confirm, and records that it was",
        );
      }),
  },
];

for (const check of EntitlementsChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("entitlements", {
  Setup: async (ctx) => { await CreateOrdersFixture(ctx); },
  Teardown: TeardownOrdersFixture,
});
