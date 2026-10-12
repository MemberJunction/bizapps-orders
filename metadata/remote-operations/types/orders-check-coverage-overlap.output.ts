/**
 * Output of `Orders.CheckCoverageOverlap`.
 *
 * One row per subscription line that overlaps coverage in its family. A line with no overlap has
 * no row.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface CheckCoverageOverlapOutput {
    Lines: {
        OrderLineID: string;
        /**
         * What confirm will do with the line:
         *   Refused       — confirm fails until the overlap is resolved
         *   NeedsAck      — confirm fails unless the line acknowledges the overlap
         *   Acknowledged  — the line acknowledges it, so confirm proceeds
         *   Allowed       — the subscription type permits concurrent coverage
         */
        Outcome: 'Refused' | 'NeedsAck' | 'Acknowledged' | 'Allowed';
        /** The sentence confirm refuses with, or the notice to show when it proceeds. */
        Message: string;
        /** The coverage it overlaps. */
        Overlaps: {
            /** Null when the overlap is with another line of this same order. */
            SubscriptionID: string | null;
            SubscriptionNumber: string | null;
            ProductName: string;
            /** Calendar days, `yyyy-MM-dd`. */
            CoverageStart: string;
            CoverageEnd: string;
        }[];
    }[];
}
