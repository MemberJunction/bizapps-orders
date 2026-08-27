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
    CacheUntilFor,
    ENTITLEMENT_CHECK_TTL_MS,
    EvaluateGrantAccess,
    InitialGrantStatus,
    PickWinningAccess,
    ReduceGrantForReturn,
    ResolveEntitlementPolicy,
    ResolveGrantQuantity,
    ResolveValidityWindow,
    ShouldRevokeGrantsOnCancel,
    type GrantAccessFacts,
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

const asOf = new Date('2026-07-01T12:00:00Z');
const grant = (over: Partial<GrantAccessFacts> = {}): GrantAccessFacts => ({
    Status: 'Active',
    ValidFrom: new Date('2026-01-01T00:00:00Z'),
    ValidTo: new Date('2026-12-31T00:00:00Z'),
    ...over,
});

describe('EvaluateGrantAccess — Status is not the answer', () => {
    it('Active + inside the window is Granted', () => {
        const r = EvaluateGrantAccess(grant(), asOf);
        expect(r.HasAccess).toBe(true);
        expect(r.Decision).toBe('Granted');
    });

    it('holds at the exact ValidFrom and ValidTo instants (inclusive)', () => {
        expect(EvaluateGrantAccess(grant(), new Date('2026-01-01T00:00:00Z')).HasAccess).toBe(true);
        expect(EvaluateGrantAccess(grant(), new Date('2026-12-31T00:00:00Z')).HasAccess).toBe(true);
    });

    it('before ValidFrom is NotYetValid, even though Status is Active', () => {
        const r = EvaluateGrantAccess(grant(), new Date('2025-12-31T23:59:59Z'));
        expect(r).toMatchObject({ HasAccess: false, Decision: 'NotYetValid' });
    });

    it('after ValidTo is Expired, even though Status is still Active (no sweeper)', () => {
        // This is the whole reason the check cannot be a poll of Status.
        const r = EvaluateGrantAccess(grant(), new Date('2027-01-01T00:00:01Z'));
        expect(r).toMatchObject({ HasAccess: false, Decision: 'Expired' });
    });

    it('Revoked wins even inside the window', () => {
        expect(EvaluateGrantAccess(grant({ Status: 'Revoked' }), asOf).Decision).toBe('Revoked');
    });

    it('Suspended wins even inside the window (OnPaidInFull, unpaid)', () => {
        expect(EvaluateGrantAccess(grant({ Status: 'Suspended' }), asOf).Decision).toBe('Suspended');
    });

    it('stored Status=Expired is Expired even if ValidTo is still in the future', () => {
        expect(EvaluateGrantAccess(grant({ Status: 'Expired' }), asOf).Decision).toBe('Expired');
    });

    it('an unknown Status fails closed', () => {
        expect(EvaluateGrantAccess(grant({ Status: 'Pending' }), asOf).Decision).toBe('NoGrant');
    });

    it('a perpetual grant (null ValidTo) stays Granted', () => {
        expect(EvaluateGrantAccess(grant({ ValidTo: null }), asOf).HasAccess).toBe(true);
    });
});

describe('EvaluateGrantAccess — cancelled subscription + grace', () => {
    const term = {
        Status: 'Canceled',
        StartDate: new Date('2026-01-01T00:00:00Z'),
        EndDate: new Date('2026-12-31T00:00:00Z'),
    };

    it('immediate cancel with access-through already passed is SubscriptionInactive, not Expired', () => {
        // ValidTo is still 12/31; Status is still Active. The lie the poll would believe.
        const r = EvaluateGrantAccess(
            grant({ LinkedToSubscription: true, LinkedToTerm: true }),
            asOf,
            { Status: 'Canceled', EndDate: new Date('2026-06-30T00:00:00Z') },
            term,
        );
        expect(r).toMatchObject({ HasAccess: false, Decision: 'SubscriptionInactive' });
    });

    it('grace (EndDate still ahead) remains Granted even though the term is Canceled', () => {
        const r = EvaluateGrantAccess(
            grant({ LinkedToSubscription: true, LinkedToTerm: true }),
            asOf,
            { Status: 'Canceled', EndDate: new Date('2026-07-15T00:00:00Z') },
            term,
        );
        expect(r.HasAccess).toBe(true);
        expect(r.Decision).toBe('Granted');
    });

    it('grace can EXTEND past the original ValidTo', () => {
        // End-of-term cancel + grace days: ValidTo is 12/31, access-through is 1/7.
        const r = EvaluateGrantAccess(
            grant({ LinkedToSubscription: true }),
            new Date('2027-01-03T12:00:00Z'),
            { Status: 'Canceled', EndDate: new Date('2027-01-07T00:00:00Z') },
        );
        expect(r.HasAccess).toBe(true);
    });

    it('holds at the exact access-through instant', () => {
        const end = new Date('2026-07-15T00:00:00Z');
        expect(
            EvaluateGrantAccess(grant({ LinkedToSubscription: true }), end, {
                Status: 'Canceled',
                EndDate: end,
            }).HasAccess,
        ).toBe(true);
    });

    it('Canceled with no EndDate fails closed', () => {
        const r = EvaluateGrantAccess(grant({ LinkedToSubscription: true }), asOf, {
            Status: 'Canceled',
            EndDate: null,
        });
        expect(r.Decision).toBe('SubscriptionInactive');
    });

    it('Paused refuses immediately, even with a future EndDate', () => {
        const r = EvaluateGrantAccess(grant({ LinkedToSubscription: true }), asOf, {
            Status: 'Paused',
            EndDate: new Date('2026-12-31T00:00:00Z'),
        });
        expect(r).toMatchObject({ HasAccess: false, Decision: 'SubscriptionInactive' });
    });

    it('Migrated refuses', () => {
        expect(
            EvaluateGrantAccess(grant({ LinkedToSubscription: true }), asOf, {
                Status: 'Migrated',
                EndDate: new Date('2026-12-31T00:00:00Z'),
            }).Decision,
        ).toBe('SubscriptionInactive');
    });

    it('Trialing is still accessing, same as Active', () => {
        expect(
            EvaluateGrantAccess(grant({ LinkedToSubscription: true }), asOf, {
                Status: 'Trialing',
                EndDate: null,
            }).HasAccess,
        ).toBe(true);
    });

    it('a grant pointing at a subscription we could not load fails closed', () => {
        const r = EvaluateGrantAccess(grant({ LinkedToSubscription: true }), asOf, null);
        expect(r.Decision).toBe('SubscriptionInactive');
    });

    it('a grant pointing at a term we could not load fails closed', () => {
        const r = EvaluateGrantAccess(grant({ LinkedToTerm: true }), asOf, undefined, null);
        expect(r.Decision).toBe('SubscriptionInactive');
    });
});

