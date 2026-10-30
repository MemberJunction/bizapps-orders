/**
 * term-shift — a booked term's start and end moved together, at the same price (#507).
 *
 * A shift is a term change, not a sales concession. The Shift concession that records it is valued at zero and
 * goes through under the `TermShiftReviewDays` setting; at or above it the finance acknowledgment role reviews
 * it, and may escalate it to the ConcessionLimit approver. Applying it moves the term, re-spreads its whole amount
 * from the new start, corrects periods already behind the effective day with one entry dated that day, and moves
 * access and the instalments not yet invoiced.
 *
 *   TS1   under the review limit: approved on save and applied — term, line, subscription, schedule, event, task
 *   TS2   at the limit: waits for finance; the requester cannot decide it; finance approves and it applies
 *   TS3   finance escalates it to the ConcessionLimit tier, whose role then decides it
 *   TS4   a start moved earlier than the effective day is caught up in the open period, never on past dates
 *   TS5   Orders.AmendArrangement previews a shift without writing, records it, and refuses a shortening or a
 *         shift combined with an extension
 *   TS6   instalments not yet invoiced move with the term when its line is all the order bills
 *   TS7   in Chicago, the moved grants start and end at 00:00 Central, not 00:00 UTC (access sync G5)
 *
 * CONNECTS TO:
 *   CODE: TermShift · TermShiftPlan · OrderConcessionEntityServer · AmendArrangementOperation
 */
import {
  Assert,
  AssertEqual,
  IntegrationCheckRegistry,
  type IntegrationCheckContext,
  type NamedCheck,
} from "@memberjunction/testing-integration";
import { BaseRemotableOperation, Metadata } from "@memberjunction/core";
import { MJGlobal } from "@memberjunction/global";
import { ORDERS_SETTING, OrdersSettings, type OrderConcessionEntityServer } from "@mj-biz-apps/orders-core-entities-server";
import type { OrderHeaderEntity, mjBizAppsOrdersOrderConcessionEntity } from "@mj-biz-apps/orders-entities";
import {
  ACCT_SCHEMA,
  AcknowledgeAmendmentsWith,
  AssertTermGrantWindow,
  CreateOrdersFixture,
  createViaEntity,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
  WithBusinessZone,
} from "../fixture.js";
import {
  ORDER_CONCESSION_ENTITY,
  ORDER_HEADER_ENTITY,
  ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
  PERSON_ENTITY,
  SALES_RULE_ENTITY,
} from "../entity-names.js";
import { BuildOrder, ConfirmOrder } from "../order-builder.js";

const DAY = 86_400_000;
const iso = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const addDays = (d: Date | string, n: number) => new Date(new Date(d).getTime() + n * DAY);
const today = () => iso(new Date());
/** Equality of plain arrays and objects by value: AssertEqual compares them by reference. */
const AssertSame = (actual: unknown, expected: unknown, message: string) => AssertEqual(JSON.stringify(actual), JSON.stringify(expected), message);

interface BookedTerm {
  ID: string;
  SubscriptionID: string;
  OrderLineID: string;
  StartDate: Date;
  EndDate: Date;
  Amount: number;
}

async function bookTerm(ctx: IntegrationCheckContext, price = 1200) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: price }],
  });
  Assert(result.Saved, `the subscription order did not confirm: ${result.Message}`);
  return { OrderID: result.Order.ID as string, Term: await termOf(ctx, result.Order.ID as string) };
}

async function termOf(ctx: IntegrationCheckContext, orderID: string): Promise<BookedTerm> {
  return TxOne<BookedTerm>(ctx,
    `SELECT st.ID, st.SubscriptionID, st.OrderLineID, st.StartDate, st.EndDate, st.Amount
       FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
       JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
      WHERE ol.OrderHeaderID = '${orderID}'`);
}

/** The acknowledgment role, with a person record for its holder so a finance review task can reach them. */
async function financeRole(ctx: IntegrationCheckContext) {
  const ack = await AcknowledgeAmendmentsWith(ctx);
  const person = await TxQuery(ctx,
    `SELECT ID FROM __mj_BizAppsCommon.Person WHERE LinkedUserID = '${ack.HolderID}' AND Status = 'Active'`);
  if (person.length === 0) {
    await createViaEntity(ctx, PERSON_ENTITY, { FirstName: "Finance", LastName: "Reviewer", LinkedUserID: ack.HolderID, Status: "Active" });
  }
  return ack;
}

