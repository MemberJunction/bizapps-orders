import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    mjBizAppsOrdersPaymentProviderEntity,
    mjBizAppsOrdersStoredValueAccountEntity,
    mjBizAppsOrdersSubscriptionEntity,
    mjBizAppsOrdersSubscriptionTermEntity,
} from '@mj-biz-apps/orders-entities';

interface LoadCall {
    Entity: string;
    ExtraFilter: string;
    MaxRows: number | undefined;
    OrderBy: string | undefined;
}

const mocks = vi.hoisted(() => ({
    rows: new Map<string, unknown[]>(),
    calls: [] as LoadCall[],
    /** When set, the next loads wait on it instead of answering at once. */
    gate: null as Promise<void> | null,
    fail: null as Error | null,
    logged: [] as string[],
}));

vi.mock('../overview-load', () => ({
    LoadOverviewRows: vi.fn(async (_p: unknown, entity: string, extraFilter: string, _fields: string[], maxRows?: number, orderBy?: string) => {
        mocks.calls.push({ Entity: entity, ExtraFilter: extraFilter, MaxRows: maxRows, OrderBy: orderBy });
        // Read the answer when called, so a load started before a change keeps what it would have read.
        const rows = mocks.rows.get(entity) ?? [];
        const fail = mocks.fail;
        if (mocks.gate) await mocks.gate;
        if (fail) throw fail;
        return rows;
    }),
    CountOverviewRows: vi.fn(async () => 0),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: (message: string) => mocks.logged.push(message) };
});

import {
    PaymentProviderOverviewPanel,
    StoredValueOverviewPanel,
    SubscriptionOverviewPanel,
    SubscriptionTermOverviewPanel,
} from '../document-overviews.panels';
import { MJO_ENTITIES } from '../../data/entity-names';

const SUB = '3f0c1d9e-6b2a-4c71-9d55-0a1b2c3d4e5f';

/** A panel with `Record` and a form host set, without standing up Angular DI. */
function hosted<P extends { Cards: unknown[] }>(proto: object, record: object): P {
    const panel = Object.create(proto) as P;
    // Field initialisers do not run under Object.create; set the ones the panels read.
    Object.assign(panel, { Cards: [], loadSeq: 0 });
    (panel as unknown as { Record: unknown }).Record = { IsSaved: true, ID: SUB, ...record };
    (panel as unknown as { FormComponent: unknown }).FormComponent = { ProviderToUse: {}, cdr: { detectChanges: vi.fn() } };
    return panel;
}

const panelFor = (record: Partial<mjBizAppsOrdersSubscriptionEntity>) =>
    hosted<SubscriptionOverviewPanel>(SubscriptionOverviewPanel.prototype, record);

const fact = (panel: SubscriptionOverviewPanel, card: string, label: string) =>
    panel.Cards.find((c) => c.Title === card)?.Facts?.find((f) => f.Label === label)?.Value;

const callFor = (entity: string) => mocks.calls.find((c) => c.Entity === entity);

beforeEach(() => {
    mocks.calls.length = 0;
    mocks.rows.clear();
    mocks.gate = null;
    mocks.fail = null;
    mocks.logged.length = 0;
});

describe('Subscription overview — what it loads', () => {
    it('reads this subscription\'s terms, grants and events, newest first, 8 of each (#738, #749)', async () => {
        await panelFor({}).ngOnInit();

        expect(callFor(MJO_ENTITIES.SubscriptionTerm)).toEqual({
            Entity: MJO_ENTITIES.SubscriptionTerm, ExtraFilter: `SubscriptionID='${SUB}'`, MaxRows: 8, OrderBy: 'TermNumber DESC',
        });
        expect(callFor(MJO_ENTITIES.EntitlementGrant)).toEqual({
            Entity: MJO_ENTITIES.EntitlementGrant, ExtraFilter: `SubscriptionID='${SUB}'`, MaxRows: 8, OrderBy: 'ValidTo DESC',
        });
        expect(callFor(MJO_ENTITIES.SubscriptionEvent)).toEqual({
            Entity: MJO_ENTITIES.SubscriptionEvent, ExtraFilter: `SubscriptionID='${SUB}'`, MaxRows: 8, OrderBy: 'OccurredAt DESC, __mj_CreatedAt DESC',
        });
    });

    it('loads nothing for an unsaved subscription', async () => {
        const panel = panelFor({ IsSaved: false });
        await panel.ngOnInit();
        panel.OnRecordRefreshed();

        expect(mocks.calls).toEqual([]);
        expect(panel.Cards).toEqual([]);
    });

    it('shows the highest-numbered of the terms it reads as current', async () => {
        // The loader asks for the newest 8; the panel picks the top one whatever order they arrive in.
        const terms: Partial<mjBizAppsOrdersSubscriptionTermEntity>[] = [12, 11, 10, 9, 8, 7, 6, 5].map((n) => ({
            TermNumber: n, StartDate: new Date('2026-01-01'), EndDate: new Date('2026-12-31'), Amount: 100, Status: 'Active', IsProrated: false,
        }));
        mocks.rows.set(MJO_ENTITIES.SubscriptionTerm, [...terms].reverse());
        const panel = panelFor({});
        await panel.ngOnInit();

        expect(fact(panel, 'Current term', 'Term')).toBe('#12');
    });

    it('shows events in the order they were read', async () => {
        mocks.rows.set(MJO_ENTITIES.SubscriptionEvent, [
            { EventType: 'Canceled', OccurredAt: '2026-10-15T14:00:00Z' },
            { EventType: 'Activated', OccurredAt: '2026-10-15T13:00:00Z' },
            { EventType: 'Created', OccurredAt: '2026-10-15T12:00:00Z' },
        ]);
        const panel = panelFor({});
        await panel.ngOnInit();

        expect(panel.Cards.find((c) => c.Title === 'Events')?.Items?.map((i) => i.Title)).toEqual(['Canceled', 'Activated', 'Created']);
    });
});

