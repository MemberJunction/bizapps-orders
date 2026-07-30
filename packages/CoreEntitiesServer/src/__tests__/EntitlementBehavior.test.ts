/**
 * Unit tests for entitlement policy resolution and validity windows (D76). No database.
 *
 * TWO THINGS HERE ARE WORTH PINNING HARDER THAN THE REST.
 *
 * The WALK, for the same reason the taxability walk is tested this way: there are several levels that
 * can answer, they produce the same value, and an answer from the wrong level is invisible in the
 * result. So the tests assert WHERE each decision came from, not only what it was.
 *
 * The VALIDITY FALLBACKS, because they are the ones that silently do something reasonable. A ticket
 * whose product has no event dates must not fail the order — but it must not claim to be an event
 * window either. `ModeApplied` is how a grant tells an auditor that the mode it was configured with
 * could not be honoured, and a fallback that forgot to say so would be worse than a failure.
 */
import { describe, it, expect } from 'vitest';
import {
    InitialGrantStatus,
    ReduceGrantForReturn,
    ResolveEntitlementPolicy,
    ResolveGrantQuantity,
    ResolveValidityWindow,
    type PolicyCategoryLevel,
    type PolicyTypeDefaults,
} from '../EntitlementBehavior.js';

const product = (
    over: Partial<{
        EntitlementGrantTiming: 'OnConfirm' | 'OnPaidInFull' | 'OnActivation' | null;
        EntitlementQuantityMode: 'PerUnit' | 'Flat' | null;
        EntitlementValidityMode: 'Perpetual' | 'EventWindow' | 'FixedDuration' | 'SubscriptionTerm' | null;
    }> = {},
) => ({
    EntitlementGrantTiming: null,
    EntitlementQuantityMode: null,
    EntitlementValidityMode: null,
    ...over,
});

const cat = (id: string, over: Partial<PolicyCategoryLevel> = {}): PolicyCategoryLevel => ({
    ID: id,
    EntitlementGrantTiming: null,
    EntitlementQuantityMode: null,
    EntitlementValidityMode: null,
    ...over,
});

const TYPE: PolicyTypeDefaults = {
    DefaultEntitlementGrantTiming: 'OnConfirm',
    DefaultEntitlementQuantityMode: 'PerUnit',
    DefaultEntitlementValidityMode: 'Perpetual',
};

const subType: PolicyTypeDefaults = { ...TYPE, DefaultEntitlementValidityMode: 'SubscriptionTerm' };

describe('ResolveEntitlementPolicy — the walk', () => {
    it('falls all the way to the TYPE when nothing else answers', () => {
        const r = ResolveEntitlementPolicy(product(), [], TYPE);
        expect(r.GrantTiming).toBe('OnConfirm');
        expect(r.QuantityMode).toBe('PerUnit');
        expect(r.ValidityMode).toBe('Perpetual');
        expect(r.DecidedAt.GrantTiming).toBe('ProductType');
    });

    it('the PRODUCT overrides everything above it', () => {
        const r = ResolveEntitlementPolicy(
            product({ EntitlementGrantTiming: 'OnPaidInFull' }),
            [cat('c', { EntitlementGrantTiming: 'OnActivation' })],
            TYPE,
        );
        expect(r.GrantTiming).toBe('OnPaidInFull');
        expect(r.DecidedAt.GrantTiming).toBe('Product');
    });

    it('a CATEGORY answers when the product is silent', () => {
        const r = ResolveEntitlementPolicy(product(), [cat('c', { EntitlementQuantityMode: 'Flat' })], TYPE);
        expect(r.QuantityMode).toBe('Flat');
        expect(r.DecidedAt.QuantityMode).toBe('ProductCategory');
    });

    it('an ANCESTOR answers when the nearer categories are silent', () => {
        // leaf → mid → root, and only the root has an opinion. Reading just the immediate category
        // would make it unreachable, which defeats having a tree at all.
        const r = ResolveEntitlementPolicy(
            product(),
            [cat('leaf'), cat('mid'), cat('root', { EntitlementGrantTiming: 'OnActivation' })],
            TYPE,
        );
        expect(r.GrantTiming).toBe('OnActivation');
        expect(r.DecidedAt.GrantTiming).toBe('ProductCategory');
    });

    it('the NEAREST category with an opinion wins over its ancestors', () => {
        const r = ResolveEntitlementPolicy(
            product(),
            [cat('leaf', { EntitlementGrantTiming: 'OnPaidInFull' }), cat('root', { EntitlementGrantTiming: 'OnActivation' })],
            TYPE,
        );
        expect(r.GrantTiming).toBe('OnPaidInFull');
    });

    it('resolves the three settings INDEPENDENTLY, from different levels', () => {
        // The realistic shape: somebody set timing on the product, quantity on a category, and left
        // validity to the type. A single "policy came from here" answer would be a lie.
        const r = ResolveEntitlementPolicy(
            product({ EntitlementGrantTiming: 'OnPaidInFull' }),
            [cat('c', { EntitlementQuantityMode: 'Flat' })],
            TYPE,
        );
        expect(r.DecidedAt).toEqual({
            GrantTiming: 'Product',
            QuantityMode: 'ProductCategory',
            ValidityMode: 'ProductType',
        });
    });

    it('a deep silent chain still terminates at the type', () => {
        const deep = Array.from({ length: 12 }, (_, i) => cat(`c${i}`));
        expect(ResolveEntitlementPolicy(product(), deep, TYPE).DecidedAt.ValidityMode).toBe('ProductType');
    });
});

