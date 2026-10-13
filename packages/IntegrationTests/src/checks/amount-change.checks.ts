/**
 * amount-change — lowering a booked term's amount (#506, bc-aidp-next-golive#221 case A).
 *
 * `Orders.AmendArrangement` with `NewAmount` and `Preview` plans the change against the real ledger and schedule:
 * the share of the reduction already earned is taken back at once, the staged slices from today on are offset and
 * what is left is re-spread, and the reduction comes off the instalments not yet invoiced before any document is
 * credited. Without `Preview` it records a Price concession, applied when approved. What the uninvoiced
 * instalments cannot absorb is credited on a credit memo the approved concession carries (#662).
 *
 *   AC1   an order billed as a whole: the order is credited; the recognition plan foots; nothing is written
 *   AC2   an order billed by instalment: the reduction comes off the uninvoiced instalments, with no document
 *   AC3   "applies to invoice" credits that invoice first; an uninvoiced instalment is refused as the target
 *   AC4   refusals: an increase, a placed renewal, no acknowledgment role
 *   AC5   inside authority: recorded, approved and applied — term, instalments, balance, entries, event, task;
 *         the next instalment still invoices
 *   AC6   outside authority: Pending changes nothing; approving it applies the change
 *   AC7   a credit on an invoice already sent: the credit memo credits it, posts its entry and un-bills the line
 *   AC8   billed as a whole: all of it is a credit memo on the order, whose balance falls by it
 *   AC9   a refund of a paid invoice's credit: recorded on that invoice, then paid with Orders.RefundPayment
 *   AC10  two lines on one schedule, one lowered: the later instalments bill each line what it has left (#681)
 *
 * The checks run on today's date, so how much is already earned depends on the day: they assert the plan's
 * arithmetic against the term's own staged entries rather than fixed figures.
 *
 * CONNECTS TO:
 *   CODE: AmendArrangementOperation · AmountChange · AmountChangePlan · OrderConcessionEntityServer
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
import type { mjBizAppsOrdersOrderConcessionEntity, OrderHeaderEntity } from "@mj-biz-apps/orders-entities";
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
import { ORDER_CONCESSION_ENTITY, ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY } from "../entity-names.js";
import { BuildOrder, ConfirmOrder } from "../order-builder.js";
import { issue, pay } from "./payment-schedule.checks.js";
import { acknowledgmentOf, grantAuthority, ruleDecidedBy } from "./term-extension.checks.js";

const DAY = 86_400_000;
const iso = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const money = (n: number) => Math.round(n * 100) / 100;
const today = () => iso(new Date());

interface Term {
  ID: string;
  SubscriptionID: string;
  OrderLineID: string;
  StartDate: Date;
  EndDate: Date;
  Amount: number;
}

async function termOf(ctx: IntegrationCheckContext, orderID: string): Promise<Term> {
  return TxOne<Term>(ctx,
    `SELECT st.ID, st.SubscriptionID, st.OrderLineID, st.StartDate, st.EndDate, st.Amount
       FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
       JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
      WHERE ol.OrderHeaderID = '${orderID}'`);
}

/** A 1,200 annual membership billed as a whole, booked today. */
async function bookWhole(ctx: IntegrationCheckContext) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 }],
  });
  Assert(result.Saved, `the subscription order did not confirm: ${result.Message}`);
  const orderID = result.Order.ID as string;
  return { OrderID: orderID, Term: await termOf(ctx, orderID) };
}

/** Every term the order's lines bought, in line order. */
async function termsOf(ctx: IntegrationCheckContext, orderID: string): Promise<Term[]> {
  return TxQuery<Term>(ctx,
    `SELECT st.ID, st.SubscriptionID, st.OrderLineID, st.StartDate, st.EndDate, st.Amount
       FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
       JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
      WHERE ol.OrderHeaderID = '${orderID}'
      ORDER BY ol.LineNumber`);
}

/**
 * A 1,200 annual membership dated 100 days ago and billed in four instalments of 300: the first due on the order
 * date, so confirm invoices it, and the other three still to come. `prices` gives one membership line per price,
 * billed together in four equal instalments.
 */
