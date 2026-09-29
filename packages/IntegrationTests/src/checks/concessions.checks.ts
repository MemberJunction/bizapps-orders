/**
 * concessions — value given away, however it is delivered, approved before the customer sees it.
 *
 * The guardrails valued a concession only as a percentage off price, so a term extended at no
 * charge computed to 0% and cleared every check (golive #222). These drive the real pieces:
 *
 *   CS1       a booked term's end date cannot be moved — the extension is a concession instead
 *   CS2/CS3   a Duration concession is valued at the term's own rate, and judged on value AND length
 *   CS4       only a holder of the ConcessionLimit rule's role decides a Pending one
 *   CS5       with no ConcessionLimit rule nobody could approve, so recording one is refused
 *   CS6       a typed price below the engine's holds the confirm until a concession covers it
 *   CS7       a Pending concession holds the confirm; withdrawing it releases the order
 *   CS8       a manual discount inside its percentage cap still escalates on absolute value
 *   CS9       a line priced through the API without PriceOverridden still holds the confirm
 *   CS10      removing a draft line removes its concession, even an approved one
 *   CS11      a bundle's components are priced at their allocation, which is not a concession
 *   CS12      a Duration concession at the share-of-order limit escalates; one just below it does not
 *   CS13      the same value escalates on a small order and passes on a large one (Seats)
 *   CS14      Price and Scope concessions are held to the share limit too
 *   CS15      the share counts every concession on the order, so splitting one does not get under it
 *   CS16      a draft that shrinks after an approval on authority holds the confirm until the
 *             concession is withdrawn and recorded again
 *
 * CONNECTS TO:
 *   CODE: ConcessionBehavior · ConcessionGate · OrderConcessionEntityServer · SubscriptionTermEntity
 *         · OrderEntityServer.passesConcessionGate · PromotionEngine.AuthorizeManualDiscount
 */
import {
  Assert,
  AssertEqual,
  IntegrationCheckRegistry,
  type IntegrationCheckContext,
  type NamedCheck,
} from "@memberjunction/testing-integration";
import { Metadata } from "@memberjunction/core";
import { FindUnapprovedConcessions } from "@mj-biz-apps/orders-core-entities-server";
import type {
  mjBizAppsOrdersOrderConcessionEntity,
  mjBizAppsOrdersOrderLineEntity,
  mjBizAppsOrdersSalesRuleEntity,
  mjBizAppsOrdersSubscriptionTermEntity,
} from "@mj-biz-apps/orders-entities";
import {
  CreateBundleItem,
  CreateOrdersFixture,
  CreateProductPrice,
  createViaEntity,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import {
  ORDER_CONCESSION_ENTITY,
  ORDER_LINE_ENTITY,
  SALES_AUTHORITY_ENTITY,
  SALES_RULE_ENTITY,
  SUBSCRIPTION_TERM_ENTITY,
} from "../entity-names.js";
import { BuildOrder, ConfirmOrder } from "../order-builder.js";

interface Limits {
  maxPct?: number | null;
  maxValue?: number | null;
  maxDays?: number | null;
  maxShare?: number | null;
}

/** Grant the current user a SalesAuthority with the given limits. */
async function grantAuthority(ctx: IntegrationCheckContext, limits: Limits): Promise<string> {
  return createViaEntity(ctx, SALES_AUTHORITY_ENTITY, {
    SalesRepUserID: ctx.User.ID,
    MaxDiscountPct: limits.maxPct ?? null,
    MaxConcessionValue: limits.maxValue ?? null,
    MaxTermExtensionDays: limits.maxDays ?? null,
    MaxConcessionPctOfContract: limits.maxShare ?? null,
    IsActive: 1,
  });
}

async function addRule(ctx: IntegrationCheckContext, ruleType: string, roleID: string): Promise<string> {
  return createViaEntity(ctx, SALES_RULE_ENTITY, {
    Name: `${ruleType} approval`,
    RuleType: ruleType,
    Scope: "Global",
    ApprovalRequiredRoleID: roleID,
    IsActive: 1,
  });
}

async function roleTheUserLacks(ctx: IntegrationCheckContext): Promise<string> {
  const row = await TxOne<{ ID: string }>(ctx,
    `SELECT TOP 1 r.ID FROM __mj.Role r
      WHERE NOT EXISTS (SELECT 1 FROM __mj.UserRole ur WHERE ur.RoleID = r.ID AND ur.UserID = '${ctx.User.ID}')`);
  Assert(row?.ID != null, "no role exists that this user lacks");
  return row.ID;
}

async function roleTheUserHolds(ctx: IntegrationCheckContext): Promise<string> {
  const row = await TxOne<{ RoleID: string }>(ctx,
    `SELECT TOP 1 RoleID FROM __mj.UserRole WHERE UserID = '${ctx.User.ID}'`);
  Assert(row?.RoleID != null, "this user holds no roles");
  return row.RoleID;
}

/** Confirm a one-year SubRolling subscription at `price`; returns the order and its term. */
async function bookTerm(ctx: IntegrationCheckContext, price: number) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: price }],
  });
  Assert(result.Saved, `the subscription order did not confirm: ${result.Message}`);
  const term = await TxOne<{ ID: string; StartDate: Date; EndDate: Date; Amount: number }>(ctx,
    `SELECT st.ID, st.StartDate, st.EndDate, st.Amount
       FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
       JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
      WHERE ol.OrderHeaderID = '${result.Order.ID}'`);
  Assert(term?.ID != null, "confirm wrote no term");
  return { OrderID: result.Order.ID, Term: term };
}

