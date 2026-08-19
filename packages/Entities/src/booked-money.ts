/**
 * What a booked order may not change — stated once, enforced from Validate().
 *
 * Confirm books journal entries. A later edit that adds a line, reprices one, or
 * restates the initial tender would leave the ledger pointing at a different
 * amount than the order. Trigger 51003 freezes money columns on an *existing*
 * line update; it does not stop inserting a new line onto a confirmed order.
 *
 * @module @mj-biz-apps/orders-entities
 */

/** Line columns that change what was booked. */
export const ORDER_LINE_MONEY_FIELDS = [
    'Quantity',
    'UnitPrice',
    'DiscountPct',
    'DiscountAmount',
    'LineTax',
    'ChargeAmount',
    'LineTotalNet',
    'LineTotalGross',
] as const;

/** Header columns that change what was booked. */
export const ORDER_HEADER_MONEY_FIELDS = [
    'InitialPaymentTypeID',
    'InitialPaymentAmount',
    'InitialPaymentDetailID',
    'CompanyID',
] as const;

export interface BookedMoneyEditFacts {
    NewLineCount: number;
    RemovedLineCount: number;
    DirtyLineMoneyFields: string[];
    ChargesChanged: boolean;
    AdjustmentsChanged: boolean;
    DirtyHeaderMoneyFields: string[];
}

/**
 * Human-readable refusal, or null when this save does not touch booked money.
 */
export function BookedMoneyEditMessage(facts: BookedMoneyEditFacts): string | null {
    const parts: string[] = [];
    if (facts.NewLineCount > 0) {
        parts.push(
            facts.NewLineCount === 1 ? 'add a line' : `add ${facts.NewLineCount} lines`,
        );
    }
    if (facts.RemovedLineCount > 0) {
        parts.push(
            facts.RemovedLineCount === 1 ? 'remove a line' : `remove ${facts.RemovedLineCount} lines`,
        );
    }
    if (facts.DirtyLineMoneyFields.length > 0) {
        parts.push(`change ${uniqueJoin(facts.DirtyLineMoneyFields)}`);
    }
    if (facts.ChargesChanged) {
        parts.push('change charges');
    }
    if (facts.AdjustmentsChanged) {
        parts.push('change adjustments');
    }
    if (facts.DirtyHeaderMoneyFields.length > 0) {
        parts.push(`change ${uniqueJoin(facts.DirtyHeaderMoneyFields)}`);
    }
    if (parts.length === 0) return null;
    return (
        `This order is booked — it cannot ${joinList(parts)}. ` +
        `Voiding (and a reversal order) is how booked money is undone, not an edit of the original.`
    );
}

function uniqueJoin(names: string[]): string {
    return joinList([...new Set(names)]);
}

function joinList(parts: string[]): string {
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} or ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')}, or ${parts[parts.length - 1]}`;
}
