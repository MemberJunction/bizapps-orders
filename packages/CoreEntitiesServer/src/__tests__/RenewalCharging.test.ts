/**
 * The rules of the renewal charge pass (#289), with no database and no gateway: which day is a charge
 * day, when retries stop, the idempotency keys, how an off-session answer is read (SCA included), and
 * which day the payment is dated.
 *
 * The pass itself — selection, the intent, the capture and the events against a real database — is
 * the `subscription-renewal` integration bundle (SR31 onwards).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import {
    ClassifyRenewalCharge,
    DecideRenewalCharge,
    NextRenewalChargeDay,
    RenewalCaptureDay,
    RenewalCaptureIdempotencyKey,
    RenewalChargeDays,
    RenewalChargeIdempotencyKey,
    type RenewalChargeFacts,
} from '../RenewalCharging.js';
import { OrdersSettings } from '../OrdersSettings.js';
import { DaysBetween } from '../InvoiceBehavior.js';

const DUE = '2027-01-01';
const day = (offset: number): string => {
    const d = new Date(`${DUE}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
};

/** The defaults: retries on days 3, 7 and 11, access cut off at 14 days past due. */
const facts = (over: Partial<RenewalChargeFacts> = {}): RenewalChargeFacts => ({
    AsOfDay: DUE,
    DueDay: DUE,
    RetryDays: [3, 7, 11],
    CutoffDaysPastDue: 14,
    AttemptDays: [],
    InFlight: false,
    SettledUncapturedIntentID: null,
    ...over,
});

describe('RenewalChargeDays', () => {
    it('is the due day followed by each retry day, ascending and without repeats', () => {
        expect(RenewalChargeDays([3, 7, 11])).toEqual([0, 3, 7, 11]);
        expect(RenewalChargeDays([11, 3, 3, 7])).toEqual([0, 3, 7, 11]);
    });

    it('is the due day alone when there are no retries, and ignores days that are not whole and positive', () => {
        expect(RenewalChargeDays([])).toEqual([0]);
        expect(RenewalChargeDays([0, -2, 2.5, 4])).toEqual([0, 4]);
    });
});

describe('DaysBetween', () => {
    it('counts whole calendar days across a year end', () => {
        expect(DaysBetween('2026-12-30', '2027-01-02')).toBe(3);
        expect(DaysBetween('2027-01-02', '2026-12-30')).toBe(-3);
    });
});

describe('DecideRenewalCharge — which days are charge days', () => {
    it('charges on the due day as attempt 1, and names day 3 as the next attempt', () => {
        expect(DecideRenewalCharge(facts())).toEqual({ Action: 'Charge', Attempt: 1, NextAttemptDay: day(3) });
    });

    it('charges on retry days 3, 7 and 11 as attempts 2, 3 and 4', () => {
        expect(DecideRenewalCharge(facts({ AsOfDay: day(3) }))).toEqual({ Action: 'Charge', Attempt: 2, NextAttemptDay: day(7) });
        expect(DecideRenewalCharge(facts({ AsOfDay: day(7) }))).toEqual({ Action: 'Charge', Attempt: 3, NextAttemptDay: day(11) });
        expect(DecideRenewalCharge(facts({ AsOfDay: day(11) }))).toEqual({ Action: 'Charge', Attempt: 4, NextAttemptDay: null });
    });

    it('does not charge between charge days, and says when the next one is', () => {
        for (const offset of [1, 2, 4, 5, 6, 8, 9, 10]) {
            const decision = DecideRenewalCharge(facts({ AsOfDay: day(offset) }));
            expect(decision.Action, `day ${offset}`).toBe('Skip');
        }
        const decision = DecideRenewalCharge(facts({ AsOfDay: day(5) }));
        expect(decision).toEqual({ Action: 'Skip', Reason: `not a charge day; the next attempt is on ${day(7)}` });
    });

    it('does not charge before the due day', () => {
        expect(DecideRenewalCharge(facts({ AsOfDay: day(-1) }))).toEqual({ Action: 'Skip', Reason: `not due until ${DUE}` });
    });

    it('follows the configured retry days', () => {
        expect(DecideRenewalCharge(facts({ RetryDays: [2, 5], AsOfDay: day(5) }))).toEqual({ Action: 'Charge', Attempt: 3, NextAttemptDay: null });
        expect(DecideRenewalCharge(facts({ RetryDays: [2, 5], AsOfDay: day(3) })).Action).toBe('Skip');
    });
});

