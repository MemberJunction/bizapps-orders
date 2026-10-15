/**
 * What a reversal line is allowed to be — the arithmetic, with no database in sight.
 *
 * A reversal line carries a negative quantity and points at the line it unwinds
 * (`ReversesOrderLineID`). `OrderLineEntityServer` already refuses a negative quantity with no
 * pointer, because a negative line with no origin is indistinguishable from a typo. This module
 * answers the harder question the pointer makes possible: given the origin, is THIS reversal
 * legitimate, and what should it cost?
 *
 * Five facts the origin line is the only authority on:
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
 *   4. **WHAT PERIOD IT COVERED.** A deferred line earns across a service period, so unwinding one
 *      means unwinding that same window. A reversal that states no period has nothing for
 *      `EvenOverTime` to spread across and cannot book at all — and one that states a DIFFERENT
 *      window reverses the right total in the wrong months, which every year-end total still
 *      agrees with.
 *
 *   5. **WHAT TAX IT CHARGED, AND WHERE.** A refund gives back the tax the sale collected, in the
 *      jurisdictions that collected it. Re-resolving it from the return's own address and date
 *      taxes the refund wherever the customer is now, at today's rate — see `MirroredTaxCharges`.
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
    /**
     * The price rule's exact pre-discount amount for the origin (#579): Flat 100.00 at quantity 3 is
     * 100.00, where quantity × unit price is 99.99. NULL when no rule priced the line, and on lines
     * booked before the column existed — see {@link OriginExactAmount}.
     */
    ExtendedAmount?: number | null;
    /**
     * The coverage window this line sold, as `materializeSubscriptions` settled it. Absent on a line
     * that earns at booking — an UpFront product has no window and needs none.
     */
    ServicePeriodStart?: Date | string | null;
    ServicePeriodEnd?: Date | string | null;
    /**
     * The subscription this line bought into, read from the term it bought. Not something the
     * reversal inherits — it is how the caller reaches the RECOGNITION CADENCE, which lives on the
     * subscription's type and is not a column on the line. The window says WHICH months; the cadence
     * says how the window is cut, and a schedule needs both to mirror its origin.
     */
    SubscriptionID?: string | null;
    /** For the refusal message — an ID alone tells the reader nothing about what they mispointed at. */
    OrderNumber?: string | null;
    /** The order the origin line belongs to — where its schedule and its siblings live (D92 §6). */
    OrderHeaderID?: string | null;
    /** For the refusal message: a line number is what a person can find on the order. */
    LineNumber?: number | null;
    /** Whose books the origin line sold on — which company's schedule decides how it reverses. */
    CompanyID?: string | null;
    /**
     * The origin line's contract position, which is the fifth fact a reversal cannot get anywhere
     * else. `BilledToDate − RecognizedToDate` is what the credit memo gives back; the other way
     * round is a contract asset the reversal must refuse to strand. Both default to zero, so a line
     * from before D92 reverses exactly as it did.
     */
    BilledToDate?: number | null;
    RecognizedToDate?: number | null;
    /** The origin's revenue-bearing net — what its staged releases were built from (D92 §6). */
    LineTotalNet?: number | null;
    /** The origin line's own ship-to, when it overrode its header's, and its snapshot as sold. */
    ShipToAddressID?: string | null;
    ShipToAddressSnapshot?: string | null;
    /** The tax the origin line was charged — the fallback when it has no tax charge rows. */
    LineTax?: number;
}

/** One tax charge's share of the origin line, as `OrderChargeAllocation` recorded it. */
export interface OriginTaxCharge {
    /** `ChargeType.Code` of a Tax-category charge. */
    Code: string;
    /** The amount allocated to the origin line. Positive — it was a sale. */
    Amount: number;
    TaxJurisdictionID: string | null;
    TaxRateID: string | null;
}

