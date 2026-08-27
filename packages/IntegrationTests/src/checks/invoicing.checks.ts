/**
 * invoicing — `Orders: Generate Invoice`, the order rendered as the document you send a customer.
 *
 * WHY IT EXISTS
 * There is no Invoice record. The confirmed order IS the receivable, so an invoice is that order
 * presented — and every defect in a presentation layer looks exactly like a working one. A charge
 * that never got allocated simply is not on the bill. A discount recorded as a percentage prints as
 * no discount. A two-company order billed as one document names the wrong payee for half the money.
 * None of those throw, none of them look wrong on the page, and all of them undercharge or
 * misdirect real cash.
 *
 * THE CHECKS THAT EARN THEIR KEEP
 *   · IV2 — the documents SUM BACK to the order. This is the invariant the whole design is arranged
 *     around: an order sold by two companies produces two documents, and their grosses must add to
 *     `OrderHeader.TotalGross`. Anything lost between them is money nobody is ever billed for.
 *   · IV6 — a PERCENTAGE discount appears on the ladder. `OrderLine.DiscountAmount` is zero on those
 *     lines, so a renderer that trusts the column prints a subtotal and a total sixty dollars apart
 *     with nothing between them.
 *   · IV7 — a bundle prints its components WITHOUT amounts. Both halves priced is a bundle billed
 *     twice, and the line items each agree with themselves.
 *   · IV4 — a voided order is REFUSED. Rendered, it is indistinguishable from a live bill.
 *   · IV12 — the HTML fetches nothing external. It goes to a headless browser and into email bodies;
 *     a stylesheet link that silently fails produces an unstyled bill, and a webfont that fails
 *     produces one that is subtly wrong.
 *
 * WHAT IT PROVES
 *   IV1   a confirmed order renders as an Invoice, with its number on it
 *   IV2   a two-company order splits, and the documents sum to the order
 *   IV3   a draft renders as a Quote, not a bill
 *   IV4   a voided order is refused rather than rendered
 *   IV5   a return renders as a Credit Memo with credit wording
 *   IV6   a percentage discount reaches the ladder and the ladder ties
 *   IV7   a bundle nests its components and bills them once
 *   IV8   charges and tax print as named rows that total the order's own figures
 *   IV9   a payment reduces the amount due and is named on the document
 *   IV10  Format=DATA returns the figures and renders no markup
 *   IV11  the OrderID is validated at the boundary, not interpolated
 *   IV12  the rendered HTML is self-contained — no external fetch of any kind
 *   IV13  rendering twice gives byte-identical output, because nothing is stored
 *   IV14  the action's DriverClass in metadata resolves to a registered class
 *   IV15  a clean order produces no diagnostic notes
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: GenerateInvoiceAction · InvoiceBehavior · InvoiceBuilder · InvoiceDisplay
 *   DATA: metadata/templates/invoice-standard.html · metadata/actions/.orders-actions.json
 */
import { BaseAction } from "@memberjunction/actions";
import type { ActionParam, ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
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
  CreateBundleItem,
  CreateOrdersFixture,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxMaybeOne,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { BuildOrder, ConfirmOrder } from "../order-builder.js";

/** The registration key the metadata's DriverClass must match. */
const DRIVER_CLASS = "Orders.GenerateInvoice";

interface RenderedInvoice {
  DocumentNumber: string;
  Kind: string;
  CompanyID: string;
  CompanyName: string;
  Gross: number;
  AmountDue: number;
  HTML: string | null;
  Data: Record<string, unknown>;
  Notes: string[];
}

interface InvoiceRun {
  Result: ActionResultSimple;
  Invoices: RenderedInvoice[];
  HTML: string | null;
  Notes: string[];
}

/** Read an output parameter off the run. */
function output<T>(params: ActionParam[] | undefined, name: string): T | undefined {
  return params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase())?.Value as T | undefined;
}

/**
 * Run the action the way the platform runs it — resolved from the ClassFactory under the key the
 * metadata names, not by importing the class. Importing it would prove the code works and prove
 * nothing about whether anything can find it.
 */
