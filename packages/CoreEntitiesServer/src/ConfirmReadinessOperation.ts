/**
 * @fileoverview `Orders.ConfirmReadiness` — what would the concession gate refuse this order's
 * confirm for (golive #340)?
 *
 * WHY THIS IS AN OPERATION AND NOT A CLIENT CHECK. Whether a line's price gives away value, which
 * concession covers it, and whether a product needs sale approval are decided on the server from the
 * catalog, the price rules and the concession rows. The order form's own eligibility check knows
 * none of that, so it offered Confirm on an order the server then refused. A browser copy of the
 * rule would disagree with the refusal the first time either changed, so the form asks the same code
 * confirm refuses with.
 *
 * READ-ONLY: it loads the order and runs the gate's check, which writes nothing.
 *
 * CONNECTS TO:
 *   CODE: OrderEntityServer.PreviewConcessionProblems, ConcessionGate.FindUnapprovedConcessions
 *   UI:   the order form's "Before this can be confirmed" list
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    CanOfferConfirm,
    OrdersConfirmReadinessOperation as OrdersConfirmReadinessOperationBase,
    type ConfirmReadinessInput,
    type ConfirmReadinessOutput,
} from '@mj-biz-apps/orders-entities';

import type { OrderEntityServer } from './OrderEntityServer.js';
import { RequireUUID } from './sql-guards.js';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Order Headers';

/**
 * One of the gate's clauses as a sentence: first letter raised, a full stop added. The gate joins
 * its clauses with semicolons inside one refusal; the form lists them one per item.
 */
export function ConcessionProblemSentence(clause: string): string {
    const text = clause.trim();
    if (!text) return text;
    const raised = text.charAt(0).toUpperCase() + text.slice(1);
    return /[.!?]$/.test(raised) ? raised : `${raised}.`;
}

@RegisterClass(BaseRemotableOperation, 'Orders.ConfirmReadiness')
export class ConfirmReadinessOperation extends OrdersConfirmReadinessOperationBase {
    protected async InternalExecute(
        input: ConfirmReadinessInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ConfirmReadinessOutput> {
        const orderID = RequireUUID(input?.OrderHeaderID, 'OrderHeaderID');

        const order = await provider.GetEntityObject<OrderEntityServer>(ORDER_ENTITY, user);
        if (!(await order.Load(orderID))) {
            throw new Error(`Order ${orderID} does not exist, so whether it can be confirmed cannot be checked.`);
        }
        // A booked or voided order is past the confirm gate; there is nothing to report.
        if (!CanOfferConfirm(order.Status).Allowed) return { ConcessionProblems: [] };

        const clauses = await order.PreviewConcessionProblems();
        return { ConcessionProblems: clauses.map(ConcessionProblemSentence).filter((s) => s.length > 0) };
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadConfirmReadinessOperation(): void {
    // intentionally empty
}
