/**
 * Orders.SpawnRenewals — place the renewal orders that are due (plan D55).
 *
 * The last piece of the subscription lifecycle. `AutoRenew` and `RenewalLeadDays` were columns with
 * no consumer: a subscription would reach the end of its term and simply stop, with nothing to
 * continue it.
 *
 * THE DESIGN QUESTION THIS ANSWERS
 * "Is a renewal an order the customer approves, or one the system places for them?" — BOTH, and
 * `AutoRenew` is the switch. `AutoRenew = true` means the customer has already consented to
 * recurring billing, so the system places a CONFIRMED order: it books, it invoices, and coverage
 * continues without a gap. `AutoRenew = false` means it does not renew, full stop — this operation
 * skips it and the term simply ends. Reminder-and-approve for the second case is a communication
 * flow, not a booking one, and does not belong here.
 *
 * The order is placed at LEAD TIME, not on the expiry date, which is how subscription billing
 * actually works: the invoice goes out before the period it covers. The order carries a one-row
 * payment schedule due on the pass's day, so under D92 the receivable is raised by that instalment's
 * invoice, dated when it is issued, not on the term start (#305). Revenue is not affected — the
 * invoice credits Deferred Revenue and the recognition entries are dated into the new term's own
 * window (D14).
 *
 * IDEMPOTENCY, which a scheduled job makes non-negotiable
 * Two independent guards, because this runs unattended and a double-spawn double-bills a customer:
 *   1. the SELECTION only finds subscriptions whose LATEST term ends inside the window — once a
 *      renewal is booked, term N+1 exists and the subscription no longer qualifies;
 *   2. an explicit check for a live renewal line that has not yet produced a term — one drafted or
 *      quoted by hand for this cycle. Earlier cycles' renewals each booked a term, so they do not
 *      count, and a subscription keeps renewing cycle after cycle.
 * Running the operation twice in a row is a no-op, and that is asserted by the check suite.
 *
 * WHAT IT RENEWS AT (golive #304)
 * Not what the customer last paid. A first-term discount lapses, a product with a successor renews
 * as the successor at its own list price, and an annual increase applies when the new term crosses
 * an anniversary of the subscription's start: `PriceRenewal` in orders-entities decides, and this
 * operation gathers its inputs. The increase is the subscription's `RenewalIncreasePercent`, else the
 * product's, else the nearest category's, else the company's `OrderCompanyPolicy`. The price and how
 * it was reached are reported on every candidate, preview included, written into the order's notes
 * and logged on the renewal event, so the figure can be checked before a live pass books it.
 *
 * CONNECTS TO:
 *   BOOKING: OrderEntityServer.Save — the renewal order goes through the ordinary confirm path,
 *            so extension, term creation, GL resolution and recognition are all the SAME code
 *   POLICY:  SubscriptionBehavior (IsRenewal bypasses ConcurrencyMode — a renewal is not a second
 *            concurrent subscription, it is this one continuing)
 *   PRICING: orders-entities PriceRenewal / ResolveRenewalIncrease / RenewalCrossesAnniversary
 *   TABLES:  __mj_BizAppsOrders.{Subscription,SubscriptionTerm,SubscriptionType,OrderHeader,OrderLine,OrderHeaderPaymentSchedule,
 *            Product,ProductCategory,OrderCompanyPolicy}
 */
import {
    BaseEntity,
    BaseRemotableOperation,
    DatabaseProviderBase,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    AsDateValue,
    BuildLinePriceContext,
    PriceRenewal,
    RenewalCrossesAnniversary,
    ResolvePrice,
    ResolveRenewalIncrease,
    type PricedLineFacts,
    type RenewalPrice,
    mjBizAppsOrdersOrderHeaderPaymentScheduleEntity,
    mjBizAppsOrdersOrderLineEntity,
    mjBizAppsOrdersSubscriptionEventEntity,
} from '@mj-biz-apps/orders-entities';
import type { OrderEntityServer } from './OrderEntityServer.js';
import { RequireOptionalDay, RequireOptionalUUID } from './sql-guards.js';
import { CalendarDayOrToday } from './calendar-day.js';
import { MarkAsOrdersOwnWrite } from './OrderLineEntityServer.js';
import { RenewalDueDate, RenewalScheduleRows } from './PaymentScheduleBehavior.js';
import { ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY } from './entity-names.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SUBSCRIPTION_TYPE_ENTITY = 'MJ_BizApps_Orders: Subscription Types';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const ORDER_LINE_CHOICE_ENTITY = 'MJ_BizApps_Orders: Order Line Choices';
const ORDER_COMPANY_POLICY_ENTITY = 'MJ_BizApps_Orders: Order Company Policies';

