import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { UUIDsEqual } from '@memberjunction/global';
import { OrdersEngineBase } from '@mj-biz-apps/orders-engine-base';

export interface PriceListRow {
  ID: string;
  Code: string;
  Name: string;
  Segment: string | null;
  IsActive: boolean;
  EffectiveFrom: Date | null;
  EffectiveTo: Date | null;
  PriceCount: number;
}

export interface ProductPriceRow {
  ID: string;
  Product: string;
  /** The product's own handles — what a human searches by, and the id they can copy. */
  ProductID: string;
  ProductSKU: string | null;
  PricingModel: string;
  Amount: number;
  MinQuantity: number | null;
  MaxQuantity: number | null;
  EffectiveFrom: Date;
  EffectiveTo: Date | null;
  Tiers: Array<{ MinQuantity: number; MaxQuantity: number | null; Amount: number }>;
  /** True when this price OVERLAPS another for the same product — an ambiguous rule. */
  Overlaps: boolean;
}

/**
 * Products → Pricing (orders UI plan §13.3).
 *
 * A price list, its product prices, and their tiers — with the thing §13.3 actually asks for:
 * **overlap warnings**. Two prices for the same product whose quantity bands and date windows both
 * overlap means `resolveProductPrice` has more than one eligible row and picks one by its own
 * precedence. That is not wrong, but it IS ambiguous — the operator almost certainly did not mean
 * to write two rules for the same quantity on the same day, and the order editor will silently use
 * whichever wins.
 *
 * All data comes from the engine's cache (no round-trip).
 */
@Component({
  standalone: false,
  selector: 'mj-pricing-page',
  templateUrl: './pricing.page.html',
  styleUrls: ['./shell-table.css', './pricing.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingPageComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;

  public Lists: PriceListRow[] = [];
  public SelectedListID: string | null = null;
  public Prices: ProductPriceRow[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;
  /** One box over the price rows: product name / SKU / product ID / price-rule ID. */
  public Search = '';

  async ngOnInit(): Promise<void> {
    this.refreshSub = this.pageRefresh.OnRefresh(() => this.Refresh());
    await this.load();
  }

  ngOnDestroy(): void {
    // Unsubscribing is what keeps the header's Refresh page-aware: a destroyed page stops counting.
    this.refreshSub?.unsubscribe();
  }
  public Refresh(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const engine = OrdersEngineBase.Instance;
      await engine.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);

      this.Lists = engine.PriceLists.map((l) => ({
        ID: l.ID,
        Code: l.Code,
        Name: l.Name,
        Segment: l.Segment,
        IsActive: l.IsActive,
        EffectiveFrom: l.EffectiveFrom,
        EffectiveTo: l.EffectiveTo,
        PriceCount: engine.ProductPrices.filter((p) => p.PriceListID && UUIDsEqual(p.PriceListID, l.ID)).length,
      })).sort((a, b) => a.Name.localeCompare(b.Name));

      if (!this.SelectedListID && this.Lists.length) this.SelectedListID = this.Lists[0].ID;
      this.loadPrices();
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Lists = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  public SelectList(id: string): void {
    this.SelectedListID = id;
    this.loadPrices();
    this.cdr.markForCheck();
  }

  public get SelectedList(): PriceListRow | null {
    return this.Lists.find((l) => this.SelectedListID && UUIDsEqual(l.ID, this.SelectedListID)) ?? null;
  }

  private loadPrices(): void {
    const engine = OrdersEngineBase.Instance;
    if (!this.SelectedListID) {
      this.Prices = [];
      return;
    }
    const inList = engine.ProductPrices.filter((p) => p.PriceListID && UUIDsEqual(p.PriceListID, this.SelectedListID as string));

    this.Prices = inList
      .map((p) => ({
        ID: p.ID,
        Product: engine.ProductByID(p.ProductID)?.Name ?? '(unknown product)',
        ProductID: p.ProductID,
        ProductSKU: engine.ProductByID(p.ProductID)?.SKU ?? null,
        PricingModel: p.PricingModel,
        Amount: p.Amount,
        MinQuantity: p.MinQuantity,
        MaxQuantity: p.MaxQuantity,
        EffectiveFrom: p.EffectiveFrom,
        EffectiveTo: p.EffectiveTo,
        Tiers: engine.PriceTiers.filter((t) => UUIDsEqual(t.ProductPriceID, p.ID))
          .sort((a, b) => a.SortOrder - b.SortOrder)
          .map((t) => ({ MinQuantity: t.MinQuantity, MaxQuantity: t.MaxQuantity, Amount: t.Amount })),
        Overlaps: inList.some((other) => other.ID !== p.ID && UUIDsEqual(other.ProductID, p.ProductID) && overlaps(p, other)),
      }))
      .sort((a, b) => a.Product.localeCompare(b.Product));
  }

  /**
   * The rows the grid shows. Filters CLIENT-SIDE over the engine-cached prices already loaded for
   * the selected list — never a round-trip per keystroke.
   */
  public get FilteredPrices(): ProductPriceRow[] {
    const q = this.Search.trim().toLowerCase();
    if (!q) return this.Prices;
    // Product name + SKU lead (what an operator knows); the product ID and the rule's own ID match
    // too, for anyone pasting one. Lowercased `includes` — a text match, not a UUID equality test.
    return this.Prices.filter(
      (p) =>
        p.Product.toLowerCase().includes(q) ||
        (p.ProductSKU ?? '').toLowerCase().includes(q) ||
        p.ProductID.toLowerCase().includes(q) ||
        p.ID.toLowerCase().includes(q),
    );
  }

  public OnFilterChanged(): void {
    this.cdr.markForCheck();
  }

  /**
   * DELIBERATELY counted over every price in the list, never the filtered set — an ambiguity warning
   * a search box can mute is not a warning.
   */
  public get OverlapCount(): number {
    return this.Prices.filter((p) => p.Overlaps).length;
  }

  public QtyBand(p: ProductPriceRow): string {
    const min = p.MinQuantity ?? 0;
    return p.MaxQuantity == null ? `${min}+` : `${min}–${p.MaxQuantity}`;
  }

  public IsListSelected(l: PriceListRow): boolean {
    return !!this.SelectedListID && UUIDsEqual(l.ID, this.SelectedListID);
  }
}

/** Two prices for one product collide when their quantity bands AND date windows both overlap. */
function overlaps(
  a: { MinQuantity: number | null; MaxQuantity: number | null; EffectiveFrom: Date; EffectiveTo: Date | null },
  b: { MinQuantity: number | null; MaxQuantity: number | null; EffectiveFrom: Date; EffectiveTo: Date | null },
): boolean {
  const aMin = a.MinQuantity ?? 0;
  const aMax = a.MaxQuantity ?? Number.POSITIVE_INFINITY;
  const bMin = b.MinQuantity ?? 0;
  const bMax = b.MaxQuantity ?? Number.POSITIVE_INFINITY;
  const qtyOverlap = aMin <= bMax && bMin <= aMax;
  if (!qtyOverlap) return false;

  const aFrom = new Date(a.EffectiveFrom).getTime();
  const aTo = a.EffectiveTo ? new Date(a.EffectiveTo).getTime() : Number.POSITIVE_INFINITY;
  const bFrom = new Date(b.EffectiveFrom).getTime();
  const bTo = b.EffectiveTo ? new Date(b.EffectiveTo).getTime() : Number.POSITIVE_INFINITY;
  return aFrom <= bTo && bFrom <= aTo;
}
