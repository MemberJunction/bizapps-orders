/**
 * returns — money going BACK, which is the direction almost nothing was designed for.
 *
 * WHY THIS BUNDLE EXISTS. Every other bundle sells something. The reverse path shares the same code
 * (a reversal goes through the ordinary confirm, deliberately — see `CancelSubscriptionOperation`),
 * and that sharing is exactly what makes it worth testing separately: the forward path's assumptions
 * are invisible until a negative number runs through them.
 *
 * Three of those assumptions matter enough to pin:
 *
 *   1. A reversal is the MIRROR of an entry — sides swapped, amounts positive — never a negation.
 *      Accounting rejects negative amounts outright, so a naive `-amount` does not fail a balance
 *      check, it fails to post at all.
 *   2. A reversal unwinds a PURCHASE, so it must not re-trigger the things a purchase triggers.
 *      Materializing a subscription on a reversal creates a second subscription every time one is
 *      cancelled — the exact opposite of the line's meaning.
 *   3. Tax and discounts reverse WITH the line. A return that keeps the tax overcharges the
 *      customer, and one that reverses list price instead of the discounted price refunds money
 *      that was never paid. Both leave a balanced ledger.
 *
 * THE RECURRING SHAPE: a wrong reversal still balances. That is why these checks assert what the
 * entry is made OF, not just that debits equal credits.
 *
 * CONNECTS TO:
 *   CODE: OrderLineEntityServer (the negative-quantity guard), OrderEntityServer.Save (booking),
 *         CancelSubscriptionOperation.emitReversalOrder (the shape a reversal takes)
 *   DOC:  plans/archive/bizapps-orders-master.md D16 (reversal lines)
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
  CreateProductPrice,
  ACCT_SCHEMA,
  CreateOrdersFixture,
  EnsureTaxNexus,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { ConfirmOrder } from "../order-builder.js";

async function addPrice(ctx: IntegrationCheckContext, productID: string, amount: number): Promise<void> {
  // Delegates to the shared builder so the price goes through `ProductPriceEntityServer` and its
  // ambiguity guard, rather than around it. Idempotent per product — see CreateProductPrice.
  await CreateProductPrice(ctx, productID, amount);
}

/** Grant CoA nexus so tax actually computes — otherwise the tax checks pass on a zero. */
async function grantNexus(ctx: IntegrationCheckContext, keys: string[]): Promise<void> {
  const f = Fx();
  // WHICH jurisdictions are granted stays local to each bundle — the fixture's nexus GAP is
  // load-bearing and a shared decision would invite removing it. Only the WRITE is shared.
  await EnsureTaxNexus(ctx, f.CoA.ID, keys.map((k) => f.Tax.JurisdictionIDs.get(k)!).filter(Boolean));
}

/** Sell one thing, so there is something to send back. */
async function sell(
  ctx: IntegrationCheckContext,
  opts: { productID?: string; quantity?: number; price?: number; discountPct?: number; addressKey?: string } = {},
) {
  const f = Fx();
  const productID = opts.productID ?? f.Products.WidgetA;
  if (opts.price != null) await addPrice(ctx, productID, opts.price);
  const order = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    ShipToAddressID: opts.addressKey ? f.Tax.AddressIDs.get(opts.addressKey) : undefined,
    Lines: [{ ProductID: productID, Quantity: opts.quantity ?? 4, DiscountPct: opts.discountPct }],
  });
  Assert(order.Saved, `the original sale must confirm before it can be returned: ${order.Message}`);
  return order;
}

/** Send `quantity` units back against `line`, through the ordinary confirm path. */
function returnAgainst(
  ctx: IntegrationCheckContext,
  originalLineID: string,
  opts: {
    productID: string;
    quantity: number;
    unitPrice?: number;
    discountPct?: number;
    addressKey?: string;
    servicePeriod?: { Start: string; End: string };
  },
) {
  const f = Fx();
  return ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    OrderType: "Return",
    BillToOrganizationID: f.Customers.OrganizationID,
    ShipToAddressID: opts.addressKey ? f.Tax.AddressIDs.get(opts.addressKey) : undefined,
    Lines: [
      {
        ProductID: opts.productID,
        Quantity: -Math.abs(opts.quantity),
        UnitPrice: opts.unitPrice,
        DiscountPct: opts.discountPct,
        ReversesOrderLineID: originalLineID,
        ServicePeriodStart: opts.servicePeriod?.Start,
        ServicePeriodEnd: opts.servicePeriod?.End,
      },
    ],
  });
}

