// The component's import graph reaches `@angular/common`, whose partially-compiled
// injectables fall back to JIT. Loading the compiler is all that costs; nothing here
// bootstraps Angular or instantiates the component.
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OrdersEngine, type mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { MJOOrderLinesEditorComponent } from '../order-lines-editor.component';
import type { MJOExistingHolding, MJOProductOption } from '../../../data/orders-queries';

/**
 * The line card's term end (golive #338).
 *
 * A subscription line shows its term end: the end the type computes until one is stated, with a
 * reset back to it. The extend-or-new choice names the end an extension would keep.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`);

function seedEngine(): void {
    const engine = OrdersEngine.Instance as unknown as Record<string, unknown>;
    engine._products = [
        { ID: 'p-member', Name: 'Annual Membership', SubscriptionTypeID: 'st-annual' },
    ];
    engine._productTypes = [];
    engine._subscriptionTypes = [{ ID: 'st-annual', StartMode: 'Immediate', DefaultTermMonths: 12, BillingCadence: 'Annual' }];
}

beforeEach(seedEngine);
afterEach(() => {
    const engine = OrdersEngine.Instance as unknown as Record<string, unknown>;
    engine._products = [];
    engine._subscriptionTypes = [];
});

const option = (ID: string, subscription: boolean): MJOProductOption => ({
    ID,
    Name: ID,
    SKU: '',
    TypeName: '',
    ProductTypeID: 't',
    OrderLineExtensionEntity: null,
    CompanyName: '',
    CompanyID: '',
    ListPrice: 100,
    Taxable: false,
    MaxQuantityPerLine: null,
    SubscriptionTypeID: subscription ? 'st-annual' : null,
});

function editor(orderDate = '2026-10-20') {
    const c = Object.create(MJOOrderLinesEditorComponent.prototype) as MJOOrderLinesEditorComponent;
    Object.assign(c as object, {
        EditMode: true,
        Catalog: [option('p-member', true)],
        _order: { OrderDate: d(orderDate), MoneyLocked: false },
        cdr: { detectChanges: () => undefined },
        continuationStarts: new Map(),
        loadingContinuations: new Set(),
        holdings: new Map(),
        loadingHoldings: new Set(),
    });
    return c;
}

const line = (ProductID: string, start: string | null = null, end: string | null = null, extra: Record<string, unknown> = {}) =>
    ({
        ID: 'L1',
        ProductID,
        ServicePeriodStart: start ? d(start) : null,
        ServicePeriodEnd: end ? d(end) : null,
        RenewsSubscriptionID: null,
        SubscriptionAction: null,
        ...extra,
    }) as unknown as mjBizAppsOrdersOrderLineEntity;

describe('term end on a subscription line', () => {
    it('shows the end the type computes until one is stated', () => {
        const c = editor();
        const l = line('p-member', '2026-11-01');
        expect(c.TermEndFollowsType(l)).toBe(true);
        expect(c.TermEndValue(l)).toBe('2027-10-31');
    });

    it('measures the computed end from the order date when no start is stated', () => {
        expect(editor('2026-10-20').TermEndValue(line('p-member'))).toBe('2027-10-19');
    });

    it('stores a typed end, and Reset clears it back to the type term', () => {
        const c = editor();
        const l = line('p-member', '2026-11-01');
        const input = Object.assign(Object.create(HTMLInputElementStub.prototype), { value: '2027-11-30' });
        c.SetTermEnd(l, { target: input } as unknown as Event);
        expect(l.ServicePeriodEnd?.toISOString().slice(0, 10)).toBe('2027-11-30');
        expect(c.TermEndFollowsType(l)).toBe(false);

        c.ResetTermEnd(l);
        expect(l.ServicePeriodEnd).toBeNull();
    });

    it('flags an end before the start', () => {
        expect(editor().TermEndBeforeStart(line('p-member', '2026-11-01', '2026-10-01'))).toBe(true);
    });

    it('names the end an extension keeps: the stated length, or one term, from the continuation date', () => {
        const c = editor();
        const holding: MJOExistingHolding = {
            SubscriptionID: 's1',
            SubscriptionNumber: 'SUB-0001',
            Status: 'Active',
            LatestTermEnd: d('2027-09-30'),
        } as MJOExistingHolding;
        expect(c.HoldingContinuationEnd(line('p-member', '2026-10-01', '2027-03-31'), holding)).toBe('2028-03-31');
        expect(c.HoldingContinuationEnd(line('p-member', '2026-10-01'), holding)).toBe('2028-09-30');
    });
});

/** `SetTermEnd` checks `instanceof HTMLInputElement`; node has none, so the test supplies one. */
class HTMLInputElementStub {
    value = '';
}
const globals = globalThis as unknown as Record<string, unknown>;
let saved: unknown;
beforeEach(() => {
    saved = globals.HTMLInputElement;
    globals.HTMLInputElement = HTMLInputElementStub;
});
afterEach(() => {
    globals.HTMLInputElement = saved;
});
