import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';

const mocks = vi.hoisted(() => ({ rows: new Map<string, unknown[]>(), calls: [] as string[] }));

vi.mock('../overview-load', () => ({
    LoadOverviewRows: vi.fn(async (_p: unknown, entity: string) => {
        mocks.calls.push(entity);
        return mocks.rows.get(entity) ?? [];
    }),
    CountOverviewRows: vi.fn(async () => 0),
}));

import { SubscriptionOverviewPanel } from '../document-overviews.panels';
import { MJO_ENTITIES } from '../../data/entity-names';

/** A panel with `Record` and a form host set, without standing up Angular DI. */
function panelFor(record: Partial<mjBizAppsOrdersSubscriptionEntity>): SubscriptionOverviewPanel {
    const panel = Object.create(SubscriptionOverviewPanel.prototype) as SubscriptionOverviewPanel;
    panel.Cards = [];
    panel.Record = { IsSaved: true, ID: 'sub-1', ...record } as mjBizAppsOrdersSubscriptionEntity;
    (panel as unknown as { FormComponent: unknown }).FormComponent = { ProviderToUse: {}, cdr: { detectChanges: vi.fn() } };
    return panel;
}

const fact = (panel: SubscriptionOverviewPanel, card: string, label: string) =>
    panel.Cards.find((c) => c.Title === card)?.Facts?.find((f) => f.Label === label)?.Value;

describe('Subscription overview — record refresh', () => {
    beforeEach(() => {
        mocks.calls.length = 0;
        mocks.rows.clear();
    });

    it('rebuilds its cards when the form reloads the record, so a cancellation shows without a page reload', async () => {
        const panel = panelFor({ Status: 'Active', AutoRenew: true });
        mocks.rows.set(MJO_ENTITIES.SubscriptionEvent, [{ EventType: 'Created', OccurredAt: '2026-10-15T12:00:00Z' }]);
        await panel.ngOnInit();
        expect(fact(panel, 'Holder & coverage', 'Status')).toBe('Active');

        panel.Record.Status = 'Canceled';
        panel.Record.AutoRenew = false;
        mocks.rows.set(MJO_ENTITIES.SubscriptionEvent, [
            { EventType: 'Canceled', OccurredAt: '2026-10-15T13:00:00Z' },
            { EventType: 'Created', OccurredAt: '2026-10-15T12:00:00Z' },
        ]);
        panel.OnRecordRefreshed();
        await vi.waitFor(() => expect(fact(panel, 'Holder & coverage', 'Status')).toBe('Canceled'));

        expect(fact(panel, 'Holder & coverage', 'Auto-renew')).toBe('No');
        expect(panel.Cards.find((c) => c.Title === 'Events')?.Items?.map((i) => i.Title)).toEqual(['Canceled', 'Created']);
        expect(mocks.calls.filter((e) => e === MJO_ENTITIES.SubscriptionTerm)).toHaveLength(2);
    });
});
