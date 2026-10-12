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

export interface AmendArrangementOutput {
    Success: boolean;
    Message?: string;
    CurrentEndDate?: string;
    NewEndDate?: string;
    /** The day the extension takes effect: staged entries from here on are replaced. */
    EffectiveDate?: string;
    /** What the added days are worth at the term's own rate. */
    Value?: number;
    /** What the replaced entries were going to recognise, and the new schedule now does. */
    Respread?: number;
    Offsets?: AmendArrangementEntry[];
    NewSchedule?: AmendArrangementEntry[];
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
