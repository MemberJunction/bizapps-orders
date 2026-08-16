/**
 * ChargeBehavior — the PURE charge engine (plan D71).
 *
 * Shipping, handling, surcharges AND TAX are all charges. Modelling tax as a charge is what makes
 * multi-layer tax — state + county + city — stop being a special case: it is simply several charges
 * with later sequence numbers. Ordering, allocation and the override path are then written once.
 *
 * TWO THINGS DECIDE EVERYTHING HERE:
 *
 *   SEQUENCE — the order charges apply in. Business policy, not an implementation detail.
 *
 *   BASIS — what each charge computes ON. `LineNet` is the discounted line; `LineNetPlusCharges` is
 *   that plus every earlier charge, which is how tax-on-shipping works. Whether shipping is taxable
 *   is jurisdiction-dependent, so it has to be configuration rather than code.
 *
 * The arithmetic is here and the rows are elsewhere, for the same reason as pricing and promotions:
 * money should be provable without a database.
 *
 * CONNECTS TO:
 *   PURE:   ./PricingBehavior.ts (Money, AllocateProRata)
 *   SERVER: ./ChargeEngine.ts
 *   DOC:    plans/archive/pricing-charges-and-promotions.md §5
 */
import { AllocateProRata, Money } from './PricingBehavior.js';

export type ChargeBasis = 'LineNet' | 'LineNetPlusCharges' | 'OrderNet' | 'Flat';
export type ChargeCategory = 'Shipping' | 'Handling' | 'Tax' | 'Surcharge' | 'Fee';

/** The subset of a `ChargeType` plus its requested amount or rate. */
export interface ChargeRequest {
    ChargeTypeID: string;
    /**
     * When set, this charge belongs to ONE line and is not spread across the order.
     *
     * Tax needs this: a two-line order can have one exempt line and one taxable line, and pro-rata
     * allocation would hand the exempt line a share of the other's tax.
     */
    TargetLineID?: string | null;
    Code: string;
    Category: ChargeCategory;
    Basis: ChargeBasis;
    Sequence: number;
    /** A fixed amount. Mutually exclusive with `Rate`. */
    Amount?: number | null;
    /** A rate applied to the basis (0.086 for 8.6%). Mutually exclusive with `Amount`. */
    Rate?: number | null;
    /** Tax provenance, carried through so the number can be defended later. */
    TaxJurisdictionID?: string | null;
    TaxRateID?: string | null;
    /** An operator's override, which REPLACES the computed amount but never hides it. */
    OverrideAmount?: number | null;
    OverrideReason?: string | null;
}

/** One line's share of one charge. */
export interface ChargeAllocation {
    LineID: string;
    Amount: number;
}

export interface ComputedCharge {
    Request: ChargeRequest;
    /** What the rules produced, before any override. Always recorded. */
    ComputedAmount: number;
    /** What is actually charged — the override when there is one. */
    Amount: number;
    IsOverridden: boolean;
    /** What it was computed on, so the number is reproducible. */
    BasisAmount: number;
    Allocations: ChargeAllocation[];
}

export interface ChargeableLine {
    ID: string;
    /** Net after pricing and discounts — the taxable base. */
    Net: number;
}

export interface ComputeChargesResult {
    Charges: ComputedCharge[];
    /** Per line, everything added — for the order total and the ledger. */
    PerLine: Map<string, number>;
    TotalCharges: number;
}

/**
 * Compute every charge, in sequence, allocating each to lines as it goes.
 *
 * Charges are applied in `Sequence` order and each is allocated immediately, because a later
 * `LineNetPlusCharges` charge needs the per-line running totals the earlier ones produced. Computing
 * all the amounts first and allocating afterwards would make tax-on-shipping wrong on any order with
 * more than one line — the shipping would be in the order-wide basis but not in each line's.
 */
