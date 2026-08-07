/**
 * volume — does it still hold at the eightieth order?
 *
 * WHY THIS BUNDLE EXISTS. Every other bundle confirms one or two orders and asserts the result in
 * detail. That is the right shape for proving a rule, and it is blind to a whole class of defect
 * that only appears with repetition and with a shared counter under pressure:
 *
 *   · a numbering scheme that is contiguous for two orders and skips at the eightieth
 *   · an engine that caches something per PROCESS which should have been per ORDER — the second
 *     order inherits the first order's tax jurisdictions, promotion state or resolved price
 *   · a rollup that is right for one payment and drifts when thirty orders each take two
 *   · a failure that is contained when it is the only order and takes its neighbours with it when
 *     it is the twentieth of forty
 *   · repeated purchase of the same subscription: term 2 is proven in `subscriptions`, term 12
 *     is not, and "term N starts the day after term N−1 ends" is a recurrence, not a single fact
 *
 * So these checks build POPULATIONS. Deliberately varied populations — a hundred copies of one
 * order exercises one path a hundred times and proves very little, so the shape rotates across
 * products, quantities, companies, ship-to addresses, promotions, charges and subscriptions, and
 * VL1 asserts that the variation actually happened rather than trusting the generator.
 *
 * VOLUME DOES NOT REQUIRE COMMITTING. Every check here runs inside `InRolledBackTransaction`, so
 * eighty confirmed orders, their journal entries, payments and subscription terms all disappear at
 * the end. That is what makes "80 orders alive at once" observable at all: numbers taken inside the
 * caller's transaction are only distinct from one another while that transaction is open.
 *
 * ── WHAT CONCURRENCY CAN AND CANNOT BE PROVEN HERE (read this before adding a check) ────────────
 *
 * `concurrency.checks.ts` documents the raw-SQL half of this. The other half is new and it is worth
 * stating precisely, because the obvious thing to want is impossible for a good reason.
 *
 * A SECOND `SQLServerDataProvider` CAN coexist with the one `setupSQLServerClient` installed. This
 * was established by probe rather than assumed, and the measurements are worth recording because the
 * expected answer was no:
 *
 *   · Two extra providers, each `new (ctx.Provider.constructor)()` configured with the running
 *     provider's own `ConfigData`, both complete `Config()` and both load the full metadata.
 *   · `Metadata.Provider` still points at the ORIGINAL afterwards. `setupSQLServerClient` is what
 *     calls `SetProvider`; constructing a provider directly does not, so no global is disturbed and
 *     no other bundle's behaviour changes.
 *   · With all three transactions open at once the sessions report three different `@@SPID`s. With
 *     NO transaction open they reported the same one three times — see {@link distinctSessionCount},
 *     which is why the independence assertion is written the way it is.
 *   · An entity built through the second provider comes back as `OrderEntityServer` with
 *     `ProviderToUse === ` that provider. Since `OrderEntityServer` routes everything through
 *     `ProviderToUse` (its own header explains why), the confirm runs on the second session.
 *
 * {@link session} is that mechanism. The one link the probe could not reach is whether accounting's
 * `Accounting.CreateJournalEntries` honours the provider it is handed in its execution context — it
 * is passed one, and VL10 asserts the second session's journal entry exists and balances, which is
 * what would catch it if it did not.
 *
 * What that still cannot produce is N simultaneous SUCCESSFUL confirms with N distinct numbers. The
 * number is taken by `UPDATE OrderSequence … OUTPUT` inside the caller's transaction — that is the
 * property CN3 exists to protect, because it is what stops a failed confirm burning an A/R document
 * number. The consequence is that the counter row stays exclusively locked from the moment a confirm
 * takes its number until that confirm's transaction ENDS. So two confirms cannot both be in flight
 * past that point: the second blocks, and it only proceeds when the first commits or rolls back. A
 * test that holds N transactions open and awaits N confirms deadlocks by construction, and one that
 * lets each finish first must COMMIT to see distinct numbers — which this suite does not do.
 *
 * What two live MJ sessions DO prove, and nothing else in the suite does:
 *   · VL9  — a real second MJ confirm blocks behind an uncommitted first one, and when the first
 *            rolls back the second takes the SAME number. Gap-freedom under contention, with an MJ
 *            confirm as the competing actor rather than hand-written SQL.
 *   · VL10 — that serialization is GLOBAL, not per company. Two different companies contend.
 *   · VL11 — the price path, which takes no counter, genuinely overlaps. That is where a
 *            process-level cache in the pricing/promotion/charge engines would leak one session's
 *            answer into another's, and it is the only place real parallelism is observable.
 *
 * TIMING IS LOGGED, NEVER ASSERTED. Wall clock on a developer laptop sharing a SQL Server with
 * whatever else is running is not a property; an assertion on it is a scheduled flake. The numbers
 * are printed so a regression is visible to a human reading the run.
 *
 * CONNECTS TO:
 *   CODE: OrderEntityServer.nextSequence / Save, SubscriptionBehavior, ChargeEngine, PromotionEngine
 *   DOC:  plans/bizapps-orders-master.md D30 (numbering), D45/D46 (subscription rules)
 *   PEER: checks/concurrency.checks.ts — the same question from a raw second connection
 */
