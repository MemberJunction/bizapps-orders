/**
 * Output for `Orders.DetectUnattestedProgress`.
 *
 * Every line found overdue for attestation comes back, with what was raised for it. One exception
 * per line per month: a line still unattested next month is raised again, and a second run in the
 * same month finds the one already raised.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface UnattestedProgressLine {
    OrderLineID: string;
    OrderNumber: string;
    LineNumber: number;
    CompanyID: string;
    /** The last posted observation, or null when the line has never been attested. */
    LastMeasurementDate?: string | null;
    /** The business day the order was booked — the clock for a line never attested. */
    ConfirmedOn?: string | null;
    /** Whole days from the last attestation (or the booking) to the as-of day. */
    DaysWithoutAttestation: number;
    /** The line value not yet recognised. */
    UnrecognizedAmount?: number | null;
    /** `<OrderLineID>|<YYYY-MM>` — one exception per line per month. */
    DedupeKey: string;
    /** The review row, when accounting created or already held one. */
    FinanceExceptionID?: string | null;
    /** True when this pass created the review row; false when it already existed. */
    Created?: boolean;
}

export interface OrdersDetectUnattestedProgressOutput {
    Success: boolean;
    Message?: string;
    /** The business day the pass measured against. */
    AsOfDate: string;
    /** True when accounting does not define the type or has switched it off, so nothing was raised. */
    TypeInactive: boolean;
    MaxDaysWithoutAttestation?: number | null;
    Lines: UnattestedProgressLine[];
    /** Review rows this pass created. */
    Raised: number;
    /** Lines whose review row for this month already existed. */
    AlreadyRaised: number;
}
