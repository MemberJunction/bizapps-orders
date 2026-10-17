/**
 * outbound-events — the outbound hook (#293) against a real database.
 *
 * WHAT THE UNIT TESTS CANNOT SHOW. That the event rows really are written inside the booking
 * transaction (a failed confirm leaves none), that the grant hook's own transaction nests inside
 * booking's, that the dispatcher's single-statement claim takes a row once and only once, and that
 * only a sale records OrderConfirmed.
 *
 * A TEST CONSUMER, switched on only while this bundle runs. Its registration is global, so it
 * answers "no event types" unless this bundle's Setup has turned it on; every other bundle books
 * exactly as it would with no consumer registered.
 *
 * CONNECTS TO:
 *   SERVER: packages/CoreEntitiesServer/src/OutboundEvents.ts, EntitlementGrantEntityServer.ts,
 *           OrderEntityServer.recordOrderConfirmedEvent, PaymentGatedAccess.EnforcePaymentGatedAccess
 */
import {
  Assert,
  AssertEqual,
  IntegrationCheckRegistry,
  type IntegrationCheckContext,
  type NamedCheck,
} from "@memberjunction/testing-integration";
import { RegisterClass } from "@memberjunction/global";
import { CompositeKey } from "@memberjunction/core";
import {
  DispatchOutboundDeliveries,
  EnforcePaymentGatedAccess,
  OrdersOutboundConsumer,
  OrdersSettings,
  type OutboundEventEnvelope,
  type OutboundEventType,
} from "@mj-biz-apps/orders-core-entities-server";
import {
  CreateOrdersFixture,
  CreateProductPrice,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { BuildOrder, ConfirmOrder } from "../order-builder.js";
import {
  ENTITLEMENT_GRANT_ENTITY,
  ORDER_HEADER_ENTITY,
  OUTBOUND_DELIVERY_ENTITY,
  OUTBOUND_EVENT_ENTITY,
  PAYMENT_WEBHOOK_DELIVERY_ENTITY,
  SUBSCRIPTION_EVENT_ENTITY,
} from "../entity-names.js";
import { addDays, gatesFor, payOrder, renew, withGrantTiming } from "./entitlements.checks.js";

const CONSUMER_KEY = "integration-test-consumer";

/** What the test consumer saw, and whether it should fail. Reset by each check. */
const probe = {
  active: false,
  failWith: null as string | null,
  received: [] as OutboundEventEnvelope[],
};

@RegisterClass(OrdersOutboundConsumer, CONSUMER_KEY)
export class IntegrationTestOutboundConsumer extends OrdersOutboundConsumer {
  public override get EventTypes(): ReadonlyArray<OutboundEventType> {
    return probe.active ? ["OrderConfirmed", "GrantStatusChanged"] : [];
  }
  public override get GatesAccess(): boolean {
    return true;
  }
  public override async Deliver(event: OutboundEventEnvelope): Promise<void> {
    if (probe.failWith) throw new Error(probe.failWith);
    probe.received.push(event);
  }
}

interface EventRow {
  ID: string;
  EventType: string;
  EntitlementGrantID: string | null;
  PayloadJSON: string;
}
interface DeliveryRow {
  ID: string;
  EventType: string;
  ConsumerKey: string;
  GatesAccess: boolean;
  Status: string;
  Attempts: number;
  LastError: string | null;
  NextAttemptAt: Date;
  DeliveredAt: Date | null;
}

const eventsFor = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<EventRow>(
    ctx,
    `SELECT ID, EventType, EntitlementGrantID, PayloadJSON FROM ${ORDERS_SCHEMA}.OutboundEvent
      WHERE OrderHeaderID = '${orderID}' ORDER BY OccurredAt, EventType`,
  );

const deliveriesFor = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<DeliveryRow>(
    ctx,
    `SELECT d.ID, e.EventType, d.ConsumerKey, d.GatesAccess, d.Status, d.Attempts, d.LastError, d.NextAttemptAt, d.DeliveredAt
       FROM ${ORDERS_SCHEMA}.OutboundDelivery d
       JOIN ${ORDERS_SCHEMA}.OutboundEvent e ON e.ID = d.OutboundEventID
      WHERE e.OrderHeaderID = '${orderID}'`,
  );

/** Buy WidgetA, whose product carries two entitlement templates. */
async function buyWidget(ctx: IntegrationCheckContext): Promise<string> {
  const f = Fx();
  await CreateProductPrice(ctx, f.Products.WidgetA, 100);
  const order = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
  });
  Assert(order.Saved, `confirm failed: ${order.Message}`);
  return order.Order.ID as string;
}