import { randomUUID } from "crypto";
import { BaseRemotableOperation, CompositeKey } from "@memberjunction/core";
import type { BaseEntity, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { MJGlobal } from "@memberjunction/global";
import type { mjBizAppsOrdersOrderHeaderEntity } from "@mj-biz-apps/orders-entities";
import {
  Assert,
  AssertEqual,
  IntegrationCheckRegistry,
  type IntegrationCheckContext,
  type NamedCheck,
} from "@memberjunction/testing-integration";
import {
  CreateProductPrice,
  CreatePromotion,
  ACCT_SCHEMA,
  CreateOrdersFixture,
  createViaEntity,
  EnsureTaxNexus,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxOne,
  TxQuery,
} from "../fixture.js";
import {
  ORDER_HEADER_ENTITY,
  PRICE_LIST_ASSIGNMENT_ENTITY,
  PRICE_LIST_ENTITY,
  PRODUCT_PRICE_ENTITY,
} from "../entity-names.js";
import { ConfirmOrder, type LineSpec, type OrderSpec } from "../order-builder.js";
import { CreatePayment } from "../payment-builder.js";

// ─── shared fixture edits ──────────────────────────────────────────────────────────────────────

async function addPrice(ctx: IntegrationCheckContext, productID: string, amount: number): Promise<void> {
  // Delegates to the shared builder so the price goes through `ProductPriceEntityServer` and its
  // ambiguity guard, rather than around it. Idempotent per product — see CreateProductPrice.
  await CreateProductPrice(ctx, productID, amount);
}

/** One reusable order-level promotion code. Volume checks apply the SAME code many times. */
async function addPromotion(
  ctx: IntegrationCheckContext,
  opts: { kind?: string; value: number },
): Promise<string> {
  // Delegates to the shared builder so the Promotion, its PromotionCode and any target all
  // go through their entity servers rather than around them.
  return CreatePromotion(ctx, {
    // AmountOff, not the shared builder's PercentOff default. This bundle's promotions carry values
    // like 15 meaning "15 off"; read as a percentage that is 1500%, which drives the line to zero and
    // fails booking with "line amount must be a finite number > 0".
    Kind: opts.kind ?? "AmountOff",
    Value: opts.value,
    // This bundle's own default, preserved. The shared builder defaults to 'Either',
    // and letting that win applied order-level promotions PER LINE — 13 lines turned a
    // 0.07 discount into 0.91, which still reconciled internally and was still wrong.
    AppliesAt: (opts as { appliesAt?: string }).appliesAt ?? "Order",
    TargetProductID: (opts as { targetProductID?: string | null }).targetProductID ?? null,
  });
}

/**
 * Grant CoA nexus wherever the fixture deliberately withheld it. Copied from `arithmetic-edges`
 * rather than shared because the fixture's nexus GAP is load-bearing there (proving a correct system
 * charges nothing where it has no obligation) and a shared helper would invite removing it.
 */
async function grantNexus(ctx: IntegrationCheckContext, keys: string[]): Promise<void> {
  const f = Fx();
  // WHICH jurisdictions are granted stays local to each bundle — the fixture's nexus GAP is
  // load-bearing and a shared decision would invite removing it. Only the WRITE is shared.
  await EnsureTaxNexus(ctx, f.CoA.ID, keys.map((k) => f.Tax.JurisdictionIDs.get(k)!).filter(Boolean));
}

/** Prices for every product the population uses, so half its lines can omit `UnitPrice`. */
async function priceTheCatalog(ctx: IntegrationCheckContext): Promise<void> {
  const f = Fx();
  await addPrice(ctx, f.Products.WidgetA, 19.99);
  await addPrice(ctx, f.Products.WidgetB, 45.5);
  await addPrice(ctx, f.Products.WidgetC, 12);
  await addPrice(ctx, f.Products.SubRolling, 1200);
  await addPrice(ctx, f.Products.SubMonthly, 99);
  await addPrice(ctx, f.Products.DeferredA, 240);
}

// ─── the population ────────────────────────────────────────────────────────────────────────────

const SEQ_TABLE = `${ORDERS_SCHEMA}.OrderSequence`;
const seqOf = (orderNumber: string) => Number(String(orderNumber).replace(/^ORD-/, ""));

/** SQL `IN` list of quoted GUIDs. Empty is written as a GUID that cannot match, never as `()`. */
const idList = (ids: string[]) => (ids.length ? ids.map((i) => `'${i}'`).join(",") : `'00000000-0000-0000-0000-000000000000'`);

export interface PopulationRow {
  Index: number;
  ID: string;
  Number: string;
  Saved: boolean;
  Message: string;
  /** What shape the generator chose — asserted by VL1 so a homogeneous population is caught. */
  Shape: string;
}

/**
 * The shape of order number `i`. DETERMINISTIC, by index rather than by `Math.random()`: a random
 * population turns a failure into something nobody can reproduce, and the point of varying the shape
 * is coverage, not unpredictability.
 *
 * The rotations are deliberately coprime-ish (products every 6, addresses every 4, promotions every
 * 5, charges every 3) so a population of 40 exercises many COMBINATIONS rather than 6 shapes with
 * the same decoration each time.
 *
 * `UnitPrice` is stated on odd-numbered orders and omitted on even ones, so the population runs both
 * the direct-entry path and the resolver (D69) rather than picking one.
 */
function shapeFor(i: number, promotionCode: string): { Spec: OrderSpec; Shape: string } {
  const f = Fx();
  const priced = i % 2 === 1;
  const px = (amount: number) => (priced ? amount : undefined);
  const qty = (i % 5) + 1;

  let lines: LineSpec[];
  let label: string;
  switch (i % 6) {
    case 0:
      lines = [{ ProductID: f.Products.WidgetA, Quantity: qty, UnitPrice: px(19.99) }];
      label = "simple";
      break;
    case 1:
      // TWO COMPANIES on one order (D10). The header is CoA's; the WidgetB line resolves to CoB and
      // books into CoB's accounts, so this shape is the reason VL3 counts entries per company.
      lines = [
        { ProductID: f.Products.WidgetA, Quantity: qty, UnitPrice: px(19.99) },
        { ProductID: f.Products.WidgetB, Quantity: 2, UnitPrice: px(45.5) },
      ];
      label = "two-company";
      break;
    case 2:
      lines = [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: px(1200) }];
      label = "subscription-annual";
      break;
    case 3:
      lines = [{ ProductID: f.Products.SubMonthly, Quantity: 1, UnitPrice: px(99) }];
      label = "subscription-monthly";
      break;
    case 4:
      // Deferred with no subscription: recognition anchors to the LINE, so the window is stated.
      lines = [{
        ProductID: f.Products.DeferredA,
        Quantity: 1,
        UnitPrice: px(240),
        ServicePeriodStart: "2027-01-01",
        ServicePeriodEnd: "2027-12-31",
      }];
      label = "deferred";
      break;
    default:
      // A FRACTIONAL quantity against 2dp money, plus three lines — the widest single shape.
      lines = [
        { ProductID: f.Products.WidgetA, Quantity: 0.25, UnitPrice: px(19.99) },
        { ProductID: f.Products.WidgetA, Quantity: qty * 3, UnitPrice: px(19.99) },
        { ProductID: f.Products.WidgetB, Quantity: 1, UnitPrice: px(45.5) },
      ];
      label = "fractional";
      break;
  }

  const addressKey = ["", "SantaClara", "NYC", "SanMateo"][i % 4];
  const spec: OrderSpec = {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: lines,
  };
  if (addressKey) {
    spec.ShipToAddressID = f.Tax.AddressIDs.get(addressKey);
    label += `+${addressKey}`;
  }
  // `promotionCode` is required for the promoted shapes; a caller that omits it gets a population
  // with no promotions at all rather than an order presenting the empty string as a code.
  if (i % 5 === 0 && promotionCode) {
    spec.PromotionCodes = [promotionCode];
    label += "+promo";
  }
  if (i % 3 === 0) {
    spec.Charges = [{ Code: "Shipping", Amount: 5 + (i % 7) }];
    label += "+shipping";
  }
  return { Spec: spec, Shape: label };
}

/**
 * Confirm `count` orders of rotating shape and return what happened to each.
 *
 * A failed confirm is RETURNED, not thrown: VL5 needs one to fail on purpose and every other check
 * asserts that none did. Throwing here would make the difference invisible.
 *
 * `poison` names an index that gets an extra WidgetC line. WidgetC belongs to CoC, which has GL
 * accounts and no GL links, so any confirm containing it resolves no account and rolls back whole
 * (D12) — the realistic way one order in a batch fails.
 */
async function buildPopulation(
  ctx: IntegrationCheckContext,
  count: number,
  opts: { promotionCode: string; poison?: number } = { promotionCode: "" },
): Promise<PopulationRow[]> {
  const f = Fx();
  const rows: PopulationRow[] = [];
  for (let i = 0; i < count; i++) {
    const { Spec, Shape } = shapeFor(i, opts.promotionCode);
    const spec: OrderSpec =
      i === opts.poison
        ? { ...Spec, Lines: [...Spec.Lines, { ProductID: f.Products.WidgetC, Quantity: 1, UnitPrice: 12 }] }
        : Spec;
    const result = await ConfirmOrder(ctx.User, spec);
    rows.push({
      Index: i,
      ID: result.Order.ID as string,
      Number: result.Order.OrderNumber as string,
      Saved: result.Saved,
      Message: result.Message,
      Shape: i === opts.poison ? `${Shape}+POISON` : Shape,
    });
  }
  return rows;
}

/** Every order that confirmed, in the order it was confirmed. */
const saved = (rows: PopulationRow[]) => rows.filter((r) => r.Saved);

/** Log wall clock for a population. Never asserted — see the module header. */
function logTiming(label: string, count: number, ms: number): void {
  console.log(
    `      ${label}: ${count} orders in ${ms}ms (${(ms / Math.max(count, 1)).toFixed(0)}ms each)`,
  );
}

// ─── population-wide invariants, as single aggregate queries ───────────────────────────────────
//
// One query per invariant rather than a loop of per-order queries. Not only for speed: an aggregate
// that returns a COUNT of violations plus a COUNT of rows examined makes the vacuous case
// impossible to miss. A loop over an empty list passes every assertion inside it, which is exactly
// how two bundles in this suite once shipped checks that tested nothing.

/** Does each header's TotalGross equal the sum of its lines, and does gross = net + tax + charges? */
const headerVsLines = (ctx: IntegrationCheckContext, ids: string[]) =>
  TxOne<{ Orders: number; Lines: number; GrossMismatch: number; FormulaMismatch: number; BalanceMismatch: number }>(
    ctx,
    `SELECT COUNT(*) AS Orders,
            SUM(x.Lines) AS Lines,
            SUM(CASE WHEN ISNULL(h.TotalGross,0) <> x.Gross THEN 1 ELSE 0 END) AS GrossMismatch,
            SUM(CASE WHEN x.Gross <> ROUND(x.Net + x.Tax + x.Charge, 2) THEN 1 ELSE 0 END) AS FormulaMismatch,
            SUM(CASE WHEN ISNULL(h.Balance,0) <> ISNULL(h.TotalGross,0) - h.AmountPaid THEN 1 ELSE 0 END)
              AS BalanceMismatch
       FROM ${ORDERS_SCHEMA}.OrderHeader h
      CROSS APPLY (SELECT COUNT(*) AS Lines,
                          ISNULL(SUM(l.LineTotalNet),0) AS Net, ISNULL(SUM(l.LineTax),0) AS Tax,
                          ISNULL(SUM(l.ChargeAmount),0) AS Charge,
                          ISNULL(SUM(l.LineTotalGross),0) AS Gross
                     FROM ${ORDERS_SCHEMA}.OrderLine l WHERE l.OrderHeaderID = h.ID) x
      WHERE h.ID IN (${idList(ids)})`,
  );

