/**
 * promotions — offers, codes, stacking, allocation and authorized manual discounts (D70).
 *
 * WHERE THE MONEY LEAKS, and therefore what these are really for:
 *
 *   PR3/PR4 — the SAME two 10% promotions produce 19% sequentially and 20% additively. That is £10
 *   per £1,000 order, forever, decided by one company-level setting. Both are asserted against the
 *   ledger so the setting cannot quietly stop being honoured.
 *
 *   PR8 — an ORDER-level promotion must reach the lines. Tax and GL are per line, and on a
 *   multi-company order the allocation decides whose revenue is reduced. Left on the header it
 *   would leave both companies' books wrong while the order total still looked right — the same
 *   failure shape as the intercompany bug.
 *
 *   PR11/PR12 — a manual discount needs a SalesAuthority, and no authority means no discount:
 *   absence is not permission. Over the cap it ESCALATES rather than refusing, because a hard
 *   refusal is what pushes people to record the discount as something else.
 *
 *   PR14 — the discount reaches the JOURNAL ENTRY. A discount that changes the order total but not
 *   the ledger still BALANCES, so nothing downstream would ever report it.
 *
 * CONNECTS TO:
 *   CODE: PromotionBehavior · PromotionEngine · OrderEntityServer.applyPromotions
 *   DOC:  plans/pricing-charges-and-promotions.md §4
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

const q = (x: unknown) => (x == null ? "NULL" : typeof x === "string" ? `'${String(x).replace(/'/g, "''")}'` : String(x));

async function typeID(ctx: IntegrationCheckContext, code: string): Promise<string> {
  const row = await TxOne<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.PromotionType WHERE Code='${code}'`);
  Assert(row?.ID != null, `PromotionType '${code}' is missing — push the orders metadata`);
  return row.ID;
}

/** Create a promotion and a code for it. Returns both IDs plus the code string. */
async function addPromotion(
  ctx: IntegrationCheckContext,
  opts: {
    kind?: string;
    value: number;
    appliesAt?: "Line" | "Order" | "Either";
    stacks?: boolean;
    stackSequence?: number;
    maxRedemptions?: number | null;
    maxPerCustomer?: number | null;
    minOrder?: number | null;
    minQty?: number | null;
    qualifierKey?: string | null;
    status?: string;
    targetProductID?: string | null;
    targetCategoryID?: string | null;
    code?: string;
  },
): Promise<{ PromotionID: string; Code: string }> {
  const promotionID = randomUUID();
  const code = opts.code ?? `PR${randomUUID().slice(0, 6).toUpperCase()}`;
  const tid = await typeID(ctx, opts.kind ?? "PercentOff");

  await TxQuery(ctx,
    `INSERT INTO ${ORDERS_SCHEMA}.Promotion
       (ID, Code, Name, PromotionTypeID, Value, AppliesAt, AllowsStacking, StackSequence,
        MaxRedemptions, MaxRedemptionsPerCustomer, MinimumOrderAmount, MinimumQuantity,
        QualifierKey, Status)
     VALUES ('${promotionID}', '${code}', '${code} promotion', '${tid}', ${opts.value},
             ${q(opts.appliesAt ?? "Either")}, ${opts.stacks ? 1 : 0}, ${opts.stackSequence ?? 0},
             ${q(opts.maxRedemptions ?? null)}, ${q(opts.maxPerCustomer ?? null)},
             ${q(opts.minOrder ?? null)}, ${q(opts.minQty ?? null)},
             ${q(opts.qualifierKey ?? null)}, ${q(opts.status ?? "Active")});
     INSERT INTO ${ORDERS_SCHEMA}.PromotionCode (ID, PromotionID, Code, Status)
     VALUES ('${randomUUID()}', '${promotionID}', '${code}', 'Active')`);

  if (opts.targetProductID || opts.targetCategoryID) {
    await TxQuery(ctx,
      `INSERT INTO ${ORDERS_SCHEMA}.PromotionTarget (ID, PromotionID, ProductID, ProductCategoryID, IncludeDescendants)
       VALUES ('${randomUUID()}','${promotionID}', ${q(opts.targetProductID ?? null)}, ${q(opts.targetCategoryID ?? null)}, 1)`);
  }
  return { PromotionID: promotionID, Code: code };
}

