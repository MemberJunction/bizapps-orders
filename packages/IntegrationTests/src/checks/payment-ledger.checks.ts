/**
 * payment-ledger.checks.ts — the `payment-ledger` bundle (PL1–PL12).
 *
 * The gap this closes was the worst kind: everything LOOKED right. Rollup triggers moved
 * `AmountPaid` / `Balance` / `PaymentStatus`, the order read "Paid", and the general ledger still
 * carried the receivable — forever, with nothing reconciling the two. `PaymentHeader.JournalEntryID`
 * existed and nothing set it.
 *
 * So the central assertion here is not "a journal entry was written". It is **AR nets to zero**:
 * what order booking debited, payment capture must credit back. A test that only counted entries
 * would have passed against a capture entry pointed at the wrong account.
 *
 * WHAT IT PROVES
 *   PL1   capturing a payment books an entry and stamps JournalEntryID
 *   PL2   the entry is Dr Cash / Cr AR — cash in, receivable relieved
 *   PL3   AR NETS TO ZERO across booking + capture (the reconciliation that matters)
 *   PL4   a processing fee splits Dr Cash (net) + Dr Fee, still crediting AR gross
 *   PL5   a fee with no Processing Fee account books gross to Cash rather than failing
 *   PL6   re-saving a captured payment does not book a second entry
 *   PL7   the auto initial payment books its cash leg too, end to end from the order
 *   PL8   over-applying cash to an order is refused
 *   PL9   un-applying more than was applied is refused
 *   PL10  a refund reverses the capture — Dr AR / Cr Cash — and reopens the order balance
 *   PL11  refunding more than remains is refused, and partial refunds accumulate
 *   PL12  refunding an uncaptured payment is refused
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 */
import { randomUUID } from "node:crypto";
import { DerivePaymentStatus } from "@mj-biz-apps/orders-entities";
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
  createViaEntity,
  upsertViaEntity,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxMaybeOne,
  TxOne,
  TxQuery,
} from "../fixture.js";
import {
  GL_ACCOUNT_ENTITY,
  GL_ACCOUNT_LINK_ENTITY,
  GL_ACCOUNT_ROLE_ENTITY,
  PAYMENT_HEADER_ENTITY,
  PAYMENT_TYPE_ENTITY,
} from "../entity-names.js";
import { ConfirmOrder } from "../order-builder.js";
import {
  ApplyPayment,
  CreatePayment,
} from "../payment-builder.js";
import type { PaymentHeaderEntityServer } from "@mj-biz-apps/orders-core-entities-server";

const CASH_CODE = "10100";
const AR_CODE = "11201";
const FEE_CODE = "60500";

interface RefundOutput {
  Success: boolean;
  Message?: string;
  RefundAmount?: number;
  RemainingRefundable?: number;
  RefundPaymentHeaderID?: string;
  RefundPaymentNumber?: string;
}

async function refund(
  ctx: IntegrationCheckContext,
  input: Record<string, unknown>,
): Promise<RefundOutput> {
  const op = MJGlobal.Instance.ClassFactory.CreateInstance<
    BaseRemotableOperation<Record<string, unknown>, RefundOutput>
  >(BaseRemotableOperation, "Orders.RefundPayment");
  Assert(op != null, "'Orders.RefundPayment' is not registered");

  const result = await op!.Execute(input, {
    provider: ctx.Provider,
    user: ctx.User,
  });
  Assert(
    result.Success,
    `the operation did not execute: ${result.ErrorMessage ?? "unknown"}`,
  );
  Assert(result.Output != null, "the operation returned no payload");
  return result.Output as RefundOutput;
}

/** A confirmed $250 order in Co A. */
async function confirmOrder(ctx: IntegrationCheckContext, price = 250) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: price }],
  });
  Assert(result.Saved, `confirm failed: ${result.Message}`);
  return result;
}

/**
 * Capture a payment WITH its allocation, in one save (D68).
 *
 * The two used to be separate calls. They cannot be now: a captured payment's Amount must equal the
 * sum of its lines, so capturing first and allocating second would pass through a state the
 * invariant forbids. Pass `allocate: false` to get a Pending draft instead — the only shape in
 * which a payment may legitimately sit unallocated.
 */
