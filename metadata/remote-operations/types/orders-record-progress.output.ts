/**
 * Output for `Orders.RecordProgress`.
 *
 * The catch-up arithmetic, echoed whether or not anything was written: what was recognised
 * before, what the observation says should be recognised to date, and the delta between them.
 * A zero delta is a success that wrote nothing.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersRecordProgressOutput {
    Success: boolean;
    Message?: string;
    /** True when `Preview` was set: the numbers below are what WOULD post; nothing was written. */
    Preview: boolean;
    OrderLineID?: string;
    OrderNumber?: string;
    LineNumber?: number;
    MeasurementDate?: string;
    PercentComplete?: number;
    /** The line's LineTotalNet — the amount the percent applies to. */
    LineAmount?: number;
    /** Revenue recognised on the line before this observation. */
    RecognizedToDateBefore?: number;
    /** LineAmount × PercentComplete, to the cent. */
    RecognizedToDateAfter?: number;
    /** After − Before. Negative on a backward slide; zero means no entry was written. */
    RecognitionAmount?: number;
    /** The observation row. Null on a preview. */
    OrderLineProgressMeasurementID?: string | null;
    /** The RevenueRecognition journal entry. Null on a preview and when the delta was zero. */
    JournalEntryID?: string | null;
    /**
     * Set when the measurement date falls in a month accounting has already posted a batch for.
     * ADVISORY ONLY — nothing is blocked, on either the preview or the live path. Period close is
     * not built into AIDP; the batch build is the control, and this only stops someone walking into
     * a closed period by accident. Null when the period is open, and null when the check could not
     * run, because an attestation must not depend on the availability of a hint.
     */
    ClosedPeriodWarning?: string | null;
    /**
     * Set when the measurement date is after the end of the current month on the business calendar.
     * ADVISORY ONLY — forward dating is allowed with no cap. It exists because a mistyped year posts
     * silently and only surfaces when the next month's attestation is refused.
     */
    FutureDateWarning?: string | null;
    /** On a supersede: the observation replaced. Null otherwise. */
    SupersededMeasurementID?: string | null;
    /** On a supersede: the recognition taken back out on the replaced observation's date (its RecognitionAmount, negated). Zero otherwise. */
    ReversalAmount?: number;
    /** On a supersede: the entry that reversed the replaced observation. Null on a preview, when nothing was superseded, and when the replaced observation posted nothing. */
    ReversalJournalEntryID?: string | null;
}
