import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { UUIDsEqual } from '@memberjunction/global';
import { MJStatBadgeVariant } from '@memberjunction/ng-ui-components';
import { CompanyScopeService, CrossAppLinkService, type GlResolutionResult, type GlResolutionStep } from '@mj-biz-apps/accounting-ng';
// From its OWN package, not re-exported through accounting-ng (MJ CLAUDE.md rule 5: no re-exports
// between packages — import from the source that defines it).
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';
import { OrdersEngineBase } from '@mj-biz-apps/orders-engine-base';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';

/** A catalog row, flattened so the template does no entity work. */
export interface CatalogRow {
  ID: string;
  Name: string;
  SKU: string | null;
  Category: string;
  Type: string;
  RevenueRecognitionType: string;
  DeferredRecognitionShape: string | null;
  IsActive: boolean;
  Status: string;
  /** The GL role this product books revenue to — the engine's rule, not a local copy. */
  Role: string;
  /** Null = it does NOT resolve → this product fails at Confirm. The tripwire. */
  ResolvedCode: string | null;
  ResolvedName: string | null;
}

/**
 * Products → Catalog (orders UI plan §13.3).
 *
 * The screen's real job is the **tripwire**: a product whose revenue role does not resolve to a GL
 * account will BLOCK Confirm — loudly, at the worst possible moment, in front of a customer. This
 * page surfaces that before an order exists, which is the whole point of showing GL resolution in a
 * product catalog.
 *
 * Resolution runs through `OrdersEngineBase.ResolveAccount` — the SAME product → category tree →
 * company-default walk that booking uses — and the role comes from `RevenueRoleFor`, also the
 * engine's. Nothing about the chain is re-implemented here, so the catalog cannot claim a product is
 * fine when booking would reject it (or vice versa).
 *
 * The chain is then handed to accounting's `<mj-gl-resolution-preview>` for rendering: an
 * accounting-domain component, imported, not rebuilt (§0 placement ruling).
 *
 * Everything resolves CLIENT-SIDE off the two engines' caches — no round-trip per product.
 */
