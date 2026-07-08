import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/** Explorer resource shim for the Product Categories tree — DriverClass "ProductCategoryTreeResource". */
@RegisterClass(BaseResourceComponent, 'ProductCategoryTreeResource')
@Component({
  standalone: false,
  selector: 'mj-product-category-tree-resource',
  template: `<mj-product-category-tree-dashboard></mj-product-category-tree-dashboard>`,
})
export class ProductCategoryTreeResourceComponent extends BaseResourceComponent implements OnInit {
  ngOnInit(): void {
    super.ngOnInit();
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Product Categories';
  }
  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-sitemap';
  }
}

/** Tree-shaking prevention — called from public-api.ts. */
export function LoadProductCategoryTreeResource(): void {
  // No-op. Keeps @RegisterClass(BaseResourceComponent, 'ProductCategoryTreeResource') alive.
}
