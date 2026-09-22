/**
 * `Orders.PostDueRecognition` — recognition built at post time rather than staged at booking (D92 §8).
 *
 * WHAT THIS REPLACES, AND WHY. D14 wrote a deferred line's whole release schedule as forward-dated
 * journal entries inside the booking transaction: twelve entries for a twelve-month subscription,
 * all present on the day the order was confirmed. It was a genuinely good property — the ledger held
 * the future and no job was needed — and it is given up on purpose, because it made the ledger
 * assert revenue for months nobody had reached. A term amended, a line reversed or an order
 * cancelled in month three left nine entries already standing against months four to twelve, and
 * unwinding them is a second mechanism that only ever runs on the unhappy path.
 *
 * The schedule itself is unchanged. Each driver still answers when its slices are earned, and
 * `EarnedThrough` is derived from that same `BuildSchedule`, so this pass produces the same amounts
 * on the same dates the staging produced. Only the moment they are written moves.
 *
 * CUMULATIVE, LIKE THE PROGRESS CATCH-UP IT GENERALISES. Each line is asked what its driver says is
 * earned through `AsOf`, and the difference from the line's `RecognizedToDate` is what posts. That
 * one subtraction covers every case a per-period design needs separate handling for: a back-dated
 * term catches up in a single run, a month the job did not run is picked up by the next one, and a
 * run against a database that has never had this pass applied recognises everything owing at once.
 * Running it twice for the same date is a no-op, because the second pass finds a zero delta.
 *
 * ONE TRANSACTION PER LINE, deliberately, not one for the pass. A monthly run touches every open
 * subscription in the book; a single transaction would hold locks across all of them and lose the
 * whole month's work to one bad line. Each line's entry and its `RecognizedToDate` still commit
 * together — that pair is what must never come apart — and a line that fails is reported with its
 * reason while the rest of the pass continues.
 *
 * FAILURE MODEL: a line that cannot post is recorded against its own row in `Lines` and the pass
 * reports `Success: false` at the end, so an unattended job that renewed nobody does not write a
 * green run record. Only genuine faults throw.
 *
 * IT DOES NOT DRAIN THE FACTORY'S ACCUMULATORS, and that is not an oversight. `DrainRecognized` and
 * `DrainBilled` exist because `BuildDrafts` records what a BOOKING recognised and billed so the
 * caller can advance the totals inside the same transaction. This pass never calls `BuildDrafts` —
 * only `BuildProgressDraft`, which touches neither map — and it constructs a fresh factory per line,
 * so the reuse assertion cannot fire and there is nothing to drain. Adding drains here would be dead
 * code that reads like a safeguard.
 *
 * CONNECTS TO:
 *   DRIVERS:  RevenueRecognitionDriver.EarnedThrough (./RevenueRecognition.ts)
 *   DRAFT:    OrderJournalEntryFactory.BuildProgressDraft (./OrderJournalEntryFactory.ts) — rule 2
 *   SCHEDULE: the Action + ScheduledJob rows in metadata/, which run this monthly
 */