async function invoice(ctx: IntegrationCheckContext, inputs: Record<string, unknown>): Promise<InvoiceRun> {
  const action = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAction>(BaseAction, DRIVER_CLASS);
  Assert(action != null, `'${DRIVER_CLASS}' is not registered — the Load anchor is missing from the server bootstrap`);

  const params = {
    ContextUser: ctx.User,
    Provider: ctx.Provider,
    Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: "Input" as const })),
    Filters: [],
  } as unknown as RunActionParams;

  const result = await action!.Run(params);
  return {
    Result: result,
    Invoices: output<RenderedInvoice[]>(params.Params, "Invoices") ?? [],
    HTML: output<string | null>(params.Params, "HTML") ?? null,
    Notes: output<string[]>(params.Params, "Notes") ?? [],
  };
}

/** Confirm a one-line order against a company, returning its id. */
async function sell(
  ctx: IntegrationCheckContext,
  opts: { amount?: number; qty?: number; discountPct?: number; company?: "A" | "B"; product?: string } = {},
): Promise<string> {
  const f = Fx();
  const co = opts.company === "B" ? f.CoB : f.CoA;
  const productKey = opts.product ?? (opts.company === "B" ? "WidgetB" : "WidgetA");
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: co.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: [
      {
        ProductID: f.Products[productKey],
        Quantity: opts.qty ?? 1,
        UnitPrice: opts.amount ?? 300,
        DiscountPct: opts.discountPct,
      },
    ],
  });
  Assert(result.Saved, `confirm failed: ${result.Message}`);
  return result.Order.ID as string;
}

/** The header figures, read straight from the table so the document is checked against the ledger. */
const headerOf = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ OrderNumber: string; TotalGross: number; Balance: number; Status: string }>(
    ctx,
    `SELECT OrderNumber, TotalGross, Balance, Status FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${orderID}'`,
  );

const money = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Ladder rows of a given kind, from the decorated document. */
function ladder(doc: RenderedInvoice, kind?: string): Array<{ Label: string; Amount: number; Kind: string; Note: string | null }> {
  const rows = ((doc.Data as { Ladder?: Array<{ Label: string; Amount: number; Kind: string; Note: string | null }> }).Ladder ?? []);
  return kind ? rows.filter((r) => r.Kind === kind) : rows;
}

