import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';
import { OrdersEngineBase } from '@mj-biz-apps/orders-engine-base';
import type { mjBizAppsOrdersProductCategoryEntity } from '@mj-biz-apps/orders-entities';

const CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';

/** A category node, flattened with its depth so the template renders a tree without recursion. */
export interface CategoryNode {
  ID: string;
  Name: string;
  /** The name as stored — `Name` may carry the "(orphaned …)" annotation, this never does. */
  RawName: string;
  Code: string | null;
  Description: string | null;
  ParentID: string | null;
  IsActive: boolean;
  IsOrphan: boolean;
  Depth: number;
  ProductCount: number;
  /** The GL accounts linked AT this category (per role) — what it contributes to resolution. */
  Links: Array<{ Role: string; Code: string; Name: string }>;
}

/** The roles a category link can carry — the ones orders' booking actually walks the tree for. */
const REVENUE_ROLES = ['Sales', 'Deferred Revenue'] as const;

/** Sort keys the user can pick. Applied to SIBLINGS in tree mode (see the sort-vs-tree note below). */
export type CategorySortKey = 'name' | 'code' | 'products';
export type CategoryActiveFilter = 'all' | 'active' | 'inactive';
export type CategoryGLFilter = 'all' | 'linked' | 'unlinked';

/** The editor's working copy — plain strings so `[(ngModel)]` binds without entity churn. */
export interface CategoryDraft {
  /** null = a new category being created. */
  ID: string | null;
  Code: string;
  Name: string;
  /** '' = no parent (a root). */
  ParentID: string;
  Description: string;
  IsActive: boolean;
}

/** One choice in the parent picker — pre-indented so the template does no tree work. */
export interface ParentOption {
  ID: string;
  Label: string;
}

/**
 * Products → Categories (orders UI plan §13.3).
 *
 * The category tree, and — the part that matters — **what each category contributes to GL
 * resolution**. Booking walks a product's category chain upward looking for a link in the revenue
 * role, so a category link is not decoration: it is the fallback that keeps products bookable.
 * Showing the tree without showing its links would hide the mechanism the Catalog's tripwire
 * depends on.
 *
 * Flattened depth-first so the template renders indentation without a recursive component.
 *
 * ## Sort vs. tree, and search/filter vs. tree (the deliberate split)
 * A tree and a sorted/filtered list are different shapes, so this page uses BOTH, chosen per action:
 *  - **Sort keeps the hierarchy** — the sort comparator is applied to SIBLINGS at each level during
 *    the depth-first walk. "Sort by product count" then means "order each parent's children by count",
 *    which is the only reading of a sorted tree that doesn't lie about parentage.
 *  - **Search and filter switch to a FLAT list** — a search result rendered as a tree would hide a
 *    matched child underneath an unmatched parent, which is worse than useless (the user searched for
 *    the child). Same for a filter: hiding an inactive parent would silently take its active children
 *    with it. So any active search/filter flattens; the tree returns when they are cleared.
 */
