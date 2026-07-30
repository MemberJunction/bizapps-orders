/**
 * concurrency — what happens when two sessions want a document number at the same instant.
 *
 * WHY THIS BUNDLE EXISTS. `OrderNumber` is an A/R document number, and D30 makes two promises about
 * it that nothing else in the suite tests: numbers are GAP-CONSCIOUS (a confirm that rolls back
 * releases its number rather than burning it) and no two orders share one. Every other check runs
 * one at a time, so neither promise is exercised anywhere else.
 *
 * These checks use a SECOND CONNECTION. `ctx.Pool` is a raw mssql pool, and a transaction taken from
 * it is genuinely independent of the MJ provider's — different session, its own locks. That lets a
 * check hold the counter row and watch a real confirm block on it.
 *
 * WHAT THESE CHECKS ACTUALLY PROVE, established by mutation testing rather than by assumption:
 *
 *   · A confirm competing for the counter SERIALIZES behind the holder and comes away with a
 *     different, later number. That is CN1 and CN5.
 *   · A failed confirm returns its number to the pool. That is CN3, and it is asserted directly by
 *     reading the counter either side.
 *
 * WHAT THEY DO NOT PROVE, and this is worth stating because the obvious reading is wrong:
 *
 *   · Removing `WITH (UPDLOCK, HOLDLOCK)` from `nextSequence` does NOT fail these checks. The bare
 *     `UPDATE` takes an exclusive row lock held to the end of the transaction anyway, so the hints
 *     are belt-and-braces on a statement that is already atomic.
 *   · Nor does rewriting it as a dirty read followed by a separate `UPDATE` — the classic race. It
 *     still blocks, on the UPDATE rather than the SELECT, and still emerges with the next number.
 *     The interleaving that breaks it (both sessions reading before either writes) cannot be forced
 *     from here, because the competing session holds an exclusive lock the whole time.
 *
 * The property that makes the race impossible is that the number is taken in ONE atomic statement
 * inside the caller's transaction. Since no runtime check here can distinguish that from a
 * non-atomic version, `registry-parity.test.ts` asserts it against the source instead — see the
 * "sequence counter" test there. A guard you cannot write at runtime is still worth writing.
 *
 * WHAT IS ALSO NOT COVERED: two *MJ confirms* running at literally the same moment. The suite has
 * one provider, so the competing actor is raw SQL performing the same counter protocol.
 *
 * CONNECTS TO:
 *   CODE: OrderEntityServer.nextSequence, assignOrderNumber
 *   DOC:  plans/bizapps-orders-master.md D30
 */
import { randomUUID } from "crypto";
import {
  Assert,
  AssertEqual,
  IntegrationCheckRegistry,
  type IntegrationCheckContext,
  type NamedCheck,
} from "@memberjunction/testing-integration";
import {
  CreateOrdersFixture,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { ConfirmOrder } from "../order-builder.js";

const SEQUENCE_SCHEMA = "__mj_BizAppsOrders";

async function addPrice(ctx: IntegrationCheckContext, productID: string, amount: number): Promise<void> {
  await TxQuery(ctx,
    `INSERT INTO ${ORDERS_SCHEMA}.ProductPrice
       (ID, ProductID, PricingModel, FeeType, Amount, EffectiveFrom, Priority, Status)
     VALUES ('${randomUUID()}','${productID}','PerUnit','Standard',${amount},'2020-01-01',0,'Active')`);
}

/** The pool the driver handed us. Absent only on a client-transport run, which this bundle is not. */
function pool(ctx: IntegrationCheckContext) {
  const p = ctx.Pool;
  Assert(p != null, "this bundle needs ctx.Pool — a second connection is the whole point of it");
  return p!;
}

/**
 * Hold the sequence counter on a SEPARATE connection, run `body` while it is held, then release.
 *
 * The competing actor: it takes a number using exactly the protocol `nextSequence` uses, so what
 * blocks here is what would block a real second confirm.
 *
 * `LOCK_TIMEOUT` is set on the holding session as a safety net — if `body` deadlocks against this
 * transaction rather than merely blocking, the run fails with an error instead of hanging the suite.
 */
async function whileHoldingSequence<T>(
  ctx: IntegrationCheckContext,
  table: "OrderSequence" | "PaymentSequence",
  body: (heldNumber: number, release: () => Promise<void>) => Promise<T>,
): Promise<T> {
  // `pool.transaction()` rather than `new sql.Transaction(pool)`: it needs no import of mssql at
  // all, which keeps this file free of the dynamic import the house rules forbid and of a dependency
  // this package does not otherwise have.
  const tx = pool(ctx).transaction();
  await tx.begin();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await tx.commit();
  };

  try {
    const held = await tx.request().query(
      `SET LOCK_TIMEOUT 15000;
       DECLARE @seq TABLE (Seq INT);
       UPDATE ${SEQUENCE_SCHEMA}.${table} WITH (UPDLOCK, HOLDLOCK)
       SET NextSequenceNumber = NextSequenceNumber + 1
       OUTPUT deleted.NextSequenceNumber INTO @seq(Seq)
       WHERE ID = 1;
       SELECT Seq FROM @seq;`,
    );
    const heldNumber = Number(held.recordset?.[0]?.Seq);
    Assert(Number.isFinite(heldNumber), `could not take a number from ${table}`);
    return await body(heldNumber, release);
  } finally {
    if (!released) await tx.rollback().catch(() => undefined);
  }
}

