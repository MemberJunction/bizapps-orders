/**
 * One instalment as the caller wants it on the order.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ReplacePaymentScheduleRow {
    /** `YYYY-MM-DD`. */
    DueDate: string;
    /** Greater than zero; rounded to the cent. */
    Amount: number;
    /** Up to 500 characters. */
    Description?: string | null;
}

/**
 * Input for `Orders.ReplacePaymentSchedule`.
 *
 * `Rows` is the whole schedule the order should have, in any order; the operation numbers the rows
 * by due date. An empty list removes the schedule, which bills the order as one instalment.
 * Instalments already invoiced must be in the list unchanged (same due date and amount).
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersReplacePaymentScheduleInput {
    OrderHeaderID: string;
    Rows: ReplacePaymentScheduleRow[];
    /** Check and report what the schedule would be, and write nothing. */
    Preview?: boolean;
}
