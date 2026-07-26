/**
 * line-subscriber.checks.ts — the `line-subscriber` bundle (LS1–LS8).
 *
 * Subscriptions were a HEADER concern: the flow read `OrderHeader.CustomerOrganizationID` and every
 * line on an order therefore had the same subscriber. An association buying ten memberships for ten
 * staff needed ten orders — and worse, under `RejectDuplicate` all ten lines collided as one
 * subscriber, so it could not be done at all.
 *
 * Two changes fix it, and this bundle is the proof:
 *   D61  ship-to moves to the LINE. For a physical product it routes delivery; for an intangible
 *        there is nothing to ship, so the same fields say WHO the line is for.
 *   D62  `BenefitModel` separates who HOLDS a subscription from who BENEFITS, and that is what
 *        decides the dedupe scope.
 *
 * WHAT IT PROVES
 *   LS1  a line's ship-to organization becomes the subscriber, overriding the order's customer
 *   LS2  a line with no ship-to still inherits the header — nothing regressed
 *   LS3  the fallback is per-SIDE: a line naming only a person keeps the header's organization
 *   LS4  ONE order, TEN seats, TEN people → ten subscriptions (the case that was impossible)
 *   LS5  an Organization-benefit type dedupes on the ORG — a second purchase extends the one membership
 *   LS6  a seat inherits its person from the ORDER's ship-to; it fails only when nobody resolves
 *   LS7  an Organization-benefit type refuses to be held by a person alone
 *   LS8  an explicit RenewsSubscriptionID targets that subscription instead of searching
 *   LS10 a person's organization is stamped from their affiliation AS OF the order date
 *   LS11 several affiliations → most recent wins; none → it stays a personal order
 *   LS12 the app setting governs it, including which relationship types qualify
 *   LS9  ACROSS orders the dedupe scope bites: a different person is new, the same person is refused
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
  COMMON_SCHEMA,
  CreateOrdersFixture,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  SameID,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { ConfirmOrder, type LineSpec } from "../order-builder.js";

/** Create a person to receive a seat, returning its ID. */
async function makePerson(ctx: IntegrationCheckContext, label: string): Promise<string> {
  const id = randomUUID();
  await TxQuery(
    ctx,
    `INSERT INTO ${COMMON_SCHEMA}.Person (ID, FirstName, LastName)
     VALUES ('${id}','${label}','${Fx().Run}')`,
  );
  return id;
}

/** The subscriptions produced by an order, with their resolved subscriber. */
const subscriptionsOf = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<{
    ID: string;
    CustomerOrganizationID: string | null;
    BeneficiaryPersonID: string | null;
    SubscriptionNumber: string;
  }>(
    ctx,
    `SELECT DISTINCT s.ID, s.CustomerOrganizationID, s.BeneficiaryPersonID, s.SubscriptionNumber
     FROM ${ORDERS_SCHEMA}.Subscription s
     JOIN ${ORDERS_SCHEMA}.SubscriptionTerm t ON t.SubscriptionID = s.ID
     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = t.OrderLineID
     WHERE ol.OrderHeaderID = '${orderID}'`,
  );

