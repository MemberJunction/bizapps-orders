/**
 * The rule for which Person an e-mail means: Orders history first, then the oldest, then the lowest ID.
 */
import { describe, expect, it, vi } from 'vitest';
import type { RunView } from '@memberjunction/core';
import { ChoosePersonForEmail, NormalizePersonEmail, ResolvePersonByEmail } from '../PersonByEmail.js';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const C = 'cccccccc-0000-4000-8000-000000000003';

describe('ChoosePersonForEmail', () => {
    it('prefers a Person with Orders history over an older one without', () => {
        expect(
            ChoosePersonForEmail([
                { ID: A, CreatedAt: '2020-01-01T00:00:00Z', HasOrdersActivity: false },
                { ID: B, CreatedAt: '2025-01-01T00:00:00Z', HasOrdersActivity: true },
            ])
        ).toBe(B);
    });

    it('then the oldest, then the lowest ID, whatever the row order', () => {
        const rows = [
            { ID: C, CreatedAt: '2024-01-01T00:00:00Z', HasOrdersActivity: false },
            { ID: B, CreatedAt: '2023-01-01T00:00:00Z', HasOrdersActivity: false },
            { ID: A, CreatedAt: '2023-01-01T00:00:00Z', HasOrdersActivity: false },
        ];
        expect(ChoosePersonForEmail(rows)).toBe(A);
        expect(ChoosePersonForEmail([...rows].reverse())).toBe(A);
        // A row with no creation time sorts last.
        expect(ChoosePersonForEmail([{ ID: A, CreatedAt: null, HasOrdersActivity: false }, { ID: C, CreatedAt: '2024-01-01', HasOrdersActivity: false }])).toBe(C);
        expect(ChoosePersonForEmail([])).toBeNull();
    });
});

describe('NormalizePersonEmail', () => {
    it('trims and lower-cases; empty or over-long is null', () => {
        expect(NormalizePersonEmail('  Buyer@Example.COM ')).toBe('buyer@example.com');
        expect(NormalizePersonEmail('   ')).toBeNull();
        expect(NormalizePersonEmail(`${'a'.repeat(250)}@x.io`)).toBeNull();
    });
});

describe('ResolvePersonByEmail', () => {
    function fakeRunView(people: unknown[], activity: Record<string, unknown[]> = {}, failing?: string) {
        const calls: Array<{ EntityName: string; ExtraFilter?: string }> = [];
        const one = async (p: { EntityName: string; ExtraFilter?: string }) => {
            calls.push(p);
            if (p.EntityName === failing) return { Success: false, ErrorMessage: 'boom', Results: [] };
            if (p.EntityName === 'MJ_BizApps_Common: People') return { Success: true, Results: people };
            return { Success: true, Results: activity[p.EntityName] ?? [] };
        };
        const rv = { RunView: vi.fn(one), RunViews: vi.fn((ps: Array<{ EntityName: string }>) => Promise.all(ps.map(one))) } as unknown as RunView;
        return { rv, calls };
    }

    it('one match is that Person, with no activity reads', async () => {
        const { rv, calls } = fakeRunView([{ ID: A, __mj_CreatedAt: null }]);
        expect(await ResolvePersonByEmail(' Buyer@Example.com', rv, undefined)).toEqual({ Success: true, PersonID: A, MatchCount: 1 });
        expect(calls).toHaveLength(1);
        expect(calls[0].ExtraFilter).toBe("Email = 'buyer@example.com'");
    });

    it('several matches: the one billed on an order wins', async () => {
        const { rv } = fakeRunView(
            [
                { ID: A, __mj_CreatedAt: '2020-01-01T00:00:00Z' },
                { ID: B, __mj_CreatedAt: '2025-01-01T00:00:00Z' },
            ],
            { 'MJ_BizApps_Orders: Order Headers': [{ BillToPersonID: B.toUpperCase() }] }
        );
        expect(await ResolvePersonByEmail('buyer@example.com', rv, undefined)).toEqual({ Success: true, PersonID: B, MatchCount: 2 });
    });

    it('no match is null; a failed read is reported, never a silent null', async () => {
        expect((await ResolvePersonByEmail('x@example.com', fakeRunView([]).rv, undefined)).PersonID).toBeNull();
        const failed = await ResolvePersonByEmail('x@example.com', fakeRunView([{ ID: A }, { ID: B }], {}, 'MJ_BizApps_Orders: Entitlement Grants').rv, undefined);
        expect(failed.Success).toBe(false);
        expect(failed.PersonID).toBeNull();
    });
});