describe('ResolveEntitlementPolicy — validity comes from the TEMPLATE first', () => {
    it('the entitlement template beats the product', () => {
        // The whole reason validity is not resolved like the other two: one product can grant a
        // perpetual download AND ninety days of forum access.
        const r = ResolveEntitlementPolicy(
            product({ EntitlementValidityMode: 'Perpetual' }),
            [],
            TYPE,
            { ValidityMode: 'FixedDuration' },
        );
        expect(r.ValidityMode).toBe('FixedDuration');
        expect(r.DecidedAt.ValidityMode).toBe('ProductEntitlement');
    });

    it('falls to the walk when the template is silent', () => {
        const r = ResolveEntitlementPolicy(
            product({ EntitlementValidityMode: 'EventWindow' }),
            [],
            TYPE,
            { ValidityMode: null },
        );
        expect(r.ValidityMode).toBe('EventWindow');
        expect(r.DecidedAt.ValidityMode).toBe('Product');
    });

    it('the template does NOT affect timing or quantity', () => {
        // Timing is a property of the purchase, not of an individual thing granted. Two entitlements
        // on one line appearing at different moments would be incoherent.
        const r = ResolveEntitlementPolicy(product(), [], TYPE, { ValidityMode: 'FixedDuration' });
        expect(r.DecidedAt.GrantTiming).toBe('ProductType');
        expect(r.DecidedAt.QuantityMode).toBe('ProductType');
    });
});

describe('ResolveGrantQuantity', () => {
    it('PerUnit multiplies by the line quantity', () => {
        // Three 5-seat packs are fifteen seats, which is what the buyer expects.
        expect(ResolveGrantQuantity(5, 3, 'PerUnit')).toBe(15);
    });

    it('Flat ignores the line quantity', () => {
        expect(ResolveGrantQuantity(5, 3, 'Flat')).toBe(5);
    });

    it('rounds a prorated line UP, never down', () => {
        // 0.5833 of a 5-seat product is 2.9165 seats. Two seats on a five-seat product is a support
        // ticket; three is nothing. Under-granting is the expensive direction.
        expect(ResolveGrantQuantity(5, 0.5833, 'PerUnit')).toBe(3);
    });

    it('never grants zero to a paying line', () => {
        // A tiny prorated fraction of a single-unit entitlement must still be one, not none.
        expect(ResolveGrantQuantity(1, 0.0001, 'PerUnit')).toBe(1);
    });

    it('reads the line quantity by MAGNITUDE, so a reversal line does not grant negatively', () => {
        expect(ResolveGrantQuantity(5, -3, 'PerUnit')).toBe(15);
    });

    it('keeps a null template quantity NULL rather than turning it into zero', () => {
        // A Feature or AccessLevel is not countable. Zero would read as 'granted none of it'.
        expect(ResolveGrantQuantity(null, 3, 'PerUnit')).toBeNull();
        expect(ResolveGrantQuantity(null, 3, 'Flat')).toBeNull();
    });
});

describe('ResolveValidityWindow — Perpetual and FixedDuration', () => {
    const granted = new Date('2026-03-01T12:00:00Z');

    it('Perpetual has no end, and that is a fact rather than a missing value', () => {
        const r = ResolveValidityWindow('Perpetual', { GrantedOn: granted });
        expect(r.ValidFrom).toEqual(granted);
        expect(r.ValidTo).toBeNull();
        expect(r.ModeApplied).toBe('Perpetual');
    });

    it('FixedDuration counts days from the grant', () => {
        const r = ResolveValidityWindow('FixedDuration', { GrantedOn: granted, DurationDays: 90 });
        expect(r.ValidTo!.toISOString()).toBe('2026-05-30T12:00:00.000Z');
        expect(r.ModeApplied).toBe('FixedDuration');
    });

    it('FixedDuration with no duration falls back to Perpetual AND SAYS SO', () => {
        // The fallback matters less than the admission. A grant that silently claimed to be
        // FixedDuration while lasting forever is how a misconfiguration survives an audit.
        const r = ResolveValidityWindow('FixedDuration', { GrantedOn: granted, DurationDays: null });
        expect(r.ValidTo).toBeNull();
        expect(r.ModeApplied).toBe('Perpetual');
    });
});