export const LineSubscriberChecks: NamedCheck[] = [
  {
    Id: "line-subscriber.LS1",
    Name: "LS1: a line's ship-to organization becomes the subscriber, not the order's customer",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // The order is placed BY one org and the membership is FOR another — a parent body buying
        // for a chapter. The customer pays; the ship-to holds and benefits.
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          CustomerOrganizationID: f.Customers.OrganizationID,
          Lines: [
            {
              ProductID: f.Products.SubRolling,
              Quantity: 1,
              UnitPrice: 1200,
              ShipToOrganizationID: f.Customers.SecondOrganizationID,
            },
          ],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        const [sub] = await subscriptionsOf(ctx, result.Order.ID as string);
        Assert(
          SameID(sub.CustomerOrganizationID, f.Customers.SecondOrganizationID),
          "the subscription belongs to the SHIP-TO organization, not the paying customer",
        );
        Assert(
          !SameID(sub.CustomerOrganizationID, f.Customers.OrganizationID),
          "and specifically not the order's customer",
        );
      }),
  },
  {
    Id: "line-subscriber.LS2",
    Name: "LS2: a line with no ship-to still inherits the order header",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // The common case, and the one that must not have regressed when ship-to was introduced.
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          CustomerOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 }],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        const [sub] = await subscriptionsOf(ctx, result.Order.ID as string);
        Assert(
          SameID(sub.CustomerOrganizationID, f.Customers.OrganizationID),
          "with no ship-to, the header's customer is the subscriber",
        );
      }),
  },
  {
    Id: "line-subscriber.LS3",
    Name: "LS3: the fallback is per-side — a line naming only a person keeps the header's organization",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const person = await makePerson(ctx, "Perside");

        // Naming a person must not blank the organization. All-or-nothing fallback would drop the
        // paying org and turn a seat into an individual membership.
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          CustomerOrganizationID: f.Customers.OrganizationID,
          Lines: [
            {
              ProductID: f.Products.SubSeat,
              Quantity: 1,
              UnitPrice: 300,
              ShipToPersonID: person,
            },
          ],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        const [sub] = await subscriptionsOf(ctx, result.Order.ID as string);
        Assert(SameID(sub.BeneficiaryPersonID, person), "the named person benefits");
        Assert(
          SameID(sub.CustomerOrganizationID, f.Customers.OrganizationID),
          "and the header's organization is still the holder",
        );
      }),
  },
  {
    Id: "line-subscriber.LS4",
    Name: "LS4: one order with ten seats for ten people creates ten subscriptions",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // THE case this work exists for. Before D61/D62 every line carried the header's subscriber,
        // so ten seats were ten purchases by the same subscriber — and under RejectDuplicate the
        // second line onward was refused outright.
        const people: string[] = [];
        const lines: LineSpec[] = [];
        for (let i = 0; i < 10; i++) {
          const person = await makePerson(ctx, `Seat${i}`);
          people.push(person);
          lines.push({
            ProductID: f.Products.SubSeat,
            Quantity: 1,
            UnitPrice: 300,
            ShipToPersonID: person,
          });
        }

        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          CustomerOrganizationID: f.Customers.OrganizationID,
          Lines: lines,
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        // NOTE what this does and does not prove. All ten decisions are made before any
        // subscription is persisted, so none of them finds a pre-existing one — this shows the
        // per-line SUBSCRIBER works, not the dedupe SCOPE. LS9 covers the scope, across orders,
        // which is the only place it can actually bite.
        const subs = await subscriptionsOf(ctx, result.Order.ID as string);
        AssertEqual(subs.length, 10, "ten seats, ten subscriptions");

        // Each seat belongs to its own person, and all of them to the paying organization.
        const beneficiaries = new Set(subs.map((s) => (s.BeneficiaryPersonID ?? "").toLowerCase()));
        AssertEqual(beneficiaries.size, 10, "ten distinct beneficiaries");
        for (const person of people) {
          Assert(beneficiaries.has(person.toLowerCase()), `seat missing for person ${person}`);
        }
        Assert(
          subs.every((s) => SameID(s.CustomerOrganizationID, f.Customers.OrganizationID)),
          "every seat is held by the paying organization",
        );

        // And each got its own term — ten seats billed, not one.
        const terms = await TxQuery(
          ctx,
          `SELECT t.ID FROM ${ORDERS_SCHEMA}.SubscriptionTerm t
           JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = t.OrderLineID
           WHERE ol.OrderHeaderID = '${result.Order.ID}'`,
        );
        AssertEqual(terms.length, 10, "ten terms");
      }),
  },
  {
    Id: "line-subscriber.LS5",
    Name: "LS5: an Organization-benefit type dedupes on the organization alone",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // A trade association: the company joins and its people are members by virtue of that. Two
        // people from the same company must NOT produce two memberships — the org holds one.
        const first = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          CustomerOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.SubCalendar, Quantity: 1, UnitPrice: 1200 }],
          OrderDate: new Date("2026-07-01T00:00:00Z"),
        });
        Assert(first.Saved, `first confirm failed: ${first.Message}`);

        // Same org, but naming a person this time. BenefitModel=OrganizationMembers means the
        // person is irrelevant to identity, so this extends rather than creating a second.
        const person = await makePerson(ctx, "Employee");
        const second = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          CustomerOrganizationID: f.Customers.OrganizationID,
          Lines: [
            {
              ProductID: f.Products.SubCalendar,
              Quantity: 1,
              UnitPrice: 1200,
              ShipToPersonID: person,
            },
          ],
          OrderDate: new Date("2026-08-01T00:00:00Z"),
        });
        Assert(second.Saved, `second confirm failed: ${second.Message}`);

        const [firstSub] = await subscriptionsOf(ctx, first.Order.ID as string);
        const [secondSub] = await subscriptionsOf(ctx, second.Order.ID as string);
        Assert(
          SameID(firstSub.ID, secondSub.ID),
          "the second purchase extends the ORGANISATION's single membership",
        );

        const all = await TxQuery(
          ctx,
          `SELECT ID FROM ${ORDERS_SCHEMA}.Subscription
           WHERE ProductID='${f.Products.SubCalendar}'
             AND CustomerOrganizationID='${f.Customers.OrganizationID}'`,
        );
        AssertEqual(all.length, 1, "still exactly one company membership");
      }),
  },
  {
    Id: "line-subscriber.LS6",
    Name: "LS6: a seat line with no ship-to person inherits it from the order, and only fails when nobody resolves",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const person = await makePerson(ctx, "Inherited");

        // The line names NO person. It must not be refused — the order's ship-to supplies one.
        // Requiring it per line would make a bulk order for a single recipient absurd.
        const inherited = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          CustomerOrganizationID: f.Customers.OrganizationID,
          ShipToPersonID: person,
          Lines: [{ ProductID: f.Products.SubSeat, Quantity: 1, UnitPrice: 300 }],
        });
        Assert(inherited.Saved, `a seat should inherit the order's ship-to person: ${inherited.Message}`);
        const [sub] = await subscriptionsOf(ctx, inherited.Order.ID as string);
        Assert(SameID(sub.BeneficiaryPersonID, person), "the order's ship-to person benefits");

        // With no person anywhere — not on the line, the order's ship-to, or its customer — there
        // genuinely is nobody to benefit, and THAT is the failure worth reporting.
        const nobody = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          CustomerOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.SubSeat, Quantity: 1, UnitPrice: 300 }],
        });
        Assert(!nobody.Saved, "with no person resolvable anywhere it must be refused");
        Assert(
          /no[nb]e was resolved|none was resolved|benefits a named person/i.test(nobody.Message),
          `the refusal should say the person could not be resolved, got: ${nobody.Message}`,
        );
      }),
  },
  {
    Id: "line-subscriber.LS7",
    Name: "LS7: an Organization-benefit type refuses to be held by a person alone",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const person = await makePerson(ctx, "Soloist");
        // No organization anywhere — there are no members to spread the benefit across.
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          CustomerPersonID: person,
          Lines: [{ ProductID: f.Products.SubCalendar, Quantity: 1, UnitPrice: 1200 }],
        });
        Assert(!result.Saved, "an org-members benefit cannot be held by an individual");
        Assert(
          /organization/i.test(result.Message),
          `the refusal should name the problem, got: ${result.Message}`,
        );
      }),
  },
  {
    Id: "line-subscriber.LS8",
    Name: "LS8: an explicit RenewsSubscriptionID targets that subscription instead of searching",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const personA = await makePerson(ctx, "SeatA");
        const personB = await makePerson(ctx, "SeatB");

        const initial = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          CustomerOrganizationID: f.Customers.OrganizationID,
          Lines: [
            { ProductID: f.Products.SubSeat, Quantity: 1, UnitPrice: 300, ShipToPersonID: personA },
            { ProductID: f.Products.SubSeat, Quantity: 1, UnitPrice: 300, ShipToPersonID: personB },
          ],
        });
        Assert(initial.Saved, `confirm failed: ${initial.Message}`);
        const subs = await subscriptionsOf(ctx, initial.Order.ID as string);
        AssertEqual(subs.length, 2, "two seats to choose between");
        const target = subs.find((s) => SameID(s.BeneficiaryPersonID, personB))!;

        // Name B's subscription explicitly. Without the pointer the engine would resolve by
        // subscriber, and this line names NO person — so it would have found nothing and created a
        // third subscription rather than extending B's.
        const renewal = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          CustomerOrganizationID: f.Customers.OrganizationID,
          Lines: [
            {
              ProductID: f.Products.SubSeat,
              Quantity: 1,
              UnitPrice: 300,
              RenewsSubscriptionID: target.ID,
            },
          ],
        });
        Assert(renewal.Saved, `renewal confirm failed: ${renewal.Message}`);

        const [renewed] = await subscriptionsOf(ctx, renewal.Order.ID as string);
        Assert(SameID(renewed.ID, target.ID), "the named subscription was extended");

        const terms = await TxQuery<{ TermNumber: number }>(
          ctx,
          `SELECT TermNumber FROM ${ORDERS_SCHEMA}.SubscriptionTerm
           WHERE SubscriptionID='${target.ID}' ORDER BY TermNumber`,
        );
        AssertEqual(terms.length, 2, "B's subscription now has two terms");

        const total = await TxQuery(
          ctx,
          `SELECT ID FROM ${ORDERS_SCHEMA}.Subscription
           WHERE ProductID='${f.Products.SubSeat}'
             AND CustomerOrganizationID='${f.Customers.OrganizationID}'`,
        );
        AssertEqual(total.length, 2, "and no third subscription was created");
      }),
  },
];

