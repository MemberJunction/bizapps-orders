/**
 * The refund a person cancelling may choose over the subscription type's own rule.
 *
 * A type says what a customer who cancels is owed. An agreed early end settles that between the two
 * sides, and the type's rule then gives the wrong answer in both directions: a no-refund type keeps
 * money the agreement returns. These pin the choice: absent it changes nothing, `Full` returns the
 * whole term being cut short, `ProrateUnused` the unused part, and a later term comes back in full
 * under either.
 *
 * CONNECTS TO:
 *   TESTS: ../SubscriptionBehavior.ts (RulesForRefund, ComputeRefund, DecideLaterTermCancellation)
 *   AKIN:  ./SubscriptionBehavior.test.ts (RulesForTiming, the sibling choice)
 */
import { describe, expect, it } from 'vitest';
import { CANCELLATION_REFUNDS, SubscriptionBehavior, type CancellationRefund, type SubscriptionTypeRules } from '../SubscriptionBehavior.js';

function rules(overrides: Partial<SubscriptionTypeRules> = {}): SubscriptionTypeRules {
    return {
        ID: 'st-1',
        Code: 'Test',
        SubscriberScope: 'Either',
        BenefitModel: 'Holder',
        StartMode: 'Immediate',
        DefaultTermMonths: 12,
        BillingCadence: 'Annual',
        RecognitionCadence: 'Monthly',
        TrialDays: 0,
        ConcurrencyMode: 'ExtendExisting',
        ReactivationMode: 'AlwaysCreateNew',
        AutoRenewDefault: true,
        RenewalLeadDays: 30,
        CancellationMode: 'EndOfTerm',
        CancellationRefundMode: 'NoRefund',
        GracePeriodDays: 0,
        ...overrides,
    };
}

const term = { StartDate: new Date('2026-01-01T00:00:00Z'), EndDate: new Date('2026-12-31T00:00:00Z'), Amount: 1200 };

/** An Immediate cancel on a no-refund type, with the refund the person cancelling chose. */
function cancel(refund: CancellationRefund | undefined, request: string, base: Partial<SubscriptionTypeRules> = {}) {
    const behavior = new SubscriptionBehavior();
    const timed = behavior.RulesForTiming(rules(base), 'Immediate');
    return behavior.DecideCancellation({
        Rules: behavior.RulesForRefund(timed, refund),
        RequestDate: new Date(`${request}T00:00:00Z`),
        Term: term,
    });
}

describe('RulesForRefund', () => {
    it('names exactly the two choices a caller may send', () => {
        expect(CANCELLATION_REFUNDS).toEqual(['Full', 'ProrateUnused']);
    });

    it('leaves the type\'s rules alone when no refund is chosen', () => {
        const base = rules();
        expect(new SubscriptionBehavior().RulesForRefund(base, undefined)).toBe(base);
        expect(new SubscriptionBehavior().RulesForRefund(base, null)).toBe(base);
        const d = cancel(undefined, '2026-07-01');
        expect(d.RefundAmount).toBe(0);
        expect(d.ReversalFraction).toBe(0);
    });

    it('changes the refund mode and nothing else', () => {
        const base = rules({ CancellationMode: 'Immediate', GracePeriodDays: 7 });
        const full = new SubscriptionBehavior().RulesForRefund(base, 'Full');
        expect(full).toEqual({ ...base, CancellationRefundMode: 'FullRefund' });
        const prorated = new SubscriptionBehavior().RulesForRefund(base, 'ProrateUnused');
        expect(prorated).toEqual({ ...base, CancellationRefundMode: 'ProrateUnused' });
    });

    it('Full returns the whole term on a type that does not refund, however much was used', () => {
        const d = cancel('Full', '2026-07-01');
        expect(d.RefundAmount).toBe(1200);
        expect(d.ReversalFraction).toBe(1);
        expect(d.TermStatus).toBe('Canceled');
        expect(d.Explanation).toContain('full refund was chosen');
        expect(d.Explanation).not.toContain('does not refund');
    });

    it('Full ignores a refund window that has passed', () => {
        const d = cancel('Full', '2026-07-01', { CancellationRefundMode: 'FullRefundWithinWindow', CancellationWindowDays: 30 });
        expect(d.RefundAmount).toBe(1200);
    });

    it('ProrateUnused returns the part after coverage ends on a type that does not refund', () => {
        const d = cancel('ProrateUnused', '2026-07-01');
        // 1 Jul to 31 Dec is 183 of 365 days.
        expect(d.ReversalFraction).toBe(0.5014);
        expect(d.RefundAmount).toBe(601.68);
    });

    it('on the term\'s first day Full returns everything, and ProrateUnused keeps that one day', () => {
        expect(cancel('Full', '2026-01-01').RefundAmount).toBe(1200);
        // Proration is the type's own arithmetic, unchanged by the choice: 364 of 365 days go unused.
        expect(cancel('ProrateUnused', '2026-01-01').RefundAmount).toBe(1196.76);
    });

    it.each(CANCELLATION_REFUNDS.map((r) => [r] as const))('a later, invoiced term on a no-refund type is reversed in full under %s', (refund) => {
        const behavior = new SubscriptionBehavior();
        const later = (r: SubscriptionTypeRules) =>
            behavior.DecideLaterTermCancellation({
                Rules: r,
                Term: { StartDate: new Date('2027-01-01T00:00:00Z'), EndDate: new Date('2027-12-31T00:00:00Z'), Amount: 1300, TermNumber: 2 },
                CoverageEndsDate: new Date('2026-07-01T00:00:00Z'),
                Billing: 'Invoiced',
            });
        // The type alone keeps what was invoiced for it.
        expect(later(rules()).RefundAmount).toBe(0);
        const d = later(behavior.RulesForRefund(rules(), refund));
        expect(d.RefundAmount).toBe(1300);
        expect(d.ReversalFraction).toBe(1);
        expect(d.Explanation).not.toContain('does not refund');
    });
});