/** A tax charge for the reversal line: negative, targeted at that line by the caller. */
export interface MirroredTaxCharge {
    Code: string;
    Amount: number;
    TaxJurisdictionID: string | null;
    TaxRateID: string | null;
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
 * THE COVERAGE WINDOW DOES NOT SCALE, and it is the one thing here that does not. Money is
 * proportional — returning half the units gives back half the cash — but a period is not divisible
 * the same way: sending back one of four annual seats unwinds one seat for the WHOLE year, not four
 * seats for a quarter. Prorating the window instead would refund the right total across the wrong
 * months, and the year still foots.
 *
 * The cadence that cuts this window into slices is NOT returned here, because it is not a column on
 * the line — see `ReversalOrigin.SubscriptionID`.
 *
 * THE EXACT AMOUNT, NOT QUANTITY × UNIT PRICE (#651). A Flat price that does not divide by the
 * quantity stores a rounded unit price — Flat 100.00 at quantity 3 is 33.33 — so a return priced
 * from the unit price alone credits 99.99 against the 100.00 booked. `ExtendedAmount` carries the
 * return's share of the origin's exact amount, negated; null when the origin has none, and the line
 * is then quantity × unit price as before.
 *
 * Both cash amounts are split by CUMULATIVE ROUNDING, as returned tax is (see
 * `MirroredTaxCharges`), so a series of partial returns gives back exactly what was booked: 100.00
 * over three single-unit returns credits 33.33, 33.34 and 33.33. `reversedBefore` is everything
 * already taken from the origin — prior returns and earlier lines of this one.
 *
 * `reversalQuantity` is what the caller intends to send back, in either sign.
 */
export function InheritedTerms(
    origin: ReversalOrigin,
    reversalQuantity: number,
    reversedBefore = 0,
): {
    UnitPrice: number;
    DiscountPct: number;
    DiscountAmount: number;
    ExtendedAmount: number | null;
    ServicePeriodStart?: Date | string | null;
    ServicePeriodEnd?: Date | string | null;
} {
    const exact = OriginExactAmount(origin);
    return {
        UnitPrice: origin.UnitPrice,
        DiscountPct: origin.DiscountPct ?? 0,
        // Positive: the column is CHECK (DiscountAmount >= 0) and `NetAfterDiscount` reads it as a
        // magnitude that moves the line toward zero.
        DiscountAmount: CumulativeSlice(Math.abs(origin.DiscountAmount ?? 0), origin.Quantity, reversedBefore, reversalQuantity),
        // Negative: the return line's gross is a credit, as quantity × unit price would be.
        ExtendedAmount:
            exact === null ? null : -CumulativeSlice(Math.abs(exact), origin.Quantity, reversedBefore, reversalQuantity),
        ServicePeriodStart: origin.ServicePeriodStart,
        ServicePeriodEnd: origin.ServicePeriodEnd,
    };
}

/**
 * The allocated `DiscountAmount` a reversal line should carry after this save (#668).
 *
 * RECOMPUTED UNTIL THE MONEY IS LOCKED. The share depends on the line's quantity, and a draft return
 * can be re-saved with a different one: filled only once, a return of 4 units of a line sold 4 × 100
 * less 50 kept all 50 after it was cut to 2, refunding −150.00 instead of −175.00.
 *
 * A DISCOUNT THE CALLER SET STAYS. Set in this save, it is kept as stated. Set in an earlier save,
 * it no longer looks dirty, so it is told apart by value: an inherited one equals the share the
 * line's PREVIOUS quantity took, within a cent (cumulative rounding can move a slice by one cent
 * when another return of the same origin changes in between). Anything else is someone's decision.
 *
 * Once the money is locked, only a blank is filled, as before.
 */
export function RefreshedDiscountAmount(args: {
    /** The value on the line now. */
    Stored: number | null | undefined;
    /** The caller set `DiscountAmount` in this save. */
    SetThisSave: boolean;
    /** The order's money is frozen. */
    MoneyLocked: boolean;
    /** The share the line's quantity before this save inherited; null when it had none. */
    PreviousShare: number | null;
    /** The share the line's current quantity inherits. */
    CurrentShare: number;
}): number | null | undefined {
    const stored = Number(args.Stored ?? 0);
    if (args.SetThisSave) return args.Stored;
    if (stored <= 0) return args.CurrentShare;
    if (args.MoneyLocked) return args.Stored;
    if (args.PreviousShare !== null && Math.abs(stored - args.PreviousShare) <= 0.01 + 1e-9) return args.CurrentShare;
    return args.Stored;
}

/**
 * The origin's exact pre-discount amount, or null when quantity × unit price already is it.
 *
 * The stored `ExtendedAmount` when there is one. A line booked before that column existed has none,
 * and gets the same test the invoice applies to it (`ListAmountOf`): with no discount recorded and a
 * net within half a cent per unit of quantity × unit price, the net is the amount the rule set,
 * because a unit price rounded to cents is off by at most that much. A larger gap is not rounding,
 * and quantity × unit price stands.
 */
export function OriginExactAmount(
    origin: Pick<ReversalOrigin, 'Quantity' | 'UnitPrice' | 'DiscountPct' | 'DiscountAmount' | 'ExtendedAmount' | 'LineTotalNet'>,
): number | null {
    if (origin.ExtendedAmount !== null && origin.ExtendedAmount !== undefined) return Number(origin.ExtendedAmount);
    if (Number(origin.DiscountPct ?? 0) || Number(origin.DiscountAmount ?? 0)) return null;
    const fromRate = Math.round(Number(origin.Quantity) * Number(origin.UnitPrice) * 100);
    const net = Math.round(Number(origin.LineTotalNet ?? 0) * 100);
    const gap = Math.abs(fromRate - net);
    return gap > 0 && gap <= 0.5 * Math.abs(Number(origin.Quantity)) ? net / 100 : null;
}

/**
 * The share of `total` that `reversalQuantity` units take back, after `reversedBefore` units already
 * have: the rounded share through the end of this slice less the rounded share before it. Positive.
 * Clamped to the origin quantity, so a slice never takes more than what is left.
 */
function CumulativeSlice(total: number, originQuantity: number, reversedBefore: number, reversalQuantity: number): number {
    const originQty = Math.abs(originQuantity);
    if (originQty <= 0) return 0;
    const before = Math.min(originQty, Math.abs(reversedBefore));
    const through = Math.min(originQty, before + Math.abs(reversalQuantity));
    const cents = (share: number): number => Math.round(total * (share / originQty) * 100);
    return (cents(through) - cents(before)) / 100;
}

/**
 * The tax a reversal line refunds: the origin line's own tax charges, one per jurisdiction, scaled
 * by the quantity coming back and negated.
 *
 * NOT RE-RESOLVED. Resolving tax for a return reads the return's ship-to address and the return's
 * date, so a customer who has moved since the sale is refunded at the new state's rate, a rate that
 * changed since the sale refunds more or less than was collected, and a return with no address
 * refunds no tax at all. The origin's charge rows already say what was collected and where; the
 * refund gives that back, the same way `InheritedTerms` gives back the price paid.
 *
 * CUMULATIVE ROUNDING, so a series of partial returns refunds exactly what was collected. Each
 * slice is the rounded share through the end of this return less the rounded share before it:
 * 1.00 of tax on three units refunds 0.33, 0.34 and 0.33, not 0.33 three times. `reversedBefore` is
 * everything already taken from the origin — prior returns and earlier lines of this one.
 *
 * FALLS BACK TO `LineTax` when the origin carries tax but no Tax charge rows, as one `SalesTax`
 * charge with no jurisdiction. The total is still right; only the attribution is missing, because
 * the origin never recorded one.
 */
export function MirroredTaxCharges(
    origin: Pick<ReversalOrigin, 'Quantity' | 'LineTax'>,
    charges: OriginTaxCharge[],
    reversedBefore: number,
    reversalQuantity: number,
): MirroredTaxCharge[] {
    if (Math.abs(origin.Quantity) <= 0) return [];
    const slice = (total: number): number => -CumulativeSlice(total, origin.Quantity, reversedBefore, reversalQuantity);

    const sources: OriginTaxCharge[] = charges.length
        ? charges
        : origin.LineTax
          ? [{ Code: 'SalesTax', Amount: origin.LineTax, TaxJurisdictionID: null, TaxRateID: null }]
          : [];
    const out: MirroredTaxCharge[] = [];
    for (const c of sources) {
        const amount = slice(Number(c.Amount ?? 0));
        if (amount === 0) continue;
        out.push({ Code: c.Code, Amount: amount, TaxJurisdictionID: c.TaxJurisdictionID, TaxRateID: c.TaxRateID });
    }
    return out;
}
