/**
 * ach-settlement — money that arrives days late, and can leave again (D77/D78/D80).
 *
 * WHY THIS BUNDLE EXISTS SEPARATELY FROM `payment-providers`. That bundle proves the gateway seam for
 * a rail that answers immediately: ask, get told, book. A bank debit breaks the assumption underneath
 * it. Nothing has moved when the caller asks, the answer arrives days later in a webhook, and it can
 * arrive a SECOND time — as a return, after the cash is already in the ledger. Every check below
 * exists because some part of that sequence is only observable against a real database.
 *
 * THE THREE THINGS ONLY A DATABASE CAN ANSWER, and each has already been wrong once:
 *
 *   · Does a capture through an async-settling provider actually land `Pending` rather than
 *     `Captured`? The status is decided by asking the DRIVER, and the driver is resolved from a
 *     provider row. Unit tests prove the decision; only a row proves the resolution.
 *
 *   · Does promoting `Pending → Captured` book the CASH LEG? This is the defect that motivated the
 *     bundle. `savePendingLines` writes the header's TRANSIENT `Lines` collection, which is empty on a
 *     promotion — so the allocations were persisted unbooked and nothing ever went back for them.
 *     `bookPersistedLines` closes it, and nothing but a ledger query can prove it.
 *
 *   · Does a return after settlement produce a REVERSING payment whose lines put the order's balance
 *     back? The rollups are trigger-maintained, so the answer lives in the database and nowhere else.
 *
 * THE STUB IS THE POINT, as in `payment-providers`. `PaymentProvider.IsLiveMode = 0` selects the
 * deterministic stub, so the real path — resolver, driver, fee split, journal entry, settlement —
 * runs with no network and no Stripe account.
 *
 * WEBHOOKS ARE DRIVEN THROUGH `SettlePaymentForEvent` RATHER THAN THROUGH HTTP. The route is proven by
 * unit tests (signature, idempotency, status codes); what is unproven is what settlement does to real
 * rows. Posting to an Express endpoint would add a server, a signing secret and a transaction boundary
 * this suite deliberately does not have — and would test the transport rather than the effect.
 *
 * CONNECTS TO:
 *   CODE: PaymentIntentService · StripeACHPaymentProvider · PaymentSettlement · PaymentReversalFactory
 *   PURE: packages/CoreEntitiesServer/src/__tests__/AchSettlement{,Edges}.test.ts (103 tests)
 *   DOC:  plans/archive/bizapps-orders-master.md D77, D78, D80
 */
import { randomUUID } from "crypto";
import { DerivePaymentStatus } from "@mj-biz-apps/orders-entities";
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
  CreateProductPrice,
  createViaEntity,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxMaybeOne,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { PAYMENT_PROVIDER_ENTITY, PAYMENT_PROVIDER_TYPE_ENTITY } from "../entity-names.js";
import { ConfirmOrder } from "../order-builder.js";
import { CreatePayment } from "../payment-builder.js";
// STATIC, per the repo rule — no dynamic import()/require() anywhere.
import { OpenPaymentIntent, SettlePaymentForEvent } from "@mj-biz-apps/orders-core-entities-server";
import type { WebhookEvent } from "@mj-biz-apps/orders-core-entities-server";

/** The `PaymentProviderType.Code` the ACH driver registers under. */
const ACH_TYPE = "StripeACH";

/**
 * A configured bank-debit provider account.
 *
 * Creates the TYPE if the app metadata has not seeded it — a bundle that assumed the row was present
 * failed on every freshly rebuilt database, and a fixture that depends on a separate deployment step
 * makes its result depend on something it does not control.
 */
async function makeAchProvider(ctx: IntegrationCheckContext): Promise<string> {
  const f = Fx();
  const existing = await TxMaybeOne<{ ID: string }>(
    ctx,
    `SELECT ID FROM ${ORDERS_SCHEMA}.PaymentProviderType WHERE Code='${ACH_TYPE}'`,
  );
  const typeID =
    existing?.ID ??
    (await createViaEntity(ctx, PAYMENT_PROVIDER_TYPE_ENTITY, {
      Code: ACH_TYPE,
      Name: "Stripe ACH",
      Description: "US bank debits. Settles on the bank's schedule.",
      DriverClass: "StripeACHPaymentProvider",
      SupportsTokenization: 1,
      SupportsRefund: 1,
      SupportsWebhooks: 1,
      Sequence: 15,
      IsActive: 1,
    }));

  return createViaEntity(ctx, PAYMENT_PROVIDER_ENTITY, {
    PaymentProviderTypeID: typeID,
    CompanyID: f.CoA.ID,
    Name: "IT StripeACH",
    CredentialsRef: null,
    IsLiveMode: 0,
    IsActive: 1,
  });
}

