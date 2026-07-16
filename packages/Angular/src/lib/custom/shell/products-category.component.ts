import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { MJLeftNavSection } from '@memberjunction/ng-ui-components';
import { CategoryShellBase } from '@mj-biz-apps/accounting-ng';

/** Page ids for this category's rail. Local to the shell — not routes. */
export type ProductsPageId = 'catalog' | 'categories' | 'pricing' | 'gl-mapping';

/**
 * Products category shell (orders UI plan §13.0 / §13.3).
 *
 * Rail: Catalog · Categories · Pricing · GL mapping (single group — no second group per the
 * approved rail config).
 *
 * Products ARE company-scopeable via `Product.OwningCompanyID` — though it is NULLABLE, so a scoped
 * list must decide what a company-less (shared) product means. That is the pages' call, not the
 * shell's.
 */
@Component({
  standalone: false,
  selector: 'mj-products-category',
  templateUrl: './products-category.component.html',
  styleUrls: ['./category-shell.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'ProductsCategoryDashboard')
export class ProductsCategoryComponent extends CategoryShellBase {
  public CategoryTitle = 'Products';
  protected get DefaultPageId(): string {
    return 'catalog';
  }

  public get RailSections(): MJLeftNavSection[] {
    return [
      {
        // The mockup's Products rail has ONE unlabelled group — MJLeftNavSection.label is optional
        // (omit it; `null` is a type error).
        items: [
          { id: 'catalog', label: 'Catalog', icon: 'fa-solid fa-box' },
          { id: 'categories', label: 'Categories', icon: 'fa-solid fa-sitemap' },
          { id: 'pricing', label: 'Pricing', icon: 'fa-solid fa-tags' },
          { id: 'gl-mapping', label: 'GL mapping', icon: 'fa-solid fa-link' },
        ],
      },
    ];
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Products';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-box';
  }
}

/** Tree-shaking prevention — called from public-api.ts. */
export function LoadProductsCategory(): void {
  // No-op.
}
