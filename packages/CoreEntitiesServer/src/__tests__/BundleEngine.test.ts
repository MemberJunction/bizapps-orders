/**
 * BundleEngine — what a component line takes from the bundle line it was expanded from (#548).
 *
 * The subscription pass reads each component on its own. A component that was not given the
 * bundle line's ship-to, stated start or renewal target falls back to the order's party and the
 * booking date, and a renewal starts a second subscription instead of continuing the first.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const m = vi.hoisted(() => ({
    BundleItems: [] as Array<Record<string, unknown>>,
    Subscriptions: [] as Array<{ ID: string; ProductID: string }>,
    SubscriptionProducts: new Set<string>(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    RunView: class {
        RunView = async (params: { EntityName: string }) => ({
            Success: true,
            Results: params.EntityName.endsWith('Product Bundle Items') ? m.BundleItems : m.Subscriptions,
        });
    },
}));

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => ({
    // The UUID guards live in orders-entities (sql-guards re-exports them), so they stay real.
    ...(await importOriginal<typeof import('@mj-biz-apps/orders-entities')>()),
    LoadOrdersEngine: async () => undefined,
    OrdersEngine: {
        Instance: {
            BaseProductPrices: () => [],
            ProductByID: (id: string) => ({ ID: id, SubscriptionTypeID: m.SubscriptionProducts.has(id) ? 'type' : null }),
            // Expansion asks the resolver confirm uses (#903); the type-default case is the
            // resolver's own test, in OrdersEngine.test.ts.
            SubscriptionTypeForProduct: (id: string) => (m.SubscriptionProducts.has(id) ? 'type' : null),
        },
    },
}));

vi.mock('../OrderLineEntityServer.js', () => ({ MarkAsOrdersOwnWrite: () => undefined }));

import { ExpandBundleLines, type ExpandableLine } from '../BundleEngine.js';

const BUNDLE = 'B0000000-0000-4000-8000-000000000001';
const MEMBERSHIP = 'A0000000-0000-4000-8000-000000000001';
const JOURNAL = 'A0000000-0000-4000-8000-000000000002';
const BOOK = 'A0000000-0000-4000-8000-000000000003';
const ORG = 'C0000000-0000-4000-8000-000000000001';
const PERSON = 'C0000000-0000-4000-8000-000000000002';
const OTHER_PERSON = 'C0000000-0000-4000-8000-000000000003';
const ADDRESS = 'C0000000-0000-4000-8000-000000000004';
const SUB = 'D0000000-0000-4000-8000-000000000001';
const START = new Date('2026-11-01T00:00:00Z');

const provider = {} as IMetadataProvider;
const user = { ID: 'u' } as unknown as UserInfo;

/**
 * A stand-in order line: plain properties plus the three entity calls expansion makes. `saved`
 * is the row as last written, which is what `GetFieldByName(...).OldValue` reports.
 */
let lineCount = 0;
function line(fields: Record<string, unknown> = {}, saved?: Record<string, unknown>): ExpandableLine {
    const row: Record<string, unknown> = { ID: `L${++lineCount}`, Quantity: 1, UnitPrice: 100, ...fields };
    const before = saved ? { ...row, ...saved } : null;
    row.Get = (f: string) => row[f];
    row.Set = (f: string, v: unknown) => {
        row[f] = v;
    };
    row.GetFieldByName = (f: string) =>
        before ? { Dirty: before[f] !== row[f], OldValue: before[f] } : { Dirty: false, OldValue: row[f] };
    return row as unknown as ExpandableLine;
}

async function expand(lines: ExpandableLine[]): Promise<ExpandableLine[]> {
    await ExpandBundleLines(lines, async () => line(), provider, user);
    return lines.filter((l) => l.ParentOrderLineID);
}

const byProduct = (children: ExpandableLine[], id: string) => children.find((c) => c.ProductID === id)!;

beforeEach(() => {
    m.BundleItems = [MEMBERSHIP, JOURNAL, BOOK].map((id, i) => ({
        BundleProductID: BUNDLE,
        ComponentProductID: id,
        Quantity: 1,
        PricingMode: 'Bundled',
        SortOrder: i,
    }));
    m.Subscriptions = [{ ID: SUB, ProductID: MEMBERSHIP }];
    m.SubscriptionProducts = new Set([MEMBERSHIP, JOURNAL]);
});

