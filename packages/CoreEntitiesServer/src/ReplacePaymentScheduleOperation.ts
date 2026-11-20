/**
 * `Orders.ReplacePaymentSchedule` — set an order's payment schedule to a supplied list of rows
 * (golive #290).
 *
 * Sales calls it when a deal closes Won, to put the deal's schedule on the deal's order, and again
 * whenever a won deal's schedule is edited. Orders owns the schedule table, so the rows are written
 * here, through the schedule's own entity server, rather than by Sales.
 *
 * WHAT IT GUARANTEES, all checked before anything is written:
 *   - each row has a real due date and an amount above zero;
 *   - instalments already invoiced are kept exactly as they are, and a list that changes or drops one
 *     is refused (the rule is in `PaymentScheduleReplacement.ts`);
 *   - the resulting schedule ties to the order's lines, by the same check confirm and invoicing run;
 *   - a confirmed order is never given a schedule after being billed in full, nor stripped of one;
 *   - a payment that names an instalment is never moved to another date or amount, nor orphaned
 *     (`PAID_ROW_CHANGED`).
 *
 * ALL OR NONE. The writes run in one transaction, nested as a savepoint when the caller already holds
 * one, so a refusal or a failed save leaves the order's schedule as it was. Sending the same list
 * twice writes nothing the second time.
 *
 * A CONFIRM THAT LANDS MID-REPLACE. The order is read and planned before the transaction opens, so a
 * confirm could book the order in between: an order confirmed with no schedule is billed in full, and
 * rows inserted after that would bill it again. So the first thing inside the transaction is a
 * re-read of the order's status under an update lock (`UPDLOCK, HOLDLOCK` on SQL Server,
 * `FOR UPDATE` on PostgreSQL), held until commit. Confirm writes the order row before it reads the
 * schedule, so it either finished first and the re-read sees it, or it waits for this transaction and
 * then sees the new rows. When the status moved, the plan's refusals are re-run against the new
 * status (`BILLED_WITHOUT_SCHEDULE`, `SCHEDULE_REQUIRED`, `ORDER_VOIDED`) before anything is written.
 *
 * WHAT IT DOES NOT DO: issue anything. A new row due on or before today stays `Scheduled` and appears
 * on the billing worklist like any other; only confirm and `Orders.IssueInstalmentInvoice` issue.
 */
import {
    BaseRemotableOperation,
    DatabaseProviderBase,
    LogError,
    RunView,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersReplacePaymentScheduleOperation as OrdersReplacePaymentScheduleOperationBase,
    type OrdersReplacePaymentScheduleInput,
    type OrdersReplacePaymentScheduleOutput,
    type mjBizAppsOrdersOrderHeaderPaymentScheduleEntity,
} from '@mj-biz-apps/orders-entities';

import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_ENTITY, PAYMENT_LINE_ENTITY } from './entity-names.js';
import { ExplainShortfalls, ScheduleShortfalls } from './PaymentScheduleBehavior.js';
import {
    NormaliseReplacementRows,
    PlanScheduleReplacement,
    type ExistingScheduleRow,
    type ScheduleReplacementPlan,
    type ScheduleReplacementRefusalCode,
} from './PaymentScheduleReplacement.js';
import { AppliedScheduleReductions } from './ReversalScheduleReduction.js';
import { RequireUUID } from './sql-guards.js';

interface OrderFacts {
    ID: string;
    OrderNumber: string;
    Status: string;
    CompanyID: string;
}

const empty = (out: Partial<OrdersReplacePaymentScheduleOutput>): OrdersReplacePaymentScheduleOutput => ({
    Success: false,
    Rows: [],
    Kept: 0,
    Written: 0,
    Removed: 0,
    Changed: false,
    WasPreview: false,
    ...out,
});