@Component({
  standalone: false,
  selector: 'mj-catalog-page',
  templateUrl: './catalog.page.html',
  styleUrls: ['./catalog.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPageComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;
  private links = inject(CrossAppLinkService);
  public Scope = inject(CompanyScopeService);

  public NavError: string | null = null;
  public Rows: CatalogRow[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;
  public Search = '';
  public ShowUnmappedOnly = false;

  /** The product whose resolution chain is open in the slide-in. */
  public SelectedID: string | null = null;
  public Preview: GlResolutionResult | null = null;

  async ngOnInit(): Promise<void> {
    this.refreshSub = this.pageRefresh.OnRefresh(() => this.Refresh());
    await this.load();
  }

  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      await this.Scope.Load(this.ProviderToUse.CurrentUser, this.ProviderToUse);
      const engine = OrdersEngineBase.Instance;
      await engine.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      this.Rows = engine.Products.map((p) => this.toRow(p, engine)).sort((a, b) => a.Name.localeCompare(b.Name));
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Rows = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  private toRow(p: mjBizAppsOrdersProductEntity, engine: OrdersEngineBase): CatalogRow {
    const role = engine.RevenueRoleFor(p);
    const resolved = engine.ResolveAccount(p.ID, role, new Date(), p.OwningCompanyID ?? undefined);
    const account = resolved ? AccountingEngineBase.Instance.GLAccountByID(resolved.GLAccountID) : null;
    return {
      ID: p.ID,
      Name: p.Name,
      SKU: p.SKU,
      Category: p.ProductCategoryID ? (engine.ProductCategoryByID(p.ProductCategoryID)?.Name ?? '—') : '—',
      Type: engine.ProductTypeByID(p.ProductTypeID)?.Name ?? '—',
      RevenueRecognitionType: p.RevenueRecognitionType,
      DeferredRecognitionShape: p.DeferredRecognitionShape,
      IsActive: p.IsActive,
      Status: p.Status,
      Role: role,
      ResolvedCode: account?.Code ?? null,
      ResolvedName: account?.Name ?? null,
    };
  }

  ngOnDestroy(): void {
    // Unsubscribing is what keeps the header's Refresh page-aware: a destroyed page stops counting.
    this.refreshSub?.unsubscribe();
  }
  public Refresh(): void {
    void this.load();
  }

  public get Filtered(): CatalogRow[] {
    const q = this.Search.trim().toLowerCase();
    return this.Rows.filter((r) => {
      if (this.ShowUnmappedOnly && r.ResolvedCode) return false;
      if (!q) return true;
      return r.Name.toLowerCase().includes(q) || (r.SKU ?? '').toLowerCase().includes(q);
    });
  }

  /** The headline: how many products would fail at Confirm today. */
  public get UnmappedCount(): number {
    return this.Rows.filter((r) => !r.ResolvedCode).length;
  }

  public RevRecVariant(row: CatalogRow): MJStatBadgeVariant {
    return row.RevenueRecognitionType === 'Deferred' ? 'info' : 'default';
  }

  /** Plain-language rev-rec help (UPD-2 — Robert's clarity ask). */
  public RevRecHelp(row: CatalogRow): string {
    if (row.RevenueRecognitionType === 'Immediate') {
      return 'Revenue is recognised when the order is booked — one entry, no schedule.';
    }
    return row.DeferredRecognitionShape === 'ServicePeriod'
      ? 'Revenue is deferred and released across the line’s service period.'
      : 'Revenue is deferred and released on a single future date.';
  }

  public OnFilterChanged(): void {
    this.cdr.markForCheck();
  }

  /**
   * Open the resolution chain for a product — WHY it books where it books.
   *
   * Built by walking the same hops the engine walks (product link → category tree → company
   * default) and asking accounting which one won, so the preview shows what was skipped, not just
   * the answer.
   */
  public ShowWhy(row: CatalogRow): void {
    this.SelectedID = row.ID;
    this.Preview = this.buildChain(row);
    this.cdr.markForCheck();
  }

  public CloseWhy(): void {
    this.SelectedID = null;
    this.Preview = null;
    this.cdr.markForCheck();
  }

  private buildChain(row: CatalogRow): GlResolutionResult {
    const engine = OrdersEngineBase.Instance;
    const aeb = AccountingEngineBase.Instance;
    const product = engine.ProductByID(row.ID);
    const asOf = new Date();
    const steps: GlResolutionStep[] = [];
    let won = false;

    const push = (scope: string, glAccountID: string | null): void => {
      const account = glAccountID ? aeb.GLAccountByID(glAccountID) : null;
      const isWin = !!account && !won;
      if (isWin) won = true;
      steps.push({
        Scope: scope,
        AccountCode: account?.Code ?? null,
        AccountName: account?.Name ?? null,
        Won: isWin,
      });
    };

    // Hop 1: a link on the product itself.
    push(`Product: ${row.Name}`, this.linkFor('MJ_BizApps_Orders: Products', row.ID, row.Role, asOf));

    // Hop 2..n: up the category tree.
    let categoryID = product?.ProductCategoryID ?? null;
    const seen = new Set<string>();
    while (categoryID && !seen.has(categoryID.toLowerCase())) {
      seen.add(categoryID.toLowerCase());
      const category = engine.ProductCategoryByID(categoryID);
      push(`Category: ${category?.Name ?? '(unknown)'}`, this.linkFor('MJ_BizApps_Orders: Product Categories', categoryID, row.Role, asOf));
      categoryID = category?.ParentID ?? null;
    }

    // Final hop: the company default.
    if (product?.OwningCompanyID) {
      push('Company default', this.linkFor('MJ: Companies', product.OwningCompanyID, row.Role, asOf));
    }

    return {
      Role: row.Role,
      Steps: steps,
      ResolvedCode: row.ResolvedCode,
      ResolvedName: row.ResolvedName,
    };
  }

  /** One hop of the chain: does a link exist at this scope? */
  private linkFor(entityName: string, recordId: string, role: string, asOf: Date): string | null {
    const entityId = this.entityIdFor(entityName);
    if (!entityId) return null;
    const hit = AccountingEngineBase.Instance.ResolveLinkedAccount(entityId, recordId, role, asOf);
    return hit?.Link.GLAccountID ?? null;
  }

  private entityIdFor(entityName: string): string | null {
    const entity = this.ProviderToUse.Entities.find((e) => e.Name === entityName);
    return entity?.ID ?? null;
  }

  /** Open Accounting's Accounts category to add the missing links (a real tab, not an href). */
  public async FixInAccounting(): Promise<void> {
    this.NavError = (await this.links.Open('Accounting', 'Accounts'))
      ? null
      : 'Could not open Accounting from here — open it from the app launcher and go to Accounts → Account links.';
    this.cdr.markForCheck();
  }

  public IsSelected(row: CatalogRow): boolean {
    return !!this.SelectedID && UUIDsEqual(row.ID, this.SelectedID);
  }
}
