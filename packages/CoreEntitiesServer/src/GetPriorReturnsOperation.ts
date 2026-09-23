/**
 * @fileoverview `Orders.GetPriorReturns` — how much of a line has already gone back.
 *
 * WHY THIS IS AN OPERATION AND NOT A VIEW THE CALLER FILTERS. The number looks like a sum over
 * reversal lines and is not one. Two rules sit on top of it, and both are the kind that produce a
 * plausible wrong answer rather than an obvious one:
 *
 *   · reversals SUM ACROSS ORDERS — two units back in March and two more in June are separate
 *     return orders, each individually within the original, and only the running total catches the
 *     third;
 *   · DRAFT AND VOIDED RETURNS DO NOT COUNT — a draft that never confirms would hold the customer's
 *     allowance hostage, and a voided one has already given it back.
 *
 * `ReversalResolver` already knows both, because the server enforces the real cap with them at
 * confirm time. A screen that computed its own maximum from a view would be a SECOND copy of that
 * rule, and the two would drift the first time either changed — with the screen's copy being the one
 * nobody tests. So the screen asks the same code the server refuses with.
 *
 * READ-ONLY, and it writes nothing.
 *
 * CONNECTS TO:
 *   CODE: ReversalResolver.LoadReversalContext (the rule), ReversalBehavior.RemainingReturnable
 *   UI:   the Return page's per-line maximum
 *   DOC:  plans/archive/bizapps-orders-master.md D16
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersGetPriorReturnsOperation as OrdersGetPriorReturnsOperationBase,
    type GetPriorReturnsInput,
    type GetPriorReturnsOutput,
} from '@mj-biz-apps/orders-entities';

import { LoadReversalContext } from './ReversalResolver.js';
import { RemainingReturnable } from './ReversalBehavior.js';
import { RequireUUID } from './sql-guards.js';

/** Asking about more lines than any return screen shows is a sign of a caller doing something else. */
const MAX_LINES = 200;

@RegisterClass(BaseRemotableOperation, 'Orders.GetPriorReturns')
export class GetPriorReturnsOperation extends OrdersGetPriorReturnsOperationBase {
    protected async InternalExecute(
        input: GetPriorReturnsInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<GetPriorReturnsOutput> {
        const requested = input?.OrderLineIDs ?? [];
        if (!requested.length) return { Lines: [] };
        if (requested.length > MAX_LINES) {
            throw new Error(
                `GetPriorReturns was asked about ${requested.length} lines; the limit is ${MAX_LINES}. ` +
                    `Ask about the lines of one order at a time.`,
            );
        }

        const out: GetPriorReturnsOutput = { Lines: [] };
        for (const raw of requested) {
            const orderLineID = RequireUUID(raw, 'OrderLineID');
            const context = await LoadReversalContext(orderLineID, provider, user);
            // A LINE THAT DOES NOT EXIST GETS A ROW, not an omission. The caller is populating a
            // column per line; a missing row would render as a blank cell that reads like "nothing
            // returned yet", which is the one wrong answer that invites an over-return.
            if (!context) {
                throw new Error(
                    `Order line ${orderLineID} does not exist, so how much of it has been returned ` +
                        `cannot be answered.`,
                );
            }
            out.Lines.push({
                OrderLineID: orderLineID,
                AlreadyReturned: context.AlreadyReversed,
                RemainingReturnable: RemainingReturnable(context.Origin.Quantity, context.AlreadyReversed),
            });
        }
        return out;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadGetPriorReturnsOperation(): void {
    // intentionally empty
}
