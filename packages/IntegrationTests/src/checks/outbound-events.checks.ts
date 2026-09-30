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
 *           OrderEntityServer.recordOrderConfirmedEvent
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
  OrdersOutboundConsumer,
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
import { ConfirmOrder } from "../order-builder.js";
import { ENTITLEMENT_GRANT_ENTITY, ORDER_HEADER_ENTITY } from "../entity-names.js";

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
      WHERE OrderHeaderID = '${orderID}' ORDER BY EventType, OccurredAt`,
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