/** Every journal entry these orders booked, grouped per entry, with per-company counts. */
const ledgerAcross = (ctx: IntegrationCheckContext, ids: string[]) =>
  TxOne<{ Entries: number; Unbalanced: number; Companies: number; UnbookedLines: number }>(
    ctx,
    `WITH e AS (
        SELECT je.ID, gl.CompanyID,
               SUM(jel.DebitAmount) AS D, SUM(jel.CreditAmount) AS C
          FROM ${ORDERS_SCHEMA}.OrderLine ol
          JOIN ${ACCT_SCHEMA}.JournalEntry je ON je.ID = ol.JournalEntryID
          JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
          JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
         WHERE ol.OrderHeaderID IN (${idList(ids)})
         GROUP BY je.ID, gl.CompanyID)
     SELECT (SELECT COUNT(DISTINCT ID) FROM e) AS Entries,
            (SELECT ISNULL(SUM(CASE WHEN ISNULL(D,0) <> ISNULL(C,0) THEN 1 ELSE 0 END),0) FROM e) AS Unbalanced,
            (SELECT COUNT(DISTINCT CompanyID) FROM e) AS Companies,
            (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderLine ol
              WHERE ol.OrderHeaderID IN (${idList(ids)}) AND ol.JournalEntryID IS NULL) AS UnbookedLines`,
  );

/** Charge allocations against their parent charge, across the whole population. */
const chargeParityAcross = (ctx: IntegrationCheckContext, ids: string[]) =>
  TxOne<{ Charges: number; Unallocated: number; WrongSign: number }>(
    ctx,
    `WITH c AS (
        SELECT ch.ID, ch.Amount,
               ISNULL((SELECT SUM(a.Amount) FROM ${ORDERS_SCHEMA}.OrderChargeAllocation a
                        WHERE a.OrderChargeID = ch.ID), 0) AS Allocated,
               ISNULL((SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderChargeAllocation a
                        WHERE a.OrderChargeID = ch.ID AND SIGN(a.Amount) = -SIGN(ch.Amount)), 0) AS Negatives
          FROM ${ORDERS_SCHEMA}.OrderCharge ch
         WHERE ch.OrderHeaderID IN (${idList(ids)}))
     SELECT COUNT(*) AS Charges,
            ISNULL(SUM(CASE WHEN Allocated <> Amount THEN 1 ELSE 0 END),0) AS Unallocated,
            ISNULL(SUM(Negatives),0) AS WrongSign
       FROM c`,
  );

/**
 * Promotion shares against the discount that actually landed on the lines.
 *
 * READ THE `arithmetic-edges` NOTE BEFORE CHANGING THIS. An order-level promotion is allocated DOWN
 * to lines: each share is its own `OrderAdjustment` carrying an `OrderLineID`. So `WHERE OrderLineID
 * IS NULL` matches nothing, and "allocations sum to their adjustment" is true by construction. The
 * question with teeth is whether the shares of one promotion on one order sum to the `DiscountAmount`
 * the lines of that order ended up carrying.
 */
const promotionParityAcross = (ctx: IntegrationCheckContext, ids: string[]) =>
  TxOne<{ Orders: number; Mismatched: number; NonPositiveShares: number; Shares: number }>(
    ctx,
    `WITH per AS (
        SELECT h.ID,
               ISNULL((SELECT SUM(adj.Amount) FROM ${ORDERS_SCHEMA}.OrderAdjustment adj
                        WHERE adj.OrderHeaderID = h.ID AND adj.PromotionID IS NOT NULL), 0) AS Shares,
               ISNULL((SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderAdjustment adj
                        WHERE adj.OrderHeaderID = h.ID AND adj.PromotionID IS NOT NULL), 0) AS ShareCount,
               ISNULL((SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderAdjustment adj
                        WHERE adj.OrderHeaderID = h.ID AND adj.PromotionID IS NOT NULL
                          AND adj.Amount <= 0), 0) AS BadShares,
               ISNULL((SELECT SUM(l.DiscountAmount) FROM ${ORDERS_SCHEMA}.OrderLine l
                        WHERE l.OrderHeaderID = h.ID), 0) AS LineDiscount
          FROM ${ORDERS_SCHEMA}.OrderHeader h
         WHERE h.ID IN (${idList(ids)}))
     SELECT SUM(CASE WHEN ShareCount > 0 THEN 1 ELSE 0 END) AS Orders,
            ISNULL(SUM(CASE WHEN ShareCount > 0 AND Shares <> LineDiscount THEN 1 ELSE 0 END),0) AS Mismatched,
            ISNULL(SUM(BadShares),0) AS NonPositiveShares,
            ISNULL(SUM(ShareCount),0) AS Shares
       FROM per`,
  );

// ─── the second MJ session ─────────────────────────────────────────────────────────────────────

/** The provider surface these checks reach past `IMetadataProvider` for. */
type Session = IMetadataProvider & {
  ExecuteSQL(query: string): Promise<unknown>;
  BeginTransaction(): Promise<void>;
  RollbackTransaction(): Promise<void>;
  Config(data: unknown): Promise<boolean>;
  ConfigData: unknown;
};

/**
 * Extra providers, keyed by index. Module-scoped and reused for the same reason the fixture is:
 * `Config()` reloads all of MJ's metadata, which costs seconds, and the driver runs one bundle at a
 * time in a dedicated process. Index 0 is always the provider the driver handed us.
 */
const extraSessions: Session[] = [];

/**
 * Get an independent MJ session. Index 0 is `ctx.Provider`; anything higher is a second (third…)
 * `SQLServerDataProvider` on the same pool, which means its own connection and its own transaction.
 *
 * Built from `ctx.Provider.constructor` and `ctx.Provider.ConfigData` rather than by importing
 * `@memberjunction/sqlserver-dataprovider`: this package does not depend on the provider package,
 * and reaching for the running provider's own constructor keeps the second session identical to the
 * first by construction instead of by a version match nobody would notice breaking.
 *
 * `SetProvider` is deliberately NOT called, so `Metadata.Provider` keeps pointing at session 0 and
 * every other bundle's global behaviour is untouched.
 */
async function session(ctx: IntegrationCheckContext, index: number): Promise<Session> {
  const primary = ctx.Provider as unknown as Session;
  if (index === 0) return primary;
  const slot = index - 1;
  if (extraSessions[slot]) return extraSessions[slot];

  Assert(
    primary.ConfigData != null,
    "ctx.Provider exposes no ConfigData, so a second provider cannot be configured from it — this " +
      "bundle needs a SERVER-transport provider (a client transport has no connection to share)",
  );
  const Ctor = (primary as unknown as object).constructor as new () => Session;
  const extra = new Ctor();
  try {
    await extra.Config(primary.ConfigData);
  } catch (e) {
    // Turn the provider's own error into something that names the cause. Without this the check
    // fails somewhere inside metadata loading, which reads as a database problem rather than as
    // "this transport cannot have a second session".
    throw new Error(
      `a second ${Ctor.name} could not be configured from the running provider's ConfigData: ` +
        `${(e as Error).message}`,
    );
  }
  Assert(
    extra !== primary,
    "the second session is the same object as the first — there is no independent connection and " +
      "every concurrency assertion below would be measuring one session against itself",
  );
  extraSessions[slot] = extra;
  return extra;
}

/** `@@SPID` for a session. Only meaningful while that session holds a transaction — see below. */
async function spidOf(s: Session): Promise<number> {
  const rows = (await s.ExecuteSQL(`SELECT @@SPID AS S`)) as Array<{ S: number }>;
  return Number(rows?.[0]?.S);
}

/**
 * How many DISTINCT database connections a set of sessions actually has.
 *
 * The evidence every concurrency check below rests on, and it has to be taken this way rather than
 * the obvious way. Without a transaction open, a provider takes whatever connection the pool hands
 * it for one statement and gives it straight back — so reading `@@SPID` from two providers in
 * sequence very often returns the SAME number, because the second one got the connection the first
 * one just released. That would make the check flaky in the direction that matters: it would fail
 * on a perfectly good pair of sessions.
 *
 * Opening every transaction FIRST forces the pool to hold one connection per session
 * simultaneously, so the SPIDs are distinct if and only if the sessions are.
 */
async function distinctSessionCount(sessions: Session[]): Promise<number> {
  await Promise.all(sessions.map((s) => s.BeginTransaction()));
  try {
    return new Set(await Promise.all(sessions.map(spidOf))).size;
  } finally {
    await Promise.all(sessions.map((s) => s.RollbackTransaction().catch(() => undefined)));
  }
}

/** Query on a specific session's connection. */
async function query<T = Record<string, unknown>>(s: Session, sql: string): Promise<T[]> {
  const rows = await s.ExecuteSQL(sql);
  return (Array.isArray(rows) ? rows : []) as T[];
}

/**
 * Run `body` with `s`'s transaction open and ALWAYS roll it back.
 *
 * The session-specific twin of `InRolledBackTransaction`. Necessary because `OrderEntityServer.Save`
 * COMMITS its own transaction on success — without an enclosing one, a confirm through a second
 * session would reach disk.
 */
