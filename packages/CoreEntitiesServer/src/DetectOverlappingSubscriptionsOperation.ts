/**
 * Orders.DetectOverlappingSubscriptions — finance exception type 5, OVERLAPPING_SUBSCRIPTION (golive #279).
 *
 * Booking can leave one holder with two live subscriptions covering the same dates, and each is then
 * billed and recognized twice until someone cancels one. The saved query "Overlapping Subscriptions"
 * lists those pairs; this runs it nightly and raises one finance exception per pair, so the pair
 * lands on finance's month-end review list instead of waiting for someone to open the query.
 *
 * WHAT IT RAISES, per the finance exception contract:
 *   source record   the LATER subscription of the pair (the one the overlap created)
 *   DedupeKey       `<EarlierSubscriptionID>|<LaterSubscriptionID>`, so a re-run raises nothing new
 *   ExceptionDate   business today (or the caller's AsOfDate)
 *   Amount          the later subscription's overlapping term amount
 *   creator         the user who confirmed the order that booked the later subscription. When that
 *                   is not recorded — the order was confirmed before `ConfirmedByUserID` existed, or
 *                   the subscription has no order — the exception has NO creator restriction, the
 *                   same as a never-attested progress line or a deal with no owner. It is not raised
 *                   as unresolved: a booked order's confirmer can never be filled in afterwards, so
 *                   an unresolved row could never be cleared and its month never close.
 *
 * AN ACKNOWLEDGED BAND OVERLAP IS NOT RAISED. A SameFamily pair whose later line set
 * `AcknowledgesCoverageOverlap` was confirmed by someone told that both would be billed; raising it
 * would put a decision already made back on finance's list. The query still lists it, flagged.
 * SameProduct and SameCategory pairs are raised whatever the flag says: the acknowledgment is offered
 * only for another band of the same family, so on those pairs it acknowledges nothing.
 *
 * SETTINGS COME FROM THE EXCEPTION TYPE and nowhere else. A missing or inactive
 * OVERLAPPING_SUBSCRIPTION type means the check does not run; a configuration without a boolean
 * `IncludeSameCategory` is refused rather than defaulted, because a default here would decide on
 * finance's behalf whether bands of one product count as overlaps.
 *
 * ACCOUNTING IS RESOLVED BY NAME through AccountingBridge.ts, which holds the finance exception
 * contract for every orders detector — no build-time dependency on the accounting server package.
 * An unregistered operation throws. Both the envelope and the payload are checked.
 *
 * A FAILED RAISE IS REPORTED, NOT SWALLOWED. The pairs are raised in batches; a batch accounting
 * refuses is recorded in `Errors`, the remaining batches still run (a nightly job reports and
 * continues), and `Success` is false so the scheduled run is not green.
 *
 * CONNECTS TO:
 *   QUERY:   metadata/queries/SQL/overlapping-subscriptions.sql ("Overlapping Subscriptions", category Orders)
 *   OPS:     'Accounting.GetFinanceExceptionTypes', 'Accounting.RaiseFinanceExceptions' (bizapps-accounting)
 *   ACTION:  packages/Server/src/custom/detect-overlapping-subscriptions.action.ts (the scheduler's way in)
 */
import {
    BaseRemotableOperation,
    IMetadataProvider,
    IRunQueryProvider,
    LogStatus,
    RunQuery,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersDetectOverlappingSubscriptionsOperation as OrdersDetectOverlappingSubscriptionsOperationBase,
    ToISODate,
    type OrdersDetectOverlappingSubscriptionsInput,
    type OrdersDetectOverlappingSubscriptionsOutput,
    type OverlappingSubscriptionsDetectionError,
} from '@mj-biz-apps/orders-entities';
import {
    GetActiveFinanceExceptionType,
    ResolveAccountingOperation,
    type FinanceExceptionToRaise,
    type RaiseFinanceExceptionsOutcome,
} from './AccountingBridge.js';
import { CalendarDayOrToday } from './calendar-day.js';
import { RequireOptionalDay, RequireUUIDs } from './sql-guards.js';

