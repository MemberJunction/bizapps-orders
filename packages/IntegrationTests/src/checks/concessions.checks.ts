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
 *
 * A Pending concession is routed to its approvers through the tasks app (golive #274):
 *
 *   CS12      one approval task per concession, titled with it, assigned to the role holders' person records
 *   CS13      an approval recorded on a task decides only that task's concession, as its decider
 *   CS14      a decision the concession refuses puts it back in front of its approvers on a fresh task
 *   CS15      withdrawing a concession cancels its task; deciding one on its record completes its task
 *
 * CONNECTS TO:
 *   CODE: ConcessionBehavior · ConcessionGate · OrderConcessionEntityServer · SubscriptionTermEntity
 *         · OrderEntityServer.passesConcessionGate · PromotionEngine.AuthorizeManualDiscount
 *         · ConcessionApprovalTask · ConcessionApprovalListener
 */
import {
  Assert,
  AssertEqual,
  IntegrationCheckRegistry,
  type IntegrationCheckContext,
  type NamedCheck,
} from "@memberjunction/testing-integration";
import { BaseEntity, Metadata } from "@memberjunction/core";
import { FindUnapprovedConcessions } from "@mj-biz-apps/orders-core-entities-server";
import type {
  mjBizAppsOrdersOrderConcessionEntity,
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
  SALES_AUTHORITY_ENTITY,
  SALES_RULE_ENTITY,
  PERSON_ENTITY,
  SUBSCRIPTION_TERM_ENTITY,
  TASK_DECISION_ENTITY,
} from "../entity-names.js";
import { BuildOrder, ConfirmOrder } from "../order-builder.js";

interface Limits {
  maxPct?: number | null;
  maxValue?: number | null;
  maxDays?: number | null;
}

/** Grant the current user a SalesAuthority with the given limits. */
async function grantAuthority(ctx: IntegrationCheckContext, limits: Limits): Promise<string> {
  return createViaEntity(ctx, SALES_AUTHORITY_ENTITY, {
    SalesRepUserID: ctx.User.ID,
    MaxDiscountPct: limits.maxPct ?? null,
    MaxConcessionValue: limits.maxValue ?? null,
    MaxTermExtensionDays: limits.maxDays ?? null,
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

/**
 * A role this user lacks and some other active user holds. A Pending concession is assigned to the person
 * records of the rule role's active holders, and one no one could be told of is refused, so the role is
 * given a holder when it has none, and that holder a person record when they have none.
 */
async function roleTheUserLacks(ctx: IntegrationCheckContext): Promise<string> {
  const held = await TxQuery<{ RoleID: string; UserID: string }>(ctx,
    `SELECT TOP 1 ur.RoleID, ur.UserID FROM __mj.UserRole ur
       JOIN __mj.[User] u ON u.ID = ur.UserID AND u.IsActive = 1
      WHERE ur.UserID <> '${ctx.User.ID}'
        AND NOT EXISTS (SELECT 1 FROM __mj.UserRole mine WHERE mine.RoleID = ur.RoleID AND mine.UserID = '${ctx.User.ID}')`);
  if (held[0]?.RoleID) {
    await personFor(ctx, held[0].UserID);
    return held[0].RoleID;
  }

  const role = await TxOne<{ ID: string }>(ctx,
    `SELECT TOP 1 r.ID FROM __mj.Role r
      WHERE NOT EXISTS (SELECT 1 FROM __mj.UserRole ur WHERE ur.RoleID = r.ID AND ur.UserID = '${ctx.User.ID}')`);
  const other = await TxOne<{ ID: string }>(ctx,
    `SELECT TOP 1 ID FROM __mj.[User] WHERE IsActive = 1 AND ID <> '${ctx.User.ID}'`);
  await createViaEntity(ctx, "MJ: User Roles", { UserID: other.ID, RoleID: role.ID });
  await personFor(ctx, other.ID);
  return role.ID;
}

/** The active person record linked to a user, created when there is none. */
async function personFor(ctx: IntegrationCheckContext, userID: string): Promise<string> {
  const existing = await TxQuery<{ ID: string }>(ctx,
    `SELECT TOP 1 ID FROM __mj_BizAppsCommon.Person WHERE LinkedUserID = '${userID}' AND Status = 'Active'`);
  if (existing[0]?.ID) return existing[0].ID;
  return createViaEntity(ctx, PERSON_ENTITY, { FirstName: "Concession", LastName: "Approver", LinkedUserID: userID, Status: "Active" });
}

async function roleTheUserHolds(ctx: IntegrationCheckContext): Promise<string> {
  const row = await TxOne<{ RoleID: string }>(ctx,
    `SELECT TOP 1 RoleID FROM __mj.UserRole WHERE UserID = '${ctx.User.ID}'`);
  Assert(row?.RoleID != null, "this user holds no roles");
  return row.RoleID;
}

/** A concession's approval tasks, newest first, with what each links and is assigned to. */
async function approvalTasksOf(ctx: IntegrationCheckContext, concessionID: string) {
  const tasks = await TxQuery<{ ID: string; Name: string; Status: string; TypeCode: string }>(ctx,
    `SELECT t.ID, t.Name, t.Status, tt.Code AS TypeCode
       FROM __mj_BizAppsTasks.Task t
       JOIN __mj_BizAppsTasks.TaskType tt ON tt.ID = t.TypeID
      WHERE t.ID IN (SELECT TaskID FROM __mj_BizAppsTasks.TaskLink WHERE RecordID = '${concessionID}')
      ORDER BY t.__mj_CreatedAt DESC`);
  return Promise.all(tasks.map(async (task) => {
    const links = await TxQuery<{ RecordID: string }>(ctx,
      `SELECT RecordID FROM __mj_BizAppsTasks.TaskLink WHERE TaskID = '${task.ID}'`);
    const assignees = await TxQuery<{ AssigneeRecordID: string; AssigneeEntity: string }>(ctx,
      `SELECT ta.AssigneeRecordID, e.Name AS AssigneeEntity
         FROM __mj_BizAppsTasks.TaskAssignment ta JOIN __mj.Entity e ON e.ID = ta.AssigneeEntityID
        WHERE ta.TaskID = '${task.ID}'`);
    return { Task: task, Links: links, Assignees: assignees, IsLinked: (id: string) => links.some((l) => sameID(l.RecordID, id)) };
  }));
}

async function orderApprovalTaskID(ctx: IntegrationCheckContext, orderID: string): Promise<string | null> {
  const order = await TxOne<{ ApprovalTaskID: string | null }>(ctx,
    `SELECT ApprovalTaskID FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`);
  return order.ApprovalTaskID;
}

function sameID(a: string | null | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && a.toLowerCase() === b.toLowerCase();
}

/** Point the rule at a role this user holds, so the user can decide what it recorded as Pending. */
async function letTheUserDecide(ctx: IntegrationCheckContext, ruleID: string): Promise<void> {
  const rule = await new Metadata().GetEntityObject<mjBizAppsOrdersSalesRuleEntity>(SALES_RULE_ENTITY, ctx.User);
  Assert(await rule.Load(ruleID), "rule did not load");
  rule.ApprovalRequiredRoleID = await roleTheUserHolds(ctx);
  Assert(await rule.Save(), "rule update failed");
}

/** Record a decision on a task the way the tasks app's approve/reject panel does: a Task Decision row. */
async function decideTask(ctx: IntegrationCheckContext, taskID: string, outcomeCode: string, notes: string): Promise<void> {
  const outcome = await TxOne<{ ID: string }>(ctx,
    `SELECT ID FROM __mj_BizAppsTasks.TaskDecisionOutcome WHERE Code = '${outcomeCode}'`);
  const decision = await new Metadata().GetEntityObject<BaseEntity>(TASK_DECISION_ENTITY, ctx.User);
  decision.NewRecord();
  // Generic by design: the check writes the row the tasks app writes, through the entity, and carries no
  // dependency on the tasks app's typed classes.
  decision.Set("TaskID", taskID);
  decision.Set("OutcomeID", outcome.ID);
  decision.Set("DecisionNotes", notes);
  Assert(await decision.Save(), `the task decision did not save: ${decision.LatestResult?.CompleteMessage}`);
}

/** The listener applies a decision after it is saved; wait for `done` to hold. */
async function waitFor(what: string, done: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await done()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  Assert(false, `after the task was decided, ${what} did not happen`);
}

async function concessionStatus(ctx: IntegrationCheckContext, id: string): Promise<string> {
  const row = await TxOne<{ Status: string }>(ctx, `SELECT Status FROM ${ORDERS_SCHEMA}.OrderConcession WHERE ID = '${id}'`);
  return row.Status;
}

/** A draft order of five WidgetA at 100, over a 50 concession-value authority, with a ConcessionLimit rule. */
async function orderNeedingApproval(ctx: IntegrationCheckContext) {
  const f = Fx();
  await CreateProductPrice(ctx, f.Products.WidgetA, 100);
  await grantAuthority(ctx, { maxValue: 50 });
  const roleID = await roleTheUserLacks(ctx);
  const ruleID = await addRule(ctx, "ConcessionLimit", roleID);
  const built = await BuildOrder(ctx.User, { CompanyID: f.CoA.ID, Lines: [{ ProductID: f.Products.WidgetA, Quantity: 5 }] });
  Assert(await built.Order.Save(), `the draft did not save: ${built.Order.LatestResult?.CompleteMessage}`);
  return { Built: built, RoleID: roleID, RuleID: ruleID };
}

async function pendingSeats(ctx: IntegrationCheckContext, lineID: string, seats: number) {
  const c = await recordConcession(ctx, { DeliveryForm: "Seats", OrderLineID: lineID, AddedQuantity: seats });
  Assert(c.Saved && c.Entity.Status === "Pending", `expected a Pending concession: ${c.Message}`);
  return c.Entity;
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
    Name: "CS12: each Pending concession raises its own approval task, assigned to the role holders' person records",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const { Built, RoleID } = await orderNeedingApproval(ctx);
        const first = await pendingSeats(ctx, Built.Lines[0].ID, 3);
        const second = await pendingSeats(ctx, Built.Lines[0].ID, 2);

        const [firstTasks, secondTasks] = [await approvalTasksOf(ctx, first.ID), await approvalTasksOf(ctx, second.ID)];
        AssertEqual(firstTasks.length, 1, "the first concession has one task");
        AssertEqual(secondTasks.length, 1, "the second concession has its own task");
        const [one, two] = [firstTasks[0], secondTasks[0]];
        Assert(!sameID(one.Task.ID, two.Task.ID), "the two concessions do not share a task");
        for (const t of [one, two]) {
          AssertEqual(t.Task.TypeCode, "APPROVAL_REQUEST", "the task is the tasks app's approval type");
          AssertEqual(t.Task.Status, "Open", "the task is waiting on a decision");
          AssertEqual(t.Links.length, 2, "a task links the order and its one concession");
          Assert(t.IsLinked(Built.Order.ID), "the task links the order");
        }
        AssertEqual(one.Task.Name, `${Built.Order.OrderNumber}: 3 added seats, 300.00`, "the title names the order, the concession and its amount");
        AssertEqual(two.Task.Name, `${Built.Order.OrderNumber}: 2 added seats, 200.00`, "each title names its own concession");
        Assert(!one.IsLinked(second.ID) && !two.IsLinked(first.ID), "neither task links the other's concession");
        Assert(sameID(await orderApprovalTaskID(ctx, Built.Order.ID), two.Task.ID), "the order points at its most recent task");

        const people = await TxQuery<{ ID: string }>(ctx,
          `SELECT p.ID FROM __mj.UserRole ur
             JOIN __mj.[User] u ON u.ID = ur.UserID AND u.IsActive = 1
             JOIN __mj_BizAppsCommon.Person p ON p.LinkedUserID = ur.UserID AND p.Status = 'Active'
            WHERE ur.RoleID = '${RoleID}' AND ur.UserID <> '${ctx.User.ID}'`);
        Assert(one.Assignees.length > 0, "the task is assigned");
        Assert(one.Assignees.every((a) => a.AssigneeEntity === PERSON_ENTITY), "each assignee is a person record");
        Assert(one.Assignees.every((a) => people.some((p) => sameID(p.ID, a.AssigneeRecordID))),
          "each assignee is the person record of a holder of the rule's role");
      }),
  },
  {
    Id: "concessions.CS13",
    Name: "CS13: an approval recorded on a task decides only that task's concession, as its decider",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const { Built, RuleID } = await orderNeedingApproval(ctx);
        const first = await pendingSeats(ctx, Built.Lines[0].ID, 3);
        const second = await pendingSeats(ctx, Built.Lines[0].ID, 2);

        await letTheUserDecide(ctx, RuleID);
        const [firstTask] = await approvalTasksOf(ctx, first.ID);
        await decideTask(ctx, firstTask.Task.ID, "Approved", "approved on the task");
        await waitFor("the first concession's approval", async () => (await concessionStatus(ctx, first.ID)) === "Approved");

        const row = await TxOne<{ DecidedByUserID: string; DecisionNotes: string | null }>(ctx,
          `SELECT DecidedByUserID, DecisionNotes FROM ${ORDERS_SCHEMA}.OrderConcession WHERE ID = '${first.ID}'`);
        Assert(sameID(row.DecidedByUserID, String(ctx.User.ID)), "the user who decided the task decided the concession");
        AssertEqual(row.DecisionNotes, "approved on the task", "with the task decision's note");
        AssertEqual(await concessionStatus(ctx, second.ID), "Pending", "the other concession is not decided by that task");

        const [secondTask] = await approvalTasksOf(ctx, second.ID);
        Assert(sameID(await orderApprovalTaskID(ctx, Built.Order.ID), secondTask.Task.ID), "the order points at its open task");
        Built.Order.Status = "Confirmed";
        Assert(!(await Built.Order.Save()), "with a concession still Pending, the order must not confirm");
      }),
  },
  {
    Id: "concessions.CS14",
    Name: "CS14: a decision the concession refuses puts it back in front of its approvers on a fresh task",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const { Built } = await orderNeedingApproval(ctx);
        const c = await pendingSeats(ctx, Built.Lines[0].ID, 3);
        const [refused] = await approvalTasksOf(ctx, c.ID);

        // This user does not hold the rule's role, so the concession refuses the approval.
        await decideTask(ctx, refused.Task.ID, "Approved", "approved without the role");
        await waitFor("a fresh task for the concession", async () => (await approvalTasksOf(ctx, c.ID)).length === 2);

        AssertEqual(await concessionStatus(ctx, c.ID), "Pending", "the concession is still waiting");
        const [fresh] = await approvalTasksOf(ctx, c.ID);
        Assert(!sameID(fresh.Task.ID, refused.Task.ID), "the fresh task is a new task");
        AssertEqual(fresh.Task.Status, "Open", "the fresh task is waiting on a decision");
        AssertEqual(fresh.Task.Name, refused.Task.Name, "under the same title");
        Assert(fresh.Assignees.length > 0, "assigned to the role's holders");
        Assert(sameID(await orderApprovalTaskID(ctx, Built.Order.ID), fresh.Task.ID), "the order points at the fresh task");

        const notes = await TxQuery<{ Description: string }>(ctx,
          `SELECT Description FROM __mj_BizAppsTasks.TaskActivity WHERE TaskID = '${refused.Task.ID}'`);
        Assert(notes.some((n) => n.Description.includes("Only a holder of the role")),
          "the refused task records why the decision was not applied");
      }),
  },
  {
    Id: "concessions.CS15",
    Name: "CS15: withdrawing a concession cancels its task; deciding one on its record completes its task",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const { Built, RuleID } = await orderNeedingApproval(ctx);
        const withdrawn = await pendingSeats(ctx, Built.Lines[0].ID, 3);
        const [withdrawnTask] = await approvalTasksOf(ctx, withdrawn.ID);
        const decided = await pendingSeats(ctx, Built.Lines[0].ID, 2);
        const [decidedTask] = await approvalTasksOf(ctx, decided.ID);

        Assert(await withdrawn.Delete(), `withdrawing failed: ${withdrawn.LatestResult?.CompleteMessage}`);
        const cancelled = await TxOne<{ Status: string }>(ctx,
          `SELECT Status FROM __mj_BizAppsTasks.Task WHERE ID = '${withdrawnTask.Task.ID}'`);
        AssertEqual(cancelled.Status, "Cancelled", "the withdrawn concession's task is cancelled");
        AssertEqual((await approvalTasksOf(ctx, withdrawn.ID)).length, 0, "and no longer links the withdrawn concession");
        AssertEqual((await approvalTasksOf(ctx, decided.ID))[0].Task.Status, "Open", "the other concession's task stays open");

        await letTheUserDecide(ctx, RuleID);
        decided.Status = "Approved";
        Assert(await decided.Save(), `a role holder's approval failed: ${decided.LatestResult?.CompleteMessage}`);
        const completed = await TxOne<{ Status: string }>(ctx,
          `SELECT Status FROM __mj_BizAppsTasks.Task WHERE ID = '${decidedTask.Task.ID}'`);
        AssertEqual(completed.Status, "Completed", "approved on its record, so its task is complete");
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