async function addPrice(ctx: IntegrationCheckContext, productID: string, amount: number): Promise<void> {
  // Delegates to the shared builder so the price goes through `ProductPriceEntityServer` and its
  // ambiguity guard, rather than around it. Idempotent per product — see CreateProductPrice.
  await CreateProductPrice(ctx, productID, amount);
}

/** Set this company's stacking policy. */
async function setPolicy(
  ctx: IntegrationCheckContext,
  companyID: string,
  opts: { allowStacking?: boolean; mode?: "Sequential" | "Additive" },
): Promise<void> {
  await TxQuery(ctx,
    `DELETE FROM ${ORDERS_SCHEMA}.OrderCompanyPolicy WHERE ID='${companyID}';
     INSERT INTO ${ORDERS_SCHEMA}.OrderCompanyPolicy (ID, AllowPromotionStacking, StackingMode, RefuseUnpricedLines)
     VALUES ('${companyID}', ${opts.allowStacking ? 1 : 0}, '${opts.mode ?? "Sequential"}', 1)`);
}

/** Grant the current user a discount authority. */
async function grantAuthority(ctx: IntegrationCheckContext, maxPct: number): Promise<string> {
  const id = randomUUID();
  await TxQuery(ctx,
    `INSERT INTO ${ORDERS_SCHEMA}.SalesAuthority (ID, SalesRepUserID, MaxDiscountPct, IsActive)
     VALUES ('${id}', '${ctx.User.ID}', ${maxPct}, 1)`);
  return id;
}

/** Configure a DiscountLimit rule naming the role that may approve over-cap discounts. */
async function addDiscountLimitRule(ctx: IntegrationCheckContext, roleID: string | null): Promise<void> {
  await TxQuery(ctx,
    `INSERT INTO ${ORDERS_SCHEMA}.SalesRule (ID, Name, RuleType, Scope, ApprovalRequiredRoleID, IsActive)
     VALUES ('${randomUUID()}','Discount limit','DiscountLimit','Global', ${roleID ? `'${roleID}'` : "NULL"}, 1)`);
}

/** A role the current user does NOT hold. */
async function someRoleTheUserLacks(ctx: IntegrationCheckContext): Promise<string> {
  const row = await TxOne<{ ID: string }>(ctx,
    `SELECT TOP 1 r.ID FROM __mj.Role r
      WHERE NOT EXISTS (SELECT 1 FROM __mj.UserRole ur WHERE ur.RoleID = r.ID AND ur.UserID = '${ctx.User.ID}')`);
  Assert(row?.ID != null, 'no role exists that this user lacks');
  return row.ID;
}

/** A role the current user DOES hold. */
async function someRoleTheUserHolds(ctx: IntegrationCheckContext): Promise<string> {
  const row = await TxOne<{ RoleID: string }>(ctx,
    `SELECT TOP 1 RoleID FROM __mj.UserRole WHERE UserID = '${ctx.User.ID}'`);
  Assert(row?.RoleID != null, 'this user holds no roles');
  return row.RoleID;
}

/** Confirm an order carrying promotion codes and/or manual discounts. */
async function confirmWith(
  ctx: IntegrationCheckContext,
  opts: {
    lines: Array<{ ProductID: string; Quantity: number; UnitPrice?: number }>;
    codes?: string[];
    manual?: Array<{ OrderLineID?: string | null; Amount: number; Reason: string }>;
  },
): Promise<{ Saved: boolean; Message: string; Order: LooseEntity }> {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: opts.lines,
    PromotionCodes: opts.codes,
    ManualDiscounts: opts.manual,
  });
  return { Saved: result.Saved, Message: result.Message, Order: result.Order as LooseEntity };
}

const totals = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ TotalGross: number; Discount: number; Net: number }>(
    ctx,
    `SELECT o.TotalGross,
            (SELECT ISNULL(SUM(DiscountAmount),0) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID=o.ID) AS Discount,
            (SELECT ISNULL(SUM(LineTotalNet),0) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID=o.ID) AS Net
       FROM ${ORDERS_SCHEMA}.OrderHeader o WHERE o.ID='${orderID}'`,
  );