describe('DecideRenewalCharge — when retries stop', () => {
    it('stops after the last retry day', () => {
        for (const offset of [12, 13]) {
            expect(DecideRenewalCharge(facts({ AsOfDay: day(offset) }))).toEqual({ Action: 'Skip', Reason: 'the last retry day has passed' });
        }
    });

    it('stops at the access cutoff: on the day access is suspended nothing is charged', () => {
        const decision = DecideRenewalCharge(facts({ AsOfDay: day(14) }));
        expect(decision.Action).toBe('Skip');
        expect(decision.Action === 'Skip' && decision.Reason).toMatch(/access cutoff of 14; retries stop at suspension/);
    });

    it('drops retry days on or past a shorter cutoff, and reports no next attempt before it', () => {
        // Cutoff 7: day 7 is the day access goes, so the retries on 7 and 11 never happen.
        expect(DecideRenewalCharge(facts({ CutoffDaysPastDue: 7, AsOfDay: day(3) }))).toEqual({ Action: 'Charge', Attempt: 2, NextAttemptDay: null });
        expect(DecideRenewalCharge(facts({ CutoffDaysPastDue: 7, AsOfDay: day(7) })).Action).toBe('Skip');
        expect(DecideRenewalCharge(facts({ CutoffDaysPastDue: 7, AsOfDay: day(11) })).Action).toBe('Skip');
    });

    it('with the cutoff off, still stops after the last retry day', () => {
        expect(DecideRenewalCharge(facts({ CutoffDaysPastDue: null, AsOfDay: day(11) }))).toEqual({ Action: 'Charge', Attempt: 4, NextAttemptDay: null });
        expect(DecideRenewalCharge(facts({ CutoffDaysPastDue: null, AsOfDay: day(30) }))).toEqual({ Action: 'Skip', Reason: 'the last retry day has passed' });
    });

    it('NextRenewalChargeDay is null when the only later day is at the cutoff', () => {
        expect(NextRenewalChargeDay(DUE, 3, [0, 3, 7], 7)).toBeNull();
        expect(NextRenewalChargeDay(DUE, 3, [0, 3, 7], 8)).toBe(day(7));
    });
});

describe('DecideRenewalCharge — never twice', () => {
    it('does not attempt a day it already attempted', () => {
        expect(DecideRenewalCharge(facts({ AttemptDays: [DUE] }))).toEqual({ Action: 'Skip', Reason: `already attempted on ${DUE}` });
    });

    it('an attempt on an earlier day does not block the next retry day', () => {
        expect(DecideRenewalCharge(facts({ AsOfDay: day(3), AttemptDays: [DUE] }))).toEqual({ Action: 'Charge', Attempt: 2, NextAttemptDay: day(7) });
    });

    it('holds off while an earlier charge is still processing', () => {
        expect(DecideRenewalCharge(facts({ InFlight: true }))).toEqual({ Action: 'Skip', Reason: 'an earlier charge is still processing at the gateway' });
    });

    it('books money already taken before anything else, on any day, even past the cutoff', () => {
        for (const offset of [0, 5, 20]) {
            expect(DecideRenewalCharge(facts({ AsOfDay: day(offset), SettledUncapturedIntentID: 'intent-1', AttemptDays: [day(offset)] }))).toEqual({
                Action: 'Capture',
                PaymentIntentID: 'intent-1',
            });
        }
    });
});

describe('idempotency keys', () => {
    const ORDER = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';

    it('the gateway key is one per order per attempt day, whatever case the id comes in', () => {
        expect(RenewalChargeIdempotencyKey(ORDER, DUE)).toBe(RenewalChargeIdempotencyKey(ORDER.toLowerCase(), DUE));
        expect(RenewalChargeIdempotencyKey(ORDER, DUE)).not.toBe(RenewalChargeIdempotencyKey(ORDER, day(3)));
        expect(RenewalChargeIdempotencyKey(ORDER, DUE)).not.toBe(RenewalChargeIdempotencyKey('11111111-2222-4333-8444-555555555555', DUE));
    });

    it('the capture key is one per intent', () => {
        expect(RenewalCaptureIdempotencyKey('INTENT-1')).toBe(RenewalCaptureIdempotencyKey('intent-1'));
        expect(RenewalCaptureIdempotencyKey('intent-1')).not.toBe(RenewalCaptureIdempotencyKey('intent-2'));
    });
});

describe('ClassifyRenewalCharge — reading an off-session answer', () => {
    it('a succeeded intent is a success', () => {
        expect(ClassifyRenewalCharge({ Success: true, Status: 'Succeeded', PaymentIntentID: 'i' })).toBe('Succeeded');
    });

    it('a decline that recorded an intent is a decline', () => {
        expect(ClassifyRenewalCharge({ Success: false, Status: 'Failed', PaymentIntentID: 'i' })).toBe('Declined');
    });

    it('an SCA demand is a failure, whether it came back as an error or as an intent waiting on the customer', () => {
        expect(ClassifyRenewalCharge({ Success: false, Status: 'Failed', PaymentIntentID: 'i', RequiresAuthentication: true })).toBe('AuthenticationRequired');
        expect(ClassifyRenewalCharge({ Success: true, Status: 'RequiresPayment', PaymentIntentID: 'i', RequiresAuthentication: true })).toBe('AuthenticationRequired');
    });

    it('an intent still waiting for payment after an off-session confirm was not paid', () => {
        expect(ClassifyRenewalCharge({ Success: true, Status: 'RequiresPayment', PaymentIntentID: 'i' })).toBe('Declined');
    });

    it('a processing intent is in flight, and a refusal with no intent never reached the card', () => {
        expect(ClassifyRenewalCharge({ Success: true, Status: 'Processing', PaymentIntentID: 'i' })).toBe('InFlight');
        expect(ClassifyRenewalCharge({ Success: false })).toBe('NotOpened');
    });
});