async function inSessionTransaction(s: Session, body: () => Promise<void>): Promise<void> {
  await s.BeginTransaction();
  try {
    await body();
  } finally {
    await s.RollbackTransaction().catch(() => undefined);
  }
}

/**
 * The two-session contention protocol both VL9 and VL10 need.
 *
 * `holder` runs on session 0 and leaves its transaction OPEN, holding whatever it locked.
 * `waiter` runs on session 1 in its own transaction and is expected to BLOCK. After the wait window
 * proves it blocked, session 0's transaction is rolled back — which is what lets the waiter through,
 * and what makes the released document number observable without anything reaching disk.
 *
 * The shape is prescriptive because getting it wrong hangs the suite rather than failing it: the
 * holder's transaction MUST end before the waiter is awaited. Two open transactions both awaiting
 * the counter is a deadlock, not a slow test — see the module header for why that is inherent to a
 * gap-conscious counter rather than a defect.
 */
async function withContention(
  primary: Session,
  second: Session,
  holder: () => Promise<void>,
  waiter: () => Promise<void>,
  onStillWaiting: string,
): Promise<void> {
  await primary.BeginTransaction();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await primary.RollbackTransaction();
  };

  let settled = false;
  let racing: Promise<void> | undefined;
  try {
    await holder();
    // Taken now, while the holder's transaction is definitely open and therefore pinned to one
    // connection. The waiter compares its own against it, below.
    const holderSpid = await spidOf(primary);

    racing = inSessionTransaction(second, async () => {
      const mine = await spidOf(second);
      Assert(
        mine !== holderSpid,
        `the waiter is running on SPID ${mine}, the same connection as the holder — it cannot ` +
          `contend with itself, so whatever this check observed was not lock contention`,
      );
      await waiter();
    }).then(
      () => { settled = true; },
      (e) => { settled = true; throw e; },
    );
    // Nothing may go unhandled while we are deliberately not awaiting it.
    racing.catch(() => undefined);

    await new Promise((r) => setTimeout(r, 1500));
    Assert(!settled, onStillWaiting);

    await release();
    await racing;
  } finally {
    await release().catch(() => undefined);
    if (racing) await racing.catch(() => undefined);
  }
}

/** Confirm a trivial CoA order through a given session. Priced inline so no committed rule is needed. */
async function confirmVia(
  s: Session,
  user: UserInfo,
  companyID: string,
  productID: string,
): Promise<{ Saved: boolean; Message: string; Number: string; ID: string }> {
  const f = Fx();
  const result = await ConfirmOrder(
    user,
    {
      CompanyID: companyID,
      BillToOrganizationID: f.Customers.OrganizationID,
      Lines: [{ ProductID: productID, Quantity: 2, UnitPrice: 25 }],
    },
    s,
  );
  return {
    Saved: result.Saved,
    Message: result.Message,
    Number: result.Order.OrderNumber as string,
    ID: result.Order.ID as string,
  };
}

interface PreviewOutput {
  Success: boolean;
  Message?: string;
  UnitPrice?: number;
  ExtendedAmount?: number;
  ResolvedBy?: string;
}

/** `Orders.PreviewPrice` on a named session — the read path, which takes no counter. */
async function previewVia(
  s: Session,
  user: UserInfo,
  input: Record<string, unknown>,
): Promise<PreviewOutput> {
  const op = MJGlobal.Instance.ClassFactory.CreateInstance<
    BaseRemotableOperation<Record<string, unknown>, PreviewOutput>
  >(BaseRemotableOperation, "Orders.PreviewPrice");
  Assert(op != null, "'Orders.PreviewPrice' is not registered");
  const result = await op!.Execute(input, { provider: s, user });
  Assert(result.Success, `the operation did not execute: ${result.ErrorMessage ?? "unknown"}`);
  return result.Output as PreviewOutput;
}

// ─── checks ────────────────────────────────────────────────────────────────────────────────────

const POPULATION = 80;
const SMALL = 40;