/** Affiliate a person to an organization for a dated window. */
async function affiliate(
  ctx: IntegrationCheckContext,
  personID: string,
  organizationID: string,
  typeName: string,
  startDate: string,
): Promise<void> {
  await TxQuery(
    ctx,
    `INSERT INTO ${COMMON_SCHEMA}.Relationship
        (ID, RelationshipTypeID, FromPersonID, ToOrganizationID, Status, StartDate)
     VALUES ('${randomUUID()}',
             (SELECT ID FROM ${COMMON_SCHEMA}.RelationshipType WHERE Name='${typeName}'),
             '${personID}','${organizationID}','Active','${startDate}')`,
  );
}

/** Point the app setting at a value for the duration of a check. */
async function setSetting(ctx: IntegrationCheckContext, name: string, value: string): Promise<void> {
  await TxQuery(
    ctx,
    `UPDATE __mj.ApplicationSetting SET Value='${value}'
     WHERE Name='${name}'
       AND ApplicationID = (SELECT ID FROM __mj.Application WHERE Name='__mj_BizAppsOrders')`,
  );
  const { ApplicationSettingEngine } = await import("@memberjunction/core-entities");
  await ApplicationSettingEngine.Instance.Config(true, ctx.User, ctx.Provider);
}

LineSubscriberChecks.push({
  Id: "line-subscriber.LS10",
  Name: "LS10: a person's organization is stamped from their affiliation as of the order date",
  RequiresMutation: true,
  Fn: async (ctx) =>
    InRolledBackTransaction(ctx, async () => {
      const f = Fx();
      const person = await makePerson(ctx, "Affiliated");
      await affiliate(ctx, person, f.Customers.SecondOrganizationID, "Employee", "2020-01-01");

      // No organization anywhere on the order — only a person. The affiliation supplies it, and it
      // is STAMPED, so the order still says so after that person changes employer.
      const result = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        CustomerPersonID: person,
        Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 }],
      });
      Assert(result.Saved, `confirm failed: ${result.Message}`);

      const [sub] = await subscriptionsOf(ctx, result.Order.ID as string);
      Assert(
        SameID(sub.CustomerOrganizationID, f.Customers.SecondOrganizationID),
        "the person's employer was stamped onto the subscription",
      );
    }),
});

