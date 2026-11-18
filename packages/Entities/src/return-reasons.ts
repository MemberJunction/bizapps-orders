/**
 * The reasons a return can be booked under, shared by the Returns page and by any caller that books
 * a reversal order on its own.
 *
 * `OrderHeader.ReversalReason` is free text, so this list is a vocabulary and not a constraint: a
 * caller with a more specific reason writes it out, ideally starting with one of these so reports
 * can still group by it. The first block is about goods; the second is about agreements and billing,
 * where nothing was shipped and "customer changed mind" misdescribes what happened.
 *
 * @module @mj-biz-apps/orders-entities
 */
export const RETURN_REASONS = [
    'Damaged in transit',
    'Wrong item shipped',
    'Customer changed mind',
    'Duplicate order',
    'Pricing error',
    'Contract terminated early',
    'Customer cancellation',
    'Billing correction',
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

/** The reason for a reversal booked because the contract behind the order ended before its term. */
export const CONTRACT_TERMINATED_RETURN_REASON: ReturnReason = 'Contract terminated early';
