import { describe, expect, it, vi } from 'vitest';
import type { OrderHeaderEntity } from '@mj-biz-apps/orders-entities';

/**
 * #405 — on the browser pricing path the header Total was the sum of line NETS.
 *
 * The walk had already stamped `LineTax` and `ChargeAmount` onto the unsaved lines, but the local
 * read-back never read them, so a saved order's Total left out tax and charges while its Balance
 * included them. `Orders.PriceOrder` reports gross as net + charges + tax; the local path must too.
 *
 * The walk itself is stubbed here: it stamps fixed amounts on the lines the scheduler hands it,
 * which is all this test needs to see whether the read-back uses them.
 */

vi.mock('@memberjunction/core', async (importActual) => {
    const actual = await importActual<typeof import('@memberjunction/core')>();
    class FakeMetadata {
        static Provider = {};
        CurrentUser = {};
        async GetEntityObject() {
            return { NewRecord() {} };
        }
    }
    return { ...actual, Metadata: FakeMetadata };
});

vi.mock('@mj-biz-apps/orders-entities', async (importActual) => {
    const actual = await importActual<typeof import('@mj-biz-apps/orders-entities')>();
    class FakePricingService {
        async Price(input: { Lines: Array<Record<string, number>> }) {
            for (const line of input.Lines) {
                line.UnitPrice = 100;
                line.ChargeAmount = 4;
                line.LineTax = 8.25;
            }
            return { PriceComponents: new Map(), TaxReasons: new Map(), EngineDefaults: new Map() };
        }
    }
    return {
        ...actual,
        CanPriceOrderLocally: async () => ({ CanPriceLocally: true }),
        OrderPricingService: FakePricingService,
    };
});

const { MJOPricingScheduler } = await import('../pricing-scheduler.service');

function orderWithOneLine(): OrderHeaderEntity {
    const line = {
        ID: 'L1',
        ProductID: 'P1',
        Quantity: 2,
        DiscountPct: 0,
        DiscountAmount: 0,
        GetFieldByName: () => undefined,
    };
    return {
        ID: 'O1',
        CompanyID: 'C1',
        PromotionCodes: { Codes: [] },
        Adjustments: { Items: [] },
        Lines: { Items: [line], Count: 1 },
    } as unknown as OrderHeaderEntity;
}

describe('local pricing — GrossTotal', () => {
    it('includes the tax and charges the walk stamped on each line', async () => {
        const states: Array<{ Result: { Totals: { NetTotal: number; GrossTotal: number } } | null }> = [];
        await new MJOPricingScheduler().PriceNow(orderWithOneLine(), (s) => states.push(s as never));

        const totals = states.at(-1)?.Result?.Totals;
        expect(totals?.NetTotal).toBe(200);
        expect(totals?.GrossTotal).toBe(212.25);
    });
});
