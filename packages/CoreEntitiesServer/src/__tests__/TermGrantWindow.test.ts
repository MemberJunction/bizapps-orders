/**
 * A term's days are business days, each covered in full (access sync G5).
 *
 * Jane's term runs 1 Jan → 31 Dec 2026. Read as a bare `date`, 31 Dec is 2026-12-31T00:00Z: 6 pm Central
 * on 30 Dec. A gateway that charges her renewal at 00:00 Central on 31 Dec (E2's anchor) then charged
 * somebody who had already been locked out for six hours. Here the window, the evaluator and the cancel
 * all read the same instant: 00:00 business time on the day after the last day.
 */
import { describe, expect, it } from 'vitest';
import { TermDayEnd, TermDayStart, TermGrantWindow } from '../TermGrantWindow.js';
import { EvaluateGrantAccess, ResolveValidityWindow, type GrantAccessFacts } from '../EntitlementBehavior.js';
import { ShiftedGrantStart } from '../TermShift.js';

const CHICAGO = 'America/Chicago';
const iso = (d: Date) => d.toISOString();

describe('TermGrantWindow: a term covers each of its days in full, in the business zone', () => {
    it('Chicago, winter: 00:00 Central = 06:00Z at both ends', () => {
        const w = TermGrantWindow('2026-01-01', '2026-12-31', CHICAGO);
        expect(iso(w.ValidFrom)).toBe('2026-01-01T06:00:00.000Z');
        expect(iso(w.ValidTo)).toBe('2027-01-01T06:00:00.000Z');
    });

    it('Chicago, summer (CDT): 00:00 Central = 05:00Z', () => {
        expect(iso(TermDayEnd('2026-07-14', CHICAGO))).toBe('2026-07-15T05:00:00.000Z');
    });

    it('Chicago across spring-forward: the last day 14 Mar 2027 is CST, the next day starts in CDT', () => {
        // 14 Mar 2027 is the DST change; 00:00 that day is still CST (06:00Z); 00:00 on 15 Mar is CDT (05:00Z).
        expect(iso(TermDayStart('2027-03-14', CHICAGO))).toBe('2027-03-14T06:00:00.000Z');
        expect(iso(TermDayEnd('2027-03-14', CHICAGO))).toBe('2027-03-15T05:00:00.000Z');
    });

    it('Chicago across fall-back: 00:00 on 7 Nov 2027 (the change day) is CDT, the next day CST', () => {
        expect(iso(TermDayEnd('2027-11-06', CHICAGO))).toBe('2027-11-07T05:00:00.000Z');
        expect(iso(TermDayEnd('2027-11-07', CHICAGO))).toBe('2027-11-08T06:00:00.000Z');
    });

    it('Chicago on go-live weekend (DST ends 1 Nov 2026): a last day of 31 Oct ends in CDT, of 1 Nov in CST', () => {
        expect(iso(TermDayEnd('2026-10-31', CHICAGO))).toBe('2026-11-01T05:00:00.000Z');
        expect(iso(TermDayEnd('2026-11-01', CHICAGO))).toBe('2026-11-02T06:00:00.000Z');
        // And the evaluator agrees to the minute on each side of each end.
        const ctx = { Status: 'Active', StartDate: new Date('2025-11-01T00:00:00Z'), EndDate: new Date('2026-10-31T00:00:00Z') };
        const w = ResolveValidityWindow('SubscriptionTerm', { GrantedOn: ctx.StartDate, TermStartDate: ctx.StartDate, TermEndDate: ctx.EndDate, BusinessZone: CHICAGO });
        const g: GrantAccessFacts = { Status: 'Active', ValidFrom: w.ValidFrom, ValidTo: w.ValidTo, LinkedToSubscription: true, LinkedToTerm: true };
        const active = { Status: 'Active', EndDate: null };
        expect(EvaluateGrantAccess(g, new Date('2026-11-01T04:59:00Z'), active, ctx, CHICAGO).HasAccess).toBe(true);
        expect(EvaluateGrantAccess(g, new Date('2026-11-01T05:01:00Z'), active, ctx, CHICAGO).HasAccess).toBe(false);
    });

    it('London: winter GMT, summer BST', () => {
        expect(iso(TermDayEnd('2026-12-31', 'Europe/London'))).toBe('2027-01-01T00:00:00.000Z');
        expect(iso(TermDayEnd('2027-06-30', 'Europe/London'))).toBe('2027-06-30T23:00:00.000Z');
    });

    it('Auckland: a business day starts the UTC day before', () => {
        expect(iso(TermDayStart('2026-12-31', 'Pacific/Auckland'))).toBe('2026-12-30T11:00:00.000Z');
        expect(iso(TermDayEnd('2026-12-31', 'Pacific/Auckland'))).toBe('2026-12-31T11:00:00.000Z');
    });

    it('UTC: the day after the last, at 00:00Z', () => {
        expect(iso(TermDayEnd('2026-12-31', 'UTC'))).toBe('2027-01-01T00:00:00.000Z');
    });

    it('accepts the day as a `date` column hands it back (a Date at 00:00 UTC) or as a string', () => {
        expect(iso(TermDayEnd(new Date('2026-12-31T00:00:00Z'), CHICAGO))).toBe('2027-01-01T06:00:00.000Z');
        expect(iso(TermDayEnd('2026-12-31T00:00:00.000Z', CHICAGO))).toBe('2027-01-01T06:00:00.000Z');
    });

    it('refuses a missing zone (no silent fallback to the machine\'s own) and a value that is not a day', () => {
        expect(() => TermDayEnd('2026-12-31', '')).toThrow(/business time zone is required/);
        expect(() => TermDayEnd('not a day', CHICAGO)).toThrow(/is not a day/);
    });
});

