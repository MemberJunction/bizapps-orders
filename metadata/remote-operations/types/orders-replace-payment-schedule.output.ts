/**
 * Why `Orders.ReplacePaymentSchedule` refused. Nothing is written on any refusal.
 *
 * - `INVALID_ORDER_ID` — `OrderHeaderID` is not a UUID.
 * - `INVALID_ROW` — a row has no valid due date, no amount above zero, or too long a description.
 * - `NOT_FOUND` / `READ_FAILED` — the order could not be found or read.
 * - `ORDER_VOIDED` — a voided order's schedule does not change.
 * - `PER_COMPANY_SCHEDULE` — the order still bills by a schedule per product company.
 * - `INVOICED_ROW_CHANGED` — an invoiced, paid or written-off instalment is missing from the list
 *   or has a different due date or amount.
 * - `PAID_ROW_CHANGED` — a not-yet-invoiced instalment that a payment names would be removed, moved to
 *   another due date, or lowered below what is paid on it.
 * - `BILLED_WITHOUT_SCHEDULE` — the order was confirmed with no schedule and billed in full.
 * - `SCHEDULE_REQUIRED` — the order is confirmed and billed by its schedule, which cannot be removed.
 * - `TIE_FAILED` — the rows do not add up to the order's lines.
 * - `WRITE_FAILED` — a save failed; the transaction was rolled back.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type ReplacePaymentScheduleCode =
    | 'INVALID_ORDER_ID'
    | 'INVALID_ROW'
    | 'NOT_FOUND'
    | 'READ_FAILED'
    | 'ORDER_VOIDED'
    | 'PER_COMPANY_SCHEDULE'
    | 'INVOICED_ROW_CHANGED'
    | 'PAID_ROW_CHANGED'
    | 'BILLED_WITHOUT_SCHEDULE'
    | 'SCHEDULE_REQUIRED'
    | 'TIE_FAILED'
    | 'WRITE_FAILED';

/** One instalment of the order's schedule after the call. */
export interface ReplacedPaymentScheduleRow {
    /** Null only on a preview, for a row that would be created. */
    OrderHeaderPaymentScheduleID: string | null;
    InstallmentNumber: number;
    DueDate: string;
    Amount: number;
    Status: string;
    DocumentNumber?: string | null;
    /** True for an invoiced, paid or written-off instalment kept exactly as it was. */
    Kept: boolean;
}

/**
 * Output for `Orders.ReplacePaymentSchedule`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersReplacePaymentScheduleOutput {
    Success: boolean;
    Message?: string;
    /** Set on a refusal. */
    Code?: ReplacePaymentScheduleCode | null;
    OrderHeaderID?: string | null;
    OrderNumber?: string | null;
    /** The schedule after the call (or, on a preview, as it would be), by instalment number. */
    Rows: ReplacedPaymentScheduleRow[];
    /** Instalments already invoiced and kept unchanged. */
    Kept: number;
    /** Rows created or changed. */
    Written: number;
    /** Scheduled rows deleted. */
    Removed: number;
    /** False when the order already had this schedule and nothing was written. */
    Changed: boolean;
    WasPreview: boolean;
}
