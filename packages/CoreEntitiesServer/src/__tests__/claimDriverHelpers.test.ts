/**
 * resolvePersonID — a claim resolves the same Person checkout and the entitlement check resolve (#852).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';

const view = vi.hoisted(() => ({
    people: [] as unknown[],
    orders: [] as unknown[],
    failPeople: false,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    const one = async (p: { EntityName: string }) => {
        if (p.EntityName === 'MJ_BizApps_Common: People') {
            return view.failPeople ? { Success: false, ErrorMessage: 'boom', Results: [] } : { Success: true, Results: view.people };
        }
        if (p.EntityName === 'MJ_BizApps_Orders: Order Headers') return { Success: true, Results: view.orders };
        return { Success: true, Results: [] };
    };
    return {
        ...actual,
        RunView: class {
            RunView = vi.fn(one);
            RunViews = vi.fn((ps: Array<{ EntityName: string }>) => Promise.all(ps.map(one)));
        },
    };
});

import { resolvePersonID } from '../claimDriverHelpers.js';

const user = { ID: 'u-1', Email: ' Buyer@Example.com ' } as unknown as UserInfo;

describe('resolvePersonID', () => {
    beforeEach(() => {
        view.people = [];
        view.orders = [];
        view.failPeople = false;
    });

    it('picks the Person with Orders activity over an older one listed first', async () => {
        view.people = [
            { ID: A, __mj_CreatedAt: '2020-01-01T00:00:00Z' },
            { ID: B, __mj_CreatedAt: '2025-01-01T00:00:00Z' },
        ];
        view.orders = [{ BillToPersonID: B }];
        expect(await resolvePersonID(user)).toBe(B);
    });

    it('is null when no Person carries the e-mail, or the user has none', async () => {
        expect(await resolvePersonID(user)).toBeNull();
        expect(await resolvePersonID({ ID: 'u-2', Email: '' } as unknown as UserInfo)).toBeNull();
    });

    it('throws when the lookup fails rather than reporting no Person', async () => {
        view.failPeople = true;
        await expect(resolvePersonID(user)).rejects.toThrow(/boom/);
    });
});
