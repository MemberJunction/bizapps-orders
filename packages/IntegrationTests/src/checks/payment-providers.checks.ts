/**
 * payment-providers — the gateway seam, against a real database (D19/D37).
 *
 * WHY THIS BUNDLE HAD TO EXIST BEFORE THE CODE COULD BE TRUSTED. The drivers were unit-tested and
 * mutation-tested, and that proved the arithmetic. What it could not prove is that the ROWS are what
 * the code thinks they are — and they were not. Two assumptions failed the moment anything read a real
 * schema:
 *
 *   · `PaymentHeader` has no `ProviderIntentID`. The gateway's string lives on `PaymentIntent`; the
 *     header holds a foreign key to that row. Reading it off the header COMPILES, because every column
 *     access on the server subclass is a cast, and returns `undefined` at run time — refusing every
 *     provider-backed capture with a message about a missing intent.
 *   · There is no `CurrencyCode` on a payment at all (MOD-4). It is a property of the collecting
 *     company, and reading it from the payment silently produced `undefined`.
 *
 * Both were found by running, not by reading. So the checks below are deliberately weighted toward the
 * things only a database can answer: does the provider row resolve, does the driver reach the entity,
 * does the fee land where the ledger expects it.
 *
 * THE STUB IS THE POINT. `PaymentProvider.IsLiveMode = 0` selects Stripe's deterministic stub, so this
 * bundle exercises the real capture path — resolver, driver, fee split, journal entry — with no network
 * and no Stripe account. The live path is Marcelo's to verify against a sandbox.
 *
 * CONNECTS TO:
 *   CODE: PaymentProviderResolver · BasePaymentProvider · PaymentHeaderEntityServer.settleWithProvider
 *   PURE: packages/CoreEntitiesServer/src/__tests__/PaymentProviderBehavior.test.ts (98 tests)
 *   DOC:  plans/archive/bizapps-orders-master.md D18, D19, D37
 *
 * PV13–PV16 cover an order created from a charge that matched nothing (#481): the stub has no charges
 * to read, so each check hands `CreateOrderFromGatewayCharge` the charge the gateway would report.
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
  CreateProductPrice,
  ACCT_SCHEMA,
  CreateOrdersFixture,
  createViaEntity,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxMaybeOne,
  TxOne,
  TxQuery,
} from "../fixture.js";
import {
  PAYMENT_INTENT_ENTITY,
  PAYMENT_PROVIDER_ENTITY,
  PAYMENT_PROVIDER_TYPE_ENTITY,
} from "../entity-names.js";
import { ConfirmOrder } from "../order-builder.js";
// STATIC, per the repo rule — no dynamic import()/require() anywhere.
import {
  CreateOrderFromGatewayCharge,
  LoadPaymentProviderConfig,
  ResolvePaymentProvider,
  type GatewayCharge,
} from "@mj-biz-apps/orders-core-entities-server";
import { CreatePayment, CapturePayment } from "../payment-builder.js";

async function addPrice(ctx: IntegrationCheckContext, productID: string, amount: number): Promise<void> {
  // Delegates to the shared builder so the price goes through `ProductPriceEntityServer` and its
  // ambiguity guard, rather than around it. Idempotent per product — see CreateProductPrice.
  await CreateProductPrice(ctx, productID, amount);
}

/** A configured provider account of the given type. `live` selects the real path over the stub. */
async function makeProvider(
  ctx: IntegrationCheckContext,
  typeCode: string,
  opts: { live?: boolean; active?: boolean } = {},
): Promise<string> {
  const f = Fx();

  // CREATE THE TYPE IF THE APP METADATA HAS NOT SEEDED IT.
  //
  // `PaymentProviderType` rows are application metadata pushed by `mj sync`, and a bundle that assumed
  // they were present failed on a database where they were not — which is every freshly rebuilt one
  // until the push runs. Fixtures create the reference data they need; depending on a separate
  // deployment step makes a check's result depend on something it does not control.
  //
  // The Code is what matters: it IS the ClassFactory key (D37), so a row created here resolves to the
  // same driver the seeded one would.
  const existingType = await TxMaybeOne<{ ID: string }>(ctx,
    `SELECT ID FROM ${ORDERS_SCHEMA}.PaymentProviderType WHERE Code='${typeCode}'`);
  const typeID =
    existingType?.ID ??
    (await createViaEntity(ctx, PAYMENT_PROVIDER_TYPE_ENTITY, {
      Code: typeCode,
      Name: `IT ${typeCode}`,
      DriverClass: `${typeCode}PaymentProvider`,
      SupportsTokenization: 0,
      SupportsRefund: 1,
      SupportsWebhooks: typeCode === "Stripe" ? 1 : 0,
      Sequence: 90,
      IsActive: 1,
    }));

  return createViaEntity(ctx, PAYMENT_PROVIDER_ENTITY, {
    PaymentProviderTypeID: typeID,
    CompanyID: f.CoA.ID,
    Name: `IT ${typeCode}`,
    CredentialsRef: null,
    IsLiveMode: opts.live ? 1 : 0,
    IsActive: opts.active === false ? 0 : 1,
  });
}