async function bookByInstalment(ctx: IntegrationCheckContext, prices: number[] = [1200]) {
  const f = Fx();
  const orderDate = new Date(Date.now() - 100 * DAY);
  const due = (months: number) => {
    const d = new Date(Date.UTC(orderDate.getUTCFullYear(), orderDate.getUTCMonth() + months, orderDate.getUTCDate()));
    return d;
  };
  const draft = await BuildOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    OrderDate: new Date(`${iso(orderDate)}T00:00:00Z`),
    Lines: prices.map((UnitPrice) => ({ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice })),
  });
  Assert(await draft.Order.Save(), `draft must save: ${draft.Order.LatestResult?.CompleteMessage ?? ""}`);
  const orderID = draft.Order.ID as string;
  const ids: string[] = [];
  for (let n = 1; n <= 4; n++) {
    ids.push(await createViaEntity(ctx, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, {
      OrderHeaderID: orderID,
      CompanyID: f.CoA.ID,
      InstallmentNumber: n,
      DueDate: new Date(`${iso(due((n - 1) * 3))}T00:00:00Z`),
      Amount: money(prices.reduce((t, p) => t + p, 0) / 4),
    }));
  }
  const order = await new Metadata().GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, ctx.User);
  Assert(await order.Load(orderID), "header reload must succeed");
  order.Status = "Confirmed";
  Assert(await order.Save(), `the scheduled order did not confirm: ${order.LatestResult?.CompleteMessage}`);
  const rows = await TxQuery<{ ID: string; InstallmentNumber: number; Status: string; DocumentNumber: string | null }>(ctx,
    `SELECT ID, InstallmentNumber, Status, DocumentNumber FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule
      WHERE OrderHeaderID = '${orderID}' ORDER BY InstallmentNumber`);
  Assert(rows[0].DocumentNumber != null, "instalment 1 fell due on the order date, so confirm invoiced it");
  Assert(rows.slice(1).every((r) => r.Status === "Scheduled"), "instalments 2 to 4 are still to come");
  const terms = await termsOf(ctx, orderID);
  return { OrderID: orderID, Term: terms[0], Terms: terms, InstalmentIDs: ids };
}

/** Every recognition entry linked to the term, with what it recognises (positive) and its date. */
async function staged(ctx: IntegrationCheckContext, termID: string) {
  return TxQuery<{ ID: string; EffectiveDate: Date; Net: number }>(ctx,
    `SELECT je.ID, je.EffectiveDate,
            SUM(CASE WHEN a.Name LIKE '%Deferred%' THEN ISNULL(l.DebitAmount, 0) - ISNULL(l.CreditAmount, 0) ELSE 0 END) AS Net
       FROM ${ACCT_SCHEMA}.JournalEntry je
       JOIN ${ACCT_SCHEMA}.JournalEntryType t ON t.ID = je.EntryTypeID AND t.Code = 'RevenueRecognition'
       JOIN ${ACCT_SCHEMA}.JournalEntryLine l ON l.JournalEntryID = je.ID
       JOIN ${ACCT_SCHEMA}.GLAccount a ON a.ID = l.GLAccountID
      WHERE je.LinkedRecordID = '${termID}'
      GROUP BY je.ID, je.EffectiveDate`);
}

/** What any write would have left behind: entries on the term, concessions, and the schedule's amounts. */
async function footprint(ctx: IntegrationCheckContext, orderID: string, termID: string) {
  const row = await TxOne<{ Entries: number; Concessions: number; Scheduled: number | null }>(ctx,
    `SELECT (SELECT COUNT(*) FROM ${ACCT_SCHEMA}.JournalEntry WHERE LinkedRecordID = '${termID}') AS Entries,
            (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderConcession WHERE OrderHeaderID = '${orderID}') AS Concessions,
            (SELECT SUM(Amount) FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${orderID}') AS Scheduled`);
  return `${row.Entries}|${row.Concessions}|${row.Scheduled ?? 0}`;
}

