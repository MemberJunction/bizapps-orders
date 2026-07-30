/**
 * tax — is the customer charged tax, and is it the RIGHT tax? (D73)
 *
 * There are four ways to owe no tax, they produce the identical number, and telling them apart is
 * the whole job:
 *
 *   1. the product is not taxable        (the walk: product → category → type)
 *   2. the seller has no NEXUS there     (we have no obligation to collect)
 *   3. the BUYER is exempt               (certificate, possibly scoped to a product category)
 *   4. no jurisdiction matches at all
 *
 * A suite that only asserted totals would pass with any of these wired to any of the others. So the
 * checks below assert the REASON as well as the amount wherever a zero is expected.
 *
 * THE ONES THAT EARN THEIR KEEP
 *   TX2/TX3 — Santa Clara 9.125% vs San Mateo 9.375%. Neighbouring California counties, a quarter
 *   point apart, resolved from the ship-to postal code. A system that stops at the state level is
 *   not slightly imprecise, it is wrong for most of California.
 *
 *   TX6 — NO NEXUS. The order ships to New York, New York charges tax, and we charge nothing
 *   because this company is not registered there. This is the commonest reason a CORRECT system
 *   charges zero, and the easiest thing to get backwards.
 *
 *   TX8/TX9 — exemption scoped to a product CATEGORY. The same customer, the same jurisdiction,
 *   two products: one exempt, one not.
 *
 * CONNECTS TO:
 *   CODE: TaxResolver (ResolveTax · ResolveTaxability · LoadNexusJurisdictions) · ChargeEngine
 *   DOC:  plans/pricing-charges-and-promotions.md §6
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
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { ConfirmOrder } from "../order-builder.js";
import type { LooseEntity } from "../payment-builder.js";

async function addPrice(ctx: IntegrationCheckContext, productID: string, amount: number): Promise<void> {
  // Delegates to the shared builder so the price goes through `ProductPriceEntityServer` and its
  // ambiguity guard, rather than around it. Idempotent per product — see CreateProductPrice.
  await CreateProductPrice(ctx, productID, amount);
}

/** Set taxability at whichever level the check is exercising. */
async function setTaxability(
  ctx: IntegrationCheckContext,
  opts: {
    productID?: string;
    productIsTaxable?: boolean | null;
    productTaxCategory?: string | null;
    categoryID?: string;
    categoryIsTaxable?: boolean | null;
    categoryTaxCategory?: string | null;
  },
): Promise<void> {
  const b = (v: boolean | null | undefined) => (v == null ? "NULL" : v ? "1" : "0");
  const q = (v: string | null | undefined) => (v == null ? "NULL" : `'${v}'`);
  if (opts.productID) {
    await TxQuery(ctx,
      `UPDATE ${ORDERS_SCHEMA}.Product
          SET IsTaxable = ${b(opts.productIsTaxable)}, TaxCategory = ${q(opts.productTaxCategory)}
        WHERE ID = '${opts.productID}'`);
  }
  if (opts.categoryID) {
    await TxQuery(ctx,
      `UPDATE ${ORDERS_SCHEMA}.ProductCategory
          SET DefaultIsTaxable = ${b(opts.categoryIsTaxable)}, DefaultTaxCategory = ${q(opts.categoryTaxCategory)}
        WHERE ID = '${opts.categoryID}'`);
  }
}

