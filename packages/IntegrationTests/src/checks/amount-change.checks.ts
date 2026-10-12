/**
 * amount-change — previewing a lower amount on a booked term (#506, bc-aidp-next-golive#221 case A).
 *
 * `Orders.AmendArrangement` with `NewAmount` and `Preview` plans the change against the real ledger and schedule:
 * the share of the reduction already earned is taken back at once, the staged slices from today on are offset and
 * what is left is re-spread, and the reduction comes off the instalments not yet invoiced before any document is
 * credited. It writes nothing; recording one is refused until its application exists.
 *
 *   AC1   an order billed as a whole: the order is credited; the recognition plan foots; nothing is written
 *   AC2   an order billed by instalment: the reduction comes off the uninvoiced instalments, with no document
 *   AC3   "applies to invoice" credits that invoice first; an uninvoiced instalment is refused as the target
 *   AC4   refusals: an increase, a placed renewal, no acknowledgment role, and recording rather than previewing
 *
 * The checks run on today's date, so how much is already earned depends on the day: they assert the plan's
 * arithmetic against the term's own staged entries rather than fixed figures.
 *
 * CONNECTS TO:
 *   CODE: AmendArrangementOperation · AmountChange · AmountChangePlan
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
import type { OrderHeaderEntity } from "@mj-biz-apps/orders-entities";
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
import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY } from "../entity-names.js";
import { BuildOrder, ConfirmOrder } from "../order-builder.js";

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

/**
 * A 1,200 annual membership dated 100 days ago and billed in four instalments of 300: the first due on the order
 * date, so confirm invoices it, and the other three still to come.
 */
async function bookByInstalment(ctx: IntegrationCheckContext) {
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
    Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200 }],
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
      Amount: 300,
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
  return { OrderID: orderID, Term: await termOf(ctx, orderID), InstalmentIDs: ids };
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
    Name: "AC4: an increase, a placed renewal, no acknowledgment role and recording are refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await AcknowledgeAmendmentsWith(ctx);
        const { OrderID, Term } = await bookWhole(ctx);
        const before = await footprint(ctx, OrderID, Term.ID);

        const up = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 1500, Preview: true, ...REASON });
        Assert(!up.Success && /lower than the current/.test(up.Message ?? ""), `an increase is refused: ${up.Message}`);

        const record = await amend(ctx, { SubscriptionTermID: Term.ID, NewAmount: 900, ...REASON });
        Assert(!record.Success && /not available yet/.test(record.Message ?? ""), `recording is refused for now: ${record.Message}`);
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
];

interface AmendOutput {
  Success: boolean;
  Message?: string;
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
