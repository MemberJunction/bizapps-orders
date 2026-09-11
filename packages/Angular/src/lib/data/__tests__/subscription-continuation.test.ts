import { describe, expect, it } from 'vitest';
import { ContinuationStartFrom } from '../orders-queries';

/** `yyyy-MM-dd` in UTC, so a wrong-zone read shows up as the wrong day rather than passing. */
const iso = (value: Date | null): string | null => (value ? value.toISOString().slice(0, 10) : null);

describe('ContinuationStartFrom', () => {
    it('continues live coverage the day after it ends', () => {
        const start = ContinuationStartFrom({ Status: 'Active', LatestTermEnd: new Date('2027-06-30T00:00:00Z') });
        expect(iso(start)).toBe('2027-07-01');
    });

    it('treats a trialing subscription as live coverage', () => {
        // Trialing is coverage that has begun — the same rule the server applies in `ComputeAction`.
        const start = ContinuationStartFrom({ Status: 'Trialing', LatestTermEnd: new Date('2026-08-31T00:00:00Z') });
        expect(iso(start)).toBe('2026-09-01');
    });

    it('rolls over a month and a year end', () => {
        expect(iso(ContinuationStartFrom({ Status: 'Active', LatestTermEnd: new Date('2026-12-31T00:00:00Z') }))).toBe(
            '2027-01-01',
        );
        expect(iso(ContinuationStartFrom({ Status: 'Active', LatestTermEnd: new Date('2028-02-29T00:00:00Z') }))).toBe(
            '2028-03-01',
        );
    });

    it('dictates nothing for a subscription that is not live', () => {
        // A lapsed target REACTIVATES rather than extends, and reactivation has no coverage to
        // continue from — so the server honors a stated start and the field must stay editable.
        expect(ContinuationStartFrom({ Status: 'Canceled', LatestTermEnd: new Date('2026-06-30T00:00:00Z') })).toBeNull();
        expect(ContinuationStartFrom({ Status: 'Paused', LatestTermEnd: new Date('2026-06-30T00:00:00Z') })).toBeNull();
    });

    it('dictates nothing for a live subscription with no terms yet', () => {
        // An extension with no prior term end falls through to the ordinary start rules, which
        // honor a stated date.
        expect(ContinuationStartFrom({ Status: 'Active', LatestTermEnd: null })).toBeNull();
    });

    it('dictates nothing when there is no subscription to read', () => {
        expect(ContinuationStartFrom(null)).toBeNull();
    });

    it('returns UTC midnight, so the date survives comparison against the settled term', () => {
        // A SQL `date` round-trips as UTC midnight, and the server normalizes every term boundary
        // through `utcDay`. A continuation date carrying a local offset would render a day early
        // west of Greenwich and would not compare equal to the term the engine computes — which is
        // what `StartOverrideIgnored` now tests for. Asserted on the components rather than by
        // moving the process time zone, so it holds wherever the suite runs.
        const start = ContinuationStartFrom({ Status: 'Active', LatestTermEnd: new Date('2027-06-30T00:00:00Z') })!;
        expect(start.getUTCFullYear()).toBe(2027);
        expect(start.getUTCMonth()).toBe(6); // July, zero-based
        expect(start.getUTCDate()).toBe(1);
        expect(start.getUTCHours()).toBe(0);
        expect(start.getUTCMinutes()).toBe(0);
    });

    it('dictates nothing for an unparseable term end', () => {
        expect(ContinuationStartFrom({ Status: 'Active', LatestTermEnd: new Date('nonsense') })).toBeNull();
    });
});
