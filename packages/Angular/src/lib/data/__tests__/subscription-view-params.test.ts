import { describe, expect, it } from 'vitest';
import { SubscriptionViewParams } from '../orders-queries';

/**
 * The order's Subscriptions tab (golive #384): a line that added a term to a running subscription is
 * recorded on the term, not on `Subscription.OrderLineID`, so the tab has to read both.
 */
describe('SubscriptionViewParams', () => {
    const lineID = 'cccccccc-1111-4222-8333-444444444444';

    it('reads the subscriptions a line started and the ones it bought a term on', () => {
        const params = SubscriptionViewParams([lineID]);
        expect(params?.ExtraFilter).toContain(`OrderLineID IN ('${lineID}')`);
        expect(params?.ExtraFilter).toContain(
            `ID IN (SELECT SubscriptionID FROM [__mj_BizAppsOrders].[vwSubscriptionTerms] WHERE OrderLineID IN ('${lineID}'))`,
        );
    });

    it('returns null for an order with no lines', () => {
        expect(SubscriptionViewParams([])).toBeNull();
    });
});