async function capturePayment(
  ctx: IntegrationCheckContext,
  orderID: string,
  amount: number,
  opts: { fee?: number; allocate?: boolean; allocation?: number } = {},
): Promise<PaymentHeaderEntityServer> {
  const f = Fx();
  const cash = f.PaymentTypeIDs.get("Cash");
  Assert(
    cash != null,
    "PaymentType 'Cash' missing — push the orders app metadata",
  );

  const draft = opts.allocate === false;
  const { Payment, Saved, Message } = await CreatePayment(ctx.User, {
    PaymentNumber: `IT-${randomUUID().slice(0, 8).toUpperCase()}`,
    ReceivingCompanyID: f.CoA.ID,
    PaymentTypeID: cash!,
    Amount: amount,
    ProcessingFeeAmount: opts.fee ?? 0,
    Status: draft ? "Pending" : "Captured",
    Allocations: draft
      ? []
      : [{ OrderHeaderID: orderID, Amount: opts.allocation ?? amount }],
  });
  Assert(Saved, `capture failed: ${Message}`);
  return Payment;
}

/** Ledger lines of a payment's entry, by account code. */
const entryLines = (ctx: IntegrationCheckContext, journalEntryID: string) =>
  TxQuery<{ Code: string; DebitAmount: number; CreditAmount: number }>(
    ctx,
    `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
         FROM ${ACCT_SCHEMA}.JournalEntryLine jel
         JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
         WHERE jel.JournalEntryID = '${journalEntryID}'`,
  );

/**
 * The ALLOCATION entries a payment produced, found through accounting's D25 provenance pair.
 *
 * The cash/AR side moved off `PaymentHeader.JournalEntryID` when intercompany balancing landed:
 * one payment LINE now produces one entry per company owning a line on the order, so there is no
 * single id for the header to hold. The entries are found the other way round — by asking which
 * entries point back at the payment's lines.
 *
 * Matching is case-insensitive because `LinkedRecordID` is text written by JS (lowercase) while
 * SQL Server renders a uniqueidentifier uppercase.
 */
const allocationEntryLines = (ctx: IntegrationCheckContext, paymentID: string) =>
  TxQuery<{ Code: string; DebitAmount: number; CreditAmount: number; CompanyID: string; EntryID: string }>(
    ctx,
    `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount, gl.CompanyID, je.ID AS EntryID
         FROM ${ORDERS_SCHEMA}.PaymentLine pl
         JOIN ${ACCT_SCHEMA}.vwJournalEntries je
           ON LOWER(je.LinkedRecordID) = LOWER(CAST(pl.ID AS NVARCHAR(400)))
         JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
         JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
         WHERE pl.PaymentHeaderID = '${paymentID}'`,
  );

/** Distinct allocation entries for a payment, with their type — one per company involved. */
const allocationEntries = (ctx: IntegrationCheckContext, paymentID: string) =>
  TxQuery<{ ID: string; EntryType: string; CompanyID: string }>(
    ctx,
    `SELECT DISTINCT je.ID, (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) AS EntryType, je.CompanyID
         FROM ${ORDERS_SCHEMA}.PaymentLine pl
         JOIN ${ACCT_SCHEMA}.vwJournalEntries je
           ON LOWER(je.LinkedRecordID) = LOWER(CAST(pl.ID AS NVARCHAR(400)))
         WHERE pl.PaymentHeaderID = '${paymentID}'`,
  );

/** Net movement on one account code across a payment's allocation entries only. */
function netOn(
  lines: Array<{ Code: string; DebitAmount: number; CreditAmount: number }>,
  code: string,
): number {
  const n = lines
    .filter((l) => l.Code === code)
    .reduce((s, l) => s + Number(l.DebitAmount ?? 0) - Number(l.CreditAmount ?? 0), 0);
  return Math.round(n * 100) / 100;
}

/** Net movement on one account across EVERY entry for a company — the reconciliation view. */
const netOnAccount = (
  ctx: IntegrationCheckContext,
  companyID: string,
  code: string,
) =>
  TxOne<{ Net: number }>(
    ctx,
    // ISNULL per COLUMN, not around the subtraction. A ledger line populates exactly one side
    // and leaves the other NULL, so `SUM(Debit) - SUM(Credit)` is `250 - NULL` = NULL, and an
    // outer ISNULL turns that into a confident, wrong 0 — a balance check that can never fail.
    `SELECT SUM(ISNULL(jel.DebitAmount, 0)) - SUM(ISNULL(jel.CreditAmount, 0)) AS Net
         FROM ${ACCT_SCHEMA}.JournalEntryLine jel
         JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
         JOIN ${ACCT_SCHEMA}.vwJournalEntries je ON je.ID = jel.JournalEntryID
         WHERE gl.Code = '${code}' AND je.CompanyID = '${companyID}'`,
  );

