/**
 * @fileoverview `Orders.GetFulfillmentQueue` — what still has to leave the building.
 *
 * WHY THIS IS AN OPERATION AND NOT A VIEW, and not a stored flag. The queue is every line still
 * awaiting shipment, which changes as lines are FLIPPED rather than as anything is written to the
 * order. A column would need a job whose only purpose is keeping it honest, and the day that job
 * failed the warehouse would quietly stop seeing work — the worst possible failure mode for a
 * backlog, because it looks like there is nothing to do.
 *
 * WHAT DOES NOT APPEAR HERE, each for its own reason:
 *   · lines whose product TYPE requires no fulfilment — a subscription, a download, a donation;
 *   · REVERSAL lines — goods coming back are tracked on the line they reverse, not by shipping a
 *     credit;
 *   · a bundle's ROLLUP PARENT — a display row whose children carry the actual goods (D45).
 *
 * Getting any of those wrong fills the queue with work nobody can do, which is how a real queue
 * stops being read.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import {
    BaseRemotableOperation,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersGetFulfillmentQueueOperation as OrdersGetFulfillmentQueueOperationBase,
    type OrdersGetFulfillmentQueueInput,
    type OrdersGetFulfillmentQueueOutput,
    type FulfillmentQueueLine,
    type FulfillmentQueueOrder,
} from '@mj-biz-apps/orders-entities';

import { GroupForQueue, type FulfillableLine } from './FulfillmentBehavior.js';
import { RequireUUID } from './sql-guards.js';

const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';

const DEFAULT_MAX = 500;
const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
const quote = (ids: string[]): string => [...new Set(ids.map((i) => `'${RequireUUID(i, 'id')}'`))].join(',');

/**
 * Assemble the fulfilment queue.
 *
 * Orders come back OLDEST CONFIRMED FIRST — the order a warehouse should work them in. Not by size,
 * and not by customer: the oldest promise is the one most at risk of being broken.
 */
@RegisterClass(BaseRemotableOperation, 'Orders.GetFulfillmentQueue')
export class GetFulfillmentQueueOperation extends OrdersGetFulfillmentQueueOperationBase {
    protected async InternalExecute(
        input: OrdersGetFulfillmentQueueInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersGetFulfillmentQueueOutput> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const max = Math.max(1, Number(input?.MaxCount ?? DEFAULT_MAX));

        // Validated even though it is only ever compared in JS, never interpolated into SQL. The
        // guard test enforces "every caller-supplied id is checked" without exception, and that is
        // the right rule: an id that is safe today because of where it happens to be used becomes
        // unsafe the moment somebody moves it into a filter. Checking it costs nothing and also
        // turns a malformed id into a clear error rather than a silently empty result.
        const shipToAddressID = input?.ShipToAddressID
            ? RequireUUID(input.ShipToAddressID, 'ShipToAddressID')
            : null;

        // Confirmed orders with pending/partial fulfillment.
        const filters: string[] = [`Status = 'Confirmed' AND FulfillmentStatus IN ('Pending', 'PartiallyFulfilled')`];
        if (input?.CompanyIDs?.length) filters.push(`CompanyID IN (${quote(input.CompanyIDs)})`);
        if (input?.BillToOrganizationID) {
            filters.push(`BillToOrganizationID = '${RequireUUID(input.BillToOrganizationID, 'BillToOrganizationID')}'`);
        }
        if (input?.BillToPersonID) {
            filters.push(`BillToPersonID = '${RequireUUID(input.BillToPersonID, 'BillToPersonID')}'`);
        }
        if (input?.ConfirmedOnOrBefore) {
            const d = new Date(input.ConfirmedOnOrBefore);
            if (Number.isNaN(d.getTime())) {
                return this.empty(`ConfirmedOnOrBefore is not a date: '${input.ConfirmedOnOrBefore}'`);
            }
            filters.push(`OrderDate <= '${d.toISOString()}'`);
        }

        const orders = await rv.RunView<{
            ID: string;
            OrderNumber: string;
            OrderDate: string;
            ConfirmedAt: string | null;
            Status: string;
            CompanyID: string;
            Company: string | null;
            BillToOrganizationID: string | null;
            BillToPersonID: string | null;
            BillToOrganization: string | null;
            BillToPerson: string | null;
        }>(
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter: filters.join(' AND '),
                OrderBy: 'OrderDate ASC, OrderNumber ASC',
                ResultType: 'simple',
            },
            user,
        );
        const orderRows = orders.Results ?? [];
        if (!orderRows.length) return this.empty();

