/**
 * Input for `Orders.DetectUnattestedProgress`.
 *
 * The nightly pass that puts a percentage-of-completion line on finance's review list when nobody
 * has attested its progress for too long (golive #279, type 2). The threshold is the
 * PROGRESS_UNATTESTED type's `MaxDaysWithoutAttestation`, owned by accounting.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersDetectUnattestedProgressInput {
    /** Treat this business day as "today" (YYYY-MM-DD). Omit for the actual business day, which is what the schedule uses. */
    AsOfDate?: string;
}
