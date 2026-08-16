/**
 * What a reversal line is allowed to be — the arithmetic, with no database in sight.
 *
 * A reversal line carries a negative quantity and points at the line it unwinds
 * (`ReversesOrderLineID`). `OrderLineEntityServer` already refuses a negative quantity with no
 * pointer, because a negative line with no origin is indistinguishable from a typo. This module
 * answers the harder question the pointer makes possible: given the origin, is THIS reversal
 * legitimate, and what should it cost?
 *
 * Three facts the origin line is the only authority on:
 *
 *   1. **HOW MUCH is left to give back.** Nothing else in the system knows. Over-returning produces
 *      a perfectly balanced journal entry that refunds money never collected, so the ledger cannot
 *      catch it — the origin line has to.
 *
 *   2. **WHAT IT COST.** A return must refund the price PAID, not today's price. Resolving a
 *      reversal against the current price table refunds last year's purchase at this year's rate,
 *      which is wrong in whichever direction prices moved. (It is also why `ComputeAmount` refuses
 *      a negative quantity outright: asking "which volume band does -5 land in?" has no answer.)
 *
 *   3. **WHICH PRODUCT.** An ID copied from the wrong row books a credit against another company's
 *      revenue and still balances.
 *
 * THE SHAPE THIS SHARES WITH THE REST OF THE PACKAGE: every one of these produces a wrong answer
 * that looks exactly like a right one. Hence refusal rather than a best guess.
 *
 * CONNECTS TO:
 *   CODE: ReversalResolver (the lookups), OrderEntityServer.savePendingLines (the caller)
 *   DOC:  plans/archive/bizapps-orders-master.md D16
 */

/** The line being unwound, as the database holds it. Quantity is positive — it was a sale. */
export interface ReversalOrigin {
    ID: string;
    ProductID: string;
    Quantity: number;
    UnitPrice: number;
    DiscountPct: number;
    /** The origin's ALLOCATED discount — an order-level promotion's share of this line (D70). */
    DiscountAmount?: number;
    /** For the refusal message — an ID alone tells the reader nothing about what they mispointed at. */
    OrderNumber?: string | null;
}

/** The reversal being attempted. Quantity is negative, as the caller wrote it. */
export interface ReversalRequest {
    ProductID: string;
    Quantity: number;
}

/**
 * How much of the origin line is still returnable.
 *
 * Rounded to the quantity column's 4dp scale: a prorated origin (a short first subscription period)
 * carries a fractional quantity, and comparing an unrounded remainder against a stored one rejects
 * a legitimate final return by a billionth of a unit.
 */
export function RemainingReturnable(originalQuantity: number, alreadyReversed: number): number {
    const remaining = Math.abs(originalQuantity) - Math.abs(alreadyReversed);
    return Math.round(remaining * 1e4) / 1e4;
}

/**
 * Is this reversal legal? Returns `null` when it is, and the reason it is not when it is not.
 *
 * A string rather than a boolean because every caller needs the reason: these refusals reach a
 * person who is trying to process a return and has to be told what to do instead.
 */
export function ValidateReversal(
    request: ReversalRequest,
    origin: ReversalOrigin,
    alreadyReversed: number,
): string | null {
    // Case-INSENSITIVE. SQL Server hands UUIDs back uppercase while application code writes them
    // lowercase, so a `!==` here refuses every legitimate reversal — and the message it prints shows
    // the same UUID twice, which reads as a system fault rather than as a comparison bug.
    if (request.ProductID.toLowerCase() !== origin.ProductID.toLowerCase()) {
        return (
            `This reversal line is for a different product than the line it reverses. The origin ` +
            `line${origin.OrderNumber ? ` on order ${origin.OrderNumber}` : ''} sold product ` +
            `${origin.ProductID}; this line names ${request.ProductID}. Point the reversal at the ` +
            `line that actually sold this product — crediting a different product books the refund ` +
            `against the wrong revenue account, and it still balances.`
        );
    }

    const wanted = Math.abs(request.Quantity);
    const remaining = RemainingReturnable(origin.Quantity, alreadyReversed);

    if (remaining <= 0) {
        return (
            `Nothing remains to be returned against this line. It sold ${origin.Quantity} and ` +
            `${Math.abs(alreadyReversed)} has already been reversed.`
        );
    }

    if (wanted > remaining) {
        return (
            `Cannot return ${wanted} against a line that sold ${origin.Quantity}` +
            `${alreadyReversed ? ` and has already had ${Math.abs(alreadyReversed)} reversed` : ''}. ` +
            `At most ${remaining} remains returnable. Returning more than was bought refunds money ` +
            `that was never collected, and the resulting journal entry balances, so nothing further ` +
            `downstream would notice.`
        );
    }

    return null;
}

/**
 * What the reversal line should cost: the origin's terms, not today's.
 *
 * `DiscountAmount` IS PART OF THE PRICE PAID, and leaving it out was a real defect. `DiscountPct` is
 * a rate, so it carries to any quantity unchanged — but `DiscountAmount` is an ALLOCATED cash amount
 * (an order-level promotion's share of this line, D70), so returning half the units must give back
 * half of it. Without that, a line that sold 4 × 100 less a 50 promotion — 350 actually paid — refunds
 * 400, and the 50 is given away. The journal entry balances perfectly while doing it.
 *
 * RT7 tested exactly this concern and passed, because it used `DiscountPct`. The two fields express
 * the same idea and only one of them was carried through. Surfaced by Marcelo on PR #17.
 *
 * `reversalQuantity` is what the caller intends to send back, in either sign.
 */
export function InheritedTerms(
    origin: ReversalOrigin,
    reversalQuantity: number,
): { UnitPrice: number; DiscountPct: number; DiscountAmount: number } {
    const originQty = Math.abs(origin.Quantity);
    const share = originQty > 0 ? Math.abs(reversalQuantity) / originQty : 0;
    // Positive: the column is CHECK (DiscountAmount >= 0) and `NetAfterDiscount` reads it as a
    // magnitude that moves the line toward zero.
    const allocated = Math.abs(origin.DiscountAmount ?? 0) * share;
    return {
        UnitPrice: origin.UnitPrice,
        DiscountPct: origin.DiscountPct ?? 0,
        DiscountAmount: Math.round(allocated * 100) / 100,
    };
}
