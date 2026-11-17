import { describe, expect, it, vi } from 'vitest';
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { ProductPriceEntity, mjBizAppsOrdersProductPriceEntity } from '@mj-biz-apps/orders-entities';
import { PriceRulesCanCollide, ProductPriceEntityServer, type CollisionRule } from '../ProductPriceEntityServer';
import { BuildRevenueBandApplicability } from '@mj-biz-apps/orders-entities';

const ENTITY_KEY = 'MJ_BizApps_Orders: Product Prices';

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
});

/**
 * The collision test itself (#1004). Siblings are already matched on product/category, price list,
 * fee type and priority; this decides whether two such rules can both apply to one order line.
 */
describe('PriceRulesCanCollide', () => {
    const M = 1_000_000;
    const rule = (overrides: Partial<CollisionRule> = {}): CollisionRule => ({
        MinQuantity: null,
        MaxQuantity: null,
        EffectiveFrom: new Date('2026-01-01T00:00:00Z'),
        EffectiveTo: null,
        Applicability: null,
        ...overrides,
    });
    const band = (min: number | null, max: number | null) => BuildRevenueBandApplicability({ Min: min, Max: max });

    it('two plain rules with open quantity and open dates collide', () => {
        expect(PriceRulesCanCollide(rule(), rule())).toBe(true);
    });

    it('disjoint quantity bands or separate date windows do not collide', () => {
        expect(PriceRulesCanCollide(rule({ MinQuantity: 1, MaxQuantity: 9 }), rule({ MinQuantity: 10, MaxQuantity: null }))).toBe(false);
        expect(
            PriceRulesCanCollide(
                rule({ EffectiveFrom: new Date('2026-01-01'), EffectiveTo: new Date('2026-06-30') }),
                rule({ EffectiveFrom: new Date('2026-07-01'), EffectiveTo: null }),
            ),
        ).toBe(false);
    });

    it('two revenue bands with disjoint ranges do not collide, even adjacent ones', () => {
        expect(PriceRulesCanCollide(rule({ Applicability: band(0, 2 * M) }), rule({ Applicability: band(2 * M, 5 * M) }))).toBe(false);
        expect(PriceRulesCanCollide(rule({ Applicability: band(250 * M, null) }), rule({ Applicability: band(null, 2 * M) }))).toBe(false);
    });

    it('two revenue bands whose ranges overlap collide', () => {
        expect(PriceRulesCanCollide(rule({ Applicability: band(0, 5 * M) }), rule({ Applicability: band(2 * M, 10 * M) }))).toBe(true);
        expect(PriceRulesCanCollide(rule({ Applicability: band(0, null) }), rule({ Applicability: band(50 * M, null) }))).toBe(true);
    });

    it('a revenue band and a rule with no When collide: the plain rule applies to every organization', () => {
        expect(PriceRulesCanCollide(rule({ Applicability: band(0, 2 * M) }), rule())).toBe(true);
    });

    it('a When that is not a pure band is not consulted, so the rules collide', () => {
        const mixed = JSON.stringify({
            logic: 'and',
            filters: [
                { field: 'BillToOrganizationRevenue.AnnualRevenue', operator: 'gte', value: 0 },
                { field: 'BillToOrganization.Status', operator: 'eq', value: 'Active' },
            ],
        });
        expect(PriceRulesCanCollide(rule({ Applicability: mixed }), rule({ Applicability: band(5 * M, null) }))).toBe(true);
        expect(
            PriceRulesCanCollide(
                rule({ Applicability: JSON.stringify({ field: 'BillToOrganization.Status', operator: 'eq', value: 'Active' }) }),
                rule({ Applicability: JSON.stringify({ field: 'BillToOrganization.Status', operator: 'eq', value: 'Prospect' }) }),
            ),
        ).toBe(true);
    });

    it('disjoint revenue bands still do not collide when quantity bands and dates overlap', () => {
        expect(
            PriceRulesCanCollide(
                rule({ MinQuantity: 1, MaxQuantity: 100, Applicability: band(0, 2 * M) }),
                rule({ MinQuantity: 50, MaxQuantity: null, Applicability: band(2 * M, null) }),
            ),
        ).toBe(false);
    });
});