describe('a new component line', () => {
    it('takes the ship-to on every component, and the start and action only on subscriptions', async () => {
        const children = await expand([
            line({
                ProductID: BUNDLE,
                ShipToOrganizationID: ORG,
                ShipToPersonID: PERSON,
                ShipToAddressID: ADDRESS,
                ServicePeriodStart: START,
                SubscriptionAction: 'CreateNew',
            }),
        ]);
        expect(children).toHaveLength(3);
        for (const c of children) {
            expect([c.ShipToOrganizationID, c.ShipToPersonID, c.ShipToAddressID]).toEqual([ORG, PERSON, ADDRESS]);
        }
        expect(byProduct(children, MEMBERSHIP).ServicePeriodStart).toEqual(START);
        expect(byProduct(children, JOURNAL).SubscriptionAction).toBe('CreateNew');
        expect(byProduct(children, BOOK).ServicePeriodStart).toBeNull();
        expect(byProduct(children, BOOK).SubscriptionAction).toBeNull();
    });

    it('takes the renewal target only on the component selling the renewed product', async () => {
        const children = await expand([line({ ProductID: BUNDLE, RenewsSubscriptionID: SUB })]);
        expect(byProduct(children, MEMBERSHIP).RenewsSubscriptionID).toBe(SUB);
        expect(byProduct(children, JOURNAL).RenewsSubscriptionID).toBeNull();
        expect(byProduct(children, BOOK).RenewsSubscriptionID).toBeNull();
    });

    it('refuses a renewal no component can continue, rather than starting a second subscription', async () => {
        m.Subscriptions = [{ ID: SUB, ProductID: 'A0000000-0000-4000-8000-0000000000FF' }];
        await expect(expand([line({ ProductID: BUNDLE, RenewsSubscriptionID: SUB })])).rejects.toThrow(
            /none of the bundle's components sells/,
        );
    });
});

describe('an existing component line, on a later save', () => {
    function savedBundle(changes: Record<string, unknown>, saved: Record<string, unknown>) {
        const parent = line({ ID: 'P', ProductID: BUNDLE, ...changes }, saved);
        const children = [MEMBERSHIP, JOURNAL, BOOK].map((id) =>
            line({ ProductID: id, ParentOrderLineID: 'P', ...savedChildFields(id, saved) }),
        );
        return { parent, children };
    }
    const savedChildFields = (id: string, saved: Record<string, unknown>) => ({
        ShipToPersonID: saved.ShipToPersonID ?? null,
        ServicePeriodStart: m.SubscriptionProducts.has(id) ? (saved.ServicePeriodStart ?? null) : null,
    });

    it('follows a changed bundle line where the component still holds the old value', async () => {
        const { parent, children } = savedBundle({ ShipToPersonID: OTHER_PERSON }, { ShipToPersonID: PERSON });
        await expand([parent, ...children]);
        for (const c of children) expect(c.ShipToPersonID).toBe(OTHER_PERSON);
    });

    it('keeps a value set on the component itself', async () => {
        const later = new Date('2026-12-01T00:00:00Z');
        const { parent, children } = savedBundle({ ServicePeriodStart: later }, { ServicePeriodStart: START });
        const membership = byProduct(children, MEMBERSHIP);
        const journal = byProduct(children, JOURNAL);
        journal.ServicePeriodStart = new Date('2027-01-15T00:00:00Z');
        await expand([parent, ...children]);
        expect(membership.ServicePeriodStart).toEqual(later);
        expect(journal.ServicePeriodStart).toEqual(new Date('2027-01-15T00:00:00Z'));
        expect(byProduct(children, BOOK).ServicePeriodStart).toBeNull();
    });

    it('moves the renewal target when the bundle line starts renewing', async () => {
        const { parent, children } = savedBundle({ RenewsSubscriptionID: SUB }, { RenewsSubscriptionID: null });
        await expand([parent, ...children]);
        expect(byProduct(children, MEMBERSHIP).RenewsSubscriptionID).toBe(SUB);
        expect(byProduct(children, JOURNAL).RenewsSubscriptionID ?? null).toBeNull();
    });
});
