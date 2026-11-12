/**
 * `ClassifyRenewal` decides what the Renewals page says about each row, with the renewal pass's own
 * rules. The cases here are the pass's WHERE clause, one branch at a time, plus the two states the
 * pass never sees (a renewal already booked, a draft already pending) and the lower bound that
 * keeps a lapsed term from being revived.
 */
import { describe, expect, it } from 'vitest';
import { AddDays, ClassifyRenewal, DaysBetweenDays, type RenewalFacts } from '../renewal-worklist';

const BASE: RenewalFacts = {
    Status: 'Active',
    AutoRenew: true,
    ProviderBilled: false,
    RenewalBooked: false,
    RenewalPending: false,
    TermEndDate: '2027-03-31',
    LeadDays: 90,
    AsOf: '2026-11-09',
};

describe('ClassifyRenewal', () => {
    it('schedules an auto-renewing term for the day its lead window opens', () => {
        expect(ClassifyRenewal(BASE)).toEqual({ State: 'Scheduled', AutoRenewOn: '2026-12-31' });
    });

    it('is due now once the as-of day is inside the lead window, and says the pass places it today', () => {
        expect(ClassifyRenewal({ ...BASE, AsOf: '2027-01-15' })).toEqual({ State: 'DueNow', AutoRenewOn: '2027-01-15' });
        expect(ClassifyRenewal({ ...BASE, AsOf: '2026-12-31' })).toEqual({ State: 'DueNow', AutoRenewOn: '2026-12-31' });
    });

    it('treats a zero lead as "place on the last day"', () => {
        expect(ClassifyRenewal({ ...BASE, LeadDays: 0 })).toEqual({ State: 'Scheduled', AutoRenewOn: '2027-03-31' });
        expect(ClassifyRenewal({ ...BASE, LeadDays: 0, AsOf: '2027-03-31' }).State).toBe('DueNow');
    });

    it('keeps the pass’s lower bound: a term that ended before yesterday is lapsed, yesterday is still due', () => {
        expect(ClassifyRenewal({ ...BASE, AsOf: '2027-04-01' }).State).toBe('DueNow');
        expect(ClassifyRenewal({ ...BASE, AsOf: '2027-04-02' }).State).toBe('Lapsed');
    });

    it('says a term with auto-renew off will simply end, whatever the dates', () => {
        expect(ClassifyRenewal({ ...BASE, AutoRenew: false })).toEqual({ State: 'WillEnd', AutoRenewOn: null });
        expect(ClassifyRenewal({ ...BASE, AutoRenew: false, AsOf: '2027-03-31' }).State).toBe('WillEnd');
    });

    it('says a term with auto-renew off has ended once its last day is past, not that it "will end"', () => {
        expect(ClassifyRenewal({ ...BASE, AutoRenew: false, AsOf: '2027-04-01' })).toEqual({ State: 'Ended', AutoRenewOn: null });
        expect(ClassifyRenewal({ ...BASE, AutoRenew: false, AsOf: '2027-06-01' }).State).toBe('Ended');
        // The pass's lower bound is about what the pass places; it does not make an ended term "lapsed".
        expect(ClassifyRenewal({ ...BASE, AutoRenew: false, AsOf: '2027-04-12' }).State).toBe('Ended');
    });

    it('never renews a subscription that is not Active or Trialing', () => {
        expect(ClassifyRenewal({ ...BASE, Status: 'Canceled' }).State).toBe('Inactive');
        expect(ClassifyRenewal({ ...BASE, Status: 'Paused' }).State).toBe('Inactive');
        expect(ClassifyRenewal({ ...BASE, Status: 'Trialing' }).State).toBe('Scheduled');
    });

    it('leaves a gateway-billed subscription to the gateway, even with auto-renew on and the window open', () => {
        expect(ClassifyRenewal({ ...BASE, ProviderBilled: true, AsOf: '2027-02-01' })).toEqual({ State: 'ProviderBilled', AutoRenewOn: null });
    });

    it('reports a booked renewal first, and a pending draft second, before any other rule', () => {
        expect(ClassifyRenewal({ ...BASE, RenewalBooked: true, Status: 'Canceled', ProviderBilled: true }).State).toBe('Renewed');
        expect(ClassifyRenewal({ ...BASE, RenewalPending: true, AutoRenew: false }).State).toBe('RenewalPending');
    });
});

describe('day arithmetic', () => {
    it('adds and subtracts calendar days across month and year ends', () => {
        expect(AddDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(AddDays('2027-03-01', -1)).toBe('2027-02-28');
        expect(AddDays('2027-03-31', -90)).toBe('2026-12-31');
    });

    it('counts whole days, negative when the target is earlier', () => {
        expect(DaysBetweenDays('2026-11-09', '2027-03-31')).toBe(142);
        expect(DaysBetweenDays('2026-11-09', '2026-11-08')).toBe(-1);
        expect(DaysBetweenDays('2026-11-09', '2026-11-09')).toBe(0);
    });
});
