/**
 * The one rule both renewal jobs share: a subscription with a `ProviderSubscriptionID` is billed by its
 * gateway, and Orders does not renew it (option E, E1). The SQL form and the row form must agree.
 */
import { describe, expect, it } from 'vitest';
import { IsProviderBilled, NotProviderBilledSql, ProviderBilledPurchaseVerdict } from '../ProviderBilledSubscriptions.js';

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
        // SQL's `IS NULL` is false for '', so the row form must say provider-billed for '' too. The CHECK
        // refuses '' (and only spaces) on save, so a stored row never holds one; an unsaved row that does
        // is treated as gateway-billed (not charged) rather than silently renewed.
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

describe('ProviderBilledPurchaseVerdict (E2b): what an order may do to a subscription a gateway bills', () => {
    // Jane's SUB-000110, billed by Stripe as sub_old through 30 Oct 2027.
    const billed = (Status: string) => ({ Status, ProviderSubscriptionID: 'sub_old', SubscriptionNumber: 'SUB-000110' });
    const notBilled = (Status: string) => ({ Status, ProviderSubscriptionID: null, SubscriptionNumber: 'SUB-000111' });

    it('a new subscription is always allowed, whatever it would sit beside', () => {
        // Kills: dropping `action === 'CreateNew'` from the Allow guard (a billed existing would refuse it).
        expect(ProviderBilledPurchaseVerdict('CreateNew', billed('Active'), false)).toEqual({ Kind: 'Allow' });
        expect(ProviderBilledPurchaseVerdict('CreateNew', billed('Canceled'), true)).toEqual({ Kind: 'Allow' });
    });

    it('a subscription no gateway bills is Orders-renewed as before: every action is allowed', () => {
        // Kills: dropping `!IsProviderBilled(existing)` from the Allow guard.
        for (const action of ['CreateNew', 'ExtendExisting', 'Reactivate', 'Reject'] as const) {
            for (const status of ['Active', 'Paused', 'Canceled']) {
                for (const renewal of [false, true]) {
                    expect(ProviderBilledPurchaseVerdict(action, notBilled(status), renewal), `${action}/${status}/${renewal}`).toEqual({ Kind: 'Allow' });
                }
            }
        }
    });

    it('no existing subscription (null or undefined) is allowed', () => {
        // Kills: dropping `!existing` (would throw reading null).
        expect(ProviderBilledPurchaseVerdict('ExtendExisting', null, false)).toEqual({ Kind: 'Allow' });
        expect(ProviderBilledPurchaseVerdict('Reactivate', undefined, true)).toEqual({ Kind: 'Allow' });
    });

    it('Reject is not ours to refuse again: allowed (SubscriptionBehavior already rejected it)', () => {
        expect(ProviderBilledPurchaseVerdict('Reject', billed('Active'), false)).toEqual({ Kind: 'Allow' });
    });

    it("another year on Jane's Stripe-billed SUB-000110 is refused, naming it, its sub id and 'extend'", () => {
        // Kills: returning Allow for ExtendExisting (Orders would invoice a year Stripe also charges).
        const v = ProviderBilledPurchaseVerdict('ExtendExisting', billed('Active'), false);
        expect(v.Kind).toBe('Refuse');
        const message = (v as { Message: string }).Message;
        expect(message).toContain('SUB-000110');
        expect(message).toContain('sub_old');
        expect(message).toMatch(/cannot extend it/);
    });

    it("Spawn Renewals' order for a billed subscription is refused with 'renew', even for a Canceled one", () => {
        // Kills: dropping `!isRenewal` from the FreshStart condition (a renewal would reopen a cancelled gateway one).
        for (const [action, status] of [['ExtendExisting', 'Active'], ['Reactivate', 'Canceled'], ['Reactivate', 'Active']] as const) {
            const v = ProviderBilledPurchaseVerdict(action, billed(status), true);
            expect(v.Kind, `${action}/${status}`).toBe('Refuse');
            expect((v as { Message: string }).Message).toMatch(/cannot renew it/);
        }
    });

    it('a CANCELLED billed subscription bought again (not a renewal) is a FreshStart', () => {
        // Kills: returning Refuse (no buy-back after cancel) or Allow (would carry the old sub_old forward).
        expect(ProviderBilledPurchaseVerdict('Reactivate', billed('Canceled'), false)).toEqual({ Kind: 'FreshStart' });
    });

    it('reactivating a billed subscription that is still Active or Paused is refused with "reactivate"', () => {
        // Kills: dropping `existing.Status === 'Canceled'` from the FreshStart condition.
        for (const status of ['Active', 'Paused', 'Trialing']) {
            const v = ProviderBilledPurchaseVerdict('Reactivate', billed(status), false);
            expect(v.Kind, status).toBe('Refuse');
            expect((v as { Message: string }).Message).toMatch(/cannot reactivate it/);
        }
    });

    it('with no subscription number the refusal still reads, naming the sub id', () => {
        const v = ProviderBilledPurchaseVerdict('ExtendExisting', { Status: 'Active', ProviderSubscriptionID: 'sub_old' }, false);
        expect((v as { Message: string }).Message).toMatch(/^The subscription is billed by the payment gateway \(sub_old\)/);
    });
});