/** An order to collect against. */
async function sellSomething(ctx: IntegrationCheckContext, amount = 300) {
  const f = Fx();
  await CreateProductPrice(ctx, f.Products.WidgetA, amount);
  const order = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
  });
  Assert(order.Saved, `the order must confirm before it can be paid: ${order.Message}`);
  return order;
}

/**
 * Open an intent through the REAL service, then capture against it.
 *
 * Goes through `OpenPaymentIntent` rather than inserting a `PaymentIntent` row by hand, because the
 * row's shape is exactly what was never exercised — and creating the thing under test by hand means
 * the code under test does not run.
 */
async function openAndCapture(
  ctx: IntegrationCheckContext,
  opts: { providerID: string; orderID: string; amount: number },
) {
  const f = Fx();
  const typeID = [...f.PaymentTypeIDs.entries()].find(([c]) => c !== "AccountCredit")?.[1];
  Assert(typeID != null, "an ordinary payment type is seeded");

  const intent = await OpenPaymentIntent(
    {
      PaymentProviderID: opts.providerID,
      Amount: opts.amount,
      CurrencyCode: "USD",
      OrderHeaderID: opts.orderID,
      BillToOrganizationID: f.Customers.OrganizationID,
    },
    ctx.Provider,
    ctx.User,
  );
  Assert(intent.Success, `the intent must open: ${intent.Reason}`);

  const created = await CreatePayment(ctx.User, {
    PaymentNumber: `AS-${randomUUID().slice(0, 8).toUpperCase()}`,
    ReceivingCompanyID: f.CoA.ID,
    PaymentTypeID: typeID!,
    Amount: opts.amount,
    BillToOrganizationID: f.Customers.OrganizationID,
    PaymentProviderID: opts.providerID,
    PaymentIntentID: intent.PaymentIntentID ?? null,
    Allocations: [{ OrderHeaderID: opts.orderID, Amount: opts.amount }],
  });

  return { Intent: intent, Payment: created };
}

/** The gateway event a settlement acts on, in the shape the drivers produce. */
const event = (over: Partial<WebhookEvent> = {}): WebhookEvent => ({
  EventID: `evt_${randomUUID().slice(0, 12)}`,
  Kind: "payment_intent.succeeded",
  Status: "Succeeded",
  CurrencyCode: "USD",
  ...over,
});

const headerRow = (ctx: IntegrationCheckContext, paymentID: string) =>
  TxOne<{
    Status: string;
    Amount: number;
    Fee: number;
    Net: number | null;
    JournalEntryID: string | null;
    IntentID: string | null;
  }>(
    ctx,
    `SELECT Status, Amount, ProcessingFeeAmount AS Fee, NetAmount AS Net,
            JournalEntryID, PaymentIntentID AS IntentID
       FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE ID='${paymentID}'`,
  );

/** How many of a payment's allocations have booked, and how many exist. */
const lineBooking = (ctx: IntegrationCheckContext, paymentID: string) =>
  TxOne<{ Lines: number; Booked: number }>(
    ctx,
    `SELECT COUNT(*) AS Lines, SUM(CASE WHEN BookedAt IS NOT NULL THEN 1 ELSE 0 END) AS Booked
       FROM ${ORDERS_SCHEMA}.PaymentLine WHERE PaymentHeaderID='${paymentID}'`,
  );

/** Entries whose provenance points at this payment's allocations, and whether they balance. */
const ledgerFor = (ctx: IntegrationCheckContext, paymentID: string) =>
  TxOne<{ Entries: number; Unbalanced: number }>(
    ctx,
    `WITH e AS (
        SELECT je.ID,
               SUM(CASE WHEN jel.DebitAmount  IS NOT NULL THEN jel.DebitAmount  ELSE 0 END) AS D,
               SUM(CASE WHEN jel.CreditAmount IS NOT NULL THEN jel.CreditAmount ELSE 0 END) AS C
          FROM ${ACCT_SCHEMA}.JournalEntry je
          JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
         WHERE je.ID IN (SELECT ph.JournalEntryID FROM ${ORDERS_SCHEMA}.PaymentHeader ph
                          WHERE ph.ID = '${paymentID}' AND ph.JournalEntryID IS NOT NULL)
            OR je.LinkedRecordID IN (SELECT CAST(pl.ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.PaymentLine pl
                                      WHERE pl.PaymentHeaderID = '${paymentID}')
         GROUP BY je.ID)
     SELECT COUNT(*) AS Entries,
            SUM(CASE WHEN ABS(ISNULL(D,0)-ISNULL(C,0)) > 0.005 THEN 1 ELSE 0 END) AS Unbalanced
       FROM e`,
  );