export const PromotionChecks: NamedCheck[] = [
  {
    Id: "promotions.PR1",
    Name: "PR1: a code takes its percentage off the line",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const { Code } = await addPromotion(ctx, { value: 0.1 });

        const order = await confirmWith(ctx, { lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }], codes: [Code] });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const t = await totals(ctx, order.Order.ID as string);
        AssertEqual(Number(t.Discount), 100, "10% of 1000");
        AssertEqual(Number(t.Net), 900, "the line net is discounted");
      }),
  },
  {
    Id: "promotions.PR2",
    Name: "PR2: an unknown code is reported, not silently ignored",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 50);
        const order = await confirmWith(ctx, {
          lines: [{ ProductID: f.Products.WidgetA, Quantity: 2 }],
          codes: ["NOPE-DOES-NOT-EXIST"],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        // A customer who typed a code needs to be told it did nothing, and why.
        const unusable = (order.Order as unknown as { UnusablePromotionCodes: Array<{ Code: string; Reason: string }> })
          .UnusablePromotionCodes;
        AssertEqual(unusable.length, 1, "the bad code is reported");
        Assert(/no such code/i.test(unusable[0].Reason), `expected a reason, got: ${unusable[0].Reason}`);
      }),
  },
  {
    Id: "promotions.PR3",
    Name: "PR3: SEQUENTIAL stacking compounds — two tens are nineteen",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await setPolicy(ctx, f.CoA.ID, { allowStacking: true, mode: "Sequential" });
        await addPrice(ctx, f.Products.WidgetA, 100);
        const a = await addPromotion(ctx, { value: 0.1, stacks: true, stackSequence: 1 });
        const b = await addPromotion(ctx, { value: 0.1, stacks: true, stackSequence: 2 });

        const order = await confirmWith(ctx, {
          lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          codes: [a.Code, b.Code],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        const t = await totals(ctx, order.Order.ID as string);
        AssertEqual(Number(t.Discount), 190, "1000 -> 900 -> 810");
        AssertEqual(Number(t.Net), 810, "the compounded net");
      }),
  },
  {
    Id: "promotions.PR4",
    Name: "PR4: ADDITIVE stacking sums — the same two tens are twenty",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await setPolicy(ctx, f.CoA.ID, { allowStacking: true, mode: "Additive" });
        await addPrice(ctx, f.Products.WidgetA, 100);
        const a = await addPromotion(ctx, { value: 0.1, stacks: true, stackSequence: 1 });
        const b = await addPromotion(ctx, { value: 0.1, stacks: true, stackSequence: 2 });

        const order = await confirmWith(ctx, {
          lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          codes: [a.Code, b.Code],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        const t = await totals(ctx, order.Order.ID as string);
        // Ten pounds more than PR3 on the same inputs — which is exactly why it is configurable.
        AssertEqual(Number(t.Discount), 200, "20% applied once");
        AssertEqual(Number(t.Net), 800, "the additive net");
      }),
  },
  {
    Id: "promotions.PR5",
    Name: "PR5: with stacking OFF, only the best offer applies",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await setPolicy(ctx, f.CoA.ID, { allowStacking: false });
        await addPrice(ctx, f.Products.WidgetA, 100);
        const small = await addPromotion(ctx, { value: 0.05, stacks: true });
        const big = await addPromotion(ctx, { value: 0.2, stacks: true });

        const order = await confirmWith(ctx, {
          lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          codes: [small.Code, big.Code],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        const t = await totals(ctx, order.Order.ID as string);
        AssertEqual(Number(t.Discount), 200, "only the 20% applied — the customer gets the better one");
      }),
  },
  {
    Id: "promotions.PR6",
    Name: "PR6: a promotion targeting one product leaves the others alone",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        await addPrice(ctx, f.Products.WidgetB, 100);
        const { Code } = await addPromotion(ctx, { value: 0.5, targetProductID: f.Products.WidgetA });

        const order = await confirmWith(ctx, {
          lines: [
            { ProductID: f.Products.WidgetA, Quantity: 1 },
            { ProductID: f.Products.WidgetB, Quantity: 1 },
          ],
          codes: [Code],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const rows = await TxOne<{ Discounted: number; Untouched: number }>(
          ctx,
          `SELECT
             (SELECT DiscountAmount FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}' AND ProductID='${f.Products.WidgetA}') AS Discounted,
             (SELECT DiscountAmount FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}' AND ProductID='${f.Products.WidgetB}') AS Untouched`,
        );
        AssertEqual(Number(rows.Discounted), 50, "the targeted product was discounted");
        AssertEqual(Number(rows.Untouched), 0, "the other product was not");
      }),
  },
  {
    Id: "promotions.PR7",
    Name: "PR7: a spent redemption limit blocks the promotion",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const { Code } = await addPromotion(ctx, { value: 0.1, maxRedemptions: 1 });

        const first = await confirmWith(ctx, { lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }], codes: [Code] });
        Assert(first.Saved, `first confirm failed: ${first.Message}`);
        AssertEqual(Number((await totals(ctx, first.Order.ID as string)).Discount), 10, "the first use applied");

        // Counted from what actually happened — there is no stored counter to drift.
        const second = await confirmWith(ctx, { lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }], codes: [Code] });
        Assert(second.Saved, `second confirm failed: ${second.Message}`);
        AssertEqual(Number((await totals(ctx, second.Order.ID as string)).Discount), 0, "the second use was refused");
      }),
  },
  {
    Id: "promotions.PR8",
    Name: "PR8: an ORDER-level promotion is allocated down to the lines",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 300);
        await addPrice(ctx, f.Products.WidgetB, 100);
        const { Code } = await addPromotion(ctx, { kind: "AmountOff", value: 100, appliesAt: "Order" });

        const order = await confirmWith(ctx, {
          lines: [
            { ProductID: f.Products.WidgetA, Quantity: 1 },
            { ProductID: f.Products.WidgetB, Quantity: 1 },
          ],
          codes: [Code],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        // MANDATORY: tax and GL are per line, so an order-level discount must reach them.
        const rows = await TxOne<{ A: number; B: number; Allocations: number }>(
          ctx,
          `SELECT
             (SELECT DiscountAmount FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}' AND ProductID='${f.Products.WidgetA}') AS A,
             (SELECT DiscountAmount FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${order.Order.ID}' AND ProductID='${f.Products.WidgetB}') AS B,
             (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderAdjustmentAllocation al
                JOIN ${ORDERS_SCHEMA}.OrderAdjustment a ON a.ID = al.OrderAdjustmentID
               WHERE a.OrderHeaderID='${order.Order.ID}') AS Allocations`,
        );
        AssertEqual(Number(rows.A), 75, "300/400 of the 100 discount");
        AssertEqual(Number(rows.B), 25, "100/400 of it");
        AssertEqual(Number(rows.A) + Number(rows.B), 100, "the allocation sums to the promotion exactly");
        AssertEqual(Number(rows.Allocations), 2, "one allocation row per line");
      }),
  },
  {
    Id: "promotions.PR9",
    Name: "PR9: a minimum order amount is enforced",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 50);
        const { Code } = await addPromotion(ctx, { value: 0.2, minOrder: 500, appliesAt: "Order" });

        const tooSmall = await confirmWith(ctx, { lines: [{ ProductID: f.Products.WidgetA, Quantity: 2 }], codes: [Code] });
        Assert(tooSmall.Saved, `confirm failed: ${tooSmall.Message}`);
        AssertEqual(Number((await totals(ctx, tooSmall.Order.ID as string)).Discount), 0, "100 does not reach the 500 minimum");

        const bigEnough = await confirmWith(ctx, { lines: [{ ProductID: f.Products.WidgetA, Quantity: 20 }], codes: [Code] });
        Assert(bigEnough.Saved, `confirm failed: ${bigEnough.Message}`);
        AssertEqual(Number((await totals(ctx, bigEnough.Order.ID as string)).Discount), 200, "1000 qualifies");
      }),
  },
  {
    Id: "promotions.PR10",
    Name: "PR10: a paused promotion does not apply, and says so",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const { Code } = await addPromotion(ctx, { value: 0.3, status: "Paused" });

        const order = await confirmWith(ctx, { lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }], codes: [Code] });
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        AssertEqual(Number((await totals(ctx, order.Order.ID as string)).Discount), 0, "a paused promotion takes nothing");

        const unusable = (order.Order as unknown as { UnusablePromotionCodes: Array<{ Code: string; Reason: string }> })
          .UnusablePromotionCodes;
        Assert(unusable.length === 1 && /not currently running/i.test(unusable[0].Reason),
          `expected 'not currently running', got: ${JSON.stringify(unusable)}`);
      }),
  },
  {
    Id: "promotions.PR11",
    Name: "PR11: a manual discount with no SalesAuthority is REFUSED — absence is not permission",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const order = await confirmWith(ctx, {
          lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
          manual: [{ Amount: 10, Reason: "goodwill" }],
        });
        Assert(!order.Saved, "a manual discount without authority must be refused");
        Assert(
          /SalesAuthority|not permission/i.test(order.Message),
          `the refusal should name the missing authority, got: ${order.Message}`,
        );
      }),
  },
  {
    Id: "promotions.PR12",
    Name: "PR12: a manual discount within the cap applies, and records who authorized it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const authorityID = await grantAuthority(ctx, 0.25);

        const order = await confirmWith(ctx, {
          lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          manual: [{ Amount: 100, Reason: "late delivery on the previous order" }],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const adj = await TxOne<{ Amount: number; Reason: string; AuthorizedBySalesAuthorityID: string | null; PromotionID: string | null }>(
          ctx,
          `SELECT TOP 1 Amount, Reason, AuthorizedBySalesAuthorityID, PromotionID
             FROM ${ORDERS_SCHEMA}.OrderAdjustment WHERE OrderHeaderID='${order.Order.ID}'`,
        );
        AssertEqual(Number(adj.Amount), 100, "the manual discount applied");
        Assert(adj.PromotionID == null, "a manual discount traces to no promotion");
        Assert(/late delivery/.test(adj.Reason), "the stated reason is recorded");
        AssertEqual(
          String(adj.AuthorizedBySalesAuthorityID).toLowerCase(),
          authorityID.toLowerCase(),
          "the authority that permitted it is stamped, so lowering the cap later cannot rewrite history",
        );
      }),
  },
  {
    Id: "promotions.PR13",
    Name: "PR13: a manual discount without a reason is refused",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        await grantAuthority(ctx, 0.5);
        const order = await confirmWith(ctx, {
          lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
          manual: [{ Amount: 10, Reason: "   " }],
        });
        Assert(!order.Saved, "an unexplained manual discount must be refused");
        Assert(/reason/i.test(order.Message), `the refusal should mention the reason, got: ${order.Message}`);
      }),
  },
  {
    Id: "promotions.PR14",
    Name: "PR14: the discount reaches the JOURNAL ENTRY, not just the order total",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        const { Code } = await addPromotion(ctx, { value: 0.2 });

        const order = await confirmWith(ctx, { lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }], codes: [Code] });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        // A discount that moves the order total but not the ledger still BALANCES, so nothing
        // downstream would report it. This is the check that would catch that.
        const ar = await TxOne<{ Debit: number }>(
          ctx,
          `SELECT SUM(jel.DebitAmount) AS Debit
             FROM ${ORDERS_SCHEMA}.OrderLine ol
             JOIN __mj_BizAppsAccounting.JournalEntryLine jel ON jel.JournalEntryID = ol.JournalEntryID
             JOIN __mj_BizAppsAccounting.GLAccount gl ON gl.ID = jel.GLAccountID
            WHERE ol.OrderHeaderID='${order.Order.ID}' AND gl.Code = '11201'`,
        );
        AssertEqual(Number(ar.Debit), 800, "AR was debited for the DISCOUNTED amount, not the gross");
      }),
  },
  {
    Id: "promotions.PR15",
    Name: "PR15: a promotion cannot discount a line below zero",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 30);
        // A 50 coupon on a 30 line takes 30 — it does not become 20 of change, and a negative line
        // would flip sign in the journal entry and read as revenue.
        const { Code } = await addPromotion(ctx, { kind: "AmountOff", value: 50 });

        const order = await confirmWith(ctx, { lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }], codes: [Code] });
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        const t = await totals(ctx, order.Order.ID as string);
        AssertEqual(Number(t.Discount), 30, "the discount is capped at the line value");
        AssertEqual(Number(t.Net), 0, "the line floors at zero, never negative");
      }),
  },
  {
    Id: "promotions.PR16",
    Name: "PR16: an OVER-CAP manual discount is refused when no approving role is configured",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        await grantAuthority(ctx, 0.1); // 10% cap

        // This used to APPLY SILENTLY: the code returned NeedsApproval and nothing read it, so the
        // cap was decorative. 30% against a 10% cap must not simply go through.
        const order = await confirmWith(ctx, {
          lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          manual: [{ Amount: 300, Reason: "big customer" }],
        });
        Assert(!order.Saved, "an over-cap discount with no approver must be refused");
        Assert(
          /above the 10\.0% cap/i.test(order.Message),
          `the refusal should name the cap, got: ${order.Message}`,
        );
      }),
  },
  {
    Id: "promotions.PR17",
    Name: "PR17: over-cap is refused when the user lacks the approving role",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        await grantAuthority(ctx, 0.1);
        await addDiscountLimitRule(ctx, await someRoleTheUserLacks(ctx));

        const order = await confirmWith(ctx, {
          lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          manual: [{ Amount: 300, Reason: "big customer" }],
        });
        Assert(!order.Saved, "an over-cap discount must be refused without the approving role");
        Assert(
          /needs approval/i.test(order.Message),
          `the refusal should say approval is needed, got: ${order.Message}`,
        );
      }),
  },
  {
    Id: "promotions.PR18",
    Name: "PR18: over-cap SUCCEEDS for an approver, and records the approval",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        await grantAuthority(ctx, 0.1);
        await addDiscountLimitRule(ctx, await someRoleTheUserHolds(ctx));

        const order = await confirmWith(ctx, {
          lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          manual: [{ Amount: 300, Reason: "renewal concession, approved" }],
        });
        Assert(order.Saved, `an approver's over-cap discount should apply: ${order.Message}`);

        const adj = await TxOne<{ Amount: number; ApprovedByUserID: string | null; ApprovedAt: Date | null }>(
          ctx,
          `SELECT TOP 1 Amount, ApprovedByUserID, ApprovedAt
             FROM ${ORDERS_SCHEMA}.OrderAdjustment WHERE OrderHeaderID='${order.Order.ID}'`,
        );
        AssertEqual(Number(adj.Amount), 300, "the discount applied");
        // The exception must be VISIBLE — otherwise an over-cap discount is indistinguishable from
        // an ordinary one and nobody can review discretion.
        AssertEqual(
          String(adj.ApprovedByUserID).toLowerCase(),
          String(ctx.User.ID).toLowerCase(),
          "the approver is recorded",
        );
        Assert(adj.ApprovedAt != null, "and when they approved it");
      }),
  },
  {
    Id: "promotions.PR19",
    Name: "PR19: a WITHIN-cap discount records no approval — the exception stays distinguishable",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 100);
        await grantAuthority(ctx, 0.5);
        await addDiscountLimitRule(ctx, await someRoleTheUserHolds(ctx));

        const order = await confirmWith(ctx, {
          lines: [{ ProductID: f.Products.WidgetA, Quantity: 10 }],
          manual: [{ Amount: 100, Reason: "ordinary concession" }],
        });
        Assert(order.Saved, `confirm failed: ${order.Message}`);

        const adj = await TxOne<{ ApprovedByUserID: string | null }>(
          ctx,
          `SELECT TOP 1 ApprovedByUserID FROM ${ORDERS_SCHEMA}.OrderAdjustment WHERE OrderHeaderID='${order.Order.ID}'`,
        );
        Assert(
          adj.ApprovedByUserID == null,
          "a discount inside the cap needed no approval, so none should be recorded",
        );
      }),
  },
];

for (const check of PromotionChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("promotions", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: TeardownOrdersFixture,
});
