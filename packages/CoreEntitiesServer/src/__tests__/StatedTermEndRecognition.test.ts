/**
 * A stated term end, through to recognition (golive #338).
 *
 * Confirm builds a schedule per term, each over its own window at its own amount
 * (`OrderJournalEntryFactory`). These cases run the terms `SubscriptionBehavior.Decide` plans for an
 * Annual Rolling product at 11,000 through the EvenOverTime driver the same way, and check that the
 * whole stated coverage is recognized, a month at a time, at one monthly figure.
 */
import { describe, expect, it } from 'vitest';
import { SubscriptionBehavior, type SubscriptionTypeRules } from '../SubscriptionBehavior.js';
import { EvenOverTimeDriver } from '../RevenueRecognition.js';

const ANNUAL_ROLLING: SubscriptionTypeRules = {
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
const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

function recognition(end: string, existing?: { LatestTermEnd: Date; LatestTermNumber: number }) {
    const decision = new SubscriptionBehavior().Decide({
        Rules: ANNUAL_ROLLING,
        PurchaseDate: day('2026-10-13'),
        Amount: 11000,
        Subscriber: { OrganizationID: 'org-1', PersonID: null },
        RequestedStartDate: day('2026-11-01'),
        RequestedEndDate: day(end),
        Existing: existing ? { ID: 'sub-1', Status: 'Active', ...existing } : null,
    });
    const driver = new EvenOverTimeDriver();
    return decision.Terms!.flatMap((term) =>
        driver
            .BuildSchedule({
                Amount: term.Amount,
                BookingDate: day('2026-10-13'),
                ServicePeriodStart: term.StartDate,
                ServicePeriodEnd: term.EndDate,
                PeriodMonths: 1,
            })
            .Entries.map((e) => ({ Month: ym(e.RecognitionDate), Amount: e.Amount })),
    );
}

const total = (entries: Array<{ Amount: number }>) => Math.round(entries.reduce((a, e) => a + e.Amount, 0) * 100) / 100;

describe('recognition spreads over the stated months (golive #338)', () => {
    it.each([
        ['6 months', '2027-04-30', 6, '2026-11', '2027-04', 1833.33],
        ['12 months', '2027-10-31', 12, '2026-11', '2027-10', 916.67],
        ['13 months', '2027-11-30', 13, '2026-11', '2027-11', 846.15],
        ['18 months', '2028-04-30', 18, '2026-11', '2028-04', 611.11],
        ['24 months', '2028-10-31', 24, '2026-11', '2028-10', 458.33],
    ])('%s: one entry a month from the first month to the last, all the line amount', (_label, end, months, first, last, monthly) => {
        const entries = recognition(end);
        expect(entries).toHaveLength(months);
        expect(entries[0].Month).toBe(first);
        expect(entries[entries.length - 1].Month).toBe(last);
        expect(new Set(entries.map((e) => e.Month)).size).toBe(months);
        expect(total(entries)).toBe(11000);
        // Every month within a few cents of the same figure: each term puts its rounding in its first month.
        for (const e of entries) expect(Math.abs(e.Amount - monthly)).toBeLessThanOrEqual(0.1);
    });

    it('extension of a held product: 6 months recognized from the continuation date', () => {
        const entries = recognition('2027-04-30', { LatestTermEnd: day('2027-10-31'), LatestTermNumber: 1 });
        expect(entries.map((e) => e.Month)).toEqual(['2027-11', '2027-12', '2028-01', '2028-02', '2028-03', '2028-04']);
        expect(total(entries)).toBe(11000);
    });
});
