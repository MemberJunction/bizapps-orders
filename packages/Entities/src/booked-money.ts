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
    'ExtendedAmount',
    'DiscountPct',
    'DiscountAmount',
    'LineTax',
    'ChargeAmount',
    'LineTotalNet',
    'LineTotalGross',
] as const;

/**
 * Header columns that change what was booked.
 *
 * The sale's identity — who sold it, when, what kind of order it is and what it reverses — is
 * counted per company, per date for tax (golive #262), so it is frozen with the money. Trigger
 * 51013 refuses the same columns at the database; refusing here first gives the user a message that
 * names the field instead of a trigger rollback surfacing through the CRUD procedure's INSERT-EXEC.
 *
 * `ConfirmedByUserID` records who booked the order, which the finance exception review relies on
 * to keep a person from clearing an exception on their own booking (golive #279). Only the booking
 * save writes it; trigger 51017 is its backstop.
 */
export const ORDER_HEADER_MONEY_FIELDS = [
    'InitialPaymentTypeID',
    'InitialPaymentAmount',
    'InitialPaymentDetailID',
    'CompanyID',
    'OrderDate',
    'OrderType',
    'ReversesOrderHeaderID',
    'ConfirmedByUserID',
] as const;

/**
 * Header columns a booked order may FILL but not change: an empty party can be recorded after
 * booking, a set one cannot be replaced or cleared. Mirrors the set-once rule in trigger 51013.
 */
export const ORDER_HEADER_SET_ONCE_FIELDS = [
    'BillToOrganizationID',
    'BillToPersonID',
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
        `This order is booked, so you cannot ${joinList(parts)}. ` +
        `To undo booked amounts, create a reversal order instead of editing this one.`
    );
}

const FIELD_LABELS: Record<string, string> = {
    DiscountPct: 'discount percent',
    LineTotalNet: 'net line total',
    LineTotalGross: 'gross line total',
    InitialPaymentDetailID: 'initial payment details',
    ReversesOrderHeaderID: 'reversed order',
    ConfirmedByUserID: 'confirmed-by user',
    BillToPersonID: 'bill-to person',
    BillToOrganizationID: 'bill-to organization',
};

/** A field name as a reader says it: `UnitPrice` -> "unit price", `CompanyID` -> "company". */
export function FieldLabel(name: string): string {
    return FIELD_LABELS[name] ?? name.replace(/ID$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/** Field names as a reader-facing list: "quantity, unit price, or line tax". */
export function FieldLabelList(names: readonly string[]): string {
    return joinList([...new Set(names.map(FieldLabel))]);
}

function uniqueJoin(names: string[]): string {
    return FieldLabelList(names);
}

function joinList(parts: string[]): string {
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} or ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')}, or ${parts[parts.length - 1]}`;
}