/** The journal lines an order booked, by account role, so a check can read the SHAPE of the entry. */
const entryLines = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<{ Code: string; Name: string; Debit: number; Credit: number }>(
    ctx,
    `SELECT gl.Code, gl.Name, jel.DebitAmount AS Debit, jel.CreditAmount AS Credit
       FROM ${ORDERS_SCHEMA}.OrderLine ol
       JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = ol.JournalEntryID
       JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
      WHERE ol.OrderHeaderID = '${orderID}'`,
  );

/**
 * The RevenueRecognition releases an order produced, one row per date, signed so a sale and the
 * return that unwinds it cancel.
 *
 * TWO LINKAGES, because a release anchors to whichever of them exists (D46): a SALE's releases hang
 * off the SubscriptionTerm the line bought, and a REVERSAL buys no term, so its releases hang off
 * the reversal line itself. Reading only one of the two makes a reversal look like it recognized
 * nothing at all, which reads as a pass.
 *
 * The SIGN comes from the order's own quantity rather than from which account was debited: the entry
 * is mirrored, not negated, so both sides are positive amounts and nothing in the entry itself says
 * which direction it went.
 */
async function recognitionByDate(
  ctx: IntegrationCheckContext,
  orderID: string,
): Promise<{ On: string; Net: number }[]> {
  const qty = await TxOne<{ Q: number }>(
    ctx,
    `SELECT ISNULL(SUM(Quantity),0) AS Q FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}'`,
  );
  const sign = Number(qty.Q) < 0 ? -1 : 1;
  const rows = await TxQuery<{ On: string; Amount: number }>(
    ctx,
    `SELECT CONVERT(varchar(10), je.EffectiveDate, 23) AS [On], SUM(jel.DebitAmount) AS Amount
       FROM ${ACCT_SCHEMA}.vwJournalEntries je
       JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
      WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'RevenueRecognition'
        AND (
              je.LinkedRecordID IN (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}')
           OR je.LinkedRecordID IN (
                SELECT t.ID FROM ${ORDERS_SCHEMA}.SubscriptionTerm t
                  JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = t.OrderLineID
                 WHERE ol.OrderHeaderID='${orderID}')
        )
      GROUP BY je.EffectiveDate
      ORDER BY je.EffectiveDate`,
  );
  return rows.map((r) => ({ On: String(r.On), Net: sign * Math.round(Number(r.Amount) * 100) / 100 }));
}

const lineTotals = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ Net: number; Tax: number; Gross: number; Discount: number; Qty: number }>(
    ctx,
    `SELECT ISNULL(SUM(LineTotalNet),0) AS Net, ISNULL(SUM(LineTax),0) AS Tax,
            ISNULL(SUM(LineTotalGross),0) AS Gross, ISNULL(SUM(DiscountAmount),0) AS Discount,
            ISNULL(SUM(Quantity),0) AS Qty
       FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}'`,
  );

