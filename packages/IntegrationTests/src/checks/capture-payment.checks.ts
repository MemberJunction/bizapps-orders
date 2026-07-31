/**
 * capture-payment — `Orders.CapturePayment`, the operation the UI was blocked on.
 *
 * WHY IT EXISTS
 * A payment is a HEADER plus its ALLOCATION LINES, written in one transaction.
 * `PaymentHeaderEntityServer.Lines` is a TRANSIENT collection rather than a column, so CodeGen
 * cannot emit it client-side and a browser `entity.Save()` has nowhere to put the allocations —
 * taking a payment in the UI was impossible, not merely unwired. Same problem `Orders.SaveOrder`
 * solved for orders.
 *
 * THE CHECKS THAT EARN THEIR KEEP
 *   · CP4 — a captured payment BOOKS. The two-step alternative would leave a payment with no
 *     allocations in the database between the calls, and this is what proves one step happened.
 *   · CP7 — over-payment is ACCEPTED and becomes credit (D68). Refusing it would look like
 *     prudence and would break the account-credit screen, which needs negative balances to exist.
 *   · CP9 — idempotency. A double-clicked Capture must not take money twice, and the assertion is
 *     that the SECOND call returns the FIRST payment rather than a second one or an error.
 *   · CP11 — Preview writes NOTHING while returning the real numbers, because it runs the real
 *     capture and rolls back.
 *
 * WHAT IT PROVES
 *   CP1   a capture creates the header and its allocation lines together
 *   CP2   the tender resolves by CODE, and an unknown code is refused by name
 *   CP3   the order's rollups move — AmountPaid, Balance, PaymentStatus
 *   CP4   the capture books balanced journal entries
 *   CP5   an allocation total that disagrees with the amount is refused (D68)
 *   CP6   a payment split across two orders lands on both
 *   CP7   over-payment is accepted and reported as credit
 *   CP8   an order belonging to another company is refused by name
 *   CP9   the same IdempotencyKey returns the ORIGINAL payment, taking no money twice
 *   CP10  a different key on the same shape takes a second, legitimate payment
 *   CP11  Preview returns real numbers and writes nothing
 *   CP12  ids are validated at the boundary, not interpolated
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: CapturePaymentOperation · PaymentHeaderEntityServer.Lines · PaymentLineEntityServer
 *   DOC:  docs/spec-capture-payment-operation.md · plans/bizapps-orders-master.md D68
 */
import { randomUUID } from "node:crypto";
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
  TxMaybeOne,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { ConfirmOrder } from "../order-builder.js";

interface CaptureOutput {
  Success: boolean;
  Message?: string;
  PaymentHeaderID?: string | null;
  PaymentNumber?: string | null;
  Status?: string | null;
  Amount?: number;
  ProcessingFeeAmount?: number;
  NetAmount?: number;
  OrderEffects?: Array<{
    OrderHeaderID: string;
    OrderNumber: string;
    AmountPaid: number;
    Balance: number;
    PaymentStatus: string;
    HasCredit: boolean;
  }>;
  EntryCount?: number;
  AllBalanced?: boolean;
  Blockers?: Array<{ Code: string; Message: string }>;
  WasPreview?: boolean;
  WasRetry?: boolean;
  IdempotencyKey?: string | null;
}

async function capture(ctx: IntegrationCheckContext, input: Record<string, unknown>): Promise<CaptureOutput> {
  const op = MJGlobal.Instance.ClassFactory.CreateInstance<
    BaseRemotableOperation<Record<string, unknown>, CaptureOutput>
  >(BaseRemotableOperation, "Orders.CapturePayment");
  Assert(op != null, "'Orders.CapturePayment' is not registered");
  const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
  Assert(result.Success, `the operation did not execute: ${result.ErrorMessage ?? "unknown"}`);
  return result.Output as CaptureOutput;
}

/** A tender code that exists in the seeded metadata. */
function cashCode(): string {
  const f = Fx();
  Assert(f.PaymentTypeIDs.get("Cash") != null, "PaymentType 'Cash' missing — push the orders app metadata");
  return "Cash";
}

/** Confirm an order for `amount` against Co A. */
async function sell(ctx: IntegrationCheckContext, amount: number, company?: { ID: string }) {
  const f = Fx();
  const co = company ?? f.CoA;
  const productKey = co.ID === f.CoB.ID ? "WidgetB" : "WidgetA";
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: co.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: [{ ProductID: f.Products[productKey], Quantity: 1, UnitPrice: amount }],
  });
  Assert(result.Saved, `confirm failed: ${result.Message}`);
  return result;
}