export interface SpawnRenewalsInput {
    /** Treat this as "today". Defaults to now. */
    AsOfDate?: Date | string;
    /** Restrict to one subscription — for a targeted retry, or for a test. */
    SubscriptionID?: string;
    /** Report what WOULD be placed, without placing anything. */
    Preview?: boolean;
    /**
     * Cap on orders placed in one pass. A safety valve for the first production run, where a
     * mis-set lead time could otherwise invoice an entire book of business at once.
     */
    MaxCount?: number;
}

export interface RenewalCandidate {
    SubscriptionID: string;
    SubscriptionNumber: string;
    ProductID: string;
    /** End of the term that is expiring. */
    CurrentTermEnd: string;
    /** Lead days actually applied, after the subscription's override of the type's default. */
    LeadDays: number;
    /** Set when the renewal was placed (absent on a preview, or when placing failed). */
    OrderID?: string;
    OrderNumber?: string;
    /** Set when this candidate was skipped, with the reason. */
    SkippedReason?: string;
    /** The product the renewal is placed on: the subscription's own, or its successor. */
    RenewalProductID?: string;
    /** The renewal's unit price before the increase. */
    BasePrice?: number;
    /** Where the base price came from: the prior term's price, its list price, or the successor's list. */
    BasePriceSource?: 'PriorPrice' | 'PriorList' | 'SuccessorList';
    /** The increase applied, in percent: 0 when none is set or the new term crosses no anniversary. */
    IncreasePercent?: number;
    /** The level the increase was set at. */
    IncreaseSource?: 'Subscription' | 'Product' | 'Category' | 'Company' | 'None';
    /** The renewal line's unit price: the base plus the increase. */
    UnitPrice?: number;
    /** The renewal line's discount, as a fraction: 0 unless the subscription carries its discount into renewals. */
    DiscountPct?: number;
}

export interface SpawnRenewalsOutput {
    Success: boolean;
    Message?: string;
    /** Every subscription considered due, whether or not an order was placed. */
    Candidates: RenewalCandidate[];
    Placed: number;
    Skipped: number;
}

interface DueRow {
    SubscriptionID: string;
    SubscriptionNumber: string;
    CompanyID: string;
    ProductID: string;
    HolderOrganizationID: string | null;
    BeneficiaryPersonID: string | null;
    SubscriptionRenewalLeadDays: number | null;
    TypeRenewalLeadDays: number | null;
    TermID: string;
    TermNumber: number;
    TermStartDate: string;
    TermEndDate: string;
    OrderLineID: string;
    SubscriptionStartDate: string;
    SubscriptionIncreasePercent: number | null;
    CarryDiscountOnRenewal: boolean;
}

interface SourceLineRow {
    ID: string;
    OrderHeaderID: string;
    ProductID: string;
    Quantity: number;
    UnitPrice: number;
    DiscountPct: number | null;
    PriceOverridden: boolean;
    ProductPriceID: string | null;
}

/** A product on the subscription's successor chain, the subscription's own product first. */
interface ChainProductRow {
    ID: string;
    Name: string;
    Status: string;
    ProductCategoryID: string;
    RenewalIncreasePercent: number | null;
    SuccessorProductID: string | null;
}

/** What `priceRenewal` decided: the product, quantity and price the renewal line is written with. */
interface PricedRenewal {
    ProductID: string;
    ProductName: string;
    MovesToSuccessor: boolean;
    Quantity: number;
    Price: RenewalPrice;
}

@RegisterClass(BaseRemotableOperation, 'Orders.SpawnRenewals')
export class SpawnRenewalsOperation extends BaseRemotableOperation<SpawnRenewalsInput, SpawnRenewalsOutput> {
    public OperationKey = 'Orders.SpawnRenewals';

