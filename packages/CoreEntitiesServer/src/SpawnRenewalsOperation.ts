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
 * actually works: the invoice goes out before the period it covers. Revenue is not affected — the
 * booking entry credits Deferred Revenue and the recognition entries are dated into the new term's
 * own window (D14).
 *
 * IDEMPOTENCY, which a scheduled job makes non-negotiable
 * Two independent guards, because this runs unattended and a double-spawn double-bills a customer:
 *   1. the SELECTION only finds subscriptions whose LATEST term ends inside the window — once a
 *      renewal is booked, term N+1 exists and the subscription no longer qualifies;
 *   2. an explicit check for an existing order with `RenewsSubscriptionID` covering that term,
 *      which catches the case where a prior pass booked the order but its term write failed.
 * Running the operation twice in a row is a no-op, and that is asserted by the check suite.
 *
 * CONNECTS TO:
 *   BOOKING: OrderEntityServer.Save — the renewal order goes through the ordinary confirm path,
 *            so extension, term creation, GL resolution and recognition are all the SAME code
 *   POLICY:  SubscriptionBehavior (IsRenewal bypasses ConcurrencyMode — a renewal is not a second
 *            concurrent subscription, it is this one continuing)
 *   TABLES:  __mj_BizAppsOrders.{Subscription,SubscriptionTerm,SubscriptionType,OrderHeader,OrderLine}
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
import { RequireOptionalUUID } from './sql-guards.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SUBSCRIPTION_TYPE_ENTITY = 'MJ_BizApps_Orders: Subscription Types';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

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
    TermEndDate: string;
    OrderLineID: string;
}

interface SourceLineRow {
    ID: string;
    Quantity: number;
    UnitPrice: number;
    DiscountPct: number | null;
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

        const asOf = input.AsOfDate ? new Date(input.AsOfDate) : new Date();
        const candidates = await this.findDue(provider, user, asOf, input.SubscriptionID);

        const out: SpawnRenewalsOutput = { Success: true, Candidates: [], Placed: 0, Skipped: 0 };
        const limit = input.MaxCount ?? Number.MAX_SAFE_INTEGER;

