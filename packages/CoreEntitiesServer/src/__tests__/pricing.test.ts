/**
 * pricing.test — the PURE F9 price-resolution precedence: list → tier → flat → direct entry.
 */
import { describe, it, expect } from 'vitest';
import { resolveProductPrice, type ProductPriceRow, type PriceTierRow, type PriceListRow } from '@mj-biz-apps/orders-engine-base';

const JULY = new Date('2026-07-15T00:00:00Z');
function pp(over: Partial<ProductPriceRow>): ProductPriceRow {
  return { ID: 'pp1', PriceListID: null, PricingModel: 'Flat', Amount: 100, MinQuantity: null, MaxQuantity: null, EffectiveFrom: new Date('2026-01-01T00:00:00Z'), EffectiveTo: null, ...over };
}
const noTiers: PriceTierRow[] = [];
const noLists: PriceListRow[] = [];

describe('resolveProductPrice — precedence', () => {
  it('DIRECT ENTRY (null) when there are no product prices', () => {
    const r = resolveProductPrice({ Quantity: 1, AsOfDate: JULY, ProductPrices: [], PriceTiers: noTiers, PriceLists: noLists });
    expect(r.Amount).toBeNull();
    expect(r.Source).toBe('DirectEntry');
  });

  it('a default flat ProductPrice resolves to its Amount', () => {
    const r = resolveProductPrice({ Quantity: 1, AsOfDate: JULY, ProductPrices: [pp({ Amount: 100 })], PriceTiers: noTiers, PriceLists: noLists });
    expect(r.Amount).toBe(100);
    expect(r.Source).toBe('ProductPrice');
  });

  it('an active PriceList price wins over the default; requested list wins over other active lists', () => {
    const lists: PriceListRow[] = [
      { ID: 'listA', IsActive: true, EffectiveFrom: null, EffectiveTo: null },
      { ID: 'listB', IsActive: true, EffectiveFrom: null, EffectiveTo: null },
    ];
    const prices = [
      pp({ ID: 'def', PriceListID: null, Amount: 100 }),
      pp({ ID: 'a', PriceListID: 'listA', Amount: 90 }),
      pp({ ID: 'b', PriceListID: 'listB', Amount: 80 }),
    ];
    const req = resolveProductPrice({ Quantity: 1, AsOfDate: JULY, PriceListID: 'listB', ProductPrices: prices, PriceTiers: noTiers, PriceLists: lists });
    expect(req.Amount).toBe(80);
    expect(req.Source).toBe('PriceList');
    // no requested list → a listed active price still beats the default
    const any = resolveProductPrice({ Quantity: 1, AsOfDate: JULY, ProductPrices: prices, PriceTiers: noTiers, PriceLists: lists });
    expect(any.Source).toBe('PriceList');
  });

  it('an INACTIVE list price is ignored (falls back to the default)', () => {
    const lists: PriceListRow[] = [{ ID: 'listX', IsActive: false, EffectiveFrom: null, EffectiveTo: null }];
    const prices = [pp({ ID: 'def', PriceListID: null, Amount: 100 }), pp({ ID: 'x', PriceListID: 'listX', Amount: 50 })];
    const r = resolveProductPrice({ Quantity: 1, AsOfDate: JULY, PriceListID: 'listX', ProductPrices: prices, PriceTiers: noTiers, PriceLists: lists });
    expect(r.Amount).toBe(100);
    expect(r.Source).toBe('ProductPrice');
  });

  it('a Tiered ProductPrice resolves the quantity break', () => {
    const price = pp({ ID: 'tp', PricingModel: 'Tiered', Amount: 100 });
    const tiers: PriceTierRow[] = [
      { ProductPriceID: 'tp', MinQuantity: 1, MaxQuantity: 9, Amount: 100, SortOrder: 1 },
      { ProductPriceID: 'tp', MinQuantity: 10, MaxQuantity: 99, Amount: 90, SortOrder: 2 },
      { ProductPriceID: 'tp', MinQuantity: 100, MaxQuantity: null, Amount: 80, SortOrder: 3 },
    ];
    expect(resolveProductPrice({ Quantity: 5, AsOfDate: JULY, ProductPrices: [price], PriceTiers: tiers, PriceLists: noLists }).Amount).toBe(100);
    const midR = resolveProductPrice({ Quantity: 25, AsOfDate: JULY, ProductPrices: [price], PriceTiers: tiers, PriceLists: noLists });
    expect(midR.Amount).toBe(90);
    expect(midR.Source).toBe('PriceTier');
    expect(resolveProductPrice({ Quantity: 500, AsOfDate: JULY, ProductPrices: [price], PriceTiers: tiers, PriceLists: noLists }).Amount).toBe(80);
  });

  it('respects the effective window and quantity range', () => {
    const expired = pp({ ID: 'old', Amount: 100, EffectiveTo: new Date('2026-06-30T00:00:00Z') });
    expect(resolveProductPrice({ Quantity: 1, AsOfDate: JULY, ProductPrices: [expired], PriceTiers: noTiers, PriceLists: noLists }).Source).toBe('DirectEntry');
    const ranged = pp({ ID: 'r', Amount: 100, MinQuantity: 10, MaxQuantity: 20 });
    expect(resolveProductPrice({ Quantity: 5, AsOfDate: JULY, ProductPrices: [ranged], PriceTiers: noTiers, PriceLists: noLists }).Source).toBe('DirectEntry');
    expect(resolveProductPrice({ Quantity: 15, AsOfDate: JULY, ProductPrices: [ranged], PriceTiers: noTiers, PriceLists: noLists }).Amount).toBe(100);
  });
});