/** The plan's recognition arithmetic, checked against the term's own staged entries. */
async function assertRecognitionFoots(ctx: IntegrationCheckContext, term: Term, out: AmendOutput) {
  const entries = await staged(ctx, term.ID);
  const earned = money(entries.filter((e) => iso(e.EffectiveDate) < today()).reduce((s, e) => s + Number(e.Net), 0));
  const toCome = entries.filter((e) => iso(e.EffectiveDate) >= today());
  const reduction = Number(out.Value);
  AssertEqual(out.CatchUp, money((reduction * earned) / Number(term.Amount)), "the catch-up is the earned share of the reduction");
  AssertEqual(out.Offsets?.length ?? 0, toCome.length, "every staged slice from today on is offset, and only those");
  const replaced = money(toCome.reduce((s, e) => s + Number(e.Net), 0));
  AssertEqual(out.Respread, money(replaced - (reduction - Number(out.CatchUp))), "what is left at the new price is re-spread");
  AssertEqual(money((out.NewSchedule ?? []).reduce((s, e) => s + e.Amount, 0)), Number(out.Respread), "and the new schedule sums to it");
}

const REASON = { ReasonCategory: "Other", Reason: "disputed charge conceded" };

export const AmountChangeChecks: NamedCheck[] = [
  {
    Id: "amount-change.AC1",
    Name: "AC1: billed as a whole, the order is credited and the recognition plan foots; nothing is written",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        const { OrderID, Term } = await bookWhole(ctx);
        const before = await footprint(ctx, OrderID, Term.ID);

        const out = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 900, Preview: true, ...REASON });
        Assert(out.Success, `the preview failed: ${out.Message}`);
        AssertEqual(out.CurrentAmount, 1200, "from the term's amount");
        AssertEqual(out.NewAmount, 900, "to the new one");
        AssertEqual(out.Value, 300, "the reduction is the concession's value");
        AssertEqual(out.GrossReduction, money(300 + Number(out.TaxReduction)), "billed less by the reduction and its tax");
        AssertEqual(out.Instalments?.length ?? 0, 0, "no instalments to take it from");
        AssertEqual(out.CreditMemo, out.GrossReduction, "so all of it is a credit memo");
        const applied = out.CreditApplied ?? [];
        Assert(applied.every((a) => a.InstalmentID == null), "applied to the order, which is the invoice");
        AssertEqual(money(applied.reduce((s, a) => s + a.Amount, 0) + Number(out.Refund) + Number(out.OpenCredit)), out.CreditMemo,
          "and every cent of it lands somewhere");
        await assertRecognitionFoots(ctx, Term, out);
        AssertEqual(await footprint(ctx, OrderID, Term.ID), before, "a preview writes nothing");
      }),
  },
  {
    Id: "amount-change.AC2",
    Name: "AC2: billed by instalment, the reduction comes off the uninvoiced instalments with no document",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        const { OrderID, Term, InstalmentIDs } = await bookByInstalment(ctx);
        const before = await footprint(ctx, OrderID, Term.ID);

        const out = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 900, Preview: true, ...REASON });
        Assert(out.Success, `the preview failed: ${out.Message}`);
        const changed = out.Instalments ?? [];
        AssertEqual(changed.map((c) => c.InstallmentNumber).join(","), "2,3,4", "only the instalments not yet invoiced change");
        AssertEqual(money(changed.reduce((s, c) => s + c.CurrentAmount - c.NewAmount, 0)), out.GrossReduction, "and they absorb all of it");
        Assert(changed.every((c) => c.NewAmount === 200), `pro rata: each of 300 becomes 200, got ${changed.map((c) => c.NewAmount).join(", ")}`);
        AssertEqual(String(changed[0].InstalmentID).toLowerCase(), InstalmentIDs[1].toLowerCase(), "naming each instalment");
        AssertEqual(out.CreditMemo, 0, "no customer document is needed");
        await assertRecognitionFoots(ctx, Term, out);
        AssertEqual(await footprint(ctx, OrderID, Term.ID), before, "a preview writes nothing");
      }),
  },
  {
    Id: "amount-change.AC3",
    Name: "AC3: applies to invoice credits that invoice first; an uninvoiced instalment cannot be the target",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        const { Term, InstalmentIDs } = await bookByInstalment(ctx);

        const out = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 1000, AppliesToInvoiceID: InstalmentIDs[0], Preview: true, ...REASON });
        Assert(out.Success, `the preview failed: ${out.Message}`);
        AssertEqual(out.CreditApplied?.length ?? 0, 1, "one invoice is credited");
        AssertEqual(String(out.CreditApplied![0].InstalmentID).toLowerCase(), InstalmentIDs[0].toLowerCase(), "the one named");
        Assert(Number(out.GrossReduction) < 300, "the reduction is less than instalment 1 still owes");
        AssertEqual(out.CreditApplied![0].Amount, out.GrossReduction, "so all of it is credited there");
        AssertEqual(out.Instalments?.length ?? 0, 0, "and no instalment changes");
        AssertEqual(out.CreditMemo, out.GrossReduction, "the credit memo is that credit");

        const wrong = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 1000, AppliesToInvoiceID: InstalmentIDs[2], Preview: true, ...REASON });
        Assert(!wrong.Success && /has not been invoiced/.test(wrong.Message ?? ""), `an uninvoiced instalment is refused: ${wrong.Message}`);
      }),
  },
  {
    Id: "amount-change.AC4",
    Name: "AC4: an increase, a placed renewal and no acknowledgment role are refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        const { OrderID, Term } = await bookWhole(ctx);
        const before = await footprint(ctx, OrderID, Term.ID);

        const up = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 1500, ...REASON });
        Assert(!up.Success && /lower than the current/.test(up.Message ?? ""), `an increase is refused: ${up.Message}`);
        AssertEqual(await footprint(ctx, OrderID, Term.ID), before, "and writes nothing");

        OrdersSettings.SetOverride(ORDERS_SETTING.AmendmentAcknowledgmentRole, "");
        const untold = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 900, Preview: true, ...REASON });
        Assert(!untold.Success && /AmendmentAcknowledgmentRole/.test(untold.Message ?? ""), `no one to tell is refused: ${untold.Message}`);
        await AcknowledgeAmendmentsWith(ctx);

        const renewal = await run<{ Placed: number; Message?: string }>(ctx, "Orders.SpawnRenewals", {
          SubscriptionID: Term.SubscriptionID,
          AsOfDate: iso(new Date(new Date(Term.EndDate).getTime() - 10 * DAY)),
        });
        AssertEqual(renewal.Placed, 1, `the renewal was placed: ${renewal.Message}`);
        const late = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 900, Preview: true, ...REASON });
        Assert(!late.Success && /renewal order has already been placed/.test(late.Message ?? ""), `a placed renewal is refused: ${late.Message}`);
      }),
  },
  {
    Id: "amount-change.AC5",
    Name: "AC5: inside authority, a reduction the uninvoiced instalments absorb is recorded, approved and applied",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const ack = await AcknowledgeAmendmentsWith(ctx);
        const { OrderID, Term, InstalmentIDs } = await bookByInstalment(ctx);
        await grantAuthority(ctx, 100_000, 1);
        const balanceBefore = await orderBalance(ctx, OrderID);
        const recognisedBefore = await recognised(ctx, Term.ID);

        const out = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 900, ...REASON, ReasonCategory: "Dispute" });
        Assert(out.Success, `recording failed: ${out.Message}`);
        AssertEqual(out.Status, "Approved", "inside authority, approved on save");
        await assertAmountApplied(ctx, { OrderID, Term, InstalmentIDs, Out: out, BalanceBefore: balanceBefore, RecognisedBefore: recognisedBefore });

        const task = await acknowledgmentOf(ctx, out.OrderConcessionID!);
        AssertEqual(task.Task.Status, "Open", "accounting's acknowledgment waits for them");
        Assert(task.Linked(Term.ID) && task.Linked(OrderID), "linked to the term and the order");
        Assert(task.Assigned(ack.HolderID), "assigned to the acknowledgment role's holder");
        Assert(!task.Assigned(ctx.User.ID), "and never to the requester");

        const next = await issue(ctx, InstalmentIDs[1]);
        Assert(next.Success, `the lowered instalment 2 still invoices: ${next.Message}`);
        const billed = await TxOne<{ Amount: number; Status: string }>(ctx,
          `SELECT Amount, Status FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE ID = '${InstalmentIDs[1]}'`);
        AssertEqual(billed.Status, "Invoiced", "at its lowered amount");
        AssertEqual(Number(billed.Amount), out.Instalments![0].NewAmount, "the amount it was lowered to");
      }),
  },
  {
    Id: "amount-change.AC6",
    Name: "AC6: a Pending amount change changes nothing until it is approved, then applies",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const ack = await AcknowledgeAmendmentsWith(ctx);
        const { OrderID, Term, InstalmentIDs } = await bookByInstalment(ctx);
        await grantAuthority(ctx, 1, 1);
        const rule = await ruleDecidedBy(ctx, ack.RoleID);
        const balanceBefore = await orderBalance(ctx, OrderID);
        const recognisedBefore = await recognised(ctx, Term.ID);
        const before = await footprint(ctx, OrderID, Term.ID);

        const out = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 900, ...REASON });
        Assert(out.Success, `recording failed: ${out.Message}`);
        AssertEqual(out.Status, "Pending", "outside authority it waits");
        const pending = await TxOne<{ Amount: number; ScheduleReduction: number | null }>(ctx,
          `SELECT st.Amount, c.ScheduleReduction FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
             JOIN ${ORDERS_SCHEMA}.OrderConcession c ON c.SubscriptionTermID = st.ID WHERE c.ID = '${out.OrderConcessionID}'`);
        AssertEqual(Number(pending.Amount), 1200, "a Pending change leaves the term's amount");
        AssertEqual(pending.ScheduleReduction, null, "and takes nothing off the schedule");
        AssertEqual(await footprint(ctx, OrderID, Term.ID).then((f) => f.split("|").filter((_, i) => i !== 1).join("|")),
          before.split("|").filter((_, i) => i !== 1).join("|"), "no entry or instalment moved");
        AssertEqual(await orderBalance(ctx, OrderID), balanceBefore, "nor the order's balance");

        await rule.handToRequester();
        const concession = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderConcessionEntity>(ORDER_CONCESSION_ENTITY, ctx.User);
        Assert(await concession.Load(out.OrderConcessionID!), "the concession reloads");
        concession.Status = "Approved";
        Assert(await concession.Save(), `approving failed: ${concession.LatestResult?.CompleteMessage}`);
        await assertAmountApplied(ctx, { OrderID, Term, InstalmentIDs, Out: out, BalanceBefore: balanceBefore, RecognisedBefore: recognisedBefore });
      }),
  },
  {
    Id: "amount-change.AC7",
    Name: "AC7: a credit on an invoice already sent is a credit memo: it credits the invoice, posts its entry and un-bills the line",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        const { OrderID, Term, InstalmentIDs } = await bookByInstalment(ctx);
        await grantAuthority(ctx, 100_000, 1);
        const balanceBefore = await orderBalance(ctx, OrderID);
        const recognisedBefore = await recognised(ctx, Term.ID);
        const billedBefore = await billedToDate(ctx, Term.OrderLineID);

        const out = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 1000, AppliesToInvoiceID: InstalmentIDs[0], ...REASON });
        Assert(out.Success, `recording failed: ${out.Message}`);
        AssertEqual(out.Status, "Approved", "inside authority, approved on save");
        const gross = Number(out.GrossReduction);
        AssertEqual(out.CreditMemo, gross, "instalment 1 still owes more than the reduction, so all of it is credited there");

        const memo = await assertCreditMemo(ctx, { OrderID, Out: out, Gross: gross });
        const rows = await scheduleOf(ctx, OrderID);
        AssertEqual(Number(rows[0].AmountCredited), gross, "instalment 1 is credited by the memo");
        AssertEqual(Number(rows[0].Amount), 300, "and keeps the amount on the invoice the customer holds");
        AssertEqual(Number(rows[0].Balance), money(300 - gross), "so it owes the memo less");
        Assert(rows.slice(1).every((r) => Number(r.Amount) === 300 && Number(r.AmountCredited) === 0), "the instalments still to come are untouched");
        AssertEqual(await orderBalance(ctx, OrderID), money(balanceBefore - gross), "the order owes the reduction and its tax less");
        AssertEqual(await billedToDate(ctx, Term.OrderLineID), money(billedBefore - memo.Net), "the line is billed the memo's net less");
        AssertEqual(await recognised(ctx, Term.ID), money(recognisedBefore - 200), "the term recognises 200 less in all");

        const next = await issue(ctx, InstalmentIDs[1]);
        Assert(next.Success, `the next instalment still invoices: ${next.Message}`);
      }),
  },
  {
    Id: "amount-change.AC8",
    Name: "AC8: billed as a whole, the reduction is a credit memo on the order and its balance falls by it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        const { OrderID, Term } = await bookWhole(ctx);
        await grantAuthority(ctx, 100_000, 1);
        const balanceBefore = await orderBalance(ctx, OrderID);
        const recognisedBefore = await recognised(ctx, Term.ID);
        const billedBefore = await billedToDate(ctx, Term.OrderLineID);

        const out = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 900, ...REASON });
        Assert(out.Success, `recording failed: ${out.Message}`);
        AssertEqual(out.Status, "Approved", "inside authority, approved on save");
        const gross = Number(out.GrossReduction);
        const memo = await assertCreditMemo(ctx, { OrderID, Out: out, Gross: gross });
        AssertEqual(memo.Net, 300, "the memo's net is the whole reduction");
        AssertEqual(await orderBalance(ctx, OrderID), money(balanceBefore - gross), "the order owes the reduction and its tax less");
        AssertEqual(await billedToDate(ctx, Term.OrderLineID), money(billedBefore - 300), "the line is billed 300 less");
        AssertEqual(await recognised(ctx, Term.ID), money(recognisedBefore - 300), "the term recognises 300 less in all");
        const term = await TxOne<{ Amount: number }>(ctx, `SELECT Amount FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE ID = '${Term.ID}'`);
        AssertEqual(Number(term.Amount), 900, "the term's amount is lowered");
      }),
  },
  {
    Id: "amount-change.AC9",
    Name: "AC9: a refund of a paid invoice's credit is recorded on that invoice and paid with Orders.RefundPayment",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        const { OrderID, Term, InstalmentIDs } = await bookByInstalment(ctx);
        await grantAuthority(ctx, 100_000, 1);
        const paid = await pay(ctx, OrderID, 300, InstalmentIDs[0]);
        Assert(paid.Saved, `paying instalment 1 failed: ${paid.Message}`);
        const balanceBefore = await orderBalance(ctx, OrderID);

        const out = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 1000, AppliesToInvoiceID: InstalmentIDs[0], RefundRequested: true, ...REASON });
        Assert(out.Success, `recording failed: ${out.Message}`);
        AssertEqual(out.Status, "Approved", "inside authority, approved on save");
        const gross = Number(out.GrossReduction);
        AssertEqual(out.Refund, gross, "all of it is refunded");
        AssertEqual(out.Instalments?.length ?? 0, 0, "and nothing comes off the next instalment");
        await assertCreditMemo(ctx, { OrderID, Out: out, Gross: gross });
        let rows = await scheduleOf(ctx, OrderID);
        AssertEqual(Number(rows[0].AmountCredited), gross, "the paid invoice is credited");
        AssertEqual(Number(rows[0].Balance), money(-gross), "so it is overpaid by the refund owed");
        AssertEqual(await orderBalance(ctx, OrderID), money(balanceBefore - gross), "and the order owes that much less");

        const task = await acknowledgmentOf(ctx, out.OrderConcessionID!);
        Assert(/Orders\.RefundPayment/.test(String(task.Task.Description ?? "")), "the acknowledgment task tells finance to pay the refund");

        const refunded = await run<{ Success: boolean; Message?: string }>(ctx, "Orders.RefundPayment", {
          PaymentHeaderID: paid.Payment.ID,
          Amount: gross,
          Reason: "amount change refund",
        });
        Assert(refunded.Success, `the refund failed: ${refunded.Message}`);
        rows = await scheduleOf(ctx, OrderID);
        AssertEqual(Number(rows[0].Balance), 0, "once refunded, the invoice is settled");
        AssertEqual(await orderBalance(ctx, OrderID), balanceBefore, "and the order is back where the payment left it");
      }),
  },
  {
    Id: "amount-change.AC10",
    Name: "AC10: two lines on one schedule, one lowered: the later instalments bill each line what it has left",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // #681. Two 600 memberships in four 300 instalments; instalment 1 billed 150 of each. Line A lowered
        // to 375 takes 225 off instalments 2 to 4. Slicing instalment 1 again against A's lowered 375 billed A
        // 259.62 and B 415.38 of the rest, so A ended at 409.62 and B at 565.38.
        await AcknowledgeAmendmentsWith(ctx);
        const { Terms, InstalmentIDs } = await bookByInstalment(ctx, [600, 600]);
        await grantAuthority(ctx, 100_000, 1);
        const [lineA, lineB] = Terms.map((t) => t.OrderLineID);
        AssertEqual(`${await billedToDate(ctx, lineA)}/${await billedToDate(ctx, lineB)}`, "150/150", "instalment 1 billed each line half its row");

        const out = await amend(ctx, { SubscriptionTermID: Terms[0].ID, NewAmount: 375, ...REASON, ReasonCategory: "Dispute" });
        Assert(out.Success, `recording failed: ${out.Message}`);
        AssertEqual(out.Status, "Approved", "inside authority, approved on save");
        AssertEqual(out.GrossReduction, 225, "the whole reduction comes off the instalments not yet invoiced");

        for (const id of InstalmentIDs.slice(1)) {
          const issued = await issue(ctx, id);
          Assert(issued.Success, `the lowered instalment must invoice: ${issued.Message}`);
        }
        AssertEqual(await billedToDate(ctx, lineA), 375, "line A ends billed its lowered 375");
        AssertEqual(await billedToDate(ctx, lineB), 600, "line B ends billed its 600");
      }),
  },
];

