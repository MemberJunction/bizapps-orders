/**
 * `Orders.RecordProgress` — one attested progress observation, and the catch-up it posts (D90; W10).
 *
 * WHY THIS IS NOT A FOURTH REV-REC DRIVER. The three shipped drivers compute their whole schedule at
 * booking. Percentage-of-completion cannot: how much is earned depends on what is known about progress
 * NOW. So a POC line books to Deferred Revenue and stages nothing, and each observation recorded here
 * posts the difference between what the observation says should be recognised to date and what
 * already is (plan §9.2):
 *
 *     target = LineTotalNet × PercentComplete
 *     delta  = target − the line's RecognizedToDate
 *
 *     delta > 0   Cr Sales |delta|, debiting Deferred Revenue then Unbilled Receivable (rule 2)
 *     delta < 0   the same entry mirrored — never negated
 *     delta = 0   no entry — a legitimate outcome, not a failure
 *
 * A backward slide is not a feature; it is what the subtraction does. At 100% the target IS the line
 * amount, so the last catch-up lands the remaining cent whatever the rounding history.
 *
 * WHICH CONTRA ACCOUNT IS NOT THIS OPERATION'S CHOICE (D92). It follows from the gap between what
 * the line has been billed and what it has earned: `SplitContraLegs` relieves the deferred balance
 * first and opens Unbilled Receivable — a contract asset — for anything beyond it. A project billed
 * quarterly in advance never opens Unbilled; one attested ahead of its instalments does, and the
 * next invoice closes it again under rule 1. See `OrderJournalEntryFactory.BuildProgressDraft`.
 *
 * THE LINE'S `RecognizedToDate` IS THE AUTHORITY on what is already recognised, and this operation
 * advances it in the same transaction as the entry. Summing the observation rows would have given
 * the same answer while progress was the only thing that recognised revenue on a POC line; it stops
 * being true the moment any other path posts recognition against the same line.
 *
 * THE OBSERVATION IS AN ATTESTATION, NOT A MEASUREMENT. The number may come from anywhere, but a named
 * person signs it, and the entry names the observation and the signer. A posted observation is
 * immutable (trigger); corrections happen forward, in the next period.
 *
 * SUPERSEDE IS THE WAY OUT OF A WRONG ONE (golive #260). Forward correction cannot fix a DATE: an
 * observation mistakenly dated a year ahead refuses every later one until that date arrives. With
 * `SupersedesMeasurementID`, a user holding `MJ.BizApps.Orders.Progress.Supersede` replaces the
 * line's latest observation instead. Nothing is edited. In one transaction the operation posts a
 * reversal of the replaced observation's recognition, dated on the replaced observation's own date so
 * the pair nets to zero in that period, then this observation's catch-up computed from the restored
 * total. The replaced row stays Posted and immutable; it stops counting because a row points at it.
 * See `./ProgressSupersede.ts`.
 *
 * A DATE AFTER THIS BUSINESS MONTH WARNS, it does not block. Forward dating stays allowed with no cap;
 * the warning is there because a mistyped year posts silently.
 *
 * ATOMICITY: the journal entry and the observation row share one transaction opened here. The entry
 * goes through `Accounting.CreateJournalEntries`, which joins the caller's transaction — no new
 * accounting API. `Preview` computes the draft and returns before the transaction is opened, so it
 * cannot write by construction.
 *
 * FAILURE MODEL: logical failures (not a POC line, not booked, dated before the last observation) come
 * back INSIDE the output as `Success: false` with a message. Only genuine faults throw.
 *
 * CONNECTS TO:
 *   ARITHMETIC: ComputeCatchUp, ProgressRecognitionDriver (./RevenueRecognition.ts)
 *   DRAFT:      OrderJournalEntryFactory.BuildProgressDraft (./OrderJournalEntryFactory.ts)
 *   TABLE:      __mj_BizAppsOrders.OrderLineProgressMeasurement
 */