    protected async InternalExecute(
        input: SpawnRenewalsInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<SpawnRenewalsOutput> {
        // Caller-supplied ids reach SQL filter text downstream. Validated here,
        // at the boundary, so every frame below this one can trust them.
        RequireOptionalUUID(input.SubscriptionID, 'SubscriptionID');

        // "Due" is decided against `date` columns, so the as-of value is a calendar day (#209):
        // an instant answers the UTC day, and an evening run would spawn tomorrow's renewals a day
        // early. Validated at the boundary like the id above, because a renewal pass silently run
        // for today when the caller named another day places real orders. That covers an invalid
        // `Date` as much as a malformed string (#272).
        try {
            RequireOptionalDay(input.AsOfDate, 'AsOfDate');
        } catch (e) {
            return { Success: false, Message: String((e as Error).message), Candidates: [], Placed: 0, Skipped: 0 };
        }
        const asOf = await CalendarDayOrToday(input.AsOfDate, provider, user);
        const candidates = await this.findDue(provider, user, asOf, input.SubscriptionID);

        const out: SpawnRenewalsOutput = { Success: true, Candidates: [], Placed: 0, Skipped: 0 };
        const limit = input.MaxCount ?? Number.MAX_SAFE_INTEGER;
        /**
         * Orders this pass has committed to: PLACED on a live pass, WOULD-place on a preview.
         *
         * Counted separately from `Placed` because the cap has to bind identically in both modes.
         * Keyed on `Placed`, it never binds on a preview — `Placed` stays 0 — so the preview
         * enumerates every due subscription while the live pass stops at the cap, and the list a
         * person confirms at the go-live gate is not the list the first live pass produces. A
         * candidate the idempotency guard rejects does not consume the cap: nothing was placed.
         */
        let committed = 0;

        for (const due of candidates) {
            if (committed >= limit) break;

            const candidate: RenewalCandidate = {
                SubscriptionID: due.SubscriptionID,
                SubscriptionNumber: due.SubscriptionNumber,
                ProductID: due.ProductID,
                CurrentTermEnd: due.TermEndDate,
                LeadDays: due.SubscriptionRenewalLeadDays ?? due.TypeRenewalLeadDays ?? 0,
            };
            out.Candidates.push(candidate);

            // Second idempotency guard — see the header. Cheap, and it is the one that saves a
            // customer from being billed twice if a prior pass half-completed.
            if (await this.alreadyRenewed(provider, user, due)) {
                candidate.SkippedReason = 'a renewal order already exists for this term';
                out.Skipped++;
                continue;
            }

            // Priced on a preview too: the preview is where a person checks the figure before a live
            // pass books it. A candidate that cannot be priced is skipped with the reason, and does
            // not consume the cap.
            let priced: PricedRenewal;
            try {
                priced = await this.priceRenewal(provider, user, due);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                LogError(`Orders.SpawnRenewals: ${due.SubscriptionNumber} could not be priced: ${message}`);
                candidate.SkippedReason = message;
                out.Skipped++;
                continue;
            }
            candidate.RenewalProductID = priced.ProductID;
            candidate.BasePrice = priced.Price.BasePrice;
            candidate.BasePriceSource = priced.Price.BaseSource;
            candidate.IncreasePercent = priced.Price.IncreasePercent;
            candidate.IncreaseSource = priced.Price.IncreaseSource;
            candidate.UnitPrice = priced.Price.UnitPrice;
            candidate.DiscountPct = priced.Price.DiscountPct;

            if (input.Preview) {
                out.Skipped++;
                committed++;
                continue;
            }

            try {
                const order = await this.placeRenewal(provider, user, due, priced, asOf.toISOString().slice(0, 10));
                candidate.OrderID = order.ID;
                candidate.OrderNumber = order.Number;
                out.Placed++;
                committed++;
            } catch (err) {
                // One subscription's failure must not stop the batch — an unattended job that
                // aborts on the first bad row silently stops renewing everyone behind it.
                const message = err instanceof Error ? err.message : String(err);
                LogError(`Orders.SpawnRenewals: ${due.SubscriptionNumber} failed: ${message}`);
                candidate.SkippedReason = message;
                out.Skipped++;
            }
        }

        out.Message =
            `${out.Candidates.length} subscription(s) due as of ${asOf.toISOString().slice(0, 10)}; ` +
            `${out.Placed} renewal order(s) placed, ${out.Skipped} skipped.`;
        return out;
    }

    /**
     * Subscriptions whose latest term expires within their effective lead window.
     *
     * Raw SQL rather than RunView because the selection is inherently a JOIN across four tables with
     * a "latest term per subscription" window — expressible in one statement and awkward as several
     * round trips. `RenewalLeadDays` falls back from the subscription to its type, which is the
     * inheritance rule the schema documents.
     */
    private async findDue(
        provider: IMetadataProvider,
        user: UserInfo,
        asOf: Date,
        subscriptionID?: string,
    ): Promise<DueRow[]> {
        const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
        const asOfDate = asOf.toISOString().slice(0, 10);
        const only = subscriptionID ? `AND s.ID = '${subscriptionID}'` : '';

        const rows = (await db.ExecuteSQL(`
            WITH latest AS (
                SELECT st.*, ROW_NUMBER() OVER (PARTITION BY st.SubscriptionID ORDER BY st.TermNumber DESC) AS rn
                FROM __mj_BizAppsOrders.SubscriptionTerm st
            )
            SELECT
                s.ID                  AS SubscriptionID,
                s.SubscriptionNumber,
                s.CompanyID,
                s.ProductID,
                s.HolderOrganizationID,
                s.BeneficiaryPersonID,
                s.RenewalLeadDays     AS SubscriptionRenewalLeadDays,
                t.RenewalLeadDays     AS TypeRenewalLeadDays,
                s.StartDate           AS SubscriptionStartDate,
                s.RenewalIncreasePercent AS SubscriptionIncreasePercent,
                s.CarryDiscountOnRenewal,
                l.ID                  AS TermID,
                l.TermNumber,
                l.StartDate           AS TermStartDate,
                l.EndDate             AS TermEndDate,
                l.OrderLineID
            FROM __mj_BizAppsOrders.Subscription s
            JOIN __mj_BizAppsOrders.SubscriptionType t ON t.ID = s.SubscriptionTypeID
            JOIN latest l ON l.SubscriptionID = s.ID AND l.rn = 1
            WHERE s.AutoRenew = 1
              AND s.Status IN ('Active','Trialing')
              AND l.Status IN ('Scheduled','Active')
              -- Due when the expiry falls inside the lead window. The lower bound keeps a long-
              -- lapsed subscription from being silently revived months later by a routine pass.
              AND l.EndDate >= DATEADD(DAY, -1, '${asOfDate}')
              AND l.EndDate <= DATEADD(DAY, COALESCE(s.RenewalLeadDays, t.RenewalLeadDays, 0), '${asOfDate}')
              ${only}
            ORDER BY l.EndDate, s.SubscriptionNumber
        `)) as DueRow[];

        return Array.isArray(rows) ? rows : [];
    }

    /**
     * True when a renewal order for this cycle already exists.
     *
     * A subscription renews many times over its life, so a line with `RenewsSubscriptionID` is not
     * by itself this cycle's renewal. Every earlier cycle's renewal booked a term that names its
     * line (`SubscriptionTerm.OrderLineID`), and `findDue` has already chosen the latest term, so
     * this cycle's renewal, if one exists, is a live line that has produced no term: drafted or
     * quoted by hand and not yet confirmed. Placing another beside it would bill the customer
     * twice. A voided order renews nothing and does not count.
     */
    private async alreadyRenewed(provider: IMetadataProvider, user: UserInfo, due: DueRow): Promise<boolean> {
        const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
        const pending = (await db.ExecuteSQL(`
            SELECT TOP 1 ol.ID
            FROM __mj_BizAppsOrders.OrderLine ol
            JOIN __mj_BizAppsOrders.OrderHeader oh ON oh.ID = ol.OrderHeaderID
            WHERE ol.RenewsSubscriptionID = '${due.SubscriptionID}'
              AND oh.Status <> 'Voided'
              AND NOT EXISTS (SELECT 1 FROM __mj_BizAppsOrders.SubscriptionTerm st WHERE st.OrderLineID = ol.ID)
        `)) as unknown[];
        return Array.isArray(pending) && pending.length > 0;
    }

    /**
     * Place the renewal as an ordinary confirmed order.
     *
     * Deliberately NOT a special write path: routing it through `OrderEntityServer.Save` means the
     * extension, the new term, GL resolution, the recognition schedule and the all-or-none
     * guarantee are the same code that handles a customer purchase. A bespoke renewal writer would
     * be a second implementation of booking, drifting from the first.
     *
     * `invoiceDay` is the pass's as-of day, `YYYY-MM-DD`: the renewal invoice date. The one-row
     * schedule the order carries is due that day plus the customer's terms, capped at the order date (#305).
     */
    private async placeRenewal(
        provider: IMetadataProvider,
        user: UserInfo,
        due: DueRow,
        priced: PricedRenewal,
        invoiceDay: string,
    ): Promise<{ ID: string; Number: string }> {
        const dbProvider = provider as unknown as DatabaseProviderBase;
        await dbProvider.BeginTransaction();
        try {
            const order = await provider.GetEntityObject<OrderEntityServer>(ORDER_HEADER_ENTITY, user);
            order.NewRecord();
            order.OrderType = 'Sale';
            // Dated the day AFTER the expiring term, so the new term starts where the old one ends
            // and the ledger shows the sale in the period it belongs to — not on the day the job
            // happened to run.
            order.OrderDate = this.dayAfter(due.TermEndDate);
            order.CompanyID = due.CompanyID;
            order.BillToOrganizationID = due.HolderOrganizationID;
            order.BillToPersonID = due.BeneficiaryPersonID;
            order.Notes = this.renewalNotes(due, priced);

            const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
            // Orders writing its own line. An app that froze this line freezes what a PERSON
            // may change, not Orders closing its own books (#206 item 1).
            MarkAsOrdersOwnWrite(line);
            line.NewRecord();
            // The successor when the subscription moves to one; booking then moves the subscription
            // onto it (OrderEntityServer.touchExistingSubscription).
            line.ProductID = priced.ProductID;
            line.LineNumber = 1;
            // Per-LINE (D61): renewal is a line-level act, so one order could renew several
            // subscriptions. Naming the target also removes the guesswork from resolution — the
            // engine renews exactly this one rather than searching by subscriber and product.
            line.RenewsSubscriptionID = due.SubscriptionID;
            // The subscription's own subscriber, carried onto the line's ship-to so the renewal
            // lands on the same holder even when the order's customer differs.
            line.ShipToOrganizationID = due.HolderOrganizationID;
            line.ShipToPersonID = due.BeneficiaryPersonID;
            // What `priceRenewal` decided (golive #304). Stated on the line, so pricing keeps it rather
            // than resolving today's list price. It is the pass's own deliberate price, not a typed
            // concession, so the order is told which lines it priced: the concession gate and the
            // below-engine review leave them alone while their price is unchanged.
            line.Quantity = priced.Quantity;
            line.UnitPrice = priced.Price.UnitPrice;
            line.DiscountPct = priced.Price.DiscountPct;
            order.MarkRenewalPriced(line);

            // Attached rather than assigned — see the note in CancelSubscriptionOperation.
            order.Lines.Add(line);

            // The buyer's choices carry forward (#291). A conditional entitlement is granted only on a
            // line that carries its choice, so a renewal without them would silently drop the access
            // the buyer chose. They ride in the line's graph and save with the draft.
            for (const choice of await this.loadSourceChoices(provider, user, due.OrderLineID)) {
                const row = await line.Choices.Create();
                row.GroupKey = choice.GroupKey;
                row.GroupLabel = choice.GroupLabel;
                row.OptionValue = choice.OptionValue;
                row.OptionLabel = choice.OptionLabel;
            }

            // DRAFT FIRST, THEN THE SCHEDULE, THEN CONFIRM (#305). The renewal is invoiced on the day
            // this pass runs, not on its term start, so it carries a one-row schedule due today and
            // D92 books it that way: no AR at confirm, and the instalment — due on or before the
            // order date — is issued inside the same confirm, dated when it is issued. The row must
            // tie to the line's gross, and that gross exists only once pricing has written the line,
            // which is what the draft save does. All of it sits in this transaction.
            order.Status = 'Draft';
            if (!(await order.Save())) {
                throw new Error(
                    `Failed to save the renewal order as a draft: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
            // Due on the invoice day plus the customer's terms, capped at the order date (#305
            // review). `resolveDueDate` is the confirm's own terms walk, run now so the row can use
            // it; confirm then sees the date already set and leaves it.
            await order.resolveDueDate();
            const rowDueDate = RenewalDueDate(invoiceDay, order.OrderDate, order.DueDate);
            await this.addRenewalSchedule(provider, user, order.ID, String(order.CompanyID), order.Lines.Items, rowDueDate);

            order.Status = 'Confirmed';
            if (!(await order.Save())) {
                throw new Error(
                    `Failed to book renewal order ${order.OrderNumber} of ${due.SubscriptionNumber}: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }

            await this.logEvent(provider, user, due, priced, order.ID);
            await dbProvider.CommitTransaction();
            return { ID: order.ID, Number: order.OrderNumber };
        } catch (err) {
            try {
                await dbProvider.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Rollback failed after renewal spawn error: ${rollbackErr}`);
            }
            throw err;
        }
    }

    /** Write the renewal's one-row schedule, from the order's company, due on `dueDate`. */
    private async addRenewalSchedule(
        provider: IMetadataProvider,
        user: UserInfo,
        orderID: string,
        orderCompanyID: string,
        lines: readonly mjBizAppsOrdersOrderLineEntity[],
        dueDate: string,
    ): Promise<void> {
        const drafts = RenewalScheduleRows(
            lines.map((l) => ({ CompanyID: String(l.CompanyID), LineTotalGross: Number(l.LineTotalGross ?? 0) })),
            dueDate,
            orderCompanyID,
        );
        for (const draft of drafts) {
            const row = await provider.GetEntityObject<mjBizAppsOrdersOrderHeaderPaymentScheduleEntity>(
                ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
                user,
            );
            row.NewRecord();
            row.OrderHeaderID = orderID;
            row.CompanyID = draft.CompanyID;
            row.InstallmentNumber = draft.InstallmentNumber;
            row.DueDate = new Date(`${draft.DueDate}T00:00:00Z`);
            row.Amount = draft.Amount;
            row.Status = 'Scheduled';
            if (!(await row.Save())) {
                throw new Error(
                    `Failed to write the renewal's payment schedule: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
    }

    /**
     * What the renewal line is written with: product, quantity and price (golive #304).
     *
     * Read-only, so a preview runs it too. Throws with a reason a person can act on when the
     * renewal cannot be priced; the caller skips that candidate.
     */
    private async priceRenewal(provider: IMetadataProvider, user: UserInfo, due: DueRow): Promise<PricedRenewal> {
        const source = await this.loadSourceLine(provider, user, due.OrderLineID);
        if (!source) {
            throw new Error(
                `The order line that bought term ${due.TermNumber} (${due.OrderLineID}) no longer exists, ` +
                    `so there is no price to renew at.`,
            );
        }

        const chain = await this.loadSuccessorChain(provider, due.ProductID);
        const product = chain[chain.length - 1];
        const movesToSuccessor = chain.length > 1;
        const quantity = this.renewalQuantity(source);
        const renewalDay = this.dayAfter(due.TermEndDate);
        const carry = !!due.CarryDiscountOnRenewal;

        // A list price is resolved only where the rule needs one: the successor's as of the renewal
        // day, or the prior product's as of the prior order when a price typed below it may lapse.
        const successorList = movesToSuccessor
            ? await this.listPrice(provider, user, { ...source, ProductID: product.ID, Quantity: quantity, UnitPrice: null, ProductPriceID: null }, renewalDay)
            : undefined;
        const priorList =
            !movesToSuccessor && source.PriceOverridden && !carry
                ? await this.listPrice(provider, user, { ...source, Quantity: quantity }, null)
                : null;

        const increase = ResolveRenewalIncrease({
            Subscription: due.SubscriptionIncreasePercent,
            Product: product.RenewalIncreasePercent,
            Categories: await this.loadCategoryIncreases(provider, product.ProductCategoryID),
            Company: await this.loadCompanyIncrease(provider, user, due.CompanyID),
        });

        let price: RenewalPrice;
        try {
            price = PriceRenewal({
                PriorUnitPrice: Number(source.UnitPrice),
                PriorDiscountPct: source.DiscountPct,
                PriorPriceOverridden: !!source.PriceOverridden,
                PriorListPrice: priorList,
                SuccessorListPrice: successorList,
                CarryDiscount: carry,
                Increase: increase,
                ApplyIncrease: RenewalCrossesAnniversary(due.SubscriptionStartDate, due.TermStartDate, renewalDay),
            });
        } catch (err) {
            throw new Error(
                `${due.SubscriptionNumber} moves to ${product.Name} at renewal, but ` +
                    `${err instanceof Error ? err.message : String(err)}. Add a price for ${product.Name}.`,
            );
        }

        return { ProductID: product.ID, ProductName: product.Name, MovesToSuccessor: movesToSuccessor, Quantity: quantity, Price: price };
    }

    /**
     * The subscription's product followed along `SuccessorProductID` while the next product is
     * Active: a successor that is still a draft, or already retired, is not one to renew onto.
     * The subscription's own product comes first; the last entry is what the renewal is placed on.
     */
    private async loadSuccessorChain(provider: IMetadataProvider, productID: string): Promise<ChainProductRow[]> {
        const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
        const rows = (await db.ExecuteSQL(`
            WITH chain AS (
                SELECT p.ID, p.Name, p.Status, p.ProductCategoryID, p.RenewalIncreasePercent, p.SuccessorProductID, 0 AS Depth
                FROM __mj_BizAppsOrders.Product p
                WHERE p.ID = '${productID}'
                UNION ALL
                SELECT n.ID, n.Name, n.Status, n.ProductCategoryID, n.RenewalIncreasePercent, n.SuccessorProductID, c.Depth + 1
                FROM chain c
                JOIN __mj_BizAppsOrders.Product n ON n.ID = c.SuccessorProductID
                WHERE c.Depth < 20 AND n.Status = 'Active'
            )
            SELECT ID, Name, Status, ProductCategoryID, RenewalIncreasePercent, SuccessorProductID
            FROM chain
            ORDER BY Depth
        `)) as ChainProductRow[];
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error(`The subscription's product (${productID}) no longer exists, so there is nothing to renew.`);
        }

        // Successors that loop back would otherwise walk to the depth cap; stop at the first repeat.
        const seen = new Set<string>();
        const chain: ChainProductRow[] = [];
        for (const row of rows) {
            const key = String(row.ID).toLowerCase();
            if (seen.has(key)) break;
            seen.add(key);
            chain.push(row);
        }
        return chain;
    }

    /** `RenewalIncreasePercent` of a category and each ancestor, the category itself first. */
    private async loadCategoryIncreases(provider: IMetadataProvider, categoryID: string | null): Promise<Array<number | null>> {
        if (!categoryID) return [];
        const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
        const rows = (await db.ExecuteSQL(`
            WITH chain AS (
                SELECT c.ID, c.ParentProductCategoryID, c.RenewalIncreasePercent, 0 AS Depth
                FROM __mj_BizAppsOrders.ProductCategory c
                WHERE c.ID = '${categoryID}'
                UNION ALL
                SELECT p.ID, p.ParentProductCategoryID, p.RenewalIncreasePercent, ch.Depth + 1
                FROM chain ch
                JOIN __mj_BizAppsOrders.ProductCategory p ON p.ID = ch.ParentProductCategoryID
                WHERE ch.Depth < 20
            )
            SELECT RenewalIncreasePercent FROM chain ORDER BY Depth
        `)) as Array<{ RenewalIncreasePercent: number | null }>;
        return Array.isArray(rows) ? rows.map((r) => (r.RenewalIncreasePercent == null ? null : Number(r.RenewalIncreasePercent))) : [];
    }

    /** The selling company's `OrderCompanyPolicy.RenewalIncreasePercent`; null when it has no policy row. */
    private async loadCompanyIncrease(provider: IMetadataProvider, user: UserInfo, companyID: string): Promise<number | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<{ RenewalIncreasePercent: number | null }>(
            {
                EntityName: ORDER_COMPANY_POLICY_ENTITY,
                ExtraFilter: `ID='${companyID}'`,
                Fields: ['RenewalIncreasePercent'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        const value = result?.Results?.[0]?.RenewalIncreasePercent;
        return value == null ? null : Number(value);
    }

    /**
     * What the pricing engine charges for `line`'s product, for the customer on `line`'s order. As of
     * that order's date, or as of `asOf` when given. Null when no rule prices the product.
     */
    private async listPrice(
        provider: IMetadataProvider,
        user: UserInfo,
        line: PricedLineFacts,
        asOf: Date | null,
    ): Promise<number | null> {
        const ctx = await BuildLinePriceContext(line, provider, user);
        if (!ctx) return null;
        if (asOf) ctx.AsOf = AsDateValue(asOf) ?? ctx.AsOf;
        const resolved = await ResolvePrice(ctx, provider, user);
        return resolved ? Number(resolved.UnitPrice) : null;
    }

    /** The renewal order's notes: what it renews, and how its price was reached. */
    private renewalNotes(due: DueRow, priced: PricedRenewal): string {
        const p = priced.Price;
        const money = (n: number) => n.toFixed(2);
        const base = { PriorPrice: 'prior price', PriorList: 'prior list price', SuccessorList: 'list price' }[p.BaseSource];
        const parts = [`Automatic renewal of ${due.SubscriptionNumber} (term ${due.TermNumber + 1})`];
        if (priced.MovesToSuccessor) parts.push(`onto successor product ${priced.ProductName}`);
        const increase = p.IncreasePercent > 0 ? ` + ${p.IncreasePercent}% annual increase (${p.IncreaseSource.toLowerCase()})` : '';
        const discount = p.DiscountPct > 0 ? `, discount ${Math.round(p.DiscountPct * 10000) / 100}% continued` : '';
        return `${parts.join(' ')}. Unit price ${money(p.UnitPrice)}: ${base} ${money(p.BasePrice)}${increase}${discount}.`;
    }

    /**
     * Quantity for the renewal.
     *
     * A PRORATED source line carries a fractional quantity — the short first period into a calendar
     * anchor (D54). Renewing at that fraction would bill half a year forever. A renewal is always a
     * FULL period, so the fraction is dropped and the quantity rounds up to whole units.
     */
    private renewalQuantity(source: SourceLineRow): number {
        const quantity = Number(source.Quantity);
        return quantity > 0 && quantity < 1 ? 1 : Math.round(quantity);
    }

    private dayAfter(date: string): Date {
        const d = new Date(date);
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
    }

    private async loadSourceLine(
        provider: IMetadataProvider,
        user: UserInfo,
        orderLineID: string,
    ): Promise<SourceLineRow | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<SourceLineRow>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `ID='${orderLineID}'`,
                Fields: ['ID', 'OrderHeaderID', 'ProductID', 'Quantity', 'UnitPrice', 'DiscountPct', 'PriceOverridden', 'ProductPriceID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return result?.Results?.[0] ?? null;
    }

    /** The choices recorded on the line that bought the expiring term, in group and option order. */
    private async loadSourceChoices(
        provider: IMetadataProvider,
        user: UserInfo,
        orderLineID: string,
    ): Promise<Array<{ GroupKey: string; GroupLabel: string; OptionValue: string; OptionLabel: string }>> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<{ GroupKey: string; GroupLabel: string; OptionValue: string; OptionLabel: string }>(
            {
                EntityName: ORDER_LINE_CHOICE_ENTITY,
                ExtraFilter: `OrderLineID='${orderLineID}'`,
                Fields: ['GroupKey', 'GroupLabel', 'OptionValue', 'OptionLabel'],
                OrderBy: 'GroupKey, OptionValue',
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return result?.Results ?? [];
    }

    private async logEvent(
        provider: IMetadataProvider,
        user: UserInfo,
        due: DueRow,
        priced: PricedRenewal,
        orderID: string,
    ): Promise<void> {
        const event = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEventEntity>(SUBSCRIPTION_EVENT_ENTITY, user);
        event.NewRecord();
        event.SubscriptionID = due.SubscriptionID;
        event.EventType = 'RenewalOrderSpawned';
        event.OccurredAt = new Date();
        event.RelatedOrderHeaderID = orderID;
        event.Set(
            'EventData',
            JSON.stringify({
                RenewedTermNumber: due.TermNumber,
                ExpiringTermEnd: due.TermEndDate,
                LeadDays: due.SubscriptionRenewalLeadDays ?? due.TypeRenewalLeadDays ?? 0,
                FromProductID: due.ProductID,
                RenewalProductID: priced.ProductID,
                BasePrice: priced.Price.BasePrice,
                BasePriceSource: priced.Price.BaseSource,
                IncreasePercent: priced.Price.IncreasePercent,
                IncreaseSource: priced.Price.IncreaseSource,
                UnitPrice: priced.Price.UnitPrice,
                DiscountPct: priced.Price.DiscountPct,
            }),
        );
        if (!(await event.Save())) {
            throw new Error(
                `Failed to log the renewal event: ${event.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }
}

/** Tree-shaking anchor — called from the server bootstrap so the registration is retained. */
export function LoadSpawnRenewalsOperation(): void {
    // intentionally empty
}
