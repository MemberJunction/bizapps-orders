import { describe, expect, it, vi } from 'vitest';
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    ORGANIZATION_REVENUE_SOURCE,
    OrdersEngine,
    ProductPriceEntity,
    mjBizAppsOrdersProductPriceEntity,
} from '@mj-biz-apps/orders-entities';
import { ProductPriceEntityServer } from '../ProductPriceEntityServer';

const ENTITY_KEY = 'MJ_BizApps_Orders: Product Prices';

function bandWhen(min: number, max: number | null, maxOp: 'lt' | 'lte' = 'lt'): string {
    const field = `${ORGANIZATION_REVENUE_SOURCE}.AnnualRevenue`;
    const filters: Array<Record<string, unknown>> = [{ field, operator: 'gte', value: min }];
    if (max != null) filters.push({ field, operator: maxOp, value: max });
    return JSON.stringify({ logic: 'and', filters });
}

/**
 * Registered on the server, `ProductPriceEntityServer` replaces `ProductPriceEntity` for every
 * product price rule created there. It must extend `ProductPriceEntity` (rather than the generated
 * `mjBizAppsOrdersProductPriceEntity` directly) so the server keeps `ProductPriceEntity.Validate`'s
 * synchronous rule checks (e.g. ProductID vs ProductCategoryIDXOR, Recurring cadence requirement)
 * alongside `ProductPriceEntityServer.ValidateAsync`'s priority-collision check, and so
 * `ClassFactory` sees a single linear inheritance chain with no unrelated-class collision.
 */
describe('ProductPriceEntityServer', () => {
    it('extends ProductPriceEntity -> mjBizAppsOrdersProductPriceEntity in a single linear chain', () => {
        expect(ProductPriceEntityServer.prototype).toBeInstanceOf(ProductPriceEntity);
        expect(ProductPriceEntityServer.prototype).toBeInstanceOf(mjBizAppsOrdersProductPriceEntity);
    });

    it('is the winning registration for MJ_BizApps_Orders: Product Prices with no sibling collisions', () => {
        const factory = MJGlobal.Instance.ClassFactory;
        const registration = factory.GetRegistration(BaseEntity, ENTITY_KEY);
        expect(registration?.SubClass).toBe(ProductPriceEntityServer);

        const all = factory.GetAllRegistrations(BaseEntity, ENTITY_KEY);
        expect(all.length).toBeGreaterThanOrEqual(2);
        for (const reg of all) {
            const isLinear =
                reg.SubClass === ProductPriceEntityServer ||
                ProductPriceEntityServer.prototype instanceof reg.SubClass;
            expect(
                isLinear,
                `Expected ${reg.SubClass.name} to be an ancestor of ProductPriceEntityServer`
            ).toBe(true);
        }
    });

    it('emits zero ClassFactory.Register unrelated-class warnings when registered after ProductPriceEntity', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const factory = MJGlobal.Instance.ClassFactory;
            factory.Register(BaseEntity, ProductPriceEntity, ENTITY_KEY);
            factory.Register(BaseEntity, ProductPriceEntityServer, ENTITY_KEY);

            const collisionWarnings = warnSpy.mock.calls
                .map(args => String(args[0] ?? ''))
                .filter(msg => msg.includes('ClassFactory.Register') && msg.includes('unrelated class'));
            expect(collisionWarnings).toEqual([]);
        } finally {
            warnSpy.mockRestore();
        }
    });

    describe('revenue-band priority collision (#1004)', () => {
        const makeCandidate = (applicability: string | null) => {
            const candidate = Object.create(ProductPriceEntityServer.prototype) as ProductPriceEntityServer;
            Object.defineProperties(candidate, {
                ID: { value: 'price-new', configurable: true },
                IsSaved: { value: false, configurable: true },
                Status: { value: 'Active', configurable: true },
                ProductID: { value: 'prod-1', configurable: true },
                ProductCategoryID: { value: null, configurable: true },
                PriceListID: { value: null, configurable: true },
                FeeType: { value: 'Standard', configurable: true },
                Priority: { value: 0, configurable: true },
                MinQuantity: { value: null, configurable: true },
                MaxQuantity: { value: null, configurable: true },
                EffectiveFrom: { value: new Date('2026-01-01T00:00:00Z'), configurable: true },
                EffectiveTo: { value: null, configurable: true },
                Applicability: { value: applicability, configurable: true },
                ProviderToUse: { value: {}, configurable: true },
                ContextCurrentUser: { value: {}, configurable: true },
            });
            vi.spyOn(ProductPriceEntity.prototype, 'ValidateAsync').mockResolvedValue({
                Success: true,
                Errors: [],
            } as never);
            vi.spyOn(OrdersEngine.Instance, 'Config').mockResolvedValue(undefined);
            vi.spyOn(OrdersEngine.Instance, 'Loaded', 'get').mockReturnValue(true);
            return candidate;
        };

        it('allows a second revenue-band row when the revenue bands are disjoint (half-open touching edge)', async () => {
            vi.spyOn(OrdersEngine.Instance, 'ProductPrices', 'get').mockReturnValue([
                {
                    ID: 'price-existing',
                    Status: 'Active',
                    ProductID: 'prod-1',
                    ProductCategoryID: null,
                    PriceListID: null,
                    FeeType: 'Standard',
                    Priority: 0,
                    MinQuantity: null,
                    MaxQuantity: null,
                    EffectiveFrom: new Date('2026-01-01T00:00:00Z'),
                    EffectiveTo: null,
                    Description: 'Under $1M rev',
                    Applicability: bandWhen(0, 1_000_000, 'lt'),
                } as never,
            ]);
            const candidate = makeCandidate(bandWhen(1_000_000, 2_000_000, 'lt'));
            const result = await candidate.ValidateAsync();
            expect(result.Success).toBe(true);
            expect(result.Errors).toHaveLength(0);
        });

        it('refuses a second revenue-band row when the revenue bands overlap', async () => {
            vi.spyOn(OrdersEngine.Instance, 'ProductPrices', 'get').mockReturnValue([
                {
                    ID: 'price-existing',
                    Status: 'Active',
                    ProductID: 'prod-1',
                    ProductCategoryID: null,
                    PriceListID: null,
                    FeeType: 'Standard',
                    Priority: 0,
                    MinQuantity: null,
                    MaxQuantity: null,
                    EffectiveFrom: new Date('2026-01-01T00:00:00Z'),
                    EffectiveTo: null,
                    Description: 'Under $2M rev',
                    Applicability: bandWhen(0, 2_000_000, 'lt'),
                } as never,
            ]);
            const candidate = makeCandidate(bandWhen(1_000_000, 5_000_000, 'lt'));
            const result = await candidate.ValidateAsync();
            expect(result.Success).toBe(false);
            expect(result.Errors[0]?.Message).toMatch(/collides with an existing one/);
        });
    });
});