export const InvoicingChecks: NamedCheck[] = [
  {
    Id: "invoicing.IV1",
    Name: "IV1: a confirmed order renders as an Invoice carrying its own order number",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const orderID = await sell(ctx, { amount: 400 });
        const header = await headerOf(ctx, orderID);

        const run = await invoice(ctx, { OrderID: orderID });
        Assert(run.Result.Success, `render failed: ${run.Result.Message}`);
        AssertEqual(run.Invoices.length, 1, "one selling company, one document");

        const doc = run.Invoices[0];
        AssertEqual(doc.Kind, "Invoice", "a confirmed order is an invoice");
        // The document number IS the order number for a single-company order — the customer, the
        // ledger and the aging report then all quote the same string.
        AssertEqual(doc.DocumentNumber, header.OrderNumber, "numbered as the order");
        AssertEqual(money(doc.Gross), money(header.TotalGross), "and billing what the order came to");

        Assert(run.HTML != null && run.HTML.length > 500, "HTML was produced");
        Assert(run.HTML!.includes(header.OrderNumber), "with the order number on the page");
      }),
  },
  {
    Id: "invoicing.IV2",
    Name: "IV2: a two-company order splits, and the documents sum back to the order",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const built = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            { ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 300 },
            { ProductID: f.Products.WidgetB, Quantity: 2, UnitPrice: 125 },
          ],
        });
        Assert(built.Saved, `confirm failed: ${built.Message}`);
        const orderID = built.Order.ID as string;
        const header = await headerOf(ctx, orderID);

        const companies = await TxQuery<{ CompanyID: string }>(
          ctx,
          `SELECT DISTINCT CompanyID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}'`,
        );
        AssertEqual(companies.length, 2, "the fixture really did sell this order from two companies");

        const run = await invoice(ctx, { OrderID: orderID });
        Assert(run.Result.Success, `render failed: ${run.Result.Message}`);
        AssertEqual(run.Invoices.length, 2, "one document per selling company");
        AssertEqual(run.Result.ResultCode, "SPLIT_BY_COMPANY", "and the caller is told, in the result code");

        // THE INVARIANT. Anything that falls between the two documents is money the customer is
        // never billed for, on a page that adds up perfectly.
        const summed = money(run.Invoices.reduce((s, d) => s + d.Gross, 0));
        AssertEqual(summed, money(header.TotalGross), "the documents sum to the order");

        // Suffixed, and stable: companies are ordered by ID, so re-rendering gives the same letters.
        AssertEqual(run.Invoices[0].DocumentNumber, `${header.OrderNumber}-A`, "the first is -A");
        AssertEqual(run.Invoices[1].DocumentNumber, `${header.OrderNumber}-B`, "the second is -B");
        Assert(run.Invoices[0].CompanyID !== run.Invoices[1].CompanyID, "and they are different companies");

        // Handing back the first of two as though it were the whole bill is the failure this refuses.
        AssertEqual(run.HTML, null, "the scalar HTML is null rather than half the bill");

        const narrowed = await invoice(ctx, { OrderID: orderID, CompanyID: run.Invoices[1].CompanyID });
        AssertEqual(narrowed.Invoices.length, 1, "narrowing to one company gives one document");
        AssertEqual(narrowed.Invoices[0].DocumentNumber, `${header.OrderNumber}-B`, "still -B — the suffix describes the order");
      }),
  },
  {
    Id: "invoicing.IV3",
    Name: "IV3: a draft renders as a Quote, and says nothing is owed",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const built = await BuildOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 250 }],
        });
        built.Order.Status = "Draft";
        Assert(await built.Order.Save(), "the draft saved");

        const run = await invoice(ctx, { OrderID: built.Order.ID as string });
        Assert(run.Result.Success, `render failed: ${run.Result.Message}`);

        const doc = run.Invoices[0];
        AssertEqual(doc.Kind, "Quote", "a draft is a quote");
        // A quote must never carry the language of a bill, whatever its arithmetic comes out to.
        Assert(run.HTML!.includes("This is a quote, not a bill"), "and it says so on the page");
        AssertEqual((doc.Data as { IsSettled: boolean }).IsSettled, false, "a quote is never settled");
        AssertEqual((doc.Data as { IsOverdue: boolean }).IsOverdue, false, "and never overdue");
      }),
  },
  {
    Id: "invoicing.IV4",
    Name: "IV4: a voided order is refused, not rendered",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const orderID = await sell(ctx, { amount: 200 });
        await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.OrderHeader SET Status='Voided' WHERE ID='${orderID}'`);

        const run = await invoice(ctx, { OrderID: orderID });
        AssertEqual(run.Result.Success, false, "refused");
        AssertEqual(run.Result.ResultCode, "NOT_INVOICEABLE", "and refused for the right reason");
        AssertEqual(run.Invoices.length, 0, "with nothing rendered");
        // Reported as a refusal, not as an empty success: zero documents plus Success=true reads to
        // a workflow as "this order needed no invoice".
        Assert(/voided/i.test(run.Result.Message ?? ""), `the message names the cause: ${run.Result.Message}`);
      }),
  },
  {
    Id: "invoicing.IV5",
    Name: "IV5: a return renders as a Credit Memo, with credit wording rather than a demand",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const sale = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 300 }],
        });
        Assert(sale.Saved, `sale failed: ${sale.Message}`);

        const ret = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          OrderType: "Return",
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            {
              ProductID: f.Products.WidgetA,
              Quantity: -1,
              UnitPrice: 300,
              ReversesOrderLineID: sale.Lines[0].ID as string,
            },
          ],
        });
        Assert(ret.Saved, `return failed: ${ret.Message}`);

        const run = await invoice(ctx, { OrderID: ret.Order.ID as string });
        Assert(run.Result.Success, `render failed: ${run.Result.Message}`);

        const doc = run.Invoices[0];
        AssertEqual(doc.Kind, "Credit Memo", "a negative total is a credit memo");
        AssertEqual((doc.Data as { DueLabel: string }).DueLabel, "Credit due you", "labelled as a credit");
        Assert(money(doc.AmountDue) < 0, "the customer is owed");

        // The headline is a MAGNITUDE — the label already carries the direction, and a minus sign at
        // the far left of a right-aligned column hides behind the widest number above it. Asserted
        // against the fixture's own currency rather than a dollar sign: these companies trade in
        // whatever their accounting profile says, and hardcoding $ here would be the same mistake
        // the renderer is being checked for not making.
        const headline = (doc.Data as { AmountDueText: string }).AmountDueText;
        Assert(headline.includes("300.00"), `the amount is there: ${headline}`);
        Assert(!headline.includes("-") && !headline.includes("("), `and shown as a magnitude: ${headline}`);
        Assert(run.HTML!.includes("How to use this credit"), "and the footer offers the credit rather than demanding payment");
      }),
  },
  {
    Id: "invoicing.IV6",
    Name: "IV6: a PERCENTAGE discount reaches the ladder, and the ladder ties",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // 2 x 300 at 10% off. `OrderLine.DiscountAmount` stays ZERO on this shape — a renderer that
        // reads the column prints Subtotal 600 / Total 540 with nothing between them.
        const orderID = await sell(ctx, { amount: 300, qty: 2, discountPct: 0.1 });
        const header = await headerOf(ctx, orderID);

        const line = await TxOne<{ DiscountAmount: number; LineTotalNet: number }>(
          ctx,
          `SELECT DiscountAmount, LineTotalNet FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}'`,
        );
        AssertEqual(money(line.DiscountAmount), 0, "the discount column really is empty on this line");
        AssertEqual(money(line.LineTotalNet), 540, "and the net really is discounted");

        const run = await invoice(ctx, { OrderID: orderID });
        Assert(run.Result.Success, `render failed: ${run.Result.Message}`);
        const doc = run.Invoices[0];

        AssertEqual(money((doc.Data as { ListSubtotal: number }).ListSubtotal), 600, "the subtotal is the list price");
        AssertEqual(money((doc.Data as { DiscountTotal: number }).DiscountTotal), 60, "and the discount is derived, not read");

        const discounts = ladder(doc, "Discount");
        Assert(discounts.length > 0, "a discount row is on the ladder");
        AssertEqual(money(discounts.reduce((s, r) => s + r.Amount, 0)), -60, "totalling the whole discount");

        // Subtotal minus every discount plus every charge and tax must reach the total.
        const rows = ladder(doc);
        const subtotal = rows.find((r) => r.Kind === "Subtotal")!.Amount;
        const walked = money(
          subtotal + rows.filter((r) => ["Discount", "Charge", "Tax"].includes(r.Kind)).reduce((s, r) => s + r.Amount, 0),
        );
        AssertEqual(walked, money(header.TotalGross), "and the ladder walks to the order total");
        AssertEqual(run.Notes.length, 0, "with nothing the builder had to guess at");
      }),
  },
  {
    Id: "invoicing.IV7",
    Name: "IV7: a bundle nests its components and bills them exactly once",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await CreateBundleItem(ctx, f.Products.BundleA, f.Products.BundlePartX, { Quantity: 1, SortOrder: 10 });
        await CreateBundleItem(ctx, f.Products.BundleA, f.Products.BundlePartY, { Quantity: 1, SortOrder: 20 });

        const built = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.BundleA, Quantity: 1, UnitPrice: 200 }],
        });
        Assert(built.Saved, `confirm failed: ${built.Message}`);
        const orderID = built.Order.ID as string;
        const header = await headerOf(ctx, orderID);

        const parent = await TxMaybeOne<{ ID: string }>(
          ctx,
          `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}' AND IsRollupParent=1`,
        );
        Assert(parent != null, "the bundle expanded into a rollup parent");

        const run = await invoice(ctx, { OrderID: orderID });
        Assert(run.Result.Success, `render failed: ${run.Result.Message}`);
        const doc = run.Invoices[0];

        const rows = (doc.Data as { Rows: Array<{ Amount: number; Children: Array<{ AmountText: string }> }> }).Rows;
        AssertEqual(rows.length, 1, "the components print UNDER the bundle, not beside it");
        Assert(rows[0].Children.length >= 2, "with the components nested");
        // Both halves priced is a bundle billed twice, on a page where every line agrees with itself.
        Assert(
          rows[0].Children.every((c) => c.AmountText === "included"),
          "and the components carry no amount of their own",
        );

        const topLevel = money(rows.reduce((s, r) => s + r.Amount, 0));
        AssertEqual(topLevel, money((doc.Data as { NetTotal: number }).NetTotal), "the printed amounts total the net");
        AssertEqual(money(doc.Gross), money(header.TotalGross), "and the document bills the order once");
      }),
  },
  {
    Id: "invoicing.IV8",
    Name: "IV8: charges and tax print as named rows totalling the order's own figures",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const built = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          ShipToAddressID: f.Tax.AddressIDs.get("SantaClara"),
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 500 }],
          Charges: [{ Code: "Shipping", Amount: 25 }, { Code: "SalesTax" }],
        });
        Assert(built.Saved, `confirm failed: ${built.Message}`);
        const orderID = built.Order.ID as string;
        const header = await headerOf(ctx, orderID);

        const lineTotals = await TxOne<{ Charge: number; Tax: number }>(
          ctx,
          `SELECT SUM(ChargeAmount) AS Charge, SUM(LineTax) AS Tax FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}'`,
        );

        const run = await invoice(ctx, { OrderID: orderID });
        Assert(run.Result.Success, `render failed: ${run.Result.Message}`);
        const doc = run.Invoices[0];

        AssertEqual(money((doc.Data as { ChargeTotal: number }).ChargeTotal), money(lineTotals.Charge), "the fees match the lines");
        AssertEqual(money((doc.Data as { TaxTotal: number }).TaxTotal), money(lineTotals.Tax), "and so does the tax");

        const charged = money(ladder(doc, "Charge").reduce((s, r) => s + r.Amount, 0));
        const taxed = money(ladder(doc, "Tax").reduce((s, r) => s + r.Amount, 0));
        AssertEqual(charged, money(lineTotals.Charge), "the named fee rows total the fees");
        AssertEqual(taxed, money(lineTotals.Tax), "and the named tax rows total the tax");
        AssertEqual(money(doc.Gross), money(header.TotalGross), "leaving the document on the order's total");
        AssertEqual(run.Notes.length, 0, `no charge was left unattributed: ${run.Notes.join(" | ")}`);
      }),
  },
  {
    Id: "invoicing.IV9",
    Name: "IV9: a payment reduces the amount due and is named on the document",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const orderID = await sell(ctx, { amount: 400 });

        // Taken through the same operation the UI goes through. A payment written any other way
        // would not produce the allocation rows this document reads.
        const capture = MJGlobal.Instance.ClassFactory.CreateInstance<
          BaseRemotableOperation<Record<string, unknown>, { Success: boolean; Message?: string; PaymentNumber?: string }>
        >(BaseRemotableOperation, "Orders.CapturePayment");
        Assert(capture != null, "'Orders.CapturePayment' is not registered");
        const captured = await capture!.Execute(
          {
            Amount: 150,
            ReceivingCompanyID: f.CoA.ID,
            BillToOrganizationID: f.Customers.OrganizationID,
            TenderCode: "Cash",
            Allocations: [{ OrderHeaderID: orderID, Amount: 150 }],
          },
          { provider: ctx.Provider, user: ctx.User },
        );
        Assert(captured.Success && captured.Output.Success, `capture failed: ${captured.Output?.Message}`);

        const run = await invoice(ctx, { OrderID: orderID });
        Assert(run.Result.Success, `render failed: ${run.Result.Message}`);
        const doc = run.Invoices[0];

        AssertEqual(money((doc.Data as { AmountPaid: number }).AmountPaid), 150, "the payment is on the document");
        AssertEqual(money(doc.AmountDue), money(doc.Gross - 150), "and the amount due came down by it");
        AssertEqual((doc.Data as { PaymentStatusLabel: string }).PaymentStatusLabel, "Partly paid", "described honestly");

        const paymentNumber = captured.Output.PaymentNumber!;
        Assert(run.HTML!.includes(paymentNumber), "the payment is named on the page so the customer can match it");
        Assert(!run.HTML!.includes("Paid in full"), "and a part-paid bill is not stamped settled");
      }),
  },
  {
    Id: "invoicing.IV10",
    Name: "IV10: Format=DATA returns the figures and renders no markup",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const orderID = await sell(ctx, { amount: 275 });
        const header = await headerOf(ctx, orderID);

        const run = await invoice(ctx, { OrderID: orderID, Format: "DATA" });
        Assert(run.Result.Success, `render failed: ${run.Result.Message}`);
        AssertEqual(run.Invoices.length, 1, "the document is still assembled");
        AssertEqual(run.Invoices[0].HTML, null, "but no markup was produced");
        AssertEqual(money(run.Invoices[0].Gross), money(header.TotalGross), "and the figures are the real ones");

        const bad = await invoice(ctx, { OrderID: orderID, Format: "PDF" });
        AssertEqual(bad.Result.Success, false, "an unsupported format is refused by name");
        AssertEqual(bad.Result.ResultCode, "UNSUPPORTED_FORMAT", "rather than quietly falling back to HTML");
      }),
  },
  {
    Id: "invoicing.IV11",
    Name: "IV11: the OrderID is validated at the boundary, not interpolated",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The layers below guard by THROWING — that is what keeps an id out of a SQL string. An
        // action that lets the throw escape hands a workflow an exception instead of a result it can
        // branch on, so the refusal has to arrive as a value with a code on it.
        const injected = await invoice(ctx, { OrderID: "' OR 1=1 --" });
        AssertEqual(injected.Result.Success, false, "an injected id is refused");
        AssertEqual(injected.Result.ResultCode, "INVALID_ORDER_ID", "as a result, not as a thrown error");
        AssertEqual(injected.Invoices.length, 0, "and renders nothing");

        const orderNumber = await invoice(ctx, { OrderID: "ORD-1005" });
        AssertEqual(orderNumber.Result.ResultCode, "INVALID_ORDER_ID", "an order NUMBER is refused by name too");
        Assert(/not its order number/i.test(orderNumber.Result.Message ?? ""), "and told which id it wanted");

        const missing = await invoice(ctx, {});
        AssertEqual(missing.Result.Success, false, "so is no id at all");
        AssertEqual(missing.Result.ResultCode, "MISSING_ORDER_ID", "named as the missing input it is");

        const unknown = await invoice(ctx, { OrderID: "00000000-0000-0000-0000-000000000000" });
        AssertEqual(unknown.Result.Success, false, "and an id that resolves to nothing is a refusal");
        AssertEqual(unknown.Result.ResultCode, "ORDER_NOT_FOUND", "not an empty success");
      }),
  },
  {
    Id: "invoicing.IV12",
    Name: "IV12: the rendered HTML fetches nothing external",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const orderID = await sell(ctx, { amount: 320 });
        const run = await invoice(ctx, { OrderID: orderID });
        Assert(run.Result.Success, `render failed: ${run.Result.Message}`);
        const html = run.HTML!;

        // This page is handed to a headless browser for PDF and pasted into email bodies. A
        // stylesheet link that silently fails produces an unstyled bill; a webfont that fails
        // produces one that is subtly wrong and still goes out.
        for (const pattern of [
          /<link[^>]+rel=["']?stylesheet/i,
          /<script/i,
          /@import/i,
          /src=["']https?:/i,
          /url\(["']?https?:/i,
          /<img[^>]+src=["']https?:/i,
        ]) {
          Assert(!pattern.test(html), `the document reaches outside itself: ${pattern}`);
        }
        Assert(html.includes("<style>"), "its CSS is inline, where it cannot fail to load");
      }),
  },
  {
    Id: "invoicing.IV13",
    Name: "IV13: rendering twice gives identical output, because nothing is stored",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const orderID = await sell(ctx, { amount: 180 });

        // An invoice is DERIVED. If two renders can differ, something was stored — and the second
        // document is then a different bill with the same number on it.
        const first = await invoice(ctx, { OrderID: orderID, AsOfDate: "2026-07-01" });
        const second = await invoice(ctx, { OrderID: orderID, AsOfDate: "2026-07-01" });
        Assert(first.Result.Success && second.Result.Success, "both rendered");
        AssertEqual(second.HTML, first.HTML, "byte for byte");

        const invoiceCount = await TxQuery(
          ctx,
          `SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID('${ORDERS_SCHEMA}') AND name = 'Invoice'`,
        );
        AssertEqual(invoiceCount.length, 0, "and there is no Invoice table for one to have been written to");
      }),
  },
  {
    Id: "invoicing.IV14",
    Name: "IV14: the action's DriverClass in metadata resolves to a registered class",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const action = await TxMaybeOne<{ DriverClass: string; Status: string; Type: string }>(
          ctx,
          `SELECT DriverClass, Status, Type FROM __mj.Action WHERE Name = 'Generate Invoice'`,
        );
        Assert(action != null, "the action row exists — push the app metadata if not");
        AssertEqual(action!.Status, "Active", "and it is active");
        AssertEqual(action!.DriverClass, DRIVER_CLASS, "pointing at the registered key");

        // The failure this catches: an action that exists in metadata, is offered in the UI, and has
        // nothing behind it because the Load anchor was tree-shaken away.
        const resolved = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAction>(BaseAction, action!.DriverClass);
        Assert(resolved != null, `nothing is registered under '${action!.DriverClass}'`);
        Assert(resolved instanceof BaseAction, "and what is registered is an action");

        const params = await TxQuery<{ Name: string; Type: string }>(
          ctx,
          `SELECT Name, Type FROM __mj.ActionParam WHERE ActionID = (SELECT ID FROM __mj.Action WHERE Name='Generate Invoice')`,
        );
        // `__mj.ActionParam.Type` is nchar(10), so these come back space-PADDED — 'Input     ', not
        // 'Input'. An equality check against the unpadded literal silently finds nothing, which is
        // indistinguishable from the parameters not being declared at all.
        const named = (name: string, type: string) =>
          params.some((p) => p.Name?.trim() === name && p.Type?.trim() === type);
        Assert(named("OrderID", "Input"), `the input it needs is declared: ${JSON.stringify(params)}`);
        Assert(named("Invoices", "Output"), "and the output it returns");
        Assert(named("HTML", "Output"), "and the rendered document");
      }),
  },
  {
    Id: "invoicing.IV15",
    Name: "IV15: a clean order produces no diagnostic notes",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const orderID = await sell(ctx, { amount: 450, qty: 3 });
        const run = await invoice(ctx, { OrderID: orderID, ShowDiagnostics: true });
        Assert(run.Result.Success, `render failed: ${run.Result.Message}`);

        // `Notes` is where the builder records money it placed by judgement and any ladder that
        // failed to reach its own total. Empty is the expected state; anything here is a real
        // finding on an ordinary order.
        AssertEqual(run.Notes.length, 0, `an ordinary order needs no judgement calls: ${run.Notes.join(" | ")}`);
        Assert(!run.HTML!.includes("not for the customer"), "so the diagnostics block does not print");
      }),
  },
];

for (const check of InvoicingChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("invoicing", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: TeardownOrdersFixture,
});