/** A term's length in days, both ends counted. The date cells arrive as `Date` or ISO string. */
const termDays = (t: { StartDate: string | Date; EndDate: string | Date }) =>
  Math.round((new Date(t.EndDate).getTime() - new Date(t.StartDate).getTime()) / 86_400_000) + 1;

type ConcessionInput = Partial<
  Pick<
    mjBizAppsOrdersOrderConcessionEntity,
    "DeliveryForm" | "ReasonCategory" | "Reason" | "OrderLineID" | "SubscriptionTermID" | "AddedDays" | "AddedQuantity"
  >
>;

/** Record a concession through the entity, returning the saved object or the refusal. */
async function recordConcession(
  ctx: IntegrationCheckContext,
  input: ConcessionInput,
): Promise<{ Saved: boolean; Message: string; Entity: mjBizAppsOrdersOrderConcessionEntity }> {
  const entity = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderConcessionEntity>(ORDER_CONCESSION_ENTITY, ctx.User);
  entity.NewRecord();
  entity.ReasonCategory = input.ReasonCategory ?? "Retention";
  entity.Reason = input.Reason ?? "keep the account";
  if (input.DeliveryForm) entity.DeliveryForm = input.DeliveryForm;
  if (input.OrderLineID) entity.OrderLineID = input.OrderLineID;
  if (input.SubscriptionTermID) entity.SubscriptionTermID = input.SubscriptionTermID;
  if (input.AddedDays != null) entity.AddedDays = input.AddedDays;
  if (input.AddedQuantity != null) entity.AddedQuantity = input.AddedQuantity;
  const saved = await entity.Save();
  return { Saved: saved, Message: entity.LatestResult?.CompleteMessage ?? "", Entity: entity };
}

