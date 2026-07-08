import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import {
  MJButtonDirective,
  MJPageLayoutComponent,
  MJPageHeaderComponent,
  MJPageBodyComponent,
  MJStatBadgeComponent,
  MJRefreshButtonComponent,
  MJEmptyStateComponent,
} from '@memberjunction/ng-ui-components';

import { ProductCatalogDashboardComponent } from './product-catalog-dashboard.component';
import { ProductCatalogResourceComponent } from './product-catalog-resource.component';

/** Feature module for the Product Catalog dashboard + its Explorer resource shim. */
@NgModule({
  declarations: [ProductCatalogDashboardComponent, ProductCatalogResourceComponent],
  imports: [
    CommonModule,
    FormsModule,
    SharedGenericModule,
    MJButtonDirective,
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent,
    MJStatBadgeComponent,
    MJRefreshButtonComponent,
    MJEmptyStateComponent,
  ],
  exports: [ProductCatalogDashboardComponent, ProductCatalogResourceComponent],
})
export class ProductCatalogModule {}
