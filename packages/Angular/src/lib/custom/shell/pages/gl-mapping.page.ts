import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';
import { OrdersEngineBase } from '@mj-biz-apps/orders-engine-base';

/** One resolved role for one product — what booking will do, and which hop decided it. */
export interface MappingRow {
  ProductID: string;
  Product: string;
  Role: string;
  /** Where the winning link lives: the product, a category, the company, or nowhere. */
  ResolvedAt: string;
  Code: string | null;
  Name: string | null;
}

/**
 * Products → GL mapping (orders UI plan §13.3) — the READ-ONLY order-side view of resolution.
 *
 * Deliberately has no editor. The authoritative GLAccountLink editor lives in **accounting →
 * Accounts → Account links**; GL data is never duplicated in orders, only linked (§13.3). This page
 * answers one question — "what will each product book to, and why?" — and sends you to accounting
 * to change it.
 *
 * Same engine walk as the Catalog and as booking itself; nothing is re-derived here.
 */
@Component({
  standalone: false,
  selector: 'mj-gl-mapping-page',
  templateUrl: './gl-mapping.page.html',
  styleUrls: ['./gl-mapping.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GLMappingPageComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;

  public Rows: MappingRow[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;
  public ShowUnresolvedOnly = false;

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

  public get Filtered(): MappingRow[] {
    return this.ShowUnresolvedOnly ? this.Rows.filter((r) => !r.Code) : this.Rows;
  }

  public get UnresolvedCount(): number {
    return this.Rows.filter((r) => !r.Code).length;
  }

  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const engine = OrdersEngineBase.Instance;
      await engine.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      const aeb = AccountingEngineBase.Instance;
      const asOf = new Date();

      this.Rows = engine.Products.map((p) => {
        const role = engine.RevenueRoleFor(p);
        const resolved = engine.ResolveAccount(p.ID, role, asOf, p.OwningCompanyID ?? undefined);
        const account = resolved ? aeb.GLAccountByID(resolved.GLAccountID) : null;
        return {
          ProductID: p.ID,
          Product: p.Name,
          Role: role,
          ResolvedAt: this.whereResolved(p.ID, role, asOf, p.OwningCompanyID),
          Code: account?.Code ?? null,
          Name: account?.Name ?? null,
        };
      }).sort((a, b) => a.Product.localeCompare(b.Product));
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Rows = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * WHICH hop won — the single most useful fact on this page.
   *
   * "Resolved" alone doesn't tell an operator whether the product is mapped directly or is riding a
   * category fallback that someone might reasonably delete tomorrow.
   */
  private whereResolved(productId: string, role: string, asOf: Date, companyId: string | null): string {
    const engine = OrdersEngineBase.Instance;
    const aeb = AccountingEngineBase.Instance;

    const productEntity = this.entityIdFor('MJ_BizApps_Orders: Products');
    if (productEntity && aeb.ResolveLinkedAccount(productEntity, productId, role, asOf)) return 'the product';

    const catEntity = this.entityIdFor('MJ_BizApps_Orders: Product Categories');
    if (catEntity) {
      let categoryID = engine.ProductByID(productId)?.ProductCategoryID ?? null;
      const seen = new Set<string>();
      while (categoryID && !seen.has(categoryID.toLowerCase())) {
        seen.add(categoryID.toLowerCase());
        if (aeb.ResolveLinkedAccount(catEntity, categoryID, role, asOf)) {
          return `category "${engine.ProductCategoryByID(categoryID)?.Name ?? '?'}"`;
        }
        categoryID = engine.ProductCategoryByID(categoryID)?.ParentID ?? null;
      }
    }

    const coEntity = this.entityIdFor('MJ: Companies');
    if (companyId && coEntity && aeb.ResolveLinkedAccount(coEntity, companyId, role, asOf)) return 'the company default';

    return 'nowhere';
  }

  private entityIdFor(entityName: string): string | null {
    return this.ProviderToUse.Entities.find((e) => e.Name === entityName)?.ID ?? null;
  }
}
