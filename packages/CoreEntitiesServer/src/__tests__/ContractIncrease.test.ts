/**
 * The contract's increase, found through the deal on a subscription's birth order, and copied onto
 * the subscription once, on create.
 *
 * `RunView` is mocked per entity name, the way the other server tests do it. The rules worth holding:
 * nothing happens on a host without Sales and Contracts; a rate already set is never overwritten; a
 * saved subscription is never touched; two live contracts that disagree copy nothing; a lookup that
 * throws leaves the subscription creatable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    rows: new Map<string, Record<string, unknown>[]>(),
    calls: [] as { EntityName: string; ExtraFilter?: string }[],
    failOn: null as string | null,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogStatus: vi.fn(),
        LogError: vi.fn(),
        RunView: class {
            RunView = vi.fn().mockImplementation((params: { EntityName: string; ExtraFilter?: string }) => {
                mocks.calls.push(params);
                if (mocks.failOn && params.EntityName.endsWith(mocks.failOn)) return Promise.resolve({ Success: false, ErrorMessage: 'boom', Results: [] });
                for (const [fragment, rows] of mocks.rows) {
                    if (!params.EntityName.endsWith(fragment)) continue;
                    const filter = params.ExtraFilter ?? '';
                    const single = /(?:^|[^a-zA-Z])ID='([^']+)'/.exec(filter)?.[1];
                    const order = /OrderID='([^']+)'/.exec(filter)?.[1];
                    const inList = /ID IN \(([^)]+)\)/.exec(filter)?.[1];
                    let out = rows;
                    if (single) out = rows.filter((r) => r.ID === single);
                    else if (order) out = rows.filter((r) => r.OrderID === order && r.ContractID != null);
                    else if (inList) {
                        const ids = inList.split(',').map((s) => s.trim().replace(/'/g, '').toLowerCase());
                        out = rows.filter((r) => ids.includes(String(r.ID).toLowerCase()));
                    }
                    return Promise.resolve({ Success: true, Results: out });
                }
                return Promise.resolve({ Success: true, Results: [] });
            });
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ApplyContractIncreaseOnCreate, ContractIncreaseForOrder, ContractIncreaseForOrderLine, type IncreaseOnCreateSubject } from '../ContractIncrease.js';

const USER = { ID: 'u-1' } as unknown as UserInfo;
const ORDER = '0d7a1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e6f';
const LINE = '1d7a1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e6f';
const C1 = '2d7a1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e6f';
const C2 = '3d7a1c2e-5b3f-4a6d-9e8f-1a2b3c4d5e6f';

function provider(installed = ['Deals', 'Contracts']): IMetadataProvider {
    return {
        EntityByName: (name: string) => (installed.some((n) => name.endsWith(n)) ? { Name: name } : undefined),
    } as unknown as IMetadataProvider;
}

function subject(overrides: Partial<IncreaseOnCreateSubject> = {}): IncreaseOnCreateSubject {
    return { IsSaved: false, OrderLineID: LINE, SubscriptionNumber: 'SUB-9', RenewalIncreasePercent: null, ...overrides };
}

beforeEach(() => {
    mocks.rows.clear();
    mocks.calls.length = 0;
    mocks.failOn = null;
    mocks.rows.set('Order Lines', [{ ID: LINE, OrderHeaderID: ORDER }]);
    mocks.rows.set('Deals', [{ ID: 'd-1', OrderID: ORDER, ContractID: C1 }]);
    mocks.rows.set('Contracts', [{ ID: C1, ContractNumber: 'CT-100', AnnualIncreasePercent: '5.0000', TerminatedDate: null, SupersededByContractID: null }]);
});

describe('ContractIncreaseForOrder', () => {
    it('follows the deal on the order to its contract and reads the rate as a number', async () => {
        expect(await ContractIncreaseForOrder(provider(), USER, ORDER)).toEqual({ Percent: 5, ContractID: C1, ContractNumber: 'CT-100' });
    });

    it('does nothing on a host without the Sales or Contracts app, and never queries', async () => {
        expect(await ContractIncreaseForOrder(provider(['Contracts']), USER, ORDER)).toBeNull();
        expect(await ContractIncreaseForOrder(provider(['Deals']), USER, ORDER)).toBeNull();
        expect(mocks.calls).toHaveLength(0);
    });

    it('returns null when no deal papers the order, or the contract carries no rate', async () => {
        mocks.rows.set('Deals', []);
        expect(await ContractIncreaseForOrder(provider(), USER, ORDER)).toBeNull();
        mocks.rows.set('Deals', [{ ID: 'd-1', OrderID: ORDER, ContractID: C1 }]);
        mocks.rows.set('Contracts', [{ ID: C1, ContractNumber: 'CT-100', AnnualIncreasePercent: null, TerminatedDate: null, SupersededByContractID: null }]);
        expect(await ContractIncreaseForOrder(provider(), USER, ORDER)).toBeNull();
    });

    it('prefers the contract still in force over one that was superseded or terminated', async () => {
        mocks.rows.set('Deals', [
            { ID: 'd-1', OrderID: ORDER, ContractID: C1 },
            { ID: 'd-2', OrderID: ORDER, ContractID: C2 },
        ]);
        mocks.rows.set('Contracts', [
            { ID: C1, ContractNumber: 'CT-100', AnnualIncreasePercent: 3, TerminatedDate: null, SupersededByContractID: C2 },
            { ID: C2, ContractNumber: 'CT-101', AnnualIncreasePercent: 6, TerminatedDate: null, SupersededByContractID: null },
        ]);
        expect(await ContractIncreaseForOrder(provider(), USER, ORDER)).toMatchObject({ Percent: 6, ContractNumber: 'CT-101' });
    });

    it('copies nothing when two live contracts disagree, rather than guessing', async () => {
        mocks.rows.set('Deals', [
            { ID: 'd-1', OrderID: ORDER, ContractID: C1 },
            { ID: 'd-2', OrderID: ORDER, ContractID: C2 },
        ]);
        mocks.rows.set('Contracts', [
            { ID: C1, ContractNumber: 'CT-100', AnnualIncreasePercent: 3, TerminatedDate: null, SupersededByContractID: null },
            { ID: C2, ContractNumber: 'CT-101', AnnualIncreasePercent: 6, TerminatedDate: null, SupersededByContractID: null },
        ]);
        expect(await ContractIncreaseForOrder(provider(), USER, ORDER)).toBeNull();
    });

    it('refuses an ID that is not a UUID before touching the database', async () => {
        await expect(ContractIncreaseForOrder(provider(), USER, "1' OR 1=1 --")).rejects.toThrow(/OrderHeaderID/);
        expect(mocks.calls).toHaveLength(0);
    });
});

describe('ContractIncreaseForOrderLine', () => {
    it('starts from the birth line and resolves its order', async () => {
        expect(await ContractIncreaseForOrderLine(provider(), USER, LINE)).toMatchObject({ Percent: 5 });
        expect(mocks.calls[0].EntityName).toBe('MJ_BizApps_Orders: Order Lines');
    });

    it('returns null when the line no longer exists', async () => {
        mocks.rows.set('Order Lines', []);
        expect(await ContractIncreaseForOrderLine(provider(), USER, LINE)).toBeNull();
    });
});

describe('ApplyContractIncreaseOnCreate', () => {
    it('sets the rate on a new subscription that has none', async () => {
        const sub = subject();
        expect(await ApplyContractIncreaseOnCreate(sub, provider(), USER)).toMatchObject({ Percent: 5 });
        expect(sub.RenewalIncreasePercent).toBe(5);
    });

    it('never overwrites a rate somebody set, never touches a saved subscription, and needs a birth line', async () => {
        const typed = subject({ RenewalIncreasePercent: 2 });
        expect(await ApplyContractIncreaseOnCreate(typed, provider(), USER)).toBeNull();
        expect(typed.RenewalIncreasePercent).toBe(2);

        const saved = subject({ IsSaved: true });
        expect(await ApplyContractIncreaseOnCreate(saved, provider(), USER)).toBeNull();
        expect(saved.RenewalIncreasePercent).toBeNull();

        const noLine = subject({ OrderLineID: null });
        expect(await ApplyContractIncreaseOnCreate(noLine, provider(), USER)).toBeNull();
        expect(mocks.calls).toHaveLength(0);
    });

    it('a zero on the contract is copied as zero: the customer negotiated no increase', async () => {
        mocks.rows.set('Contracts', [{ ID: C1, ContractNumber: 'CT-100', AnnualIncreasePercent: 0, TerminatedDate: null, SupersededByContractID: null }]);
        const sub = subject();
        await ApplyContractIncreaseOnCreate(sub, provider(), USER);
        expect(sub.RenewalIncreasePercent).toBe(0);
    });

    it('a lookup that fails is logged and leaves the subscription creatable without a rate', async () => {
        mocks.failOn = 'Deals';
        const sub = subject();
        await expect(ApplyContractIncreaseOnCreate(sub, provider(), USER)).resolves.toBeNull();
        expect(sub.RenewalIncreasePercent).toBeNull();
    });
});
