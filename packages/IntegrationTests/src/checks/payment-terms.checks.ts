/**
 * payment-terms — when an order is due, resolved at confirm and STORED (D83).
 *
 * WHY IT EXISTS
 * Nothing derived a due date. `OrderHeader.DueDate` was only ever what a caller passed,
 * `PaymentTermsType` had no rows, and the schema comment promising that `NetDays` derives the due
 * date was aspirational. That did not look like a missing feature — it looked like a quiet afternoon:
 *
 *     Orders.GetOverdueWorklist, as of 2026-12-31 → 0 rows, 0 overdue, every aging bucket zero
 *
 * against 67 orders carrying an unpaid balance. Aging, the collections worklist and the invoice's due
 * date all read that one column, and it was null on every row.
 *
 * `PaymentTermsBehavior` owns the walk and its unit tests cover the rungs in isolation. This bundle
 * proves the walk is WIRED into the confirm path, that the answer is PERSISTED rather than derived
 * per reader, and — the one that matters most — that the collections worklist now returns the orders
 * it was always supposed to.
 *
 * THE CHECKS THAT EARN THEIR KEEP
 *   · PT6 — the overdue worklist actually finds an overdue order. This is the assertion whose
 *     absence let the feature ship dead: everything else can pass while the screen stays empty.
 *   · PT1 — a STATED due date is never recomputed. That is the seam a contracts app supplies terms
 *     through, and a save that silently moves a negotiated date is unrecoverable by the customer.
 *   · PT5 — an order with no terms configured anywhere still gets a real date, not a null. A null is
 *     what made every order invisible to aging in the first place.
 *
 * WHAT IT PROVES
 *   PT1   a stated DueDate survives confirm untouched
 *   PT2   stated terms derive the date from NetDays
 *   PT3   the buyer's CustomerPaymentTerms beat the company default
 *   PT4   the selling company's OrderCompanyPolicy default is used when nothing else applies
 *   PT5   an order with nothing configured is due on receipt, with a real date
 *   PT6   a confirmed order past its due date reaches Orders.GetOverdueWorklist
 *   PT7   customer terms are effective on the ORDER date, not on today
 *   PT8   company-scoped customer terms beat unscoped ones
 *   PT9   terms keyed to a PERSON are found — a different SQL branch from the organization one
 *   PT10  expired terms stop applying and the walk falls through to the next rung
 *   PT11  inactive terms are ignored
 *   PT12  the most recently started terms win among equally specific ones
 *   PT13  a confirmed order's DueDate is corrected without approval, and every correction is recorded
 *   PT14  a change to a confirmed order's PaymentTermsTypeID, made by approving a Terms concession, is recorded
 *
 * PT13 and PT14 rely on MJ's own change tracking: `Order Headers` has `TrackRecordChanges` on, so
 * every header save writes a `MJ: Record Changes` row carrying the old and new value of each changed
 * column, who saved it and when. There is no Orders-owned change table. What these checks guard is
 * that the header-only save a booked order takes (`OrderEntityServer.Save`'s ordinary path) still
 * reaches that write — and that the flag stays on (#267, #309).
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: PaymentTermsBehavior · OrderEntityServer.resolveDueDate · GetOverdueWorklistOperation
 *   DATA: metadata/payment-terms-types/.payment-terms-types.json
 */
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
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  SameID,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { OrderHeaderEntity, type mjBizAppsOrdersOrderConcessionEntity } from "@mj-biz-apps/orders-entities";
import {
  CUSTOMER_PAYMENT_TERMS_ENTITY,
  ORDER_CONCESSION_ENTITY,
  ORDER_HEADER_ENTITY,
  SALES_RULE_ENTITY,
} from "../entity-names.js";
import { ConfirmOrder, type OrderSpec } from "../order-builder.js";

/** A seeded terms row by code — these come from metadata, so they are committed and stable. */
async function termsID(ctx: IntegrationCheckContext, code: string): Promise<string> {
  const row = await TxOne<{ ID: string; NetDays: number }>(
    ctx,
    `SELECT ID, NetDays FROM ${ORDERS_SCHEMA}.PaymentTermsType WHERE Code='${code}'`,
  );
  return row.ID;
}

