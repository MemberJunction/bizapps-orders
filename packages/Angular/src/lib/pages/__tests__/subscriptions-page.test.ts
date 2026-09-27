import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunView, type IMetadataProvider } from '@memberjunction/core';
import type { mjBizAppsOrdersSubscriptionTermEntity } from '@mj-biz-apps/orders-entities';
import { MJOSubscriptionsPageComponent } from '../receivables/subscriptions.page';
import { LoadSubscriptionRevRec } from '../../data/orders-queries';

type PageInternals = {
    dateOf(value: unknown): string;
    AllRows: Array<Record<string, unknown>>;
    SelectedID: string | null;
    Terms: mjBizAppsOrdersSubscriptionTermEntity[];
    readonly CoveredThrough: string;
    readonly DaysToRenewal: number;
};

const SUB_ID = '11111111-1111-1111-1111-111111111111';

function page(): PageInternals {
    return Object.create(MJOSubscriptionsPageComponent.prototype) as PageInternals;
}

function term(start: Date, end: Date): mjBizAppsOrdersSubscriptionTermEntity {
    return { StartDate: start, EndDate: end } as unknown as mjBizAppsOrdersSubscriptionTermEntity;
}

/** A local calendar day, so the assertion does not depend on the zone the suite runs in. */
function day(offsetFromToday: number): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetFromToday);
}

describe('MJOSubscriptionsPageComponent dates', () => {
    it('formats a Date, which is how entity-object terms and events deliver their dates', () => {
        expect(page().dateOf(new Date(2026, 7, 10))).toBe('Aug 10, 2026');
    });

    it('formats ISO text', () => {
        expect(page().dateOf('2026-08-10')).toBe('Aug 10, 2026');
    });

    it('renders a dash for a missing date', () => {
        expect(page().dateOf(null)).toBe('—');
        expect(page().dateOf(undefined)).toBe('—');
    });
});

describe('MJOSubscriptionsPageComponent renewal timing', () => {
    it('counts down to the latest term end, not Subscription.EndDate', () => {
        const p = page();
        p.AllRows = [{ ID: SUB_ID, EndDate: null, AutoRenew: true }];
        p.SelectedID = SUB_ID;
        p.Terms = [term(day(-400), day(-36)), term(day(-35), day(30))];
        expect(p.DaysToRenewal).toBe(30);
    });

    it('reports no countdown when no term has an end', () => {
        const p = page();
        p.AllRows = [{ ID: SUB_ID, EndDate: null, AutoRenew: true }];
        p.SelectedID = SUB_ID;
        p.Terms = [];
        expect(p.DaysToRenewal).toBe(0);
    });

    it('shows coverage through the furthest term end', () => {
        const p = page();
        p.AllRows = [{ ID: SUB_ID, EndDate: null }];
        p.SelectedID = SUB_ID;
        p.Terms = [term(new Date(2026, 0, 1), new Date(2026, 11, 31)), term(new Date(2027, 0, 1), new Date(2027, 11, 31))];
        expect(p.CoveredThrough).toBe('Dec 31, 2027');
    });
});

describe('LoadSubscriptionRevRec', () => {
    afterEach(() => vi.restoreAllMocks());

    it('reads the journal entries linked to the subscription terms', async () => {
        const termIDs = ['22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'];
        const entries = termIDs.map((id, index) => ({
            ID: `je-${index}`,
            LinkedRecordID: id,
            EffectiveDate: new Date(2026, index, 1),
            Description: 'Monthly recognition',
            EntryType: 'Standard',
        }));
        const calls: Array<{ EntityName?: string; ExtraFilter?: string }> = [];
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: async (params: { EntityName?: string; ExtraFilter?: string }) => {
                calls.push(params);
                if (params.EntityName?.includes('Subscription Terms')) {
                    return { Success: true, Results: termIDs.map((ID, i) => ({ ID, TermNumber: i + 1 })) };
                }
                return { Success: true, Results: entries };
            },
        } as unknown as RunView);

        const loaded = await LoadSubscriptionRevRec({ ID: SUB_ID, OrderLineID: null }, {
            CurrentUser: undefined,
        } as unknown as IMetadataProvider);

        expect(loaded.Entries).toHaveLength(2);
        expect(loaded.TermIDs).toEqual(termIDs);
        expect(loaded.TermLookup[termIDs[1]]).toEqual({ TermNumber: 2, Label: 'Term 2' });
        const journalFilter = calls[1].ExtraFilter ?? '';
        for (const id of [...termIDs, SUB_ID]) expect(journalFilter).toContain(id);
    });
});
