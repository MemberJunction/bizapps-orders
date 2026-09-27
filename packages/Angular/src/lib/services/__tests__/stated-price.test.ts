import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderHeaderEntity } from '@mj-biz-apps/orders-entities';

/**
 * golive #275 — a saved price override showed list price as the line total.
 *
 * The pass told the engine to hold a line's price only while `UnitPrice` was dirty. Once the
 * override was saved and the order reopened nothing was dirty, the engine resolved list price, and
 * the line total and header Total showed it while the stored line carried the override.
 *
 * Both paths are covered: the local walk, and the server walk a promotion code escalates to.
 */

const LIST_PRICE = 5000;

const hoisted = vi.hoisted(() => ({
    remoteInputs: [] as Array<{ Lines: Array<{ UnitPrice: number | null; Quantity: number }> }>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class FakeMetadata {
        static Provider = {};
        CurrentUser = {};
        async GetEntityObject() {
            return { NewRecord: () => true } as Record<string, unknown>;
        }
    }
    return { ...actual, Metadata: FakeMetadata };
});

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    /** Resolves list price for any line the caller did not pin — what the real walk does. */
    class FakePricingService {
        async Price(ctx: { Lines: Array<{ UnitPrice?: number }> }) {
            for (const line of ctx.Lines) if (line.UnitPrice == null) line.UnitPrice = LIST_PRICE;
            return { PriceComponents: new Map(), TaxReasons: new Map(), EngineDefaults: new Map() };
        }
    }
    class FakePriceOrderOperation {
        async Execute(input: { Lines: Array<{ UnitPrice: number | null; Quantity: number }> }) {
            hoisted.remoteInputs.push(input);
            const lines = input.Lines.map((l) => {
                const unit = l.UnitPrice ?? LIST_PRICE;
                return { UnitPrice: unit, DiscountAmount: 0, LineTotalNet: unit * l.Quantity };
            });
            const net = lines.reduce((t, l) => t + l.LineTotalNet, 0);
            return { Success: true, Output: { Success: true, Lines: lines, Totals: { Net: net, Discount: 0, Gross: net } } };
        }
    }
    return {
        ...actual,
        CanPriceOrderLocally: async () => ({ CanPriceLocally: true }),
        OrderPricingService: FakePricingService,
        OrdersPriceOrderOperation: FakePriceOrderOperation,
    };
});

const { MJOPricingScheduler } = await import('../pricing-scheduler.service');

interface StoredLine {
    ID: string;
    Quantity: number;
    UnitPrice: number;
    PriceOverridden: boolean;
    /** True when `UnitPrice` has been edited since the line was loaded. */
    Edited?: boolean;
}

/** A saved order as it reads after a reload: the fields `PriceNow` touches, nothing dirty unless said. */
function savedOrder(lines: StoredLine[], promotionCodes: string[] = []): OrderHeaderEntity {
    const items = lines.map((l) => ({
        ID: l.ID,
        Quantity: l.Quantity,
        UnitPrice: l.UnitPrice,
        DiscountPct: 0,
        DiscountAmount: 0,
        IsSaved: true,
        GetFieldByName: (name: string) => {
            if (name === 'UnitPrice') return { Value: l.UnitPrice, Dirty: l.Edited === true };
            if (name === 'PriceOverridden') return { Value: l.PriceOverridden, Dirty: false };
            return undefined;
        },
    }));
    return {
        ID: 'order-1',
        CompanyID: 'company-1',
        OrderDate: null,
        Lines: { Count: items.length, Items: items },
        Adjustments: { Items: [] },
        PromotionCodes: { Codes: promotionCodes },
    } as unknown as OrderHeaderEntity;
}

async function price(order: OrderHeaderEntity) {
    const scheduler = new MJOPricingScheduler();
    let state: { Result: { Lines: Array<{ NetAmount: number | null }>; Totals: { GrossTotal: number } } | null } | null = null;
    await scheduler.PriceNow(order, (s) => (state = s as typeof state));
    return state!.Result!;
}

const OVERRIDE: StoredLine = { ID: 'L1', Quantity: 1, UnitPrice: 6000, PriceOverridden: true };

describe('a saved price override, reopened with nothing dirty', () => {
    beforeEach(() => {
        hoisted.remoteInputs.length = 0;
    });

    it('is held at its stored price by the local walk', async () => {
        const result = await price(savedOrder([OVERRIDE]));
        expect(result.Lines[0].NetAmount).toBe(6000);
        expect(result.Totals.GrossTotal).toBe(6000);
    });

    it('is sent to the server walk as a stated price', async () => {
        const result = await price(savedOrder([OVERRIDE], ['PROMO']));
        expect(hoisted.remoteInputs[0].Lines[0].UnitPrice).toBe(6000);
        expect(result.Lines[0].NetAmount).toBe(6000);
        expect(result.Totals.GrossTotal).toBe(6000);
    });

    it('is multiplied by quantity, not replaced by list price', async () => {
        const result = await price(savedOrder([{ ...OVERRIDE, Quantity: 3 }]));
        expect(result.Lines[0].NetAmount).toBe(18000);
        expect(result.Totals.GrossTotal).toBe(18000);
    });
});

describe('a saved line with no override', () => {
    beforeEach(() => {
        hoisted.remoteInputs.length = 0;
    });

    it('is still left to the engine to resolve', async () => {
        const stored: StoredLine = { ID: 'L1', Quantity: 1, UnitPrice: 4000, PriceOverridden: false };
        await price(savedOrder([stored], ['PROMO']));
        expect(hoisted.remoteInputs[0].Lines[0].UnitPrice).toBeNull();
    });

    it('is held while its price is being edited', async () => {
        const edited: StoredLine = { ID: 'L1', Quantity: 1, UnitPrice: 4500, PriceOverridden: false, Edited: true };
        await price(savedOrder([edited], ['PROMO']));
        expect(hoisted.remoteInputs[0].Lines[0].UnitPrice).toBe(4500);
    });
});
