/**
 * A typed code that applied nowhere is told why, whatever stopped it (#686).
 *
 * Only redemption limits used to reach `Unusable`. A code below its minimum, beaten by a better
 * promotion, blocked by the company's no-stacking policy, or aimed at nothing on the order gave no
 * discount and no reason. Rejections are screened per line, so a code that misses on one line and
 * applies on another must not be reported.
 *
 * `RunPromotions` runs against a RunView stubbed per entity.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { results } = vi.hoisted(() => ({ results: new Map<string, unknown[]>() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class StubRunView {
        async RunView(params: { EntityName: string }) {
            return { Success: true, Results: results.get(params.EntityName) ?? [] };
        }
    }
    return { ...actual, RunView: StubRunView };
});

const { RunPromotions } = await import('../pricing/PromotionEngine.js');

const TYPE_ID = '33333333-3333-3333-3333-333333333333';
const PRODUCT = '55555555-5555-5555-5555-555555555555';
const OTHER_PRODUCT = '77777777-7777-7777-7777-777777777777';

interface PromoSpec {
    id: string;
    code: string;
    name: string;
    value: number;
    appliesAt: 'Line' | 'Order' | 'Either';
    minimumOrderAmount?: number | null;
    minimumQuantity?: number | null;
    allowsStacking?: boolean;
    targetProduct?: string;
}

const SAVE10: PromoSpec = { id: '11111111-1111-1111-1111-111111111111', code: 'SAVE10', name: 'Ten off', value: 0.1, appliesAt: 'Order' };
const BIG: PromoSpec = { id: '22222222-2222-2222-2222-222222222222', code: 'BIG', name: 'Spring sale', value: 0.3, appliesAt: 'Order' };

function setup(promos: PromoSpec[]) {
    results.clear();
    results.set(
        'MJ_BizApps_Orders: Promotion Codes',
        promos.map((p, i) => ({
            ID: `9999999${i}-9999-9999-9999-999999999999`,
            PromotionID: p.id,
            Code: p.code,
            Status: 'Active',
            MaxRedemptions: null,
            EffectiveFrom: null,
            EffectiveTo: null,
        })),
    );
    results.set(
        'MJ_BizApps_Orders: Promotions',
        promos.map((p) => ({
            ID: p.id,
            Code: p.code,
            Name: p.name,
            PromotionTypeID: TYPE_ID,
            CompanyID: null,
            Value: p.value,
            AppliesAt: p.appliesAt,
            AllowsStacking: p.allowsStacking ?? false,
            StackSequence: 0,
            MaxRedemptions: null,
            MaxRedemptionsPerCustomer: null,
            MinimumOrderAmount: p.minimumOrderAmount ?? null,
            MinimumQuantity: p.minimumQuantity ?? null,
            EffectiveFrom: null,
            EffectiveTo: null,
            QualifierKey: null,
            Status: 'Active',
        })),
    );
    results.set('MJ_BizApps_Orders: Promotion Types', [{ ID: TYPE_ID, Code: 'PercentOff' }]);
    results.set(
        'MJ_BizApps_Orders: Promotion Targets',
        promos
            .filter((p) => p.targetProduct)
            .map((p) => ({ PromotionID: p.id, ProductID: p.targetProduct, ProductCategoryID: null, IncludeDescendants: true })),
    );
}

const line = (id: string, net: number, quantity = 1) => ({
    ID: id,
    ProductID: PRODUCT,
    ProductCategoryID: null,
    Quantity: quantity,
    Net: net,
    Entity: {} as never,
});

const run = (codes: string[], opts: { allowStacking?: boolean; lines?: ReturnType<typeof line>[] } = {}) =>
    RunPromotions(
        {
            OrderHeaderID: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            CompanyID: '66666666-6666-6666-6666-666666666666',
            OrganizationID: null,
            PersonID: null,
            AsOf: new Date('2026-10-13'),
            Codes: codes,
            Lines: opts.lines ?? [line('line-1', 300), line('line-2', 100)],
            StackingMode: 'Sequential',
            AllowStacking: opts.allowStacking ?? true,
        },
        {} as never,
        {} as never,
    );

const discount = (r: Awaited<ReturnType<typeof run>>) => [...r.PerLine.values()].reduce((s, v) => s + v, 0);

beforeEach(() => results.clear());

describe('a typed code that applied nowhere is told why', () => {
    it('below the minimum order amount', async () => {
        setup([{ ...SAVE10, minimumOrderAmount: 1000 }]);
        const r = await run(['save10']);
        expect(discount(r)).toBe(0);
        expect(r.Unusable).toEqual([{ Code: 'save10', Reason: "the amount is below this promotion's minimum of 1000.00" }]);
    });

    it('below the minimum quantity', async () => {
        setup([{ ...SAVE10, appliesAt: 'Line', minimumQuantity: 5 }]);
        const r = await run(['save10']);
        expect(discount(r)).toBe(0);
        expect(r.Unusable).toEqual([{ Code: 'save10', Reason: "the quantity is below this promotion's minimum of 5" }]);
    });

    it('beaten by a better promotion, named by its name', async () => {
        setup([SAVE10, BIG]);
        const r = await run(['save10', 'big']);
        expect(discount(r)).toBe(120);
        expect(r.Unusable).toEqual([{ Code: 'save10', Reason: 'a better offer, Spring sale, applies instead' }]);
    });

    it("blocked by the company's no-stacking policy", async () => {
        setup([{ ...SAVE10, allowsStacking: true }, { ...BIG, allowsStacking: true }]);
        const r = await run(['save10', 'big'], { allowStacking: false });
        expect(discount(r)).toBe(120);
        expect(r.Unusable).toEqual([
            { Code: 'save10', Reason: 'promotions cannot be combined on this order, and Spring sale is worth more' },
        ]);
    });

    it('aimed at nothing on the order', async () => {
        setup([{ ...SAVE10, appliesAt: 'Line', targetProduct: OTHER_PRODUCT }]);
        const r = await run(['save10']);
        expect(discount(r)).toBe(0);
        expect(r.Unusable).toEqual([{ Code: 'save10', Reason: 'the code does not apply to anything on this order' }]);
    });
});

describe('a code that applied somewhere is not reported', () => {
    it('when it missed its minimum on one line and applied on another', async () => {
        setup([{ ...SAVE10, appliesAt: 'Line', minimumQuantity: 2 }]);
        const r = await run(['save10'], { lines: [line('line-1', 300, 1), line('line-2', 100, 2)] });
        expect(discount(r)).toBe(10);
        expect(r.Unusable).toEqual([]);
    });

    it('when promotions stack and both apply', async () => {
        setup([{ ...SAVE10, allowsStacking: true }, { ...BIG, allowsStacking: true }]);
        const r = await run(['save10', 'big']);
        expect(r.Unusable).toEqual([]);
    });
});
