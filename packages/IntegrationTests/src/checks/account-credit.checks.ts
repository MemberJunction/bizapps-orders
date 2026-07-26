/**
 * account-credit — the allocation invariant, over-payment, and spending a credit (D68).
 *
 * WHAT THIS BUNDLE IS ABOUT
 * A payment's `Amount` must equal the sum of its allocations. That one rule removes "unapplied
 * cash" as a concept: every dollar received lands on an order, and allocating MORE than an order is
 * worth simply drives that order's balance negative — which IS the customer's credit, spendable on
 * another order through the Account Credit tender.
 *
 * WHY THESE CHECKS EARN THEIR KEEP
 * Two of the behaviours here were previously WRONG in ways nothing detected:
 *   - Over-application was refused outright, so a customer who over-paid could not be recorded at
 *     all while the money sat in the bank. `payment-ledger` PL8 asserted that refusal as correct.
 *   - Nothing checked the payment side of an allocation, so $5,000 could be spread across five
 *     orders from a $1,000 payment: each application passed its own order-level check, and the sum
 *     was never examined. Every one of those allocations booked cash into the ledger.
 *
 * AC7 and AC8 are the ones to keep honest — a credit spent ACROSS companies is where this meets the
 * intercompany machinery, and where a plausible-looking implementation would still balance while
 * putting the money on the wrong entity's books.
 *
 * CONNECTS TO:
 *   CODE:  PaymentHeaderEntityServer (the invariant) · ApplyAccountCreditOperation (the tender)
 *   DOC:   plans/bizapps-orders-master.md D68
 */
import { randomUUID } from "crypto";
import { BaseRemotableOperation } from "@memberjunction/core";
import { MJGlobal } from "@memberjunction/global";
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
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { ConfirmOrder } from "../order-builder.js";
import { ApplyPayment, CreatePayment, CapturePayment } from "../payment-builder.js";

const CASH_CODE = "10100";
const AR_CODE = "11201";
const DUE_TO_CODE = "21900";
const DUE_FROM_CODE = "11900";

interface CreditOutput {
  Success: boolean;
  Message?: string;
  AppliedAmount?: number;
  RemainingCredit?: number;
  TargetBalanceAfter?: number;
  PaymentHeaderID?: string;
}

interface RefundOutput {
  Success: boolean;
  Message?: string;
  RefundPaymentHeaderID?: string;
}

interface EntryLine {
  Code: string;
  DebitAmount: number;
  CreditAmount: number;
  CompanyID: string;
  EntryID: string;
}

/** Every ledger line produced by a payment's allocations, tagged with the owning company. */
const allocationLines = (ctx: IntegrationCheckContext, paymentID: string) =>
  TxQuery<EntryLine>(
    ctx,
    `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount, gl.CompanyID, je.ID AS EntryID
       FROM ${ORDERS_SCHEMA}.PaymentLine pl
       JOIN ${ACCT_SCHEMA}.JournalEntry je
         ON je.LinkedRecordID = CAST(pl.ID AS NVARCHAR(400))
       JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
       JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
      WHERE pl.PaymentHeaderID = '${paymentID}'`,
  );

/** Net movement on one company's account across a set of ledger lines. */
const netFor = (lines: EntryLine[], companyID: string, code: string): number =>
  lines
    .filter((l) => l.Code === code && l.CompanyID.toLowerCase() === companyID.toLowerCase())
    .reduce((s, l) => s + Number(l.DebitAmount ?? 0) - Number(l.CreditAmount ?? 0), 0);

const entryCount = (lines: EntryLine[]): number =>
  new Set(lines.map((l) => l.EntryID.toLowerCase())).size;

/** Confirm a single-company order for `amount` against Co A. */
async function confirmOrder(ctx: IntegrationCheckContext, amount: number) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: amount }],
  });
  Assert(result.Saved, `confirm failed: ${result.Message}`);
  return result;
}

/** Confirm an order whose lines belong to DIFFERENT companies. */
async function confirmMultiCompanyOrder(
  ctx: IntegrationCheckContext,
  lines: Array<[string, number]>,
) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: lines.map(([product, price]) => ({
      ProductID: f.Products[product],
      Quantity: 1,
      UnitPrice: price,
    })),
  });
  Assert(result.Saved, `confirm failed: ${result.Message}`);
  return result;
}

