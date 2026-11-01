/**
 * The order side of E4: a renewal the payment gateway already charged (`SanctionGatewayRenewal`) continues
 * the subscription it names (an active one extended, a cancelled one reactivated, never a second one), its
 * term starts the day after the last one ended, and E2b's refusal still holds for every other order.
 */
import { describe, expect, it } from 'vitest';
import { ProviderBilledPurchaseVerdict } from '../ProviderBilledSubscriptions.js';
import { SubscriptionBehavior, type ExistingSubscription, type SubscriptionTypeRules } from '../SubscriptionBehavior.js';
import { IsGatewayRenewal, SanctionGatewayRenewal } from '../SubscriptionEntityServer.js';

function rules(overrides: Partial<SubscriptionTypeRules> = {}): SubscriptionTypeRules {
    return {
        ID: 'st-1',
        Code: 'AnnualRolling',
        SubscriberScope: 'Either',
        BenefitModel: 'Holder',
        StartMode: 'Immediate',
        DefaultTermMonths: 12,
        BillingCadence: 'Annual',
        RecognitionCadence: 'Monthly',
        TrialDays: 0,
        ConcurrencyMode: 'ExtendExisting',
        ReactivationMode: 'ReactivateWithinWindow',
        ReactivationWindowDays: 90,
        AutoRenewDefault: true,
        RenewalLeadDays: 90,
        CancellationMode: 'EndOfTerm',
        CancellationRefundMode: 'NoRefund',
        GracePeriodDays: 0,
        ...overrides,
    };
}

/** Jane's SUB-000110: term 1 ends 30 Oct 2027. */
const jane = (over: Partial<ExistingSubscription> = {}): ExistingSubscription =>
    ({
        ID: 'sub-jane',
        Status: 'Active',
        LatestTermEnd: new Date('2027-10-30T00:00:00Z'),
        LatestTermNumber: 1,
        ProviderSubscriptionID: 'sub_jane',
        SubscriptionNumber: 'SUB-000110',
        ...over,
    }) as ExistingSubscription;

const decide = (existing: ExistingSubscription, purchase: string, extra: Record<string, unknown> = {}) =>
    new SubscriptionBehavior().Decide({
        Rules: rules(),
        PurchaseDate: new Date(`${purchase}T00:00:00Z`),
        Amount: 599,
        Existing: existing,
        Subscriber: { OrganizationID: null, PersonID: 'person-jane' },
        IsRenewal: true,
        ...extra,
    });
const iso = (d: Date | undefined) => d?.toISOString().slice(0, 10);

describe('a gateway renewal continues the subscription it names', () => {
    it('active: ExtendExisting, term 2 = 31 Oct 2027 → 30 Oct 2028 whatever day the charge was booked', () => {
        const d = decide(jane(), '2027-10-30', { GatewayRenewal: true });
        expect(d.Action).toBe('ExtendExisting');
        expect([iso(d.Term?.StartDate), iso(d.Term?.EndDate), d.Term?.TermNumber]).toEqual(['2027-10-31', '2028-10-30', 2]);
    });
    it('Q5 cancelled in Orders, renewed by the gateway: Reactivate (the same subscription), term continuing from the last one', () => {
        const d = decide(jane({ Status: 'Canceled' }), '2027-10-30', { GatewayRenewal: true });
        expect(d.Action).toBe('Reactivate');
        expect(d.SubscriptionID).toBe('sub-jane');
        expect([iso(d.Term?.StartDate), iso(d.Term?.EndDate)]).toEqual(['2027-10-31', '2028-10-30']);
    });
    it("Q5 even outside the type's reactivation window (a late gateway retry): Reactivate, never a second subscription", () => {
        const d = decide(jane({ Status: 'Canceled', LatestTermEnd: new Date('2027-01-01T00:00:00Z') }), '2027-10-30', { GatewayRenewal: true });
        expect(d.Action).toBe('Reactivate');
    });
    it('control: the same late renewal NOT from the gateway follows the window and starts a new subscription', () => {
        const d = decide(jane({ Status: 'Canceled', LatestTermEnd: new Date('2027-01-01T00:00:00Z'), ProviderSubscriptionID: null }), '2027-10-30');
        expect(d.Action).toBe('CreateNew');
    });
    it('control: an ordinary renewal of an active subscription extends as before', () => {
        expect(decide(jane({ ProviderSubscriptionID: null }), '2027-10-01').Action).toBe('ExtendExisting');
    });
    it("control: an ordinary reactivation starts on the purchase day (the gateway rule doesn't leak into it)", () => {
        const d = decide(jane({ Status: 'Canceled', ProviderSubscriptionID: null }), '2027-11-15');
        expect(d.Action).toBe('Reactivate');
        expect(iso(d.Term?.StartDate)).toBe('2027-11-15');
    });
});

describe('ProviderBilledPurchaseVerdict with the gateway-renewal mark', () => {
    const billed = { Status: 'Active', ProviderSubscriptionID: 'sub_jane', SubscriptionNumber: 'SUB-000110' };
    it('a gateway renewal may extend or reactivate the gateway-billed subscription', () => {
        expect(ProviderBilledPurchaseVerdict('ExtendExisting', billed, true, true)).toEqual({ Kind: 'Allow' });
        expect(ProviderBilledPurchaseVerdict('Reactivate', { ...billed, Status: 'Canceled' }, true, true)).toEqual({ Kind: 'Allow' });
    });
    it('Q5: never a fresh start: its gateway id is kept, because the gateway is billing it again', () => {
        expect(ProviderBilledPurchaseVerdict('Reactivate', { ...billed, Status: 'Canceled' }, true, true).Kind).not.toBe('FreshStart');
    });
    it('control (E2b holds): the same orders WITHOUT the mark are refused', () => {
        expect(ProviderBilledPurchaseVerdict('ExtendExisting', billed, true, false).Kind).toBe('Refuse');
        expect(ProviderBilledPurchaseVerdict('ExtendExisting', billed, false, false).Kind).toBe('Refuse');
        expect(ProviderBilledPurchaseVerdict('Reactivate', { ...billed, Status: 'Active' }, true, false).Kind).toBe('Refuse');
    });
    it('control: the mark only covers a renewal line (a non-renewal line on a marked order is refused)', () => {
        expect(ProviderBilledPurchaseVerdict('ExtendExisting', billed, false, true).Kind).toBe('Refuse');
    });
    it('control: a cancelled one bought again without the mark is still a fresh start (E2b)', () => {
        expect(ProviderBilledPurchaseVerdict('Reactivate', { ...billed, Status: 'Canceled' }, false, false)).toEqual({ Kind: 'FreshStart' });
    });
});

describe('SanctionGatewayRenewal', () => {
    it('marks exactly the object it is given; a look-alike object is not marked', () => {
        const order = { OrderNumber: 'ORD-1' };
        const lookalike = { OrderNumber: 'ORD-1' };
        expect(IsGatewayRenewal(order)).toBe(false);
        SanctionGatewayRenewal(order);
        expect(IsGatewayRenewal(order)).toBe(true);
        expect(IsGatewayRenewal(lookalike)).toBe(false);
    });
});