describe('the grant written at booking and the evaluator agree, to the minute (Chicago)', () => {
    const term = { Status: 'Active', StartDate: new Date('2026-01-01T00:00:00Z'), EndDate: new Date('2026-12-31T00:00:00Z') };
    const window = ResolveValidityWindow('SubscriptionTerm', {
        GrantedOn: new Date('2026-01-01T12:00:00Z'),
        TermStartDate: term.StartDate,
        TermEndDate: term.EndDate,
        BusinessZone: CHICAGO,
    });
    const grant: GrantAccessFacts = {
        Status: 'Active',
        ValidFrom: window.ValidFrom,
        ValidTo: window.ValidTo,
        LinkedToSubscription: true,
        LinkedToTerm: true,
    };
    const sub = { Status: 'Active', EndDate: null };

    it('23:59 Central on the last day (31 Dec): access', () => {
        const r = EvaluateGrantAccess(grant, new Date('2027-01-01T05:59:00Z'), sub, term, CHICAGO);
        expect(r.HasAccess).toBe(true);
    });

    it('6 pm Central on 30 Dec, where the old end fell: access (the last day is no longer cut short)', () => {
        const r = EvaluateGrantAccess(grant, new Date('2026-12-31T00:30:00Z'), sub, term, CHICAGO);
        expect(r.HasAccess).toBe(true);
    });

    it('00:01 Central on 1 Jan: no access', () => {
        const r = EvaluateGrantAccess(grant, new Date('2027-01-01T06:01:00Z'), sub, term, CHICAGO);
        expect(r.HasAccess).toBe(false);
    });

    it('a stored grant from before this change (ValidTo 00:00 UTC on the last day) still ends there: no backfill', () => {
        const old: GrantAccessFacts = { ...grant, ValidTo: new Date('2026-12-31T00:00:00Z') };
        expect(EvaluateGrantAccess(old, new Date('2026-12-31T00:30:00Z'), sub, term, CHICAGO).HasAccess).toBe(false);
    });

    it('a renewal grant written before this release (starts 00:00 UTC on 1 Jan) opens at 00:00 UTC, as it did: no 6-hour gap', () => {
        // Robert's case: an old grant's own ValidFrom is 00:00 UTC; the term bound must not hold it until 06:00Z.
        const old: GrantAccessFacts = { ...grant, ValidFrom: new Date('2026-01-01T00:00:00Z') };
        expect(EvaluateGrantAccess(old, new Date('2026-01-01T00:01:00Z'), sub, term, CHICAGO).HasAccess).toBe(true);
        expect(EvaluateGrantAccess(old, new Date('2025-12-31T23:59:00Z'), sub, term, CHICAGO).Decision).toBe('NotYetValid');
    });

    it('east of UTC (Auckland) the term opens at 00:00 NZDT, before 00:00 UTC: the earlier of the two bounds', () => {
        const nz = { ...term };
        const nzGrant: GrantAccessFacts = { ...grant, ValidFrom: new Date('2025-12-31T11:00:00Z'), ValidTo: new Date('2026-12-31T11:00:00Z') };
        expect(EvaluateGrantAccess(nzGrant, new Date('2025-12-31T11:01:00Z'), sub, nz, 'Pacific/Auckland').HasAccess).toBe(true);
        expect(EvaluateGrantAccess(nzGrant, new Date('2025-12-31T10:59:00Z'), sub, nz, 'Pacific/Auckland').Decision).toBe('NotYetValid');
    });

    it('23:59 Central on the term\'s first day before it started? No: 23:59 Central on 31 Dec 2025 is before the term', () => {
        const r = EvaluateGrantAccess(grant, new Date('2026-01-01T05:59:00Z'), sub, term, CHICAGO);
        expect(r.HasAccess).toBe(false);
        expect(r.Decision).toBe('NotYetValid');
    });
});

