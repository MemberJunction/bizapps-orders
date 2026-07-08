import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { MJFormPresenterService } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, RunView } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';

const CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';

interface CategoryNode {
  ID: string;
  Name: string;
  ParentID: string | null;
  IsActive: boolean;
  ProductCount: number;
  Depth: number;
}

/**
 * Product Categories tree — a hierarchical view of the category taxonomy (the account resolver walks
 * this tree upward from a product to find its GL-account link). Renders the ParentID hierarchy as an
 * indented list with a per-category product count; clicking opens the category record.
 */
@Component({
  standalone: false,
  selector: 'mj-product-category-tree-dashboard',
  templateUrl: './product-category-tree-dashboard.component.html',
  styleUrls: ['./product-category-tree-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'ProductCategoryTreeDashboard')
export class ProductCategoryTreeDashboardComponent extends BaseDashboard {
  private cdr = inject(ChangeDetectorRef);
  private forms = inject(MJFormPresenterService);

  public IsBusy = false;
  public LoadError: string | null = null;
  public Nodes: CategoryNode[] = [];

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Product Categories';
  }

  protected initDashboard(): void {
    // One-time setup; data loads in loadData().
  }

  protected async loadData(): Promise<void> {
    this.IsBusy = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      await this.loadTree();
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsBusy = false;
      this.cdr.markForCheck();
    }
  }

  private async loadTree(): Promise<void> {
    const rv = new RunView();
    const [cats, products] = await rv.RunViews([
      { EntityName: CATEGORY_ENTITY, Fields: ['ID', 'Name', 'ParentID', 'IsActive'], OrderBy: 'Name ASC', ResultType: 'simple' },
      { EntityName: PRODUCT_ENTITY, Fields: ['ProductCategoryID'], ResultType: 'simple' },
    ]);
    const counts = this.countByCategory((products.Results ?? []) as Array<{ ProductCategoryID: string | null }>);
    const rows = (cats.Results ?? []) as Array<{ ID: string; Name: string; ParentID: string | null; IsActive: boolean }>;
    this.Nodes = this.flattenTree(rows, counts);
  }

  private countByCategory(products: Array<{ ProductCategoryID: string | null }>): Map<string, number> {
    const counts = new Map<string, number>();
    for (const p of products) {
      if (!p.ProductCategoryID) continue;
      const key = p.ProductCategoryID.toUpperCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  /** Build a parent→children map, then DFS from the roots to a depth-tagged flat list. */
  private flattenTree(rows: Array<{ ID: string; Name: string; ParentID: string | null; IsActive: boolean }>, counts: Map<string, number>): CategoryNode[] {
    const childMap = new Map<string, typeof rows>();
    const ids = new Set(rows.map(r => r.ID.toUpperCase()));
    for (const r of rows) {
      const parent = r.ParentID && ids.has(r.ParentID.toUpperCase()) ? r.ParentID.toUpperCase() : 'ROOT';
      const list = childMap.get(parent) ?? [];
      list.push(r);
      childMap.set(parent, list);
    }
    const out: CategoryNode[] = [];
    const visit = (parentKey: string, depth: number): void => {
      for (const r of childMap.get(parentKey) ?? []) {
        out.push({ ID: r.ID, Name: r.Name, ParentID: r.ParentID, IsActive: r.IsActive, ProductCount: counts.get(r.ID.toUpperCase()) ?? 0, Depth: depth });
        visit(r.ID.toUpperCase(), depth + 1);
      }
    };
    visit('ROOT', 0);
    return out;
  }

  public get RootCount(): number { return this.Nodes.filter(n => n.Depth === 0).length; }

  public IndentPx(depth: number): string { return `${depth * 22}px`; }

  public OpenCategory(node: CategoryNode): void {
    this.forms.Open({ EntityName: CATEGORY_ENTITY, PrimaryKey: CompositeKey.FromID(node.ID), Presentation: 'dialog', Width: '94vw' });
  }
}