/**
 * PL4's body, factored out so the engine-cache restore can wrap it in a `finally`.
 *
 * Everything it writes rolls back; what does NOT roll back is the accounting engine's in-process
 * cache, which this check deliberately warms so booking can see the fee link it just created.
 */
async function PL4Body(ctx: IntegrationCheckContext): Promise<void> {
  await InRolledBackTransaction(ctx, async () => {
    const f = Fx();
    // Give this company a Processing Fee account so the fee leg can resolve. Built through the
    // object model, not INSERT: the GL account and especially the LINK are what our own resolution
    // walk reads, so fabricating them by hand would exercise the walk against data no application
    // ever validated.
    const feeID = await createViaEntity(ctx, GL_ACCOUNT_ENTITY, {
      CompanyID: f.CoA.ID,
      Code: FEE_CODE,
      Name: "Payment Processing Fees",
      AccountType: "Expense",
      IsActive: 1,
    });
    // 'Processing Fee' is NOT one of accounting's eight seeded roles — that is exactly
    // why the factory tolerates it missing (PL5). Here we create it to exercise the
    // path where it IS configured. Reused if a prior check in this bundle already made it.
    const existingRole = await TxMaybeOne<{ ID: string }>(
      ctx,
      `SELECT ID FROM ${ACCT_SCHEMA}.GLAccountRole WHERE Name='Processing Fee'`,
    );
    const roleID =
      existingRole?.ID ??
      (await createViaEntity(ctx, GL_ACCOUNT_ROLE_ENTITY, {
        Name: "Processing Fee",
        Description: "Payment processor fees expensed on capture (D18).",
      }));
    await createViaEntity(ctx, GL_ACCOUNT_LINK_ENTITY, {
      GLAccountID: feeID,
      GLAccountRoleID: roleID,
      EntityID: f.CompanyEntityID,
      RecordID: f.CoA.ID,
      Status: "Active",
    });
    await ReloadAccountingEngine(ctx);

    // OPT THIS TENDER IN. Since D82 the fee leg is OFF for every tender by default, because a
    // per-payment fee entry cannot reconcile to a bank statement — the processor batches into payouts
    // and deducts costs that attach to no payment at all. The path below is what a deployment gets
    // when it deliberately turns per-payment fee attribution back on, so the check has to turn it on
    // too. Without this the fee never books, `JournalEntryID` is null, and the whole check dies on a
    // null id rather than on an assertion — which is how it read before this line existed.
    //
    // Rolled back with everything else; AS17 covers the default-off behaviour on the other side.
    // THROUGH THE OBJECT MODEL, NOT AN UPDATE STATEMENT. The entity server reads this flag from the
    // `OrdersEngine` lookup cache, which refreshes on entity save events — a raw UPDATE fires none, so
    // the cache would keep answering with the seeded value and the fee would silently not book. Same
    // reason the GL account and its link above are built this way: setup that bypasses the
    // application layer exercises the walk against data no application ever validated.
    const cashTypeID = Fx().PaymentTypeIDs.get("Cash")!;
    await upsertViaEntity(ctx, PAYMENT_TYPE_ENTITY, cashTypeID, {
      BookProcessingFeeInline: true,
    });

    const order = await confirmOrder(ctx);
    const payment = await capturePayment(ctx, order.Order.ID as string, 250, {
      fee: 7.25,
    });

    Assert(
      payment.JournalEntryID != null,
      "the tender books its fee inline, so the header carries an entry",
    );

    // The fee is a HEADER fact — the processor takes its cut from the payment as a whole, not
    // from any one order — so it books its own entry at capture: Dr Fee / Cr Cash.
    const feeLines = await entryLines(ctx, payment.JournalEntryID as string);
    AssertEqual(feeLines.length, 2, `the fee entry has two lines: ${JSON.stringify(feeLines)}`);
    AssertEqual(
      Number(feeLines.find((l) => l.Code === FEE_CODE)?.DebitAmount),
      7.25,
      "the fee is our expense",
    );
    AssertEqual(
      Number(feeLines.find((l) => l.Code === CASH_CODE)?.CreditAmount),
      7.25,
      "the processor never deposited it",
    );

    // The allocation books the GROSS to cash and clears AR in full. A fee netted against AR
    // would leave a residue on the customer's balance that no payment could ever clear.
    const allocLines = await allocationEntryLines(ctx, payment.ID as string);
    AssertEqual(netOn(allocLines, CASH_CODE), 250, "the allocation books the gross");
    AssertEqual(
      Number(allocLines.find((l) => l.Code === AR_CODE)?.CreditAmount),
      250,
      "the receivable clears for the FULL amount",
    );

    // What actually matters, and the reason the split is safe: the bank ends up net.
    const feeCash = Number(feeLines.find((l) => l.Code === CASH_CODE)?.CreditAmount ?? 0);
    const allocCash = netOn(allocLines, CASH_CODE);
    AssertEqual(allocCash - feeCash, 242.75, "cash nets to what the bank received");
  });
}

