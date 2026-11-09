import '@angular/compiler';
import { EventEmitter } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunView, type IMetadataProvider } from '@memberjunction/core';
import { Today, type mjBizAppsOrdersSubscriptionTermEntity } from '@mj-biz-apps/orders-entities';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import { MJOSubscriptionsPageComponent } from '../receivables/subscriptions.page';
import { LoadSubscriptionRevRec } from '../../data/orders-queries';

type PageInternals = {
    instantOf(value: unknown): string;
    termDateOf(value: unknown): string;
    AllRows: Array<Record<string, unknown>>;
    SelectedID: string | null;
    Terms: mjBizAppsOrdersSubscriptionTermEntity[];
    readonly CoveredThrough: string;
    readonly DaysToRenewal: number;
    readonly RenewalDue: boolean;
    TypeRenewalLeadDays: number | null;
};

const SUB_ID = '11111111-1111-1111-1111-111111111111';

function page(): PageInternals {
    return Object.create(MJOSubscriptionsPageComponent.prototype) as PageInternals;
}

function term(start: Date, end: Date, status = 'Active'): mjBizAppsOrdersSubscriptionTermEntity {
    return { StartDate: start, EndDate: end, Status: status } as unknown as mjBizAppsOrdersSubscriptionTermEntity;
}

/** Runs `fn` with the process in another time zone, restoring the original afterwards. */
function inZone(tz: string, fn: () => void): void {
    const original = process.env.TZ;
    process.env.TZ = tz;
    try {
        fn();
    } finally {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
    }
}

/**
 * A calendar day relative to today, as the data layer delivers one: midnight UTC. Built from
 * `Today()` so the assertion does not depend on the zone the suite runs in.
 */
function day(offsetFromToday: number): Date {
    const [y, m, d] = Today().split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + offsetFromToday));
}

describe('MJOSubscriptionsPageComponent dates', () => {
    it('formats a Date, which is how entity-object terms and events deliver their dates', () => {
        expect(page().termDateOf(new Date(Date.UTC(2026, 7, 10)))).toBe('Aug 10, 2026');
    });

    it('formats ISO text', () => {
        expect(page().termDateOf('2026-08-10')).toBe('Aug 10, 2026');
    });

    it('renders a dash for a missing date', () => {
        expect(page().termDateOf(undefined)).toBe('—');
        expect(page().instantOf(null)).toBe('—');
    });
});

describe('MJOSubscriptionsPageComponent term dates west of Greenwich', () => {
    // How the data layer delivers a calendar-day column: midnight UTC.
    const jan1 = new Date('2027-01-01T00:00:00.000Z');
    const dec31 = new Date('2027-12-31T00:00:00.000Z');

    it('shows the stored calendar day for term start and end in America/Chicago', () => {
        inZone('America/Chicago', () => {
            expect(page().termDateOf(jan1)).toBe('Jan 1, 2027');
            expect(page().termDateOf(dec31)).toBe('Dec 31, 2027');
        });
    });

    it('agrees with Covered through for the same term', () => {
        inZone('America/Chicago', () => {
            const p = page();
            p.AllRows = [{ ID: SUB_ID, EndDate: null }];
            p.SelectedID = SUB_ID;
            p.Terms = [term(jan1, dec31)];
            expect(p.termDateOf(dec31)).toBe(p.CoveredThrough);
        });
    });

    it('shows history timestamps as the business day they fell on, since they are instants', () => {
        // Midnight UTC on Jan 1 is 6 PM Dec 31 in Central. A browser in Auckland reads Jan 1 locally;
        // the business zone decides the day, so every viewer sees Dec 31.
        const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
        const original = { rows: engine._configurations, loaded: engine._loaded };
        engine._configurations = [{ FeatureKey: 'BizApps.BusinessTimeZone', Value: '{"iana":"America/Chicago","sql":"Central Standard Time"}', DefaultValue: '{"iana":"UTC","sql":"UTC"}' }];
        engine._loaded = true;
        try {
            inZone('Pacific/Auckland', () => {
                expect(page().instantOf(jan1)).toBe('Dec 31, 2026');
            });
        } finally {
            engine._configurations = original.rows;
            engine._loaded = original.loaded;
        }
    });

    it('renders a dash for a missing term date', () => {
        expect(page().termDateOf(null)).toBe('—');
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
        p.Terms = [
            term(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 11, 31))),
            term(new Date(Date.UTC(2027, 0, 1)), new Date(Date.UTC(2027, 11, 31))),
        ];
        expect(p.CoveredThrough).toBe('Dec 31, 2027');
    });
});

