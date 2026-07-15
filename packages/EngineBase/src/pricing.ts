/**
 * pricing — the PURE price-resolution precedence (F9, BO-D33). Given the effective ProductPrices +
 * their PriceTiers for a product, resolve a suggested unit price for a quantity as of a date:
 *
 *   (contract override — reserved, not modeled yet)
 *   → PriceList/segment match  (a ProductPrice on the requested/active price list)
 *   → PriceTier quantity break (when the chosen ProductPrice is Tiered/Volume)
 *   → ProductPrice flat        (the chosen ProductPrice's Amount)
 *   → DIRECT ENTRY             (null — no rule applies; the caller keeps the typed UnitPrice)
 *
 * NEVER blocks: absent pricing rows simply resolve to `{ Amount: null, Source: 'DirectEntry' }`.
 * Pure (plain data in) so it is fully unit-testable and usable by the browser order-entry UI.
 *
 * CONNECTS TO:
 *   ENGINE: OrdersEngineBase.ResolvePrice (feeds this the cached ProductPrices/PriceTiers/PriceLists)
 */

export interface ProductPriceRow {
  ID: string;
  PriceListID: string | null;
  PricingModel: 'Flat' | 'Package' | 'PerUnit' | 'Tiered' | 'Usage' | 'Volume';
  Amount: number;
  MinQuantity: number | null;
  MaxQuantity: number | null;
  EffectiveFrom: Date;
  EffectiveTo: Date | null;
}

export interface PriceTierRow {
  ProductPriceID: string;
  MinQuantity: number;
  MaxQuantity: number | null;
  Amount: number;
  SortOrder: number;
}

export interface PriceListRow {
  ID: string;
  IsActive: boolean;
  EffectiveFrom: Date | null;
  EffectiveTo: Date | null;
}

export type PriceSource = 'PriceList' | 'PriceTier' | 'ProductPrice' | 'DirectEntry';

export interface ResolvePriceResult {
  /** null = no rule applied → the caller uses the directly-entered UnitPrice. */
  Amount: number | null;
  Source: PriceSource;
  ProductPriceID?: string;
}

export interface ResolvePriceInput {
  Quantity: number;
  AsOfDate: Date;
  /** Optional requested price list; when absent, the default (PriceListID = null) rows apply. */
  PriceListID?: string | null;
  ProductPrices: ProductPriceRow[];
  PriceTiers: PriceTierRow[];
  PriceLists: PriceListRow[];
}

const TIERED_MODELS = new Set(['Tiered', 'Volume']);

/** Resolve the suggested unit price. Deterministic; never throws. */
export function resolveProductPrice(input: ResolvePriceInput): ResolvePriceResult {
  const { Quantity, AsOfDate, PriceListID, ProductPrices, PriceTiers, PriceLists } = input;
  const activeListIDs = new Set(
    PriceLists.filter(l => l.IsActive && withinWindow(AsOfDate, l.EffectiveFrom, l.EffectiveTo)).map(l => l.ID),
  );
  const eligible = ProductPrices.filter(
    p =>
      withinWindow(AsOfDate, p.EffectiveFrom, p.EffectiveTo) &&
      Quantity >= (p.MinQuantity ?? 0) &&
      Quantity <= (p.MaxQuantity ?? Number.POSITIVE_INFINITY) &&
      // a listed price only counts when its list is active; a default (null list) always counts
      (p.PriceListID == null || activeListIDs.has(p.PriceListID)),
  );
  const chosen = pickProductPrice(eligible, PriceListID ?? null);
  if (!chosen) return { Amount: null, Source: 'DirectEntry' };

  if (TIERED_MODELS.has(chosen.PricingModel)) {
    const tier = pickTier(PriceTiers.filter(t => t.ProductPriceID === chosen.ID), Quantity);
    if (tier) return { Amount: tier.Amount, Source: 'PriceTier', ProductPriceID: chosen.ID };
  }
  return {
    Amount: chosen.Amount,
    Source: chosen.PriceListID != null ? 'PriceList' : 'ProductPrice',
    ProductPriceID: chosen.ID,
  };
}

/** Prefer the requested list, then any active listed price, then the default (null list); newest wins. */
function pickProductPrice(eligible: ProductPriceRow[], requestedListID: string | null): ProductPriceRow | undefined {
  const rank = (p: ProductPriceRow): number => {
    if (requestedListID != null && p.PriceListID === requestedListID) return 3;
    if (p.PriceListID != null) return 2; // any other active listed price
    return 1; // default (no list)
  };
  return [...eligible].sort((a, b) => rank(b) - rank(a) || b.EffectiveFrom.getTime() - a.EffectiveFrom.getTime())[0];
}

/** The tier whose [MinQuantity, MaxQuantity] contains the quantity (lowest SortOrder wins on overlap). */
function pickTier(tiers: PriceTierRow[], quantity: number): PriceTierRow | undefined {
  return [...tiers]
    .sort((a, b) => a.SortOrder - b.SortOrder)
    .find(t => quantity >= t.MinQuantity && quantity <= (t.MaxQuantity ?? Number.POSITIVE_INFINITY));
}

function withinWindow(asOf: Date, from: Date | null, to: Date | null): boolean {
  const t = asOf.getTime();
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
}
