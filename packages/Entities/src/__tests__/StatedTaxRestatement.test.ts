/**
 * A tax a caller stated on a saved order is restated on the next walk (#487).
 *
 * The walk re-resolves tax on every save and the saver replaces the tax rows to match, so a stated
 * or overridden tax that only lived as a request in memory was replaced at confirm by the tax
 * resolved from the ship-to address. `ReadStatedTaxCharges` reads it back off the saved rows.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

const { views } = vi.hoisted(() => ({
    views: [] as Array<{ params: { EntityName: string; ExtraFilter?: string }; results: unknown[] }>,
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

const { ReadStatedTaxCharges } = await import('../pricing/ChargeEngine.js');

const TYPES = 'MJ_BizApps_Orders: Charge Types';
const CHARGES = 'MJ_BizApps_Orders: Order Charges';
const ALLOCATIONS = 'MJ_BizApps_Orders: Order Charge Allocations';

function queue(entityName: string, results: unknown[]) {
    views.push({ params: { EntityName: entityName }, results });
}

const read = (lineIDs: Array<string | null>, skip: string[] = [], requested: string[] = []) =>
    ReadStatedTaxCharges('order-1', lineIDs, skip, requested, {} as never, {} as never);

beforeEach(() => {
    views.length = 0;
});

describe('ReadStatedTaxCharges', () => {
    it('restates a stated rate, spread across the order as it was', async () => {
        queue(TYPES, [{ ID: 'type-tax', Code: 'SalesTax' }]);
        queue(CHARGES, [{ ID: 'c1', ChargeTypeID: 'TYPE-TAX', Rate: 0.02, Amount: 20, IsOverridden: false }]);
        queue(ALLOCATIONS, [
            { OrderChargeID: 'c1', OrderLineID: 'line-1' },
            { OrderChargeID: 'c1', OrderLineID: 'line-2' },
        ]);

        const out = await read(['line-1', 'line-2']);

        expect(out).toEqual([
            { Code: 'SalesTax', TargetLineID: null, Rate: 0.02, Amount: null, TaxJurisdictionID: null, TaxRateID: null },
        ]);
        // Resolved rows always name their rate row and are never overridden.
        expect(views[1].params.ExtraFilter).toContain('(IsOverridden = 1 OR TaxRateID IS NULL)');
    });

    it('restates an override with its reason, its computed amount and who made it', async () => {
        const at = new Date('2026-10-01T12:00:00Z');
        queue(TYPES, [{ ID: 'type-tax', Code: 'SalesTax' }]);
        queue(CHARGES, [
            {
                ID: 'c1', ChargeTypeID: 'type-tax', Rate: 0.06, Amount: 0, IsOverridden: true, ComputedAmount: 60,
                OverrideReason: 'resale certificate', OverriddenByUserID: 'user-a', OverriddenAt: at,
            },
        ]);
        queue(ALLOCATIONS, [{ OrderChargeID: 'c1', OrderLineID: 'line-1' }]);

        const [charge] = await read(['line-1']);

        expect(charge).toMatchObject({
            Code: 'SalesTax', Rate: 0.06, Amount: null, OverrideAmount: 0,
            OverrideReason: 'resale certificate', OverriddenByUserID: 'user-a', OverriddenAt: at,
        });
        expect(charge.TargetLineID).toBeNull();
    });

    it('restates a stated amount, and targets the one line it sat on', async () => {
        queue(TYPES, [{ ID: 'type-tax', Code: 'SalesTax' }]);
        queue(CHARGES, [{ ID: 'c1', ChargeTypeID: 'type-tax', Rate: null, Amount: 12.5, IsOverridden: false }]);
        queue(ALLOCATIONS, [{ OrderChargeID: 'c1', OrderLineID: 'line-2' }]);

        const [charge] = await read(['line-1', 'line-2', null]);

        expect(charge).toMatchObject({ Amount: 12.5, Rate: null, TargetLineID: '1' });
    });

    it('restates a waiver that came to nothing across the order, since no allocation records its line', async () => {
        queue(TYPES, [{ ID: 'type-tax', Code: 'SalesTax' }]);
        queue(CHARGES, [
            { ID: 'c1', ChargeTypeID: 'type-tax', Rate: 0.06, Amount: 0, IsOverridden: true, ComputedAmount: 60, OverrideReason: 'exempt' },
            { ID: 'c2', ChargeTypeID: 'type-tax', Rate: null, Amount: 15, IsOverridden: false },
        ]);
        queue(ALLOCATIONS, []);

        const out = await read(['line-1', 'line-2']);

        // The waiver comes back; the 15 whose allocations went with a removed line does not.
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ OverrideAmount: 0, OverrideReason: 'exempt', TargetLineID: null });
    });

    it("skips a reversal line's mirrored tax, which the walk re-derives", async () => {
        queue(TYPES, [{ ID: 'type-tax', Code: 'SalesTax' }]);
        queue(CHARGES, [{ ID: 'c1', ChargeTypeID: 'type-tax', Rate: null, Amount: -6, IsOverridden: false }]);
        queue(ALLOCATIONS, [{ OrderChargeID: 'c1', OrderLineID: 'line-1' }]);

        expect(await read(['line-1'], ['LINE-1'])).toEqual([]);
    });

    it('restates nothing when the caller states a tax of its own on this walk', async () => {
        queue(TYPES, [{ ID: 'type-tax', Code: 'VAT' }]);

        expect(await read(['line-1'], [], ['Shipping', 'vat'])).toEqual([]);
        expect(views).toHaveLength(1);
    });

    it('reads nothing for an order with no saved lines', async () => {
        expect(await read([null])).toEqual([]);
        expect(views).toEqual([]);
    });
});