describe('MJOSubscriptionsPageComponent renewal warning', () => {
    function due(row: Record<string, unknown>, daysOut: number, typeLeadDays: number | null = null, termStatus = 'Active'): boolean {
        const p = page();
        p.AllRows = [{ ID: SUB_ID, EndDate: null, AutoRenew: true, Status: 'Active', ...row }];
        p.SelectedID = SUB_ID;
        p.TypeRenewalLeadDays = typeLeadDays;
        p.Terms = [term(day(-300), day(daysOut), termStatus)];
        return p.RenewalDue;
    }

    it("uses the subscription's own lead days", () => {
        expect(due({ RenewalLeadDays: 60 }, 50)).toBe(true);
        expect(due({ RenewalLeadDays: 30 }, 40)).toBe(false);
    });

    it("falls back to the type's lead days, then to 0", () => {
        expect(due({ RenewalLeadDays: null }, 50, 60)).toBe(true);
        expect(due({ RenewalLeadDays: null }, 10, null)).toBe(false);
    });

    it('does not warn for a paused subscription', () => {
        expect(due({ RenewalLeadDays: 60, Status: 'Paused' }, 40)).toBe(false);
    });

    it('warns for a trialing subscription', () => {
        expect(due({ RenewalLeadDays: 60, Status: 'Trialing' }, 40)).toBe(true);
    });

    it('does not warn when the latest term is not Scheduled or Active', () => {
        expect(due({ RenewalLeadDays: 60 }, 40, null, 'Canceled')).toBe(false);
    });

    it('does not warn with auto-renew off', () => {
        expect(due({ RenewalLeadDays: 60, AutoRenew: false }, 40)).toBe(false);
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

    it('reuses terms the caller passes and loads every entry\'s lines in the same query', async () => {
        const calls: Array<{ EntityName?: string; IncludeRelatedRecords?: string[] }> = [];
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: async (params: { EntityName?: string; IncludeRelatedRecords?: string[] }) => {
                calls.push(params);
                return { Success: true, Results: [] };
            },
        } as unknown as RunView);

        const terms = [{ ID: '22222222-2222-2222-2222-222222222222', TermNumber: 1 }];
        const loaded = await LoadSubscriptionRevRec({ ID: SUB_ID }, { CurrentUser: undefined } as unknown as IMetadataProvider, terms);

        expect(calls).toHaveLength(1);
        expect(calls[0].EntityName).toContain('Journal Entries');
        expect(calls[0].IncludeRelatedRecords).toEqual(['Lines']);
        expect(loaded.TermIDs).toEqual([terms[0].ID]);
    });

    it('queries nothing and reports CanRead false without journal entry read permission', async () => {
        const runView = vi.fn();
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);
        const provider = {
            CurrentUser: { ID: 'user' },
            Entities: [{
                Name: 'MJ_BizApps_Accounting: Journal Entries',
                GetUserPermisions: () => ({ CanRead: false }),
            }],
        } as unknown as IMetadataProvider;

        const loaded = await LoadSubscriptionRevRec({ ID: SUB_ID }, provider, []);

        expect(loaded.CanRead).toBe(false);
        expect(loaded.Entries).toEqual([]);
        expect(runView).not.toHaveBeenCalled();
    });
});

/**
 * #932. The Cancel button lives on the Subscription FORM, and this page is where support finds a
 * subscription. Double-click used to do what a single click does (fill the side panel), and the
 * side panel had no way out, so the form, and with it Cancel, could not be reached from the app.
 */
describe('MJOSubscriptionsPageComponent opening a subscription (#932)', () => {
    type Opener = {
        SubscriptionOpened: EventEmitter<{ ID: string }>;
        SelectedID: string | null;
        AllRows: Array<Record<string, unknown>>;
        OnRecordOpened(event: unknown): void;
        OpenSelected(): void;
    };

    function opener(): { p: Opener; opened: string[] } {
        const p = Object.create(MJOSubscriptionsPageComponent.prototype) as Opener;
        p.SubscriptionOpened = new EventEmitter<{ ID: string }>();
        const opened: string[] = [];
        p.SubscriptionOpened.subscribe((row) => opened.push(row.ID));
        return { p, opened };
    }

    it('opens the form on double-click', () => {
        const { p, opened } = opener();
        p.OnRecordOpened({ record: { ID: SUB_ID } });
        expect(opened).toEqual([SUB_ID]);
    });

    it('opens the selected subscription from the side panel button', () => {
        const { p, opened } = opener();
        p.AllRows = [{ ID: SUB_ID, SubscriptionNumber: 'SUB-000089', Status: 'Active' }];
        p.SelectedID = SUB_ID;
        p.OpenSelected();
        expect(opened).toEqual([SUB_ID]);
    });

    it('opens nothing when nothing is selected', () => {
        const { p, opened } = opener();
        p.AllRows = [];
        p.SelectedID = null;
        p.OpenSelected();
        p.OnRecordOpened({ record: {} });
        expect(opened).toEqual([]);
    });
});
