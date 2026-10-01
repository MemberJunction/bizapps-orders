/**
 * @fileoverview `Orders.CheckCoverageOverlap` — would confirming this draft create coverage that
 * overlaps another band the holder already has (golive #276)?
 *
 * WHY THIS IS AN OPERATION AND NOT A CLIENT QUERY. Who a line's subscriber is (ship-to falling back
 * to the header, an organization inferred from the person's affiliation), which axes define a
 * duplicate (the type's BenefitModel), and what the term's dates will be (the type's start and end
 * rules) are all decided on the server at confirm. A notice computed from its own queries would be
 * a second copy of those rules, and it would disagree with the refusal the first time either
 * changed. So the editor asks the same code confirm refuses with.
 *
 * READ-ONLY: it loads the order and runs the confirm-time decision pass in preview, which writes
 * nothing.
 *
 * CONNECTS TO:
 *   CODE: OrderEntityServer.PreviewCoverageOverlaps, SubscriptionBehavior.DecideCoverageOverlap
 *   UI:   the order lines editor's coverage notice
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersCheckCoverageOverlapOperation as OrdersCheckCoverageOverlapOperationBase,
    type CheckCoverageOverlapInput,
    type CheckCoverageOverlapOutput,
} from '@mj-biz-apps/orders-entities';

import type { OrderEntityServer } from './OrderEntityServer.js';
import { RequireUUID } from './sql-guards.js';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Order Headers';

const day = (d: Date) => d.toISOString().slice(0, 10);

@RegisterClass(BaseRemotableOperation, 'Orders.CheckCoverageOverlap')
export class CheckCoverageOverlapOperation extends OrdersCheckCoverageOverlapOperationBase {
    protected async InternalExecute(
        input: CheckCoverageOverlapInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<CheckCoverageOverlapOutput> {
        const orderID = RequireUUID(input?.OrderHeaderID, 'OrderHeaderID');

        const order = await provider.GetEntityObject<OrderEntityServer>(ORDER_ENTITY, user);
        if (!(await order.Load(orderID))) {
            throw new Error(`Order ${orderID} does not exist, so its coverage cannot be checked.`);
        }
        // A booked order has already created its subscriptions; there is nothing left to warn about.
        if (order.Status !== 'Draft') return { Lines: [] };

        const found = await order.PreviewCoverageOverlaps();
        return {
            Lines: found
                .filter((f) => f.Decision.Outcome !== 'None')
                .map((f) => ({
                    OrderLineID: f.Line.ID,
                    Outcome: f.Decision.Outcome as CheckCoverageOverlapOutput['Lines'][number]['Outcome'],
                    Message: f.Decision.Message ?? '',
                    Overlaps: f.Overlaps.map((o) => ({
                        SubscriptionID: o.SubscriptionID,
                        SubscriptionNumber: o.SubscriptionNumber,
                        ProductName: o.ProductName,
                        CoverageStart: day(o.CoverageStart),
                        CoverageEnd: day(o.CoverageEnd),
                    })),
                })),
        };
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadCheckCoverageOverlapOperation(): void {
    // intentionally empty
}