function resetProbe(): void {
  probe.failWith = null;
  probe.received = [];
}

export const OutboundEventsChecks: NamedCheck[] = [
  {
    Id: "outbound-events.OB1",
    Name: "OB1: a confirm records one OrderConfirmed event and one GrantStatusChanged per grant, each with a delivery",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        resetProbe();
        const orderID = await buyWidget(ctx);
        const events = await eventsFor(ctx, orderID);
        AssertEqual(
          events.map((e) => e.EventType).join(","),
          "GrantStatusChanged,GrantStatusChanged,OrderConfirmed",
          "one event for the order and one for each of WidgetA's two grants",
        );
        const confirmed = JSON.parse(events.find((e) => e.EventType === "OrderConfirmed")!.PayloadJSON);
        AssertEqual(confirmed.OrderID?.toLowerCase(), orderID.toLowerCase(), "the payload names the order");
        AssertEqual(confirmed.Lines?.length, 1, "and carries its line");
        AssertEqual(confirmed.IsRenewal, false, "a first purchase is not a renewal");
        AssertEqual(JSON.stringify(confirmed.CheckoutAnswers), "[]", "an order with no checkout answers carries an empty list");
        const grant = JSON.parse(events.find((e) => e.EventType === "GrantStatusChanged")!.PayloadJSON);
        AssertEqual(grant.FromStatus, null, "a new grant has no previous status");
        Assert(typeof grant.Code === "string" && grant.Code.length > 0, "the grant payload carries the entitlement code");

        const deliveries = await deliveriesFor(ctx, orderID);
        AssertEqual(deliveries.length, 3, "one delivery per event for the one registered consumer");
        Assert(
          deliveries.every((d) => d.ConsumerKey === CONSUMER_KEY && d.Status === "Pending" && d.Attempts === 0 && d.GatesAccess === true),
          "each Pending, untried, and marked as gating access as the consumer declared",
        );
        AssertEqual(probe.received.length, 0, "nothing is sent inside the booking — only after it");
      }),
  },
  {
    Id: "outbound-events.OB2",
    Name: "OB2: dispatch delivers each event once; a second pass sends nothing",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        resetProbe();
        const orderID = await buyWidget(ctx);
        const first = await DispatchOutboundDeliveries({ OrderHeaderID: orderID }, ctx.Provider, ctx.User);
        AssertEqual(first.Delivered, 3, `all three were delivered (${JSON.stringify(first)})`);
        AssertEqual(probe.received.length, 3, "the consumer received all three");
        const ids = new Set((await eventsFor(ctx, orderID)).map((e) => e.ID.toLowerCase()));
        Assert(
          probe.received.every((e) => ids.has(e.EventID.toLowerCase())),
          "each envelope carries its event's stable id",
        );
        Assert(
          (await deliveriesFor(ctx, orderID)).every((d) => d.Status === "Delivered" && d.Attempts === 1 && d.DeliveredAt != null),
          "and each row is recorded Delivered after one attempt",
        );

        const again = await DispatchOutboundDeliveries({ OrderHeaderID: orderID }, ctx.Provider, ctx.User);
        AssertEqual(again.Claimed, 0, "a second pass claims nothing");
        AssertEqual(probe.received.length, 3, "so nothing fires twice");
      }),
  },
  {
    Id: "outbound-events.OB3",
    Name: "OB3: a consumer outage is recorded and retried later, not at once",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        resetProbe();
        const orderID = await buyWidget(ctx);
        probe.failWith = "consumer unavailable";
        const failed = await DispatchOutboundDeliveries({ OrderHeaderID: orderID }, ctx.Provider, ctx.User);
        AssertEqual(failed.Retrying, 3, "every delivery failed and was scheduled again");
        const rows = await deliveriesFor(ctx, orderID);
        Assert(
          rows.every((d) => d.Status === "Pending" && d.Attempts === 1 && d.LastError === "consumer unavailable"),
          "each row keeps the error and the attempt count",
        );
        Assert(
          rows.every((d) => new Date(d.NextAttemptAt).getTime() > Date.now()),
          "and waits before the next try",
        );

        probe.failWith = null;
        const tooSoon = await DispatchOutboundDeliveries({ OrderHeaderID: orderID }, ctx.Provider, ctx.User);
        AssertEqual(tooSoon.Claimed, 0, "a pass before the backoff has passed takes nothing");

        // Bring the retry forward, as the clock would, and the consumer — now back — receives them.
        await TxQuery(ctx, `UPDATE d SET d.NextAttemptAt = DATEADD(MINUTE, -1, SYSDATETIMEOFFSET())
                              FROM ${ORDERS_SCHEMA}.OutboundDelivery d
                              JOIN ${ORDERS_SCHEMA}.OutboundEvent e ON e.ID = d.OutboundEventID
                             WHERE e.OrderHeaderID = '${orderID}'`);
        const retried = await DispatchOutboundDeliveries({ OrderHeaderID: orderID }, ctx.Provider, ctx.User);
        AssertEqual(retried.Delivered, 3, "the retry delivers them");
        Assert((await deliveriesFor(ctx, orderID)).every((d) => d.Attempts === 2 && d.Status === "Delivered"), "on the second attempt");
      }),
  },
  {
    Id: "outbound-events.OB4",
    Name: "OB4: re-saving a confirmed order records nothing new; changing a grant's status records it with both statuses",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        resetProbe();
        const orderID = await buyWidget(ctx);
        const before = (await eventsFor(ctx, orderID)).length;

        const order = await ctx.Provider.GetEntityObject(ORDER_HEADER_ENTITY, ctx.User);
        Assert(await order.InnerLoad(CompositeKey.FromID(orderID)), "the order reloads");
        order.Set("Notes", "re-saved by OB4");
        Assert(await order.Save(), `the re-save succeeds: ${order.LatestResult?.CompleteMessage}`);
        AssertEqual((await eventsFor(ctx, orderID)).length, before, "a later save of a confirmed order fires no second OrderConfirmed");

        const g = await TxOne<{ ID: string }>(ctx,
          `SELECT TOP 1 g.ID FROM ${ORDERS_SCHEMA}.EntitlementGrant g
             JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = g.OrderLineID
            WHERE ol.OrderHeaderID = '${orderID}'`);
        const grant = await ctx.Provider.GetEntityObject(ENTITLEMENT_GRANT_ENTITY, ctx.User);
        Assert(await grant.InnerLoad(CompositeKey.FromID(g.ID)), "the grant reloads");
        grant.Set("Status", "Suspended");
        grant.Set("SuspensionReason", "AwaitingPayment");
        grant.Set("SuspendedAt", new Date());
        Assert(await grant.Save(), `the status change saves: ${grant.LatestResult?.CompleteMessage}`);

        const events = await eventsFor(ctx, orderID);
        AssertEqual(events.length, before + 1, "the status change is one new event");
        const change = events.filter((e) => e.EntitlementGrantID?.toLowerCase() === g.ID.toLowerCase()).map((e) => JSON.parse(e.PayloadJSON));
        Assert(
          change.some((p) => p.FromStatus === "Active" && p.ToStatus === "Suspended" && p.SuspensionReason === "AwaitingPayment"),
          `and it says what the grant moved from and to (${JSON.stringify(change)})`,
        );

        grant.Set("Notes", "touched");
        await grant.Save();
        AssertEqual((await eventsFor(ctx, orderID)).length, before + 1, "a save that leaves Status alone records nothing");
      }),
  },
  {
    Id: "outbound-events.OB5",
    Name: "OB5: a confirm that rolls back leaves no event behind",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        resetProbe();
        const f = Fx();
        await CreateProductPrice(ctx, f.Products.WidgetA, 100);
        await CreateProductPrice(ctx, f.Products.WidgetC, 100);
        const eventsBefore = Number((await TxOne<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OutboundEvent`)).N);
        // WidgetC belongs to a company with no GL links, so this confirm cannot book (as in EN14).
        const doomed = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            { ProductID: f.Products.WidgetA, Quantity: 1 },
            { ProductID: f.Products.WidgetC, Quantity: 1 },
          ],
        });
        Assert(!doomed.Saved, "the order must fail to book");
        const eventsAfter = Number((await TxOne<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OutboundEvent`)).N);
        AssertEqual(eventsAfter, eventsBefore, "no event, and so no delivery, survives a rolled-back confirm");
      }),
  },
  {
    Id: "outbound-events.OB6",
    Name: "OB6: a return records no OrderConfirmed; its revocations reach consumers as GrantStatusChanged",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        resetProbe();
        const f = Fx();
        const saleID = await buyWidget(ctx);
        const before = (await eventsFor(ctx, saleID)).length;
        const line = await TxOne<{ ID: string }>(ctx,
          `SELECT TOP 1 ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${saleID}'`);

        const ret = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          OrderType: "Return",
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: -1, ReversesOrderLineID: line.ID }],
        });
        Assert(ret.Saved, `the return must confirm: ${ret.Message}`);

        AssertEqual((await eventsFor(ctx, ret.Order.ID as string)).length, 0, "a return is not a purchase, so it records no OrderConfirmed");
        const revoked = (await eventsFor(ctx, saleID))
          .slice(before)
          .filter((e) => e.EventType === "GrantStatusChanged")
          .map((e) => JSON.parse(e.PayloadJSON));
        AssertEqual(revoked.length, 2, `each of the sale's two grants records its revocation (${JSON.stringify(revoked)})`);
        Assert(revoked.every((p) => p.ToStatus === "Revoked"), "as a move to Revoked");
      }),
  },
  {
    Id: "outbound-events.OB7",
    Name: "OB7: a confirm writes the order's checkout answers and OrderConfirmed carries them (#322)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        resetProbe();
        const f = Fx();
        await CreateProductPrice(ctx, f.Products.WidgetA, 100);
        const built = await BuildOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
        });
        const order = built.Order;
        const heard = await order.CheckoutAnswers.Create();
        heard.QuestionKey = "heardFrom";
        heard.QuestionLabel = "How did you hear about us?";
        heard.Answer = "other";
        heard.OtherText = "A colleague";
        const role = await order.CheckoutAnswers.Create();
        role.QuestionKey = "jobRole";
        role.QuestionLabel = "Your role";
        role.Answer = "Engineer";
        order.Status = "Confirmed";
        Assert(await order.Save(), `confirm failed: ${order.LatestResult?.CompleteMessage}`);
        const orderID = order.ID as string;

        const rows = await TxQuery<{ QuestionKey: string; Answer: string; OtherText: string | null }>(
          ctx,
          `SELECT QuestionKey, Answer, OtherText FROM ${ORDERS_SCHEMA}.OrderCheckoutAnswer
            WHERE OrderHeaderID = '${orderID}' ORDER BY QuestionKey`,
        );
        AssertEqual(
          JSON.stringify(rows),
          JSON.stringify([
            { QuestionKey: "heardFrom", Answer: "other", OtherText: "A colleague" },
            { QuestionKey: "jobRole", Answer: "Engineer", OtherText: null },
          ]),
          "both answers are written with the confirm",
        );

        const event = (await eventsFor(ctx, orderID)).find((e) => e.EventType === "OrderConfirmed");
        Assert(event !== undefined, "the confirm records OrderConfirmed");
        AssertEqual(
          JSON.stringify(JSON.parse(event!.PayloadJSON).CheckoutAnswers),
          JSON.stringify([
            { QuestionKey: "heardFrom", QuestionLabel: "How did you hear about us?", Answer: "other", OtherText: "A colleague" },
            { QuestionKey: "jobRole", QuestionLabel: "Your role", Answer: "Engineer", OtherText: null },
          ]),
          "and the event carries them, ordered by question key",
        );
      }),
  },
  {
    Id: "outbound-events.OB8",
    Name: "OB8: an unpaid renewal cut off by the nightly pass tells consumers, and so does the payment that restores it (#700)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        resetProbe();
        const f = Fx();
        await withGrantTiming(ctx, f.Products.SubRolling, "OnFirstPayment", async () => {
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
          const grantIDs = new Set((await gatesFor(ctx, renewalID)).map((g) => g.ID.toLowerCase()));
          Assert(grantIDs.size > 0, "the renewal grants the next term");
          const due = await TxOne<{ NextDueDate: Date | null; Balance: number }>(ctx,
            `SELECT NextDueDate, Balance FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID = '${renewalID}'`);
          Assert(due.NextDueDate != null, "the renewal carries a due date");
          await OrdersSettings.Load(ctx.Provider, ctx.User);
          const cutoff = OrdersSettings.RenewalAccessCutoffDaysPastDue;
          Assert(cutoff != null && cutoff > 0, "the cutoff setting is on, with a positive number of days");

          /** The renewal grants' status changes recorded since `skip` events were already there. */
          const changes = async (skip: number) =>
            (await eventsFor(ctx, renewalID))
              .slice(skip)
              .filter((e) => e.EventType === "GrantStatusChanged" && grantIDs.has((e.EntitlementGrantID ?? "").toLowerCase()))
              .map((e) => JSON.parse(e.PayloadJSON) as { FromStatus: string | null; ToStatus: string; SuspensionReason: string | null });
          const atConfirm = (await eventsFor(ctx, renewalID)).length;

          const cut = await EnforcePaymentGatedAccess(
            { AsOfDate: addDays(new Date(due.NextDueDate!).toISOString(), cutoff!) },
            ctx.Provider,
            ctx.User,
          );
          Assert(cut.Success, `the pass ran: ${cut.Message}`);
          const suspended = await changes(atConfirm);
          AssertEqual(suspended.length, grantIDs.size, `each renewal grant records its suspension (${JSON.stringify(suspended)})`);
          Assert(
            suspended.every((p) => p.FromStatus === "Active" && p.ToStatus === "Suspended" && p.SuspensionReason === "PastDue"),
            "as Active to Suspended, past due",
          );

          const afterCut = (await eventsFor(ctx, renewalID)).length;
          await payOrder(ctx, renewalID, Number(due.Balance));
          const restored = await changes(afterCut);
          AssertEqual(restored.length, grantIDs.size, `paying the renewal records each grant's return (${JSON.stringify(restored)})`);
          Assert(restored.every((p) => p.FromStatus === "Suspended" && p.ToStatus === "Active"), "as Suspended to Active");
        });
      }),
  },
  {
    Id: "outbound-events.OB13",
    Name: "OB13: Orders append-heavy event/webhook entities SaveReturnMode datestamps_only verification and benchmark log",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const { performance } = await import("node:perf_hooks");
        const { fileURLToPath } = await import("node:url");

        const expectedEntities = [
          OUTBOUND_EVENT_ENTITY,
          OUTBOUND_DELIVERY_ENTITY,
          PAYMENT_WEBHOOK_DELIVERY_ENTITY,
          SUBSCRIPTION_EVENT_ENTITY,
        ];
        for (const name of expectedEntities) {
          const info = ctx.Provider.EntityByName(name);
          Assert(!!info, `${name} entity metadata present`);
          AssertEqual(info!.SaveReturnMode, "datestamps_only", `${name} SaveReturnMode is datestamps_only`);
        }

        resetProbe();
        const t0 = performance.now();
        const orderID = await buyWidget(ctx);
        Assert(!!orderID, "OB13 order confirmed");
        const elapsedMs = Number((performance.now() - t0).toFixed(2));

        const logDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../benchmark-logs");
        fs.mkdirSync(logDir, { recursive: true });
        const entry = {
          Timestamp: new Date().toISOString(),
          Package: "@mj-biz-apps/orders-integration-tests",
          Check: "outbound-events.OB13",
          DatestampsOnlyEntities: expectedEntities,
          ConfirmOrderWithOutboundEventsMs: elapsedMs,
        };
        fs.writeFileSync(path.join(logDir, "latest.json"), JSON.stringify(entry, null, 2), "utf8");
        fs.appendFileSync(path.join(logDir, "history.jsonl"), JSON.stringify(entry) + "\n", "utf8");
      }),
  },
];

for (const check of OutboundEventsChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("outbound-events", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
    probe.active = true;
  },
  Teardown: async (ctx) => {
    probe.active = false;
    await TeardownOrdersFixture(ctx);
  },
});
