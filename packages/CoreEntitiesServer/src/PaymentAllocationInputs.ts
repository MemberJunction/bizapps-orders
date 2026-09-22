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
import type { InstalmentCashFacts } from './PaymentScheduleBehavior.js';
import { ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_DIMENSION_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

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

/**
 * Every live instalment on an order, for deciding how much of a payment settles a receivable (D91).
 *
 * READ THIS BEFORE THE PAYMENT LINE IS SAVED. `AmountPaid` on these rows is maintained by
 * `spRecalcOrderHeaderPaymentSchedule`, which `spRecalcOrderHeaderTotals` calls from the PaymentLine
 * trigger — so the moment the allocation row lands, these numbers already include it, and a split
 * computed from them would credit AR for money it had itself just counted as paid. Both booking
 * paths therefore read here first and carry the facts into the factory.
 *
 * Canceled rows are dropped: they bill nothing and absorb nothing.
 */
export async function LoadInstalmentCashFacts(
    provider: IRunViewProvider,
    user: UserInfo,
    orderHeaderID: string,
): Promise<InstalmentCashFacts[]> {
    const rv = new RunView(provider);
    const res = await rv.RunView<InstalmentCashFacts>(
        {
            EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
            ExtraFilter: `OrderHeaderID='${RequireUUID(orderHeaderID, 'OrderHeaderID')}' AND Status <> 'Canceled'`,
            Fields: ['ID', 'CompanyID', 'Status', 'Amount', 'AmountPaid', 'DocumentNumber'],
            OrderBy: 'DueDate, InstallmentNumber',
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return (res?.Results ?? []).map((r) => ({
        ID: String(r.ID),
        CompanyID: String(r.CompanyID),
        Status: String(r.Status),
        Amount: Number(r.Amount ?? 0),
        AmountPaid: Number(r.AmountPaid ?? 0),
        DocumentNumber: r.DocumentNumber ? String(r.DocumentNumber) : null,
    }));
}

/**
 * Charge a receivable amount against the facts, so the next line of the same payment sees what the
 * previous one used.
 *
 * A payment can carry several allocations against one order, and they book in a loop before any of
 * them is in the database. Without this, two lines would each see the same unpaid invoice and each
 * credit AR for it. Applied billed-rows-first in the order the rows came back, which is the order
 * the database's own cascade uses.
 */
export function ConsumeReceivable(
    facts: InstalmentCashFacts[],
    companyID: string,
    amount: number,
): InstalmentCashFacts[] {
    let left = amount;
    const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
    return facts.map((row) => {
        if (left <= 0 || !row.DocumentNumber || key(row.CompanyID) !== key(companyID)) return row;
        const capacity = Math.max(0, row.Amount - row.AmountPaid);
        const used = Math.min(left, capacity);
        left -= used;
        return used > 0 ? { ...row, AmountPaid: row.AmountPaid + used } : row;
    });
}