export const ConcessionChecks: NamedCheck[] = [
  {
    Id: "concessions.CS1",
    Name: "CS1: a booked term's end date cannot be moved — extending it is a concession",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const { Term } = await bookTerm(ctx, 1200);
        const term = await new Metadata().GetEntityObject<mjBizAppsOrdersSubscriptionTermEntity>(SUBSCRIPTION_TERM_ENTITY, ctx.User);
        Assert(await term.Load(Term.ID), "term did not load");
        const end = new Date(term.EndDate);
        end.setUTCDate(end.getUTCDate() + 90);
        term.EndDate = end;
        const saved = await term.Save();
        Assert(!saved, "moving a booked term's end date must be refused");
        Assert(/Duration concession/.test(term.LatestResult?.CompleteMessage ?? ""),
          `the refusal should say how to extend a term, got: ${term.LatestResult?.CompleteMessage}`);
      }),
  },
  {
    Id: "concessions.CS2",
    Name: "CS2: a no-charge extension is valued at the term's own rate and escalates at the day limit",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const { OrderID, Term } = await bookTerm(ctx, 1200);
        await grantAuthority(ctx, { maxPct: 0.1, maxValue: 100, maxDays: 30 });
        const ruleID = await addRule(ctx, "ConcessionLimit", await roleTheUserLacks(ctx));

        // 30 days against a 30-day limit: at the limit is outside it. The value stays under the value
        // limit, so the day limit alone decides it.
        const c = await recordConcession(ctx, { DeliveryForm: "Duration", SubscriptionTermID: Term.ID, AddedDays: 30 });
        Assert(c.Saved, `recording failed: ${c.Message}`);
        AssertEqual(c.Entity.Status, "Pending", "an extension at the day limit waits for approval");
        const expected = Math.round((Number(Term.Amount) * 30 / termDays(Term)) * 100) / 100;
        AssertEqual(Number(c.Entity.ComputedValue), expected, "valued at the term's amount over its length");
        Assert(Number(c.Entity.ComputedValue) > 0, "a free extension is not worth zero");
        AssertEqual(String(c.Entity.OrderHeaderID).toLowerCase(), OrderID.toLowerCase(), "stamped to the order that bought the term");
        AssertEqual(String(c.Entity.SalesRuleID).toLowerCase(), ruleID.toLowerCase(), "stamped with the rule that decides it");

        const held = await FindUnapprovedConcessions(OrderID, [], false, ctx.Provider, ctx.User);
        AssertEqual(held.length, 1, "the order's documents are held while it is Pending");
      }),
  },
  {
    Id: "concessions.CS3",
    Name: "CS3: an extension inside both limits is approved on save and records the authority",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const { Term } = await bookTerm(ctx, 1200);
        const authorityID = await grantAuthority(ctx, { maxValue: 1000, maxDays: 30 });

        const c = await recordConcession(ctx, { DeliveryForm: "Duration", SubscriptionTermID: Term.ID, AddedDays: 14, ReasonCategory: "Referral" });
        Assert(c.Saved, `recording failed: ${c.Message}`);
        AssertEqual(c.Entity.Status, "Approved", "inside authority, no approval is needed");
        AssertEqual(String(c.Entity.AuthorizedBySalesAuthorityID).toLowerCase(), authorityID.toLowerCase(), "the covering authority is stamped");
        AssertEqual(String(c.Entity.DecidedByUserID).toLowerCase(), String(ctx.User.ID).toLowerCase(), "the requester decided it");
      }),
  },
  {
    Id: "concessions.CS4",
    Name: "CS4: only a holder of the rule's role can decide a Pending concession",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const { Term } = await bookTerm(ctx, 1200);
        await grantAuthority(ctx, { maxValue: 10, maxDays: 1 });
        const ruleID = await addRule(ctx, "ConcessionLimit", await roleTheUserLacks(ctx));

        const c = await recordConcession(ctx, { DeliveryForm: "Duration", SubscriptionTermID: Term.ID, AddedDays: 60 });
        Assert(c.Saved && c.Entity.Status === "Pending", `expected a Pending concession: ${c.Message}`);

        c.Entity.Status = "Approved";
        Assert(!(await c.Entity.Save()), "a user without the rule's role must not approve");

        // Give the rule a role this user holds; now the same user may decide it.
        const rule = await new Metadata().GetEntityObject<mjBizAppsOrdersSalesRuleEntity>(SALES_RULE_ENTITY, ctx.User);
        Assert(await rule.Load(ruleID), "rule did not load");
        rule.ApprovalRequiredRoleID = await roleTheUserHolds(ctx);
        Assert(await rule.Save(), "rule update failed");

        c.Entity.Status = "Approved";
        c.Entity.DecisionNotes = "retention approved";
        Assert(await c.Entity.Save(), `a role holder's approval failed: ${c.Entity.LatestResult?.CompleteMessage}`);
        const row = await TxOne<{ Status: string; DecidedByUserID: string; DecidedAt: string | null }>(ctx,
          `SELECT Status, DecidedByUserID, DecidedAt FROM ${ORDERS_SCHEMA}.OrderConcession WHERE ID='${c.Entity.ID}'`);
        AssertEqual(row.Status, "Approved", "the decision is recorded");
        Assert(row.DecidedAt != null, "with when it was decided");

        c.Entity.Status = "Rejected";
        Assert(!(await c.Entity.Save()), "a decision is not reopened");
      }),
  },
  {
    Id: "concessions.CS5",
    Name: "CS5: with no ConcessionLimit rule nobody could approve, so recording is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const { Term } = await bookTerm(ctx, 1200);
        await grantAuthority(ctx, { maxValue: 10, maxDays: 1 });

        const c = await recordConcession(ctx, { DeliveryForm: "Duration", SubscriptionTermID: Term.ID, AddedDays: 60 });
        Assert(!c.Saved, "a concession no one could approve must not be recorded as waiting");
        Assert(/ConcessionLimit/.test(c.Message), `the refusal should name the missing rule, got: ${c.Message}`);
      }),
  },
  {
    Id: "concessions.CS6",
    Name: "CS6: a typed price below the engine's holds the confirm until a concession covers it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await CreateProductPrice(ctx, f.Products.WidgetA, 100);
        await grantAuthority(ctx, { maxPct: 0.5, maxValue: 1000 });
        await addRule(ctx, "ConcessionLimit", await roleTheUserLacks(ctx));

        const built = await BuildOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 2, UnitPrice: 60 }],
        });
        built.Lines[0].PriceOverridden = true;
        built.Lines[0].PriceOverrideReason = "match a competitor";
        Assert(await built.Order.Save(), `the draft did not save: ${built.Order.LatestResult?.CompleteMessage}`);

        built.Order.Status = "Confirmed";
        Assert(!(await built.Order.Save()), "an uncovered price concession must hold the confirm");
        Assert(/cannot be confirmed yet/.test(built.Order.LatestResult?.CompleteMessage ?? ""),
          `the refusal should explain the hold, got: ${built.Order.LatestResult?.CompleteMessage}`);

        const c = await recordConcession(ctx, { DeliveryForm: "Price", OrderLineID: built.Lines[0].ID });
        Assert(c.Saved, `recording failed: ${c.Message}`);
        AssertEqual(Number(c.Entity.ComputedValue), 80, "(100 − 60) × 2");
        AssertEqual(c.Entity.Status, "Approved", "40% off is inside a 50% cap and a 1000 limit");

        built.Order.Status = "Confirmed";
        Assert(await built.Order.Save(), `with the concession approved, confirm should pass: ${built.Order.LatestResult?.CompleteMessage}`);
      }),
  },
  {
    Id: "concessions.CS7",
    Name: "CS7: a Pending concession holds the confirm; withdrawing it releases the order",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await CreateProductPrice(ctx, f.Products.WidgetA, 100);
        await grantAuthority(ctx, { maxValue: 50 });
        await addRule(ctx, "ConcessionLimit", await roleTheUserLacks(ctx));

        const built = await BuildOrder(ctx.User, { CompanyID: f.CoA.ID, Lines: [{ ProductID: f.Products.WidgetA, Quantity: 5 }] });
        Assert(await built.Order.Save(), `the draft did not save: ${built.Order.LatestResult?.CompleteMessage}`);

        const c = await recordConcession(ctx, { DeliveryForm: "Seats", OrderLineID: built.Lines[0].ID, AddedQuantity: 3 });
        Assert(c.Saved, `recording failed: ${c.Message}`);
        AssertEqual(c.Entity.Status, "Pending", "three free seats at 100 exceed a 50 limit");

        built.Order.Status = "Confirmed";
        Assert(!(await built.Order.Save()), "a Pending concession must hold the confirm");

        Assert(await c.Entity.Delete(), `withdrawing a Pending concession failed: ${c.Entity.LatestResult?.CompleteMessage}`);
        built.Order.Status = "Confirmed";
        Assert(await built.Order.Save(), `with nothing pending, confirm should pass: ${built.Order.LatestResult?.CompleteMessage}`);
      }),
  },
  {
    Id: "concessions.CS8",
    Name: "CS8: a manual discount inside its percentage cap still escalates on absolute value",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await CreateProductPrice(ctx, f.Products.WidgetA, 100);
        await grantAuthority(ctx, { maxPct: 0.25, maxValue: 50 });

        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          ManualDiscounts: [{ Amount: 100, Reason: "goodwill" }],
        });
        Assert(!result.Saved, "10% is inside the cap, but 100 is over the 50 limit — it must escalate");
        Assert(/concession limit/.test(result.Message), `the refusal should name the value limit, got: ${result.Message}`);
      }),
  },
  {
    Id: "concessions.CS9",
    Name: "CS9: a line priced through the API without PriceOverridden still holds the confirm",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The order-lines editor sets PriceOverridden when a rep types a price; an API caller, an import
        // or an integration need not. The gate re-prices every line with a stated price, so the flag is
        // not what decides it.
        const f = Fx();
        await CreateProductPrice(ctx, f.Products.WidgetA, 100);
        await grantAuthority(ctx, { maxPct: 0.5, maxValue: 1000 });
        await addRule(ctx, "ConcessionLimit", await roleTheUserLacks(ctx));

        const built = await BuildOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 2, UnitPrice: 60 }],
        });
        Assert(await built.Order.Save(), `the draft did not save: ${built.Order.LatestResult?.CompleteMessage}`);
        Assert(built.Lines[0].PriceOverridden !== true, "the line must reach the gate unflagged");

        built.Order.Status = "Confirmed";
        Assert(!(await built.Order.Save()), "an unflagged price below the engine's must hold the confirm");
        Assert(/line 1 is priced at 60\.00/.test(built.Order.LatestResult?.CompleteMessage ?? ""),
          `the refusal should name the line, got: ${built.Order.LatestResult?.CompleteMessage}`);
      }),
  },
  {
    Id: "concessions.CS10",
    Name: "CS10: removing a draft line removes its concession, even an approved one",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await CreateProductPrice(ctx, f.Products.WidgetA, 100);
        await grantAuthority(ctx, { maxPct: 0.5, maxValue: 1000 });
        await addRule(ctx, "ConcessionLimit", await roleTheUserLacks(ctx));

        const built = await BuildOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 2, UnitPrice: 60 }],
        });
        Assert(await built.Order.Save(), `the draft did not save: ${built.Order.LatestResult?.CompleteMessage}`);
        const c = await recordConcession(ctx, { DeliveryForm: "Price", OrderLineID: built.Lines[0].ID });
        Assert(c.Saved && c.Entity.Status === "Approved", `expected an Approved concession: ${c.Message}`);

        built.Order.Lines.Remove(built.Order.Lines.Items[0]);
        Assert(await built.Order.Save(), `removing the line must save: ${built.Order.LatestResult?.CompleteMessage}`);

        const left = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderConcession WHERE ID = '${c.Entity.ID}'`,
        );
        AssertEqual(Number(left.N), 0, "the concession went with its line");
      }),
  },
  {
    Id: "concessions.CS11",
    Name: "CS11: a bundle saved as a draft confirms — its components are priced at their allocation",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // A draft save expands the bundle and writes each component at its share of the bundle price,
        // below the component's own price whenever the bundle sells for less than its parts. A one-shot
        // confirm never showed it, because the gate runs before expansion.
        const f = Fx();
        await CreateProductPrice(ctx, f.Products.BundleA, 80);
        await CreateProductPrice(ctx, f.Products.BundlePartX, 75);
        await CreateProductPrice(ctx, f.Products.BundlePartY, 25);
        await CreateBundleItem(ctx, f.Products.BundleA, f.Products.BundlePartX, { SortOrder: 10 });
        await CreateBundleItem(ctx, f.Products.BundleA, f.Products.BundlePartY, { SortOrder: 20 });

        const built = await BuildOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          Lines: [{ ProductID: f.Products.BundleA, Quantity: 1, UnitPrice: 80 }],
        });
        Assert(await built.Order.Save(), `the draft did not save: ${built.Order.LatestResult?.CompleteMessage}`);

        const components = await TxQuery<{ UnitPrice: number }>(
          ctx,
          `SELECT UnitPrice FROM ${ORDERS_SCHEMA}.OrderLine
            WHERE OrderHeaderID = '${built.Order.ID}' AND ParentOrderLineID IS NOT NULL ORDER BY LineNumber`,
        );
        AssertEqual(components.map((c) => Number(c.UnitPrice)).join(","), "60,20",
          "80 across parts of 75 and 25 puts each component below its own price");

        built.Order.Status = "Confirmed";
        Assert(await built.Order.Save(),
          `a component's allocation must not hold the confirm: ${built.Order.LatestResult?.CompleteMessage}`);
      }),
  },
  {
    Id: "concessions.CS12",
    Name: "CS12: a Duration concession at the share-of-order limit escalates; one a day short does not",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Two 1200 annual orders, so neither concession counts toward the other. 5% of 1200 is 60,
        // which a 365-day term reaches at 19 days (62.47) and not at 18 (59.18).
        const at = await bookTerm(ctx, 1200);
        const under = await bookTerm(ctx, 1200);
        await grantAuthority(ctx, { maxValue: 100000, maxDays: 366, maxShare: 0.05 });
        await addRule(ctx, "ConcessionLimit", await roleTheUserLacks(ctx));
        const dAt = Math.ceil(0.05 * termDays(at.Term));

        const u = await recordConcession(ctx, { DeliveryForm: "Duration", SubscriptionTermID: under.Term.ID, AddedDays: dAt - 1 });
        Assert(u.Saved, `recording failed: ${u.Message}`);
        AssertEqual(u.Entity.Status, "Approved", `${dAt - 1} days is under 5% of the order`);
        AssertEqual(Number(u.Entity.OrderNetTotal), 1200, "measured against the order's net total");

        const a = await recordConcession(ctx, { DeliveryForm: "Duration", SubscriptionTermID: at.Term.ID, AddedDays: dAt });
        Assert(a.Saved, `recording failed: ${a.Message}`);
        AssertEqual(a.Entity.Status, "Pending", `${dAt} days reaches 5% of the order`);
        const share = Math.round((Number(a.Entity.ComputedValue) / 1200) * 1e4) / 1e4;
        AssertEqual(Number(a.Entity.CumulativeShare), share, "the share it was judged on is recorded");
      }),
  },
  {
    Id: "concessions.CS13",
    Name: "CS13: the same concession value escalates on a small order and passes on a large one",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await CreateProductPrice(ctx, f.Products.WidgetA, 100);
        await grantAuthority(ctx, { maxValue: 1000, maxShare: 0.05 });
        await addRule(ctx, "ConcessionLimit", await roleTheUserLacks(ctx));

        const small = await BuildOrder(ctx.User, { CompanyID: f.CoA.ID, Lines: [{ ProductID: f.Products.WidgetA, Quantity: 5 }] });
        Assert(await small.Order.Save(), `the small draft did not save: ${small.Order.LatestResult?.CompleteMessage}`);
        const large = await BuildOrder(ctx.User, { CompanyID: f.CoA.ID, Lines: [{ ProductID: f.Products.WidgetA, Quantity: 100 }] });
        Assert(await large.Order.Save(), `the large draft did not save: ${large.Order.LatestResult?.CompleteMessage}`);

        // Three free seats at 100: 300, inside the 1000 value limit either way.
        const s = await recordConcession(ctx, { DeliveryForm: "Seats", OrderLineID: small.Lines[0].ID, AddedQuantity: 3 });
        Assert(s.Saved, `recording failed: ${s.Message}`);
        AssertEqual(s.Entity.Status, "Pending", "300 is 60% of a 500 order");
        AssertEqual(Number(s.Entity.CumulativeShare), 0.6, "300 of 500");

        const l = await recordConcession(ctx, { DeliveryForm: "Seats", OrderLineID: large.Lines[0].ID, AddedQuantity: 3 });
        Assert(l.Saved, `recording failed: ${l.Message}`);
        AssertEqual(l.Entity.Status, "Approved", "300 is 3% of a 10000 order");
        AssertEqual(Number(l.Entity.CumulativeShare), 0.03, "300 of 10000");
      }),
  },
  {
    Id: "concessions.CS14",
    Name: "CS14: Price and Scope concessions are held to the share-of-order limit",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await CreateProductPrice(ctx, f.Products.WidgetA, 100);
        await CreateProductPrice(ctx, f.Products.WidgetB, 100);
        await grantAuthority(ctx, { maxPct: 1, maxValue: 1000, maxShare: 0.05 });
        await addRule(ctx, "ConcessionLimit", await roleTheUserLacks(ctx));

        // Price: 95 against 100 on two units is 10, which is 5.3% of a 190 order.
        const priced = await BuildOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 2, UnitPrice: 95 }],
        });
        Assert(await priced.Order.Save(), `the draft did not save: ${priced.Order.LatestResult?.CompleteMessage}`);
        const p = await recordConcession(ctx, { DeliveryForm: "Price", OrderLineID: priced.Lines[0].ID });
        Assert(p.Saved, `recording failed: ${p.Message}`);
        AssertEqual(p.Entity.Status, "Pending", "5% off is 5.3% of this order's net total");

        // Scope: one free unit worth 100 beside 100 paid units is 1% of a 10000 order.
        const scoped = await BuildOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          Lines: [
            { ProductID: f.Products.WidgetA, Quantity: 100 },
            { ProductID: f.Products.WidgetB, Quantity: 1 },
          ],
        });
        Assert(await scoped.Order.Save(), `the draft did not save: ${scoped.Order.LatestResult?.CompleteMessage}`);
        // A new line's price of 0 reads as blank and takes the engine price, so it is typed afterwards on
        // the saved line, the way a rep takes the charge off a line already on the order.
        const saved = scoped.Lines.find((l) => l.ProductID === f.Products.WidgetB);
        Assert(saved?.ID != null, "the free line was not saved");
        const free = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, ctx.User);
        Assert(await free.Load(saved.ID), "the free line did not load");
        free.UnitPrice = 0;
        free.PriceOverridden = true;
        free.PriceOverrideReason = "added at no charge";
        Assert(await free.Save(), `pricing the line at 0 did not save: ${free.LatestResult?.CompleteMessage}`);
        const sc = await recordConcession(ctx, { DeliveryForm: "Scope", OrderLineID: free.ID });
        Assert(sc.Saved, `recording failed: ${sc.Message}`);
        AssertEqual(sc.Entity.Status, "Approved", "a free product worth 1% of the order is within authority");
        AssertEqual(Number(sc.Entity.OrderNetTotal), 10000, "the free line adds nothing to the net total");
      }),
  },
  {
    Id: "concessions.CS15",
    Name: "CS15: the share counts every concession on the order, so splitting one does not get under it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await CreateProductPrice(ctx, f.Products.WidgetA, 100);
        await grantAuthority(ctx, { maxValue: 1000, maxShare: 0.05 });
        await addRule(ctx, "ConcessionLimit", await roleTheUserLacks(ctx));

        const built = await BuildOrder(ctx.User, { CompanyID: f.CoA.ID, Lines: [{ ProductID: f.Products.WidgetA, Quantity: 100 }] });
        Assert(await built.Order.Save(), `the draft did not save: ${built.Order.LatestResult?.CompleteMessage}`);

        const first = await recordConcession(ctx, { DeliveryForm: "Seats", OrderLineID: built.Lines[0].ID, AddedQuantity: 3 });
        AssertEqual(first.Entity.Status, "Approved", `3% of the order is within authority: ${first.Message}`);
        const second = await recordConcession(ctx, { DeliveryForm: "Seats", OrderLineID: built.Lines[0].ID, AddedQuantity: 3 });
        Assert(second.Saved, `recording failed: ${second.Message}`);
        AssertEqual(second.Entity.Status, "Pending", "another 3% brings the order to 6%");
        AssertEqual(Number(second.Entity.CumulativeShare), 0.06, "both concessions are counted");
      }),
  },
  {
    Id: "concessions.CS16",
    Name: "CS16: a draft that shrinks after an approval on authority holds the confirm until it is recorded again",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await CreateProductPrice(ctx, f.Products.WidgetA, 100);
        await CreateProductPrice(ctx, f.Products.WidgetB, 100);
        await grantAuthority(ctx, { maxValue: 1000, maxShare: 0.05 });
        await addRule(ctx, "ConcessionLimit", await roleTheUserLacks(ctx));

        const built = await BuildOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          Lines: [
            { ProductID: f.Products.WidgetA, Quantity: 5 },
            { ProductID: f.Products.WidgetB, Quantity: 95 },
          ],
        });
        Assert(await built.Order.Save(), `the draft did not save: ${built.Order.LatestResult?.CompleteMessage}`);
        const seatsLine = built.Lines.find((l) => l.ProductID === f.Products.WidgetA);
        Assert(seatsLine?.ID != null, "the seats line was not saved");

        const c = await recordConcession(ctx, { DeliveryForm: "Seats", OrderLineID: seatsLine.ID, AddedQuantity: 3 });
        AssertEqual(c.Entity.Status, "Approved", `300 is 3% of a 10000 order: ${c.Message}`);

        // The large line goes; the same 300 is now 60% of a 500 order.
        const big = built.Order.Lines.Items.find((l) => l.ProductID === f.Products.WidgetB);
        Assert(big != null, "the large line is not on the order");
        built.Order.Lines.Remove(big);
        Assert(await built.Order.Save(), `removing the line must save: ${built.Order.LatestResult?.CompleteMessage}`);

        built.Order.Status = "Confirmed";
        Assert(!(await built.Order.Save()), "the approval on authority no longer covers the order");
        Assert(/60\.0% of its net total.*Withdraw them and record them again/.test(built.Order.LatestResult?.CompleteMessage ?? ""),
          `the refusal should explain the share, got: ${built.Order.LatestResult?.CompleteMessage}`);

        Assert(await c.Entity.Delete(), `withdrawing an approval on authority from a draft failed: ${c.Entity.LatestResult?.CompleteMessage}`);
        const again = await recordConcession(ctx, { DeliveryForm: "Seats", OrderLineID: seatsLine.ID, AddedQuantity: 3 });
        Assert(again.Saved, `recording again failed: ${again.Message}`);
        AssertEqual(again.Entity.Status, "Pending", "measured against the order as it is now, it needs approval");
      }),
  },
];

for (const check of ConcessionChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("concessions", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: TeardownOrdersFixture,
});
