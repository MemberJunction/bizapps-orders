/**
 * Access sync in Orders, grant side:
 *  - A1: `GrantChangedFields` decides when a save is news (status or validity dates, compared as instants).
 *  - G7: a cancel whose access ends later writes that end onto its standing grants, so a copy of access that
 *    follows the grant (the Learning Hub) ends on the same day Orders does.
 *
 * Jane's SUB-000110, Chicago, term 1 Jan → 31 Dec 2026; her grant ends 2027-01-01T06:00Z (00:00 Central
 * after the last day). A grant written before G5 ends at 2026-12-31T00:00Z (6 pm Central on 30 Dec).
 *
 * The cancel matrix chains the real `DecideCancellation` (the policy the operation runs) into
 * `RevokeGrantsForCanceledSubscription`, with the request day taken in the business zone as the operation
 * takes it, and reads the result back through `EvaluateGrantAccess`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';

const mocks = vi.hoisted(() => ({ rows: [] as Array<{ ID: string; Status: string; ValidityModeApplied: string }> }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = vi.fn().mockImplementation(() => Promise.resolve({ Success: true, Results: mocks.rows }));
        },
    };
});

import { CalendarDayIn } from '@mj-biz-apps/common-entities';
import { GrantChangedFields } from '../EntitlementGrantEntityServer.js';
import { RevokeGrantsForCanceledSubscription } from '../EntitlementEngine.js';
import { EvaluateGrantAccess } from '../EntitlementBehavior.js';
import { SubscriptionBehavior, type CancellationTiming, type SubscriptionTypeRules } from '../SubscriptionBehavior.js';

const SUB = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const user = { ID: 'support' } as unknown as UserInfo;

describe('GrantChangedFields (A1): when a grant save is news', () => {
    const at = (s: string) => new Date(s);
    const base = { Status: 'Active', ValidFrom: at('2026-01-01T06:00:00Z'), ValidTo: at('2027-01-01T06:00:00Z') };

    it('nothing changed (a reload hands back an equal Date): nothing to tell', () => {
        expect(GrantChangedFields(base, { ...base, ValidFrom: at('2026-01-01T06:00:00Z'), ValidTo: at('2027-01-01T06:00:00Z') })).toEqual([]);
    });

    it('a Duration concession moves only the end: ValidTo', () => {
        expect(GrantChangedFields(base, { ...base, ValidTo: at('2027-01-31T06:00:00Z') })).toEqual(['ValidTo']);
    });

    it('a term shift moves both dates: ValidFrom and ValidTo', () => {
        expect(GrantChangedFields(base, { ...base, ValidFrom: at('2026-02-01T06:00:00Z'), ValidTo: at('2027-02-01T06:00:00Z') })).toEqual([
            'ValidFrom',
            'ValidTo',
        ]);
    });

    it('a revoke: Status (dates unchanged)', () => {
        expect(GrantChangedFields(base, { ...base, Status: 'Revoked' })).toEqual(['Status']);
    });

    it('an end set or cleared counts (null vs a date), a null that stays null does not', () => {
        expect(GrantChangedFields({ ...base, ValidTo: null }, base)).toEqual(['ValidTo']);
        expect(GrantChangedFields(base, { ...base, ValidTo: null })).toEqual(['ValidTo']);
        expect(GrantChangedFields({ ...base, ValidTo: null }, { ...base, ValidTo: null })).toEqual([]);
    });

    it('one millisecond is a change: an instant is compared exactly', () => {
        expect(GrantChangedFields(base, { ...base, ValidTo: at('2027-01-01T06:00:00.001Z') })).toEqual(['ValidTo']);
    });
});

describe('RevokeGrantsForCanceledSubscription (G7): the cancel writes its end onto the grants', () => {
    type FakeGrant = {
        ID: string;
        ValidFrom: Date | null;
        ValidTo: Date | null;
        Status: string;
        Mode: string;
        RevokedAt?: Date;
        RevocationReason?: string;
        Save: ReturnType<typeof vi.fn>;
        LatestResult: { CompleteMessage: string };
    };
    let grants: Map<string, FakeGrant>;
    let zone: string;
    const provider = {
        GetEntityObject: vi.fn(async (_name: string, key: { KeyValuePairs: Array<{ Value: string }> }) => grants.get(key.KeyValuePairs[0].Value)),
    } as unknown as IMetadataProvider;
    const grant = (id: string, from: string | null, to: string | null, mode = 'SubscriptionTerm'): FakeGrant => ({
        ID: id,
        ValidFrom: from ? new Date(from) : null,
        ValidTo: to ? new Date(to) : null,
        Status: 'Active',
        Mode: mode,
        Save: vi.fn().mockResolvedValue(true),
        LatestResult: { CompleteMessage: '' },
    });
    const NOW = new Date('2026-03-03T15:00:00Z');

    beforeEach(() => {
        grants = new Map();
        zone = 'America/Chicago';
        vi.spyOn(BusinessTimeZoneEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(BusinessTimeZoneEngine.Instance, 'Zone', 'get').mockImplementation(() => zone);
    });
    afterEach(() => vi.restoreAllMocks());

    const load = (g: FakeGrant[]) => {
        for (const x of g) grants.set(x.ID, x);
        mocks.rows = g.map((x) => ({ ID: x.ID, Status: x.Status, ValidityModeApplied: x.Mode }));
    };
    /** An end-of-term style cancel (access-through day kept in full) decided directly. */
    const run = (accessThrough: string, ...g: FakeGrant[]) => {
        load(g);
        return RevokeGrantsForCanceledSubscription(
            SUB,
            { AccessThroughDate: new Date(accessThrough), EndsNow: false },
            'Subscription canceled',
            provider,
            user,
            undefined,
            NOW,
        );
    };

    it('end of term (31 Dec): an old grant ending 6 pm Central on 30 Dec now ends 00:00 Central on 1 Jan, still Active', async () => {
        const jane = grant('g1', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z');
        const out = await run('2026-12-31T00:00:00Z', jane);
        expect(out).toEqual({ Revoked: 0, LeftStanding: 1, EndMoved: 1 });
        expect(jane.ValidTo!.toISOString()).toBe('2027-01-01T06:00:00.000Z');
        expect(jane.Status).toBe('Active');
        expect(jane.Save).toHaveBeenCalledTimes(1);
    });

    it('a grace period (access through 30 Jan 2027): the grant runs to the end of the grace, as Orders reads it', async () => {
        const jane = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
        await run('2027-01-30T00:00:00Z', jane);
        expect(jane.ValidTo!.toISOString()).toBe('2027-01-31T06:00:00.000Z');
    });

    it('a cancel cut short at a boundary (access through 31 Mar): the grant ends there, earlier than its term', async () => {
        const jane = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
        await run('2026-03-31T00:00:00Z', jane);
        expect(jane.ValidTo!.toISOString()).toBe('2026-04-01T05:00:00.000Z');
    });

    it('a grant already ending there is not saved again (no event for a change that is not one)', async () => {
        const jane = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
        const out = await run('2026-12-31T00:00:00Z', jane);
        expect(out.EndMoved).toBe(0);
        expect(jane.Save).not.toHaveBeenCalled();
    });

    it("a later term's grant (a renewal already confirmed) that starts at the end is REVOKED: it can never come into force", async () => {
        // On a NoRefund type, an end-of-term cancel after Spawn Renewals confirmed term 2 leaves term 2's grant
        // starting at 2027-01-01T06:00Z. Left Active, the Learning Hub (which provisions without reading
        // ValidFrom) would give a year of access that Orders denies.
        const term1 = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
        const term2 = grant('g2', '2027-01-01T06:00:00Z', '2028-01-01T06:00:00Z');
        const out = await run('2026-12-31T00:00:00Z', term1, term2);
        expect(out).toEqual({ Revoked: 1, LeftStanding: 1, EndMoved: 0 });
        expect(term1.Status).toBe('Active');
        expect(term1.Save).not.toHaveBeenCalled();
        expect(term2.Status).toBe('Revoked');
        expect(term2.RevokedAt).toEqual(NOW);
        expect(term2.ValidTo!.toISOString()).toBe('2028-01-01T06:00:00.000Z');
    });

    it("a later term's grant whose revoke cannot be saved fails the cancel, naming the grant", async () => {
        const term1 = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
        const term2 = grant('g2', '2027-01-01T06:00:00Z', '2028-01-01T06:00:00Z');
        term2.Save.mockResolvedValue(false);
        term2.LatestResult.CompleteMessage = 'refused';
        await expect(run('2026-12-31T00:00:00Z', term1, term2)).rejects.toThrow(/g2, which starts after the cancel's access ends: refused/);
    });

    it('only term grants move: a FixedDuration grant on the subscription keeps its own window, as before', async () => {
        const term = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
        const fixed = grant('g2', '2026-01-01T06:00:00Z', '2026-07-01T05:00:00Z', 'FixedDuration');
        const open = grant('g3', '2026-01-01T06:00:00Z', null, 'Perpetual');
        const out = await run('2026-03-31T00:00:00Z', term, fixed, open);
        expect(out).toEqual({ Revoked: 0, LeftStanding: 3, EndMoved: 1 });
        expect(fixed.Save).not.toHaveBeenCalled();
        expect(open.Save).not.toHaveBeenCalled();
        expect(open.ValidTo).toBeNull();
    });

    it('control: a cancel whose access ended already revokes every standing grant at once, term or not', async () => {
        const jane = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
        const fixed = grant('g2', '2026-01-01T06:00:00Z', null, 'FixedDuration');
        const out = await run('2026-03-01T00:00:00Z', jane, fixed);
        expect(out).toEqual({ Revoked: 2, LeftStanding: 0, EndMoved: 0 });
        expect(jane.Status).toBe('Revoked');
        expect(jane.ValidTo!.toISOString()).toBe('2027-01-01T06:00:00.000Z');
    });

    it('a grant whose new end cannot be saved fails the cancel (its transaction rolls back), naming the grant', async () => {
        const jane = grant('g1', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z');
        jane.Save.mockResolvedValue(false);
        jane.LatestResult.CompleteMessage = 'CHECK constraint';
        await expect(run('2026-12-31T00:00:00Z', jane)).rejects.toThrow(/g1.*access-through: CHECK constraint/);
    });

    describe('the last-day matrix: the real DecideCancellation, chained into the revoke, read back by the evaluator', () => {
        const behavior = new SubscriptionBehavior();
        const typeRules = (overrides: Partial<SubscriptionTypeRules> = {}): SubscriptionTypeRules =>
            ({
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
                ReactivationMode: 'AlwaysCreateNew',
                AutoRenewDefault: true,
                RenewalLeadDays: 30,
                CancellationMode: 'EndOfTerm',
                CancellationRefundMode: 'NoRefund',
                GracePeriodDays: 0,
                ...overrides,
            }) as SubscriptionTypeRules;
        const TERM = { StartDate: new Date('2026-01-01T00:00:00Z'), EndDate: new Date('2026-12-31T00:00:00Z'), Amount: 1200, TermNumber: 1 };

        /** Cancel at `at` the way Orders.CancelSubscription does, then ask the evaluator about `asOf`. */
        async function cancelAt(at: string, g: FakeGrant, opts: { timing?: CancellationTiming; rules?: SubscriptionTypeRules } = {}) {
            const now = new Date(at);
            const rules = behavior.RulesForTiming(opts.rules ?? typeRules(), opts.timing);
            // As the operation does: the request day (and today) in the business zone.
            const today = new Date(`${CalendarDayIn(now, zone)}T00:00:00Z`);
            const context = { Rules: rules, RequestDate: today, Term: TERM };
            const decision = behavior.DecideCancellation(context);
            load([g]);
            const out = await RevokeGrantsForCanceledSubscription(
                SUB,
                { AccessThroughDate: decision.AccessThroughDate, EndsNow: behavior.EndsAccessOnCancel(context, decision, today) },
                'Subscription canceled',
                provider,
                user,
                undefined,
                now,
            );
            const access = (asOf: string) =>
                EvaluateGrantAccess(
                    { Status: g.Status, ValidFrom: g.ValidFrom, ValidTo: g.ValidTo, LinkedToSubscription: true },
                    new Date(asOf),
                    { Status: 'Canceled', EndDate: decision.AccessThroughDate },
                    undefined,
                    zone,
                ).HasAccess;
            return { out, decision, access };
        }

        // Chicago: the last day, 31 Dec, runs 2026-12-31T06:00Z → 2027-01-01T06:00Z.
        for (const at of ['2026-12-30T23:30:00Z', '2026-12-31T01:00:00Z', '2026-12-31T16:00:00Z', '2027-01-01T05:00:00Z']) {
            it(`Chicago, end of term (grace 0), cancelled at ${at}: Active to 2027-01-01T06:00Z, access holds to the minute`, async () => {
                const jane = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
                const { out, access } = await cancelAt(at, jane, { timing: 'EndOfTerm' });
                expect(out).toEqual({ Revoked: 0, LeftStanding: 1, EndMoved: 0 });
                expect(jane.Status).toBe('Active');
                expect(jane.ValidTo!.toISOString()).toBe('2027-01-01T06:00:00.000Z');
                expect(access(at)).toBe(true);
                expect(access('2027-01-01T05:59:00Z')).toBe(true);
                expect(access('2027-01-01T06:01:00Z')).toBe(false);
            });

            it(`Chicago, Immediate, cancelled at ${at}: revoked at once`, async () => {
                const jane = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
                const { out, access } = await cancelAt(at, jane, { timing: 'Immediate' });
                expect(out).toEqual({ Revoked: 1, LeftStanding: 0, EndMoved: 0 });
                expect(jane.Status).toBe('Revoked');
                expect(access(at)).toBe(false);
            });
        }

        it("the type's own rule with a 30-day grace (no timing chosen): Active to 00:00 Central after 30 Jan 2027", async () => {
            const jane = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
            const { out, decision, access } = await cancelAt('2026-12-31T16:00:00Z', jane, { rules: typeRules({ GracePeriodDays: 30 }) });
            expect(decision.AccessThroughDate.toISOString().slice(0, 10)).toBe('2027-01-30');
            expect(out).toEqual({ Revoked: 0, LeftStanding: 1, EndMoved: 1 });
            expect(jane.ValidTo!.toISOString()).toBe('2027-01-31T06:00:00.000Z');
            expect(access('2027-01-31T05:59:00Z')).toBe(true);
            expect(access('2027-01-31T06:01:00Z')).toBe(false);
        });

        it('an Immediate type with a 10-day grace is not "at once": access runs through the 10th day, as Orders reads it', async () => {
            const jane = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
            const { out, access } = await cancelAt('2026-06-15T16:00:00Z', jane, { rules: typeRules({ CancellationMode: 'Immediate', GracePeriodDays: 10 }) });
            expect(out).toEqual({ Revoked: 0, LeftStanding: 1, EndMoved: 1 });
            expect(jane.ValidTo!.toISOString()).toBe('2026-06-26T05:00:00.000Z');
            // The grant and Orders' own evaluator end at the same instant: the point of writing the end.
            expect(access('2026-06-26T04:59:00Z')).toBe(true);
            expect(access('2026-06-26T05:01:00Z')).toBe(false);
        });

        it('an Immediate cancel made BEFORE the term starts ends access at once, though DecideCancellation clamps it to the first day', async () => {
            const rules = behavior.RulesForTiming(typeRules(), 'Immediate');
            const context = { Rules: rules, RequestDate: new Date('2025-12-20T00:00:00Z'), Term: TERM };
            const decision = behavior.DecideCancellation(context);
            expect(decision.AccessThroughDate.toISOString().slice(0, 10)).toBe('2026-01-01');
            expect(behavior.EndsAccessOnCancel(context, decision, new Date('2025-12-20T00:00:00Z'))).toBe(true);
            // A type with grace is not "at once", even before the term.
            const graced = { ...context, Rules: typeRules({ CancellationMode: 'Immediate', GracePeriodDays: 5 }) };
            expect(behavior.EndsAccessOnCancel(graced, behavior.DecideCancellation(graced), new Date('2025-12-20T00:00:00Z'))).toBe(false);
        });

        it("an Immediate type's grace that ends TODAY (requested 10 days ago, grace 10) keeps today in full, not cut at once", async () => {
            const jane = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
            const rules = typeRules({ CancellationMode: 'Immediate', GracePeriodDays: 10 });
            const context = { Rules: rules, RequestDate: new Date('2026-06-05T00:00:00Z'), Term: TERM };
            const decision = behavior.DecideCancellation(context);
            const today = new Date('2026-06-15T00:00:00Z');
            expect(decision.AccessThroughDate.toISOString().slice(0, 10)).toBe('2026-06-15');
            expect(behavior.EndsAccessOnCancel(context, decision, today)).toBe(false);
        });

        it('an Immediate cancel requested for a later day is not "at once" either: the grant runs through that day', async () => {
            const jane = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
            const rules = behavior.RulesForTiming(typeRules(), 'Immediate');
            const context = { Rules: rules, RequestDate: new Date('2026-07-01T00:00:00Z'), Term: TERM };
            const decision = behavior.DecideCancellation(context);
            const today = new Date('2026-06-15T00:00:00Z');
            expect(behavior.EndsAccessOnCancel(context, decision, today)).toBe(false);
            load([jane]);
            const out = await RevokeGrantsForCanceledSubscription(
                SUB,
                { AccessThroughDate: decision.AccessThroughDate, EndsNow: false },
                'Subscription canceled',
                provider,
                user,
                undefined,
                new Date('2026-06-15T16:00:00Z'),
            );
            expect(out).toEqual({ Revoked: 0, LeftStanding: 1, EndMoved: 1 });
            expect(jane.ValidTo!.toISOString()).toBe('2026-07-02T05:00:00.000Z');
        });

        it('east of UTC (Auckland): the last day runs to 2026-12-31T11:00Z; an end-of-term cancel at 23:00 on it keeps it, an Immediate one revokes', async () => {
            zone = 'Pacific/Auckland';
            const kept = grant('g1', '2025-12-31T11:00:00Z', '2026-12-31T11:00:00Z');
            const endOfTerm = await cancelAt('2026-12-31T10:00:00Z', kept, { timing: 'EndOfTerm' });
            expect(endOfTerm.out).toEqual({ Revoked: 0, LeftStanding: 1, EndMoved: 0 });
            expect(endOfTerm.access('2026-12-31T10:59:00Z')).toBe(true);
            expect(endOfTerm.access('2026-12-31T11:01:00Z')).toBe(false);

            const cut = grant('g1', '2025-12-31T11:00:00Z', '2026-12-31T11:00:00Z');
            const immediate = await cancelAt('2026-12-31T10:00:00Z', cut, { timing: 'Immediate' });
            expect(immediate.out).toEqual({ Revoked: 1, LeftStanding: 0, EndMoved: 0 });
        });

        it('a grant written before this release (ends 00:00 UTC on 31 Dec): an end-of-term cancel on the last day moves it to the end of that day', async () => {
            const old = grant('g1', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z');
            const { out } = await cancelAt('2026-12-31T16:00:00Z', old, { timing: 'EndOfTerm' });
            expect(out).toEqual({ Revoked: 0, LeftStanding: 1, EndMoved: 1 });
            expect(old.ValidTo!.toISOString()).toBe('2027-01-01T06:00:00.000Z');
        });
    });
});