export function ComputeCharges(requests: ChargeRequest[], lines: ChargeableLine[]): ComputeChargesResult {
    const charges: ComputedCharge[] = [];
    const perLine = new Map<string, number>();
    if (!lines.length) return { Charges: charges, PerLine: perLine, TotalCharges: 0 };

    // Running per-line totals: the line's net plus every charge allocated to it so far.
    const running = new Map<string, number>(lines.map((l) => [l.ID, l.Net]));
    // The TAXABLE base tracked separately — net plus non-tax charges, never other tax.
    //
    // US sales tax layers do not compound: state, county and city all apply to the same base and
    // are summed. Running them through `running` charged 1.875% county tax on a total that already
    // included 7.25% state tax, producing 92.61 where the correct answer is 91.25 — tax on tax,
    // which is not merely wrong but unlawful in every US jurisdiction.
    const taxableBase = new Map<string, number>(lines.map((l) => [l.ID, l.Net]));
    const orderNet = Money(lines.reduce((s, l) => s + l.Net, 0));

    const ordered = [...requests].sort((a, b) => a.Sequence - b.Sequence || a.Code.localeCompare(b.Code));

    for (const req of ordered) {
        const isTax = req.Category === 'Tax';
        const basisAmount = basisFor(req.Basis, lines, isTax ? taxableBase : running, orderNet, req.TargetLineID);
        const computed = amountFor(req, basisAmount);

        // An override REPLACES the amount but never erases what the rules said — `ComputedAmount`
        // is always recorded, so "shipping was waived" and "shipping was free" stay distinguishable.
        const overridden = req.OverrideAmount != null;
        const amount = Money(overridden ? Number(req.OverrideAmount) : computed);

        // A TARGETED charge goes entirely to its line. Otherwise weight by each line's CURRENT
        // running total, not its original net: a charge computed on a basis that already includes
        // earlier charges must be shared the same way they were, or the proportions drift as
        // charges accumulate.
        const parts = req.TargetLineID
            ? lines.map((l) => (l.ID === req.TargetLineID ? amount : 0))
            : AllocateProRata(amount, lines.map((l) => running.get(l.ID) ?? 0));

        const allocations: ChargeAllocation[] = [];
        lines.forEach((l, i) => {
            if (parts[i] === 0) return;
            allocations.push({ LineID: l.ID, Amount: parts[i] });
            running.set(l.ID, Money((running.get(l.ID) ?? 0) + parts[i]));
            // Only NON-tax charges enlarge the taxable base. Shipping can be taxed; tax cannot.
            if (!isTax) taxableBase.set(l.ID, Money((taxableBase.get(l.ID) ?? 0) + parts[i]));
            perLine.set(l.ID, Money((perLine.get(l.ID) ?? 0) + parts[i]));
        });

        charges.push({
            Request: req,
            ComputedAmount: Money(computed),
            Amount: amount,
            IsOverridden: overridden,
            BasisAmount: basisAmount,
            Allocations: allocations,
        });
    }

    return {
        Charges: charges,
        PerLine: perLine,
        TotalCharges: Money(charges.reduce((s, c) => s + c.Amount, 0)),
    };
}

/** What a charge of this basis computes on. */
function basisFor(
    basis: ChargeBasis,
    lines: ChargeableLine[],
    running: Map<string, number>,
    orderNet: number,
    targetLineID?: string | null,
): number {
    // A targeted charge is computed on ITS line alone, not on the order.
    const scope = targetLineID ? lines.filter((l) => l.ID === targetLineID) : lines;
    switch (basis) {
        case 'LineNet':
            // The discounted lines only — earlier charges are excluded on purpose. Shipping is
            // charged on what was bought, not on what has already been added to the bill.
            return Money(scope.reduce((s, l) => s + l.Net, 0));
        case 'LineNetPlusCharges':
            // Lines PLUS everything charged so far. This is how tax reaches shipping — and, for a
            // tax charge, `running` is the TAXABLE base, which excludes other tax.
            return Money(scope.reduce((s, l) => s + (running.get(l.ID) ?? 0), 0));
        case 'OrderNet':
            return orderNet;
        case 'Flat':
            // Basis is irrelevant to a flat charge; reported as 0 rather than as a misleading number.
            return 0;
        default:
            return 0;
    }
}

/** A charge is either a fixed amount or a rate on its basis — never both. */
function amountFor(req: ChargeRequest, basisAmount: number): number {
    if (req.Amount != null && req.Rate != null) {
        throw new Error(
            `Charge '${req.Code}' specifies both an Amount and a Rate. It must be one or the other — ` +
                `a rate is applied to the basis, an amount is not.`,
        );
    }
    if (req.Rate != null) return Money(basisAmount * Number(req.Rate));
    if (req.Amount != null) return Money(Number(req.Amount));
    return 0;
}