describe('ResolveValidityWindow — EventWindow, the online-event case', () => {
    const granted = new Date('2026-03-01T12:00:00Z');
    const starts = new Date('2026-06-10T14:00:00Z');
    const ends = new Date('2026-06-10T18:00:00Z');

    it('follows the EVENT, not the order date', () => {
        // A ticket bought in March for a June event grants access in June. Anchoring to the purchase
        // would open the stream three months early.
        const r = ResolveValidityWindow('EventWindow', {
            GrantedOn: granted,
            EventStartsAt: starts,
            EventEndsAt: ends,
        });
        expect(r.ValidFrom).toEqual(starts);
        expect(r.ValidTo).toEqual(ends);
    });

    it('opens early and closes late, independently', () => {
        const r = ResolveValidityWindow('EventWindow', {
            GrantedOn: granted,
            EventStartsAt: starts,
            EventEndsAt: ends,
            AccessLeadHours: 1,
            AccessLagHours: 24,
        });
        expect(r.ValidFrom.toISOString()).toBe('2026-06-10T13:00:00.000Z');
        expect(r.ValidTo!.toISOString()).toBe('2026-06-11T18:00:00.000Z');
    });

    it('with no event dates, falls back to Perpetual and says so', () => {
        // A product configured as an event window that is not actually an event. The customer bought
        // something, so refusing the order would be wrong; claiming an event window would be a lie.
        const r = ResolveValidityWindow('EventWindow', { GrantedOn: granted, EventStartsAt: null, EventEndsAt: null });
        expect(r.ValidTo).toBeNull();
        expect(r.ModeApplied).toBe('Perpetual');
    });

    it('never produces a window that ends before it starts', () => {
        // A backwards event, which the database CHECK would reject at insert with an error naming
        // neither the product nor the event.
        const r = ResolveValidityWindow('EventWindow', {
            GrantedOn: granted,
            EventStartsAt: ends,
            EventEndsAt: starts,
        });
        expect(r.ValidTo!.getTime()).toBeGreaterThanOrEqual(r.ValidFrom.getTime());
    });
});

describe('ResolveValidityWindow — SubscriptionTerm', () => {
    const granted = new Date('2026-03-01T12:00:00Z');

    it('follows the term window exactly', () => {
        const r = ResolveValidityWindow('SubscriptionTerm', {
            GrantedOn: granted,
            TermStartDate: new Date('2026-01-01T00:00:00Z'),
            TermEndDate: new Date('2026-12-31T00:00:00Z'),
        });
        expect(r.ValidFrom.toISOString()).toBe('2026-01-01T00:00:00.000Z');
        expect(r.ValidTo!.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    });

    it('with no term, falls back to Perpetual and says so', () => {
        // A non-subscription product configured as though it were one.
        const r = ResolveValidityWindow('SubscriptionTerm', { GrantedOn: granted });
        expect(r.ValidTo).toBeNull();
        expect(r.ModeApplied).toBe('Perpetual');
    });
});

describe('InitialGrantStatus', () => {
    it('OnConfirm is Active immediately', () => {
        expect(InitialGrantStatus('OnConfirm', { Balance: 500, TotalGross: 500 })).toBe('Active');
    });

    it('OnPaidInFull waits for the balance to clear', () => {
        expect(InitialGrantStatus('OnPaidInFull', { Balance: 500, TotalGross: 500 })).toBe('Suspended');
        expect(InitialGrantStatus('OnPaidInFull', { Balance: 0, TotalGross: 500 })).toBe('Active');
    });

    it('OnPaidInFull treats an over-payment as paid', () => {
        expect(InitialGrantStatus('OnPaidInFull', { Balance: -100, TotalGross: 300 })).toBe('Active');
    });

    it('OnPaidInFull treats a ZERO-VALUE order as paid', () => {
        // A free line should not leave the customer waiting for a payment that will never arrive.
        expect(InitialGrantStatus('OnPaidInFull', { Balance: 0, TotalGross: 0 })).toBe('Active');
    });

    it('OnActivation is Suspended and stays that way', () => {
        expect(InitialGrantStatus('OnActivation', { Balance: 0, TotalGross: 500 })).toBe('Suspended');
    });
});

describe('ReduceGrantForReturn', () => {
    it('a full return revokes the grant', () => {
        expect(ReduceGrantForReturn(15, 3, 3)).toEqual({ Quantity: 15, Revoke: true });
    });

    it('returning MORE than was bought still just revokes', () => {
        expect(ReduceGrantForReturn(15, 3, 5).Revoke).toBe(true);
    });

    it('a partial return keeps the proportional remainder', () => {
        // Five seats, two sent back of five bought: three remain.
        expect(ReduceGrantForReturn(5, 5, 2)).toEqual({ Quantity: 3, Revoke: false });
    });

    it('rounds the remainder UP', () => {
        // 10 seats over 3 units, one returned: 6.67 → 7. Taking away a seat the customer still paid
        // for is worse than leaving one they did not.
        expect(ReduceGrantForReturn(10, 3, 1)).toEqual({ Quantity: 7, Revoke: false });
    });

    it('a partial return does not remove an uncountable grant', () => {
        // A Feature is not divisible: the customer still holds some of the thing that conferred it.
        expect(ReduceGrantForReturn(null, 5, 2)).toEqual({ Quantity: null, Revoke: false });
    });

    it('reads both quantities by magnitude, since reversals are stored negative', () => {
        expect(ReduceGrantForReturn(5, 5, -2)).toEqual({ Quantity: 3, Revoke: false });
        expect(ReduceGrantForReturn(5, -5, -5).Revoke).toBe(true);
    });
});
