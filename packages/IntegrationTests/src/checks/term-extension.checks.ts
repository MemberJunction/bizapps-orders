/**
 * term-extension — a booked term extended at no charge, with recognition, access and renewal following
 * (bc-aidp-next-golive#221, case B).
 *
 * The approved Duration concession IS the amendment. Approving it moves the term's end and nets the staged
 * recognition schedule: every staged entry from the effective date on is mirrored on its own date and what
 * they were going to recognise is spread again to the new end. No receivable moves, so accounting is told
 * through a task that stays open until they confirm the re-cut.
 *
 *   TX1   inside authority: approved on save and applied — term, line, schedule, event, acknowledgment
 *   TX2   outside authority: Pending changes nothing; approving it applies the extension
 *   TX3   a rejected extension changes nothing
 *   TX4   with no acknowledgment role configured, the extension is refused
 *   TX5   the requester is never assigned their own acknowledgment; with no one else, it is refused
 *   TX6   a term whose renewal is already placed is refused until the renewal is reversed
 *   TX7   the renewal follows the new end
 *   TX8   Orders.AmendArrangement previews without writing, then records and applies
 *   TX9   a booked term's end date still cannot be moved directly
 *
 * CONNECTS TO:
 *   CODE: TermExtension · TermExtensionPlan · OrderConcessionEntityServer · SubscriptionTermEntityServer
 *         · AmendArrangementOperation · SpawnRenewalsOperation
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
import { ORDERS_SETTING, OrdersSettings } from "@mj-biz-apps/orders-core-entities-server";
import type {
  mjBizAppsOrdersOrderConcessionEntity,
  mjBizAppsOrdersSubscriptionTermEntity,
} from "@mj-biz-apps/orders-entities";
import {
  ACCT_SCHEMA,
  AcknowledgeAmendmentsWith,
  CreateOrdersFixture,
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
  PERSON_ENTITY,
  SALES_AUTHORITY_ENTITY,
  SALES_RULE_ENTITY,
  SUBSCRIPTION_TERM_ENTITY,
} from "../entity-names.js";
import { ConfirmOrder } from "../order-builder.js";

const DAY = 86_400_000;
const iso = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const addDays = (d: Date | string, n: number) => new Date(new Date(d).getTime() + n * DAY);

async function grantAuthority(ctx: IntegrationCheckContext, maxValue: number, maxDays: number): Promise<void> {
  await createViaEntity(ctx, SALES_AUTHORITY_ENTITY, {
    SalesRepUserID: ctx.User.ID,
    MaxConcessionValue: maxValue,
    MaxTermExtensionDays: maxDays,
    IsActive: 1,
  });
}

/**
 * A ConcessionLimit rule decided by `roleID`, which the requester lacks, so what they record outside their
 * authority is Pending. `handToRequester` then points it at a role they hold, so the check can decide it.
 *
 * A Pending concession's approval task is assigned to the person records of the role's other holders, and
 * one nobody could be told of is refused, so a holder is given a person record when none of them has one.
 */
