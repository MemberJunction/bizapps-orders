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
 *     delta  = target − recognisedToDate
 *
 *     delta > 0   Dr Deferred Revenue / Cr Sales            (|delta|)
 *     delta < 0   Dr Sales / Cr Deferred Revenue            (|delta|)   ← mirrored, never negated
 *     delta = 0   no entry — a legitimate outcome, not a failure
 *
 * A backward slide is not a feature; it is what the subtraction does. At 100% the target IS the line
 * amount, so the last catch-up lands the remaining cent whatever the rounding history.
 *
 * THE OBSERVATION IS AN ATTESTATION, NOT A MEASUREMENT. The number may come from anywhere, but a named
 * person signs it, and the entry names the observation and the signer. A posted observation is
 * immutable (trigger); corrections happen forward, in the next period.
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
import { MJGlobal, RegisterClass } from '@memberjunction/global';
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
} from '@mj-biz-apps/orders-entities';
import { BuildGLAccountResolver, EntityIDFor } from './AccountingBridge.js';
import { ORDER_HEADER_ENTITY, ORDER_LINE_ENTITY, ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY } from './entity-names.js';
import { OrderJournalEntryFactory, type JEDraft } from './OrderJournalEntryFactory.js';
import { ComputeCatchUp, ProgressRecognitionDriver } from './RevenueRecognition.js';
import { RequireDate, RequireUUID } from './sql-guards.js';
import { ResolveRevenueRecognitionTypeID } from './SubscriptionBehavior.js';

const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const CHARGE_TYPE_ENTITY = 'MJ_BizApps_Orders: Charge Types';

const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

interface PostedMeasurement {
    MeasurementDate: string;
    RecognitionAmount: number | null;
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
        const lineID = RequireUUID(input?.OrderLineID, 'OrderLineID');
        const measurementDate = RequireDate(input?.MeasurementDate, 'MeasurementDate');
        const preview = !!input?.Preview;

        const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
        if (!(await line.Load(lineID))) return this.refuse(preview, `No order line with ID ${lineID}.`);
        const order = await provider.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(ORDER_HEADER_ENTITY, user);
        if (!(await order.Load(line.OrderHeaderID))) return this.refuse(preview, `Order line ${lineID} belongs to an order that could not be read.`);
        const echo = { OrderLineID: line.ID, OrderNumber: order.OrderNumber, LineNumber: line.LineNumber, MeasurementDate: measurementDate };

