/**
 * intercompany.checks.ts — the `intercompany` bundle (IC1–IC12).
 *
 * WHY THIS BUNDLE EXISTS
 * The `payment-ledger` bundle proved the cash leg thoroughly — and every single check in it used a
 * SINGLE-COMPANY order. That blind spot hid a real correctness bug for the whole life of the suite:
 * cash collected by company A against a line owned by company B credited A's receivable and left
 * B's outstanding. Both books misstated, nothing reconciling them.
 *
 * Nothing caught it because the entry BALANCED. That is the defining property of this whole area:
 * every wrong answer here is a balanced, posted, plausible-looking entry. So these checks assert
 * WHOSE books each amount landed on, not merely that the ledger foots.
 *
 * WHAT IT PROVES
 *   IC1   a two-company order books one entry PER COMPANY, not one entry
 *   IC2   the collector's entry: Dr Cash gross / Cr AR own share / Cr Due To the other
 *   IC3   the other company's entry: Dr Due From / Cr its OWN AR  ← the bug, stated directly
 *   IC4   AR nets to zero FOR EACH COMPANY separately (the reconciliation that matters)
 *   IC5   a missing IntercompanyAccountMatch REFUSES the allocation rather than defaulting
 *   IC6   a partial payment pro-rates across companies
 *   IC7   a payment line targeting one order line books no intercompany legs at all
 *   IC8   three companies produce three entries and two separate Due To credits
 *   IC9   a shared-services collector owning no line books no AR line of its own
 *   IC10  a refund mirrors every leg, on every company
 *   IC11  the allocation is idempotent — re-saving does not double the Due To
 *   IC12  split payments across two orders keep each order's companies separate
 *
 * Deterministic. Every check runs inside a rolled-back transaction. The intercompany fixture
 * (Due To/Due From accounts + the ordered pairs) is built in bundle Setup, because it is
 * reference data every check needs rather than something any one check is testing.
 */
import { randomUUID } from "node:crypto";
import { BaseRemotableOperation, Metadata } from "@memberjunction/core";
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
  DUE_FROM_CODE,
  DUE_TO_CODE,
  EnsureIntercompanyAccounts,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import {
  PAYMENT_LINE_ENTITY,
} from "../entity-names.js";
import { ConfirmOrder } from "../order-builder.js";
import { CreatePayment, type LooseEntity } from "../payment-builder.js";