describe('RenewalCaptureDay — the gateway day in business time', () => {
    const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
    const saved = { rows: engine._configurations, loaded: engine._loaded };

    beforeEach(() => {
        engine._configurations = [
            {
                FeatureKey: 'BizApps.BusinessTimeZone',
                Value: '{"iana":"America/Chicago","sql":"Central Standard Time"}',
                DefaultValue: '{"iana":"UTC","sql":"UTC"}',
            } as InstanceConfigurationRow,
        ];
        engine._loaded = true;
    });
    afterEach(() => {
        engine._configurations = saved.rows;
        engine._loaded = saved.loaded;
    });

    it('dates a charge taken at 03:15 UTC on the business day it still is in Chicago', () => {
        expect(RenewalCaptureDay(new Date('2027-01-04T03:15:00Z'), '2027-01-04')).toBe('2027-01-03');
    });

    it('is the gateway day, not the run day, when the two differ', () => {
        expect(RenewalCaptureDay(new Date('2027-01-05T18:00:00Z'), '2027-01-04')).toBe('2027-01-05');
        expect(RenewalCaptureDay('2027-01-05T18:00:00Z', '2027-01-04')).toBe('2027-01-05');
    });

    it('falls back to the given day when the gateway gave no time', () => {
        expect(RenewalCaptureDay(undefined, '2027-01-04')).toBe('2027-01-04');
        expect(RenewalCaptureDay(null, '2027-01-04')).toBe('2027-01-04');
        expect(RenewalCaptureDay('not a date', '2027-01-04')).toBe('2027-01-04');
    });
});

describe('OrdersSettings.RenewalChargeRetryDays', () => {
    afterEach(() => OrdersSettings.SetOverride('RenewalChargeRetryDays', undefined));

    it('reads a comma-separated list, sorted and without repeats', () => {
        OrdersSettings.SetOverride('RenewalChargeRetryDays', ' 7, 3,3 ,11');
        expect(OrdersSettings.RenewalChargeRetryDays).toEqual([3, 7, 11]);
    });

    it('an empty value means no retries', () => {
        OrdersSettings.SetOverride('RenewalChargeRetryDays', '');
        expect(OrdersSettings.RenewalChargeRetryDays).toEqual([]);
    });

    it('any unreadable entry takes the default for the whole list', () => {
        for (const raw of ['3,seven,11', '0,3', '-1', '2.5']) {
            OrdersSettings.SetOverride('RenewalChargeRetryDays', raw);
            expect(OrdersSettings.RenewalChargeRetryDays, raw).toEqual([3, 7, 11]);
        }
    });
});

describe('DecideRenewalCharge — orders a person must look at', () => {
    it('holds an order whose earlier charge had an unknown outcome, on every day, ahead of a capture', () => {
        const HoldReason = 'the outcome of the charge on 2027-01-01 is unknown';
        for (const offset of [0, 3, 7]) {
            expect(DecideRenewalCharge(facts({ AsOfDay: day(offset), HoldReason }))).toEqual({ Action: 'Hold', Reason: HoldReason });
        }
        expect(DecideRenewalCharge(facts({ HoldReason, SettledUncapturedIntentID: 'intent-1' }))).toEqual({ Action: 'Hold', Reason: HoldReason });
    });

    it('skips a charge day while a checkout session on the order holds a payment in progress', () => {
        expect(DecideRenewalCharge(facts({ AsOfDay: day(3), CheckoutOpen: true }))).toEqual({
            Action: 'Skip',
            Reason: 'a checkout session on the order holds a payment in progress',
        });
    });

    it('still books money already taken while a checkout session is open', () => {
        expect(DecideRenewalCharge(facts({ CheckoutOpen: true, SettledUncapturedIntentID: 'intent-1' }))).toEqual({ Action: 'Capture', PaymentIntentID: 'intent-1' });
    });
});

describe('DecideRenewalCharge — an order selected only for money already taken', () => {
    it('is captured past the last retry day and past the cutoff', () => {
        for (const offset of [12, 20, 60]) {
            expect(DecideRenewalCharge(facts({ AsOfDay: day(offset), CaptureOnly: true, SettledUncapturedIntentID: 'intent-1' }))).toEqual({
                Action: 'Capture',
                PaymentIntentID: 'intent-1',
            });
        }
    });

    it('is never charged, even on a charge day: automatic renewal is off or the card inactive', () => {
        expect(DecideRenewalCharge(facts({ AsOfDay: day(3), CaptureOnly: true }))).toEqual({
            Action: 'Skip',
            Reason: 'outside the charge window, or automatic renewal is off or the card inactive; only money already taken is booked',
        });
    });
});
