/**
 * PaymentTermsChange — change a confirmed order's payment terms through an approved concession (#309).
 *
 * WHAT CARRIES IT. Payment terms are a commercial concession: they move when the cash arrives without changing
 * the price. On a confirmed order they change only through a `Terms` `OrderConcession`, which records the prior
 * and new terms, the change in days to payment, who asked, why, and who approved it. It always goes to approval
 * and the requester cannot decide it. Applying it changes, in the approval's own transaction:
 *   - the order's `PaymentTermsTypeID`, the one write past the confirmed-order freeze (./PaymentTermsSanction.ts);
 *   - its `DueDate`, to the order date plus the new terms' days, so the invoice's terms and date agree.
 * MJ record-change tracking records both. Instalment due dates on a payment schedule are not moved.
 *
 * WHEN IT IS REFUSED, and nothing is written:
 *   - the order is not Confirmed (an unconfirmed order's terms are edited on the order);
 *   - the new terms are missing, inactive or the order's current terms;
 *   - another Terms concession on the order is still Pending;
 *   - at approval, the order's terms are no longer the ones the concession was recorded against.
 *
 * `trg_OrderHeader_ImmutableAfterConfirm` (51018) admits a change to a confirmed order's terms only when it
 * matches the order's latest approved Terms concession, so direct SQL cannot go around this either.
 *
 * CONNECTS TO:
 *   CALLER: OrderConcessionEntityServer (record, apply) · AmendArrangementOperation (preview)
 *   WRITES: Order Headers (PaymentTermsTypeID, DueDate)
 */