describe('Subscription overview — record refresh', () => {
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
        expect(mocks.calls.filter((c) => c.Entity === MJO_ENTITIES.SubscriptionTerm)).toHaveLength(2);
    });

    it('keeps the newer cards when an older load finishes last (#749)', async () => {
        const panel = panelFor({});
        // The first load reads the pre-cancel events, then stalls.
        mocks.rows.set(MJO_ENTITIES.SubscriptionEvent, [{ EventType: 'Created', OccurredAt: '2026-10-15T12:00:00Z' }]);
        let release!: () => void;
        mocks.gate = new Promise<void>((resolve) => (release = resolve));
        const first = panel.ngOnInit();

        // A Refresh starts after it, reads the cancellation, and finishes first.
        mocks.gate = null;
        mocks.rows.set(MJO_ENTITIES.SubscriptionEvent, [
            { EventType: 'Canceled', OccurredAt: '2026-10-15T13:00:00Z' },
            { EventType: 'Created', OccurredAt: '2026-10-15T12:00:00Z' },
        ]);
        panel.OnRecordRefreshed();
        const events = () => panel.Cards.find((c) => c.Title === 'Events')?.Items?.map((i) => i.Title);
        await vi.waitFor(() => expect(events()).toEqual(['Canceled', 'Created']));

        release();
        await first;
        expect(events()).toEqual(['Canceled', 'Created']);
    });

    it('keeps the cards it has and logs when a reload fails (#749)', async () => {
        const panel = panelFor({ Status: 'Active' });
        await panel.ngOnInit();
        const before = panel.Cards;

        mocks.fail = new Error('network down');
        panel.OnRecordRefreshed();
        await vi.waitFor(() => expect(mocks.logged).toHaveLength(1));

        expect(mocks.logged[0]).toContain('network down');
        expect(panel.Cards).toBe(before);
    });
});

describe('Other Overview lists read newest first (#738)', () => {
    it('term grants, by last valid day', async () => {
        await hosted<SubscriptionTermOverviewPanel>(SubscriptionTermOverviewPanel.prototype, {}).ngOnInit();
        expect(callFor(MJO_ENTITIES.EntitlementGrant)).toEqual({
            Entity: MJO_ENTITIES.EntitlementGrant, ExtraFilter: `SubscriptionTermID='${SUB}'`, MaxRows: 8, OrderBy: 'ValidTo DESC',
        });
    });

    it('the stored-value ledger, by when each transaction happened', async () => {
        await hosted<StoredValueOverviewPanel>(StoredValueOverviewPanel.prototype, {} as Partial<mjBizAppsOrdersStoredValueAccountEntity>).ngOnInit();
        expect(callFor(MJO_ENTITIES.StoredValueTransaction)).toEqual({
            Entity: MJO_ENTITIES.StoredValueTransaction, ExtraFilter: `StoredValueAccountID='${SUB}'`, MaxRows: 8, OrderBy: 'OccurredAt DESC, __mj_CreatedAt DESC',
        });
    });

    it("a payment provider's recent charges, by payment date", async () => {
        await hosted<PaymentProviderOverviewPanel>(PaymentProviderOverviewPanel.prototype, {} as Partial<mjBizAppsOrdersPaymentProviderEntity>).ngOnInit();
        expect(callFor(MJO_ENTITIES.PaymentHeader)).toEqual({
            Entity: MJO_ENTITIES.PaymentHeader, ExtraFilter: `PaymentProviderID='${SUB}'`, MaxRows: 8, OrderBy: 'PaymentDate DESC, __mj_CreatedAt DESC',
        });
    });
});