/** Confirm an order, optionally stating terms or a date. */
async function sell(ctx: IntegrationCheckContext, over: Partial<OrderSpec> = {}) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    OrderDate: new Date("2026-07-01T00:00:00Z"),
    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 300 }],
    ...over,
  });
  Assert(result.Saved, `confirm failed: ${result.Message}`);
  return result;
}

/** What was actually stored on the header. */
const headerTerms = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ DueDate: string | null; PaymentTermsTypeID: string | null; OrderDate: string }>(
    ctx,
    `SELECT CONVERT(varchar(10), DueDate, 23) AS DueDate, PaymentTermsTypeID,
            CONVERT(varchar(10), OrderDate, 23) AS OrderDate
       FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${orderID}'`,
  );

/**
 * Give the selling company a default.
 *
 * On `OrderCompanyPolicy`, not accounting's `AccountingCompanyProfile` — accounting removed that
 * column (their issue #22) because deciding when an order is DUE is a selling decision, not an
 * accounting one. UPSERT rather than UPDATE: a company with no policy row is the normal case (the
 * table exists so a company can OVERRIDE the defaults), so an UPDATE would silently affect zero
 * rows and the check would pass for the wrong reason — the walk would fall through to due-on-receipt
 * and happen to produce the expected date for a Net0 term.
 */
async function setCompanyDefault(ctx: IntegrationCheckContext, companyID: string, paymentTermsTypeID: string) {
  await TxQuery(
    ctx,
    `IF EXISTS (SELECT 1 FROM ${ORDERS_SCHEMA}.OrderCompanyPolicy WHERE ID='${companyID}')
       UPDATE ${ORDERS_SCHEMA}.OrderCompanyPolicy SET DefaultPaymentTermsTypeID='${paymentTermsTypeID}' WHERE ID='${companyID}';
     ELSE
       INSERT INTO ${ORDERS_SCHEMA}.OrderCompanyPolicy (ID, DefaultPaymentTermsTypeID) VALUES ('${companyID}', '${paymentTermsTypeID}');`,
  );
}

/** One field's entry in a Record Change's `ChangesJSON`. */
type FieldChange = { field: string; oldValue: unknown; newValue: unknown };

/** The `MJ: Record Changes` rows written for one order header, oldest first. */
async function headerChanges(ctx: IntegrationCheckContext, orderID: string) {
  const rows = await TxQuery<{ UserID: string; Type: string; ChangesJSON: string | null }>(
    ctx,
    `SELECT rc.UserID, rc.Type, rc.ChangesJSON
       FROM __mj.RecordChange rc
       JOIN __mj.Entity e ON e.ID = rc.EntityID
      WHERE e.Name = '${ORDER_HEADER_ENTITY}'
        AND rc.RecordID = CONCAT('ID|', UPPER('${orderID}'))
      ORDER BY rc.ChangedAt`,
  );
  return rows.map((r) => ({
    UserID: r.UserID,
    Type: r.Type,
    Changes: (r.ChangesJSON ? JSON.parse(r.ChangesJSON) : {}) as Record<string, FieldChange | undefined>,
  }));
}

/** A diffed date value as a calendar day, whichever form the diff serialized it in. */
const asDay = (v: unknown) => (v == null ? null : new Date(v as string).toISOString().slice(0, 10));

/** Reload a confirmed order as a fresh entity object — the object a form save rebuilds. */
async function reloadHeader(ctx: IntegrationCheckContext, orderID: string): Promise<OrderHeaderEntity> {
  const header = await new Metadata().GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, ctx.User);
  Assert(await header.Load(orderID), "the confirmed order reloads");
  return header;
}

