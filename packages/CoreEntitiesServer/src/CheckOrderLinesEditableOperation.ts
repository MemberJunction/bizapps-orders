/**
 * @fileoverview `Orders.CheckOrderLinesEditable` — would the order-line veto another app registered
 * on this host refuse an edit to this order's lines (bizapps-sales#328)?
 *
 * WHY THIS IS AN OPERATION. The veto is registered on the server only (Sales registers one at MJAPI
 * startup that refuses while the deal behind the order is closed). The browser has no vetoer, so the
 * editor cannot ask it directly; without this, the first sign of a lock was the save refusing
 * changes someone had already typed.
 *
 * THE SAME ANSWER THE SAVE GIVES. Each kind is resolved through `ResolveOrderLineEditRefusal`, the
 * function `OrderLineEntityServer` refuses with, so a vetoer that throws is a refusal here exactly as
 * it is there. The editor shows the lines read-only on that refusal; reporting "editable" because the
 * vetoer could not answer would let someone type changes the save then refuses.
 *
 * ASKED OF THE ORDER, NOT A LINE. `OrderLineID` is null for every kind: the editor needs one answer
 * for the whole order before anyone picks a line.
 *
 * READ-ONLY: it loads the order to confirm the caller can read it and asks the vetoer. It saves
 * nothing.
 *
 * CONNECTS TO:
 *   CODE: order-line-edit-veto.ts (the seam), OrderLineEntityServer (the save-time refusal)
 *   UI:   the order lines editor's read-only state
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    HostOrderLineEditVeto,
    OrdersCheckOrderLinesEditableOperation as OrdersCheckOrderLinesEditableOperationBase,
    ResolveOrderLineEditRefusal,
    type mjBizAppsOrdersOrderHeaderEntity,
    type OrderLineEditKind,
    type OrdersCheckOrderLinesEditableInput,
    type OrdersCheckOrderLinesEditableOutput,
} from '@mj-biz-apps/orders-entities';

import { ORDER_HEADER_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

/** Appended to a failed vetoer's message: what the editor does about it. */
const WHEN_CHECK_FAILED = 'The lines cannot be changed until it can.';

@RegisterClass(BaseRemotableOperation, 'Orders.CheckOrderLinesEditable')
export class CheckOrderLinesEditableOperation extends OrdersCheckOrderLinesEditableOperationBase {
    protected async InternalExecute(
        input: OrdersCheckOrderLinesEditableInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersCheckOrderLinesEditableOutput> {
        const orderID = RequireUUID(input?.OrderHeaderID, 'OrderHeaderID');

        // Loaded as the caller, so a vetoer's refusal is never the answer for an order they cannot read.
        const order = await provider.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(ORDER_HEADER_ENTITY, user);
        if (!(await order.Load(orderID))) {
            throw new Error(`Order ${orderID} does not exist, so whether its lines can be changed cannot be checked.`);
        }

        const veto = HostOrderLineEditVeto();
        const ask = (kind: OrderLineEditKind) =>
            ResolveOrderLineEditRefusal(
                veto,
                { OrderHeaderID: orderID, OrderLineID: null, Kind: kind, ContextUser: user },
                WHEN_CHECK_FAILED,
            );
        const [create, update, remove] = await Promise.all([ask('create'), ask('update'), ask('delete')]);
        return { CreateRefusal: create, UpdateRefusal: update, DeleteRefusal: remove };
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadCheckOrderLinesEditableOperation(): void {
    // intentionally empty
}