export const VolumeChecks: NamedCheck[] = [
  {
    Id: "volume.VL1",
    Name: "VL1: 80 varied orders take 80 strictly increasing, gap-free numbers",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await priceTheCatalog(ctx);
        await grantNexus(ctx, ["NY", "NY-NYC", "NY-MCTD"]);
        const code = await addPromotion(ctx, { value: 3.33 });

        const before = await TxOne<{ N: number }>(ctx,
          `SELECT NextSequenceNumber AS N FROM ${SEQ_TABLE} WHERE ID=1`);

        const started = Date.now();
        const rows = await buildPopulation(ctx, POPULATION, { promotionCode: code });
        logTiming("VL1", POPULATION, Date.now() - started);

        const failures = rows.filter((r) => !r.Saved);
        AssertEqual(
          failures.length,
          0,
          `every order must confirm; first failure: ${failures[0]?.Shape} — ${failures[0]?.Message}`,
        );
        AssertEqual(rows.length, POPULATION, "the generator produced the whole population");

        // THE SHAPE ASSERTION. Without it this check passes just as happily on 80 identical
        // one-line orders, which would prove numbering under repetition and nothing about the
        // pipeline under variety. Assert the variety exists before asserting anything about it.
        const shapes = new Set(rows.map((r) => r.Shape));
        Assert(
          shapes.size >= 12,
          `the population must be VARIED — only ${shapes.size} distinct shapes in ${POPULATION} orders`,
        );
        Assert(
          rows.some((r) => r.Shape.includes("promo")) &&
            rows.some((r) => r.Shape.includes("shipping")) &&
            rows.some((r) => r.Shape.includes("subscription")) &&
            rows.some((r) => r.Shape.includes("two-company")) &&
            rows.some((r) => r.Shape.includes("NYC")),
          `the population is missing a shape it is supposed to cover: ${[...shapes].join(", ")}`,
        );

        // STRICTLY INCREASING AND CONTIGUOUS. Read from the DATABASE, not from the in-memory
        // entities: a number assigned in memory and never persisted would satisfy the entities and
        // leave the OrderHeader rows holding something else.
        const numbers = await TxQuery<{ OrderNumber: string }>(ctx,
          `SELECT OrderNumber FROM ${ORDERS_SCHEMA}.OrderHeader
            WHERE ID IN (${idList(rows.map((r) => r.ID))})
            ORDER BY CAST(REPLACE(OrderNumber,'ORD-','') AS INT)`);
        AssertEqual(numbers.length, POPULATION, "every order reached the database with a number");

        const seq = numbers.map((n) => seqOf(n.OrderNumber));
        AssertEqual(seq[0], Number(before.N), "the first order takes the number the counter was showing");
        for (let i = 1; i < seq.length; i++) {
          AssertEqual(
            seq[i],
            seq[i - 1] + 1,
            `order ${i + 1} of ${POPULATION} broke the run at ORD-${seq[i]} (previous ORD-${seq[i - 1]}) — ` +
              `a gap in an A/R document sequence is something an auditor makes somebody account for`,
          );
        }
        Assert(
          /^ORD-\d{6}$/.test(numbers[numbers.length - 1].OrderNumber),
          `the ${POPULATION}th number must still be well formed, got '${numbers[numbers.length - 1].OrderNumber}'`,
        );

        const after = await TxOne<{ N: number }>(ctx,
          `SELECT NextSequenceNumber AS N FROM ${SEQ_TABLE} WHERE ID=1`);
        AssertEqual(
          Number(after.N) - Number(before.N),
          POPULATION,
          "80 numbers taken advanced the counter by exactly 80",
        );
      }),
  },
  {
    Id: "volume.VL2",
    Name: "VL2: across a varied population every header still agrees with its own lines",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await priceTheCatalog(ctx);
        await grantNexus(ctx, ["NY", "NY-NYC", "NY-MCTD"]);
        const code = await addPromotion(ctx, { value: 3.33 });

        const started = Date.now();
        const rows = saved(await buildPopulation(ctx, SMALL, { promotionCode: code }));
        logTiming("VL2", rows.length, Date.now() - started);
        AssertEqual(rows.length, SMALL, "the whole population confirmed");

        const t = await headerVsLines(ctx, rows.map((r) => r.ID));
        // ROW COUNTS FIRST. Every assertion after this is a count of violations, and zero
        // violations is also what an empty result set reports.
        AssertEqual(Number(t.Orders), SMALL, "the aggregate examined every order");
        Assert(Number(t.Lines) > SMALL, `and every line — ${t.Lines} lines across ${SMALL} orders`);

        AssertEqual(
          Number(t.GrossMismatch),
          0,
          "every header's TotalGross equals the sum of its lines, exactly — a header recomputed " +
            "from a stale line set is an invoice for a number the lines do not support",
        );
        AssertEqual(
          Number(t.FormulaMismatch),
          0,
          "and every order's gross is net + tax + charges at 2dp, on the awkward mix the generator built",
        );
        AssertEqual(
          Number(t.BalanceMismatch),
          0,
          "Balance is TotalGross - AmountPaid on all of them, including the ones carrying charges",
        );
      }),
  },
  {
    Id: "volume.VL3",
    Name: "VL3: every journal entry in the population balances, per company, with no unbooked line",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await priceTheCatalog(ctx);
        await grantNexus(ctx, ["NY", "NY-NYC", "NY-MCTD"]);
        const code = await addPromotion(ctx, { value: 3.33 });

        const rows = saved(await buildPopulation(ctx, SMALL, { promotionCode: code }));
        AssertEqual(rows.length, SMALL, "the whole population confirmed");

        const l = await ledgerAcross(ctx, rows.map((r) => r.ID));
        Assert(
          Number(l.Entries) >= SMALL,
          `there must be at least one entry per order — ${l.Entries} entries for ${SMALL} orders`,
        );
        AssertEqual(
          Number(l.UnbookedLines),
          0,
          "no confirmed line may be left without a JournalEntryID — an unbooked line is revenue " +
            "the ledger has never heard of, and the order looks complete either way",
        );
        AssertEqual(
          Number(l.Unbalanced),
          0,
          "every entry balances to the penny, not to a tolerance, at the 40th order as at the 1st",
        );
        // TWO companies, because every sixth order carries a CoB line. A booking path that
        // resolved accounts once per ORDER rather than once per LINE would still balance — and
        // would post CoB's revenue into CoA's ledger, which this is the assertion that catches.
        AssertEqual(
          Number(l.Companies),
          2,
          "the population's two-company orders must book into BOTH companies' accounts",
        );
      }),
  },
  {
    Id: "volume.VL4",
    Name: "VL4: charge and promotion allocations reconcile on every order in the population",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await priceTheCatalog(ctx);
        await grantNexus(ctx, ["NY", "NY-NYC", "NY-MCTD"]);
        // 3.33 across a rotating number of lines: most shares do not divide, which is where a
        // round-then-patch allocator drifts or inverts a share.
        const code = await addPromotion(ctx, { value: 3.33 });

        const rows = saved(await buildPopulation(ctx, SMALL, { promotionCode: code }));
        AssertEqual(rows.length, SMALL, "the whole population confirmed");
        const ids = rows.map((r) => r.ID);

        const c = await chargeParityAcross(ctx, ids);
        Assert(
          Number(c.Charges) >= SMALL / 3,
          `the shipping and tax charges must exist — only ${c.Charges} charges across ${SMALL} orders`,
        );
        AssertEqual(Number(c.Unallocated), 0, "every charge's allocations sum to the charge EXACTLY");
        AssertEqual(Number(c.WrongSign), 0, "and no share has the opposite sign to its parent");

        const p = await promotionParityAcross(ctx, ids);
        Assert(
          Number(p.Orders) >= SMALL / 5,
          `the promotion must have applied to the orders that presented it — ${p.Orders} of ${SMALL}`,
        );
        Assert(
          Number(p.Shares) > Number(p.Orders),
          `an order-level promotion is split across LINES, so there must be more shares (${p.Shares}) ` +
            `than promoted orders (${p.Orders}) — one share each would mean nothing was allocated`,
        );
        AssertEqual(
          Number(p.Mismatched),
          0,
          "every promoted order's shares sum to the discount its lines actually carry — a share lost " +
            "to rounding is money the customer was promised and did not receive",
        );
        AssertEqual(
          Number(p.NonPositiveShares),
          0,
          "no share may be zero or negative; round-then-patch makes one line absorb the drift",
        );
      }),
  },
  {
    Id: "volume.VL5",
    Name: "VL5: one order failing in the middle of a batch takes nothing else with it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        await priceTheCatalog(ctx);
        const code = await addPromotion(ctx, { value: 3.33 });
        const poison = 20;

        const before = await TxOne<{ N: number }>(ctx,
          `SELECT NextSequenceNumber AS N FROM ${SEQ_TABLE} WHERE ID=1`);
        const rows = await buildPopulation(ctx, SMALL, { promotionCode: code, poison });

        const bad = rows[poison];
        Assert(
          !bad.Saved,
          "the poisoned order must FAIL — WidgetC belongs to CoC, which has no GL links to resolve",
        );
        Assert(
          /GL account/i.test(bad.Message),
          `and it must fail for the ACCOUNT resolution reason, not some other one: ${bad.Message}`,
        );

        // CONTAINMENT, part one: everything else confirmed.
        const ok = saved(rows);
        AssertEqual(ok.length, SMALL - 1, "every other order in the batch confirmed");

        // CONTAINMENT, part two: the failure left NO trace. A confirm that got as far as writing
        // its header and then rolled only the booking back would leave a Draft-looking order with
        // no journal entries — which reads as a legitimate unbooked order forever after.
        const orphans = await TxOne<{ Headers: number; Lines: number; Charges: number; Entries: number }>(ctx,
          `SELECT (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${bad.ID}') AS Headers,
                  (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${bad.ID}') AS Lines,
                  (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderCharge WHERE OrderHeaderID='${bad.ID}') AS Charges,
                  (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderLine ol
                    WHERE ol.OrderHeaderID='${bad.ID}' AND ol.JournalEntryID IS NOT NULL) AS Entries`);
        AssertEqual(Number(orphans.Headers), 0, "the failed order left no header");
        AssertEqual(Number(orphans.Lines), 0, "no lines");
        AssertEqual(Number(orphans.Charges), 0, "no charges");
        AssertEqual(Number(orphans.Entries), 0, "and nothing booked");

        // CONTAINMENT, part three: it burned no number. The counter advanced by 39, not 40, and the
        // surviving numbers are still one contiguous run — the order after the failure reuses the
        // number the failure had taken.
        const numbers = await TxQuery<{ OrderNumber: string }>(ctx,
          `SELECT OrderNumber FROM ${ORDERS_SCHEMA}.OrderHeader
            WHERE ID IN (${idList(ok.map((r) => r.ID))})
            ORDER BY CAST(REPLACE(OrderNumber,'ORD-','') AS INT)`);
        AssertEqual(numbers.length, SMALL - 1, "every surviving order is in the database");
        const seq = numbers.map((n) => seqOf(n.OrderNumber));
        for (let i = 1; i < seq.length; i++) {
          AssertEqual(
            seq[i],
            seq[i - 1] + 1,
            `the surviving numbers must stay contiguous ACROSS the failure — gap at ORD-${seq[i]}`,
          );
        }
        const after = await TxOne<{ N: number }>(ctx,
          `SELECT NextSequenceNumber AS N FROM ${SEQ_TABLE} WHERE ID=1`);
        AssertEqual(
          Number(after.N) - Number(before.N),
          SMALL - 1,
          "the counter advanced once per SUCCESSFUL order — the failure released its number",
        );
      }),
  },
  {
    Id: "volume.VL6",
    Name: "VL6: twelve repeat purchases of one subscription extend ONE subscription twelve times",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.SubRolling, 1200);
        const REPEATS = 12;

        // Same product, same subscriber, twelve times. `AnnualRolling` is ExtendExisting, so the
        // right answer is one subscription with twelve contiguous annual terms — twelve years of
        // membership renewals, which is the ordinary case for the product this models.
        const started = Date.now();
        for (let i = 0; i < REPEATS; i++) {
          const result = await ConfirmOrder(ctx.User, {
            CompanyID: f.CoA.ID,
            OrderDate: new Date("2026-07-01T00:00:00"),
            BillToOrganizationID: f.Customers.OrganizationID,
            Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1 }],
          });
          Assert(result.Saved, `purchase ${i + 1} of ${REPEATS} failed: ${result.Message}`);
        }
        logTiming("VL6", REPEATS, Date.now() - started);

        const subs = await TxQuery<{ ID: string }>(ctx,
          `SELECT ID FROM ${ORDERS_SCHEMA}.Subscription
            WHERE ProductID='${f.Products.SubRolling}'
              AND HolderOrganizationID='${f.Customers.OrganizationID}'`);
        AssertEqual(
          subs.length,
          1,
          "twelve purchases of an ExtendExisting type must find and extend ONE subscription — a " +
            "find-or-create that misses leaves the member holding twelve overlapping memberships",
        );

        const terms = await TxQuery<{ TermNumber: number; StartDate: string; EndDate: string; Amount: number }>(ctx,
          `SELECT TermNumber, StartDate, EndDate, Amount FROM ${ORDERS_SCHEMA}.SubscriptionTerm
            WHERE SubscriptionID='${subs[0].ID}' ORDER BY TermNumber`);
        AssertEqual(terms.length, REPEATS, "one term per purchase");

        for (let i = 0; i < terms.length; i++) {
          AssertEqual(Number(terms[i].TermNumber), i + 1, `term numbers run 1..${REPEATS} with no repeat`);
          AssertEqual(Number(terms[i].Amount), 1200, `term ${i + 1} is charged full freight, not prorated`);
          if (i === 0) continue;
          // Contiguity is a RECURRENCE, and this is the part `subscriptions.SB7` cannot see: it
          // proves term 2 starts the day term 1 ends + 1. A helper that computed the next start
          // from the FIRST term rather than the LATEST would satisfy SB7 and stack terms 3..12 all
          // on the same window.
          const expected = new Date(terms[i - 1].EndDate);
          expected.setUTCDate(expected.getUTCDate() + 1);
          AssertEqual(
            new Date(terms[i].StartDate).toISOString().slice(0, 10),
            expected.toISOString().slice(0, 10),
            `term ${i + 1} must start the day after term ${i} ends — no gap, no overlap`,
          );
          Assert(
            new Date(terms[i].EndDate) > new Date(terms[i].StartDate),
            `term ${i + 1} must cover a real window`,
          );
        }
        // And the twelfth term ends eleven years after the first ends.
        const spanYears =
          new Date(terms[REPEATS - 1].EndDate).getUTCFullYear() - new Date(terms[0].EndDate).getUTCFullYear();
        AssertEqual(spanYears, REPEATS - 1, "twelve annual extensions cover twelve distinct years");
      }),
  },
  {
    Id: "volume.VL7",
    Name: "VL7: ten attempts at a RejectDuplicate subscription leave exactly one, and no debris",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.SubFiscal, 900);
        const ATTEMPTS = 10;

        const results: Array<{ Saved: boolean; Message: string; ID: string }> = [];
        for (let i = 0; i < ATTEMPTS; i++) {
          const r = await ConfirmOrder(ctx.User, {
            CompanyID: f.CoA.ID,
            OrderDate: new Date("2026-07-01T00:00:00"),
            BillToOrganizationID: f.Customers.OrganizationID,
            Lines: [{ ProductID: f.Products.SubFiscal, Quantity: 1 }],
          });
          results.push({ Saved: r.Saved, Message: r.Message, ID: r.Order.ID as string });
        }

        AssertEqual(results.filter((r) => r.Saved).length, 1, "exactly one attempt may succeed");
        const refused = results.filter((r) => !r.Saved);
        AssertEqual(refused.length, ATTEMPTS - 1, "every other attempt is refused");
        // A negative assertion must assert the REASON. `!Saved` is also what a completely
        // unregistered entity subclass produces, in which case this check would be passing while
        // proving that nothing ran at all.
        for (const r of refused) {
          Assert(
            /second concurrent subscription/i.test(r.Message),
            `each refusal must name the concurrency rule, got: ${r.Message}`,
          );
        }

        const subs = await TxQuery(ctx,
          `SELECT ID FROM ${ORDERS_SCHEMA}.Subscription
            WHERE ProductID='${f.Products.SubFiscal}'
              AND HolderOrganizationID='${f.Customers.OrganizationID}'`);
        AssertEqual(subs.length, 1, "still exactly one subscription after ten tries");
        const terms = await TxQuery(ctx,
          `SELECT st.ID FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
            WHERE st.SubscriptionID='${(subs[0] as { ID: string }).ID}'`);
        AssertEqual(terms.length, 1, "and one term — nine rejected confirms wrote no terms");

        // Nine rejected confirms, nine orders that must not exist. A rules rejection that left the
        // header behind would silently accumulate nine unbooked orders per member per retry.
        const debris = await TxOne<{ Headers: number }>(ctx,
          `SELECT COUNT(*) AS Headers FROM ${ORDERS_SCHEMA}.OrderHeader
            WHERE ID IN (${idList(refused.map((r) => r.ID))})`);
        AssertEqual(Number(debris.Headers), 0, "no rejected attempt left an order behind");
      }),
  },
  {
    Id: "volume.VL8",
    Name: "VL8: 30 orders paid by 60 payments roll up to exactly the sum of their payment lines",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 19.99);
        const typeID = [...f.PaymentTypeIDs.entries()].find(([c]) => c !== "AccountCredit")?.[1];
        Assert(typeID != null, "the app metadata must seed at least one ordinary payment type");

        // ONE company only. A payment settling a two-company order needs the intercompany account
        // pairs, which are committed reference data owned by another bundle's fixture — dragging
        // them in here would make this check about intercompany rather than about rollups at volume.
        const ORDERS = 30;
        const orders: Array<{ ID: string; Gross: number }> = [];
        const started = Date.now();
        for (let i = 0; i < ORDERS; i++) {
          const r = await ConfirmOrder(ctx.User, {
            CompanyID: f.CoA.ID,
            BillToOrganizationID: f.Customers.OrganizationID,
            Lines: [{ ProductID: f.Products.WidgetA, Quantity: (i % 4) + 1 }],
          });
          Assert(r.Saved, `order ${i + 1} failed: ${r.Message}`);
          const h = await TxOne<{ G: number }>(ctx,
            `SELECT TotalGross AS G FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID='${r.Order.ID}'`);
          orders.push({ ID: r.Order.ID as string, Gross: Number(h.G) });
        }

        // Two payments each, split at a penny-awkward fraction so the two parts do not divide
        // evenly and the rollup has to add rather than halve.
        let payments = 0;
        for (const o of orders) {
          const first = Math.round(o.Gross * 0.37 * 100) / 100;
          for (const amount of [first, Math.round((o.Gross - first) * 100) / 100]) {
            const p = await CreatePayment(ctx.User, {
              PaymentNumber: `VL-${randomUUID().slice(0, 8).toUpperCase()}`,
              ReceivingCompanyID: f.CoA.ID,
              PaymentTypeID: typeID!,
              Amount: amount,
              BillToOrganizationID: f.Customers.OrganizationID,
              Allocations: [{ OrderHeaderID: o.ID, Amount: amount }],
            });
            Assert(p.Saved, `payment failed: ${p.Message}`);
            payments++;
          }
        }
        logTiming("VL8", ORDERS, Date.now() - started);
        AssertEqual(payments, ORDERS * 2, "two payments per order");

        // The rollup is a trigger, so this is the question that matters: does the STORED AmountPaid
        // equal the sum of the payment lines, for every order, when there are sixty of them? A
        // trigger that recomputed from the inserted rows rather than from the whole set would be
        // right for the first payment on each order and wrong for the second.
        const r = await TxOne<{ Orders: number; Lines: number; PaidMismatch: number; BalanceMismatch: number; NotPaid: number }>(
          ctx,
          `WITH x AS (
              SELECT h.ID, h.TotalGross, h.AmountPaid, h.Balance, h.PaymentStatus,
                     ISNULL((SELECT SUM(pl.Amount) FROM ${ORDERS_SCHEMA}.PaymentLine pl
                              WHERE pl.OrderHeaderID = h.ID), 0) AS Allocated,
                     ISNULL((SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.PaymentLine pl
                              WHERE pl.OrderHeaderID = h.ID), 0) AS Lines
                FROM ${ORDERS_SCHEMA}.OrderHeader h
               WHERE h.ID IN (${idList(orders.map((o) => o.ID))}))
           SELECT COUNT(*) AS Orders, ISNULL(SUM(Lines),0) AS Lines,
                  ISNULL(SUM(CASE WHEN AmountPaid <> Allocated THEN 1 ELSE 0 END),0) AS PaidMismatch,
                  ISNULL(SUM(CASE WHEN ISNULL(Balance,0) <> TotalGross - Allocated THEN 1 ELSE 0 END),0)
                    AS BalanceMismatch,
                  ISNULL(SUM(CASE WHEN PaymentStatus <> 'Paid' THEN 1 ELSE 0 END),0) AS NotPaid
             FROM x`,
        );
        AssertEqual(Number(r.Orders), ORDERS, "the aggregate examined every order");
        AssertEqual(Number(r.Lines), ORDERS * 2, "and every payment line");
        AssertEqual(
          Number(r.PaidMismatch),
          0,
          "AmountPaid equals the sum of the order's payment lines EXACTLY, on all thirty",
        );
        AssertEqual(Number(r.BalanceMismatch), 0, "and Balance is the remainder, to the penny");
        AssertEqual(
          Number(r.NotPaid),
          0,
          "two payments summing to the gross close the order — a status left at PartiallyPaid puts a " +
            "settled invoice on the collections report",
        );
      }),
  },
  {
    Id: "volume.VL9",
    Name: "VL9: a real second MJ confirm blocks behind the first and reuses its released number",
    RequiresMutation: true,
    Fn: async (ctx) => {
      const f = Fx();
      const primary = await session(ctx, 0);
      const second = await session(ctx, 1);

      // EVIDENCE THAT THERE REALLY ARE TWO SESSIONS. Without it this check could pass with both
      // "sessions" being one connection, in which case the blocking it observes would be the
      // provider queueing requests on a single socket and would say nothing about the database.
      AssertEqual(
        await distinctSessionCount([primary, second]),
        2,
        "the two providers must hold two different connections, or nothing below is a concurrency test",
      );

      let held = 0;
      await withContention(
        primary,
        second,
        async () => {
          const before = await query<{ N: number }>(primary,
            `SELECT NextSequenceNumber AS N FROM ${SEQ_TABLE} WHERE ID=1`);
          held = Number(before[0]?.N);
          Assert(Number.isFinite(held), "could not read the order counter");

          // The FIRST confirm, on session 0. It takes a number and holds the counter row's
          // exclusive lock for as long as its transaction stays open — which is the whole point of
          // taking the number inside the caller's transaction (D30, and CN3 for why).
          const first = await confirmVia(primary, ctx.User, f.CoA.ID, f.Products.WidgetA);
          Assert(first.Saved, `the first confirm must succeed: ${first.Message}`);
          AssertEqual(seqOf(first.Number), held, "it took the number the counter was showing");
        },
        async () => {
          // The SECOND confirm, on a genuinely independent MJ session. `concurrency` proves this
          // much with hand-written SQL as the competing actor; this is the case its header names as
          // NOT covered — two real MJ confirms at the same moment.
          const r = await confirmVia(second, ctx.User, f.CoA.ID, f.Products.WidgetA);
          Assert(r.Saved, `the second confirm eventually has to succeed: ${r.Message}`);
          AssertEqual(
            seqOf(r.Number),
            held,
            "once the first confirm rolled back its number was free again, and the second took THAT " +
              "number — a counter incremented outside the caller's transaction would leave a hole here",
          );
        },
        "the second MJ confirm completed while the first still held the counter — two simultaneous " +
          "confirms would then take the same number, and one of them would die on the unique index",
      );
    },
  },
  {
    Id: "volume.VL10",
    Name: "VL10: the order counter serializes ACROSS companies — it is one sequence, not one per company",
    RequiresMutation: true,
    Fn: async (ctx) => {
      const f = Fx();
      const primary = await session(ctx, 0);
      const second = await session(ctx, 1);
      AssertEqual(await distinctSessionCount([primary, second]), 2, "two sessions, two connections");

      let heldNumber = "";
      await withContention(
        primary,
        second,
        async () => {
          // CoA confirms first and holds the counter. CoB then tries — a DIFFERENT company, a
          // different product, a different chart of accounts, a different journal-entry sequence
          // row. The ONE thing the two have in common is `OrderSequence`. If CoB does not wait,
          // the sequence is not global, and `ORD-000123` stops identifying one order across the
          // install — which is the whole reason an A/R document number exists.
          const first = await confirmVia(primary, ctx.User, f.CoA.ID, f.Products.WidgetA);
          Assert(first.Saved, `CoA's confirm must succeed: ${first.Message}`);
          heldNumber = first.Number;
        },
        async () => {
          const r = await confirmVia(second, ctx.User, f.CoB.ID, f.Products.WidgetB);
          Assert(r.Saved, `CoB's confirm must eventually succeed: ${r.Message}`);
          AssertEqual(
            seqOf(r.Number),
            seqOf(heldNumber),
            "CoB reuses the number CoA released — one global sequence, shared by every company",
          );

          // And waiting on a lock cost CoB nothing: its own order is complete and its own ledger
          // balances. A retry-on-timeout that quietly dropped the booking would satisfy the
          // numbering assertion above and leave an unbooked order behind.
          const l = await query<{ Entries: number; Unbalanced: number }>(second,
            `WITH e AS (
                SELECT je.ID, SUM(jel.DebitAmount) AS D, SUM(jel.CreditAmount) AS C
                  FROM ${ORDERS_SCHEMA}.OrderLine ol
                  JOIN ${ACCT_SCHEMA}.JournalEntry je ON je.ID = ol.JournalEntryID
                  JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
                 WHERE ol.OrderHeaderID = '${r.ID}'
                 GROUP BY je.ID)
             SELECT COUNT(*) AS Entries,
                    ISNULL(SUM(CASE WHEN ISNULL(D,0) <> ISNULL(C,0) THEN 1 ELSE 0 END),0) AS Unbalanced
               FROM e`);
          Assert(Number(l[0]?.Entries) > 0, "the blocked confirm still booked its journal entry");
          AssertEqual(Number(l[0]?.Unbalanced), 0, "and it balances");
        },
        "CoB's confirm ran straight through while CoA held the counter — the sequence is not shared, " +
          "so two companies can issue the same order number",
      );
    },
  },
  {
    Id: "volume.VL11",
    Name: "VL11: three sessions pricing the same product at once get identical, correct answers",
    RequiresMutation: true,
    Fn: async (ctx) => {
      const f = Fx();
      const primary = await session(ctx, 0);
      const sessions = [primary, await session(ctx, 1), await session(ctx, 2)];
      AssertEqual(
        await distinctSessionCount(sessions),
        3,
        "three providers must hold three different connections",
      );

      // THE PRICE ROWS ARE COMMITTED, deliberately, and cleaned up afterwards.
      //
      // This is the one check here that cannot use the rolled-back-transaction model. The whole
      // point is three sessions reading concurrently, and a rule written inside session 0's open
      // transaction is invisible to the others — worse, their range scan would BLOCK on it until
      // timeout. `ProductPrice` rows against fixture products are swept by the fixture teardown, so
      // the failure mode of the cleanup below is a sweepable row, not a leak.
      const listPrice = 44.44;
      const memberPrice = 33.33;
      const priceIDs: string[] = [];
      let listID = "";

      // Built through the object model like everything else, which works here BECAUSE these rows are
      // committed: createViaEntity saves on the ambient provider, and with no transaction open that
      // Save commits and is therefore visible to the other two sessions. It also puts both rules
      // through ProductPriceEntityServer's ambiguity guard — the two differ by PriceListID, which is
      // exactly the distinction the guard exists to police.
      const insert = async () => {
        priceIDs.push(await createViaEntity(ctx, PRODUCT_PRICE_ENTITY, {
          ProductID: f.Products.WidgetA,
          PricingModel: "PerUnit",
          FeeType: "Standard",
          Amount: listPrice,
          EffectiveFrom: "2020-01-01",
          Priority: 0,
          Status: "Active",
        }));
        listID = await createViaEntity(ctx, PRICE_LIST_ENTITY, {
          Code: `VL11-${randomUUID().slice(0, 6)}`,
          Name: "VL11 list",
          Status: "Active",
        });
        await createViaEntity(ctx, PRICE_LIST_ASSIGNMENT_ENTITY, {
          PriceListID: listID,
          OrganizationID: f.Customers.OrganizationID,
          Priority: 0,
          Status: "Active",
        });
        priceIDs.push(await createViaEntity(ctx, PRODUCT_PRICE_ENTITY, {
          ProductID: f.Products.WidgetA,
          PriceListID: listID,
          PricingModel: "PerUnit",
          FeeType: "Standard",
          Amount: memberPrice,
          EffectiveFrom: "2020-01-01",
          Priority: 0,
          Status: "Active",
        }));
      };
      const cleanup = async () => {
        await query(primary,
          `DELETE FROM ${ORDERS_SCHEMA}.ProductPrice WHERE ID IN ('${priceIDs.join("','")}');
           DELETE FROM ${ORDERS_SCHEMA}.PriceListAssignment WHERE PriceListID='${listID}';
           DELETE FROM ${ORDERS_SCHEMA}.PriceList WHERE ID='${listID}'`).catch(() => undefined);
      };

      await insert();
      try {
        // TWO DIFFERENT ANSWERS asked for at the same instant. The member org resolves to the price
        // list; an anonymous quote resolves to the list price. Interleaving them is what would
        // expose a resolver that cached the last answer at process scope rather than per call — and
        // a shared cache is exactly the shape `PriceResolver`, `PromotionEngine` and `ChargeEngine`
        // all have, because caching reference data in-process is the right thing everywhere else.
        const wanted = [
          { OrganizationID: f.Customers.OrganizationID, Expect: memberPrice },
          { OrganizationID: undefined, Expect: listPrice },
          { OrganizationID: f.Customers.OrganizationID, Expect: memberPrice },
        ];
        const started = Date.now();
        const results = await Promise.all(
          sessions.map((s, i) =>
            previewVia(s, ctx.User, {
              ProductID: f.Products.WidgetA,
              Quantity: 3,
              ...(wanted[i].OrganizationID ? { OrganizationID: wanted[i].OrganizationID } : {}),
            }),
          ),
        );
        console.log(`      VL11: 3 concurrent previews in ${Date.now() - started}ms`);

        for (let i = 0; i < results.length; i++) {
          Assert(results[i].Success, `preview ${i} failed: ${results[i].Message}`);
          AssertEqual(
            Number(results[i].UnitPrice),
            wanted[i].Expect,
            `session ${i} asked for ${wanted[i].OrganizationID ? "the member price" : "the list price"} ` +
              `and must get it even though another session was asking for the other one at the same moment`,
          );
          AssertEqual(
            Number(results[i].ExtendedAmount),
            Math.round(wanted[i].Expect * 3 * 100) / 100,
            `session ${i}'s extended amount`,
          );
        }

        // And the SAME question asked concurrently by every session gives one answer, three times.
        const same = await Promise.all(
          sessions.map((s) =>
            previewVia(s, ctx.User, {
              ProductID: f.Products.WidgetA,
              Quantity: 7,
              OrganizationID: f.Customers.OrganizationID,
            }),
          ),
        );
        const distinct = new Set(same.map((r) => `${r.UnitPrice}/${r.ExtendedAmount}/${r.ResolvedBy}`));
        AssertEqual(
          distinct.size,
          1,
          `three sessions pricing the same line concurrently produced ${distinct.size} different ` +
            `answers: ${[...distinct].join(" | ")}`,
        );
        AssertEqual(Number(same[0].UnitPrice), memberPrice, "and it is the right one");
      } finally {
        await cleanup();
      }
    },
  },
  {
    Id: "volume.VL12",
    Name: "VL12: re-saving 25 already-confirmed orders re-books none of them",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await addPrice(ctx, f.Products.WidgetA, 19.99);
        const COUNT = 25;

        const ids: string[] = [];
        for (let i = 0; i < COUNT; i++) {
          const r = await ConfirmOrder(ctx.User, {
            CompanyID: f.CoA.ID,
            BillToOrganizationID: f.Customers.OrganizationID,
            Lines: [{ ProductID: f.Products.WidgetA, Quantity: (i % 3) + 1 }],
          });
          Assert(r.Saved, `order ${i + 1} failed: ${r.Message}`);
          ids.push(r.Order.ID as string);
        }
        const fingerprint = async () =>
          (await TxQuery<{ ID: string; JE: string | null; N: string }>(ctx,
            `SELECT ol.ID, ol.JournalEntryID AS JE, h.OrderNumber AS N
               FROM ${ORDERS_SCHEMA}.OrderLine ol
               JOIN ${ORDERS_SCHEMA}.OrderHeader h ON h.ID = ol.OrderHeaderID
              WHERE ol.OrderHeaderID IN (${idList(ids)})
              ORDER BY ol.ID`))
            .map((r) => `${r.ID}:${r.JE}:${r.N}`)
            .join("|");
        const entriesOf = async () =>
          Number((await TxOne<{ N: number }>(ctx,
            `SELECT COUNT(DISTINCT ol.JournalEntryID) AS N FROM ${ORDERS_SCHEMA}.OrderLine ol
              WHERE ol.OrderHeaderID IN (${idList(ids)}) AND ol.JournalEntryID IS NOT NULL`)).N);

        const beforeFingerprint = await fingerprint();
        const beforeEntries = await entriesOf();
        Assert(beforeFingerprint.length > 0, "there are lines to fingerprint");
        Assert(beforeEntries >= COUNT, `every order booked — ${beforeEntries} entries for ${COUNT} orders`);

        // A REAL second save, on a FRESHLY LOADED order — the path a user actually takes when they
        // add a note to something already confirmed. Loading rather than reusing the entity from
        // the confirm matters: the transient `Lines` collection is what makes the first save a
        // booking save, and a loaded order has none, which is exactly the state the application is
        // in when somebody edits an existing order.
        //
        // Booking keys off `ConfirmedAt`, so this must update the row and re-book nothing. The
        // failure it prevents is DOUBLE REVENUE, and nothing on the order itself would show it.
        const provider = ctx.Provider as unknown as IMetadataProvider;
        const started = Date.now();
        for (let i = 0; i < ids.length; i++) {
          const again = await provider.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(
            ORDER_HEADER_ENTITY,
            CompositeKey.FromID(ids[i]),
            ctx.User,
          );
          again.Notes = `re-saved by VL12 (${i})`;
          Assert(
            await again.Save(),
            `the re-save of order ${i + 1} must succeed: ${again.LatestResult?.CompleteMessage ?? "no reason given"}`,
          );
        }
        logTiming("VL12 re-save", COUNT, Date.now() - started);

        AssertEqual(
          await entriesOf(),
          beforeEntries,
          "not one extra journal entry — a second confirm that re-booked would double the revenue " +
            "of every order it touched, and nothing on the order would show it",
        );
        AssertEqual(
          await fingerprint(),
          beforeFingerprint,
          "every line still points at the same entry and every order still carries the same number",
        );
        const notes = await TxOne<{ N: number }>(ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderHeader
            WHERE ID IN (${idList(ids)}) AND Notes LIKE 're-saved by VL12%'`);
        AssertEqual(
          Number(notes.N),
          COUNT,
          "and the edit DID persist — otherwise this check passes by having saved nothing at all",
        );
      }),
  },
  {
    Id: "volume.VL13",
    Name: "VL13: one order of 60 lines books 60 balanced entries and allocates one promotion across all of them",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        await grantNexus(ctx, ["CA", "CA-SANTACLARA"]);
        await addPrice(ctx, f.Products.WidgetA, 19.99);
        const LINES = 60;
        // 10.01 across 60 unequal lines: no share divides, several round to a penny, and the total
        // is the only clean number in the calculation.
        const code = await addPromotion(ctx, { value: 10.01 });

        // DEEP rather than WIDE. VL1–VL4 put the volume in the number of orders, which exercises
        // the per-order loop; this puts it in one order, which exercises everything that allocates
        // ACROSS lines — promotion shares, charge shares, tax per line, one entry per line.
        const lines: LineSpec[] = Array.from({ length: LINES }, (_, i) => ({
          ProductID: f.Products.WidgetA,
          Quantity: (i % 7) + 1,
        }));
        const started = Date.now();
        const order = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          ShipToAddressID: f.Tax.AddressIDs.get("SantaClara"),
          Lines: lines,
          PromotionCodes: [code],
          Charges: [{ Code: "Shipping", Amount: 7.77 }],
        });
        console.log(`      VL13: one ${LINES}-line order in ${Date.now() - started}ms`);
        Assert(order.Saved, `confirm failed: ${order.Message}`);
        const id = order.Order.ID as string;

        const t = await headerVsLines(ctx, [id]);
        AssertEqual(Number(t.Lines), LINES, `all ${LINES} lines persisted`);
        AssertEqual(Number(t.GrossMismatch), 0, "the header agrees with sixty lines");
        AssertEqual(Number(t.FormulaMismatch), 0, "gross = net + tax + charges");

        const l = await ledgerAcross(ctx, [id]);
        AssertEqual(
          Number(l.Entries),
          LINES,
          "one journal entry per line, even at sixty — an engine that batched them would lose the " +
            "line-level lineage every reversal depends on",
        );
        AssertEqual(Number(l.Unbalanced), 0, "and every one of the sixty balances");
        AssertEqual(Number(l.UnbookedLines), 0, "no line left unbooked");

        const p = await promotionParityAcross(ctx, [id]);
        AssertEqual(Number(p.Orders), 1, "the promotion applied");
        Assert(
          Number(p.Shares) > 1,
          `a 10.01 order promotion must be SPLIT across the sixty lines, not parked on one — ` +
            `${p.Shares} share(s)`,
        );
        AssertEqual(Number(p.Mismatched), 0, "the shares sum to the discount the lines carry");
        AssertEqual(Number(p.NonPositiveShares), 0, "and none of the sixty shares is zero or negative");

        const c = await chargeParityAcross(ctx, [id]);
        Assert(Number(c.Charges) > 0, "the shipping charge and the county tax exist");
        AssertEqual(Number(c.Unallocated), 0, "every charge is fully allocated across sixty lines");
        AssertEqual(Number(c.WrongSign), 0, "with no share of the wrong sign");
      }),
  },
];

for (const check of VolumeChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("volume", {
  Setup: async (ctx) => { await CreateOrdersFixture(ctx); },
  Teardown: async (ctx) => {
    // The extra MJ sessions share the driver's connection pool, so there is nothing to close —
    // but they must not survive into another bundle's fixture, whose companies and GL links they
    // would be holding stale metadata for.
    extraSessions.length = 0;
    await TeardownOrdersFixture(ctx);
  },
});
