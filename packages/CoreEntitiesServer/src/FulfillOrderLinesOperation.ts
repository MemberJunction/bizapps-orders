/**
 * @fileoverview `Orders.FulfillOrderLines` — flip lines, and close the order when the last one goes.
 *
 * WHY ONE OPERATION AND NOT TWO. Marking lines shipped and advancing the order are the same
 * decision. Split across two calls there is a window in which every line is Fulfilled and the order
 * still reads Posted — which a warehouse experiences as the system losing its work, and which a
 * second caller can widen indefinitely by never making the second call.
 *
 * THE ADVANCE RULE, and the mistake it avoids. An order advances when nothing is AWAITING
 * fulfilment — not when every line is Fulfilled. On a mixed order the subscription line never flips,
 * because it has nothing to flip, so the stricter test would hold that order open forever while the
 * warehouse insists it shipped everything. Only lines that CAN be fulfilled are allowed to hold it.
 *
 * NO JOURNAL ENTRY FIRES (D15). Fulfilment is a logistics fact; revenue was settled at booking and
 * releases on its own schedule. Coupling them would let a warehouse delay restate a closed period.
 *
 * A REFUSAL IS DATA, NOT AN ERROR. Scanning an already-shipped item is an ordinary mistake, so
 * refusals come back per line with reasons and the rest of the batch still lands — a picker who
 * scans one wrong item should not lose nine good scans. `AllOrNothing` is there for callers that
 * want the opposite.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import {
    BaseEntity,
    BaseRemotableOperation,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import {
    mjBizAppsOrdersOrderHeaderEntity,
    mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersFulfillOrderLinesOperation as OrdersFulfillOrderLinesOperationBase,
    type OrdersFulfillOrderLinesInput,
    type OrdersFulfillOrderLinesOutput,
    type AdvancedOrderResult,
    type FulfilledLineResult,
} from '@mj-biz-apps/orders-entities';

import {
    ExplainRefusal,
    RefuseFlip,
    ShouldAdvanceToFulfilled,
    type FulfillableLine,
} from './FulfillmentBehavior.js';
import { RequireUUID } from './sql-guards.js';

const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';

const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
const quote = (ids: string[]): string => [...new Set(ids.map((i) => `'${RequireUUID(i, 'OrderLineID')}'`))].join(',');

@RegisterClass(BaseRemotableOperation, 'Orders.FulfillOrderLines')
export class FulfillOrderLinesOperation extends OrdersFulfillOrderLinesOperationBase {
    protected async InternalExecute(
        input: OrdersFulfillOrderLinesInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersFulfillOrderLinesOutput> {
        const requested = [...new Set((input?.OrderLineIDs ?? []).filter(Boolean))];
        if (!requested.length) {
            return this.refuseAll('No order lines were given to fulfil.');
        }

        const rv = new RunView(provider as unknown as IRunViewProvider);

        const lines = await rv.RunView<{
            ID: string;
            OrderHeaderID: string;
            ProductID: string;
            FulfillmentStatus: string | null;
            ReversesOrderLineID: string | null;
            IsRollupParent: boolean;
        }>(
            { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `ID IN (${quote(requested)})`, ResultType: 'simple' },
            user,
        );
        const lineRows = lines.Results ?? [];

        // Every order the requested lines belong to — plus, crucially, ALL of those orders' lines,
        // because deciding whether an order may advance needs its whole picture, not just the lines
        // in this batch.
        const orderIDs = [...new Set(lineRows.map((l) => l.OrderHeaderID))];
        const orders = orderIDs.length
            ? await rv.RunView<{ ID: string; OrderNumber: string; Status: string }>(
                  { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID IN (${quote(orderIDs)})`, ResultType: 'simple' },
                  user,
              )
            : { Results: [] };
        const orderByID = new Map((orders.Results ?? []).map((o) => [key(o.ID), o]));

        const allLines = orderIDs.length
            ? await rv.RunView<{
                  ID: string;
                  OrderHeaderID: string;
                  ProductID: string;
                  FulfillmentStatus: string | null;
                  ReversesOrderLineID: string | null;
                  IsRollupParent: boolean;
              }>(
                  {
                      EntityName: ORDER_LINE_ENTITY,
                      ExtraFilter: `OrderHeaderID IN (${quote(orderIDs)})`,
                      ResultType: 'simple',
                  },
                  user,
              )
            : { Results: [] };
        const allLineRows = allLines.Results ?? [];

        const requiresFulfillment = await this.buildRequiresFulfillment(rv, allLineRows, user);

        const shape = (l: (typeof allLineRows)[number]): FulfillableLine => ({
            ID: l.ID,
            RequiresFulfillment: requiresFulfillment(l.ProductID),
            FulfillmentStatus: (l.FulfillmentStatus as FulfillableLine['FulfillmentStatus']) ?? null,
            ReversesOrderLineID: l.ReversesOrderLineID,
            IsRollupParent: !!l.IsRollupParent,
        });

        // ── DECIDE FIRST, WRITE SECOND ──
        // With AllOrNothing the caller expects nothing to move if anything is refused, so every
        // decision has to be made before the first write.
        const byID = new Map(lineRows.map((l) => [key(l.ID), l]));
        const decisions: FulfilledLineResult[] = requested.map((id) => {
            const row = byID.get(key(id));
            const order = row ? orderByID.get(key(row.OrderHeaderID)) : undefined;
            const refusal = RefuseFlip(row ? shape(row) : null, order?.Status ?? '');
            return refusal
                ? { OrderLineID: id, Fulfilled: false, Refusal: refusal, RefusalReason: ExplainRefusal(refusal, id) }
                : { OrderLineID: id, Fulfilled: true, Refusal: null, RefusalReason: null };
        });

        const refused = decisions.filter((d) => !d.Fulfilled);
        if (input?.AllOrNothing && refused.length) {
            return {
                Success: false,
                Message:
                    `Refused: ${refused.length} of ${requested.length} line(s) cannot be fulfilled, and ` +
                    `AllOrNothing was set, so nothing was changed. First reason: ${refused[0].RefusalReason}`,
                Lines: decisions.map((d) => ({ ...d, Fulfilled: false })),
                Orders: [],
                FulfilledCount: 0,
                RefusedCount: refused.length,
                AdvancedCount: 0,
            };
        }

        // ── WRITE ──
        const flipped = new Set<string>();
        for (const decision of decisions.filter((d) => d.Fulfilled)) {
            const entity = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
            const loaded = await entity.Load(
                decision.OrderLineID,
            );
            if (!loaded) {
                decision.Fulfilled = false;
                decision.Refusal = 'LineNotFound';
                decision.RefusalReason = ExplainRefusal('LineNotFound', decision.OrderLineID);
                continue;
            }
            entity.FulfillmentStatus = 'Fulfilled';
            if (!(await entity.Save())) {
                // FulfillmentStatus is the ONE line column the immutability trigger lets a fulfiller
                // change on a Confirmed order (the D15 carve-out). A refusal here means something
                // else objected, and the caller needs the reason rather than a silent skip.
                decision.Fulfilled = false;
                decision.Refusal = 'SaveFailed';
                decision.RefusalReason =
                    `Order line ${decision.OrderLineID} could not be marked Fulfilled: ` +
                    `${entity.LatestResult?.CompleteMessage ?? 'no reason given'}`;
                continue;
            }
            flipped.add(key(decision.OrderLineID));
        }

        // ── ADVANCE the orders whose last fulfillable line just went ──
        const advanced: AdvancedOrderResult[] = [];
        for (const orderID of orderIDs) {
            const order = orderByID.get(key(orderID));
            if (!order) continue;

            const after = allLineRows
                .filter((l) => key(l.OrderHeaderID) === key(orderID))
                .map((l) => (flipped.has(key(l.ID)) ? { ...l, FulfillmentStatus: 'Fulfilled' } : l))
                .map(shape);

            const remaining = after.filter(
                (l) =>
                    l.RequiresFulfillment &&
                    !l.ReversesOrderLineID &&
                    !l.IsRollupParent &&
                    (l.FulfillmentStatus ?? 'Pending') === 'Pending',
            ).length;

            let statusAfter = order.Status;
            let didAdvance = false;

            if (ShouldAdvanceToFulfilled(after) && order.FulfillmentStatus !== 'Fulfilled') {
                const header = await provider.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(ORDER_HEADER_ENTITY, user);
                if (await header.Load(orderID)) {
                    header.FulfillmentStatus = 'Fulfilled';
                    if (await header.Save()) {
                        didAdvance = true;
                    }
                }
            }

            advanced.push({
                OrderHeaderID: orderID,
                OrderNumber: order.OrderNumber,
                StatusBefore: order.Status,
                StatusAfter: statusAfter,
                AdvancedToFulfilled: didAdvance || remaining === 0,
                RemainingLineCount: remaining,
            });
        }

        const fulfilledCount = decisions.filter((d) => d.Fulfilled).length;
        const refusedCount = decisions.length - fulfilledCount;
        return {
            Success: true,
            Message:
                refusedCount > 0
                    ? `${fulfilledCount} line(s) fulfilled, ${refusedCount} refused. See Lines for reasons.`
                    : undefined,
            Lines: decisions,
            Orders: advanced,
            FulfilledCount: fulfilledCount,
            RefusedCount: refusedCount,
            AdvancedCount: advanced.filter((a) => a.AdvancedToFulfilled).length,
        };
    }

    /** product id → does its type require fulfilment. Two queries, not one per line. */
    private async buildRequiresFulfillment(
        rv: RunView,
        lines: Array<{ ProductID: string }>,
        user: UserInfo,
    ): Promise<(productID: string) => boolean> {
        const productIDs = [...new Set(lines.map((l) => l.ProductID))].filter(Boolean);
        if (!productIDs.length) return () => false;

        const products = await rv.RunView<{ ID: string; ProductTypeID: string }>(
            { EntityName: PRODUCT_ENTITY, ExtraFilter: `ID IN (${quote(productIDs)})`, ResultType: 'simple' },
            user,
        );
        const rows = products.Results ?? [];
        const typeIDs = [...new Set(rows.map((p) => p.ProductTypeID))].filter(Boolean);
        if (!typeIDs.length) return () => false;

        const types = await rv.RunView<{ ID: string; RequiresFulfillment: boolean }>(
            { EntityName: PRODUCT_TYPE_ENTITY, ExtraFilter: `ID IN (${quote(typeIDs)})`, ResultType: 'simple' },
            user,
        );
        const requiresByType = new Map((types.Results ?? []).map((t) => [key(t.ID), !!t.RequiresFulfillment]));
        const typeByProduct = new Map(rows.map((p) => [key(p.ID), key(p.ProductTypeID)]));

        return (productID: string) => requiresByType.get(typeByProduct.get(key(productID)) ?? '') ?? false;
    }

    private refuseAll(message: string): OrdersFulfillOrderLinesOutput {
        return {
            Success: false,
            Message: message,
            Lines: [],
            Orders: [],
            FulfilledCount: 0,
            RefusedCount: 0,
            AdvancedCount: 0,
        };
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadFulfillOrderLinesOperation(): void {
    // intentionally empty
}