        // ── their LINES, and the product types that decide what needs shipping ──
        const lines = await rv.RunView<{
            ID: string;
            OrderHeaderID: string;
            LineNumber: number;
            ProductID: string;
            Quantity: number;
            FulfillmentStatus: string | null;
            ReversesOrderLineID: string | null;
            IsRollupParent: boolean;
            ParentOrderLineID: string | null;
            SourceBundleProductID: string | null;
            ShipToAddressID: string | null;
            ShipToOrganizationID: string | null;
            ShipToPersonID: string | null;
            ShipToOrganization: string | null;
            ShipToPerson: string | null;
        }>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `OrderHeaderID IN (${quote(orderRows.map((o) => o.ID))})`,
                OrderBy: 'LineNumber ASC',
                ResultType: 'simple',
            },
            user,
        );
        const lineRows = lines.Results ?? [];
        if (!lineRows.length) return this.empty();

        const products = await rv.RunView<{ ID: string; Name: string; SKU: string | null; ProductTypeID: string }>(
            {
                EntityName: PRODUCT_ENTITY,
                ExtraFilter: `ID IN (${quote(lineRows.map((l) => l.ProductID))})`,
                ResultType: 'simple',
            },
            user,
        );
        const productByID = new Map((products.Results ?? []).map((p) => [key(p.ID), p]));

        const types = await rv.RunView<{ ID: string; RequiresFulfillment: boolean }>(
            {
                EntityName: PRODUCT_TYPE_ENTITY,
                ExtraFilter: `ID IN (${quote((products.Results ?? []).map((p) => p.ProductTypeID))})`,
                ResultType: 'simple',
            },
            user,
        );
        const requiresByTypeID = new Map((types.Results ?? []).map((t) => [key(t.ID), !!t.RequiresFulfillment]));

        const requiresFulfillment = (productID: string): boolean => {
            const product = productByID.get(key(productID));
            return product ? (requiresByTypeID.get(key(product.ProductTypeID)) ?? false) : false;
        };

        // ── the DECISION, in the pure module ──
        const shaped = lineRows.map((l) => ({
            ID: l.ID,
            OrderHeaderID: l.OrderHeaderID,
            RequiresFulfillment: requiresFulfillment(l.ProductID),
            FulfillmentStatus: (l.FulfillmentStatus as FulfillableLine['FulfillmentStatus']) ?? null,
            ReversesOrderLineID: l.ReversesOrderLineID,
            IsRollupParent: !!l.IsRollupParent,
        }));
        const groups = GroupForQueue(shaped);

        // `IncludeCompleted` widens the result to every order with fulfillable lines, worked or not.
        // Off by default, because a queue is work TO DO.
        const wanted = new Map(groups.map((g) => [key(g.OrderHeaderID), g]));
        const fulfillableByOrder = new Map<string, number>();
        for (const l of shaped) {
            if (!l.RequiresFulfillment || l.ReversesOrderLineID || l.IsRollupParent) continue;
            fulfillableByOrder.set(key(l.OrderHeaderID), (fulfillableByOrder.get(key(l.OrderHeaderID)) ?? 0) + 1);
        }

        const linesByOrder = new Map<string, typeof lineRows>();
        for (const l of lineRows) {
            const k = key(l.OrderHeaderID);
            if (!linesByOrder.has(k)) linesByOrder.set(k, []);
            linesByOrder.get(k)!.push(l);
        }
        const awaitingIDs = new Set(groups.flatMap((g) => g.AwaitingLineIDs.map(key)));

        const out: FulfillmentQueueOrder[] = [];
        let awaitingLineCount = 0;

        for (const order of orderRows) {
            const k = key(order.ID);
            const group = wanted.get(k);
            const fulfillableCount = fulfillableByOrder.get(k) ?? 0;
            if (!group && !(input?.IncludeCompleted && fulfillableCount > 0)) continue;
            if (out.length >= max) break;

            const queueLines: FulfillmentQueueLine[] = (linesByOrder.get(k) ?? [])
                .filter((l) => {
                    if (shipToAddressID && key(l.ShipToAddressID) !== key(shipToAddressID)) return false;
                    if (input?.IncludeCompleted) {
                        return requiresFulfillment(l.ProductID) && !l.ReversesOrderLineID && !l.IsRollupParent;
                    }
                    return awaitingIDs.has(key(l.ID));
                })
                .map((l) => {
                    const product = productByID.get(key(l.ProductID));
                    return {
                        OrderLineID: l.ID,
                        LineNumber: l.LineNumber,
                        ProductID: l.ProductID,
                        ProductName: product?.Name ?? '(unknown product)',
                        SKU: product?.SKU ?? null,
                        Quantity: Number(l.Quantity ?? 0),
                        FulfillmentStatus: l.FulfillmentStatus ?? 'Pending',
                        ShipToAddressID: l.ShipToAddressID,
                        ShipToOrganizationID: l.ShipToOrganizationID,
                        ShipToPersonID: l.ShipToPersonID,
                        // The line's own ship-to when it has one, else null so the caller knows to
                        // fall back to the header rather than being told a name that is not the
                        // line's (D61).
                        ShipToName: l.ShipToOrganization ?? l.ShipToPerson ?? null,
                        ParentOrderLineID: l.ParentOrderLineID,
                        SourceBundleProductID: l.SourceBundleProductID,
                    };
                });

            if (!queueLines.length) continue;
            awaitingLineCount += queueLines.filter((l) => l.FulfillmentStatus === 'Pending').length;

            out.push({
                OrderHeaderID: order.ID,
                OrderNumber: order.OrderNumber,
                OrderDate: order.OrderDate,
                ConfirmedAt: order.ConfirmedAt,
                Status: order.Status,
                CompanyID: order.CompanyID,
                CompanyName: order.Company ?? '',
                CustomerName: order.BillToOrganization ?? order.BillToPerson ?? '',
                BillToOrganizationID: order.BillToOrganizationID,
                BillToPersonID: order.BillToPersonID,
                FulfillableCount: fulfillableCount,
                Lines: queueLines,
            });
        }

        return {
            Success: true,
            Orders: out,
            OrderCount: out.length,
            AwaitingLineCount: awaitingLineCount,
            Truncated: out.length >= max,
        };
    }

    private empty(message?: string): OrdersGetFulfillmentQueueOutput {
        return {
            Success: !message,
            Message: message,
            Orders: [],
            OrderCount: 0,
            AwaitingLineCount: 0,
            Truncated: false,
        };
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadGetFulfillmentQueueOperation(): void {
    // intentionally empty
}
