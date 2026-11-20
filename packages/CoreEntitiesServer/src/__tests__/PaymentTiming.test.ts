import { describe, expect, it } from 'vitest';
import {
    DescribePaymentTiming,
    IsNewSaleLine,
    IsSopSemiAnnualSchedule,
    PaymentTimingDeviations,
    PaymentTimingFactsOf,
    type PaymentTimingLine,
} from '../PaymentTiming.js';

const CONFIRM = '2026-07-01';
const newSale = (start: string | null = null): PaymentTimingLine => ({ Quantity: 1, ServicePeriodStart: start });
const renewal = (start: string): PaymentTimingLine => ({ Quantity: 1, RenewsSubscriptionID: 'sub', ServicePeriodStart: start });
const net30 = { Name: 'Net 30', NetDays: 30 };
const onReceipt = { Name: 'Due on receipt', NetDays: 0 };
const row = (DueDate: string, Amount: number, Status = 'Scheduled') => ({ DueDate, Amount, Status });

describe('IsNewSaleLine', () => {
    it('counts a line that renews nothing and leaves out renewals, components and reversals', () => {
        expect(IsNewSaleLine(newSale())).toBe(true);
        expect(IsNewSaleLine(renewal('2026-07-01'))).toBe(false);
        expect(IsNewSaleLine({ ParentOrderLineID: 'bundle' })).toBe(false);
        expect(IsNewSaleLine({ ReversesOrderLineID: 'origin' })).toBe(false);
        expect(IsNewSaleLine({ Quantity: -1 })).toBe(false);
    });
});

describe('PaymentTimingDeviations', () => {
    it('finds nothing on a new sale due on receipt that starts at confirm', () => {
        const facts = PaymentTimingFactsOf([newSale()], onReceipt, []);
        expect(PaymentTimingDeviations(facts, CONFIRM, 30)).toEqual([]);
    });

    it('finds nothing on an order with no new-sale line, whatever its terms', () => {
        const facts = PaymentTimingFactsOf([renewal('2027-01-01')], net30, [row('2027-03-01', 100)]);
        expect(PaymentTimingDeviations(facts, CONFIRM, 0)).toEqual([]);
    });

    it('flags Net terms on a new sale', () => {
        const facts = PaymentTimingFactsOf([newSale()], net30, []);
        const found = PaymentTimingDeviations(facts, CONFIRM, null);
        expect(found).toHaveLength(1);
        expect(found[0]).toContain('Net 30 (30 days)');
    });

    it('flags a start beyond the tolerance, and only when the tolerance is set', () => {
        const facts = PaymentTimingFactsOf([newSale('2027-01-01')], onReceipt, []);
        expect(PaymentTimingDeviations(facts, CONFIRM, null)).toEqual([]);
        expect(PaymentTimingDeviations(facts, CONFIRM, 30)[0]).toContain('starts 2027-01-01, more than 30 days after 2026-07-01');
    });

    it('accepts a start on the last day of the tolerance', () => {
        const facts = PaymentTimingFactsOf([newSale('2026-07-31')], onReceipt, []);
        expect(PaymentTimingDeviations(facts, CONFIRM, 30)).toEqual([]);
    });

    it('does not count a renewal line toward a delayed start', () => {
        const facts = PaymentTimingFactsOf([newSale(), renewal('2027-06-01')], onReceipt, []);
        expect(PaymentTimingDeviations(facts, CONFIRM, 0)).toEqual([]);
    });

    it('flags an instalment due after the earliest new-sale start', () => {
        const facts = PaymentTimingFactsOf([newSale('2026-08-01')], onReceipt, [row('2026-08-01', 600), row('2026-09-01', 600)]);
        const found = PaymentTimingDeviations(facts, CONFIRM, null);
        expect(found).toHaveLength(1);
        expect(found[0]).toContain('an instalment is due after the service starts on 2026-08-01 (2026-09-01 600.00)');
    });

    it('measures from the confirm day when a new-sale line states no start', () => {
        const facts = PaymentTimingFactsOf([newSale(), newSale('2026-12-01')], onReceipt, [row('2026-08-01', 100)]);
        expect(PaymentTimingDeviations(facts, CONFIRM, null)[0]).toContain('after the service starts on 2026-07-01');
    });

    it('ignores cancelled instalments', () => {
        const facts = PaymentTimingFactsOf([newSale()], onReceipt, [row('2026-07-01', 100), row('2026-12-01', 50, 'Canceled')]);
        expect(PaymentTimingDeviations(facts, CONFIRM, null)).toEqual([]);
    });

    it("allows the SOP's semi-annual shape on an order of the minimum or more", () => {
        const facts = PaymentTimingFactsOf([newSale('2026-07-01')], onReceipt, [row('2026-07-01', 60_000), row('2027-01-01', 60_000)]);
        expect(PaymentTimingDeviations(facts, CONFIRM, null)).toEqual([]);
    });

    it('reports every case it finds', () => {
        const facts = PaymentTimingFactsOf([newSale('2027-01-01')], net30, [row('2027-01-01', 50), row('2027-02-01', 50)]);
        expect(PaymentTimingDeviations(facts, CONFIRM, 30)).toHaveLength(3);
    });
});

