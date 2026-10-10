/**
 * Output of `Orders.AmendArrangement`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface AmendArrangementEntry {
    EffectiveDate: string;
    Amount: number;
    /** For an offset, the staged entry it cancels. */
    Offsets?: string;
}

/** An instalment not yet invoiced that a change of amount reduces. A `NewAmount` of zero cancels it. */
export interface AmendArrangementInstalment {
    InstalmentID: string;
    InstallmentNumber: number;
    DueDate: string;
    CurrentAmount: number;
    NewAmount: number;
}

/** Where a change of amount's credit memo is applied: an invoiced instalment, or the order billed as a whole. */
export interface AmendArrangementCredit {
    /** Null when the order itself is credited. */
    InstalmentID: string | null;
    DocumentNumber: string | null;
    Amount: number;
}

export interface AmendArrangementOutput {
    Success: boolean;
    Message?: string;
    CurrentEndDate?: string;
    NewEndDate?: string;
    /** The day the extension takes effect: staged entries from here on are replaced. */
    EffectiveDate?: string;
    /** What the added days are worth at the term's own rate; for a change of amount, the reduction. */
    Value?: number;
    /** What the replaced entries were going to recognise, and the new schedule now does. */
    Respread?: number;
    Offsets?: AmendArrangementEntry[];
    NewSchedule?: AmendArrangementEntry[];
    /** A change of amount: the term's amount before and after, net of discount and before tax. */
    CurrentAmount?: number;
    NewAmount?: number;
    /** The tax charged on the reduction, and the reduction with it: what the customer is billed less. */
    TaxReduction?: number;
    GrossReduction?: number;
    /** The reduction's share that belongs to periods already earned, taken back on the effective date. */
    CatchUp?: number;
    /** Instalments not yet invoiced that the reduction comes off. */
    Instalments?: AmendArrangementInstalment[];
    /** The credit memo: the part of the reduction not taken off an uninvoiced instalment. Zero when no document is needed. */
    CreditMemo?: number;
    /** Where the credit memo is applied. */
    CreditApplied?: AmendArrangementCredit[];
    /** The credit memo's part refunded, and the part left as the customer's credit. */
    Refund?: number;
    OpenCredit?: number;
    /** A change of payment terms: the terms before and after, by name. */
    CurrentPaymentTerms?: string | null;
    NewPaymentTerms?: string;
    /** Days to payment the new terms move by: positive when the customer pays later. */
    DaysChange?: number;
    CurrentDueDate?: string | null;
    NewDueDate?: string | null;
    /** Set when recorded: the concession, and whether it is Approved (applied) or Pending (awaiting approval). */
    OrderConcessionID?: string;
    Status?: string;
}
