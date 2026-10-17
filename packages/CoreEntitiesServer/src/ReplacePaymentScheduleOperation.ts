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
 *   - a confirmed order is never given a schedule after being billed in full, nor stripped of one.
 *
 * ALL OR NONE. The writes run in one transaction, nested as a savepoint when the caller already holds
 * one, so a refusal or a failed save leaves the order's schedule as it was. Sending the same list
 * twice writes nothing the second time.
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

import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { ExplainShortfalls, ScheduleShortfalls } from './PaymentScheduleBehavior.js';
import {
    NormaliseReplacementRows,
    PlanScheduleReplacement,
    type ExistingScheduleRow,
    type ScheduleReplacementPlan,
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
            return empty({ Code: 'INVALID_ROW', Message: (e as Error).message });
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

        const failure = await this.apply(order, plan, provider, user, out);
        return failure ? empty({ ...echo, Code: 'WRITE_FAILED', Message: failure }) : out;
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
        const [orders, rows, lines] = await rv.RunViews(
            [
                { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID = '${orderID}'`, Fields: ['ID', 'OrderNumber', 'Status', 'CompanyID'], ResultType: 'simple', BypassCache: true },
                {
                    EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
                    ExtraFilter: `OrderHeaderID = '${orderID}'`,
                    Fields: ['ID', 'CompanyID', 'InstallmentNumber', 'DueDate', 'Amount', 'Status', 'DocumentNumber', 'Description'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderHeaderID = '${orderID}'`, Fields: ['CompanyID', 'LineTotalGross'], ResultType: 'simple', BypassCache: true },
            ],
            user,
        );
        const failed = [orders, rows, lines].find((r) => !r.Success);
        if (failed) return { Code: 'READ_FAILED', Message: `Could not read order ${orderID}: ${failed.ErrorMessage ?? 'unknown error'}` };
        const order = (orders.Results ?? [])[0] as OrderFacts | undefined;
        if (!order) return { Code: 'NOT_FOUND', Message: `No order with ID ${orderID}.` };

        // An approved amount change or a return lowered the instalments rather than the lines, so the
        // lines are read less what each took off them, exactly as invoicing reads them.
        const reductions = await AppliedScheduleReductions(order.ID, { Provider: provider, User: user });
        return {
            order,
            rows: (rows.Results ?? []) as ExistingScheduleRow[],
            lines: [
                ...((lines.Results ?? []) as Array<{ CompanyID: string; LineTotalGross: number }>),
                ...reductions.map((c) => ({ CompanyID: c.CompanyID, LineTotalGross: -c.Gross })),
            ],
        };
    }

    /**
     * Write the plan in one transaction: deletes, then updates in the plan's order, then inserts.
     * Returns the failure message, or null. Fills in the IDs of rows it created on `out`.
     */
    private async apply(
        order: OrderFacts,
        plan: ScheduleReplacementPlan,
        provider: IMetadataProvider,
        user: UserInfo,
        out: OrdersReplacePaymentScheduleOutput,
    ): Promise<string | null> {
        const db = provider as unknown as DatabaseProviderBase;
        await db.BeginTransaction();
        try {
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
            try {
                await db.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Orders.ReplacePaymentSchedule: rollback failed: ${rollbackErr}`);
            }
            return message;
        }
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
