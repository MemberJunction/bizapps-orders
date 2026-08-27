/**
 * ReversalResolver — finds the line a reversal unwinds, and how much of it is already gone.
 *
 * The server half of `ReversalBehavior`: this does the lookups, that does the judging. Same split
 * as `PriceResolver`/`PricingBehavior` and for the same reason — the rule about how much may be
 * returned is provable without a database, and only finding the rows needs one.
 *
 * ALREADY-REVERSED IS A SUM ACROSS ORDERS, not a flag on the line. A customer may send back two of
 * four units in March and two more in June, on separate return orders. Each of those is individually
 * within the original, so a guard that reads one reversal at a time passes both — and a third one
 * too. Only the running total against the origin catches it.
 *
 * DRAFT AND VOIDED RETURNS DO NOT COUNT. A draft that never confirms would otherwise hold the
 * customer's allowance hostage, and a voided one already gave it back.
 *
 * CONNECTS TO:
 *   PURE:   ./ReversalBehavior.ts
 *   CALLER: OrderEntityServer.savePendingLines (before pricing — see there for why)
 */
import { IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import type { ReversalOrigin } from './ReversalBehavior.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';

/** The origin line plus what prior reversals have already taken from it. */
export interface ReversalContext {
    Origin: ReversalOrigin;
    AlreadyReversed: number;
}

/**
 * Load the origin line for `reversesOrderLineID` and total the reversals already booked against it.
 *
 * Returns `null` when the origin does not exist — the caller refuses, rather than treating a
 * dangling pointer as "no constraint". A reversal pointing at nothing is the case where every
 * guard in `ReversalBehavior` would otherwise pass vacuously.
 */
export async function LoadReversalContext(
    reversesOrderLineID: string,
    provider: IMetadataProvider,
    user: UserInfo,
    /** IDs to exclude from the already-reversed total — the reversal line being validated, on a re-save. */
    excludeLineIDs: string[] = [],
): Promise<ReversalContext | null> {
    // A FORMAT CHECK ON AN INTERPOLATED ID. Everything reaching here comes from our own columns, so
    // this is not the last line of defence against injection — but it is free, it turns a malformed
    // pointer into a clear refusal instead of a SQL syntax error from inside a booking transaction,
    // and it means the filter below cannot be built from arbitrary text. Raised by Marcelo on PR #17.
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(reversesOrderLineID)) {
        throw new Error(
            `'${reversesOrderLineID}' is not a valid order line identifier, so the line it claims to ` +
                `reverse cannot be looked up.`,
        );
    }

    const rv = new RunView(provider as unknown as IRunViewProvider);

    type LineRow = {
        ID: string;
        OrderHeaderID: string;
        ProductID: string;
        Quantity: number;
        UnitPrice: number;
        DiscountPct: number;
        DiscountAmount: number;
    };

    // The origin and every reversal already pointing at it, in ONE view. Splitting them costs a
    // round trip and buys nothing — both are order lines and both are needed.
    const lines = await rv.RunView<LineRow>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `ID = '${reversesOrderLineID}' OR ReversesOrderLineID = '${reversesOrderLineID}'`,
            ResultType: 'simple',
        },
        user,
    );

    const rows = lines?.Results ?? [];
    const origin = rows.find((r) => String(r.ID).toLowerCase() === reversesOrderLineID.toLowerCase());
    if (!origin) return null;
    const priors = rows.filter((r) => r !== origin);

    // The order-line view does not carry its header's Status, and the status is what decides
    // whether a prior reversal counts — so the headers have to be fetched. One view, not one per.
    const statusByOrder = new Map<string, string>();
    if (priors.length) {
        const ids = [...new Set(priors.map((p) => `'${p.OrderHeaderID}'`))].join(',');
        const headers = await rv.RunView<{ ID: string; Status: string; OrderNumber: string | null }>(
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter: `ID IN (${ids})`,
                ResultType: 'simple',
            },
            user,
        );
        for (const h of headers?.Results ?? []) {
            statusByOrder.set(String(h.ID).toLowerCase(), String(h.Status ?? ''));
        }
    }

    const excluded = new Set(excludeLineIDs.map((id) => id.toLowerCase()));
    let alreadyReversed = 0;
    for (const prior of priors) {
        if (excluded.has(String(prior.ID).toLowerCase())) continue;
        // A Draft return has not taken anything yet and a Voided one has given it back. Anything
        // else — Confirmed, Posted, Fulfilled — is money the customer already has. An UNKNOWN
        // status counts: a prior reversal whose header could not be read is not evidence of room.
        const status = statusByOrder.get(String(prior.OrderHeaderID).toLowerCase()) ?? '';
        if (status === 'Draft' || status === 'Voided') continue;
        // `ABS` because reversal quantities are stored negative, and a signed sum here would let a
        // reversal and a re-sale cancel out into a fresh allowance.
        alreadyReversed += Math.abs(Number(prior.Quantity ?? 0));
    }

    return {
        Origin: {
            ID: origin.ID,
            ProductID: origin.ProductID,
            Quantity: Number(origin.Quantity ?? 0),
            UnitPrice: Number(origin.UnitPrice ?? 0),
            DiscountPct: Number(origin.DiscountPct ?? 0),
            DiscountAmount: Number(origin.DiscountAmount ?? 0),
            OrderNumber: null,
        },
        AlreadyReversed: Math.round(alreadyReversed * 1e4) / 1e4,
    };
}