LineSubscriberChecks.push({
  Id: "line-subscriber.LS11",
  Name: "LS11: with several affiliations the most recent wins; with none it stays a personal order",
  RequiresMutation: true,
  Fn: async (ctx) =>
    InRolledBackTransaction(ctx, async () => {
      const f = Fx();

      // A person can hold several at once — Relationship has no uniqueness constraint — so this is
      // normal rather than exceptional, and the rule must be stated rather than guessed.
      const multi = await makePerson(ctx, "Multi");
      await affiliate(ctx, multi, f.Customers.OrganizationID, "Employee", "2019-01-01");
      await affiliate(ctx, multi, f.Customers.SecondOrganizationID, "Employee", "2024-06-01");

      const chosen = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        CustomerPersonID: multi,
        Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 }],
      });
      Assert(chosen.Saved, `confirm failed: ${chosen.Message}`);
      const [multiSub] = await subscriptionsOf(ctx, chosen.Order.ID as string);
      Assert(
        SameID(multiSub.CustomerOrganizationID, f.Customers.SecondOrganizationID),
        "the most recently started affiliation wins",
      );

      // Nobody affiliated: blank stays blank, which IS the personal order — no flag required.
      const solo = await makePerson(ctx, "Unaffiliated");
      const personal = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        CustomerPersonID: solo,
        Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 }],
      });
      Assert(personal.Saved, `personal order failed: ${personal.Message}`);
      const [personalSub] = await subscriptionsOf(ctx, personal.Order.ID as string);
      Assert(personalSub.CustomerOrganizationID == null, "a personal order keeps a blank organization");
      Assert(SameID(personalSub.BeneficiaryPersonID, solo), "and the person is the subscriber");
    }),
});

