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
 * continues without a gap. `AutoRenew = false` means it does not renew, full stop — the scheduled
 * pass skips it and the term simply ends. Reminder-and-approve for the second case is a
 * communication flow, not a booking one, and does not belong here.
 *
 * TWO WAYS IN. The scheduled pass selects for itself: every subscription whose latest term expires
 * inside its lead window and whose holder consented. The Renewals page instead names the
 * subscriptions a person ticked (`SubscriptionIDs`), and for those the lead window and the consent
 * switch are the person's call, not the selection's: a subscription with auto-renew OFF is placed as
 * a DRAFT, an ordinary order somebody confirms once the customer agrees, while one with auto-renew
 * ON is confirmed and invoiced exactly as the pass would have done it, only earlier. `PlaceAs`
 * overrides that default either way. Everything else — eligibility, pricing, the term, the
 * idempotency guards, the booking path — is the same code, so a renewal placed from the page is
 * indistinguishable from one the pass placed.
 *
 * The order is placed at LEAD TIME, not on the expiry date, which is how subscription billing
 * actually works: the invoice goes out before the period it covers. The order carries a one-row
 * payment schedule due on the pass's day, so under D92 the receivable is raised by that instalment's
 * invoice, dated when it is issued, not on the term start (#305). Revenue is not affected — the
 * invoice credits Deferred Revenue and the recognition entries are dated into the new term's own
 * window (D14). A subscription with a renewal card (`DefaultCustomerPaymentMethodID`) is the one
 * exception to the due day: its row is due on the term start, when `ChargeRenewals` charges the card
 * (#289). Placing an order still never calls a gateway.
 *
 * IDEMPOTENCY, which a scheduled job makes non-negotiable
 * Two independent guards, because this runs unattended and a double-spawn double-bills a customer:
 *   1. the SELECTION only finds subscriptions whose LATEST term ends inside the window — once a
 *      renewal is booked, term N+1 exists and the subscription no longer qualifies;
 *   2. an explicit check for a live renewal line that has not yet produced a term — one drafted or
 *      quoted by hand for this cycle. Earlier cycles' renewals each booked a term, so they do not
 *      count, and a subscription keeps renewing cycle after cycle.
 * Running the operation twice in a row is a no-op, and that is asserted by the check suite. A draft
 * this operation places from the page is held by the second guard like any other draft: the pass
 * will not place a confirmed order beside it.
 *
 * WHAT IT RENEWS AT (golive #304)
 * Not what the customer last paid. A first-term discount lapses, a product with a successor renews
 * as the successor at its own list price, and an annual increase applies when the new term crosses
 * an anniversary of the subscription's start: `PriceRenewal` in orders-entities decides, and
 * `RenewalPricer` (./RenewalPricing.ts) gathers its inputs. The increase is the subscription's
 * `RenewalIncreasePercent`, else the product's, else the nearest category's, else the company's
 * `OrderCompanyPolicy`. The price and how it was reached are reported on every candidate, preview
 * included, written into the order's notes and logged on the renewal event, so the figure can be
 * checked before a live pass books it.
 *
 * PROMOTIONS THAT CARRY INTO RENEWALS (#289)
 * A promotion with `AppliesToRenewals` set is presented again on each automatic renewal of a
 * subscription bought with one of its codes. The codes come from the line that bought the expiring
 * term (its `OrderAdjustment` rows), so a code carries from one renewal to the next for as long as
 * it keeps applying. They go on the renewal order through the ordinary promotion path, and the
 * pricing engine decides whether each still applies: Active, inside its dates on the renewal's order
 * date, and its targets, minimums, limits and qualifier passing. A code that does not apply is
 * reported on the candidate, in the notes and on the event, and the renewal is placed at the
 * undiscounted price. The preview runs the same engine without saving. The discount is an
 * adjustment, not a change to the line's unit price, so `MarkRenewalPriced` still recognises the
 * price the pass wrote.
 *
 * CONNECTS TO:
 *   BOOKING: OrderEntityServer.Save — the renewal order goes through the ordinary confirm path,
 *            so extension, term creation, GL resolution and recognition are all the SAME code
 *   POLICY:  SubscriptionBehavior (IsRenewal bypasses ConcurrencyMode — a renewal is not a second
 *            concurrent subscription, it is this one continuing)
 *   PRICING: ./RenewalPricing.ts, over orders-entities PriceRenewal / ResolveRenewalIncrease / RenewalCrossesAnniversary
 *   PROMOS:  ./RenewalPromotions.ts (which codes, and what became of them); OrderPricingService for the preview
 *   PAGE:    ./GetRenewalWorklistOperation.ts reads the same subjects for the Renewals page, which calls this with SubscriptionIDs
 *   TABLES:  __mj_BizAppsOrders.{Subscription,SubscriptionTerm,SubscriptionType,OrderHeader,OrderLine,OrderHeaderPaymentSchedule,
 *            Product,ProductCategory,OrderCompanyPolicy,OrderAdjustment,PromotionCode,Promotion}
 */
import {
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
    OrdersSpawnRenewalsOperation as OrdersSpawnRenewalsOperationBase,
    OrderPricingService,
    RENEWABLE_STATUSES,
    mjBizAppsOrdersOrderHeaderPaymentScheduleEntity,
    mjBizAppsOrdersOrderLineEntity,
    mjBizAppsOrdersSubscriptionEventEntity,
} from '@mj-biz-apps/orders-entities';
import type { OrderEntityServer } from './OrderEntityServer.js';
import { RequireOptionalDay, RequireOptionalUUID, RequireUUID, RequireUUIDs } from './sql-guards.js';
import { CalendarDayOrToday } from './calendar-day.js';
import { IsProviderBilled, NotProviderBilledSql } from './ProviderBilledSubscriptions.js';
import { MarkAsOrdersOwnWrite } from './OrderLineEntityServer.js';
import { RenewalDueDate, RenewalScheduleRows } from './PaymentScheduleBehavior.js';
import { ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY } from './entity-names.js';
import {
    ClassifyRenewalPromotionCodes,
    RenewalPromotionNote,
    type RenewalPromotionOutcome,
    type UnusableRenewalPromotionCode,
} from './RenewalPromotions.js';
import {
    DayAfter,
    EffectiveLeadDays,
    LineFirstTermStartSql,
    NonSubscriptionSuccessorRefusal,
    RenewalPricer,
    type PricedRenewal,
    type RecordedCodeRow,
    type RenewalSubjectRow,
} from './RenewalPricing.js';

// Re-exported for the callers and tests that have always imported it from here.
export { NonSubscriptionSuccessorRefusal };

const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const ORDER_LINE_CHOICE_ENTITY = 'MJ_BizApps_Orders: Order Line Choices';

/** Term statuses a renewal can continue from. */
const RENEWABLE_TERM_STATUSES: ReadonlyArray<string> = ['Scheduled', 'Active'];

/** How a placed renewal order is left. */
export type RenewalPlacement = 'Confirmed' | 'Draft';

export interface SpawnRenewalsInput {
    /** Treat this as "today". Defaults to now. */
    AsOfDate?: Date | string;
    /** Restrict to one subscription — for a targeted retry, or for a test. */
    SubscriptionID?: string;
    /**
     * Place renewals for exactly these subscriptions, chosen by a person (the Renewals page). The lead
     * window and the auto-renew switch do not select here; eligibility still does (Active or Trialing,
     * latest term Scheduled or Active, not billed by a gateway, no renewal already pending), and each
     * ineligible id is reported as a skipped candidate rather than silently dropped.
     */
    SubscriptionIDs?: string[];
    /**
     * How to leave each order: `Confirmed` books and invoices it; `Draft` saves it for a person to
     * confirm. Defaults to `Confirmed` for the scheduled selection, and for `SubscriptionIDs` to
     * `Confirmed` where the subscription has auto-renew on and `Draft` where it does not.
     */
    PlaceAs?: RenewalPlacement;
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
    /** `Subscription.AutoRenew`. */
    AutoRenew?: boolean;
    /** How the order was, or would be, left. */
    OrderStatus?: RenewalPlacement;
    /** Set when the renewal was placed (absent on a preview, or when placing failed). */
    OrderID?: string;
    OrderNumber?: string;
    /** Which renewal order of this pass the subscription renews on (1-based). Members with the same number share one order. */
    OrderGroup?: number;
    /** Set when this candidate was skipped, with the reason. */
    SkippedReason?: string;
    /** The product the renewal is placed on: the subscription's own, or its successor. */
    RenewalProductID?: string;
    /**
     * The renewal's unit price before the increase. When the line that bought the expiring term bought
     * several terms (a 24-month line on a 12-month type), one term's share of that line's price.
     */
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
    /** Seats the renewal buys. */
    Quantity?: number;
    /** First day of the term the renewal buys, `YYYY-MM-DD`, as the confirm will set it. */
    RenewalTermStart?: string;
    /** Last day of the term the renewal buys, `YYYY-MM-DD`, as the confirm will set it. */
    RenewalTermEnd?: string;
    /**
     * Promotion codes that carried into the renewal and discounted it: codes recorded on the line that
     * bought the expiring term whose promotion has `AppliesToRenewals` set. Absent when none were presented.
     */
    RenewalPromotionCodes?: string[];
    /**
     * Codes presented on the renewal that gave no discount, each with the reason: the promotion paused,
     * expired or out of its dates, or its other rules not met. The renewal is placed without them.
     */
    UnusableRenewalPromotionCodes?: UnusableRenewalPromotionCode[];
}

export interface SpawnRenewalsOutput {
    Success: boolean;
    Message?: string;
    /** Every subscription considered due, whether or not an order was placed. */
    Candidates: RenewalCandidate[];
    Placed: number;
    Skipped: number;
}

/** A subject the selection found, plus the facts only the explicit selection has to judge for itself. */
/** A priced, guard-passed subscription waiting to be placed, with the candidate that reports it. */
interface PlaceableMember {
    due: DueRow;
    priced: PricedRenewal;
    candidate: RenewalCandidate;
    placeAs: RenewalPlacement;
}

/**
 * Which renewal order a subscription renews on: one per selling company, customer (holder
 * organization and beneficiary person), expiring term end date, placement and renewal card. Two
 * subscriptions with the same key renew on ONE order with a line each. Exported so the rule can
 * be read and tested on its own.
 */
export function RenewalGroupKey(
    due: Pick<RenewalSubjectRow, 'CompanyID' | 'HolderOrganizationID' | 'BeneficiaryPersonID' | 'TermEndDate' | 'DefaultCustomerPaymentMethodID'>,
    placeAs: RenewalPlacement,
): string {
    const part = (v: unknown): string => (v == null ? '' : String(v).toLowerCase());
    return [part(due.CompanyID), part(due.HolderOrganizationID), part(due.BeneficiaryPersonID), part(due.TermEndDate), placeAs, part(due.DefaultCustomerPaymentMethodID)].join('|');
}

interface DueRow extends RenewalSubjectRow {
    TermStatus?: string;
    ProviderSubscriptionID?: string | null;
}

/** The columns both selections read, under the aliases the rest of the file uses. */
const SUBJECT_COLUMNS = `
                s.ID                  AS SubscriptionID,
                s.SubscriptionNumber,
                s.Status              AS SubscriptionStatus,
                s.SubscriptionTypeID,
                s.CompanyID,
                s.ProductID,
                s.HolderOrganizationID,
                s.BeneficiaryPersonID,
                s.AutoRenew,
                s.ProviderSubscriptionID,
                s.RenewalLeadDays     AS SubscriptionRenewalLeadDays,
                t.RenewalLeadDays     AS TypeRenewalLeadDays,
                s.StartDate           AS SubscriptionStartDate,
                s.RenewalIncreasePercent AS SubscriptionIncreasePercent,
                s.CarryDiscountOnRenewal,
                s.DefaultCustomerPaymentMethodID,
                l.ID                  AS TermID,
                l.TermNumber,
                l.StartDate           AS TermStartDate,
                l.EndDate             AS TermEndDate,
                l.Status              AS TermStatus,
                l.Quantity            AS TermQuantity,
                l.OrderLineID,
                ${LineFirstTermStartSql('l')} AS LineFirstTermStartDate`;

@RegisterClass(BaseRemotableOperation, 'Orders.SpawnRenewals')
export class SpawnRenewalsOperation extends OrdersSpawnRenewalsOperationBase {
    protected async InternalExecute(
        input: SpawnRenewalsInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<SpawnRenewalsOutput> {
        // Caller-supplied ids reach SQL filter text downstream. Validated here,
        // at the boundary, so every frame below this one can trust them.
        RequireOptionalUUID(input.SubscriptionID, 'SubscriptionID');
        const selected = input.SubscriptionIDs?.length ? RequireUUIDs(input.SubscriptionIDs, 'SubscriptionIDs') : null;
        if (input.PlaceAs !== undefined && input.PlaceAs !== 'Confirmed' && input.PlaceAs !== 'Draft') {
            return { Success: false, Message: `PlaceAs takes 'Confirmed' or 'Draft', not '${String(input.PlaceAs)}'.`, Candidates: [], Placed: 0, Skipped: 0 };
        }

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
        const out: SpawnRenewalsOutput = { Success: true, Candidates: [], Placed: 0, Skipped: 0 };
        const candidates = selected
            ? await this.findSelected(provider, selected, out)
            : await this.findDue(provider, user, asOf, input.SubscriptionID);

        const pricer = new RenewalPricer(provider, user);
        const limit = input.MaxCount ?? Number.MAX_SAFE_INTEGER;
        /**
         * ONE ORDER PER CUSTOMER PER RENEWAL DATE. Subscriptions that renew together (`RenewalGroupKey`:
         * same selling company, holder and beneficiary, expiring term end, placement and renewal
         * card, and no carried promotion codes) go on one order with one line each, so a customer
         * who bought three products together gets one renewal order and one invoice, not three. A
         * product added mid-term joins only when it was co-terminated to end on the same day;
         * otherwise it ends on its own date and renews on its own order.
         *
         * The cap counts ORDERS, placed on a live pass and would-place on a preview, so it binds
         * identically in both modes and the list a person confirms at the go-live gate is the list
         * the first live pass produces. A subscription joining an order already counted costs
         * nothing; one that would open a new order past the cap waits for the next pass, unlisted,
         * as before. A guard rejection or a pricing failure does not consume the cap: nothing was
         * placed. (A member carrying promotion codes renews on its own order, decided only once it
         * is priced, so a pass can overshoot the cap by that one order; its base key is not counted
         * as open, so a code-free sibling cannot open a second one on its account. A group that
         * fails and is retried one member at a time, below, can overshoot it the same way.)
         */
        const groups = new Map<string, PlaceableMember[]>();
        /** Each order's 1-based number in this pass, assigned when its group opens. */
        const groupIndex = new Map<string, number>();

        for (const due of candidates) {
            const placeAs: RenewalPlacement = input.PlaceAs ?? (selected && !due.AutoRenew ? 'Draft' : 'Confirmed');
            const baseKey = RenewalGroupKey(due, placeAs);
            // Past the cap, a subscription that would OPEN an order waits for the next pass, unlisted;
            // one that JOINS an order already open still goes on it. `continue`, not `break`: a later
            // candidate may belong to an open order, and breaking would split a customer across passes.
            if (groups.size >= limit && !groups.has(baseKey)) continue;

            const candidate: RenewalCandidate = {
                SubscriptionID: due.SubscriptionID,
                SubscriptionNumber: due.SubscriptionNumber,
                ProductID: due.ProductID,
                CurrentTermEnd: due.TermEndDate,
                LeadDays: EffectiveLeadDays(due),
                AutoRenew: !!due.AutoRenew,
                OrderStatus: placeAs,
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
                priced = await pricer.Price(due);
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
            candidate.Quantity = priced.Quantity;
            if (priced.Term) {
                candidate.RenewalTermStart = priced.Term.Start;
                candidate.RenewalTermEnd = priced.Term.End;
            }

            if (input.Preview) {
                // The same engine the live pass runs, without saving, so the preview reports which
                // carried promotions will apply. A failure here is reported, not fatal: the live
                // pass decides again when it places the order.
                if (priced.PromotionCodes.length) {
                    try {
                        this.reportPromotions(candidate, await this.previewPromotions(provider, user, due, priced));
                    } catch (err) {
                        const message = err instanceof Error ? err.message : String(err);
                        LogError(`Orders.SpawnRenewals: ${due.SubscriptionNumber} promotion preview failed: ${message}`);
                        candidate.UnusableRenewalPromotionCodes = priced.PromotionCodes.map((c) => ({
                            Code: c.Code,
                            Reason: `the preview could not price it: ${message}`,
                        }));
                    }
                }
                out.Skipped++;
            }

            // Carried promotion codes are presented at ORDER level, where the engine applies each to
            // every line it targets. A line that carried a code therefore renews alone, so a code one
            // purchase earned never discounts a sibling that did not carry it.
            const key = priced.PromotionCodes.length ? `${baseKey}|codes|${due.SubscriptionID}` : baseKey;
            const members = groups.get(key) ?? [];
            members.push({ due, priced, candidate, placeAs });
            groups.set(key, members);
            if (!groupIndex.has(key)) groupIndex.set(key, groupIndex.size + 1);
            candidate.OrderGroup = groupIndex.get(key);
        }

        let placedSubscriptions = 0;
        if (!input.Preview) {
            const day = asOf.toISOString().slice(0, 10);
            let nextGroup = groupIndex.size;
            for (const members of groups.values()) {
                // One order's failure must not stop the batch — an unattended job that aborts on
                // the first bad row silently stops renewing everyone behind it.
                if (await this.tryPlaceGroup(provider, user, members, day, !!selected, out)) {
                    placedSubscriptions += members.length;
                    continue;
                }
                if (members.length === 1) {
                    out.Skipped++;
                    continue;
                }
                // ONE MEMBER'S FAILURE HOLDS BACK ONLY ITSELF. The group's order is one transaction,
                // so a member that cannot be booked (an unresolved GL account, a refused line) rolled
                // every sibling back with it. Retried one member at a time, the healthy ones place
                // on orders of their own and only the broken one waits, which is what the pass did
                // before orders were grouped: a scheduled pass that skipped the whole customer
                // would repeat that every night until someone fixed the one subscription.
                members.forEach((m, i) => {
                    // Each now stands for an order of its own: the first keeps the group's number.
                    if (i > 0) m.candidate.OrderGroup = ++nextGroup;
                });
                for (const m of members) {
                    if (await this.tryPlaceGroup(provider, user, [m], day, !!selected, out)) placedSubscriptions++;
                    else out.Skipped++;
                }
            }
        }

        out.Message =
            `${out.Candidates.length} subscription(s) ${selected ? 'selected' : 'due'} as of ${asOf.toISOString().slice(0, 10)}; ` +
            `${out.Placed} renewal order(s) placed for ${placedSubscriptions} subscription(s), ${out.Skipped} skipped.`;
        return out;
    }

    /**
     * Subscriptions whose latest term expires within their effective lead window.
     *
     * Raw SQL rather than RunView because the selection is inherently a JOIN across four tables with
     * a "latest term per subscription" window — expressible in one statement and awkward as several
     * round trips. `RenewalLeadDays` falls back from the subscription to its type, which is the
     * inheritance rule the schema documents. A subscription a gateway bills itself
     * (`ProviderSubscriptionID` set) is never due here: the gateway renews it (./ProviderBilledSubscriptions.ts).
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
            SELECT${SUBJECT_COLUMNS}
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
              -- A gateway that bills the subscription itself renews it; Orders placing an order too
              -- would bill twice. Keyed on the marker, never the account's switch.
              AND ${NotProviderBilledSql('s')}
              ${only}
            ORDER BY l.EndDate, s.SubscriptionNumber
        `)) as DueRow[];

        return Array.isArray(rows) ? rows : [];
    }

    /**
     * The subscriptions a person named, each with its latest term, whatever the switch or the window
     * say. The rules the scheduled selection puts in its WHERE are applied here instead, so an
     * ineligible choice comes back as a skipped candidate with its reason: a person who ticked a
     * cancelled subscription is told so, where the pass would simply not have seen it.
     */
    private async findSelected(provider: IMetadataProvider, ids: string[], out: SpawnRenewalsOutput): Promise<DueRow[]> {
        const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
        const wanted = [...new Set(ids.map((id) => id.toLowerCase()))];
        const list = wanted.map((id) => `'${id}'`).join(',');
        const rows = (await db.ExecuteSQL(`
            WITH latest AS (
                SELECT st.*, ROW_NUMBER() OVER (PARTITION BY st.SubscriptionID ORDER BY st.TermNumber DESC) AS rn
                FROM __mj_BizAppsOrders.SubscriptionTerm st
            )
            SELECT${SUBJECT_COLUMNS}
            FROM __mj_BizAppsOrders.Subscription s
            JOIN __mj_BizAppsOrders.SubscriptionType t ON t.ID = s.SubscriptionTypeID
            LEFT JOIN latest l ON l.SubscriptionID = s.ID AND l.rn = 1
            WHERE s.ID IN (${list})
            ORDER BY l.EndDate, s.SubscriptionNumber
        `)) as DueRow[];
        const found = Array.isArray(rows) ? rows : [];
        const seen = new Set(found.map((r) => String(r.SubscriptionID).toLowerCase()));
        for (const id of wanted) {
            if (seen.has(id)) continue;
            out.Candidates.push({ SubscriptionID: id, SubscriptionNumber: '—', ProductID: '', CurrentTermEnd: '', LeadDays: 0, SkippedReason: 'no such subscription' });
            out.Skipped++;
        }

        const eligible: DueRow[] = [];
        for (const row of found) {
            const refusal = SelectedRenewalRefusal(row);
            if (!refusal) {
                eligible.push(row);
                continue;
            }
            out.Candidates.push({
                SubscriptionID: row.SubscriptionID,
                SubscriptionNumber: row.SubscriptionNumber,
                ProductID: row.ProductID,
                CurrentTermEnd: row.TermEndDate ?? '',
                LeadDays: EffectiveLeadDays(row),
                AutoRenew: !!row.AutoRenew,
                SkippedReason: refusal,
            });
            out.Skipped++;
        }
        return eligible;
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
     * Place a group's order and report it on every member; on failure, record the reason on every
     * member and say so. Counts the order in `out.Placed`; the caller decides what a failure counts
     * as, since a failed group is retried a member at a time.
     */
    private async tryPlaceGroup(
        provider: IMetadataProvider,
        user: UserInfo,
        members: ReadonlyArray<PlaceableMember>,
        invoiceDay: string,
        selectedByPerson: boolean,
        out: SpawnRenewalsOutput,
    ): Promise<boolean> {
        try {
            const order = await this.placeRenewalGroup(provider, user, members, invoiceDay, members[0].placeAs, selectedByPerson);
            for (const m of members) {
                m.candidate.OrderID = order.ID;
                m.candidate.OrderNumber = order.Number;
                delete m.candidate.SkippedReason;
                if (order.Promotions) this.reportPromotions(m.candidate, order.Promotions);
            }
            out.Placed++;
            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`Orders.SpawnRenewals: ${members.map((m) => m.due.SubscriptionNumber).join(', ')} failed: ${message}`);
            for (const m of members) m.candidate.SkippedReason = message;
            return false;
        }
    }

    /**
     * Place ONE renewal order for a group of subscriptions that renew together (one line each), as a
     * draft or confirmed, inside one transaction: all of it or none of it. The header comes from the
     * first member; the group key guarantees every member agrees on it.
     */
    private async placeRenewalGroup(
        provider: IMetadataProvider,
        user: UserInfo,
        members: ReadonlyArray<PlaceableMember>,
        invoiceDay: string,
        placeAs: RenewalPlacement,
        selectedByPerson: boolean,
    ): Promise<{ ID: string; Number: string; Promotions: RenewalPromotionOutcome | null }> {
        const first = members[0].due;
        const numbers = members.map((m) => m.due.SubscriptionNumber).join(', ');
        const dbProvider = provider as unknown as DatabaseProviderBase;
        await dbProvider.BeginTransaction();
        try {
            const order = await provider.GetEntityObject<OrderEntityServer>(ORDER_HEADER_ENTITY, user);
            order.NewRecord();
            order.OrderType = 'Sale';
            // Dated the day AFTER the expiring term, so the new term starts where the old one ends
            // and the ledger shows the sale in the period it belongs to — not on the day the job
            // happened to run. Every member ends on the same day (the group key).
            order.OrderDate = DayAfter(first.TermEndDate);
            // A catch-up run (an as-of day before today) invoices the instalment on that day, the day
            // its due date is counted from, so it does not book it today (#831). An as-of day in the
            // future still invoices today: AR is never dated ahead of the day it is raised.
            const today = (await CalendarDayOrToday(null, provider, user)).toISOString().slice(0, 10);
            order.InstalmentInvoiceDay = invoiceDay < today ? invoiceDay : null;
            order.CompanyID = first.CompanyID;
            order.BillToOrganizationID = first.HolderOrganizationID;
            order.BillToPersonID = first.BeneficiaryPersonID;
            order.Notes = this.renewalNotes(members, null, placeAs, selectedByPerson);

            const codes = [...new Set(members.flatMap((m) => m.priced.PromotionCodes.map((c) => c.Code)))];
            let lineNumber = 0;
            for (const { due, priced } of members) {
                const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
                // Orders writing its own line. An app that froze this line freezes what a PERSON
                // may change, not Orders closing its own books (#206 item 1).
                MarkAsOrdersOwnWrite(line);
                line.NewRecord();
                // The successor when the subscription moves to one; booking then moves the subscription
                // onto it (OrderEntityServer.touchExistingSubscription).
                line.ProductID = priced.ProductID;
                line.LineNumber = ++lineNumber;
                // Per-LINE (D61): renewal is a line-level act, which is what lets one order renew
                // several subscriptions. Naming the target also removes the guesswork from resolution:
                // the engine renews exactly this one rather than searching by subscriber and product.
                line.RenewsSubscriptionID = due.SubscriptionID;
                // The subscription's own subscriber, carried onto the line's ship-to so the renewal
                // lands on the same holder even when the order's customer differs.
                line.ShipToOrganizationID = due.HolderOrganizationID;
                line.ShipToPersonID = due.BeneficiaryPersonID;
                // What the pricer decided (golive #304). Stated on the line, so pricing keeps it rather
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
            }

            // Promotions that carry into renewals (#289), through the ordinary promotion path: the
            // engine decides whether each still applies, and writes the discount as an adjustment.
            // (A member carrying codes is always alone on its order; see the grouping note.)
            if (codes.length) {
                order.PromotionCodes.Codes = codes;
            }

            // DRAFT FIRST, THEN THE SCHEDULE, THEN CONFIRM (#305). The renewal is invoiced on the day
            // this pass runs, not on its term start, so it carries a one-row schedule due today and
            // D92 books it that way: no AR at confirm, and the instalment — due on or before the
            // order date — is issued inside the same confirm, dated when it is issued. The row must
            // tie to the lines' gross, and that gross exists only once pricing has written the lines,
            // which is what the draft save does. All of it sits in this transaction.
            order.Status = 'Draft';
            if (!(await order.Save())) {
                throw new Error(
                    `Failed to save the renewal order as a draft: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
            // What became of the carried promotions, known once the draft's pricing has run. Written
            // into the notes before the confirm, which re-decides the same codes on the same date.
            let promotions: RenewalPromotionOutcome | null = null;
            if (codes.length) {
                const presented = members.flatMap((m) => m.priced.PromotionCodes);
                promotions = ClassifyRenewalPromotionCodes(codes, order.UnusablePromotionCodes, await this.appliedCodes(provider, order.ID, presented));
                order.Notes = this.renewalNotes(members, promotions, placeAs, selectedByPerson);
            }

            if (placeAs === 'Draft') {
                // The notes may have changed above; a draft's second save is the ordinary draft save.
                if (promotions && !(await order.Save())) {
                    throw new Error(
                        `Failed to save the renewal draft ${order.OrderNumber} of ${numbers}: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    );
                }
            } else {
                // Due on the invoice day plus the customer's terms, capped at the order date (#305
                // review). `resolveDueDate` is the confirm's own terms walk, run now so the row can use
                // it; confirm then sees the date already set and leaves it. A subscription with a renewal
                // card is due on the order date, the day `ChargeRenewals` first charges the card (#289).
                await order.resolveDueDate();
                const rowDueDate = RenewalDueDate(invoiceDay, order.OrderDate, order.DueDate, !!first.DefaultCustomerPaymentMethodID);
                await this.addRenewalSchedule(provider, user, order.ID, String(order.CompanyID), order.Lines.Items, rowDueDate);

                order.Status = 'Confirmed';
                if (!(await order.Save())) {
                    throw new Error(
                        `Failed to book renewal order ${order.OrderNumber} of ${numbers}: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    );
                }
            }

            for (const { due, priced } of members) {
                await this.logEvent(provider, user, due, priced, order.ID, promotions, placeAs, selectedByPerson);
            }
            await dbProvider.CommitTransaction();
            return { ID: order.ID, Number: order.OrderNumber, Promotions: promotions };
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

    /** The presented codes the engine wrote a discount for on this order, read from its adjustment rows. */
    private async appliedCodes(provider: IMetadataProvider, orderID: string, presented: RecordedCodeRow[]): Promise<string[]> {
        const id = RequireUUID(String(orderID), 'OrderHeaderID');
        const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
        const rows = (await db.ExecuteSQL(`
            SELECT DISTINCT PromotionCodeID FROM __mj_BizAppsOrders.OrderAdjustment
            WHERE OrderHeaderID = '${id}' AND PromotionCodeID IS NOT NULL
        `)) as Array<{ PromotionCodeID: string }>;
        return this.codesFor(presented, Array.isArray(rows) ? rows.map((r) => r.PromotionCodeID) : []);
    }

    /** The presented codes whose PromotionCode ID is among `codeIDs`. */
    private codesFor(presented: RecordedCodeRow[], codeIDs: ReadonlyArray<string | null>): string[] {
        const ids = new Set(codeIDs.filter((id): id is string => !!id).map((id) => id.toLowerCase()));
        return presented.filter((c) => ids.has(c.PromotionCodeID.toLowerCase())).map((c) => c.Code);
    }

    /**
     * What the carried promotions would do on this renewal, priced by the same engine and persisting
     * nothing: the renewal line as the live pass writes it, materialised and never saved.
     */
    private async previewPromotions(
        provider: IMetadataProvider,
        user: UserInfo,
        due: DueRow,
        priced: PricedRenewal,
    ): Promise<RenewalPromotionOutcome> {
        const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
        MarkAsOrdersOwnWrite(line);
        line.NewRecord();
        line.ProductID = priced.ProductID;
        line.LineNumber = 1;
        line.RenewsSubscriptionID = due.SubscriptionID;
        line.Quantity = priced.Quantity;
        line.UnitPrice = priced.Price.UnitPrice;
        line.DiscountPct = priced.Price.DiscountPct;

        const codes = priced.PromotionCodes.map((c) => c.Code);
        const result = await new OrderPricingService({ Provider: provider, User: user }).Price({
            OrderHeaderID: null,
            CompanyID: due.CompanyID,
            BillToPersonID: due.BeneficiaryPersonID,
            BillToOrganizationID: due.HolderOrganizationID,
            OrderDate: DayAfter(due.TermEndDate),
            ShipToAddressID: null,
            Lines: [line],
            PromotionCodes: codes,
            ManualDiscounts: [],
            Charges: [],
        });
        const applied = this.codesFor(
            priced.PromotionCodes,
            (result.Promotions?.Applications ?? []).filter((a) => a.Amount > 0).map((a) => a.PromotionCodeID),
        );
        return ClassifyRenewalPromotionCodes(codes, result.UnusableCodes, applied);
    }

    /** Copy a promotion outcome onto the candidate. */
    private reportPromotions(candidate: RenewalCandidate, outcome: RenewalPromotionOutcome): void {
        candidate.RenewalPromotionCodes = outcome.Applied;
        candidate.UnusableRenewalPromotionCodes = outcome.Unusable;
    }

    /** The renewal order's notes: one line per subscription it renews (what, who asked, how its price was reached), then what the promotions did. */
    private renewalNotes(
        members: ReadonlyArray<{ due: DueRow; priced: PricedRenewal }>,
        promotions: RenewalPromotionOutcome | null,
        placeAs: RenewalPlacement,
        selectedByPerson: boolean,
    ): string {
        const money = (n: number) => n.toFixed(2);
        const how = selectedByPerson ? (placeAs === 'Draft' ? 'Renewal draft' : 'Renewal') : 'Automatic renewal';
        const lines = members.map(({ due, priced }) => {
            const p = priced.Price;
            const base = { PriorPrice: 'prior price', PriorList: 'prior list price', SuccessorList: 'list price' }[p.BaseSource];
            // A multi-term prior line: say the base is one term's share, so the figure reads against the line.
            const share =
                p.BaseSource === 'PriorPrice' && priced.PriorLineMonths != null
                    ? ` (one term of a ${Math.round(priced.PriorLineMonths * 100) / 100}-month line)`
                    : '';
            const parts = [`${how} of ${due.SubscriptionNumber} (term ${due.TermNumber + 1})`];
            if (selectedByPerson) parts.push('placed from the Renewals page');
            if (priced.MovesToSuccessor) parts.push(`onto successor product ${priced.ProductName}`);
            const increase = p.IncreasePercent > 0 ? ` + ${p.IncreasePercent}% annual increase (${p.IncreaseSource.toLowerCase()})` : '';
            const discount = p.DiscountPct > 0 ? `, discount ${Math.round(p.DiscountPct * 10000) / 100}% continued` : '';
            return `${parts.join(' ')}. Unit price ${money(p.UnitPrice)}: ${base} ${money(p.BasePrice)}${share}${increase}${discount}.`;
        });
        const head = members.length > 1 ? [`${members.length} subscriptions renewed together: same customer, same term end.`] : [];
        const promotionNote = promotions ? RenewalPromotionNote(promotions) : '';
        return [...head, ...lines, ...(promotionNote ? [promotionNote] : [])].join('\n');
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
        promotions: RenewalPromotionOutcome | null,
        placeAs: RenewalPlacement,
        selectedByPerson: boolean,
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
                LeadDays: EffectiveLeadDays(due),
                OrderStatus: placeAs,
                Placement: selectedByPerson ? 'Selected' : 'Pass',
                FromProductID: due.ProductID,
                RenewalProductID: priced.ProductID,
                BasePrice: priced.Price.BasePrice,
                BasePriceSource: priced.Price.BaseSource,
                IncreasePercent: priced.Price.IncreasePercent,
                IncreaseSource: priced.Price.IncreaseSource,
                UnitPrice: priced.Price.UnitPrice,
                DiscountPct: priced.Price.DiscountPct,
                ...(priced.PriorLineMonths != null ? { PriorLineMonths: priced.PriorLineMonths } : {}),
                ...(priced.Term ? { RenewalTermStart: priced.Term.Start, RenewalTermEnd: priced.Term.End } : {}),
                ...(promotions
                    ? { RenewalPromotionCodes: promotions.Applied, UnusableRenewalPromotionCodes: promotions.Unusable }
                    : {}),
            }),
        );
        if (!(await event.Save())) {
            throw new Error(
                `Failed to log the renewal event: ${event.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }
}

/**
 * Why a subscription a person named cannot have a renewal placed, or null when it can: the same
 * rules the scheduled selection applies in SQL, minus the lead window and the auto-renew switch,
 * which are the person's call. Exported so the Renewals page and its tests read one rule.
 */
export function SelectedRenewalRefusal(row: {
    SubscriptionStatus: string;
    TermID?: string | null;
    TermStatus?: string | null;
    ProviderSubscriptionID?: string | null;
}): string | null {
    if (!RENEWABLE_STATUSES.includes(row.SubscriptionStatus)) {
        return `the subscription is ${row.SubscriptionStatus}, not Active or Trialing, so nothing renews it`;
    }
    if (IsProviderBilled(row)) {
        return 'a payment gateway bills this subscription, so Orders places no renewal order for it';
    }
    if (!row.TermID) return 'the subscription has no term to renew from';
    if (!RENEWABLE_TERM_STATUSES.includes(String(row.TermStatus))) {
        return `its latest term is ${row.TermStatus}, not Scheduled or Active, so there is nothing to continue`;
    }
    return null;
}

/** Tree-shaking anchor — called from the server bootstrap so the registration is retained. */
export function LoadSpawnRenewalsOperation(): void {
    // intentionally empty
}