/** A provider-side intent, as `Orders.CreatePaymentIntent` would open. */
async function makeIntent(
  ctx: IntegrationCheckContext,
  providerID: string,
  amount: number,
  orderID?: string,
): Promise<{ ID: string; ProviderIntentID: string }> {
  const providerIntentID = `pi_it_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const id = await createViaEntity(ctx, PAYMENT_INTENT_ENTITY, {
    PaymentProviderID: providerID,
    ProviderIntentID: providerIntentID,
    Status: "RequiresPayment",
    Amount: amount,
    OrderHeaderID: orderID ?? null,
  });
  return { ID: id, ProviderIntentID: providerIntentID };
}

/** An order to collect against. */
async function sellSomething(ctx: IntegrationCheckContext, amount = 300) {
  const f = Fx();
  await addPrice(ctx, f.Products.WidgetA, amount);
  const order = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
  });
  Assert(order.Saved, `the order must confirm before it can be paid: ${order.Message}`);
  return order;
}

/**
 * Create a payment WITH its allocation and capture it, in ONE save — the real path.
 *
 * Two lessons are baked into this shape, both learned the hard way here.
 *
 * FIRST: it goes through the object model. It used to insert both rows with raw SQL, and PV12 caught
 * what that cost — `PaymentLineEntityServer` never ran, so the allocation's cash leg was never booked.
 * Creating the thing under test by hand means the code under test does not run.
 *
 * SECOND: it captures in the SAME save rather than creating `Pending` and capturing after. The
 * allocation books during `savePendingLines`, which reads the header's TRANSIENT `Lines` collection —
 * and a header loaded fresh from the database has an empty one. So a two-step create-then-capture
 * saves the lines while the payment is still Pending, books nothing, and leaves a captured payment
 * with no cash leg. That is the shape `CreatePayment` means by "Captured — the status that books".
 */
async function capturePayment(
  ctx: IntegrationCheckContext,
  opts: { providerID?: string | null; paymentIntentID?: string | null; orderID: string; amount: number },
): Promise<{ ID: string | null; Saved: boolean; Message: string }> {
  const f = Fx();
  const typeID = [...f.PaymentTypeIDs.entries()].find(([c]) => c !== "AccountCredit")?.[1];
  Assert(typeID != null, "an ordinary payment type is seeded");

  const created = await CreatePayment(ctx.User, {
    PaymentNumber: `PP-${randomUUID().slice(0, 8).toUpperCase()}`,
    ReceivingCompanyID: f.CoA.ID,
    PaymentTypeID: typeID!,
    Amount: opts.amount,
    BillToOrganizationID: f.Customers.OrganizationID,
    PaymentProviderID: opts.providerID ?? null,
    PaymentIntentID: opts.paymentIntentID ?? null,
    Allocations: [{ OrderHeaderID: opts.orderID, Amount: opts.amount }],
  });
  return {
    ID: (created.Payment.ID as string) ?? null,
    Saved: created.Saved,
    Message: created.Message,
  };
}

const headerRow = (ctx: IntegrationCheckContext, paymentID: string) =>
  TxOne<{
    Status: string;
    Amount: number;
    Fee: number;
    Net: number | null;
    ChargeID: string | null;
    JournalEntryID: string | null;
  }>(
    ctx,
    `SELECT Status, Amount, ProcessingFeeAmount AS Fee, NetAmount AS Net,
            ProviderChargeID AS ChargeID, JournalEntryID
       FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE ID='${paymentID}'`,
  );

/** A charge the gateway took with no Orders intent behind it, as `RetrieveCharge` reports one. */
function unmatchedCharge(amount: number, over: Partial<GatewayCharge> = {}): GatewayCharge {
  const tag = randomUUID().replace(/-/g, "").slice(0, 20);
  return {
    ProviderChargeID: `ch_it_${tag}`,
    ProviderIntentID: `pi_it_${tag}`,
    Amount: amount,
    AmountRefunded: 0,
    CurrencyCode: "USD",
    Status: "succeeded",
    CreatedAt: new Date(),
    ...over,
  };
}

/**
 * Create the order from the charge, for the fixture's person and WidgetA. The charge is in the
 * currency the provider's company books in (the fixture's companies take the profile default),
 * unless the check set one.
 */
async function orderFromCharge(ctx: IntegrationCheckContext, providerID: string, charge: GatewayCharge, currency?: string) {
  const f = Fx();
  const config = await LoadPaymentProviderConfig(providerID, ctx.Provider, ctx.User);
  const booksIn = await TxOne<{ Code: string }>(ctx,
    `SELECT FunctionalCurrencyCode AS Code FROM ${ACCT_SCHEMA}.AccountingCompanyProfile WHERE ID='${config.CompanyID}'`);
  return CreateOrderFromGatewayCharge(
    {
      PaymentProviderID: providerID,
      ProviderChargeID: charge.ProviderChargeID,
      ProductID: f.Products.WidgetA,
      BillToPersonID: f.Customers.PersonID,
      BillToOrganizationID: null,
      Charge: { ...charge, CurrencyCode: currency ?? booksIn.Code },
      Config: config,
    },
    ctx.Provider,
    ctx.User,
  );
}

/** Rows a charge's order left behind, by the gateway intent it carried. */
const rowsForIntent = (ctx: IntegrationCheckContext, providerIntentID: string) =>
  TxOne<{ Intents: number; Orders: number }>(
    ctx,
    `SELECT (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.PaymentIntent WHERE ProviderIntentID='${providerIntentID}') AS Intents,
            (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderHeader oh
               JOIN ${ORDERS_SCHEMA}.PaymentIntent pi ON pi.OrderHeaderID = oh.ID
              WHERE pi.ProviderIntentID='${providerIntentID}') AS Orders`,
  );

export const PaymentProvidersChecks: NamedCheck[] = [
  {
    Id: "payment-providers.PV1",
    Name: "PV1: a configured provider row RESOLVES to its driver",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The check that would have caught the resolver's field-name assumption on day one. It reads a
        // real PaymentProvider through the generated view and has to find the TYPE's Code — which is
        // the ClassFactory key, and is not the same as the type's Name.
        const providerID = await makeProvider(ctx, "Stripe");
        const driver = await ResolvePaymentProvider(providerID, ctx.Provider, ctx.User);

        AssertEqual(driver.Config.TypeCode, "Stripe", "the driver resolved for the right type");
        AssertEqual(driver.Config.IsLiveMode, false, "and knows it is not a live account");
        Assert(
          driver.constructor.name === "StripePaymentProvider",
          `the ClassFactory produced the Stripe driver, not the base (got ${driver.constructor.name})`,
        );
        Assert(
          driver.Config.Capabilities.SupportsRefund,
          "the type's capability flags came through, so the UI can hide what a gateway cannot do",
        );
      }),
  },
  {
    Id: "payment-providers.PV2",
    Name: "PV2: each seeded provider type resolves to a DISTINCT driver",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const names: string[] = [];
        for (const code of ["Stripe", "Manual", "StoredValue"]) {
          const id = await makeProvider(ctx, code);
          const driver = await ResolvePaymentProvider(id, ctx.Provider, ctx.User);
          names.push(driver.constructor.name);
        }
        // Three types, three drivers. If any Load* anchor were missing the ClassFactory would fall back
        // to the base for that one, and the set would collapse.
        AssertEqual(new Set(names).size, 3, `three distinct drivers, got ${names.join(", ")}`);
        Assert(!names.includes("BasePaymentProvider"), "none fell back to the base driver");
      }),
  },
  {
    Id: "payment-providers.PV3",
    Name: "PV3: an INACTIVE provider is refused rather than used silently",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const { ResolvePaymentProvider } = await import("@mj-biz-apps/orders-core-entities-server");
        const providerID = await makeProvider(ctx, "Stripe", { active: false });
        let refused = "";
        try {
          await ResolvePaymentProvider(providerID, ctx.Provider, ctx.User);
        } catch (e) {
          refused = String((e as Error).message);
        }
        Assert(refused.length > 0, "an inactive provider must not resolve");
        Assert(
          /inactive/i.test(refused),
          `the refusal must say WHY — a deactivated gateway used silently is the failure this prevents. Got: ${refused}`,
        );
      }),
  },
  {
    Id: "payment-providers.PV4",
    Name: "PV4: a capture through a provider reaches the gateway and books the FEE",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sellSomething(ctx, 300);
        const providerID = await makeProvider(ctx, "Stripe");
        const intent = await makeIntent(ctx, providerID, 300, order.Order.ID as string);
        const result = await capturePayment(ctx, {
          providerID,
          paymentIntentID: intent.ID,
          orderID: order.Order.ID as string,
          amount: 300,
        });
        const paymentID = result.ID!;
        Assert(result.Saved, `the capture must succeed through the stub: ${result.Message}`);

        const row = await headerRow(ctx, paymentID);
        AssertEqual(row.Status, "Captured", "the payment captured");
        // The stub reports 2.9% + 30c. The whole reason it reports a NON-zero fee is so this leg is
        // reachable — a stub reporting zero would leave the Dr Processing Fee path untested forever.
        AssertEqual(Number(row.Fee), 9.0, "the gateway's fee was recorded (2.9% of 300 + 0.30)");
        AssertEqual(Number(row.Amount), 300, "the gross is what the gateway captured");
        AssertEqual(Number(row.Net), 291, "and the net is gross less fee");
        Assert(row.ChargeID != null, "the gateway's charge reference was stamped");
      }),
  },
  {
    Id: "payment-providers.PV5",
    Name: "PV5: the fee, net and gross RECONCILE, so the entry can balance",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The capture entry is Dr Cash (net) / Dr Processing Fee / Cr A/R (gross) — D18. If these three
        // do not reconcile the entry cannot balance, and the failure surfaces far from its cause.
        const order = await sellSomething(ctx, 33.33);
        const providerID = await makeProvider(ctx, "Stripe");
        const intent = await makeIntent(ctx, providerID, 33.33, order.Order.ID as string);
        const paid = await capturePayment(ctx, {
          providerID,
          paymentIntentID: intent.ID,
          orderID: order.Order.ID as string,
          amount: 33.33,
        });
        Assert(paid.Saved, "the awkward-amount capture succeeds");
        const paymentID = paid.ID!;
        const row = await headerRow(ctx, paymentID);
        AssertEqual(
          Math.round((Number(row.Net) + Number(row.Fee)) * 100) / 100,
          Number(row.Amount),
          "net + fee is the gross, to the penny",
        );
      }),
  },
  {
    Id: "payment-providers.PV6",
    Name: "PV6: a payment with NO provider captures exactly as it always did",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The regression this most risks. `PaymentProviderID` is nullable, and back-office corrections,
        // account-credit transfers and historical imports all have none. Requiring a provider would
        // break every one of them, so the driver path must be entirely skipped rather than refused.
        const order = await sellSomething(ctx, 300);
        const result = await capturePayment(ctx, {
          providerID: null,
          paymentIntentID: null,
          orderID: order.Order.ID as string,
          amount: 300,
        });
        const paymentID = result.ID!;
        Assert(result.Saved, `a provider-less capture must still work: ${result.Message}`);
        const row = await headerRow(ctx, paymentID);
        AssertEqual(row.Status, "Captured", "it captured");
        AssertEqual(Number(row.Fee), 0, "and carries no fee, because nobody took a cut");
        Assert(row.ChargeID == null, "and no gateway reference, because no gateway was involved");
      }),
  },
  {
    Id: "payment-providers.PV7",
    Name: "PV7: a provider with no INTENT is refused, and the message says what to do",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sellSomething(ctx, 300);
        const providerID = await makeProvider(ctx, "Stripe");
        // A provider named but no intent opened — there is nothing for the gateway to capture.
        const result = await capturePayment(ctx, {
          providerID,
          paymentIntentID: null,
          orderID: order.Order.ID as string,
          amount: 300,
        });
        const paymentID = result.ID!;
        Assert(!result.Saved, "a provider-backed capture with no intent must be refused");
        Assert(
          /intent/i.test(result.Message),
          `the refusal must name the missing intent rather than failing obscurely. Got: ${result.Message}`,
        );
      }),
  },
  {
    Id: "payment-providers.PV8",
    Name: "PV8: the provider intent string is read from PaymentIntent, not from the header",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // THE ASSUMPTION THAT WAS WRONG. `PaymentHeader` has `PaymentIntentID` — a foreign key to our
        // row — and NO `ProviderIntentID`. Reading the gateway's string off the header compiles, because
        // every column access on the server subclass is a cast, and is `undefined` at run time. This
        // asserts the indirection actually happens by giving the intent a recognisable string and
        // checking the capture used it.
        const order = await sellSomething(ctx, 300);
        const providerID = await makeProvider(ctx, "Stripe");
        const intent = await makeIntent(ctx, providerID, 300, order.Order.ID as string);
        const paid = await capturePayment(ctx, {
          providerID,
          paymentIntentID: intent.ID,
          orderID: order.Order.ID as string,
          amount: 300,
        });
        Assert(paid.Saved, "the capture succeeded");
        const paymentID = paid.ID!;
        const row = await headerRow(ctx, paymentID);
        // The stub derives its charge id from the intent string's tail, so a charge reference that
        // reflects the intent proves the indirection was followed rather than skipped.
        Assert(
          row.ChargeID != null && row.ChargeID.includes(intent.ProviderIntentID.slice(-12)),
          `the charge reference must derive from the PaymentIntent's ProviderIntentID ` +
            `(${intent.ProviderIntentID}), proving the header's FK was followed. Got: ${row.ChargeID}`,
        );
      }),
  },
  {
    Id: "payment-providers.PV9",
    Name: "PV9: a re-saved captured payment does NOT charge the customer twice",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sellSomething(ctx, 300);
        const providerID = await makeProvider(ctx, "Stripe");
        const intent = await makeIntent(ctx, providerID, 300, order.Order.ID as string);
        const paid = await capturePayment(ctx, {
          providerID,
          paymentIntentID: intent.ID,
          orderID: order.Order.ID as string,
          amount: 300,
        });
        Assert(paid.Saved, "the first capture succeeds");
        const paymentID = paid.ID!;
        const first = await headerRow(ctx, paymentID);

        // A second save for any reason — a note edited, a reference backfilled. `ProviderChargeID` is
        // the idempotency key, exactly as `JournalEntryID` is for booking.
        const again = await CapturePayment(ctx.User, paymentID);
        Assert(again.Saved, `the re-save must succeed: ${again.Message}`);

        const second = await headerRow(ctx, paymentID);
        AssertEqual(second.ChargeID, first.ChargeID, "the same charge — the gateway was not called again");
        AssertEqual(Number(second.Amount), Number(first.Amount), "and the amount did not move");
        AssertEqual(Number(second.Fee), Number(first.Fee), "nor the fee");
      }),
  },
  {
    Id: "payment-providers.PV10",
    Name: "PV10: a Manual provider captures with a genuine ZERO fee",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Manual is not an absence of a gateway — it is a driver that reports what a person recorded.
        // Its zero fee is a real answer (a bank's wire charge hits the account, not the receipt), which
        // is why it differs from the gateway drivers' 'unknown'.
        const order = await sellSomething(ctx, 300);
        const providerID = await makeProvider(ctx, "Manual");
        const intent = await makeIntent(ctx, providerID, 300, order.Order.ID as string);
        const paid = await capturePayment(ctx, {
          providerID,
          paymentIntentID: intent.ID,
          orderID: order.Order.ID as string,
          amount: 300,
        });
        Assert(paid.Saved, "a manual capture succeeds");
        const paymentID = paid.ID!;
        const row = await headerRow(ctx, paymentID);
        AssertEqual(row.Status, "Captured", "it captured");
        AssertEqual(Number(row.Fee), 0, "with no fee at all");
        AssertEqual(Number(row.Amount), 300, "for the amount recorded");
      }),
  },
  {
    Id: "payment-providers.PV11",
    Name: "PV11: the order's rollups follow a provider capture as they do any other",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The driver must not have changed what capture MEANS. AmountPaid/Balance/PaymentStatus are
        // trigger-maintained (D41), and they key off the payment lines rather than the gateway — so a
        // provider-backed capture must move them exactly as a manual one does.
        const order = await sellSomething(ctx, 300);
        const providerID = await makeProvider(ctx, "Stripe");
        const intent = await makeIntent(ctx, providerID, 300, order.Order.ID as string);
        const paid = await capturePayment(ctx, {
          providerID,
          paymentIntentID: intent.ID,
          orderID: order.Order.ID as string,
          amount: 300,
        });
        Assert(paid.Saved, "the capture succeeded");
        const paymentID = paid.ID!;

        const header = await TxOne<{ Paid: number; Balance: number; TotalGross: number }>(ctx,
          `SELECT AmountPaid AS Paid, Balance, TotalGross
             FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${order.Order.ID}'`);
        AssertEqual(Number(header.Paid), 300, "the order records the payment");
        AssertEqual(Number(header.Balance), 0, "and its balance clears");
        AssertEqual(DerivePaymentStatus(header.TotalGross, header.Paid, header.Balance), "Paid", "and it reads as paid");
      }),
  },
  {
    Id: "payment-providers.PV12",
    Name: "PV12: the capture's journal entries balance, per company",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sellSomething(ctx, 300);
        const providerID = await makeProvider(ctx, "Stripe");
        const intent = await makeIntent(ctx, providerID, 300, order.Order.ID as string);
        const paid = await capturePayment(ctx, {
          providerID,
          paymentIntentID: intent.ID,
          orderID: order.Order.ID as string,
          amount: 300,
        });
        Assert(paid.Saved, "the capture succeeded");
        const paymentID = paid.ID!;

        // WHERE A PAYMENT'S ENTRIES ACTUALLY LIVE, which is not where I first assumed.
        //
        // The HEADER carries a JournalEntryID only for the processing-fee entry, and only when a
        // 'Processing Fee' GL account is linked — which accounting does not currently seed, so on a
        // stock database it is null. The cash and receivable legs belong to the ALLOCATION, and
        // `PaymentLine` has no JournalEntryID column at all: accounting records the link from its own
        // side, via JournalEntry.LinkedEntityID/LinkedRecordID pointing at the payment line.
        //
        // Scoping to the header alone therefore found nothing and asserted nothing. Both sources are
        // read here, and every column is qualified — an unqualified name inside IN (SELECT …) binds to
        // the OUTER query when the inner table lacks it, which is what made composition's CX8 sum the
        // entire database.
        const l = await TxOne<{ Entries: number; Unbalanced: number }>(ctx,
          `WITH e AS (
              SELECT je.ID, SUM(jel.DebitAmount) AS D, SUM(jel.CreditAmount) AS C
                FROM ${ACCT_SCHEMA}.JournalEntry je
                JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
               WHERE je.ID IN (
                     SELECT ph.JournalEntryID FROM ${ORDERS_SCHEMA}.PaymentHeader ph
                      WHERE ph.ID = '${paymentID}' AND ph.JournalEntryID IS NOT NULL)
                  OR je.LinkedRecordID IN (
                     SELECT CAST(pl.ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.PaymentLine pl
                      WHERE pl.PaymentHeaderID = '${paymentID}')
               GROUP BY je.ID)
           SELECT COUNT(*) AS Entries,
                  SUM(CASE WHEN ABS(ISNULL(D,0)-ISNULL(C,0)) > 0.005 THEN 1 ELSE 0 END) AS Unbalanced
             FROM e`);

        Assert(
          Number(l.Entries) > 0,
          "the capture booked at least one entry — the cash leg comes from the ALLOCATION, so this holds " +
            "even on a database with no Processing Fee account linked",
        );
        AssertEqual(Number(l.Unbalanced), 0, "and every one of them balances");
      }),
  },
  {
    Id: "payment-providers.PV13",
    Name: "PV13: a charge with no order becomes a paid order in the provider's company, fee booked",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 300);
        const providerID = await makeProvider(ctx, "Stripe");
        const charge = unmatchedCharge(300);
        const out = await orderFromCharge(ctx, providerID, charge);
        Assert(out.Success, `the order is created and paid: ${out.Code} ${out.Message}`);
        AssertEqual(out.WasExisting, false, "a first call creates");

        const order = await TxOne<{ CompanyID: string; Status: string; Origin: string; TotalGross: number; AmountPaid: number; Balance: number; BillToPersonID: string }>(ctx,
          `SELECT CompanyID, Status, Origin, TotalGross, AmountPaid, Balance, BillToPersonID
             FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${out.OrderHeaderID}'`);
        Assert(order.CompanyID.toLowerCase() === f.CoA.ID.toLowerCase(), "the order is in the provider's company");
        Assert(order.BillToPersonID.toLowerCase() === f.Customers.PersonID.toLowerCase(), "billed to the named buyer");
        AssertEqual(order.Origin, "ProviderPayment", "and says where it came from");
        Assert(order.Status !== "Draft", `the order is booked, not a draft (status ${order.Status})`);
        AssertEqual(Number(order.TotalGross), 300, "the order totals the charge");
        AssertEqual(Number(order.AmountPaid), 300, "the charge is applied to it");
        AssertEqual(Number(order.Balance), 0, "leaving nothing due");

        const pay = await TxOne<{ Status: string; Amount: number; Fee: number; Net: number; IntentID: string | null; Key: string; ChargeID: string | null }>(ctx,
          `SELECT Status, Amount, ProcessingFeeAmount AS Fee, NetAmount AS Net, PaymentIntentID AS IntentID,
                  IdempotencyKey AS [Key], ProviderChargeID AS ChargeID
             FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE ID='${out.PaymentHeaderID}'`);
        AssertEqual(pay.Status, "Captured", "the payment is captured");
        AssertEqual(Number(pay.Amount), 300, "for the gross");
        Assert(Number(pay.Fee) > 0, "with the gateway's fee recorded, so the net deposit is not a variance");
        AssertEqual(Math.round((Number(pay.Net) + Number(pay.Fee)) * 100) / 100, 300, "net + fee is the gross");
        Assert(pay.ChargeID != null, "the gateway charge is stamped");
        Assert(pay.Key.endsWith(`:${charge.ProviderChargeID}`), "keyed to the charge");

        const intent = await TxOne<{ ID: string; Status: string; OrderHeaderID: string }>(ctx,
          `SELECT ID, Status, OrderHeaderID FROM ${ORDERS_SCHEMA}.PaymentIntent WHERE ProviderIntentID='${charge.ProviderIntentID}'`);
        AssertEqual(intent.Status, "Succeeded", "the gateway intent is recorded as settled");
        Assert(intent.OrderHeaderID.toLowerCase() === String(out.OrderHeaderID).toLowerCase(), "and points at the order");
        Assert(String(pay.IntentID).toLowerCase() === intent.ID.toLowerCase(), "the payment reads the gateway through it");
      }),
  },
  {
    Id: "payment-providers.PV14",
    Name: "PV14: the same charge again returns the first order and books nothing new",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 300);
        const providerID = await makeProvider(ctx, "Stripe");
        const charge = unmatchedCharge(300);
        const first = await orderFromCharge(ctx, providerID, charge);
        Assert(first.Success, `the first call creates: ${first.Message}`);
        const again = await orderFromCharge(ctx, providerID, charge);
        Assert(again.Success, `the repeat succeeds: ${again.Message}`);
        AssertEqual(again.WasExisting, true, "and says it found the earlier order");
        Assert(String(again.OrderHeaderID).toLowerCase() === String(first.OrderHeaderID).toLowerCase(), "the same order");
        Assert(String(again.PaymentHeaderID).toLowerCase() === String(first.PaymentHeaderID).toLowerCase(), "the same payment");
        const rows = await rowsForIntent(ctx, charge.ProviderIntentID!);
        AssertEqual(Number(rows.Intents), 1, "one intent");
        AssertEqual(Number(rows.Orders), 1, "one order");
        const pays = await TxOne<{ N: number }>(ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE IdempotencyKey LIKE '%:${charge.ProviderChargeID}'`);
        AssertEqual(Number(pays.N), 1, "one payment");
      }),
  },
  {
    Id: "payment-providers.PV15",
    Name: "PV15: a charge below the product's price is a concession: refused, and nothing is left behind",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 300);
        const providerID = await makeProvider(ctx, "Stripe");
        const charge = unmatchedCharge(250);
        const out = await orderFromCharge(ctx, providerID, charge);
        Assert(!out.Success, "an order priced below the product's price does not confirm unapproved");
        AssertEqual(out.Code, "ConfirmRefused", `refused at the confirm (${out.Message})`);
        Assert(/concession|approv/i.test(out.Message), `by the concession gate, which it names: ${out.Message}`);
        const rows = await rowsForIntent(ctx, charge.ProviderIntentID!);
        AssertEqual(Number(rows.Intents), 0, "the intent is rolled back with the order");
      }),
  },
  {
    Id: "payment-providers.PV16",
    Name: "PV16: a refunded charge, one in another currency, or one on an intent Orders opened, is refused with its reason",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 300);
        const providerID = await makeProvider(ctx, "Stripe");

        const refunded = unmatchedCharge(300, { AmountRefunded: 50 });
        const r1 = await orderFromCharge(ctx, providerID, refunded);
        AssertEqual(r1.Code, "ChargeRefunded", `a partly refunded charge is refused: ${r1.Message}`);
        AssertEqual(Number((await rowsForIntent(ctx, refunded.ProviderIntentID!)).Intents), 0, "and writes nothing");

        const foreign = unmatchedCharge(300);
        const r0 = await orderFromCharge(ctx, providerID, foreign, "XTS");
        AssertEqual(r0.Code, "CurrencyMismatch", `a charge in another currency is refused: ${r0.Message}`);

        // A checkout's intent: Orders opened it, so its charge is not an unmatched payment.
        const opened = await makeIntent(ctx, providerID, 300);
        const ours = unmatchedCharge(300, { ProviderIntentID: opened.ProviderIntentID });
        const r2 = await orderFromCharge(ctx, providerID, ours);
        AssertEqual(r2.Code, "IntentOpenedByOrders", `a charge on an Orders intent is refused: ${r2.Message}`);
        AssertEqual(Number((await rowsForIntent(ctx, opened.ProviderIntentID)).Orders), 0, "and no order is created for it");
      }),
  },
];

for (const check of PaymentProvidersChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("payment-providers", {
  Setup: async (ctx) => { await CreateOrdersFixture(ctx); },
  Teardown: TeardownOrdersFixture,
});
