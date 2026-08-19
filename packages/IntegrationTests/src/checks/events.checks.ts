/**
 * events.checks.ts — the `events` bundle (EV1–EV10).
 *
 * WHAT AN EVENT IS HERE
 * A ticket sold in advance for something that happens on a fixed future date. The money arrives now
 * and is EARNED on the day — so the whole life of the line is one-time future deferred revenue:
 * `Dr AR / Cr Deferred Revenue` at booking, and a single forward-dated release on the event date.
 *
 * WHAT THIS BUNDLE ADDS OVER RR6
 * RR6 already proved the `AllBackEnd` rule by hand-setting a service period on the line. That leaves
 * the important part untested: for a real event NOBODY should type those dates. The event knows
 * when it is. So the assertions here are mostly about a line that carries NO dates and still
 * recognizes on exactly the right day (D-EVENT) — because the alternative is a recognition date
 * hand-typed on every ticket sold, where a typo books revenue in the wrong period and nothing
 * downstream disagrees.
 *
 *   EV1   a ticket line inherits its service period from the event
 *   EV2   booking defers the revenue rather than earning it
 *   EV3   exactly ONE release, dated the event's END date
 *   EV4   the release moves Deferred Revenue → Sales, and nets Deferred to zero
 *   EV5   an explicit service period on the line WINS over the event's
 *   EV6   a single-day event (no end date) recognizes on the day itself
 *   EV7   a non-event product is untouched by any of this
 *   EV8   quantity scales the deferral, and the release still lands on one date
 *   EV9   attendee detail rides on the EventOrderLine extension
 *   EV10  a two-company event order defers on each company separately
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 */
import { randomUUID } from "node:crypto";
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
  createViaEntity,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { EVENT_ORDER_LINE_ENTITY, EVENT_PRODUCT_ENTITY } from "../entity-names.js";
import { ConfirmOrder } from "../order-builder.js";

const AR_CODE = "11201";
const DEFERRED_CODE = "21301";
const SALES_CODE = "40100";

interface EntryRow {
  ID: string;
  EntryType: string;
  EffectiveDate: string;
  D: number;
}

/** Every journal entry caused by an order's lines, oldest first. */
const entriesForOrder = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<EntryRow>(
    ctx,
    `SELECT je.ID, (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) AS EntryType, je.EffectiveDate,
            (SELECT SUM(DebitAmount) FROM ${ACCT_SCHEMA}.JournalEntryLine WHERE JournalEntryID = je.ID) AS D
       FROM ${ACCT_SCHEMA}.vwJournalEntries je
       WHERE je.LinkedRecordID IN (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}')
       ORDER BY je.EffectiveDate`,
  );

/** Net debit-minus-credit on an account code across every entry for a company. */
const netOnAccount = (ctx: IntegrationCheckContext, companyID: string, code: string) =>
  TxOne<{ Net: number }>(
    ctx,
    `SELECT SUM(ISNULL(jel.DebitAmount,0)) - SUM(ISNULL(jel.CreditAmount,0)) AS Net
       FROM ${ACCT_SCHEMA}.JournalEntryLine jel
       JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
       JOIN ${ACCT_SCHEMA}.vwJournalEntries je ON je.ID = jel.JournalEntryID
       WHERE gl.Code='${code}' AND je.CompanyID='${companyID}'`,
  );

const dayOf = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

/** Sell `qty` tickets to the fixture's conference. The line deliberately carries NO dates. */
async function sellTickets(
  ctx: IntegrationCheckContext,
  qty = 1,
  unitPrice = 500,
  productKey = "EventTicket",
) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    OrderDate: new Date("2026-08-01T00:00:00Z"),
    Lines: [{ ProductID: f.Products[productKey], Quantity: qty, UnitPrice: unitPrice }],
  });
  Assert(result.Saved, `confirm failed: ${result.Message}`);
  return result;
}