LineSubscriberChecks.push({
  Id: "line-subscriber.LS12",
  Name: "LS12: the setting governs it — off stamps nothing, and only listed relationship types qualify",
  RequiresMutation: true,
  Fn: async (ctx) =>
    InRolledBackTransaction(ctx, async () => {
      const f = Fx();

      // A VENDOR relationship must not make that organization the bill-to. Only the types listed in
      // the setting qualify, and the default is Employee alone.
      const vendor = await makePerson(ctx, "VendorOnly");
      await affiliate(ctx, vendor, f.Customers.SecondOrganizationID, "Vendor", "2020-01-01");
      const vendorOrder = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        CustomerPersonID: vendor,
        Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 }],
      });
      Assert(vendorOrder.Saved, `confirm failed: ${vendorOrder.Message}`);
      const [vendorSub] = await subscriptionsOf(ctx, vendorOrder.Order.ID as string);
      Assert(
        vendorSub.CustomerOrganizationID == null,
        "a Vendor relationship must not be treated as an employer",
      );

      // Widening the setting is a DATA change — no release needed.
      await setSetting(ctx, "OrganizationAffiliationRelationshipTypes", "Employee,Vendor");
      const widened = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        CustomerPersonID: vendor,
        Lines: [{ ProductID: f.Products.SubMonthly, Quantity: 1, UnitPrice: 40 }],
      });
      Assert(widened.Saved, `confirm failed: ${widened.Message}`);
      const [widenedSub] = await subscriptionsOf(ctx, widened.Order.ID as string);
      Assert(
        SameID(widenedSub.CustomerOrganizationID, f.Customers.SecondOrganizationID),
        "with Vendor listed, the affiliation now qualifies",
      );

      // And the master switch turns the whole inference off.
      await setSetting(ctx, "AutoPopulateOrganizationFromPerson", "false");
      const off = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        CustomerPersonID: await (async () => {
          const p = await makePerson(ctx, "SwitchedOff");
          await affiliate(ctx, p, f.Customers.OrganizationID, "Employee", "2020-01-01");
          return p;
        })(),
        Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 }],
      });
      Assert(off.Saved, `confirm failed: ${off.Message}`);
      const [offSub] = await subscriptionsOf(ctx, off.Order.ID as string);
      Assert(
        offSub.CustomerOrganizationID == null,
        "with the setting off, only what the caller supplied is stored",
      );
    }),
});

LineSubscriberChecks.push({
  Id: "line-subscriber.LS9",
  Name: "LS9: across orders, a seat for a different person is new and a repeat for the same person is refused",
  RequiresMutation: true,
  Fn: async (ctx) =>
    InRolledBackTransaction(ctx, async () => {
      const f = Fx();
      const personA = await makePerson(ctx, "AcrossA");
      const personB = await makePerson(ctx, "AcrossB");

      const first = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        CustomerOrganizationID: f.Customers.OrganizationID,
        Lines: [{ ProductID: f.Products.SubSeat, Quantity: 1, UnitPrice: 300, ShipToPersonID: personA }],
      });
      Assert(first.Saved, `first confirm failed: ${first.Message}`);

      // A DIFFERENT person at the same organization. The seat type is RejectDuplicate, so this only
      // succeeds if the dedupe key is the (org, person) PAIR. Keyed on the org alone it would be
      // refused as a duplicate — which is exactly what blocked bulk seat purchases before D62.
      const second = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        CustomerOrganizationID: f.Customers.OrganizationID,
        Lines: [{ ProductID: f.Products.SubSeat, Quantity: 1, UnitPrice: 300, ShipToPersonID: personB }],
      });
      Assert(second.Saved, `a seat for a DIFFERENT person must be allowed: ${second.Message}`);

      const [subA] = await subscriptionsOf(ctx, first.Order.ID as string);
      const [subB] = await subscriptionsOf(ctx, second.Order.ID as string);
      Assert(!SameID(subA.ID, subB.ID), "two people, two subscriptions");

      // The SAME person again. RejectDuplicate must still bite — the pair matches this time.
      const repeat = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        CustomerOrganizationID: f.Customers.OrganizationID,
        Lines: [{ ProductID: f.Products.SubSeat, Quantity: 1, UnitPrice: 300, ShipToPersonID: personA }],
      });
      Assert(!repeat.Saved, "a second seat for the SAME person must be refused");
      Assert(
        /second concurrent subscription/i.test(repeat.Message),
        `the refusal should name the concurrency rule, got: ${repeat.Message}`,
      );
    }),
});

for (const check of LineSubscriberChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("line-subscriber", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: TeardownOrdersFixture,
});
