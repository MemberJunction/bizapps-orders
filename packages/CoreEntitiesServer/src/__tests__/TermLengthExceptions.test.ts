/**
 * A subscription sold for a length other than its type's term (golive #338): when it is raised for
 * finance review, and what the exception says about the length and the price.
 */
import { describe, expect, it } from 'vitest';
import { SubscriptionBehavior, type SubscriptionTypeRules } from '../SubscriptionBehavior.js';
import { ReviewTermLength, type StatedLengthLine } from '../TermLengthExceptions.js';

const ANNUAL: SubscriptionTypeRules = {
    ID: 'st-annual',
    Code: 'AnnualRolling',
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
};

const day = (s: string) => new Date(`${s}T00:00:00Z`);

function decide(end: string | null, rules: SubscriptionTypeRules = ANNUAL, start = '2026-11-01', extra = {}) {
    return new SubscriptionBehavior().Decide({
        Rules: rules,
        PurchaseDate: day('2026-10-13'),
        Amount: 11000,
        Subscriber: { OrganizationID: 'org-1', PersonID: null },
        RequestedStartDate: day(start),
        RequestedEndDate: end ? day(end) : null,
        ...extra,
    });
}

function line(months: number, end: string, net = 11000): StatedLengthLine {
    return {
        ID: 'line-1',
        LineNumber: 1,
        ProductName: 'Core R01',
        CompanyID: 'co-1',
        ProductID: 'p-1',
        OrderHeaderID: 'o-1',
        Quantity: 1,
        UnitPrice: net,
        ProductPriceID: null,
        PriceStated: true,
        LineTotalNet: net,
        CoverageStart: day('2026-11-01'),
        CoverageEnd: day(end),
        Months: months,
        TypeMonths: 12,
    };
}

describe('which lines carry a stated length', () => {
    it.each([
        ['6 months', '2027-04-30', 6],
        ['13 months', '2027-11-30', 13],
        ['18 months', '2028-04-30', 18],
        ['24 months', '2028-10-31', 24],
    ])('%s: the stated length and the type term', (_label, end, months) => {
        expect(decide(end).StatedLength).toEqual({ Months: months, TypeMonths: 12 });
    });

    it('12 months, or no stated end: nothing to review', () => {
        expect(decide('2027-10-31').StatedLength).toBeUndefined();
        expect(decide(null).StatedLength).toBeUndefined();
    });

    it('an extension of a held product keeps its stated 6 months, and carries them', () => {
        const d = decide('2027-04-30', ANNUAL, '2026-11-01', {
            Existing: { ID: 'sub-1', Status: 'Active', LatestTermEnd: day('2027-10-31'), LatestTermNumber: 1 },
        });
        expect(d.StatedLength).toEqual({ Months: 6, TypeMonths: 12 });
    });

    it("an anchored type's own partial first term is not a stated length", () => {
        const calendar = { ...ANNUAL, StartMode: 'CalendarAnchored' as const, AnchorMonth: 1, AnchorDay: 1, PartialPeriodMode: 'Prorate' as const };
        expect(decide('2026-12-31', calendar).StatedLength).toBeUndefined();
    });
});

describe('what the review says', () => {
    it('13 months at the 12-month list price: one month is not charged for', () => {
        const r = ReviewTermLength(line(13, '2027-11-30'), 'ORD-1', 11000, true);
        expect(r.PriceUnchanged).toBe(true);
        expect(r.Difference).toBe(916.67);
        expect(r.Summary).toBe(
            'Line 1 of order ORD-1 (Core R01) covers 13 months, 2026-11-01 to 2027-11-30; its subscription ' +
                "type's term is 12 months. It is priced at 11000.00, the list price for 12 months, so 1 month is " +
                'not charged for (916.67 at the list rate).',
        );
    });

    it('6 months at the 12-month list price: it charges for six months it does not cover', () => {
        const r = ReviewTermLength(line(6, '2027-04-30'), 'ORD-1', 11000, true);
        expect(r.PriceUnchanged).toBe(true);
        expect(r.Difference).toBe(-5500);
        expect(r.Summary).toContain('so it charges for 6 months it does not cover (5500.00 at the list rate).');
    });

    it('24 months at the 12-month list price: twelve months are not charged for', () => {
        const r = ReviewTermLength(line(24, '2028-10-31'), 'ORD-1', 11000, true);
        expect(r.Difference).toBe(11000);
        expect(r.Summary).toContain('so 12 months are not charged for (11000.00 at the list rate).');
    });

    it('18 months repriced to the list rate: still raised, with the price shown against the rate', () => {
        const r = ReviewTermLength(line(18, '2028-04-30', 16500), 'ORD-1', 11000, false);
        expect(r.PriceUnchanged).toBe(false);
        expect(r.Difference).toBe(0);
        expect(r.Summary).toContain('It is priced at 16500.00 against a list price of 11000.00 for 12 months; 18 months at that rate is 16500.00.');
    });

    it('no list price: the price is reported without a comparison', () => {
        const r = ReviewTermLength(line(13, '2027-11-30'), 'ORD-1', null, false);
        expect(r.Difference).toBeNull();
        expect(r.Summary).toContain('no list price resolves to compare it with.');
    });
});