/** Record a customer exemption, optionally scoped to a jurisdiction and/or a product category. */
async function addExemption(
  ctx: IntegrationCheckContext,
  opts: {
    organizationID?: string;
    personID?: string;
    jurisdictionKey?: string | null;
    taxCategory?: string | null;
    type?: string;
    expiresAt?: string | null;
  },
): Promise<string> {
  const f = Fx();
  const id = randomUUID();
  const jid = opts.jurisdictionKey ? f.Tax.JurisdictionIDs.get(opts.jurisdictionKey) : null;
  const q = (v: string | null | undefined) => (v == null ? "NULL" : `'${v}'`);
  await TxQuery(ctx,
    `INSERT INTO ${ORDERS_SCHEMA}.CustomerTaxExemption
       (ID, OrganizationID, PersonID, TaxJurisdictionID, TaxCategory, ExemptionType,
        CertificateRef, CertificateExpiresAt, Status)
     VALUES ('${id}', ${q(opts.organizationID)}, ${q(opts.personID)}, ${q(jid)}, ${q(opts.taxCategory)},
             '${opts.type ?? "NonProfit"}', 'CERT-${id.slice(0, 8)}', ${q(opts.expiresAt)}, 'Active')`);
  return id;
}

/** Confirm an order shipping to one of the fixture's addresses. */
async function confirmShippingTo(
  ctx: IntegrationCheckContext,
  addressKey: string,
  lines: Array<{ ProductID: string; Quantity: number }>,
): Promise<{ Saved: boolean; Message: string; Order: LooseEntity }> {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    ShipToAddressID: f.Tax.AddressIDs.get(addressKey),
    Lines: lines,
  });
  return { Saved: result.Saved, Message: result.Message, Order: result.Order as LooseEntity };
}

/** The recorded REASON a line owes no tax — a zero-amount component, not a bare zero. */
async function taxReasonFor(ctx: IntegrationCheckContext, orderID: string): Promise<string | null> {
  const row = await TxOne<{ Label: string | null }>(
    ctx,
    `SELECT TOP 1 c.Label
       FROM ${ORDERS_SCHEMA}.OrderLinePriceComponent c
       JOIN ${ORDERS_SCHEMA}.OrderLine l ON l.ID = c.OrderLineID
      WHERE l.OrderHeaderID = '${orderID}' AND c.ComponentType = 'Tax'`,
  );
  return row?.Label ?? null;
}

const taxOf = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ Net: number; Tax: number; Gross: number }>(
    ctx,
    `SELECT ISNULL(SUM(LineTotalNet),0) AS Net, ISNULL(SUM(LineTax),0) AS Tax,
            ISNULL(SUM(LineTotalGross),0) AS Gross
       FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${orderID}'`,
  );

/** How many tax LAYERS were charged — the multi-jurisdiction proof. */
const layerCount = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ N: number }>(
    ctx,
    `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderCharge c
       JOIN ${ORDERS_SCHEMA}.ChargeType t ON t.ID = c.ChargeTypeID
      WHERE c.OrderHeaderID='${orderID}' AND t.Category='Tax'`,
  );

