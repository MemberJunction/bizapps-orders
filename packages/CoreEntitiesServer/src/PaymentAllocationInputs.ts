/**
 * The order-side facts a payment allocation is computed from.
 *
 * `PaymentHeaderEntityServer` (booking every unbooked line at capture) and `PaymentLineEntityServer`
 * (booking one allocation as it is saved) both need the same thing: the order's lines, each with its
 * owning company, the amount to pro-rate by, and the dimensions booking tagged it with.
 *
 * They had a copy of that loader each, and the copies were identical — which is how issue #238 came
 * to need the same fix in two files. The intercompany closure beside them had drifted into the same
 * shape for the same reason; both now live in one place, and a third booking path gets them for free
 * rather than by being remembered.
 *
 * CONNECTS TO:
 *   CONSUMER: PaymentAllocationFactory (./PaymentAllocationFactory.ts)
 *   SIBLING:  BuildIntercompanyLookup (./AccountingBridge.ts)
 */
import { IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import type { OrderLineShare } from './PaymentAllocationFactory.js';
import type { PaymentJELineDimension } from './PaymentJournalEntryFactory.js';
import { ORDER_LINE_DIMENSION_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';

interface OrderLineRow {
    ID: string;
    CompanyID: string;
    LineTotalGross: number;
}

interface OrderLineDimensionRow {
    OrderLineID: string;
    DimensionID: string;
    DimensionValueID: string;
}

/**
 * Every line of an order, with its owning company, its allocation weight and its dimension tags.
 *
 * LineTotalGross (= net + tax) is the weight on purpose: it is exactly what booking DEBITED to AR
 * for the line, and what the order's TotalGross rolls up from. Allocating on any other basis would
 * clear a different amount than was ever receivable.
 *
 * The tags are read from the same `OrderLineDimension` rows `OrderJournalEntryFactory` stamps onto
 * the booking entry (D31), so the credit that clears a receivable carries what the debit that
 * raised it carried. An order with no tags simply comes back with none.
 */
export async function LoadOrderLineShares(
    provider: IRunViewProvider,
    user: UserInfo,
    orderHeaderID: string,
): Promise<OrderLineShare[]> {
    const rv = new RunView(provider);
    const res = await rv.RunView<OrderLineRow>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID='${orderHeaderID}'`,
            Fields: ['ID', 'CompanyID', 'LineTotalGross'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!res?.Success) {
        throw new Error(
            `Could not read the order's lines to allocate the payment: ${res?.ErrorMessage ?? 'unknown error'}`,
        );
    }

    const rows = res.Results ?? [];
    const tags = await loadLineDimensions(
        provider,
        user,
        rows.map((l) => l.ID),
    );

    return rows.map((l) => {
        const dims = tags.get(String(l.ID).toLowerCase());
        return {
            OrderLineID: l.ID,
            CompanyID: l.CompanyID,
            Amount: Number(l.LineTotalGross ?? 0),
            ...(dims?.length ? { Dimensions: dims } : {}),
        };
    });
}

/** The dimension tags of the given order lines, keyed by lower-cased line id. */
async function loadLineDimensions(
    provider: IRunViewProvider,
    user: UserInfo,
    lineIDs: string[],
): Promise<Map<string, PaymentJELineDimension[]>> {
    const map = new Map<string, PaymentJELineDimension[]>();
    if (lineIDs.length === 0) return map;

    const rv = new RunView(provider);
    const res = await rv.RunView<OrderLineDimensionRow>(
        {
            EntityName: ORDER_LINE_DIMENSION_ENTITY,
            ExtraFilter: `OrderLineID IN (${lineIDs.map((id) => `'${id}'`).join(',')})`,
            Fields: ['OrderLineID', 'DimensionID', 'DimensionValueID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!res?.Success) {
        // HARD FAILURE, deliberately. Booking tagged the receivable; clearing it untagged because a
        // read failed would leave that dimension permanently out of balance, and the entry would
        // post looking perfectly healthy. Better to refuse the allocation and be retried.
        throw new Error(
            `Could not read the order lines' dimension tags to allocate the payment: ` +
                `${res?.ErrorMessage ?? 'unknown error'}`,
        );
    }

    for (const row of res.Results ?? []) {
        const k = String(row.OrderLineID).toLowerCase();
        const list = map.get(k) ?? [];
        list.push({ DimensionID: row.DimensionID, DimensionValueID: row.DimensionValueID });
        map.set(k, list);
    }
    return map;
}
