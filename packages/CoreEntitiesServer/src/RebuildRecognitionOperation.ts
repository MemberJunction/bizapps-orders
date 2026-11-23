/**
 * `Orders.RebuildRecognition` — rebuild a confirmed line's revenue recognition from its product's current type (golive #495).
 *
 * Confirm stages a deferred line's releases once, from the product's recognition type at that moment, so a type
 * finance corrects afterwards never reaches the orders already booked. Each correction used to be a script run on
 * the database. This operation is the supported way: the line's releases still Pending in no batch are voided
 * (Accounting.VoidPendingJournalEntries), and what they were going to release is staged again through the
 * current type's driver over what is left of the service period (./RecognitionRebuildPlan.ts). Billing entries,
 * invoices, payments and the payment schedule are never touched.
 *
 * WHO. Holders of MJ.BizApps.Orders.Recognition.Rebuild (Finance, CFO, Developer), checked before any read. Past
 * the gate the reads and writes run as the system user, as Orders.RecordProgress does; the person who ran it is
 * recorded on the OrderLineRecognitionRebuild row, and the reason they gave goes on each voided entry.
 *
 * REFUSED, each with its reason: an unconfirmed order, a reversing line, a line with returns or cancellations
 * against it (their mirrors were built from the old schedule), a subscription line (its releases hang off terms;
 * not covered yet), a line with recorded progress, a current type that is up front or measured by progress (the
 * booking entry would have to change too), and a line with nothing staged (booked up front).
 *
 * Preview plans without writing. Apply stages the new entries, voids the old ones and writes the row in one
 * transaction: a refused void rolls the new entries back.
 *
 * CONNECTS TO:
 *   PLAN:   ./RecognitionRebuildPlan.ts
 *   READS:  ./OriginRecognitionLedger.ts (LinkedRecognitionEntries)
 *   WRITES: ./AccountingBridge.ts (SubmitJournalEntryDrafts, VoidPendingJournalEntries) · OrderLineRecognitionRebuild
 */
import { BaseRemotableOperation, DatabaseProviderBase, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    OrdersEngine,
    OrdersRebuildRecognitionOperation as OrdersRebuildRecognitionOperationBase,
    ToISODate,
    UserHasAuthorization,
    type mjBizAppsOrdersOrderHeaderEntity,
    type mjBizAppsOrdersOrderLineEntity,
    type OrdersRebuildRecognitionInput,
    type OrdersRebuildRecognitionOutput,
} from '@mj-biz-apps/orders-entities';
import { EntityIDFor, SubmitJournalEntryDrafts, VoidPendingJournalEntries } from './AccountingBridge.js';
import {
    ORDER_HEADER_ENTITY,
    ORDER_LINE_ENTITY,
    ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY,
    ORDER_LINE_RECOGNITION_REBUILD_ENTITY,
} from './entity-names.js';
import { CustomerPart, OrderCustomerName } from './JournalEntryCustomer.js';
import { LinkedRecognitionEntries } from './OriginRecognitionLedger.js';
import { PlanRecognitionRebuild, type RebuildEntry } from './RecognitionRebuildPlan.js';
import { RevenueRecognitionDriver } from './RevenueRecognition.js';
import { RequireUUID } from './sql-guards.js';
import { ResolveRevenueRecognitionTypeID } from './SubscriptionBehavior.js';

/** Held by Finance, CFO and Developer. */
export const RECOGNITION_REBUILD_AUTH = 'MJ.BizApps.Orders.Recognition.Rebuild';

const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';