/** Capture cash to Co A, allocating `allocation` (default: the full amount) to one order. */
async function payToCoA(
  ctx: IntegrationCheckContext,
  orderID: string,
  amount: number,
  allocation?: number,
) {
  const f = Fx();
  const cash = f.PaymentTypeIDs.get("Cash");
  Assert(cash != null, "PaymentType 'Cash' missing — push the orders app metadata");
  return CreatePayment(ctx.User, {
    PaymentNumber: `AC-${randomUUID().slice(0, 8).toUpperCase()}`,
    ReceivingCompanyID: f.CoA.ID,
    PaymentTypeID: cash!,
    Amount: amount,
    Allocations: [{ OrderHeaderID: orderID, Amount: allocation ?? amount }],
  });
}

const orderRow = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ Balance: number; AmountPaid: number; TotalGross: number; PaymentStatus: string }>(
    ctx,
    `SELECT Balance, AmountPaid, TotalGross, PaymentStatus
       FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${orderID}'`,
  );

/** Run Orders.ApplyAccountCredit through the remote-operation seam. */
async function applyCredit(
  ctx: IntegrationCheckContext,
  sourceOrderID: string,
  targetOrderID: string,
  amount?: number,
): Promise<CreditOutput> {
  const op = MJGlobal.Instance.ClassFactory.CreateInstance<
    BaseRemotableOperation<Record<string, unknown>, CreditOutput>
  >(BaseRemotableOperation, "Orders.ApplyAccountCredit");
  Assert(op != null, "'Orders.ApplyAccountCredit' is not registered");
  const result = await op!.Execute(
    { SourceOrderHeaderID: sourceOrderID, TargetOrderHeaderID: targetOrderID, Amount: amount },
    { provider: ctx.Provider, user: ctx.User },
  );
  // `Execute` reports whether the OPERATION ran; the business outcome is inside Output. A refusal
  // is a successful run returning Success:false, so conflating the two would make every guard
  // check pass for the wrong reason.
  Assert(result.Success, `the operation did not execute: ${result.ErrorMessage ?? "unknown"}`);
  return result.Output as CreditOutput;
}

/** Provision intercompany accounts + ordered pairs, as intercompany.checks.ts does. */
async function CreateAccountCreditFixture(ctx: IntegrationCheckContext): Promise<void> {
  await CreateOrdersFixture(ctx);
  const f = Fx();
  for (const co of [f.CoA, f.CoB, f.CoC]) {
    await TxQuery(ctx,
      `IF NOT EXISTS (SELECT 1 FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID='${co.ID}' AND Code='${DUE_TO_CODE}')
         INSERT INTO ${ACCT_SCHEMA}.GLAccount (ID, CompanyID, Code, Name, AccountType, IsActive)
         VALUES ('${randomUUID()}','${co.ID}','${DUE_TO_CODE}','Due To Affiliates','Liability',1);
       IF NOT EXISTS (SELECT 1 FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID='${co.ID}' AND Code='${DUE_FROM_CODE}')
         INSERT INTO ${ACCT_SCHEMA}.GLAccount (ID, CompanyID, Code, Name, AccountType, IsActive)
         VALUES ('${randomUUID()}','${co.ID}','${DUE_FROM_CODE}','Due From Affiliates','Asset',1);`,
    );
  }
  const pairs: Array<[string, string]> = [
    [f.CoA.ID, f.CoB.ID],
    [f.CoB.ID, f.CoA.ID],
  ];
  for (const [source, target] of pairs) {
    await TxQuery(ctx,
      `IF NOT EXISTS (
         SELECT 1 FROM ${ACCT_SCHEMA}.IntercompanyAccountMatch
         WHERE SourceCompanyID='${source}' AND TargetCompanyID='${target}' AND Status='Active')
       INSERT INTO ${ACCT_SCHEMA}.IntercompanyAccountMatch
         (ID, SourceCompanyID, TargetCompanyID, DueToGLAccountID, DueFromGLAccountID, Status)
       SELECT '${randomUUID()}', '${source}', '${target}',
              (SELECT ID FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID='${source}' AND Code='${DUE_TO_CODE}'),
              (SELECT ID FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID='${target}' AND Code='${DUE_FROM_CODE}'),
              'Active';`,
    );
  }
  const { AccountingEngineBase } = await import("@mj-biz-apps/accounting-engine-base");
  await AccountingEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
}

