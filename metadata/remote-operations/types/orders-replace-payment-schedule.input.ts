/**
 * One instalment as the caller wants it on the order.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ReplacePaymentScheduleRow {
    /** Exactly `YYYY-MM-DD`; any other form is refused. */
    DueDate: string;
    /** A number greater than zero; rounded to the cent. */
    Amount: number;
    /** Up to 500 characters. */
    Description?: string | null;
}

/**
 * Input for `Orders.ReplacePaymentSchedule`.
 *
 * `Rows` is the whole schedule the order should have, in any order. Instalments already invoiced must
 * be in the list unchanged (same due date and amount) and keep their numbers; the operation numbers
 * the remaining rows by due date, using the numbers those instalments do not hold. An empty list
 * removes the schedule, which bills the order as one instalment.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersReplacePaymentScheduleInput {
    OrderHeaderID: string;
    Rows: ReplacePaymentScheduleRow[];
    /** Check and report what the schedule would be, and write nothing. */
    Preview?: boolean;
}