import { BaseRemotableOperation, DatabaseProviderBase, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    LoadOrdersEngine,
    OrdersEngine,
    OrdersPostDueRecognitionOperation as OrdersPostDueRecognitionOperationBase,
    ToISODate,
    type mjBizAppsOrdersOrderHeaderEntity,
    type mjBizAppsOrdersOrderLineEntity,
    type OrdersPostDueRecognitionInput,
    type OrdersPostDueRecognitionLine,
    type OrdersPostDueRecognitionOutput,
} from '@mj-biz-apps/orders-entities';
import { BuildGLAccountResolver, EntityIDFor } from './AccountingBridge.js';
import { ORDER_HEADER_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { OrderJournalEntryFactory, type JEDraft } from './OrderJournalEntryFactory.js';
import { RevenueRecognitionDriver, type RevRecContext } from './RevenueRecognition.js';
import { RequireDate, RequireOptionalUUID } from './sql-guards.js';
import { ResolveRevenueRecognitionTypeID, SubscriptionBehavior, SubscriptionTypeRulesFrom } from './SubscriptionBehavior.js';

/** Not in `entity-names.ts`: these are the factory constructor's arguments, not this file's reads. */
const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const CHARGE_TYPE_ENTITY = 'MJ_BizApps_Orders: Charge Types';

const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** One line as the pass reads it, before any driver is asked anything. */
interface CandidateLine {
    ID: string;
    OrderHeaderID: string;
    ProductID: string;
    LineNumber: number;
    Quantity: number;
    LineTotalNet: number | null;
    RecognizedToDate: number | null;
    ServicePeriodStart: Date | string | null;
    ServicePeriodEnd: Date | string | null;
}

/** The term a line bought, when it bought one — the authority on its coverage window. */
interface TermFacts {
    ID: string;
    Amount: number;
    StartDate: Date | string;
    EndDate: Date | string;
    SubscriptionID: string | null;
    /** Read from the subscription, which stamped it when it was created — not from the product. */
    SubscriptionTypeID?: string | null;
}

interface CreateJournalEntriesResult {
    Success: boolean;
    Errors?: Array<{ Code?: string; Message?: string }>;
    Results?: Array<{ JournalEntryID?: string }>;
}

@RegisterClass(BaseRemotableOperation, 'Orders.PostDueRecognition')
export class PostDueRecognitionOperation extends OrdersPostDueRecognitionOperationBase {
    protected async InternalExecute(
        input: OrdersPostDueRecognitionInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersPostDueRecognitionOutput> {
        // Both reach SQL filter text below, so they are validated at the boundary rather than
        // wherever they happen to be interpolated.
        const asOf = RequireDate(input?.AsOf, 'AsOf');
        RequireOptionalUUID(input?.OrderHeaderID, 'OrderHeaderID');
        const preview = !!input?.Preview;

        await LoadOrdersEngine(provider, user);
        const lines = await this.dueLines(provider, user, input?.OrderHeaderID);
        const termsByLine = await this.termsFor(lines, provider, user);

        const out: OrdersPostDueRecognitionOutput = {
            Success: true,
            Preview: preview,
            AsOf: asOf,
            Considered: lines.length,
            Posted: 0,
            Failed: 0,
            Lines: [],
        };

        for (const line of lines) {
            const movement = this.movementFor(line, termsByLine.get(line.ID.toLowerCase()), asOf);
            // A LINE WITH NOTHING TO POST IS NOT LISTED. On a steady month most lines move, but a
            // re-run for the same date moves none of them, and a report of five hundred zeroes is a
            // report nobody reads — which is how the one line that did fail gets missed.
            if (movement === null || movement.Amount === 0) continue;

            const row: OrdersPostDueRecognitionLine = {
                OrderLineID: line.ID,
                LineNumber: line.LineNumber,
                EarnedThrough: movement.Earned,
                RecognizedBefore: movement.Before,
                Amount: movement.Amount,
            };
            out.Lines!.push(row);
            if (preview) continue;

            try {
                row.JournalEntryID = await this.post(line, movement.Amount, asOf, provider, user);
                out.Posted!++;
            } catch (err) {
                // One line's failure must not stop the pass: an unattended monthly job that aborts
                // on the first bad row silently stops recognising everyone behind it.
                const message = err instanceof Error ? err.message : String(err);
                LogError(`Orders.PostDueRecognition: order line ${line.ID} failed: ${message}`);
                row.FailedReason = message;
                out.Failed!++;
            }
        }

        out.Success = out.Failed === 0;
        out.Message = preview
            ? `${out.Lines!.length} line(s) would recognise revenue through ${asOf}; nothing was written.`
            : `${out.Posted} line(s) recognised revenue through ${asOf}` +
              (out.Failed ? `; ${out.Failed} could not post (every reason is on Lines).` : '.');
        return out;
    }

    // ─── Reads ─────────────────────────────────────────────────────────────────

    /**
     * Every confirmed line whose revenue recognition type is deferred and time-driven.
     *
     * `ScheduleBasis = 'OnMeasurement'` is excluded because a progress line's earned-to-date is not
     * a function of the date at all — `Orders.RecordProgress` is the only thing that can answer it,
     * and asking a driver from the other family would be asking the wrong question, not getting a
     * wrong answer to the right one.
     *
     * A REVERSAL LINE IS ORDINARY HERE. It has its own negative amount and its own totals, and its
     * entry mirrors like every other reversal, so it needs no branch — see `movementFor`.
     */
    private async dueLines(
        provider: IMetadataProvider,
        user: UserInfo,
        orderHeaderID?: string,
    ): Promise<CandidateLine[]> {
        const engine = OrdersEngine.Instance;
        const deferredTypeIDs = new Set(
            engine.RevenueRecognitionTypes.filter((t) => t.IsDeferred && t.ScheduleBasis === 'AtBooking').map((t) =>
                t.ID.toLowerCase(),
            ),
        );
        if (!deferredTypeIDs.size) return [];

        // Which PRODUCTS resolve to one of those types, decided the way booking decides it: the
        // product's own type, else its product type's default. Done here rather than in SQL because
        // that fallback lives in one function and a second copy of it in a WHERE clause is a second
        // thing to keep true.
        const productIDs = engine.Products.filter((p) => {
            const id = ResolveRevenueRecognitionTypeID(
                p.RevenueRecognitionTypeID,
                engine.ProductTypeByID(p.ProductTypeID)?.DefaultRevenueRecognitionTypeID,
            );
            return id != null && deferredTypeIDs.has(id.toLowerCase());
        }).map((p) => p.ID.toLowerCase());
        if (!productIDs.length) return [];

        const inList = productIDs.map((id) => `'${id}'`).join(',');
        const scope = orderHeaderID ? ` AND OrderHeaderID = '${orderHeaderID}'` : '';
        const result = await RunView.FromMetadataProvider(provider).RunView<CandidateLine>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter:
                    `ProductID IN (${inList})${scope} AND OrderHeaderID IN ` +
                    `(SELECT ID FROM __mj_BizAppsOrders.vwOrderHeaders WHERE ConfirmedAt IS NOT NULL)`,
                Fields: [
                    'ID',
                    'OrderHeaderID',
                    'ProductID',
                    'LineNumber',
                    'Quantity',
                    'LineTotalNet',
                    'RecognizedToDate',
                    'ServicePeriodStart',
                    'ServicePeriodEnd',
                ],
                OrderBy: 'OrderHeaderID, LineNumber',
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        if (!result.Success) {
            throw new Error(`Could not read the lines due for recognition: ${result.ErrorMessage ?? 'unknown error'}`);
        }
        return result.Results ?? [];
    }

    /** The subscription term each line bought, keyed by lower-cased line id. Lines without one are absent. */
    private async termsFor(
        lines: CandidateLine[],
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<Map<string, TermFacts>> {
        const out = new Map<string, TermFacts>();
        if (!lines.length) return out;

        const inList = lines.map((l) => `'${l.ID}'`).join(',');
        const result = await RunView.FromMetadataProvider(provider).RunView<TermFacts & { OrderLineID: string }>(
            {
                EntityName: SUBSCRIPTION_TERM_ENTITY,
                ExtraFilter: `OrderLineID IN (${inList})`,
                Fields: ['ID', 'OrderLineID', 'Amount', 'StartDate', 'EndDate', 'SubscriptionID'],
                ResultType: 'simple',
            },
            user,
        );
        if (!result.Success) {
            throw new Error(`Could not read the subscription terms for these lines: ${result.ErrorMessage ?? 'unknown error'}`);
        }
        for (const row of result.Results ?? []) out.set(row.OrderLineID.toLowerCase(), row);
        await this.attachSubscriptionTypes(out, provider, user);
        return out;
    }

    /**
     * Stamp each term with the type of the subscription it belongs to.
     *
     * FROM THE SUBSCRIPTION, NOT FROM THE PRODUCT. The product's current `SubscriptionTypeID` answers
     * "what would this purchase get if it were made today", which is the wrong question for a term
     * that was sold months ago: re-point a product and every open term would start recognising on a
     * cadence its sale never used. The subscription stamped its type when it was created. Same
     * reasoning as `OrderEntityServer.inheritReversalCadence`.
     */
    private async attachSubscriptionTypes(
        terms: Map<string, TermFacts>,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<void> {
        const ids = [...new Set([...terms.values()].map((t) => t.SubscriptionID).filter((id): id is string => !!id))];
        if (!ids.length) return;
        const result = await RunView.FromMetadataProvider(provider).RunView<{ ID: string; SubscriptionTypeID: string }>(
            {
                EntityName: SUBSCRIPTION_ENTITY,
                ExtraFilter: `ID IN (${ids.map((id) => `'${id}'`).join(',')})`,
                Fields: ['ID', 'SubscriptionTypeID'],
                ResultType: 'simple',
            },
            user,
        );
        if (!result.Success) {
            throw new Error(`Could not read the subscriptions behind these terms: ${result.ErrorMessage ?? 'unknown error'}`);
        }
        const typeBySubscription = new Map<string, string>();
        for (const row of result.Results ?? []) typeBySubscription.set(row.ID.toLowerCase(), row.SubscriptionTypeID);
        for (const term of terms.values()) {
            if (term.SubscriptionID) term.SubscriptionTypeID = typeBySubscription.get(term.SubscriptionID.toLowerCase()) ?? null;
        }
    }

    // ─── The arithmetic ────────────────────────────────────────────────────────

    /**
     * What this line should post as at `asOf`: earned-to-date less recognised-to-date, as magnitudes.
     *
     * MAGNITUDES, because a reversal line stores both totals negative so that an origin and its
     * reversals net to zero for reporting. The rule and the driver both work on the size of the
     * movement, and the direction is carried by the line itself — `BuildProgressDraft` mirrors on the
     * line's sign, so a reversal line's forward catch-up posts as an unrecognition without any branch
     * here. Returns `null` when the line cannot be asked (no driver, or a window it needs and lacks).
     */
    private movementFor(
        line: CandidateLine,
        term: TermFacts | undefined,
        asOf: string,
    ): { Earned: number; Before: number; Amount: number } | null {
        const engine = OrdersEngine.Instance;
        const product = engine.ProductByID(line.ProductID);
        if (!product) return null;
        const typeID = ResolveRevenueRecognitionTypeID(
            product.RevenueRecognitionTypeID,
            engine.ProductTypeByID(product.ProductTypeID)?.DefaultRevenueRecognitionTypeID,
        );
        const revRec = typeID
            ? engine.RevenueRecognitionTypes.find((t) => t.ID.toLowerCase() === typeID.toLowerCase())
            : null;
        if (!revRec) return null;

        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<RevenueRecognitionDriver>(
            RevenueRecognitionDriver,
            revRec.DriverClass,
        );
        if (!driver) return null;

        const context: RevRecContext = {
            Amount: money(Math.abs(Number(term ? term.Amount : (line.LineTotalNet ?? 0)))),
            // The booking date is only consulted by UpFront, whose entry is the service period's own
            // start on a line that has one; a deferred type always has a window.
            BookingDate: new Date(term ? term.StartDate : (line.ServicePeriodStart ?? asOf)),
            ServicePeriodStart: term ? new Date(term.StartDate) : toDate(line.ServicePeriodStart),
            ServicePeriodEnd: term ? new Date(term.EndDate) : toDate(line.ServicePeriodEnd),
            ProductName: product.Name,
            PeriodMonths: this.recognitionMonths(term),
        };

        let earned: number;
        try {
            earned = driver.EarnedThrough(context, new Date(`${asOf}T00:00:00`));
        } catch {
            // A line whose driver cannot answer — a deferred type on a line with no coverage window —
            // is skipped rather than failed. It has never recognised anything and a monthly pass is
            // not where that misconfiguration should surface; booking already refused to stage it.
            return null;
        }

        const before = money(Math.abs(Number(line.RecognizedToDate ?? 0)));
        return { Earned: earned, Before: before, Amount: money(earned - before) };
    }

    /**
     * How many months each recognition slice covers, from the subscription type the term was sold on.
     *
     * Through `SubscriptionBehavior`, so a type whose driver overrides `RecognitionMonths` recognises
     * on the cadence it actually sold. Undefined for a line with no term, which is the driver's own
     * default of one month — the same answer booking gave it.
     */
    private recognitionMonths(term: TermFacts | undefined): number | undefined {
        if (!term?.SubscriptionTypeID) return undefined;
        const typeRow = OrdersEngine.Instance.SubscriptionTypeByID(term.SubscriptionTypeID);
        if (!typeRow) return undefined;
        const rules = SubscriptionTypeRulesFrom(typeRow);
        const behavior = rules.DriverClass
            ? MJGlobal.Instance.ClassFactory.CreateInstance<SubscriptionBehavior>(SubscriptionBehavior, rules.DriverClass)
            : new SubscriptionBehavior();
        return (behavior ?? new SubscriptionBehavior()).RecognitionMonths(rules);
    }

    // ─── Writes ────────────────────────────────────────────────────────────────

    /**
     * Book one line's movement and advance its `RecognizedToDate`, in one transaction.
     *
     * The entry is `BuildProgressDraft`'s, unchanged: rule 2 decides the contra accounts from the
     * line's own billed and recognised totals, and the finished entry mirrors on the line's sign.
     * Percentage-of-completion and this pass therefore produce the same shape of entry from the same
     * code — which is the point, since they are the same accounting event arrived at two ways.
     */
    private async post(
        line: CandidateLine,
        amount: number,
        asOf: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<string> {
        const entity = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
        if (!(await entity.Load(line.ID))) throw new Error(`Order line ${line.ID} could not be loaded.`);
        const order = await provider.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(ORDER_HEADER_ENTITY, user);
        if (!(await order.Load(line.OrderHeaderID))) {
            throw new Error(`Order line ${line.ID} belongs to an order that could not be read.`);
        }

        const draft = await this.draftFor(order, entity, amount, asOf, provider, user);
        const dbProvider = provider as unknown as DatabaseProviderBase;
        await dbProvider.BeginTransaction();
        try {
            const journalEntryID = await this.createJournalEntry(draft, provider, user);
            entity.RecognizedToDate = money(Number(entity.RecognizedToDate ?? 0) + signedFor(entity, amount));
            if (!(await entity.Save())) {
                throw new Error(
                    entity.LatestResult?.CompleteMessage ??
                        `RecognizedToDate could not be advanced on order line ${line.ID}.`,
                );
            }
            await dbProvider.CommitTransaction();
            return journalEntryID;
        } catch (err) {
            try {
                await dbProvider.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Rollback failed after PostDueRecognition error on line ${line.ID}: ${rollbackErr}`);
            }
            throw err;
        }
    }

    private async draftFor(
        order: mjBizAppsOrdersOrderHeaderEntity,
        line: mjBizAppsOrdersOrderLineEntity,
        amount: number,
        asOf: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<JEDraft> {
        const factory = new OrderJournalEntryFactory(
            await BuildGLAccountResolver(provider, user),
            EntityIDFor(ORDER_LINE_ENTITY),
            EntityIDFor(SUBSCRIPTION_TERM_ENTITY),
            EntityIDFor(CHARGE_TYPE_ENTITY),
            provider,
            user,
        );
        return factory.BuildProgressDraft(order, line, amount, asOf, `earned through ${asOf}`);
    }

    /** Same op, same envelope-then-payload check as every other writer of entries here. */
    private async createJournalEntry(draft: JEDraft, provider: IMetadataProvider, user: UserInfo): Promise<string> {
        const op = MJGlobal.Instance.ClassFactory.CreateInstance<
            BaseRemotableOperation<{ Drafts: unknown[] }, CreateJournalEntriesResult>
        >(BaseRemotableOperation, 'Accounting.CreateJournalEntries');
        if (!op) {
            throw new Error(
                `The 'Accounting.CreateJournalEntries' operation is not registered. The BizApps Accounting server package must be loaded before recognition can post.`,
            );
        }
        const result = await op.Execute({ Drafts: [draft] }, { provider, user });
        if (!result.Success) {
            throw new Error(
                `Accounting.CreateJournalEntries did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown error'}`,
            );
        }
        const payload = result.Output;
        if (!payload) throw new Error('Accounting.CreateJournalEntries returned no payload.');
        if (!payload.Success) {
            throw new Error(
                `The recognition entry was refused. ${(payload.Errors ?? []).map((e) => `${e.Code ?? 'ERROR'}: ${e.Message ?? ''}`).join('; ')}`,
            );
        }
        const id = payload.Results?.[0]?.JournalEntryID;
        if (!id) throw new Error('Accounting reported success but returned no journal entry.');
        return id;
    }
}

/** A reversal line's totals run negative, so its movement is subtracted rather than added. */
function signedFor(line: mjBizAppsOrdersOrderLineEntity, amount: number): number {
    return Number(line.Quantity) < 0 ? -amount : amount;
}

function toDate(value: Date | string | null): Date | null {
    if (!value) return null;
    const iso = ToISODate(value);
    return iso ? new Date(`${iso}T00:00:00`) : null;
}

/** Tree-shaking anchor — the decorator must run before anything can resolve this key. */
export function LoadPostDueRecognitionOperation(): void {
    void PostDueRecognitionOperation;
}