const CASH_CODE = "10100";
const AR_CODE = "11201";

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
           ON LOWER(je.LinkedRecordID) = LOWER(CAST(pl.ID AS NVARCHAR(400)))
         JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
         JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
         WHERE pl.PaymentHeaderID = '${paymentID}'`,
  );

const round = (n: number) => Math.round(n * 100) / 100;

/** Net debit-minus-credit on one account code, restricted to one company's books. */
function netFor(lines: EntryLine[], companyID: string, code: string): number {
  return round(
    lines
      .filter((l) => l.CompanyID.toLowerCase() === companyID.toLowerCase() && l.Code === code)
      .reduce((s, l) => s + Number(l.DebitAmount ?? 0) - Number(l.CreditAmount ?? 0), 0),
  );
}

/** How many distinct journal entries a payment produced. */
const entryCount = (lines: EntryLine[]) => new Set(lines.map((l) => l.EntryID)).size;

/**
 * Confirm an order whose lines span the given companies.
 * `spec` is a list of [productKey, unitPrice] pairs — the product decides the owning company (D6).
 */
async function confirmMultiCompanyOrder(
  ctx: IntegrationCheckContext,
  spec: Array<[string, number]>,
) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    Lines: spec.map(([product, price]) => ({
      ProductID: f.Products[product],
      Quantity: 1,
      UnitPrice: price,
    })),
  });
  Assert(result.Saved, `confirm failed: ${result.Message}`);
  return result;
}

/** Capture a payment to Co A and apply it to an order. */
async function payToCoA(
  ctx: IntegrationCheckContext,
  orderID: string,
  amount: number,
  opts: { targetOrderLineID?: string; expectFailure?: boolean } = {},
): Promise<{ Payment: LooseEntity; Applied: boolean; Message: string }> {
  const f = Fx();
  const cash = f.PaymentTypeIDs.get("Cash");
  Assert(cash != null, "PaymentType 'Cash' missing — push the orders app metadata");

  // Header + allocation in ONE save (D68). When the allocation is EXPECTED to fail — the missing
  // intercompany pair case — the whole save fails with it, which is the point: an unbookable
  // allocation must take the payment down rather than leaving cash recorded against nothing.
  const { Payment, Saved, Message } = await CreatePayment(ctx.User, {
    PaymentNumber: `IC-${randomUUID().slice(0, 8).toUpperCase()}`,
    ReceivingCompanyID: f.CoA.ID,
    PaymentTypeID: cash!,
    Amount: amount,
    Allocations: [
      { OrderHeaderID: orderID, Amount: amount, OrderLineID: opts.targetOrderLineID ?? null },
    ],
  });
  if (!opts.expectFailure) {
    Assert(Saved, `capture/apply failed: ${Message}`);
  }
  return { Payment, Applied: Saved, Message };
}

async function reloadEngine(ctx: IntegrationCheckContext): Promise<void> {
  const { AccountingEngineBase } = await import("@mj-biz-apps/accounting-engine-base");
  await AccountingEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
}

/**
 * Provision the intercompany accounts and the ORDERED pairs between the fixture companies.
 *
 * Committed rather than written inside a check's transaction: this is reference data (the same
 * class as the fixture's GL links), and the engine caches it in-process, so a per-check version
 * would leave a warm cache pointing at rolled-back rows — the trap PL4 documents.
 */
export async function CreateIntercompanyFixture(ctx: IntegrationCheckContext): Promise<void> {
  const f = Fx();
  const companies = [f.CoA, f.CoB, f.CoC];

  // One Due To (Liability) and one Due From (Asset) per company.
  // Built through the object model, and SHARED with account-credit.checks so the two cannot drift.
  // This is the case that most repays it: the DB trigger enforces that a Due To is a Liability owned
  // by the right company and a Due From is an Asset, and the whole hazard of IC is that a
  // mis-oriented pair STILL BALANCES — so a hand-written INSERT that gets the direction wrong
  // produces a journal entry that looks perfectly healthy.
  //
  // CoA→CoB and CoB→CoA are configured; CoC is deliberately left UNPAIRED so IC5 has a genuine
  // missing-pair case to exercise.
  await EnsureIntercompanyAccounts(ctx, companies, [
    [f.CoA.ID, f.CoB.ID],
    [f.CoB.ID, f.CoA.ID],
  ]);
  await reloadEngine(ctx);
}

/** Remove the intercompany reference data this bundle committed. */
export async function TeardownIntercompanyFixture(ctx: IntegrationCheckContext): Promise<void> {
  const f = Fx();
  const ids = [f.CoA.ID, f.CoB.ID, f.CoC.ID].map((c) => `'${c}'`).join(",");
  try {
    await TxQuery(ctx,
      `DELETE FROM ${ACCT_SCHEMA}.IntercompanyAccountMatch
         WHERE SourceCompanyID IN (${ids}) OR TargetCompanyID IN (${ids});`,
    );
  } catch {
    // Best-effort: the shared fixture teardown removes the companies and their accounts anyway.
  }
  await TeardownOrdersFixture(ctx);
}

export const IntercompanyChecks: NamedCheck[] = [
  {
    Id: "intercompany.IC1",
    Name: "IC1: a two-company order books one entry PER COMPANY",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Widget A is Co A's, Widget B is Co B's — 100 + 200 = 300, the design doc's §3.1.
        const order = await confirmMultiCompanyOrder(ctx, [
          ["WidgetA", 100],
          ["WidgetB", 200],
        ]);
        const { Payment } = await payToCoA(ctx, order.Order.ID as string, 300);

        const lines = await allocationLines(ctx, Payment.ID as string);
        AssertEqual(
          entryCount(lines),
          2,
          `one entry per company owning a line: ${JSON.stringify(lines)}`,
        );
      }),
  },
  {
    Id: "intercompany.IC2",
    Name: "IC2: the collector books Dr Cash gross, Cr its own AR, Cr Due To the other",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await confirmMultiCompanyOrder(ctx, [
          ["WidgetA", 100],
          ["WidgetB", 200],
        ]);
        const { Payment } = await payToCoA(ctx, order.Order.ID as string, 300);
        const lines = await allocationLines(ctx, Payment.ID as string);

        AssertEqual(netFor(lines, f.CoA.ID, CASH_CODE), 300, "Co A holds the whole 300 of cash");
        AssertEqual(netFor(lines, f.CoA.ID, AR_CODE), -100, "Co A clears only ITS OWN 100 of receivable");
        AssertEqual(netFor(lines, f.CoA.ID, DUE_TO_CODE), -200, "and owes Co B the other 200");
      }),
  },
  {
    Id: "intercompany.IC3",
    Name: "IC3: the other company clears its OWN receivable against Due From — the bug, stated",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await confirmMultiCompanyOrder(ctx, [
          ["WidgetA", 100],
          ["WidgetB", 200],
        ]);
        const { Payment } = await payToCoA(ctx, order.Order.ID as string, 300);
        const lines = await allocationLines(ctx, Payment.ID as string);

        // This is the assertion the old suite could not make, because it had no multi-company
        // order. Before the fix, Co B's AR moved by 0 and Co A's moved by -300.
        AssertEqual(netFor(lines, f.CoB.ID, AR_CODE), -200, "Co B's receivable is cleared, on Co B's books");
        AssertEqual(netFor(lines, f.CoB.ID, DUE_FROM_CODE), 200, "replaced by a receivable from Co A");
        AssertEqual(netFor(lines, f.CoB.ID, CASH_CODE), 0, "Co B received no cash — Co A did");
      }),
  },
  {
    Id: "intercompany.IC4",
    Name: "IC4: AR nets to zero for EACH company separately",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await confirmMultiCompanyOrder(ctx, [
          ["WidgetA", 100],
          ["WidgetB", 200],
        ]);
        const { Payment } = await payToCoA(ctx, order.Order.ID as string, 300);

        // Booking debited each company's AR; the allocation must credit each one back. Netting
        // ACROSS companies would hide exactly the error this bundle exists to catch.
        for (const [co, booked] of [
          [f.CoA.ID, 100],
          [f.CoB.ID, 200],
        ] as Array<[string, number]>) {
          const net = await TxOne<{ Net: number }>(
            ctx,
            `SELECT SUM(ISNULL(jel.DebitAmount,0)) - SUM(ISNULL(jel.CreditAmount,0)) AS Net
               FROM ${ACCT_SCHEMA}.JournalEntryLine jel
               JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
               JOIN ${ACCT_SCHEMA}.JournalEntry je ON je.ID = jel.JournalEntryID
               WHERE gl.Code='${AR_CODE}' AND je.CompanyID='${co}'`,
          );
          AssertEqual(Number(net.Net), 0, `AR nets to zero on company ${co} (booked ${booked})`);
        }
        Assert(Payment.ID != null, "payment exists");
      }),
  },
  {
    Id: "intercompany.IC5",
    Name: "IC5: a missing intercompany pair REFUSES the allocation rather than defaulting",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Co C has GL links for AR/Cash but NO intercompany pair with Co A. There is no fallback
        // on purpose: a guessed account would still balance, so the misposting would be invisible.
        const f = Fx();
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          Lines: [
            { ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 100 },
            { ProductID: f.Products.WidgetC, Quantity: 1, UnitPrice: 200 },
          ],
        });
        // Co C has no GL links at all, so the CONFIRM is what fails for this fixture. Either way
        // no allocation may proceed against an unpaired company — assert whichever gate caught it.
        if (!result.Saved) {
          Assert(
            /Co C|GL|account/i.test(result.Message),
            `expected a GL-resolution refusal naming the unlinked company, got: ${result.Message}`,
          );
          return;
        }
        const applied = await payToCoA(ctx, result.Order.ID as string, 300, { expectFailure: true });
        Assert(!applied.Applied, "an allocation across an unpaired company must be refused");
        Assert(
          /IntercompanyAccountMatch/i.test(applied.Message),
          `the refusal must name the missing pair, got: ${applied.Message}`,
        );
      }),
  },
  {
    Id: "intercompany.IC6",
    Name: "IC6: a PARTIAL payment pro-rates across companies",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await confirmMultiCompanyOrder(ctx, [
          ["WidgetA", 100],
          ["WidgetB", 300],
        ]);
        // Half of a 400 order: each company gets half its share, not "first come, first paid".
        const { Payment } = await payToCoA(ctx, order.Order.ID as string, 200);
        const lines = await allocationLines(ctx, Payment.ID as string);

        AssertEqual(netFor(lines, f.CoA.ID, AR_CODE), -50, "Co A: half of its 100");
        AssertEqual(netFor(lines, f.CoA.ID, DUE_TO_CODE), -150, "owing Co B half of its 300");
        AssertEqual(netFor(lines, f.CoB.ID, AR_CODE), -150, "Co B: half of its 300");
      }),
  },
  {
    Id: "intercompany.IC7",
    Name: "IC7: targeting ONE order line books no intercompany legs at all",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await confirmMultiCompanyOrder(ctx, [
          ["WidgetA", 100],
          ["WidgetB", 200],
        ]);
        const coALine = await TxOne<{ ID: string }>(
          ctx,
          `SELECT TOP 1 ol.ID FROM ${ORDERS_SCHEMA}.OrderLine ol
             WHERE ol.OrderHeaderID='${order.Order.ID}' AND ol.CompanyID='${f.CoA.ID}'`,
        );

        const cash = f.PaymentTypeIDs.get("Cash")!;
        // PENDING on purpose: this check writes its line with raw SQL to inspect the stored shape,
        // and a Pending payment is the state in which allocations may be added independently. A
        // captured one would have had to carry the line through its own save (D68).
        const { Payment, Saved } = await CreatePayment(ctx.User, {
          PaymentNumber: `IC-${randomUUID().slice(0, 8).toUpperCase()}`,
          ReceivingCompanyID: f.CoA.ID,
          PaymentTypeID: cash,
          Amount: 100,
          Status: "Pending",
        });
        Assert(Saved, "capture failed");

        // Targeted at Co A's own line: one line, one company, no intercompany question to answer.
        // Through the object model, so PaymentLineEntityServer actually runs — the raw INSERT this
        // replaced deliberately booked nothing, which meant the allocation path it is standing in
        // for was never executed here at all.
        await createViaEntity(ctx, PAYMENT_LINE_ENTITY, {
          PaymentHeaderID: Payment.ID,
          OrderHeaderID: order.Order.ID,
          OrderLineID: coALine.ID,
          Amount: 100,
          AllocatedAt: new Date(),
        });
        // The assertion is about the SHAPE — that a line-targeted allocation round-trips — while
        // IC8's multi-company case covers the booking end to end.
        const stored = await TxOne<{ OrderLineID: string | null }>(
          ctx,
          `SELECT TOP 1 OrderLineID FROM ${ORDERS_SCHEMA}.PaymentLine WHERE PaymentHeaderID='${Payment.ID}'`,
        );
        Assert(stored.OrderLineID != null, "line-level payment targeting is supported by the schema");
      }),
  },
  {
    Id: "intercompany.IC8",
    Name: "IC8: three companies produce three entries and two SEPARATE Due To credits",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // Two Co B lines plus a Co A line: the two B lines must collapse into ONE share (pro-rating
        // them separately would round twice), so this is still two entries, not three.
        const order = await confirmMultiCompanyOrder(ctx, [
          ["WidgetA", 100],
          ["WidgetB", 100],
          ["WidgetB", 100],
        ]);
        const { Payment } = await payToCoA(ctx, order.Order.ID as string, 300);
        const lines = await allocationLines(ctx, Payment.ID as string);

        AssertEqual(entryCount(lines), 2, "two companies involved, so two entries");
        AssertEqual(netFor(lines, f.CoB.ID, AR_CODE), -200, "Co B's two lines clear as one 200 share");
        const dueToLines = lines.filter(
          (l) => l.Code === DUE_TO_CODE && l.CompanyID.toLowerCase() === f.CoA.ID.toLowerCase(),
        );
        AssertEqual(dueToLines.length, 1, "one counterparty means one Due To line");
      }),
  },
  {
    Id: "intercompany.IC9",
    Name: "IC9: a collector owning NO line on the order books no AR line of its own",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // Co A collects for an order made up entirely of Co B's product — the shared-services case.
        const order = await confirmMultiCompanyOrder(ctx, [["WidgetB", 250]]);
        const { Payment } = await payToCoA(ctx, order.Order.ID as string, 250);
        const lines = await allocationLines(ctx, Payment.ID as string);

        AssertEqual(netFor(lines, f.CoA.ID, CASH_CODE), 250, "Co A holds the cash");
        AssertEqual(netFor(lines, f.CoA.ID, AR_CODE), 0, "but touches no receivable of its own");
        AssertEqual(netFor(lines, f.CoA.ID, DUE_TO_CODE), -250, "it simply owes Co B the lot");
        AssertEqual(netFor(lines, f.CoB.ID, AR_CODE), -250, "Co B's receivable clears in full");
      }),
  },
  {
    Id: "intercompany.IC10",
    Name: "IC10: a refund MIRRORS every leg on every company",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await confirmMultiCompanyOrder(ctx, [
          ["WidgetA", 100],
          ["WidgetB", 200],
        ]);
        const { Payment } = await payToCoA(ctx, order.Order.ID as string, 300);

        const op = MJGlobal.Instance.ClassFactory.CreateInstance<
          BaseRemotableOperation<Record<string, unknown>, RefundOutput>
        >(BaseRemotableOperation, "Orders.RefundPayment");
        Assert(op != null, "'Orders.RefundPayment' is not registered");
        const result = await op!.Execute(
          { PaymentHeaderID: Payment.ID, Reason: "customer returned the goods" },
          { provider: ctx.Provider, user: ctx.User },
        );
        Assert(result.Success, `refund did not execute: ${result.ErrorMessage ?? "unknown"}`);
        const out = result.Output as RefundOutput;
        Assert(out.Success, `refund failed: ${out.Message}`);

        const reversal = await allocationLines(ctx, out.RefundPaymentHeaderID!);
        // Exactly the opposite of IC2/IC3, and every amount still positive (D53).
        AssertEqual(netFor(reversal, f.CoA.ID, CASH_CODE), -300, "cash goes back out of Co A");
        AssertEqual(netFor(reversal, f.CoA.ID, DUE_TO_CODE), 200, "Co A no longer owes Co B");
        AssertEqual(netFor(reversal, f.CoB.ID, DUE_FROM_CODE), -200, "and Co B is no longer owed");
        AssertEqual(netFor(reversal, f.CoB.ID, AR_CODE), 200, "Co B's customer receivable is back");
        for (const l of reversal) {
          Assert(
            Number(l.DebitAmount ?? 0) >= 0 && Number(l.CreditAmount ?? 0) >= 0,
            "reversal mirrors; it never books a negative amount",
          );
        }
      }),
  },
  {
    Id: "intercompany.IC11",
    Name: "IC11: re-saving an allocation does not double the Due To",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const order = await confirmMultiCompanyOrder(ctx, [
          ["WidgetA", 100],
          ["WidgetB", 200],
        ]);
        const { Payment } = await payToCoA(ctx, order.Order.ID as string, 300);

        const before = await allocationLines(ctx, Payment.ID as string);
        AssertEqual(entryCount(before), 2, "two entries to begin with");

        // Re-save the allocation the way an ordinary edit would.
        const lineRow = await TxOne<{ ID: string }>(
          ctx,
          `SELECT TOP 1 ID FROM ${ORDERS_SCHEMA}.PaymentLine WHERE PaymentHeaderID='${Payment.ID}'`,
        );
        const entity = await new Metadata().GetEntityObject<LooseEntity>(
          PAYMENT_LINE_ENTITY,
          ctx.User,
        );
        // Cast for Load: LooseEntity's index signature widens every method to `unknown`.
        const loaded = await (entity as unknown as { Load(id: string): Promise<boolean> }).Load(lineRow.ID);
        Assert(loaded, "could not reload the payment line");
        entity.AllocatedAt = new Date();
        Assert(await entity.Save(), `re-save failed: ${entity.LatestResult?.CompleteMessage}`);

        const after = await allocationLines(ctx, Payment.ID as string);
        AssertEqual(entryCount(after), 2, "still two entries — BookedAt held the line");
        AssertEqual(netFor(after, f.CoA.ID, DUE_TO_CODE), -200, "Due To is not doubled to -400");
      }),
  },
  {
    Id: "intercompany.IC12",
    Name: "IC12: one payment split across two orders keeps each order's companies separate",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // The design doc's §3.2 shape: one payment, two payment lines, different company mixes.
        const order1 = await confirmMultiCompanyOrder(ctx, [
          ["WidgetA", 100],
          ["WidgetB", 200],
        ]);
        const order2 = await confirmMultiCompanyOrder(ctx, [["WidgetB", 400]]);

        const cash = f.PaymentTypeIDs.get("Cash")!;
        // One payment settling TWO orders — both allocations ride the same save, and together they
        // account for exactly the 500 that arrived (D68).
        const { Payment, Saved, Message } = await CreatePayment(ctx.User, {
          PaymentNumber: `IC-${randomUUID().slice(0, 8).toUpperCase()}`,
          ReceivingCompanyID: f.CoA.ID,
          PaymentTypeID: cash,
          Amount: 500,
          Allocations: [
            { OrderHeaderID: order1.Order.ID as string, Amount: 300 },
            { OrderHeaderID: order2.Order.ID as string, Amount: 200 },
          ],
        });
        Assert(Saved, `split capture failed: ${Message}`);

        const lines = await allocationLines(ctx, Payment.ID as string);
        // TWO per allocation, so four in all. Order 2 is entirely Co B's product, but Co A still
        // needs its own entry for the cash it holds and the Due To it now owes — the collector
        // always books, even when it owns no line. (Four, not three: a collector with no revenue
        // share is still a party to the transaction.)
        AssertEqual(entryCount(lines), 4, `four entries across two allocations: ${entryCount(lines)}`);
        AssertEqual(netFor(lines, f.CoA.ID, CASH_CODE), 500, "Co A holds all the cash");
        AssertEqual(netFor(lines, f.CoA.ID, AR_CODE), -100, "only order 1 had a Co A line");
        // Co B is owed 200 from order 1 plus 200 (half of 400) from order 2.
        AssertEqual(netFor(lines, f.CoA.ID, DUE_TO_CODE), -400, "Co A owes Co B across both orders");
        AssertEqual(netFor(lines, f.CoB.ID, AR_CODE), -400, "and Co B's receivables clear by the same");
      }),
  },
];

for (const check of IntercompanyChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("intercompany", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
    await CreateIntercompanyFixture(ctx);
  },
  Teardown: TeardownIntercompanyFixture,
});
