/**
 * A renewal follows a product's successor chain only onto subscription products (#869).
 */
import { describe, expect, it } from 'vitest';
import { NonSubscriptionSuccessorRefusal } from '../SpawnRenewalsOperation.js';

describe('NonSubscriptionSuccessorRefusal', () => {
    it('allows a chain of subscription products', () => {
        expect(NonSubscriptionSuccessorRefusal([
            { Name: 'Membership 2026', SubscriptionTypeID: 'st-1' },
            { Name: 'Membership 2027', SubscriptionTypeID: 'st-1' },
        ])).toBeNull();
    });

    it('does not check the subscription\'s own product, which already holds the subscription', () => {
        expect(NonSubscriptionSuccessorRefusal([{ Name: 'Legacy', SubscriptionTypeID: null }])).toBeNull();
    });

    it('refuses a successor with no subscription type, naming both products', () => {
        const refusal = NonSubscriptionSuccessorRefusal([
            { Name: 'Membership', SubscriptionTypeID: 'st-1' },
            { Name: 'Tote Bag', SubscriptionTypeID: null },
        ]);
        expect(refusal).toMatch(/Membership names Tote Bag as its successor/);
        expect(refusal).toMatch(/not a subscription product/);
    });
});
