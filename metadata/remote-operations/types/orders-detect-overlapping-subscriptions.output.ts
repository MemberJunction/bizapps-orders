/**
 * Output for `Orders.DetectOverlappingSubscriptions`.
 *
 * Counts, plus every error, so an unattended run that raised nothing can be told apart from one
 * that found nothing.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OverlappingSubscriptionsDetectionError {
    /** `<EarlierSubscriptionID>|<LaterSubscriptionID>` when the error belongs to one pair. */
    DedupeKey?: string;
    Code: string;
    Message: string;
}

export interface OrdersDetectOverlappingSubscriptionsOutput {
    /** False when any pair could not be raised; every reason is in Errors. */
    Success: boolean;
    Message?: string;
    /**
     * False when the OVERLAPPING_SUBSCRIPTION exception type is missing or inactive. The check then
     * does not run: the type's configuration is the only source of its settings.
     */
    TypeActive: boolean;
    /** The business day the exceptions were dated to (YYYY-MM-DD). */
    ExceptionDate: string;
    /** Pairs the "Overlapping Subscriptions" query returned. */
    PairsFound: number;
    /** Pairs left after the IncludeSameCategory setting: the ones an exception was raised for. */
    PairsConsidered: number;
    /** Exceptions created by this run. */
    Created: number;
    /** Pairs that already had an exception, in any status. Left unchanged. */
    AlreadyRaised: number;
    /** Pairs accounting skipped. */
    Skipped: number;
    Errors: OverlappingSubscriptionsDetectionError[];
}
