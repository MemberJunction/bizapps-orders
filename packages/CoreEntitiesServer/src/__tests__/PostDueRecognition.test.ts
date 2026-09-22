/**
 * The recognition pass's arithmetic, as a replay (D92 §8).
 *
 * `Orders.PostDueRecognition` is mostly reads, a transaction and a draft handed to accounting — all
 * of which the integration bundle exercises against a real database. What is worth pinning here is
 * the one piece of reasoning it owns: the cumulative subtraction, driven month by month off the same
 * drivers booking used. The properties below are the ones the operation's callers depend on and that
 * no single month's number would reveal.
 */
import { describe, expect, it } from 'vitest';
import {
    AllBackEndDriver,
    EvenOverTimeDriver,
    RevenueRecognitionDriver,
    type RevRecContext,
} from '../RevenueRecognition.js';

const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

/**
 * Run the pass over a sequence of dates, exactly as `InternalExecute` does: ask the driver what is
 * earned through the date, subtract what the line has already recognised, post the difference, and
 * advance the total by it. Returns the amount posted at each date — 0 meaning "no entry written".
 */
function replay(driver: RevenueRecognitionDriver, context: RevRecContext, dates: Date[]): number[] {
    let recognized = 0;
    return dates.map((asOf) => {
        const delta = money(driver.EarnedThrough(context, asOf) - recognized);
        recognized = money(recognized + delta);
        return delta;
    });
}

/** A year of service on an odd amount, so the rounding remainder has somewhere to go wrong. */
const YEAR: RevRecContext = {
    Amount: 1200.01,
    BookingDate: day(2026, 1, 1),
    ServicePeriodStart: day(2026, 1, 1),
    ServicePeriodEnd: day(2026, 12, 31),
};

/** Month ends, which is what the scheduled job passes: the period being closed, not the run date. */
const MONTH_ENDS = [
    day(2026, 1, 31), day(2026, 2, 28), day(2026, 3, 31), day(2026, 4, 30),
    day(2026, 5, 31), day(2026, 6, 30), day(2026, 7, 31), day(2026, 8, 31),
    day(2026, 9, 30), day(2026, 10, 31), day(2026, 11, 30), day(2026, 12, 31),
];

describe('the monthly pass over a straight-line subscription', () => {
    const driver = new EvenOverTimeDriver();

    it('posts one slice a month and sums exactly to the line, odd cent included', () => {
        const posted = replay(driver, YEAR, MONTH_ENDS);
        expect(posted).toEqual([100.01, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
        expect(money(posted.reduce((s, p) => s + p, 0))).toBe(1200.01);
    });

    it('posts the same amounts the booking-time staging produced, month for month', () => {
        // The point of the whole change: WHEN the entry is written moves, WHAT it says does not.
        const staged = driver.BuildSchedule(YEAR).Entries.map((e) => e.Amount);
        expect(replay(driver, YEAR, MONTH_ENDS)).toEqual(staged);
    });

    it('running twice for the same date posts nothing the second time', () => {
        const twice = replay(driver, YEAR, [day(2026, 3, 31), day(2026, 3, 31)]);
        expect(twice[0]).toBe(300.01);
        expect(twice[1]).toBe(0);
    });

    it('a first run against a back-dated term catches everything up in ONE pass', () => {
        // The case a per-period design needs a loop for, and the reason the pass is cumulative: a
        // term booked last year, or a month the job did not run, is one subtraction either way.
        expect(replay(driver, YEAR, [day(2026, 12, 31)])).toEqual([1200.01]);
        expect(replay(driver, YEAR, [day(2026, 4, 30), day(2026, 9, 30)])).toEqual([400.01, 500]);
    });

    it('recognises nothing before the service period opens', () => {
        expect(replay(driver, YEAR, [day(2025, 12, 31), day(2026, 1, 31)])).toEqual([0, 100.01]);
    });
});

describe('the monthly pass over an event', () => {
    const driver = new AllBackEndDriver();

    it('holds everything in deferred until the event, then recognises it whole', () => {
        const posted = replay(driver, YEAR, MONTH_ENDS);
        expect(posted.slice(0, 11)).toEqual(new Array(11).fill(0));
        expect(posted[11]).toBe(1200.01);
    });
});

describe('a quarterly cadence', () => {
    const driver = new EvenOverTimeDriver();
    const quarterly: RevRecContext = { ...YEAR, Amount: 1200, PeriodMonths: 3 };

    it('posts on the four quarter starts and nothing in the months between', () => {
        const posted = replay(driver, quarterly, MONTH_ENDS);
        expect(posted).toEqual([300, 0, 0, 300, 0, 0, 300, 0, 0, 300, 0, 0]);
        expect(money(posted.reduce((s, p) => s + p, 0))).toBe(1200);
    });
});
