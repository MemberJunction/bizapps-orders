/**
 * The one rule both renewal jobs share: a subscription with a `ProviderSubscriptionID` is billed by its
 * gateway, and Orders does not renew it (option E, E1). The SQL form and the row form must agree.
 */
import { describe, expect, it } from 'vitest';
import { IsProviderBilled, NotProviderBilledSql } from '../ProviderBilledSubscriptions.js';

describe('NotProviderBilledSql', () => {
    it('is the marker on the given alias', () => {
        expect(NotProviderBilledSql('s')).toBe('s.ProviderSubscriptionID IS NULL');
        expect(NotProviderBilledSql('sub')).toBe('sub.ProviderSubscriptionID IS NULL');
    });

    it('refuses anything that is not a plain SQL alias, since it is pasted into a statement', () => {
        for (const bad of ['', 's; DROP TABLE x', 's.ID', '1s', "s'", 's ']) {
            expect(() => NotProviderBilledSql(bad), JSON.stringify(bad)).toThrow(/alias/);
        }
    });
});

describe('IsProviderBilled', () => {
    it('a subscription with a gateway id (Stripe sub_...) is provider-billed, so Orders does not renew it', () => {
        expect(IsProviderBilled({ ProviderSubscriptionID: 'sub_1Q2w3E4r5T6y' })).toBe(true);
    });

    it('a team subscription with no gateway id is renewed by Orders, as before', () => {
        expect(IsProviderBilled({ ProviderSubscriptionID: null })).toBe(false);
        expect(IsProviderBilled({})).toBe(false);
    });

    it('agrees with the SQL form: any non-NULL value is a marker, even an empty string', () => {
        // SQL's `IS NULL` is false for '', so the row form must say provider-billed for '' too.
        expect(IsProviderBilled({ ProviderSubscriptionID: '' })).toBe(true);
    });

    it('takes the subscription alone: the account switch cannot change the answer', () => {
        // The switch (PaymentProvider.BillsSubscriptions) governs creating gateway subscriptions only.
        // Turning it off must not make Orders charge a subscription the gateway still bills, so the
        // rule does not look at it even when a caller passes it along.
        const billedWithSwitchOff = { ProviderSubscriptionID: 'sub_A1', BillsSubscriptions: false } as { ProviderSubscriptionID: string };
        const unbilledWithSwitchOn = { ProviderSubscriptionID: null, BillsSubscriptions: true } as { ProviderSubscriptionID: null };
        expect(IsProviderBilled(billedWithSwitchOff)).toBe(true);
        expect(IsProviderBilled(unbilledWithSwitchOn)).toBe(false);
    });
});