describe('IsSopSemiAnnualSchedule', () => {
    const two = (first: string, second: string, each: number) => [
        { DueDate: first, Amount: each },
        { DueDate: second, Amount: each },
    ];

    it('needs the minimum gross', () => {
        expect(IsSopSemiAnnualSchedule(two('2026-07-01', '2027-01-01', 49_999.99), '2026-07-01')).toBe(false);
        expect(IsSopSemiAnnualSchedule(two('2026-07-01', '2027-01-01', 50_000), '2026-07-01')).toBe(true);
    });

    it('needs six months between equal instalments, the first due by the start', () => {
        expect(IsSopSemiAnnualSchedule(two('2026-07-01', '2026-12-01', 60_000), '2026-07-01')).toBe(false);
        expect(IsSopSemiAnnualSchedule(two('2026-08-01', '2027-02-01', 60_000), '2026-07-01')).toBe(false);
        expect(
            IsSopSemiAnnualSchedule(
                [
                    { DueDate: '2026-07-01', Amount: 70_000 },
                    { DueDate: '2027-01-01', Amount: 50_000 },
                ],
                '2026-07-01',
            ),
        ).toBe(false);
    });

    it('accepts the odd cent the split front-loads', () => {
        expect(
            IsSopSemiAnnualSchedule(
                [
                    { DueDate: '2026-07-01', Amount: 50_000.01 },
                    { DueDate: '2027-01-01', Amount: 50_000 },
                ],
                '2026-07-01',
            ),
        ).toBe(true);
    });
});

describe('DescribePaymentTiming', () => {
    it('is the same for the same facts in any order', () => {
        const a = PaymentTimingFactsOf([newSale('2027-01-01'), newSale()], net30, [row('2027-02-01', 50), row('2027-01-01', 50)]);
        const b = PaymentTimingFactsOf([newSale(), newSale('2027-01-01')], net30, [row('2027-01-01', 50), row('2027-02-01', 50)]);
        expect(DescribePaymentTiming(a)).toBe(DescribePaymentTiming(b));
        expect(DescribePaymentTiming(a)).toBe(
            'Service starts: at confirm, 2027-01-01. Payment terms: Net 30 (30 days). Instalments: 2027-01-01 50.00, 2027-02-01 50.00.',
        );
    });

    it('changes when the terms, a start or an instalment changes', () => {
        const base = DescribePaymentTiming(PaymentTimingFactsOf([newSale('2027-01-01')], net30, [row('2027-01-01', 50)]));
        expect(DescribePaymentTiming(PaymentTimingFactsOf([newSale('2027-01-01')], onReceipt, [row('2027-01-01', 50)]))).not.toBe(base);
        expect(DescribePaymentTiming(PaymentTimingFactsOf([newSale('2027-02-01')], net30, [row('2027-01-01', 50)]))).not.toBe(base);
        expect(DescribePaymentTiming(PaymentTimingFactsOf([newSale('2027-01-01')], net30, [row('2027-01-02', 50)]))).not.toBe(base);
    });
});