export const ReturnsChecks: NamedCheck[] = [
  {
    Id: "returns.RT1",
    Name: "RT1: a negative quantity with no origin line is REFUSED, and the message names the field",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          OrderType: "Return",
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: -2 }],
        });
        Assert(!order.Saved, "a negative line with no origin must not book — it is indistinguishable from a typo");
        // The field name is the whole value of the message: 'invalid quantity' sends the reader
        // looking at the number, which is fine, rather than at the missing pointer, which is not.
        Assert(
          /ReversesOrderLineID/i.test(order.Message),
          `the refusal must name the field that would make it legal — got: ${order.Message}`,
        );
      }),
  },
  {
    Id: "returns.RT2",
    Name: "RT2: the same line WITH an origin books — the guard is about provenance, not sign",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const sale = await sell(ctx, { price: 100, quantity: 4 });
        const ret = await returnAgainst(ctx, sale.Lines[0].ID as string, {
          productID: f.Products.WidgetA,
          quantity: 2,
        });
        Assert(ret.Saved, `a reversal line pointing at its original must book: ${ret.Message}`);

        const t = await lineTotals(ctx, ret.Order.ID as string);
        AssertEqual(Number(t.Qty), -2, "the reversal keeps its negative quantity");
        AssertEqual(Number(t.Net), -200, "2 units of a 100 line come back as -200");
      }),
  },
  {
    Id: "returns.RT3",
    Name: "RT3: the reversal MIRRORS the sale — sides swapped, never negated",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const sale = await sell(ctx, { price: 100, quantity: 4 });
        const ret = await returnAgainst(ctx, sale.Lines[0].ID as string, {
          productID: f.Products.WidgetA,
          quantity: 4,
        });
        Assert(ret.Saved, `confirm failed: ${ret.Message}`);

        const sold = await entryLines(ctx, sale.Order.ID as string);
        const back = await entryLines(ctx, ret.Order.ID as string);
        Assert(sold.length > 0 && back.length > 0, "both orders booked something");

        // EVERY amount positive, on both sides. Accounting rejects negatives outright, so a naive
        // `-amount` reversal does not merely look wrong — it fails to post. That the rows exist at
        // all is half the assertion; the other half is that none of them went negative.
        for (const row of [...sold, ...back]) {
          Assert(
            Number(row.Debit) >= 0 && Number(row.Credit) >= 0,
            `no journal line may carry a negative amount (${row.Code}: D${row.Debit} C${row.Credit})`,
          );
        }

        // The sale debits AR and credits Sales. The return must do the exact opposite on the same
        // accounts — same magnitudes, opposite columns.
        const by = (rows: typeof sold) => {
          const m = new Map<string, { D: number; C: number }>();
          for (const r of rows) {
            const cur = m.get(r.Code) ?? { D: 0, C: 0 };
            m.set(r.Code, { D: cur.D + Number(r.Debit), C: cur.C + Number(r.Credit) });
          }
          return m;
        };
        const s = by(sold);
        const b = by(back);
        AssertEqual(b.size, s.size, "the reversal touches the same set of accounts as the sale");
        for (const [code, sale_] of s) {
          const ret_ = b.get(code);
          Assert(ret_ != null, `account ${code} was debited/credited on the sale but not on the return`);
          AssertEqual(ret_!.D, sale_.C, `account ${code}: the return debits what the sale credited`);
          AssertEqual(ret_!.C, sale_.D, `account ${code}: the return credits what the sale debited`);
        }
      }),
  },
  {
    Id: "returns.RT4",
    Name: "RT4: a PARTIAL return unwinds proportionally, leaving the rest sold",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const sale = await sell(ctx, { price: 100, quantity: 4 }); // 400
        const ret = await returnAgainst(ctx, sale.Lines[0].ID as string, {
          productID: f.Products.WidgetA,
          quantity: 1,
        });
        Assert(ret.Saved, `confirm failed: ${ret.Message}`);

        const sold = await lineTotals(ctx, sale.Order.ID as string);
        const back = await lineTotals(ctx, ret.Order.ID as string);
        AssertEqual(Number(sold.Net), 400, "the sale stands at its full amount");
        AssertEqual(Number(back.Net), -100, "one of four units comes back — not the whole line");
        AssertEqual(
          Number(sold.Net) + Number(back.Net),
          300,
          "three units remain sold, which is what the customer kept",
        );
      }),
  },
  {
    Id: "returns.RT5",
    Name: "RT5: TAX comes back with the line — a return that keeps the tax overcharges",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await grantNexus(ctx, ["CA", "CA-SANTACLARA"]);
        const sale = await sell(ctx, { price: 100, quantity: 4, addressKey: "SantaClara" });
        const sold = await lineTotals(ctx, sale.Order.ID as string);
        Assert(Number(sold.Tax) > 0, "the sale must actually be taxed, or this check proves nothing");

        const ret = await returnAgainst(ctx, sale.Lines[0].ID as string, {
          productID: f.Products.WidgetA,
          quantity: 4,
          addressKey: "SantaClara",
        });
        Assert(ret.Saved, `confirm failed: ${ret.Message}`);

        const back = await lineTotals(ctx, ret.Order.ID as string);
        AssertEqual(Number(back.Tax), -Number(sold.Tax), "a full return returns the full tax");
        AssertEqual(
          Number(sold.Gross) + Number(back.Gross),
          0,
          "sale plus full return is zero GROSS — the customer is made whole including tax",
        );
      }),
  },
  {
    Id: "returns.RT6",
    Name: "RT6: a partial return returns the PROPORTIONAL tax, not all of it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await grantNexus(ctx, ["CA", "CA-SANTACLARA"]);
        const sale = await sell(ctx, { price: 100, quantity: 4, addressKey: "SantaClara" });
        const sold = await lineTotals(ctx, sale.Order.ID as string);

        const ret = await returnAgainst(ctx, sale.Lines[0].ID as string, {
          productID: f.Products.WidgetA,
          quantity: 1,
          addressKey: "SantaClara",
        });
        Assert(ret.Saved, `confirm failed: ${ret.Message}`);

        const back = await lineTotals(ctx, ret.Order.ID as string);
        // A quarter of the units, so a quarter of the tax. Returning the WHOLE tax on a partial
        // return is the plausible-looking bug: it balances, and it hands back money never collected.
        AssertEqual(
          Math.round(Number(back.Tax) * 100) / 100,
          Math.round(-Number(sold.Tax) / 4 * 100) / 100,
          "one of four units returns a quarter of the tax",
        );
      }),
  },
  {
    Id: "returns.RT7",
    Name: "RT7: a DISCOUNTED line returns what was paid, not the list price",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const sale = await sell(ctx, { price: 100, quantity: 4, discountPct: 0.25 });
        const sold = await lineTotals(ctx, sale.Order.ID as string);
        AssertEqual(Number(sold.Net), 300, "4 × 100 less 25% is 300");

        const ret = await returnAgainst(ctx, sale.Lines[0].ID as string, {
          productID: f.Products.WidgetA,
          quantity: 4,
          discountPct: 0.25,
        });
        Assert(ret.Saved, `confirm failed: ${ret.Message}`);

        const back = await lineTotals(ctx, ret.Order.ID as string);
        // Refunding 400 on a 300 sale balances perfectly and gives away 100. The ledger cannot
        // catch this; only the discount carrying through to the reversal can.
        AssertEqual(Number(back.Net), -300, "the return unwinds the DISCOUNTED amount");
        AssertEqual(Number(sold.Net) + Number(back.Net), 0, "the pair nets to zero");
      }),
  },
  {
    Id: "returns.RT8",
    Name: "RT8: a reversal does not materialize a second subscription",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const sale = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            {
              ProductID: f.Products.SubRolling,
              Quantity: 1,
              UnitPrice: 120,
              ServicePeriodStart: "2026-01-01",
              ServicePeriodEnd: "2026-12-31",
            },
          ],
        });
        Assert(sale.Saved, `the subscription sale must confirm: ${sale.Message}`);

        const after = await TxOne<{ N: number }>(ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.Subscription s
             JOIN ${ORDERS_SCHEMA}.SubscriptionTerm t ON t.SubscriptionID = s.ID
             JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = t.OrderLineID
            WHERE ol.OrderHeaderID='${sale.Order.ID}'`);
        AssertEqual(Number(after.N), 1, "the sale created exactly one subscription");

        // NO SERVICE PERIOD STATED, and that is the point of this line. It used to pass one —
        // "an EvenOverTime line has to say what period it is unwinding" — which was true of the
        // ENGINE and false of every caller: the Return page states only product, quantity and the
        // pointer, so a subscription order could not be returned from the UI at all (golive #235).
        // The window now comes from the origin, the same way the price does, so a reversal that
        // states nothing books.
        const ret = await returnAgainst(ctx, sale.Lines[0].ID as string, {
          productID: f.Products.SubRolling,
          quantity: 1,
          unitPrice: 120,
        });
        Assert(ret.Saved, `the reversal must book: ${ret.Message}`);

        // A reversal that ran the materialization path would create a SECOND subscription — one
        // more every time a customer cancelled, which is the precise opposite of the intent.
        const spawned = await TxOne<{ N: number }>(ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.Subscription s
             JOIN ${ORDERS_SCHEMA}.SubscriptionTerm t ON t.SubscriptionID = s.ID
             JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = t.OrderLineID
            WHERE ol.OrderHeaderID='${ret.Order.ID}'`);
        AssertEqual(Number(spawned.N), 0, "a reversal buys nothing, so it materializes nothing");
      }),
  },
  {
    Id: "returns.RT9",
    Name: "RT9: the return's ledger balances, per company, on its own",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await grantNexus(ctx, ["CA", "CA-SANTACLARA"]);
        const sale = await sell(ctx, { price: 100, quantity: 3, addressKey: "SantaClara" });
        const ret = await returnAgainst(ctx, sale.Lines[0].ID as string, {
          productID: f.Products.WidgetA,
          quantity: 3,
          addressKey: "SantaClara",
        });
        Assert(ret.Saved, `confirm failed: ${ret.Message}`);

        const l = await TxOne<{ Entries: number; Unbalanced: number }>(ctx,
          `WITH e AS (
              SELECT je.ID, gl.CompanyID, SUM(jel.DebitAmount) AS D, SUM(jel.CreditAmount) AS C
                FROM ${ORDERS_SCHEMA}.OrderLine ol
                JOIN ${ACCT_SCHEMA}.JournalEntry je ON je.ID = ol.JournalEntryID
                JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
                JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
               WHERE ol.OrderHeaderID='${ret.Order.ID}'
               GROUP BY je.ID, gl.CompanyID)
           SELECT COUNT(*) AS Entries,
                  SUM(CASE WHEN ABS(ISNULL(D,0)-ISNULL(C,0)) > 0.005 THEN 1 ELSE 0 END) AS Unbalanced
             FROM e`);
        Assert(Number(l.Entries) > 0, "the return booked an entry of its own");
        AssertEqual(Number(l.Unbalanced), 0, "the return's entry balances without reference to the sale");
      }),
  },
  {
    Id: "returns.RT10",
    Name: "RT10: returning MORE than was bought is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const sale = await sell(ctx, { price: 100, quantity: 2 });
        const ret = await returnAgainst(ctx, sale.Lines[0].ID as string, {
          productID: f.Products.WidgetA,
          quantity: 5,
        });
        // Over-returning balances perfectly and refunds money that was never collected — the
        // ledger has no way to notice. Only the origin line knows how much there is to give back.
        Assert(
          !ret.Saved,
          "returning 5 against a line that sold 2 must be refused — the ledger cannot catch this on its own",
        );
        // "At most 2 remains returnable" — the NUMBER, not just a complaint. A bare `/2/` would
        // match almost any message, including "Order line 2: …", so it is matched in context.
        Assert(
          /At most 2 remains returnable/i.test(ret.Message),
          `the refusal must state how much remains returnable — got: ${ret.Message}`,
        );
      }),
  },
  {
    Id: "returns.RT11",
    Name: "RT11: two partial returns may not exceed the original between them",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const sale = await sell(ctx, { price: 100, quantity: 3 });
        const lineID = sale.Lines[0].ID as string;

        const first = await returnAgainst(ctx, lineID, { productID: f.Products.WidgetA, quantity: 2 });
        Assert(first.Saved, `the first partial return must book: ${first.Message}`);

        // Each return is individually within the original. Only their SUM is not, so a guard that
        // reads the line in isolation passes both and refunds 4 units of a 3-unit sale.
        const second = await returnAgainst(ctx, lineID, { productID: f.Products.WidgetA, quantity: 2 });
        Assert(
          !second.Saved,
          "the second return must count what the first already took back — 2 + 2 against a 3-unit line",
        );

        const third = await returnAgainst(ctx, lineID, { productID: f.Products.WidgetA, quantity: 1 });
        Assert(third.Saved, `the remaining unit is still returnable: ${third.Message}`);
      }),
  },
  {
    Id: "returns.RT12",
    Name: "RT12: a reversal pointing at a line on another order is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // Two different products in two different companies, so the mispointing is the kind that
        // happens: an ID copied from the wrong row books a credit against the wrong company's
        // revenue and still balances.
        await addPrice(ctx, f.Products.WidgetB, 100);
        const saleA = await sell(ctx, { price: 100, quantity: 2 });

        const ret = await returnAgainst(ctx, saleA.Lines[0].ID as string, {
          productID: f.Products.WidgetB, // CoB's product against CoA's line
          quantity: 1,
        });
        Assert(
          !ret.Saved,
          "a reversal must return the product it points at — otherwise the credit lands on the wrong company's revenue",
        );
        // ASSERT THE REASON, not just the refusal. This check passed before the guard existed at
        // all: the line was rejected for having a negative quantity the pricing engine could not
        // handle, which is a different failure that happens to produce the same `Saved: false`.
        Assert(
          /different product/i.test(ret.Message),
          `the refusal must be about the PRODUCT, not about something incidental — got: ${ret.Message}`,
        );
      }),
  },
  {
    Id: "returns.RT13",
    Name: "RT13: a membership return inherits the window it unwinds and mirrors its schedule",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // golive #235. RT8 proves a reversal that states no window BOOKS. This proves it books the
        // RIGHT one — the schedules have to line up entry for entry, not merely sum to zero. A
        // reversal spread over the wrong months leaves every month of the year misstated while the
        // year itself foots, which is the failure shape nothing downstream reports.
        const f = Fx();
        const sale = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            {
              ProductID: f.Products.SubRolling,
              Quantity: 1,
              UnitPrice: 1200,
              ServicePeriodStart: "2026-01-01",
              ServicePeriodEnd: "2026-12-31",
            },
          ],
        });
        Assert(sale.Saved, `the membership sale must confirm: ${sale.Message}`);

        const ret = await returnAgainst(ctx, sale.Lines[0].ID as string, {
          productID: f.Products.SubRolling,
          quantity: 1,
        });
        Assert(ret.Saved, `a membership must be returnable without stating a period: ${ret.Message}`);

        // THE WINDOW LANDED ON THE LINE, which is what the recognition schedule is built from.
        // FORMATTED IN SQL, not in JS. A DATE column comes back as a `Date` pinned to UTC midnight,
        // and rendering it locally west of Greenwich moves it to the previous day — so a JS-side
        // comparison reports an off-by-one that the stored value does not have. CONVERT reads the
        // stored date itself, with no timezone in the path.
        const window = await TxOne<{ Start: string; End: string }>(
          ctx,
          `SELECT CONVERT(varchar(10), ServicePeriodStart, 23) AS Start,
                  CONVERT(varchar(10), ServicePeriodEnd, 23) AS [End]
             FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${ret.Order.ID}'`,
        );
        AssertEqual(
          String(window.Start),
          "2026-01-01",
          "the reversal covers the period the sale covered, not today",
        );
        AssertEqual(String(window.End), "2026-12-31", "…through the same end date");

        // ENTRY FOR ENTRY. The sale's releases hang off its TERM; the reversal buys no term, so its
        // releases hang off the reversal line. Same dates, same count, opposite side.
        const sold = await recognitionByDate(ctx, sale.Order.ID as string);
        const back = await recognitionByDate(ctx, ret.Order.ID as string);
        AssertEqual(back.length, sold.length, "the reversal produces one release per release it unwinds");
        AssertEqual(
          back.map((r) => r.On).join(","),
          sold.map((r) => r.On).join(","),
          "and lands them on the same dates",
        );
        for (let i = 0; i < sold.length; i++) {
          AssertEqual(
            Math.round((sold[i].Net + back[i].Net) * 100) / 100,
            0,
            `month ${sold[i].On} nets to zero`,
          );
        }
      }),
  },
  {
    Id: "returns.RT14",
    Name: "RT14: a reversal recognizes on the CADENCE its origin sold, not one month",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The window says WHICH months; the cadence says how they are cut, and it reaches the
        // factory by a different route — a map built only where terms are created, which a reversal
        // never enters. So it arrived empty and fell to the driver's default of one month. This type
        // recognizes QUARTERLY, so an unfixed reversal produces twelve releases against the sale's
        // four: the year nets to zero and not one month inside it does.
        const f = Fx();
        const sale = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            {
              ProductID: f.Products.SubFiscal,
              Quantity: 1,
              UnitPrice: 1200,
              ServicePeriodStart: "2026-07-01",
              ServicePeriodEnd: "2027-06-30",
            },
          ],
        });
        Assert(sale.Saved, `the fiscal-year membership sale must confirm: ${sale.Message}`);

        const sold = await recognitionByDate(ctx, sale.Order.ID as string);
        Assert(
          sold.length === 4,
          `a quarterly cadence over a year is four releases — got ${sold.length}. If this fails the ` +
            `fixture's recognition cadence changed and the rest of this check is measuring nothing.`,
        );

        const ret = await returnAgainst(ctx, sale.Lines[0].ID as string, {
          productID: f.Products.SubFiscal,
          quantity: 1,
        });
        Assert(ret.Saved, `the reversal must book: ${ret.Message}`);

        const back = await recognitionByDate(ctx, ret.Order.ID as string);
        AssertEqual(back.length, sold.length, "the reversal is cut into the same number of slices");
        AssertEqual(
          back.map((r) => r.On).join(","),
          sold.map((r) => r.On).join(","),
          "on the same dates — a monthly cut would put twelve entries here, on dates the sale never used",
        );
      }),
  },
];

for (const check of ReturnsChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("returns", {
  Setup: async (ctx) => { await CreateOrdersFixture(ctx); },
  Teardown: TeardownOrdersFixture,
});
