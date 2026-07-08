import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Explorer resource shim for Product Catalog — DriverClass "ProductCatalogResource".
 * Thin BaseResourceComponent hosting the dashboard, which owns the page chrome.
 */
@RegisterClass(BaseResourceComponent, 'ProductCatalogResource')
@Component({
  standalone: false,
  selector: 'mj-product-catalog-resource',
  template: `<mj-product-catalog-dashboard></mj-product-catalog-dashboard>`,
})
export class ProductCatalogResourceComponent extends BaseResourceComponent implements OnInit {
  ngOnInit(): void {
    super.ngOnInit();
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Product Catalog';
  }
  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-box';
  }
}

/** Tree-shaking prevention — called from public-api.ts. */
export function LoadProductCatalogResource(): void {
  // No-op. Keeps @RegisterClass(BaseResourceComponent, 'ProductCatalogResource') alive.
}
