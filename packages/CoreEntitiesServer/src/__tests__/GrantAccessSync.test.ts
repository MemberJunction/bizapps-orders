/**
 * Access sync in Orders, grant side:
 *  - A1: `GrantChangedFields` decides when a save is news (status or validity dates, compared as instants).
 *  - G7: a cancel whose access ends later writes that end onto its standing grants, so a copy of access that
 *    follows the grant (the Learning Hub) ends on the same day Orders does.
 *
 * Jane's SUB-000110, Chicago, term 1 Jan → 31 Dec 2026; her grant was written before G5 and ends at
 * 2026-12-31T00:00Z (6 pm Central on 30 Dec).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';

const mocks = vi.hoisted(() => ({ rows: [] as Array<{ ID: string; Status: string }> }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = vi.fn().mockImplementation(() => Promise.resolve({ Success: true, Results: mocks.rows }));
        },
    };
});

import { GrantChangedFields } from '../EntitlementGrantEntityServer.js';
import { RevokeGrantsForCanceledSubscription } from '../EntitlementEngine.js';

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
    type FakeGrant = { ID: string; ValidFrom: Date | null; ValidTo: Date | null; Status: string; Save: ReturnType<typeof vi.fn>; LatestResult: { CompleteMessage: string } };
    let grants: Map<string, FakeGrant>;
    const provider = {
        GetEntityObject: vi.fn(async (_name: string, key: { KeyValuePairs: Array<{ Value: string }> }) => grants.get(key.KeyValuePairs[0].Value)),
    } as unknown as IMetadataProvider;
    const grant = (id: string, from: string | null, to: string | null): FakeGrant => ({
        ID: id,
        ValidFrom: from ? new Date(from) : null,
        ValidTo: to ? new Date(to) : null,
        Status: 'Active',
        Save: vi.fn().mockResolvedValue(true),
        LatestResult: { CompleteMessage: '' },
    });
    const NOW = new Date('2026-03-03T15:00:00Z');

    beforeEach(() => {
        grants = new Map();
        vi.spyOn(BusinessTimeZoneEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(BusinessTimeZoneEngine.Instance, 'Zone', 'get').mockReturnValue('America/Chicago');
    });
    afterEach(() => vi.restoreAllMocks());

    const run = (accessThrough: string, ...g: FakeGrant[]) => {
        for (const x of g) grants.set(x.ID, x);
        mocks.rows = g.map((x) => ({ ID: x.ID, Status: x.Status }));
        return RevokeGrantsForCanceledSubscription(SUB, new Date(accessThrough), 'Subscription canceled', provider, user, undefined, NOW);
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

    it('a later term\'s grant that starts after the end is left alone (never in force; an end before its start is refused)', async () => {
        const term1 = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
        const term2 = grant('g2', '2027-01-01T06:00:00Z', '2028-01-01T06:00:00Z');
        const out = await run('2026-12-31T00:00:00Z', term1, term2);
        expect(out.EndMoved).toBe(0);
        expect(term2.Save).not.toHaveBeenCalled();
        expect(term2.ValidTo!.toISOString()).toBe('2028-01-01T06:00:00.000Z');
    });

    it('control: an immediate cancel (access-through already passed) still revokes at once, as before', async () => {
        const jane = grant('g1', '2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z');
        const out = await run('2026-03-02T00:00:00Z', jane);
        expect(out).toEqual({ Revoked: 1, LeftStanding: 0, EndMoved: 0 });
        expect(jane.Status).toBe('Revoked');
        expect(jane.ValidTo!.toISOString()).toBe('2027-01-01T06:00:00.000Z');
    });

    it('a grant whose new end cannot be saved fails the cancel (its transaction rolls back), naming the grant', async () => {
        const jane = grant('g1', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z');
        jane.Save.mockResolvedValue(false);
        jane.LatestResult.CompleteMessage = 'CHECK constraint';
        await expect(run('2026-12-31T00:00:00Z', jane)).rejects.toThrow(/g1.*access-through: CHECK constraint/);
    });
});
