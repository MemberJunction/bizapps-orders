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
     * Set when the measurement date is after today on the business calendar. ADVISORY ONLY — forward
     * dating is allowed with no cap. It exists because a mistyped year posts silently and only
     * surfaces when the next attestation is refused. Null when the calendar could not be read.
     */
    FutureDateWarning?: string | null;
    /**
     * Set when the measurement date is two or more months before the current month on the business
     * calendar. ADVISORY ONLY — nothing is blocked, on either the preview or the live path. The prior
     * month and earlier in the current month do not warn. Null when the calendar could not be read.
     */
    BackDatedWarning?: string | null;
    /** On a supersede: the observation replaced. Null otherwise. */
    SupersededMeasurementID?: string | null;
    /** On a supersede: the recognition taken back out (the replaced observation's RecognitionAmount, negated). Zero otherwise. */
    ReversalAmount?: number;
    /**
     * On a supersede that reverses anything: the date the reversal is booked on. The replaced
     * observation's own date while that month has no Posted batch for the line's company; otherwise
     * day 1 of the first later month with none, so a correction never books into a closed period.
     * Null otherwise.
     */
    ReversalDate?: string | null;
    /**
     * The date this observation's catch-up entry is booked on. `MeasurementDate` itself, except on a
     * supersede whose replaced observation's month has a Posted batch for the line's company: then the
     * later of `MeasurementDate` and `ReversalDate`'s first open day, so nothing new posts into the
     * closed month. The observation row keeps `MeasurementDate`. Null when there is no catch-up.
     */
    CatchUpDate?: string | null;
    /** On a supersede: the entry that reversed the replaced observation. Null on a preview, when nothing was superseded, and when the replaced observation posted nothing. */
    ReversalJournalEntryID?: string | null;
}