/** Confirm a trivial one-line order and return its number. */
async function confirmOne(ctx: IntegrationCheckContext): Promise<string> {
  const f = Fx();
  const order = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
  });
  Assert(order.Saved, `confirm failed: ${order.Message}`);
  return order.Order.OrderNumber as string;
}

const seqOf = (orderNumber: string) => Number(orderNumber.replace(/^ORD-/, ""));

export const ConcurrencyChecks: NamedCheck[] = [
  {
    Id: "concurrency.CN1",
    Name: "CN1: a confirm serializes behind a competing session and takes a LATER number",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 10);

        await whileHoldingSequence(ctx, "OrderSequence", async (heldNumber, release) => {
          // Start the confirm but DO NOT await it. With the counter row locked by the other
          // session, the confirm must wait rather than complete. Note what this does and does not
          // show: it proves the confirm cannot finish while another session holds the row, which is
          // what stops two orders sharing a number. It does NOT distinguish an atomic counter from
          // a dirty-read-then-update one — both block here. See the module header.
          let settled = false;
          const confirming = confirmOne(ctx).then(
            (n) => { settled = true; return n; },
            (e) => { settled = true; throw e; },
          );

          await new Promise((r) => setTimeout(r, 1500));
          Assert(
            !settled,
            "the confirm completed while another session held the counter — it did not wait for the " +
              "lock, so two simultaneous confirms would take the same number",
          );

          await release();
          const number = await confirming;

          // And it took the NEXT one, not the held one.
          AssertEqual(
            seqOf(number),
            heldNumber + 1,
            "the blocked confirm resumes at the next number, not the one already taken",
          );
        });
      }),
  },
  {
    Id: "concurrency.CN2",
    Name: "CN2: the counter advances by exactly one per number taken",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 10);

        const before = await TxOne<{ N: number }>(ctx,
          `SELECT NextSequenceNumber AS N FROM ${SEQUENCE_SCHEMA}.OrderSequence WHERE ID=1`);
        const first = seqOf(await confirmOne(ctx));
        const second = seqOf(await confirmOne(ctx));
        const after = await TxOne<{ N: number }>(ctx,
          `SELECT NextSequenceNumber AS N FROM ${SEQUENCE_SCHEMA}.OrderSequence WHERE ID=1`);

        AssertEqual(first, Number(before.N), "the first confirm takes the number the counter was showing");
        AssertEqual(second, first + 1, "the second takes the very next one — no gap");
        AssertEqual(
          Number(after.N) - Number(before.N),
          2,
          "two numbers taken advanced the counter by exactly two — a counter that skips burns A/R " +
            "document numbers an auditor then has to account for",
        );
      }),
  },
  {
    Id: "concurrency.CN3",
    Name: "CN3: a confirm that ROLLS BACK releases its number instead of burning it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 10);
        await addPrice(ctx, f.Products.WidgetC, 10);

        const before = await TxOne<{ N: number }>(ctx,
          `SELECT NextSequenceNumber AS N FROM ${SEQUENCE_SCHEMA}.OrderSequence WHERE ID=1`);

        // WidgetC belongs to CoC, which has no GL links at all — the confirm resolves no accounts
        // and rolls the whole thing back (D12). That is the realistic way a number gets taken and
        // then abandoned.
        const doomed = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoC.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetC, Quantity: 1 }],
        });
        Assert(!doomed.Saved, "the CoC order must fail — it has no GL links to resolve");

        const after = await TxOne<{ N: number }>(ctx,
          `SELECT NextSequenceNumber AS N FROM ${SEQUENCE_SCHEMA}.OrderSequence WHERE ID=1`);
        // The increment happens inside the CALLER's transaction, so a rollback takes it with it.
        // Taking numbers from a separate transaction (the obvious "safer" design) would leave a
        // permanent hole in the invoice sequence for every failed confirm.
        AssertEqual(
          Number(after.N),
          Number(before.N),
          "a failed confirm leaves the counter exactly where it found it",
        );
      }),
  },
  {
    Id: "concurrency.CN4",
    Name: "CN4: the database REFUSES a duplicate order number",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 10);
        const number = await confirmOne(ctx);

        // The lock protocol is the first line of defence; this is the second. If both are absent,
        // two customers share an invoice number and nothing anywhere complains — so the constraint
        // is worth proving rather than assuming.
        let rejected = false;
        try {
          await TxQuery(ctx,
            `INSERT INTO ${ORDERS_SCHEMA}.OrderHeader (ID, OrderNumber, OrderType, OrderDate, Status, CompanyID)
             VALUES ('${randomUUID()}','${number}','Sale',GETUTCDATE(),'Draft','${f.CoA.ID}')`);
        } catch {
          rejected = true;
        }
        Assert(rejected, `the database accepted a second order numbered ${number}`);
      }),
  },
  {
    Id: "concurrency.CN5",
    Name: "CN5: the PAYMENT counter serializes the same way the order counter does",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 10);
        // Any tender EXCEPT AccountCredit, which takes a different path (a zero-amount payment
        // spending an existing balance) and would not exercise the counter the same way.
        const typeID = [...f.PaymentTypeIDs.entries()].find(([code]) => code !== "AccountCredit")?.[1];
        Assert(typeID != null, "the app metadata must seed at least one ordinary payment type");

        await whileHoldingSequence(ctx, "PaymentSequence", async (heldNumber, release) => {
          // An order with an initial payment intent creates a PaymentHeader on confirm, which takes
          // a payment number by the same protocol. Two counters, one rule — and a copy-paste that
          // dropped the hints from one of them would leave the other looking fine.
          let settled = false;
          const confirming = ConfirmOrder(ctx.User, {
            CompanyID: f.CoA.ID,
            BillToOrganizationID: f.Customers.OrganizationID,
            Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
            InitialPaymentTypeID: typeID,
            InitialPaymentAmount: 10,
          }).then(
            (o) => { settled = true; return o; },
            (e) => { settled = true; throw e; },
          );

          await new Promise((r) => setTimeout(r, 1500));
          Assert(!settled, "the payment counter did not serialize — the confirm ran straight through");

          await release();
          const order = await confirming;
          Assert(order.Saved, `confirm failed: ${order.Message}`);

          const payment = await TxOne<{ Number: string }>(ctx,
            `SELECT ph.PaymentNumber AS Number
               FROM ${ORDERS_SCHEMA}.PaymentHeader ph
               JOIN ${ORDERS_SCHEMA}.PaymentLine pl ON pl.PaymentHeaderID = ph.ID
              WHERE pl.OrderHeaderID = '${order.Order.ID}'`);
          AssertEqual(
            Number(String(payment.Number).replace(/^PAY-/, "")),
            heldNumber + 1,
            "the payment resumes at the next number",
          );
        });
      }),
  },
  {
    Id: "concurrency.CN6",
    Name: "CN6: two reversals of one line, saved together, cannot exceed it between them",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 10);
        const sale = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 3 }],
        });
        Assert(sale.Saved, `the sale must confirm: ${sale.Message}`);
        const lineID = sale.Lines[0].ID as string;

        // Both lines are in memory on ONE order, so neither is in the database for the other to
        // see. Each is individually within the 3 sold; only their sum is not. A guard that reads
        // only what is persisted passes both and refunds 4 units of a 3-unit sale.
        const both = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          OrderType: "Return",
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            { ProductID: f.Products.WidgetA, Quantity: -2, ReversesOrderLineID: lineID },
            { ProductID: f.Products.WidgetA, Quantity: -2, ReversesOrderLineID: lineID },
          ],
        });
        Assert(
          !both.Saved,
          "two reversal lines of 2 against a 3-unit sale must be refused — their SUM is what counts",
        );

        // And the legitimate split still works.
        const ok = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          OrderType: "Return",
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            { ProductID: f.Products.WidgetA, Quantity: -2, ReversesOrderLineID: lineID },
            { ProductID: f.Products.WidgetA, Quantity: -1, ReversesOrderLineID: lineID },
          ],
        });
        Assert(ok.Saved, `2 + 1 against a 3-unit sale is exactly the line: ${ok.Message}`);
      }),
  },
];

for (const check of ConcurrencyChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("concurrency", {
  Setup: async (ctx) => { await CreateOrdersFixture(ctx); },
  Teardown: TeardownOrdersFixture,
});