describe('PickWinningAccess', () => {
    const row = (over: { HasAccess: boolean; Decision: 'Granted' | 'NoGrant' | 'NotYetValid' | 'Expired' | 'Revoked' | 'Suspended' | 'SubscriptionInactive'; ValidTo: Date | null }) => over;

    it('returns null for an empty list', () => {
        expect(PickWinningAccess([])).toBeNull();
    });

    it('a Granted perpetual beats a Granted with an end', () => {
        const picked = PickWinningAccess([
            row({ HasAccess: true, Decision: 'Granted', ValidTo: new Date('2026-12-31T00:00:00Z') }),
            row({ HasAccess: true, Decision: 'Granted', ValidTo: null }),
        ]);
        expect(picked!.ValidTo).toBeNull();
    });

    it('among Granted with ends, the later ValidTo wins', () => {
        const later = new Date('2027-12-31T00:00:00Z');
        const picked = PickWinningAccess([
            row({ HasAccess: true, Decision: 'Granted', ValidTo: new Date('2026-12-31T00:00:00Z') }),
            row({ HasAccess: true, Decision: 'Granted', ValidTo: later }),
        ]);
        expect(picked!.ValidTo).toBe(later);
    });

    it('Granted beats any denial', () => {
        const picked = PickWinningAccess([
            row({ HasAccess: false, Decision: 'Expired', ValidTo: new Date('2025-01-01T00:00:00Z') }),
            row({ HasAccess: true, Decision: 'Granted', ValidTo: new Date('2026-12-31T00:00:00Z') }),
        ]);
        expect(picked!.HasAccess).toBe(true);
    });

    it('among denials, NotYetValid is more useful than Revoked', () => {
        const picked = PickWinningAccess([
            row({ HasAccess: false, Decision: 'Revoked', ValidTo: null }),
            row({ HasAccess: false, Decision: 'NotYetValid', ValidTo: new Date('2027-01-01T00:00:00Z') }),
        ]);
        expect(picked!.Decision).toBe('NotYetValid');
    });
});

describe('CacheUntilFor', () => {
    const now = new Date('2026-07-01T12:00:00Z');

    it('caps a perpetual grant at the policy TTL', () => {
        expect(CacheUntilFor(now, null, true).getTime()).toBe(now.getTime() + ENTITLEMENT_CHECK_TTL_MS);
    });

    it('never caches a Granted past its own ValidTo', () => {
        const end = new Date('2026-07-01T12:00:30Z'); // 30s, inside the 60s TTL
        expect(CacheUntilFor(now, end, true).getTime()).toBe(end.getTime());
    });

    it('does not use ValidTo to shorten a denial — denials cache for the TTL', () => {
        const end = new Date('2026-07-01T12:00:30Z');
        expect(CacheUntilFor(now, end, false).getTime()).toBe(now.getTime() + ENTITLEMENT_CHECK_TTL_MS);
    });
});

describe('ShouldRevokeGrantsOnCancel', () => {
    const now = new Date('2026-07-01T12:00:00Z');

    it('revokes when access-through has already passed', () => {
        expect(ShouldRevokeGrantsOnCancel(new Date('2026-06-30T00:00:00Z'), now)).toBe(true);
    });

    it('leaves grants standing when grace remains', () => {
        expect(ShouldRevokeGrantsOnCancel(new Date('2026-07-15T00:00:00Z'), now)).toBe(false);
    });

    it('leaves grants standing at the exact access-through instant', () => {
        expect(ShouldRevokeGrantsOnCancel(now, now)).toBe(false);
    });
});
