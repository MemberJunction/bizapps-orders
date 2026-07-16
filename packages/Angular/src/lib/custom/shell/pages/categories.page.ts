import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';
import { OrdersEngineBase } from '@mj-biz-apps/orders-engine-base';

/** A category node, flattened with its depth so the template renders a tree without recursion. */
export interface CategoryNode {
  ID: string;
  Name: string;
  Code: string | null;
  IsActive: boolean;
  Depth: number;
  ProductCount: number;
  /** The GL accounts linked AT this category (per role) — what it contributes to resolution. */
  Links: Array<{ Role: string; Code: string; Name: string }>;
}

/** The roles a category link can carry — the ones orders' booking actually walks the tree for. */
const REVENUE_ROLES = ['Sales', 'Deferred Revenue'] as const;

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
 */
@Component({
  standalone: false,
  selector: 'mj-categories-page',
  templateUrl: './categories.page.html',
  styleUrls: ['./categories.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesPageComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  public Nodes: CategoryNode[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;

  async ngOnInit(): Promise<void> {
    await this.load();
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
      this.Nodes = this.flatten(engine);
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Nodes = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** Depth-first flatten from the roots; cycle-guarded (a bad ParentID must not hang the page). */
  private flatten(engine: OrdersEngineBase): CategoryNode[] {
    const all = engine.ProductCategories;
    const childrenOf = new Map<string | null, typeof all>();
    for (const c of all) {
      const key = c.ParentID?.toLowerCase() ?? null;
      const list = childrenOf.get(key) ?? [];
      list.push(c);
      childrenOf.set(key, list);
    }

    const out: CategoryNode[] = [];
    const seen = new Set<string>();
    const walk = (parentKey: string | null, depth: number): void => {
      const kids = (childrenOf.get(parentKey) ?? []).sort((a, b) => a.Name.localeCompare(b.Name));
      for (const c of kids) {
        const key = c.ID.toLowerCase();
        if (seen.has(key)) continue; // cycle guard
        seen.add(key);
        out.push({
          ID: c.ID,
          Name: c.Name,
          Code: c.Code,
          IsActive: c.IsActive,
          Depth: depth,
          ProductCount: engine.Products.filter((p) => p.ProductCategoryID?.toLowerCase() === key).length,
          Links: this.linksFor(c.ID),
        });
        walk(key, depth + 1);
      }
    };
    walk(null, 0);

    // An orphan (ParentID pointing nowhere) would otherwise vanish from the tree entirely.
    for (const c of all) {
      if (!seen.has(c.ID.toLowerCase())) {
        out.push({
          ID: c.ID,
          Name: `${c.Name} (orphaned — its parent no longer exists)`,
          Code: c.Code,
          IsActive: c.IsActive,
          Depth: 0,
          ProductCount: engine.Products.filter((p) => p.ProductCategoryID?.toLowerCase() === c.ID.toLowerCase()).length,
          Links: this.linksFor(c.ID),
        });
      }
    }
    return out;
  }

  /** The GL links attached to this category, per revenue role. */
  private linksFor(categoryId: string): Array<{ Role: string; Code: string; Name: string }> {
    const entityId = this.ProviderToUse.Entities.find((e) => e.Name === 'MJ_BizApps_Orders: Product Categories')?.ID;
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

  public Indent(node: CategoryNode): string {
    return `${node.Depth * 18}px`;
  }
}
