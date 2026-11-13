// The component's import graph reaches `@angular/common`, whose partially-compiled
// injectables fall back to JIT. Loading the compiler is all that costs; nothing here
// bootstraps Angular or instantiates the component.
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OrdersEngine, type mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { MJOOrderLinesEditorComponent } from '../order-lines-editor.component';
import type { MJOExistingHolding, MJOProductOption } from '../../../data/orders-queries';

/**
 * The line card's term fields (golive #338, u623.1).
 *
 * A subscription line shows its term end, read-only: the end the type computes until one is stated. The extend-or-new choice names the end an extension would keep. A bundle line
 * whose bundle contains a subscription shows the term start only, and never a dictated one.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`);

function seedEngine(): void {
    const engine = OrdersEngine.Instance as unknown as Record<string, unknown>;
    engine._products = [
        { ID: 'p-member', Name: 'Annual Membership', SubscriptionTypeID: 'st-annual' },
        { ID: 'p-kit', Name: 'Member Starter Kit', SubscriptionTypeID: null },
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

const option = (ID: string, subscription: boolean, bundle: boolean): MJOProductOption => ({
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
    ContainsSubscription: bundle,
});

function editor(orderDate = '2026-10-20') {
    const c = Object.create(MJOOrderLinesEditorComponent.prototype) as MJOOrderLinesEditorComponent;
    Object.assign(c as object, {
        EditMode: true,
        Catalog: [option('p-member', true, false), option('p-kit', false, true)],
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

    it('offers no way to type an end: a stated length would change coverage without changing the price', () => {
        // Nothing gates or approves a length other than the type's term yet, so the line shows the
        // end and the editor neither binds an input to it nor keeps a setter for one.
        const template = readFileSync(fileURLToPath(new URL('../order-lines-editor.component.html', import.meta.url)), 'utf8');
        expect(template).not.toMatch(/mjo-ol-term-end-|SetTermEnd|ResetTermEnd/);
        expect('SetTermEnd' in MJOOrderLinesEditorComponent.prototype).toBe(false);
        expect(editor().TermEndValue(line('p-member', '2026-11-01', '2027-11-30'))).toBe('2027-11-30');
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

    it('puts the dates a renewal gives on the "Renew" choice, and says so when they are not the dates entered', () => {
        const holding = {
            SubscriptionID: 's1',
            SubscriptionNumber: 'SUB-0001',
            Status: 'Active',
            LatestTermEnd: d('2027-09-30'),
        } as MJOExistingHolding;
        expect(editor().HoldingExtendLineText(line('p-member', '2026-10-01'), holding)).toEqual({
            Choice: 'Renew SUB-0001 (2027-10-01 to 2028-09-30)',
            Hint:
                "Confirm adds this line to SUB-0001 as its next term, at this line's price. It will run 2027-10-01 to " +
                '2028-09-30, not 2026-10-01 to 2027-09-30 as entered, because a new term starts the day after the current one ends.',
        });
    });

    it('gives no warning when the entered dates are the ones a renewal gives', () => {
        const holding = {
            SubscriptionID: 's1',
            SubscriptionNumber: 'SUB-0001',
            Status: 'Active',
            LatestTermEnd: d('2027-09-30'),
        } as MJOExistingHolding;
        expect(editor().HoldingExtendLineText(line('p-member', '2027-10-01'), holding)).toEqual({
            Choice: 'Renew SUB-0001 (2027-10-01 to 2028-09-30)',
            Hint: "Confirm adds this line to SUB-0001 as its next term, at this line's price.",
        });
    });

    it('gives no "as entered" warning when no start was typed: the order date supplied it', () => {
        const holding = {
            SubscriptionID: 's1',
            SubscriptionNumber: 'SUB-0001',
            Status: 'Active',
            LatestTermEnd: d('2027-09-30'),
        } as MJOExistingHolding;
        const c = editor('2026-10-20');
        // The two choices still show their different dates; only the sentence about entered dates is left out.
        expect(c.HoldingExtendLineText(line('p-member'), holding)).toEqual({
            Choice: 'Renew SUB-0001 (2027-10-01 to 2028-09-30)',
            Hint: "Confirm adds this line to SUB-0001 as its next term, at this line's price.",
        });
        expect(c.HoldingNewSubscriptionText(line('p-member'))).toBe('Create new subscription (2026-10-20 to 2027-10-19)');
    });

    it('shows the line\'s own dates on the "Create new subscription" choice', () => {
        expect(editor().HoldingNewSubscriptionText(line('p-member', '2026-10-01'))).toBe(
            'Create new subscription (2026-10-01 to 2027-09-30)',
        );
        expect(editor().HoldingNewSubscriptionText(line('p-member', '2026-10-01', '2027-03-31'))).toBe(
            'Create new subscription (2026-10-01 to 2027-03-31)',
        );
    });

    it('keeps the plain renew text when the holding has no coverage end to count from', () => {
        const holding = { SubscriptionID: 's1', SubscriptionNumber: 'SUB-0001', Status: 'Active', LatestTermEnd: null } as MJOExistingHolding;
        // No continuation date means no dates to show, so the text is the plain one.
        expect(editor().HoldingExtendLineText(line('p-member', '2026-10-01'), holding)).toEqual({
            Choice: 'Renew SUB-0001',
            Hint: "Confirm adds this line to SUB-0001 as its next term, at this line's price.",
        });
    });

    it('leaves a reactivation or a new subscription alone: those run on the line\'s own dates', () => {
        const paused = (Mode: string) =>
            ({
                SubscriptionID: 's1',
                SubscriptionNumber: 'SUB-0001',
                Status: 'Paused',
                LatestTermEnd: d('2026-09-30'),
                Reactivation: { Mode, WindowDays: null },
            }) as MJOExistingHolding;
        const c = editor();
        const l = line('p-member', '2026-10-01');
        expect(c.HoldingExtendLineText(l, paused('ReactivateExisting'))).toEqual(c.HoldingExtendText(paused('ReactivateExisting')));
        expect(c.HoldingExtendLineText(l, paused('AlwaysCreateNew'))).toEqual(c.HoldingExtendText(paused('AlwaysCreateNew')));
    });
});

describe('term start on a bundle line (u623.1)', () => {
    it('shows on a bundle that contains a subscription, but not the term end or a dictated start', () => {
        const c = editor();
        const l = line('p-kit', null, null, { RenewsSubscriptionID: 's1' });
        expect(c.ShowsTermStart(l)).toBe(true);
        expect(c.IsSubscriptionBundleLine(l)).toBe(true);
        expect(c.IsSubscriptionLine(l)).toBe(false);
        expect(c.TermStartIsDictated(l)).toBe(false);
    });
});