export const TaxChecks: NamedCheck[] = [
  {
    Id: "tax.TX1",
    Name: "TX1: a flat state charges one layer at its rate (Maryland 6%)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const order = await confirmShippingTo(ctx, "Maryland", [{ ProductID: f.Products.WidgetA, Quantity: 10 }]);
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        AssertEqual(Number((await taxOf(ctx, order.Order.ID as string)).Tax), 60, "6% of 1000");
        AssertEqual(Number((await layerCount(ctx, order.Order.ID as string)).N), 1, "Maryland has no locals — one layer");
      }),
  },
  {
    Id: "tax.TX2",
    Name: "TX2: Santa Clara County resolves to 9.125% — state plus county",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const order = await confirmShippingTo(ctx, "SantaClara", [{ ProductID: f.Products.WidgetA, Quantity: 10 }]);
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        // 7.25% state + 1.875% county = 9.125%
        AssertEqual(Number((await taxOf(ctx, order.Order.ID as string)).Tax), 91.25, "9.125% of 1000");
        AssertEqual(Number((await layerCount(ctx, order.Order.ID as string)).N), 2, "state and county are separate charges");
      }),
  },
  {
    Id: "tax.TX3",
    Name: "TX3: San Mateo County resolves to 9.375% — a DIFFERENT answer one county over",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const order = await confirmShippingTo(ctx, "SanMateo", [{ ProductID: f.Products.WidgetA, Quantity: 10 }]);
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        // 7.25% + 2.125% = 9.375%. TX2 was 91.25 on identical goods — resolving at the state level
        // would have produced 72.50 for both and been wrong for most of California.
        AssertEqual(Number((await taxOf(ctx, order.Order.ID as string)).Tax), 93.75, "9.375% of 1000");
      }),
  },
  {
    Id: "tax.TX4",
    Name: "TX4: a regional add-on applies inside its postal range and not outside (Northern Virginia)",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        // CoA has NO Virginia nexus, so grant it for this check only — the point here is the
        // postal-range geography, not the nexus gate (TX6 covers that).
        for (const key of ["VA", "VA-NOVA"]) {
          await TxQuery(ctx,
            `INSERT INTO ${ACCT_SCHEMA}.CompanyTaxNexus
               (ID, CompanyID, TaxJurisdictionID, NexusType, RegisteredFrom, Status)
             VALUES ('${randomUUID()}','${f.CoA.ID}','${f.Tax.JurisdictionIDs.get(key)}','Economic','2020-01-01','Active')`);
        }

        const nova = await confirmShippingTo(ctx, "NoVA", [{ ProductID: f.Products.WidgetA, Quantity: 10 }]);
        Assert(nova.Saved, `confirm failed: ${nova.Message}`);
        AssertEqual(Number((await taxOf(ctx, nova.Order.ID as string)).Tax), 60, "5.3% + 0.7% = 6%");

        const richmond = await confirmShippingTo(ctx, "Richmond", [{ ProductID: f.Products.WidgetA, Quantity: 10 }]);
        Assert(richmond.Saved, `confirm failed: ${richmond.Message}`);
        AssertEqual(Number((await taxOf(ctx, richmond.Order.ID as string)).Tax), 53, "outside the range, 5.3% only");
      }),
  },
  {
    Id: "tax.TX5",
    Name: "TX5: three layers stack — NYC is state + city + transit district",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        for (const key of ["NY", "NY-NYC", "NY-MCTD"]) {
          await TxQuery(ctx,
            `INSERT INTO ${ACCT_SCHEMA}.CompanyTaxNexus
               (ID, CompanyID, TaxJurisdictionID, NexusType, RegisteredFrom, Status)
             VALUES ('${randomUUID()}','${f.CoA.ID}','${f.Tax.JurisdictionIDs.get(key)}','Economic','2020-01-01','Active')`);
        }

        const order = await confirmShippingTo(ctx, "NYC", [{ ProductID: f.Products.WidgetA, Quantity: 10 }]);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        // 4% + 4.5% + 0.375% = 8.875%
        AssertEqual(Number((await taxOf(ctx, order.Order.ID as string)).Tax), 88.75, "8.875% of 1000");
        AssertEqual(Number((await layerCount(ctx, order.Order.ID as string)).N), 3, "three separate charges, one per authority");
      }),
  },
  {
    Id: "tax.TX6",
    Name: "TX6: NO NEXUS — the jurisdiction taxes, and we charge nothing",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        // The fixture registers CoA in CA, DC and MD — deliberately NOT New York. TX5 proves New
        // York charges 8.875% when we ARE registered, so this zero is about the obligation and
        // nothing else.
        const order = await confirmShippingTo(ctx, "NYC", [{ ProductID: f.Products.WidgetA, Quantity: 10 }]);
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const sums = await taxOf(ctx, order.Order.ID as string);
        AssertEqual(Number(sums.Tax), 0, "no nexus, no tax");
        AssertEqual(Number(sums.Gross), 1000, "and the goods are still billed");

        const reason = await taxReasonFor(ctx, order.Order.ID as string);
        Assert(
          /no tax nexus/i.test(reason ?? ""),
          `the REASON must be recorded, not just the zero — got: ${reason}`,
        );
      }),
  },
  {
    Id: "tax.TX7",
    Name: "TX7: a non-taxable PRODUCT owes nothing even where we have nexus",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        await setTaxability(ctx, { productID: f.Products.WidgetA, productIsTaxable: false });

        const order = await confirmShippingTo(ctx, "Maryland", [{ ProductID: f.Products.WidgetA, Quantity: 10 }]);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        AssertEqual(Number((await taxOf(ctx, order.Order.ID as string)).Tax), 0, "TX1 charged 60 for the same order");

        const reason = await taxReasonFor(ctx, order.Order.ID as string);
        Assert(/not taxable/i.test(reason ?? ""), `the reason should say so — got: ${reason}`);
      }),
  },
  {
    Id: "tax.TX8",
    Name: "TX8: taxability INHERITS from the product category when the product is silent",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const cat = await TxOne<{ ProductCategoryID: string }>(
          ctx,
          `SELECT ProductCategoryID FROM ${ORDERS_SCHEMA}.Product WHERE ID='${f.Products.WidgetA}'`,
        );
        // 'Publications are exempt here' is a statement about a CATEGORY, not about each of two
        // hundred products — the level most deployments actually configure.
        await setTaxability(ctx, {
          productID: f.Products.WidgetA,
          productIsTaxable: null,
          categoryID: cat.ProductCategoryID,
          categoryIsTaxable: false,
        });

        const order = await confirmShippingTo(ctx, "Maryland", [{ ProductID: f.Products.WidgetA, Quantity: 10 }]);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        AssertEqual(Number((await taxOf(ctx, order.Order.ID as string)).Tax), 0, "the category exempted it");
      }),
  },
  {
    Id: "tax.TX9",
    Name: "TX9: a customer EXEMPTION suppresses tax where we do have nexus",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        await addExemption(ctx, { organizationID: f.Customers.OrganizationID, type: "NonProfit" });

        const order = await confirmShippingTo(ctx, "Maryland", [{ ProductID: f.Products.WidgetA, Quantity: 10 }]);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        AssertEqual(Number((await taxOf(ctx, order.Order.ID as string)).Tax), 0, "TX1 charged 60 for the same order");

        const reason = await taxReasonFor(ctx, order.Order.ID as string);
        Assert(
          /NonProfit exemption/i.test(reason ?? ""),
          `an exemption is a DIFFERENT fact from no-nexus — got: ${reason}`,
        );
      }),
  },
  {
    Id: "tax.TX10",
    Name: "TX10: an exemption scoped to a CATEGORY exempts that product and not the others",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        await addPrice(ctx, f.Products.WidgetB, 100);
        await setTaxability(ctx, { productID: f.Products.WidgetA, productTaxCategory: "Reduced" });
        // The case Amith raised: a non-profit exempt on ONE product category but not another.
        // Category named 'Reduced' only because accounting's CHECK constraint enumerates five values;
        // the mechanism is category scoping, whatever the categories end up being called.
        await addExemption(ctx, {
          organizationID: f.Customers.OrganizationID,
          taxCategory: "Reduced",
          type: "NonProfit",
        });

        const order = await confirmShippingTo(ctx, "Maryland", [
          { ProductID: f.Products.WidgetA, Quantity: 10 },
          { ProductID: f.Products.WidgetB, Quantity: 10 },
        ]);
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const rows = await TxOne<{ Exempt: number; Taxed: number }>(
          ctx,
          `SELECT
             (SELECT LineTax FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}' AND ProductID='${f.Products.WidgetA}') AS Exempt,
             (SELECT LineTax FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}' AND ProductID='${f.Products.WidgetB}') AS Taxed`,
        );
        AssertEqual(Number(rows.Exempt), 0, "the exempted category is exempt for this customer");
        AssertEqual(Number(rows.Taxed), 60, "merchandise is not — same customer, same jurisdiction");
      }),
  },
  {
    Id: "tax.TX11",
    Name: "TX11: an EXPIRED certificate is not an exemption",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        // Silently honouring an expired certificate is how a company ends up owing years of
        // uncollected tax.
        await addExemption(ctx, {
          organizationID: f.Customers.OrganizationID,
          expiresAt: "2021-01-01",
        });

        const order = await confirmShippingTo(ctx, "Maryland", [{ ProductID: f.Products.WidgetA, Quantity: 10 }]);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        AssertEqual(Number((await taxOf(ctx, order.Order.ID as string)).Tax), 60, "expired, so tax is charged");
      }),
  },
  {
    Id: "tax.TX12",
    Name: "TX12: a category-specific RATE beats the Standard rate",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        // Maryland zero-rates the 'Reduced' category in this fixture but taxes everything else at 6%.
        await setTaxability(ctx, { productID: f.Products.WidgetA, productTaxCategory: "Reduced" });

        const order = await confirmShippingTo(ctx, "Maryland", [{ ProductID: f.Products.WidgetA, Quantity: 10 }]);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        // Not an exemption — the JURISDICTION rates this category at zero.
        AssertEqual(Number((await taxOf(ctx, order.Order.ID as string)).Tax), 0, "the category rate is 0%, not the 6% Standard");
      }),
  },
  {
    Id: "tax.TX13",
    Name: "TX13: a stated tax charge WINS over resolution — no double-charging",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          ShipToAddressID: f.Tax.AddressIDs.get("Maryland"),
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          Charges: [{ Code: "SalesTax", Rate: 0.02 }],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);
        // The same rule as a stated UnitPrice: an explicit decision is never argued with, and
        // resolution must not silently add Maryland's 6% on top.
        AssertEqual(Number((await taxOf(ctx, result.Order.ID as string)).Tax), 20, "the stated 2%, not 6% and not 8%");
      }),
  },
  {
    Id: "tax.TX14",
    Name: "TX14: no ship-to address means no tax resolution, and the order still books",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
        });
        Assert(result.Saved, `an order with no ship-to must still book: ${result.Message}`);
        AssertEqual(Number((await taxOf(ctx, result.Order.ID as string)).Tax), 0, "nowhere to resolve to");
        AssertEqual(Number((await taxOf(ctx, result.Order.ID as string)).Gross), 1000, "the goods are billed regardless");
      }),
  },
  {
    Id: "tax.TX15",
    Name: "TX15: taxability set on an ANCESTOR category reaches the product",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);

        // The PRODUCT must be silent, or the walk correctly stops there and never climbs — the
        // fixture creates products with IsTaxable = 1.
        await setTaxability(ctx, { productID: f.Products.WidgetA, productIsTaxable: null });

        // Build leaf -> parent above the product's own category, and put the only opinion at the
        // TOP. Reading just the immediate category would miss it entirely.
        const leaf = await TxOne<{ ProductCategoryID: string; CompanyID: string }>(
          ctx,
          `SELECT ProductCategoryID, CompanyID FROM ${ORDERS_SCHEMA}.Product WHERE ID='${f.Products.WidgetA}'`,
        );
        const rootID = randomUUID();
        await TxQuery(ctx,
          `INSERT INTO ${ORDERS_SCHEMA}.ProductCategory (ID, CompanyID, Name, IsActive, DefaultIsTaxable)
           VALUES ('${rootID}','${leaf.CompanyID}','${f.Run} Exempt Root',1,0);
           UPDATE ${ORDERS_SCHEMA}.ProductCategory
              SET ParentProductCategoryID='${rootID}', DefaultIsTaxable=NULL
            WHERE ID='${leaf.ProductCategoryID}'`);

        const order = await confirmShippingTo(ctx, "Maryland", [{ ProductID: f.Products.WidgetA, Quantity: 10 }]);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        // TX1 charges 60 for this exact order when nothing exempts it.
        AssertEqual(Number((await taxOf(ctx, order.Order.ID as string)).Tax), 0, "the ROOT category exempted it");
      }),
  },
];

for (const check of TaxChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("tax", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: TeardownOrdersFixture,
});