@RegisterClass(BaseRemotableOperation, 'Orders.ReplacePaymentSchedule')
export class ReplacePaymentScheduleOperation extends OrdersReplacePaymentScheduleOperationBase {
    protected async InternalExecute(
        input: OrdersReplacePaymentScheduleInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersReplacePaymentScheduleOutput> {
        let orderID: string;
        try {
            orderID = RequireUUID(input?.OrderHeaderID, 'OrderHeaderID');
        } catch (e) {
            return empty({ Code: 'INVALID_ORDER_ID', Message: (e as Error).message });
        }
        const supplied = NormaliseReplacementRows(input?.Rows);
        if ('Refused' in supplied) return empty({ OrderHeaderID: orderID, Code: supplied.Code, Message: supplied.Message });

        const read = await this.readOrder(orderID, provider, user);
        if ('Message' in read) return empty({ OrderHeaderID: orderID, ...read });
        const { order, rows, lines } = read;

        const echo = { OrderHeaderID: order.ID, OrderNumber: order.OrderNumber, WasPreview: !!input.Preview };
        const plan = PlanScheduleReplacement(order, rows, supplied);
        if ('Refused' in plan) return empty({ ...echo, Code: plan.Code, Message: plan.Message });

        const shortfalls = ScheduleShortfalls(plan.Final, lines, order.CompanyID);
        if (shortfalls.length) {
            return empty({ ...echo, Code: 'TIE_FAILED', Message: ExplainShortfalls(order.OrderNumber, shortfalls) });
        }

        const out: OrdersReplacePaymentScheduleOutput = {
            ...echo,
            Success: true,
            Rows: plan.Final.map((r) => ({
                OrderHeaderPaymentScheduleID: r.ID,
                InstallmentNumber: r.InstallmentNumber,
                DueDate: r.DueDate,
                Amount: Number(r.Amount),
                Status: r.Status,
                DocumentNumber: r.DocumentNumber,
                Kept: r.Kept,
            })),
            Kept: plan.Final.filter((r) => r.Kept).length,
            Written: plan.Update.length + plan.Insert.length,
            Removed: plan.Delete.length,
            Changed: !plan.Unchanged,
            Message: plan.Unchanged
                ? `Order ${order.OrderNumber}'s payment schedule already matches; nothing was changed.`
                : `Order ${order.OrderNumber}'s payment schedule now has ${plan.Final.length} instalment(s).`,
        };
        if (input.Preview || plan.Unchanged) return out;

        const failure = await this.apply(order, plan, provider, user, out, (status) => {
            const recheck = PlanScheduleReplacement({ ...order, Status: status }, rows, supplied);
            return 'Refused' in recheck ? recheck : null;
        });
        return failure ? empty({ ...echo, ...failure }) : out;
    }

    /** The order, its schedule rows (cancelled included) and the line totals the tie is checked against. */
    private async readOrder(
        orderID: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<
        | { order: OrderFacts; rows: ExistingScheduleRow[]; lines: Array<{ CompanyID: string; LineTotalGross: number }> }
        | { Code: 'NOT_FOUND' | 'READ_FAILED'; Message: string }
    > {
        const rv = RunView.FromMetadataProvider(provider);
        const [orders, rows, lines, named] = await rv.RunViews(
            [
                { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID = '${orderID}'`, Fields: ['ID', 'OrderNumber', 'Status', 'CompanyID'], ResultType: 'simple', BypassCache: true },
                {
                    EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
                    ExtraFilter: `OrderHeaderID = '${orderID}'`,
                    Fields: ['ID', 'CompanyID', 'InstallmentNumber', 'DueDate', 'Amount', 'AmountPaid', 'Status', 'DocumentNumber', 'Description'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderHeaderID = '${orderID}'`, Fields: ['CompanyID', 'LineTotalGross'], ResultType: 'simple', BypassCache: true },
                // Any payment line naming a row, whatever its payment's status: the foreign key holds
                // for all of them, so each one stops that row being deleted.
                {
                    EntityName: PAYMENT_LINE_ENTITY,
                    ExtraFilter: `OrderHeaderID = '${orderID}' AND OrderHeaderPaymentScheduleID IS NOT NULL`,
                    Fields: ['OrderHeaderPaymentScheduleID'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
            ],
            user,
        );
        const failed = [orders, rows, lines, named].find((r) => !r.Success);
        if (failed) return { Code: 'READ_FAILED', Message: `Could not read order ${orderID}: ${failed.ErrorMessage ?? 'unknown error'}` };
        const order = (orders.Results ?? [])[0] as OrderFacts | undefined;
        if (!order) return { Code: 'NOT_FOUND', Message: `No order with ID ${orderID}.` };

        // An approved amount change or a return lowered the instalments rather than the lines, so the
        // lines are read less what each took off them, exactly as invoicing reads them.
        const reductions = await AppliedScheduleReductions(order.ID, { Provider: provider, User: user });
        const namedIDs = new Set(
            ((named.Results ?? []) as Array<{ OrderHeaderPaymentScheduleID: string }>).map((p) => p.OrderHeaderPaymentScheduleID.toLowerCase()),
        );
        return {
            order,
            rows: ((rows.Results ?? []) as ExistingScheduleRow[]).map((r) => ({ ...r, NamedByPayment: namedIDs.has(r.ID.toLowerCase()) })),
            lines: [
                ...((lines.Results ?? []) as Array<{ CompanyID: string; LineTotalGross: number }>),
                ...reductions.map((c) => ({ CompanyID: c.CompanyID, LineTotalGross: -c.Gross })),
            ],
        };
    }

    /**
     * Write the plan in one transaction: lock and re-read the order's status, then deletes, then
     * updates in the plan's order, then inserts. Returns the refusal or failure, or null. Fills in the
     * IDs of rows it created on `out`.
     *
     * `recheck` re-runs the plan's refusals against a status that moved since the first read.
     */
    private async apply(
        order: OrderFacts,
        plan: ScheduleReplacementPlan,
        provider: IMetadataProvider,
        user: UserInfo,
        out: OrdersReplacePaymentScheduleOutput,
        recheck: (status: string) => { Code: ScheduleReplacementRefusalCode; Message: string } | null,
    ): Promise<{ Code: ScheduleReplacementRefusalCode | 'WRITE_FAILED'; Message: string } | null> {
        const db = provider as unknown as DatabaseProviderBase;
        await db.BeginTransaction();
        try {
            const status = await this.lockOrderStatus(order.ID, provider, user);
            if (status === null) throw new Error(`the order could not be locked`);
            if (status !== order.Status) {
                const refused = recheck(status);
                if (refused) {
                    await this.rollback(db);
                    return { Code: refused.Code, Message: refused.Message };
                }
            }
            for (const id of plan.Delete) {
                const row = await this.load(id, provider, user);
                if (!(await row.Delete())) throw new Error(`instalment ${row.InstallmentNumber} could not be removed: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            for (const change of plan.Update) {
                const row = await this.load(change.ID, provider, user);
                this.assign(row, change);
                if (!(await row.Save())) throw new Error(`instalment ${change.InstallmentNumber} could not be saved: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            for (const add of plan.Insert) {
                const row = await provider.GetEntityObject<mjBizAppsOrdersOrderHeaderPaymentScheduleEntity>(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, user);
                row.NewRecord();
                row.OrderHeaderID = order.ID;
                // Stamped again by the entity server from the order; set so the object is complete.
                row.CompanyID = order.CompanyID;
                row.Status = 'Scheduled';
                this.assign(row, add);
                if (!(await row.Save())) throw new Error(`instalment ${add.InstallmentNumber} could not be added: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                const echoed = out.Rows.find((r) => r.OrderHeaderPaymentScheduleID === null && r.InstallmentNumber === add.InstallmentNumber);
                if (echoed) echoed.OrderHeaderPaymentScheduleID = row.ID;
            }
            await db.CommitTransaction();
            return null;
        } catch (err) {
            const message = `Order ${order.OrderNumber}'s payment schedule was not changed: ${err instanceof Error ? err.message : String(err)}`;
            LogError(`Orders.ReplacePaymentSchedule: ${message}`);
            await this.rollback(db);
            return { Code: 'WRITE_FAILED', Message: message };
        }
    }

    private async rollback(db: DatabaseProviderBase): Promise<void> {
        try {
            await db.RollbackTransaction();
        } catch (rollbackErr) {
            LogError(`Orders.ReplacePaymentSchedule: rollback failed: ${rollbackErr}`);
        }
    }

    /**
     * The order's status, read under an update lock held to the end of the transaction, or null when
     * the row is gone. A concurrent confirm writes the order row, so it cannot pass this lock.
     */
    private async lockOrderStatus(orderID: string, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
        const db = provider as unknown as {
            PlatformKey?: string;
            ExecuteSQL(sql: string, params?: unknown[], options?: unknown, user?: UserInfo): Promise<unknown>;
        };
        const id = RequireUUID(orderID, 'OrderHeaderID');
        const sql =
            db.PlatformKey === 'postgresql'
                ? `SELECT "Status" FROM __mj_BizAppsOrders."OrderHeader" WHERE "ID" = '${id}' FOR UPDATE;`
                : `SELECT Status FROM __mj_BizAppsOrders.OrderHeader WITH (UPDLOCK, HOLDLOCK) WHERE ID = '${id}';`;
        const rows = (await db.ExecuteSQL(sql, undefined, undefined, user)) as Array<{ Status: string }> | null;
        return rows?.[0]?.Status ?? null;
    }

    private async load(id: string, provider: IMetadataProvider, user: UserInfo): Promise<mjBizAppsOrdersOrderHeaderPaymentScheduleEntity> {
        const row = await provider.GetEntityObject<mjBizAppsOrdersOrderHeaderPaymentScheduleEntity>(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, user);
        if (!(await row.Load(id))) throw new Error(`instalment ${id} could not be loaded`);
        return row;
    }

    private assign(
        row: mjBizAppsOrdersOrderHeaderPaymentScheduleEntity,
        values: { InstallmentNumber: number; DueDate: string; Amount: number; Description: string | null },
    ): void {
        row.InstallmentNumber = values.InstallmentNumber;
        row.DueDate = new Date(`${values.DueDate}T00:00:00Z`);
        row.Amount = values.Amount;
        row.Description = values.Description;
    }
}

/** Registers {@link ReplacePaymentScheduleOperation}. Called from the server bootstrap. */
export function LoadReplacePaymentScheduleOperation(): void {
    void ReplacePaymentScheduleOperation;
}