/** The order's balance, as the rollup keeps it. */
async function orderBalance(ctx: IntegrationCheckContext, orderID: string): Promise<number> {
  const row = await TxOne<{ Balance: number }>(ctx, `SELECT Balance FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`);
  return money(Number(row.Balance));
}

/** What the term's recognition entries recognise in all, offsets and catch-up included. */
async function recognised(ctx: IntegrationCheckContext, termID: string): Promise<number> {
  return money((await staged(ctx, termID)).reduce((s, e) => s + Number(e.Net), 0));
}

/** The term, instalments, balance, recognition, event and concession after an applied 1,200 → 900 change. */
async function assertAmountApplied(
  ctx: IntegrationCheckContext,
  a: { OrderID: string; Term: Term; InstalmentIDs: string[]; Out: AmendOutput; BalanceBefore: number; RecognisedBefore: number },
) {
  const term = await TxOne<{ Amount: number }>(ctx, `SELECT Amount FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE ID = '${a.Term.ID}'`);
  AssertEqual(Number(term.Amount), 900, "the term's amount is lowered");

  const rows = await TxQuery<{ ID: string; Amount: number; Status: string }>(ctx,
    `SELECT ID, Amount, Status FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${a.OrderID}' ORDER BY InstallmentNumber`);
  AssertEqual(Number(rows[0].Amount), 300, "the invoiced instalment is untouched");
  for (const change of a.Out.Instalments ?? []) {
    const row = rows.find((r) => r.ID.toLowerCase() === String(change.InstalmentID).toLowerCase());
    Assert(row != null, `instalment ${change.InstallmentNumber} is on the order`);
    AssertEqual(Number(row!.Amount), change.NewAmount, `instalment ${change.InstallmentNumber} is lowered as planned`);
  }

  const gross = Number(a.Out.GrossReduction);
  const concession = await TxOne<{ Status: string; NewAmount: number; ScheduleReduction: number }>(ctx,
    `SELECT Status, NewAmount, ScheduleReduction FROM ${ORDERS_SCHEMA}.OrderConcession WHERE ID = '${a.Out.OrderConcessionID}'`);
  AssertEqual(concession.Status, "Approved", "the concession is approved");
  AssertEqual(Number(concession.ScheduleReduction), gross, "and records what it took off the instalments");
  AssertEqual(await orderBalance(ctx, a.OrderID), money(a.BalanceBefore - gross), "the order owes the reduction and its tax less");

  AssertEqual(await recognised(ctx, a.Term.ID), money(a.RecognisedBefore - 300), "the term now recognises 300 less in all — nothing twice");
  const catchUp = await TxQuery<{ ID: string }>(ctx,
    `SELECT ID FROM ${ACCT_SCHEMA}.JournalEntry WHERE LinkedRecordID = '${a.Term.ID}' AND Description LIKE 'Catch-up:%'`);
  AssertEqual(catchUp.length, Number(a.Out.CatchUp) > 0 ? 1 : 0, "one catch-up entry when anything was earned");

  const event = await TxQuery<{ ID: string }>(ctx,
    `SELECT ID FROM ${ORDERS_SCHEMA}.SubscriptionEvent WHERE SubscriptionID = '${a.Term.SubscriptionID}' AND EventType = 'AmountChanged'`);
  AssertEqual(event.length, 1, "the change is logged on the subscription");
}