/** Shifts are reviewed at `days` and above. */
function reviewShiftsFrom(days: number | null): void {
  OrdersSettings.SetOverride(ORDERS_SETTING.TermShiftReviewDays, days == null ? "" : String(days));
}

async function recordShift(ctx: IntegrationCheckContext, term: BookedTerm, days: number) {
  const entity = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderConcessionEntity>(ORDER_CONCESSION_ENTITY, ctx.User);
  entity.NewRecord();
  entity.DeliveryForm = "Shift";
  entity.SubscriptionTermID = term.ID;
  entity.NewStartDate = addDays(term.StartDate, days);
  entity.NewEndDate = addDays(term.EndDate, days);
  entity.ReasonCategory = "Other";
  entity.Reason = "the customer's go-live moved";
  const saved = await entity.Save();
  return { Saved: saved, Message: entity.LatestResult?.CompleteMessage ?? "", Entity: entity };
}

/**
 * Hand a Pending shift to the check's user as a finance reviewer: the acknowledgment role's other holder becomes
 * the requester, and the check's user is given the role. The requester can never decide their own shift.
 */
async function reviewAsFinance(ctx: IntegrationCheckContext, concessionID: string, ack: { RoleID: string; HolderID: string }) {
  await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.OrderConcession SET RequestedByUserID = '${ack.HolderID}' WHERE ID = '${concessionID}'`);
  const holds = await TxQuery(ctx, `SELECT ID FROM __mj.UserRole WHERE UserID = '${ctx.User.ID}' AND RoleID = '${ack.RoleID}'`);
  if (holds.length === 0) await createViaEntity(ctx, "MJ: User Roles", { UserID: ctx.User.ID, RoleID: ack.RoleID });
  const entity = await new Metadata().GetEntityObject<OrderConcessionEntityServer>(ORDER_CONCESSION_ENTITY, ctx.User);
  Assert(await entity.Load(concessionID), "the concession did not reload");
  return entity;
}

/** Every recognition entry linked to the term, with its net revenue credit (positive recognises). */
async function recognitionOf(ctx: IntegrationCheckContext, termID: string) {
  return TxQuery<{ ID: string; EffectiveDate: Date; Description: string; Net: number }>(ctx,
    `SELECT je.ID, je.EffectiveDate, je.Description,
            SUM(CASE WHEN a.Name LIKE '%Deferred%' THEN ISNULL(l.DebitAmount, 0) - ISNULL(l.CreditAmount, 0) ELSE 0 END) AS Net
       FROM ${ACCT_SCHEMA}.JournalEntry je
       JOIN ${ACCT_SCHEMA}.JournalEntryType t ON t.ID = je.EntryTypeID AND t.Code = 'RevenueRecognition'
       JOIN ${ACCT_SCHEMA}.JournalEntryLine l ON l.JournalEntryID = je.ID
       JOIN ${ACCT_SCHEMA}.GLAccount a ON a.ID = l.GLAccountID
      WHERE je.LinkedRecordID = '${termID}'
      GROUP BY je.ID, je.EffectiveDate, je.Description`);
}

async function datesOf(ctx: IntegrationCheckContext, term: BookedTerm) {
  const row = await TxOne<{ StartDate: Date; EndDate: Date }>(ctx, `SELECT StartDate, EndDate FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE ID = '${term.ID}'`);
  return { Start: iso(row.StartDate), End: iso(row.EndDate) };
}

/** The term, line, subscription and schedule after an applied shift, asserted together. */
async function assertShifted(ctx: IntegrationCheckContext, term: BookedTerm, days: number, before: { ID: string }[]) {
  const start = iso(addDays(term.StartDate, days));
  const end = iso(addDays(term.EndDate, days));
  AssertSame(await datesOf(ctx, term), { Start: start, End: end }, "the term's start and end both moved");
  const line = await TxOne<{ ServicePeriodStart: Date; ServicePeriodEnd: Date }>(ctx,
    `SELECT ServicePeriodStart, ServicePeriodEnd FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${term.OrderLineID}'`);
  AssertSame([iso(line.ServicePeriodStart), iso(line.ServicePeriodEnd)], [start, end], "and the line that bought it agrees");
  const sub = await TxOne<{ StartDate: Date }>(ctx, `SELECT StartDate FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${term.SubscriptionID}'`);
  AssertEqual(iso(sub.StartDate), start, "the subscription started with this term, so its start moved too");
  await AssertTermGrantWindow(ctx, term.ID, start, end, "access moved with the term, its days covered in full");

  const entries = await recognitionOf(ctx, term.ID);
  const total = Math.round(entries.reduce((s, e) => s + Number(e.Net), 0) * 100) / 100;
  AssertEqual(total, Number(term.Amount), "the schedule still recognises exactly the term's amount");
  const written = entries.filter((e) => !before.some((b) => b.ID === e.ID));
  Assert(written.some((e) => /^Offset of /.test(e.Description ?? "")), "staged entries were offset rather than edited or deleted");
  Assert(written.every((e) => iso(e.EffectiveDate) >= today()), "nothing the shift wrote is dated in a period already behind it");
  const perDate = new Map<string, number>();
  for (const e of entries) perDate.set(iso(e.EffectiveDate), Math.round(((perDate.get(iso(e.EffectiveDate)) ?? 0) + Number(e.Net)) * 100) / 100);
  const last = [...perDate.entries()].filter(([, net]) => net !== 0).map(([d]) => d).sort().pop();
  Assert(last != null && last <= end, `nothing recognises after the new end (last ${last})`);
  return entries;
}

