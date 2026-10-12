/**
 * A re-decided promotion replaces its adjustment rows instead of adding a second set (#486).
 *
 * A draft saved with a code and then confirmed runs the promotion engine twice, because the code
 * rides the order object. The confirm wrote its own adjustment rows beside the draft's, so the trail
 * recorded the discount twice while the line showed it once. A manual discount on the same line has
 * to survive the re-decision, since it is a request consumed once.
 *
 * `ReadStandingDiscounts` and `DeletePromotionAdjustments` run against a stubbed RunView;
 * `decidePromotions` with the engine stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { views, mockRunPromotions } = vi.hoisted(() => ({
    views: [] as Array<{ params: { EntityName: string; ExtraFilter?: string }; results: unknown[] }>,
    mockRunPromotions: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class StubRunView {
        async RunView(params: { EntityName: string; ExtraFilter?: string }) {
            const next = views.find((v) => v.params.EntityName === params.EntityName && v.params.ExtraFilter === undefined);
            if (!next) throw new Error(`unexpected RunView of ${params.EntityName}`);
            next.params.ExtraFilter = params.ExtraFilter;
            return { Success: true, Results: next.results };
        }
    }
    return { ...actual, RunView: StubRunView };
});

vi.mock('../pricing/PromotionEngine.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../pricing/PromotionEngine.js')>();
    return { ...actual, RunPromotions: (...args: unknown[]) => mockRunPromotions(...args) };
});

const { DeletePromotionAdjustments, ReadStandingDiscounts } = await import('../pricing/PromotionEngine.js');
const { OrderPricingService } = await import('../pricing/OrderPricingService.js');

const LINES = 'MJ_BizApps_Orders: Order Lines';
const ADJUSTMENTS = 'MJ_BizApps_Orders: Order Adjustments';
const ALLOCATIONS = 'MJ_BizApps_Orders: Order Adjustment Allocations';

function queue(entityName: string, results: unknown[]) {
    views.push({ params: { EntityName: entityName }, results });
}

function row(id: string, deleted: string[]) {
    return { ID: id, Delete: vi.fn(async () => { deleted.push(id); return true; }) };
}

beforeEach(() => {
    views.length = 0;
    mockRunPromotions.mockReset();
});

describe('ReadStandingDiscounts', () => {
    it("is the stored discount less the promotion's allocations", async () => {
        queue(LINES, [{ ID: 'LINE-1', DiscountAmount: 150 }, { ID: 'line-2', DiscountAmount: 0 }]);
        queue(ADJUSTMENTS, [{ ID: 'adj-promo' }]);
        queue(ALLOCATIONS, [{ OrderAdjustmentID: 'adj-promo', OrderLineID: 'line-1', Amount: 100 }]);

        const standing = await ReadStandingDiscounts('order-1', ['line-1', 'line-2'], {} as never, {} as never);

        expect(standing.get('line-1')).toBe(50);
        expect(standing.get('line-2')).toBe(0);
        expect(views[1].params.ExtraFilter).toBe(`OrderHeaderID = 'order-1' AND PromotionID IS NOT NULL`);
        expect(views[2].params.ExtraFilter).toContain(`OrderLineID IN ('line-1','line-2')`);
    });

    it('never goes below zero', async () => {
        queue(LINES, [{ ID: 'line-1', DiscountAmount: 80 }]);
        queue(ADJUSTMENTS, [{ ID: 'adj-promo' }]);
        queue(ALLOCATIONS, [{ OrderAdjustmentID: 'adj-promo', OrderLineID: 'line-1', Amount: 100 }]);

        const standing = await ReadStandingDiscounts('order-1', ['line-1'], {} as never, {} as never);

        expect(standing.get('line-1')).toBe(0);
    });
});

describe('DeletePromotionAdjustments', () => {
    it("removes the lines' promotion rows, allocations before their adjustment", async () => {
        const deleted: string[] = [];
        queue(ADJUSTMENTS, [{ ID: 'adj-promo' }]);
        queue(ALLOCATIONS, [{ OrderAdjustmentID: 'adj-promo', OrderLineID: 'line-1', Amount: 100 }]);
        queue(ALLOCATIONS, [row('alloc-promo', deleted)]);
        queue(ADJUSTMENTS, [row('adj-promo', deleted)]);

        await DeletePromotionAdjustments('order-1', ['line-1'], {} as never, {} as never);

        expect(deleted).toEqual(['alloc-promo', 'adj-promo']);
        // Manual discount rows carry no PromotionID, so the first read never sees them.
        expect(views[0].params.ExtraFilter).toContain('PromotionID IS NOT NULL');
    });

    it('stops when the order holds no promotion rows', async () => {
        queue(ADJUSTMENTS, []);

        await DeletePromotionAdjustments('order-1', ['line-1'], {} as never, {} as never);

        expect(views).toHaveLength(1);
    });

    it('refuses rather than leaving half the old promotion behind', async () => {
        queue(ADJUSTMENTS, [{ ID: 'adj-promo' }]);
        queue(ALLOCATIONS, [{ OrderAdjustmentID: 'adj-promo', OrderLineID: 'line-1', Amount: 100 }]);
        queue(ALLOCATIONS, [{ ID: 'alloc-promo', Delete: async () => false, LatestResult: { CompleteMessage: 'locked' } }]);
        queue(ADJUSTMENTS, [{ ID: 'adj-promo', Delete: async () => true }]);

        await expect(DeletePromotionAdjustments('order-1', ['line-1'], {} as never, {} as never)).rejects.toThrow(/locked/);
    });
});

type Line = { ID: string; ProductID: string; Quantity: number; UnitPrice: number; DiscountPct: number; DiscountAmount: number };
type Walk = {
    ctx: Record<string, unknown>;
    out: { UnusableCodes: unknown[] };
    loadProductForPricing: () => Promise<null>;
    loadCompanyPolicy: () => Promise<{ AllowPromotionStacking: boolean; StackingMode: string }>;
    decidePromotions: () => Promise<unknown>;
};

function walk(lines: Line[], standing?: Map<Line, number>): Walk {
    const w = new OrderPricingService({ Provider: {} as never, User: {} as never }) as unknown as Walk;
    w.ctx = { CompanyID: 'co-1', Lines: lines, PromotionCodes: ['SAVE10'], ManualDiscounts: [], StandingDiscounts: standing };
    w.out = { UnusableCodes: [] };
    w.loadProductForPricing = async () => null;
    w.loadCompanyPolicy = async () => ({ AllowPromotionStacking: false, StackingMode: 'Sequential' });
    return w;
}

const line = (discount: number): Line => ({
    ID: 'line-1', ProductID: 'p', Quantity: 10, UnitPrice: 100, DiscountPct: 0, DiscountAmount: discount,
});

describe('OrderPricingService.decidePromotions — re-deciding a saved line', () => {
    it("replaces the promotion's share and keeps the manual discount", async () => {
        const l = line(150);
        mockRunPromotions.mockResolvedValue({ Applications: [{ OrderLineID: '0', Amount: 100 }], PerLine: new Map([['0', 100]]), Unusable: [] });

        await walk([l], new Map([[l, 50]])).decidePromotions();

        expect(l.DiscountAmount).toBe(150);
    });

    it('drops the old promotion when the code no longer applies', async () => {
        const l = line(150);
        mockRunPromotions.mockResolvedValue({ Applications: [], PerLine: new Map(), Unusable: [] });

        await walk([l], new Map([[l, 50]])).decidePromotions();

        expect(l.DiscountAmount).toBe(50);
    });

    it('assigns zero when nothing is left', async () => {
        const l = line(100);
        mockRunPromotions.mockResolvedValue({ Applications: [], PerLine: new Map(), Unusable: [] });

        await walk([l], new Map([[l, 0]])).decidePromotions();

        expect(l.DiscountAmount).toBe(0);
    });

    it('without standing discounts a line the promotion did not decide keeps what it stored', async () => {
        const l = line(150);
        mockRunPromotions.mockResolvedValue({ Applications: [], PerLine: new Map(), Unusable: [] });

        await walk([l]).decidePromotions();

        expect(l.DiscountAmount).toBe(150);
    });
});