        const revRec = await this.revRecTypeOf(line, provider, user);
        if (!revRec) return this.refuse(preview, `Order line ${line.LineNumber} of ${order.OrderNumber} has no revenue recognition type.`, echo);
        if (revRec.ScheduleBasis !== 'OnMeasurement') {
            return this.refuse(preview, `Order line ${line.LineNumber} of ${order.OrderNumber} recognises revenue ${revRec.Code} at booking, not by progress. Only a percentage-of-completion line takes an observation.`, echo);
        }
        if (!line.JournalEntryID) {
            return this.refuse(preview, `Order line ${line.LineNumber} of ${order.OrderNumber} is not booked yet; there is no deferred revenue to release.`, echo);
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

        const posted = await this.postedObservations(line.ID, provider, user);
        const last = posted.at(-1)?.MeasurementDate ?? null;
        if (last && measurementDate <= last) {
            return this.refuse(preview, `Order line ${line.LineNumber} of ${order.OrderNumber} already has an observation posted for ${last}. Corrections happen forward: record the current period instead.`, echo);
        }

        const lineAmount = money(Math.abs(Number(line.LineTotalNet ?? 0)));
        const recognizedToDate = money(posted.reduce((s, m) => s + Number(m.RecognitionAmount ?? 0), 0));
        const catchUp = ComputeCatchUp(lineAmount, percent, recognizedToDate);
        const numbers = {
            ...echo,
            PercentComplete: percent,
            LineAmount: lineAmount,
            RecognizedToDateBefore: recognizedToDate,
            RecognizedToDateAfter: catchUp.Target,
            RecognitionAmount: catchUp.Delta,
        };
        const note = `to ${(percent * 100).toFixed(2).replace(/\.?0+$/, '')}% (attested by ${user.Name || user.Email}, ${measurementDate})`;
        const draft = catchUp.Delta === 0 ? null : await this.buildDraft(order, line, catchUp.Delta, measurementDate, note, provider, user);

        if (preview) {
            return { Success: true, Preview: true, ...numbers, OrderLineProgressMeasurementID: null, JournalEntryID: null, Message: this.explain(catchUp.Delta, numbers.OrderNumber, line.LineNumber, true) };
        }

        const dbProvider = provider as unknown as DatabaseProviderBase;
        await dbProvider.BeginTransaction();
        try {
            const journalEntryID = draft ? await this.createJournalEntry(draft, provider, user) : null;
            const measurementID = await this.writeObservation(line.ID, measurementDate, percent, methodCode, input, user, numbers, journalEntryID, provider);
            await dbProvider.CommitTransaction();
            return { Success: true, Preview: false, ...numbers, OrderLineProgressMeasurementID: measurementID, JournalEntryID: journalEntryID, Message: this.explain(catchUp.Delta, numbers.OrderNumber, line.LineNumber, false) };
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

    /** Every posted observation on the line, oldest first. Their deltas sum to what is recognised. */
    private async postedObservations(lineID: string, provider: IMetadataProvider, user: UserInfo): Promise<PostedMeasurement[]> {
        const result = await RunView.FromMetadataProvider(provider).RunView<{ MeasurementDate: unknown; RecognitionAmount: number | null }>(
            {
                EntityName: ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY,
                ExtraFilter: `OrderLineID = '${lineID}' AND Status = 'Posted'`,
                Fields: ['MeasurementDate', 'RecognitionAmount'],
                OrderBy: 'MeasurementDate',
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        if (!result.Success) throw new Error(`Could not read the line's progress observations: ${result.ErrorMessage ?? 'unknown error'}`);
        return (result.Results ?? []).map((r) => ({ MeasurementDate: ToISODate(r.MeasurementDate) ?? '', RecognitionAmount: r.RecognitionAmount }));
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

    private async writeObservation(
        lineID: string,
        measurementDate: string,
        percent: number,
        methodCode: string,
        input: OrdersRecordProgressInput,
        user: UserInfo,
        numbers: { RecognizedToDateBefore: number; RecognizedToDateAfter: number; RecognitionAmount: number },
        journalEntryID: string | null,
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
        row.Status = 'Posted';
        if (!(await row.Save())) {
            throw new Error(row.LatestResult?.CompleteMessage ?? 'The progress observation could not be saved.');
        }
        return row.ID;
    }

    // ─── Shape ─────────────────────────────────────────────────────────────────

    private explain(delta: number, orderNumber: string | undefined, lineNumber: number, preview: boolean): string {
        const verb = preview ? 'would' : 'did';
        if (delta === 0) return `Order ${orderNumber} line ${lineNumber}: progress unchanged — nothing to recognise.`;
        if (delta < 0) return `Order ${orderNumber} line ${lineNumber}: progress slid back; ${money(-delta).toFixed(2)} ${verb} come out of revenue.`;
        return `Order ${orderNumber} line ${lineNumber}: ${money(delta).toFixed(2)} ${verb} move from deferred revenue to revenue.`;
    }

    private refuse(preview: boolean, message: string, echo: Partial<OrdersRecordProgressOutput> = {}): OrdersRecordProgressOutput {
        return { Success: false, Preview: preview, Message: message, ...echo };
    }
}

/** Registers {@link RecordProgressOperation}. Called from the server bootstrap. */
export function LoadRecordProgressOperation(): void {
    void RecordProgressOperation;
}