export const OVERLAPPING_SUBSCRIPTION_TYPE_CODE = 'OVERLAPPING_SUBSCRIPTION';
export const OVERLAPPING_SUBSCRIPTIONS_QUERY = 'Overlapping Subscriptions';
export const OVERLAPPING_SUBSCRIPTIONS_QUERY_CATEGORY = 'Orders';
const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';

/** Pairs sent to accounting per call. A refused batch loses only its own pairs for the night. */
const RAISE_BATCH_SIZE = 100;
/** Order ids per `IN (...)` read of `ConfirmedByUserID`. */
const ORDER_READ_BATCH_SIZE = 500;

/** One row of the "Overlapping Subscriptions" query — the columns this check reads. */
export interface OverlappingSubscriptionRow {
    CompanyID: string;
    MatchBasis: 'SameProduct' | 'SameFamily' | 'SameCategory';
    OverlapStart: Date | string | null;
    OverlapEnd: Date | string | null;
    EarlierSubscriptionID: string;
    EarlierSubscriptionNumber: string | null;
    LaterSubscriptionID: string;
    LaterSubscriptionNumber: string | null;
    LaterOrderHeaderID: string | null;
    LaterOverlappingTermsAmount: number | null;
    /** The later subscription's `OrderLine.AcknowledgesCoverageOverlap`. */
    LaterOverlapAcknowledged?: boolean | null;
}

// ─── The decisions, as pure functions ─────────────────────────────────────────────────────────────

/**
 * The type's `IncludeSameCategory` setting, or an error message when the configuration does not
 * state it as a boolean. Never defaulted — see the header.
 */
export function ReadIncludeSameCategory(configuration: Record<string, unknown> | null | undefined): boolean | string {
    const value = configuration?.IncludeSameCategory;
    if (typeof value === 'boolean') return value;
    return (
        `The ${OVERLAPPING_SUBSCRIPTION_TYPE_CODE} exception type's Configuration must set IncludeSameCategory ` +
        `to true or false; it has ${value === undefined ? 'no such setting' : JSON.stringify(value)}.`
    );
}

/**
 * The pairs to raise: every row, less acknowledged SameFamily pairs, and less the SameCategory ones
 * when the type excludes them.
 */
export function PairsToRaise(rows: OverlappingSubscriptionRow[], includeSameCategory: boolean): OverlappingSubscriptionRow[] {
    return rows.filter(
        (row) =>
            !(row.MatchBasis === 'SameFamily' && row.LaterOverlapAcknowledged) &&
            (includeSameCategory || row.MatchBasis !== 'SameCategory'),
    );
}

export function OverlapDedupeKey(row: Pick<OverlappingSubscriptionRow, 'EarlierSubscriptionID' | 'LaterSubscriptionID'>): string {
    return `${row.EarlierSubscriptionID}|${row.LaterSubscriptionID}`;
}

/**
 * The exception for one pair.
 *
 * @param confirmedBy - `ConfirmedByUserID` of each later order that has one, keyed by order id
 *                      (upper-cased). A pair whose later order is absent from it — or that has no
 *                      order — is raised with no creator restriction.
 */
export function BuildOverlapException(
    row: OverlappingSubscriptionRow,
    confirmedBy: ReadonlyMap<string, string>,
    exceptionDate: string,
): FinanceExceptionToRaise {
    const creator = row.LaterOrderHeaderID ? confirmedBy.get(row.LaterOrderHeaderID.toUpperCase()) ?? null : null;
    const later = row.LaterSubscriptionNumber ?? row.LaterSubscriptionID;
    const earlier = row.EarlierSubscriptionNumber ?? row.EarlierSubscriptionID;
    const basis =
        row.MatchBasis === 'SameProduct'
            ? 'the same product'
            : row.MatchBasis === 'SameFamily'
              ? 'another band of the same subscription family'
              : 'a product in the same category with the same subscription type';
    const window = `${ToISODate(row.OverlapStart) ?? '?'} to ${ToISODate(row.OverlapEnd) ?? '?'}`;
    return {
        TypeCode: OVERLAPPING_SUBSCRIPTION_TYPE_CODE,
        SourceEntityName: SUBSCRIPTION_ENTITY,
        SourceRecordID: row.LaterSubscriptionID,
        CompanyID: row.CompanyID,
        Amount: row.LaterOverlappingTermsAmount ?? null,
        ExceptionDate: exceptionDate,
        Summary:
            `Subscription ${later} overlaps subscription ${earlier} for the same holder from ${window}: ` +
            `${basis}, so the overlap is billed and recognized twice unless one is cancelled.`,
        DedupeKey: OverlapDedupeKey(row),
        SourceCreatedByUserID: creator,
        CreatorUnresolved: false,
    };
}