describe('a cancelled subscription: its access-through day is covered in full (Chicago)', () => {
    const grant: GrantAccessFacts = { Status: 'Active', ValidFrom: new Date('2026-01-01T06:00:00Z'), ValidTo: new Date('2027-01-01T06:00:00Z'), LinkedToSubscription: true };
    const canceled = { Status: 'Canceled', EndDate: new Date('2026-07-15T00:00:00Z') };

    it('23:59 Central on 15 Jul (access-through): access, reported as ending 00:00 Central on 16 Jul', () => {
        const r = EvaluateGrantAccess(grant, new Date('2026-07-16T04:59:00Z'), canceled, undefined, CHICAGO);
        expect(r.HasAccess).toBe(true);
        expect(iso(r.ValidTo!)).toBe('2026-07-16T05:00:00.000Z');
    });

    it('00:01 Central on 16 Jul: no access', () => {
        const r = EvaluateGrantAccess(grant, new Date('2026-07-16T05:01:00Z'), canceled, undefined, CHICAGO);
        expect(r.HasAccess).toBe(false);
        expect(r.Decision).toBe('SubscriptionInactive');
    });
});

describe('ShiftedGrantStart: a shifted term grant starts on the new start, read in the business zone', () => {
    it('east of UTC (Auckland), shifted 10 days earlier: a grant that started with the term moves with it', () => {
        // 00:00 NZDT on 1 Jan 2026 is 2025-12-31T11:00Z: on the term's start day in Auckland, the day before in UTC.
        const from = new Date('2025-12-31T11:00:00Z');
        expect(ShiftedGrantStart(from, '2026-01-01', '2025-12-22', 'Pacific/Auckland')!.toISOString()).toBe('2025-12-21T11:00:00.000Z');
    });

    it('a grant written before this release (00:00 UTC on the start day) is still read as starting with the term', () => {
        expect(ShiftedGrantStart(new Date('2026-01-01T00:00:00Z'), '2026-01-01', '2025-12-22', CHICAGO)!.toISOString()).toBe('2025-12-22T06:00:00.000Z');
    });

    it('a grant given on payment, after the term started, keeps its own start when the term moves earlier', () => {
        expect(ShiftedGrantStart(new Date('2026-01-05T15:00:00Z'), '2026-01-01', '2025-12-22', CHICAGO)).toBeNull();
    });

    it('moved later than a grant\'s own start: the grant starts on the new start', () => {
        expect(ShiftedGrantStart(new Date('2026-01-05T15:00:00Z'), '2026-01-01', '2026-01-20', CHICAGO)!.toISOString()).toBe('2026-01-20T06:00:00.000Z');
    });

    it('a grant with no start takes the new one', () => {
        expect(ShiftedGrantStart(null, '2026-01-01', '2026-01-20', CHICAGO)!.toISOString()).toBe('2026-01-20T06:00:00.000Z');
    });
});