@Component({
  standalone: false,
  selector: 'mj-categories-page',
  templateUrl: './categories.page.html',
  styleUrls: ['./categories.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesPageComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;

  /** Every category, tree-ordered. The unfiltered basis for every view below. */
  private allNodes: CategoryNode[] = [];
  /** The rows the template renders — tree-ordered, or flat when a search/filter is active. */
  public Nodes: CategoryNode[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;

  // ---- view state -------------------------------------------------------------------------
  /** One input, three targets: Name, Code, and ID (per the searchability rule). */
  public SearchText = '';
  public ActiveFilter: CategoryActiveFilter = 'all';
  public GLFilter: CategoryGLFilter = 'all';
  public SortKey: CategorySortKey = 'name';

  // ---- editor state -----------------------------------------------------------------------
  public EditorOpen = false;
  public EditorSaving = false;
  public EditorError: string | null = null;
  public Draft: CategoryDraft = CategoriesPageComponent.emptyDraft();
  public ParentOptions: ParentOption[] = [];

  async ngOnInit(): Promise<void> {
    this.refreshSub = this.pageRefresh.OnRefresh(() => this.Refresh());
    await this.load(false);
  }

  ngOnDestroy(): void {
    // Unsubscribing is what keeps the header's Refresh page-aware: a destroyed page stops counting.
    this.refreshSub?.unsubscribe();
  }
  public Refresh(): void {
    void this.load(false);
  }

  private async load(forceRefresh: boolean): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const engine = OrdersEngineBase.Instance;
      await engine.Config(forceRefresh, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      this.allNodes = this.flatten(engine);
      this.applyView();
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.allNodes = [];
      this.Nodes = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  // ==========================================================================================
  // Tree construction
  // ==========================================================================================

  /** Depth-first flatten from the roots; cycle-guarded (a bad ParentID must not hang the page). */
  private flatten(engine: OrdersEngineBase): CategoryNode[] {
    const all = engine.ProductCategories;
    const childrenOf = this.groupByParent(all);
    const countOf = this.productCounts(engine);

    const out: CategoryNode[] = [];
    const seen = new Set<string>();
    const walk = (parentKey: string | null, depth: number): void => {
      const kids = [...(childrenOf.get(parentKey) ?? [])].sort((a, b) => this.compareSiblings(a, b, countOf));
      for (const c of kids) {
        const key = NormalizeUUID(c.ID);
        if (seen.has(key)) continue; // cycle guard
        seen.add(key);
        out.push(this.toNode(c, depth, false, countOf));
        walk(key, depth + 1);
      }
    };
    walk(null, 0);

    // An orphan (ParentID pointing nowhere) would otherwise vanish from the tree entirely.
    for (const c of all) {
      if (!seen.has(NormalizeUUID(c.ID))) out.push(this.toNode(c, 0, true, countOf));
    }
    return out;
  }

  /** Children keyed by normalized ParentID; `null` = the roots. */
  private groupByParent(
    all: readonly mjBizAppsOrdersProductCategoryEntity[],
  ): Map<string | null, mjBizAppsOrdersProductCategoryEntity[]> {
    const childrenOf = new Map<string | null, mjBizAppsOrdersProductCategoryEntity[]>();
    for (const c of all) {
      const key = c.ParentID ? NormalizeUUID(c.ParentID) : null;
      const list = childrenOf.get(key) ?? [];
      list.push(c);
      childrenOf.set(key, list);
    }
    return childrenOf;
  }

  /** Product counts per normalized category id — computed once so sorting by count is cheap. */
  private productCounts(engine: OrdersEngineBase): Map<string, number> {
    const counts = new Map<string, number>();
    for (const p of engine.Products) {
      if (!p.ProductCategoryID) continue;
      const key = NormalizeUUID(p.ProductCategoryID);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  private toNode(
    c: mjBizAppsOrdersProductCategoryEntity,
    depth: number,
    isOrphan: boolean,
    countOf: Map<string, number>,
  ): CategoryNode {
    return {
      ID: c.ID,
      Name: isOrphan ? `${c.Name} (orphaned — its parent no longer exists)` : c.Name,
      RawName: c.Name,
      Code: c.Code,
      Description: c.Description,
      ParentID: c.ParentID,
      IsActive: c.IsActive,
      IsOrphan: isOrphan,
      Depth: depth,
      ProductCount: countOf.get(NormalizeUUID(c.ID)) ?? 0,
      Links: this.linksFor(c.ID),
    };
  }

  /** The chosen sort, applied to siblings only — the hierarchy is never re-parented by a sort. */
  private compareSiblings(
    a: mjBizAppsOrdersProductCategoryEntity,
    b: mjBizAppsOrdersProductCategoryEntity,
    countOf: Map<string, number>,
  ): number {
    switch (this.SortKey) {
      case 'code':
        return (a.Code ?? '').localeCompare(b.Code ?? '') || a.Name.localeCompare(b.Name);
      case 'products': {
        const ca = countOf.get(NormalizeUUID(a.ID)) ?? 0;
        const cb = countOf.get(NormalizeUUID(b.ID)) ?? 0;
        return cb - ca || a.Name.localeCompare(b.Name); // most products first
      }
      default:
        return a.Name.localeCompare(b.Name);
    }
  }

  /** The GL links attached to this category, per revenue role. */
  private linksFor(categoryId: string): Array<{ Role: string; Code: string; Name: string }> {
    const entityId = this.ProviderToUse.Entities.find((e) => e.Name === CATEGORY_ENTITY)?.ID;
    if (!entityId) return [];
    const aeb = AccountingEngineBase.Instance;
    const out: Array<{ Role: string; Code: string; Name: string }> = [];
    for (const role of REVENUE_ROLES) {
      const hit = aeb.ResolveLinkedAccount(entityId, categoryId, role, new Date());
      const account = hit ? aeb.GLAccountByID(hit.Link.GLAccountID) : null;
      if (account) out.push({ Role: role, Code: account.Code, Name: account.Name });
    }
    return out;
  }

  // ==========================================================================================
  // Search / filter / sort
  // ==========================================================================================

  /** True when the tree has been flattened because a search or filter is narrowing the set. */
  public get IsFlatMode(): boolean {
    return this.SearchText.trim().length > 0 || this.ActiveFilter !== 'all' || this.GLFilter !== 'all';
  }

  public get HasViewNarrowing(): boolean {
    return this.IsFlatMode;
  }

  public OnSearchChanged(): void {
    this.applyView();
    this.cdr.markForCheck();
  }

  public OnFilterChanged(): void {
    this.applyView();
    this.cdr.markForCheck();
  }

  /** A sort re-walks the tree, because sorting happens BETWEEN SIBLINGS during the walk. */
  public OnSortChanged(): void {
    const engine = OrdersEngineBase.Instance;
    this.allNodes = this.flatten(engine);
    this.applyView();
    this.cdr.markForCheck();
  }

  public ClearView(): void {
    this.SearchText = '';
    this.ActiveFilter = 'all';
    this.GLFilter = 'all';
    this.applyView();
    this.cdr.markForCheck();
  }

  private applyView(): void {
    const matched = this.allNodes.filter((n) => this.matchesSearch(n) && this.matchesFilters(n));
    // Flat mode: a matched child must never hide under an unmatched parent, so drop the indentation
    // AND re-sort globally (siblings-only ordering is meaningless once the hierarchy is gone).
    this.Nodes = this.IsFlatMode ? this.sortFlat(matched).map((n) => ({ ...n, Depth: 0 })) : matched;
  }

  /** Name, Code, or ID — his rule: humans search by name; the ID is there because it's searchable too. */
  private matchesSearch(n: CategoryNode): boolean {
    const q = this.SearchText.trim().toLowerCase();
    if (!q) return true;
    return (
      n.RawName.toLowerCase().includes(q) ||
      (n.Code ?? '').toLowerCase().includes(q) ||
      NormalizeUUID(n.ID).includes(q)
    );
  }

  private matchesFilters(n: CategoryNode): boolean {
    if (this.ActiveFilter === 'active' && !n.IsActive) return false;
    if (this.ActiveFilter === 'inactive' && n.IsActive) return false;
    if (this.GLFilter === 'linked' && n.Links.length === 0) return false;
    if (this.GLFilter === 'unlinked' && n.Links.length > 0) return false;
    return true;
  }

  private sortFlat(nodes: CategoryNode[]): CategoryNode[] {
    const sorted = [...nodes];
    switch (this.SortKey) {
      case 'code':
        sorted.sort((a, b) => (a.Code ?? '').localeCompare(b.Code ?? '') || a.RawName.localeCompare(b.RawName));
        break;
      case 'products':
        sorted.sort((a, b) => b.ProductCount - a.ProductCount || a.RawName.localeCompare(b.RawName));
        break;
      default:
        sorted.sort((a, b) => a.RawName.localeCompare(b.RawName));
    }
    return sorted;
  }

  // ==========================================================================================
  // Editor
  // ==========================================================================================

  private static emptyDraft(): CategoryDraft {
    return { ID: null, Code: '', Name: '', ParentID: '', Description: '', IsActive: true };
  }

  public NewCategory(): void {
    this.Draft = CategoriesPageComponent.emptyDraft();
    this.ParentOptions = this.buildParentOptions(null);
    this.EditorError = null;
    this.EditorOpen = true;
    this.cdr.markForCheck();
  }

  public EditCategory(node: CategoryNode): void {
    this.Draft = {
      ID: node.ID,
      Code: node.Code ?? '',
      Name: node.RawName,
      ParentID: node.ParentID ?? '',
      Description: node.Description ?? '',
      IsActive: node.IsActive,
    };
    this.ParentOptions = this.buildParentOptions(node.ID);
    this.EditorError = null;
    this.EditorOpen = true;
    this.cdr.markForCheck();
  }

  public CancelEditor(): void {
    this.EditorOpen = false;
    this.EditorError = null;
    this.cdr.markForCheck();
  }

  public get EditorTitle(): string {
    return this.Draft.ID ? 'Edit category' : 'New category';
  }

  public get SaveBlockedReason(): string | null {
    if (!this.Draft.Name.trim()) return 'A category needs a name — that is what a human searches for.';
    return null;
  }

  public get CanSave(): boolean {
    return !this.EditorSaving && this.SaveBlockedReason === null;
  }

  /**
   * The parent picker offers every category EXCEPT the one being edited and its own descendants —
   * the READ path is cycle-guarded, but the guard exists to survive bad data, not to license
   * creating it. A cycle is refused here, at the only place it can be introduced.
   */
  private buildParentOptions(excludeId: string | null): ParentOption[] {
    const banned = excludeId ? this.descendantsOf(excludeId) : new Set<string>();
    // Tree order (allNodes) makes the indented labels read as the hierarchy the user sees.
    return this.allNodes
      .filter((n) => !banned.has(NormalizeUUID(n.ID)))
      .map((n) => ({
        ID: n.ID,
        Label: `${'  '.repeat(n.Depth)}${n.RawName}${n.Code ? ` (${n.Code})` : ''}`,
      }));
  }

  /** The category itself plus everything beneath it — the set that must not become its parent. */
  private descendantsOf(id: string): Set<string> {
    const childKeys = new Map<string, string[]>();
    for (const n of this.allNodes) {
      if (!n.ParentID) continue;
      const pk = NormalizeUUID(n.ParentID);
      const list = childKeys.get(pk) ?? [];
      list.push(NormalizeUUID(n.ID));
      childKeys.set(pk, list);
    }
    const banned = new Set<string>([NormalizeUUID(id)]);
    const queue: string[] = [NormalizeUUID(id)];
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const kid of childKeys.get(cur) ?? []) {
        if (banned.has(kid)) continue; // also guards a pre-existing cycle in the data
        banned.add(kid);
        queue.push(kid);
      }
    }
    return banned;
  }

  public async Save(): Promise<void> {
    if (!this.CanSave) return;
    this.EditorSaving = true;
    this.EditorError = null;
    this.cdr.markForCheck();
    try {
      const cat = await this.ProviderToUse.GetEntityObject<mjBizAppsOrdersProductCategoryEntity>(
        CATEGORY_ENTITY,
        this.ProviderToUse.CurrentUser,
      );
      if (this.Draft.ID) {
        const loaded = await cat.Load(this.Draft.ID);
        if (!loaded) {
          this.EditorError = 'That category could not be loaded — it may have been deleted. Refresh and try again.';
          return;
        }
      } else {
        cat.NewRecord();
      }
      this.applyDraft(cat);

      // Save() returns false on a logical failure — it does not throw. Ignoring it is a silent bug.
      const ok = await cat.Save();
      if (!ok) {
        this.EditorError = cat.LatestResult?.CompleteMessage ?? 'The category could not be saved.';
        return;
      }
      this.EditorOpen = false;
      // Force-refresh the engine cache so the tree reflects the save (the page reads only the cache).
      await this.load(true);
    } catch (e) {
      this.EditorError = e instanceof Error ? e.message : String(e);
    } finally {
      this.EditorSaving = false;
      this.cdr.markForCheck();
    }
  }

  /** Draft → typed entity properties. Empty strings become NULL (a blank code is "no code", not ''). */
  private applyDraft(cat: mjBizAppsOrdersProductCategoryEntity): void {
    cat.Name = this.Draft.Name.trim();
    cat.Code = this.Draft.Code.trim() ? this.Draft.Code.trim() : null;
    cat.Description = this.Draft.Description.trim() ? this.Draft.Description.trim() : null;
    cat.ParentID = this.Draft.ParentID ? this.Draft.ParentID : null;
    cat.IsActive = this.Draft.IsActive;
  }

  // ==========================================================================================
  // Template helpers
  // ==========================================================================================

  public Indent(node: CategoryNode): string {
    return `${node.Depth * 18}px`;
  }

  public IsEditing(node: CategoryNode): boolean {
    return this.Draft.ID !== null && UUIDsEqual(this.Draft.ID, node.ID);
  }

  public get ResultSummary(): string {
    if (!this.HasViewNarrowing) return `${this.allNodes.length} categories`;
    return `${this.Nodes.length} of ${this.allNodes.length} categories`;
  }
}