@RegisterClass(BaseRemotableOperation, 'Orders.RebuildRecognition')
export class RebuildRecognitionOperation extends OrdersRebuildRecognitionOperationBase {
    protected async InternalExecute(
        input: OrdersRebuildRecognitionInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersRebuildRecognitionOutput> {
        const preview = !!input?.Preview;
        if (!UserHasAuthorization(RECOGNITION_REBUILD_AUTH, user, provider)) {
            return refuse(preview, "You don't have permission to rebuild revenue recognition. This is limited to Finance and the CFO.");
        }
        const ledgerUser = UserCache.Instance.GetSystemUser();
        if (!ledgerUser) throw new Error('Orders.RebuildRecognition needs the MJ system user, and the user cache does not hold it.');
        const lineID = RequireUUID(input?.OrderLineID, 'OrderLineID');
        const reason = (input?.Reason ?? '').trim();
        if (!preview && !reason) return refuse(false, 'Say why the schedule is rebuilt. The reason is recorded on the rebuild and on each voided entry.');

        const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, ledgerUser);
        if (!(await line.Load(lineID))) return refuse(preview, `No order line with ID ${lineID}.`);
        const order = await provider.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(ORDER_HEADER_ENTITY, ledgerUser);
        if (!(await order.Load(line.OrderHeaderID))) return refuse(preview, `Order line ${lineID} belongs to an order that could not be read.`);
        const label = `Order ${order.OrderNumber} line ${line.LineNumber}`;
        const echo: Partial<OrdersRebuildRecognitionOutput> = { OrderNumber: order.OrderNumber, LineNumber: line.LineNumber };

        if (!order.ConfirmedAt) return refuse(preview, `Order ${order.OrderNumber} is not confirmed, so its recognition has not been staged yet.`, echo);
        if (line.ReversesOrderLineID || Number(line.Quantity ?? 0) < 0) {
            return refuse(preview, `${label} is a return or cancellation. Rebuild the line it reverses instead.`, echo);
        }
        const refusal = await this.blockers(line, provider, ledgerUser);
        if (refusal) return refuse(preview, `${label}: ${refusal}`, echo);

        const engine = OrdersEngine.Instance;
        const product = await engine.RequireProduct(line.ProductID, ledgerUser, provider);
        echo.ProductName = product.Name;
        const typeID = ResolveRevenueRecognitionTypeID(product.RevenueRecognitionTypeID, engine.ProductTypeByID(product.ProductTypeID)?.DefaultRevenueRecognitionTypeID);
        const revRec = typeID ? engine.RevenueRecognitionTypes.find((t) => t.ID.toLowerCase() === typeID.toLowerCase()) : undefined;
        if (!revRec) return refuse(preview, `${product.Name} has no revenue recognition type.`, echo);
        echo.RevenueRecognitionTypeName = revRec.Name;
        if (!revRec.IsDeferred) {
            return refuse(preview, `${product.Name} is now recognized up front (${revRec.Name}). Moving a deferred line to up front changes its booking entry, which a rebuild does not do.`, echo);
        }
        if (revRec.ScheduleBasis !== 'AtBooking') {
            return refuse(preview, `${product.Name} is now recognized as progress is recorded (${revRec.Name}). Record progress on the line instead.`, echo);
        }
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<RevenueRecognitionDriver>(RevenueRecognitionDriver, revRec.DriverClass);
        if (!driver) return refuse(preview, `Recognition type ${revRec.Name} names driver '${revRec.DriverClass}', which is not registered.`, echo);

        const entries = await LinkedRecognitionEntries(ORDER_LINE_ENTITY, [line.ID], { Provider: provider, User: ledgerUser });
        const confirmed = ToISODate(order.ConfirmedAt) ?? ToISODate(order.OrderDate);
        if (!confirmed) return refuse(preview, `Order ${order.OrderNumber} has no readable confirmation date.`, echo);
        const plan = PlanRecognitionRebuild({
            Entries: entries,
            Net: Number(line.LineTotalNet ?? 0),
            Driver: driver,
            ServicePeriodStart: line.ServicePeriodStart ? new Date(line.ServicePeriodStart) : null,
            ServicePeriodEnd: line.ServicePeriodEnd ? new Date(line.ServicePeriodEnd) : null,
            BookingDate: new Date(`${confirmed}T00:00:00Z`),
            ProductName: product.Name,
            Label: `${label}${CustomerPart(OrderCustomerName(order))}`,
            LinkedEntityID: EntityIDFor(ORDER_LINE_ENTITY),
            LinkedRecordID: line.ID,
        });
        if (typeof plan === 'string') return refuse(preview, `${label}: ${plan}`, echo);

        const numbers: Partial<OrdersRebuildRecognitionOutput> = {
            ...echo,
            Kept: plan.Kept,
            Voided: plan.Voided,
            Created: plan.Created,
            AmountReplaced: plan.AmountReplaced,
        };
        const summary = (verb: string) =>
            `${label}: ${verb} ${plan.Voided.length} pending entr${plan.Voided.length === 1 ? 'y' : 'ies'} and ` +
            `${preview ? 'would stage' : 'staged'} ${plan.Created.length} under ${revRec.Name}, ${amount(plan.AmountReplaced)} in all.` +
            (plan.Kept.length ? ` ${plan.Kept.length} batched or posted entr${plan.Kept.length === 1 ? 'y stays' : 'ies stay'}.` : '');
        if (preview) {
            return { Success: true, Preview: true, ...numbers, OrderLineRecognitionRebuildID: null, Message: summary('would void') };
        }

        const db = provider as unknown as DatabaseProviderBase;
        await db.BeginTransaction();
        try {
            const outcome = await SubmitJournalEntryDrafts(plan.Drafts, `the rebuilt recognition of ${label}`, provider, ledgerUser);
            const created: RebuildEntry[] = plan.Created.map((c, i) => ({
                ...c,
                JournalEntryID: outcome.Results?.[i]?.JournalEntryID ?? null,
                EntryNumber: outcome.Results?.[i]?.EntryNumber ?? null,
            }));
            await VoidPendingJournalEntries(plan.VoidIDs, `Recognition rebuilt under ${revRec.Name}: ${reason}`, provider, ledgerUser);
            const row = await provider.GetEntityObject(ORDER_LINE_RECOGNITION_REBUILD_ENTITY, ledgerUser);
            row.NewRecord();
            row.Set('OrderLineID', line.ID);
            row.Set('RevenueRecognitionTypeID', revRec.ID);
            row.Set('RebuiltByUserID', user.ID);
            row.Set('Reason', reason);
            row.Set('AmountReplaced', plan.AmountReplaced);
            row.Set('VoidedEntries', JSON.stringify(plan.Voided));
            row.Set('CreatedEntries', JSON.stringify(created));
            if (!(await row.Save())) throw new Error(`The rebuild could not be recorded: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            await db.CommitTransaction();
            return { Success: true, Preview: false, ...numbers, Created: created, OrderLineRecognitionRebuildID: String(row.Get('ID')), Message: summary('voided') };
        } catch (err) {
            LogError(`Orders.RebuildRecognition failed for line ${lineID}: ${err}`);
            try {
                await db.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Rollback failed after RebuildRecognition error: ${rollbackErr}`);
            }
            return refuse(false, err instanceof Error ? err.message : String(err), numbers);
        }
    }

    /** Why the line cannot be rebuilt today, or null: returns against it, subscription terms, recorded progress. */
    private async blockers(line: mjBizAppsOrdersOrderLineEntity, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
        const rv = RunView.FromMetadataProvider(provider);
        const id = RequireUUID(line.ID, 'OrderLineID');
        const [reversals, terms, progress] = await rv.RunViews(
            [
                { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `ReversesOrderLineID = '${id}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
                { EntityName: SUBSCRIPTION_TERM_ENTITY, ExtraFilter: `OrderLineID = '${id}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
                { EntityName: ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY, ExtraFilter: `OrderLineID = '${id}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
            ],
            user,
        );
        for (const r of [reversals, terms, progress]) if (!r?.Success) throw new Error(`Reading the line's returns, terms and progress failed: ${r?.ErrorMessage}`);
        if (reversals.Results.length) return 'it has returns or cancellations against it, whose entries were built from the current schedule. It cannot be rebuilt.';
        if (line.SubscriptionID || terms.Results.length) return 'it is a subscription line, whose recognition is staged on its terms. Rebuilding subscription lines is not covered yet.';
        if (progress.Results.length) return 'it has progress recorded against it.';
        return null;
    }
}

/** An amount as finance reads it: grouped, two decimals. */
function amount(value: number): string {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function refuse(preview: boolean, message: string, echo: Partial<OrdersRebuildRecognitionOutput> = {}): OrdersRebuildRecognitionOutput {
    return { Success: false, Preview: preview, Message: message, ...echo };
}

/** Registers {@link RebuildRecognitionOperation}. Called from the server bootstrap. */
export function LoadRebuildRecognitionOperation(): void {
    void RebuildRecognitionOperation;
}