/** The stored service period of an order's first line. */
const lineServicePeriod = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ ServicePeriodStart: string | null; ServicePeriodEnd: string | null; ID: string }>(
    ctx,
    `SELECT TOP 1 ID, ServicePeriodStart, ServicePeriodEnd
       FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}'`,
  );

export const EventChecks: NamedCheck[] = [
  {
    Id: "events.EV1",
    Name: "EV1: a ticket line inherits its service period from the EVENT, not from the order",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await sellTickets(ctx);
        const line = await lineServicePeriod(ctx, order.Order.ID as string);

        // Nobody typed these. This is the whole point of D-EVENT.
        AssertEqual(
          dayOf(line.ServicePeriodStart!),
          dayOf(f.Event.StartsAt),
          "start comes from EventProduct.EventStartsAt",
        );
        AssertEqual(
          dayOf(line.ServicePeriodEnd!),
          dayOf(f.Event.EndsAt),
          "end comes from EventProduct.EventEndsAt",
        );
      }),
  },
  {
    Id: "events.EV2",
    Name: "EV2: booking a future event DEFERS the revenue rather than earning it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await sellTickets(ctx);
        const booking = (await entriesForOrder(ctx, order.Order.ID as string)).filter(
          (e) => e.EntryType === "OrderBooking",
        );
        AssertEqual(booking.length, 1, "one booking entry for the line");

        const lines = await TxQuery<{ Code: string; DebitAmount: number; CreditAmount: number }>(
          ctx,
          `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
             FROM ${ACCT_SCHEMA}.JournalEntryLine jel
             JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
             WHERE jel.JournalEntryID='${booking[0].ID}'`,
        );
        AssertEqual(Number(lines.find((l) => l.Code === AR_CODE)?.DebitAmount), 500, "receivable raised");
        AssertEqual(
          Number(lines.find((l) => l.Code === DEFERRED_CODE)?.CreditAmount),
          500,
          "credited to DEFERRED revenue — nothing is earned until the event happens",
        );
        Assert(
          !lines.some((l) => l.Code === SALES_CODE),
          `no Sales credit at booking: ${JSON.stringify(lines)}`,
        );
        Assert(f.Event.StartsAt > new Date("2026-08-01"), "the event is genuinely in the future");
      }),
  },
  {
    Id: "events.EV3",
    Name: "EV3: exactly ONE release, dated the event's end date",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await sellTickets(ctx);
        const releases = (await entriesForOrder(ctx, order.Order.ID as string)).filter(
          (e) => e.EntryType === "RevenueRecognition",
        );
        // One entry, not a monthly waterfall: an event is earned in a single moment.
        AssertEqual(releases.length, 1, `one release for an event: ${JSON.stringify(releases)}`);
        AssertEqual(Number(releases[0].D), 500, "the whole amount earned at once");
        AssertEqual(
          dayOf(releases[0].EffectiveDate),
          dayOf(f.Event.EndsAt),
          "dated the event's END — the day it is delivered",
        );
      }),
  },
  {
    Id: "events.EV4",
    Name: "EV4: the release moves Deferred Revenue to Sales and nets Deferred to zero",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const baseDeferred = Number((await netOnAccount(ctx, f.CoA.ID, DEFERRED_CODE)).Net);
        const baseSales = Number((await netOnAccount(ctx, f.CoA.ID, SALES_CODE)).Net);
        await sellTickets(ctx);

        // Booking credited Deferred 500; the release debits it back and credits Sales. The pair
        // must net Deferred to nothing, or the liability lingers after the event has happened.
        AssertEqual(
          Number((await netOnAccount(ctx, f.CoA.ID, DEFERRED_CODE)).Net) - baseDeferred,
          0,
          "deferred revenue is fully released by the event date",
        );
        AssertEqual(
          Number((await netOnAccount(ctx, f.CoA.ID, SALES_CODE)).Net) - baseSales,
          -500,
          "and lands in Sales exactly once",
        );
      }),
  },
  {
    Id: "events.EV5",
    Name: "EV5: an explicit service period on the line WINS over the event's dates",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // A ticket to one day of a three-day conference is a legitimate thing to express, so the
        // inherited dates must be a default rather than an override.
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          OrderDate: new Date("2026-08-01T00:00:00Z"),
          Lines: [
            {
              ProductID: f.Products.EventTicket,
              Quantity: 1,
              UnitPrice: 500,
              ServicePeriodStart: "2027-04-16",
              ServicePeriodEnd: "2027-04-16",
            },
          ],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        const line = await lineServicePeriod(ctx, result.Order.ID as string);
        AssertEqual(dayOf(line.ServicePeriodEnd!), "2027-04-16", "the explicit date survived");
        const releases = (await entriesForOrder(ctx, result.Order.ID as string)).filter(
          (e) => e.EntryType === "RevenueRecognition",
        );
        AssertEqual(dayOf(releases[0].EffectiveDate), "2027-04-16", "and drove recognition");
      }),
  },
  {
    Id: "events.EV6",
    Name: "EV6: a single-day event (no end date) recognizes on the day itself",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // A webinar: EventEndsAt is null. Without the fallback, AllBackEnd would have no end date
        // to aim at and RequireServicePeriod would refuse the line outright.
        const catA = await TxOne<{ ID: string }>(
          ctx,
          `SELECT TOP 1 ID FROM ${ORDERS_SCHEMA}.ProductCategory WHERE CompanyID='${f.CoA.ID}'`,
        );
        // ONE SAVE, through the object model. An IsA child is created by creating the CHILD and
        // setting both its own fields and its parent's — BaseEntity splits them by
        // EntityInfo.ParentEntityFieldNames, saves the parent first, and hands the child the
        // parent's primary key (BO-D37). Creating the Product first and attaching an extension row
        // afterwards is the wrong shape and fails silently on 5.49.0.
        const productID = await createViaEntity(ctx, EVENT_PRODUCT_ENTITY, {
          EventStartsAt: "2027-02-10T15:00:00Z",
          EventEndsAt: null,
          RequiresAttendeeInfo: false,
          CompanyID: f.CoA.ID,
          ProductTypeID: f.ProductTypeIDs.Event,
          ProductCategoryID: catA.ID,
          Name: `${f.Run} Webinar`,
          Status: "Active",
          RevenueRecognitionTypeID: f.RevRecTypeIDs.get("AllBackEnd"),
          IsTaxable: 0,
        });

        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          OrderDate: new Date("2026-08-01T00:00:00Z"),
          Lines: [{ ProductID: productID, Quantity: 1, UnitPrice: 99 }],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        const line = await lineServicePeriod(ctx, result.Order.ID as string);
        AssertEqual(dayOf(line.ServicePeriodStart!), "2027-02-10", "start is the webinar date");
        AssertEqual(dayOf(line.ServicePeriodEnd!), "2027-02-10", "and so is the end — one day, not open-ended");

        const releases = (await entriesForOrder(ctx, result.Order.ID as string)).filter(
          (e) => e.EntryType === "RevenueRecognition",
        );
        AssertEqual(releases.length, 1, "one release");
        AssertEqual(dayOf(releases[0].EffectiveDate), "2027-02-10", "earned on the day it runs");
      }),
  },
  {
    Id: "events.EV7",
    Name: "EV7: a non-event product is untouched by event date inheritance",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // Widget A has no EventProduct row. Nothing should be stamped on it — the lookup must be a
        // no-op for ordinary products, not a source of surprise dates.
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 250 }],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);
        const line = await lineServicePeriod(ctx, result.Order.ID as string);
        Assert(
          line.ServicePeriodStart == null && line.ServicePeriodEnd == null,
          `an UpFront widget keeps no service period: ${JSON.stringify(line)}`,
        );
      }),
  },
  {
    Id: "events.EV8",
    Name: "EV8: quantity scales the deferral and the release still lands on one date",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await sellTickets(ctx, 4, 250); // a table of four
        const releases = (await entriesForOrder(ctx, order.Order.ID as string)).filter(
          (e) => e.EntryType === "RevenueRecognition",
        );
        AssertEqual(releases.length, 1, "still one release — four seats, one event");
        AssertEqual(Number(releases[0].D), 1000, "the whole 4 x 250 is earned together");
        AssertEqual(
          Number((await netOnAccount(ctx, f.CoA.ID, DEFERRED_CODE)).Net),
          0,
          "and the deferral fully clears",
        );
      }),
  },
  {
    Id: "events.EV9",
    Name: "EV9: attendee detail rides on the EventOrderLine extension",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sellTickets(ctx);
        const line = await lineServicePeriod(ctx, order.Order.ID as string);

        // The IsA child shares the parent's PK (BO-D37), which is what lets attendee data hang off
        // a line without widening OrderLine for every product type that will never use it.
        const f = Fx();
        await TxQuery(
          ctx,
          `INSERT INTO ${ORDERS_SCHEMA}.EventOrderLine (ID, PersonID, Comments)
           VALUES ('${line.ID}','${f.Customers.PersonID}','Vegan meal requested')`,
        );
        const attendee = await TxOne<{ PersonID: string; Comments: string; ID: string }>(
          ctx,
          `SELECT ID, PersonID, Comments FROM ${ORDERS_SCHEMA}.EventOrderLine WHERE ID='${line.ID}'`,
        );
        AssertEqual(attendee.PersonID.toLowerCase(), f.Customers.PersonID.toLowerCase(), "attendee person stored against the line");
        AssertEqual(attendee.Comments, "Vegan meal requested", "comments stored against the line");
        AssertEqual(
          attendee.ID.toLowerCase(),
          line.ID.toLowerCase(),
          "the extension shares the order line's primary key",
        );
      }),
  },
  {
    Id: "events.EV10",
    Name: "EV10: a two-company event order defers on EACH company separately",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const baseDeferredA = Number((await netOnAccount(ctx, f.CoA.ID, DEFERRED_CODE)).Net);
        const baseDeferredB = Number((await netOnAccount(ctx, f.CoB.ID, DEFERRED_CODE)).Net);
        const baseSalesA = Number((await netOnAccount(ctx, f.CoA.ID, SALES_CODE)).Net);
        const baseSalesB = Number((await netOnAccount(ctx, f.CoB.ID, SALES_CODE)).Net);

        // One conference, tickets sold by two entities — deferral must not pool into the ordering
        // company any more than receivables do.
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          OrderDate: new Date("2026-08-01T00:00:00Z"),
          Lines: [
            { ProductID: f.Products.EventTicket, Quantity: 1, UnitPrice: 500 },
            { ProductID: f.Products.EventTicketB, Quantity: 1, UnitPrice: 300 },
          ],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        // Each company's deferral is released by its own event-dated entry, so both net to zero.
        AssertEqual(
          Number((await netOnAccount(ctx, f.CoA.ID, DEFERRED_CODE)).Net) - baseDeferredA,
          0,
          `deferred revenue clears on company ${f.CoA.ID}`,
        );
        AssertEqual(
          Number((await netOnAccount(ctx, f.CoB.ID, DEFERRED_CODE)).Net) - baseDeferredB,
          0,
          `deferred revenue clears on company ${f.CoB.ID}`,
        );
        AssertEqual(
          Number((await netOnAccount(ctx, f.CoA.ID, SALES_CODE)).Net) - baseSalesA,
          -500,
          "Co A earns its 500",
        );
        AssertEqual(
          Number((await netOnAccount(ctx, f.CoB.ID, SALES_CODE)).Net) - baseSalesB,
          -300,
          "Co B earns its 300",
        );
      }),
  },
];

for (const check of EventChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("events", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: TeardownOrdersFixture,
});