export const PaymentTermsChecks: NamedCheck[] = [
  {
    Id: "payment-terms.PT1",
    Name: "PT1: a stated DueDate survives confirm untouched",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // The seam a contracts app supplies terms through: it states the answer Orders cannot derive.
        // A save that silently recomputes a negotiated date is unrecoverable by the customer.
        await setCompanyDefault(ctx, Fx().CoA.ID, await termsID(ctx, "Net30"));
        const order = await sell(ctx, { DueDate: "2026-12-25" } as Partial<OrderSpec>);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-12-25", "the stated date is what was stored");
      }),
  },
  {
    Id: "payment-terms.PT2",
    Name: "PT2: stated terms derive the date from NetDays",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const net30 = await termsID(ctx, "Net30");
        const order = await sell(ctx, { PaymentTermsTypeID: net30 } as Partial<OrderSpec>);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-07-31", "order date plus thirty days");
        AssertEqual(String(stored.PaymentTermsTypeID).toLowerCase(), net30.toLowerCase(), "and the terms stay named");
      }),
  },
  {
    Id: "payment-terms.PT3",
    Name: "PT3: the buyer's negotiated terms beat the company default",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await setCompanyDefault(ctx, f.CoA.ID, await termsID(ctx, "Net30"));
        const net60 = await termsID(ctx, "Net60");
        await createViaEntity(ctx, CUSTOMER_PAYMENT_TERMS_ENTITY, {
          OrganizationID: f.Customers.OrganizationID,
          PaymentTermsTypeID: net60,
          Status: "Active",
        });

        const order = await sell(ctx);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-08-30", "sixty days, not the company's thirty");
        AssertEqual(String(stored.PaymentTermsTypeID).toLowerCase(), net60.toLowerCase(), "under the buyer's terms");
      }),
  },
  {
    Id: "payment-terms.PT4",
    Name: "PT4: the selling company's default is used when nothing else applies",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // `OrderCompanyPolicy.DefaultPaymentTermsTypeID` is the company-level fallback
        // was written and nothing read it until now.
        const net45 = await termsID(ctx, "Net45");
        await setCompanyDefault(ctx, Fx().CoA.ID, net45);
        const order = await sell(ctx);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-08-15", "order date plus forty-five days");
      }),
  },
  {
    Id: "payment-terms.PT5",
    Name: "PT5: an order with nothing configured is due on receipt, with a REAL date",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // A null is what made every order invisible to aging. The terminal rung has to produce a date.
        const order = await sell(ctx);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        Assert(stored.DueDate != null, "a due date exists even with no terms anywhere");
        AssertEqual(stored.DueDate, stored.OrderDate, "and it is the order date — due on receipt");
      }),
  },
  {
    Id: "payment-terms.PT6",
    Name: "PT6: a confirmed order past its due date reaches the overdue worklist",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // THE ASSERTION WHOSE ABSENCE LET THE FEATURE SHIP DEAD. Everything else can pass while the
        // collections screen stays empty, because an empty worklist reads as "nothing overdue".
        const net30 = await termsID(ctx, "Net30");
        const order = await sell(ctx, { PaymentTermsTypeID: net30 } as Partial<OrderSpec>);
        const orderID = order.Order.ID as string;

        const op = MJGlobal.Instance.ClassFactory.CreateInstance<
          BaseRemotableOperation<Record<string, unknown>, { Rows: Array<{ OrderHeaderID: string; DaysOverdue: number }>; RowCount: number; TotalOverdue: number }>
        >(BaseRemotableOperation, "Orders.GetOverdueWorklist");
        Assert(op != null, "'Orders.GetOverdueWorklist' is not registered");

        // As of well after the due date, with the balance still outstanding. `Execute` is the same
        // entry point every other check uses, and it wraps the payload in `Output`.
        const result = await op!.Execute({ AsOfDate: "2026-09-01" }, { provider: ctx.Provider, user: ctx.User });
        Assert(result.Success, `the worklist did not execute: ${result.ErrorMessage ?? "unknown"}`);
        const rows = result.Output?.Rows ?? [];
        const mine = rows.find((r) => String(r.OrderHeaderID).toLowerCase() === orderID.toLowerCase());
        Assert(mine != null, `the order appears on the worklist (${rows.length} rows returned)`);
        AssertEqual(mine!.DaysOverdue, 32, "aged from its stored due date, not from the order date");
      }),
  },
  {
    Id: "payment-terms.PT7",
    Name: "PT7: customer terms are effective on the ORDER date, not on today",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Renegotiating must not restate what an old order was due on.
        const f = Fx();
        await createViaEntity(ctx, CUSTOMER_PAYMENT_TERMS_ENTITY, {
          OrganizationID: f.Customers.OrganizationID,
          PaymentTermsTypeID: await termsID(ctx, "Net90"),
          StartedAt: new Date("2026-08-01T00:00:00Z"),
          Status: "Active",
        });

        // The order predates those terms, so they must not apply.
        const order = await sell(ctx);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, stored.OrderDate, "terms that had not started yet do not apply");
      }),
  },
  {
    Id: "payment-terms.PT8",
    Name: "PT8: company-scoped customer terms beat unscoped ones",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // A subsidiary that negotiated its own terms meant to override the group's.
        const f = Fx();
        const net90 = await termsID(ctx, "Net90");
        const net15 = await termsID(ctx, "Net15");
        await createViaEntity(ctx, CUSTOMER_PAYMENT_TERMS_ENTITY, {
          OrganizationID: f.Customers.OrganizationID,
          PaymentTermsTypeID: net90,
          Status: "Active",
        });
        await createViaEntity(ctx, CUSTOMER_PAYMENT_TERMS_ENTITY, {
          OrganizationID: f.Customers.OrganizationID,
          PaymentTermsTypeID: net15,
          CompanyID: f.CoA.ID,
          Status: "Active",
        });

        const order = await sell(ctx);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-07-16", "the company-scoped fifteen days won");
      }),
  },
  {
    Id: "payment-terms.PT9",
    Name: "PT9: terms keyed to a PERSON are found, not just to an organization",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // A DIFFERENT SQL BRANCH. `customerPaymentTerms` filters on `OrganizationID` or on `PersonID`
        // depending on who the order bills, and every other check here bills an organization — so the
        // person branch had no coverage at all. An individual buyer's negotiated terms silently not
        // applying is exactly the shape that ships: the order still gets a date, just the wrong one.
        const f = Fx();
        await setCompanyDefault(ctx, f.CoA.ID, await termsID(ctx, "Net30"));
        const net90 = await termsID(ctx, "Net90");
        await createViaEntity(ctx, CUSTOMER_PAYMENT_TERMS_ENTITY, {
          PersonID: f.Customers.PersonID,
          PaymentTermsTypeID: net90,
          Status: "Active",
        });

        const order = await sell(ctx, {
          BillToOrganizationID: undefined,
          BillToPersonID: f.Customers.PersonID,
        } as Partial<OrderSpec>);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-09-29", "ninety days from the person's own terms");
        AssertEqual(
          String(stored.PaymentTermsTypeID).toLowerCase(),
          net90.toLowerCase(),
          "and not the company default of thirty",
        );
      }),
  },
  {
    Id: "payment-terms.PT10",
    Name: "PT10: EXPIRED customer terms do not apply, and the walk falls through",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // PT7 covers terms that have not STARTED. This is the other end: terms that have ended must
        // stop applying, and the order must land on the next rung rather than on nothing.
        const f = Fx();
        await setCompanyDefault(ctx, f.CoA.ID, await termsID(ctx, "Net15"));
        await createViaEntity(ctx, CUSTOMER_PAYMENT_TERMS_ENTITY, {
          OrganizationID: f.Customers.OrganizationID,
          PaymentTermsTypeID: await termsID(ctx, "Net90"),
          StartedAt: new Date("2025-01-01T00:00:00Z"),
          EndedAt: new Date("2026-06-01T00:00:00Z"),
          Status: "Active",
        });

        const order = await sell(ctx);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-07-16", "the company's fifteen days, not the expired ninety");
      }),
  },
  {
    Id: "payment-terms.PT11",
    Name: "PT11: INACTIVE customer terms are ignored",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Deactivating is how somebody withdraws terms without deleting the record. If the walk read
        // it anyway, the withdrawal would be silent and the customer would keep the old terms.
        //
        // NOTE ON WHERE THIS BITES. `Status` is filtered in the SQL as well as in
        // `CustomerTermsApply`, so this check guards the QUERY — breaking the behaviour predicate
        // alone leaves it green, and breaking the filter alone fails it. That is deliberate
        // defence in depth; the unit tests cover the predicate on its own.
        const f = Fx();
        await setCompanyDefault(ctx, f.CoA.ID, await termsID(ctx, "Net15"));
        await createViaEntity(ctx, CUSTOMER_PAYMENT_TERMS_ENTITY, {
          OrganizationID: f.Customers.OrganizationID,
          PaymentTermsTypeID: await termsID(ctx, "Net90"),
          Status: "Inactive",
        });

        const order = await sell(ctx);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-07-16", "the inactive ninety-day terms were not used");
      }),
  },
  {
    Id: "payment-terms.PT12",
    Name: "PT12: the most recently started terms win among equally specific ones",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Terms get renegotiated, and the old row is often left in place rather than deleted. The
        // later negotiation has to supersede the earlier one, or a customer keeps terms they moved off.
        //
        // The OLDER row is created first and the query reads `ORDER BY StartedAt`, so the superseded
        // terms arrive first. Without that ordering this check passed against a "keep the first row"
        // bug purely because the engine happened to return the newer one first — it asserted nothing
        // and would have flipped on a different query plan.
        const f = Fx();
        const net90 = await termsID(ctx, "Net90");
        const net45 = await termsID(ctx, "Net45");
        await createViaEntity(ctx, CUSTOMER_PAYMENT_TERMS_ENTITY, {
          OrganizationID: f.Customers.OrganizationID,
          PaymentTermsTypeID: net90,
          StartedAt: new Date("2025-01-01T00:00:00Z"),
          Status: "Active",
        });
        await createViaEntity(ctx, CUSTOMER_PAYMENT_TERMS_ENTITY, {
          OrganizationID: f.Customers.OrganizationID,
          PaymentTermsTypeID: net45,
          StartedAt: new Date("2026-06-01T00:00:00Z"),
          Status: "Active",
        });

        const order = await sell(ctx);
        const stored = await headerTerms(ctx, order.Order.ID as string);
        AssertEqual(stored.DueDate, "2026-08-15", "forty-five days from the later negotiation");
        AssertEqual(String(stored.PaymentTermsTypeID).toLowerCase(), net45.toLowerCase(), "the newer terms");
      }),
  },
  {
    Id: "payment-terms.PT13",
    Name: "PT13: a confirmed order's DueDate is corrected without approval, and each correction is recorded",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // A due-date correction is not a commercial concession: it needs a record, not an approval
        // (#309). The date is what aging and the collections worklist read, so a change nobody can
        // trace is a receivable whose age moved for no stated reason.
        const order = await sell(ctx, { PaymentTermsTypeID: await termsID(ctx, "Net30") } as Partial<OrderSpec>);
        const orderID = order.Order.ID as string;
        AssertEqual((await headerTerms(ctx, orderID)).DueDate, "2026-07-31", "confirmed with Net30");
        const before = (await headerChanges(ctx, orderID)).length;

        // Two corrections, each through a fresh load and a header-only save, which is the path a
        // form takes. Both must land, and both must be on record — "every change", not the latest.
        const first = await reloadHeader(ctx, orderID);
        AssertEqual(first.Status, "Confirmed", "the order is booked");
        first.DueDate = new Date("2026-08-14T00:00:00Z");
        Assert(await first.Save(), `the first correction saves: ${first.LatestResult?.CompleteMessage ?? ""}`);

        const second = await reloadHeader(ctx, orderID);
        second.DueDate = new Date("2026-08-21T00:00:00Z");
        Assert(await second.Save(), `the second correction saves: ${second.LatestResult?.CompleteMessage ?? ""}`);

        AssertEqual((await headerTerms(ctx, orderID)).DueDate, "2026-08-21", "the latest correction is stored");

        const dueDateChanges = (await headerChanges(ctx, orderID))
          .slice(before)
          .filter((c) => c.Type === "Update" && c.Changes.DueDate);
        AssertEqual(dueDateChanges.length, 2, "one change record per correction");

        const [a, b] = dueDateChanges;
        AssertEqual(asDay(a.Changes.DueDate!.oldValue), "2026-07-31", "the first record holds the confirmed date");
        AssertEqual(asDay(a.Changes.DueDate!.newValue), "2026-08-14", "and the first correction");
        AssertEqual(asDay(b.Changes.DueDate!.oldValue), "2026-08-14", "the second record starts where the first ended");
        AssertEqual(asDay(b.Changes.DueDate!.newValue), "2026-08-21", "and holds the second correction");
        for (const c of dueDateChanges) {
          Assert(SameID(c.UserID, ctx.User.ID), `each record names who made the change (got ${c.UserID})`);
        }
      }),
  },
  {
    Id: "payment-terms.PT14",
    Name: "PT14: a change to a confirmed order's payment terms is recorded",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Asserts the RECORD. A booked order's terms change only by approving a Terms concession
        // (#309), which applies the change to the header in the approval's own transaction; that
        // save has to be on record like any other. The concession is recorded by another user, since
        // its requester cannot decide it, and this user approves it as a holder of the rule's role.
        const net30 = await termsID(ctx, "Net30");
        const net60 = await termsID(ctx, "Net60");
        const order = await sell(ctx, { PaymentTermsTypeID: net30 } as Partial<OrderSpec>);
        const orderID = order.Order.ID as string;
        const before = (await headerChanges(ctx, orderID)).length;

        const role = await TxOne<{ RoleID: string }>(ctx,
          `SELECT TOP 1 RoleID FROM __mj.UserRole WHERE UserID = '${ctx.User.ID}'`);
        Assert(role?.RoleID != null, "this user holds no roles");
        const ruleID = await createViaEntity(ctx, SALES_RULE_ENTITY, {
          Name: "ConcessionLimit approval",
          RuleType: "ConcessionLimit",
          Scope: "Global",
          ApprovalRequiredRoleID: role.RoleID,
          IsActive: 1,
        });
        const requester = await TxOne<{ ID: string }>(ctx,
          `SELECT TOP 1 ID FROM __mj.[User] WHERE IsActive = 1 AND ID <> '${ctx.User.ID}'`);
        const recorded = await TxOne<{ ID: string }>(ctx,
          `DECLARE @id TABLE (ID UNIQUEIDENTIFIER);
           INSERT INTO ${ORDERS_SCHEMA}.OrderConcession
             (OrderHeaderID, DeliveryForm, ReasonCategory, Reason, AddedDays, ComputedValue, Status,
              RequestedByUserID, SalesRuleID, PriorPaymentTermsTypeID, NewPaymentTermsTypeID)
           OUTPUT inserted.ID INTO @id
           VALUES ('${orderID}', 'Terms', 'Other', 'customer request', 30, 0, 'Pending',
                   '${requester.ID}', '${ruleID}', '${net30}', '${net60}');
           SELECT ID FROM @id;`);

        const concession = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderConcessionEntity>(ORDER_CONCESSION_ENTITY, ctx.User);
        Assert(await concession.Load(recorded.ID), "the Terms concession did not load");
        concession.Status = "Approved";
        Assert(await concession.Save(), `approving the terms change saves: ${concession.LatestResult?.CompleteMessage ?? ""}`);

        const termsChanges = (await headerChanges(ctx, orderID))
          .slice(before)
          .filter((c) => c.Type === "Update" && c.Changes.PaymentTermsTypeID);
        AssertEqual(termsChanges.length, 1, "the change is recorded once");
        const change = termsChanges[0].Changes.PaymentTermsTypeID!;
        Assert(SameID(String(change.oldValue), net30), `the record holds the old terms (got ${change.oldValue})`);
        Assert(SameID(String(change.newValue), net60), `and the new terms (got ${change.newValue})`);
        Assert(SameID(termsChanges[0].UserID, ctx.User.ID), "and who changed them");
      }),
  },
];

for (const check of PaymentTermsChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("payment-terms", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: TeardownOrdersFixture,
});