import {
    BaseRemotableOperation,
    DatabaseProviderBase,
    IMetadataProvider,
    LogError,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import {
    LoadOrdersEngine,
    OrdersEngine,
    OrdersRecordProgressOperation as OrdersRecordProgressOperationBase,
    ToISODate,
    type mjBizAppsOrdersOrderHeaderEntity,
    type mjBizAppsOrdersOrderLineEntity,
    type mjBizAppsOrdersOrderLineProgressMeasurementEntity,
    type OrdersRecordProgressInput,
    type OrdersRecordProgressOutput,
    UserHasAuthorization,
} from '@mj-biz-apps/orders-entities';
import { BuildGLAccountResolver, EntityIDFor } from './AccountingBridge.js';
import { ORDER_HEADER_ENTITY, ORDER_LINE_ENTITY, ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY } from './entity-names.js';
import { RegisterOperationPost, ReleaseOperationPost } from './OrderLineProgressMeasurementEntityServer.js';
import { OrderJournalEntryFactory, type JEDraft } from './OrderJournalEntryFactory.js';
import { EffectiveObservations, FutureDateWarning, PlanSupersede, SupersedeRefusal } from './ProgressSupersede.js';
import { ComputeCatchUp, ProgressRecognitionDriver } from './RevenueRecognition.js';
import { RequireDate, RequireUUID } from './sql-guards.js';
import { ResolveRevenueRecognitionTypeID } from './SubscriptionBehavior.js';

const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
/** Accounting's batch header. Orders reads it; it never writes one (D7/D8). */
const JOURNAL_ENTRY_BATCH_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Batches';
const CHARGE_TYPE_ENTITY = 'MJ_BizApps_Orders: Charge Types';
/** Held by the Engagement Lead role — never alongside the price override grants (#227). */
export const PROGRESS_ATTEST_AUTH = 'MJ.BizApps.Orders.Progress.Attest';

const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/**
 * An observation on the line, read for the ordering guard, the date clash and a supersede. What is
 * recognised to date lives on the line; `RecognitionAmount` is read only to reverse it exactly.
 */
interface LineObservation {
    ID: string;
    MeasurementDate: string;
    Status: string;
    SupersedesMeasurementID: string | null;
    RecognitionAmount: number;
}

interface CreateJournalEntriesResult {
    Success: boolean;
    Errors?: Array<{ Code?: string; Message?: string }>;
    Results?: Array<{ JournalEntryID?: string }>;
}

@RegisterClass(BaseRemotableOperation, 'Orders.RecordProgress')
export class RecordProgressOperation extends OrdersRecordProgressOperationBase {
    protected async InternalExecute(
        input: OrdersRecordProgressInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersRecordProgressOutput> {
        // FIRST, BEFORE ANY READ OR WRITE. The attestation posts revenue, so who may make it is the
        // control; the entity permission on the observation row is only the second layer.
        if (!UserHasAuthorization(PROGRESS_ATTEST_AUTH, user, provider)) {
            return this.refuse(!!input?.Preview, `Recording progress requires the ${PROGRESS_ATTEST_AUTH} authorization (the Engagement Lead role).`);
        }
        // PAST THE GATE, THE OPERATION IS THE AUTHORITY. The attester holds create rights on the
        // observation entity and nothing in the ledger (Jeremy on #227: not a widened role), so the
        // reads, the entry and the line's running total are made as the system user. The attester is
        // still who signs: the observation row is saved as them and names them, and so does the entry.
        const ledger = UserCache.Instance.GetSystemUser();
        if (!ledger) throw new Error('Orders.RecordProgress needs the MJ system user, and the user cache does not hold it.');
        const lineID = RequireUUID(input?.OrderLineID, 'OrderLineID');
        const measurementDate = RequireDate(input?.MeasurementDate, 'MeasurementDate');
        const preview = !!input?.Preview;
        const supersedesID = input?.SupersedesMeasurementID ? RequireUUID(input.SupersedesMeasurementID, 'SupersedesMeasurementID') : null;

        const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, ledger);
        if (!(await line.Load(lineID))) return this.refuse(preview, `No order line with ID ${lineID}.`);
        const order = await provider.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(ORDER_HEADER_ENTITY, ledger);
        if (!(await order.Load(line.OrderHeaderID))) return this.refuse(preview, `Order line ${lineID} belongs to an order that could not be read.`);
        const echo = { OrderLineID: line.ID, OrderNumber: order.OrderNumber, LineNumber: line.LineNumber, MeasurementDate: measurementDate };

        const revRec = await this.revRecTypeOf(line, provider, ledger);
        if (!revRec) return this.refuse(preview, `Order line ${line.LineNumber} of ${order.OrderNumber} has no revenue recognition type.`, echo);
        if (revRec.ScheduleBasis !== 'OnMeasurement') {
            return this.refuse(preview, `Order line ${line.LineNumber} of ${order.OrderNumber} recognises revenue ${revRec.Code} at booking, not by progress. Only a percentage-of-completion line takes an observation.`, echo);
        }
        // BOOKED, NOT "HAS AN ENTRY" (D92). A POC line on a company with a payment schedule books no
        // value entry at confirm at all — the instalment's entry is stamped on the schedule row, not
        // on the line — so `JournalEntryID` is null on exactly the orders this operation exists for.
        // `ConfirmedAt` is the booking fact, and the one the double-book trigger keys on; `Status`
        // can move on afterwards.
        if (!order.ConfirmedAt) {
            return this.refuse(preview, `Order ${order.OrderNumber} is not confirmed; progress can only be attested on a booked order.`, echo);
        }

        const methodCode = (input.MethodCode ?? revRec.DriverClass).trim();
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<ProgressRecognitionDriver>(ProgressRecognitionDriver, methodCode);
        if (!driver) return this.refuse(preview, `'${methodCode}' is not a registered progress method.`, echo);
        let percent: number;
        try {
            percent = driver.PercentComplete({ PercentComplete: input.PercentComplete, MeasureNumerator: input.MeasureNumerator, MeasureDenominator: input.MeasureDenominator });
        } catch (err) {
            return this.refuse(preview, err instanceof Error ? err.message : String(err), echo);
        }

        const observations = await this.lineObservations(line.ID, provider, ledger);
        const effective = EffectiveObservations(observations.filter((o) => o.Status === 'Posted'));
        let replaced: LineObservation | null = null;
        if (supersedesID) {
            const refusal = SupersedeRefusal(user, provider.Authorizations ?? []);
            if (refusal) return this.refuse(preview, refusal, echo);
            const latest = effective.at(-1);
            if (!latest || latest.ID.toLowerCase() !== supersedesID.toLowerCase()) {
                const named = observations.find((o) => o.ID.toLowerCase() === supersedesID.toLowerCase());
                return this.refuse(
                    preview,
                    named
                        ? `Only the latest observation on order line ${line.LineNumber} of ${order.OrderNumber} can be superseded` +
                              (latest ? ` — that is the one dated ${latest.MeasurementDate}` : '') +
                              `. The observation dated ${named.MeasurementDate} is ${named.Status !== 'Posted' ? 'not posted' : 'already superseded or not the latest'}.`
                        : `Order line ${line.LineNumber} of ${order.OrderNumber} has no observation ${supersedesID} to supersede.`,
                    echo,
                );
            }
            replaced = latest;
        }

        // The ordering guard compares against the latest observation that will STILL COUNT — on a
        // supersede, the one before the replaced observation. That is the whole recovery: a date typed
        // a year ahead no longer holds every later observation hostage.
        const last = (replaced ? effective.at(-2) : effective.at(-1))?.MeasurementDate ?? null;
        if (last && measurementDate <= last) {
            return this.refuse(preview, `Order line ${line.LineNumber} of ${order.OrderNumber} already has an observation posted for ${last}. Corrections happen forward: record the current period instead.`, echo);
        }
        // One observation per line per date (UQ_OLPM_Period), superseded rows included: a replaced row
        // keeps its date. Said here rather than left to surface as a constraint error on save.
        const clash = observations.find((o) => o.MeasurementDate === measurementDate);
        if (clash) {
            return this.refuse(
                preview,
                `Order line ${line.LineNumber} of ${order.OrderNumber} already has an observation dated ${measurementDate}` +
                    `${clash.ID === replaced?.ID ? ', the one being superseded' : ''}. Each observation needs its own date — choose another day in the period.`,
                echo,
            );
        }

        const lineAmount = money(Math.abs(Number(line.LineTotalNet ?? 0)));
        // THE LINE'S OWN TOTAL IS THE AUTHORITY (D92), not the sum of these observations. Under D90
        // progress was the only thing that ever recognised revenue on a POC line, so the two agreed
        // by construction; once every recognition path advances `RecognizedToDate` they can differ,
        // and the running total is the one the contra-account rule reads. The observation rows keep
        // `RecognizedToDateBefore/After` as the audit trail of what each attestation saw.
        const recognizedToDate = money(Math.abs(Number(line.RecognizedToDate ?? 0)));
        // On a supersede the catch-up runs against the total the replaced observation found, so this
        // row's RecognitionAmount is its own delta and a later supersede of it reverses exactly that.
        const plan = replaced ? PlanSupersede(lineAmount, percent, recognizedToDate, replaced.RecognitionAmount) : null;
        const catchUp = plan ? plan.CatchUp : ComputeCatchUp(lineAmount, percent, recognizedToDate);
        const reversal = plan?.Reversal ?? 0;
        // Read once, echoed on BOTH paths: the preview is where it is meant to be seen, and the live
        // output carries it so the screen can show it after a post that was made anyway. A supersede
        // writes on two dates, so both are checked.
        const closed = [
            await this.closedPeriodWarning(line, measurementDate, provider, ledger),
            replaced && reversal !== 0 ? await this.closedPeriodWarning(line, replaced.MeasurementDate, provider, ledger, 'The reversal') : null,
        ].filter((w): w is string => !!w);
        const numbers = {
            ...echo,
            PercentComplete: percent,
            LineAmount: lineAmount,
            RecognizedToDateBefore: plan ? plan.Restored : recognizedToDate,
            RecognizedToDateAfter: catchUp.Target,
            RecognitionAmount: catchUp.Delta,
            ClosedPeriodWarning: closed.length ? closed.join(' ') : null,
            FutureDateWarning: await this.futureDateWarning(measurementDate, provider, ledger),
            SupersededMeasurementID: replaced?.ID ?? null,
            ReversalAmount: reversal,
        };
        const signer = user.Name || user.Email;
        const note = `to ${(percent * 100).toFixed(2).replace(/\.?0+$/, '')}% (attested by ${signer}, ${measurementDate})`;
        // The reversal is shaped from the line as the replaced observation left it, then the line is
        // moved back in memory so the catch-up's contra split starts from the restored position. Only
        // the live path saves the line.
        const reversalDraft =
            replaced && reversal !== 0
                ? await this.buildDraft(order, line, reversal, replaced.MeasurementDate, `reversing the ${replaced.MeasurementDate} observation (superseded by ${signer}, ${measurementDate})`, provider, ledger)
                : null;
        if (reversal !== 0) this.applyRecognized(line, reversal);
        const draft = catchUp.Delta === 0 ? null : await this.buildDraft(order, line, catchUp.Delta, measurementDate, note, provider, ledger);

        if (preview) {
            return { Success: true, Preview: true, ...numbers, OrderLineProgressMeasurementID: null, JournalEntryID: null, ReversalJournalEntryID: null, Message: this.explain(catchUp.Delta, numbers.OrderNumber, line.LineNumber, true, replaced, reversal) };
        }

        const dbProvider = provider as unknown as DatabaseProviderBase;
        await dbProvider.BeginTransaction();
        try {
            const reversalJournalEntryID = reversalDraft ? await this.createJournalEntry(reversalDraft, provider, ledger) : null;
            const journalEntryID = draft ? await this.createJournalEntry(draft, provider, ledger) : null;
            const measurementID = await this.writeObservation(line.ID, measurementDate, percent, methodCode, input, user, numbers, journalEntryID, replaced?.ID ?? null, reversalJournalEntryID, provider);
            await this.advanceRecognizedToDate(line, catchUp.Delta, reversal !== 0);
            await dbProvider.CommitTransaction();
            return { Success: true, Preview: false, ...numbers, OrderLineProgressMeasurementID: measurementID, JournalEntryID: journalEntryID, ReversalJournalEntryID: reversalJournalEntryID, Message: this.explain(catchUp.Delta, numbers.OrderNumber, line.LineNumber, false, replaced, reversal) };
        } catch (err) {
            LogError(`Orders.RecordProgress failed for line ${lineID}: ${err}`);
            try {
                await dbProvider.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Rollback failed after RecordProgress error: ${rollbackErr}`);
            }
            return this.refuse(false, err instanceof Error ? err.message : String(err), numbers);
        }
    }

    // ─── Reads ─────────────────────────────────────────────────────────────────

    /** The line's rev-rec type, resolved the way booking resolves it: the product's, else its type's default. */
    private async revRecTypeOf(line: mjBizAppsOrdersOrderLineEntity, provider: IMetadataProvider, user: UserInfo) {
        await LoadOrdersEngine(provider, user);
        const engine = OrdersEngine.Instance;
        const product = engine.ProductByID(line.ProductID);
        if (!product) throw new Error(`Order line ${line.ID} references product ${line.ProductID}, which was not found.`);
        const id = ResolveRevenueRecognitionTypeID(product.RevenueRecognitionTypeID, engine.ProductTypeByID(product.ProductTypeID)?.DefaultRevenueRecognitionTypeID);
        return id ? engine.RevenueRecognitionTypes.find((t) => t.ID.toLowerCase() === id.toLowerCase()) ?? null : null;
    }

    /**
     * Every observation on the line, any status, oldest first — for the ORDERING GUARD, the date
     * clash, and finding what a supersede replaces.
     *
     * What is recognised to date is the line's own `RecognizedToDate` (D92), not a sum of these.
     * The rows remain the audit trail of what each attestation saw and what it posted.
     */
    private async lineObservations(lineID: string, provider: IMetadataProvider, user: UserInfo): Promise<LineObservation[]> {
        const result = await RunView.FromMetadataProvider(provider).RunView<{
            ID: string;
            MeasurementDate: unknown;
            Status: string;
            SupersedesMeasurementID: string | null;
            RecognitionAmount: number | null;
        }>(
            {
                EntityName: ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY,
                ExtraFilter: `OrderLineID = '${lineID}'`,
                Fields: ['ID', 'MeasurementDate', 'Status', 'SupersedesMeasurementID', 'RecognitionAmount'],
                OrderBy: 'MeasurementDate',
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        if (!result.Success) throw new Error(`Could not read the line's progress observations: ${result.ErrorMessage ?? 'unknown error'}`);
        return (result.Results ?? []).map((r) => ({
            ID: r.ID,
            MeasurementDate: ToISODate(r.MeasurementDate) ?? '',
            Status: r.Status,
            SupersedesMeasurementID: r.SupersedesMeasurementID ?? null,
            RecognitionAmount: money(Number(r.RecognitionAmount ?? 0)),
        }));
    }

    /**
     * {@link FutureDateWarning} against the BUSINESS calendar's today — or null.
     *
     * Advisory, so a calendar that cannot be read produces no warning rather than a refusal, for the
     * reason {@link closedPeriodWarning} gives.
     */
    private async futureDateWarning(measurementDate: string, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
        try {
            await BusinessTimeZoneEngine.Instance.Config(false, user, provider);
            return FutureDateWarning(measurementDate, BusinessTimeZoneEngine.Instance.Today());
        } catch {
            return null;
        }
    }

    /**
     * A warning when this observation lands in a month accounting has already closed — or null.
     *
     * WARNS, NEVER BLOCKS (Jeremy on #227). Period close is not built into AIDP for go-live and the
     * batch build stays the control; attestation is manual and must not be gated on a state the
     * attester cannot see or change. This only stops someone walking into it by accident.
     *
     * CLOSED MEANS A POSTED BATCH, which is accounting's own word for it: `JournalEntryBatch` runs
     * Pending → Approved → Sent → Posted, and `Posted` is the one that means the ERP has it. A batch
     * still Pending or Approved is a period being worked, not a period closed, so attesting into it
     * is ordinary. The batch is per company and carries a single accountant-set `PostingDate`, so
     * the month of that date is the period, and the company is the LINE's company — the same one the
     * entry will book against, not the order header's.
     *
     * A read that fails is not a refusal. This is advisory; if the query cannot run — accounting not
     * installed, no permission on its entity — the attestation still proceeds without a warning,
     * because blocking revenue recognition on the availability of a hint would be the worse failure.
     */
    private async closedPeriodWarning(
        line: mjBizAppsOrdersOrderLineEntity,
        measurementDate: string,
        provider: IMetadataProvider,
        user: UserInfo,
        subject = 'Measurement date',
    ): Promise<string | null> {
        const companyID = line.CompanyID;
        if (!companyID) return null;
        const month = measurementDate.slice(0, 7);
        try {
            const result = await RunView.FromMetadataProvider(provider).RunView<{ JournalEntryBatchNumber: string; PostingDate: unknown }>(
                {
                    EntityName: JOURNAL_ENTRY_BATCH_ENTITY,
                    ExtraFilter:
                        `CompanyID = '${RequireUUID(companyID, 'CompanyID')}' AND Status = 'Posted' ` +
                        `AND PostingDate >= '${month}-01' AND PostingDate < DATEADD(month, 1, '${month}-01')`,
                    Fields: ['JournalEntryBatchNumber', 'PostingDate'],
                    OrderBy: 'PostingDate DESC',
                    ResultType: 'simple',
                },
                user,
            );
            const batch = result.Success ? result.Results?.[0] : null;
            if (!batch) return null;
            return (
                `${subject} ${measurementDate} falls in a period already posted in batch ` +
                `${batch.JournalEntryBatchNumber}. The entry will still be written and will be swept into a ` +
                `later batch; nothing is blocked. Check with finance before posting if this period is closed.`
            );
        } catch {
            return null;
        }
    }

    private async buildDraft(
        order: mjBizAppsOrdersOrderHeaderEntity,
        line: mjBizAppsOrdersOrderLineEntity,
        delta: number,
        measurementDate: string,
        note: string,
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
        return factory.BuildProgressDraft(order, line, delta, measurementDate, note);
    }

    // ─── Writes ────────────────────────────────────────────────────────────────

    /** Same op, same envelope-then-payload check as OrderEntityServer.submitDrafts. */
    private async createJournalEntry(draft: JEDraft, provider: IMetadataProvider, user: UserInfo): Promise<string> {
        const op = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation<{ Drafts: unknown[] }, CreateJournalEntriesResult>>(
            BaseRemotableOperation,
            'Accounting.CreateJournalEntries',
        );
        if (!op) {
            throw new Error(`The 'Accounting.CreateJournalEntries' operation is not registered. The BizApps Accounting server package must be loaded before progress can be recognised.`);
        }
        const result = await op.Execute({ Drafts: [draft] }, { provider, user });
        if (!result.Success) throw new Error(`Accounting.CreateJournalEntries did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown error'}`);
        const payload = result.Output;
        if (!payload) throw new Error('Accounting.CreateJournalEntries returned no payload.');
        if (!payload.Success) {
            throw new Error(`The recognition entry was refused. ${(payload.Errors ?? []).map((e) => `${e.Code ?? 'ERROR'}: ${e.Message ?? ''}`).join('; ')}`);
        }
        const id = payload.Results?.[0]?.JournalEntryID;
        if (!id) throw new Error('Accounting reported success but returned no journal entry.');
        return id;
    }

    /**
     * Advance the line's `RecognizedToDate` by what this observation just posted (D92).
     *
     * IN THE SAME TRANSACTION AS THE ENTRY, for the reason confirm advances it in the confirm
     * transaction and invoicing advances `BilledToDate` in the invoicing one: the totals are the
     * ledger's summary of itself, and a separate writer is exactly how a summary drifts from what it
     * summarises. A line whose entry posted and whose total did not would pick the wrong contra
     * account for every later attestation, silently and for good.
     *
     * SIGNED, deliberately: a reversal line's delta is negative, so an origin and its reversals net
     * to zero across a contract. The rules read magnitudes; only storage carries the sign.
     */
    private async advanceRecognizedToDate(line: mjBizAppsOrdersOrderLineEntity, delta: number, alreadyMoved = false): Promise<void> {
        if (money(delta) === 0 && !alreadyMoved) return;
        this.applyRecognized(line, delta);
        if (!(await line.Save())) {
            throw new Error(
                line.LatestResult?.CompleteMessage ??
                    `RecognizedToDate could not be advanced on order line ${line.ID}.`,
            );
        }
    }

    /**
     * Move the line's `RecognizedToDate` in memory by a magnitude-space delta. The caller saves.
     *
     * THE LINE'S SIGN, APPLIED HERE AND NOWHERE ELSE. The delta is a magnitude: it is computed
     * against |LineTotalNet| and |RecognizedToDate| because the rule reads magnitudes, and the
     * entry gets its direction from `RecognitionMirrors`. The STORED total is the other axis —
     * a reversal line's totals run negative so an origin and its reversals net to zero — and
     * adding an unsigned delta to it made a reversal line's recognition climb instead of unwind.
     */
    private applyRecognized(line: mjBizAppsOrdersOrderLineEntity, delta: number): void {
        if (money(delta) === 0) return;
        const signed = Number(line.Quantity) < 0 ? -delta : delta;
        line.RecognizedToDate = money(Number(line.RecognizedToDate ?? 0) + signed);
    }

    private async writeObservation(
        lineID: string,
        measurementDate: string,
        percent: number,
        methodCode: string,
        input: OrdersRecordProgressInput,
        user: UserInfo,
        numbers: { RecognizedToDateBefore: number; RecognizedToDateAfter: number; RecognitionAmount: number },
        journalEntryID: string | null,
        supersedesID: string | null,
        reversalJournalEntryID: string | null,
        provider: IMetadataProvider,
    ): Promise<string> {
        const row = await provider.GetEntityObject<mjBizAppsOrdersOrderLineProgressMeasurementEntity>(ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY, user);
        row.NewRecord();
        row.OrderLineID = lineID;
        row.MeasurementDate = new Date(`${measurementDate}T00:00:00Z`);
        row.PercentComplete = percent;
        row.MethodCode = methodCode;
        row.MeasureNumerator = input.MeasureNumerator ?? null;
        row.MeasureDenominator = input.MeasureDenominator ?? null;
        row.AttestedByUserID = user.ID;
        row.Notes = input.Notes ?? null;
        row.RecognizedToDateBefore = numbers.RecognizedToDateBefore;
        row.RecognizedToDateAfter = numbers.RecognizedToDateAfter;
        row.RecognitionAmount = numbers.RecognitionAmount;
        row.JournalEntryID = journalEntryID;
        row.SupersedesMeasurementID = supersedesID;
        row.ReversalJournalEntryID = reversalJournalEntryID;
        row.Status = 'Posted';
        // TELL THE ENTITY GUARD THIS ONE IS OURS. It refuses any row saved Posted that the operation
        // did not name, which is the half of Jeremy's posting guard a trigger cannot see: an INSERT
        // of a Posted row is the same statement whoever issues it. Registered by ID and released in
        // `finally`, so the window is one save wide and a throw cannot leave it open.
        RegisterOperationPost(lineID, measurementDate);
        try {
            if (!(await row.Save())) {
                throw new Error(row.LatestResult?.CompleteMessage ?? 'The progress observation could not be saved.');
            }
        } finally {
            ReleaseOperationPost(lineID, measurementDate);
        }
        return row.ID;
    }

    // ─── Shape ─────────────────────────────────────────────────────────────────

    private explain(
        delta: number,
        orderNumber: string | undefined,
        lineNumber: number,
        preview: boolean,
        replaced: LineObservation | null = null,
        reversal = 0,
    ): string {
        const verb = preview ? 'would' : 'did';
        const head = `Order ${orderNumber} line ${lineNumber}: `;
        const undo = !replaced
            ? ''
            : reversal === 0
              ? `supersedes the ${replaced.MeasurementDate} observation, which moved nothing; `
              : `supersedes the ${replaced.MeasurementDate} observation — ${money(Math.abs(reversal)).toFixed(2)} ${verb} ${reversal < 0 ? 'come back out of' : 'return to'} revenue on ${replaced.MeasurementDate}; then `;
        if (delta === 0) return `${head}${undo}${replaced ? 'nothing further to recognise.' : 'progress unchanged — nothing to recognise.'}`;
        if (delta < 0) return `${head}${undo}${replaced ? '' : 'progress slid back; '}${money(-delta).toFixed(2)} ${verb} come out of revenue.`;
        return `${head}${undo}${money(delta).toFixed(2)} ${verb} move from deferred revenue to revenue.`;
    }

    private refuse(preview: boolean, message: string, echo: Partial<OrdersRecordProgressOutput> = {}): OrdersRecordProgressOutput {
        return { Success: false, Preview: preview, Message: message, ...echo };
    }
}

/** Registers {@link RecordProgressOperation}. Called from the server bootstrap. */
export function LoadRecordProgressOperation(): void {
    void RecordProgressOperation;
}
