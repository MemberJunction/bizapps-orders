/**
 * EarnedThrough — "how much of this line is earned as at date X?" (D92 §8).
 *
 * This is what replaces forward-dated staging: instead of the ledger holding twelve future entries
 * written at booking, `Orders.PostDueRecognition` asks each driver this question on the 1st and
 * books the difference against the line's `RecognizedToDate`. So the property that matters is not
 * any single month's number — it is that the answer NEVER GOES BACKWARDS as the date advances and
 * lands exactly on the line amount, because the cumulative-delta arithmetic on top of it would
 * otherwise post a negative catch-up nobody asked for, or strand a cent forever.
 *
 * Dates are built with the local-midnight constructor throughout, which is what the drivers
 * themselves produce — `new Date('2026-01-01')` is UTC midnight and lands on the previous day west
 * of Greenwich, which is precisely the slip `dayKey` exists to stop.
 */
import { describe, expect, it } from 'vitest';
import {
    AllBackEndDriver,
    EvenOverTimeDriver,
    RevenueRecognitionDriver,
    UpFrontDriver,
    type RevRecContext,
} from '../RevenueRecognition.js';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

/** A full year of service, booked the day it starts — the ordinary subscription. */
const YEAR: RevRecContext = {
    Amount: 1200.01,
    BookingDate: day(2026, 1, 1),
    ServicePeriodStart: day(2026, 1, 1),
    ServicePeriodEnd: day(2026, 12, 31),
};

describe('UpFrontDriver.EarnedThrough', () => {
    const driver = new UpFrontDriver();
    const context: RevRecContext = { Amount: 499.99, BookingDate: day(2026, 3, 15) };

    it('is nothing the day before booking and the whole amount from the booking day on', () => {
        expect(driver.EarnedThrough(context, day(2026, 3, 14))).toBe(0);
        expect(driver.EarnedThrough(context, day(2026, 3, 15))).toBe(499.99);
        expect(driver.EarnedThrough(context, day(2030, 1, 1))).toBe(499.99);
    });
});

describe('EvenOverTimeDriver.EarnedThrough', () => {
    const driver = new EvenOverTimeDriver();

    it('accumulates one slice a month, the odd cent landing in the first', () => {
        expect(driver.EarnedThrough(YEAR, day(2025, 12, 31))).toBe(0);
        expect(driver.EarnedThrough(YEAR, day(2026, 1, 1))).toBe(100.01);
        expect(driver.EarnedThrough(YEAR, day(2026, 1, 31))).toBe(100.01);
        expect(driver.EarnedThrough(YEAR, day(2026, 2, 1))).toBe(200.01);
        expect(driver.EarnedThrough(YEAR, day(2026, 6, 30))).toBe(600.01);
        expect(driver.EarnedThrough(YEAR, day(2026, 12, 1))).toBe(1200.01);
    });

    it('answers by DAY, so a time of day cannot pull a period forward or push it back', () => {
        const lastMomentOfJan = new Date(2026, 0, 31, 23, 59, 59, 999);
        const firstMomentOfFeb = new Date(2026, 1, 1, 0, 0, 0, 0);
        expect(driver.EarnedThrough(YEAR, lastMomentOfJan)).toBe(100.01);
        expect(driver.EarnedThrough(YEAR, firstMomentOfFeb)).toBe(200.01);
    });

    it('follows the cadence rather than assuming months — quarterly gives four slices', () => {
        const quarterly: RevRecContext = { ...YEAR, Amount: 1200, PeriodMonths: 3 };
        expect(driver.EarnedThrough(quarterly, day(2026, 2, 28))).toBe(300);
        expect(driver.EarnedThrough(quarterly, day(2026, 4, 1))).toBe(600);
        expect(driver.EarnedThrough(quarterly, day(2026, 12, 31))).toBe(1200);
    });
});

describe('AllBackEndDriver.EarnedThrough', () => {
    const driver = new AllBackEndDriver();

    it('earns nothing until the event happens, then all of it', () => {
        expect(driver.EarnedThrough(YEAR, day(2026, 12, 30))).toBe(0);
        expect(driver.EarnedThrough(YEAR, day(2026, 12, 31))).toBe(1200.01);
        expect(driver.EarnedThrough(YEAR, day(2027, 1, 1))).toBe(1200.01);
    });
});

describe('the contract every driver owes PostDueRecognition', () => {
    const cases: Array<[string, RevenueRecognitionDriver]> = [
        ['UpFront', new UpFrontDriver()],
        ['EvenOverTime', new EvenOverTimeDriver()],
        ['AllBackEnd', new AllBackEndDriver()],
    ];

    it.each(cases)('%s never goes backwards and lands exactly on the line amount', (_name, driver) => {
        let previous = 0;
        for (let month = 1; month <= 13; month++) {
            const earned = driver.EarnedThrough(YEAR, day(2026, month > 12 ? 12 : month, month > 12 ? 31 : 1));
            expect(earned).toBeGreaterThanOrEqual(previous);
            previous = earned;
        }
        expect(driver.EarnedThrough(YEAR, day(2027, 6, 1))).toBe(YEAR.Amount);
    });

    it.each(cases)('%s refuses an unusable asOf rather than booking against NaN', (_name, driver) => {
        expect(() => driver.EarnedThrough(YEAR, new Date('not a date'))).toThrow(/real date/);
    });
});