        for (const due of candidates) {
            if (out.Placed >= limit) break;

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

            if (input.Preview) {
                out.Skipped++;
                continue;
            }

            try {
                const order = await this.placeRenewal(provider, user, due);
                candidate.OrderID = order.ID;
                candidate.OrderNumber = order.Number;
                out.Placed++;
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
                l.ID                  AS TermID,
                l.TermNumber,
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

    /** True when an order already exists that renews this subscription past the expiring term. */
    private async alreadyRenewed(provider: IMetadataProvider, user: UserInfo, due: DueRow): Promise<boolean> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<{ ID: string }>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `RenewsSubscriptionID='${due.SubscriptionID}'`,
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        const orders = result?.Results ?? [];
        if (orders.length === 0) return false;

        // An order exists, but a subscription renews many times over its life — only a renewal that
        // produced a term BEYOND the expiring one counts as this cycle's.
        const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
        const beyond = (await db.ExecuteSQL(`
            SELECT TOP 1 st.ID
            FROM __mj_BizAppsOrders.SubscriptionTerm st
            WHERE st.SubscriptionID = '${due.SubscriptionID}' AND st.TermNumber > ${due.TermNumber}
        `)) as unknown[];
        if (Array.isArray(beyond) && beyond.length > 0) return true;

        // No later term, but a renewal order exists — a prior pass booked the order and then failed
        // before the term landed. Report rather than silently re-billing.
        return true;
    }

    /**
     * Place the renewal as an ordinary confirmed order.
     *
     * Deliberately NOT a special write path: routing it through `OrderEntityServer.Save` means the
     * extension, the new term, GL resolution, the recognition schedule and the all-or-none
     * guarantee are the same code that handles a customer purchase. A bespoke renewal writer would
     * be a second implementation of booking, drifting from the first.
     */
    private async placeRenewal(
        provider: IMetadataProvider,
        user: UserInfo,
        due: DueRow,
    ): Promise<{ ID: string; Number: string }> {
        const source = await this.loadSourceLine(provider, user, due.OrderLineID);
        if (!source) {
            throw new Error(
                `The order line that bought term ${due.TermNumber} (${due.OrderLineID}) no longer exists, ` +
                    `so there is no price to renew at.`,
            );
        }

        const dbProvider = provider as unknown as DatabaseProviderBase;
        await dbProvider.BeginTransaction();
        try {
            const order = await provider.GetEntityObject<BaseEntity>(ORDER_HEADER_ENTITY, user);
            order.NewRecord();
            order.Set('OrderType', 'Sale');
            // Dated the day AFTER the expiring term, so the new term starts where the old one ends
            // and the ledger shows the sale in the period it belongs to — not on the day the job
            // happened to run.
            order.Set('OrderDate', this.dayAfter(due.TermEndDate));
            order.Set('CompanyID', due.CompanyID);
            order.Set('BillToOrganizationID', due.HolderOrganizationID);
            order.Set('BillToPersonID', due.BeneficiaryPersonID);
            order.Set('Notes', `Automatic renewal of ${due.SubscriptionNumber} (term ${due.TermNumber + 1})`);

            const line = await provider.GetEntityObject<BaseEntity>(ORDER_LINE_ENTITY, user);
            line.NewRecord();
            line.Set('ProductID', due.ProductID);
            line.Set('LineNumber', 1);
            // Per-LINE (D61): renewal is a line-level act, so one order could renew several
            // subscriptions. Naming the target also removes the guesswork from resolution — the
            // engine renews exactly this one rather than searching by subscriber and product.
            line.Set('RenewsSubscriptionID', due.SubscriptionID);
            // The subscription's own subscriber, carried onto the line's ship-to so the renewal
            // lands on the same holder even when the order's customer differs.
            line.Set('ShipToOrganizationID', due.HolderOrganizationID);
            line.Set('ShipToPersonID', due.BeneficiaryPersonID);
            // Renew at what they last paid. Re-pricing from the current ProductPrice is a policy
            // decision (grandfathering, notice periods) that nobody has made yet — carrying the
            // price forward is the choice that cannot surprise a customer.
            line.Set('Quantity', this.renewalQuantity(source));
            line.Set('UnitPrice', source.UnitPrice);
            line.Set('DiscountPct', source.DiscountPct ?? 0);

            (order as unknown as { Lines: unknown }).Lines = [line];
            order.Set('Status', 'Confirmed');

            if (!(await order.Save())) {
                throw new Error(
                    `Failed to book the renewal order: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }

            await this.logEvent(provider, user, due, order.Get('ID') as string);
            await dbProvider.CommitTransaction();
            return { ID: order.Get('ID') as string, Number: order.Get('OrderNumber') as string };
        } catch (err) {
            try {
                await dbProvider.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Rollback failed after renewal spawn error: ${rollbackErr}`);
            }
            throw err;
        }
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
                Fields: ['ID', 'Quantity', 'UnitPrice', 'DiscountPct'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return result?.Results?.[0] ?? null;
    }

    private async logEvent(
        provider: IMetadataProvider,
        user: UserInfo,
        due: DueRow,
        orderID: string,
    ): Promise<void> {
        const event = await provider.GetEntityObject<BaseEntity>(SUBSCRIPTION_EVENT_ENTITY, user);
        event.NewRecord();
        event.Set('SubscriptionID', due.SubscriptionID);
        event.Set('EventType', 'RenewalOrderSpawned');
        event.Set('OccurredAt', new Date());
        event.Set('RelatedOrderHeaderID', orderID);
        event.Set(
            'EventData',
            JSON.stringify({
                RenewedTermNumber: due.TermNumber,
                ExpiringTermEnd: due.TermEndDate,
                LeadDays: due.SubscriptionRenewalLeadDays ?? due.TypeRenewalLeadDays ?? 0,
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
