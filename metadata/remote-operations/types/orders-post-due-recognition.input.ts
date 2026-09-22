/**
 * Input for `Orders.PostDueRecognition`.
 *
 * The monthly recognition pass (D92 §8). Every confirmed line on a time-driven deferred type is
 * asked what its driver says is earned through `AsOf`, and the difference from what the line has
 * already recognised is posted. CUMULATIVE by construction, so a back-dated term, a missed month
 * and a first run against existing data all catch up in one pass rather than needing one run per
 * period.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersPostDueRecognitionInput {
    /**
     * Recognise everything earned on or before this date, `YYYY-MM-DD`. Becomes each entry's
     * EffectiveDate, so it is normally the last day of the period being closed rather than the day
     * the pass runs.
     */
    AsOf: string;
    /** Report what WOULD post and write nothing. */
    Preview?: boolean;
    /** Restrict the pass to one order, for a targeted retry. Considers every order when omitted. */
    OrderHeaderID?: string;
}