import { RunView, type IRunViewProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { PaymentTermsDaysChange, ToISODate } from '@mj-biz-apps/orders-entities';
import type { ApprovalTaskContext } from './ConcessionApprovalTask.js';
import { ORDER_CONCESSION_ENTITY, ORDER_HEADER_ENTITY } from './entity-names.js';
import { OrderEntityServer } from './OrderEntityServer.js';
import { AddDays } from './PaymentTermsBehavior.js';
import { GrantPaymentTermsChange } from './PaymentTermsSanction.js';
import { RequireUUID } from './sql-guards.js';

const PAYMENT_TERMS_TYPE_ENTITY = 'MJ_BizApps_Orders: Payment Terms Types';

export interface TermsChangeRequest {
    OrderHeaderID: string;
    NewPaymentTermsTypeID: string;
    /** The concession being recorded, when it already has an ID; it is not counted as another Pending one. */
    ConcessionID?: string | null;
}

export interface CheckedTermsChange {
    OrderHeaderID: string;
    OrderNumber: string;
    PriorPaymentTermsTypeID: string | null;
    PriorTermsName: string | null;
    NewPaymentTermsTypeID: string;
    NewTermsName: string;
    /** Days to payment the change moves by: positive when the customer pays later. */
    DaysChange: number;
    CurrentDueDate: string | null;
    /** The order date plus the new terms' days. */
    NewDueDate: string | null;
}

export interface ApprovedTermsConcession {
    OrderHeaderID: string;
    PriorPaymentTermsTypeID: string | null;
    NewPaymentTermsTypeID: string;
}

interface OrderRow {
    ID: string;
    OrderNumber: string;
    Status: string;
    OrderDate: Date | string;
    DueDate: Date | string | null;
    PaymentTermsTypeID: string | null;
}

interface TermsRow {
    ID: string;
    Name: string;
    NetDays: number | null;
    IsActive: boolean;
}

/** Refuse now what could never be applied. Returns the change's facts, or why it cannot be made. */
export async function CheckTermsChange(request: TermsChangeRequest, ctx: ApprovalTaskContext): Promise<CheckedTermsChange | string> {
    const orderID = RequireUUID(request.OrderHeaderID, 'OrderHeaderID');
    const newTermsID = RequireUUID(request.NewPaymentTermsTypeID, 'NewPaymentTermsTypeID');

    const order = (
        await view<OrderRow>(ctx, {
            EntityName: ORDER_HEADER_ENTITY,
            ExtraFilter: `ID = '${orderID}'`,
            Fields: ['ID', 'OrderNumber', 'Status', 'OrderDate', 'DueDate', 'PaymentTermsTypeID'],
            ResultType: 'simple',
        })
    )[0];
    if (!order) return `Order ${orderID} was not found.`;
    if (order.Status !== 'Confirmed') {
        return `Order ${order.OrderNumber} is ${order.Status}, not Confirmed; its payment terms are edited on the order itself.`;
    }
    if (UUIDsEqual(order.PaymentTermsTypeID, newTermsID)) {
        return `Order ${order.OrderNumber} already has these payment terms.`;
    }

    const terms = await termsByID([newTermsID, order.PaymentTermsTypeID], ctx);
    const next = terms.get(newTermsID.toLowerCase());
    if (!next) return `Payment terms ${newTermsID} were not found.`;
    if (!next.IsActive) return `Payment terms ${next.Name} are inactive.`;
    const prior = order.PaymentTermsTypeID ? terms.get(order.PaymentTermsTypeID.toLowerCase()) ?? null : null;

    const pending = await view<{ ID: string }>(ctx, {
        EntityName: ORDER_CONCESSION_ENTITY,
        ExtraFilter:
            `OrderHeaderID = '${orderID}' AND DeliveryForm = 'Terms' AND Status = 'Pending'` +
            (request.ConcessionID ? ` AND ID <> '${RequireUUID(request.ConcessionID, 'ConcessionID')}'` : ''),
        Fields: ['ID'],
        ResultType: 'simple',
    });
    if (pending.length > 0) {
        return (
            `Order ${order.OrderNumber} already has a change of payment terms awaiting approval. Decide or withdraw ` +
            `it before recording another.`
        );
    }

    return {
        OrderHeaderID: order.ID,
        OrderNumber: order.OrderNumber,
        PriorPaymentTermsTypeID: order.PaymentTermsTypeID,
        PriorTermsName: prior?.Name ?? null,
        NewPaymentTermsTypeID: next.ID,
        NewTermsName: next.Name,
        DaysChange: PaymentTermsDaysChange(prior?.NetDays ?? null, next.NetDays),
        CurrentDueDate: ToISODate(order.DueDate),
        NewDueDate: AddDays(order.OrderDate, Number(next.NetDays ?? 0)),
    };
}

/**
 * Apply an approved Terms concession to its order, in the caller's transaction. Throws when it cannot, so the
 * approval does not happen either.
 */
export async function ApplyTermsChange(concession: ApprovedTermsConcession, ctx: ApprovalTaskContext): Promise<void> {
    const order = await ctx.Provider.GetEntityObject<OrderEntityServer>(ORDER_HEADER_ENTITY, ctx.User);
    if (!(order instanceof OrderEntityServer)) {
        throw new Error("The order was not loaded through the orders server's entity subclass, so its payment terms cannot be changed.");
    }
    if (!(await order.Load(RequireUUID(concession.OrderHeaderID, 'OrderHeaderID')))) {
        throw new Error(`Order ${concession.OrderHeaderID} was not found.`);
    }
    if (!UUIDsEqual(order.PaymentTermsTypeID, concession.PriorPaymentTermsTypeID)) {
        throw new Error(
            `Order ${order.OrderNumber}'s payment terms have changed since this concession was recorded, so it can no ` +
                `longer be applied. Reject it and record a new one.`,
        );
    }

    const next = (await termsByID([concession.NewPaymentTermsTypeID], ctx)).get(concession.NewPaymentTermsTypeID.toLowerCase());
    if (!next) throw new Error(`Payment terms ${concession.NewPaymentTermsTypeID} were not found.`);
    const dueDate = AddDays(order.OrderDate, Number(next.NetDays ?? 0));

    GrantPaymentTermsChange(order);
    order.PaymentTermsTypeID = next.ID;
    if (dueDate) order.DueDate = new Date(dueDate);
    if (!(await order.Save())) {
        throw new Error(`Order ${order.OrderNumber}'s payment terms could not be changed: ${order.LatestResult?.CompleteMessage}`);
    }
}

async function termsByID(ids: (string | null)[], ctx: ApprovalTaskContext): Promise<Map<string, TermsRow>> {
    const wanted = ids.filter((id): id is string => !!id).map((id) => `'${RequireUUID(id, 'PaymentTermsTypeID')}'`);
    if (wanted.length === 0) return new Map();
    const rows = await view<TermsRow>(ctx, {
        EntityName: PAYMENT_TERMS_TYPE_ENTITY,
        ExtraFilter: `ID IN (${wanted.join(', ')})`,
        Fields: ['ID', 'Name', 'NetDays', 'IsActive'],
        ResultType: 'simple',
    });
    return new Map(rows.map((r) => [String(r.ID).toLowerCase(), r]));
}

async function view<T>(ctx: ApprovalTaskContext, params: Parameters<RunView['RunView']>[0]): Promise<T[]> {
    const rv = new RunView(ctx.Provider as unknown as IRunViewProvider);
    const res = await rv.RunView<T>({ ...params, BypassCache: true }, ctx.User);
    if (!res.Success) throw new Error(`Reading ${params.EntityName} failed: ${res.ErrorMessage}`);
    return res.Results;
}