async function TeardownAccountCreditFixture(ctx: IntegrationCheckContext): Promise<void> {
  const f = Fx();
  const ids = [f.CoA.ID, f.CoB.ID, f.CoC.ID].map((c) => `'${c}'`).join(",");
  try {
    await TxQuery(ctx,
      `DELETE FROM ${ACCT_SCHEMA}.IntercompanyAccountMatch
         WHERE SourceCompanyID IN (${ids}) OR TargetCompanyID IN (${ids});`,
    );
  } catch {
    // Best-effort — the shared teardown removes the companies and their accounts anyway.
  }
  await TeardownOrdersFixture(ctx);
}

export const AccountCreditChecks: NamedCheck[] = [
  // ── the invariant ───────────────────────────────────────────────────────────
  {
    Id: "account-credit.AC1",
    Name: "AC1: capturing a payment whose allocations fall short is REFUSED",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await confirmOrder(ctx, 1000);
        // 1000 arrived; only 600 is allocated. Before D68 this saved happily and the missing 400
        // existed nowhere in the ledger — the gap that made "unapplied cash" seem necessary.
        const result = await payToCoA(ctx, order.Order.ID as string, 1000, 600);
        Assert(!result.Saved, "a payment whose lines do not sum to its Amount must be refused");
        Assert(
          /unaccounted for/i.test(result.Message),
          `the refusal should name the shortfall, got: ${result.Message}`,
        );
      }),
  },
  {
    Id: "account-credit.AC2",
    Name: "AC2: over-allocating a payment beyond its Amount is REFUSED",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const o1 = await confirmOrder(ctx, 1000);
        const o2 = await confirmOrder(ctx, 1000);
        const cash = f.PaymentTypeIDs.get("Cash")!;
        // The bug this closes: each allocation passed its own order-level check, and nothing ever
        // compared the SUM to the payment. 1000 could be spread as 5000 across five orders.
        const result = await CreatePayment(ctx.User, {
          PaymentNumber: `AC-${randomUUID().slice(0, 8).toUpperCase()}`,
          ReceivingCompanyID: f.CoA.ID,
          PaymentTypeID: cash,
          Amount: 1000,
          Allocations: [
            { OrderHeaderID: o1.Order.ID as string, Amount: 800 },
            { OrderHeaderID: o2.Order.ID as string, Amount: 800 },
          ],
        });
        Assert(!result.Saved, "allocating 1600 of a 1000 payment must be refused");
      }),
  },
  {
    Id: "account-credit.AC3",
    Name: "AC3: a PENDING payment may sit half-allocated; capture is what enforces the invariant",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await confirmOrder(ctx, 1000);
        const cash = f.PaymentTypeIDs.get("Cash")!;

        // A draft, exactly as a Draft order may have no lines yet. Locking on SAVE rather than on
        // the status transition would make an ordinary typo permanent.
        const draft = await CreatePayment(ctx.User, {
          PaymentNumber: `AC-${randomUUID().slice(0, 8).toUpperCase()}`,
          ReceivingCompanyID: f.CoA.ID,
          PaymentTypeID: cash,
          Amount: 1000,
          Status: "Pending",
        });
        Assert(draft.Saved, `a pending payment with no allocations must save: ${draft.Message}`);

        const partial = await ApplyPayment(
          ctx.User,
          draft.Payment.ID as string,
          order.Order.ID as string,
          600,
        );
        Assert(partial.Saved, `allocating part of a draft must be allowed: ${partial.Message}`);

        const tooEarly = await CapturePayment(ctx.User, draft.Payment.ID as string);
        Assert(!tooEarly.Saved, "capturing while 400 is unallocated must be refused");

        const rest = await ApplyPayment(
          ctx.User,
          draft.Payment.ID as string,
          order.Order.ID as string,
          400,
        );
        Assert(rest.Saved, `allocating the remainder must be allowed: ${rest.Message}`);

        const captured = await CapturePayment(ctx.User, draft.Payment.ID as string);
        Assert(captured.Saved, `capture must succeed once the lines agree: ${captured.Message}`);
      }),
  },

  // ── over-payment produces a credit ──────────────────────────────────────────
  {
    Id: "account-credit.AC4",
    Name: "AC4: over-paying leaves a negative balance and books the full cash",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await confirmOrder(ctx, 900);
        const paid = await payToCoA(ctx, order.Order.ID as string, 1000);
        Assert(paid.Saved, `an over-payment must be recordable: ${paid.Message}`);

        const row = await orderRow(ctx, order.Order.ID as string);
        AssertEqual(Number(row.AmountPaid), 1000, "all 1000 is applied");
        AssertEqual(Number(row.Balance), -100, "the 100 surplus IS the credit");

        // Cash is complete BY CONSTRUCTION now: the allocation sums to the payment, so the ledger
        // cannot understate the bank the way it did when the surplus went unallocated.
        const lines = await allocationLines(ctx, paid.Payment.ID as string);
        AssertEqual(netFor(lines, f.CoA.ID, CASH_CODE), 1000, "Cash is debited the full 1000");
        AssertEqual(
          netFor(lines, f.CoA.ID, AR_CODE),
          -1000,
          "A/R is credited 1000 — 900 clears the receivable, 100 leaves it in credit",
        );
      }),
  },

  // ── spending the credit ─────────────────────────────────────────────────────
  {
    Id: "account-credit.AC5",
    Name: "AC5: a credit settles another order and moves A/R without touching cash",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const credit = await confirmOrder(ctx, 900);
        await payToCoA(ctx, credit.Order.ID as string, 1000);
        const target = await confirmOrder(ctx, 250);

        const res = await applyCredit(
          ctx,
          credit.Order.ID as string,
          target.Order.ID as string,
          100,
        );
        Assert(res.Success, `applying the credit failed: ${res.Message}`);
        AssertEqual(Number(res.AppliedAmount), 100, "100 of credit was applied");

        const source = await orderRow(ctx, credit.Order.ID as string);
        AssertEqual(Number(source.Balance), 0, "the source order's credit is consumed");
        const after = await orderRow(ctx, target.Order.ID as string);
        AssertEqual(Number(after.Balance), 150, "the target order's balance drops by 100");

        // NO CASH MOVES. The two legs' cash entries offset, which is the whole point: this
        // re-attributes money already received rather than receiving more.
        const lines = await allocationLines(ctx, res.PaymentHeaderID as string);
        AssertEqual(netFor(lines, f.CoA.ID, CASH_CODE), 0, "cash nets to zero across the transfer");
        AssertEqual(netFor(lines, f.CoA.ID, AR_CODE), 0, "A/R nets to zero within one company");
        AssertEqual(entryCount(lines), 2, "one entry per leg");
      }),
  },
  {
    Id: "account-credit.AC6",
    Name: "AC6: a credit cannot be over-drawn, and an order with no credit has nothing to give",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const credit = await confirmOrder(ctx, 900);
        await payToCoA(ctx, credit.Order.ID as string, 1000);
        const target = await confirmOrder(ctx, 500);

        const tooMuch = await applyCredit(
          ctx,
          credit.Order.ID as string,
          target.Order.ID as string,
          250,
        );
        Assert(!tooMuch.Success, "drawing 250 from a 100 credit must be refused");
        Assert(
          /only has 100/i.test(tooMuch.Message ?? ""),
          `the refusal should name what is available, got: ${tooMuch.Message}`,
        );

        // An ordinary settled order holds no credit — its balance is zero, not negative.
        const settled = await confirmOrder(ctx, 300);
        await payToCoA(ctx, settled.Order.ID as string, 300);
        const none = await applyCredit(
          ctx,
          settled.Order.ID as string,
          target.Order.ID as string,
          50,
        );
        Assert(!none.Success, "an order with no credit cannot fund another");
        Assert(
          /no credit to spend/i.test(none.Message ?? ""),
          `the refusal should explain, got: ${none.Message}`,
        );
      }),
  },

  // ── the case that meets the intercompany machinery ──────────────────────────
  {
    Id: "account-credit.AC7",
    Name: "AC7: a credit spent ACROSS companies raises intercompany legs on both sides",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // The credit sits on a Co A order; the target order is entirely Co B's product. Settling it
        // with Co A's credit means Co A's receivable funds Co B's — which cannot be one journal
        // entry, because a single entry may not span companies (D6).
        const credit = await confirmOrder(ctx, 900);
        await payToCoA(ctx, credit.Order.ID as string, 1000);

        const target = await confirmMultiCompanyOrder(ctx, [["WidgetB", 400]]);
        const res = await applyCredit(
          ctx,
          credit.Order.ID as string,
          target.Order.ID as string,
          100,
        );
        Assert(res.Success, `cross-company credit failed: ${res.Message}`);

        const lines = await allocationLines(ctx, res.PaymentHeaderID as string);
        AssertEqual(
          netFor(lines, f.CoA.ID, CASH_CODE),
          0,
          "no cash moves — this only re-attributes money already held",
        );
        // Co A gives up 100 of receivable and owes Co B for it; Co B's receivable clears against
        // what it is now owed by Co A. A pair that balanced but sat on the wrong companies would
        // still post — which is exactly why this is asserted per company.
        AssertEqual(
          netFor(lines, f.CoA.ID, AR_CODE),
          100,
          "Co A's receivable comes BACK (its credit is being spent elsewhere)",
        );
        AssertEqual(
          netFor(lines, f.CoB.ID, AR_CODE),
          -100,
          "Co B's receivable is cleared by the credit",
        );
        AssertEqual(
          netFor(lines, f.CoA.ID, DUE_TO_CODE),
          -100,
          "Co A owes Co B the 100 it applied on its behalf",
        );
        AssertEqual(
          netFor(lines, f.CoB.ID, DUE_FROM_CODE),
          100,
          "Co B is owed that 100 by Co A",
        );
      }),
  },
  {
    Id: "account-credit.AC8",
    Name: "AC8: every entry of a cross-company credit balances on its own",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const credit = await confirmOrder(ctx, 900);
        await payToCoA(ctx, credit.Order.ID as string, 1000);
        const target = await confirmMultiCompanyOrder(ctx, [["WidgetB", 400]]);
        const res = await applyCredit(
          ctx,
          credit.Order.ID as string,
          target.Order.ID as string,
          100,
        );
        Assert(res.Success, `cross-company credit failed: ${res.Message}`);

        // Per ENTRY, not in aggregate: a set of entries can net to zero while individual ones are
        // unbalanced, and accounting would reject those at lock time rather than here.
        const rows = await TxQuery<{ EntryID: string; Dr: number; Cr: number }>(
          ctx,
          `SELECT je.ID AS EntryID,
                  SUM(ISNULL(jel.DebitAmount,0))  AS Dr,
                  SUM(ISNULL(jel.CreditAmount,0)) AS Cr
             FROM ${ORDERS_SCHEMA}.PaymentLine pl
             JOIN ${ACCT_SCHEMA}.JournalEntry je
               ON je.LinkedRecordID = CAST(pl.ID AS NVARCHAR(400))
             JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
            WHERE pl.PaymentHeaderID = '${res.PaymentHeaderID}'
            GROUP BY je.ID`,
        );
        Assert(rows.length >= 2, `expected at least two entries, got ${rows.length}`);
        for (const r of rows) {
          AssertEqual(
            Number(r.Dr),
            Number(r.Cr),
            `entry ${r.EntryID} must balance on its own (Dr ${r.Dr} vs Cr ${r.Cr})`,
          );
        }
      }),
  },

  // ── immutability after capture ──────────────────────────────────────────────
  {
    Id: "account-credit.AC9",
    Name: "AC9: a captured payment's allocations are frozen",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await confirmOrder(ctx, 500);
        const paid = await payToCoA(ctx, order.Order.ID as string, 500);
        Assert(paid.Saved, `capture failed: ${paid.Message}`);

        const line = await TxOne<{ ID: string }>(
          ctx,
          `SELECT TOP 1 ID FROM ${ORDERS_SCHEMA}.PaymentLine WHERE PaymentHeaderID='${paid.Payment.ID}'`,
        );

        // Raw SQL on purpose: the trigger is the floor that holds even when the entity layer is
        // bypassed, which is the only reason to put it in the database at all.
        //
        // ONE attempt per check. The trigger enforces itself with ROLLBACK TRANSACTION, which aborts
        // the check's own ambient transaction along with it — so a second attempt in the same check
        // would fail with "transaction has been aborted" rather than with the trigger's message, and
        // would look like a pass for entirely the wrong reason. The DELETE case is AC11.
        let refused = false;
        try {
          await TxQuery(ctx,
            `UPDATE ${ORDERS_SCHEMA}.PaymentLine SET Amount = 9999 WHERE ID='${line.ID}'`,
          );
        } catch (e) {
          refused = /frozen once the payment is Captured/i.test(String(e));
        }
        Assert(refused, "editing a captured payment's allocation must be refused by the DB");
      }),
  },
  {
    Id: "account-credit.AC11",
    Name: "AC11: a captured payment's allocation cannot be deleted",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await confirmOrder(ctx, 500);
        const paid = await payToCoA(ctx, order.Order.ID as string, 500);
        Assert(paid.Saved, `capture failed: ${paid.Message}`);

        const line = await TxOne<{ ID: string }>(
          ctx,
          `SELECT TOP 1 ID FROM ${ORDERS_SCHEMA}.PaymentLine WHERE PaymentHeaderID='${paid.Payment.ID}'`,
        );

        let refused = false;
        try {
          await TxQuery(ctx, `DELETE FROM ${ORDERS_SCHEMA}.PaymentLine WHERE ID='${line.ID}'`);
        } catch (e) {
          refused = /cannot be deleted once its payment is Captured/i.test(String(e));
        }
        Assert(refused, "deleting a captured payment's allocation must be refused by the DB");
      }),
  },
  {
    Id: "account-credit.AC10",
    Name: "AC10: a refund still reconciles under the invariant (Amount positive, lines negative)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await confirmOrder(ctx, 400);
        const paid = await payToCoA(ctx, order.Order.ID as string, 400);
        Assert(paid.Saved, `capture failed: ${paid.Message}`);

        // A refund stores Amount as a positive magnitude while its lines are negative, so the
        // invariant has to be direction-aware. Getting that wrong would fail every refund — or,
        // worse, pass by comparing magnitudes and let a genuinely inconsistent one through.
        const op = MJGlobal.Instance.ClassFactory.CreateInstance<
          BaseRemotableOperation<Record<string, unknown>, RefundOutput>
        >(BaseRemotableOperation, "Orders.RefundPayment");
        Assert(op != null, "'Orders.RefundPayment' is not registered");
        const result = await op!.Execute(
          { PaymentHeaderID: paid.Payment.ID, Amount: 150 },
          { provider: ctx.Provider, user: ctx.User },
        );
        Assert(result.Success, `refund did not execute: ${result.ErrorMessage ?? "unknown"}`);
        const res = result.Output as RefundOutput;
        Assert(res.Success, `refund failed: ${res.Message}`);

        const sums = await TxOne<{ Amount: number; Allocated: number }>(
          ctx,
          `SELECT p.Amount,
                  (SELECT ISNULL(SUM(Amount),0) FROM ${ORDERS_SCHEMA}.PaymentLine
                    WHERE PaymentHeaderID = p.ID) AS Allocated
             FROM ${ORDERS_SCHEMA}.PaymentHeader p WHERE p.ID='${res.RefundPaymentHeaderID}'`,
        );
        AssertEqual(Number(sums.Amount), 150, "the refund records 150 as its magnitude");
        AssertEqual(
          Number(sums.Allocated),
          -150,
          "its allocations are NEGATIVE 150 — the invariant is signed, not absolute",
        );

        const row = await orderRow(ctx, order.Order.ID as string);
        AssertEqual(Number(row.Balance), 150, "the order's balance reopens by the refunded amount");
      }),
  },
];

for (const check of AccountCreditChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("account-credit", {
  Setup: CreateAccountCreditFixture,
  Teardown: TeardownAccountCreditFixture,
});