async function acknowledgmentOf(ctx: IntegrationCheckContext, concessionID: string) {
  return TxOne<{ ID: string; Status: string; Description: string }>(ctx,
    `SELECT t.ID, t.Status, t.Description
       FROM __mj_BizAppsTasks.Task t
       JOIN __mj_BizAppsTasks.TaskType tt ON tt.ID = t.TypeID AND tt.Code = 'ACTION_ITEM'
       JOIN __mj_BizAppsTasks.TaskLink tl ON tl.TaskID = t.ID AND tl.RecordID = '${concessionID}'`);
}

/** The approval tasks raised for a concession: every linked task but the acknowledgment. */
async function approvalTasksOf(ctx: IntegrationCheckContext, concessionID: string) {
  return TxQuery<{ ID: string; Status: string; CompletionNotes: string | null }>(ctx,
    `SELECT t.ID, t.Status, t.CompletionNotes
       FROM __mj_BizAppsTasks.Task t
       JOIN __mj_BizAppsTasks.TaskType tt ON tt.ID = t.TypeID AND tt.Code <> 'ACTION_ITEM'
       JOIN __mj_BizAppsTasks.TaskLink tl ON tl.TaskID = t.ID AND tl.RecordID = '${concessionID}'`);
}

/** A ConcessionLimit floor tier decided by a role the check's user holds, whose holders can be told of a task. */
async function floorTierHeldByRequester(ctx: IntegrationCheckContext) {
  const held = await TxOne<{ RoleID: string }>(ctx, `SELECT TOP 1 RoleID FROM __mj.UserRole WHERE UserID = '${ctx.User.ID}'`);
  const others = await TxQuery<{ UserID: string; PersonID: string | null }>(ctx,
    `SELECT ur.UserID, (SELECT TOP 1 p.ID FROM __mj_BizAppsCommon.Person p
                         WHERE p.LinkedUserID = ur.UserID AND p.Status = 'Active') AS PersonID
       FROM __mj.UserRole ur JOIN __mj.[User] u ON u.ID = ur.UserID AND u.IsActive = 1
      WHERE ur.RoleID = '${held.RoleID}'`);
  if (!others.some((h) => h.PersonID)) {
    await createViaEntity(ctx, PERSON_ENTITY, { FirstName: "Concession", LastName: "Approver", LinkedUserID: others[0].UserID, Status: "Active" });
  }
  await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.SalesRule SET IsActive = 0 WHERE RuleType = 'ConcessionLimit'`);
  return createViaEntity(ctx, SALES_RULE_ENTITY, {
    Name: "ConcessionLimit floor",
    RuleType: "ConcessionLimit",
    Scope: "Global",
    ApprovalRequiredRoleID: held.RoleID,
    IsActive: 1,
  });
}

export const TermShiftChecks: NamedCheck[] = [
  {
    Id: "term-shift.TS1",
    Name: "TS1: a shift under the review limit is approved on save and applied",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const ack = await AcknowledgeAmendmentsWith(ctx);
        reviewShiftsFrom(30);
        const { OrderID, Term } = await bookTerm(ctx);
        const before = await recognitionOf(ctx, Term.ID);
        Assert(before.length > 0, "the booked term staged a recognition schedule");

        const c = await recordShift(ctx, Term, 20);
        Assert(c.Saved, `recording failed: ${c.Message}`);
        AssertEqual(c.Entity.Status, "Approved", "under the review limit it goes through");
        AssertEqual(Number(c.Entity.ComputedValue), 0, "a shift gives nothing away");
        AssertSame([iso(c.Entity.PriorStartDate!), iso(c.Entity.PriorEndDate!)], [iso(Term.StartDate), iso(Term.EndDate)], "the record keeps the dates before");

        await assertShifted(ctx, Term, 20, before);
        const receivable = await TxQuery(ctx,
          `SELECT je.ID FROM ${ACCT_SCHEMA}.JournalEntry je JOIN ${ACCT_SCHEMA}.JournalEntryType t ON t.ID = je.EntryTypeID
            WHERE t.Code <> 'RevenueRecognition' AND je.LinkedRecordID = '${Term.ID}'`);
        AssertEqual(receivable.length, 0, "no receivable or booking entry: the same invoice covers the moved term");

        const event = await TxOne<{ EventData: string }>(ctx,
          `SELECT EventData FROM ${ORDERS_SCHEMA}.SubscriptionEvent WHERE SubscriptionID = '${Term.SubscriptionID}' AND EventType = 'Rescheduled'`);
        const data = JSON.parse(event.EventData) as Record<string, unknown>;
        AssertEqual(String(data.OrderConcessionID).toLowerCase(), c.Entity.ID.toLowerCase(), "the Rescheduled event names the concession");
        AssertEqual(data.NewStartDate, iso(addDays(Term.StartDate, 20)), "and the new start");

        const task = await acknowledgmentOf(ctx, c.Entity.ID);
        AssertEqual(task.Status, "Open", "accounting's acknowledgment is open until they confirm");
        Assert(/re-cut/.test(task.Description ?? ""), "it asks them to confirm the re-cut");
        const tasks = await TxQuery(ctx,
          `SELECT t.ID FROM __mj_BizAppsTasks.Task t JOIN __mj_BizAppsTasks.TaskLink tl ON tl.TaskID = t.ID AND tl.RecordID = '${c.Entity.ID}'`);
        AssertEqual(tasks.length, 1, "one acknowledgment, not a second generic one");
        const assigned = await TxQuery(ctx,
          `SELECT AssigneeRecordID FROM __mj_BizAppsTasks.TaskAssignment WHERE TaskID = '${task.ID}' AND AssigneeRecordID = '${ack.HolderID}'`);
        AssertEqual(assigned.length, 1, "it is assigned to the acknowledgment role's holder");
        Assert(OrderID != null, "the order was booked");
      }),
  },
  {
    Id: "term-shift.TS2",
    Name: "TS2: a shift at the review limit waits for finance, never the requester, then applies",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const ack = await financeRole(ctx);
        reviewShiftsFrom(30);
        const { Term } = await bookTerm(ctx);
        const before = await recognitionOf(ctx, Term.ID);

        const c = await recordShift(ctx, Term, 30);
        Assert(c.Saved, `recording failed: ${c.Message}`);
        AssertEqual(c.Entity.Status, "Pending", "at the limit it waits for review");
        Assert(c.Entity.SalesRuleID == null, "finance reviews it, not a ConcessionLimit tier");
        AssertSame(await datesOf(ctx, Term), { Start: iso(Term.StartDate), End: iso(Term.EndDate) }, "a Pending shift moves nothing");
        AssertEqual((await approvalTasksOf(ctx, c.Entity.ID)).length, 1, "finance is given an approval task");

        await createViaEntity(ctx, "MJ: User Roles", { UserID: ctx.User.ID, RoleID: ack.RoleID });
        c.Entity.Status = "Approved";
        Assert(!(await c.Entity.Save()), "the requester cannot decide their own shift, even holding the role");

        const reviewed = await reviewAsFinance(ctx, c.Entity.ID, ack);
        reviewed.Status = "Approved";
        Assert(await reviewed.Save(), `finance's approval failed: ${reviewed.LatestResult?.CompleteMessage}`);
        await assertShifted(ctx, Term, 30, before);
      }),
  },
  {
    Id: "term-shift.TS3",
    Name: "TS3: finance escalates a shift to the ConcessionLimit approver, who decides it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const ack = await financeRole(ctx);
        reviewShiftsFrom(null);
        const { Term } = await bookTerm(ctx);
        const ruleID = await floorTierHeldByRequester(ctx);

        const c = await recordShift(ctx, Term, 10);
        AssertEqual(c.Entity.Status, "Pending", `with no limit set every shift is reviewed: ${c.Message}`);
        const reviewed = await reviewAsFinance(ctx, c.Entity.ID, ack);
        Assert(!(await reviewed.EscalateShift("")), "an escalation must say why");
        Assert(await reviewed.EscalateShift("an unusual case"), `escalating failed: ${reviewed.LatestResult?.CompleteMessage}`);
        AssertEqual(String(reviewed.SalesRuleID).toLowerCase(), ruleID.toLowerCase(), "the shift is now the tier's to decide");
        AssertEqual(reviewed.Status, "Pending", "and still waits");

        const tasks = await approvalTasksOf(ctx, c.Entity.ID);
        Assert(tasks.some((t) => t.Status === "Cancelled" && /an unusual case/.test(t.CompletionNotes ?? "")), "finance's task closed with the reason");
        Assert(tasks.some((t) => t.Status !== "Cancelled" && t.Status !== "Completed"), "and the tier's role has its own task");
        Assert(!(await reviewed.EscalateShift("again")), "an escalated shift is not escalated twice");

        reviewed.Status = "Approved";
        Assert(await reviewed.Save(), `the tier's approval failed: ${reviewed.LatestResult?.CompleteMessage}`);
        AssertEqual((await datesOf(ctx, Term)).Start, iso(addDays(Term.StartDate, 10)), "approved by the tier, it applies");
      }),
  },
  {
    Id: "term-shift.TS4",
    Name: "TS4: a start moved before the effective day is caught up in the open period",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        reviewShiftsFrom(90);
        const { Term } = await bookTerm(ctx);
        Assert(iso(Term.StartDate) >= today(), "the fixture term starts today or later");
        const before = await recognitionOf(ctx, Term.ID);

        const c = await recordShift(ctx, Term, -60);
        Assert(c.Saved && c.Entity.Status === "Approved", `the shift did not apply: ${c.Message}`);
        const entries = await assertShifted(ctx, Term, -60, before);
        const catchUp = entries.filter((e) => /^Catch-up of /.test(e.Description ?? ""));
        AssertEqual(catchUp.length, 1, "one catch-up entry");
        AssertEqual(iso(catchUp[0].EffectiveDate), today(), "dated the effective day, in the open period");
        Assert(Number(catchUp[0].Net) > 0, "recognising the periods the new dates place behind it");
      }),
  },
  {
    Id: "term-shift.TS5",
    Name: "TS5: Orders.AmendArrangement previews and records a shift, and refuses a shortening",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        reviewShiftsFrom(30);
        const { Term } = await bookTerm(ctx);
        const before = await recognitionOf(ctx, Term.ID);
        const newStart = iso(addDays(Term.StartDate, 14));
        const input = { SubscriptionTermID: Term.ID, NewStartDate: newStart, ReasonCategory: "Other", Reason: "go-live moved" };

        const preview = await amend(ctx, { ...input, Preview: true });
        Assert(preview.Success, `preview failed: ${preview.Message}`);
        AssertSame([preview.NewStartDate, preview.NewEndDate], [newStart, iso(addDays(Term.EndDate, 14))], "the end follows the start");
        AssertEqual(Number(preview.Value), 0, "a shift is worth nothing");
        Assert((preview.Offsets?.length ?? 0) > 0 && (preview.NewSchedule?.length ?? 0) > 0, "it says what it would offset and re-spread");
        AssertEqual((await recognitionOf(ctx, Term.ID)).length, before.length, "a preview writes nothing");

        const shorter = await amend(ctx, { ...input, NewEndDate: iso(addDays(Term.EndDate, -30)), NewStartDate: undefined });
        Assert(!shorter.Success && /Shortening/.test(shorter.Message ?? ""), `an earlier end is refused for now: ${shorter.Message}`);
        const later = await amend(ctx, { ...input, NewEndDate: iso(Term.EndDate) });
        Assert(!later.Success && /Shortening/.test(later.Message ?? ""), `a later start with the same end is a shortening: ${later.Message}`);
        const both = await amend(ctx, { ...input, NewEndDate: iso(addDays(Term.EndDate, 40)) });
        Assert(!both.Success && /Move it first/.test(both.Message ?? ""), `a shift with an extension is two amendments: ${both.Message}`);

        const done = await amend(ctx, input);
        Assert(done.Success, `the amendment failed: ${done.Message}`);
        AssertEqual(done.Status, "Approved", "under the review limit it applies in the same call");
        await assertShifted(ctx, Term, 14, before);
      }),
  },
  {
    Id: "term-shift.TS6",
    Name: "TS6: instalments not yet invoiced move with the term",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        reviewShiftsFrom(30);
        const f = Fx();
        const draft = await BuildOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 }],
        });
        Assert(await draft.Order.Save(), `draft must save: ${draft.Order.LatestResult?.CompleteMessage ?? ""}`);
        const orderID = draft.Order.ID as string;
        const gross = Number((await TxOne<{ TotalGross: number }>(ctx, `SELECT TotalGross FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`)).TotalGross);
        const first = Math.round((gross / 2) * 100) / 100;
        const dues = [addDays(new Date(), 60), addDays(new Date(), 120)];
        for (const [i, amount] of [first, Math.round((gross - first) * 100) / 100].entries()) {
          await createViaEntity(ctx, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, {
            OrderHeaderID: orderID, CompanyID: f.CoA.ID, InstallmentNumber: i + 1, DueDate: new Date(`${iso(dues[i])}T00:00:00Z`), Amount: amount,
          });
        }
        const order = await new Metadata().GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, ctx.User);
        Assert(await order.Load(orderID), "the order did not reload");
        order.Status = "Confirmed";
        Assert(await order.Save(), `the order did not confirm: ${order.LatestResult?.CompleteMessage}`);
        const term = await termOf(ctx, orderID);

        const c = await recordShift(ctx, term, 15);
        Assert(c.Saved && c.Entity.Status === "Approved", `the shift did not apply: ${c.Message}`);
        const rows = await TxQuery<{ DueDate: Date }>(ctx,
          `SELECT DueDate FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${orderID}' ORDER BY InstallmentNumber`);
        AssertSame(rows.map((r) => iso(r.DueDate)), dues.map((d) => iso(addDays(d, 15))), "each instalment not yet invoiced moved 15 days");
      }),
  },
  {
    Id: "term-shift.TS7",
    Name: "TS7: in Chicago, a shift moves the term's grants to 00:00 Central on the new first day and after the new last day",
    RequiresMutation: true,
    Fn: async (ctx) =>
      WithBusinessZone(ctx, "America/Chicago", "Central Standard Time", async () => {
        await AcknowledgeAmendmentsWith(ctx);
        reviewShiftsFrom(30);
        const { Term } = await bookTerm(ctx);
        const c = await recordShift(ctx, Term, 20);
        Assert(c.Saved, `recording failed: ${c.Message}`);
        AssertEqual(c.Entity.Status, "Approved", "under the review limit it goes through");
        const start = iso(addDays(Term.StartDate, 20));
        const end = iso(addDays(Term.EndDate, 20));
        await AssertTermGrantWindow(ctx, Term.ID, start, end, "Chicago days, both ends");
        const g = await TxOne<{ ValidFrom: Date }>(ctx,
          `SELECT TOP 1 ValidFrom FROM ${ORDERS_SCHEMA}.EntitlementGrant WHERE SubscriptionTermID = '${Term.ID}' AND ValidityModeApplied = 'SubscriptionTerm'`);
        Assert(new Date(g.ValidFrom).getUTCHours() >= 5, `precondition: a Chicago start is 05:00Z or 06:00Z, not midnight UTC (got ${new Date(g.ValidFrom).toISOString()})`);
      }),
  },
];

interface AmendOutput {
  Success: boolean;
  Message?: string;
  NewStartDate?: string;
  NewEndDate?: string;
  Value?: number;
  Status?: string;
  Offsets?: unknown[];
  NewSchedule?: unknown[];
}

async function amend(ctx: IntegrationCheckContext, input: Record<string, unknown>): Promise<AmendOutput> {
  const op = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation<Record<string, unknown>, AmendOutput>>(
    BaseRemotableOperation,
    "Orders.AmendArrangement",
  );
  Assert(op != null, "'Orders.AmendArrangement' is not registered");
  const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
  Assert(result.Success, `Orders.AmendArrangement did not execute: ${result.ErrorMessage ?? result.ResultCode ?? "unknown"}`);
  return result.Output as AmendOutput;
}

for (const check of TermShiftChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("term-shift", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: async (ctx) => {
    OrdersSettings.SetOverride(ORDERS_SETTING.AmendmentAcknowledgmentRole, undefined);
    OrdersSettings.SetOverride(ORDERS_SETTING.TermShiftReviewDays, undefined);
    await TeardownOrdersFixture(ctx);
  },
});