async function ruleDecidedBy(ctx: IntegrationCheckContext, roleID: string) {
  const holders = await TxQuery<{ UserID: string; PersonID: string | null }>(ctx,
    `SELECT ur.UserID, (SELECT TOP 1 p.ID FROM __mj_BizAppsCommon.Person p
                         WHERE p.LinkedUserID = ur.UserID AND p.Status = 'Active') AS PersonID
       FROM __mj.UserRole ur
       JOIN __mj.[User] u ON u.ID = ur.UserID AND u.IsActive = 1
      WHERE ur.RoleID = '${roleID}' AND ur.UserID <> '${ctx.User.ID}'`);
  Assert(holders.length > 0, "the approving role has no holder other than the requester");
  if (!holders.some((h) => h.PersonID)) {
    await createViaEntity(ctx, PERSON_ENTITY, {
      FirstName: "Concession", LastName: "Approver", LinkedUserID: holders[0].UserID, Status: "Active",
    });
  }
  const ruleID = await createViaEntity(ctx, SALES_RULE_ENTITY, {
    Name: "ConcessionLimit approval",
    RuleType: "ConcessionLimit",
    Scope: "Global",
    ApprovalRequiredRoleID: roleID,
    IsActive: 1,
  });
  return {
    handToRequester: async () => {
      const held = await TxOne<{ RoleID: string }>(ctx, `SELECT TOP 1 RoleID FROM __mj.UserRole WHERE UserID = '${ctx.User.ID}'`);
      await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.SalesRule SET ApprovalRequiredRoleID = '${held.RoleID}' WHERE ID = '${ruleID}'`);
    },
  };
}

async function bookTerm(ctx: IntegrationCheckContext, price = 1200) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: price }],
  });
  Assert(result.Saved, `the subscription order did not confirm: ${result.Message}`);
  const term = await TxOne<{ ID: string; SubscriptionID: string; OrderLineID: string; StartDate: Date; EndDate: Date; Amount: number }>(ctx,
    `SELECT st.ID, st.SubscriptionID, st.OrderLineID, st.StartDate, st.EndDate, st.Amount
       FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
       JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
      WHERE ol.OrderHeaderID = '${result.Order.ID}'`);
  return { OrderID: result.Order.ID as string, Term: term };
}

async function recordExtension(ctx: IntegrationCheckContext, termID: string, days: number) {
  const entity = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderConcessionEntity>(ORDER_CONCESSION_ENTITY, ctx.User);
  entity.NewRecord();
  entity.DeliveryForm = "Duration";
  entity.SubscriptionTermID = termID;
  entity.AddedDays = days;
  entity.ReasonCategory = "Retention";
  entity.Reason = "keep the account";
  const saved = await entity.Save();
  return { Saved: saved, Message: entity.LatestResult?.CompleteMessage ?? "", Entity: entity };
}

/** Every recognition entry linked to the term, with its net revenue credit (positive recognises). */
async function recognitionOf(ctx: IntegrationCheckContext, termID: string) {
  return TxQuery<{ ID: string; EffectiveDate: Date; Status: string; Description: string; Net: number }>(ctx,
    `SELECT je.ID, je.EffectiveDate, je.Status, je.Description,
            SUM(CASE WHEN a.Name LIKE '%Deferred%' THEN ISNULL(l.DebitAmount, 0) - ISNULL(l.CreditAmount, 0) ELSE 0 END) AS Net
       FROM ${ACCT_SCHEMA}.JournalEntry je
       JOIN ${ACCT_SCHEMA}.JournalEntryType t ON t.ID = je.EntryTypeID AND t.Code = 'RevenueRecognition'
       JOIN ${ACCT_SCHEMA}.JournalEntryLine l ON l.JournalEntryID = je.ID
       JOIN ${ACCT_SCHEMA}.GLAccount a ON a.ID = l.GLAccountID
      WHERE je.LinkedRecordID = '${termID}'
      GROUP BY je.ID, je.EffectiveDate, je.Status, je.Description`);
}

/** Net recognition per date: after the extension it must equal the new schedule, never twice. */
function byDate(rows: { EffectiveDate: Date; Net: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(iso(r.EffectiveDate), Math.round(((out.get(iso(r.EffectiveDate)) ?? 0) + Number(r.Net)) * 100) / 100);
  return out;
}

async function acknowledgmentOf(ctx: IntegrationCheckContext, concessionID: string) {
  const task = await TxOne<{ ID: string; Status: string; TypeCode: string; Description: string }>(ctx,
    `SELECT t.ID, t.Status, tt.Code AS TypeCode, t.Description
       FROM __mj_BizAppsTasks.Task t
       JOIN __mj_BizAppsTasks.TaskType tt ON tt.ID = t.TypeID
       JOIN __mj_BizAppsTasks.TaskLink tl ON tl.TaskID = t.ID AND tl.RecordID = '${concessionID}'
      WHERE tt.Code = 'ACTION_ITEM'`);
  const links = await TxQuery<{ RecordID: string }>(ctx, `SELECT RecordID FROM __mj_BizAppsTasks.TaskLink WHERE TaskID = '${task.ID}'`);
  const assignees = await TxQuery<{ AssigneeRecordID: string }>(ctx,
    `SELECT AssigneeRecordID FROM __mj_BizAppsTasks.TaskAssignment WHERE TaskID = '${task.ID}'`);
  const has = (rows: { RecordID?: string; AssigneeRecordID?: string }[], id: string) =>
    rows.some((r) => String(r.RecordID ?? r.AssigneeRecordID).toLowerCase() === id.toLowerCase());
  return { Task: task, Linked: (id: string) => has(links, id), Assigned: (id: string) => has(assignees, id), AssigneeCount: assignees.length };
}

/** The term, line and schedule after an applied extension, asserted together. */
async function assertApplied(ctx: IntegrationCheckContext, term: { ID: string; OrderLineID: string; EndDate: Date; Amount: number }, days: number) {
  const newEnd = iso(addDays(term.EndDate, days));
  const row = await TxOne<{ EndDate: Date }>(ctx, `SELECT EndDate FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE ID = '${term.ID}'`);
  AssertEqual(iso(row.EndDate), newEnd, "the term ends later");
  const line = await TxOne<{ ServicePeriodEnd: Date }>(ctx, `SELECT ServicePeriodEnd FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${term.OrderLineID}'`);
  AssertEqual(iso(line.ServicePeriodEnd), newEnd, "and the line that bought it agrees");

  const entries = await recognitionOf(ctx, term.ID);
  const total = Math.round(entries.reduce((s, e) => s + Number(e.Net), 0) * 100) / 100;
  AssertEqual(total, Number(term.Amount), "the schedule still recognises exactly the term's amount — nothing twice");
  Assert(entries.some((e) => /^Offset of /.test(e.Description ?? "")), "staged entries were offset rather than edited or deleted");
  const last = [...byDate(entries).entries()].filter(([, v]) => v !== 0).map(([d]) => d).sort().pop();
  Assert(last != null && last <= newEnd, `nothing recognises after the new end (last ${last})`);
  const perDate = [...byDate(entries).values()];
  Assert(perDate.every((v) => v >= 0), "no period nets negative");
  return entries;
}

export const TermExtensionChecks: NamedCheck[] = [
  {
    Id: "term-extension.TX1",
    Name: "TX1: an extension inside authority is approved on save and applied",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const ack = await AcknowledgeAmendmentsWith(ctx);
        const { OrderID, Term } = await bookTerm(ctx);
        await grantAuthority(ctx, 10_000, 365);
        const before = await recognitionOf(ctx, Term.ID);
        Assert(before.length > 0, "the booked term staged a recognition schedule");

        const c = await recordExtension(ctx, Term.ID, 90);
        Assert(c.Saved, `recording failed: ${c.Message}`);
        AssertEqual(c.Entity.Status, "Approved", "inside authority, approved on save");

        const after = await assertApplied(ctx, Term, 90);
        Assert(after.length > before.length, "offsets and a new schedule were written");
        const receivable = await TxQuery(ctx,
          `SELECT je.ID FROM ${ACCT_SCHEMA}.JournalEntry je JOIN ${ACCT_SCHEMA}.JournalEntryType t ON t.ID = je.EntryTypeID
            WHERE t.Code <> 'RevenueRecognition' AND je.LinkedRecordID = '${Term.ID}'`);
        AssertEqual(receivable.length, 0, "no receivable or booking entry: the same invoice covers the longer term");

        const event = await TxOne<{ EventData: string; RelatedOrderHeaderID: string }>(ctx,
          `SELECT EventData, RelatedOrderHeaderID FROM ${ORDERS_SCHEMA}.SubscriptionEvent
            WHERE SubscriptionID = '${Term.SubscriptionID}' AND EventType = 'Extended' AND EventData LIKE '%Amendment%'`);
        const data = JSON.parse(event.EventData) as Record<string, unknown>;
        AssertEqual(String(data.OrderConcessionID).toLowerCase(), c.Entity.ID.toLowerCase(), "the event names the concession");
        AssertEqual(data.NewEndDate, iso(addDays(Term.EndDate, 90)), "and the new end");
        Assert(Array.isArray(data.Offsets) && (data.Offsets as unknown[]).length > 0, "and pairs each offset with what it offsets");

        const a = await acknowledgmentOf(ctx, c.Entity.ID);
        AssertEqual(a.Task.Status, "Open", "accounting's acknowledgment is open until they confirm");
        Assert(a.Linked(Term.ID) && a.Linked(OrderID), "it links the term and the order");
        Assert(a.Assigned(ack.HolderID), "it is assigned to the acknowledgment role's holder");
        Assert(!a.Assigned(ctx.User.ID), "and never to the requester");
        Assert(/re-cut/.test(a.Task.Description ?? ""), "it carries the old and new schedules");
      }),
  },
  {
    Id: "term-extension.TX2",
    Name: "TX2: a Pending extension changes nothing until it is approved, then applies",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const ack = await AcknowledgeAmendmentsWith(ctx);
        const { Term } = await bookTerm(ctx);
        await grantAuthority(ctx, 1, 1);
        const rule = await ruleDecidedBy(ctx, ack.RoleID);
        const before = await recognitionOf(ctx, Term.ID);

        const c = await recordExtension(ctx, Term.ID, 60);
        Assert(c.Saved, `recording failed: ${c.Message}`);
        AssertEqual(c.Entity.Status, "Pending", "outside authority it waits");
        const pendingEnd = await TxOne<{ EndDate: Date }>(ctx, `SELECT EndDate FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE ID = '${Term.ID}'`);
        AssertEqual(iso(pendingEnd.EndDate), iso(Term.EndDate), "a Pending extension does not move the term");
        AssertEqual((await recognitionOf(ctx, Term.ID)).length, before.length, "or touch the schedule");

        await rule.handToRequester();
        c.Entity.Status = "Approved";
        Assert(await c.Entity.Save(), `approving failed: ${c.Entity.LatestResult?.CompleteMessage}`);
        await assertApplied(ctx, Term, 60);
      }),
  },
  {
    Id: "term-extension.TX3",
    Name: "TX3: a rejected extension changes nothing",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const ack = await AcknowledgeAmendmentsWith(ctx);
        const { Term } = await bookTerm(ctx);
        await grantAuthority(ctx, 1, 1);
        const rule = await ruleDecidedBy(ctx, ack.RoleID);
        const before = await recognitionOf(ctx, Term.ID);

        const c = await recordExtension(ctx, Term.ID, 60);
        Assert(c.Saved && c.Entity.Status === "Pending", `expected Pending: ${c.Message}`);
        await rule.handToRequester();
        c.Entity.Status = "Rejected";
        Assert(await c.Entity.Save(), `rejecting failed: ${c.Entity.LatestResult?.CompleteMessage}`);

        const row = await TxOne<{ EndDate: Date }>(ctx, `SELECT EndDate FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE ID = '${Term.ID}'`);
        AssertEqual(iso(row.EndDate), iso(Term.EndDate), "the term is unchanged");
        AssertEqual((await recognitionOf(ctx, Term.ID)).length, before.length, "and so is its schedule");
      }),
  },
  {
    Id: "term-extension.TX4",
    Name: "TX4: with no acknowledgment role configured, an extension is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const { Term } = await bookTerm(ctx);
        await grantAuthority(ctx, 10_000, 365);
        OrdersSettings.SetOverride(ORDERS_SETTING.AmendmentAcknowledgmentRole, "");
        const c = await recordExtension(ctx, Term.ID, 30);
        Assert(!c.Saved, "no one in accounting would be told, so it is refused");
        Assert(/AmendmentAcknowledgmentRole/.test(c.Message), `the refusal names the setting: ${c.Message}`);
      }),
  },
  {
    Id: "term-extension.TX5",
    Name: "TX5: the requester is never their own acknowledger; with no one else, it is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const { Term } = await bookTerm(ctx);
        await grantAuthority(ctx, 10_000, 365);
        // A role only the requester holds.
        const solo = await TxOne<{ Name: string }>(ctx,
          `SELECT TOP 1 r.Name FROM __mj.Role r
             JOIN __mj.UserRole mine ON mine.RoleID = r.ID AND mine.UserID = '${ctx.User.ID}'
            WHERE NOT EXISTS (SELECT 1 FROM __mj.UserRole ur JOIN __mj.[User] u ON u.ID = ur.UserID AND u.IsActive = 1
                               WHERE ur.RoleID = r.ID AND ur.UserID <> '${ctx.User.ID}')`);
        OrdersSettings.SetOverride(ORDERS_SETTING.AmendmentAcknowledgmentRole, solo.Name);
        const c = await recordExtension(ctx, Term.ID, 30);
        Assert(!c.Saved, "the requester cannot acknowledge their own amendment");
        Assert(/requester cannot acknowledge/.test(c.Message), `the refusal says why: ${c.Message}`);
      }),
  },
  {
    Id: "term-extension.TX6",
    Name: "TX6: a term whose renewal is already placed is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        const { Term } = await bookTerm(ctx);
        await grantAuthority(ctx, 10_000, 365);
        const renewal = await spawnRenewals(ctx, { SubscriptionID: Term.SubscriptionID, AsOfDate: iso(addDays(Term.EndDate, -10)) });
        AssertEqual(renewal.Placed, 1, `the renewal was placed: ${renewal.Message}`);

        const c = await recordExtension(ctx, Term.ID, 30);
        Assert(!c.Saved, "extending a term whose renewal is placed would leave the renewal on the old date");
        Assert(/renewal order has already been placed/.test(c.Message), `the refusal says to reverse the renewal: ${c.Message}`);
      }),
  },
  {
    Id: "term-extension.TX7",
    Name: "TX7: the renewal follows the new end",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        const { Term } = await bookTerm(ctx);
        await grantAuthority(ctx, 10_000, 365);
        const c = await recordExtension(ctx, Term.ID, 90);
        Assert(c.Saved && c.Entity.Status === "Approved", `the extension did not apply: ${c.Message}`);

        const newEnd = addDays(Term.EndDate, 90);
        const early = await spawnRenewals(ctx, { SubscriptionID: Term.SubscriptionID, AsOfDate: iso(addDays(Term.EndDate, -10)) });
        AssertEqual(early.Placed, 0, "the old renewal date no longer triggers one");
        const due = await spawnRenewals(ctx, { SubscriptionID: Term.SubscriptionID, AsOfDate: iso(addDays(newEnd, -10)) });
        AssertEqual(due.Placed, 1, `the renewal is placed against the new end: ${due.Message}`);
        const order = await TxOne<{ OrderDate: Date }>(ctx, `SELECT OrderDate FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${due.Candidates[0].OrderID}'`);
        AssertEqual(iso(order.OrderDate), iso(addDays(newEnd, 1)), "dated the day after the new end");
      }),
  },
  {
    Id: "term-extension.TX8",
    Name: "TX8: Orders.AmendArrangement previews without writing, then records and applies",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        const { Term } = await bookTerm(ctx);
        await grantAuthority(ctx, 10_000, 365);
        const before = await recognitionOf(ctx, Term.ID);
        const newEnd = iso(addDays(Term.EndDate, 90));
        const input = { SubscriptionTermID: Term.ID, NewEndDate: newEnd, ReasonCategory: "Referral", Reason: "referral credit" };

        const preview = await amend(ctx, { ...input, Preview: true });
        Assert(preview.Success, `preview failed: ${preview.Message}`);
        AssertEqual(preview.NewEndDate, newEnd, "the preview names the new end");
        Assert(Number(preview.Value) > 0 && (preview.Offsets?.length ?? 0) > 0 && (preview.NewSchedule?.length ?? 0) > 0,
          "and says what it would offset and re-spread, and what it is worth");
        AssertEqual((await recognitionOf(ctx, Term.ID)).length, before.length, "a preview writes nothing");
        const count = await TxOne<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderConcession WHERE SubscriptionTermID = '${Term.ID}'`);
        AssertEqual(Number(count.N), 0, "not even the concession");

        const done = await amend(ctx, input);
        Assert(done.Success, `the amendment failed: ${done.Message}`);
        AssertEqual(done.Status, "Approved", "inside authority it applies in the same call");
        await assertApplied(ctx, Term, 90);

        const amount = await amend(ctx, { ...input, NewAmount: 900 });
        Assert(!amount.Success && /amount/.test(amount.Message ?? ""), "a change of amount is refused for now");
      }),
  },
  {
    Id: "term-extension.TX9",
    Name: "TX9: a booked term's end date still cannot be moved directly",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const { Term } = await bookTerm(ctx);
        const term = await new Metadata().GetEntityObject<mjBizAppsOrdersSubscriptionTermEntity>(SUBSCRIPTION_TERM_ENTITY, ctx.User);
        Assert(await term.Load(Term.ID), "the term did not load");
        term.EndDate = addDays(Term.EndDate, 30);
        Assert(!(await term.Save()), "only an approved extension moves a booked term");
        Assert(/Duration concession/.test(term.LatestResult?.CompleteMessage ?? ""), "and the refusal says how");
      }),
  },
];

interface RenewalOutput {
  Placed: number;
  Message?: string;
  Candidates: Array<{ OrderID?: string }>;
}

async function spawnRenewals(ctx: IntegrationCheckContext, input: Record<string, unknown>): Promise<RenewalOutput> {
  return run<RenewalOutput>(ctx, "Orders.SpawnRenewals", input);
}

interface AmendOutput {
  Success: boolean;
  Message?: string;
  NewEndDate?: string;
  Value?: number;
  Status?: string;
  Offsets?: unknown[];
  NewSchedule?: unknown[];
}

async function amend(ctx: IntegrationCheckContext, input: Record<string, unknown>): Promise<AmendOutput> {
  return run<AmendOutput>(ctx, "Orders.AmendArrangement", input);
}

async function run<T>(ctx: IntegrationCheckContext, key: string, input: Record<string, unknown>): Promise<T> {
  const op = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation<Record<string, unknown>, T>>(BaseRemotableOperation, key);
  Assert(op != null, `'${key}' is not registered`);
  const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
  Assert(result.Success, `${key} did not execute: ${result.ErrorMessage ?? result.ResultCode ?? "unknown"}`);
  return result.Output as T;
}

for (const check of TermExtensionChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("term-extension", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: async (ctx) => {
    OrdersSettings.SetOverride(ORDERS_SETTING.AmendmentAcknowledgmentRole, undefined);
    await TeardownOrdersFixture(ctx);
  },
});