export const PaymentLedgerChecks: NamedCheck[] = [
  {
    Id: "payment-ledger.PL1",
    Name: "PL1: applying a captured payment books an entry against the payment line",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await confirmOrder(ctx);
        const payment = await capturePayment(
          ctx,
          order.Order.ID as string,
          250,
        );

        // The entry hangs off the payment LINE, not the header: one allocation produces one entry
        // per company owning a line on the order, so the header has no single id to hold.
        const entries = await allocationEntries(ctx, payment.ID as string);
        AssertEqual(
          entries.length,
          1,
          `a single-company order produces exactly one allocation entry: ${JSON.stringify(entries)}`,
        );
        AssertEqual(
          entries[0].EntryType,
          "PaymentReceipt",
          "entry type — accounting's vocabulary, not ours",
        );

        const booked = await TxOne<{ BookedAt: string | null }>(
          ctx,
          `SELECT BookedAt FROM ${ORDERS_SCHEMA}.PaymentLine WHERE PaymentHeaderID='${payment.ID}'`,
        );
        Assert(booked.BookedAt != null, "the allocation must stamp BookedAt — the idempotency key");
      }),
  },
  {
    Id: "payment-ledger.PL2",
    Name: "PL2: the allocation entry debits Cash and credits Accounts Receivable",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await confirmOrder(ctx);
        const payment = await capturePayment(
          ctx,
          order.Order.ID as string,
          250,
        );
        const lines = await allocationEntryLines(ctx, payment.ID as string);

        AssertEqual(
          lines.length,
          2,
          `a no-fee single-company allocation has two lines: ${JSON.stringify(lines)}`,
        );
        const cash = lines.find((l) => l.Code === CASH_CODE);
        const ar = lines.find((l) => l.Code === AR_CODE);
        Assert(cash != null, `no Cash line: ${JSON.stringify(lines)}`);
        Assert(ar != null, `no AR line: ${JSON.stringify(lines)}`);
        AssertEqual(Number(cash!.DebitAmount), 250, "cash debited");
        AssertEqual(Number(ar!.CreditAmount), 250, "receivable relieved");
      }),
  },
  {
    Id: "payment-ledger.PL3",
    Name: "PL3: AR nets to zero across booking and capture",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const baseAR = Number((await netOnAccount(ctx, f.CoA.ID, AR_CODE)).Net);
        const baseCash = Number((await netOnAccount(ctx, f.CoA.ID, CASH_CODE)).Net);
        const order = await confirmOrder(ctx);

        // Booking alone leaves the receivable outstanding — that is the correct interim state.
        const afterBooking = await netOnAccount(ctx, f.CoA.ID, AR_CODE);
        AssertEqual(
          Number(afterBooking.Net) - baseAR,
          250,
          "AR is a debit balance after booking",
        );

        await capturePayment(ctx, order.Order.ID as string, 250);

        // THE assertion. Before this feature the ledger stayed at 250 forever while the
        // order's Balance read 0 — the sub-ledger and the GL disagreeing permanently.
        const afterCapture = await netOnAccount(ctx, f.CoA.ID, AR_CODE);
        AssertEqual(
          Number(afterCapture.Net) - baseAR,
          0,
          "AR nets to ZERO once the customer has paid",
        );

        const cash = await netOnAccount(ctx, f.CoA.ID, CASH_CODE);
        AssertEqual(Number(cash.Net) - baseCash, 250, "and the cash landed");

        // The sub-ledger agrees with the ledger, which is the whole point.
        const row = await TxOne<{ Balance: number; AmountPaid: number; TotalGross: number }>(
          ctx,
          `SELECT Balance, AmountPaid, TotalGross FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${order.Order.ID}'`,
        );
        AssertEqual(Number(row.Balance), 0, "order balance");
        AssertEqual(DerivePaymentStatus(row.TotalGross, row.AmountPaid, row.Balance), "Paid", "payment status");
      }),
  },
  {
    Id: "payment-ledger.PL4",
    Name: "PL4: a processing fee splits cash and fee while still crediting AR gross",
    RequiresMutation: true,
    // The engine cache OUTLIVES the transaction. This check creates a Processing Fee role and
    // link, then reloads the engine so booking can see them — and the rollback removes the rows
    // but CANNOT remove them from the in-process cache. PL5 would then resolve a fee account
    // that no longer exists and fail on a dangling GLAccountID. Reloading again AFTER the
    // rollback is what keeps the cache honest; the transaction alone is not enough isolation
    // once a check has warmed a cache.
    Fn: async (ctx) => {
      try {
        await PL4Body(ctx);
      } finally {
        await ReloadAccountingEngine(ctx);
      }
    },
  },
  {
    Id: "payment-ledger.PL5",
    Name: "PL5: a fee with no Processing Fee account books gross to cash rather than failing",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // No Processing Fee link exists on the fixture company — the role is not one of
        // accounting's seeded eight. Capture must still succeed.
        const order = await confirmOrder(ctx);
        const payment = await capturePayment(
          ctx,
          order.Order.ID as string,
          250,
          { fee: 7.25 },
        );

        // Nothing is booked for the fee — not an approximation of it. Booking it somewhere
        // plausible would misstate whichever account absorbed it.
        Assert(
          payment.JournalEntryID == null,
          "no fee entry, because no Processing Fee account resolved",
        );

        const lines = await allocationEntryLines(ctx, payment.ID as string);
        AssertEqual(lines.length, 2, "the allocation is unaffected by the unbooked fee");
        AssertEqual(
          Number(lines.find((l) => l.Code === CASH_CODE)?.DebitAmount),
          250,
          "the whole gross went to cash",
        );
        AssertEqual(
          Number(lines.find((l) => l.Code === AR_CODE)?.CreditAmount),
          250,
          "and AR still clears in full",
        );
      }),
  },
  {
    Id: "payment-ledger.PL6",
    Name: "PL6: re-saving a captured payment does not book a second entry",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const baseAR = Number((await netOnAccount(ctx, f.CoA.ID, AR_CODE)).Net);
        const order = await confirmOrder(ctx);
        const payment = await capturePayment(
          ctx,
          order.Order.ID as string,
          250,
        );
        const before = await allocationEntries(ctx, payment.ID as string);
        AssertEqual(before.length, 1, "one allocation entry to begin with");

        // An ordinary edit of a captured row. Booking again would credit AR twice and put
        // the customer's balance permanently negative.
        payment.Notes = "reconciled by finance";
        Assert(
          await payment.Save(),
          `re-save failed: ${payment.LatestResult?.CompleteMessage}`,
        );

        const after = await allocationEntries(ctx, payment.ID as string);
        AssertEqual(after.length, 1, "still one allocation entry — BookedAt held the line");
        const ar = await netOnAccount(ctx, f.CoA.ID, AR_CODE);
        AssertEqual(Number(ar.Net) - baseAR, 0, "AR still nets to zero, not -250");
      }),
  },
  {
    Id: "payment-ledger.PL7",
    Name: "PL7: the auto initial payment books its cash leg end to end",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const baseAR = Number((await netOnAccount(ctx, f.CoA.ID, AR_CODE)).Net);
        // The D42 path: intent on the order, confirmed once, everything else automatic.
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          Lines: [
            { ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 400 },
          ],
          InitialPaymentTypeID: f.PaymentTypeIDs.get("Check")!,
          InitialPaymentAmount: 400,
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        const line = await TxOne<{ ID: string; BookedAt: string | null }>(
          ctx,
          `SELECT pl.ID, pl.BookedAt FROM ${ORDERS_SCHEMA}.PaymentLine pl
                     WHERE pl.OrderHeaderID = '${result.Order.ID}'`,
        );
        Assert(
          line.BookedAt != null,
          "the auto payment's allocation must book its cash leg too",
        );

        const ar = await netOnAccount(ctx, f.CoA.ID, AR_CODE);
        AssertEqual(Number(ar.Net) - baseAR, 0, "AR nets to zero from a single confirm");
      }),
  },
  {
    Id: "payment-ledger.PL8",
    Name: "PL8: over-paying an order is ALLOWED and leaves a credit balance",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // This check used to assert the OPPOSITE — that over-application was refused. That rule was
        // wrong (D68): a customer sending 500 for a 100 order has done nothing unusual, and refusing
        // it made the honest case unrecordable while the money sat in the bank regardless. The
        // surplus now stays on the order as a NEGATIVE balance, which is the credit.
        const order = await confirmOrder(ctx, 100);
        const payment = await capturePayment(
          ctx,
          order.Order.ID as string,
          500,
        );
        Assert(payment.ID != null, "the over-payment must be recordable");

        const row = await TxOne<{ Balance: number; AmountPaid: number }>(
          ctx,
          `SELECT Balance, AmountPaid FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${order.Order.ID}'`,
        );
        AssertEqual(
          Number(row.AmountPaid),
          500,
          "all 500 is applied — the payment and its allocation agree",
        );
        AssertEqual(
          Number(row.Balance),
          -400,
          "the 400 surplus shows as a NEGATIVE balance: that is the customer credit",
        );
      }),
  },
  {
    Id: "payment-ledger.PL9",
    Name: "PL9: un-applying more than was applied is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await confirmOrder(ctx, 100);
        const payment = await capturePayment(
          ctx,
          order.Order.ID as string,
          100,
        );

        // The FLOOR survives D68 while the ceiling did not: un-applying more than was ever applied
        // is incoherent no matter how permissive the model is about over-payment.
        const attempt = await ApplyPayment(
          ctx.User,
          payment.ID as string,
          order.Order.ID as string,
          -250,
        );
        Assert(
          !attempt.Saved,
          "un-applying 250 when only 100 was applied must be refused",
        );
        Assert(
          /nothing more to/i.test(attempt.Message),
          `the refusal should explain, got: ${attempt.Message}`,
        );
      }),
  },
  {
    Id: "payment-ledger.PL10",
    Name: "PL10: a refund reverses the capture and reopens the order balance",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const baseAR = Number((await netOnAccount(ctx, f.CoA.ID, AR_CODE)).Net);
        const baseCash = Number((await netOnAccount(ctx, f.CoA.ID, CASH_CODE)).Net);
        const order = await confirmOrder(ctx, 250);
        const payment = await capturePayment(
          ctx,
          order.Order.ID as string,
          250,
        );

        const out = await refund(ctx, {
          PaymentHeaderID: payment.ID,
          Reason: "customer returned the goods",
        });
        Assert(out.Success, `refund failed: ${out.Message}`);
        AssertEqual(Number(out.RefundAmount), 250, "full refund");

        const reversal = await TxOne<{
          ID: string;
          JournalEntryID: string;
          Status: string;
        }>(
          ctx,
          `SELECT ID, JournalEntryID, Status FROM ${ORDERS_SCHEMA}.PaymentHeader
                     WHERE ID = '${out.RefundPaymentHeaderID}'`,
        );
        AssertEqual(
          reversal.Status,
          "Refunded",
          "the reversal is its own payment record",
        );

        // Mirrored: Dr AR / Cr Cash — the receivable comes back, the bank goes down. The
        // reversal's entries hang off ITS allocation, the same as the original capture's.
        const lines = await allocationEntryLines(ctx, reversal.ID);
        Assert(lines.length > 0, "the reversal books its allocation entries");
        AssertEqual(
          Number(lines.find((l) => l.Code === AR_CODE)?.DebitAmount),
          250,
          "AR debited back",
        );
        AssertEqual(
          Number(lines.find((l) => l.Code === CASH_CODE)?.CreditAmount),
          250,
          "cash credited",
        );

        // Net across all four entries: AR is owed again, cash is gone.
        AssertEqual(
          Number((await netOnAccount(ctx, f.CoA.ID, AR_CODE)).Net) - baseAR,
          250,
          "AR outstanding again",
        );
        AssertEqual(
          Number((await netOnAccount(ctx, f.CoA.ID, CASH_CODE)).Net) - baseCash,
          0,
          "cash nets out",
        );

        const row = await TxOne<{ Balance: number; AmountPaid: number; TotalGross: number }>(
          ctx,
          `SELECT Balance, AmountPaid, TotalGross FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${order.Order.ID}'`,
        );
        AssertEqual(Number(row.Balance), 250, "the order is owed again");
        AssertEqual(DerivePaymentStatus(row.TotalGross, row.AmountPaid, row.Balance), "Unpaid", "and reads unpaid");
      }),
  },
  {
    Id: "payment-ledger.PL11",
    Name: "PL11: partial refunds accumulate and over-refunding is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await confirmOrder(ctx, 250);
        const payment = await capturePayment(
          ctx,
          order.Order.ID as string,
          250,
        );

        const first = await refund(ctx, {
          PaymentHeaderID: payment.ID,
          Amount: 100,
        });
        Assert(first.Success, `first refund failed: ${first.Message}`);
        AssertEqual(
          Number(first.RemainingRefundable),
          150,
          "remaining after a partial refund",
        );

        const second = await refund(ctx, {
          PaymentHeaderID: payment.ID,
          Amount: 100,
        });
        Assert(second.Success, `second refund failed: ${second.Message}`);
        AssertEqual(
          Number(second.RemainingRefundable),
          50,
          "refunds accumulate",
        );

        // 200 of 250 refunded — asking for 100 more must be refused, not silently clamped.
        const third = await refund(ctx, {
          PaymentHeaderID: payment.ID,
          Amount: 100,
        });
        Assert(!third.Success, "over-refunding must be refused");
        Assert(
          /only 50 remains refundable/i.test(third.Message ?? ""),
          `the refusal should state what remains, got: ${third.Message}`,
        );

        const row = await TxOne<{ Balance: number }>(
          ctx,
          `SELECT Balance FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${order.Order.ID}'`,
        );
        AssertEqual(
          Number(row.Balance),
          200,
          "balance reflects exactly the 200 refunded",
        );
      }),
  },
  {
    Id: "payment-ledger.PL12",
    Name: "PL12: refunding an uncaptured payment is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // Pending: authorized but never captured, so no money ever moved.
        const paymentID = await createViaEntity(ctx, PAYMENT_HEADER_ENTITY, {
          PaymentNumber: `IT-PEND-${randomUUID().slice(0, 6).toUpperCase()}`,
          ReceivingCompanyID: f.CoA.ID,
          PaymentTypeID: f.PaymentTypeIDs.get("Cash"),
          Amount: 100,
          PaymentDate: new Date(),
          Status: "Pending",
        });

        const out = await refund(ctx, { PaymentHeaderID: paymentID });
        Assert(!out.Success, "a Pending payment has nothing to refund");
        Assert(
          /not Captured/i.test(out.Message ?? ""),
          `the refusal should name the status, got: ${out.Message}`,
        );

        const unknown = await refund(ctx, {
          PaymentHeaderID: "00000000-0000-0000-0000-000000000000",
        });
        Assert(
          !unknown.Success,
          "an unknown payment fails in the output, not as a throw",
        );
        Assert(
          /no payment found/i.test(unknown.Message ?? ""),
          `got: ${unknown.Message}`,
        );
      }),
  },
];

/**
 * Force the accounting engine to re-read GL links.
 *
 * It caches accounts and links in-process (BaseEngine), so a link created INSIDE a check is
 * invisible to booking until it reloads — the same trap the fixture setup documents.
 */
async function ReloadAccountingEngine(
  ctx: IntegrationCheckContext,
): Promise<void> {
  const { AccountingEngineBase } =
    await import("@mj-biz-apps/accounting-engine-base");
  await AccountingEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
}

for (const check of PaymentLedgerChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("payment-ledger", {
  Setup: async (ctx) => {
    // Cash comes from the shared fixture — see FIXTURE_ACCOUNTS. It stopped being a
    // payment-ledger concern the moment capture became part of the ordinary confirm path.
    await CreateOrdersFixture(ctx);
    await ReloadAccountingEngine(ctx);
  },
  Teardown: TeardownOrdersFixture,
});