const base = (ctx: IntegrationCheckContext, amount: number, orderID: string) => {
  const f = Fx();
  return {
    Amount: amount,
    ReceivingCompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    TenderCode: cashCode(),
    Allocations: [{ OrderHeaderID: orderID, Amount: amount }],
  };
};

const orderRow = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ AmountPaid: number; Balance: number; PaymentStatus: string }>(
    ctx,
    `SELECT AmountPaid, Balance, PaymentStatus FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${orderID}'`,
  );

export const CapturePaymentChecks: NamedCheck[] = [
  {
    Id: "capture-payment.CP1",
    Name: "CP1: a capture creates the header AND its allocation lines together",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sell(ctx, 250);
        const out = await capture(ctx, base(ctx, 250, order.Order.ID as string));

        Assert(out.Success, `capture failed: ${out.Message} ${JSON.stringify(out.Blockers)}`);
        AssertEqual(out.Status, "Captured", "the payment is captured");
        Assert(out.PaymentNumber != null, "and it got a payment number");

        // THE WHOLE POINT. A two-step create-then-allocate flow would leave a payment with no
        // allocations in the database between the calls — cash recorded against nothing.
        const lines = await TxQuery<{ ID: string; Amount: number }>(
          ctx,
          `SELECT ID, Amount FROM ${ORDERS_SCHEMA}.PaymentLine WHERE PaymentHeaderID='${out.PaymentHeaderID}'`,
        );
        AssertEqual(lines.length, 1, "the allocation line was written with the header");
        AssertEqual(Number(lines[0].Amount), 250, "for the full amount");
      }),
  },
  {
    Id: "capture-payment.CP2",
    Name: "CP2: the tender resolves by CODE, and an unknown code is refused by name",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sell(ctx, 100);
        const ok = await capture(ctx, base(ctx, 100, order.Order.ID as string));
        Assert(ok.Success, `a known code should resolve: ${ok.Message}`);

        // Refused by name, not silently defaulted: a payment recorded as the wrong KIND is
        // invisible until somebody reconciles.
        const bad = await capture(ctx, {
          ...base(ctx, 100, order.Order.ID as string),
          TenderCode: "NotATender",
        });
        AssertEqual(bad.Success, false, "an unknown tender is refused");
        Assert(
          (bad.Blockers ?? []).some((b) => b.Code === "UnknownTender" && b.Message.includes("NotATender")),
          `the refusal should name the code: ${JSON.stringify(bad.Blockers)}`,
        );
      }),
  },
  {
    Id: "capture-payment.CP3",
    Name: "CP3: the order's rollups move — AmountPaid, Balance, PaymentStatus",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sell(ctx, 400);
        const out = await capture(ctx, base(ctx, 150, order.Order.ID as string));
        Assert(out.Success, `capture failed: ${out.Message}`);

        const row = await orderRow(ctx, order.Order.ID as string);
        AssertEqual(Number(row.AmountPaid), 150, "AmountPaid moved");
        AssertEqual(Number(row.Balance), 250, "Balance recalculated");
        AssertEqual(row.PaymentStatus, "PartiallyPaid", "and the status followed");

        // The output reports the SAME numbers, read back rather than recomputed.
        const effect = out.OrderEffects?.[0];
        Assert(effect != null, "the output reports the order effect");
        AssertEqual(Number(effect!.AmountPaid), 150, "and it agrees with the row");
        AssertEqual(Number(effect!.Balance), 250, "on the balance too");
      }),
  },
  {
    Id: "capture-payment.CP4",
    Name: "CP4: the capture books balanced journal entries",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sell(ctx, 300);
        const out = await capture(ctx, base(ctx, 300, order.Order.ID as string));
        Assert(out.Success, `capture failed: ${out.Message}`);

        // Booking is what distinguishes a captured payment from a recorded one. If the allocation
        // never booked, the order would read Paid while the ledger still carried the receivable —
        // both books internally consistent and permanently disagreeing.
        const unbalanced = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM (
             SELECT je.ID FROM ${ORDERS_SCHEMA}.PaymentLine pl
             JOIN ${ACCT_SCHEMA}.JournalEntry je ON LOWER(je.LinkedRecordID) = LOWER(CAST(pl.ID AS NVARCHAR(400)))
             JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
             WHERE pl.PaymentHeaderID = '${out.PaymentHeaderID}'
             GROUP BY je.ID
             HAVING ABS(SUM(ISNULL(jel.DebitAmount,0)) - SUM(ISNULL(jel.CreditAmount,0))) > 0.005) x`,
        );
        AssertEqual(Number(unbalanced.N), 0, "no unbalanced entry");

        const entries = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(DISTINCT je.ID) AS N FROM ${ORDERS_SCHEMA}.PaymentLine pl
             JOIN ${ACCT_SCHEMA}.JournalEntry je ON LOWER(je.LinkedRecordID) = LOWER(CAST(pl.ID AS NVARCHAR(400)))
            WHERE pl.PaymentHeaderID = '${out.PaymentHeaderID}'`,
        );
        Assert(Number(entries.N) > 0, "the allocation actually booked");
      }),
  },
  {
    Id: "capture-payment.CP5",
    Name: "CP5: an allocation total that disagrees with the amount is refused (D68)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sell(ctx, 500);
        const out = await capture(ctx, {
          ...base(ctx, 500, order.Order.ID as string),
          Allocations: [{ OrderHeaderID: order.Order.ID as string, Amount: 300 }],
        });

        // Refused rather than silently adjusted. Both directions are wrong in ways that reconcile:
        // trust the amount and 200 lands on nothing; trust the allocations and the bank disagrees.
        AssertEqual(out.Success, false, "the mismatch is refused");
        Assert(
          (out.Blockers ?? []).some((b) => b.Code === "AllocationMismatch"),
          `named as a mismatch: ${JSON.stringify(out.Blockers)}`,
        );
        Assert(
          (out.Blockers ?? []).some((b) => b.Message.includes("200")),
          `and it says how much is unaccounted for: ${JSON.stringify(out.Blockers)}`,
        );

        const row = await orderRow(ctx, order.Order.ID as string);
        AssertEqual(Number(row.AmountPaid), 0, "and nothing was written");
      }),
  },
  {
    Id: "capture-payment.CP6",
    Name: "CP6: a payment split across two orders lands on both",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const a = await sell(ctx, 200);
        const b = await sell(ctx, 300);
        const f = Fx();

        const out = await capture(ctx, {
          Amount: 500,
          ReceivingCompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          TenderCode: cashCode(),
          Allocations: [
            { OrderHeaderID: a.Order.ID as string, Amount: 200 },
            { OrderHeaderID: b.Order.ID as string, Amount: 300 },
          ],
        });
        Assert(out.Success, `capture failed: ${out.Message} ${JSON.stringify(out.Blockers)}`);
        AssertEqual(out.OrderEffects?.length, 2, "both orders reported");

        AssertEqual(Number((await orderRow(ctx, a.Order.ID as string)).Balance), 0, "first order closed");
        AssertEqual(Number((await orderRow(ctx, b.Order.ID as string)).Balance), 0, "second order closed");
      }),
  },
  {
    Id: "capture-payment.CP7",
    Name: "CP7: over-payment is ACCEPTED and reported as credit (D68)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sell(ctx, 100);
        const out = await capture(ctx, base(ctx, 150, order.Order.ID as string));

        // Refusing this would look like prudence and would break the account-credit screen, which
        // needs the negative balances to exist in order to spend them.
        Assert(out.Success, `over-payment must be accepted: ${out.Message} ${JSON.stringify(out.Blockers)}`);

        const row = await orderRow(ctx, order.Order.ID as string);
        AssertEqual(Number(row.Balance), -50, "the surplus is a negative balance");

        const effect = out.OrderEffects?.[0];
        AssertEqual(effect?.HasCredit, true, "and the output flags it as credit");
      }),
  },
  {
    Id: "capture-payment.CP8",
    Name: "CP8: an order belonging to another company is refused by name",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const theirs = await sell(ctx, 100, f.CoB);

        const out = await capture(ctx, {
          ...base(ctx, 100, theirs.Order.ID as string),
          ReceivingCompanyID: f.CoA.ID,
        });
        AssertEqual(out.Success, false, "refused");
        Assert(
          (out.Blockers ?? []).some((b) => b.Code === "OrderCompanyMismatch"),
          `named as a company mismatch: ${JSON.stringify(out.Blockers)}`,
        );
      }),
  },
  {
    Id: "capture-payment.CP9",
    Name: "CP9: the same IdempotencyKey returns the ORIGINAL payment, taking no money twice",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sell(ctx, 200);
        const token = `it-${randomUUID()}`;
        const input = { ...base(ctx, 200, order.Order.ID as string), IdempotencyKey: token };

        const first = await capture(ctx, input);
        Assert(first.Success, `first capture failed: ${first.Message}`);
        AssertEqual(first.WasRetry, false, "the first call is not a retry");

        // A double-clicked Capture. The second call must return the FIRST payment — not a second
        // payment, and not a spurious error the user would read as "it did not work".
        const second = await capture(ctx, input);
        Assert(second.Success, `the retry should succeed: ${second.Message}`);
        AssertEqual(second.WasRetry, true, "and say it was a retry");
        AssertEqual(
          (second.PaymentHeaderID ?? "").toLowerCase(),
          (first.PaymentHeaderID ?? "").toLowerCase(),
          "returning the original payment",
        );

        const count = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE IdempotencyKey='${token}'`,
        );
        AssertEqual(Number(count.N), 1, "exactly one payment exists");
        AssertEqual(Number((await orderRow(ctx, order.Order.ID as string)).AmountPaid), 200, "and the money moved once");
      }),
  },
  {
    Id: "capture-payment.CP10",
    Name: "CP10: a different key on the same shape takes a second, legitimate payment",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sell(ctx, 400);
        const shape = base(ctx, 100, order.Order.ID as string);

        const one = await capture(ctx, { ...shape, IdempotencyKey: `it-${randomUUID()}` });
        const two = await capture(ctx, { ...shape, IdempotencyKey: `it-${randomUUID()}` });
        Assert(one.Success && two.Success, "both should land");

        // The mirror of CP9, and the reason a natural key was rejected: two people paying the same
        // amount on the same day is ordinary, and swallowing the second would be a payment that
        // never existed — undetectable downstream.
        Assert(
          (one.PaymentHeaderID ?? "").toLowerCase() !== (two.PaymentHeaderID ?? "").toLowerCase(),
          "two distinct payments",
        );
        AssertEqual(Number((await orderRow(ctx, order.Order.ID as string)).AmountPaid), 200, "and both moved money");
      }),
  },
  {
    Id: "capture-payment.CP11",
    Name: "CP11: Preview returns real numbers and writes NOTHING",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sell(ctx, 250);
        const out = await capture(ctx, { ...base(ctx, 250, order.Order.ID as string), Preview: true });

        Assert(out.Success, `preview failed: ${out.Message} ${JSON.stringify(out.Blockers)}`);
        AssertEqual(out.WasPreview, true, "reported as a preview");
        // The numbers are REAL — the preview ran the capture and rolled it back, rather than
        // modelling the arithmetic separately. A separate model eventually disagrees, and the
        // disagreement is a balanced entry for the wrong amount.
        AssertEqual(Number(out.Amount), 250, "with the real amount");
        AssertEqual(out.OrderEffects?.[0]?.Balance, 0, "and the balance the capture WOULD produce");

        // And nothing was kept.
        const row = await orderRow(ctx, order.Order.ID as string);
        AssertEqual(Number(row.AmountPaid), 0, "the order is untouched");
        const payment = await TxMaybeOne<{ ID: string }>(
          ctx,
          `SELECT TOP 1 ID FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE ID='${out.PaymentHeaderID}'`,
        );
        Assert(payment == null, "and no payment row survived");
      }),
  },
  {
    Id: "capture-payment.CP12",
    Name: "CP12: ids are validated at the boundary, not interpolated",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // The exact shape that widened GetOverdueWorklist's result set instead of erroring.
        const injected = await capture(ctx, {
          ...base(ctx, 100, "00000000-0000-0000-0000-000000000000"),
          Allocations: [{ OrderHeaderID: "' OR 1=1 --", Amount: 100 }],
        });
        AssertEqual(injected.Success, false, "an injected id is refused");
        Assert(
          (injected.Blockers ?? []).some((b) => b.Code === "BadOrderID"),
          `refused as a bad id rather than executed: ${JSON.stringify(injected.Blockers)}`,
        );

        const badCompany = await capture(ctx, {
          ...base(ctx, 100, "00000000-0000-0000-0000-000000000000"),
          ReceivingCompanyID: "not-a-uuid",
        });
        AssertEqual(badCompany.Success, false, "so is a malformed company id");
      }),
  },
];

for (const check of CapturePaymentChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("capture-payment", {
  Setup: async (ctx) => { await CreateOrdersFixture(ctx); },
  Teardown: TeardownOrdersFixture,
});