function describeErrors(errors: Array<{ Code: string; Message: string }> | undefined): string {
    return (errors ?? []).map((e) => `${e.Code}: ${e.Message}`).join('; ') || 'no reason given';
}

@RegisterClass(BaseRemotableOperation, 'Orders.DetectOverlappingSubscriptions')
export class DetectOverlappingSubscriptionsOperation extends OrdersDetectOverlappingSubscriptionsOperationBase {
    protected async InternalExecute(
        input: OrdersDetectOverlappingSubscriptionsInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersDetectOverlappingSubscriptionsOutput> {
        // A day the caller named and we cannot read is refused, never replaced with today: that is
        // the one wrong answer that looks right.
        RequireOptionalDay(input.AsOfDate, 'AsOfDate');
        const exceptionDate = ToISODate(await CalendarDayOrToday(input.AsOfDate, provider, user)) as string;

        const out: OrdersDetectOverlappingSubscriptionsOutput = {
            Success: true,
            TypeActive: false,
            ExceptionDate: exceptionDate,
            PairsFound: 0,
            PairsConsidered: 0,
            Created: 0,
            AlreadyRaised: 0,
            Skipped: 0,
            Errors: [],
        };

        // Null when accounting has no such type or has switched it off; the bridge logs which.
        const type = await GetActiveFinanceExceptionType(OVERLAPPING_SUBSCRIPTION_TYPE_CODE, provider, user);
        if (!type) {
            out.Message = `The ${OVERLAPPING_SUBSCRIPTION_TYPE_CODE} finance exception type is not defined or is inactive; nothing was checked.`;
            LogStatus(`Orders.DetectOverlappingSubscriptions: ${out.Message}`);
            return out;
        }
        out.TypeActive = true;

        const includeSameCategory = ReadIncludeSameCategory(type.Configuration);
        if (typeof includeSameCategory === 'string') {
            out.Success = false;
            out.Errors.push({ Code: 'INVALID_CONFIGURATION', Message: includeSameCategory });
            out.Message = includeSameCategory;
            return out;
        }

        const rows = await this.runOverlapQuery(provider, user);
        out.PairsFound = rows.length;
        const pairs = PairsToRaise(rows, includeSameCategory);
        out.PairsConsidered = pairs.length;
        if (pairs.length === 0) {
            out.Message = `No overlapping subscriptions to raise (${rows.length} pair(s) found).`;
            return out;
        }

        const confirmedBy = await this.loadConfirmers(pairs, provider, user);
        const exceptions = pairs.map((row) => BuildOverlapException(row, confirmedBy, exceptionDate));

        for (let start = 0; start < exceptions.length; start += RAISE_BATCH_SIZE) {
            await this.raiseBatch(exceptions.slice(start, start + RAISE_BATCH_SIZE), out, provider, user);
        }

        out.Success = out.Errors.length === 0;
        out.Message =
            `${pairs.length} overlapping pair(s) as of ${exceptionDate}: ${out.Created} exception(s) raised, ` +
            `${out.AlreadyRaised} already raised, ${out.Skipped} skipped` +
            (out.Errors.length ? `, ${out.Errors.length} error(s) — see Errors.` : '.');
        return out;
    }

    private async runOverlapQuery(provider: IMetadataProvider, user: UserInfo): Promise<OverlappingSubscriptionRow[]> {
        const result = await new RunQuery(provider as unknown as IRunQueryProvider).RunQuery(
            { QueryName: OVERLAPPING_SUBSCRIPTIONS_QUERY, CategoryPath: OVERLAPPING_SUBSCRIPTIONS_QUERY_CATEGORY },
            user,
        );
        if (!result.Success) {
            throw new Error(`The '${OVERLAPPING_SUBSCRIPTIONS_QUERY}' query failed: ${result.ErrorMessage || 'unknown error'}`);
        }
        return (result.Results ?? []) as OverlappingSubscriptionRow[];
    }

    /** `ConfirmedByUserID` of each later order that has one, keyed by upper-cased order id. */
    private async loadConfirmers(
        pairs: OverlappingSubscriptionRow[],
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<Map<string, string>> {
        const orderIDs = [...new Set(pairs.map((p) => p.LaterOrderHeaderID).filter((id): id is string => !!id))];
        const confirmedBy = new Map<string, string>();
        const rv = RunView.FromMetadataProvider(provider);
        for (let start = 0; start < orderIDs.length; start += ORDER_READ_BATCH_SIZE) {
            const ids = RequireUUIDs(orderIDs.slice(start, start + ORDER_READ_BATCH_SIZE), 'LaterOrderHeaderID');
            const result = await rv.RunView<{ ID: string; ConfirmedByUserID: string | null }>(
                {
                    EntityName: ORDER_HEADER_ENTITY,
                    ExtraFilter: `ID IN (${ids.map((id) => `'${id}'`).join(',')})`,
                    Fields: ['ID', 'ConfirmedByUserID'],
                    ResultType: 'simple',
                },
                user,
            );
            if (!result.Success) {
                throw new Error(`Could not read who confirmed the later orders: ${result.ErrorMessage || 'unknown error'}`);
            }
            for (const order of result.Results) {
                if (order.ConfirmedByUserID) confirmedBy.set(order.ID.toUpperCase(), order.ConfirmedByUserID);
            }
        }
        return confirmedBy;
    }

    private async raiseBatch(
        batch: FinanceExceptionToRaise[],
        out: OrdersDetectOverlappingSubscriptionsOutput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<void> {
        const op = ResolveAccountingOperation<{ Exceptions: FinanceExceptionToRaise[] }, RaiseFinanceExceptionsOutcome>(
            'Accounting.RaiseFinanceExceptions',
            'raise finance exceptions',
        );
        const result = await op.Execute({ Exceptions: batch }, { provider, user });
        if (!result.Success || !result.Output) {
            const message = `Accounting.RaiseFinanceExceptions did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'no payload'}`;
            out.Errors.push(...batch.map((e): OverlappingSubscriptionsDetectionError => ({ DedupeKey: e.DedupeKey, Code: 'RAISE_FAILED', Message: message })));
            return;
        }

        const payload = result.Output;
        if (!payload.Success) {
            // The contract: an error for any index fails the whole call and writes nothing, so every
            // pair in the batch is unraised. The ones accounting named carry their own reason.
            const byIndex = new Map((payload.Errors ?? []).filter((e) => e.Index != null).map((e) => [e.Index as number, e]));
            const general = (payload.Errors ?? []).filter((e) => e.Index == null);
            batch.forEach((e, index) => {
                const own = byIndex.get(index);
                out.Errors.push({
                    DedupeKey: e.DedupeKey,
                    Code: own?.Code ?? general[0]?.Code ?? 'RAISE_FAILED',
                    Message: own?.Message ?? `Not raised: the batch was refused. ${describeErrors(payload.Errors)}`,
                });
            });
            return;
        }

        for (const r of payload.Results) {
            if (r.Skipped) out.Skipped++;
            else if (r.Created) out.Created++;
            else out.AlreadyRaised++;
        }
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the key resolves to nothing. */
export function LoadDetectOverlappingSubscriptionsOperation(): void {
    void DetectOverlappingSubscriptionsOperation;
}