const orderRow = async (ctx: IntegrationCheckContext, orderID: string) => {
  const row = await TxOne<{ Balance: number; AmountPaid: number; TotalGross: number }>(
    ctx,
    `SELECT Balance, AmountPaid, TotalGross FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${orderID}'`,
  );
  return {
    ...row,
    PaymentStatus: DerivePaymentStatus(row.TotalGross, row.AmountPaid, row.Balance),
  };
};

export const AchSettlementChecks: NamedCheck[] = [
  // ── Opening an intent ───────────────────────────────────────────────────────────────────────
  {
    Id: "ach-settlement.AS1",
    Name: "AS1: OpenPaymentIntent WRITES a PaymentIntent row the capture path can read",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const providerID = await makeAchProvider(ctx);
        const result = await OpenPaymentIntent(
          {
            PaymentProviderID: providerID,
            Amount: 250,
            CurrencyCode: "USD",
            BillToOrganizationID: f.Customers.OrganizationID,
          },
          ctx.Provider,
          ctx.User,
        );

        Assert(result.Success, `the intent must open: ${result.Reason}`);
        Assert(result.PaymentIntentID != null, "and it must return OUR row id, not just the gateway's");

        const row = await TxOne<{ Status: string; Amount: number; ProviderIntentID: string }>(
          ctx,
          `SELECT Status, Amount, ProviderIntentID FROM ${ORDERS_SCHEMA}.PaymentIntent WHERE ID='${result.PaymentIntentID}'`,
        );
        // A bank debit opens ALREADY SUBMITTED. RequiresPayment would be a card's opening state.
        AssertEqual(row.Status, "Processing", "a bank debit opens as Processing");
        AssertEqual(Number(row.Amount), 250, "carrying the amount it was opened for");
        Assert(row.ProviderIntentID?.length > 0, "and the gateway's own id");
      }),
  },
  {
    Id: "ach-settlement.AS2",
    Name: "AS2: the client secret is NEVER persisted",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // It authorises a browser to confirm this intent. A bearer credential in a table reporting
        // reads is the kind of leak nobody finds until it is quoted back at them.
        const providerID = await makeAchProvider(ctx);
        const result = await OpenPaymentIntent(
          { PaymentProviderID: providerID, Amount: 100, CurrencyCode: "USD" },
          ctx.Provider,
          ctx.User,
        );
        Assert(result.Success, "the intent opens");

        const cols = await TxQuery<{ Name: string }>(
          ctx,
          `SELECT c.name AS Name FROM sys.columns c
             JOIN sys.tables t ON t.object_id = c.object_id
             JOIN sys.schemas s ON s.schema_id = t.schema_id
            WHERE s.name = '${ORDERS_SCHEMA.replace(/^\[|\]$/g, "")}' AND t.name = 'PaymentIntent'`,
        );
        const secretish = cols.filter((c) => /secret|clientsecret/i.test(c.Name));
        AssertEqual(secretish.length, 0, "PaymentIntent has no column a client secret could land in");
      }),
  },
  {
    Id: "ach-settlement.AS3",
    Name: "AS3: a repeated open REUSES the intent rather than opening a second",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // ProviderIntentID is UNIQUE and the stub is deterministic per order, so a second call
        // arrives holding an id we already have. Against a saved instrument, inserting instead of
        // reusing is how a customer gets charged twice.
        const providerID = await makeAchProvider(ctx);
        const order = await sellSomething(ctx, 300);

        const first = await OpenPaymentIntent(
          { PaymentProviderID: providerID, Amount: 300, CurrencyCode: "USD", OrderHeaderID: order.Order.ID as string },
          ctx.Provider,
          ctx.User,
        );
        const second = await OpenPaymentIntent(
          { PaymentProviderID: providerID, Amount: 300, CurrencyCode: "USD", OrderHeaderID: order.Order.ID as string },
          ctx.Provider,
          ctx.User,
        );

        Assert(first.Success && second.Success, "both calls succeed");
        AssertEqual(second.PaymentIntentID, first.PaymentIntentID, "the second call reuses the first row");
        Assert(second.WasExisting === true, "and says so");

        const count = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.PaymentIntent
            WHERE ProviderIntentID='${first.ProviderIntentID}'`,
        );
        AssertEqual(Number(count.N), 1, "exactly one row exists for the gateway's intent");
      }),
  },

  // ── The delayed capture ─────────────────────────────────────────────────────────────────────
  {
    Id: "ach-settlement.AS4",
    Name: "AS4: capturing through an ACH provider lands PENDING, and books NOTHING",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The whole rail in one assertion. Nothing has moved when the caller asks, so a payment that
        // recorded Captured would put cash in the ledger four days before it exists.
        const providerID = await makeAchProvider(ctx);
        const order = await sellSomething(ctx, 300);
        const { Payment } = await openAndCapture(ctx, { providerID, orderID: order.Order.ID as string, amount: 300 });

        Assert(Payment.Saved, `the payment must save: ${Payment.Message}`);
        const header = await headerRow(ctx, Payment.Payment.ID as string);
        AssertEqual(header.Status, "Pending", "a bank debit is Pending until the bank answers");
        Assert(header.JournalEntryID == null, "and no fee entry has been booked");

        const ledger = await ledgerFor(ctx, Payment.Payment.ID as string);
        AssertEqual(Number(ledger.Entries), 0, "no cash leg exists yet — the money has not arrived");
      }),
  },
  {
    Id: "ach-settlement.AS5",
    Name: "AS5: the allocations PERSIST while Pending, unbooked",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The debt that AS6 discharges. Lines must exist — so the promotion has something to book —
        // and must carry no BookedAt, so booking them later is not a double-book.
        const providerID = await makeAchProvider(ctx);
        const order = await sellSomething(ctx, 300);
        const { Payment } = await openAndCapture(ctx, { providerID, orderID: order.Order.ID as string, amount: 300 });

        const lines = await lineBooking(ctx, Payment.Payment.ID as string);
        AssertEqual(Number(lines.Lines), 1, "the allocation was written");
        AssertEqual(Number(lines.Booked ?? 0), 0, "and has NOT booked, exactly as PaymentLineEntityServer intends");
      }),
  },
  {
    Id: "ach-settlement.AS6",
    Name: "AS6: promoting Pending → Captured BOOKS THE CASH LEG",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // THE DEFECT THIS BUNDLE EXISTS FOR. savePendingLines writes the header's TRANSIENT Lines
        // collection, which is empty on a promotion — so without bookPersistedLines the payment goes
        // Captured, the fee books, and the CASH LEG never does. The order looks paid and the ledger
        // has no record of the money.
        const providerID = await makeAchProvider(ctx);
        const order = await sellSomething(ctx, 300);
        const { Intent, Payment } = await openAndCapture(ctx, { providerID, orderID: order.Order.ID as string, amount: 300 });
        const paymentID = Payment.Payment.ID as string;

        const outcome = await SettlePaymentForEvent(
          event({ ProviderIntentID: Intent.ProviderIntentID }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );
        AssertEqual(outcome.Action, "Promote", "the bank confirmed, so the payment is promoted");

        const header = await headerRow(ctx, paymentID);
        AssertEqual(header.Status, "Captured", "the payment is now Captured");

        const lines = await lineBooking(ctx, paymentID);
        AssertEqual(Number(lines.Booked ?? 0), Number(lines.Lines), "EVERY allocation has booked");

        const ledger = await ledgerFor(ctx, paymentID);
        Assert(Number(ledger.Entries) > 0, "the cash leg is in the ledger");
        AssertEqual(Number(ledger.Unbalanced), 0, "and every entry balances");
      }),
  },
  {
    Id: "ach-settlement.AS7",
    Name: "AS7: a redelivered success does NOT book twice",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Gateways retry on success too. BookedAt is the allocation's idempotency key and JournalEntryID
        // is the header's; both have to hold, or a redelivery doubles the cash.
        const providerID = await makeAchProvider(ctx);
        const order = await sellSomething(ctx, 300);
        const { Intent, Payment } = await openAndCapture(ctx, { providerID, orderID: order.Order.ID as string, amount: 300 });
        const paymentID = Payment.Payment.ID as string;

        await SettlePaymentForEvent(
          event({ ProviderIntentID: Intent.ProviderIntentID }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );
        const afterFirst = await ledgerFor(ctx, paymentID);

        const second = await SettlePaymentForEvent(
          event({ ProviderIntentID: Intent.ProviderIntentID }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );
        AssertEqual(second.Action, "None", "the second delivery is a no-op");

        const afterSecond = await ledgerFor(ctx, paymentID);
        AssertEqual(Number(afterSecond.Entries), Number(afterFirst.Entries), "no additional entries were booked");
      }),
  },
  {
    Id: "ach-settlement.AS8",
    Name: "AS8: the promoted payment moves the ORDER's trigger-maintained rollups",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Balance and PaymentStatus are maintained by triggers on PaymentLine (D41). A promotion that
        // booked the ledger but left the order looking unpaid would be invisible to the ledger tests
        // and glaring on an aging report.
        const providerID = await makeAchProvider(ctx);
        const order = await sellSomething(ctx, 300);
        const { Intent, Payment } = await openAndCapture(ctx, { providerID, orderID: order.Order.ID as string, amount: 300 });
        void Payment;

        const before = await orderRow(ctx, order.Order.ID as string);
        Assert(Number(before.Balance) > 0, "the order is owed before the bank answers");

        await SettlePaymentForEvent(
          event({ ProviderIntentID: Intent.ProviderIntentID }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );

        const after = await orderRow(ctx, order.Order.ID as string);
        AssertEqual(Number(after.Balance), 0, "and settled after it does");
        AssertEqual(Number(after.AmountPaid), 300, "with the cash applied");
      }),
  },

  // ── Returns ─────────────────────────────────────────────────────────────────────────────────
  {
    Id: "ach-settlement.AS9",
    Name: "AS9: a debit that fails BEFORE settling marks the payment Failed and books nothing",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const providerID = await makeAchProvider(ctx);
        const order = await sellSomething(ctx, 300);
        const { Intent, Payment } = await openAndCapture(ctx, { providerID, orderID: order.Order.ID as string, amount: 300 });
        const paymentID = Payment.Payment.ID as string;

        const outcome = await SettlePaymentForEvent(
          event({
            Kind: "charge.failed",
            Status: "Failed",
            ProviderIntentID: Intent.ProviderIntentID,
            FailureReason: "insufficient funds",
          }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );
        AssertEqual(outcome.Action, "Fail", "nothing was booked, so nothing reverses");

        const header = await headerRow(ctx, paymentID);
        AssertEqual(header.Status, "Failed", "the payment records the attempt that did not clear");

        const ledger = await ledgerFor(ctx, paymentID);
        AssertEqual(Number(ledger.Entries), 0, "and the ledger never heard about it");
      }),
  },
  {
    Id: "ach-settlement.AS10",
    Name: "AS10: a RETURN after settlement writes a reversing payment, not an edit",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Editing the original would erase a true fact about a past date, possibly in a closed period.
        // The original must survive untouched with its Captured status and its entry.
        const providerID = await makeAchProvider(ctx);
        const order = await sellSomething(ctx, 300);
        const { Intent, Payment } = await openAndCapture(ctx, { providerID, orderID: order.Order.ID as string, amount: 300 });
        const paymentID = Payment.Payment.ID as string;

        await SettlePaymentForEvent(
          event({ ProviderIntentID: Intent.ProviderIntentID }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );

        const outcome = await SettlePaymentForEvent(
          event({
            Kind: "charge.failed",
            Status: "Failed",
            ProviderIntentID: Intent.ProviderIntentID,
            FailureReason: "account closed",
          }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );
        AssertEqual(outcome.Action, "Reverse", "the money came back out");
        Assert(outcome.ReversalPaymentHeaderID != null, "and a reversing payment was written");

        const original = await headerRow(ctx, paymentID);
        AssertEqual(original.Status, "Captured", "the ORIGINAL is untouched — it really did happen");

        const reversal = await TxOne<{ Status: string; Amount: number; Reverses: string; Reason: string | null }>(
          ctx,
          `SELECT Status, Amount, ReversesPaymentHeaderID AS Reverses, ReversalReason AS Reason
             FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE ID='${outcome.ReversalPaymentHeaderID}'`,
        );
        AssertEqual(reversal.Status, "Refunded", "the reversal books the MIRROR of the capture entry");
        AssertEqual(Number(reversal.Amount), 300, "for the full amount — a bank does not return part of a debit");
        Assert(String(reversal.Reason ?? "").includes("account closed"), "carrying the bank's own words");
      }),
  },
  {
    Id: "ach-settlement.AS11",
    Name: "AS11: the reversal puts the order's BALANCE back",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The negative allocation lines are what move the rollups. A reversal that booked the ledger
        // but left the order looking settled is money we would never chase.
        const providerID = await makeAchProvider(ctx);
        const order = await sellSomething(ctx, 300);
        const { Intent } = await openAndCapture(ctx, { providerID, orderID: order.Order.ID as string, amount: 300 });

        await SettlePaymentForEvent(
          event({ ProviderIntentID: Intent.ProviderIntentID }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );
        AssertEqual(Number((await orderRow(ctx, order.Order.ID as string)).Balance), 0, "settled after the bank confirmed");

        await SettlePaymentForEvent(
          event({ Kind: "charge.failed", Status: "Failed", ProviderIntentID: Intent.ProviderIntentID }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );

        const after = await orderRow(ctx, order.Order.ID as string);
        AssertEqual(Number(after.Balance), 300, "and owed again once the debit came back");
        AssertEqual(Number(after.AmountPaid), 0, "with the cash un-applied");
      }),
  },
  {
    Id: "ach-settlement.AS12",
    Name: "AS12: a second return does NOT reverse twice",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const providerID = await makeAchProvider(ctx);
        const order = await sellSomething(ctx, 300);
        const { Intent } = await openAndCapture(ctx, { providerID, orderID: order.Order.ID as string, amount: 300 });

        await SettlePaymentForEvent(
          event({ ProviderIntentID: Intent.ProviderIntentID }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );
        await SettlePaymentForEvent(
          event({ Kind: "charge.failed", Status: "Failed", ProviderIntentID: Intent.ProviderIntentID }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );

        const second = await SettlePaymentForEvent(
          event({ Kind: "charge.failed", Status: "Failed", ProviderIntentID: Intent.ProviderIntentID }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );
        AssertEqual(second.Action, "None", "AlreadyReversed suppresses the second reversal");

        const reversals = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.PaymentHeader
            WHERE ReversesPaymentHeaderID IS NOT NULL AND Status='Refunded'
              AND ReversesPaymentHeaderID IN (
                SELECT ID FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE PaymentIntentID='${Intent.PaymentIntentID}')`,
        );
        AssertEqual(Number(reversals.N), 1, "exactly one reversal exists");
      }),
  },

  // ── Refusals and the untouched card path ────────────────────────────────────────────────────
  {
    Id: "ach-settlement.AS13",
    Name: "AS13: settling an intent with NO payment behind it is a no-op, not an error",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // An abandoned checkout. Not an error — a gateway account may serve more than this
        // application, and there is simply nothing to settle.
        const providerID = await makeAchProvider(ctx);
        const intent = await OpenPaymentIntent(
          { PaymentProviderID: providerID, Amount: 120, CurrencyCode: "USD" },
          ctx.Provider,
          ctx.User,
        );
        Assert(intent.Success, "the intent opens");

        const outcome = await SettlePaymentForEvent(
          event({ ProviderIntentID: intent.ProviderIntentID }),
          intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );
        AssertEqual(outcome.Action, "None", "nothing to settle");
        Assert(outcome.PaymentHeaderID == null, "and no payment was named");
      }),
  },
  {
    Id: "ach-settlement.AS14",
    Name: "AS14: a payment with NO provider still captures synchronously — the card path is untouched",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The regression guard for the whole change. `settlesAsynchronously` defaults to false, so a
        // recorded payment — cheque, wire, back-office correction — must land Captured and book in one
        // act exactly as it always did.
        const f = Fx();
        const order = await sellSomething(ctx, 300);
        const typeID = [...f.PaymentTypeIDs.entries()].find(([c]) => c !== "AccountCredit")?.[1];

        const created = await CreatePayment(ctx.User, {
          PaymentNumber: `AS-${randomUUID().slice(0, 8).toUpperCase()}`,
          ReceivingCompanyID: f.CoA.ID,
          PaymentTypeID: typeID!,
          Amount: 300,
          BillToOrganizationID: f.Customers.OrganizationID,
          Allocations: [{ OrderHeaderID: order.Order.ID as string, Amount: 300 }],
        });
        Assert(created.Saved, `a provider-less payment saves: ${created.Message}`);

        const header = await headerRow(ctx, created.Payment.ID as string);
        AssertEqual(header.Status, "Captured", "and captures immediately");

        const lines = await lineBooking(ctx, created.Payment.ID as string);
        AssertEqual(Number(lines.Booked ?? 0), Number(lines.Lines), "booking in the same act");

        const ledger = await ledgerFor(ctx, created.Payment.ID as string);
        Assert(Number(ledger.Entries) > 0, "with a cash leg");
        AssertEqual(Number(ledger.Unbalanced), 0, "that balances");
      }),
  },
  {
    Id: "ach-settlement.AS15",
    Name: "AS15: the promoted payment's FEE is the bank-debit rate, not the card rate",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // $300 costs $2.40 by bank debit and $9.00 by card. The fee is a real ledger leg, and the
        // driver — not the caller — is the authority on it.
        const providerID = await makeAchProvider(ctx);
        const order = await sellSomething(ctx, 300);
        const { Intent, Payment } = await openAndCapture(ctx, { providerID, orderID: order.Order.ID as string, amount: 300 });

        await SettlePaymentForEvent(
          event({ ProviderIntentID: Intent.ProviderIntentID }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );

        const header = await headerRow(ctx, Payment.Payment.ID as string);
        AssertEqual(Number(header.Fee), 2.4, "0.8% of 300");
        AssertEqual(Number(header.Net), 297.6, "and net reconciles to gross minus fee");
      }),
  },
  {
    Id: "ach-settlement.AS16",
    Name: "AS16: the payment is linked to the intent it settles",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Without this link `settleWithProvider` refuses with "there is nothing for the gateway to
        // capture" — the exact state the whole path sat in before Orders.OpenPaymentIntent existed.
        const providerID = await makeAchProvider(ctx);
        const order = await sellSomething(ctx, 300);
        const { Intent, Payment } = await openAndCapture(ctx, { providerID, orderID: order.Order.ID as string, amount: 300 });

        const header = await headerRow(ctx, Payment.Payment.ID as string);
        Assert(header.IntentID != null, "the payment names its intent");
        AssertEqual(String(header.IntentID).toLowerCase(), String(Intent.PaymentIntentID).toLowerCase(), "the one that was opened for it");

        const found = await TxMaybeOne<{ ID: string }>(
          ctx,
          `SELECT ID FROM ${ORDERS_SCHEMA}.PaymentIntent WHERE ID='${header.IntentID}'`,
        );
        Assert(found != null, "and that intent is a real row");
      }),
  },
  {
    Id: "ach-settlement.AS17",
    Name: "AS17: the fee is RECORDED but NOT booked as a journal entry (D82, default off)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The proof of D82. A per-payment fee leg cannot reconcile to a bank statement — the
        // processor batches into payouts and deducts costs that never attach to any payment — so the
        // whole processor cost is accrued at month end instead. The fee is still READ from the
        // gateway and still stored, because per-payment attribution is useful information; it simply
        // does not become an entry unless the tender's PaymentType.BookProcessingFeeInline is 1.
        const providerID = await makeAchProvider(ctx);
        const order = await sellSomething(ctx, 300);
        const { Intent, Payment } = await openAndCapture(ctx, { providerID, orderID: order.Order.ID as string, amount: 300 });
        const paymentID = Payment.Payment.ID as string;

        await SettlePaymentForEvent(
          event({ ProviderIntentID: Intent.ProviderIntentID }),
          Intent.PaymentIntentID!,
          ctx.Provider,
          ctx.User,
        );

        const header = await headerRow(ctx, paymentID);
        AssertEqual(header.Status, "Captured", "the payment captured");
        Assert(Number(header.Fee) > 0, "the gateway's fee IS recorded on the row");
        Assert(
          header.JournalEntryID == null,
          "and produced NO fee journal entry — the header's JournalEntryID is the fee entry's stamp, " +
            "so a value here would mean the accrual model is not actually the default",
        );

        // The ALLOCATION entries still exist: cash and receivable are per-payment, only the fee moved.
        const ledger = await ledgerFor(ctx, paymentID);
        Assert(Number(ledger.Entries) > 0, "the cash leg still books, as it always did");
        AssertEqual(Number(ledger.Unbalanced), 0, "and balances");
      }),
  },
];

for (const check of AchSettlementChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("ach-settlement", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: TeardownOrdersFixture,
});