/** The line's BilledToDate. */
async function billedToDate(ctx: IntegrationCheckContext, lineID: string): Promise<number> {
  const row = await TxOne<{ BilledToDate: number | null }>(ctx, `SELECT BilledToDate FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${lineID}'`);
  return money(Number(row.BilledToDate ?? 0));
}

async function scheduleOf(ctx: IntegrationCheckContext, orderID: string) {
  return TxQuery<{ ID: string; Amount: number; AmountCredited: number; AmountPaid: number; Balance: number; Status: string }>(ctx,
    `SELECT ID, Amount, AmountCredited, AmountPaid, Balance, Status FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule
      WHERE OrderHeaderID = '${orderID}' ORDER BY InstallmentNumber`);
}

/** The concession carries the memo and its number, and the memo's entry balances: deferred and tax against AR. */
async function assertCreditMemo(ctx: IntegrationCheckContext, a: { OrderID: string; Out: AmendOutput; Gross: number }) {
  const concession = await TxOne<{ CreditMemoAmount: number; CreditMemoNumber: string; ScheduleReduction: number | null; OrderNumber: string }>(ctx,
    `SELECT c.CreditMemoAmount, c.CreditMemoNumber, c.ScheduleReduction, o.OrderNumber
       FROM ${ORDERS_SCHEMA}.OrderConcession c JOIN ${ORDERS_SCHEMA}.OrderHeader o ON o.ID = c.OrderHeaderID
      WHERE c.ID = '${a.Out.OrderConcessionID}'`);
  AssertEqual(Number(concession.CreditMemoAmount), a.Gross, "the concession carries the credit memo");
  AssertEqual(concession.CreditMemoNumber, `${concession.OrderNumber}-CM1`, "numbered after its order");
  AssertEqual(concession.ScheduleReduction, null, "nothing came off the instalments");
  const lines = await TxQuery<{ Account: string; Debit: number; Credit: number }>(ctx,
    `SELECT a.Name AS Account, ISNULL(l.DebitAmount, 0) AS Debit, ISNULL(l.CreditAmount, 0) AS Credit
       FROM ${ACCT_SCHEMA}.JournalEntry je
       JOIN ${ACCT_SCHEMA}.JournalEntryLine l ON l.JournalEntryID = je.ID
       JOIN ${ACCT_SCHEMA}.GLAccount a ON a.ID = l.GLAccountID
      WHERE je.Description LIKE 'Credit memo ${concession.CreditMemoNumber}:%'`);
  Assert(lines.length >= 2, `the memo's entry was posted: ${lines.length} lines`);
  AssertEqual(money(lines.reduce((s, l) => s + Number(l.Debit), 0)), a.Gross, "its debits are the memo");
  AssertEqual(money(lines.reduce((s, l) => s + Number(l.Credit), 0)), a.Gross, "and so are its credits");
  const deferred = money(lines.filter((l) => /Deferred/.test(l.Account)).reduce((s, l) => s + Number(l.Debit), 0));
  Assert(deferred > 0, "deferred revenue is debited");
  return { Net: deferred };
}

interface AmendOutput {
  Success: boolean;
  Message?: string;
  OrderConcessionID?: string;
  Status?: string;
  Value?: number;
  CurrentAmount?: number;
  NewAmount?: number;
  TaxReduction?: number;
  GrossReduction?: number;
  CatchUp?: number;
  Respread?: number;
  Offsets?: Array<{ EffectiveDate: string; Amount: number }>;
  NewSchedule?: Array<{ EffectiveDate: string; Amount: number }>;
  Instalments?: Array<{ InstalmentID: string; InstallmentNumber: number; CurrentAmount: number; NewAmount: number }>;
  CreditMemo?: number;
  CreditApplied?: Array<{ InstalmentID: string | null; DocumentNumber: string | null; Amount: number }>;
  Refund?: number;
  OpenCredit?: number;
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

for (const check of AmountChangeChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("amount-change", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: async (ctx) => {
    OrdersSettings.SetOverride(ORDERS_SETTING.AmendmentAcknowledgmentRole, undefined);
    await TeardownOrdersFixture(ctx);
  },
});
